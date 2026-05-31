import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
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
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  Eye,
  FileText,
  Info,
  Plus,
  QrCode,
  Search,
  Snowflake,
  Table2,
} from "lucide-react-native";
import { supabase } from "./supabaseClient";
import { fetchAllBaliseFormatsCompat } from "./baliseFormatsCompat";
import InformationBalises from "./InformationBalises";
import BottomBar from "./ui/BottomBar";

/* =========================
   Types
========================= */
type Professeur = { user_id?: string | null } | null;

type Props = {
  setPage?: (p: any) => void;
  professeur?: Professeur;
};

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

type BaliseFormatType = "code" | "poincon" | "qrcode" | "tableau";

type BaliseFormat = {
  id: string;
  balise_id?: string | null;
  user_id?: string | null;
  format_type: BaliseFormatType;
  label?: string;
  is_default?: boolean;
  payload: Record<string, any>;
  created_at?: string | null;
};

type ViewMode = "numero" | "resume" | "code" | "tableau" | "poincon" | "qrcode";

type FrozenSavingMap = Record<string, boolean>;

const isViewMode = (value: any): value is ViewMode => {
  return ["numero", "resume", "code", "tableau", "poincon", "qrcode"].includes(String(value));
};

/* =========================
   Constantes UI
========================= */
const STORAGE_KEY = "@parcoursplus_balises_v3";
const BALISE_EDIT_DRAFT_KEY = "@parcoursplus_balise_edit_draft";
const VIEW_MODE_STORAGE_KEY = "@parcoursplus_gestion_balises_view_mode";
const SCROLL_Y_STORAGE_KEY = "@parcoursplus_gestion_balises_scroll_y";
const BOTTOM_BAR_HEIGHT = 78;

const C_BG = "#EDF2F6";
const C_HEADER = "#1F5B86";
const C_BORDER = "rgba(0,0,0,0.08)";
const C_TEXT = "#0f172a";
const C_CONTENT_BG = "#EEF3F7";
const C_CONTENT_BORDER = "#C6D2DC";
const C_SKY_STRONG = "#D6E8FF";

const C_TILE_USED_BG = "#DCFCE7";
const C_TILE_USED_BORDER = "#86EFAC";
const C_TILE_UNUSED_BG = "#FEE2E2";
const C_TILE_UNUSED_BORDER = "#FCA5A5";

const C_FROZEN_BORDER = "#2563EB";
const C_FROZEN_BG = "rgba(191,219,254,0.92)";
const C_FROZEN_ICON = "#1D4ED8";
const C_FROZEN_ICON_SOFT = "#64748B";

const IOS_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 8,
};

const VIEW_MODE_OPTIONS: { id: ViewMode; title: string; subtitle: string }[] = [
  { id: "numero", title: "Numéro seul", subtitle: "Voir uniquement les numéros des balises" },
  { id: "resume", title: "Numéro + formats", subtitle: "Voir le numéro et les symboles des formats existants" },
  { id: "code", title: "Numéro + code simple", subtitle: "Masquer les balises sans code simple" },
  { id: "tableau", title: "Numéro + tableau", subtitle: "Masquer les balises sans tableau" },
  { id: "poincon", title: "Numéro + poinçon", subtitle: "Masquer les balises sans poinçon" },
  { id: "qrcode", title: "Numéro + QR code", subtitle: "Masquer les balises sans QR code" },
];

/* =========================
   Helpers
========================= */
const normalizeToken = (value: any) => String(value ?? "").trim().toLowerCase();

const toNumeroString = (value: any) => {
  if (value == null) return "";
  if (typeof value === "number") return String(value);
  return String(value).trim();
};

const splitLooseString = (raw: string): string[] =>
  raw.split(/[;,|]/g).map((s) => s.trim()).filter(Boolean);

const extractTokensFromAny = (value: any): string[] => {
  if (value == null) return [];

  if (Array.isArray(value)) return value.flatMap((item) => extractTokensFromAny(item));

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
  return t === normalizeToken(balise.id) || t === normalizeToken(balise.numero_balise) || t === normalizeToken(balise.code);
};

const escapeHtml = (value: any) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const makeCellKey = (row: number, col: number) => `${row}-${col}`;

const buildFakeQrMatrix = (value: string, size = 13) => {
  const safe = value || "QR";
  let seed = 0;

  for (let i = 0; i < safe.length; i++) seed = (seed * 33 + safe.charCodeAt(i)) % 2147483647;

  const matrix: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      const inTopLeft = r < 5 && c < 5;
      const inTopRight = r < 5 && c >= size - 5;
      const inBottomLeft = r >= size - 5 && c < 5;

      if (inTopLeft || inTopRight || inBottomLeft) {
        const localR = inBottomLeft ? r - (size - 5) : r;
        const localC = inTopRight ? c - (size - 5) : c;
        const border = localR === 0 || localR === 4 || localC === 0 || localC === 4;
        const center = localR >= 1 && localR <= 3 && localC >= 1 && localC <= 3;
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

const mapBaliseFormatRow = (row: any): BaliseFormat => ({
  id: String(row.id),
  balise_id: row.balise_id ? String(row.balise_id) : null,
  user_id: row.user_id ?? null,
  format_type: row.format_type as BaliseFormatType,
  label: row.label ?? null,
  is_default: !!row.is_default,
  payload: row.payload && typeof row.payload === "object" ? row.payload : {},
  created_at: row.created_at ?? null,
});

/* =========================
   Mini previews
========================= */
const MiniQrPreview = ({ value, big = false }: { value: string; big?: boolean }) => {
  const matrix = buildFakeQrMatrix(value || "QR", big ? 15 : 11);
  return (
    <View style={[styles.miniPreviewBox, big && styles.miniPreviewBoxBig]}>
      <View style={styles.miniQrWrap}>
        {matrix.map((row, r) => (
          <View key={`qr-r-${r}`} style={styles.miniQrRow}>
            {row.map((filled, c) => (
              <View key={`qr-${r}-${c}`} style={[big ? styles.miniQrPixelBig : styles.miniQrPixel, filled && styles.miniQrPixelDark]} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
};

const MiniTablePreview = ({ payload, big = false }: { payload: Record<string, any>; big?: boolean }) => {
  const rows = clampGridSize(payload?.rows, 4);
  const cols = clampGridSize(payload?.cols, 4);
  const cells = payload?.cells || {};
  const previewRows = Math.min(rows, 4);
  const previewCols = Math.min(cols, 4);

  return (
    <View style={[styles.miniPreviewBox, big && styles.miniPreviewBoxBig]}>
      <View style={[styles.miniGridPreviewWrap, big && styles.miniGridPreviewWrapBig]}>
        {Array.from({ length: previewRows }).map((_, r) => (
          <View key={`t-r-${r}`} style={styles.miniGridPreviewRow}>
            {Array.from({ length: previewCols }).map((__, c) => {
              const key = makeCellKey(r, c);
              const value = String(cells[key] ?? "");
              return (
                <View key={key} style={[styles.miniGridPreviewCell, big && styles.miniGridPreviewCellBig]}>
                  {!!value ? <View style={[styles.miniTableInk, big && styles.miniTableInkBig]} /> : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
};

const MiniPoinconPreview = ({ payload, big = false }: { payload: Record<string, any>; big?: boolean }) => {
  const rows = clampGridSize(payload?.rows, 4);
  const cols = clampGridSize(payload?.cols, 4);
  const dots = payload?.dots || {};
  const previewRows = Math.min(rows, 4);
  const previewCols = Math.min(cols, 4);

  return (
    <View style={[styles.miniPreviewBox, big && styles.miniPreviewBoxBig]}>
      <View style={[styles.miniGridPreviewWrap, big && styles.miniGridPreviewWrapBig]}>
        {Array.from({ length: previewRows }).map((_, r) => (
          <View key={`p-r-${r}`} style={styles.miniGridPreviewRow}>
            {Array.from({ length: previewCols }).map((__, c) => {
              const key = makeCellKey(r, c);
              const active = !!dots[key];
              return (
                <View key={key} style={[styles.miniGridPreviewCell, big && styles.miniGridPreviewCellBig]}>
                  {active ? <View style={[styles.miniPunchDot, big && styles.miniPunchDotBig]} /> : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
};

const PunchSymbol = ({ size = 18, color = "#1f2937" }: { size?: number; color?: string }) => {
  const cell = Math.max(4, Math.round(size / 4));
  const dot = Math.max(2, Math.round(cell * 0.45));

  return (
    <View style={{ width: cell * 3 + 4, height: cell * 3 + 4, padding: 2, justifyContent: "center", alignItems: "center" }}>
      {Array.from({ length: 3 }).map((_, r) => (
        <View key={`row-${r}`} style={{ flexDirection: "row" }}>
          {Array.from({ length: 3 }).map((__, c) => {
            const showDot = (r === 0 && c === 1) || (r === 1 && c === 2) || (r === 2 && c === 0);
            return (
              <View key={`cell-${r}-${c}`} style={{ width: cell, height: cell, borderWidth: 1, borderColor: color, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
                {showDot ? <View style={{ width: dot, height: dot, borderRadius: 999, backgroundColor: color }} /> : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
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

const fetchBalisesFromSupabase = async (userId: string): Promise<Balise[]> => {
  const { data, error } = await supabase
    .from("balises")
    .select("id, code, points, frozen, numero_balise, user_id")
    .eq("user_id", userId);

  if (error) throw error;
  return (data || []).map(mapBaliseRow);
};

const fetchBaliseFormatsFromSupabase = async (userId: string): Promise<Map<string, BaliseFormat[]>> => {
  const map = new Map<string, BaliseFormat[]>();

  let data: any[] = [];
  try {
    data = await fetchAllBaliseFormatsCompat(supabase, userId);
  } catch (error: any) {
    const msg = String(error?.message || "").toLowerCase();
    if (msg.includes("does not exist") || msg.includes("relation")) return map;
    console.error("❌ fetchBaliseFormatsFromSupabase:", error);
    return map;
  }

  for (const row of data || []) {
    const format = mapBaliseFormatRow(row);
    const key = format.balise_id || "";
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(format);
  }

  return map;
};

const fetchParcoursUsageFromSupabase = async (allBalises: Balise[], userId: string): Promise<Map<string, ParcoursRef[]>> => {
  const usage = new Map<string, ParcoursRef[]>();
  allBalises.forEach((b) => usage.set(b.id, []));

  const { data, error } = await supabase
    .from("parcours")
    .select("id, nom, balises_ordre, user_id")
    .eq("user_id", userId);

  if (error) {
    console.error("❌ fetchParcoursUsageFromSupabase:", error);
    return usage;
  }

  for (const row of data || []) {
    const tokens = extractTokensFromAny((row as any)?.balises_ordre);
    const alreadyAdded = new Set<string>();

    for (const balise of allBalises) {
      const isPresent = tokens.some((t) => matchesBaliseToken(t, balise));
      if (isPresent && !alreadyAdded.has(balise.id)) {
        usage.get(balise.id)?.push({
          id: String((row as any).id),
          nom: String((row as any).nom ?? "Parcours sans nom"),
        });
        alreadyAdded.add(balise.id);
      }
    }
  }

  return usage;
};

const updateBaliseFrozenInSupabase = async ({
  baliseId,
  nextFrozen,
}: {
  baliseId: string;
  userId: string;
  nextFrozen: boolean;
}): Promise<boolean> => {
  const { data, error } = await supabase
    .from("balises")
    .update({ frozen: nextFrozen })
    .eq("id", baliseId)
    .select("id, frozen")
    .single();

  if (error) {
    console.error("❌ updateBaliseFrozenInSupabase:", error);
    throw error;
  }

  if (!data?.id) throw new Error("Aucune balise modifiée. Vérifie les droits RLS ou le user_id.");
  return !!data.frozen;
};

const fetchSavedViewMode = async (userId: string): Promise<ViewMode> => {
  try {
    const localValue = await AsyncStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (isViewMode(localValue)) return localValue;
  } catch {
    // noop
  }

  try {
    const { data, error } = await supabase
      .from("user_preferences")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "gestion_balises_view_mode")
      .maybeSingle();

    if (error) return "resume";

    const value = (data as any)?.value;
    const savedValue = typeof value === "string" ? value : value?.viewMode;

    if (isViewMode(savedValue)) {
      await AsyncStorage.setItem(VIEW_MODE_STORAGE_KEY, savedValue).catch(() => {});
      return savedValue;
    }
  } catch {
    // La table user_preferences peut ne pas encore exister.
  }

  return "resume";
};

const saveViewModePreference = async (userId: string, nextViewMode: ViewMode) => {
  await AsyncStorage.setItem(VIEW_MODE_STORAGE_KEY, nextViewMode).catch(() => {});

  try {
    await supabase.from("user_preferences").upsert(
      {
        user_id: userId,
        key: "gestion_balises_view_mode",
        value: { viewMode: nextViewMode },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,key" }
    );
  } catch {
    // Si la table n'existe pas encore, AsyncStorage garde quand même le choix sur l'appareil.
  }
};

/* =========================
   PDF helpers
========================= */
const buildPdfRows = (items: Balise[], usageMap: Map<string, ParcoursRef[]>) =>
  items.map((b) => [String(b.numero_balise || "—"), String(b.code || "—"), String((usageMap.get(b.id) || []).length), b.frozen ? "Oui" : "Non"]);

const exportPdfWeb = async (balises: Balise[], usageMap: Map<string, ParcoursRef[]>) => {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = (autoTableModule as any).default;
  const sorted = [...balises].sort((a, b) => parseInt(a.numero_balise || "0", 10) - parseInt(b.numero_balise || "0", 10));

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  autoTable(doc, {
    startY: 12,
    head: [["N°", "Code", "Parcours", "Gelée"]],
    body: buildPdfRows(sorted, usageMap),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.4, lineColor: [203, 213, 225], lineWidth: 0.1, textColor: [17, 24, 39] },
    headStyles: { fillColor: [229, 231, 235], textColor: [17, 24, 39], fontStyle: "bold" },
  });

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "recapitulatif-balises.pdf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const buildCompactHtmlForNativePdf = (balises: Balise[], usageMap: Map<string, ParcoursRef[]>) => {
  const sorted = [...balises].sort((a, b) => parseInt(a.numero_balise || "0", 10) - parseInt(b.numero_balise || "0", 10));
  const rows = sorted
    .map(
      (b) => `
      <tr>
        <td>${escapeHtml(b.numero_balise || "—")}</td>
        <td>${escapeHtml(b.code || "—")}</td>
        <td>${escapeHtml((usageMap.get(b.id) || []).length)}</td>
        <td>${b.frozen ? "Oui" : "Non"}</td>
      </tr>
    `
    )
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4 portrait; margin: 8mm; }
          * { box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 10px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #cbd5e1; padding: 4px; text-align: left; }
          th { background: #e5e7eb; }
        </style>
      </head>
      <body>
        <table>
          <thead><tr><th>N°</th><th>Code</th><th>Parcours</th><th>Gelée</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>
  `;
};

const exportPdfNative = async (balises: Balise[], usageMap: Map<string, ParcoursRef[]>) => {
  const html = buildCompactHtmlForNativePdf(balises, usageMap);
  const file = await Print.printToFileAsync({ html, base64: false });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", dialogTitle: "Partager le PDF", UTI: ".pdf" });
  } else {
    Alert.alert("PDF généré", "Le PDF a bien été généré.");
  }
};

/* =========================
   Composant principal
========================= */
const GestionBalises: React.FC<Props> = ({ setPage = () => {} }) => {
  const [balises, setBalisesState] = useState<Balise[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  const [parcoursUsageMap, setParcoursUsageMap] = useState<Map<string, ParcoursRef[]>>(new Map());
  const [formatsMap, setFormatsMap] = useState<Map<string, BaliseFormat[]>>(new Map());

  const [showFilters, setShowFilters] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showViewPicker, setShowViewPicker] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("resume");
  const [viewModeLoaded, setViewModeLoaded] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [frozenSavingMap, setFrozenSavingMap] = useState<FrozenSavingMap>({});

  const [searchTerm, setSearchTerm] = useState("");
  const [searchType, setSearchType] = useState<"code" | "number">("code");
  const [filterFrozenChecked, setFilterFrozenChecked] = useState(false);
  const [filterInactiveChecked, setFilterInactiveChecked] = useState(false);
  const [rangeFilterType, setRangeFilterType] = useState<"none" | "range" | "list">("none");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [scrollReady, setScrollReady] = useState(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const scrollYRef = useRef(0);
  const restoredScrollRef = useRef(false);

  const { width } = useWindowDimensions();
  const isVerySmall = width < 420;
  const isMobileLayout = width < 760;

  const columns = useMemo(() => {
    if (viewMode === "numero") {
      if (width >= 1400) return 10;
      if (width >= 1100) return 8;
      if (width >= 860) return 7;
      if (width >= 560) return 5;
      return 4;
    }

    if (width >= 1400) return 6;
    if (width >= 1100) return 5;
    if (width >= 860) return 4;
    if (width >= 560) return 3;
    return 2;
  }, [width, viewMode]);

  const gridHorizontalPadding = 12;
  const gap = 8;

  const tileSize = useMemo(() => {
    const totalGap = gap * (columns - 1);
    const usable = width - gridHorizontalPadding * 2 - totalGap;
    const raw = Math.floor(usable / columns);
    return viewMode === "numero" ? Math.max(88, raw) : Math.max(110, raw);
  }, [width, columns, viewMode]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const userId = await getAuthenticatedUserId();
      setCurrentUserId(userId);

      if (!viewModeLoaded) {
        const savedViewMode = await fetchSavedViewMode(userId);
        setViewMode(savedViewMode);
        setViewModeLoaded(true);
      }

      const [supaBalises, nextFormatsMap] = await Promise.all([
        fetchBalisesFromSupabase(userId),
        fetchBaliseFormatsFromSupabase(userId),
      ]);

      const usage = await fetchParcoursUsageFromSupabase(supaBalises, userId);

      setBalisesState(supaBalises);
      setParcoursUsageMap(usage);
      setFormatsMap(nextFormatsMap);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(supaBalises));
    } catch (e) {
      console.error("❌ loadAll GestionBalises:", e);
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          setBalisesState(Array.isArray(cached) ? cached.map(mapBaliseRow) : []);
        }
      } catch {
        // noop
      }
    } finally {
      setLoaded(true);
      setLoading(false);
    }
  }, [viewModeLoaded]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const sortedBalises = useMemo(() => {
    return [...balises].sort((a, b) => parseInt(a.numero_balise || "0", 10) - parseInt(b.numero_balise || "0", 10));
  }, [balises]);

  const filteredBalises = useMemo(() => {
    return sortedBalises.filter((balise) => {
      const numero = parseInt(balise.numero_balise || "0", 10);
      const searchLower = searchTerm.trim().toLowerCase();

      let matchesSearch = true;
      if (searchLower) {
        if (searchType === "code") matchesSearch = String(balise.code || "").toLowerCase().includes(searchLower);
        else matchesSearch = String(numero).includes(searchLower);
      }

      if (filterFrozenChecked && !balise.frozen) return false;

      const isUsedInParcours = (parcoursUsageMap.get(balise.id) || []).length > 0;
      const isInactive = !isUsedInParcours;
      if (filterInactiveChecked && !isInactive) return false;

      let matchesRangeFilter = true;
      if (rangeFilterType === "range" && (rangeStart || rangeEnd)) {
        const s = parseInt(rangeStart, 10);
        const e = parseInt(rangeEnd, 10);
        matchesRangeFilter = (Number.isNaN(s) || numero >= s) && (Number.isNaN(e) || numero <= e);
      } else if (rangeFilterType === "list" && listFilter.trim()) {
        const values = listFilter
          .split(";")
          .map((p) => p.trim())
          .filter(Boolean)
          .map((p) => Number(p))
          .filter((n) => !Number.isNaN(n));
        matchesRangeFilter = values.includes(numero);
      }

      if (!matchesSearch || !matchesRangeFilter) return false;

      const formats = formatsMap.get(balise.id) || [];
      const hasCode = !!String(balise.code || "").trim() || formats.some((f) => f.format_type === "code");
      const hasTableau = formats.some((f) => f.format_type === "tableau");
      const hasPoincon = formats.some((f) => f.format_type === "poincon");
      const hasQr = formats.some((f) => f.format_type === "qrcode");

      if (viewMode === "code") return hasCode;
      if (viewMode === "tableau") return hasTableau;
      if (viewMode === "poincon") return hasPoincon;
      if (viewMode === "qrcode") return hasQr;
      return true;
    });
  }, [sortedBalises, parcoursUsageMap, formatsMap, searchTerm, searchType, filterFrozenChecked, filterInactiveChecked, rangeFilterType, rangeStart, rangeEnd, listFilter, viewMode]);

  const openCreationBalise = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(BALISE_EDIT_DRAFT_KEY);
    } catch {
      // noop
    }
    setPage("CreationBalise");
  }, [setPage]);

  const openExistingBalise = useCallback(
    async (balise: Balise) => {
      try {
        await AsyncStorage.multiSet([
          [BALISE_EDIT_DRAFT_KEY, JSON.stringify({ balise_id: balise.id, balise_numero: balise.numero_balise })],
          [SCROLL_Y_STORAGE_KEY, String(scrollYRef.current || 0)],
        ]);
      } catch {
        // noop
      }
      setPage("CreationBalise");
    },
    [setPage]
  );

  useEffect(() => {
    if (loading) return;
    if (restoredScrollRef.current) return;

    restoredScrollRef.current = true;

    const restoreScroll = async () => {
      try {
        const raw = await AsyncStorage.getItem(SCROLL_Y_STORAGE_KEY);
        const y = Number(raw || 0);

        if (!Number.isFinite(y) || y <= 0) {
          setScrollReady(true);
          return;
        }

        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ y, animated: false });
          requestAnimationFrame(() => setScrollReady(true));
        });
      } catch {
        setScrollReady(true);
      }
    };

    restoreScroll();
  }, [loading]);

  const rememberScrollPosition = useCallback((event: any) => {
    const y = event?.nativeEvent?.contentOffset?.y ?? 0;
    scrollYRef.current = y;
    AsyncStorage.setItem(SCROLL_Y_STORAGE_KEY, String(y)).catch(() => {});
  }, []);

  const toggleFrozen = useCallback(
    async (balise: Balise) => {
      if (!balise?.id) return;
      if (frozenSavingMap[balise.id]) return;

      const previousFrozen = !!balise.frozen;
      const nextFrozen = !previousFrozen;

      try {
        setFrozenSavingMap((prev) => ({ ...prev, [balise.id]: true }));

        setBalisesState((prev) => prev.map((item) => (item.id === balise.id ? { ...item, frozen: nextFrozen } : item)));

        const userId = await getAuthenticatedUserId();
        const verifiedFrozen = await updateBaliseFrozenInSupabase({ baliseId: balise.id, userId, nextFrozen });

        setBalisesState((prev) => {
          const next = prev.map((item) => (item.id === balise.id ? { ...item, frozen: verifiedFrozen } : item));
          AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        });
      } catch (e: any) {
        console.error("❌ toggleFrozen:", e);
        setBalisesState((prev) => prev.map((item) => (item.id === balise.id ? { ...item, frozen: previousFrozen } : item)));
        Alert.alert("Gel impossible", e?.message || "La balise n'a pas pu être modifiée dans Supabase. Vérifie la colonne frozen et les règles RLS.");
      } finally {
        setFrozenSavingMap((prev) => {
          const next = { ...prev };
          delete next[balise.id];
          return next;
        });
      }
    },
    [frozenSavingMap]
  );

  const handleExportPdf = useCallback(async () => {
    try {
      setExportingPdf(true);
      const sorted = [...balises].sort((a, b) => parseInt(a.numero_balise || "0", 10) - parseInt(b.numero_balise || "0", 10));
      if (!sorted.length) {
        Alert.alert("Aucune balise", "Il n'y a aucune balise à exporter.");
        return;
      }
      if (Platform.OS === "web") await exportPdfWeb(sorted, parcoursUsageMap);
      else await exportPdfNative(sorted, parcoursUsageMap);
    } catch (e: any) {
      console.error("❌ handleExportPdf:", e);
      Alert.alert("Erreur", e?.message || "Impossible d'exporter le PDF.");
    } finally {
      setExportingPdf(false);
    }
  }, [balises, parcoursUsageMap]);

  const selectViewMode = useCallback(
    async (nextViewMode: ViewMode) => {
      setViewMode(nextViewMode);
      setShowViewPicker(false);

      try {
        const userId = currentUserId || (await getAuthenticatedUserId());
        if (!currentUserId) setCurrentUserId(userId);
        await saveViewModePreference(userId, nextViewMode);
      } catch (e) {
        console.error("❌ saveViewModePreference:", e);
      }
    },
    [currentUserId]
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, isVerySmall && styles.headerTitleSmall]} numberOfLines={isMobileLayout ? 2 : 1}>
              MES BALISES
            </Text>
            <Text style={styles.headerSubtitle}>{filteredBalises.length} balise{filteredBalises.length > 1 ? "s" : ""}</Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleExportPdf} style={styles.iconBtn} activeOpacity={0.9} disabled={exportingPdf}>
              <FileText size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowFilters((v) => !v)} style={styles.iconBtn} activeOpacity={0.9}>
              <Search size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowViewPicker(true)} style={styles.iconBtn} activeOpacity={0.9}>
              <Eye size={18} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowInfo(true)} style={styles.iconBtn} activeOpacity={0.9}>
              <Info size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.contentZone}>
        <ScrollView
          ref={(ref) => {
            scrollRef.current = ref;
          }}
          style={[styles.scroll, !scrollReady && styles.scrollHidden]}
          contentContainerStyle={{ paddingBottom: BOTTOM_BAR_HEIGHT + 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={(event) => {
            scrollYRef.current = event.nativeEvent.contentOffset.y;
          }}
          onMomentumScrollEnd={rememberScrollPosition}
          onScrollEndDrag={rememberScrollPosition}
          scrollEventThrottle={16}
        >
          {showFilters && (
            <View style={styles.filtersBox}>
              <Text style={styles.filtersTitle}>Options de recherche</Text>

              <View style={[styles.row, styles.searchRowResponsive]}>
                <View style={[styles.inputIconWrap, { flex: 1 }]}> 
                  <Search size={16} color="rgba(255,255,255,0.72)" style={styles.inputIcon} />
                  <TextInput
                    placeholder={`Rechercher par ${searchType === "code" ? "code" : "numéro"}...`}
                    placeholderTextColor="rgba(255,255,255,0.82)"
                    value={searchTerm}
                    onChangeText={setSearchTerm}
                    style={[styles.input, { paddingLeft: 36 }]}
                  />
                </View>

                <TouchableOpacity onPress={() => setSearchType((t) => (t === "code" ? "number" : "code"))} style={[styles.selectBtn, isVerySmall && styles.selectBtnMobile]} activeOpacity={0.85}>
                  <Text style={styles.selectBtnText}>{searchType === "code" ? "Code de balise" : "Numéro de balise"}</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.row, styles.checkboxWrap]}>
                <TouchableOpacity onPress={() => setFilterFrozenChecked((v) => !v)} style={styles.checkboxRow} activeOpacity={0.85}>
                  <View style={[styles.checkbox, filterFrozenChecked && styles.checkboxChecked]} />
                  <Text style={styles.checkboxLabel}>Balises gelées</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setFilterInactiveChecked((v) => !v)} style={styles.checkboxRow} activeOpacity={0.85}>
                  <View style={[styles.checkbox, filterInactiveChecked && styles.checkboxChecked]} />
                  <Text style={styles.checkboxLabel}>Balises inactives</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.labelLight}>Filtrer par numéro :</Text>

              <View style={[styles.row, { marginBottom: 6, flexWrap: "wrap" }]}> 
                <TouchableOpacity onPress={() => { setRangeFilterType("none"); setRangeStart(""); setRangeEnd(""); setListFilter(""); }} style={[styles.toggleChip, rangeFilterType === "none" && styles.toggleChipActive]} activeOpacity={0.85}>
                  <Text style={styles.toggleChipText}>Aucun</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setRangeFilterType("range"); setListFilter(""); }} style={[styles.toggleChip, rangeFilterType === "range" && styles.toggleChipActive]} activeOpacity={0.85}>
                  <Text style={styles.toggleChipText}>Plage</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setRangeFilterType("list"); setRangeStart(""); setRangeEnd(""); }} style={[styles.toggleChip, rangeFilterType === "list" && styles.toggleChipActive]} activeOpacity={0.85}>
                  <Text style={styles.toggleChipText}>Liste</Text>
                </TouchableOpacity>
              </View>

              {rangeFilterType === "range" && (
                <View style={[styles.row, styles.rangeRowResponsive]}>
                  <TextInput keyboardType="number-pad" placeholder="De" placeholderTextColor="rgba(255,255,255,0.82)" value={rangeStart} onChangeText={setRangeStart} style={[styles.input, styles.rangeInput]} />
                  <TextInput keyboardType="number-pad" placeholder="À" placeholderTextColor="rgba(255,255,255,0.82)" value={rangeEnd} onChangeText={setRangeEnd} style={[styles.input, styles.rangeInput]} />
                </View>
              )}

              {rangeFilterType === "list" && (
                <TextInput placeholder="Ex : 1; 5; 7" placeholderTextColor="rgba(255,255,255,0.82)" value={listFilter} onChangeText={setListFilter} style={[styles.input, { marginTop: 6 }]} />
              )}
            </View>
          )}

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#0ea5e9" />
              <Text style={styles.loadingText}>Chargement des balises...</Text>
            </View>
          ) : (
            <>
              <View style={[styles.grid, { gap }]}> 
                {filteredBalises.map((b) => {
                  const isUsedInParcours = (parcoursUsageMap.get(b.id) || []).length > 0;
                  const formats = formatsMap.get(b.id) || [];
                  const hasCode = !!String(b.code || "").trim() || formats.some((f) => f.format_type === "code");
                  const qrFormat = formats.find((f) => f.format_type === "qrcode");
                  const tableauFormat = formats.find((f) => f.format_type === "tableau");
                  const poinconFormat = formats.find((f) => f.format_type === "poincon");
                  const isSavingFrozen = !!frozenSavingMap[b.id];

                  return (
                    <TouchableOpacity
                      key={b.id}
                      style={[
                        styles.tile,
                        viewMode === "numero" && styles.tileNumeroOnly,
                        b.frozen && styles.tileFrozen,
                        {
                          width: tileSize,
                          height: tileSize,
                          backgroundColor: isUsedInParcours ? C_TILE_USED_BG : C_TILE_UNUSED_BG,
                          borderColor: b.frozen ? C_FROZEN_BORDER : isUsedInParcours ? C_TILE_USED_BORDER : C_TILE_UNUSED_BORDER,
                        },
                      ]}
                      activeOpacity={0.9}
                      onPress={() => openExistingBalise(b)}
                    >
                      {viewMode !== "numero" ? (
                        <View style={[styles.numBadge, b.frozen && styles.numBadgeFrozen]}>
                          <Text style={[styles.numBadgeTxt, b.frozen && styles.numBadgeTxtFrozen]}>{b.numero_balise || "—"}</Text>
                        </View>
                      ) : null}

                      {viewMode === "numero" ? (
                        <View style={styles.numeroOnlyCenter}>
                          <Text style={[styles.numeroOnlyText, width < 420 && styles.numeroOnlyTextSmall, b.frozen && styles.numeroOnlyTextFrozen]}>{b.numero_balise || "—"}</Text>
                        </View>
                      ) : viewMode === "resume" ? (
                        <View style={styles.tileContentMulti}>
                          <View style={styles.tileMiniRowLarge}>
                            {hasCode ? <View style={styles.largeIconChip}><FileText size={18} color="#1f2937" /></View> : null}
                            {tableauFormat ? <View style={styles.largeIconChip}><Table2 size={18} color="#1f2937" /></View> : null}
                            {poinconFormat ? <View style={styles.largeIconChip}><PunchSymbol size={18} color="#1f2937" /></View> : null}
                            {qrFormat ? <View style={styles.largeIconChip}><QrCode size={18} color="#1f2937" /></View> : null}
                          </View>
                        </View>
                      ) : viewMode === "code" ? (
                        <View style={styles.singlePreviewWrap}>
                          <Text
                            numberOfLines={2}
                            adjustsFontSizeToFit
                            minimumFontScale={0.8}
                            style={[styles.tileCodeFocused, width < 420 && styles.tileCodeFocusedSmall]}
                          >
                            {b.code || "—"}
                          </Text>
                        </View>
                      ) : viewMode === "tableau" ? (
                        <View style={styles.singlePreviewWrapBig}>{tableauFormat ? <MiniTablePreview payload={tableauFormat.payload || {}} big /> : null}</View>
                      ) : viewMode === "poincon" ? (
                        <View style={styles.singlePreviewWrapBig}>{poinconFormat ? <MiniPoinconPreview payload={poinconFormat.payload || {}} big /> : null}</View>
                      ) : viewMode === "qrcode" ? (
                        <View style={styles.singlePreviewWrapBig}>{qrFormat ? <MiniQrPreview value={String(qrFormat.payload?.value ?? "")} big /> : null}</View>
                      ) : null}

                      {b.frozen ? (
                        <Pressable
                          disabled={isSavingFrozen}
                          onPress={(event: any) => {
                            event?.stopPropagation?.();
                            toggleFrozen(b);
                          }}
                          style={({ pressed }) => [
                            styles.frozenDot,
                            styles.frozenDotActive,
                            isSavingFrozen && styles.frozenDotSaving,
                            pressed && !isSavingFrozen && styles.pressedStyle,
                          ]}
                        >
                          {isSavingFrozen ? (
                            <ActivityIndicator size="small" color={C_FROZEN_ICON} />
                          ) : (
                            <Snowflake size={15} color={C_FROZEN_ICON} />
                          )}
                        </Pressable>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {loaded && filteredBalises.length === 0 && (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyTitle}>Aucun résultat</Text>
                  <Text style={styles.emptyText}>Modifie tes filtres ou le mode d’affichage.</Text>
                </View>
              )}
            </>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      </View>

      <View style={styles.fabWrap}>
        <TouchableOpacity onPress={openCreationBalise} style={styles.fab} activeOpacity={0.9}>
          <Plus size={22} color="#0f172a" />
          <Text style={styles.fabText}>Créer une balise</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showViewPicker} transparent animationType="fade" onRequestClose={() => setShowViewPicker(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setShowViewPicker(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choisir l’affichage</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {VIEW_MODE_OPTIONS.map((option) => {
                const active = option.id === viewMode;
                return (
                  <TouchableOpacity key={option.id} activeOpacity={0.9} onPress={() => selectViewMode(option.id)} style={[styles.viewOptionRow, active && styles.viewOptionRowActive]}>
                    <View style={[styles.viewOptionDot, active && styles.viewOptionDotActive]} />
                    <View style={styles.viewOptionTextWrap}>
                      <Text style={styles.viewOptionTitle}>{option.title}</Text>
                      <Text style={styles.viewOptionSubtitle}>{option.subtitle}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <InformationBalises visible={showInfo} onClose={() => setShowInfo(false)} />
      <BottomBar currentPage="gestionBalises" onNavigate={setPage} />
    </SafeAreaView>
  );
};

export default GestionBalises;

/* =========================
   Styles
========================= */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C_BG },
  header: { backgroundColor: C_HEADER, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, shadowColor: "#000", shadowOpacity: 0.15, shadowOffset: { width: 0, height: 3 }, shadowRadius: 8, elevation: 6 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 44 },
  headerTitleWrap: { flex: 1, minWidth: 0, paddingRight: 4 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800", lineHeight: 22, letterSpacing: 0.5 },
  headerTitleSmall: { fontSize: 16, lineHeight: 20 },
  headerSubtitle: { color: "rgba(255,255,255,0.9)", fontSize: 12, marginTop: 2 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  contentZone: { flex: 1, backgroundColor: C_CONTENT_BG, borderTopWidth: 1, borderTopColor: C_CONTENT_BORDER },
  scroll: { flex: 1, paddingHorizontal: 12, paddingTop: 12 },
  scrollHidden: { opacity: 0 },
  filtersBox: { borderColor: "rgba(31,91,134,0.12)", borderWidth: 1, borderRadius: 16, backgroundColor: "#2D6C97", padding: 12, marginBottom: 12, ...(Platform.OS === "ios" ? IOS_SHADOW : {}), elevation: Platform.OS === "android" ? 2 : 0 },
  filtersTitle: { color: "#fff", fontWeight: "800", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center" },
  searchRowResponsive: { marginBottom: 8, gap: 8, flexWrap: "wrap" },
  rangeRowResponsive: { gap: 8, flexWrap: "wrap" },
  checkboxWrap: { marginBottom: 8, gap: 18, flexWrap: "wrap" },
  inputIconWrap: { position: "relative" },
  inputIcon: { position: "absolute", left: 10, top: 10 },
  input: { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.28)", borderWidth: 1, color: "#fff", paddingHorizontal: 12, paddingVertical: Platform.select({ web: 8, default: 10 }), borderRadius: 10 },
  selectBtn: { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.28)", borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  selectBtnMobile: { width: "100%" },
  selectBtnText: { color: "#fff", fontWeight: "700" },
  checkboxRow: { flexDirection: "row", alignItems: "center" },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", marginRight: 8, backgroundColor: "transparent" },
  checkboxChecked: { backgroundColor: "#22c55e" },
  checkboxLabel: { color: "#fff" },
  labelLight: { color: "rgba(255,255,255,0.92)", fontSize: 12, marginTop: 6, marginBottom: 6 },
  toggleChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.28)", borderWidth: 1, marginRight: 8, marginTop: 6 },
  toggleChipActive: { backgroundColor: "rgba(34,197,94,0.35)" },
  toggleChipText: { color: "#fff", fontWeight: "700" },
  rangeInput: { flex: 1, minWidth: 130 },
  loadingBox: { backgroundColor: "#fff", borderWidth: 1, borderColor: C_BORDER, borderRadius: 16, padding: 22, alignItems: "center", justifyContent: "center", marginTop: 4, ...(Platform.OS === "ios" ? IOS_SHADOW : {}), elevation: Platform.OS === "android" ? 2 : 0 },
  loadingText: { marginTop: 10, color: "rgba(15,23,42,0.7)", fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  tile: { borderWidth: 1, borderRadius: 14, marginBottom: 8, justifyContent: "center", alignItems: "center", overflow: "hidden", ...(Platform.OS === "ios" ? IOS_SHADOW : {}), elevation: Platform.OS === "android" ? 1 : 0 },
  tileNumeroOnly: { justifyContent: "center", alignItems: "center" },
  tileFrozen: { borderWidth: 3, borderColor: C_FROZEN_BORDER },
  numBadge: { position: "absolute", top: 6, left: 6, backgroundColor: "rgba(0,0,0,0.06)", borderWidth: 1, borderColor: C_BORDER, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, minWidth: 34, alignItems: "center", zIndex: 2 },
  numBadgeFrozen: { backgroundColor: "rgba(219,234,254,0.95)", borderColor: C_FROZEN_BORDER },
  numBadgeTxt: { color: C_TEXT, fontWeight: "800", fontSize: 12 },
  numBadgeTxtFrozen: { color: C_FROZEN_ICON },
  numeroOnlyCenter: { alignItems: "center", justifyContent: "center", paddingTop: 0 },
  numeroOnlyText: { color: C_TEXT, fontWeight: "900", fontSize: 26 },
  numeroOnlyTextFrozen: { color: C_FROZEN_ICON },
  numeroOnlyTextSmall: { fontSize: 20 },
  tileContentMulti: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", paddingTop: 18, paddingBottom: 8, paddingHorizontal: 6 },
  tileMiniRowLarge: { flexDirection: "row", alignItems: "center", justifyContent: "center", flexWrap: "wrap", gap: 6, maxWidth: "86%" },
  largeIconChip: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: "rgba(0,0,0,0.12)", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  singlePreviewWrap: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", paddingTop: 14, paddingBottom: 8, paddingHorizontal: 8 },
  singlePreviewWrapBig: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center", paddingTop: 14, paddingBottom: 8, paddingHorizontal: 2 },
  tileCodeFocused: {
    color: C_TEXT,
    fontWeight: "900",
    fontSize: 26,
    lineHeight: 30,
    textAlign: "center",
    width: "92%",
  },
  tileCodeFocusedSmall: {
    fontSize: 20,
    lineHeight: 24,
  },
  miniPreviewBox: { width: 28, height: 28, borderRadius: 7, borderWidth: 1, borderColor: "rgba(0,0,0,0.12)", backgroundColor: "#fff", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  miniPreviewBoxBig: { width: "84%", height: "84%", maxWidth: 90, maxHeight: 90, borderRadius: 12 },
  miniQrWrap: { padding: 2, backgroundColor: "#fff" },
  miniQrRow: { flexDirection: "row" },
  miniQrPixel: { width: 2, height: 2, backgroundColor: "#fff" },
  miniQrPixelBig: { width: 4, height: 4, backgroundColor: "#fff" },
  miniQrPixelDark: { backgroundColor: "#111827" },
  miniGridPreviewWrap: { width: 24, height: 24, justifyContent: "center", alignItems: "center" },
  miniGridPreviewWrapBig: { width: "92%", height: "92%" },
  miniGridPreviewRow: { flexDirection: "row" },
  miniGridPreviewCell: { width: 7, height: 7, borderWidth: 0.5, borderColor: "rgba(15,23,42,0.22)", alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  miniGridPreviewCellBig: { width: 18, height: 18 },
  miniPunchDot: { width: 3.5, height: 3.5, borderRadius: 999, backgroundColor: "#111827" },
  miniPunchDotBig: { width: 8, height: 8 },
  miniTableInk: { width: 4, height: 1.5, borderRadius: 999, backgroundColor: "#6b7280" },
  miniTableInkBig: { width: 10, height: 3 },
  frozenDot: { position: "absolute", top: 6, right: 6, width: 28, height: 28, borderWidth: 1.5, borderRadius: 999, alignItems: "center", justifyContent: "center", zIndex: 5 },
  frozenDotActive: { backgroundColor: C_FROZEN_BG, borderColor: C_FROZEN_BORDER },
  frozenDotInactive: { backgroundColor: "rgba(255,255,255,0.78)", borderColor: "rgba(100,116,139,0.28)" },
  frozenDotSaving: { opacity: 0.72 },
  emptyBox: { backgroundColor: "#fff", borderWidth: 1, borderColor: C_BORDER, borderRadius: 16, padding: 16, alignItems: "center", marginTop: 8, ...(Platform.OS === "ios" ? IOS_SHADOW : {}), elevation: Platform.OS === "android" ? 2 : 0 },
  emptyTitle: { color: C_TEXT, fontWeight: "800", fontSize: 16, marginTop: 6 },
  emptyText: { color: "rgba(15,23,42,0.7)", textAlign: "center", marginTop: 6 },
  fabWrap: { position: "absolute", bottom: BOTTOM_BAR_HEIGHT + 24, left: 0, right: 0, alignItems: "center" },
  fab: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 999, backgroundColor: C_SKY_STRONG, borderWidth: 1, borderColor: "#C9D5DF", shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 12, elevation: 6 },
  fabText: { color: "#233548", fontWeight: "800" },
  modalRoot: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  modalCard: { width: "100%", maxWidth: 620, backgroundColor: "#fff", borderRadius: 24, padding: 18, borderWidth: 1, borderColor: C_BORDER, maxHeight: "82%" },
  modalTitle: { color: C_TEXT, fontSize: 20, fontWeight: "900", marginBottom: 14 },
  viewOptionRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", backgroundColor: "rgba(0,0,0,0.02)", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 10 },
  viewOptionRowActive: { backgroundColor: "rgba(37,99,235,0.08)", borderColor: "rgba(37,99,235,0.3)" },
  viewOptionDot: { width: 14, height: 14, borderRadius: 999, borderWidth: 2, borderColor: "rgba(0,0,0,0.3)", backgroundColor: "#fff" },
  viewOptionDotActive: { borderColor: "#2563eb", backgroundColor: "#2563eb" },
  viewOptionTextWrap: { flex: 1 },
  viewOptionTitle: { color: C_TEXT, fontSize: 15, fontWeight: "900", marginBottom: 2 },
  viewOptionSubtitle: { color: "rgba(15,23,42,0.68)", fontSize: 13, lineHeight: 18 },
  pressedStyle: { opacity: 0.82 },
});
