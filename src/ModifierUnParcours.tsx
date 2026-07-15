// src/ModifierUnParcours.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import {
  ArrowLeft,
  Check,
  Eye,
  FolderOpen,
  Grid2x2,
  QrCode,
  Save,
  Search,
  Snowflake,
  Trash2,
  X,
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabaseClient";
import { fetchAllBaliseFormatsCompat } from "./baliseFormatsCompat";
import BottomBar from "./ui/BottomBar";

const READABLE_CODE_FONT = Platform.select({
  web: '"Menlo", "Consolas", "Courier New", monospace',
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});

/* =======================
   Types
======================= */
type Professeur = { user_id?: string | null } | null;

type Props = {
  setPage?: (p: any) => void;
  professeur?: Professeur;
  parcoursId?: string | null;
};

type ParcoursFormatType = "code" | "tableau" | "poincon" | "qrcode";

type Balise = {
  id: string;
  code: string;
  points?: number | string | null;
  frozen: boolean;
  numero_balise: string;
  user_id?: string | null;
};

type FolderItem = {
  id: string;
  name: string;
  parent_folder_id?: string | null;
};

type EvaluationBaremeOption = {
  id: string;
  name: string;
};

type ParcoursRecord = {
  id: string;
  nom: string | null;
  description: string | null;
  balises_ordre: string[] | null;
  balises_formats_ordre?: { balise_id: string; format_type: ParcoursFormatType }[] | null;
  format_types?: ParcoursFormatType[] | null;
  folder_id: string | null;
  format_type: ParcoursFormatType | null;
  allow_duplicate_balises: boolean;
  mode_evaluation: boolean;
  bareme_evaluation_id: string | null;
};

type SelectedBaliseOccurrence = Balise & {
  occurrenceKey: string;
  selectedFormatType: ParcoursFormatType;
};

type SelectedParcoursBalise = Balise & {
  selectedFormatType: ParcoursFormatType;
};

type SuccessFeedback = {
  title: string;
  message: string;
};

type BaliseFormatPayloadMap = Map<string, Partial<Record<ParcoursFormatType, Record<string, any>>>>;

type BaliseFormatsFetchResult = {
  typeMap: Map<string, Set<ParcoursFormatType>>;
  payloadMap: BaliseFormatPayloadMap;
};

/* =======================
   Couleurs / charte
======================= */
const C_BG = "#EDF2F6";
const C_HEADER = "#1F5B86";
const C_BORDER = "rgba(0,0,0,0.08)";
const C_TEXT = "#0f172a";
const C_MUTED = "rgba(15,23,42,0.68)";
const C_CONTENT_BG = "#EEF3F7";
const C_CONTENT_BORDER = "#C6D2DC";
const C_CARD = "#FFFDF7";
const C_CARD_BORDER = "#E7B81A";
const C_RED = "#ef4444";
const C_BLUE = "#2563eb";
const C_BLUE_STRONG = "#1d4ed8";
const C_GREEN = "#10b981";

const BOTTOM_BAR_HEIGHT = 78;
const STICKY_SAVE_HEIGHT = 84;
const SUCCESS_MESSAGE_DURATION_MS = 1400;

const IOS_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 8,
};

const FORMAT_OPTIONS: { id: ParcoursFormatType; label: string }[] = [
  { id: "code", label: "Code simple" },
  { id: "tableau", label: "Tableau" },
  { id: "poincon", label: "Poinçon" },
  { id: "qrcode", label: "QR code" },
];

const FORMAT_LABELS: Record<ParcoursFormatType, string> = {
  code: "Code simple",
  tableau: "Tableau",
  poincon: "Poinçon",
  qrcode: "QR code",
};

const PARCOURS_FORMAT_ORDER_STORAGE_PREFIX = "@parcoursplus_parcours_format_order:";

/* =======================
   Helpers
======================= */
const getGridColumns = (width: number) => {
  if (width >= 1200) return 8;
  if (width >= 980) return 7;
  if (width >= 820) return 6;
  if (width >= 680) return 5;
  if (width >= 430) return 5;
  return 4;
};

const reorderBalises = <T,>(items: T[], fromIndex: number, toIndex: number): T[] => {
  const copy = [...items];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const buildOccurrenceKey = (baliseId: string, occurrenceIndex: number) =>
  `${baliseId}__occ__${occurrenceIndex}`;

const buildSelectedOccurrences = (balises: SelectedParcoursBalise[]): SelectedBaliseOccurrence[] =>
  balises.map((b, index) => ({
    ...b,
    occurrenceKey: buildOccurrenceKey(b.id, index + 1),
  }));

const buildFormatKey = (baliseId: string, formatType: ParcoursFormatType) => `${baliseId}::${formatType}`;

const parseBaliseOrderToken = (
  token: string,
  fallbackFormatType: ParcoursFormatType | null
): { baliseId: string; formatType: ParcoursFormatType | null } => {
  const raw = String(token ?? "").trim();
  const match = raw.match(/^(.*)::format::(code|tableau|poincon|qrcode)$/);
  if (match) return { baliseId: match[1], formatType: match[2] as ParcoursFormatType };
  return { baliseId: raw, formatType: fallbackFormatType };
};

const buildBaliseFormatOrder = (items: SelectedParcoursBalise[]) =>
  items.map((item) => ({ balise_id: item.id, format_type: item.selectedFormatType }));

const normalizeBaliseFormatOrder = (value: any): { balise_id: string; format_type: ParcoursFormatType }[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const baliseId = String(item?.balise_id ?? item?.id ?? "").trim();
      const formatType = String(item?.format_type ?? "").trim() as ParcoursFormatType;
      if (!baliseId || !FORMAT_LABELS[formatType]) return null;
      return { balise_id: baliseId, format_type: formatType };
    })
    .filter(Boolean) as { balise_id: string; format_type: ParcoursFormatType }[];
};

const normalizeParcoursFormatTypes = (value: any, fallback?: ParcoursFormatType | null): ParcoursFormatType[] => {
  const raw = Array.isArray(value) ? value : [];
  const clean = raw
    .map((item) => String(item ?? "").trim() as ParcoursFormatType)
    .filter((formatType) => !!FORMAT_LABELS[formatType]);
  if (clean.length) return Array.from(new Set(clean));
  return fallback && FORMAT_LABELS[fallback] ? [fallback] : [];
};

const getLocalFormatOrderKey = (parcoursId: string) =>
  `${PARCOURS_FORMAT_ORDER_STORAGE_PREFIX}${parcoursId}`;

const loadLocalBaliseFormatOrder = async (parcoursId: string) => {
  try {
    const raw = await AsyncStorage.getItem(getLocalFormatOrderKey(parcoursId));
    if (!raw) return [];
    return normalizeBaliseFormatOrder(JSON.parse(raw));
  } catch {
    return [];
  }
};

const saveLocalBaliseFormatOrder = async (
  parcoursId: string,
  formatOrder: { balise_id: string; format_type: ParcoursFormatType }[] = []
) => {
  try {
    const clean = normalizeBaliseFormatOrder(formatOrder);
    if (!clean.length) {
      await AsyncStorage.removeItem(getLocalFormatOrderKey(parcoursId));
      return;
    }
    await AsyncStorage.setItem(getLocalFormatOrderKey(parcoursId), JSON.stringify(clean));
  } catch {
    // Le parcours reste sauvegardé dans Supabase même si ce secours local échoue.
  }
};

const getFolderPathLabel = (folderId: string | null, folders: FolderItem[]) => {
  if (!folderId) return "Accueil";

  const map = new Map(folders.map((f) => [f.id, f]));
  const path: string[] = [];
  let current = map.get(folderId);

  while (current) {
    path.unshift(current.name);
    current = current.parent_folder_id ? map.get(current.parent_folder_id) : undefined;
  }

  return path.length ? path.join(" / ") : "Dossier";
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

const clampGridSize = (value: any, fallback = 4) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(2, Math.min(6, Math.round(n)));
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

const normalizePoinconPayload = (payload: any) => {
  const source = payload && typeof payload === "object" ? payload : {};
  const rows = clampGridSize(source.rows, 4);
  const cols = clampGridSize(source.cols, 4);

  const rawDots =
    source.dots && typeof source.dots === "object" && !Array.isArray(source.dots)
      ? source.dots
      : cellsToDots(source.cells, rows, cols);

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

  return { rows, cols, dots };
};

const hasFormatForBalise = (
  balise: Balise,
  formatType: ParcoursFormatType | null,
  baliseFormatsMap: Map<string, Set<ParcoursFormatType>>
) => {
  if (!formatType) return false;

  if (formatType === "code") {
    return String(balise.code || "").trim().length > 0;
  }

  return !!baliseFormatsMap.get(balise.id)?.has(formatType);
};

const filterBalisesByFormat = (
  list: Balise[],
  formatType: ParcoursFormatType | null,
  baliseFormatsMap: Map<string, Set<ParcoursFormatType>>
) => {
  if (!formatType) return [];
  return list.filter((b) => hasFormatForBalise(b, formatType, baliseFormatsMap));
};

const getBaliseFormatsForSelection = (
  balise: Balise,
  selectedFormatTypes: ParcoursFormatType[],
  baliseFormatsMap: Map<string, Set<ParcoursFormatType>>
) => selectedFormatTypes.filter((formatType) => hasFormatForBalise(balise, formatType, baliseFormatsMap));

const hasAnySelectedFormatForBalise = (
  balise: Balise,
  selectedFormatTypes: ParcoursFormatType[],
  baliseFormatsMap: Map<string, Set<ParcoursFormatType>>
) => getBaliseFormatsForSelection(balise, selectedFormatTypes, baliseFormatsMap).length > 0;

const getPayloadForBalise = (
  baliseId: string,
  formatType: ParcoursFormatType | null,
  payloadMap: BaliseFormatPayloadMap
): Record<string, any> | null => {
  if (!formatType) return null;
  return payloadMap.get(baliseId)?.[formatType] ?? null;
};

/* =======================
   Aperçus visuels
======================= */
function PunchSymbol({ size = 16, color = C_TEXT }: { size?: number; color?: string }) {
  const cell = Math.max(4, Math.round(size / 4));
  const dot = Math.max(2, Math.round(cell * 0.46));

  return (
    <View
      style={{
        width: cell * 3 + 4,
        height: cell * 3 + 4,
        padding: 2,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {Array.from({ length: 3 }).map((_, r) => (
        <View key={`p-row-${r}`} style={{ flexDirection: "row" }}>
          {Array.from({ length: 3 }).map((__, c) => {
            const showDot = (r === 0 && c === 1) || (r === 1 && c === 2) || (r === 2 && c === 0);
            return (
              <View
                key={`p-cell-${r}-${c}`}
                style={{
                  width: cell,
                  height: cell,
                  borderWidth: 1,
                  borderColor: color,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#fff",
                }}
              >
                {showDot ? (
                  <View
                    style={{
                      width: dot,
                      height: dot,
                      borderRadius: 999,
                      backgroundColor: color,
                    }}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const PoinconPreview = ({ payload, size }: { payload: any; size: number }) => {
  const normalized = normalizePoinconPayload(payload);
  const rows = normalized.rows;
  const cols = normalized.cols;
  const dots = normalized.dots;
  const gap = Math.max(1, Math.floor(size * 0.035));
  const cell = Math.max(8, Math.floor((size - gap * (Math.max(rows, cols) - 1)) / Math.max(rows, cols)));
  const dot = Math.max(4, Math.floor(cell * 0.32));

  return (
    <View style={styles.previewCenter}>
      <View style={styles.poinconPreviewWrap}>
        {Array.from({ length: rows }).map((_, r) => (
          <View
            key={`preview-r-${r}`}
            style={[styles.poinconPreviewRow, { gap, marginBottom: r === rows - 1 ? 0 : gap }]}
          >
            {Array.from({ length: cols }).map((__, c) => {
              const active = !!dots[makeCellKey(r, c)];
              return (
                <View
                  key={`preview-c-${r}-${c}`}
                  style={[
                    styles.poinconPreviewCell,
                    { width: cell, height: cell, borderRadius: Math.max(4, Math.floor(cell * 0.18)) },
                  ]}
                >
                  {active ? <View style={[styles.poinconPreviewDot, { width: dot, height: dot }]} /> : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
};

const TableauPreview = ({ payload, size }: { payload: any; size: number }) => {
  const rows = clampGridSize(payload?.rows, 4);
  const cols = clampGridSize(payload?.cols, 4);
  const gap = Math.max(1, Math.floor(size * 0.035));
  const cell = Math.max(8, Math.floor((size - gap * (Math.max(rows, cols) - 1)) / Math.max(rows, cols)));

  return (
    <View style={styles.previewCenter}>
      <View style={styles.poinconPreviewWrap}>
        {Array.from({ length: rows }).map((_, r) => (
          <View key={`table-r-${r}`} style={[styles.poinconPreviewRow, { gap, marginBottom: r === rows - 1 ? 0 : gap }]}> 
            {Array.from({ length: cols }).map((__, c) => (
              <View
                key={`table-c-${r}-${c}`}
                style={[
                  styles.poinconPreviewCell,
                  { width: cell, height: cell, borderRadius: Math.max(4, Math.floor(cell * 0.18)) },
                ]}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
};

const QrPreview = ({ size }: { size: number }) => {
  const pixel = Math.max(2, Math.floor(size / 14));
  const matrix = [
    [1, 1, 1, 0, 1, 0, 1, 1, 1],
    [1, 0, 1, 0, 1, 1, 1, 0, 1],
    [1, 1, 1, 0, 0, 1, 1, 1, 1],
    [0, 0, 1, 1, 1, 0, 0, 1, 0],
    [1, 1, 0, 1, 0, 1, 1, 0, 1],
    [0, 1, 1, 0, 1, 1, 0, 1, 0],
    [1, 1, 1, 0, 1, 0, 1, 1, 1],
    [1, 0, 1, 1, 0, 1, 1, 0, 1],
    [1, 1, 1, 0, 1, 1, 1, 1, 1],
  ];

  return (
    <View style={styles.previewCenter}>
      <View style={styles.qrPreviewWrap}>
        {matrix.map((row, r) => (
          <View key={`qrp-r-${r}`} style={{ flexDirection: "row" }}>
            {row.map((filled, c) => (
              <View
                key={`qrp-${r}-${c}`}
                style={{ width: pixel, height: pixel, backgroundColor: filled ? C_TEXT : "#fff" }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
};

/* =======================
   Supabase helpers
======================= */
const fetchAllBalises = async (): Promise<Balise[]> => {
  const { data, error } = await supabase
    .from("balises")
    .select("id, code, points, frozen, numero_balise, user_id");

  if (error) {
    console.error("❌ fetchAllBalises:", error);
    return [];
  }

  return (data || [])
    .filter((b: any) => !!b?.id && b?.numero_balise !== null)
    .map((b: any) => ({
      id: String(b.id),
      code: String(b.code ?? ""),
      points: b.points ?? 0,
      frozen: !!b.frozen,
      numero_balise:
        typeof b.numero_balise === "number"
          ? String(b.numero_balise)
          : String(b.numero_balise ?? ""),
      user_id: b.user_id ?? null,
    }))
    .sort((a, b) => parseInt(a.numero_balise || "0", 10) - parseInt(b.numero_balise || "0", 10));
};

const fetchAllBaliseFormats = async (): Promise<BaliseFormatsFetchResult> => {
  const typeMap = new Map<string, Set<ParcoursFormatType>>();
  const payloadMap: BaliseFormatPayloadMap = new Map();

  let data: any[] = [];
  try {
    data = await fetchAllBaliseFormatsCompat(supabase);
  } catch (error: any) {
    const msg = String(error?.message || "").toLowerCase();
    if (msg.includes("does not exist") || msg.includes("relation")) {
      return { typeMap, payloadMap };
    }
    console.error("❌ fetchAllBaliseFormats:", error);
    return { typeMap, payloadMap };
  }

  (data || []).forEach((row: any) => {
    const baliseId = String(row?.balise_id ?? "");
    const formatType = row?.format_type as ParcoursFormatType | undefined;
    if (!baliseId || !formatType) return;

    if (!typeMap.has(baliseId)) typeMap.set(baliseId, new Set<ParcoursFormatType>());
    typeMap.get(baliseId)!.add(formatType);

    const current = payloadMap.get(baliseId) ?? {};
    current[formatType] =
      formatType === "poincon"
        ? normalizePoinconPayload(row?.payload ?? {})
        : row?.payload && typeof row.payload === "object"
          ? row.payload
          : {};
    payloadMap.set(baliseId, current);
  });

  return { typeMap, payloadMap };
};

const fetchAllFolders = async (): Promise<FolderItem[]> => {
  const { data, error } = await supabase
    .from("parcours_folders")
    .select("id, name, parent_folder_id")
    .order("name", { ascending: true });

  if (error) {
    console.error("❌ fetchAllFolders:", error);
    return [];
  }

  return (data || []).map((f: any) => ({
    id: String(f.id),
    name: String(f.name ?? ""),
    parent_folder_id: f.parent_folder_id ?? null,
  }));
};

const fetchEvaluationBaremes = async (): Promise<EvaluationBaremeOption[]> => {
  const { data, error } = await supabase
    .from("group_evaluation_bareme_pages")
    .select("id, page_name, page_number")
    .order("page_number", { ascending: true });

  if (error) {
    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("does not exist") || msg.includes("relation")) return [];
    console.error("❌ fetchEvaluationBaremes:", error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: String(row.id),
    name: String(row.page_name || `Evaluation ${row.page_number || ""}`).trim(),
  }));
};

const fetchParcoursById = async (parcoursId: string): Promise<ParcoursRecord | null> => {
  const primary = await supabase
    .from("parcours")
    .select("id, nom, description, balises_ordre, balises_formats_ordre, format_types, folder_id, format_type, allow_duplicate_balises, mode_evaluation, bareme_evaluation_id")
    .eq("id", parcoursId)
    .single();

  if (!primary.error && primary.data) {
    const d = primary.data;
    const dbFormatOrder = normalizeBaliseFormatOrder((d as any).balises_formats_ordre);
    const localFormatOrder = dbFormatOrder.length ? [] : await loadLocalBaliseFormatOrder(parcoursId);
    return {
      id: String(d.id),
      nom: d.nom ?? "",
      description: d.description ?? "",
      balises_ordre: Array.isArray(d.balises_ordre) ? d.balises_ordre : [],
      balises_formats_ordre: dbFormatOrder.length ? dbFormatOrder : localFormatOrder,
      format_types: normalizeParcoursFormatTypes((d as any).format_types, (d as any).format_type),
      folder_id: d.folder_id ?? null,
      format_type: ((d as any).format_type ?? null) as ParcoursFormatType | null,
      allow_duplicate_balises: !!(d as any).allow_duplicate_balises,
      mode_evaluation: !!(d as any).mode_evaluation,
      bareme_evaluation_id: (d as any).bareme_evaluation_id ?? null,
    };
  }

  const primaryMsg = String(primary.error?.message || "").toLowerCase();
  const canRetryWithoutNewColumns = primaryMsg.includes("balises_formats_ordre") || primaryMsg.includes("format_types");

  const fallbackSelect = canRetryWithoutNewColumns
    ? "id, nom, description, balises_ordre, folder_id, format_type, allow_duplicate_balises, mode_evaluation, bareme_evaluation_id"
    : "id, nom, description, balises_ordre, folder_id";

  const fallback = await supabase
    .from("parcours")
    .select(fallbackSelect as any)
    .eq("id", parcoursId)
    .single();

  if (fallback.error || !fallback.data) {
    console.error("❌ fetchParcoursById:", primary.error || fallback.error);
    return null;
  }

  const d: any = fallback.data;
  const localFormatOrder = await loadLocalBaliseFormatOrder(parcoursId);
  return {
    id: String(d.id),
    nom: d.nom ?? "",
    description: d.description ?? "",
    balises_ordre: Array.isArray(d.balises_ordre) ? d.balises_ordre : [],
    balises_formats_ordre: localFormatOrder,
    format_types: normalizeParcoursFormatTypes(null, (d as any).format_type),
    folder_id: d.folder_id ?? null,
    format_type: ((d as any).format_type ?? null) as ParcoursFormatType | null,
    allow_duplicate_balises: !!(d as any).allow_duplicate_balises,
    mode_evaluation: !!(d as any).mode_evaluation,
    bareme_evaluation_id: (d as any).bareme_evaluation_id ?? null,
  };
};

const updateParcoursInSupabase = async (
  parcoursId: string,
  payload: {
    nom: string;
    description: string;
    balises_ordre: string[];
    balises_formats_ordre?: { balise_id: string; format_type: ParcoursFormatType }[];
    format_types?: ParcoursFormatType[];
    folder_id: string | null;
    professeur_id?: string | null;
    format_type: ParcoursFormatType;
    allow_duplicate_balises: boolean;
    mode_evaluation: boolean;
    bareme_evaluation_id: string | null;
  }
) => {
  await saveLocalBaliseFormatOrder(parcoursId, payload.balises_formats_ordre);

  const primary = await supabase
    .from("parcours")
    .update(payload)
    .eq("id", parcoursId)
    .select()
    .single();

  if (!primary.error) return primary.data;

  const msg = String(primary.error.message || "").toLowerCase();
  const missingFormat = msg.includes("format_type");
  const missingFormatTypes = msg.includes("format_types");
  const missingFormatOrder = msg.includes("balises_formats_ordre");
  const missingDup = msg.includes("allow_duplicate_balises");
  const missingEval = msg.includes("mode_evaluation") || msg.includes("bareme_evaluation_id");

  if (!missingFormat && !missingFormatTypes && !missingFormatOrder && !missingDup && !missingEval) throw primary.error;

  const fallbackPayload: any = {
    nom: payload.nom,
    description: payload.description,
    balises_ordre: payload.balises_ordre,
    folder_id: payload.folder_id,
    professeur_id: payload.professeur_id ?? null,
  };

  const fallback = await supabase
    .from("parcours")
    .update(fallbackPayload)
    .eq("id", parcoursId)
    .select()
    .single();

  if (fallback.error) throw fallback.error;

  return fallback.data;
};

/* =======================
   Composant principal
======================= */
const ModifierUnParcours: React.FC<Props> = ({
  setPage = () => {},
  professeur = null,
  parcoursId = null,
}) => {
  const cleanParcoursId =
    typeof parcoursId === "string" && parcoursId.trim().length > 0 ? parcoursId.trim() : null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successFeedback, setSuccessFeedback] = useState<SuccessFeedback | null>(null);

  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFormatTypes, setSelectedFormatTypes] = useState<ParcoursFormatType[]>([]);
  const [allowDuplicateBalises, setAllowDuplicateBalises] = useState(false);
  const [modeEvaluation, setModeEvaluation] = useState(false);
  const [selectedEvaluationBaremeId, setSelectedEvaluationBaremeId] = useState<string | null>(null);
  const [tablePreview, setTablePreview] = useState<{ balise: Balise; payload: Record<string, any> } | null>(null);

  const [balises, setBalises] = useState<Balise[]>([]);
  const [selectedBalises, setSelectedBalises] = useState<SelectedParcoursBalise[]>([]);
  const [baliseFormatsMap, setBaliseFormatsMap] = useState<Map<string, Set<ParcoursFormatType>>>(new Map());
  const [baliseFormatPayloadMap, setBaliseFormatPayloadMap] = useState<BaliseFormatPayloadMap>(new Map());

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [evaluationBaremes, setEvaluationBaremes] = useState<EvaluationBaremeOption[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderModalVisible, setFolderModalVisible] = useState(false);

  const [searchBalise, setSearchBalise] = useState("");
  const [showOnlyFrozen, setShowOnlyFrozen] = useState(false);

  const { width, height } = useWindowDimensions();
  const columns = getGridColumns(width);
  const gap = 8;
  const sidePadding = 12 * 2;
  const cardPadding = 14 * 2;
  const tileSize = Math.max(
    54,
    Math.floor((width - sidePadding - cardPadding - gap * (columns - 1)) / columns)
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!cleanParcoursId) {
        Alert.alert("Erreur", "Aucun parcours sélectionné.");
        setPage("gestionParcours");
        return;
      }

      try {
        setLoading(true);

        const [allBalises, allFolders, allFormats, allEvaluationBaremes, parcours] = await Promise.all([
          fetchAllBalises(),
          fetchAllFolders(),
          fetchAllBaliseFormats(),
          fetchEvaluationBaremes(),
          fetchParcoursById(cleanParcoursId),
        ]);

        if (cancelled) return;

        if (!parcours) {
          Alert.alert("Erreur", "Impossible de charger ce parcours.");
          setPage("gestionParcours");
          return;
        }

        setBalises(allBalises);
        setFolders(allFolders);
        setEvaluationBaremes(allEvaluationBaremes);
        setBaliseFormatsMap(allFormats.typeMap);
        setBaliseFormatPayloadMap(allFormats.payloadMap);

        setNom(parcours.nom || "");
        setDescription(parcours.description || "");
        setSelectedFormatTypes(normalizeParcoursFormatTypes(parcours.format_types, parcours.format_type));
        setAllowDuplicateBalises(!!parcours.allow_duplicate_balises);
        setModeEvaluation(!!parcours.mode_evaluation);
        setSelectedEvaluationBaremeId(parcours.bareme_evaluation_id || null);
        setSelectedFolderId(parcours.folder_id || null);
        setSearchBalise("");
        setShowOnlyFrozen(false);

        const orderedIds = Array.isArray(parcours.balises_ordre) ? parcours.balises_ordre : [];
        const savedFormatOrder = normalizeBaliseFormatOrder(parcours.balises_formats_ordre);
        const orderedBalises =
          savedFormatOrder.length > 0
            ? (savedFormatOrder
                .map((entry) => {
                  const balise = allBalises.find((b) => b.id === entry.balise_id);
                  if (!balise) return null;
                  return { ...balise, selectedFormatType: entry.format_type };
                })
                .filter(Boolean) as SelectedParcoursBalise[])
            : (orderedIds
                .map((token) => {
                  const parsed = parseBaliseOrderToken(String(token), parcours.format_type || null);
                  const balise = allBalises.find((b) => b.id === parsed.baliseId);
                  if (!balise || !parsed.formatType) return null;
                  return { ...balise, selectedFormatType: parsed.formatType };
                })
                .filter(Boolean) as SelectedParcoursBalise[]);

        const formatsFromOrder = Array.from(new Set(orderedBalises.map((b) => b.selectedFormatType)));
        if (formatsFromOrder.length) setSelectedFormatTypes(formatsFromOrder);

        setSelectedBalises(orderedBalises);
      } catch (e) {
        console.error("❌ load ModifierUnParcours:", e);
        if (!cancelled) Alert.alert("Erreur", "Chargement impossible.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [cleanParcoursId, setPage]);

  const selectedOccurrences = useMemo(() => buildSelectedOccurrences(selectedBalises), [selectedBalises]);
  const selectedKeys = useMemo(
    () => new Set(selectedBalises.map((b) => buildFormatKey(b.id, b.selectedFormatType))),
    [selectedBalises]
  );

  const selectedCountMap = useMemo(() => {
    const map = new Map<string, number>();
    selectedBalises.forEach((b) => {
      const key = buildFormatKey(b.id, b.selectedFormatType);
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [selectedBalises]);

  const filteredBaliseEntries = useMemo(() => {
    const q = searchBalise.trim().toLowerCase();

    return balises.flatMap((b) => {
      const formats = getBaliseFormatsForSelection(b, selectedFormatTypes, baliseFormatsMap);
      if (!formats.length) return [];

      const matchesSearch =
        !q || String(b.code || "").toLowerCase().includes(q) || String(b.numero_balise).includes(q);

      const matchesFrozen = !showOnlyFrozen || b.frozen;
      if (!matchesSearch || !matchesFrozen) return [];

      return formats.map((formatType) => ({ balise: b, formatType }));
    });
  }, [balises, searchBalise, showOnlyFrozen, selectedFormatTypes, baliseFormatsMap]);

  const toggleBalise = useCallback(
    (balise: Balise, selectedFormatType: ParcoursFormatType) => {
      setSelectedBalises((prev) => {
        const exists = prev.some((b) => b.id === balise.id && b.selectedFormatType === selectedFormatType);
        const nextItem = { ...balise, selectedFormatType };

        if (allowDuplicateBalises) return [...prev, nextItem];

        if (exists) {
          const firstIndex = prev.findIndex((b) => b.id === balise.id && b.selectedFormatType === selectedFormatType);
          if (firstIndex < 0) return prev;
          return prev.filter((_, index) => index !== firstIndex);
        }

        return [...prev, nextItem];
      });
    },
    [allowDuplicateBalises]
  );

  const removeSelectedBaliseAt = useCallback((indexToRemove: number) => {
    setSelectedBalises((prev) => prev.filter((_, index) => index !== indexToRemove));
  }, []);

  const moveSelectedUp = useCallback((index: number) => {
    if (index <= 0) return;
    setSelectedBalises((prev) => reorderBalises(prev, index, index - 1));
  }, []);

  const moveSelectedDown = useCallback((index: number) => {
    setSelectedBalises((prev) => {
      if (index >= prev.length - 1) return prev;
      return reorderBalises(prev, index, index + 1);
    });
  }, []);

  const handleToggleFormat = useCallback(
    (nextFormat: ParcoursFormatType) => {
      setSelectedFormatTypes((prev) => {
        const exists = prev.includes(nextFormat);
        const next = exists ? prev.filter((format) => format !== nextFormat) : [...prev, nextFormat];
        if (exists) {
          setSelectedBalises((current) => current.filter((b) => b.selectedFormatType !== nextFormat));
        }
        setSearchBalise("");
        return next;
      });
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (saving) return;

    if (!cleanParcoursId) {
      Alert.alert("Erreur", "Aucun parcours sélectionné.");
      return;
    }

    if (!nom.trim()) {
      Alert.alert("Nom manquant", "Le nom du parcours est obligatoire.");
      return;
    }

    if (selectedFormatTypes.length === 0) {
      Alert.alert("Format manquant", "Choisis au moins un format de balise.");
      return;
    }

    if (selectedBalises.length === 0) {
      Alert.alert("Balises manquantes", "Choisis au moins une balise.");
      return;
    }

    if (modeEvaluation && !selectedEvaluationBaremeId) {
      Alert.alert("Barème manquant", "Choisis un barème d'évaluation pour ce parcours.");
      return;
    }

    const allCompatible = selectedBalises.every((b) =>
      hasFormatForBalise(b, b.selectedFormatType, baliseFormatsMap)
    );

    if (!allCompatible) {
      Alert.alert("Erreur", "Certaines balises ne correspondent pas à leur format choisi.");
      return;
    }

    const payload = {
      nom: nom.trim(),
      description: description.trim(),
      balises_ordre: selectedBalises.map((b) => b.id),
      balises_formats_ordre: buildBaliseFormatOrder(selectedBalises),
      format_types: selectedFormatTypes,
      folder_id: selectedFolderId,
      professeur_id: professeur?.user_id ?? null,
      format_type: selectedFormatTypes[0],
      allow_duplicate_balises: allowDuplicateBalises,
      mode_evaluation: modeEvaluation,
      bareme_evaluation_id: modeEvaluation ? selectedEvaluationBaremeId : null,
    };

    try {
      setSaving(true);
      await updateParcoursInSupabase(cleanParcoursId, payload);
      setSuccessFeedback({
        title: "Mis à jour avec succès",
        message: "Le parcours a bien été enregistré.",
      });
      await wait(SUCCESS_MESSAGE_DURATION_MS);
      setSuccessFeedback(null);
      setPage("MesParcours");
    } catch (e: any) {
      console.error("❌ update parcours:", e);
      setSuccessFeedback(null);
      Alert.alert("Erreur", e?.message || "Impossible de modifier le parcours.");
    } finally {
      setSaving(false);
    }
  }, [
    cleanParcoursId,
    nom,
    description,
    selectedFormatTypes,
    selectedBalises,
    baliseFormatsMap,
    selectedFolderId,
    professeur,
    allowDuplicateBalises,
    modeEvaluation,
    selectedEvaluationBaremeId,
    saving,
    setPage,
  ]);

  const renderBalisePreview = useCallback(
    (balise: Balise, formatType: ParcoursFormatType, size: number) => {
      if (formatType === "poincon") {
        const payload = getPayloadForBalise(balise.id, "poincon", baliseFormatPayloadMap);
        return <PoinconPreview payload={payload} size={Math.max(42, Math.floor(size * 0.66))} />;
      }

      if (formatType === "tableau") {
        const payload = getPayloadForBalise(balise.id, "tableau", baliseFormatPayloadMap);
        return <TableauPreview payload={payload} size={Math.max(42, Math.floor(size * 0.66))} />;
      }

      if (formatType === "qrcode") return <QrPreview size={Math.max(42, Math.floor(size * 0.66))} />;

      return (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={[styles.tileCode, { fontSize: size >= 78 ? 18 : size >= 66 ? 15 : 13 }]}
        >
          {balise.code || "—"}
        </Text>
      );
    },
    [baliseFormatPayloadMap]
  );

  const getSelectedSubtitle = useCallback(
    (balise: SelectedParcoursBalise) => {
      if (balise.selectedFormatType === "code") return balise.code || "Sans code";
      return FORMAT_LABELS[balise.selectedFormatType];
    },
    []
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C_BLUE} />
          <Text style={styles.loadingText}>Chargement du parcours...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderFormatButton = (option: { id: ParcoursFormatType; label: string }) => {
    const active = selectedFormatTypes.includes(option.id);

    return (
      <TouchableOpacity
        key={option.id}
        activeOpacity={0.92}
        onPress={() => handleToggleFormat(option.id)}
        style={[styles.formatCard, active && styles.formatCardActive]}
      >
        <View style={styles.formatCardIconWrap}>
          {option.id === "code" ? (
            <Text style={[styles.formatIconText, active && styles.formatIconTextActive]}>A1</Text>
          ) : option.id === "tableau" ? (
            <Grid2x2 size={18} color={active ? C_BLUE : C_TEXT} />
          ) : option.id === "poincon" ? (
            <PunchSymbol size={18} color={active ? C_BLUE : C_TEXT} />
          ) : (
            <QrCode size={18} color={active ? C_BLUE : C_TEXT} />
          )}
        </View>

        <Text style={[styles.formatCardText, active && styles.formatCardTextActive]}>{option.label}</Text>
      </TouchableOpacity>
    );
  };

  const renderSelectedList = () => (
    <View style={styles.card}>
      <View style={styles.sectionHeaderInline}>
        <Text style={styles.sectionTitle}>Ordre des balises</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{selectedOccurrences.length}</Text>
        </View>
      </View>

      {selectedOccurrences.length === 0 ? (
        <View style={styles.emptyBoxSmall}>
          <Text style={styles.emptyText}>Aucune balise</Text>
        </View>
      ) : (
        <View style={{ gap: 8, marginTop: 8 }}>
          {selectedOccurrences.map((b, index) => (
            <View key={b.occurrenceKey} style={styles.selectedRow}>
              <View style={styles.selectedOrderBadge}>
                <Text style={styles.selectedOrderBadgeText}>{index + 1}</Text>
              </View>

              {b.selectedFormatType === "poincon" ? (
                <View style={styles.selectedMiniPreview}>
                  <PoinconPreview payload={getPayloadForBalise(b.id, "poincon", baliseFormatPayloadMap)} size={38} />
                </View>
              ) : null}

              <View style={styles.selectedMain}>
                <Text style={styles.selectedTitle} numberOfLines={1}>
                  B{b.numero_balise} • {getSelectedSubtitle(b)}
                </Text>
              </View>

              {b.frozen ? (
                <View style={styles.frozenMiniChip}>
                  <Snowflake size={12} color="#1e3a8a" />
                </View>
              ) : null}

              <View style={styles.selectedActions}>
                <TouchableOpacity onPress={() => moveSelectedUp(index)} style={styles.orderBtn} activeOpacity={0.85}>
                  <Text style={styles.orderBtnText}>↑</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => moveSelectedDown(index)} style={styles.orderBtn} activeOpacity={0.85}>
                  <Text style={styles.orderBtnText}>↓</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => removeSelectedBaliseAt(index)}
                  style={[styles.orderBtn, styles.removeBtn]}
                  activeOpacity={0.85}
                >
                  <Trash2 size={15} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );

  const renderBalisesPicker = () => (
    <View style={styles.cardBalisesZone}>
      <View style={styles.cardBalisesTop}>
        <Text style={styles.sectionTitle}>Choisir les balises</Text>

        <View style={styles.filtersRow}>
          <View style={styles.searchWrap}>
            <Search size={16} color="rgba(15,23,42,0.45)" style={styles.searchIcon} />
            <TextInput
              value={searchBalise}
              onChangeText={setSearchBalise}
              placeholder="Rechercher"
              placeholderTextColor="rgba(15,23,42,0.4)"
              style={styles.searchInput}
            />
          </View>

          <TouchableOpacity
            onPress={() => setShowOnlyFrozen((v) => !v)}
            style={[styles.filterChip, showOnlyFrozen && styles.filterChipActive]}
            activeOpacity={0.9}
          >
            <Snowflake size={15} color={showOnlyFrozen ? "#fff" : "#1e3a8a"} />
            <Text style={[styles.filterChipText, showOnlyFrozen && styles.filterChipTextActive]}>Gelées</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={[styles.balisesScrollableArea, { maxHeight: Math.max(260, height * 0.42) }]}
        contentContainerStyle={{ paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.helperText}>
          {filteredBaliseEntries.length} choix compatible{filteredBaliseEntries.length > 1 ? "s" : ""}
        </Text>

        <View style={[styles.grid, { gap }]}>
          {filteredBaliseEntries.map(({ balise: b, formatType }) => {
            const formatKey = buildFormatKey(b.id, formatType);
            const count = selectedCountMap.get(formatKey) ?? 0;
            const isSelected = selectedKeys.has(formatKey);

            return (
              <View key={formatKey} style={[styles.tileWrap, { width: tileSize }]}>
                <TouchableOpacity
                  onPress={() => toggleBalise(b, formatType)}
                  activeOpacity={0.92}
                  style={[
                    styles.tile,
                    { width: tileSize, height: tileSize },
                    isSelected && !allowDuplicateBalises && styles.tileSelected,
                    count > 0 && allowDuplicateBalises && styles.tileDuplicateMode,
                    b.frozen && styles.tileFrozen,
                  ]}
                >
                  <View style={styles.numBadge}>
                    <Text style={styles.numBadgeTxt}>{b.numero_balise}</Text>
                  </View>

                  {b.frozen && (
                    <View style={styles.frozenDot}>
                      <Snowflake size={12} color="#1e3a8a" />
                    </View>
                  )}

                  {isSelected && !allowDuplicateBalises && (
                    <View style={styles.selectedCheck}>
                      <Check size={12} color="#fff" />
                    </View>
                  )}

                  {count > 0 && allowDuplicateBalises && (
                    <View style={styles.countBubble}>
                      <Text style={styles.countBubbleText}>x{count}</Text>
                    </View>
                  )}

                  {renderBalisePreview(b, formatType, tileSize)}
                  <View style={styles.tileFormatBadge}>
                    <Text style={styles.tileFormatBadgeText} numberOfLines={1}>
                      {FORMAT_LABELS[formatType]}
                    </Text>
                  </View>
                </TouchableOpacity>

                {formatType === "tableau" ? (
                  <TouchableOpacity
                    onPress={() =>
                      setTablePreview({
                        balise: b,
                        payload: getPayloadForBalise(b.id, "tableau", baliseFormatPayloadMap) ?? {},
                      })
                    }
                    style={styles.previewEyeBtn}
                    activeOpacity={0.86}
                  >
                    <Eye size={14} color={C_BLUE_STRONG} />
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}
        </View>

        {filteredBaliseEntries.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Aucune balise compatible avec les formats choisis</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );

  const renderEvaluationSettings = () => (
    <View style={styles.evaluationBox}>
      <View style={styles.evaluationTopRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.evaluationTitle}>Mode évaluation</Text>
          <Text style={styles.evaluationSub}>
            La note sera calculée avec un barème d'évaluation quand l'élève termine ou atteint sa limite.
          </Text>
        </View>
        <Switch
          value={modeEvaluation}
          onValueChange={(value) => {
            setModeEvaluation(value);
            if (!value) setSelectedEvaluationBaremeId(null);
          }}
          trackColor={{ false: "rgba(15,23,42,0.18)", true: "rgba(37,99,235,0.35)" }}
          thumbColor={modeEvaluation ? C_BLUE : "#fff"}
        />
      </View>

      {modeEvaluation ? (
        <View style={styles.evaluationBaremesWrap}>
          {evaluationBaremes.length === 0 ? (
            <Text style={styles.evaluationEmptyText}>Aucun barème d'évaluation trouvé.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.evaluationBaremesRow}>
              {evaluationBaremes.map((bareme) => {
                const active = selectedEvaluationBaremeId === bareme.id;
                return (
                  <TouchableOpacity
                    key={bareme.id}
                    activeOpacity={0.9}
                    onPress={() => setSelectedEvaluationBaremeId(bareme.id)}
                    style={[styles.evaluationBaremeChip, active && styles.evaluationBaremeChipActive]}
                  >
                    <Text style={[styles.evaluationBaremeChipText, active && styles.evaluationBaremeChipTextActive]}>
                      {bareme.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => setPage("gestionParcours")} style={styles.headerBtn} activeOpacity={0.9}>
            <ArrowLeft size={18} color="#fff" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Modifier un parcours</Text>
          </View>
        </View>
      </View>

      <View style={styles.contentZone}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ paddingBottom: BOTTOM_BAR_HEIGHT + STICKY_SAVE_HEIGHT + 36 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Nom du parcours</Text>
            <TextInput
              value={nom}
              onChangeText={setNom}
              placeholder="Nom du parcours"
              placeholderTextColor="rgba(15,23,42,0.4)"
              style={[styles.input, styles.bigInput]}
            />

            <Text style={[styles.sectionTitle, { marginTop: 14 }]}>Description</Text>
            <Text style={styles.smallMuted}>Facultatif</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description"
              placeholderTextColor="rgba(15,23,42,0.4)"
              style={[styles.input, styles.descriptionInput]}
              multiline
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Dossier</Text>
            <TouchableOpacity style={styles.folderChooser} onPress={() => setFolderModalVisible(true)} activeOpacity={0.92}>
              <View style={styles.folderChooserLeft}>
                <FolderOpen size={18} color={C_BLUE} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.folderChooserValue} numberOfLines={2}>
                    {getFolderPathLabel(selectedFolderId, folders)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>

            {renderEvaluationSettings()}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Format de balise</Text>
            <View style={styles.formatSimpleGrid}>{FORMAT_OPTIONS.map(renderFormatButton)}</View>
          </View>

          <View style={styles.card}>
            <View style={styles.duplicateTopRow}>
              <Text style={styles.duplicateTopTitle}>Accepter qu'une balise apparaisse 2 fois dans un parcours</Text>
              <Switch
                value={allowDuplicateBalises}
                onValueChange={setAllowDuplicateBalises}
                trackColor={{ false: "#CBD5E1", true: "#93C5FD" }}
                thumbColor={allowDuplicateBalises ? C_BLUE : "#fff"}
              />
            </View>
          </View>

          {renderSelectedList()}
          {renderBalisesPicker()}
        </ScrollView>
      </View>

      <View style={styles.stickySaveBar}>
        <TouchableOpacity
          onPress={handleSave}
          style={[styles.bottomPrimaryBtn, saving && styles.bottomPrimaryBtnDisabled]}
          disabled={saving}
          activeOpacity={0.92}
        >
          <Save size={18} color="#fff" />
          <Text style={styles.bottomPrimaryBtnText}>{saving ? "Mise à jour..." : "Mettre à jour"}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={folderModalVisible} transparent animationType="slide" onRequestClose={() => setFolderModalVisible(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setFolderModalVisible(false)} style={styles.modalBackdrop} />

        <View style={styles.folderModalSheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.folderModalHeader}>
            <Text style={styles.folderModalTitle}>Choisir un dossier</Text>
            <TouchableOpacity onPress={() => setFolderModalVisible(false)} style={styles.closeIconBtn} activeOpacity={0.9}>
              <X size={18} color={C_TEXT} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 16 }}>
            <TouchableOpacity
              onPress={() => {
                setSelectedFolderId(null);
                setFolderModalVisible(false);
              }}
              style={[styles.folderRow, selectedFolderId === null && styles.folderRowSelected]}
              activeOpacity={0.9}
            >
              <Text style={styles.folderRowText}>Accueil</Text>
              {selectedFolderId === null && <Check size={16} color={C_BLUE} />}
            </TouchableOpacity>

            {folders.map((folder) => (
              <TouchableOpacity
                key={folder.id}
                onPress={() => {
                  setSelectedFolderId(folder.id);
                  setFolderModalVisible(false);
                }}
                style={[styles.folderRow, selectedFolderId === folder.id && styles.folderRowSelected]}
                activeOpacity={0.9}
              >
                <Text style={styles.folderRowText}>{getFolderPathLabel(folder.id, folders)}</Text>
                {selectedFolderId === folder.id && <Check size={16} color={C_BLUE} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={!!tablePreview} transparent animationType="fade" onRequestClose={() => setTablePreview(null)}>
        <View style={styles.tablePreviewModalRoot}>
          <TouchableOpacity activeOpacity={1} onPress={() => setTablePreview(null)} style={styles.tablePreviewBackdrop} />
          <View style={styles.tablePreviewCard}>
            <View style={styles.tablePreviewHeader}>
              <View>
                <Text style={styles.tablePreviewTitle}>Balise {tablePreview?.balise.numero_balise ?? ""}</Text>
                <Text style={styles.tablePreviewSubtitle}>Tableau complet</Text>
              </View>
              <TouchableOpacity onPress={() => setTablePreview(null)} style={styles.closeIconBtn} activeOpacity={0.9}>
                <X size={18} color={C_TEXT} />
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.tablePreviewHorizontal}>
              <ScrollView showsVerticalScrollIndicator style={styles.tablePreviewVertical}>
                <View style={styles.tablePreviewGrid}>
                  {(() => {
                    const payload = tablePreview?.payload ?? {};
                    const rows = clampGridSize(payload.rows, 4);
                    const cols = clampGridSize(payload.cols, 4);
                    const cells = payload.cells && typeof payload.cells === "object" && !Array.isArray(payload.cells) ? payload.cells : {};

                    return (
                      <>
                        <View style={styles.tablePreviewRow}>
                          <View style={styles.tablePreviewCorner} />
                          {Array.from({ length: cols }).map((_, c) => (
                            <View key={`head-${c}`} style={styles.tablePreviewColumnHeadCell}>
                              <Text style={styles.tablePreviewHeadText}>{toLetter(c)}</Text>
                            </View>
                          ))}
                        </View>
                        {Array.from({ length: rows }).map((_, r) => (
                          <View key={`row-${r}`} style={styles.tablePreviewRow}>
                            <View style={styles.tablePreviewHeadCell}>
                              <Text style={styles.tablePreviewHeadText}>{r + 1}</Text>
                            </View>
                            {Array.from({ length: cols }).map((__, c) => {
                              const key = makeCellKey(r, c);
                              return (
                                <View key={key} style={styles.tablePreviewValueCell}>
                                  <Text selectable={(Platform.OS === "web") as any} numberOfLines={1} style={styles.tablePreviewValueText}>
                                    {String(cells[key] ?? "") || "—"}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        ))}
                      </>
                    );
                  })()}
                </View>
              </ScrollView>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!successFeedback} transparent animationType="fade">
        <View style={styles.successOverlayRoot}>
          <View style={styles.successOverlayCard}>
            <View style={styles.successIconBubble}>
              <Check size={30} color="#fff" />
            </View>
            <Text style={styles.successOverlayTitle}>{successFeedback?.title}</Text>
            <Text style={styles.successOverlayText}>{successFeedback?.message}</Text>
          </View>
        </View>
      </Modal>

      <BottomBar currentPage="gestionParcours" onNavigate={setPage} />
    </SafeAreaView>
  );
};

export default ModifierUnParcours;

/* =======================
   Styles
======================= */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C_BG },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingText: { marginTop: 10, color: C_MUTED, fontWeight: "600" },

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
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
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
  headerTitleWrap: { flex: 1, minWidth: 0 },
  headerTitle: { color: "#fff", fontSize: 20, fontWeight: "800" },

  contentZone: {
    flex: 1,
    backgroundColor: C_CONTENT_BG,
    borderTopWidth: 1,
    borderTopColor: C_CONTENT_BORDER,
  },
  scroll: { flex: 1, paddingHorizontal: 12, paddingTop: 12 },

  card: {
    backgroundColor: C_CARD,
    borderWidth: 1.5,
    borderColor: C_CARD_BORDER,
    borderRadius: 24,
    padding: 14,
    marginBottom: 12,
    ...(Platform.OS === "ios" ? IOS_SHADOW : {}),
    elevation: Platform.OS === "android" ? 2 : 0,
  },

  sectionTitle: { color: C_TEXT, fontWeight: "900", fontSize: 18 },
  smallMuted: { color: C_MUTED, marginTop: 4, marginBottom: 8, fontSize: 12, fontWeight: "700" },

  input: {
    backgroundColor: "rgba(0,0,0,0.03)",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 14,
    color: C_TEXT,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ web: 10, default: 11 }),
  },
  bigInput: { minHeight: 48, fontSize: 15, marginTop: 10 },
  descriptionInput: { minHeight: 88, textAlignVertical: "top" },

  folderChooser: {
    backgroundColor: "rgba(0,0,0,0.03)",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 12,
  },
  folderChooserLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  folderChooserValue: { color: C_TEXT, fontWeight: "900", fontSize: 15 },

  evaluationBox: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.18)",
    backgroundColor: "rgba(37,99,235,0.06)",
    padding: 12,
    gap: 10,
  },
  evaluationTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  evaluationTitle: { color: C_TEXT, fontWeight: "900", fontSize: 15 },
  evaluationSub: { color: C_MUTED, fontWeight: "700", fontSize: 12, marginTop: 3 },
  evaluationBaremesWrap: {
    borderTopWidth: 1,
    borderTopColor: "rgba(37,99,235,0.14)",
    paddingTop: 10,
  },
  evaluationBaremesRow: { gap: 8, alignItems: "center" },
  evaluationBaremeChip: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.14)",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  evaluationBaremeChipActive: {
    backgroundColor: "#DBEAFE",
    borderColor: "rgba(37,99,235,0.45)",
  },
  evaluationBaremeChipText: { color: C_TEXT, fontWeight: "900", fontSize: 12 },
  evaluationBaremeChipTextActive: { color: C_BLUE },
  evaluationEmptyText: { color: C_MUTED, fontWeight: "800", fontSize: 12 },

  formatSimpleGrid: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  formatCard: {
    minWidth: 140,
    flexGrow: 1,
    flexBasis: "45%",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 16,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  formatCardActive: { borderColor: C_BLUE, backgroundColor: "rgba(37,99,235,0.10)" },
  formatCardIconWrap: { minWidth: 22, alignItems: "center", justifyContent: "center" },
  formatIconText: { color: C_TEXT, fontWeight: "900", fontSize: 18 },
  formatIconTextActive: { color: C_BLUE },
  formatCardText: { color: C_TEXT, fontWeight: "900", fontSize: 14, flexShrink: 1 },
  formatCardTextActive: { color: C_BLUE },

  duplicateTopRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  duplicateTopTitle: { flex: 1, color: C_TEXT, fontWeight: "800", lineHeight: 18 },

  sectionHeaderInline: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  countBadge: {
    minWidth: 32,
    height: 28,
    borderRadius: 999,
    backgroundColor: "rgba(37,99,235,0.10)",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.18)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  countBadgeText: { color: C_BLUE, fontWeight: "900", fontSize: 13 },

  emptyBox: {
    backgroundColor: "rgba(0,0,0,0.03)",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginTop: 12,
  },
  emptyBoxSmall: {
    backgroundColor: "rgba(0,0,0,0.03)",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    marginTop: 12,
  },
  emptyText: { color: C_MUTED, textAlign: "center" },

  selectedRow: {
    backgroundColor: "rgba(0,0,0,0.03)",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 14,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectedOrderBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C_BLUE,
    alignItems: "center",
    justifyContent: "center",
  },
  selectedOrderBadgeText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  selectedMiniPreview: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: C_BORDER,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  selectedMain: { flex: 1, minWidth: 0 },
  selectedTitle: { color: C_TEXT, fontWeight: "800", fontSize: 14 },
  frozenMiniChip: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: "rgba(191,219,254,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  orderBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  orderBtnText: { color: C_TEXT, fontWeight: "900", fontSize: 15 },
  removeBtn: { backgroundColor: C_RED },

  cardBalisesZone: {
    backgroundColor: C_CARD,
    borderWidth: 1.5,
    borderColor: C_CARD_BORDER,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 12,
    ...(Platform.OS === "ios" ? IOS_SHADOW : {}),
    elevation: Platform.OS === "android" ? 2 : 0,
  },
  cardBalisesTop: { padding: 14, borderBottomWidth: 1, borderBottomColor: C_BORDER },
  balisesScrollableArea: { paddingHorizontal: 14, paddingTop: 12 },

  filtersRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  searchWrap: { flex: 1, position: "relative" },
  searchIcon: { position: "absolute", left: 10, top: 12, zIndex: 1 },
  searchInput: {
    backgroundColor: "rgba(0,0,0,0.03)",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 12,
    color: C_TEXT,
    paddingLeft: 34,
    paddingRight: 12,
    paddingVertical: Platform.select({ web: 10, default: 11 }),
  },

  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(30,58,138,0.2)",
    backgroundColor: "rgba(191,219,254,0.35)",
  },
  filterChipActive: { backgroundColor: C_BLUE_STRONG, borderColor: C_BLUE_STRONG },
  filterChipText: { color: "#1e3a8a", fontWeight: "800", fontSize: 12 },
  filterChipTextActive: { color: "#fff" },

  helperText: { color: C_MUTED, marginBottom: 10, fontSize: 12, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap" },

  tile: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 12,
    marginBottom: 8,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  tileSelected: { backgroundColor: "rgba(14,165,233,0.12)", borderColor: "rgba(14,165,233,0.45)", borderWidth: 2 },
  tileDuplicateMode: { backgroundColor: "rgba(37,99,235,0.08)", borderColor: "rgba(37,99,235,0.30)", borderWidth: 2 },
  tileFrozen: { borderColor: "rgba(249,115,22,0.45)" },
  numBadge: {
    position: "absolute",
    top: 5,
    left: 5,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    zIndex: 5,
  },
  numBadgeTxt: { color: C_TEXT, fontWeight: "900", fontSize: 10 },
  tileCode: { color: C_TEXT, fontWeight: "900", paddingHorizontal: 4, fontFamily: READABLE_CODE_FONT, fontVariant: ["tabular-nums"] },
  tileFormatBadge: {
    position: "absolute",
    left: 5,
    right: 5,
    bottom: 5,
    minHeight: 18,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tileFormatBadgeText: { color: C_TEXT, fontWeight: "900", fontSize: 9 },

  previewCenter: { alignItems: "center", justifyContent: "center" },
  poinconPreviewWrap: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.16)",
    borderRadius: 9,
    padding: 3,
  },
  poinconPreviewRow: { flexDirection: "row" },
  poinconPreviewCell: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  poinconPreviewDot: { borderRadius: 999, backgroundColor: C_TEXT },
  qrPreviewWrap: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.16)",
    borderRadius: 9,
    padding: 5,
  },

  frozenDot: {
    position: "absolute",
    top: 5,
    right: 5,
    backgroundColor: "rgba(191,219,254,0.7)",
    borderRadius: 999,
    padding: 3,
    zIndex: 5,
  },
  selectedCheck: {
    position: "absolute",
    bottom: 5,
    right: 5,
    backgroundColor: C_GREEN,
    borderRadius: 999,
    padding: 3,
    zIndex: 5,
  },
  countBubble: {
    position: "absolute",
    bottom: 5,
    right: 5,
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: C_BLUE,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    zIndex: 5,
  },
  countBubbleText: { color: "#fff", fontWeight: "900", fontSize: 10 },
  tileWrap: {
    alignItems: "center",
  },
  previewEyeBtn: {
    marginTop: 6,
    width: 34,
    height: 28,
    borderRadius: 999,
    backgroundColor: "#EEF6FF",
    borderWidth: 1,
    borderColor: "rgba(37,99,235,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },

  stickySaveBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: BOTTOM_BAR_HEIGHT,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.select({ ios: 10, android: 10, default: 10 }),
    backgroundColor: "rgba(237,242,246,0.96)",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  bottomPrimaryBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: C_GREEN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  bottomPrimaryBtnDisabled: { opacity: 0.72 },
  bottomPrimaryBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },

  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  folderModalSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderColor: C_BORDER,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.14)",
    marginBottom: 12,
  },
  folderModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  folderModalTitle: { color: C_TEXT, fontSize: 18, fontWeight: "800" },
  closeIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  tablePreviewModalRoot: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18 },
  tablePreviewBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.48)" },
  tablePreviewCard: { width: "100%", maxWidth: 720, maxHeight: "82%", backgroundColor: "#fff", borderRadius: 24, borderWidth: 1, borderColor: C_BORDER, padding: 16 },
  tablePreviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  tablePreviewTitle: { color: C_TEXT, fontWeight: "900", fontSize: 20 },
  tablePreviewSubtitle: { color: C_MUTED, fontWeight: "700", fontSize: 13, marginTop: 2 },
  tablePreviewHorizontal: { paddingBottom: 6 },
  tablePreviewVertical: { maxHeight: 440 },
  tablePreviewGrid: { padding: 4 },
  tablePreviewRow: { flexDirection: "row", gap: 6, marginBottom: 6 },
  tablePreviewCorner: { width: 44, height: 42, borderRadius: 10, backgroundColor: "#F8FAFC" },
  tablePreviewHeadCell: { width: 44, height: 42, borderRadius: 10, backgroundColor: "#EAF3F9", borderWidth: 1, borderColor: "#C9D5DF", alignItems: "center", justifyContent: "center" },
  tablePreviewColumnHeadCell: { width: 96, height: 42, borderRadius: 10, backgroundColor: "#EAF3F9", borderWidth: 1, borderColor: "#C9D5DF", alignItems: "center", justifyContent: "center" },
  tablePreviewHeadText: { color: C_HEADER, fontWeight: "900", fontSize: 13 },
  tablePreviewValueCell: { width: 96, height: 42, borderRadius: 10, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(15,23,42,0.12)", alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  tablePreviewValueText: { color: C_TEXT, fontWeight: "900", fontSize: 13 },
  successOverlayRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.34)",
    padding: 24,
  },
  successOverlayCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 22,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: C_BORDER,
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  successIconBubble: {
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: C_GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  successOverlayTitle: { color: C_TEXT, fontWeight: "900", fontSize: 20, textAlign: "center" },
  successOverlayText: { color: C_MUTED, fontWeight: "700", fontSize: 14, textAlign: "center", marginTop: 6 },
  folderRow: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  folderRowSelected: { backgroundColor: "rgba(14,165,233,0.12)", borderColor: "rgba(14,165,233,0.45)" },
  folderRowText: { color: C_TEXT, fontWeight: "700", flex: 1 },
});
