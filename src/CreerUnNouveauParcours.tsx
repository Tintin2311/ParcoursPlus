// src/CreerUnNouveauParcours.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
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
  ActivityIndicator,
} from "react-native";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Grid2x2,
  QrCode,
  Save,
  Search,
  Snowflake,
  Trash2,
  X,
} from "lucide-react-native";
import { supabase } from "./supabaseClient";
import { fetchAllBaliseFormatsCompat } from "./baliseFormatsCompat";
import BottomBar from "./ui/BottomBar";

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

type ParcoursRecord = {
  id: string;
  nom: string | null;
  description: string | null;
  balises_ordre: string[] | null;
  folder_id: string | null;
  format_type: ParcoursFormatType | null;
  allow_duplicate_balises: boolean;
};

type SelectedBaliseOccurrence = Balise & {
  occurrenceKey: string;
};

type BaliseFormatPayloadMap = Map<string, Partial<Record<ParcoursFormatType, Record<string, any>>>>;

type BaliseFormatsFetchResult = {
  typeMap: Map<string, Set<ParcoursFormatType>>;
  payloadMap: BaliseFormatPayloadMap;
};

type StepId = 1 | 2 | 3 | 4;

/* =======================
   Couleurs / charte
======================= */
const C_BG = "#EDF2F6";
const C_HEADER = "#1F5B86";
const C_HEADER_2 = "#2C6B98";
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

const IOS_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 8,
};

const STEP_ITEMS: { id: StepId; short: string }[] = [
  { id: 1, short: "1" },
  { id: 2, short: "2" },
  { id: 3, short: "3" },
  { id: 4, short: "4" },
];

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

const buildOccurrenceKey = (baliseId: string, occurrenceIndex: number) =>
  `${baliseId}__occ__${occurrenceIndex}`;

const buildSelectedOccurrences = (balises: Balise[]): SelectedBaliseOccurrence[] =>
  balises.map((b, index) => ({
    ...b,
    occurrenceKey: buildOccurrenceKey(b.id, index + 1),
  }));

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

const isStep1Valid = (nom: string) => nom.trim().length > 0;
const isStep3Valid = (formatType: ParcoursFormatType | null) => !!formatType;

const getMaxUnlockedStep = (nom: string, formatType: ParcoursFormatType | null): StepId => {
  if (!isStep1Valid(nom)) return 1;
  if (!isStep3Valid(formatType)) return 3;
  return 4;
};

const makeCellKey = (row: number, col: number) => `${row}-${col}`;

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

const isStep4Valid = (
  formatType: ParcoursFormatType | null,
  selectedBalises: Balise[],
  baliseFormatsMap: Map<string, Set<ParcoursFormatType>>
) => {
  if (!formatType) return false;
  if (selectedBalises.length === 0) return false;
  return selectedBalises.every((b) => hasFormatForBalise(b, formatType, baliseFormatsMap));
};

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
          <View key={`preview-r-${r}`} style={[styles.poinconPreviewRow, { gap, marginBottom: r === rows - 1 ? 0 : gap }]}>
            {Array.from({ length: cols }).map((__, c) => {
              const active = !!dots[makeCellKey(r, c)];
              return (
                <View key={`preview-c-${r}-${c}`} style={[styles.poinconPreviewCell, { width: cell, height: cell, borderRadius: Math.max(4, Math.floor(cell * 0.18)) }]}>
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
              <View key={`table-c-${r}-${c}`} style={[styles.poinconPreviewCell, { width: cell, height: cell, borderRadius: Math.max(4, Math.floor(cell * 0.18)) }]} />
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
              <View key={`qrp-${r}-${c}`} style={{ width: pixel, height: pixel, backgroundColor: filled ? C_TEXT : "#fff" }} />
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
    .sort(
      (a, b) =>
        parseInt(a.numero_balise || "0", 10) - parseInt(b.numero_balise || "0", 10)
    );
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

const fetchParcoursById = async (parcoursId: string): Promise<ParcoursRecord | null> => {
  const primary = await supabase
    .from("parcours")
    .select(
      "id, nom, description, balises_ordre, folder_id, format_type, allow_duplicate_balises"
    )
    .eq("id", parcoursId)
    .single();

  if (!primary.error && primary.data) {
    const d = primary.data;
    return {
      id: String(d.id),
      nom: d.nom ?? "",
      description: d.description ?? "",
      balises_ordre: Array.isArray(d.balises_ordre) ? d.balises_ordre : [],
      folder_id: d.folder_id ?? null,
      format_type: ((d as any).format_type ?? null) as ParcoursFormatType | null,
      allow_duplicate_balises: !!(d as any).allow_duplicate_balises,
    };
  }

  const fallback = await supabase
    .from("parcours")
    .select("id, nom, description, balises_ordre, folder_id")
    .eq("id", parcoursId)
    .single();

  if (fallback.error || !fallback.data) {
    console.error("❌ fetchParcoursById:", primary.error || fallback.error);
    return null;
  }

  const d = fallback.data;
  return {
    id: String(d.id),
    nom: d.nom ?? "",
    description: d.description ?? "",
    balises_ordre: Array.isArray(d.balises_ordre) ? d.balises_ordre : [],
    folder_id: d.folder_id ?? null,
    format_type: null,
    allow_duplicate_balises: false,
  };
};

const insertParcoursInSupabase = async (payload: {
  nom: string;
  description: string;
  balises_ordre: string[];
  folder_id: string | null;
  professeur_id?: string | null;
  format_type: ParcoursFormatType;
  allow_duplicate_balises: boolean;
}) => {
  const primary = await supabase.from("parcours").insert(payload).select().single();

  if (!primary.error) return primary.data;

  const msg = String(primary.error.message || "").toLowerCase();
  const missingFormat = msg.includes("format_type");
  const missingDup = msg.includes("allow_duplicate_balises");

  if (!missingFormat && !missingDup) throw primary.error;

  const fallbackPayload: any = {
    nom: payload.nom,
    description: payload.description,
    balises_ordre: payload.balises_ordre,
    folder_id: payload.folder_id,
    professeur_id: payload.professeur_id ?? null,
  };

  const fallback = await supabase.from("parcours").insert(fallbackPayload).select().single();

  if (fallback.error) throw fallback.error;

  Alert.alert(
    "Colonnes manquantes",
    "Le parcours a été créé, mais format_type et/ou allow_duplicate_balises n'existent pas encore dans la table parcours."
  );

  return fallback.data;
};

const updateParcoursInSupabase = async (
  parcoursId: string,
  payload: {
    nom: string;
    description: string;
    balises_ordre: string[];
    folder_id: string | null;
    professeur_id?: string | null;
    format_type: ParcoursFormatType;
    allow_duplicate_balises: boolean;
  }
) => {
  const primary = await supabase
    .from("parcours")
    .update(payload)
    .eq("id", parcoursId)
    .select()
    .single();

  if (!primary.error) return primary.data;

  const msg = String(primary.error.message || "").toLowerCase();
  const missingFormat = msg.includes("format_type");
  const missingDup = msg.includes("allow_duplicate_balises");

  if (!missingFormat && !missingDup) throw primary.error;

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

  Alert.alert(
    "Colonnes manquantes",
    "Le parcours a été mis à jour, mais format_type et/ou allow_duplicate_balises n'existent pas encore dans la table parcours."
  );

  return fallback.data;
};

/* =======================
   Composant principal
======================= */
const CreerUnNouveauParcours: React.FC<Props> = ({
  setPage = () => {},
  professeur = null,
  parcoursId = null,
}) => {
  const requestedEditId =
    typeof parcoursId === "string" && parcoursId.trim().length > 0 ? parcoursId.trim() : null;

  const [activeParcoursId, setActiveParcoursId] = useState<string | null>(requestedEditId);
  const isEditMode = !!activeParcoursId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState<StepId>(1);

  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [formatType, setFormatType] = useState<ParcoursFormatType | null>(null);
  const [allowDuplicateBalises, setAllowDuplicateBalises] = useState(false);

  const [balises, setBalises] = useState<Balise[]>([]);
  const [selectedBalises, setSelectedBalises] = useState<Balise[]>([]);
  const [baliseFormatsMap, setBaliseFormatsMap] = useState<Map<string, Set<ParcoursFormatType>>>(
    new Map()
  );
  const [baliseFormatPayloadMap, setBaliseFormatPayloadMap] = useState<BaliseFormatPayloadMap>(
    new Map()
  );

  const [folders, setFolders] = useState<FolderItem[]>([]);
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

  const resetForm = useCallback(() => {
    setActiveParcoursId(null);
    setNom("");
    setDescription("");
    setFormatType(null);
    setAllowDuplicateBalises(false);
    setSelectedBalises([]);
    setSelectedFolderId(null);
    setSearchBalise("");
    setShowOnlyFrozen(false);
    setCurrentStep(1);
  }, []);

  useEffect(() => {
    setActiveParcoursId(requestedEditId);
  }, [requestedEditId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        const [allBalises, allFolders, allFormats] = await Promise.all([
          fetchAllBalises(),
          fetchAllFolders(),
          fetchAllBaliseFormats(),
        ]);

        if (cancelled) return;

        setBalises(allBalises);
        setFolders(allFolders);
        setBaliseFormatsMap(allFormats.typeMap);
        setBaliseFormatPayloadMap(allFormats.payloadMap);

        if (!activeParcoursId) {
          setNom("");
          setDescription("");
          setFormatType(null);
          setAllowDuplicateBalises(false);
          setSelectedBalises([]);
          setSelectedFolderId(null);
          setSearchBalise("");
          setShowOnlyFrozen(false);
          setCurrentStep(1);
          return;
        }

        const parcours = await fetchParcoursById(activeParcoursId);

        if (cancelled) return;

        if (!parcours) {
          Alert.alert("Erreur", "Impossible de charger ce parcours.");
          setPage("gestionParcours");
          return;
        }

        setNom(parcours.nom || "");
        setDescription(parcours.description || "");
        setFormatType(parcours.format_type || null);
        setAllowDuplicateBalises(!!parcours.allow_duplicate_balises);
        setSelectedFolderId(parcours.folder_id || null);
        setSearchBalise("");
        setShowOnlyFrozen(false);

        const orderedIds = Array.isArray(parcours.balises_ordre) ? parcours.balises_ordre : [];

        const orderedBalises = orderedIds
          .map((id) => allBalises.find((b) => b.id === id))
          .filter(Boolean) as Balise[];

        setSelectedBalises(orderedBalises);
      } catch (e) {
        console.error("❌ load parcours:", e);
        if (!cancelled) {
          Alert.alert("Erreur", "Chargement impossible.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [activeParcoursId, setPage]);

  const selectedOccurrences = useMemo(
    () => buildSelectedOccurrences(selectedBalises),
    [selectedBalises]
  );

  const selectedIds = useMemo(() => new Set(selectedBalises.map((b) => b.id)), [selectedBalises]);

  const selectedCountMap = useMemo(() => {
    const map = new Map<string, number>();
    selectedBalises.forEach((b) => {
      map.set(b.id, (map.get(b.id) ?? 0) + 1);
    });
    return map;
  }, [selectedBalises]);

  const maxUnlockedStep = useMemo(() => getMaxUnlockedStep(nom, formatType), [nom, formatType]);

  const filteredBalises = useMemo(() => {
    const q = searchBalise.trim().toLowerCase();

    return balises.filter((b) => {
      if (formatType && !hasFormatForBalise(b, formatType, baliseFormatsMap)) {
        return false;
      }

      const matchesSearch =
        !q || String(b.code || "").toLowerCase().includes(q) || String(b.numero_balise).includes(q);

      const matchesFrozen = !showOnlyFrozen || b.frozen;
      return matchesSearch && matchesFrozen;
    });
  }, [balises, searchBalise, showOnlyFrozen, formatType, baliseFormatsMap]);

  const toggleBalise = useCallback(
    (balise: Balise) => {
      setSelectedBalises((prev) => {
        const exists = prev.some((b) => b.id === balise.id);

        if (allowDuplicateBalises) {
          return [...prev, balise];
        }

        if (exists) {
          const firstIndex = prev.findIndex((b) => b.id === balise.id);
          if (firstIndex < 0) return prev;
          return prev.filter((_, index) => index !== firstIndex);
        }

        return [...prev, balise];
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

  const goToStep = useCallback(
    (step: StepId) => {
      if (step <= currentStep) {
        setCurrentStep(step);
        return;
      }
      if (step <= maxUnlockedStep) {
        setCurrentStep(step);
      }
    },
    [currentStep, maxUnlockedStep]
  );

  const validateStep = useCallback(
    (step: StepId) => {
      if (step === 1 && !isStep1Valid(nom)) {
        Alert.alert("Étape 1", "Nom du parcours obligatoire.");
        return false;
      }

      if (step === 3 && !isStep3Valid(formatType)) {
        Alert.alert("Étape 3", "Choisis un format de balise.");
        return false;
      }

      if (step === 4) {
        if (!formatType) {
          Alert.alert("Étape 3", "Choisis d'abord un format.");
          setCurrentStep(3);
          return false;
        }
        if (!isStep4Valid(formatType, selectedBalises, baliseFormatsMap)) {
          Alert.alert("Étape 4", "Choisis au moins une balise compatible avec ce format.");
          return false;
        }
      }

      return true;
    },
    [nom, formatType, selectedBalises, baliseFormatsMap]
  );

  const goPrev = useCallback(() => {
    setCurrentStep((prev) => (prev > 1 ? ((prev - 1) as StepId) : prev));
  }, []);

  const goNext = useCallback(() => {
    if (!validateStep(currentStep)) return;
    setCurrentStep((prev) => (prev < 4 ? ((prev + 1) as StepId) : prev));
  }, [currentStep, validateStep]);

  const handleChangeFormatInEdit = useCallback(
    (nextFormat: ParcoursFormatType) => {
      if (!isEditMode) {
        setFormatType(nextFormat);
        return;
      }

      if (formatType === nextFormat) {
        setFormatType(nextFormat);
        return;
      }

      const compatible = filterBalisesByFormat(selectedBalises, nextFormat, baliseFormatsMap);
      const removedCount = selectedBalises.length - compatible.length;

      Alert.alert(
        "Changer le format ?",
        removedCount > 0
          ? `Certaines balises n'ont pas ce format.\n\nOui = on garde seulement les balises compatibles (${compatible.length}) et on supprime les ${removedCount} autres.\n\nReset = on vide toute la liste.\n\nAnnuler = on ne change rien.`
          : "Toutes les balises actuelles sont compatibles avec ce format.\n\nVeux-tu utiliser ce nouveau format ?",
        removedCount > 0
          ? [
              { text: "Annuler", style: "cancel" },
              {
                text: "Reset",
                style: "destructive",
                onPress: () => {
                  setFormatType(nextFormat);
                  setSelectedBalises([]);
                  setSearchBalise("");
                },
              },
              {
                text: "Oui",
                onPress: () => {
                  setFormatType(nextFormat);
                  setSelectedBalises(compatible);
                  setSearchBalise("");
                },
              },
            ]
          : [
              { text: "Annuler", style: "cancel" },
              {
                text: "Oui",
                onPress: () => {
                  setFormatType(nextFormat);
                  setSelectedBalises(compatible);
                  setSearchBalise("");
                },
              },
            ]
      );
    },
    [isEditMode, formatType, selectedBalises, baliseFormatsMap]
  );

  const handleSave = useCallback(async () => {
    if (!isStep1Valid(nom)) {
      if (!isEditMode) setCurrentStep(1);
      Alert.alert("Nom manquant", "Le nom du parcours est obligatoire.");
      return;
    }

    if (!formatType) {
      if (!isEditMode) setCurrentStep(3);
      Alert.alert("Format manquant", "Choisis un format de balise.");
      return;
    }

    if (!isStep4Valid(formatType, selectedBalises, baliseFormatsMap)) {
      if (!isEditMode) setCurrentStep(4);
      Alert.alert("Balises manquantes", "Choisis au moins une balise compatible.");
      return;
    }

    const payload = {
      nom: nom.trim(),
      description: description.trim(),
      balises_ordre: selectedBalises.map((b) => b.id),
      folder_id: selectedFolderId,
      professeur_id: professeur?.user_id ?? null,
      format_type: formatType,
      allow_duplicate_balises: allowDuplicateBalises,
    };

    try {
      setSaving(true);

      if (isEditMode && activeParcoursId) {
        await updateParcoursInSupabase(activeParcoursId, payload);
        Alert.alert("Succès", "Le parcours a bien été mis à jour.");
      } else {
        await insertParcoursInSupabase(payload);
        Alert.alert("Succès", "Le parcours a bien été créé.");
      }

      resetForm();
      setPage("gestionParcours");
    } catch (e: any) {
      console.error("❌ save parcours:", e);
      Alert.alert("Erreur", e?.message || "Impossible d'enregistrer le parcours.");
    } finally {
      setSaving(false);
    }
  }, [
    nom,
    description,
    formatType,
    selectedBalises,
    baliseFormatsMap,
    selectedFolderId,
    professeur,
    allowDuplicateBalises,
    isEditMode,
    activeParcoursId,
    resetForm,
    setPage,
  ]);

  const renderBalisePreview = useCallback(
    (balise: Balise, size: number) => {
      if (formatType === "poincon") {
        const payload = getPayloadForBalise(balise.id, "poincon", baliseFormatPayloadMap);
        return <PoinconPreview payload={payload} size={Math.max(42, Math.floor(size * 0.66))} />;
      }

      if (formatType === "tableau") {
        const payload = getPayloadForBalise(balise.id, "tableau", baliseFormatPayloadMap);
        return <TableauPreview payload={payload} size={Math.max(42, Math.floor(size * 0.66))} />;
      }

      if (formatType === "qrcode") {
        return <QrPreview size={Math.max(42, Math.floor(size * 0.66))} />;
      }

      return (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={[
            styles.tileCode,
            { fontSize: size >= 78 ? 18 : size >= 66 ? 15 : 13 },
          ]}
        >
          {balise.code || "—"}
        </Text>
      );
    },
    [formatType, baliseFormatPayloadMap]
  );

  const getSelectedSubtitle = useCallback(
    (balise: Balise) => {
      if (!formatType || formatType === "code") return balise.code || "Sans code";
      return FORMAT_LABELS[formatType];
    },
    [formatType]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C_BLUE} />
          <Text style={styles.loadingText}>
            {isEditMode ? "Chargement du parcours..." : "Préparation du parcours..."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderFormatButton = (option: { id: ParcoursFormatType; label: string }) => {
    const active = formatType === option.id;

    return (
      <TouchableOpacity
        key={option.id}
        activeOpacity={0.92}
        onPress={() => {
          if (isEditMode) {
            handleChangeFormatInEdit(option.id);
          } else {
            setFormatType(option.id);
          }
        }}
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

        <Text style={[styles.formatCardText, active && styles.formatCardTextActive]}>
          {option.label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderSelectedList = () => (
    <>
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

              {formatType === "poincon" ? (
                <View style={styles.selectedMiniPreview}>
                  <PoinconPreview
                    payload={getPayloadForBalise(b.id, "poincon", baliseFormatPayloadMap)}
                    size={38}
                  />
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
                <TouchableOpacity
                  onPress={() => moveSelectedUp(index)}
                  style={styles.orderBtn}
                  activeOpacity={0.85}
                >
                  <Text style={styles.orderBtnText}>↑</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => moveSelectedDown(index)}
                  style={styles.orderBtn}
                  activeOpacity={0.85}
                >
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
    </>
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
            <Text style={[styles.filterChipText, showOnlyFrozen && styles.filterChipTextActive]}>
              Gelées
            </Text>
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
          {filteredBalises.length} balise{filteredBalises.length > 1 ? "s" : ""}
        </Text>

        <View style={[styles.grid, { gap }]}> 
          {filteredBalises.map((b) => {
            const count = selectedCountMap.get(b.id) ?? 0;
            const isSelected = selectedIds.has(b.id);

            return (
              <TouchableOpacity
                key={b.id}
                onPress={() => toggleBalise(b)}
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

                {renderBalisePreview(b, tileSize)}
              </TouchableOpacity>
            );
          })}
        </View>

        {filteredBalises.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Aucune balise compatible avec ce format</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => {
              resetForm();
              setPage("gestionParcours");
            }}
            style={styles.headerBtn}
            activeOpacity={0.9}
          >
            <ArrowLeft size={18} color="#fff" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>
              {isEditMode ? "Modifier un parcours" : "Créer un parcours"}
            </Text>

            {!isEditMode ? <Text style={styles.headerSubtitle}>{`Étape ${currentStep} / 4`}</Text> : null}
          </View>
        </View>
      </View>

      {!isEditMode ? (
        <View style={styles.stepsBar}>
          {STEP_ITEMS.map((step) => {
            const active = currentStep === step.id;
            const done = currentStep > step.id;
            const locked = step.id > currentStep && step.id > maxUnlockedStep;

            return (
              <TouchableOpacity
                key={step.id}
                activeOpacity={0.9}
                onPress={() => goToStep(step.id)}
                style={[
                  styles.stepPill,
                  active && styles.stepPillActive,
                  done && styles.stepPillDone,
                  locked && styles.stepPillLocked,
                ]}
              >
                <Text
                  style={[
                    styles.stepPillText,
                    active && styles.stepPillTextActive,
                    done && styles.stepPillTextDone,
                    locked && styles.stepPillTextLocked,
                  ]}
                >
                  {step.short}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <View style={styles.contentZone}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            paddingBottom: BOTTOM_BAR_HEIGHT + STICKY_SAVE_HEIGHT + 36,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {isEditMode ? (
            <>
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
                <TouchableOpacity
                  style={styles.folderChooser}
                  onPress={() => setFolderModalVisible(true)}
                  activeOpacity={0.92}
                >
                  <View style={styles.folderChooserLeft}>
                    <FolderOpen size={18} color={C_BLUE} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.folderChooserValue} numberOfLines={2}>
                        {getFolderPathLabel(selectedFolderId, folders)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>

              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Format de balise</Text>
                <View style={styles.formatSimpleGrid}>{FORMAT_OPTIONS.map(renderFormatButton)}</View>
              </View>

              <View style={styles.cardStickyTop}>
                <View style={styles.duplicateTopRow}>
                  <Text style={styles.duplicateTopTitle}>
                    Accepter qu'une balise apparaisse 2 fois dans un parcours
                  </Text>
                  <Switch
                    value={allowDuplicateBalises}
                    onValueChange={setAllowDuplicateBalises}
                    trackColor={{ false: "#CBD5E1", true: "#93C5FD" }}
                    thumbColor={allowDuplicateBalises ? C_BLUE : "#fff"}
                  />
                </View>
              </View>

              <View style={styles.card}>{renderSelectedList()}</View>

              {renderBalisesPicker()}
            </>
          ) : (
            <>
              {currentStep === 1 ? (
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
              ) : null}

              {currentStep === 2 ? (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Choisis où déposer ton parcours</Text>

                  <TouchableOpacity
                    style={styles.folderChooser}
                    onPress={() => setFolderModalVisible(true)}
                    activeOpacity={0.92}
                  >
                    <View style={styles.folderChooserLeft}>
                      <FolderOpen size={18} color={C_BLUE} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.folderChooserValue} numberOfLines={2}>
                          {getFolderPathLabel(selectedFolderId, folders)}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              ) : null}

              {currentStep === 3 ? (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Choisis un format de balise</Text>
                  <View style={styles.formatSimpleGrid}>{FORMAT_OPTIONS.map(renderFormatButton)}</View>
                </View>
              ) : null}

              {currentStep === 4 ? (
                <View style={styles.page4Wrap}>
                  <View style={styles.cardStickyTop}>
                    <View style={styles.duplicateTopRow}>
                      <Text style={styles.duplicateTopTitle}>
                        Accepter qu'une balise apparaisse 2 fois dans un parcours
                      </Text>
                      <Switch
                        value={allowDuplicateBalises}
                        onValueChange={setAllowDuplicateBalises}
                        trackColor={{ false: "#CBD5E1", true: "#93C5FD" }}
                        thumbColor={allowDuplicateBalises ? C_BLUE : "#fff"}
                      />
                    </View>
                  </View>

                  <View style={styles.cardStickyTop}>{renderSelectedList()}</View>

                  {renderBalisesPicker()}
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>

      <View style={styles.stickySaveBar}>
        <View style={styles.bottomActionsRow}>
          {!isEditMode ? (
            <TouchableOpacity
              onPress={goPrev}
              disabled={currentStep === 1}
              style={[styles.bottomGhostBtn, currentStep === 1 && styles.bottomBtnDisabled]}
              activeOpacity={0.9}
            >
              <ChevronLeft size={18} color={currentStep === 1 ? "#94a3b8" : C_TEXT} />
              <Text style={[styles.bottomGhostBtnText, currentStep === 1 && styles.bottomGhostBtnTextDisabled]}>
                Retour
              </Text>
            </TouchableOpacity>
          ) : null}

          {!isEditMode && currentStep < 4 ? (
            <TouchableOpacity onPress={goNext} style={styles.bottomPrimaryBtn} activeOpacity={0.92}>
              <Text style={styles.bottomPrimaryBtnText}>Continuer</Text>
              <ChevronRight size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.bottomPrimaryBtn, saving && styles.bottomPrimaryBtnDisabled]}
              disabled={saving}
              activeOpacity={0.92}
            >
              <Save size={18} color="#fff" />
              <Text style={styles.bottomPrimaryBtnText}>
                {saving ? "Enregistrement..." : isEditMode ? "Mettre à jour" : "Enregistrer"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Modal
        visible={folderModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFolderModalVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setFolderModalVisible(false)}
          style={styles.modalBackdrop}
        />

        <View style={styles.folderModalSheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.folderModalHeader}>
            <Text style={styles.folderModalTitle}>Choisir un dossier</Text>
            <TouchableOpacity
              onPress={() => setFolderModalVisible(false)}
              style={styles.closeIconBtn}
              activeOpacity={0.9}
            >
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

      <BottomBar currentPage="gestionParcours" onNavigate={setPage} />
    </SafeAreaView>
  );
};

export default CreerUnNouveauParcours;

/* =======================
   Styles
======================= */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C_BG,
  },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  loadingText: {
    marginTop: 10,
    color: C_MUTED,
    fontWeight: "600",
  },

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

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
  },

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

  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
  },

  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },

  headerSubtitle: {
    color: "rgba(255,255,255,0.92)",
    marginTop: 2,
    fontSize: 12,
    fontWeight: "700",
  },

  stepsBar: {
    backgroundColor: C_HEADER_2,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },

  stepPill: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },

  stepPillActive: {
    backgroundColor: C_BLUE,
    borderColor: "rgba(255,255,255,0.18)",
  },

  stepPillDone: {
    backgroundColor: C_GREEN,
    borderColor: "rgba(255,255,255,0.18)",
  },

  stepPillLocked: {
    opacity: 0.55,
  },

  stepPillText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },

  stepPillTextActive: {
    color: "#fff",
  },

  stepPillTextDone: {
    color: "#fff",
  },

  stepPillTextLocked: {
    color: "rgba(255,255,255,0.84)",
  },

  contentZone: {
    flex: 1,
    backgroundColor: C_CONTENT_BG,
    borderTopWidth: 1,
    borderTopColor: C_CONTENT_BORDER,
  },

  scroll: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
  },

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

  cardStickyTop: {
    backgroundColor: C_CARD,
    borderWidth: 1.5,
    borderColor: C_CARD_BORDER,
    borderRadius: 24,
    padding: 14,
    marginBottom: 12,
    ...(Platform.OS === "ios" ? IOS_SHADOW : {}),
    elevation: Platform.OS === "android" ? 2 : 0,
  },

  page4Wrap: {
    gap: 0,
  },

  sectionTitle: {
    color: C_TEXT,
    fontWeight: "900",
    fontSize: 18,
  },

  smallMuted: {
    color: C_MUTED,
    marginTop: 4,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "700",
  },

  input: {
    backgroundColor: "rgba(0,0,0,0.03)",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 14,
    color: C_TEXT,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ web: 10, default: 11 }),
  },

  bigInput: {
    minHeight: 48,
    fontSize: 15,
    marginTop: 10,
  },

  descriptionInput: {
    minHeight: 88,
    textAlignVertical: "top",
  },

  folderChooser: {
    backgroundColor: "rgba(0,0,0,0.03)",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 12,
  },

  folderChooserLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  folderChooserValue: {
    color: C_TEXT,
    fontWeight: "900",
    fontSize: 15,
  },

  formatSimpleGrid: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

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

  formatCardActive: {
    borderColor: C_BLUE,
    backgroundColor: "rgba(37,99,235,0.10)",
  },

  formatCardIconWrap: {
    minWidth: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  formatIconText: {
    color: C_TEXT,
    fontWeight: "900",
    fontSize: 18,
  },

  formatIconTextActive: {
    color: C_BLUE,
  },

  formatCardText: {
    color: C_TEXT,
    fontWeight: "900",
    fontSize: 14,
    flexShrink: 1,
  },

  formatCardTextActive: {
    color: C_BLUE,
  },

  duplicateTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  duplicateTopTitle: {
    flex: 1,
    color: C_TEXT,
    fontWeight: "800",
    lineHeight: 18,
  },

  sectionHeaderInline: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

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

  countBadgeText: {
    color: C_BLUE,
    fontWeight: "900",
    fontSize: 13,
  },

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

  emptyText: {
    color: C_MUTED,
    textAlign: "center",
  },

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

  selectedOrderBadgeText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 13,
  },

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

  selectedMain: {
    flex: 1,
    minWidth: 0,
  },

  selectedTitle: {
    color: C_TEXT,
    fontWeight: "800",
    fontSize: 14,
  },

  frozenMiniChip: {
    width: 26,
    height: 26,
    borderRadius: 999,
    backgroundColor: "rgba(191,219,254,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },

  selectedActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  orderBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },

  orderBtnText: {
    color: C_TEXT,
    fontWeight: "900",
    fontSize: 15,
  },

  removeBtn: {
    backgroundColor: C_RED,
  },

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

  cardBalisesTop: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: C_BORDER,
  },

  balisesScrollableArea: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },

  filtersRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },

  searchWrap: {
    flex: 1,
    position: "relative",
  },

  searchIcon: {
    position: "absolute",
    left: 10,
    top: 12,
    zIndex: 1,
  },

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

  filterChipActive: {
    backgroundColor: C_BLUE_STRONG,
    borderColor: C_BLUE_STRONG,
  },

  filterChipText: {
    color: "#1e3a8a",
    fontWeight: "800",
    fontSize: 12,
  },

  filterChipTextActive: {
    color: "#fff",
  },

  helperText: {
    color: C_MUTED,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: "700",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },

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

  tileSelected: {
    backgroundColor: "rgba(14,165,233,0.12)",
    borderColor: "rgba(14,165,233,0.45)",
    borderWidth: 2,
  },

  tileDuplicateMode: {
    backgroundColor: "rgba(37,99,235,0.08)",
    borderColor: "rgba(37,99,235,0.30)",
    borderWidth: 2,
  },

  tileFrozen: {
    borderColor: "rgba(249,115,22,0.45)",
  },

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

  numBadgeTxt: {
    color: C_TEXT,
    fontWeight: "900",
    fontSize: 10,
  },

  tileCode: {
    color: C_TEXT,
    fontWeight: "900",
    paddingHorizontal: 4,
  },

  previewCenter: {
    alignItems: "center",
    justifyContent: "center",
  },

  poinconPreviewWrap: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.16)",
    borderRadius: 9,
    padding: 3,
  },

  poinconPreviewRow: {
    flexDirection: "row",
  },

  poinconPreviewCell: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },

  poinconPreviewDot: {
    borderRadius: 999,
    backgroundColor: C_TEXT,
  },

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

  countBubbleText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 10,
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

  bottomActionsRow: {
    flexDirection: "row",
    gap: 10,
  },

  bottomGhostBtn: {
    minHeight: 52,
    flex: 1,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: C_BORDER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  bottomGhostBtnText: {
    color: C_TEXT,
    fontWeight: "900",
    fontSize: 15,
  },

  bottomGhostBtnTextDisabled: {
    color: "#94a3b8",
  },

  bottomPrimaryBtn: {
    minHeight: 52,
    flex: 1.2,
    borderRadius: 14,
    backgroundColor: C_GREEN,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },

  bottomPrimaryBtnDisabled: {
    opacity: 0.72,
  },

  bottomPrimaryBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
  },

  bottomBtnDisabled: {
    opacity: 0.55,
  },

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },

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

  folderModalTitle: {
    color: C_TEXT,
    fontSize: 18,
    fontWeight: "800",
  },

  closeIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },

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

  folderRowSelected: {
    backgroundColor: "rgba(14,165,233,0.12)",
    borderColor: "rgba(14,165,233,0.45)",
  },

  folderRowText: {
    color: C_TEXT,
    fontWeight: "700",
    flex: 1,
  },
});
