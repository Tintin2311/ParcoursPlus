import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  FlatList,
  ImageBackground,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { BarCodeScanner } from "expo-barcode-scanner";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { supabase } from "./supabaseClient";
import {
  AttemptDetail,
  GainBreakdown,
  ParcoursBaremeTentativeRow,
  ParcoursPointsConfig,
  TentativeRow,
  computeCurrentDisplayedScore,
  computeTentativeGainBreakdown,
  formatPoints,
  getDefaultPointsConfig,
  loadAttemptsHistory,
  loadParcoursTentativeBaremeRows,
  loadResolvedTentativeConfig,
  parseNumeric,
  recomputeAndSyncStats,
  sanitize,
  saveTentativeWithStats,
} from "./CalculPointTentatives";
import { fetchBaliseFormatsByBaliseIdsCompat } from "./baliseFormatsCompat";

const READABLE_CODE_FONT = Platform.select({
  web: '"Menlo", "Consolas", "Courier New", monospace',
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});
const TABLE_USER_PREFS_KEY = "tableau_generation_preferences";

type SetPageFn = (page: any) => void;

type EleveConnecte = {
  id?: string;
  uuid?: string;
  code?: string;
  teacher_id?: string | null;
  group_id?: string | null;
  display_name?: string | null;
  name?: string | null;
  nom?: string | null;
  isGroupSession?: boolean | null;
  groupSessionId?: string | null;
  groupSessionCode?: string | null;
  groupSessionName?: string | null;
  groupStudents?: EleveConnecte[] | null;
  targetStudentIds?: string[] | null;
  groupIds?: string[] | null;
};

type RpcStudentRow = {
  id?: string;
  name?: string | null;
  group_id?: string | null;
};

type ParcoursFormatType = "code" | "poincon" | "qrcode" | "tableau";

type ParcoursActif = {
  id?: string;
  nom?: string | null;
  name?: string | null;
  balises_ordre?: any;
  balises_formats_ordre?: any;
  format_type?: ParcoursFormatType | null;
  user_id?: string | null;
  professeur_id?: string | null;
  mode_evaluation?: boolean | null;
  bareme_evaluation_id?: string | null;
  [key: string]: any;
};

type BaliseRow = {
  id: string;
  code?: string | null;
  points?: number | null;
  frozen?: boolean | null;
  numero_balise?: number | null;
  nom?: string | null;
  name?: string | null;
  user_id?: string | null;
  [key: string]: any;
};

type PoinconCell = boolean[][];

type PoinconFormat = {
  rows: number;
  cols: number;
  cells: PoinconCell;
};

type TableauFormat = {
  rows: number;
  cols: number;
  cells: Record<string, string>;
};

type QrCodeFormat = {
  value: string;
};

type BaliseFormatRow = {
  id?: string;
  balise_id: string;
  format_type: ParcoursFormatType;
  payload?: any;
};

type PoinconDebugRow = {
  id?: string;
  balise_id?: string;
  user_id?: string | null;
  format_type?: string;
  payload?: any;
};

type ChronometreState = {
  ms: number;
  startedAt: string | null;
  running: boolean;
  finished: boolean;
};

type BaliseAffichee = BaliseRow & {
  ordre: number;
  instanceKey: string;
  originalBaliseId: string;
  tokenSource: string;
  selectedFormatType?: ParcoursFormatType | null;
  poinconFormat?: PoinconFormat | null;
  poinconFormatMissing?: boolean;
  tableauFormat?: TableauFormat | null;
  tableauAssignedCellKey?: string | null;
  tableauExpectedCode?: string | null;
  tableauFormatMissing?: boolean;
  qrcodeFormat?: QrCodeFormat | null;
  qrcodeFormatMissing?: boolean;
};

type Props = {
  setPage: SetPageFn;
  eleveConnecte?: EleveConnecte | null;
  parcoursActif?: ParcoursActif | null;
  handleDeconnexion?: () => Promise<void> | void;
  pagePrecedente?: any;
};

const BG_GAME =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/AccueilElevePaysage.png";

const C_TEXT = "#12304A";
const C_MUTED = "#5D7288";
const C_BORDER = "rgba(31,91,134,0.14)";
const C_BLUE_DARK = "#1F5B86";
const C_GOLD = "#F59E0B";
const C_GREEN = "#16A34A";
const C_ORANGE = "#F97316";
const C_RED = "#DC2626";
const C_RED_FLASH = "#FF1F1F";
const CHRONO_ERROR_REVIEW_MS = 30_000;

const normalizeQrValue = (value: any) =>
  String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();

const normalizeQrPayload = (payload: any): QrCodeFormat | null => {
  const source = payload && typeof payload === "object" ? payload : {};
  const value = normalizeQrValue(source.value ?? source.url ?? source.text ?? source.code);
  return value ? { value } : null;
};

const getQrBarCodeTypes = () => [BarCodeScanner.Constants.BarCodeType.qr];

const getChronoPauseStorageKey = (studentId: string, parcoursId: string) =>
  `chronoResultPauseUntil:${studentId}:${parcoursId}`;

const webScrollStyle =
  Platform.OS === "web"
    ? ({
        overflowY: "auto",
        overflowX: "hidden",
        touchAction: "pan-y",
        WebkitOverflowScrolling: "touch",
        overscrollBehaviorY: "contain",
        height: "100%",
      } as any)
    : null;

const webPanYStyle =
  Platform.OS === "web"
    ? ({
        touchAction: "pan-y",
      } as any)
    : null;

const webPanXStyle =
  Platform.OS === "web"
    ? ({
        touchAction: "pan-x",
      } as any)
    : null;

const formatPointUnit = (value: number | string | null | undefined) => {
  const n = Number(value ?? 0);
  return Math.abs(n) <= 1 ? "pt" : "pts";
};

const formatPointsLabel = (value: number | string | null | undefined) => {
  return `${formatPoints(value as any)} ${formatPointUnit(value)}`;
};

const getDisplayName = (row: any) => String(row?.nom ?? row?.name ?? "Parcours");

const parseChronometreMs = (value: any) => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n / 1000) * 1000 : 0;
};

const formatChronometre = (ms: number) => {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

function getStudentId(eleve?: EleveConnecte | null) {
  return eleve?.id ?? eleve?.uuid ?? null;
}

function getTargetStudentIds(eleve?: EleveConnecte | null) {
  if (!eleve) return [];

  if (eleve.isGroupSession && Array.isArray(eleve.targetStudentIds)) {
    return Array.from(new Set(eleve.targetStudentIds.map(String).filter(Boolean)));
  }

  if (eleve.isGroupSession && Array.isArray(eleve.groupStudents)) {
    return Array.from(
      new Set(
        eleve.groupStudents
          .map((student) => getStudentId(student))
          .filter(Boolean)
          .map(String)
      )
    );
  }

  const singleId = getStudentId(eleve);
  return singleId ? [String(singleId)] : [];
}

function getTargetGroupIds(eleve?: EleveConnecte | null) {
  if (!eleve) return [];

  const ids: string[] = [];

  if (eleve.isGroupSession && Array.isArray(eleve.groupIds)) {
    ids.push(...eleve.groupIds.map(String).filter(Boolean));
  }

  if (eleve.isGroupSession && Array.isArray(eleve.groupStudents)) {
    ids.push(...eleve.groupStudents.map((student) => student.group_id).filter(Boolean).map(String));
  }

  if (eleve.group_id) ids.push(String(eleve.group_id));

  return Array.from(new Set(ids));
}

const isUuidLike = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );

const isIntegerLike = (value: string) => /^\d+$/.test(value.trim());

const safeParseObject = (value: any): any => {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const toBool = (value: any, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  if (typeof value === "number") return value !== 0;

  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "oui", "on"].includes(s)) return true;
  if (["false", "0", "no", "non", "off"].includes(s)) return false;
  return fallback;
};

const parseJsonObject = (value: any): any => {
  const parsed = safeParseObject(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
};

const parseAttemptDetails = (value: any): AttemptDetail[] => {
  if (Array.isArray(value)) return value as AttemptDetail[];
  const parsed = safeParseObject(value);
  return Array.isArray(parsed) ? (parsed as AttemptDetail[]) : [];
};

const resultsFromAttemptDetails = (attempt: TentativeRow | null | undefined) => {
  const out: Record<string, boolean | null> = {};
  parseAttemptDetails(attempt?.details).forEach((detail) => {
    const key = String(detail?.balise_id ?? "").trim();
    if (!key) return;
    out[key] = detail?.correct === true;
  });
  return out;
};

const emptyPoincon = (rows: number, cols: number): PoinconCell =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));

const DEFAULT_POINCON_FORMAT: PoinconFormat = {
  rows: 4,
  cols: 4,
  cells: emptyPoincon(4, 4),
};

const toColumnLabel = (index: number) => {
  let n = Math.max(0, Math.floor(index));
  let out = "";

  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);

  return out;
};

const makeTableauCellKey = (row: number, col: number) => `${toColumnLabel(col)}${row + 1}`;

const buildTableauCellKeys = (rows: number, cols: number) =>
  Array.from({ length: rows * cols }, (_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    return makeTableauCellKey(row, col);
  });

const getAssignedTableauCellKey = (assignedIndex: number, rows: number, cols: number) => {
  const keys = buildTableauCellKeys(rows, cols);
  if (!keys.length) return "A1";
  const safeIndex = Math.max(0, Math.floor(Number(assignedIndex) || 0));
  return keys[safeIndex % keys.length];
};

const normalizeTableauPayload = (payload: any): TableauFormat | null => {
  const p = parseJsonObject(payload);
  const rowsRaw = Number(p.rows ?? p.lignes ?? p.height ?? p.size ?? 4);
  const colsRaw = Number(p.cols ?? p.columns ?? p.colonnes ?? p.width ?? p.size ?? 4);

  if (!Number.isFinite(rowsRaw) || !Number.isFinite(colsRaw)) return null;

  const rows = Math.max(1, Math.min(9, Math.floor(rowsRaw || 4)));
  const cols = Math.max(1, Math.min(9, Math.floor(colsRaw || 4)));
  const rawCells = p.cells && typeof p.cells === "object" && !Array.isArray(p.cells) ? p.cells : {};
  const cells: Record<string, string> = {};

  Object.entries(rawCells).forEach(([key, value]) => {
    if (key === "__settings") return;
    const rawKey = String(key).trim().toUpperCase();
    const numericMatch = rawKey.match(/^(\d+)-(\d+)$/);
    const displayKey = numericMatch
      ? makeTableauCellKey(Number(numericMatch[1]), Number(numericMatch[2]))
      : rawKey;
    cells[displayKey] = String(value ?? "");
  });

  return { rows, cols, cells };
};

const isActiveCellValue = (value: any) =>
  value === true || value === "true" || value === 1 || value === "1";

const normalizePoinconPayload = (payload: any): PoinconFormat | null => {
  const p = parseJsonObject(payload);

  const rowsRaw = Number(p.rows ?? p.lignes ?? p.height ?? p.size ?? 4);
  const colsRaw = Number(p.cols ?? p.columns ?? p.colonnes ?? p.width ?? p.size ?? 4);

  if (!Number.isFinite(rowsRaw) || !Number.isFinite(colsRaw)) return null;

  const rows = Math.max(2, Math.min(8, Math.floor(rowsRaw || 4)));
  const cols = Math.max(2, Math.min(8, Math.floor(colsRaw || 4)));
  const cells = emptyPoincon(rows, cols);

  const mark = (r: number, c: number) => {
    if (
      Number.isInteger(r) &&
      Number.isInteger(c) &&
      r >= 0 &&
      r < rows &&
      c >= 0 &&
      c < cols
    ) {
      cells[r][c] = true;
      return true;
    }
    return false;
  };

  let hasAnyTrue = false;

  const dots =
    p.dots && typeof p.dots === "object" && !Array.isArray(p.dots)
      ? p.dots
      : null;

  if (dots) {
    Object.entries(dots).forEach(([key, value]) => {
      if (!isActiveCellValue(value)) return;

      const [rRaw, cRaw] = String(key).split("-");
      const r = Number(rRaw);
      const c = Number(cRaw);

      if (mark(r, c)) hasAnyTrue = true;
    });
  }

  const rawCells = p.cells ?? p.grille ?? p.grid ?? p.matrix;

  if (Array.isArray(rawCells)) {
    rawCells.forEach((row: any, r: number) => {
      if (!Array.isArray(row)) return;

      row.forEach((value: any, c: number) => {
        if (isActiveCellValue(value)) {
          if (mark(r, c)) hasAnyTrue = true;
        }
      });
    });
  }

  const positions = p.positions ?? p.points ?? p.activeCells;

  if (Array.isArray(positions)) {
    positions.forEach((pos: any) => {
      const r = Number(pos?.row ?? pos?.r ?? pos?.ligne);
      const c = Number(pos?.col ?? pos?.c ?? pos?.colonne);
      if (mark(r, c)) hasAnyTrue = true;
    });
  }

  if (!hasAnyTrue) {
    console.warn("⚠️ Poinçon Supabase lu mais aucune case noire trouvée :", p);
  }

  return { rows, cols, cells };
};

const matrixSignature = (matrix: PoinconCell): string => {
  return matrix.map((row) => row.map((cell) => (cell ? "1" : "0")).join("")).join("/");
};

const rotatePoincon90 = (matrix: PoinconCell): PoinconCell => {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;

  return Array.from({ length: cols }, (_, r) =>
    Array.from({ length: rows }, (_, c) => !!matrix[rows - 1 - c]?.[r])
  );
};

const transposePoincon = (matrix: PoinconCell): PoinconCell => {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;

  return Array.from({ length: cols }, (_, r) =>
    Array.from({ length: rows }, (_, c) => !!matrix[c]?.[r])
  );
};

const flipPoinconHorizontal = (matrix: PoinconCell): PoinconCell => {
  return matrix.map((row) => [...row].reverse());
};

const flipPoinconVertical = (matrix: PoinconCell): PoinconCell => {
  return [...matrix].reverse().map((row) => [...row]);
};

const samePoincon = (a: PoinconCell, b: PoinconCell): boolean => {
  if (a.length !== b.length) return false;
  if ((a[0]?.length ?? 0) !== (b[0]?.length ?? 0)) return false;

  return a.every((row, r) => row.every((cell, c) => !!cell === !!b[r]?.[c]));
};

const uniqueMatrices = (items: PoinconCell[]) => {
  const seen = new Set<string>();
  const out: PoinconCell[] = [];

  items.forEach((matrix) => {
    const signature = matrixSignature(matrix);
    if (seen.has(signature)) return;
    seen.add(signature);
    out.push(matrix);
  });

  return out;
};

const buildPoinconVariants = (expected: PoinconCell): PoinconCell[] => {
  const bases: PoinconCell[] = [];

  let current = expected;
  for (let i = 0; i < 4; i += 1) {
    bases.push(current);
    current = rotatePoincon90(current);
  }

  const transposed = transposePoincon(expected);
  current = transposed;
  for (let i = 0; i < 4; i += 1) {
    bases.push(current);
    current = rotatePoincon90(current);
  }

  const withMirrors = bases.flatMap((matrix) => [
    matrix,
    flipPoinconHorizontal(matrix),
    flipPoinconVertical(matrix),
  ]);

  return uniqueMatrices(withMirrors);
};

const parseAssignments = (value: any): Record<string, number> => {
  const obj = parseJsonObject(value);
  const out: Record<string, number> = {};

  Object.entries(obj).forEach(([key, raw]) => {
    const n = Number(raw);
    if (key && Number.isFinite(n) && n >= 1) out[key] = n;
  });

  return out;
};

const sanitizeBalisePointOverrides = (value: any): Record<string, Record<string, number>> => {
  const parsed = parseJsonObject(value);
  const source =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed.balise_point_overrides ?? parsed.balisePointOverrides ?? parsed
      : null;

  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const out: Record<string, Record<string, number>> = {};
  Object.entries(source).forEach(([parcoursId, rawBalises]) => {
    const balises = parseJsonObject(rawBalises);
    if (!balises || typeof balises !== "object" || Array.isArray(balises)) return;

    const values: Record<string, number> = {};
    Object.entries(balises).forEach(([baliseId, points]) => {
      const n = Number(points);
      if (baliseId && Number.isFinite(n) && n >= 0) values[baliseId] = n;
    });

    if (Object.keys(values).length > 0) out[parcoursId] = values;
  });

  return out;
};

const getBalisePointOverridesFromRow = (row: any): Record<string, Record<string, number>> => {
  const config = parseJsonObject(row?.config);
  const settings = parseJsonObject(row?.settings_json);
  const sourceAssignments = parseJsonObject(
    row?.tentative_source_assignments ?? row?.tentativeSourceAssignments
  );

  return {
    ...sanitizeBalisePointOverrides(settings?.balise_point_overrides ?? settings?.balisePointOverrides),
    ...sanitizeBalisePointOverrides(config?.balise_point_overrides ?? config?.balisePointOverrides),
    ...sanitizeBalisePointOverrides(row?.balise_point_overrides ?? row?.balisePointOverrides),
    ...sanitizeBalisePointOverrides(sourceAssignments?.balise_point_overrides ?? sourceAssignments?.balisePointOverrides),
  };
};

const extractTokens = (value: any): string[] => {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => extractTokens(item))
      .map((v) => String(v).trim())
      .filter(Boolean);
  }

  if (typeof value === "number") return [String(value)];

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];

    if (raw.startsWith("{") && raw.endsWith("}")) {
      return raw
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim().replace(/^"(.*)"$/, "$1"))
        .filter(Boolean);
    }

    if ((raw.startsWith("[") && raw.endsWith("]")) || (raw.startsWith("{") && raw.endsWith("}"))) {
      try {
        const parsed = JSON.parse(raw);
        return extractTokens(parsed);
      } catch {
        // noop
      }
    }

    if (raw.includes(",")) {
      return raw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    }

    return [raw];
  }

  if (typeof value === "object") {
    const candidate = value.balise_id ?? value.id ?? value.value ?? value.numero_balise ?? value.code;

    if (candidate != null) return [String(candidate).trim()].filter(Boolean);
    if (Array.isArray(value.items)) return extractTokens(value.items);
    if (Array.isArray(value.balises)) return extractTokens(value.balises);
    if (Array.isArray(value.data)) return extractTokens(value.data);
  }

  return [];
};

const parseBaliseOrderToken = (
  token: string,
  fallbackFormatType: ParcoursFormatType | null = null
): { lookupToken: string; selectedFormatType: ParcoursFormatType | null } => {
  const raw = String(token ?? "").trim();
  const match = raw.match(/^(.*)::format::(code|tableau|poincon|qrcode)$/);
  if (match) {
    return {
      lookupToken: match[1],
      selectedFormatType: match[2] as ParcoursFormatType,
    };
  }

  return { lookupToken: raw, selectedFormatType: fallbackFormatType };
};

const normalizeBaliseFormatOrder = (value: any): { lookupToken: string; selectedFormatType: ParcoursFormatType }[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const lookupToken = String(item?.balise_id ?? item?.id ?? "").trim();
      const selectedFormatType = String(item?.format_type ?? "").trim() as ParcoursFormatType;
      if (!lookupToken || !["code", "poincon", "qrcode", "tableau"].includes(selectedFormatType)) return null;
      return { lookupToken, selectedFormatType };
    })
    .filter(Boolean) as { lookupToken: string; selectedFormatType: ParcoursFormatType }[];
};

const orderBalisesFromTokens = (tokens: string[], balises: BaliseRow[]): BaliseAffichee[] => {
  const byId = new Map<string, BaliseRow>();
  const byNumero = new Map<string, BaliseRow>();
  const byCode = new Map<string, BaliseRow>();

  balises.forEach((b) => {
    byId.set(String(b.id), b);
    if (b.numero_balise != null) byNumero.set(String(b.numero_balise), b);
    if (b.code) byCode.set(sanitize(b.code), b);
  });

  const results: BaliseAffichee[] = [];
  const occurrenceCounter = new Map<string, number>();

  tokens.forEach((token, index) => {
    const t = String(token).trim();
    const parsed = parseBaliseOrderToken(t);
    const lookupToken = parsed.lookupToken;
    if (!lookupToken) return;

    let balise: BaliseRow | undefined;

    if (isUuidLike(lookupToken)) balise = byId.get(lookupToken);
    if (!balise && isIntegerLike(lookupToken)) balise = byNumero.get(String(Number(lookupToken)));
    if (!balise) balise = byCode.get(sanitize(lookupToken));

    if (!balise) return;
    if (balise.frozen === true) return;

    const originalBaliseId = String(balise.id);
    const occurrenceNumber = (occurrenceCounter.get(originalBaliseId) ?? 0) + 1;
    occurrenceCounter.set(originalBaliseId, occurrenceNumber);

    const instanceKey = `${originalBaliseId}__occ_${occurrenceNumber}__pos_${index}`;

    results.push({
      ...balise,
      id: instanceKey,
      originalBaliseId,
      instanceKey,
      tokenSource: t,
      selectedFormatType: parsed.selectedFormatType,
      ordre: results.length + 1,
      poinconFormat: null,
      poinconFormatMissing: false,
      tableauFormat: null,
      tableauAssignedCellKey: null,
      tableauExpectedCode: null,
      tableauFormatMissing: false,
      qrcodeFormat: null,
      qrcodeFormatMissing: false,
    });
  });

  return results;
};

const normalizeValidatedIdsForOccurrences = (
  rawValidatedIds: string[],
  orderedBalises: BaliseAffichee[]
): string[] => {
  if (!rawValidatedIds.length || !orderedBalises.length) return rawValidatedIds;

  const orderedKeys = new Set(orderedBalises.map((b) => b.instanceKey));
  const hasModernKeys = rawValidatedIds.some((id) => orderedKeys.has(id));

  if (hasModernKeys) {
    return rawValidatedIds.filter((id) => orderedKeys.has(id));
  }

  const usedKeys = new Set<string>();
  const normalized: string[] = [];

  rawValidatedIds.forEach((oldId) => {
    const match = orderedBalises.find(
      (b) => b.originalBaliseId === oldId && !usedKeys.has(b.instanceKey)
    );

    if (match) {
      usedKeys.add(match.instanceKey);
      normalized.push(match.instanceKey);
    }
  });

  return normalized;
};

const getModesFromRow = (row: any) => {
  const modes = parseJsonObject(row?.modes);
  const config = parseJsonObject(row?.config);
  const settings = parseJsonObject(row?.settings_json);

  return {
    balises: toBool(
      modes?.balises ??
        config?.modes?.balises ??
        config?.balises ??
        settings?.modes?.balises ??
        settings?.balises,
      false
    ),
    parcours: toBool(
      modes?.parcours ??
        config?.modes?.parcours ??
        config?.parcours ??
        settings?.modes?.parcours ??
        settings?.parcours,
      false
    ),
    tentatives: toBool(
      modes?.tentatives ??
        config?.modes?.tentatives ??
        config?.tentatives ??
        settings?.modes?.tentatives ??
        settings?.tentatives,
      false
    ),
  };
};

const getNumberFromRow = (row: any, keys: string[], fallback = 0) => {
  const config = parseJsonObject(row?.config);
  const settings = parseJsonObject(row?.settings_json);

  for (const key of keys) {
    const value = row?.[key] ?? config?.[key] ?? settings?.[key];
    if (value != null) return parseNumeric(value, fallback);
  }

  return fallback;
};

const sanitizePointOverrides = (value: any): Record<string, number> => {
  const parsed = parseJsonObject(value);
  const source =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed.parcours_bonus_overrides ?? parsed.parcoursBonusOverrides ?? parsed
      : null;

  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const out: Record<string, number> = {};
  Object.entries(source).forEach(([k, v]) => {
    const n = Number(v);
    if (k && Number.isFinite(n) && n >= 0) out[k] = n;
  });

  return out;
};

const getParcoursBonusOverridesFromRow = (row: any): Record<string, number> => {
  const config = parseJsonObject(row?.config);
  const settings = parseJsonObject(row?.settings_json);
  const sourceAssignments = parseJsonObject(
    row?.tentative_source_assignments ?? row?.tentativeSourceAssignments
  );

  return {
    ...sanitizePointOverrides(settings?.parcours_bonus_overrides ?? settings?.parcoursBonusOverrides),
    ...sanitizePointOverrides(config?.parcours_bonus_overrides ?? config?.parcoursBonusOverrides),
    ...sanitizePointOverrides(row?.parcours_bonus_overrides ?? row?.parcoursBonusOverrides),
    ...sanitizePointOverrides(sourceAssignments?.parcours_bonus_overrides ?? sourceAssignments?.parcoursBonusOverrides),
  };
};

const scoreConfigRow = (row: any) => {
  const modes = getModesFromRow(row);
  const pointsParParcours = getNumberFromRow(row, ["points_par_parcours", "pointsParParcours"], 0);
  const updated = row?.updated_at ? new Date(row.updated_at).getTime() : 0;

  return (
    (pointsParParcours > 0 ? 1_000_000 : 0) +
    (modes.parcours ? 500_000 : 0) +
    (modes.balises ? 50_000 : 0) +
    (modes.tentatives ? 50_000 : 0) +
    pointsParParcours +
    (Number.isFinite(updated) ? updated / 1_000_000_000_000 : 0)
  );
};

const loadParcoursTermineBonus = async (
  groupId: string | null,
  parcoursId: string | undefined,
  professeurId?: string | null
) => {
  if (!groupId || !parcoursId) return null;

  const buildQuery = (withTeacher: boolean) => {
    let query = supabase
      .from("personnaliser_parcours_termines")
      .select("points_personnalises")
      .eq("group_id", groupId)
      .eq("parcours_id", parcoursId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (withTeacher && professeurId) query = query.eq("professeur_id", professeurId);
    return query;
  };

  let { data, error } = await buildQuery(true);

  if (!error && (!data || (data as any[]).length === 0) && professeurId) {
    const fallback = await buildQuery(false);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.warn("Lecture bonus parcours terminé personnalisés impossible :", error);
    return null;
  }

  const n = Number((data as any[])?.[0]?.points_personnalises);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const mergeConfigWithBestSupabaseRow = async (
  groupId: string | null,
  parcoursId: string | undefined,
  baseConfig: ParcoursPointsConfig
): Promise<ParcoursPointsConfig> => {
  if (!groupId) return baseConfig;

  const { data, error } = await supabase
    .from("group_points_configs")
    .select("*")
    .eq("group_id", groupId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(20);

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    return baseConfig;
  }

  const bestRow = [...data].sort((a, b) => scoreConfigRow(b) - scoreConfigRow(a))[0];
  const rowModes = getModesFromRow(bestRow);

  const basePointsParParcours = getNumberFromRow(
    bestRow,
    ["points_par_parcours", "pointsParParcours"],
    baseConfig.pointsParParcours
  );
  const config = parseJsonObject(bestRow?.config);
  const settings = parseJsonObject(bestRow?.settings_json);
  const bonusMode =
    bestRow?.parcours_bonus_mode ??
    bestRow?.parcoursBonusMode ??
    config?.parcours_bonus_mode ??
    config?.parcoursBonusMode ??
    settings?.parcours_bonus_mode ??
    settings?.parcoursBonusMode;
  const bonusOverrides = getParcoursBonusOverridesFromRow(bestRow);
  const pointsParParcours =
    bonusMode === "personnalise" && parcoursId && bonusOverrides[parcoursId] != null
      ? bonusOverrides[parcoursId]
      : basePointsParParcours;

  const pointsParBalise = getNumberFromRow(
    bestRow,
    ["points_par_balise", "pointsParBalise"],
    baseConfig.pointsParBalise
  );

  const pointsPerCorrect = getNumberFromRow(
    bestRow,
    ["points_per_correct", "pointsPerCorrect"],
    baseConfig.pointsPerCorrect
  );

  const tentativePageMode =
    bestRow?.tentative_page_mode === "personnalise" || bestRow?.tentativePageMode === "personnalise"
      ? "personnalise"
      : "general";

  const tentativePageDefault =
    bestRow?.tentative_page_default == null && bestRow?.tentativePageDefault == null
      ? baseConfig.tentativePageDefault
      : Number(bestRow?.tentative_page_default ?? bestRow?.tentativePageDefault) || null;

  const assignments = parseAssignments(
    bestRow?.tentative_page_assignments ?? bestRow?.tentativePageAssignments
  );
  const allBalisePointOverrides = getBalisePointOverridesFromRow(bestRow);
  const tableBonus =
    bonusMode === "personnalise"
      ? await loadParcoursTermineBonus(
          groupId,
          parcoursId,
          bestRow?.professeur_id ?? bestRow?.teacher_id ?? bestRow?.user_id ?? null
        )
      : null;
  const resolvedPointsParParcours = tableBonus ?? pointsParParcours;

  const modes = {
    balises: rowModes.balises || baseConfig.modes.balises,
    parcours: rowModes.parcours || baseConfig.modes.parcours || resolvedPointsParParcours > 0,
    tentatives: rowModes.tentatives || baseConfig.modes.tentatives,
  };

  if (!modes.balises && !modes.parcours && !modes.tentatives) {
    modes.balises = true;
  }

  return {
    ...baseConfig,
    modes,
    pointsParParcours: resolvedPointsParParcours,
    pointsParBalise,
    balisePointOverrides: parcoursId ? allBalisePointOverrides[parcoursId] ?? {} : {},
    pointsPerCorrect,
    tentativePageMode,
    tentativePageDefault,
    tentativePageAssignments: Object.keys(assignments).length
      ? assignments
      : baseConfig.tentativePageAssignments,
  };
};

const loadStatParcoursTermine = async (
  studentId: string | null,
  parcoursId: string | undefined
): Promise<boolean> => {
  if (!studentId || !parcoursId) return false;

  const { data, error } = await supabase
    .from("eleve_parcours_stats")
    .select("parcours_termine")
    .eq("student_id", studentId)
    .eq("parcours_id", parcoursId)
    .maybeSingle();

  if (error) return false;
  return data?.parcours_termine === true;
};

const loadChronometreMs = async (
  studentId: string | null,
  parcoursId: string | undefined
): Promise<ChronometreState> => {
  if (!studentId || !parcoursId) return { ms: 0, startedAt: null, running: false, finished: false };

  const { data, error } = await supabase
    .from("eleve_parcours_stats")
    .select("chronometre_ms,chronometre_started_at,chronometre_running,chronometre_finished")
    .eq("student_id", studentId)
    .eq("parcours_id", parcoursId)
    .maybeSingle();

  if (error) {
    console.warn("Lecture chronomètre impossible :", error);
    return { ms: 0, startedAt: null, running: false, finished: false };
  }

  const baseMs = parseChronometreMs(data?.chronometre_ms);
  const startedAt = data?.chronometre_started_at ? String(data.chronometre_started_at) : null;
  const running = data?.chronometre_running === true && !!startedAt;
  const startedMs = startedAt ? new Date(startedAt).getTime() : 0;
  const elapsedSinceStart = running && Number.isFinite(startedMs) ? Date.now() - startedMs : 0;

  return {
    ms: baseMs + Math.max(0, elapsedSinceStart),
    startedAt,
    running,
    finished: data?.chronometre_finished === true,
  };
};

const normalizeRpcPoinconRows = (data: any): BaliseFormatRow[] => {
  const rows = Array.isArray(data) ? data : [];

  return rows
    .map((row: PoinconDebugRow) => ({
      id: row?.id ? String(row.id) : undefined,
      balise_id: String(row?.balise_id ?? "").trim(),
      format_type: String(row?.format_type ?? "poincon").trim().toLowerCase() as ParcoursFormatType,
      payload: row?.payload && typeof row.payload === "object" ? row.payload : {},
    }))
    .filter((row) => !!row.balise_id && row.format_type === "poincon");
};

const normalizeCompatPoinconRows = (data: any): BaliseFormatRow[] => {
  const rows = Array.isArray(data) ? data : [];

  return rows
    .map((row: any) => ({
      id: row?.id ? String(row.id) : undefined,
      balise_id: String(row?.balise_id ?? "").trim(),
      format_type: String(row?.format_type ?? "poincon").trim().toLowerCase() as ParcoursFormatType,
      payload: row?.payload && typeof row.payload === "object" ? row.payload : {},
    }))
    .filter((row) => !!row.balise_id && row.format_type === "poincon");
};

const normalizeCompatFormatRows = (data: any): BaliseFormatRow[] => {
  const rows = Array.isArray(data) ? data : [];

  return rows
    .map((row: any) => {
      const formatType = String(row?.format_type ?? "").trim().toLowerCase() as ParcoursFormatType;
      if (!["code", "poincon", "qrcode", "tableau"].includes(formatType)) return null;

      return {
        id: row?.id ? String(row.id) : undefined,
        balise_id: String(row?.balise_id ?? "").trim(),
        format_type: formatType,
        payload: row?.payload && typeof row.payload === "object" ? row.payload : {},
      };
    })
    .filter((row) => !!row?.balise_id) as BaliseFormatRow[];
};

const loadPoinconFormatsForBalises = async (ids: string[]): Promise<BaliseFormatRow[]> => {
  if (!ids.length) return [];

  const cleanIds = Array.from(
    new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean))
  );

  const rowsByBaliseId = new Map<string, BaliseFormatRow>();

  const rpcNames = [
    "get_poincon_formats_by_balise_ids",
    "debug_get_poincon_formats_by_balise_ids",
  ];

  for (const rpcName of rpcNames) {
    try {
      const { data, error } = await supabase.rpc(rpcName, {
        p_balise_ids: cleanIds,
      });

      if (error) {
        console.warn(`❌ RPC ${rpcName} impossible:`, error);
        continue;
      }

      const normalized = normalizeRpcPoinconRows(data);

      normalized.forEach((row) => rowsByBaliseId.set(row.balise_id, row));

      console.log(`🧩 RPC ${rpcName} résultat`, {
        idsDemandes: cleanIds,
        lignesBrutes: data,
        lignesNormalisees: normalized,
      });

      if (rowsByBaliseId.size >= cleanIds.length) return Array.from(rowsByBaliseId.values());
    } catch (e) {
      console.warn(`❌ RPC ${rpcName} exception:`, e);
    }
  }

  const missingIds = cleanIds.filter((id) => !rowsByBaliseId.has(id));

  if (missingIds.length) {
    try {
      const compatRows = normalizeCompatPoinconRows(
        await fetchBaliseFormatsByBaliseIdsCompat(supabase, missingIds)
      );

      compatRows.forEach((row) => rowsByBaliseId.set(row.balise_id, row));

      console.log("🧩 FORMATS POINÇON CHARGÉS PAR COLONNES COMPACTES", {
        idsDemandes: missingIds,
        lignesNormalisees: compatRows,
      });
    } catch (e) {
      console.warn("❌ Lecture compacte des poinçons impossible:", e);
    }
  }

  return Array.from(rowsByBaliseId.values());
};

const loadFormatsForBalises = async (ids: string[]): Promise<BaliseFormatRow[]> => {
  const cleanIds = Array.from(
    new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean))
  );

  if (!cleanIds.length) return [];

  try {
    return normalizeCompatFormatRows(await fetchBaliseFormatsByBaliseIdsCompat(supabase, cleanIds));
  } catch (e) {
    console.warn("Lecture des formats de balises impossible:", e);
    return [];
  }
};

const loadOrCreateTableauAssignment = async ({
  professeurId,
  groupId,
  studentId,
}: {
  professeurId: string | null;
  groupId: string | null;
  studentId: string | null;
}): Promise<number | null> => {
  if (!professeurId || !groupId || !studentId) return null;

  try {
    const existing = await supabase
      .from("tableau_student_assignments")
      .select("assigned_index")
      .eq("professeur_id", professeurId)
      .eq("group_id", groupId)
      .eq("student_id", studentId)
      .maybeSingle();

    if (!existing.error && existing.data?.assigned_index != null) {
      const n = Number(existing.data.assigned_index);
      return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    }

    const { data: studentsData, error: studentsError } = await supabase
      .from("students")
      .select("id, name, order_index")
      .eq("group_id", groupId)
      .order("order_index", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

    if (studentsError) throw studentsError;

    const students = ((studentsData as any[]) || [])
      .filter((student) => student?.id)
      .map((student) => String(student.id));

    let preferredRows = 4;
    let preferredCols = 4;

    try {
      const { data: prefData, error: prefError } = await supabase
        .from("user_preferences")
        .select("value")
        .eq("user_id", professeurId)
        .eq("key", TABLE_USER_PREFS_KEY)
        .maybeSingle();

      const value = (prefData as any)?.value;
      if (!prefError && value) {
        preferredRows = Math.max(1, Math.min(9, Number(value.rows) || 4));
        preferredCols = Math.max(1, Math.min(9, Number(value.cols) || 4));
      }
    } catch (prefError) {
      console.warn("Préférences tableau indisponibles:", prefError);
    }

    const assignedIndex = Math.max(0, students.indexOf(String(studentId)));
    const assignedCellKey = getAssignedTableauCellKey(assignedIndex, preferredRows, preferredCols);

    const saved = await supabase
      .from("tableau_student_assignments")
      .upsert(
        {
          professeur_id: professeurId,
          group_id: groupId,
          student_id: studentId,
          assigned_index: assignedIndex,
          assigned_cell_key: assignedCellKey,
        },
        { onConflict: "professeur_id,group_id,student_id" }
      )
      .select("assigned_index")
      .maybeSingle();

    if (!saved.error && saved.data?.assigned_index != null) {
      const n = Number(saved.data.assigned_index);
      return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : assignedIndex;
    }

    return assignedIndex;
  } catch (e) {
    console.warn("Attribution tableau Supabase indisponible:", e);
    return null;
  }
};

const EcrireCodeBaliseEleve: React.FC<Props> = ({
  setPage,
  eleveConnecte,
  parcoursActif,
  handleDeconnexion,
  pagePrecedente = "EcrireResultat",
}) => {
  const { width, height } = useWindowDimensions();

  const scrollRef = useRef<ScrollView | null>(null);
  const poinconListRef = useRef<FlatList<BaliseAffichee> | null>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const rowYRefs = useRef<Record<string, number>>({});
  const rowHeightRefs = useRef<Record<string, number>>({});
  const scrollYRef = useRef(0);
  const scrollViewHeightRef = useRef(0);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTimerRefs = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const autoFocusLockRef = useRef<string | null>(null);
  const qrWebVideoRef = useRef<any>(null);
  const qrWebStreamRef = useRef<any>(null);
  const qrWebScanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chronometreStartedAtRef = useRef<number | null>(null);
  const chronometreBaseMsRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  const [confirmLogoutVisible, setConfirmLogoutVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [confirmChronometreVisible, setConfirmChronometreVisible] = useState(false);
  const [confirmVerifyVisible, setConfirmVerifyVisible] = useState(false);
  const [qrScannerVisible, setQrScannerVisible] = useState(false);
  const [qrScannerBaliseKey, setQrScannerBaliseKey] = useState<string | null>(null);
  const [qrScanLocked, setQrScanLocked] = useState(false);
  const [qrWebScannerActive, setQrWebScannerActive] = useState(false);
  const [qrScannerMessage, setQrScannerMessage] = useState("");
  const [appMessage, setAppMessage] = useState<{
    title: string;
    message: string;
    tone?: "info" | "success" | "warning" | "error";
  } | null>(null);
  const [chronometreCountdown, setChronometreCountdown] = useState<string | null>(null);

  const [studentId, setStudentId] = useState<string | null>(getTargetStudentIds(eleveConnecte)[0] ?? getStudentId(eleveConnecte));
  const [studentGroupId, setStudentGroupId] = useState<string | null>(getTargetGroupIds(eleveConnecte)[0] ?? eleveConnecte?.group_id ?? null);

  const [balises, setBalises] = useState<BaliseAffichee[]>([]);
  const [activeBaliseKey, setActiveBaliseKey] = useState<string | null>(null);
  const [attemptsHistory, setAttemptsHistory] = useState<TentativeRow[]>([]);
  const [validatedBaliseIds, setValidatedBaliseIds] = useState<string[]>([]);
  const [completionAttemptNumber, setCompletionAttemptNumber] = useState<number | null>(null);

  const [codesSaisis, setCodesSaisis] = useState<Record<string, string>>({});
  const [poinconsSaisis, setPoinconsSaisis] = useState<Record<string, PoinconCell>>({});
  const [resultats, setResultats] = useState<Record<string, boolean | null>>({});
  const [inputSelections, setInputSelections] = useState<Record<string, { start: number; end: number }>>({});

  const stopWebQrScanner = useCallback(() => {
    if (qrWebScanTimerRef.current) {
      clearInterval(qrWebScanTimerRef.current);
      qrWebScanTimerRef.current = null;
    }
    qrWebStreamRef.current?.getTracks?.().forEach((track: any) => track.stop?.());
    qrWebStreamRef.current = null;
    setQrWebScannerActive(false);
  }, []);

  const closeQrScanner = useCallback(() => {
    stopWebQrScanner();
    setQrScannerVisible(false);
    setQrScannerBaliseKey(null);
    setQrScanLocked(false);
    setQrScannerMessage("");
  }, [stopWebQrScanner]);

  useEffect(() => {
    return () => {
      stopWebQrScanner();
    };
  }, [stopWebQrScanner]);

  const [savedScore, setSavedScore] = useState(0);
  const [tentativesCount, setTentativesCount] = useState(0);
  const [savedPointsTotal, setSavedPointsTotal] = useState(0);
  const [lastPointsGain, setLastPointsGain] = useState(0);
  const [parcoursTermineDb, setParcoursTermineDb] = useState(false);
  const [chronometreMs, setChronometreMs] = useState(0);
  const [chronometreRunning, setChronometreRunning] = useState(false);
  const [chronometreSaving, setChronometreSaving] = useState(false);
  const [chronometreFinished, setChronometreFinished] = useState(false);
  const [resultPauseUntilMs, setResultPauseUntilMs] = useState<number | null>(null);
  const [resultPauseRemainingMs, setResultPauseRemainingMs] = useState(0);
  const [errorReviewUntilMs, setErrorReviewUntilMs] = useState<number | null>(null);
  const [errorReviewRemainingMs, setErrorReviewRemainingMs] = useState(0);
  const [attemptsExhaustedFinal, setAttemptsExhaustedFinal] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<{
    note: number | null;
    max: number | null;
    reason?: string | null;
  } | null>(null);
  const [evaluationRequiresTime, setEvaluationRequiresTime] = useState(false);

  const [pointsConfig, setPointsConfig] = useState<ParcoursPointsConfig>(getDefaultPointsConfig());
  const [tentativeBaremeRows, setTentativeBaremeRows] = useState<ParcoursBaremeTentativeRow[]>([]);
  const [resolvedTentativePage, setResolvedTentativePage] = useState<number | null>(null);
  const [resolvedMaxAttempts, setResolvedMaxAttempts] = useState<number | null>(null);
  const [resolvedTentativeGroupId, setResolvedTentativeGroupId] = useState<string | null>(null);
  const [resolvedProfesseurId, setResolvedProfesseurId] = useState<string | null>(null);
  const [supportParcoursId, setSupportParcoursId] = useState<string | null>(null);

  const [scoreModalVisible, setScoreModalVisible] = useState(false);
  const [activePoinconIndex, setActivePoinconIndex] = useState(0);

  const parcoursNom = useMemo(() => getDisplayName(parcoursActif), [parcoursActif]);
  const validatedSet = useMemo(() => new Set(validatedBaliseIds), [validatedBaliseIds]);

  const isCompleted = balises.length > 0 && validatedBaliseIds.length >= balises.length;
  const isCompletedEffective = isCompleted || parcoursTermineDb;
  const maxAttemptsReached =
    attemptsExhaustedFinal ||
    (resolvedMaxAttempts != null && tentativesCount >= resolvedMaxAttempts && !isCompleted);

  useEffect(() => {
    setActivePoinconIndex((prev) => {
      if (!balises.length) return 0;
      return Math.min(prev, balises.length - 1);
    });
  }, [balises.length]);

  const isCompact = width < 430;
  const boxSize = isCompact ? 36 : 42;
  const boxGap = isCompact ? 5 : 7;

  const isPoinconParcours = useMemo(
    () => balises.length > 0 && balises.some((b) => !!b.poinconFormat),
    [balises]
  );

  const bottomScrollSpace = isPoinconParcours ? 24 : Math.max(360, Math.floor(height * 0.42));

  const statCardWidth = useMemo(() => {
    const gap = isPoinconParcours ? 5 : 8;
    const scoreWidth = isPoinconParcours ? 68 : width < 430 ? 86 : 96;
    const horizontalPadding = isPoinconParcours ? 18 : 24;
    const total = width - horizontalPadding - scoreWidth - gap * 2;
    return Math.max(isPoinconParcours ? 76 : 92, Math.floor(total / 2));
  }, [isPoinconParcours, width]);

  const chronometreLabel = useMemo(() => formatChronometre(chronometreMs), [chronometreMs]);
  const chronometrePaused = chronometreMs > 0 && !chronometreRunning;
  const errorReviewLabel = useMemo(() => String(Math.ceil(Math.max(0, errorReviewRemainingMs) / 1000)), [errorReviewRemainingMs]);
  const exhaustedFinalTimeLabel = useMemo(() => formatChronometre(chronometreMs), [chronometreMs]);
  const evaluationNoteLabel = useMemo(() => {
    if (!evaluationResult || evaluationResult.note == null) return "";
    const note = Number(evaluationResult.note);
    const max = evaluationResult.max == null ? null : Number(evaluationResult.max);
    const fmt = (value: number) =>
      Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100).replace(".", ",");
    return max != null && Number.isFinite(max)
      ? `${fmt(note)} / ${fmt(max)}`
      : fmt(note);
  }, [evaluationResult]);
  const evaluationUnavailableLabel = useMemo(() => {
    if (!evaluationResult || evaluationResult.note != null) return "";
    const reason = String(evaluationResult.reason ?? "");
    if (reason === "not_finished") return "Note en attente";
    if (reason === "no_matching_row") return "Aucune ligne du barème ne correspond";
    if (reason === "no_matching_column") return "Aucune colonne du barème ne correspond";
    if (reason === "no_matching_cell") return "Aucune case du barème ne correspond";
    if (reason === "no_stats") return "Statistiques introuvables";
    return "Note indisponible";
  }, [evaluationResult]);
  const showEvaluationChronoGate =
    evaluationRequiresTime &&
    !loading &&
    !!parcoursActif?.id &&
    chronometreMs <= 0 &&
    !chronometreRunning &&
    !chronometreFinished &&
    !chronometreCountdown &&
    !attemptsExhaustedFinal;

  const getCurrentChronometreMs = useCallback(() => {
    if (!chronometreRunning || chronometreStartedAtRef.current == null) {
      return chronometreBaseMsRef.current;
    }

    return chronometreBaseMsRef.current + Date.now() - chronometreStartedAtRef.current;
  }, [chronometreRunning]);

  const getChronometreStudentIds = useCallback(() => {
    return Array.from(
      new Set(
        [
          ...(eleveConnecte?.isGroupSession ? getTargetStudentIds(eleveConnecte) : []),
          studentId,
        ]
          .filter(Boolean)
          .map(String)
      )
    );
  }, [eleveConnecte, studentId]);

  const refreshEvaluationResult = useCallback(
    async (targetStudentId?: string | null, targetParcoursId?: string | null) => {
      const sid = targetStudentId || studentId;
      const pid = targetParcoursId || parcoursActif?.id;
      if (!sid || !pid) {
        setEvaluationResult(null);
        return null;
      }

      try {
        const direct = await supabase.rpc("get_evaluation_note", {
          p_student_id: sid,
          p_parcours_id: pid,
        });

        if (!direct.error) {
          const row = Array.isArray(direct.data) ? direct.data[0] : direct.data;
          if (row?.bareme_id) {
            const note = row?.note == null ? null : Number(row.note);
            const max = row?.max_points == null ? null : Number(row.max_points);
            const next = { note, max, reason: row?.reason ? String(row.reason) : null };
            setEvaluationResult(next);
            return next;
          }
        } else {
          console.warn("Lecture directe note évaluation impossible :", direct.error);
        }

        await supabase.rpc("recalculer_evaluation_note", {
          p_student_id: sid,
          p_parcours_id: pid,
        });

        const { data, error } = await supabase
          .from("eleve_parcours_stats")
          .select("evaluation_note,evaluation_max_points,evaluation_bareme_id")
          .eq("student_id", sid)
          .eq("parcours_id", pid)
          .maybeSingle();

        if (error) {
          console.warn("Lecture note évaluation impossible :", error);
          return null;
        }

        const note = data?.evaluation_note == null ? null : Number(data.evaluation_note);
        const max = data?.evaluation_max_points == null ? null : Number(data.evaluation_max_points);
        const next = data?.evaluation_bareme_id ? { note, max, reason: null } : null;
        setEvaluationResult(next);
        return next;
      } catch (error) {
        console.warn("Recalcul note évaluation impossible :", error);
        return null;
      }
    },
    [parcoursActif?.id, studentId]
  );

  const loadEvaluationRequiresTime = useCallback(async (baremeId?: string | null) => {
    const cleanBaremeId = String(baremeId ?? "").trim();
    if (!cleanBaremeId) return false;

    try {
      const rpc = await supabase.rpc("evaluation_bareme_requires_time", {
        p_bareme_id: cleanBaremeId,
      });

      if (!rpc.error && typeof rpc.data === "boolean") {
        return rpc.data;
      }

      if (rpc.error) {
        console.warn("RPC barème évaluation temps indisponible :", rpc.error);
      }

      const { data, error } = await supabase
        .from("group_evaluation_bareme_axes")
        .select("id")
        .eq("bareme_page_id", cleanBaremeId)
        .eq("metric", "time")
        .limit(1);

      if (error) {
        console.warn("Lecture barème évaluation temps impossible :", error);
        return false;
      }

      return ((data as Array<{ id?: string }> | null) ?? []).length > 0;
    } catch (error) {
      console.warn("Vérification barème évaluation temps impossible :", error);
      return false;
    }
  }, []);

  const saveChronometre = useCallback(
    async (nextMs: number, running = false, startedAt: string | null = null, finished = false) => {
      if (!parcoursActif?.id) return;

      const targetStudentIds = getChronometreStudentIds();
      if (targetStudentIds.length === 0) return;

      const cleanMs = parseChronometreMs(nextMs);
      const now = new Date().toISOString();
      const chronoPayload = {
        chronometre_ms: cleanMs,
        chronometre_started_at: startedAt,
        chronometre_running: running,
        chronometre_finished: finished,
        updated_at: now,
      };
      setChronometreSaving(true);

      try {
        await Promise.all(
          targetStudentIds.map(async (targetStudentId) => {
            const { data, error } = await supabase
              .from("eleve_parcours_stats")
              .update(chronoPayload)
              .eq("student_id", targetStudentId)
              .eq("parcours_id", parcoursActif.id)
              .select("student_id")
              .maybeSingle();

            if (error) {
              console.warn("Sauvegarde chronomètre impossible :", error);
              return;
            }

            if (data) return;

            const { error: insertError } = await supabase.from("eleve_parcours_stats").upsert(
              {
                student_id: targetStudentId,
                parcours_id: parcoursActif.id,
                best_score: targetStudentId === String(studentId) ? savedScore : 0,
                last_score: targetStudentId === String(studentId) ? savedScore : 0,
                total_balises: balises.length,
                tentatives_count: targetStudentId === String(studentId) ? tentativesCount : 0,
                last_tentative_at: null,
                best_points: targetStudentId === String(studentId) ? savedPointsTotal : 0,
                last_points: targetStudentId === String(studentId) ? savedPointsTotal : 0,
                parcours_termine: targetStudentId === String(studentId) ? isCompletedEffective : false,
                ...chronoPayload,
              },
              { onConflict: "student_id,parcours_id" }
            );

            if (insertError) {
              console.warn("Création stats chronomètre impossible :", insertError);
            }
          })
        );
      } finally {
        setChronometreSaving(false);
      }
    },
    [
      balises.length,
      getChronometreStudentIds,
      isCompletedEffective,
      parcoursActif?.id,
      savedPointsTotal,
      savedScore,
      studentId,
      tentativesCount,
    ]
  );

  const finishParcoursByAttemptsExhausted = useCallback(
    async (finalResults: Record<string, boolean | null>, finalMsOverride?: number) => {
      if (!parcoursActif?.id) return;

      const finalMs = parseChronometreMs(finalMsOverride ?? getCurrentChronometreMs());
      const now = new Date().toISOString();

      chronometreStartedAtRef.current = null;
      chronometreBaseMsRef.current = finalMs;
      setChronometreMs(finalMs);
      setChronometreRunning(false);
      setChronometreFinished(true);
      setAttemptsExhaustedFinal(true);
      setResultats(finalResults);
      setResultPauseUntilMs(null);
      setResultPauseRemainingMs(0);
      setErrorReviewUntilMs(null);
      setErrorReviewRemainingMs(0);

      if (studentId) {
        await AsyncStorage.removeItem(getChronoPauseStorageKey(studentId, parcoursActif.id)).catch(() => null);
      }

      await saveChronometre(finalMs, false, null, true);

      const targetStudentIds = getChronometreStudentIds();
      await Promise.all(
        targetStudentIds.map(async (targetStudentId) => {
          const { error } = await supabase
            .from("eleve_parcours_stats")
            .update({
              parcours_termine: true,
              chronometre_ms: finalMs,
              chronometre_started_at: null,
              chronometre_running: false,
              chronometre_finished: true,
              updated_at: now,
            })
            .eq("student_id", targetStudentId)
            .eq("parcours_id", parcoursActif.id);

          if (error) {
            console.warn("Clôture par tentatives épuisées impossible :", error);
          }
        })
      );

      await refreshEvaluationResult(studentId, parcoursActif.id);
    },
    [
      getChronometreStudentIds,
      getCurrentChronometreMs,
      parcoursActif?.id,
      saveChronometre,
      studentId,
      refreshEvaluationResult,
    ]
  );

  const toggleChronometre = useCallback(() => {
    if (!parcoursActif?.id || loading || chronometreSaving || chronometreCountdown) return;
    if (chronometreMs > 0 || chronometreRunning || chronometreFinished) return;

    setConfirmChronometreVisible(true);
  }, [
    chronometreCountdown,
    chronometreFinished,
    chronometreMs,
    chronometreRunning,
    chronometreSaving,
    loading,
    parcoursActif?.id,
  ]);

  useEffect(() => {
    if (!chronometreRunning) return;

    const timer = setInterval(() => {
      setChronometreMs(getCurrentChronometreMs());
    }, 500);

    return () => clearInterval(timer);
  }, [chronometreRunning, getCurrentChronometreMs]);

  useEffect(() => {
    return () => {
      if (!chronometreRunning) return;
      saveChronometre(getCurrentChronometreMs(), true, chronometreStartedAtRef.current ? new Date(chronometreStartedAtRef.current).toISOString() : null);
    };
  }, [chronometreRunning, getCurrentChronometreMs, saveChronometre]);

  useEffect(() => {
    if (!isPoinconParcours) return;
    const nextBalise = balises[activePoinconIndex];
    if (nextBalise?.instanceKey) {
      setActiveBaliseKey(nextBalise.instanceKey);
    }
  }, [activePoinconIndex, balises, isPoinconParcours]);

  const poinconCardWidth = useMemo(() => {
    const horizontalPadding = isCompact ? 18 : 28;
    return Math.max(280, width - horizontalPadding);
  }, [isCompact, width]);

  const activePoinconBalise = isPoinconParcours ? balises[activePoinconIndex] : null;
  const canGoPrevPoincon = activePoinconIndex > 0;
  const canGoNextPoincon = activePoinconIndex < balises.length - 1;

  const goToPoinconIndex = useCallback(
    (index: number, animated = true) => {
      if (!balises.length) return;

      const next = Math.max(0, Math.min(balises.length - 1, index));
      const nextBalise = balises[next];

      setActivePoinconIndex(next);
      if (nextBalise?.instanceKey) setActiveBaliseKey(nextBalise.instanceKey);

      requestAnimationFrame(() => {
        poinconListRef.current?.scrollToIndex?.({ index: next, animated });
      });
    },
    [balises]
  );

  const handlePoinconMomentumEnd = useCallback(
    (event: any) => {
      const x = event?.nativeEvent?.contentOffset?.x ?? 0;
      const next = Math.max(0, Math.min(balises.length - 1, Math.round(x / Math.max(1, poinconCardWidth))));
      const nextBalise = balises[next];

      setActivePoinconIndex(next);
      if (nextBalise?.instanceKey) setActiveBaliseKey(nextBalise.instanceKey);
    },
    [balises, poinconCardWidth]
  );

  const poinconCardMinHeight = useMemo(() => {
    const compactHeader = isPoinconParcours ? (isCompact ? 102 : 112) : 176;
    const verifyButtonSpace = isPoinconParcours ? 66 : 118;
    const browserSafetySpace = Platform.OS === "web" ? 78 : 28;
    const available = height - compactHeader - verifyButtonSpace - browserSafetySpace;

    return Math.max(isCompact ? 270 : 320, available);
  }, [height, isCompact, isPoinconParcours]);

  const getPoinconBigCellSize = useCallback(
    (format: PoinconFormat) => {
      const rows = Math.max(2, format.rows || 4);
      const cols = Math.max(2, format.cols || 4);
      const gridGap = width < 430 ? 6 : 9;
      const cardRatio = width < 430 ? 0.98 : 0.72;
      const maxGridWidth = Math.max(190, poinconCardWidth * cardRatio - 30);
      const maxGridHeight = Math.max(170, poinconCardMinHeight - (width < 430 ? 68 : 88));
      const byWidth = Math.floor((maxGridWidth - gridGap * (cols - 1)) / cols);
      const byHeight = Math.floor((maxGridHeight - gridGap * (rows - 1)) / rows);
      return Math.max(30, Math.min(width < 430 ? 72 : 88, byWidth, byHeight));
    },
    [poinconCardMinHeight, poinconCardWidth, width]
  );

  const setInputRef = useCallback((baliseKey: string, ref: TextInput | null) => {
    inputRefs.current[baliseKey] = ref;
  }, []);

  const getExpectedLength = useCallback((balise: BaliseAffichee) => {
    if (balise.tableauExpectedCode) return Math.max(1, sanitize(balise.tableauExpectedCode).length);
    return Math.max(1, sanitize(balise.code ?? "").length);
  }, []);

  const setSelectionForBalise = useCallback(
    (baliseKey: string, value: string, expectedLength: number, forceAll = false) => {
      const cleanLength = sanitize(value).length;
      const shouldSelectAll = forceAll || cleanLength >= expectedLength;
      const nextSelection = shouldSelectAll
        ? { start: 0, end: Math.max(cleanLength, expectedLength) }
        : { start: cleanLength, end: cleanLength };

      setInputSelections((prev) => ({ ...prev, [baliseKey]: nextSelection }));
    },
    []
  );

  const scrollBaliseToTopPosition = useCallback(
    (baliseKey: string, animated = true) => {
      const rowY = rowYRefs.current[baliseKey];
      if (typeof rowY !== "number") return;

      const topOffset = isCompact ? 6 : 10;
      const targetY = Math.max(0, rowY - topOffset);

      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: targetY, animated });
      });
    },
    [isCompact]
  );

  const scheduleBaliseScroll = useCallback(
    (baliseKey: string) => {
      scrollTimerRefs.current.forEach((timer) => clearTimeout(timer));
      scrollTimerRefs.current = [];

      scrollBaliseToTopPosition(baliseKey, true);

      [80, 220, 420].forEach((delay) => {
        const timer = setTimeout(() => {
          scrollBaliseToTopPosition(baliseKey, true);
        }, delay);
        scrollTimerRefs.current.push(timer);
      });
    },
    [scrollBaliseToTopPosition]
  );

  const focusBalise = useCallback(
    (balise: BaliseAffichee, forceSelectAll = false, shouldScroll = false) => {
      const key = balise.instanceKey;

      setActiveBaliseKey(key);

      if (balise.poinconFormat) {
        if (shouldScroll) scheduleBaliseScroll(key);
        Keyboard.dismiss();
        return;
      }

      const expectedLength = getExpectedLength(balise);
      const currentValue = codesSaisis[key] ?? "";

      setSelectionForBalise(key, currentValue, expectedLength, forceSelectAll);

      if (shouldScroll) {
        scheduleBaliseScroll(key);
      }

      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);

      if (Platform.OS === "web") {
        inputRefs.current[key]?.focus?.();
        if (shouldScroll) {
          requestAnimationFrame(() => {
            scheduleBaliseScroll(key);
          });
        }
        return;
      }

      focusTimerRef.current = setTimeout(() => {
        inputRefs.current[key]?.focus?.();
        if (shouldScroll) scheduleBaliseScroll(key);
      }, 70);
    },
    [codesSaisis, getExpectedLength, scheduleBaliseScroll, setSelectionForBalise]
  );

  const focusNextBalise = useCallback(
    (currentIndex: number) => {
      for (let i = currentIndex + 1; i < balises.length; i += 1) {
        const nextBalise = balises[i];
        if (nextBalise && !validatedSet.has(nextBalise.instanceKey)) {
          focusBalise(nextBalise, false, true);
          return;
        }
      }

      Keyboard.dismiss();
    },
    [balises, focusBalise, validatedSet]
  );

  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      scrollTimerRefs.current.forEach((timer) => clearTimeout(timer));
      scrollTimerRefs.current = [];
    };
  }, []);

  const handleLogout = useCallback(async (resumePausedChrono = true) => {
    if (loggingOut) return;

    try {
      setLoggingOut(true);
      Keyboard.dismiss();
      setConfirmLogoutVisible(false);

      if (
        resumePausedChrono &&
        resultPauseUntilMs &&
        !errorReviewUntilMs &&
        !chronometreFinished &&
        parcoursActif?.id
      ) {
        const startedAt = new Date().toISOString();
        const baseMs = getCurrentChronometreMs();

        chronometreBaseMsRef.current = baseMs;
        chronometreStartedAtRef.current = new Date(startedAt).getTime();
        setChronometreMs(baseMs);
        setChronometreRunning(true);
        setResultPauseUntilMs(null);
        setResultPauseRemainingMs(0);

        if (studentId) {
          await AsyncStorage.removeItem(getChronoPauseStorageKey(studentId, parcoursActif.id)).catch(() => null);
        }

        await saveChronometre(baseMs, true, startedAt, false);
      }

      await AsyncStorage.multiRemove([
        "derniereConnexionMode",
        "dernierePageEleve",
        "eleveCache",
        "LS_LAST_MODE",
        "LS_LAST_PAGE_ELEVE",
        "LS_ELEVE_CACHE",
        "lastMode",
        "lastPageEleve",
        "studentCache",
        "eleveConnecte",
        "parcoursActif",
      ]).catch(() => null);

      try {
        if (handleDeconnexion) {
          await handleDeconnexion();
        }
      } catch (e) {
        console.warn("Déconnexion parent incomplète :", e);
      }

      setPage("accueil");
    } finally {
      setLoggingOut(false);
    }
  }, [
    chronometreFinished,
    errorReviewUntilMs,
    getCurrentChronometreMs,
    handleDeconnexion,
    loggingOut,
    parcoursActif?.id,
    resultPauseUntilMs,
    saveChronometre,
    setPage,
    studentId,
  ]);

  const resumeChronometreAndLogout = useCallback(async () => {
    if (!parcoursActif?.id || chronometreFinished) return;

    const startedAt = new Date().toISOString();
    const baseMs = getCurrentChronometreMs();

    chronometreBaseMsRef.current = baseMs;
    chronometreStartedAtRef.current = new Date(startedAt).getTime();
    setChronometreMs(baseMs);
    setChronometreRunning(true);
    setResultPauseUntilMs(null);
    setResultPauseRemainingMs(0);
    setErrorReviewUntilMs(null);
    setErrorReviewRemainingMs(0);

    if (studentId) {
      await AsyncStorage.removeItem(getChronoPauseStorageKey(studentId, parcoursActif.id)).catch(() => null);
    }

    await saveChronometre(baseMs, true, startedAt, false);
    await handleLogout(false);
  }, [chronometreFinished, getCurrentChronometreMs, handleLogout, parcoursActif?.id, saveChronometre, studentId]);

  const startEvaluationChronometreGate = useCallback(async () => {
    if (!parcoursActif?.id || chronometreSaving || chronometreCountdown || chronometreFinished) return;

    const steps = ["3", "2", "1", "GO !"];
    for (const step of steps) {
      setChronometreCountdown(step);
      await new Promise((resolve) => setTimeout(resolve, step === "GO !" ? 650 : 850));
    }

    const startedAt = new Date().toISOString();
    const baseMs = 0;

    chronometreBaseMsRef.current = baseMs;
    chronometreStartedAtRef.current = new Date(startedAt).getTime();
    setChronometreMs(baseMs);
    setChronometreRunning(true);
    setChronometreFinished(false);
    setEvaluationRequiresTime(false);
    setChronometreCountdown(null);

    await saveChronometre(baseMs, true, startedAt, false);
    await handleLogout(false);
  }, [
    chronometreCountdown,
    chronometreFinished,
    chronometreSaving,
    handleLogout,
    parcoursActif?.id,
    saveChronometre,
  ]);

  useEffect(() => {
    if (!resultPauseUntilMs || errorReviewUntilMs || chronometreFinished) return;

    const timer = setInterval(() => {
      const remaining = Math.max(0, resultPauseUntilMs - Date.now());
      setResultPauseRemainingMs(remaining);

      if (remaining <= 0) {
        clearInterval(timer);
        resumeChronometreAndLogout();
      }
    }, 500);

    return () => clearInterval(timer);
  }, [chronometreFinished, errorReviewUntilMs, resultPauseUntilMs, resumeChronometreAndLogout]);

  useEffect(() => {
    if (!errorReviewUntilMs || chronometreFinished) return;

    const timer = setInterval(() => {
      const remaining = Math.max(0, errorReviewUntilMs - Date.now());
      setErrorReviewRemainingMs(remaining);

      if (remaining <= 0) {
        clearInterval(timer);
        resumeChronometreAndLogout();
      }
    }, 500);

    return () => clearInterval(timer);
  }, [chronometreFinished, errorReviewUntilMs, resumeChronometreAndLogout]);

  useEffect(() => {
    if (
      loading ||
      chronometreFinished ||
      chronometreRunning ||
      resultPauseUntilMs ||
      errorReviewUntilMs ||
      chronometreMs <= 0 ||
      !parcoursActif?.id
    ) {
      return;
    }

    const timer = setTimeout(() => {
      resumeChronometreAndLogout();
    }, 250);

    return () => clearTimeout(timer);
  }, [
    chronometreFinished,
    chronometreMs,
    chronometreRunning,
    errorReviewUntilMs,
    loading,
    parcoursActif?.id,
    resultPauseUntilMs,
    resumeChronometreAndLogout,
  ]);

  const startChronometreFlow = useCallback(async () => {
    if (!parcoursActif?.id || chronometreSaving || chronometreCountdown) return;

    setConfirmChronometreVisible(false);

    const steps = ["3", "2", "1", "GO !"];
    for (const step of steps) {
      setChronometreCountdown(step);
      await new Promise((resolve) => setTimeout(resolve, step === "GO !" ? 650 : 850));
    }

    const startedAt = new Date().toISOString();
    const baseMs = parseChronometreMs(chronometreMs);

    chronometreBaseMsRef.current = baseMs;
    chronometreStartedAtRef.current = new Date(startedAt).getTime();
    setChronometreMs(baseMs);
    setChronometreRunning(true);
    setChronometreCountdown(null);

    await saveChronometre(baseMs, true, startedAt);
    await handleLogout();
  }, [
    chronometreCountdown,
    chronometreMs,
    chronometreSaving,
    handleLogout,
    parcoursActif?.id,
    saveChronometre,
  ]);

  const handleRetour = useCallback(() => {
    Keyboard.dismiss();
    setPage(pagePrecedente);
  }, [pagePrecedente, setPage]);

  const resolveStudent = useCallback(async () => {
    let targetIds = getTargetStudentIds(eleveConnecte);
    let nextStudentId = targetIds[0] ?? getStudentId(eleveConnecte);
    let nextGroupId = getTargetGroupIds(eleveConnecte)[0] ?? eleveConnecte?.group_id ?? null;

    if (eleveConnecte?.isGroupSession && targetIds.length > 0 && !nextGroupId) {
      const { data } = await supabase
        .from("students")
        .select("id,group_id")
        .in("id", targetIds);

      const rows = ((data as any[]) || []).filter(Boolean);
      targetIds = Array.from(new Set(rows.map((row) => row.id).filter(Boolean).map(String)));
      nextStudentId = targetIds[0] ?? nextStudentId;
      nextGroupId = rows.map((row) => row.group_id).filter(Boolean).map(String)[0] ?? nextGroupId;
    }

    if ((!nextStudentId || !nextGroupId) && eleveConnecte?.code && !eleveConnecte?.isGroupSession) {
      const rpc = await supabase.rpc("student_name_by_code", {
        p_code: eleveConnecte.code,
      });

      if (!rpc.error && rpc.data) {
        const row: RpcStudentRow = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
        nextStudentId = row?.id ?? nextStudentId;
        nextGroupId = row?.group_id ?? nextGroupId;
      }
    }

    setStudentId(nextStudentId);
    setStudentGroupId(nextGroupId);

    return { studentId: nextStudentId, groupId: nextGroupId };
  }, [eleveConnecte]);

  const forceParcoursBonusIfNeeded = useCallback(
    ({
      rawTotal,
      score,
      config,
      isTermine,
    }: {
      rawTotal: number;
      score: ReturnType<typeof computeCurrentDisplayedScore>;
      config: ParcoursPointsConfig;
      isTermine: boolean;
    }) => {
      if (!isTermine) return rawTotal;
      if (!config.modes.parcours) return rawTotal;
      if (!config.pointsParParcours || config.pointsParParcours <= 0) return rawTotal;
      if (score.parcoursPoints > 0) return rawTotal;
      return rawTotal + Number(config.pointsParParcours || 0);
    },
    []
  );

  const loadAttemptsAndConfig = useCallback(
    async (
      resolvedStudentId: string | null,
      resolvedGroupId: string | null,
      resolvedParcoursId?: string,
      orderedBalises: BaliseAffichee[] = []
    ) => {
      const baseResolvedConfig = await loadResolvedTentativeConfig(resolvedGroupId, resolvedParcoursId);

      const fixedPointsConfig = await mergeConfigWithBestSupabaseRow(
        resolvedGroupId,
        resolvedParcoursId,
        baseResolvedConfig.pointsConfig
      );

      const fixedAttemptPage =
        fixedPointsConfig.tentativePageMode === "personnalise"
          ? resolvedParcoursId
            ? fixedPointsConfig.tentativePageAssignments[resolvedParcoursId] ??
              fixedPointsConfig.tentativePageDefault ??
              null
            : null
          : fixedPointsConfig.tentativePageDefault ?? baseResolvedConfig.resolvedAttemptPage;

      const baremes = await loadParcoursTentativeBaremeRows(
        baseResolvedConfig.resolvedProfesseurId,
        fixedAttemptPage
      );

      const progressRaw = await recomputeAndSyncStats({
        studentId: resolvedStudentId,
        parcoursId: resolvedParcoursId,
        balises: orderedBalises,
        pointsConfig: fixedPointsConfig,
        tentativeBaremeRows: baremes,
      });

      const normalizedValidatedIds = normalizeValidatedIdsForOccurrences(
        progressRaw.validatedIds,
        orderedBalises
      );

      const progress = {
        ...progressRaw,
        validatedIds: normalizedValidatedIds,
        validatedCount: normalizedValidatedIds.length,
        parcoursTermine: orderedBalises.length > 0 && normalizedValidatedIds.length >= orderedBalises.length,
      };

      const [attempts, dbTermine, savedChronometre] = await Promise.all([
        loadAttemptsHistory(resolvedStudentId, resolvedParcoursId),
        loadStatParcoursTermine(resolvedStudentId, resolvedParcoursId),
        loadChronometreMs(resolvedStudentId, resolvedParcoursId),
      ]);

      const resolvedMaxAttemptsValue = baseResolvedConfig.resolvedMaxAttempts ?? null;
      const attemptsExhausted =
        resolvedMaxAttemptsValue != null &&
        attempts.length >= resolvedMaxAttemptsValue &&
        !progress.parcoursTermine;

      const effectiveTermine =
        (dbTermine && !attemptsExhausted) ||
        progress.parcoursTermine ||
        (orderedBalises.length > 0 && progress.validatedIds.length >= orderedBalises.length);

      const scoreNow = computeCurrentDisplayedScore({
        balises: orderedBalises,
        validatedIds: progress.validatedIds,
        completionAttemptNumber: progress.completionAttemptNumber,
        pointsConfig: fixedPointsConfig,
        tentativeBaremeRows: baremes,
      });

      const correctedTotal = forceParcoursBonusIfNeeded({
        rawTotal: scoreNow.totalPoints,
        score: scoreNow,
        config: fixedPointsConfig,
        isTermine: effectiveTermine,
      });

      if (resolvedStudentId && resolvedParcoursId && effectiveTermine && correctedTotal !== progressRaw.totalPoints) {
        await supabase
          .from("eleve_parcours_stats")
          .update({
            best_points: correctedTotal,
            last_points: correctedTotal,
            parcours_termine: true,
            updated_at: new Date().toISOString(),
          })
          .eq("student_id", resolvedStudentId)
          .eq("parcours_id", resolvedParcoursId);
      }

      setAttemptsHistory(attempts);
      setValidatedBaliseIds(progress.validatedIds);
      setCompletionAttemptNumber(progress.completionAttemptNumber);
      setSavedScore(progress.validatedCount);
      setTentativesCount(progressRaw.tentativesCount);
      setSavedPointsTotal(correctedTotal);
      setLastPointsGain(progressRaw.lastPointsGain);
      setParcoursTermineDb(effectiveTermine || attemptsExhausted);
      setAttemptsExhaustedFinal(attemptsExhausted);
      if (attemptsExhausted) {
        setResultats(resultsFromAttemptDetails(attempts[attempts.length - 1]));
      }
      chronometreStartedAtRef.current = savedChronometre.running && savedChronometre.startedAt ? new Date(savedChronometre.startedAt).getTime() : null;
      chronometreBaseMsRef.current = savedChronometre.running
        ? Math.max(0, savedChronometre.ms - (Date.now() - (chronometreStartedAtRef.current ?? Date.now())))
        : savedChronometre.ms;
      setChronometreMs(savedChronometre.ms);
      setChronometreRunning(attemptsExhausted ? false : savedChronometre.running);
      setChronometreFinished(attemptsExhausted ? true : savedChronometre.finished);

      if (attemptsExhausted && (savedChronometre.running || !savedChronometre.finished)) {
        await finishParcoursByAttemptsExhausted(
          resultsFromAttemptDetails(attempts[attempts.length - 1]),
          savedChronometre.ms
        );
      }

      if (attemptsExhausted) {
        setResultPauseUntilMs(null);
        setResultPauseRemainingMs(0);
        if (resolvedStudentId && resolvedParcoursId) {
          await AsyncStorage.removeItem(getChronoPauseStorageKey(resolvedStudentId, resolvedParcoursId)).catch(() => null);
        }
      } else if (resolvedStudentId && resolvedParcoursId) {
        const pauseRaw = await AsyncStorage.getItem(
          getChronoPauseStorageKey(resolvedStudentId, resolvedParcoursId)
        ).catch(() => null);
        const pauseUntil = Number(pauseRaw ?? 0);

        if (Number.isFinite(pauseUntil) && pauseUntil > Date.now()) {
          setResultPauseUntilMs(pauseUntil);
          setResultPauseRemainingMs(pauseUntil - Date.now());
        } else {
          setResultPauseUntilMs(null);
          setResultPauseRemainingMs(0);
        }
      }

      if (effectiveTermine || attemptsExhausted) {
        await refreshEvaluationResult(resolvedStudentId, resolvedParcoursId);
      } else {
        setEvaluationResult(null);
      }

      setPointsConfig(fixedPointsConfig);
      setResolvedTentativePage(fixedAttemptPage);
      setResolvedMaxAttempts(resolvedMaxAttemptsValue);
      setResolvedTentativeGroupId(baseResolvedConfig.resolvedGroupId);
      setResolvedProfesseurId(baseResolvedConfig.resolvedProfesseurId);
      setSupportParcoursId(baseResolvedConfig.supportParcoursId);
      setTentativeBaremeRows(baremes);
    },
    [finishParcoursByAttemptsExhausted, forceParcoursBonusIfNeeded, loadEvaluationRequiresTime, refreshEvaluationResult]
  );

  const resetProgress = useCallback(() => {
    setBalises([]);
    setActiveBaliseKey(null);
    setAttemptsHistory([]);
    setValidatedBaliseIds([]);
    setCompletionAttemptNumber(null);
    setSavedScore(0);
    setTentativesCount(0);
    setSavedPointsTotal(0);
    setLastPointsGain(0);
    setParcoursTermineDb(false);
    setPointsConfig(getDefaultPointsConfig());
    setTentativeBaremeRows([]);
    setResolvedTentativePage(null);
    setResolvedMaxAttempts(null);
    setResolvedTentativeGroupId(null);
    setResolvedProfesseurId(null);
    setSupportParcoursId(null);
    setCodesSaisis({});
    setPoinconsSaisis({});
    setResultats({});
    setInputSelections({});
    chronometreStartedAtRef.current = null;
    chronometreBaseMsRef.current = 0;
    setChronometreMs(0);
    setChronometreRunning(false);
    setChronometreSaving(false);
    setChronometreFinished(false);
    setResultPauseUntilMs(null);
    setResultPauseRemainingMs(0);
    setErrorReviewUntilMs(null);
    setErrorReviewRemainingMs(0);
    setAttemptsExhaustedFinal(false);
    setEvaluationResult(null);
    setEvaluationRequiresTime(false);
    setConfirmVerifyVisible(false);
    setConfirmChronometreVisible(false);
    setChronometreCountdown(null);
    inputRefs.current = {};
    rowYRefs.current = {};
    rowHeightRefs.current = {};
    autoFocusLockRef.current = null;
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setScreenError(null);

    try {
      if (!parcoursActif?.id) {
        resetProgress();
        return;
      }

      const resolved = await resolveStudent();

      const { data: parcoursData, error: parcoursError } = await supabase
        .from("parcours")
        .select("*")
        .eq("id", parcoursActif.id)
        .limit(1);

      if (parcoursError) throw parcoursError;

      const parcoursDb = (((parcoursData as ParcoursActif[] | null) ?? [])[0] as ParcoursActif | undefined) ?? parcoursActif;
      const evaluationModeActive = parcoursDb?.mode_evaluation === true || parcoursActif?.mode_evaluation === true;
      const evaluationBaremeId = parcoursDb?.bareme_evaluation_id ?? parcoursActif?.bareme_evaluation_id ?? null;
      const needsEvaluationTimeGate = evaluationModeActive
        ? await loadEvaluationRequiresTime(evaluationBaremeId)
        : false;

      setEvaluationRequiresTime(needsEvaluationTimeGate);

      const rawBalisesOrdre = parcoursDb?.balises_ordre ?? parcoursActif?.balises_ordre ?? null;
      const savedFormatOrder = normalizeBaliseFormatOrder(
        parcoursDb?.balises_formats_ordre ?? parcoursActif?.balises_formats_ordre ?? null
      );
      const tokens = savedFormatOrder.length
        ? savedFormatOrder.map((item) => `${item.lookupToken}::format::${item.selectedFormatType}`)
        : extractTokens(rawBalisesOrdre);

      const ownerId = String(
        parcoursDb?.user_id ??
          parcoursDb?.professeur_id ??
          parcoursDb?.teacher_id ??
          parcoursActif?.user_id ??
          parcoursActif?.professeur_id ??
          parcoursActif?.teacher_id ??
          eleveConnecte?.teacher_id ??
          ""
      ).trim() || null;

      let orderedBalises: BaliseAffichee[] = [];

      if (tokens.length) {
        const lookupTokens = tokens.map((token) => parseBaliseOrderToken(token).lookupToken);
        const uuidTokens = Array.from(new Set(lookupTokens.filter(isUuidLike)));
        const numeroTokens = Array.from(new Set(lookupTokens.filter(isIntegerLike).map((t) => Number(t))));
        const codeTokensRaw = Array.from(new Set(lookupTokens.filter((t) => !isUuidLike(t) && !isIntegerLike(t))));

        const fetchedBalises: BaliseRow[] = [];

        if (uuidTokens.length) {
          let query = supabase.from("balises").select("*").in("id", uuidTokens);
          if (ownerId) query = query.eq("user_id", ownerId);

          const { data, error } = await query;
          if (error) throw error;
          fetchedBalises.push(...(((data as BaliseRow[]) || []).filter(Boolean)));
        }

        if (numeroTokens.length) {
          let query = supabase.from("balises").select("*").in("numero_balise", numeroTokens);
          if (ownerId) query = query.eq("user_id", ownerId);

          const { data, error } = await query;
          if (error) throw error;
          fetchedBalises.push(...(((data as BaliseRow[]) || []).filter(Boolean)));
        }

        if (codeTokensRaw.length) {
          let query = supabase.from("balises").select("*");
          if (ownerId) query = query.eq("user_id", ownerId);

          const { data, error } = await query;
          if (error) throw error;

          const allBalises = ((data as BaliseRow[]) || []).filter(Boolean);
          const normalizedCodes = codeTokensRaw.map((x) => sanitize(x));

          const matchingByCode = allBalises.filter(
            (b) => !!b.code && normalizedCodes.includes(sanitize(b.code))
          );

          fetchedBalises.push(...matchingByCode);
        }

        const uniqBalisesMap = new Map<string, BaliseRow>();
        fetchedBalises.forEach((b) => {
          if (b?.id) uniqBalisesMap.set(String(b.id), b);
        });

        orderedBalises = orderBalisesFromTokens(tokens, Array.from(uniqBalisesMap.values()));
      }

      const parcoursFormatType = String(
        parcoursDb?.format_type ?? parcoursActif?.format_type ?? ""
      )
        .trim()
        .toLowerCase();

      if (orderedBalises.length) {
        const ids = Array.from(new Set(orderedBalises.map((b) => b.originalBaliseId)));
        const tableauAssignmentIndex = await loadOrCreateTableauAssignment({
          professeurId: ownerId,
          groupId: resolved.groupId,
          studentId: resolved.studentId,
        });

        const formatsDataFinal: BaliseFormatRow[] = await loadFormatsForBalises(ids);
        const poinconIds = new Set(
          formatsDataFinal
            .filter((format) => format.format_type === "poincon")
            .map((format) => String(format.balise_id))
        );
        const missingPoinconIds = ids.filter((id) => !poinconIds.has(String(id)));

        if (missingPoinconIds.length) {
          const poinconFallbackRows = await loadPoinconFormatsForBalises(missingPoinconIds);
          const existingKeys = new Set(
            formatsDataFinal.map((format) => `${format.balise_id}:${format.format_type}`)
          );

          poinconFallbackRows.forEach((format) => {
            const key = `${format.balise_id}:${format.format_type}`;
            if (!existingKeys.has(key)) {
              existingKeys.add(key);
              formatsDataFinal.push(format);
            }
          });
        }

        const formatsByBaliseId = new Map<string, PoinconFormat>();
        const tableauxByBaliseId = new Map<string, TableauFormat>();
        const qrcodesByBaliseId = new Map<string, QrCodeFormat>();

        formatsDataFinal.forEach((format) => {
          if (format.format_type === "poincon") {
            const normalized = normalizePoinconPayload(format.payload);
            if (normalized) {
              formatsByBaliseId.set(String(format.balise_id), normalized);
            }
          }

          if (format.format_type === "tableau") {
            const normalized = normalizeTableauPayload(format.payload);
            if (normalized) {
              tableauxByBaliseId.set(String(format.balise_id), normalized);
            }
          }

          if (format.format_type === "qrcode") {
            const normalized = normalizeQrPayload(format.payload);
            if (normalized) {
              qrcodesByBaliseId.set(String(format.balise_id), normalized);
            }
          }
        });

        if (formatsDataFinal.some((format) => format.format_type !== "poincon")) {
          const poinconFallbackRows = await loadPoinconFormatsForBalises(
            ids.filter((id) => !formatsByBaliseId.has(id))
          );

          poinconFallbackRows.forEach((format) => {
            const normalized = normalizePoinconPayload(format.payload);
            if (normalized) {
              formatsDataFinal.push(format);
              formatsByBaliseId.set(String(format.balise_id), normalized);
            }
          });
        }

        formatsDataFinal.forEach((format) => {
          if (format.format_type !== "poincon") return;
          const normalized = normalizePoinconPayload(format.payload);
          if (normalized && !formatsByBaliseId.has(String(format.balise_id))) {
            formatsByBaliseId.set(String(format.balise_id), normalized);
          }
        });

        console.log("🧩 FORMATS POINÇON CHARGÉS PAR RPC", {
          baliseIdsDuParcours: ids,
          formatsTrouves: formatsDataFinal.map((f) => ({
            id: f.id,
            balise_id: f.balise_id,
            format_type: f.format_type,
            payload: f.payload,
          })),
          poinconsRetenus: Array.from(formatsByBaliseId.keys()),
        });

        const normalizeIdKey = (value: any) => String(value ?? "").trim().toLowerCase();

        const formatsByCleanBaliseId = new Map<string, PoinconFormat>();
        const tableauxByCleanBaliseId = new Map<string, TableauFormat>();
        const qrcodesByCleanBaliseId = new Map<string, QrCodeFormat>();
        formatsByBaliseId.forEach((format, baliseId) => {
          formatsByCleanBaliseId.set(normalizeIdKey(baliseId), format);
        });
        tableauxByBaliseId.forEach((format, baliseId) => {
          tableauxByCleanBaliseId.set(normalizeIdKey(baliseId), format);
        });
        qrcodesByBaliseId.forEach((format, baliseId) => {
          qrcodesByCleanBaliseId.set(normalizeIdKey(baliseId), format);
        });

        const poinconFormatsInOrder = formatsDataFinal
          .filter((format) => String(format.format_type).trim().toLowerCase() === "poincon")
          .map((format) => normalizePoinconPayload(format.payload))
          .filter(Boolean) as PoinconFormat[];

        orderedBalises = orderedBalises.map((b, index) => {
          const directKey = String(b.originalBaliseId);
          const cleanKey = normalizeIdKey(b.originalBaliseId);

          let savedPoinconFormat =
            formatsByBaliseId.get(directKey) ??
            formatsByCleanBaliseId.get(cleanKey) ??
            null;
          const savedTableauFormat =
            tableauxByBaliseId.get(directKey) ??
            tableauxByCleanBaliseId.get(cleanKey) ??
            null;
          const savedQrCodeFormat =
            qrcodesByBaliseId.get(directKey) ??
            qrcodesByCleanBaliseId.get(cleanKey) ??
            null;

          if (!savedPoinconFormat && poinconFormatsInOrder.length === orderedBalises.length) {
            savedPoinconFormat = poinconFormatsInOrder[index] ?? null;
          }

          const shouldUsePoincon =
            b.selectedFormatType === "poincon" ||
            (!b.selectedFormatType && parcoursFormatType === "poincon") ||
            (!!savedPoinconFormat && !b.selectedFormatType);
          const shouldUseTableau =
            b.selectedFormatType === "tableau" ||
            (!b.selectedFormatType && parcoursFormatType === "tableau") ||
            (!!savedTableauFormat && !b.selectedFormatType);
          const shouldUseQrCode =
            b.selectedFormatType === "qrcode" ||
            (!b.selectedFormatType && parcoursFormatType === "qrcode") ||
            (!!savedQrCodeFormat && !b.selectedFormatType);
          const assignedCellKey =
            shouldUseTableau && savedTableauFormat
              ? getAssignedTableauCellKey(
                  tableauAssignmentIndex ?? 0,
                  savedTableauFormat.rows,
                  savedTableauFormat.cols
                )
              : null;
          const tableauExpectedCode =
            assignedCellKey && savedTableauFormat
              ? String(savedTableauFormat.cells[assignedCellKey] ?? "").trim()
              : null;

          return {
            ...b,
            code: shouldUseQrCode && savedQrCodeFormat?.value
              ? savedQrCodeFormat.value
              : shouldUseTableau && tableauExpectedCode
                ? tableauExpectedCode
                : b.code,
            poinconFormat: shouldUsePoincon
              ? savedPoinconFormat ?? DEFAULT_POINCON_FORMAT
              : null,
            poinconFormatMissing: shouldUsePoincon && !savedPoinconFormat,
            tableauFormat: shouldUseTableau ? savedTableauFormat : null,
            tableauAssignedCellKey: assignedCellKey,
            tableauExpectedCode,
            tableauFormatMissing: shouldUseTableau && (!savedTableauFormat || !tableauExpectedCode),
            qrcodeFormat: shouldUseQrCode ? savedQrCodeFormat : null,
            qrcodeFormatMissing: shouldUseQrCode && !savedQrCodeFormat,
          };
        });

        const missingPoincons = orderedBalises.filter(
          (b) => parcoursFormatType === "poincon" && !formatsByBaliseId.has(b.originalBaliseId)
        );

        if (missingPoincons.length > 0) {
          console.warn(
            "❌ ERREUR POINÇON : certaines balises du parcours n'ont aucun format poinçon Supabase après double requête.",
            missingPoincons.map((b) => ({
              instanceKey: b.instanceKey,
              originalBaliseId: b.originalBaliseId,
              numero: b.numero_balise,
              code: b.code,
            }))
          );
        }

        console.log("🧩 FORMAT PARCOURS ELEVE", {
          parcoursId: parcoursActif?.id,
          format_type_db: parcoursDb?.format_type,
          format_type_actif: parcoursActif?.format_type,
          parcoursFormatType,
          balisesCount: orderedBalises.length,
          poinconsCount: orderedBalises.filter((b) => !!b.poinconFormat).length,
        });
      }

      setBalises(orderedBalises);
      setActiveBaliseKey(orderedBalises[0]?.instanceKey ?? null);
      setPoinconsSaisis({});

      await loadAttemptsAndConfig(resolved.studentId, resolved.groupId, parcoursActif.id, orderedBalises);
    } catch (err: any) {
      console.error("Erreur EcrireCodeBaliseEleve:", err);
      setScreenError(err?.message || "Impossible de charger les données du parcours.");
      resetProgress();
    } finally {
      setLoading(false);
    }
  }, [loadAttemptsAndConfig, parcoursActif, resetProgress, resolveStudent, eleveConnecte?.teacher_id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const liveScore = useMemo(() => {
    const score = computeCurrentDisplayedScore({
      balises,
      validatedIds: validatedBaliseIds,
      completionAttemptNumber,
      pointsConfig,
      tentativeBaremeRows,
    });

    if (
      isCompletedEffective &&
      pointsConfig.modes.parcours &&
      pointsConfig.pointsParParcours > 0 &&
      score.parcoursPoints <= 0
    ) {
      return {
        ...score,
        parcoursPoints: pointsConfig.pointsParParcours,
        totalPoints: score.totalPoints + pointsConfig.pointsParParcours,
      };
    }

    return score;
  }, [
    balises,
    validatedBaliseIds,
    completionAttemptNumber,
    pointsConfig,
    tentativeBaremeRows,
    isCompletedEffective,
  ]);

  const handleCodeChange = useCallback(
    (balise: BaliseAffichee, baliseIndex: number, text: string) => {
      const key = balise.instanceKey;
      if (maxAttemptsReached) return;
      if (validatedSet.has(key)) return;

      const expectedLength = getExpectedLength(balise);
      const nextValue = sanitize(text).slice(0, expectedLength);
      const nextCursor = nextValue.length;

      setActiveBaliseKey(key);
      setCodesSaisis((prev) => ({ ...prev, [key]: nextValue }));
      setResultats((prev) => ({ ...prev, [key]: null }));
      setInputSelections((prev) => ({ ...prev, [key]: { start: nextCursor, end: nextCursor } }));

      if (nextValue.length < expectedLength) {
        autoFocusLockRef.current = null;
        return;
      }

      if (autoFocusLockRef.current === key) return;

      autoFocusLockRef.current = key;
      setTimeout(() => {
        focusNextBalise(baliseIndex);
      }, 90);
    },
    [focusNextBalise, getExpectedLength, maxAttemptsReached, validatedSet]
  );

  const applyQrScanValue = useCallback(
    (baliseKey: string, value: any) => {
      const cleanValue = normalizeQrValue(value);
      if (!cleanValue) return;

      setActiveBaliseKey(baliseKey);
      setCodesSaisis((prev) => ({ ...prev, [baliseKey]: cleanValue }));
      setResultats((prev) => ({ ...prev, [baliseKey]: null }));
      closeQrScanner();
    },
    [closeQrScanner]
  );

  const openQrScannerForBalise = useCallback(
    async (balise: BaliseAffichee) => {
      const key = balise.instanceKey;
      if (maxAttemptsReached || validatedSet.has(key)) return;
      if (!balise.qrcodeFormat?.value) {
        setAppMessage({
          title: "QR code introuvable",
          message: "La réponse QR de cette balise n'a pas été trouvée.",
          tone: "warning",
        });
        return;
      }

      setActiveBaliseKey(key);
      setQrScannerBaliseKey(key);
      setQrScanLocked(false);

      if (Platform.OS === "web") {
        const BarcodeDetectorCtor = (globalThis as any).BarcodeDetector;

        if (!BarcodeDetectorCtor || !navigator?.mediaDevices?.getUserMedia) {
          setAppMessage({
            title: "Scanner indisponible",
            message: "Ce navigateur ne permet pas le scan QR en direct. Utilise un navigateur Chrome ou Edge récent.",
            tone: "warning",
          });
          return;
        }

        try {
          stopWebQrScanner();
          setQrScannerMessage("Ouverture de la caméra...");
          setQrWebScannerActive(true);
          setQrScannerVisible(true);

          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false,
          });
          qrWebStreamRef.current = stream;

          requestAnimationFrame(() => {
            const video = qrWebVideoRef.current as HTMLVideoElement | null;
            if (!video) return;

            video.srcObject = stream;
            video.setAttribute("playsInline", "true");
            video.play?.().catch(() => null);
            setQrScannerMessage("Place le QR code dans le cadre.");

            const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
            qrWebScanTimerRef.current = setInterval(async () => {
              try {
                const results = await detector.detect(video);
                const nextValue = normalizeQrValue(results?.[0]?.rawValue);
                if (!nextValue) return;
                applyQrScanValue(key, nextValue);
              } catch {
                // On réessaie à l'image suivante.
              }
            }, 450);
          });
        } catch (e: any) {
          closeQrScanner();
          setAppMessage({
            title: "Caméra indisponible",
            message: e?.message || "Impossible d'ouvrir la caméra.",
            tone: "error",
          });
        }
        return;
      }

      try {
        const permission = await BarCodeScanner.requestPermissionsAsync();
        if (permission.status !== "granted") {
          setAppMessage({
            title: "Caméra refusée",
            message: "Autorise l'accès à la caméra pour scanner le QR code.",
            tone: "warning",
          });
          return;
        }

        setQrWebScannerActive(false);
        setQrScannerMessage("Place le QR code dans le cadre.");
        setQrScannerVisible(true);
      } catch (e: any) {
        setAppMessage({
          title: "Scanner indisponible",
          message: e?.message || "Impossible d'ouvrir le scanner QR.",
          tone: "error",
        });
      }
    },
    [applyQrScanValue, closeQrScanner, maxAttemptsReached, stopWebQrScanner, validatedSet]
  );

  const handleQrScanned = useCallback(
    ({ data }: { data: string }) => {
      if (qrScanLocked || !qrScannerBaliseKey) return;
      setQrScanLocked(true);
      applyQrScanValue(qrScannerBaliseKey, data);
    },
    [applyQrScanValue, qrScanLocked, qrScannerBaliseKey]
  );

  const computeGainBreakdown = useCallback(
    (nextResults: Record<string, boolean | null>): GainBreakdown => {
      return computeTentativeGainBreakdown({
        balises,
        validatedIds: validatedBaliseIds,
        nextResults,
        tentativesCount,
        pointsConfig,
        tentativeBaremeRows,
        resolvedTentativePage,
        resolvedGroupId: resolvedTentativeGroupId,
        resolvedProfesseurId,
        supportParcoursId,
      });
    },
    [
      balises,
      validatedBaliseIds,
      tentativesCount,
      pointsConfig,
      tentativeBaremeRows,
      resolvedTentativePage,
      resolvedTentativeGroupId,
      resolvedProfesseurId,
      supportParcoursId,
    ]
  );

  const saveTentativeAndStats = useCallback(
    async (nextResults: Record<string, boolean | null>) => {
      if (!studentId || !parcoursActif?.id) {
        throw new Error("Élève ou parcours introuvable.");
      }

      if (isCompleted) {
        throw new Error("Ce parcours est déjà terminé.");
      }

      if (maxAttemptsReached) {
        throw new Error(
          `La limite de ${resolvedMaxAttempts} tentative${resolvedMaxAttempts === 1 ? "" : "s"} est atteinte.`
        );
      }

      const parcoursId = parcoursActif.id;
      const breakdown = computeGainBreakdown(nextResults);

      const codesForSave = { ...codesSaisis };

      balises.forEach((balise) => {
        if (!balise.poinconFormat) return;
        const key = balise.instanceKey;
        const matrix = poinconsSaisis[key];
        if (matrix) {
          codesForSave[key] = JSON.stringify(matrix);
        }
      });

      const studentIdsToSave = Array.from(
        new Set(
          [
            ...(eleveConnecte?.isGroupSession ? getTargetStudentIds(eleveConnecte) : []),
            studentId,
          ]
            .filter(Boolean)
            .map(String)
        )
      );

      if (studentIdsToSave.length === 0) {
        throw new Error("Aucun élève du groupe n'a été trouvé.");
      }

      const saveForStudent = async (targetStudentId: string) => {
        const saved = await saveTentativeWithStats({
          studentId: targetStudentId,
          parcoursId,
          balises,
          validatedIds: validatedBaliseIds,
          codesSaisis: codesForSave,
          nextResults,
          pointsConfig,
          breakdown,
          currentDisplayedTotal: savedPointsTotal,
        });

        const progress = await recomputeAndSyncStats({
          studentId: targetStudentId,
          parcoursId,
          balises,
          pointsConfig,
          tentativeBaremeRows,
        });

        return { saved, progress };
      };

      const primarySave = await saveForStudent(studentId);
      const result = primarySave.saved;

      const nextValidatedIds = Array.from(new Set([...validatedBaliseIds, ...result.newlyValidatedIds]));

      const nextCompletionAttemptNumber =
        breakdown.willComplete && completionAttemptNumber == null
          ? breakdown.tentativeNumero
          : completionAttemptNumber;

      const nextProgressRaw = primarySave.progress;

      const normalizedNextProgressIds = normalizeValidatedIdsForOccurrences(
        nextProgressRaw.validatedIds.length ? nextProgressRaw.validatedIds : nextValidatedIds,
        balises
      );

      const nextProgress = {
        ...nextProgressRaw,
        validatedIds: normalizedNextProgressIds.length ? normalizedNextProgressIds : nextValidatedIds,
        validatedCount: normalizedNextProgressIds.length ? normalizedNextProgressIds.length : nextValidatedIds.length,
        parcoursTermine:
          balises.length > 0 &&
          (normalizedNextProgressIds.length ? normalizedNextProgressIds.length : nextValidatedIds.length) >= balises.length,
      };

      const dbTermine = await loadStatParcoursTermine(studentId, parcoursActif.id);
      const effectiveTermine =
        dbTermine ||
        nextProgress.parcoursTermine ||
        (balises.length > 0 && nextProgress.validatedIds.length >= balises.length);

      const recomputedScore = computeCurrentDisplayedScore({
        balises,
        validatedIds: nextProgress.validatedIds,
        completionAttemptNumber: nextProgress.completionAttemptNumber ?? nextCompletionAttemptNumber,
        pointsConfig,
        tentativeBaremeRows,
      });

      const correctedTotal = forceParcoursBonusIfNeeded({
        rawTotal: recomputedScore.totalPoints,
        score: recomputedScore,
        config: pointsConfig,
        isTermine: effectiveTermine,
      });

      if (effectiveTermine) {
        await supabase
          .from("eleve_parcours_stats")
          .update({
            best_points: correctedTotal,
            last_points: correctedTotal,
            parcours_termine: true,
            updated_at: new Date().toISOString(),
          })
          .eq("student_id", studentId)
          .eq("parcours_id", parcoursId);
      }

      await Promise.all(
        studentIdsToSave
          .filter((targetStudentId) => targetStudentId !== String(studentId))
          .map(async (targetStudentId) => {
            const groupSave = await saveForStudent(targetStudentId);

            if (!effectiveTermine) return;

            await supabase
              .from("eleve_parcours_stats")
              .update({
                best_points: correctedTotal,
                last_points: correctedTotal,
                parcours_termine: true,
                updated_at: new Date().toISOString(),
              })
              .eq("student_id", targetStudentId)
              .eq("parcours_id", parcoursId);

            return groupSave;
          })
      );

      const evaluation = effectiveTermine
        ? await refreshEvaluationResult(studentId, parcoursActif.id)
        : null;

      setAttemptsHistory((prev) => [
        ...prev,
        {
          student_id: studentId,
          parcours_id: parcoursId,
          tentatives_numero: breakdown.tentativeNumero,
          score: nextProgress.validatedCount,
          total_balises: balises.length,
          points_earned: breakdown.totalGain,
          details: result.details as AttemptDetail[],
        },
      ]);

      setValidatedBaliseIds(nextProgress.validatedIds);
      setSavedScore(nextProgress.validatedCount);
      setTentativesCount(nextProgress.tentativesCount || result.nextTentativesCount);
      setSavedPointsTotal(correctedTotal);
      setLastPointsGain(breakdown.totalGain);
      setCompletionAttemptNumber(nextProgress.completionAttemptNumber ?? nextCompletionAttemptNumber);
      setParcoursTermineDb(effectiveTermine);

      setCodesSaisis((prev) => {
        const next = { ...prev };
        result.newlyValidatedIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });

      setPoinconsSaisis((prev) => {
        const next = { ...prev };
        result.newlyValidatedIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });

      setResultats((prev) => {
        const next = { ...prev };
        nextProgress.validatedIds.forEach((id) => {
          next[id] = true;
        });
        return next;
      });

      return {
        breakdown,
        nextSavedPointsTotal: correctedTotal,
        nextValidatedCount: nextProgress.validatedCount,
        nextTentativesCount: nextProgress.tentativesCount || result.nextTentativesCount,
        evaluation,
      };
    },
    [
      studentId,
      parcoursActif?.id,
      isCompleted,
      maxAttemptsReached,
      resolvedMaxAttempts,
      computeGainBreakdown,
      balises,
      validatedBaliseIds,
      codesSaisis,
      poinconsSaisis,
      pointsConfig,
      savedPointsTotal,
      completionAttemptNumber,
      tentativeBaremeRows,
      forceParcoursBonusIfNeeded,
      refreshEvaluationResult,
      eleveConnecte,
    ]
  );

  const runVerifierTout = useCallback(async () => {
    try {
      Keyboard.dismiss();
      setSaving(true);

      const nextResults: Record<string, boolean | null> = {};

      balises.forEach((balise) => {
        const key = balise.instanceKey;

        if (validatedSet.has(key)) {
          nextResults[key] = true;
          return;
        }

        if (balise.poinconFormat) {
          if (balise.poinconFormatMissing) {
            console.warn("❌ Vérification impossible : format poinçon Supabase manquant", {
              balise: balise.ordre,
              key,
              originalBaliseId: balise.originalBaliseId,
              numero: balise.numero_balise,
              code: balise.code,
            });
            nextResults[key] = false;
            return;
          }

          const saisi =
            poinconsSaisis[key] ??
            emptyPoincon(balise.poinconFormat.rows, balise.poinconFormat.cols);

          const attendu = balise.poinconFormat.cells;

          const variants = buildPoinconVariants(attendu);
          const match = variants.some((variant) => samePoincon(saisi, variant));

          console.log("🔎 Vérification poinçon", {
            balise: balise.ordre,
            key,
            originalBaliseId: balise.originalBaliseId,
            numero: balise.numero_balise,
            rows: balise.poinconFormat.rows,
            cols: balise.poinconFormat.cols,
            eleve: matrixSignature(saisi),
            supabase: matrixSignature(attendu),
            variantesAcceptees: variants.map(matrixSignature),
            match,
          });

          nextResults[key] = match;
          return;
        }

        if (balise.qrcodeFormat) {
          const saisi = normalizeQrValue(codesSaisis[key]);
          const attendu = normalizeQrValue(balise.qrcodeFormat.value);
          nextResults[key] = !!saisi && !!attendu && saisi === attendu;
          return;
        }

        const saisi = sanitize(codesSaisis[key]);
        const attendu = sanitize(balise.tableauExpectedCode ?? balise.code ?? "");
        nextResults[key] = !!saisi && !!attendu && saisi === attendu;
      });

      setResultats(nextResults);

      const {
        breakdown,
        nextSavedPointsTotal,
        nextValidatedCount,
        nextTentativesCount,
        evaluation,
      } = await saveTentativeAndStats(nextResults);

      const hasErrors = Object.values(nextResults).some((value) => value === false);
      const parcoursSucceeded = balises.length > 0 && nextValidatedCount >= balises.length && !hasErrors;

      if (parcoursSucceeded) {
        const finalMs = getCurrentChronometreMs();
        chronometreStartedAtRef.current = null;
        chronometreBaseMsRef.current = finalMs;
        setChronometreMs(finalMs);
        setChronometreRunning(false);
        setChronometreFinished(true);
        setResultPauseUntilMs(null);
        setResultPauseRemainingMs(0);
        setErrorReviewUntilMs(null);
        setErrorReviewRemainingMs(0);

        if (studentId && parcoursActif?.id) {
          await AsyncStorage.removeItem(getChronoPauseStorageKey(studentId, parcoursActif.id)).catch(() => null);
        }

        await saveChronometre(finalMs, false, null, true);
        const finalEvaluation = await refreshEvaluationResult(studentId, parcoursActif?.id);

        const totalSeconds = Math.floor(finalMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const noteLine =
          finalEvaluation?.note != null
            ? `\nNote : ${
                Number.isInteger(Number(finalEvaluation.note))
                  ? Number(finalEvaluation.note)
                  : String(Math.round(Number(finalEvaluation.note) * 100) / 100).replace(".", ",")
              }${
                finalEvaluation.max != null
                  ? ` / ${
                      Number.isInteger(Number(finalEvaluation.max))
                        ? Number(finalEvaluation.max)
                        : String(Math.round(Number(finalEvaluation.max) * 100) / 100).replace(".", ",")
                    }`
                  : ""
              }`
            : "";
        setAppMessage({
          title: "Félicitations",
          message: `Vous avez réussi le parcours en ${minutes} minutes et ${seconds} secondes.${noteLine}`,
          tone: "success",
        });
        return;
      }

      if (hasErrors) {
        const attemptsLimitNowReached =
          resolvedMaxAttempts != null && nextTentativesCount >= resolvedMaxAttempts;

        if (attemptsLimitNowReached) {
          await finishParcoursByAttemptsExhausted(nextResults);
          return;
        }

        const reviewUntil = Date.now() + CHRONO_ERROR_REVIEW_MS;
        setErrorReviewUntilMs(reviewUntil);
        setErrorReviewRemainingMs(CHRONO_ERROR_REVIEW_MS);
        setResultPauseUntilMs(null);
        setResultPauseRemainingMs(0);
        return;
      }

      const lines = [
        `Balises nouvellement validées : ${breakdown.newlyValidatedCount}`,
        `Gain total : ${formatPointsLabel(breakdown.totalGain)}`,
        `Score enregistré : ${nextValidatedCount}/${balises.length}`,
        `Total : ${formatPointsLabel(nextSavedPointsTotal)}`,
        `Tentatives : ${nextTentativesCount}`,
      ];

      if (evaluation?.note != null) {
        lines.push(
          `Note : ${String(Math.round(Number(evaluation.note) * 100) / 100).replace(".", ",")}${
            evaluation.max != null
              ? ` / ${String(Math.round(Number(evaluation.max) * 100) / 100).replace(".", ",")}`
              : ""
          }`
        );
      }

      if (breakdown.willComplete) lines.unshift("Parcours terminé ✅");

      setAppMessage({
        title: "Tentative enregistrée",
        message: lines.join("\n"),
        tone: "info",
      });
    } catch (err: any) {
      console.error("Erreur enregistrement tentative:", err);
      setAppMessage({
        title: "Erreur",
        message: err?.message || "Impossible d'enregistrer la tentative.",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [
    balises,
    validatedSet,
    codesSaisis,
    poinconsSaisis,
    saveTentativeAndStats,
    getCurrentChronometreMs,
    finishParcoursByAttemptsExhausted,
    parcoursActif?.id,
    resolvedMaxAttempts,
    saveChronometre,
    refreshEvaluationResult,
    studentId,
  ]);

  const handleVerifierTout = useCallback(async () => {
    if (!balises.length) return;
    if (saving) return;

    if (isCompleted) {
      setAppMessage({
        title: "Parcours terminé",
        message: "Ce parcours est déjà entièrement validé.",
        tone: "success",
      });
      return;
    }

    if (maxAttemptsReached) {
      setAppMessage({
        title: "Limite atteinte",
        message: `La limite de ${resolvedMaxAttempts} tentative${resolvedMaxAttempts === 1 ? "" : "s"} est atteinte pour ce parcours.`,
        tone: "warning",
      });
      return;
    }

    const missingInput = balises.some((balise) => {
      const key = balise.instanceKey;
      if (validatedSet.has(key)) return false;

      if (balise.poinconFormat) {
        const current = poinconsSaisis[key];
        return !current?.some((row) => row.some(Boolean));
      }

      if (balise.qrcodeFormat) {
        return !normalizeQrValue(codesSaisis[key]);
      }

      const expectedLength = getExpectedLength(balise);
      return sanitize(codesSaisis[key]).length < expectedLength;
    });

    if (missingInput) {
      setAppMessage({
        title: "Codes incomplets",
        message: "Vous n'avez pas rempli tous les codes des balises.",
        tone: "warning",
      });
      return;
    }

    setConfirmVerifyVisible(true);
  }, [
    balises,
    validatedSet,
    codesSaisis,
    poinconsSaisis,
    isCompleted,
    maxAttemptsReached,
    resolvedMaxAttempts,
    saving,
    runVerifierTout,
    getExpectedLength,
  ]);

  const confirmVerifyAndRun = useCallback(() => {
    setConfirmVerifyVisible(false);
    runVerifierTout();
  }, [runVerifierTout]);

  const renderCodeBoxes = useCallback(
    (item: BaliseAffichee, baliseIndex: number) => {
      const key = item.instanceKey;
      const expectedLength = getExpectedLength(item);
      const typedValue = codesSaisis[key] ?? "";
      const paddedValue = typedValue.padEnd(expectedLength, " ");
      const result = resultats[key];
      const alreadyValidated = validatedSet.has(key);
      const isActive = activeBaliseKey === key;
      const selection = inputSelections[key];

      return (
	        <Pressable
	          onPress={() => {
	            if (!alreadyValidated && !maxAttemptsReached) focusBalise(item, true, true);
	          }}
	          style={[styles.codeBoxesWrap, { gap: boxGap }, webPanYStyle]}
	        >
	          {item.tableauAssignedCellKey ? (
	            <View style={styles.tableauStudentTargetPill}>
	              <Feather name="grid" size={14} color="#0F5E8C" />
	              <Text style={styles.tableauStudentTargetText}>
	                Case {item.tableauAssignedCellKey}
	              </Text>
	            </View>
	          ) : null}

	          {item.tableauFormatMissing ? (
	            <Text style={styles.tableauStudentMissingText}>
	              Code de tableau introuvable
	            </Text>
	          ) : null}

	          <TextInput
            ref={(ref) => setInputRef(key, ref)}
            value={alreadyValidated ? "" : typedValue}
            editable={!alreadyValidated && !maxAttemptsReached}
            maxLength={expectedLength}
            selection={selection}
            selectTextOnFocus={typedValue.length >= expectedLength}
            onFocus={() => {
              setActiveBaliseKey(key);
              setSelectionForBalise(key, typedValue, expectedLength, typedValue.length >= expectedLength);
              scheduleBaliseScroll(key);
            }}
            onChangeText={(text) => handleCodeChange(item, baliseIndex, text)}
            onSubmitEditing={() => focusNextBalise(baliseIndex)}
            blurOnSubmit={false}
            autoCapitalize="characters"
            autoCorrect={false}
            keyboardType="default"
            returnKeyType="next"
            style={styles.hiddenInput}
          />

          {Array.from({ length: expectedLength }).map((_, charIndex) => {
            const char = paddedValue[charIndex]?.trim() || "";

            return (
              <View
                key={`${key}__box_${charIndex}`}
                style={[
                  styles.codeBoxFake,
                  {
                    width: boxSize,
                    height: boxSize,
                    borderRadius: Math.max(9, Math.floor(boxSize / 4)),
                  },
                  isActive && styles.codeBoxActive,
                  result === true && styles.codeBoxOk,
                  result === false && styles.codeBoxKo,
                  alreadyValidated && styles.codeBoxValidated,
                ]}
              >
                <Text
                  style={[
                    styles.codeBoxFakeText,
                    { fontSize: isCompact ? 16 : 18 },
                    result === true && styles.codeBoxTextOk,
                    result === false && styles.codeBoxTextKo,
                    alreadyValidated && styles.codeBoxTextOk,
                  ]}
                >
                  {alreadyValidated ? "✓" : char}
                </Text>
              </View>
            );
          })}
        </Pressable>
      );
    },
    [
      activeBaliseKey,
      boxGap,
      boxSize,
      codesSaisis,
      focusBalise,
      focusNextBalise,
      getExpectedLength,
      handleCodeChange,
      inputSelections,
      isCompact,
      maxAttemptsReached,
      resultats,
      scheduleBaliseScroll,
      setInputRef,
      setSelectionForBalise,
      validatedSet,
    ]
  );

  const renderPoinconInput = useCallback(
    (item: BaliseAffichee) => {
      const key = item.instanceKey;
      const format = item.poinconFormat;
      if (!format) return null;

      const alreadyValidated = validatedSet.has(key);
      const result = resultats[key];
      const isActive = activeBaliseKey === key;

      const current = poinconsSaisis[key] ?? emptyPoincon(format.rows, format.cols);
      const cellSize = isCompact ? 32 : 38;

      return (
        <Pressable
          onPress={() => {
            if (!alreadyValidated && !maxAttemptsReached) {
              setActiveBaliseKey(key);
              Keyboard.dismiss();
            }
          }}
          style={[
            styles.poinconStudentWrap,
            isActive && styles.poinconStudentWrapActive,
            result === true && styles.poinconStudentWrapOk,
            result === false && styles.poinconStudentWrapKo,
          ]}
        >
          {current.map((row, r) => (
            <View key={`${key}_row_${r}`} style={styles.poinconStudentRow}>
              {row.map((active, c) => (
                <TouchableOpacity
                  key={`${key}_cell_${r}_${c}`}
                  activeOpacity={0.85}
                  disabled={alreadyValidated || maxAttemptsReached}
                  onPress={() => {
                    setActiveBaliseKey(key);
                    setResultats((prev) => ({ ...prev, [key]: null }));
                    setPoinconsSaisis((prev) => {
                      const base = prev[key] ?? emptyPoincon(format.rows, format.cols);
                      const next = base.map((line) => [...line]);
                      next[r][c] = !next[r][c];
                      return { ...prev, [key]: next };
                    });
                  }}
                  style={[
                    styles.poinconStudentCell,
                    {
                      width: cellSize,
                      height: cellSize,
                      borderRadius: Math.max(9, Math.floor(cellSize / 3.2)),
                    },
                    active && styles.poinconStudentCellActive,
                    result === true && styles.poinconStudentCellOk,
                    result === false && styles.poinconStudentCellKo,
                    alreadyValidated && styles.poinconStudentCellValidated,
                  ]}
                >
                  {active && <View style={styles.poinconDot} />}
                  {alreadyValidated && <Text style={styles.poinconCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </Pressable>
      );
    },
    [activeBaliseKey, isCompact, maxAttemptsReached, poinconsSaisis, resultats, validatedSet]
  );

  const renderQrCodeInput = useCallback(
    (item: BaliseAffichee) => {
      const key = item.instanceKey;
      const alreadyValidated = validatedSet.has(key);
      const result = alreadyValidated ? true : resultats[key];
      const scanned = !!normalizeQrValue(codesSaisis[key]);
      const isActive = activeBaliseKey === key;

      return (
        <View
          style={[
            styles.qrStudentWrap,
            isActive && styles.qrStudentWrapActive,
            result === true && styles.qrStudentWrapOk,
            result === false && styles.qrStudentWrapKo,
            alreadyValidated && styles.qrStudentWrapValidated,
          ]}
        >
          {item.qrcodeFormatMissing ? (
            <Text style={styles.qrStudentMissingText}>QR code introuvable</Text>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.88}
            disabled={alreadyValidated || maxAttemptsReached || item.qrcodeFormatMissing}
            onPress={() => openQrScannerForBalise(item)}
            style={[
              styles.qrStudentScanBtn,
              (alreadyValidated || maxAttemptsReached || item.qrcodeFormatMissing) && styles.qrStudentScanBtnDisabled,
            ]}
          >
            <Feather name={alreadyValidated ? "check-circle" : scanned ? "check" : "camera"} size={18} color="#FFFFFF" />
            <Text style={styles.qrStudentScanText}>
              {alreadyValidated ? "Validée" : scanned ? "QR scanné" : "Scanner le QR code"}
            </Text>
          </TouchableOpacity>
        </View>
      );
    },
    [activeBaliseKey, codesSaisis, maxAttemptsReached, openQrScannerForBalise, resultats, validatedSet]
  );

  const renderBalise = useCallback(
    ({ item, index }: { item: BaliseAffichee; index: number }) => {
      const key = item.instanceKey;
      const alreadyValidated = validatedSet.has(key);
      const result = alreadyValidated ? true : resultats[key];
      const isActive = activeBaliseKey === key;

      const overrideKey = item.originalBaliseId ?? item.id;
      const displayBalisePoints = pointsConfig.modes.balises
        ? pointsConfig.balisePointOverrides?.[overrideKey] != null
          ? pointsConfig.balisePointOverrides[overrideKey]
          : Number.isFinite(Number(item.points))
          ? Number(item.points)
          : pointsConfig.pointsParBalise
        : 0;

      return (
        <View
          onLayout={(event) => {
            rowHeightRefs.current[key] = event.nativeEvent.layout.height;
          }}
          style={[
            styles.baliseLine,
            webPanYStyle,
            isActive && styles.baliseLineActive,
            result === true && styles.baliseLineOk,
            result === false && styles.baliseLineKo,
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.95}
            onPress={() => {
              if (alreadyValidated) return;
              if (item.qrcodeFormat || item.qrcodeFormatMissing) {
                openQrScannerForBalise(item);
                return;
              }
              focusBalise(item, true, true);
            }}
            style={[styles.baliseLineTouchable, webPanYStyle]}
          >
            <LinearGradient
              colors={isActive ? ["#0F5E8C", "#38BDF8"] : ["#E0F2FE", "#FFFFFF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.baliseNumberBlock, isActive && styles.baliseNumberBlockActive]}
            >
              <Text style={[styles.baliseNumberLabel, isActive && styles.baliseNumberLabelActive]}>
                BALISE
              </Text>
              <Text style={[styles.baliseNumber, isActive && styles.baliseNumberActive]}>{item.ordre}</Text>
              {pointsConfig.modes.balises && (
                <Text style={[styles.pointsLeftText, isActive && styles.pointsLeftTextActive]}>
                  {formatPointsLabel(displayBalisePoints)}
                </Text>
              )}
            </LinearGradient>

            <View style={styles.baliseInputZone}>
              {item.poinconFormat
                ? renderPoinconInput(item)
                : item.qrcodeFormat || item.qrcodeFormatMissing
                  ? renderQrCodeInput(item)
                  : renderCodeBoxes(item, index)}

              {(alreadyValidated || result === false) && (
                <View style={styles.baliseMetaRow}>
                  {alreadyValidated ? (
                    <Text style={styles.okText}>Validée ✅</Text>
                  ) : result === false ? (
                    <Text style={styles.koText}>Incorrect ❌</Text>
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      );
    },
    [activeBaliseKey, focusBalise, openQrScannerForBalise, pointsConfig, renderCodeBoxes, renderPoinconInput, renderQrCodeInput, resultats, validatedSet]
  );

  const renderBigPoinconBalise = useCallback(
    ({ item, index }: { item: BaliseAffichee; index: number }) => {
      const key = item.instanceKey;
      const isPoinconItem = !!item.poinconFormat;
      const format = item.poinconFormat ?? DEFAULT_POINCON_FORMAT;
      const alreadyValidated = validatedSet.has(key);
      const result = alreadyValidated ? true : resultats[key];
      const isActive = activeBaliseKey === key;
      const current = poinconsSaisis[key] ?? emptyPoincon(format.rows, format.cols);
      const cellSize = getPoinconBigCellSize(format);
      const isMissingSupabaseAnswer = !!item.poinconFormatMissing;
      const gridGap = width < 430 ? 6 : 9;

      const overrideKey = item.originalBaliseId ?? item.id;
      const displayBalisePoints = pointsConfig.modes.balises
        ? pointsConfig.balisePointOverrides?.[overrideKey] != null
          ? pointsConfig.balisePointOverrides[overrideKey]
          : Number.isFinite(Number(item.points))
          ? Number(item.points)
          : pointsConfig.pointsParBalise
        : 0;

      const itemCanGoPrev = index > 0;
      const itemCanGoNext = index < balises.length - 1;

      return (
        <View style={[styles.bigPoinconCardOuter, { width: poinconCardWidth }, webPanXStyle]}>
          <Pressable
            onPress={() => {
              if (!alreadyValidated && !maxAttemptsReached) {
                setActiveBaliseKey(key);
                Keyboard.dismiss();
              }
            }}
            style={[
              styles.bigPoinconCard,
              { minHeight: poinconCardMinHeight, width: isCompact ? "100%" : "72%" },
              isActive && styles.bigPoinconCardActive,
              result === true && styles.bigPoinconCardOk,
              result === false && styles.bigPoinconCardKo,
            ]}
          >
            <View style={styles.bigPoinconHeader}>
              {isCompact ? (
                itemCanGoPrev ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => goToPoinconIndex(index - 1, true)}
                    style={styles.bigPoinconHeaderArrow}
                  >
                    <Feather name="chevron-left" size={23} color="#fff" />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.bigPoinconHeaderArrowSpacer} />
                )
              ) : null}

              <View style={styles.bigPoinconCenterHead}>
                <View style={[styles.bigPoinconBadge, isActive && styles.bigPoinconBadgeActive]}>
                  <Text style={[styles.bigPoinconBadgeLabel, isActive && styles.bigPoinconBadgeLabelActive]}>BALISE</Text>
                  <Text style={[styles.bigPoinconBadgeNumber, isActive && styles.bigPoinconBadgeNumberActive]}>{item.ordre}</Text>
                </View>

                {pointsConfig.modes.balises ? (
                  <Text style={styles.bigPoinconPointsUnder}>+ {formatPointsLabel(displayBalisePoints)}</Text>
                ) : null}
              </View>

              {isCompact ? (
                itemCanGoNext ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => goToPoinconIndex(index + 1, true)}
                    style={styles.bigPoinconHeaderArrow}
                  >
                    <Feather name="chevron-right" size={23} color="#fff" />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.bigPoinconHeaderArrowSpacer} />
                )
              ) : null}
            </View>

            {isPoinconItem && isMissingSupabaseAnswer ? (
              <View style={styles.poinconMissingBox}>
                <Text style={styles.poinconMissingTitle}>Réponse Supabase introuvable</Text>
                <Text style={styles.poinconMissingText}>
                  Aucun poinçon n'a été trouvé pour cette balise.
                </Text>
              </View>
            ) : null}

            {isPoinconItem ? (
              <View style={[styles.bigPoinconGridWrap, { gap: gridGap }]}>
                {current.map((row, r) => (
                  <View key={`${key}_big_row_${r}`} style={[styles.bigPoinconRow, { gap: gridGap }]}>
                    {row.map((active, c) => (
                      <TouchableOpacity
                        key={`${key}_big_cell_${r}_${c}`}
                        activeOpacity={0.82}
                        disabled={alreadyValidated || maxAttemptsReached}
                        onPress={() => {
                          setActiveBaliseKey(key);
                          setResultats((prev) => ({ ...prev, [key]: null }));
                          setPoinconsSaisis((prev) => {
                            const base = prev[key] ?? emptyPoincon(format.rows, format.cols);
                            const next = base.map((line) => [...line]);
                            next[r][c] = !next[r][c];
                            return { ...prev, [key]: next };
                          });
                        }}
                        style={[
                          styles.bigPoinconCell,
                          { width: cellSize, height: cellSize, borderRadius: Math.max(13, Math.floor(cellSize / 3.1)) },
                          active && styles.bigPoinconCellActive,
                          result === true && styles.bigPoinconCellOk,
                          result === false && styles.bigPoinconCellKo,
                          alreadyValidated && styles.bigPoinconCellValidated,
                        ]}
                      >
                        {active ? <View style={[styles.bigPoinconDot, { width: cellSize * 0.34, height: cellSize * 0.34 }]} /> : null}
                        {alreadyValidated ? <Text style={styles.bigPoinconCheck}>✓</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.bigCodeEntryWrap}>
                {renderCodeBoxes(item, index)}
              </View>
            )}

            {(alreadyValidated || result === false) ? (
              <View style={styles.bigPoinconFooterStatus}>
                {alreadyValidated ? <Text style={styles.okText}>Validée ✅</Text> : result === false ? <Text style={styles.koText}>Incorrect ❌</Text> : null}
              </View>
            ) : null}
          </Pressable>
        </View>
      );
    },
    [activeBaliseKey, balises.length, getPoinconBigCellSize, goToPoinconIndex, isCompact, maxAttemptsReached, poinconCardMinHeight, poinconCardWidth, poinconsSaisis, pointsConfig, renderCodeBoxes, resultats, validatedSet, width]
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ImageBackground source={{ uri: BG_GAME }} style={styles.bg} resizeMode="cover">
        <LinearGradient
          colors={[
            "rgba(5,18,30,0.58)",
            "rgba(9,34,54,0.42)",
            "rgba(234,246,255,0.86)",
            "rgba(234,246,255,0.96)",
          ]}
          locations={[0, 0.25, 0.6, 1]}
          style={styles.container}
        >
          <View style={styles.headerZone}>
            <View style={[styles.topBar, isPoinconParcours && styles.topBarCompact]}>
              <TouchableOpacity activeOpacity={0.9} onPress={handleRetour} style={[styles.iconBtn, isPoinconParcours && styles.iconBtnCompact]}>
                <Feather name="arrow-left" size={isPoinconParcours ? 16 : 18} color="#fff" />
              </TouchableOpacity>

              <Text
                style={[styles.pageTitle, isPoinconParcours && styles.pageTitleCompact]}
                numberOfLines={isPoinconParcours ? 1 : 2}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {parcoursNom}
              </Text>

              {!showEvaluationChronoGate ? (
              <View style={[styles.topBarActions, isPoinconParcours && styles.topBarActionsCompact]}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={toggleChronometre}
                  style={[
                    styles.chronoBtn,
                    isPoinconParcours && styles.chronoBtnCompact,
                    chronometrePaused && styles.chronoBtnPaused,
                    chronometreRunning && styles.chronoBtnRunning,
                    chronometreFinished && styles.chronoBtnFinished,
                    (chronometreSaving || !!chronometreCountdown || chronometreMs > 0 || chronometreFinished) && styles.chronoBtnDisabled,
                  ]}
                  disabled={chronometreSaving || !!chronometreCountdown || chronometreMs > 0 || chronometreFinished}
                >
                  {chronometreSaving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Feather
                      name={chronometreRunning ? "pause" : "clock"}
                      size={isPoinconParcours ? 15 : 17}
                      color={chronometreFinished ? "#0F172A" : "#fff"}
                    />
                  )}
                  {!isPoinconParcours && (
                    <Text style={[styles.chronoBtnText, chronometreFinished && styles.chronoBtnTextFinished]}>
                      {chronometreLabel}
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity activeOpacity={0.9} onPress={() => setConfirmLogoutVisible(true)} style={[styles.logoutBtn, isPoinconParcours && styles.logoutBtnCompact]}>
                  <Feather name="log-out" size={isPoinconParcours ? 17 : 19} color="#fff" />
                </TouchableOpacity>
              </View>
              ) : null}
            </View>

            {!showEvaluationChronoGate ? (
            <View style={[styles.stickyStatsBar, isPoinconParcours && styles.stickyStatsBarCompact]}>
              <View style={[styles.statBox, isPoinconParcours && styles.statBoxCompact, { width: statCardWidth }]}> 
                <Text style={[styles.statValue, isPoinconParcours && styles.statValueCompact]}>{savedScore}/{balises.length}</Text>
                <Text style={[styles.statLabel, isPoinconParcours && styles.statLabelCompact]}>
                  {isPoinconParcours ? "Trouvées" : "Balises trouvées"}
                </Text>
              </View>

              <View style={[styles.statBox, isPoinconParcours && styles.statBoxCompact, { width: statCardWidth }]}> 
                <Text style={[styles.statValue, isPoinconParcours && styles.statValueCompact]}>
                  {resolvedMaxAttempts == null ? tentativesCount : `${tentativesCount}/${resolvedMaxAttempts}`}
                </Text>
                <Text style={[styles.statLabel, isPoinconParcours && styles.statLabelCompact]}>Tentatives</Text>
              </View>

              <TouchableOpacity activeOpacity={0.9} onPress={() => setScoreModalVisible(true)} style={[styles.bigScorePillTop2, isPoinconParcours && styles.bigScorePillTop2Compact]}>
                <Text style={[styles.bigScoreValue, isPoinconParcours && styles.bigScoreValueCompact]}>{formatPoints(savedPointsTotal)}</Text>
                <Text style={[styles.bigScoreLabel, isPoinconParcours && styles.bigScoreLabelCompact]}>{formatPointUnit(savedPointsTotal)}</Text>
              </TouchableOpacity>
            </View>
            ) : null}
          </View>

          <ScrollView
            ref={scrollRef}
            style={[styles.mainScroll, webScrollStyle]}
            contentContainerStyle={{ padding: isPoinconParcours ? 6 : 12, paddingBottom: bottomScrollSpace }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
            nestedScrollEnabled
            scrollEnabled
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            directionalLockEnabled={true}
            canCancelContentTouches={true}
            onLayout={(event) => {
              scrollViewHeightRef.current = event.nativeEvent.layout.height;
            }}
            onScroll={(event) => {
              scrollYRef.current = event.nativeEvent.contentOffset.y;
            }}
          >
            {loading ? (
              <View style={styles.stateCard}>
                <ActivityIndicator size="large" color={C_GOLD} />
                <Text style={styles.stateTitle}>Chargement...</Text>
              </View>
            ) : showEvaluationChronoGate ? (
              <View style={styles.evaluationChronoGate}>
                <View style={styles.evaluationChronoGateIcon}>
                  <Feather name="clock" size={38} color="#FFFFFF" />
                </View>
                <Text style={styles.evaluationChronoGateTitle}>Evaluation chronométrée</Text>
                <Text style={styles.evaluationChronoGateValue}>{chronometreLabel}</Text>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.evaluationChronoGateButton, chronometreSaving && styles.evaluationChronoGateButtonDisabled]}
                  onPress={startEvaluationChronometreGate}
                  disabled={chronometreSaving}
                >
                  {chronometreSaving ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Feather name="play" size={22} color="#FFFFFF" />
                      <Text style={styles.evaluationChronoGateButtonText}>Démarrer</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : screenError ? (
              <View style={styles.stateCard}>
                <Feather name="alert-circle" size={42} color={C_GOLD} />
                <Text style={styles.stateTitle}>Erreur</Text>
                <Text style={styles.stateText}>{screenError}</Text>
              </View>
            ) : !parcoursActif?.id ? (
              <View style={styles.stateCard}>
                <Feather name="map" size={42} color={C_GOLD} />
                <Text style={styles.stateTitle}>Aucun parcours sélectionné</Text>
                <Text style={styles.stateText}>Reviens à la liste des parcours puis choisis-en un.</Text>
              </View>
            ) : balises.length === 0 ? (
              <View style={styles.stateCard}>
                <Feather name="map-pin" size={42} color={C_GOLD} />
                <Text style={styles.stateTitle}>Aucune balise trouvée</Text>
                <Text style={styles.stateText}>Ce parcours ne contient aucune balise active à afficher.</Text>
              </View>
            ) : isPoinconParcours && activePoinconBalise ? (
              <View style={[styles.poinconSingleZone, { paddingHorizontal: isCompact ? 0 : 62 }, webPanXStyle]}> 
                {!isCompact && canGoPrevPoincon ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => goToPoinconIndex(activePoinconIndex - 1, true)}
                    style={[styles.poinconArrow, styles.poinconArrowLeft]}
                  >
                    <Feather name="chevron-left" size={28} color="#fff" />
                  </TouchableOpacity>
                ) : null}

                <FlatList
                  ref={poinconListRef}
                  data={balises}
                  keyExtractor={(item) => item.instanceKey}
                  horizontal
                  pagingEnabled
                  scrollEnabled
                  showsHorizontalScrollIndicator={false}
                  directionalLockEnabled
                  bounces={false}
                  decelerationRate="fast"
                  snapToInterval={poinconCardWidth}
                  snapToAlignment="center"
                  disableIntervalMomentum
                  getItemLayout={(_, index) => ({ length: poinconCardWidth, offset: poinconCardWidth * index, index })}
                  initialScrollIndex={activePoinconIndex}
                  onMomentumScrollEnd={handlePoinconMomentumEnd}
                  onScroll={(event) => {
                    const x = event?.nativeEvent?.contentOffset?.x ?? 0;
                    const next = Math.max(
                      0,
                      Math.min(
                        balises.length - 1,
                        Math.round(x / Math.max(1, poinconCardWidth))
                      )
                    );

                    if (next !== activePoinconIndex) {
                      setActivePoinconIndex(next);
                      const nextBalise = balises[next];
                      if (nextBalise?.instanceKey) setActiveBaliseKey(nextBalise.instanceKey);
                    }
                  }}
                  scrollEventThrottle={16}
                  onScrollToIndexFailed={(info) => {
                    setTimeout(() => {
                      poinconListRef.current?.scrollToIndex?.({ index: info.index, animated: false });
                    }, 80);
                  }}
                  renderItem={({ item, index }) => renderBigPoinconBalise({ item, index })}
                  style={[styles.poinconHorizontalList, { width: poinconCardWidth }, webPanXStyle]}
                  contentContainerStyle={[styles.poinconHorizontalContent, webPanXStyle]}
                />

                <View style={[styles.verifyBelowPoinconWrap, { width: poinconCardWidth }]}> 
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={[
                      styles.verifyAllBtn,
                      styles.verifyAllBtnBelowPoincon,
                      (saving || isCompleted || maxAttemptsReached) && { opacity: 0.7 },
                      isCompleted && styles.verifyAllBtnDone,
                    ]}
                    onPress={handleVerifierTout}
                    disabled={saving || isCompleted || maxAttemptsReached}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : isCompleted ? (
                      <>
                        <Feather name="award" size={17} color="#fff" />
                        <Text style={[styles.verifyAllBtnText, styles.verifyAllBtnTextCompact]}>Parcours terminé</Text>
                      </>
                    ) : maxAttemptsReached ? (
                      <>
                        <Feather name="lock" size={17} color="#fff" />
                        <Text style={[styles.verifyAllBtnText, styles.verifyAllBtnTextCompact]}>Limite atteinte</Text>
                      </>
                    ) : (
                      <>
                        <Feather name="check-square" size={17} color="#fff" />
                        <Text style={[styles.verifyAllBtnText, styles.verifyAllBtnTextCompact]}>Tout vérifier</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {!isCompact && canGoNextPoincon ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => goToPoinconIndex(activePoinconIndex + 1, true)}
                    style={[styles.poinconArrow, styles.poinconArrowRight]}
                  >
                    <Feather name="chevron-right" size={28} color="#fff" />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : (
              <View style={webPanYStyle}>
                {balises.map((item, index) => (
                  <View
                    key={item.instanceKey}
                    onLayout={(event) => {
                      rowYRefs.current[item.instanceKey] = event.nativeEvent.layout.y;
                      rowHeightRefs.current[item.instanceKey] = event.nativeEvent.layout.height;
                    }}
                    style={webPanYStyle}
                  >
                    {renderBalise({ item, index })}
                    {index < balises.length - 1 && <View style={{ height: 10 }} />}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {!showEvaluationChronoGate && !isPoinconParcours && !loading && !screenError && !!balises.length && (
            <View style={[styles.bottomBar, isPoinconParcours && styles.bottomBarCompact]}>
              <TouchableOpacity
                activeOpacity={0.9}
                style={[
                  styles.verifyAllBtn,
                  isPoinconParcours && styles.verifyAllBtnCompact,
                  (saving || isCompleted || maxAttemptsReached) && { opacity: 0.7 },
                  isCompleted && styles.verifyAllBtnDone,
                ]}
                onPress={handleVerifierTout}
                disabled={saving || isCompleted || maxAttemptsReached}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : isCompleted ? (
                  <>
                    <Feather name="award" size={17} color="#fff" />
                    <Text style={[styles.verifyAllBtnText, isPoinconParcours && styles.verifyAllBtnTextCompact]}>Parcours terminé</Text>
                  </>
                ) : maxAttemptsReached ? (
                  <>
                    <Feather name="lock" size={17} color="#fff" />
                    <Text style={[styles.verifyAllBtnText, isPoinconParcours && styles.verifyAllBtnTextCompact]}>Limite atteinte</Text>
                  </>
                ) : (
                  <>
                    <Feather name="check-square" size={17} color="#fff" />
                    <Text style={[styles.verifyAllBtnText, isPoinconParcours && styles.verifyAllBtnTextCompact]}>Tout vérifier</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          <Modal transparent visible={confirmLogoutVisible} animationType="fade">
            <View style={styles.modalBg}>
              <View style={styles.logoutModalBox}>
                <Text style={styles.logoutModalTitle}>Déconnexion</Text>
                <Text style={styles.logoutModalText}>Souhaites-tu vraiment te déconnecter ?</Text>

                <View style={styles.modalActions}>
                  <Pressable style={styles.cancelBtn} onPress={() => setConfirmLogoutVisible(false)}>
                    <Text style={styles.cancelText}>Annuler</Text>
                  </Pressable>

                  <Pressable style={styles.confirmLogoutBtn} onPress={() => handleLogout()}>
                    {loggingOut ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Déconnexion</Text>}
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

          <Modal transparent visible={!!appMessage} animationType="fade">
            <View style={styles.appMessageOverlay}>
              <View style={styles.appMessageCard}>
                <View
                  style={[
                    styles.appMessageIcon,
                    appMessage?.tone === "success" && styles.appMessageIconSuccess,
                    appMessage?.tone === "warning" && styles.appMessageIconWarning,
                    appMessage?.tone === "error" && styles.appMessageIconError,
                  ]}
                >
                  <Feather
                    name={
                      appMessage?.tone === "success"
                        ? "award"
                        : appMessage?.tone === "warning"
                          ? "alert-triangle"
                          : appMessage?.tone === "error"
                            ? "x-circle"
                            : "info"
                    }
                    size={27}
                    color="#FFFFFF"
                  />
                </View>
                <Text style={styles.appMessageTitle}>{appMessage?.title}</Text>
                <Text style={styles.appMessageText}>{appMessage?.message}</Text>
                <Pressable style={styles.appMessageBtn} onPress={() => setAppMessage(null)}>
                  <Text style={styles.appMessageBtnText}>OK</Text>
                </Pressable>
              </View>
            </View>
          </Modal>

          <Modal transparent visible={confirmVerifyVisible} animationType="fade">
            <View style={styles.verifyModalOverlay}>
              <View style={styles.verifyModalCard}>
                <View style={styles.verifyModalIcon}>
                  <Feather name="check-square" size={26} color="#FFFFFF" />
                </View>

                <Text style={styles.verifyModalTitle}>Vérifier les balises ?</Text>

                <Text style={styles.verifyModalText}>
                  Cette action enregistrera une tentative et affichera les balises justes ou à corriger.
                </Text>

                <View style={styles.verifyModalActions}>
                  <Pressable style={styles.verifyCancelBtn} onPress={() => setConfirmVerifyVisible(false)}>
                    <Text style={styles.verifyCancelText}>Annuler</Text>
                  </Pressable>

                  <Pressable style={styles.verifyConfirmBtn} onPress={confirmVerifyAndRun}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.verifyConfirmText}>Vérifier</Text>}
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

          <Modal transparent visible={qrScannerVisible} animationType="slide" onRequestClose={closeQrScanner}>
            <View style={styles.qrStudentScannerBackdrop}>
              <View style={styles.qrStudentScannerPanel}>
                <View style={styles.qrStudentScannerHeader}>
                  <Text style={styles.qrStudentScannerTitle}>Scanner le QR code</Text>
                  <Pressable style={styles.qrStudentScannerClose} onPress={closeQrScanner}>
                    <Feather name="x" size={18} color="#FFFFFF" />
                  </Pressable>
                </View>

                <View style={styles.qrStudentCameraWrap}>
                  {Platform.OS === "web" && qrWebScannerActive ? (
                    React.createElement("video", {
                      ref: qrWebVideoRef,
                      muted: true,
                      playsInline: true,
                      autoPlay: true,
                      style: styles.qrStudentCamera as any,
                    })
                  ) : (
                    <BarCodeScanner
                      onBarCodeScanned={qrScanLocked ? undefined : handleQrScanned}
                      barCodeTypes={getQrBarCodeTypes()}
                      style={styles.qrStudentCamera}
                    />
                  )}
                  <View style={styles.qrStudentScannerFrame} />
                </View>

                <Text style={styles.qrStudentScannerHint}>
                  {qrScannerMessage || "Place le QR code trouvé dans le cadre."}
                </Text>
              </View>
            </View>
          </Modal>

          <Modal transparent visible={confirmChronometreVisible} animationType="fade">
            <View style={styles.modalBg}>
              <View style={styles.logoutModalBox}>
                <Text style={styles.logoutModalTitle}>Chronomètre</Text>
                <Text style={styles.logoutModalText}>
                  Souhaitez-vous lancer le chronomètre pour le parcours "{parcoursNom}" ?
                </Text>

                <View style={styles.modalActions}>
                  <Pressable style={styles.cancelBtn} onPress={() => setConfirmChronometreVisible(false)}>
                    <Text style={styles.cancelText}>Non</Text>
                  </Pressable>

                  <Pressable style={styles.confirmChronoBtn} onPress={startChronometreFlow}>
                    {chronometreSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Oui</Text>}
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

          <Modal transparent visible={!!chronometreCountdown} animationType="fade">
            <View style={styles.countdownOverlay}>
              <Text style={styles.countdownText}>{chronometreCountdown}</Text>
            </View>
          </Modal>

          <Modal transparent visible={!!errorReviewUntilMs || attemptsExhaustedFinal} animationType="fade">
            <View style={styles.errorReviewOverlay}>
              <View style={styles.errorReviewCard}>
                <Text style={styles.errorReviewTitle}>Résultats de la tentative</Text>
                <View style={styles.errorReviewGrid}>
                  {balises.map((balise) => {
                    const key = balise.instanceKey;
                    const ok = resultats[key] === true;

                    return (
                      <View
                        key={key}
                        style={[
                          styles.errorReviewBadge,
                          ok ? styles.errorReviewBadgeOk : styles.errorReviewBadgeKo,
                        ]}
                      >
                        <Text style={styles.errorReviewBadgeText}>{balise.ordre}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={styles.errorReviewFooter}>
                {attemptsExhaustedFinal ? (
                  <>
                    <Text style={styles.errorReviewFooterText}>
                      Vous avez utilisé toutes vos tentatives pour ce parcours.
                    </Text>
                    <Text style={styles.errorReviewFinalTimeLabel}>Temps final</Text>
                    <Text style={styles.errorReviewFinalTimeValue}>
                      {exhaustedFinalTimeLabel}
                    </Text>
                    {!!evaluationNoteLabel || !!evaluationUnavailableLabel ? (
                      <View style={styles.evaluationNoteBox}>
                        <Text style={styles.evaluationNoteLabel}>Note</Text>
                        <Text style={[
                          styles.evaluationNoteValue,
                          !evaluationNoteLabel && styles.evaluationNoteUnavailableValue,
                        ]}>
                          {evaluationNoteLabel || evaluationUnavailableLabel}
                        </Text>
                      </View>
                    ) : null}
                    <Pressable style={styles.errorReviewExitBtn} onPress={handleRetour}>
                      <Feather name="arrow-left" size={18} color="#FFFFFF" />
                      <Text style={styles.errorReviewExitBtnText}>Quitter</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={styles.errorReviewFooterText}>
                      Le chronomètre va redémarrer dans {errorReviewLabel} secondes.
                    </Text>
                    <Text style={styles.errorReviewFooterSub}>
                      La session va être déconnectée automatiquement.
                    </Text>
                  </>
                )}
              </View>
            </View>
          </Modal>

          <Modal visible={scoreModalVisible} transparent animationType="fade" onRequestClose={() => setScoreModalVisible(false)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Détail des points</Text>
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setScoreModalVisible(false)} style={styles.modalCloseBtn}>
                    <Feather name="x" size={18} color="#fff" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={styles.scoreHeroCard}>
                    <Text style={styles.scoreHeroLabel}>Total actuel</Text>
                    <Text style={styles.scoreHeroValue}>{formatPointsLabel(savedPointsTotal)}</Text>
                  </View>

                  <View style={styles.scoreTable}>
                    <View style={styles.scoreTableHeader}>
                      <Text style={[styles.scoreTh, { flex: 1.5 }]}>Source</Text>
                      <Text style={[styles.scoreTh, { flex: 1 }]}>Points</Text>
                      <Text style={[styles.scoreTh, { flex: 1 }]}>État</Text>
                    </View>

                    <View style={styles.scoreTrBlue}>
                      <Text style={[styles.scoreTdName, { flex: 1.5 }]}>Balises</Text>
                      <Text style={[styles.scoreTdValue, { flex: 1 }]}>{formatPointsLabel(liveScore.balisesPoints)}</Text>
                      <Text style={[styles.scoreTdStatus, { flex: 1 }]}>{validatedBaliseIds.length}/{balises.length}</Text>
                    </View>

                    <View style={styles.scoreTrGreen}>
                      <Text style={[styles.scoreTdName, { flex: 1.5 }]}>Parcours terminé</Text>
                      <Text style={[styles.scoreTdValue, { flex: 1 }]}>{formatPointsLabel(liveScore.parcoursPoints)}</Text>
                      <Text style={[styles.scoreTdStatus, { flex: 1 }]}>{isCompletedEffective ? "Terminé" : "En cours"}</Text>
                    </View>

                    <View style={styles.scoreTrGold}>
                      <Text style={[styles.scoreTdName, { flex: 1.5 }]}>Tentatives</Text>
                      <Text style={[styles.scoreTdValue, { flex: 1 }]}>{formatPointsLabel(liveScore.tentativesPoints)}</Text>
                      <Text style={[styles.scoreTdStatus, { flex: 1 }]}>{tentativesCount}</Text>
                    </View>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>
        </LinearGradient>
      </ImageBackground>
    </SafeAreaView>
  );
};

export default EcrireCodeBaliseEleve;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#061827" },
  bg: { flex: 1 },
  container: { flex: 1, overflow: "hidden" },
  mainScroll: { flex: 1 },
  headerZone: { zIndex: 20 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 14 : 8,
    paddingBottom: 12,
    backgroundColor: "rgba(8,30,48,0.76)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.18)",
  },
  topBarCompact: {
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: Platform.OS === "android" ? 8 : 5,
    paddingBottom: 6,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  iconBtnCompact: {
    width: 34,
    height: 34,
    borderRadius: 12,
  },
  topBarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topBarActionsCompact: {
    gap: 6,
  },
  chronoBtn: {
    minWidth: 104,
    height: 42,
    borderRadius: 15,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: C_GREEN,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.45)",
    shadowColor: C_GREEN,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  chronoBtnCompact: {
    minWidth: 34,
    width: 34,
    height: 34,
    borderRadius: 12,
    paddingHorizontal: 0,
    borderWidth: 1,
  },
  chronoBtnRunning: {
    backgroundColor: "#2563EB",
    shadowColor: "#2563EB",
  },
  chronoBtnPaused: {
    backgroundColor: C_ORANGE,
    shadowColor: C_ORANGE,
  },
  chronoBtnFinished: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#FFFFFF",
  },
  chronoBtnDisabled: {
    opacity: 0.82,
  },
  chronoBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "900",
  },
  chronoBtnTextFinished: {
    color: "#0F172A",
  },
  logoutBtn: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C_RED_FLASH,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.45)",
    shadowColor: C_RED_FLASH,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  logoutBtnCompact: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
  },
  pageTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 18,
    lineHeight: 21,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  pageTitleCompact: {
    fontSize: 14,
    lineHeight: 17,
  },

  stickyStatsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(8,30,48,0.58)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.14)",
    zIndex: 20,
  },
  stickyStatsBarCompact: {
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statBox: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.48)",
    borderRadius: 15,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  statBoxCompact: {
    minHeight: 38,
    borderRadius: 13,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  statValue: {
    color: C_BLUE_DARK,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  statValueCompact: {
    fontSize: 12,
    lineHeight: 14,
  },
  statLabel: {
    color: C_MUTED,
    fontSize: 9,
    marginTop: 1,
    fontWeight: "800",
    textAlign: "center",
  },
  statLabelCompact: {
    fontSize: 8,
    lineHeight: 9,
    marginTop: 1,
  },
  bigScorePillTop2: {
    width: 76,
    height: 42,
    borderRadius: 15,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FBBF24",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.55)",
    shadowColor: "#F59E0B",
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  bigScorePillTop2Compact: {
    width: 68,
    height: 38,
    borderRadius: 13,
    paddingHorizontal: 6,
    borderWidth: 1,
  },
  bigScoreValue: {
    color: "#78350F",
    fontSize: 12,
    fontWeight: "900",
    lineHeight: 17,
  },
  bigScoreValueCompact: {
    fontSize: 12,
    lineHeight: 14,
  },
  bigScoreLabel: {
    color: "#92400E",
    fontSize: 8,
    fontWeight: "900",
    lineHeight: 12,
  },
  bigScoreLabelCompact: {
    fontSize: 8,
    lineHeight: 9,
  },

  baliseLine: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.58)",
    borderRadius: 22,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    overflow: "hidden",
  },
  baliseLineActive: {
    borderColor: "rgba(56,189,248,0.95)",
    shadowColor: "#38BDF8",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  baliseLineOk: {
    borderColor: "rgba(34,197,94,0.72)",
    backgroundColor: "rgba(236,253,245,0.96)",
  },
  baliseLineKo: {
    borderColor: "rgba(239,68,68,0.72)",
    backgroundColor: "rgba(254,242,242,0.96)",
  },
  baliseLineTouchable: {
    minHeight: 76,
    paddingVertical: 9,
    paddingLeft: 10,
    paddingRight: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  baliseNumberBlock: {
    width: 76,
    minHeight: 68,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(31,117,184,0.18)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    overflow: "hidden",
  },
  baliseNumberBlockActive: {
    borderColor: "#38BDF8",
  },
  baliseNumberLabel: {
    color: C_MUTED,
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
    letterSpacing: 0.5,
  },
  baliseNumberLabelActive: {
    color: "rgba(255,255,255,0.88)",
  },
  baliseNumber: {
    color: C_BLUE_DARK,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 26,
  },
  baliseNumberActive: {
    color: "#FFFFFF",
  },
  pointsLeftText: {
    marginTop: 2,
    color: "#92400E",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
  },
  pointsLeftTextActive: {
    color: "#FFE8B0",
  },

  baliseInputZone: {
    flex: 1,
    minWidth: 0,
    minHeight: 68,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  codeBoxesWrap: {
    position: "relative",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  tableauStudentTargetPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 30,
    borderRadius: 999,
    backgroundColor: "#E0F2FE",
    borderWidth: 1,
    borderColor: "rgba(14,165,233,0.32)",
    paddingHorizontal: 10,
    marginRight: 2,
  },
  tableauStudentTargetText: {
    color: "#0F5E8C",
    fontWeight: "900",
    fontSize: 13,
  },
  tableauStudentMissingText: {
    width: "100%",
    color: C_RED,
    fontWeight: "800",
    fontSize: 12,
    marginBottom: 4,
  },
  hiddenInput: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    minWidth: "100%",
    minHeight: "100%",
    opacity: 0.02,
    color: "transparent",
    backgroundColor: "transparent",
    padding: 0,
    margin: 0,
    borderWidth: 0,
    zIndex: 10,
  },
  codeBoxFake: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 2,
    borderColor: "rgba(31,91,134,0.28)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  codeBoxFakeText: {
    color: C_TEXT,
    textAlign: "center",
    fontWeight: "900",
    fontFamily: READABLE_CODE_FONT,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.4,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  codeBoxActive: {
    borderColor: "#38BDF8",
    backgroundColor: "#E0F2FE",
  },
  codeBoxOk: {
    borderColor: "rgba(22,163,74,0.70)",
    backgroundColor: "#DCFCE7",
  },
  codeBoxKo: {
    borderColor: "rgba(220,38,38,0.70)",
    backgroundColor: "#FEE2E2",
  },
  codeBoxValidated: {
    borderColor: "rgba(22,163,74,0.70)",
    backgroundColor: "#DCFCE7",
  },
  codeBoxTextOk: {
    color: "#14532D",
  },
  codeBoxTextKo: {
    color: "#7F1D1D",
  },

  qrStudentWrap: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(31,91,134,0.12)",
    backgroundColor: "rgba(255,255,255,0.42)",
    paddingHorizontal: 8,
    paddingVertical: 7,
    justifyContent: "center",
  },
  qrStudentWrapActive: {
    borderColor: "#38BDF8",
    backgroundColor: "rgba(224,242,254,0.78)",
  },
  qrStudentWrapOk: {
    borderColor: "rgba(22,163,74,0.70)",
    backgroundColor: "rgba(220,252,231,0.78)",
  },
  qrStudentWrapKo: {
    borderColor: "rgba(220,38,38,0.70)",
    backgroundColor: "rgba(254,226,226,0.78)",
  },
  qrStudentWrapValidated: {
    borderColor: "rgba(22,163,74,0.70)",
  },
  qrStudentScanBtn: {
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  qrStudentScanBtnDisabled: {
    opacity: 0.68,
  },
  qrStudentScanText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  qrStudentMissingText: {
    color: C_RED,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 5,
  },

  poinconStudentWrap: {
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(31,91,134,0.12)",
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  poinconStudentWrapActive: {
    borderColor: "#38BDF8",
    backgroundColor: "rgba(224,242,254,0.75)",
  },
  poinconStudentWrapOk: {
    borderColor: "rgba(22,163,74,0.70)",
    backgroundColor: "rgba(220,252,231,0.78)",
  },
  poinconStudentWrapKo: {
    borderColor: "rgba(220,38,38,0.70)",
    backgroundColor: "rgba(254,226,226,0.78)",
  },
  poinconStudentRow: {
    flexDirection: "row",
    gap: 6,
  },
  poinconStudentCell: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 2,
    borderColor: "rgba(31,91,134,0.28)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  poinconStudentCellActive: {
    backgroundColor: "#E0F2FE",
    borderColor: "#38BDF8",
  },
  poinconStudentCellOk: {
    backgroundColor: "#DCFCE7",
    borderColor: "rgba(22,163,74,0.70)",
  },
  poinconStudentCellKo: {
    backgroundColor: "#FEE2E2",
    borderColor: "rgba(220,38,38,0.70)",
  },
  poinconStudentCellValidated: {
    backgroundColor: "#DCFCE7",
    borderColor: "rgba(22,163,74,0.70)",
  },
  poinconDot: {
    width: 11,
    height: 11,
    borderRadius: 999,
    backgroundColor: "#111827",
  },
  poinconCheck: {
    position: "absolute",
    color: "#14532D",
    fontSize: 18,
    fontWeight: "900",
  },

  poinconSingleZone: {
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-start",
    position: "relative",
  },
  poinconHorizontalList: {
    flexGrow: 0,
    overflow: "visible",
  },
  poinconHorizontalContent: {
    alignItems: "flex-start",
  },
  poinconArrow: {
    position: "absolute",
    top: "50%",
    marginTop: -28,
    width: 48,
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(31,91,134,0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  poinconArrowLeft: { left: 4 },
  poinconArrowRight: { right: 4 },
  bigPoinconCardOuter: {
    flexShrink: 0,
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  bigPoinconCard: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderWidth: 2,
    borderColor: "rgba(56,189,248,0.62)",
    borderRadius: 22,
    paddingHorizontal: 8,
    paddingTop: 7,
    paddingBottom: 7,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  bigPoinconCardActive: {
    borderColor: "#38BDF8",
    shadowColor: "#38BDF8",
    shadowOpacity: 0.34,
  },
  bigPoinconCardOk: {
    borderColor: "rgba(22,163,74,0.78)",
    backgroundColor: "rgba(236,253,245,0.96)",
  },
  bigPoinconCardKo: {
    borderColor: "rgba(220,38,38,0.78)",
    backgroundColor: "rgba(254,242,242,0.96)",
  },
  bigCodeEntryWrap: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 22,
  },
  bigPoinconHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 2,
  },
  bigPoinconHeaderArrow: {
    width: 40,
    height: 42,
    borderRadius: 15,
    backgroundColor: "rgba(31,91,134,0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  bigPoinconHeaderArrowSpacer: {
    width: 40,
    height: 42,
  },
  bigPoinconCenterHead: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bigPoinconBadge: {
    width: 62,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#E0F2FE",
    borderWidth: 1,
    borderColor: "rgba(31,91,134,0.16)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  bigPoinconBadgeActive: { backgroundColor: C_BLUE_DARK, borderColor: "#38BDF8" },
  bigPoinconBadgeLabel: { color: C_MUTED, fontSize: 9, fontWeight: "900", letterSpacing: 0.4 },
  bigPoinconBadgeLabelActive: { color: "rgba(255,255,255,0.86)" },
  bigPoinconBadgeNumber: { color: C_BLUE_DARK, fontSize: 21, fontWeight: "900", lineHeight: 24 },
  bigPoinconBadgeNumberActive: { color: "#fff" },
  bigPoinconPointsUnder: {
    marginTop: 2,
    color: "#92400E",
    fontSize: 10,
    fontWeight: "900",
    textAlign: "center",
  },
  bigPoinconGridWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    paddingTop: 0,
    paddingBottom: 0,
  },
  bigPoinconRow: { flexDirection: "row" },
  bigPoinconCell: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 2,
    borderColor: "rgba(31,91,134,0.26)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  bigPoinconCellActive: { backgroundColor: "#DBEAFE", borderColor: "#1D4ED8" },
  bigPoinconCellOk: { backgroundColor: "#DCFCE7", borderColor: "rgba(22,163,74,0.72)" },
  bigPoinconCellKo: { backgroundColor: "#FEE2E2", borderColor: "rgba(220,38,38,0.72)" },
  bigPoinconCellValidated: { backgroundColor: "#DCFCE7", borderColor: "rgba(22,163,74,0.72)" },
  bigPoinconDot: { borderRadius: 999, backgroundColor: "#111827" },
  bigPoinconCheck: { position: "absolute", color: "#14532D", fontSize: 28, fontWeight: "900" },
  bigPoinconFooterStatus: { marginTop: 6, minHeight: 18, alignItems: "center" },
  poinconMissingBox: {
    marginTop: 6,
    marginBottom: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.35)",
    backgroundColor: "rgba(254,226,226,0.85)",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  poinconMissingTitle: {
    color: "#7F1D1D",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },
  poinconMissingText: {
    marginTop: 2,
    color: "#991B1B",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    textAlign: "center",
  },

  baliseMetaRow: {
    marginTop: 5,
    minHeight: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  okText: {
    flex: 1,
    color: C_GREEN,
    fontWeight: "900",
    fontSize: 12,
  },
  koText: {
    flex: 1,
    color: C_RED,
    fontWeight: "900",
    fontSize: 12,
  },

  stateCard: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.58)",
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  stateTitle: {
    color: C_TEXT,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 10,
    textAlign: "center",
  },
  stateText: {
    color: C_MUTED,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
    fontWeight: "700",
  },

  bottomBar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    zIndex: 30,
  },
  bottomBarCompact: {
    left: 12,
    right: 12,
    bottom: 10,
  },
  verifyAllBtn: {
    minHeight: 56,
    borderRadius: 20,
    backgroundColor: "#1F75B8",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  verifyAllBtnCompact: {
    minHeight: 46,
    borderRadius: 17,
    gap: 8,
  },
  verifyBelowPoinconWrap: {
    marginTop: 8,
    paddingHorizontal: 8,
    alignSelf: "center",
  },
  verifyAllBtnBelowPoincon: {
    minHeight: 44,
    borderRadius: 16,
    alignSelf: "stretch",
  },
  verifyAllBtnDone: {
    backgroundColor: C_GREEN,
  },
  verifyAllBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
  },
  verifyAllBtnTextCompact: {
    fontSize: 14,
  },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(15,37,58,0.62)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  logoutModalBox: {
    width: "88%",
    maxWidth: 420,
    padding: 20,
    borderRadius: 24,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  logoutModalTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 8,
  },
  logoutModalText: {
    color: "#E5E7EB",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    fontWeight: "700",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    padding: 13,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  confirmLogoutBtn: {
    flex: 1,
    padding: 13,
    alignItems: "center",
    backgroundColor: C_RED_FLASH,
    borderRadius: 12,
  },
  confirmChronoBtn: {
    flex: 1,
    padding: 13,
    alignItems: "center",
    backgroundColor: C_GREEN,
    borderRadius: 12,
  },
  cancelText: {
    color: "#D1D5DB",
    fontWeight: "900",
  },
  confirmText: {
    color: "#fff",
    fontWeight: "900",
  },

  qrStudentScannerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.84)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  qrStudentScannerPanel: {
    width: "100%",
    maxWidth: 430,
    borderRadius: 22,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.18)",
    padding: 14,
    gap: 12,
  },
  qrStudentScannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  qrStudentScannerTitle: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "900",
  },
  qrStudentScannerClose: {
    width: 36,
    height: 36,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  qrStudentCameraWrap: {
    height: 330,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
  },
  qrStudentCamera: {
    ...StyleSheet.absoluteFillObject,
  },
  qrStudentScannerFrame: {
    width: 220,
    height: 220,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: "#38BDF8",
    backgroundColor: "transparent",
  },
  qrStudentScannerHint: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
  },

  appMessageOverlay: {
    flex: 1,
    backgroundColor: "rgba(6,24,39,0.70)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  appMessageCard: {
    width: "100%",
    maxWidth: 430,
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.68)",
    alignItems: "center",
  },
  appMessageIcon: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C_BLUE_DARK,
    marginBottom: 12,
  },
  appMessageIconSuccess: {
    backgroundColor: C_GREEN,
  },
  appMessageIconWarning: {
    backgroundColor: C_ORANGE,
  },
  appMessageIconError: {
    backgroundColor: C_RED_FLASH,
  },
  appMessageTitle: {
    color: C_TEXT,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    textAlign: "center",
  },
  appMessageText: {
    color: C_MUTED,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 18,
  },
  appMessageBtn: {
    minWidth: 140,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C_BLUE_DARK,
    paddingHorizontal: 18,
  },
  appMessageBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  verifyModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(6,24,39,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  verifyModalCard: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.65)",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  verifyModalIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C_BLUE_DARK,
    marginBottom: 12,
  },
  verifyModalTitle: {
    color: C_TEXT,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
    textAlign: "center",
  },
  verifyModalTimerBox: {
    marginTop: 14,
    marginBottom: 12,
    minWidth: 190,
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "rgba(31,91,134,0.18)",
    alignItems: "center",
  },
  verifyModalTimerLabel: {
    color: C_MUTED,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  verifyModalTimerValue: {
    color: "#0F172A",
    fontSize: 42,
    lineHeight: 48,
    fontWeight: "900",
    marginTop: 2,
  },
  verifyModalText: {
    color: C_MUTED,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 18,
  },
  verifyModalActions: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
  },
  verifyCancelBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.08)",
  },
  verifyConfirmBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C_BLUE_DARK,
  },
  verifyCancelText: {
    color: C_TEXT,
    fontSize: 14,
    fontWeight: "900",
  },
  verifyConfirmText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },

  evaluationChronoGate: {
    minHeight: 520,
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 34,
    paddingHorizontal: 18,
  },
  evaluationChronoGateIcon: {
    width: 78,
    height: 78,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34,197,94,0.94)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.72)",
    shadowColor: "#0F172A",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  evaluationChronoGateTitle: {
    marginTop: 18,
    color: "#FFFFFF",
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: "rgba(6,24,39,0.55)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  evaluationChronoGateValue: {
    marginTop: 16,
    color: "#FFFFFF",
    fontSize: 96,
    lineHeight: 110,
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: "rgba(6,24,39,0.62)",
    textShadowOffset: { width: 0, height: 5 },
    textShadowRadius: 18,
  },
  evaluationChronoGateButton: {
    marginTop: 22,
    minHeight: 62,
    minWidth: 210,
    borderRadius: 22,
    paddingHorizontal: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: C_GREEN,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.72)",
    shadowColor: "#0F172A",
    shadowOpacity: 0.24,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  evaluationChronoGateButtonDisabled: {
    opacity: 0.72,
  },
  evaluationChronoGateButtonText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },

  countdownOverlay: {
    flex: 1,
    backgroundColor: "rgba(6,24,39,0.82)",
    alignItems: "center",
    justifyContent: "center",
  },
  countdownText: {
    color: "#FFFFFF",
    fontSize: 86,
    lineHeight: 98,
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: "rgba(34,197,94,0.65)",
    textShadowOffset: { width: 0, height: 5 },
    textShadowRadius: 18,
  },

  errorReviewOverlay: {
    flex: 1,
    backgroundColor: "rgba(6,24,39,0.86)",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 42,
    paddingBottom: 32,
  },
  errorReviewCard: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.96)",
    padding: 16,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.58)",
  },
  errorReviewTitle: {
    color: C_TEXT,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 14,
  },
  errorReviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  errorReviewBadge: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.65)",
  },
  errorReviewBadgeOk: {
    backgroundColor: C_GREEN,
  },
  errorReviewBadgeKo: {
    backgroundColor: C_RED_FLASH,
  },
  errorReviewBadgeText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  errorReviewFooter: {
    marginTop: 16,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  errorReviewFooterText: {
    color: C_RED,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    textAlign: "center",
  },
  errorReviewFooterSub: {
    marginTop: 6,
    color: C_MUTED,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
    textAlign: "center",
  },
  errorReviewFinalTimeLabel: {
    marginTop: 14,
    color: C_MUTED,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "uppercase",
  },
  errorReviewFinalTimeValue: {
    marginTop: 3,
    color: "#0F172A",
    fontSize: 36,
    lineHeight: 42,
    fontWeight: "900",
    textAlign: "center",
  },
  evaluationNoteBox: {
    alignSelf: "center",
    marginTop: 14,
    borderRadius: 18,
    backgroundColor: "#DBEAFE",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.28)",
    paddingVertical: 10,
    paddingHorizontal: 24,
    minWidth: 170,
    alignItems: "center",
  },
  evaluationNoteLabel: {
    color: "#1D4ED8",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  evaluationNoteValue: {
    marginTop: 2,
    color: "#0F172A",
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
  },
  evaluationNoteUnavailableValue: {
    maxWidth: 230,
    color: C_RED,
    fontSize: 14,
    lineHeight: 19,
    textAlign: "center",
  },
  errorReviewExitBtn: {
    alignSelf: "center",
    marginTop: 14,
    minHeight: 46,
    minWidth: 150,
    borderRadius: 16,
    paddingHorizontal: 18,
    backgroundColor: "#0F172A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  errorReviewExitBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,37,58,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "85%",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.58)",
    padding: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  modalTitle: {
    flex: 1,
    color: C_TEXT,
    fontSize: 18,
    fontWeight: "900",
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C_BLUE_DARK,
  },

  scoreHeroCard: {
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.28)",
    alignItems: "center",
    marginBottom: 12,
  },
  scoreHeroLabel: {
    color: "#92400E",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  scoreHeroValue: {
    color: "#78350F",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 4,
  },
  scoreTable: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C_BORDER,
    marginBottom: 12,
  },
  scoreTableHeader: {
    flexDirection: "row",
    backgroundColor: C_BLUE_DARK,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  scoreTh: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  scoreTrBlue: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderTopWidth: 1,
    borderTopColor: "rgba(31,91,134,0.10)",
  },
  scoreTrGreen: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 8,
    backgroundColor: "#F0FDF4",
    borderTopWidth: 1,
    borderTopColor: "rgba(31,91,134,0.10)",
  },
  scoreTrGold: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 8,
    backgroundColor: "#FFFBEB",
    borderTopWidth: 1,
    borderTopColor: "rgba(31,91,134,0.10)",
  },
  scoreTdName: {
    color: C_TEXT,
    fontSize: 13,
    fontWeight: "900",
  },
  scoreTdValue: {
    color: C_BLUE_DARK,
    fontSize: 13,
    fontWeight: "900",
  },
  scoreTdStatus: {
    color: C_MUTED,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "right",
  },
});
