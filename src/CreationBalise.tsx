// src/CreationBalise.tsx
// Version corrigée : sauvegarde fiable de la balise + formats dans Supabase
// Correction principale : si un auto-save est déjà en cours, on relance une sauvegarde juste après.
// Correction secondaire : les formats sont enregistrés dans balises, avec ancien fallback si besoin.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BarCodeScanner } from "expo-barcode-scanner";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import QRCode from "react-native-qrcode-svg";
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  FileText,
  Link as LinkIcon,
  Plus,
  ScanLine,
  Sparkles,
  Snowflake,
  Trash2,
  Upload,
  X,
} from "lucide-react-native";
import { supabase } from "./supabaseClient";
import {
  fetchBaliseFormatsByBaliseIdCompat,
  updateBaliseFormatsJson,
} from "./baliseFormatsCompat";

/* =========================
   Types
========================= */
type Props = {
  setPage?: (p: any) => void;
};

type BaliseFormatType = "code" | "poincon" | "qrcode" | "tableau";

type Balise = {
  id: string;
  code: string;
  points: number | string;
  frozen: boolean;
  numero_balise: string;
  user_id?: string | null;
};

type ParcoursRef = {
  id: string;
  nom: string;
};

type BaliseEditDraft = {
  balise_id?: string;
  balise_numero?: string;
};

type BaliseFormat = {
  id: string;
  balise_id?: string | null;
  user_id?: string | null;
  format_type: BaliseFormatType;
  label: string;
  is_default: boolean;
  payload: Record<string, any>;
  created_at?: string | null;
};

type ActiveCellEditor = {
  formatId: string;
  cellKey: string;
  value: string;
  placeholder: string;
};

/* =========================
   Constantes
========================= */
const BALISE_EDIT_DRAFT_KEY = "@parcoursplus_balise_edit_draft";

const C_BG = "#EDF2F6";
const C_HEADER = "#1F5B86";
const C_HEADER_2 = "#2C6B98";
const C_BORDER = "rgba(0,0,0,0.08)";
const C_TEXT = "#0f172a";
const C_CONTENT_BG = "#EEF3F7";
const C_CONTENT_BORDER = "#C6D2DC";
const C_SKY_STRONG = "#D6E8FF";

const C_CARD = "#FFFDF7";
const C_CARD_BORDER = "#E7B81A";
const C_MUTED = "rgba(15,23,42,0.68)";
const C_RED = "#ef4444";
const C_BLUE_STRONG = "#1d4ed8";
const C_BLUE_SOFT = "#2563eb";

const IOS_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 8,
};

const FORMAT_ORDER: BaliseFormatType[] = ["code", "poincon", "qrcode", "tableau"];

const FIXED_FORMAT_LABELS: Record<BaliseFormatType, string> = {
  code: "Code simple",
  poincon: "Poinçon",
  qrcode: "QR code",
  tableau: "Tableau",
};

const FORMAT_OPTIONS: { id: BaliseFormatType; label: string }[] = [
  { id: "code", label: "Code simple" },
  { id: "poincon", label: "Poinçon" },
  { id: "qrcode", label: "QR code" },
  { id: "tableau", label: "Tableau" },
];

const GRID_SIZE_OPTIONS = [2, 3, 4, 5, 6];
const TABLE_CODE_LENGTH_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const TABLE_PREFS_KEY = "@parcoursplus_tableau_generation_prefs";
const TABLE_USER_PREFS_KEY = "tableau_generation_preferences";
const TABLE_UPPERCASE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const TABLE_DIGIT_CHARS = "0123456789";
const TABLE_SYMBOL_CHARS = "!@#$%&*?";
const TABLE_LOWERCASE_CHARS = "abcdefghijklmnopqrstuvwxyz";
const READABLE_CODE_FONT = Platform.select({
  web: '"Menlo", "Consolas", "Courier New", monospace',
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});
const TABLE_SETTINGS_CELL_KEY = "__settings";
const DEFAULT_TABLE_SETTINGS = {
  rows: 4,
  cols: 4,
  codeLength: 3,
  useUppercase: true,
  useDigits: true,
  useSymbols: false,
  useLowercase: false,
  excludedChars: "",
};

/* =========================
   Helpers
========================= */
const escapeHtml = (value: string) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const toNumeroString = (value: any) => {
  if (value == null) return "";
  if (typeof value === "number") return String(value);
  return String(value).trim();
};

const toPointsNumber = (value: any): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim().replace(",", ".");
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
};

const normalizeToken = (value: any) =>
  String(value ?? "")
    .trim()
    .replace(/::format::(code|tableau|poincon|qrcode)$/i, "")
    .toLowerCase();

const splitLooseString = (raw: string): string[] =>
  raw
    .split(/[;,|]/g)
    .map((s) => s.trim())
    .filter(Boolean);

const extractTokensFromAny = (value: any): string[] => {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractTokensFromAny(item));
  }

  if (typeof value === "object") {
    const out: string[] = [];
    if ((value as any).id != null) out.push(String((value as any).id));
    if ((value as any).balise_id != null) out.push(String((value as any).balise_id));
    if ((value as any).numero_balise != null) out.push(String((value as any).numero_balise));
    if ((value as any).code != null) out.push(String((value as any).code));
    if (Array.isArray((value as any).balises)) out.push(...extractTokensFromAny((value as any).balises));
    if (Array.isArray((value as any).balise_ids)) out.push(...extractTokensFromAny((value as any).balise_ids));
    return out.filter(Boolean);
  }

  const raw = String(value).trim();
  if (!raw) return [];

  if ((raw.startsWith("[") && raw.endsWith("]")) || (raw.startsWith("{") && raw.endsWith("}"))) {
    try {
      return extractTokensFromAny(JSON.parse(raw));
    } catch {
      // noop
    }
  }

  const split = splitLooseString(raw);
  return split.length > 1 ? split : [raw];
};

const matchesBaliseToken = (token: string, balise: Balise) => {
  const t = normalizeToken(token);
  if (!t) return false;

  return (
    t === normalizeToken(balise.id) ||
    t === normalizeToken(balise.numero_balise) ||
    t === normalizeToken(balise.code)
  );
};

const removeBaliseFromValue = (value: any, balise: Balise): any => {
  if (value == null) return value;

  if (Array.isArray(value)) {
    return value.filter((item) => {
      const tokens = extractTokensFromAny(item);
      return !tokens.some((t) => matchesBaliseToken(t, balise));
    });
  }

  if (typeof value === "object") {
    const clone: any = { ...value };

    if (Array.isArray(clone.balises)) {
      clone.balises = clone.balises.filter((item: any) => {
        const tokens = extractTokensFromAny(item);
        return !tokens.some((t) => matchesBaliseToken(t, balise));
      });
    }

    if (Array.isArray(clone.balise_ids)) {
      clone.balise_ids = clone.balise_ids.filter(
        (item: any) => !matchesBaliseToken(String(item), balise)
      );
    }

    return clone;
  }

  const raw = String(value).trim();
  if (!raw) return value;

  const isJsonLike =
    (raw.startsWith("[") && raw.endsWith("]")) ||
    (raw.startsWith("{") && raw.endsWith("}"));

  if (isJsonLike) {
    try {
      const parsed = JSON.parse(raw);
      const cleaned = removeBaliseFromValue(parsed, balise);
      return JSON.stringify(cleaned ?? []);
    } catch {
      // noop
    }
  }

  const sep = raw.includes(";") ? ";" : raw.includes("|") ? "|" : raw.includes(",") ? "," : null;

  if (sep) {
    const kept = raw
      .split(/[;,|]/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((token) => !matchesBaliseToken(token, balise));

    return kept.join(sep === "," ? ", " : `${sep} `);
  }

  if (matchesBaliseToken(raw, balise)) return null;
  return value;
};

const makeCellKey = (row: number, col: number) => `${row}-${col}`;

const toLetter = (index: number) => {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
};

const defaultTablePlaceholder = (row: number, col: number) => `${toLetter(col)}${row + 1}`;

const normalizeQrValue = (value: any) =>
  String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();

const generateQrSeedValue = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes =
    typeof globalThis.crypto?.getRandomValues === "function"
      ? globalThis.crypto.getRandomValues(new Uint8Array(24))
      : Array.from({ length: 24 }, () => Math.floor(Math.random() * 256));
  let out = "QR-";
  for (let i = 0; i < 24; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
};

const getQrBarCodeTypes = () => [BarCodeScanner.Constants.BarCodeType.qr];

const decodeQrFromImageWithBrowser = async (uri: string) => {
  const BarcodeDetectorCtor = (globalThis as any).BarcodeDetector;
  if (!BarcodeDetectorCtor || typeof createImageBitmap !== "function") {
    throw new Error("L'analyse d'image QR n'est pas disponible dans ce navigateur.");
  }

  const response = await fetch(uri);
  const blob = await response.blob();
  const image = await createImageBitmap(blob);
  const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
  const results = await detector.detect(image);
  const value = normalizeQrValue(results?.[0]?.rawValue);
  if (!value) throw new Error("Aucun QR code lisible n'a été trouvé dans cette image.");
  return value;
};

const decodeQrFromImageUri = async (uri: string) => {
  try {
    const results = await BarCodeScanner.scanFromURLAsync(uri, getQrBarCodeTypes());
    const value = normalizeQrValue(results?.[0]?.data ?? results?.[0]?.raw);
    if (value) return value;
  } catch (e) {
    if (Platform.OS !== "web") throw e;
  }

  if (Platform.OS === "web") return decodeQrFromImageWithBrowser(uri);
  throw new Error("Aucun QR code lisible n'a été trouvé dans cette image.");
};

const buildFakeQrMatrix = (value: string, size = 19) => {
  const safe = value || "QR";
  let seed = 0;
  for (let i = 0; i < safe.length; i++) {
    seed = (seed * 33 + safe.charCodeAt(i)) % 2147483647;
  }

  const matrix: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      const inTopLeft = r < 7 && c < 7;
      const inTopRight = r < 7 && c >= size - 7;
      const inBottomLeft = r >= size - 7 && c < 7;

      if (inTopLeft || inTopRight || inBottomLeft) {
        const localR = inBottomLeft ? r - (size - 7) : r;
        const localC = inTopRight ? c - (size - 7) : c;
        const border = localR === 0 || localR === 6 || localC === 0 || localC === 6;
        const center = localR >= 2 && localR <= 4 && localC >= 2 && localC <= 4;
        row.push(border || center);
        continue;
      }

      seed = (seed * 48271) % 2147483647;
      row.push((seed + r * 11 + c * 17) % 2 === 0);
    }
    matrix.push(row);
  }
  return matrix;
};

const clampGridSize = (value: any, fallback = 4) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(2, Math.min(6, Math.round(n)));
};

const clampTableCodeLength = (value: any, fallback = DEFAULT_TABLE_SETTINGS.codeLength) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(8, Math.round(n)));
};

const normalizeExcludedChars = (value: any) => {
  const raw = Array.isArray(value) ? value.join("") : String(value ?? "");
  const seen = new Set<string>();
  let out = "";

  raw
    .replace(/\s+/g, "")
    .split("")
    .forEach((char) => {
      if (!char || seen.has(char)) return;
      seen.add(char);
      out += char;
    });

  return out;
};

const hasOwnValue = (target: any, key: string) =>
  !!target && typeof target === "object" && Object.prototype.hasOwnProperty.call(target, key);

const pickTableExcludedChars = (payload: Record<string, any>, settings: Record<string, any>, fallbackSettings?: Partial<typeof DEFAULT_TABLE_SETTINGS>) => {
  if (hasOwnValue(fallbackSettings, "excludedChars")) return fallbackSettings?.excludedChars;
  if (hasOwnValue(settings, "excludedChars")) return settings.excludedChars;
  if (hasOwnValue(settings, "excluded_chars")) return settings.excluded_chars;
  if (hasOwnValue(payload, "excludedChars")) return payload.excludedChars;
  if (hasOwnValue(payload, "excluded_chars")) return payload.excluded_chars;
  return fallbackSettings?.excludedChars ?? DEFAULT_TABLE_SETTINGS.excludedChars;
};

const normalizeTableSettings = (
  payload: Record<string, any> = {},
  fallbackSettings: Partial<typeof DEFAULT_TABLE_SETTINGS> = {}
) => {
  const cells = payload.cells && typeof payload.cells === "object" && !Array.isArray(payload.cells) ? payload.cells : {};
  const storedSettings =
    cells[TABLE_SETTINGS_CELL_KEY] && typeof cells[TABLE_SETTINGS_CELL_KEY] === "object"
      ? cells[TABLE_SETTINGS_CELL_KEY]
      : null;
  const settings = payload.settings && typeof payload.settings === "object" ? payload.settings : storedSettings ?? payload;
  const useUppercase = settings.useUppercase ?? fallbackSettings.useUppercase ?? true;
  const useDigits = settings.useDigits ?? settings.useNumbers ?? fallbackSettings.useDigits ?? true;
  const useSymbols = settings.useSymbols ?? fallbackSettings.useSymbols ?? false;
  const useLowercase = settings.useLowercase ?? fallbackSettings.useLowercase ?? false;

  const hasAnyType = useUppercase || useDigits || useSymbols || useLowercase;
  const codeLength = settings.codeLength ?? settings.charCount ?? settings.char_count ?? fallbackSettings.codeLength;

  return {
    rows: clampGridSize(payload.rows ?? settings.rows ?? fallbackSettings.rows, DEFAULT_TABLE_SETTINGS.rows),
    cols: clampGridSize(payload.cols ?? settings.cols ?? fallbackSettings.cols, DEFAULT_TABLE_SETTINGS.cols),
    codeLength: clampTableCodeLength(codeLength, DEFAULT_TABLE_SETTINGS.codeLength),
    useUppercase: hasAnyType ? useUppercase : true,
    useDigits: hasAnyType ? useDigits : true,
    useSymbols,
    useLowercase,
    excludedChars: normalizeExcludedChars(pickTableExcludedChars(payload, settings, fallbackSettings)),
  };
};

const getTableCharset = (settings: ReturnType<typeof normalizeTableSettings>) => {
  let chars = "";
  if (settings.useUppercase) chars += TABLE_UPPERCASE_CHARS;
  if (settings.useDigits) chars += TABLE_DIGIT_CHARS;
  if (settings.useSymbols) chars += TABLE_SYMBOL_CHARS;
  if (settings.useLowercase) chars += TABLE_LOWERCASE_CHARS;
  const excluded = new Set(normalizeExcludedChars(settings.excludedChars).split(""));
  const filtered = Array.from(chars).filter((char) => !excluded.has(char)).join("");
  const fallback = Array.from(TABLE_UPPERCASE_CHARS + TABLE_DIGIT_CHARS + TABLE_SYMBOL_CHARS + TABLE_LOWERCASE_CHARS)
    .filter((char) => !excluded.has(char))
    .join("");
  return filtered || fallback;
};

const generateTableCode = (chars: string, length: number) => {
  if (!chars) return "";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
};

const makeAllowedTableSuffix = (index: number, chars: string) => {
  if (!chars) return "";
  let n = Math.max(0, index);
  let out = "";
  do {
    out = chars[n % chars.length] + out;
    n = Math.floor(n / chars.length) - 1;
  } while (n >= 0);
  return out;
};

const generateTableCells = (
  rows: number,
  cols: number,
  settings: ReturnType<typeof normalizeTableSettings>,
  existingCells?: Record<string, any>,
  preserveExisting = false
) => {
  const chars = getTableCharset(settings);
  const total = rows * cols;
  const maxCombinations = Math.pow(chars.length, settings.codeLength);
  const used = new Set<string>();
  const cells: Record<string, any> = {};

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const key = makeCellKey(r, c);
      const existing = String(existingCells?.[key] ?? "").trim();
      if (preserveExisting && existing) {
        cells[key] = existing;
        used.add(cells[key]);
        continue;
      }

      let next = "";
      let guard = 0;
      do {
        next = generateTableCode(chars, settings.codeLength);
        guard += 1;
      } while (used.has(next) && guard < 200);

      if (used.has(next) && maxCombinations <= total) {
        next = `${next}${makeAllowedTableSuffix(r * cols + c, chars)}`;
      }

      used.add(next);
      cells[key] = next;
    }
  }

  return cells;
};

const normalizeTablePayloadForSave = (
  payload: Record<string, any> = {},
  preserveExisting = true,
  fallbackSettings: Partial<typeof DEFAULT_TABLE_SETTINGS> = {}
) => {
  const settings = normalizeTableSettings(payload, fallbackSettings);
  const rows = clampGridSize(payload.rows, settings.rows);
  const cols = clampGridSize(payload.cols, settings.cols);
  const rawCells = payload.cells && typeof payload.cells === "object" && !Array.isArray(payload.cells) ? payload.cells : {};
  const cells = generateTableCells(rows, cols, settings, rawCells, preserveExisting);
  cells[TABLE_SETTINGS_CELL_KEY] = settings as any;

  return {
    ...payload,
    rows,
    cols,
    settings,
    cells,
  };
};

const dotsToCells = (dots: Record<string, any>, rows: number, cols: number) => {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => !!dots?.[makeCellKey(r, c)])
  );
};

const cellsToDots = (cells: any, rows: number, cols: number) => {
  const dots: Record<string, boolean> = {};

  if (Array.isArray(cells)) {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (!!cells?.[r]?.[c]) dots[makeCellKey(r, c)] = true;
      }
    }
  }

  return dots;
};

const normalizePoinconPayloadForSave = (payload: Record<string, any> = {}) => {
  const rows = clampGridSize(payload.rows, 4);
  const cols = clampGridSize(payload.cols, 4);

  const rawDots =
    payload.dots && typeof payload.dots === "object" && !Array.isArray(payload.dots)
      ? payload.dots
      : cellsToDots(payload.cells, rows, cols);

  const dots: Record<string, boolean> = {};
  Object.entries(rawDots || {}).forEach(([key, value]) => {
    if (!value) return;
    const [rRaw, cRaw] = key.split("-");
    const r = Number(rRaw);
    const c = Number(cRaw);
    if (Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < rows && c >= 0 && c < cols) {
      dots[key] = true;
    }
  });

  return {
    ...payload,
    rows,
    cols,
    dots,
    cells: dotsToCells(dots, rows, cols),
  };
};

const createDefaultFormat = (
  type: BaliseFormatType,
  baliseId?: string | null,
  userId?: string | null,
  tableSettings: Partial<typeof DEFAULT_TABLE_SETTINGS> = {}
): BaliseFormat => {
  const base = {
    id: `local-format-${Date.now()}-${Math.random()}`,
    balise_id: baliseId ?? null,
    user_id: userId ?? null,
    format_type: type,
    label: FIXED_FORMAT_LABELS[type],
    is_default: false,
  };

  if (type === "code") return { ...base, payload: {} };

  if (type === "poincon") {
    return {
      ...base,
      payload: normalizePoinconPayloadForSave({ rows: 4, cols: 4, dots: {} }),
    };
  }

  if (type === "qrcode") {
    return {
      ...base,
      payload: { value: generateQrSeedValue() },
    };
  }

  const settings = normalizeTableSettings({ ...DEFAULT_TABLE_SETTINGS, ...tableSettings });

  return {
    ...base,
    payload: normalizeTablePayloadForSave({
      rows: settings.rows,
      cols: settings.cols,
      settings,
      cells: {},
    }, false),
  };
};

const areFormatsEqual = (a: BaliseFormat[], b: BaliseFormat[]) => JSON.stringify(a) === JSON.stringify(b);

const normalizeFormatsForCompare = (formats: BaliseFormat[]) =>
  formats.map((f) => ({
    ...f,
    is_default: false,
    label: FIXED_FORMAT_LABELS[f.format_type],
    payload:
      f.format_type === "poincon"
        ? normalizePoinconPayloadForSave(f.payload ?? {})
        : f.format_type === "tableau"
          ? normalizeTablePayloadForSave(f.payload ?? {})
          : f.payload ?? {},
  }));

const hasUnsavedChanges = (
  balise: Balise | null,
  initialBalise: Balise | null,
  formats: BaliseFormat[],
  initialFormats: BaliseFormat[]
) => {
  if (!balise || !initialBalise) return false;

  const baliseChanged =
    String(balise.code ?? "") !== String(initialBalise.code ?? "") ||
    String(balise.numero_balise ?? "") !== String(initialBalise.numero_balise ?? "") ||
    String(balise.points ?? "") !== String(initialBalise.points ?? "") ||
    !!balise.frozen !== !!initialBalise.frozen;

  const formatsChanged = !areFormatsEqual(
    normalizeFormatsForCompare(formats),
    normalizeFormatsForCompare(initialFormats)
  );

  return baliseChanged || formatsChanged;
};

/* =========================
   Supabase helpers
========================= */
const getAuthenticatedUserId = async (): Promise<string> => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user?.id) throw new Error("Utilisateur non connecté.");
  return user.id;
};

const mapBaliseRow = (b: any): Balise => ({
  id: String(b.id),
  code: String(b.code ?? ""),
  points: b.points ?? 0,
  frozen: !!b.frozen,
  numero_balise: toNumeroString(b.numero_balise),
  user_id: b.user_id ?? null,
});

const mapFormatRow = (row: any): BaliseFormat => {
  const formatType = row.format_type as BaliseFormatType;
  const rawPayload = row.payload && typeof row.payload === "object" ? row.payload : {};

  return {
    id: String(row.id),
    balise_id: row.balise_id ? String(row.balise_id) : null,
    user_id: row.user_id ?? null,
    format_type: formatType,
    label: FIXED_FORMAT_LABELS[formatType] ?? String(row.label ?? formatType),
    is_default: false,
    payload:
      formatType === "poincon"
        ? normalizePoinconPayloadForSave(rawPayload)
        : formatType === "tableau"
          ? rawPayload
          : rawPayload,
    created_at: row.created_at ?? null,
  };
};

const fetchBaliseById = async (baliseId: string, userId: string): Promise<Balise | null> => {
  const { data, error } = await supabase
    .from("balises")
    .select("id, code, points, frozen, numero_balise, user_id")
    .eq("id", baliseId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapBaliseRow(data);
};

const fetchFormatsByBaliseId = async (baliseId: string, userId: string): Promise<BaliseFormat[]> => {
  const rows = await fetchBaliseFormatsByBaliseIdCompat(supabase, baliseId, userId);
  return rows.map(mapFormatRow);
};

const getNextNumeroFromSupabase = async (userId: string): Promise<string> => {
  const { data, error } = await supabase.from("balises").select("numero_balise").eq("user_id", userId);

  if (error) throw error;

  const used = new Set(
    (data || [])
      .map((b: any) => parseInt(String(b.numero_balise ?? "0"), 10))
      .filter((n: number) => Number.isFinite(n) && n > 0)
  );

  let n = 1;
  while (used.has(n)) n++;
  return String(n);
};

const insertBaliseInSupabase = async (b: Balise, userId: string) => {
  const { data, error } = await supabase
    .from("balises")
    .insert({
      user_id: userId,
      code: String(b.code ?? "").trim(),
      points: toPointsNumber(b.points),
      frozen: !!b.frozen,
      numero_balise: parseInt(b.numero_balise, 10),
    })
    .select("id, code, points, frozen, numero_balise, user_id")
    .single();

  if (error) throw error;
  return mapBaliseRow(data);
};

const updateBaliseInSupabase = async (b: Balise, userId: string) => {
  const { error } = await supabase
    .from("balises")
    .update({
      code: String(b.code ?? "").trim(),
      points: toPointsNumber(b.points),
      frozen: !!b.frozen,
      numero_balise: parseInt(b.numero_balise || "0", 10) || null,
    })
    .eq("id", b.id)
    .eq("user_id", userId);

  if (error) throw error;
};

const deleteBaliseInSupabase = async (baliseId: string, userId: string) => {
  const { error } = await supabase.from("balises").delete().eq("id", baliseId).eq("user_id", userId);

  if (error) throw error;
};

const upsertFormatsInSupabase = async (baliseId: string, userId: string, formats: BaliseFormat[]) => {
  const cleanFormats = formats
    .filter((f) => !!f.format_type)
    .map((format) => ({
      balise_id: baliseId,
      user_id: userId,
      format_type: format.format_type,
      label: FIXED_FORMAT_LABELS[format.format_type],
      is_default: false,
      payload:
        format.format_type === "poincon"
          ? normalizePoinconPayloadForSave(format.payload ?? {})
          : format.format_type === "tableau"
            ? normalizeTablePayloadForSave(format.payload ?? {})
          : format.payload ?? {},
    }));

  const savedInBalises = await updateBaliseFormatsJson(supabase, baliseId, userId, cleanFormats);
  if (savedInBalises) return;
  throw new Error("Les colonnes compactes des formats ne sont pas disponibles dans Supabase.");
};

const fetchParcoursUsageForBalise = async (balise: Balise, userId: string): Promise<ParcoursRef[]> => {
  const { data, error } = await supabase
    .from("parcours")
    .select("id, nom, balises_ordre, user_id")
    .eq("user_id", userId);

  if (error) return [];

  const list: ParcoursRef[] = [];
  for (const row of data || []) {
    const tokens = extractTokensFromAny((row as any).balises_ordre);
    const found = tokens.some((t) => matchesBaliseToken(t, balise));

    if (found) {
      list.push({
        id: String((row as any).id),
        nom: String((row as any).nom ?? "Parcours sans nom"),
      });
    }
  }

  return list;
};

const removeBaliseFromSelectedParcours = async (balise: Balise, parcoursIds: string[], userId: string) => {
  if (!parcoursIds.length) return;

  const { data, error } = await supabase
    .from("parcours")
    .select("id, balises_ordre, user_id")
    .eq("user_id", userId)
    .in("id", parcoursIds);

  if (error) throw error;

  for (const row of data || []) {
    const nextValue = removeBaliseFromValue((row as any).balises_ordre, balise);

    const { error: updateError } = await supabase
      .from("parcours")
      .update({ balises_ordre: nextValue })
      .eq("id", (row as any).id)
      .eq("user_id", userId);

    if (updateError) throw updateError;
  }
};

/* =========================
   PDF helper
========================= */
const buildBalisePdfHtml = (balise: Balise, formats: BaliseFormat[], usageList: ParcoursRef[]) => {
  const formatBlocks = formats
    .map((format) => {
      const title = FIXED_FORMAT_LABELS[format.format_type];
      const payload =
        format.format_type === "poincon" ? normalizePoinconPayloadForSave(format.payload || {}) : format.payload || {};

      if (format.format_type === "code") {
        return `
          <div class="card">
            <div class="title">${escapeHtml(title)}</div>
            <div class="code-box">${escapeHtml(String(balise.code ?? "")) || "&nbsp;"}</div>
          </div>
        `;
      }

      if (format.format_type === "qrcode") {
        const matrix = buildFakeQrMatrix(String((payload as any).value ?? "QR"), 17);
        const qrHtml = matrix
          .map(
            (row) =>
              `<div class="qr-row">${row
                .map((filled) => `<span class="qr-pixel ${filled ? "dark" : ""}"></span>`)
                .join("")}</div>`
          )
          .join("");

        return `
          <div class="card">
            <div class="title">${escapeHtml(title)}</div>
            <div class="qr-wrap">${qrHtml}</div>
          </div>
        `;
      }

      if (format.format_type === "poincon") {
        const rows = clampGridSize(payload.rows, 4);
        const cols = clampGridSize(payload.cols, 4);
        const dots = payload.dots || {};

        const grid = Array.from({ length: rows })
          .map((_, r) => {
            const cells = Array.from({ length: cols })
              .map((__, c) => {
                const key = makeCellKey(r, c);
                const active = !!dots[key];
                return `<div class="p-cell">${active ? `<div class="dot"></div>` : ""}</div>`;
              })
              .join("");
            return `<div class="p-row">${cells}</div>`;
          })
          .join("");

        return `
          <div class="card">
            <div class="title">${escapeHtml(title)}</div>
            <div class="p-grid">${grid}</div>
          </div>
        `;
      }

      const rows = clampGridSize(payload.rows, 4);
      const cols = clampGridSize(payload.cols, 4);
      const cells = payload.cells || {};

      const table = Array.from({ length: rows })
        .map((_, r) => {
          const colsHtml = Array.from({ length: cols })
            .map((__, c) => {
              const key = makeCellKey(r, c);
              const value = String(cells[key] ?? "");
              const placeholder = defaultTablePlaceholder(r, c);
              return `<div class="t-cell">${escapeHtml(value || placeholder)}</div>`;
            })
            .join("");
          return `<div class="t-row">${colsHtml}</div>`;
        })
        .join("");

      return `
        <div class="card">
          <div class="title">${escapeHtml(title)}</div>
          <div class="t-grid">${table}</div>
        </div>
      `;
    })
    .join("");

  const usageHtml = usageList.length > 0 ? `<ul>${usageList.map((p) => `<li>${escapeHtml(p.nom)}</li>`).join("")}</ul>` : `<p>Aucun parcours</p>`;

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
          .readable-code { font-family: Menlo, Consolas, "Courier New", monospace; font-variant-numeric: slashed-zero tabular-nums; letter-spacing: 0.04em; }
          .header { margin-bottom: 20px; }
          .main-title { font-size: 28px; font-weight: 800; margin-bottom: 10px; }
          .meta { display: flex; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
          .chip { background: #eaf3f9; border: 1px solid #c9d5df; border-radius: 12px; padding: 10px 14px; }
          .section { margin-top: 24px; }
          .section-title { font-size: 20px; font-weight: 800; margin-bottom: 14px; }
          .card { border: 1.5px solid #e7b81a; border-radius: 18px; padding: 14px; margin-bottom: 14px; background: #fffdf7; }
          .title { font-size: 18px; font-weight: 800; margin-bottom: 10px; }
          .code-box { border: 1px solid #d8dee5; background: #fff; border-radius: 12px; padding: 12px; min-height: 24px; }
          .qr-wrap { display: inline-block; background: #fff; border: 1px solid #d8dee5; border-radius: 12px; padding: 8px; }
          .qr-row { line-height: 0; }
          .qr-pixel { width: 8px; height: 8px; display: inline-block; background: #fff; }
          .qr-pixel.dark { background: #111827; }
          .p-grid, .t-grid { display: inline-block; padding: 4px; background: #fff; border: 1px solid #d8dee5; border-radius: 12px; }
          .p-row, .t-row { display: flex; gap: 4px; margin-bottom: 4px; }
          .p-row:last-child, .t-row:last-child { margin-bottom: 0; }
          .p-cell, .t-cell { width: 42px; height: 42px; border: 1px solid #d1d5db; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 12px; }
          .dot { width: 12px; height: 12px; border-radius: 999px; background: #111827; }
          ul { margin-top: 8px; padding-left: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="main-title">Récapitulatif balise</div>
          <div class="meta">
            <div class="chip"><strong>N° balise :</strong> ${escapeHtml(String(balise.numero_balise ?? ""))}</div>
            <div class="chip"><strong>Code :</strong> <span class="readable-code">${escapeHtml(String(balise.code ?? ""))}</span></div>
            <div class="chip"><strong>Points :</strong> ${escapeHtml(String(balise.points ?? ""))}</div>
            <div class="chip"><strong>Présence :</strong> ${usageList.length} parcours</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Formats</div>
          ${formatBlocks || "<p>Aucun format</p>"}
        </div>

        <div class="section">
          <div class="section-title">Présence dans les parcours</div>
          ${usageHtml}
        </div>
      </body>
    </html>
  `;
};

/* =========================
   Mini icons
========================= */
const MiniCodeIcon = () => (
  <View style={styles.miniIconBox}>
    <Text style={styles.miniCodeA}>A</Text>
    <Text style={styles.miniCodek}>k</Text>
    <Text style={styles.miniCode5}>5</Text>
    <Text style={styles.miniCodeBang}>!</Text>
  </View>
);

const MiniPoinconIcon = () => {
  const dots = new Set(["0-0", "0-2", "1-1", "2-3", "3-0", "3-2"]);
  return (
    <View style={styles.miniGridBox}>
      {Array.from({ length: 4 }).map((_, r) => (
        <View key={`mini-pr-${r}`} style={styles.miniGridRow}>
          {Array.from({ length: 4 }).map((__, c) => {
            const key = `${r}-${c}`;
            const active = dots.has(key);
            return <View key={key} style={styles.miniGridCell}>{active ? <View style={styles.miniGridDot} /> : null}</View>;
          })}
        </View>
      ))}
    </View>
  );
};

const MiniQrIcon = () => {
  const matrix = buildFakeQrMatrix("QR-DEMO", 11);
  return (
    <View style={styles.miniQrBox}>
      {matrix.map((row, r) => (
        <View key={`mqr-r-${r}`} style={styles.miniQrRow}>
          {row.map((filled, c) => (
            <View key={`mqr-${r}-${c}`} style={[styles.miniQrPixel, filled && styles.miniQrPixelDark]} />
          ))}
        </View>
      ))}
    </View>
  );
};

const MiniTableauIcon = () => (
  <View style={styles.miniTableBox}>
    <View style={styles.miniTableRow}>
      <View style={styles.miniTableCell}><Text style={styles.miniTableText}>A1</Text></View>
      <View style={styles.miniTableCell}><Text style={styles.miniTableText}>A2</Text></View>
    </View>
    <View style={styles.miniTableRow}>
      <View style={styles.miniTableCell}><Text style={styles.miniTableText}>B1</Text></View>
      <View style={styles.miniTableCell}><Text style={styles.miniTableText}>B2</Text></View>
    </View>
  </View>
);

const PickerFormatIcon = ({ type }: { type: BaliseFormatType }) => {
  if (type === "code") return <MiniCodeIcon />;
  if (type === "poincon") return <MiniPoinconIcon />;
  if (type === "qrcode") return <MiniQrIcon />;
  return <MiniTableauIcon />;
};

const Rows3Icon = ({ color = "#334155" }: { color?: string }) => (
  <View style={styles.rows3IconWrap}>
    <View style={[styles.rows3Line, { backgroundColor: color }]} />
    <View style={[styles.rows3Line, { backgroundColor: color }]} />
    <View style={[styles.rows3Line, { backgroundColor: color }]} />
  </View>
);

const Cols3Icon = ({ color = "#334155" }: { color?: string }) => (
  <View style={styles.cols3IconWrap}>
    <View style={[styles.cols3Line, { backgroundColor: color }]} />
    <View style={[styles.cols3Line, { backgroundColor: color }]} />
    <View style={[styles.cols3Line, { backgroundColor: color }]} />
  </View>
);

/* =========================
   Grid picker
========================= */
const GridSizePicker = ({
  iconType,
  value,
  onSelect,
}: {
  iconType: "rows" | "cols";
  value: number;
  onSelect: (v: number) => void;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.gridPickerWrap}>
      <Pressable onPress={() => setOpen((prev) => !prev)} style={({ pressed }) => [styles.gridPickerButton, pressed && styles.pressedStyle]}>
        {iconType === "rows" ? <Rows3Icon /> : <Cols3Icon />}
        <Text style={styles.gridPickerButtonText}>{value}</Text>
        <ChevronDown size={14} color="#334155" />
      </Pressable>

      {open ? (
        <>
          <Pressable style={styles.gridPickerBackdrop} onPress={() => setOpen(false)} />
          <View style={styles.gridPickerMenu}>
            {GRID_SIZE_OPTIONS.map((option) => (
              <Pressable
                key={`${iconType}-${option}`}
                onPress={() => {
                  onSelect(option);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.gridPickerItem, option === value && styles.gridPickerItemActive, pressed && styles.pressedStyle]}
              >
                <Text style={[styles.gridPickerItemText, option === value && styles.gridPickerItemTextActive]}>{option}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
};

/* =========================
   Card component
========================= */
const FormatCard = ({
  format,
  baliseCode,
  cardWidth,
  cardMinHeight,
  gridZoneHeight,
  isMobile,
  tablePrefs,
  onRemove,
  onChangeCode,
  onChangePayload,
  onSaveTableDefaults,
  onStartEditTableCell,
}: {
  format: BaliseFormat;
  baliseCode: string;
  cardWidth: number;
  cardMinHeight: number;
  gridZoneHeight: number;
  isMobile: boolean;
  tablePrefs: Partial<typeof DEFAULT_TABLE_SETTINGS>;
  onRemove: () => void;
  onChangeCode: (v: string) => void;
  onChangePayload: (payload: Record<string, any>) => void;
  onSaveTableDefaults: (payload: Record<string, any>) => void;
  onStartEditTableCell: (cell: ActiveCellEditor) => void;
}) => {
  const payload = format.payload || {};
  const isWeb = Platform.OS === "web";
  const compactTopRow = format.format_type === "poincon" || format.format_type === "tableau";
  const [codeLengthPickerOpen, setCodeLengthPickerOpen] = useState(false);
  const [tableViewMode, setTableViewMode] = useState<"table" | "list">("table");
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [qrScanLocked, setQrScanLocked] = useState(false);
  const [qrImporting, setQrImporting] = useState(false);
  const [qrImportChoiceOpen, setQrImportChoiceOpen] = useState(false);
  const [qrUrlModalOpen, setQrUrlModalOpen] = useState(false);
  const [qrUrlDraft, setQrUrlDraft] = useState("");
  const [qrWebScannerActive, setQrWebScannerActive] = useState(false);
  const [qrWebScannerMessage, setQrWebScannerMessage] = useState("");
  const qrWebVideoRef = useRef<any>(null);
  const qrWebStreamRef = useRef<any>(null);
  const qrWebScanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (qrWebScanTimerRef.current) clearInterval(qrWebScanTimerRef.current);
      qrWebStreamRef.current?.getTracks?.().forEach((track: any) => track.stop?.());
    };
  }, []);

  const getGridMetrics = (rows: number, cols: number) => {
    const outerWidth = cardWidth - 28;
    const gap = isMobile ? 4 : 6;
    const gridPadding = isMobile ? 8 : 10;

    const usableByWidth = outerWidth - gridPadding * 2;
    const usableByHeight = gridZoneHeight - gridPadding * 2;

    const cellFromWidth = Math.floor((usableByWidth - gap * (cols - 1)) / cols);
    const cellFromHeight = Math.floor((usableByHeight - gap * (rows - 1)) / rows);

    const cell = Math.max(isMobile ? 24 : 28, Math.min(cellFromWidth, cellFromHeight));
    const contentWidth = cell * cols + gap * (cols - 1);
    const contentHeight = cell * rows + gap * (rows - 1);

    return {
      gap,
      padding: gridPadding,
      cell,
      wrapWidth: contentWidth + gridPadding * 2,
      wrapHeight: contentHeight + gridPadding * 2,
    };
  };

  const renderTopRow = (rows?: number, cols?: number) => {
    if (!compactTopRow) {
      return (
        <View style={styles.formatCardTopCompact}>
          <Text style={styles.formatTitleTextCompact}>{FIXED_FORMAT_LABELS[format.format_type]}</Text>

          <Pressable onPress={onRemove} style={({ pressed }) => [styles.closeMiniBtnCompact, pressed && styles.pressedStyle]}>
            <X size={14} color="#991b1b" />
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.compactHeaderRow}>
        <Text style={styles.compactHeaderTitle}>{FIXED_FORMAT_LABELS[format.format_type]}</Text>

        <View style={styles.compactHeaderControls}>
          <GridSizePicker
            iconType="rows"
            value={rows || 4}
            onSelect={(nextRows) => {
              if (format.format_type === "poincon") {
                const normalized = normalizePoinconPayloadForSave({ ...payload, rows: nextRows, cols: cols || 4 });
                onChangePayload(normalized);
              } else {
                onChangePayload(normalizeTablePayloadForSave({ ...payload, rows: nextRows, cols: cols || 4, cells: payload.cells || {} }, true, tablePrefs));
              }
            }}
          />

          <GridSizePicker
            iconType="cols"
            value={cols || 4}
            onSelect={(nextCols) => {
              if (format.format_type === "poincon") {
                const normalized = normalizePoinconPayloadForSave({ ...payload, rows: rows || 4, cols: nextCols });
                onChangePayload(normalized);
              } else {
                onChangePayload(normalizeTablePayloadForSave({ ...payload, rows: rows || 4, cols: nextCols, cells: payload.cells || {} }, true, tablePrefs));
              }
            }}
          />

          <Pressable onPress={onRemove} style={({ pressed }) => [styles.closeMiniBtnCompact, pressed && styles.pressedStyle]}>
            <X size={14} color="#991b1b" />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderCode = () => (
    <>
      {renderTopRow()}
      <View style={styles.editorBlockCompact}>
        <TextInput
          value={baliseCode}
          onChangeText={onChangeCode}
          placeholder="Entrer le code"
          placeholderTextColor="rgba(15,23,42,0.35)"
          style={styles.cardInputCompact}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />
      </View>
    </>
  );

  const renderPoincon = () => {
    const normalizedPayload = normalizePoinconPayloadForSave(payload);
    const rows = clampGridSize(normalizedPayload.rows, 4);
    const cols = clampGridSize(normalizedPayload.cols, 4);
    const dots = normalizedPayload.dots || {};
    const metrics = getGridMetrics(rows, cols);

    return (
      <>
        {renderTopRow(rows, cols)}
        <View style={styles.editorBlockCompactTight}>
          <View style={[styles.fixedContentZone, { height: gridZoneHeight }]}>
            <View style={[styles.whiteGridWrapCompact, { width: metrics.wrapWidth, height: metrics.wrapHeight, padding: metrics.padding }]}> 
              {Array.from({ length: rows }).map((_, r) => (
                <View key={`prow-${r}`} style={[styles.whiteGridRowCompact, { gap: metrics.gap, marginBottom: r === rows - 1 ? 0 : metrics.gap }]}> 
                  {Array.from({ length: cols }).map((__, c) => {
                    const key = makeCellKey(r, c);
                    const active = !!dots[key];

                    return (
                      <Pressable
                        key={key}
                        onPress={() => {
                          const nextDots: Record<string, boolean> = { ...dots };
                          if (active) delete nextDots[key];
                          else nextDots[key] = true;

                          onChangePayload(normalizePoinconPayloadForSave({ ...payload, rows, cols, dots: nextDots }));
                        }}
                        style={[styles.whiteGridCellCompact, { width: metrics.cell, height: metrics.cell }]}
                      >
                        {active && <View style={styles.blackDotCompact} />}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      </>
    );
  };

  const renderQrCode = () => {
    const value = normalizeQrValue(payload.value);
    const qrSize = isMobile ? 170 : 220;
    const applyQrValue = (nextValue: any) => {
      const cleanValue = normalizeQrValue(nextValue);
      if (!cleanValue) {
        Alert.alert("QR code vide", "Aucune valeur lisible n'a été trouvée.");
        return;
      }
      onChangePayload({ ...payload, value: cleanValue });
    };
    const stopWebScanner = () => {
      if (qrWebScanTimerRef.current) {
        clearInterval(qrWebScanTimerRef.current);
        qrWebScanTimerRef.current = null;
      }
      qrWebStreamRef.current?.getTracks?.().forEach((track: any) => track.stop?.());
      qrWebStreamRef.current = null;
      setQrWebScannerActive(false);
    };
    const closeQrScanner = () => {
      stopWebScanner();
      setQrScannerOpen(false);
      setQrScanLocked(false);
    };
    const generateRandomQr = () => applyQrValue(generateQrSeedValue());
    const openWebQrScanner = async () => {
      const BarcodeDetectorCtor = (globalThis as any).BarcodeDetector;

      if (!BarcodeDetectorCtor || !navigator?.mediaDevices?.getUserMedia) {
        Alert.alert("Scanner indisponible", "Ce navigateur ne permet pas encore le scan QR en direct. Utilise Importer > Fichier.");
        return;
      }

      try {
        stopWebScanner();
        setQrScanLocked(false);
        setQrWebScannerActive(true);
        setQrWebScannerMessage("Ouverture de la caméra...");
        setQrScannerOpen(true);

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
          setQrWebScannerMessage("Place le QR code dans le cadre.");

          const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
          qrWebScanTimerRef.current = setInterval(async () => {
            if (qrScanLocked) return;
            try {
              const results = await detector.detect(video);
              const nextValue = normalizeQrValue(results?.[0]?.rawValue);
              if (!nextValue) return;

              setQrScanLocked(true);
              closeQrScanner();
              applyQrValue(nextValue);
            } catch {
              // La détection réessaie automatiquement sur l'image suivante.
            }
          }, 450);
        });
      } catch (e: any) {
        stopWebScanner();
        setQrScannerOpen(false);
        Alert.alert("Caméra indisponible", e?.message || "Impossible d'ouvrir la caméra du navigateur.");
      }
    };
    const scanQrFromCameraPhoto = async () => {
      if (qrImporting) return;
      setQrImporting(true);

      try {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (permission.status !== "granted") {
          Alert.alert("Caméra refusée", "Autorise l'accès à la caméra pour scanner un QR code.");
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 1,
        });

        if (result.canceled) return;
        const uri = result.assets?.[0]?.uri;
        if (!uri) {
          Alert.alert("Photo illisible", "Impossible de lire la photo du QR code.");
          return;
        }

        const decodedValue = await decodeQrFromImageUri(uri);
        applyQrValue(decodedValue);
      } catch (e: any) {
        Alert.alert("QR code non détecté", e?.message || "Aucun QR code lisible n'a été trouvé dans cette photo.");
      } finally {
        setQrImporting(false);
      }
    };
    const openQrScanner = async () => {
      if (Platform.OS === "web") {
        await openWebQrScanner();
        return;
      }

      try {
        const permission = await BarCodeScanner.requestPermissionsAsync();
        if (permission.status !== "granted") {
          Alert.alert("Caméra refusée", "Autorise l'accès à la caméra pour scanner un QR code.");
          return;
        }
        setQrScanLocked(false);
        setQrWebScannerActive(false);
        setQrScannerOpen(true);
      } catch (e: any) {
        Alert.alert("Scanner indisponible", e?.message || "Impossible d'ouvrir le scanner QR.");
      }
    };
    const importQrImage = async () => {
      if (qrImporting) return;
      setQrImportChoiceOpen(false);
      setQrImporting(true);

      try {
        if (Platform.OS !== "web") {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (permission.status !== "granted") {
            Alert.alert("Photos refusées", "Autorise l'accès aux photos pour importer un QR code.");
            return;
          }
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 1,
        });

        if (result.canceled) return;
        const uri = result.assets?.[0]?.uri;
        if (!uri) {
          Alert.alert("Image illisible", "Impossible de lire l'image sélectionnée.");
          return;
        }

        const decodedValue = await decodeQrFromImageUri(uri);
        applyQrValue(decodedValue);
      } catch (e: any) {
        Alert.alert("QR code non détecté", e?.message || "Aucun QR code lisible n'a été trouvé dans cette image.");
      } finally {
        setQrImporting(false);
      }
    };
    const importQrFromUrl = async () => {
      if (qrImporting) return;
      const url = normalizeQrValue(qrUrlDraft);

      if (!url) {
        Alert.alert("URL manquante", "Ajoute le lien à transformer en QR code.");
        return;
      }

      applyQrValue(url);
      setQrUrlModalOpen(false);
      setQrUrlDraft("");
    };
    const handleQrScanned = ({ data }: { data: string }) => {
      if (qrScanLocked) return;
      setQrScanLocked(true);
      setQrScannerOpen(false);
      applyQrValue(data);
    };

    return (
      <>
        {renderTopRow()}
        <View style={styles.editorBlockCompact}>
          <View style={styles.qrActionRowCompact}>
            <Pressable onPress={generateRandomQr} style={({ pressed }) => [styles.qrModeBtn, pressed && styles.pressedStyle]}>
              <Sparkles size={14} color="#fff" />
              <Text style={styles.generateBtnTextCompact}>Aléatoire</Text>
            </Pressable>

            <Pressable onPress={openQrScanner} style={({ pressed }) => [styles.qrModeBtn, pressed && styles.pressedStyle]}>
              <ScanLine size={14} color="#fff" />
              <Text style={styles.generateBtnTextCompact}>Scanner</Text>
            </Pressable>

            <Pressable
              onPress={() => setQrImportChoiceOpen(true)}
              disabled={qrImporting}
              style={({ pressed }) => [styles.qrModeBtn, qrImporting && styles.qrModeBtnDisabled, pressed && !qrImporting && styles.pressedStyle]}
            >
              {qrImporting ? <ActivityIndicator size="small" color="#fff" /> : <Upload size={14} color="#fff" />}
              <Text style={styles.generateBtnTextCompact}>Importer</Text>
            </Pressable>
          </View>

          <View style={[styles.fixedContentZone, { height: gridZoneHeight }]}>
            <View style={styles.realQrWrapCompact}>
              <QRCode value={value || " "} size={qrSize} backgroundColor="#ffffff" color="#111827" ecl="H" quietZone={8} />
            </View>
          </View>
        </View>

        <Modal visible={qrScannerOpen} animationType="slide" transparent onRequestClose={closeQrScanner}>
          <View style={styles.qrScannerBackdrop}>
            <View style={styles.qrScannerPanel}>
              <View style={styles.qrScannerHeader}>
                <View style={styles.qrScannerTitleRow}>
                  <Camera size={18} color="#E0F2FE" />
                  <Text style={styles.qrScannerTitle}>Scanner un QR code</Text>
                </View>
                <Pressable onPress={closeQrScanner} style={({ pressed }) => [styles.qrScannerCloseBtn, pressed && styles.pressedStyle]}>
                  <X size={16} color="#E0F2FE" />
                </Pressable>
              </View>

              <View style={styles.qrScannerCameraWrap}>
                {Platform.OS === "web" && qrWebScannerActive ? (
                  React.createElement("video", {
                    ref: qrWebVideoRef,
                    muted: true,
                    playsInline: true,
                    autoPlay: true,
                    style: styles.qrScannerCamera as any,
                  })
                ) : (
                  <BarCodeScanner
                    onBarCodeScanned={qrScanLocked ? undefined : handleQrScanned}
                    barCodeTypes={getQrBarCodeTypes()}
                    style={styles.qrScannerCamera}
                  />
                )}
                <View style={styles.qrScannerFrame} />
              </View>

              <Text style={styles.qrScannerHint}>{qrWebScannerMessage || "Place le QR code dans le cadre. Il sera recopié puis régénéré proprement."}</Text>
            </View>
          </View>
        </Modal>

        <Modal visible={qrImportChoiceOpen} animationType="fade" transparent onRequestClose={() => setQrImportChoiceOpen(false)}>
          <View style={styles.qrScannerBackdrop}>
            <View style={styles.qrImportPanel}>
              <View style={styles.qrScannerHeader}>
                <Text style={styles.qrScannerTitle}>Importer</Text>
                <Pressable onPress={() => setQrImportChoiceOpen(false)} style={({ pressed }) => [styles.qrScannerCloseBtn, pressed && styles.pressedStyle]}>
                  <X size={16} color="#E0F2FE" />
                </Pressable>
              </View>

              <Pressable
                onPress={() => {
                  setQrImportChoiceOpen(false);
                  setQrUrlModalOpen(true);
                }}
                style={({ pressed }) => [styles.qrImportOptionBtn, pressed && styles.pressedStyle]}
              >
                <LinkIcon size={18} color="#0F172A" />
                <Text style={styles.qrImportOptionText}>URL</Text>
              </Pressable>

              <Pressable onPress={importQrImage} style={({ pressed }) => [styles.qrImportOptionBtn, pressed && styles.pressedStyle]}>
                <Upload size={18} color="#0F172A" />
                <Text style={styles.qrImportOptionText}>Fichier</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal visible={qrUrlModalOpen} animationType="fade" transparent onRequestClose={() => setQrUrlModalOpen(false)}>
          <View style={styles.qrScannerBackdrop}>
            <View style={styles.qrImportPanel}>
              <View style={styles.qrScannerHeader}>
                <Text style={styles.qrScannerTitle}>URL</Text>
                <Pressable onPress={() => setQrUrlModalOpen(false)} style={({ pressed }) => [styles.qrScannerCloseBtn, pressed && styles.pressedStyle]}>
                  <X size={16} color="#E0F2FE" />
                </Pressable>
              </View>

              <TextInput
                value={qrUrlDraft}
                onChangeText={setQrUrlDraft}
                placeholder="https://..."
                placeholderTextColor="rgba(15,23,42,0.36)"
                style={styles.qrUrlInput}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                onSubmitEditing={importQrFromUrl}
              />

              <Pressable
                onPress={importQrFromUrl}
                disabled={qrImporting}
                style={({ pressed }) => [styles.qrImportValidateBtn, qrImporting && styles.qrModeBtnDisabled, pressed && !qrImporting && styles.pressedStyle]}
              >
                {qrImporting ? <ActivityIndicator size="small" color="#fff" /> : <LinkIcon size={16} color="#fff" />}
                <Text style={styles.generateBtnTextCompact}>Valider</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </>
    );
  };

  const renderTableau = () => {
    const normalizedPayload = normalizeTablePayloadForSave(payload, true, tablePrefs);
    const rows = clampGridSize(normalizedPayload.rows, 4);
    const cols = clampGridSize(normalizedPayload.cols, 4);
    const settings = normalizeTableSettings(normalizedPayload, tablePrefs);
    const cells = normalizedPayload.cells || {};
    const showCodeTags = settings.codeLength >= 6;
    const tableGridZoneHeight = Math.max(isMobile ? 165 : 235, gridZoneHeight - 96);
    const metrics = (() => {
      const outerWidth = cardWidth - 28;
      const gap = isMobile ? 3 : 5;
      const gridPadding = isMobile ? 6 : 8;
      const usableByWidth = outerWidth - gridPadding * 2;
      const usableByHeight = tableGridZoneHeight - gridPadding * 2;
      const headerWidth = isMobile ? 34 : 38;
      const cellFromWidth = Math.floor((usableByWidth - headerWidth - gap * cols) / cols);
      const cellFromHeight = Math.floor((usableByHeight - gap * rows) / (rows + 1));
      const minCellWidth = showCodeTags
        ? (isMobile ? 38 : 44)
        : settings.codeLength <= 3
          ? (isMobile ? 42 : 48)
          : settings.codeLength <= 4
            ? (isMobile ? 50 : 58)
            : (isMobile ? 60 : 70);
      const cellWidth = Math.max(minCellWidth, cellFromWidth);
      const cellHeight = Math.max(isMobile ? 30 : 34, Math.min(cellFromHeight, isMobile ? 38 : 42));
      return {
        gap,
        padding: gridPadding,
        cellWidth,
        cellHeight,
        headerWidth,
        fontSize: showCodeTags ? 11 : settings.codeLength >= 5 ? 10 : settings.codeLength === 4 ? 11 : 12,
        wrapWidth: headerWidth + cellWidth * cols + gap * cols + gridPadding * 2,
        wrapHeight: cellHeight * (rows + 1) + gap * rows + gridPadding * 2,
      };
    })();
    const codeCharsLabel = `${settings.codeLength} car.`;
    const tableCodeTags = Array.from({ length: rows }).flatMap((_, r) =>
      Array.from({ length: cols }).map((__, c) => {
        const key = makeCellKey(r, c);
        return {
          key,
          label: `${toLetter(c)}${r + 1}`,
          value: String(cells[key] ?? ""),
        };
      })
    );

    const changeSettings = (patch: Partial<typeof settings>) => {
      const nextSettings = normalizeTableSettings({ ...settings, ...patch }, tablePrefs);
      onChangePayload(
        normalizeTablePayloadForSave({
          ...normalizedPayload,
          rows,
          cols,
          settings: nextSettings,
          cells,
        }, true, tablePrefs)
      );
    };

    const regenerate = () => {
      onChangePayload(
        normalizeTablePayloadForSave(
          {
            ...normalizedPayload,
            rows,
            cols,
            settings,
            cells: {},
          },
          false,
          tablePrefs
        )
      );
    };

    const selectCodeLength = (nextLength: number) => {
      setCodeLengthPickerOpen(false);
      const nextSettings = normalizeTableSettings({ ...settings, codeLength: nextLength }, tablePrefs);
      onChangePayload(
        normalizeTablePayloadForSave(
          {
            ...normalizedPayload,
            rows,
            cols,
            settings: nextSettings,
            cells: {},
          },
          false,
          tablePrefs
        )
      );
    };

    const editTableCell = (cellKey: string, value: string, placeholder: string) => {
      if (isWeb) {
        const nextValue = window.prompt(`Code ${placeholder}`, value);
        if (nextValue == null) return;
        onChangePayload({ ...normalizedPayload, rows, cols, cells: { ...cells, [cellKey]: nextValue } });
        return;
      }

      onStartEditTableCell({ formatId: format.id, cellKey, value, placeholder });
    };

    return (
      <>
        {renderTopRow(rows, cols)}
        <View style={styles.editorBlockCompactTight}>
          <View style={styles.tableToolsRow}>
            <View style={styles.codeLengthPickerWrap}>
              <Pressable
                onPress={() => setCodeLengthPickerOpen(true)}
                style={({ pressed }) => [styles.tableToolBtn, pressed && styles.pressedStyle]}
              >
                <Text style={styles.tableToolBtnText}>{codeCharsLabel}</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => changeSettings({ useUppercase: !settings.useUppercase })}
              style={({ pressed }) => [styles.tableToggleBtn, settings.useUppercase && styles.tableToggleBtnActive, pressed && styles.pressedStyle]}
            >
              <Text style={[styles.tableToggleText, settings.useUppercase && styles.tableToggleTextActive]}>A-Z</Text>
            </Pressable>

            <Pressable
              onPress={() => changeSettings({ useDigits: !settings.useDigits })}
              style={({ pressed }) => [styles.tableToggleBtn, settings.useDigits && styles.tableToggleBtnActive, pressed && styles.pressedStyle]}
            >
              <Text style={[styles.tableToggleText, settings.useDigits && styles.tableToggleTextActive]}>0-9</Text>
            </Pressable>

            <Pressable onPress={regenerate} style={({ pressed }) => [styles.generateBtnCompact, pressed && styles.pressedStyle]}>
              <Text style={styles.generateBtnTextCompact}>Générer</Text>
            </Pressable>
          </View>

          <View style={styles.tableToolsRow}>
            <Pressable
              onPress={() => changeSettings({ useSymbols: !settings.useSymbols })}
              style={({ pressed }) => [styles.tableToggleBtn, settings.useSymbols && styles.tableToggleBtnActive, pressed && styles.pressedStyle]}
            >
              <Text style={[styles.tableToggleText, settings.useSymbols && styles.tableToggleTextActive]}>Symboles</Text>
            </Pressable>

            <Pressable
              onPress={() => changeSettings({ useLowercase: !settings.useLowercase })}
              style={({ pressed }) => [styles.tableToggleBtn, settings.useLowercase && styles.tableToggleBtnActive, pressed && styles.pressedStyle]}
            >
              <Text style={[styles.tableToggleText, settings.useLowercase && styles.tableToggleTextActive]}>a-z</Text>
            </Pressable>

            <Pressable onPress={() => onSaveTableDefaults(normalizedPayload)} style={({ pressed }) => [styles.tableToolBtn, pressed && styles.pressedStyle]}>
              <Text style={styles.tableToolBtnText}>Défaut</Text>
            </Pressable>
          </View>

          <View style={styles.tableViewSwitchRow}>
            <Pressable
              onPress={() => setTableViewMode("table")}
              style={({ pressed }) => [styles.tableViewSwitchBtn, tableViewMode === "table" && styles.tableViewSwitchBtnActive, pressed && styles.pressedStyle]}
            >
              <Text style={[styles.tableViewSwitchText, tableViewMode === "table" && styles.tableViewSwitchTextActive]}>Tableau</Text>
            </Pressable>
            <Pressable
              onPress={() => setTableViewMode("list")}
              style={({ pressed }) => [styles.tableViewSwitchBtn, tableViewMode === "list" && styles.tableViewSwitchBtnActive, pressed && styles.pressedStyle]}
            >
              <Text style={[styles.tableViewSwitchText, tableViewMode === "list" && styles.tableViewSwitchTextActive]}>Liste</Text>
            </Pressable>
          </View>

          {tableViewMode === "table" ? (
            <ScrollView
              style={[styles.tableViewport, { height: tableGridZoneHeight }]}
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator
              contentContainerStyle={styles.tableViewportHorizontalContent}
            >
              <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ maxHeight: tableGridZoneHeight }}>
                <View style={[styles.tableFixedWrap, { width: metrics.wrapWidth, minHeight: metrics.wrapHeight, padding: metrics.padding }]}>
                  <View style={[styles.tableEditorRowCompact, { gap: metrics.gap, marginBottom: metrics.gap }]}>
                    <View style={[styles.tableHeaderCorner, { width: metrics.headerWidth, height: metrics.cellHeight }]} />
                    {Array.from({ length: cols }).map((_, c) => (
                      <View key={`thead-${c}`} style={[styles.tableHeaderCell, { width: metrics.cellWidth, height: metrics.cellHeight }]}>
                        <Text style={styles.tableHeaderText}>{toLetter(c)}</Text>
                      </View>
                    ))}
                  </View>

                  {Array.from({ length: rows }).map((_, r) => (
                    <View key={`trow-${r}`} style={[styles.tableEditorRowCompact, { gap: metrics.gap, marginBottom: r === rows - 1 ? 0 : metrics.gap }]}>
                      <View style={[styles.tableHeaderCell, { width: metrics.headerWidth, height: metrics.cellHeight }]}>
                        <Text style={styles.tableHeaderText}>{r + 1}</Text>
                      </View>
                      {Array.from({ length: cols }).map((__, c) => {
                        const key = makeCellKey(r, c);
                        const currentValue = String(cells[key] ?? "");
                        const placeholder = defaultTablePlaceholder(r, c);
                        const visibleValue = showCodeTags ? `${toLetter(c)}${r + 1}` : currentValue;

                        if (isWeb && !showCodeTags) {
                          return (
                            <TextInput
                              key={key}
                              value={currentValue}
                              onChangeText={(v) => onChangePayload({ ...payload, rows, cols, cells: { ...cells, [key]: v } })}
                              placeholder={placeholder}
                              placeholderTextColor="rgba(15,23,42,0.35)"
                              style={[styles.tableCellInputWeb, { width: metrics.cellWidth, height: metrics.cellHeight, fontSize: metrics.fontSize }]}
                              autoCapitalize="none"
                              autoCorrect={false}
                            />
                          );
                        }

                        return (
                          <Pressable
                            key={key}
                            onPress={() => editTableCell(key, currentValue, placeholder)}
                            style={[styles.tableCellPressable, { width: metrics.cellWidth, height: metrics.cellHeight }]}
                          >
                            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={[styles.tableCellPressableText, { fontSize: metrics.fontSize }, !currentValue && styles.tableCellPressablePlaceholder]}>
                              {visibleValue || placeholder}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
            </ScrollView>
          ) : (
            <ScrollView
              style={[styles.tableListViewport, { height: tableGridZoneHeight }]}
              contentContainerStyle={styles.tableListContent}
              showsVerticalScrollIndicator
            >
              {tableCodeTags.map((item) => (
                <Pressable
                  key={`list-${item.key}`}
                  onPress={() => editTableCell(item.key, item.value, item.label)}
                  style={({ pressed }) => [styles.tableListRow, pressed && styles.pressedStyle]}
                >
                  <Text style={styles.tableListCoord}>{item.label}</Text>
                  <Text selectable={isWeb as any} numberOfLines={1} style={styles.tableListValue}>{item.value}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

        </View>

        {isWeb && codeLengthPickerOpen ? (
          <>
            <Pressable style={styles.codeLengthBackdrop} onPress={() => setCodeLengthPickerOpen(false)} />
            <View style={styles.codeLengthMenuFloating}>
              {TABLE_CODE_LENGTH_OPTIONS.map((option) => (
                <Pressable
                  key={`length-${option}`}
                  onPress={() => selectCodeLength(option)}
                  style={({ pressed }) => [
                    styles.codeLengthMenuItem,
                    option === settings.codeLength && styles.codeLengthMenuItemActive,
                    pressed && styles.pressedStyle,
                  ]}
                >
                  <Text style={[styles.codeLengthMenuText, option === settings.codeLength && styles.codeLengthMenuTextActive]}>
                    {option} caractères
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {!isWeb && codeLengthPickerOpen ? (
          <Modal visible transparent animationType="fade" onRequestClose={() => setCodeLengthPickerOpen(false)}>
            <View style={styles.lengthModalRoot}>
              <Pressable style={styles.lengthModalBackdrop} onPress={() => setCodeLengthPickerOpen(false)} />
              <View style={styles.lengthModalCard}>
                <Text style={styles.lengthModalTitle}>Nombre de caractères</Text>
                {TABLE_CODE_LENGTH_OPTIONS.map((option) => (
                  <Pressable
                    key={`mobile-length-${option}`}
                    onPress={() => selectCodeLength(option)}
                    style={({ pressed }) => [
                      styles.lengthModalItem,
                      option === settings.codeLength && styles.lengthModalItemActive,
                      pressed && styles.pressedStyle,
                    ]}
                  >
                    <Text style={[styles.lengthModalItemText, option === settings.codeLength && styles.lengthModalItemTextActive]}>
                      {option} caractères
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </Modal>
        ) : null}
      </>
    );
  };

  return (
    <View style={[styles.formatCard, { width: cardWidth, minHeight: cardMinHeight, height: cardMinHeight }]}> 
      {format.format_type === "code" && renderCode()}
      {format.format_type === "poincon" && renderPoincon()}
      {format.format_type === "qrcode" && renderQrCode()}
      {format.format_type === "tableau" && renderTableau()}
    </View>
  );
};

/* =========================
   Main component
========================= */
const CreationBalise: React.FC<Props> = ({ setPage = () => {} }) => {
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [currentUserId, setCurrentUserId] = useState("");
  const [balise, setBalise] = useState<Balise | null>(null);
  const [initialBalise, setInitialBalise] = useState<Balise | null>(null);
  const [isNew, setIsNew] = useState(true);

  const [formats, setFormats] = useState<BaliseFormat[]>([]);
  const [initialFormats, setInitialFormats] = useState<BaliseFormat[]>([]);

  const [usageList, setUsageList] = useState<ParcoursRef[]>([]);
  const [selectedParcoursIds, setSelectedParcoursIds] = useState<string[]>([]);
  const [showParcoursList, setShowParcoursList] = useState(false);
  const [removingFromParcours, setRemovingFromParcours] = useState(false);
  const [showDeleteInfo, setShowDeleteInfo] = useState(false);
  const [showFormatPicker, setShowFormatPicker] = useState(false);
  const [tablePrefs, setTablePrefs] = useState(DEFAULT_TABLE_SETTINGS);

  const [activeCellEditor, setActiveCellEditor] = useState<ActiveCellEditor | null>(null);
  const [activeFormatIndex, setActiveFormatIndex] = useState(0);

  const { width, height } = useWindowDimensions();
  const isMobile = width < 760;
  const scrollRef = useRef<ScrollView | null>(null);
  const initialLoadDoneRef = useRef(false);
  const savingRef = useRef(false);
  const saveAgainRef = useRef(false);
  const tablePrefsSourceRef = useRef<"default" | "local" | "supabase">("default");

  const latestStateRef = useRef<{
    balise: Balise | null;
    formats: BaliseFormat[];
    hasChanges: boolean;
    isNew: boolean;
    currentUserId: string;
  }>({
    balise: null,
    formats: [],
    hasChanges: false,
    isNew: true,
    currentUserId: "",
  });

  const currentUsageCount = usageList.length;
  const currentIsUsed = currentUsageCount > 0;

  useEffect(() => {
    let mounted = true;

    const loadTablePrefs = async () => {
      try {
        const raw = await AsyncStorage.getItem(TABLE_PREFS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (mounted && tablePrefsSourceRef.current !== "supabase") {
          tablePrefsSourceRef.current = "local";
          setTablePrefs(normalizeTableSettings(parsed));
        }
      } catch {
        // Les préférences locales sont optionnelles.
      }
    };

    loadTablePrefs();

    return () => {
      mounted = false;
    };
  }, []);

  const orderedFormats = useMemo(() => {
    return [...formats]
      .map((f) => ({
        ...f,
        label: FIXED_FORMAT_LABELS[f.format_type],
        payload:
          f.format_type === "poincon"
            ? normalizePoinconPayloadForSave(f.payload ?? {})
            : f.format_type === "tableau"
              ? normalizeTablePayloadForSave(f.payload ?? {}, true, tablePrefs)
              : f.payload ?? {},
      }))
      .sort((a, b) => FORMAT_ORDER.indexOf(a.format_type) - FORMAT_ORDER.indexOf(b.format_type));
  }, [formats, tablePrefs]);

  const availableTypes = useMemo(() => {
    const used = new Set(formats.map((f) => f.format_type));
    return FORMAT_OPTIONS.filter((option) => !used.has(option.id));
  }, [formats]);

  const hasChanges = useMemo(
    () => hasUnsavedChanges(balise, initialBalise, formats, initialFormats),
    [balise, initialBalise, formats, initialFormats]
  );

  useEffect(() => {
    latestStateRef.current = { balise, formats, hasChanges, isNew, currentUserId };
  }, [balise, formats, hasChanges, isNew, currentUserId]);

  const cardGap = 16;
  const cardWidth = isMobile ? width - 28 : Math.min(430, width - 180);

  const availableVerticalSpace = height - (isMobile ? 265 : 250);
  const cardMinHeight = isMobile ? Math.max(350, Math.min(510, availableVerticalSpace)) : Math.max(510, Math.min(690, availableVerticalSpace));

  const gridZoneHeight = isMobile ? Math.max(172, Math.min(280, cardMinHeight - 138)) : Math.max(245, Math.min(365, cardMinHeight - 145));

  const sidePadding = Math.max(14, (width - cardWidth) / 2);

  const scrollToFormatIndex = useCallback(
    (index: number, animated = true) => {
      const safeIndex = Math.max(0, index);
      setActiveFormatIndex(safeIndex);
      const x = safeIndex * (cardWidth + cardGap);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x, y: 0, animated });
      });
    },
    [cardWidth]
  );

  const refreshUsage = useCallback(async (targetBalise: Balise, userId: string) => {
    try {
      const nextUsage = await fetchParcoursUsageForBalise(targetBalise, userId);
      setUsageList(nextUsage);

      await AsyncStorage.setItem(
        BALISE_EDIT_DRAFT_KEY,
        JSON.stringify({ balise_id: targetBalise.id, balise_numero: targetBalise.numero_balise })
      );
    } catch {
      setUsageList([]);
    }
  }, []);

  const createBlankBalise = useCallback(async (userId: string) => {
    const nextNumero = await getNextNumeroFromSupabase(userId);
    const newBalise: Balise = {
      id: `new-${Date.now()}`,
      code: "",
      points: "0",
      frozen: false,
      numero_balise: nextNumero,
      user_id: userId,
    };

    setBalise(newBalise);
    setInitialBalise({ ...newBalise });
    setFormats([]);
    setInitialFormats([]);
    setIsNew(true);
    setUsageList([]);
    setActiveFormatIndex(0);
    setShowFormatPicker(true);
  }, []);

  const saveFromSnapshot = useCallback(
    async (snapshot?: {
      balise: Balise | null;
      formats: BaliseFormat[];
      hasChanges: boolean;
      isNew: boolean;
      currentUserId: string;
    }) => {
      if (savingRef.current) {
        saveAgainRef.current = true;
        return;
      }

      savingRef.current = true;

      try {
        const data = snapshot ?? latestStateRef.current;
        const currentBalise = data.balise;
        const currentFormats = data.formats;
        const currentIsNew = data.isNew;
        const userId = data.currentUserId;

        if (!currentBalise || !userId) return;

        const cleanNumeroText = String(currentBalise.numero_balise ?? "").trim();
        const numero = parseInt(cleanNumeroText, 10);

        if (!cleanNumeroText || Number.isNaN(numero) || numero <= 0) {
          Alert.alert("Numéro invalide", "Le numéro de balise doit être un nombre supérieur à 0.");
          return;
        }

        const codeValue = String(currentBalise.code ?? "").trim();

        const safeFormats = currentFormats
          .filter((f) => !!f.format_type)
          .map((f) => ({
            ...f,
            payload:
              f.format_type === "poincon"
                ? normalizePoinconPayloadForSave(f.payload ?? {})
                : f.format_type === "tableau"
                  ? normalizeTablePayloadForSave(f.payload ?? {}, true, tablePrefs)
                  : f.payload ?? {},
          }));

        if (currentIsNew || currentBalise.id.startsWith("new-")) {
          const inserted = await insertBaliseInSupabase(
            {
              ...currentBalise,
              code: codeValue,
              numero_balise: String(numero),
            },
            userId
          );

          const formatsForInserted = safeFormats.map((f) => ({
            ...f,
            balise_id: inserted.id,
            user_id: userId,
          }));

          await upsertFormatsInSupabase(inserted.id, userId, formatsForInserted);

          const finalBalise: Balise = {
            ...inserted,
            code: codeValue,
            points: String(inserted.points ?? ""),
          };

          const refreshedFormats = await fetchFormatsByBaliseId(inserted.id, userId);

          setBalise(finalBalise);
          setInitialBalise({ ...finalBalise });
          setFormats(refreshedFormats);
          setInitialFormats(JSON.parse(JSON.stringify(refreshedFormats)));
          setIsNew(false);

          latestStateRef.current = {
            balise: finalBalise,
            formats: refreshedFormats,
            hasChanges: false,
            isNew: false,
            currentUserId: userId,
          };

          await AsyncStorage.setItem(
            BALISE_EDIT_DRAFT_KEY,
            JSON.stringify({ balise_id: inserted.id, balise_numero: inserted.numero_balise })
          );

          await refreshUsage(finalBalise, userId);
          return;
        }

        const updatedBalise: Balise = {
          ...currentBalise,
          code: codeValue,
          numero_balise: String(numero),
        };

        await updateBaliseInSupabase(updatedBalise, userId);

        const formatsForUpdate = safeFormats.map((f) => ({
          ...f,
          balise_id: updatedBalise.id,
          user_id: userId,
        }));

        await upsertFormatsInSupabase(updatedBalise.id, userId, formatsForUpdate);

        const refreshedFormats = await fetchFormatsByBaliseId(updatedBalise.id, userId);

        setBalise(updatedBalise);
        setInitialBalise({ ...updatedBalise });
        setFormats(refreshedFormats);
        setInitialFormats(JSON.parse(JSON.stringify(refreshedFormats)));

        latestStateRef.current = {
          balise: updatedBalise,
          formats: refreshedFormats,
          hasChanges: false,
          isNew: false,
          currentUserId: userId,
        };

        await refreshUsage(updatedBalise, userId);
      } catch (e: any) {
        console.error("❌ save CreationBalise:", e);
        Alert.alert("Erreur d'enregistrement", e?.message || "La balise n'a pas pu être enregistrée.");
      } finally {
        savingRef.current = false;

        if (saveAgainRef.current) {
          saveAgainRef.current = false;
          setTimeout(() => saveFromSnapshot(latestStateRef.current), 150);
        }
      }
    },
    [refreshUsage, tablePrefs]
  );

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      try {
        setLoading(true);

        const userId = await getAuthenticatedUserId();
        if (!mounted) return;
        setCurrentUserId(userId);

        try {
          const { data: prefData, error: prefError } = await supabase
            .from("user_preferences")
            .select("value")
            .eq("user_id", userId)
            .eq("key", TABLE_USER_PREFS_KEY)
            .maybeSingle();

          if (!prefError && (prefData as any)?.value && mounted) {
            const settings = normalizeTableSettings((prefData as any).value);
            tablePrefsSourceRef.current = "supabase";
            setTablePrefs(settings);
            await AsyncStorage.setItem(TABLE_PREFS_KEY, JSON.stringify(settings)).catch(() => null);
          }
        } catch {
          // Les préférences Supabase sont optionnelles : le défaut local prend le relais.
        }

        let parsedDraft: BaliseEditDraft | null = null;

        try {
          const rawDraft = await AsyncStorage.getItem(BALISE_EDIT_DRAFT_KEY);
          parsedDraft = rawDraft ? JSON.parse(rawDraft) : null;
        } catch {
          parsedDraft = null;
        }

        if (parsedDraft?.balise_id) {
          try {
            const existing = await fetchBaliseById(parsedDraft.balise_id, userId);

            if (!existing) {
              await AsyncStorage.removeItem(BALISE_EDIT_DRAFT_KEY);
              await createBlankBalise(userId);
              initialLoadDoneRef.current = true;
              return;
            }

            const existingFormats = await fetchFormatsByBaliseId(parsedDraft.balise_id, userId);

            if (!mounted) return;

            const nextBalise = { ...existing, points: String(existing.points ?? "") };

            setBalise(nextBalise);
            setInitialBalise({ ...nextBalise });
            setFormats(existingFormats);
            setInitialFormats(JSON.parse(JSON.stringify(existingFormats)));
            setIsNew(false);
            setActiveFormatIndex(0);

            latestStateRef.current = {
              balise: nextBalise,
              formats: existingFormats,
              hasChanges: false,
              isNew: false,
              currentUserId: userId,
            };

            await refreshUsage(existing, userId);
            initialLoadDoneRef.current = true;
            return;
          } catch {
            await AsyncStorage.removeItem(BALISE_EDIT_DRAFT_KEY);
            await createBlankBalise(userId);
            initialLoadDoneRef.current = true;
            return;
          }
        }

        await createBlankBalise(userId);
        initialLoadDoneRef.current = true;
      } catch (e: any) {
        if (!mounted) return;
        Alert.alert("Erreur", e?.message || "Impossible d'ouvrir la balise.", [{ text: "OK", onPress: () => setPage("gestionBalises") }]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    boot();

    return () => {
      mounted = false;
    };
  }, [createBlankBalise, refreshUsage, setPage]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") saveFromSnapshot(latestStateRef.current);
    });

    return () => sub.remove();
  }, [saveFromSnapshot]);

  useEffect(() => {
    if (!orderedFormats.length) {
      setActiveFormatIndex(0);
      return;
    }
    if (activeFormatIndex > orderedFormats.length - 1) {
      setActiveFormatIndex(orderedFormats.length - 1);
      scrollToFormatIndex(orderedFormats.length - 1, false);
    }
  }, [orderedFormats.length, activeFormatIndex, scrollToFormatIndex]);

  const goBack = useCallback(async () => {
    await saveFromSnapshot(latestStateRef.current);
    setPage("gestionBalises");
  }, [saveFromSnapshot, setPage]);

  const updateBaliseDraft = useCallback((patch: Partial<Balise>) => {
    setBalise((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };

      latestStateRef.current = { ...latestStateRef.current, balise: next, hasChanges: true };
      return next;
    });
  }, []);

  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    if (loading) return;
    if (!hasChanges) return;
    if (!balise || !currentUserId) return;

    const timer = setTimeout(() => {
      saveFromSnapshot({ balise, formats, hasChanges, isNew, currentUserId });
    }, 900);

    return () => clearTimeout(timer);
  }, [balise, formats, hasChanges, isNew, currentUserId, loading, saveFromSnapshot]);

  const addFormat = useCallback(
    (type: BaliseFormatType) => {
      if (!balise) return;

      const created = createDefaultFormat(
        type,
        balise.id.startsWith("new-") ? null : balise.id,
        currentUserId || balise.user_id || null,
        tablePrefs
      );

      setFormats((prev) => {
        const next = [...prev.filter((f) => f.format_type !== type), created];
        setTimeout(() => {
          const nextOrdered = [...next].sort((a, b) => FORMAT_ORDER.indexOf(a.format_type) - FORMAT_ORDER.indexOf(b.format_type));
          const nextIndex = nextOrdered.findIndex((f) => f.id === created.id);
          scrollToFormatIndex(nextIndex, true);
        }, 60);
        return next;
      });

      setShowFormatPicker(false);
    },
    [balise, currentUserId, scrollToFormatIndex, tablePrefs]
  );

  const closeFormatPicker = useCallback(() => {
    if (formats.length === 0) return;
    setShowFormatPicker(false);
  }, [formats.length]);

  const saveTablePrefsFromPayload = useCallback(async (payload: Record<string, any>) => {
    const settings = normalizeTableSettings(payload);
    tablePrefsSourceRef.current = "local";
    setTablePrefs(settings);
    try {
      await AsyncStorage.setItem(TABLE_PREFS_KEY, JSON.stringify(settings));
    } catch {
      // Non bloquant : la balise reste sauvegardée même si la préférence locale échoue.
    }
  }, []);

  const removeFormat = useCallback(
    (formatId: string) => {
      setFormats((prev) => {
        const target = prev.find((f) => f.id === formatId);
        if (prev.length <= 1) return prev;

        const next = prev.filter((f) => f.id !== formatId);

        setTimeout(() => {
          const newIndex = Math.max(0, Math.min(activeFormatIndex, next.length - 1));
          scrollToFormatIndex(newIndex, true);
        }, 60);

        return next;
      });

      setActiveCellEditor((prev) => (prev?.formatId === formatId ? null : prev));
    },
    [activeFormatIndex, balise?.id, currentUserId, scrollToFormatIndex]
  );

  const updateFormatPayload = useCallback((formatId: string, payload: Record<string, any>) => {
    setFormats((prev) => {
      const next = prev.map((f) =>
        f.id === formatId
          ? {
              ...f,
              label: FIXED_FORMAT_LABELS[f.format_type],
              payload:
                f.format_type === "poincon"
                  ? normalizePoinconPayloadForSave(payload ?? {})
                  : f.format_type === "tableau"
                    ? normalizeTablePayloadForSave(payload ?? {}, true, tablePrefs)
                    : payload,
            }
          : f
      );

      latestStateRef.current = {
        ...latestStateRef.current,
        formats: next,
        hasChanges: true,
      };

      return next;
    });
  }, [tablePrefs]);

  const handleStartEditTableCell = useCallback((cell: ActiveCellEditor) => setActiveCellEditor(cell), []);
  const handleEditorChange = useCallback((text: string) => setActiveCellEditor((prev) => (prev ? { ...prev, value: text } : prev)), []);

  const handleEditorApply = useCallback(() => {
    if (!activeCellEditor) return;
    const { formatId, cellKey, value } = activeCellEditor;

    setFormats((prev) => {
      const next = prev.map((f) => {
        if (f.id !== formatId) return f;
        const payload = f.payload || {};
        const cells = payload.cells || {};
        const nextPayload = { ...payload, cells: { ...cells, [cellKey]: value } };
        return {
          ...f,
          payload: f.format_type === "tableau" ? normalizeTablePayloadForSave(nextPayload, true, tablePrefs) : nextPayload,
        };
      });

      latestStateRef.current = {
        ...latestStateRef.current,
        formats: next,
        hasChanges: true,
      };

      return next;
    });

    setActiveCellEditor(null);
  }, [activeCellEditor, tablePrefs]);

  const handleEditorClear = useCallback(() => {
    if (!activeCellEditor) return;
    const { formatId, cellKey } = activeCellEditor;

    setFormats((prev) => {
      const next = prev.map((f) => {
        if (f.id !== formatId) return f;
        const payload = f.payload || {};
        const cells = { ...(payload.cells || {}) };
        delete cells[cellKey];
        const nextPayload = { ...payload, cells };
        return {
          ...f,
          payload: f.format_type === "tableau" ? normalizeTablePayloadForSave(nextPayload, true, tablePrefs) : nextPayload,
        };
      });

      latestStateRef.current = {
        ...latestStateRef.current,
        formats: next,
        hasChanges: true,
      };

      return next;
    });

    setActiveCellEditor(null);
  }, [activeCellEditor, tablePrefs]);

  const handleExportPdf = useCallback(async () => {
    if (!balise) return;

    try {
      setExportingPdf(true);
      const html = buildBalisePdfHtml(balise, orderedFormats, usageList);
      const result = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: "application/pdf", dialogTitle: "Télécharger le PDF de la balise", UTI: "com.adobe.pdf" });
      } else {
        Alert.alert("PDF créé", "Le PDF a été généré.");
      }
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible de générer le PDF.");
    } finally {
      setExportingPdf(false);
    }
  }, [balise, orderedFormats, usageList]);

  const handleToggleFreeze = useCallback(() => {
    if (!latestStateRef.current.balise) return;
    updateBaliseDraft({ frozen: !latestStateRef.current.balise.frozen });
  }, [updateBaliseDraft]);

  const handleDelete = useCallback(() => {
    if (!balise || !currentUserId) return;

    const warningText = currentIsUsed
      ? "Attention : cette balise est encore utilisée dans un ou plusieurs parcours. Tu ne peux pas la supprimer directement tant qu’elle est liée. Tu peux d’abord la retirer des parcours ou la geler."
      : "Attention : cette suppression est définitive.";

    if (Platform.OS === "web") {
      if (!isNew && currentIsUsed) {
        window.alert(warningText);
        setShowDeleteInfo(true);
        setShowParcoursList(true);
        return;
      }

      const confirmed = window.confirm(warningText);
      if (!confirmed) return;

      (async () => {
        try {
          if (!isNew) await deleteBaliseInSupabase(balise.id, currentUserId);
          await AsyncStorage.removeItem(BALISE_EDIT_DRAFT_KEY);
          setPage("gestionBalises");
        } catch (e: any) {
          window.alert(e?.message || "Suppression impossible.");
        }
      })();

      return;
    }

    if (!isNew && currentIsUsed) {
      Alert.alert("Attention", warningText, [
        { text: "Fermer", style: "cancel" },
        {
          text: "Voir les parcours",
          onPress: () => {
            setShowDeleteInfo(true);
            setShowParcoursList(true);
          },
        },
      ]);
      return;
    }

    Alert.alert("Attention", warningText, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          try {
            if (!isNew) await deleteBaliseInSupabase(balise.id, currentUserId);
            await AsyncStorage.removeItem(BALISE_EDIT_DRAFT_KEY);
            setPage("gestionBalises");
          } catch (e: any) {
            Alert.alert("Erreur", e?.message || "Suppression impossible.");
          }
        },
      },
    ]);
  }, [balise, currentUserId, currentIsUsed, isNew, setPage]);

  const toggleParcoursSelection = useCallback((id: string) => {
    setSelectedParcoursIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const handleRemoveFromSelectedParcours = useCallback(async () => {
    if (!balise || !currentUserId) return;

    if (!selectedParcoursIds.length) {
      Alert.alert("Aucun parcours", "Sélectionne au moins un parcours.");
      return;
    }

    try {
      setRemovingFromParcours(true);
      await removeBaliseFromSelectedParcours(balise, selectedParcoursIds, currentUserId);
      await refreshUsage(balise, currentUserId);
      setSelectedParcoursIds([]);
      setShowDeleteInfo(false);
      Alert.alert("Succès", "La balise a bien été retirée des parcours sélectionnés.");
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible de retirer la balise des parcours.");
    } finally {
      setRemovingFromParcours(false);
    }
  }, [balise, currentUserId, refreshUsage, selectedParcoursIds]);

  const handleScrollEnd = useCallback(
    (event: any) => {
      const x = event?.nativeEvent?.contentOffset?.x ?? 0;
      const nextIndex = Math.round(x / (cardWidth + cardGap));
      setActiveFormatIndex(Math.max(0, Math.min(nextIndex, orderedFormats.length - 1)));
    },
    [cardWidth, orderedFormats.length]
  );

  if (loading || !balise) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text style={styles.loadingText}>Chargement de la balise...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar hidden={showFormatPicker} />

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable onPress={goBack} style={({ pressed }) => [styles.headerBtn, pressed && styles.pressedStyle]} hitSlop={10}>
            <ArrowLeft color="#fff" size={18} />
          </Pressable>

          <View style={styles.headerActions}>
            <Pressable
              onPress={handleExportPdf}
              style={({ pressed }) => [styles.iconBtn, exportingPdf && styles.iconBtnDisabled, pressed && !exportingPdf && styles.pressedStyle]}
              disabled={exportingPdf}
            >
              <FileText size={18} color="#fff" />
            </Pressable>

            <Pressable onPress={handleToggleFreeze} style={({ pressed }) => [styles.iconBtn, balise.frozen && styles.iconBtnFrozenActive, pressed && styles.pressedStyle]}>
              <Snowflake size={18} color="#fff" />
            </Pressable>

            <Pressable onPress={handleDelete} style={({ pressed }) => [styles.iconBtnRed, pressed && styles.pressedStyle]}>
              <Trash2 size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.header2}>
        <View style={styles.header2Chip}>
          <Text style={styles.header2LabelCentered}>N° balise</Text>
          <TextInput
            value={balise.numero_balise}
            onChangeText={(v) => updateBaliseDraft({ numero_balise: v.replace(/[^0-9]/g, "") })}
            keyboardType="number-pad"
            style={styles.header2InputCentered}
            placeholder="0"
            placeholderTextColor="rgba(255,255,255,0.72)"
            textAlign="center"
            returnKeyType="done"
          />
        </View>

        <View style={styles.header2Chip}>
          <Text style={styles.header2LabelCentered}>Points</Text>
          <TextInput
            value={String(balise.points ?? "")}
            onChangeText={(v) => updateBaliseDraft({ points: v })}
            keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
            style={styles.header2InputCentered}
            placeholder="0"
            placeholderTextColor="rgba(255,255,255,0.72)"
            textAlign="center"
            returnKeyType="done"
          />
        </View>

        <Pressable onPress={() => currentUsageCount > 0 && setShowParcoursList(true)} style={({ pressed }) => [styles.header2ChipSmall, pressed && currentUsageCount > 0 && styles.pressedStyle]}>
          <Text style={styles.header2LabelCentered}>Parcours</Text>
          <Text style={styles.header2InputCentered}>{currentUsageCount}</Text>
        </Pressable>
      </View>

      <View style={styles.contentZone}>
        <View style={styles.mainArea}>
          {orderedFormats.length === 0 ? (
            <View style={styles.emptyStateWrap}>
              <Text style={styles.emptyStateText}>Ajoute un nouveau format</Text>
            </View>
          ) : (
            <View style={styles.formatsSection}>
              <ScrollView
                ref={(ref) => {
                  scrollRef.current = ref;
                }}
                horizontal
                pagingEnabled={false}
                decelerationRate="fast"
                snapToInterval={cardWidth + cardGap}
                snapToAlignment="start"
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.horizontalCardsContent, { paddingHorizontal: sidePadding }]}
                keyboardShouldPersistTaps="handled"
                onMomentumScrollEnd={handleScrollEnd}
                onScrollEndDrag={handleScrollEnd}
                scrollEventThrottle={16}
              >
                {orderedFormats.map((format, index) => (
                  <View key={format.id} style={[styles.cardSlot, { width: cardWidth, marginRight: index === orderedFormats.length - 1 ? 0 : cardGap }]}> 
                    <FormatCard
                      format={format}
                      baliseCode={String(balise.code ?? "")}
                      cardWidth={cardWidth}
                      cardMinHeight={cardMinHeight}
                      gridZoneHeight={gridZoneHeight}
                      isMobile={isMobile}
                      tablePrefs={tablePrefs}
                      onRemove={() => removeFormat(format.id)}
                      onChangeCode={(v) => updateBaliseDraft({ code: v })}
                      onChangePayload={(payload) => updateFormatPayload(format.id, payload)}
                      onSaveTableDefaults={saveTablePrefsFromPayload}
                      onStartEditTableCell={handleStartEditTableCell}
                    />
                  </View>
                ))}
              </ScrollView>

              {orderedFormats.length > 1 ? (
                <View style={styles.paginationDots}>
                  {orderedFormats.map((_, index) => (
                    <Pressable key={`dot-${index}`} onPress={() => scrollToFormatIndex(index, true)} style={[styles.paginationDot, index === activeFormatIndex && styles.paginationDotActive]} />
                  ))}
                </View>
              ) : null}
            </View>
          )}
        </View>
      </View>

      {Platform.OS !== "web" && activeCellEditor ? (
        <View style={styles.floatingEditorBar}>
          <View style={styles.floatingEditorTop}>
            <Text style={styles.floatingEditorTitle}>Édition de la case</Text>
            <Pressable onPress={() => setActiveCellEditor(null)} style={({ pressed }) => [styles.floatingEditorClose, pressed && styles.pressedStyle]}>
              <X size={14} color="#334155" />
            </Pressable>
          </View>

          <TextInput
            value={activeCellEditor.value}
            onChangeText={handleEditorChange}
            placeholder={activeCellEditor.placeholder}
            placeholderTextColor="rgba(15,23,42,0.35)"
            style={styles.floatingEditorInput}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleEditorApply}
          />

          <View style={styles.floatingEditorActions}>
            <Pressable onPress={handleEditorClear} style={({ pressed }) => [styles.floatingEditorGhostBtn, pressed && styles.pressedStyle]}>
              <Text style={styles.floatingEditorGhostTxt}>Effacer</Text>
            </Pressable>

            <Pressable onPress={handleEditorApply} style={({ pressed }) => [styles.floatingEditorPrimaryBtn, pressed && styles.pressedStyle]}>
              <Text style={styles.floatingEditorPrimaryTxt}>Valider</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.fabWrap} pointerEvents="box-none">
        <Pressable
          onPress={() => setShowFormatPicker(true)}
          style={({ pressed }) => [styles.fab, availableTypes.length === 0 && styles.fabDisabled, pressed && availableTypes.length > 0 && styles.pressedStyle]}
          disabled={availableTypes.length === 0}
        >
          <Plus size={22} color="#0f172a" />
          <Text style={styles.fabText}>Créer un format</Text>
        </Pressable>
      </View>

      <Modal visible={showParcoursList} transparent animationType="fade" onRequestClose={() => setShowParcoursList(false)}>
        <View style={styles.modalCenterRoot}>
          <Pressable style={styles.centerBackdrop} onPress={() => setShowParcoursList(false)} />

          <View style={styles.usageModalCard}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>Présence dans les parcours</Text>
              <Pressable onPress={() => setShowParcoursList(false)} style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.pressedStyle]}>
                <X size={16} color="#334155" />
              </Pressable>
            </View>

            {showDeleteInfo && currentIsUsed ? (
              <Text style={styles.warningText}>
                Attention : cette balise est utilisée dans un ou plusieurs parcours. Elle ne peut pas être supprimée tant qu'elle y est encore liée.
              </Text>
            ) : null}

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {usageList.length === 0 ? (
                <View style={styles.noUsageWrap}>
                  <Text style={styles.noUsageText}>Aucun parcours trouvé.</Text>
                </View>
              ) : (
                usageList.map((p) => {
                  const checked = selectedParcoursIds.includes(p.id);

                  return (
                    <Pressable key={p.id} onPress={() => toggleParcoursSelection(p.id)} style={({ pressed }) => [styles.parcoursRow, checked && styles.parcoursRowChecked, pressed && styles.pressedStyle]}>
                      <View style={[styles.checkboxDark, checked && styles.checkboxDarkChecked]} />
                      <Text style={styles.parcoursName}>{p.nom}</Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <Pressable onPress={() => setShowParcoursList(false)} style={({ pressed }) => [styles.secondaryBtnInline, pressed && styles.pressedStyle]}>
                <Text style={styles.secondaryBtnTxt}>Fermer</Text>
              </Pressable>

              <Pressable
                onPress={handleRemoveFromSelectedParcours}
                disabled={selectedParcoursIds.length === 0 || removingFromParcours}
                style={({ pressed }) => [
                  styles.removeFromParcoursBtn,
                  (selectedParcoursIds.length === 0 || removingFromParcours) && styles.removeFromParcoursBtnDisabled,
                  pressed && selectedParcoursIds.length > 0 && !removingFromParcours && styles.pressedStyle,
                ]}
              >
                <Text style={styles.removeFromParcoursBtnTxt}>{removingFromParcours ? "Retrait..." : "Retirer la balise"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showFormatPicker} animationType="fade" transparent={false} presentationStyle="fullScreen" onRequestClose={closeFormatPicker}>
        <SafeAreaView style={styles.fullModalRoot}>
          <StatusBar hidden />
          <View style={styles.fullModalOverlay}>
            <View style={styles.fullModalSheet}>
              <View style={styles.modalTopRow}>
                <Text style={styles.modalTitle}>Ajouter un format</Text>
                {formats.length > 0 ? (
                  <Pressable onPress={closeFormatPicker} style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.pressedStyle]}>
                    <X size={16} color="#334155" />
                  </Pressable>
                ) : null}
              </View>

              {availableTypes.length === 0 ? (
                <Text style={styles.pickerEmptyText}>Les 4 formats sont déjà présents.</Text>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pickerScrollContent}>
                  <View style={styles.pickerGrid}>
                    {availableTypes.map((option) => (
                      <Pressable key={option.id} onPress={() => addFormat(option.id)} style={({ pressed }) => [styles.pickerItem, pressed && styles.pressedStyle]}>
                        <View style={styles.pickerItemRow}>
                          <PickerFormatIcon type={option.id} />
                          <Text style={styles.pickerItemTitleOnly}>{option.label}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

export default CreationBalise;

/* =========================
   Styles
========================= */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C_BG },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingText: { marginTop: 10, color: "rgba(15,23,42,0.7)", fontWeight: "600" },
  header: {
    backgroundColor: C_HEADER,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 6,
    zIndex: 20,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 44 },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnFrozenActive: { backgroundColor: C_BLUE_STRONG, borderColor: "rgba(255,255,255,0.18)" },
  iconBtnRed: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C_RED,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnDisabled: { opacity: 0.45 },
  header2: {
    backgroundColor: C_HEADER_2,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: "row",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    zIndex: 10,
  },
  header2Chip: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  header2ChipSmall: {
    width: 96,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  header2LabelCentered: { color: "rgba(255,255,255,0.84)", fontSize: 11, fontWeight: "800", marginBottom: 4, textAlign: "center" },
  header2InputCentered: { color: "#fff", fontSize: 22, fontWeight: "900", paddingVertical: 0, minHeight: 28, width: "100%", textAlign: "center" },
  contentZone: { flex: 1, backgroundColor: C_CONTENT_BG, borderTopWidth: 1, borderTopColor: C_CONTENT_BORDER, overflow: "visible" },
  mainArea: { flex: 1, minHeight: 0, overflow: "visible" },
  formatsSection: { flex: 1, paddingTop: 2, overflow: "visible" },
  horizontalCardsContent: { alignItems: "flex-start", paddingTop: 0, paddingBottom: 118 },
  cardSlot: { justifyContent: "flex-start", alignItems: "center", overflow: "visible", zIndex: 10 },
  emptyStateWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, paddingBottom: 86 },
  emptyStateText: { color: C_MUTED, fontSize: 19, fontWeight: "800", textAlign: "center" },
  formatCard: {
    backgroundColor: C_CARD,
    borderWidth: 1.5,
    borderColor: C_CARD_BORDER,
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    overflow: "visible",
    ...(Platform.OS === "ios" ? IOS_SHADOW : {}),
    elevation: Platform.OS === "android" ? 3 : 0,
    zIndex: 20,
  },
  formatCardTopCompact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 32 },
  formatTitleTextCompact: { color: C_TEXT, fontWeight: "900", fontSize: 16, flex: 1 },
  compactHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 38, overflow: "visible", zIndex: 50 },
  compactHeaderTitle: { color: C_TEXT, fontWeight: "900", fontSize: 16, flexShrink: 0 },
  compactHeaderControls: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0, overflow: "visible", zIndex: 60 },
  closeMiniBtnCompact: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  editorBlockCompact: { marginTop: 10, gap: 8 },
  editorBlockCompactTight: { marginTop: 8, gap: 6 },
  cardInputCompact: {
    backgroundColor: "rgba(0,0,0,0.035)",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 14,
    color: C_TEXT,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ web: 12, default: 12 }),
    fontSize: 16,
  },
  gridPickerWrap: { flex: 1, position: "relative", zIndex: 9999, minWidth: 0, overflow: "visible" },
  gridPickerButton: {
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  gridPickerButtonText: { color: C_TEXT, fontWeight: "800", fontSize: 14, flex: 1 },
  gridPickerBackdrop: {
    position: Platform.OS === "web" ? ("fixed" as any) : "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 99998,
    backgroundColor: "transparent",
  },
  gridPickerMenu: {
    position: "absolute",
    top: 42,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 4,
    zIndex: 99999,
    elevation: 50,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
  },
  gridPickerItem: { paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8 },
  gridPickerItemActive: { backgroundColor: "rgba(37,99,235,0.10)" },
  gridPickerItemText: { color: C_TEXT, fontWeight: "700", fontSize: 13 },
  gridPickerItemTextActive: { color: C_BLUE_SOFT },
  fixedContentZone: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  whiteGridWrapCompact: { backgroundColor: "#fff", borderWidth: 1, borderColor: C_BORDER, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  whiteGridRowCompact: { flexDirection: "row" },
  whiteGridCellCompact: { borderRadius: 9, borderWidth: 1, borderColor: "#d1d5db", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  blackDotCompact: { width: 12, height: 12, borderRadius: 999, backgroundColor: "#111827" },
  qrActionRowCompact: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" },
  qrModeBtn: {
    minHeight: 36,
    backgroundColor: C_BLUE_SOFT,
    borderRadius: 11,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  qrModeBtnDisabled: { opacity: 0.65 },
  qrScannerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.82)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  qrScannerPanel: {
    width: "100%",
    maxWidth: 430,
    borderRadius: 22,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.18)",
    padding: 14,
    gap: 12,
  },
  qrImportPanel: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 22,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.18)",
    padding: 14,
    gap: 12,
  },
  qrScannerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  qrScannerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  qrScannerTitle: { color: "#F8FAFC", fontSize: 16, fontWeight: "900" },
  qrScannerCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  qrScannerCameraWrap: {
    height: 330,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#020617",
    alignItems: "center",
    justifyContent: "center",
  },
  qrScannerCamera: { ...StyleSheet.absoluteFillObject },
  qrScannerFrame: {
    width: 220,
    height: 220,
    borderRadius: 22,
    borderWidth: 3,
    borderColor: "#38BDF8",
    backgroundColor: "transparent",
  },
  qrScannerHint: { color: "#CBD5E1", fontSize: 13, lineHeight: 18, fontWeight: "700", textAlign: "center" },
  qrImportOptionBtn: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.92)",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  qrImportOptionText: { color: "#0F172A", fontSize: 15, fontWeight: "900" },
  qrUrlInput: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(226,232,240,0.92)",
    backgroundColor: "#F8FAFC",
    color: "#0F172A",
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: "800",
  },
  qrImportValidateBtn: {
    minHeight: 42,
    borderRadius: 13,
    backgroundColor: C_BLUE_SOFT,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  generateBtnCompact: { backgroundColor: C_BLUE_SOFT, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 8 },
  generateBtnTextCompact: { color: "#fff", fontWeight: "800", fontSize: 14 },
  fakeQrWrapCompact: { backgroundColor: "#fff", borderWidth: 1, borderColor: C_BORDER, borderRadius: 14, padding: 10 },
  realQrWrapCompact: { backgroundColor: "#fff", borderWidth: 1, borderColor: C_BORDER, borderRadius: 14, padding: 12, alignItems: "center", justifyContent: "center" },
  fakeQrRow: { flexDirection: "row" },
  fakeQrPixelCompact: { width: 7, height: 7, backgroundColor: "#fff" },
  fakeQrPixelDark: { backgroundColor: "#111827" },
  tableToolsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" },
  codeLengthPickerWrap: { position: "relative", zIndex: 10 },
  codeLengthBackdrop: {
    position: Platform.OS === "web" ? ("fixed" as any) : "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 90000,
    backgroundColor: "transparent",
  },
  codeLengthMenuFloating: {
    position: "absolute",
    top: 78,
    alignSelf: "center",
    minWidth: 172,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 16,
    padding: 7,
    zIndex: 90001,
    elevation: 80,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
  },
  codeLengthMenuItem: { paddingHorizontal: 10, paddingVertical: 9, borderRadius: 9 },
  codeLengthMenuItemActive: { backgroundColor: "rgba(37,99,235,0.10)" },
  codeLengthMenuText: { color: C_TEXT, fontSize: 13, fontWeight: "800" },
  codeLengthMenuTextActive: { color: C_BLUE_SOFT },
  tableToolBtn: { backgroundColor: "#EAF3F9", borderWidth: 1, borderColor: "#C9D5DF", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  tableToolBtnText: { color: C_TEXT, fontWeight: "800", fontSize: 12 },
  tableToggleBtn: { backgroundColor: "#fff", borderWidth: 1, borderColor: C_BORDER, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  tableToggleBtnActive: { backgroundColor: C_BLUE_SOFT, borderColor: C_BLUE_SOFT },
  tableToggleText: { color: C_TEXT, fontWeight: "800", fontSize: 12 },
  tableToggleTextActive: { color: "#fff" },
  tableViewSwitchRow: { flexDirection: "row", alignSelf: "center", backgroundColor: "#EAF3F9", borderWidth: 1, borderColor: "#C9D5DF", borderRadius: 12, padding: 3, gap: 3 },
  tableViewSwitchBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 9 },
  tableViewSwitchBtnActive: { backgroundColor: C_BLUE_SOFT },
  tableViewSwitchText: { color: C_TEXT, fontSize: 12, fontWeight: "900" },
  tableViewSwitchTextActive: { color: "#fff" },
  tableViewport: { alignSelf: "stretch", overflow: "hidden" },
  tableViewportHorizontalContent: { alignItems: "flex-start", justifyContent: "flex-start", paddingHorizontal: 0 },
  tableFixedWrap: { backgroundColor: "#fff", borderWidth: 1, borderColor: C_BORDER, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  tableEditorRowCompact: { flexDirection: "row" },
  tableHeaderCorner: { backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "transparent", borderRadius: 10 },
  tableHeaderCell: { backgroundColor: "#EAF3F9", borderWidth: 1, borderColor: "#C9D5DF", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  tableHeaderText: { color: "#1F5B86", fontSize: 12, fontWeight: "900", textAlign: "center" },
  tableCellPressable: { backgroundColor: "#fff", borderWidth: 1, borderColor: C_BORDER, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  tableCellPressableText: { color: C_TEXT, fontSize: 13, fontWeight: "800", textAlign: "center", fontFamily: READABLE_CODE_FONT, fontVariant: ["tabular-nums"] },
  tableCellPressablePlaceholder: { color: "rgba(15,23,42,0.35)", fontWeight: "600" },
  tableCellInputWeb: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 10,
    textAlign: "center",
    color: C_TEXT,
    fontSize: 13,
    fontWeight: "800",
    fontFamily: READABLE_CODE_FONT,
    paddingHorizontal: 4,
    paddingVertical: 0,
    outlineStyle: "none" as any,
  },
  tableListViewport: { alignSelf: "stretch", backgroundColor: "#fff", borderWidth: 1, borderColor: C_BORDER, borderRadius: 18, padding: 8 },
  tableListContent: { gap: 7, paddingBottom: 6 },
  tableListRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#D8E2EA",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tableListCoord: { width: 42, color: "#1F5B86", fontSize: 13, fontWeight: "900" },
  tableListValue: { flex: 1, color: C_TEXT, fontSize: 13, fontWeight: "900", fontFamily: READABLE_CODE_FONT, fontVariant: ["tabular-nums"] },
  lengthModalRoot: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  lengthModalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.45)" },
  lengthModalCard: { width: "100%", maxWidth: 320, backgroundColor: "#fff", borderRadius: 22, padding: 16, borderWidth: 1, borderColor: C_BORDER },
  lengthModalTitle: { color: C_TEXT, fontSize: 18, fontWeight: "900", textAlign: "center", marginBottom: 12 },
  lengthModalItem: { borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, alignItems: "center", marginBottom: 8, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: C_BORDER },
  lengthModalItemActive: { backgroundColor: C_BLUE_SOFT, borderColor: C_BLUE_SOFT },
  lengthModalItemText: { color: C_TEXT, fontSize: 16, fontWeight: "900" },
  lengthModalItemTextActive: { color: "#fff" },
  floatingEditorBar: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 100,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 18,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 12,
  },
  floatingEditorTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 },
  floatingEditorTitle: { color: C_TEXT, fontWeight: "900", fontSize: 15, flex: 1 },
  floatingEditorClose: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" },
  floatingEditorInput: { backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: C_BORDER, borderRadius: 12, color: C_TEXT, paddingHorizontal: 12, paddingVertical: 12, fontSize: 18, fontWeight: "700", fontFamily: READABLE_CODE_FONT },
  floatingEditorActions: { marginTop: 10, flexDirection: "row", gap: 8 },
  floatingEditorGhostBtn: { flex: 1, backgroundColor: "rgba(0,0,0,0.06)", borderRadius: 12, paddingVertical: 11, alignItems: "center", justifyContent: "center" },
  floatingEditorGhostTxt: { color: C_TEXT, fontWeight: "800" },
  floatingEditorPrimaryBtn: { flex: 1, backgroundColor: C_BLUE_SOFT, borderRadius: 12, paddingVertical: 11, alignItems: "center", justifyContent: "center" },
  floatingEditorPrimaryTxt: { color: "#fff", fontWeight: "800" },
  fabWrap: { position: "absolute", bottom: 26, left: 0, right: 0, alignItems: "center", zIndex: 5 },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: C_SKY_STRONG,
    borderWidth: 1,
    borderColor: "#C9D5DF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
  fabDisabled: { opacity: 0.45 },
  fabText: { color: "#233548", fontWeight: "800" },
  paginationDots: { position: "absolute", left: 0, right: 0, bottom: 98, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, zIndex: 5 },
  paginationDot: { width: 9, height: 9, borderRadius: 999, backgroundColor: "rgba(15,23,42,0.18)" },
  paginationDotActive: { width: 22, backgroundColor: C_BLUE_SOFT },
  modalCenterRoot: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18 },
  centerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  usageModalCard: { width: "100%", maxWidth: 620, backgroundColor: "#fff", borderRadius: 24, padding: 18, borderWidth: 1, borderColor: C_BORDER },
  modalTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  modalTitle: { color: C_TEXT, fontSize: 20, fontWeight: "900", flex: 1 },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" },
  pickerEmptyText: { color: C_MUTED, fontWeight: "600" },
  pickerScrollContent: { paddingBottom: 8 },
  pickerGrid: { gap: 10 },
  pickerItem: { backgroundColor: "#EAF3F9", borderWidth: 1, borderColor: "#C9D5DF", borderRadius: 16, padding: 16 },
  pickerItemRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  pickerItemTitleOnly: { color: C_TEXT, fontWeight: "900", fontSize: 18, flexShrink: 1 },
  noUsageWrap: { paddingVertical: 18, alignItems: "center" },
  noUsageText: { color: C_MUTED, fontWeight: "600" },
  warningText: { color: "#b45309", fontWeight: "700", lineHeight: 20, marginBottom: 12 },
  parcoursRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 13,
    marginBottom: 9,
  },
  parcoursRowChecked: { backgroundColor: "rgba(16,185,129,0.10)", borderColor: "rgba(16,185,129,0.35)" },
  parcoursName: { flex: 1, color: C_TEXT, fontWeight: "700" },
  checkboxDark: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: "rgba(0,0,0,0.3)", backgroundColor: "transparent" },
  checkboxDarkChecked: { backgroundColor: "#10b981", borderColor: "#10b981" },
  modalActionsRow: { marginTop: 12, flexDirection: "row", gap: 10, alignItems: "center" },
  secondaryBtnInline: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.06)" },
  secondaryBtnTxt: { color: C_TEXT, fontWeight: "800" },
  removeFromParcoursBtn: { flex: 1, backgroundColor: "#ef4444", paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  removeFromParcoursBtnDisabled: { opacity: 0.5 },
  removeFromParcoursBtnTxt: { color: "#fff", fontWeight: "800", textAlign: "center" },
  pressedStyle: { opacity: 0.82 },
  fullModalRoot: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)" },
  fullModalOverlay: { flex: 1, justifyContent: "center", padding: 16 },
  fullModalSheet: { width: "100%", maxWidth: 620, alignSelf: "center", backgroundColor: "#fff", borderRadius: 26, padding: 18, borderWidth: 1, borderColor: C_BORDER, maxHeight: "92%" },
  miniIconBox: { width: 74, height: 74, borderRadius: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(15,23,42,0.15)", alignItems: "center", justifyContent: "center", flexDirection: "row" },
  miniCodeA: { fontSize: 22, fontWeight: "900", color: "#1e293b" },
  miniCodek: { fontSize: 20, fontWeight: "900", color: "#2563eb", marginLeft: 1, marginTop: 3 },
  miniCode5: { fontSize: 22, fontWeight: "900", color: "#f59e0b", marginLeft: 2 },
  miniCodeBang: { fontSize: 22, fontWeight: "900", color: "#ef4444", marginLeft: 2 },
  miniGridBox: { width: 74, height: 74, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(15,23,42,0.15)", padding: 4, justifyContent: "center" },
  miniGridRow: { flexDirection: "row", flex: 1 },
  miniGridCell: { flex: 1, borderWidth: 0.5, borderColor: "rgba(15,23,42,0.35)", alignItems: "center", justifyContent: "center" },
  miniGridDot: { width: 9, height: 9, borderRadius: 999, backgroundColor: "#111827" },
  miniQrBox: { width: 74, height: 74, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(15,23,42,0.15)", padding: 6, alignItems: "center", justifyContent: "center" },
  miniQrRow: { flexDirection: "row" },
  miniQrPixel: { width: 5, height: 5, backgroundColor: "#fff" },
  miniQrPixelDark: { backgroundColor: "#111827" },
  miniTableBox: { width: 74, height: 74, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(15,23,42,0.15)", overflow: "hidden" },
  miniTableRow: { flexDirection: "row", flex: 1 },
  miniTableCell: { flex: 1, borderWidth: 0.5, borderColor: "rgba(15,23,42,0.35)", alignItems: "center", justifyContent: "center" },
  miniTableText: { fontSize: 13, fontWeight: "800", color: "#1f2937" },
  rows3IconWrap: { width: 16, height: 14, justifyContent: "space-between" },
  rows3Line: { height: 2.2, borderRadius: 999, width: "100%" },
  cols3IconWrap: { width: 16, height: 14, flexDirection: "row", justifyContent: "space-between" },
  cols3Line: { width: 2.2, borderRadius: 999, height: "100%" },
});
