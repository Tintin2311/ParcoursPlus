import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
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

type SetPageFn = (page: any) => void;

type EleveConnecte = {
  id?: string;
  uuid?: string;
  code?: string;
  teacher_id?: string | null;
  group_id?: string | null;
  display_name?: string | null;
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
  format_type?: ParcoursFormatType | null;
  user_id?: string | null;
  professeur_id?: string | null;
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

type BaliseAffichee = BaliseRow & {
  ordre: number;
  instanceKey: string;
  originalBaliseId: string;
  tokenSource: string;
  poinconFormat?: PoinconFormat | null;
  poinconFormatMissing?: boolean;
};

type Props = {
  setPage: SetPageFn;
  eleveConnecte?: EleveConnecte | null;
  parcoursActif?: ParcoursActif | null;
  handleDeconnexion?: () => Promise<void> | void;
};

const BG_GAME =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/AccueilElevePaysage.png";

const C_TEXT = "#12304A";
const C_MUTED = "#5D7288";
const C_BORDER = "rgba(31,91,134,0.14)";
const C_BLUE_DARK = "#1F5B86";
const C_GOLD = "#F59E0B";
const C_GREEN = "#16A34A";
const C_RED = "#DC2626";
const C_RED_FLASH = "#FF1F1F";

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

const emptyPoincon = (rows: number, cols: number): PoinconCell =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));

const DEFAULT_POINCON_FORMAT: PoinconFormat = {
  rows: 4,
  cols: 4,
  cells: emptyPoincon(4, 4),
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
    if (!t) return;

    let balise: BaliseRow | undefined;

    if (isUuidLike(t)) balise = byId.get(t);
    if (!balise && isIntegerLike(t)) balise = byNumero.get(String(Number(t)));
    if (!balise) balise = byCode.get(sanitize(t));

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
      ordre: results.length + 1,
      poinconFormat: null,
      poinconFormatMissing: false,
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

  const pointsParParcours = getNumberFromRow(
    bestRow,
    ["points_par_parcours", "pointsParParcours"],
    baseConfig.pointsParParcours
  );

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

  const modes = {
    balises: rowModes.balises || baseConfig.modes.balises,
    parcours: rowModes.parcours || baseConfig.modes.parcours || pointsParParcours > 0,
    tentatives: rowModes.tentatives || baseConfig.modes.tentatives,
  };

  if (!modes.balises && !modes.parcours && !modes.tentatives) {
    modes.balises = true;
  }

  return {
    ...baseConfig,
    modes,
    pointsParParcours,
    pointsParBalise,
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

const loadPoinconFormatsForBalises = async (ids: string[]): Promise<BaliseFormatRow[]> => {
  if (!ids.length) return [];

  const cleanIds = Array.from(
    new Set(ids.map((id) => String(id ?? "").trim()).filter(Boolean))
  );

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

      console.log(`🧩 RPC ${rpcName} résultat`, {
        idsDemandes: cleanIds,
        lignesBrutes: data,
        lignesNormalisees: normalized,
      });

      if (normalized.length > 0) return normalized;
    } catch (e) {
      console.warn(`❌ RPC ${rpcName} exception:`, e);
    }
  }

  try {
    const { data, error } = await supabase
      .from("balise_formats")
      .select("id, balise_id, user_id, format_type, payload")
      .in("balise_id", cleanIds)
      .eq("format_type", "poincon");

    if (error) {
      console.warn("❌ Lecture directe balise_formats impossible:", error);
      return [];
    }

    const normalized = normalizeRpcPoinconRows(data);

    console.log("🧩 Lecture directe balise_formats résultat", {
      idsDemandes: cleanIds,
      lignesBrutes: data,
      lignesNormalisees: normalized,
    });

    return normalized;
  } catch (e) {
    console.warn("❌ Lecture directe balise_formats exception:", e);
    return [];
  }
};

const EcrireCodeBaliseEleve: React.FC<Props> = ({
  setPage,
  eleveConnecte,
  parcoursActif,
  handleDeconnexion,
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
  const autoFocusLockRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  const [confirmLogoutVisible, setConfirmLogoutVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [studentId, setStudentId] = useState<string | null>(eleveConnecte?.id ?? null);
  const [studentGroupId, setStudentGroupId] = useState<string | null>(eleveConnecte?.group_id ?? null);

  const [balises, setBalises] = useState<BaliseAffichee[]>([]);
  const [activeBaliseKey, setActiveBaliseKey] = useState<string | null>(null);
  const [attemptsHistory, setAttemptsHistory] = useState<TentativeRow[]>([]);
  const [validatedBaliseIds, setValidatedBaliseIds] = useState<string[]>([]);
  const [completionAttemptNumber, setCompletionAttemptNumber] = useState<number | null>(null);

  const [codesSaisis, setCodesSaisis] = useState<Record<string, string>>({});
  const [poinconsSaisis, setPoinconsSaisis] = useState<Record<string, PoinconCell>>({});
  const [resultats, setResultats] = useState<Record<string, boolean | null>>({});
  const [inputSelections, setInputSelections] = useState<Record<string, { start: number; end: number }>>({});

  const [savedScore, setSavedScore] = useState(0);
  const [tentativesCount, setTentativesCount] = useState(0);
  const [savedPointsTotal, setSavedPointsTotal] = useState(0);
  const [lastPointsGain, setLastPointsGain] = useState(0);
  const [parcoursTermineDb, setParcoursTermineDb] = useState(false);

  const [pointsConfig, setPointsConfig] = useState<ParcoursPointsConfig>(getDefaultPointsConfig());
  const [tentativeBaremeRows, setTentativeBaremeRows] = useState<ParcoursBaremeTentativeRow[]>([]);
  const [resolvedTentativePage, setResolvedTentativePage] = useState<number | null>(null);
  const [resolvedTentativeGroupId, setResolvedTentativeGroupId] = useState<string | null>(null);
  const [resolvedProfesseurId, setResolvedProfesseurId] = useState<string | null>(null);
  const [supportParcoursId, setSupportParcoursId] = useState<string | null>(null);

  const [scoreModalVisible, setScoreModalVisible] = useState(false);
  const [activePoinconIndex, setActivePoinconIndex] = useState(0);

  const parcoursNom = useMemo(() => getDisplayName(parcoursActif), [parcoursActif]);
  const validatedSet = useMemo(() => new Set(validatedBaliseIds), [validatedBaliseIds]);

  const isCompleted = balises.length > 0 && validatedBaliseIds.length >= balises.length;
  const isCompletedEffective = isCompleted || parcoursTermineDb;

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
    () => balises.length > 0 && balises.every((b) => !!b.poinconFormat),
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

  const scrollBaliseIntoComfortZone = useCallback(
    (baliseKey: string, animated = true) => {
      const rowY = rowYRefs.current[baliseKey];
      if (typeof rowY !== "number") return;

      const rowHeight = rowHeightRefs.current[baliseKey] ?? 86;
      const viewportHeight = scrollViewHeightRef.current || height;
      const currentY = scrollYRef.current || 0;

      const topComfort = 12;
      const bottomComfort = Platform.OS === "web" ? 128 : 190;

      const visibleTop = currentY + topComfort;
      const visibleBottom = currentY + viewportHeight - bottomComfort;
      const rowBottom = rowY + rowHeight;

      let targetY: number | null = null;

      if (rowY < visibleTop) {
        targetY = Math.max(0, rowY - topComfort);
      } else if (rowBottom > visibleBottom) {
        targetY = Math.max(0, rowBottom - viewportHeight + bottomComfort);
      }

      if (targetY == null) return;

      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: targetY, animated });
      });
    },
    [height]
  );

  const focusBalise = useCallback(
    (balise: BaliseAffichee, forceSelectAll = false, shouldScroll = false) => {
      const key = balise.instanceKey;

      setActiveBaliseKey(key);

      if (balise.poinconFormat) {
        if (shouldScroll) scrollBaliseIntoComfortZone(key, true);
        Keyboard.dismiss();
        return;
      }

      const expectedLength = getExpectedLength(balise);
      const currentValue = codesSaisis[key] ?? "";

      setSelectionForBalise(key, currentValue, expectedLength, forceSelectAll);

      if (shouldScroll) {
        scrollBaliseIntoComfortZone(key, true);
      }

      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => {
        inputRefs.current[key]?.focus?.();
      }, Platform.OS === "web" ? 20 : 70);
    },
    [codesSaisis, getExpectedLength, scrollBaliseIntoComfortZone, setSelectionForBalise]
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
    };
  }, []);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;

    try {
      setLoggingOut(true);
      Keyboard.dismiss();
      setConfirmLogoutVisible(false);

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
  }, [handleDeconnexion, loggingOut, setPage]);

  const resolveStudent = useCallback(async () => {
    let nextStudentId = eleveConnecte?.id ?? null;
    let nextGroupId = eleveConnecte?.group_id ?? null;

    if ((!nextStudentId || !nextGroupId) && eleveConnecte?.code) {
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
  }, [eleveConnecte?.code, eleveConnecte?.group_id, eleveConnecte?.id]);

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
            ? fixedPointsConfig.tentativePageAssignments[resolvedParcoursId] ?? null
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

      const [attempts, dbTermine] = await Promise.all([
        loadAttemptsHistory(resolvedStudentId, resolvedParcoursId),
        loadStatParcoursTermine(resolvedStudentId, resolvedParcoursId),
      ]);

      const effectiveTermine =
        dbTermine ||
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
      setParcoursTermineDb(effectiveTermine);

      setPointsConfig(fixedPointsConfig);
      setResolvedTentativePage(fixedAttemptPage);
      setResolvedTentativeGroupId(baseResolvedConfig.resolvedGroupId);
      setResolvedProfesseurId(baseResolvedConfig.resolvedProfesseurId);
      setSupportParcoursId(baseResolvedConfig.supportParcoursId);
      setTentativeBaremeRows(baremes);
    },
    [forceParcoursBonusIfNeeded]
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
    setResolvedTentativeGroupId(null);
    setResolvedProfesseurId(null);
    setSupportParcoursId(null);
    setCodesSaisis({});
    setPoinconsSaisis({});
    setResultats({});
    setInputSelections({});
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

      const rawBalisesOrdre = parcoursDb?.balises_ordre ?? parcoursActif?.balises_ordre ?? null;
      const tokens = extractTokens(rawBalisesOrdre);

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
        const uuidTokens = Array.from(new Set(tokens.filter(isUuidLike)));
        const numeroTokens = Array.from(new Set(tokens.filter(isIntegerLike).map((t) => Number(t))));
        const codeTokensRaw = Array.from(new Set(tokens.filter((t) => !isUuidLike(t) && !isIntegerLike(t))));

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

        let formatsDataFinal: BaliseFormatRow[] = await loadPoinconFormatsForBalises(ids);

        const formatsByBaliseId = new Map<string, PoinconFormat>();

        formatsDataFinal.forEach((format) => {
          const normalized = normalizePoinconPayload(format.payload);
          if (normalized) {
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
        formatsByBaliseId.forEach((format, baliseId) => {
          formatsByCleanBaliseId.set(normalizeIdKey(baliseId), format);
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

          if (!savedPoinconFormat && poinconFormatsInOrder.length === orderedBalises.length) {
            savedPoinconFormat = poinconFormatsInOrder[index] ?? null;
          }

          const shouldUsePoincon = parcoursFormatType === "poincon" || !!savedPoinconFormat;

          return {
            ...b,
            poinconFormat: shouldUsePoincon
              ? savedPoinconFormat ?? DEFAULT_POINCON_FORMAT
              : null,
            poinconFormatMissing: shouldUsePoincon && !savedPoinconFormat,
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
    [focusNextBalise, getExpectedLength, validatedSet]
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

      const result = await saveTentativeWithStats({
        studentId,
        parcoursId: parcoursActif.id,
        balises,
        validatedIds: validatedBaliseIds,
        codesSaisis: codesForSave,
        nextResults,
        pointsConfig,
        breakdown,
        currentDisplayedTotal: savedPointsTotal,
      });

      const nextValidatedIds = Array.from(new Set([...validatedBaliseIds, ...result.newlyValidatedIds]));

      const nextCompletionAttemptNumber =
        breakdown.willComplete && completionAttemptNumber == null
          ? breakdown.tentativeNumero
          : completionAttemptNumber;

      const nextProgressRaw = await recomputeAndSyncStats({
        studentId,
        parcoursId: parcoursActif.id,
        balises,
        pointsConfig,
        tentativeBaremeRows,
      });

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
          .eq("parcours_id", parcoursActif.id);
      }

      setAttemptsHistory((prev) => [
        ...prev,
        {
          student_id: studentId,
          parcours_id: parcoursActif.id,
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
      };
    },
    [
      studentId,
      parcoursActif?.id,
      isCompleted,
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

        const saisi = sanitize(codesSaisis[key]);
        const attendu = sanitize(balise.code ?? "");
        nextResults[key] = !!saisi && !!attendu && saisi === attendu;
      });

      setResultats(nextResults);

      const {
        breakdown,
        nextSavedPointsTotal,
        nextValidatedCount,
        nextTentativesCount,
      } = await saveTentativeAndStats(nextResults);

      const lines = [
        `Balises nouvellement validées : ${breakdown.newlyValidatedCount}`,
        `Gain total : ${formatPointsLabel(breakdown.totalGain)}`,
        `Score enregistré : ${nextValidatedCount}/${balises.length}`,
        `Total : ${formatPointsLabel(nextSavedPointsTotal)}`,
        `Tentatives : ${nextTentativesCount}`,
      ];

      if (breakdown.willComplete) lines.unshift("Parcours terminé ✅");

      Alert.alert("Tentative enregistrée", lines.join("\n"));
    } catch (err: any) {
      console.error("Erreur enregistrement tentative:", err);
      Alert.alert("Erreur", err?.message || "Impossible d'enregistrer la tentative.");
    } finally {
      setSaving(false);
    }
  }, [
    balises,
    validatedSet,
    codesSaisis,
    poinconsSaisis,
    saveTentativeAndStats,
  ]);

  const handleVerifierTout = useCallback(async () => {
    if (!balises.length) return;
    if (saving) return;

    if (isCompleted) {
      Alert.alert("Parcours terminé", "Ce parcours est déjà entièrement validé.");
      return;
    }

    const missingInput = balises.some((balise) => {
      const key = balise.instanceKey;
      if (validatedSet.has(key)) return false;

      if (balise.poinconFormat) {
        const current = poinconsSaisis[key];
        return !current?.some((row) => row.some(Boolean));
      }

      const expectedLength = getExpectedLength(balise);
      return sanitize(codesSaisis[key]).length < expectedLength;
    });

    if (missingInput) {
      const message = "Vous n'avez pas rempli tous les codes des balises.";
      if (Platform.OS === "web") window.alert(message);
      else Alert.alert("Attention", message);
      return;
    }

    const message =
      "Voulez-vous vérifier toutes les balises ?\n\nCette action enregistrera une tentative.";

    if (Platform.OS === "web") {
      const confirmed = window.confirm(message);
      if (!confirmed) return;
      await runVerifierTout();
      return;
    }

    Alert.alert("Confirmation", message, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Valider",
        onPress: () => {
          runVerifierTout();
        },
      },
    ]);
  }, [
    balises,
    validatedSet,
    codesSaisis,
    poinconsSaisis,
    isCompleted,
    saving,
    runVerifierTout,
    getExpectedLength,
  ]);

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
            if (!alreadyValidated) focusBalise(item, true, false);
          }}
          style={[styles.codeBoxesWrap, { gap: boxGap }, webPanYStyle]}
        >
          <TextInput
            ref={(ref) => setInputRef(key, ref)}
            value={alreadyValidated ? "" : typedValue}
            editable={!alreadyValidated}
            maxLength={expectedLength}
            selection={selection}
            selectTextOnFocus={typedValue.length >= expectedLength}
            onFocus={() => {
              setActiveBaliseKey(key);
              setSelectionForBalise(key, typedValue, expectedLength, typedValue.length >= expectedLength);
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
      resultats,
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
            if (!alreadyValidated) {
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
                  disabled={alreadyValidated}
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
    [activeBaliseKey, isCompact, poinconsSaisis, resultats, validatedSet]
  );

  const renderBalise = useCallback(
    ({ item, index }: { item: BaliseAffichee; index: number }) => {
      const key = item.instanceKey;
      const alreadyValidated = validatedSet.has(key);
      const result = alreadyValidated ? true : resultats[key];
      const isActive = activeBaliseKey === key;

      const displayBalisePoints = pointsConfig.modes.balises
        ? Number.isFinite(Number(item.points))
          ? Number(item.points)
          : pointsConfig.pointsParBalise
        : 0;

      return (
        <View
          onLayout={(event) => {
            rowYRefs.current[key] = event.nativeEvent.layout.y;
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
              if (!alreadyValidated) focusBalise(item, true, false);
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
              {item.poinconFormat ? renderPoinconInput(item) : renderCodeBoxes(item, index)}

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
    [activeBaliseKey, focusBalise, pointsConfig, renderCodeBoxes, renderPoinconInput, resultats, validatedSet]
  );

  const renderBigPoinconBalise = useCallback(
    ({ item, index }: { item: BaliseAffichee; index: number }) => {
      const key = item.instanceKey;
      const format = item.poinconFormat ?? DEFAULT_POINCON_FORMAT;
      const alreadyValidated = validatedSet.has(key);
      const result = alreadyValidated ? true : resultats[key];
      const isActive = activeBaliseKey === key;
      const current = poinconsSaisis[key] ?? emptyPoincon(format.rows, format.cols);
      const cellSize = getPoinconBigCellSize(format);
      const isMissingSupabaseAnswer = !!item.poinconFormatMissing;
      const gridGap = width < 430 ? 6 : 9;

      const displayBalisePoints = pointsConfig.modes.balises
        ? Number.isFinite(Number(item.points))
          ? Number(item.points)
          : pointsConfig.pointsParBalise
        : 0;

      const itemCanGoPrev = index > 0;
      const itemCanGoNext = index < balises.length - 1;

      return (
        <View style={[styles.bigPoinconCardOuter, { width: poinconCardWidth }, webPanXStyle]}>
          <Pressable
            onPress={() => {
              if (!alreadyValidated) {
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

            {isMissingSupabaseAnswer ? (
              <View style={styles.poinconMissingBox}>
                <Text style={styles.poinconMissingTitle}>Réponse Supabase introuvable</Text>
                <Text style={styles.poinconMissingText}>
                  Aucun poinçon n'a été trouvé dans balise_formats pour cette balise.
                </Text>
              </View>
            ) : null}

            <View style={[styles.bigPoinconGridWrap, { gap: gridGap }]}> 
              {current.map((row, r) => (
                <View key={`${key}_big_row_${r}`} style={[styles.bigPoinconRow, { gap: gridGap }]}> 
                  {row.map((active, c) => (
                    <TouchableOpacity
                      key={`${key}_big_cell_${r}_${c}`}
                      activeOpacity={0.82}
                      disabled={alreadyValidated}
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

            {(alreadyValidated || result === false) ? (
              <View style={styles.bigPoinconFooterStatus}>
                {alreadyValidated ? <Text style={styles.okText}>Validée ✅</Text> : result === false ? <Text style={styles.koText}>Incorrect ❌</Text> : null}
              </View>
            ) : null}
          </Pressable>
        </View>
      );
    },
    [activeBaliseKey, balises.length, getPoinconBigCellSize, goToPoinconIndex, isCompact, poinconCardMinHeight, poinconCardWidth, poinconsSaisis, pointsConfig, resultats, validatedSet, width]
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
              <TouchableOpacity activeOpacity={0.9} onPress={() => setPage("EcrireResultat")} style={[styles.iconBtn, isPoinconParcours && styles.iconBtnCompact]}>
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

              <TouchableOpacity activeOpacity={0.9} onPress={() => setConfirmLogoutVisible(true)} style={[styles.logoutBtn, isPoinconParcours && styles.logoutBtnCompact]}>
                <Feather name="log-out" size={isPoinconParcours ? 17 : 19} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={[styles.stickyStatsBar, isPoinconParcours && styles.stickyStatsBarCompact]}>
              <View style={[styles.statBox, isPoinconParcours && styles.statBoxCompact, { width: statCardWidth }]}> 
                <Text style={[styles.statValue, isPoinconParcours && styles.statValueCompact]}>{savedScore}/{balises.length}</Text>
                <Text style={[styles.statLabel, isPoinconParcours && styles.statLabelCompact]}>
                  {isPoinconParcours ? "Trouvées" : "Balises trouvées"}
                </Text>
              </View>

              <View style={[styles.statBox, isPoinconParcours && styles.statBoxCompact, { width: statCardWidth }]}> 
                <Text style={[styles.statValue, isPoinconParcours && styles.statValueCompact]}>{tentativesCount}</Text>
                <Text style={[styles.statLabel, isPoinconParcours && styles.statLabelCompact]}>Tentatives</Text>
              </View>

              <TouchableOpacity activeOpacity={0.9} onPress={() => setScoreModalVisible(true)} style={[styles.bigScorePillTop2, isPoinconParcours && styles.bigScorePillTop2Compact]}>
                <Text style={[styles.bigScoreValue, isPoinconParcours && styles.bigScoreValueCompact]}>{formatPoints(savedPointsTotal)}</Text>
                <Text style={[styles.bigScoreLabel, isPoinconParcours && styles.bigScoreLabelCompact]}>{formatPointUnit(savedPointsTotal)}</Text>
              </TouchableOpacity>
            </View>
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
                      (saving || isCompleted) && { opacity: 0.7 },
                      isCompleted && styles.verifyAllBtnDone,
                    ]}
                    onPress={handleVerifierTout}
                    disabled={saving || isCompleted}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : isCompleted ? (
                      <>
                        <Feather name="award" size={17} color="#fff" />
                        <Text style={[styles.verifyAllBtnText, styles.verifyAllBtnTextCompact]}>Parcours terminé</Text>
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
                  <View key={item.instanceKey} style={webPanYStyle}>
                    {renderBalise({ item, index })}
                    {index < balises.length - 1 && <View style={{ height: 10 }} />}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {!isPoinconParcours && !loading && !screenError && !!balises.length && (
            <View style={[styles.bottomBar, isPoinconParcours && styles.bottomBarCompact]}>
              <TouchableOpacity
                activeOpacity={0.9}
                style={[
                  styles.verifyAllBtn,
                  isPoinconParcours && styles.verifyAllBtnCompact,
                  (saving || isCompleted) && { opacity: 0.7 },
                  isCompleted && styles.verifyAllBtnDone,
                ]}
                onPress={handleVerifierTout}
                disabled={saving || isCompleted}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : isCompleted ? (
                  <>
                    <Feather name="award" size={17} color="#fff" />
                    <Text style={[styles.verifyAllBtnText, isPoinconParcours && styles.verifyAllBtnTextCompact]}>Parcours terminé</Text>
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

                  <Pressable style={styles.confirmLogoutBtn} onPress={handleLogout}>
                    {loggingOut ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>Déconnexion</Text>}
                  </Pressable>
                </View>
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
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 6,
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
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  statValueCompact: {
    fontSize: 12,
    lineHeight: 14,
  },
  statLabel: {
    color: C_MUTED,
    fontSize: 10,
    marginTop: 4,
    fontWeight: "800",
    textAlign: "center",
  },
  statLabelCompact: {
    fontSize: 8,
    lineHeight: 9,
    marginTop: 1,
  },
  bigScorePillTop2: {
    width: 86,
    height: 50,
    borderRadius: 18,
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
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 17,
  },
  bigScoreValueCompact: {
    fontSize: 12,
    lineHeight: 14,
  },
  bigScoreLabel: {
    color: "#92400E",
    fontSize: 10,
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
  hiddenInput: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    opacity: 0.01,
    color: "transparent",
    backgroundColor: "transparent",
    padding: 0,
    margin: 0,
    borderWidth: 0,
    zIndex: -1,
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
  cancelText: {
    color: "#D1D5DB",
    fontWeight: "900",
  },
  confirmText: {
    color: "#fff",
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
