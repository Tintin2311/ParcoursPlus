// src/GestionEleves.tsx
// ✅ Modif demandée :
// - Suppression du badge Garçon/Fille
// - Fond bleu pâle ou rose pâle selon le genre
// - Icônes crayon + poubelle remontées en haut à droite
// - Prénom + code redescendus pour mieux voir le code

import React, { useCallback, useEffect, useMemo, useState } from "react";
import BottomBar from "./ui/BottomBar";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
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
import { Picker } from "@react-native-picker/picker";
import {
  ArrowLeft,
  ChevronLeft,
  Download,
  Edit3,
  Grid2x2,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react-native";
import { supabase } from "./supabaseClient";

/* ======================= Types ======================= */
type SetPageFn = (page: any) => void;
type ProfesseurMinimal = { user_id?: string | null };

type GroupeMinimal = {
  id: string | number;
  name?: string;
  nom?: string;
  color?: string;
  niveau?: string | null;
  folderId?: string | null;
  folder_id?: string | null;
  teacher_id?: string | number;
};

type GenreEleve = "M" | "F" | null;
type SortMode = "order_asc" | "order_desc" | "alpha_asc" | "alpha_desc";

interface Eleve {
  id: string;
  name: string;
  code: string;
  group_id: string;
  teacher_id: string;
  genre: GenreEleve;
  order_index: number | null;
}

type TableauAssignment = {
  assigned_index: number;
  assigned_cell_key: string;
};

type Props = {
  setPage: SetPageFn;
  professeur: ProfesseurMinimal;
  selectedGroup?: GroupeMinimal | null;
  selectedGroupId?: string | null;
  setModeConnexion?: (mode: any) => void;
  onOpenStatistiquesEleve?: (eleve: Eleve) => void;
};

/* ======================= Charte graphique ======================= */
const PAGE_BG = "#EDF2F6";
const HEADER_BG = "#1F5B86";
const HEADER_ICON_BG = "#2D6C97";
const HEADER_TITLE = "#FFFFFF";

const CONTENT_BG = "#EEF3F7";
const CONTENT_BORDER = "#C6D2DC";

const CARD_BG = "#FFFFFF";
const CARD_BLUE_BG = "#F8FCFF";
const CARD_PINK_BG = "#FFFAFC";

const CARD_BORDER = "#C9D5DF";
const CARD_BLUE_BORDER = "#D5E8F4";
const CARD_PINK_BORDER = "#EED8E2";
const CARD_BLUE_ACCENT = "#8FC5E8";
const CARD_PINK_ACCENT = "#E9A8C2";

const CARD_TITLE = "#233548";
const CARD_MUTED = "#6B7E8E";

const BLUE_SOFT = "#F2F8FC";
const BLUE_BORDER = "#CFE0EC";
const GREEN = HEADER_BG;
const RED = "#DC2626";
const READABLE_CODE_FONT = Platform.select({
  web: '"Menlo", "Consolas", "Courier New", monospace',
  ios: "Menlo",
  android: "monospace",
  default: "monospace",
});
const TABLE_USER_PREFS_KEY = "tableau_generation_preferences";

const BOTTOM_BAR_HEIGHT = 78;
const DEFAULT_BOTTOM_SPACE = 104;
const GRID_GAP = 12;

const IOS_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 8,
};

/* ======================= Helpers ======================= */
function normalizeText(v: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getColumnCount(width: number) {
  if (width >= 1500) return 6;
  if (width >= 1250) return 5;
  if (width >= 980) return 4;
  if (width >= 700) return 3;
  return 2;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getFirstName(name: string) {
  return String(name || "").trim().split(/\s+/)[0] || "Sans nom";
}

function getSafeFileName(value: string) {
  const normalized = normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "classe";
}

function getStudentCardColors(genre: GenreEleve) {
  if (genre === "F") {
    return {
      backgroundColor: CARD_PINK_BG,
      borderColor: CARD_PINK_BORDER,
      accentColor: CARD_PINK_ACCENT,
    };
  }

  if (genre === "M") {
    return {
      backgroundColor: CARD_BLUE_BG,
      borderColor: CARD_BLUE_BORDER,
      accentColor: CARD_BLUE_ACCENT,
    };
  }

  return {
    backgroundColor: CARD_BG,
    borderColor: CARD_BORDER,
    accentColor: "transparent",
  };
}

function toColumnLabel(index: number) {
  let n = Math.max(0, Math.floor(index));
  let out = "";

  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);

  return out;
}

function makeTableauCellKeyFromIndex(index: number, rows = 9, cols = 9) {
  const total = Math.max(1, rows * cols);
  const safeIndex = Math.max(0, Math.floor(Number(index) || 0)) % total;
  const row = Math.floor(safeIndex / cols);
  const col = safeIndex % cols;
  return `${toColumnLabel(col)}${row + 1}`;
}

function cellKeyToIndex(cellKey: string, rows = 9, cols = 9) {
  const clean = String(cellKey || "").trim().toUpperCase();
  const match = clean.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;

  const letters = match[1];
  const row = Number(match[2]) - 1;
  let col = 0;

  for (let i = 0; i < letters.length; i += 1) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
  }
  col -= 1;

  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= rows || col >= cols) {
    return null;
  }

  return row * cols + col;
}

/* ======================= Composant principal ======================= */
const GestionEleves: React.FC<Props> = ({
  setPage,
  professeur,
  selectedGroup,
  selectedGroupId,
  onOpenStatistiquesEleve,
}) => {
  const { width, height } = useWindowDimensions();

  const isDesktop = width >= 1100;
  const isTablet = width >= 768 && width < 1100;
  const isPhone = width < 768;
  const verySmallPhone = width < 380;

  const horizontalPadding = isDesktop ? 28 : isTablet ? 22 : 14;
  const headerHeight = isDesktop ? 86 : isTablet ? 82 : 78;
  const headerTitleSize = isDesktop ? 20 : isTablet ? 19 : 18;

  const numColumns = useMemo(() => getColumnCount(width), [width]);
  const totalGap = GRID_GAP * (numColumns - 1);
  const usableWidth = Math.max(0, width - horizontalPadding * 2 - totalGap);
  const cardWidth = usableWidth / numColumns;

  const estimatedCardHeight = (height - headerHeight - DEFAULT_BOTTOM_SPACE - 92) / 3;
  const cardHeight = clamp(
    estimatedCardHeight,
    isPhone ? (verySmallPhone ? 122 : 132) : 142,
    isDesktop ? 170 : 158
  );

  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [tableauAssignments, setTableauAssignments] = useState<Record<string, TableauAssignment>>({});
  const [tableauPrefRows, setTableauPrefRows] = useState(4);
  const [tableauPrefCols, setTableauPrefCols] = useState(4);
  const [isLoaded, setIsLoaded] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [sortMode] = useState<SortMode>("order_asc");

  const [showAddModal, setShowAddModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const [editingEleveId, setEditingEleveId] = useState<string | null>(null);
  const [editedEleveName, setEditedEleveName] = useState("");
  const [editedEleveGenre, setEditedEleveGenre] = useState<GenreEleve>("M");
  const [editedEleveCode, setEditedEleveCode] = useState("");
  const [editedTableauCell, setEditedTableauCell] = useState("A1");

  const [newEleveName, setNewEleveName] = useState("");
  const [newEleveGenre, setNewEleveGenre] = useState<GenreEleve>("M");

  const [refreshing, setRefreshing] = useState(false);
  const [emptyHint, setEmptyHint] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Eleve | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const groupId: string | null = useMemo(() => {
    const id = selectedGroup?.id ?? selectedGroupId ?? null;
    return id != null ? String(id) : null;
  }, [selectedGroup, selectedGroupId]);

  const headerName = selectedGroup?.name ?? selectedGroup?.nom ?? "Groupe";

  const backToGroups = useCallback(() => {
    const folderId = selectedGroup?.folderId ?? selectedGroup?.folder_id;
    if (folderId !== undefined) {
      (globalThis as any).__gestionGroupesLastFolderId = folderId;
    }
    setPage("gestionGroupes");
  }, [selectedGroup, setPage]);

  const editingEleve = useMemo(() => {
    return eleves.find((eleve) => eleve.id === editingEleveId) ?? null;
  }, [eleves, editingEleveId]);

  const recapEleves = useMemo(() => {
    return [...eleves].sort((a, b) => {
      const aOrder = typeof a.order_index === "number" ? a.order_index : Number.MAX_SAFE_INTEGER;
      const bOrder = typeof b.order_index === "number" ? b.order_index : Number.MAX_SAFE_INTEGER;

      if (aOrder !== bOrder) return aOrder - bOrder;
      return normalizeText(a.name).localeCompare(normalizeText(b.name), "fr", { sensitivity: "base" });
    });
  }, [eleves]);

  const fetchEleves = useCallback(async () => {
    setEmptyHint(null);

    if (!professeur?.user_id || !groupId) {
      setEleves([]);
      setIsLoaded(true);
      return;
    }

    const { data, error } = await supabase
      .from("students")
      .select("id, name, code, group_id, teacher_id, genre, order_index")
      .eq("teacher_id", professeur.user_id)
      .eq("group_id", groupId)
      .order("order_index", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Erreur chargement élèves:", error.message);
      Alert.alert("Erreur", "Impossible de charger les élèves.");
      setEleves([]);
      setIsLoaded(true);
      return;
    }

    const mapped: Eleve[] = (data || []).map((e: any) => ({
      id: String(e.id),
      name: String(e.name ?? ""),
      code: String(e.code ?? ""),
      group_id: String(e.group_id ?? ""),
      teacher_id: String(e.teacher_id ?? ""),
      genre: (e.genre as GenreEleve) ?? null,
      order_index: typeof e.order_index === "number" ? e.order_index : null,
    }));

    if (mapped.length === 0) {
      setEmptyHint("Aucun élève trouvé dans ce groupe.");
    }

    setEleves(mapped);

    let preferredRows = 4;
    let preferredCols = 4;

    try {
      const { data: prefData, error: prefError } = await supabase
        .from("user_preferences")
        .select("value")
        .eq("user_id", professeur.user_id)
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

    setTableauPrefRows(preferredRows);
    setTableauPrefCols(preferredCols);

    const defaultAssignments = new Map<string, TableauAssignment>();
    mapped.forEach((eleve, index) => {
      const assignedIndex =
        typeof eleve.order_index === "number" && eleve.order_index > 0
          ? eleve.order_index - 1
          : index;
      defaultAssignments.set(eleve.id, {
        assigned_index: assignedIndex,
        assigned_cell_key: makeTableauCellKeyFromIndex(assignedIndex, preferredRows, preferredCols),
      });
    });

    try {
      const existingAssignmentStudentIds = new Set<string>();
      const { data: assignmentRows, error: assignmentError } = await supabase
        .from("tableau_student_assignments")
        .select("student_id, assigned_index, assigned_cell_key")
        .eq("professeur_id", professeur.user_id)
        .eq("group_id", groupId);

      if (!assignmentError) {
        ((assignmentRows as any[]) || []).forEach((row) => {
          const studentId = String(row?.student_id ?? "");
          if (!studentId) return;
          existingAssignmentStudentIds.add(studentId);
          const assignedIndex = Math.max(0, Math.floor(Number(row?.assigned_index) || 0));
          defaultAssignments.set(studentId, {
            assigned_index: assignedIndex,
            assigned_cell_key: makeTableauCellKeyFromIndex(assignedIndex, preferredRows, preferredCols),
          });
        });

        const missingAssignments = mapped
          .filter((eleve) => !existingAssignmentStudentIds.has(eleve.id))
          .map((eleve, index) => {
            const currentAssignment = defaultAssignments.get(eleve.id);
            const assignedIndex = currentAssignment?.assigned_index ?? index;
            return {
              professeur_id: professeur.user_id,
              group_id: groupId,
              student_id: eleve.id,
              assigned_index: assignedIndex,
              assigned_cell_key: makeTableauCellKeyFromIndex(assignedIndex, preferredRows, preferredCols),
            };
          });

        if (missingAssignments.length > 0) {
          const { error: upsertDefaultsError } = await supabase
            .from("tableau_student_assignments")
            .upsert(missingAssignments, { onConflict: "professeur_id,group_id,student_id" });

          if (upsertDefaultsError) {
            console.warn("Attributions tableau par défaut non enregistrées:", upsertDefaultsError.message);
          }
        }
      }
    } catch (assignmentError) {
      console.warn("Attributions tableau indisponibles:", assignmentError);
    }

    setTableauAssignments(Object.fromEntries(defaultAssignments));
    setIsLoaded(true);
  }, [professeur?.user_id, groupId]);

  useEffect(() => {
    setIsLoaded(false);
    fetchEleves();
  }, [fetchEleves]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEleves();
    setRefreshing(false);
  }, [fetchEleves]);

  const generateEleveCode = useCallback((ignoredEleveId?: string | null) => {
    let newCode: string;
    do {
      newCode = Math.floor(100000 + Math.random() * 900000).toString();
    } while (eleves.some((e) => e.id !== ignoredEleveId && e.code === newCode));
    return newCode;
  }, [eleves]);

  const nextOrderIndex = useMemo(() => {
    const maxVal = eleves.reduce((acc, e) => {
      const n = typeof e.order_index === "number" ? e.order_index : 0;
      return Math.max(acc, n);
    }, 0);
    return maxVal + 1;
  }, [eleves]);

  const filteredAndSortedEleves = useMemo(() => {
    const q = normalizeText(searchTerm);

    let list = eleves.filter((e) => {
      if (!q) return true;
      return normalizeText(e.name).includes(q) || String(e.code || "").includes(q);
    });

    list = [...list].sort((a, b) => {
      const aName = normalizeText(a.name);
      const bName = normalizeText(b.name);
      const aOrder = typeof a.order_index === "number" ? a.order_index : Number.MAX_SAFE_INTEGER;
      const bOrder = typeof b.order_index === "number" ? b.order_index : Number.MAX_SAFE_INTEGER;

      if (sortMode === "order_asc") {
        if (aOrder !== bOrder) return aOrder - bOrder;
        return aName.localeCompare(bName, "fr", { sensitivity: "base" });
      }

      if (sortMode === "order_desc") {
        if (aOrder !== bOrder) return bOrder - aOrder;
        return bName.localeCompare(aName, "fr", { sensitivity: "base" });
      }

      if (sortMode === "alpha_asc") {
        const cmp = aName.localeCompare(bName, "fr", { sensitivity: "base" });
        if (cmp !== 0) return cmp;
        return aOrder - bOrder;
      }

      const cmp = bName.localeCompare(aName, "fr", { sensitivity: "base" });
      if (cmp !== 0) return cmp;
      return bOrder - aOrder;
    });

    return list;
  }, [eleves, searchTerm, sortMode]);

  const startEditing = useCallback((eleve: Eleve) => {
    setEditingEleveId(eleve.id);
    setEditedEleveName(eleve.name);
    setEditedEleveGenre(eleve.genre ?? "M");
    setEditedEleveCode(eleve.code);
    setEditedTableauCell(tableauAssignments[eleve.id]?.assigned_cell_key ?? "A1");
  }, [tableauAssignments]);

  const cancelEditing = useCallback(() => {
    setEditingEleveId(null);
    setEditedEleveName("");
    setEditedEleveGenre("M");
    setEditedEleveCode("");
    setEditedTableauCell("A1");
    Keyboard.dismiss();
  }, []);

  const resetEditedEleveCode = useCallback(() => {
    let newCode = "";
    do {
      newCode = generateEleveCode(editingEleveId);
    } while (newCode === editedEleveCode);

    setEditedEleveCode(newCode);
  }, [generateEleveCode, editingEleveId, editedEleveCode]);

  const openAddModal = useCallback(() => {
    setShowAddModal(true);
  }, []);

  const openExportModal = useCallback(() => {
    if (recapEleves.length === 0) {
      Alert.alert("Aucun élève", "Il n'y a aucun code à télécharger pour cette classe.");
      return;
    }

    setShowExportModal(true);
  }, [recapEleves.length]);

  const closeExportModal = useCallback(() => {
    setShowExportModal(false);
  }, []);

  const closeAddModal = useCallback(() => {
    setShowAddModal(false);
    setNewEleveName("");
    setNewEleveGenre("M");
    Keyboard.dismiss();
  }, []);

  const openStudentStats = useCallback(
    (eleve: Eleve) => {
      if (onOpenStatistiquesEleve) {
        onOpenStatistiquesEleve(eleve);
        return;
      }

      (globalThis as any).__selectedStatistiquesEleve = eleve;
      (globalThis as any).__selectedStatistiquesEleveId = eleve.id;
      (globalThis as any).__selectedStatistiquesEleveGroupId = groupId;
      (globalThis as any).__selectedStatistiquesEleveGroup = selectedGroup ?? null;
      setPage("StatistiquesEleve");
    },
    [groupId, selectedGroup, setPage, onOpenStatistiquesEleve]
  );

  const buildRecapHtml = useCallback(() => {
    const title = `Classe ${headerName}`;
    const rows = recapEleves
      .map(
        (eleve) => `
	          <tr>
	            <td>${escapeHtml(getFirstName(eleve.name))}</td>
	            <td>${escapeHtml(eleve.code)}</td>
	            <td>${escapeHtml(tableauAssignments[eleve.id]?.assigned_cell_key ?? "A1")}</td>
	          </tr>`
      )
      .join("");

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        color: #233548;
        padding: 32px;
      }
      h1 {
        color: #1F5B86;
        font-size: 24px;
        margin: 0 0 20px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th {
        background: #1F5B86;
        color: #ffffff;
        text-align: left;
      }
      th,
      td {
        border: 1px solid #C6D2DC;
        padding: 10px 12px;
        font-size: 14px;
      }
      tr:nth-child(even) td {
        background: #F2F8FC;
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <table>
      <thead>
        <tr>
	          <th>Prénom</th>
	          <th>Code</th>
	          <th>Case tableau</th>
	        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </body>
</html>`;
  }, [headerName, recapEleves, tableauAssignments]);

  const downloadTextFile = useCallback((content: string, filename: string, mimeType: string) => {
    const globalAny = globalThis as any;
    const documentRef = globalAny.document;
    const BlobRef = globalAny.Blob;
    const URLRef = globalAny.URL || globalAny.webkitURL;

    if (!documentRef || !BlobRef || !URLRef) {
      Alert.alert("Téléchargement indisponible", "Cette exportation est disponible depuis la version web.");
      return;
    }

    const blob = new BlobRef([content], { type: mimeType });
    const url = URLRef.createObjectURL(blob);
    const link = documentRef.createElement("a");
    link.href = url;
    link.download = filename;
    documentRef.body.appendChild(link);
    link.click();
    documentRef.body.removeChild(link);
    URLRef.revokeObjectURL(url);
  }, []);

  const exportRecap = useCallback(
    (format: "pdf" | "word" | "excel") => {
      const html = buildRecapHtml();
      const fileBaseName = `codes-eleves-${getSafeFileName(headerName)}`;

      if (format === "pdf") {
        const globalAny = globalThis as any;
        const windowRef = globalAny.window;

        if (!windowRef?.open) {
          Alert.alert("PDF indisponible", "L'export PDF est disponible depuis la version web.");
          return;
        }

        const printWindow = windowRef.open("", "_blank");
        if (!printWindow) {
          Alert.alert("Fenêtre bloquée", "Autorisez l'ouverture de fenêtre pour générer le PDF.");
          return;
        }

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
        setShowExportModal(false);
        return;
      }

      if (format === "word") {
        downloadTextFile(`\ufeff${html}`, `${fileBaseName}.doc`, "application/msword;charset=utf-8");
        setShowExportModal(false);
        return;
      }

      downloadTextFile(`\ufeff${html}`, `${fileBaseName}.xls`, "application/vnd.ms-excel;charset=utf-8");
      setShowExportModal(false);
    },
    [buildRecapHtml, downloadTextFile, headerName]
  );

  const addEleveToSupabase = async () => {
    const trimmedName = newEleveName.trim();

    if (!trimmedName) {
      return Alert.alert("Manque d'info", "Veuillez entrer un nom pour l'élève.");
    }

    if (!professeur?.user_id || !groupId) {
      return Alert.alert("Erreur", "Professeur ou groupe manquant.");
    }

    const alreadyExists = eleves.some((e) => normalizeText(e.name) === normalizeText(trimmedName));
    if (alreadyExists) {
      return Alert.alert("Doublon", "Un élève avec ce nom existe déjà dans ce groupe.");
    }

    const code = generateEleveCode();

    const { error } = await supabase.from("students").insert({
      name: trimmedName,
      code,
      group_id: groupId,
      teacher_id: professeur.user_id,
      genre: newEleveGenre,
      order_index: nextOrderIndex,
    });

    if (error) {
      console.error("Erreur ajout élève:", error.message);
      Alert.alert("Erreur", "Impossible d'ajouter l'élève.");
      return;
    }

    closeAddModal();
    await fetchEleves();
  };

  const updateEleveInSupabase = async (eleveId: string) => {
    const trimmedName = editedEleveName.trim();

    if (!trimmedName) {
      return Alert.alert("Nom vide", "Le nom de l'élève ne peut pas être vide.");
    }

    if (!professeur?.user_id || !groupId) {
      Alert.alert("Erreur", "Professeur ou groupe manquant.");
      cancelEditing();
      return;
    }

    const cleanTableauCell = String(editedTableauCell || "A1").trim().toUpperCase();
    const assignedIndex = cellKeyToIndex(cleanTableauCell, tableauPrefRows, tableauPrefCols);

    if (assignedIndex == null) {
      Alert.alert(
        "Case incorrecte",
        `Utilise une case entre A1 et ${makeTableauCellKeyFromIndex(tableauPrefRows * tableauPrefCols - 1, tableauPrefRows, tableauPrefCols)}.`
      );
      return;
    }

    const { error } = await supabase
      .from("students")
      .update({ name: trimmedName, genre: editedEleveGenre, code: editedEleveCode || generateEleveCode(eleveId) })
      .eq("id", eleveId)
      .eq("teacher_id", professeur.user_id)
      .eq("group_id", groupId);

    if (error) {
      console.error("Erreur MAJ élève:", error.message);
      Alert.alert("Erreur", "Impossible de mettre à jour l'élève.");
      return;
    }

    const assignmentResult = await supabase
      .from("tableau_student_assignments")
      .upsert(
        {
          professeur_id: professeur.user_id,
          group_id: groupId,
          student_id: eleveId,
          assigned_index: assignedIndex,
          assigned_cell_key: makeTableauCellKeyFromIndex(assignedIndex, tableauPrefRows, tableauPrefCols),
        },
        { onConflict: "professeur_id,group_id,student_id" }
      );

    if (assignmentResult.error) {
      console.warn("Erreur MAJ attribution tableau:", assignmentResult.error.message);
      Alert.alert("Élève enregistré", "L'élève a été enregistré, mais la case tableau n'a pas pu être modifiée.");
    }

    cancelEditing();
    await fetchEleves();
  };

  const askDeleteEleve = useCallback((eleve: Eleve) => {
    setDeleteTarget(eleve);
  }, []);

  const cancelDeleteEleve = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  const confirmDeleteEleve = useCallback(async () => {
    if (!deleteTarget || !professeur?.user_id || !groupId) {
      setDeleteTarget(null);
      return;
    }

    setDeletingId(deleteTarget.id);

    const { error } = await supabase.rpc("delete_student_completely", {
      p_student_id: deleteTarget.id,
    });

    setDeletingId(null);

    if (error) {
      console.error("Erreur suppression élève:", error.message);
      Alert.alert("Erreur", "Impossible de supprimer complètement l'élève.");
      return;
    }

    if (editingEleveId === deleteTarget.id) cancelEditing();

    setDeleteTarget(null);
    await fetchEleves();
  }, [deleteTarget, professeur?.user_id, groupId, editingEleveId, fetchEleves, cancelEditing]);

  if (!groupId) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerScreen}>
          <TouchableOpacity onPress={backToGroups} style={styles.backBtnLarge}>
            <ArrowLeft size={18} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.backBtnLargeText}>Retour aux groupes</Text>
          </TouchableOpacity>

          <Text style={styles.centerText}>Choisissez un groupe dans la page précédente.</Text>
        </View>

        <BottomBar currentPage="gestionGroupes" onNavigate={setPage} />
      </SafeAreaView>
    );
  }

  if (!isLoaded) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centerScreen}>
          <ActivityIndicator size="large" color={HEADER_BG} />
          <Text style={styles.centerText}>Chargement des élèves…</Text>
        </View>

        <BottomBar currentPage="gestionGroupes" onNavigate={setPage} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.fill}>
        <View
          style={[
            styles.header,
            {
              paddingHorizontal: horizontalPadding,
            },
          ]}
        >
          <View style={styles.headerMainRow}>
            <View style={styles.headerLeft}>
              <TouchableOpacity onPress={backToGroups} style={styles.headerBackBtn}>
                <ChevronLeft size={19} color="#FFFFFF" strokeWidth={3} />
                <Text style={styles.headerBackText}>Retour</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => setPage("CreationGroupeSessionEleve")}
                style={styles.headerActionBtn}
              >
                <Users size={18} color="#FFFFFF" strokeWidth={2.4} />
              </TouchableOpacity>

              <TouchableOpacity onPress={openExportModal} style={styles.headerActionBtn}>
                <Download size={18} color="#FFFFFF" strokeWidth={2.4} />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setShowSearch((v) => !v)} style={styles.headerActionBtn}>
                <Search size={18} color="#FFFFFF" strokeWidth={2.4} />
              </TouchableOpacity>
            </View>
          </View>

          {showSearch && (
            <View style={styles.headerSearchBar}>
              <TextInput
                placeholder="Rechercher un élève ou un code…"
                placeholderTextColor="rgba(255,255,255,0.82)"
                value={searchTerm}
                onChangeText={setSearchTerm}
                style={styles.inputHeader}
                returnKeyType="search"
                autoFocus
              />
              <TouchableOpacity
                onPress={() => {
                  setShowSearch(false);
                  setSearchTerm("");
                }}
                style={styles.headerSearchClose}
              >
                <X size={18} color="#FFFFFF" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.subHeader}>
          <Text style={[styles.headerTitle, { fontSize: headerTitleSize }]} numberOfLines={1}>
            {headerName}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {eleves.length} élève{eleves.length > 1 ? "s" : ""}
          </Text>
        </View>

        <View
          style={[
            styles.contentZone,
            {
              paddingHorizontal: horizontalPadding,
              paddingTop: isPhone ? 12 : 16,
            },
          ]}
        >
          <FlatList
            key={`grid-${numColumns}`}
            data={filteredAndSortedEleves}
            keyExtractor={(item) => item.id}
            refreshing={refreshing}
            onRefresh={onRefresh}
            keyboardShouldPersistTaps="handled"
            numColumns={numColumns}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: BOTTOM_BAR_HEIGHT + 106,
            }}
            columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
            ListHeaderComponent={
              emptyHint && filteredAndSortedEleves.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>{emptyHint}</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const cardColors = getStudentCardColors(item.genre);
              const tableauAssignment = tableauAssignments[item.id];

		              return (
	                <View style={[styles.itemOuter, { width: cardWidth }]}>
	                  <TouchableOpacity
	                    activeOpacity={0.9}
	                    onPress={() => openStudentStats(item)}
	                    style={[
	                      styles.studentCard,
	                      {
	                        height: cardHeight,
	                        backgroundColor: cardColors.backgroundColor,
                        borderColor: cardColors.borderColor,
                      },
	                    ]}
	                  >
	                    <View
	                      pointerEvents="none"
	                      style={[
	                        styles.genderAccent,
	                        { backgroundColor: cardColors.accentColor },
	                      ]}
	                    />
	                    <View style={styles.cardHeaderLine}>
	                      <View style={styles.numberPill}>
	                        <Text style={styles.numberPillText}>N° {item.order_index ?? "—"}</Text>
	                      </View>

	                      <View style={styles.cardTopActions}>
	                        <TouchableOpacity
	                          onPress={(event: any) => {
	                            event?.stopPropagation?.();
	                            startEditing(item);
	                          }}
	                          style={styles.iconBtn}
	                          accessibilityLabel="Modifier l'élève"
	                        >
	                          <Edit3 size={15} color={HEADER_BG} strokeWidth={2.4} />
	                        </TouchableOpacity>

	                        <TouchableOpacity
	                          onPress={(event: any) => {
	                            event?.stopPropagation?.();
	                            askDeleteEleve(item);
	                          }}
	                          style={[styles.iconBtn, styles.actionDeleteSoft]}
	                          accessibilityLabel="Supprimer l'élève"
	                        >
	                          <Trash2 size={15} color={RED} strokeWidth={2.4} />
	                        </TouchableOpacity>
	                      </View>
	                    </View>

	                    <View style={styles.studentMainContent}>
	                      <Text
	                        style={[
	                          styles.studentName,
	                          isPhone && styles.studentNamePhone,
	                          verySmallPhone && styles.studentNameVerySmall,
	                        ]}
	                        numberOfLines={2}
	                      >
	                        {item.name || "Sans nom"}
	                      </Text>

		                      <View style={styles.codeBox}>
		                        <Text style={styles.codeLabel}>Code</Text>
		                        <Text style={styles.codeMono} numberOfLines={1}>
		                          {item.code}
		                        </Text>
		                      </View>
                          <View style={styles.tableauAssignmentBox}>
                            <Grid2x2 size={13} color={HEADER_BG} strokeWidth={2.5} />
                            <Text style={styles.tableauAssignmentLabel}>Tableau</Text>
                            <Text style={styles.tableauAssignmentValue}>
                              {tableauAssignment?.assigned_cell_key ?? "A1"}
                            </Text>
                          </View>
		                    </View>
		                  </TouchableOpacity>
                </View>
              );
            }}
          />
        </View>

        <View style={styles.fabWrap} pointerEvents="box-none">
          <TouchableOpacity onPress={openAddModal} style={styles.fab} activeOpacity={0.9}>
            <UserPlus size={21} color="#FFFFFF" strokeWidth={2.4} />
            <Text style={styles.fabText}>Ajouter un élève</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={showAddModal} animationType="fade" transparent onRequestClose={closeAddModal}>
        <Pressable style={styles.modalOverlay} onPress={closeAddModal}>
          <Pressable style={[styles.modalCard, { width: Math.min(width - 28, 520) }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <View style={styles.modalIconBlue}>
                  <UserPlus size={20} color="#FFFFFF" strokeWidth={2.4} />
                </View>
                <Text style={styles.modalTitle}>Ajouter un élève</Text>
              </View>

              <TouchableOpacity onPress={closeAddModal} style={styles.closeBtn}>
                <X size={20} color={HEADER_BG} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.label}>Nom de l'élève</Text>
              <TextInput
                placeholder="Ex : Jean Dupont"
                placeholderTextColor="rgba(35,53,72,0.45)"
                value={newEleveName}
                onChangeText={setNewEleveName}
                onSubmitEditing={addEleveToSupabase}
                style={styles.input}
                returnKeyType="done"
                autoFocus
              />

              <Text style={[styles.label, { marginTop: 12 }]}>Genre</Text>
              <View style={styles.pickerWrap}>
                <Picker
                  selectedValue={newEleveGenre ?? "M"}
                  onValueChange={(val) => setNewEleveGenre((val as GenreEleve) ?? "M")}
                  dropdownIconColor={HEADER_BG}
                  style={styles.picker}
                >
                  <Picker.Item label="Garçon" value="M" />
                  <Picker.Item label="Fille" value="F" />
                </Picker>
              </View>

              <View style={styles.nextNumberBox}>
                <Text style={styles.nextNumberText}>Le prochain élève aura le numéro {nextOrderIndex}.</Text>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity onPress={closeAddModal} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Annuler</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={addEleveToSupabase} style={styles.primaryBtn}>
                  <UserPlus size={16} color="#FFFFFF" strokeWidth={2.4} />
                  <Text style={styles.primaryBtnText}>Ajouter</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!editingEleve} animationType="fade" transparent onRequestClose={cancelEditing}>
        <KeyboardAvoidingView
          style={styles.modalKeyboardView}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={12}
        >
          <Pressable style={styles.modalOverlay} onPress={cancelEditing}>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Pressable
                style={[styles.modalCard, styles.editModalCard, { width: Math.min(width - 28, 520) }]}
                onPress={(e) => e.stopPropagation()}
              >
                <View style={styles.modalHeader}>
                  <View style={styles.modalTitleRow}>
                    <View style={styles.modalIconBlue}>
                      <Edit3 size={20} color="#FFFFFF" strokeWidth={2.4} />
                    </View>
                    <Text style={styles.modalTitle}>Modifier l'élève</Text>
                  </View>

                  <TouchableOpacity onPress={cancelEditing} style={styles.closeBtn}>
                    <X size={20} color={HEADER_BG} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalBody}>
                  <Text style={styles.label}>Prénom</Text>
	                  <TextInput
	                    placeholder="Ex : Jean"
                    placeholderTextColor="rgba(35,53,72,0.45)"
                    value={editedEleveName}
                    onChangeText={setEditedEleveName}
                    onSubmitEditing={() => editingEleve && updateEleveInSupabase(editingEleve.id)}
                    style={styles.input}
                    returnKeyType="done"
                  />

                  <Text style={[styles.label, { marginTop: 12 }]}>Genre</Text>
                  <View style={styles.genderSegment}>
                    <TouchableOpacity
                      onPress={() => setEditedEleveGenre("M")}
                      style={[styles.genderOption, editedEleveGenre === "M" && styles.genderOptionActive]}
                    >
                      <Text style={[styles.genderOptionText, editedEleveGenre === "M" && styles.genderOptionTextActive]}>
                        Garçon
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setEditedEleveGenre("F")}
                      style={[styles.genderOption, editedEleveGenre === "F" && styles.genderOptionActive]}
                    >
                      <Text style={[styles.genderOptionText, editedEleveGenre === "F" && styles.genderOptionTextActive]}>
                        Fille
                      </Text>
                    </TouchableOpacity>
                  </View>

	                  <Text style={[styles.label, { marginTop: 12 }]}>Code</Text>
	                  <View style={styles.codeEditRow}>
	                    <View style={styles.codeEditBox}>
	                      <Text style={styles.codeEditText}>{editedEleveCode || "—"}</Text>
	                    </View>

                    <TouchableOpacity
                      onPress={resetEditedEleveCode}
                      style={styles.resetCodeBtn}
                      accessibilityLabel="Réinitialiser le code"
                    >
                      <RotateCcw size={18} color={HEADER_BG} strokeWidth={2.5} />
	                    </TouchableOpacity>
	                  </View>

                    <Text style={[styles.label, { marginTop: 12 }]}>Case tableau</Text>
                    <Text style={styles.tableauEditHint}>
                      Selon le tableau favori {tableauPrefRows} x {tableauPrefCols}. Les parcours plus petits ou plus grands adaptent automatiquement cette case.
                    </Text>
                    <View style={styles.tableauEditRow}>
                      <Grid2x2 size={17} color={HEADER_BG} strokeWidth={2.5} />
                      <TextInput
                        value={editedTableauCell}
                        onChangeText={(value) =>
                          setEditedTableauCell(value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3))
                        }
                        placeholder="A1"
                        placeholderTextColor="rgba(35,53,72,0.45)"
                        style={styles.tableauEditInput}
                        autoCapitalize="characters"
                      />
                    </View>

	                  <View style={styles.modalActions}>
                    <TouchableOpacity onPress={cancelEditing} style={styles.secondaryBtn}>
                      <Text style={styles.secondaryBtnText}>Annuler</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => editingEleve && updateEleveInSupabase(editingEleve.id)}
                      style={styles.primaryBtn}
                    >
                      <Save size={16} color="#FFFFFF" strokeWidth={2.4} />
                      <Text style={styles.primaryBtnText}>Enregistrer</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Pressable>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showExportModal} animationType="fade" transparent onRequestClose={closeExportModal}>
        <Pressable style={styles.modalOverlay} onPress={closeExportModal}>
          <Pressable style={[styles.modalCard, { width: Math.min(width - 28, 500) }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <View style={styles.modalIconBlue}>
                  <Download size={20} color="#FFFFFF" strokeWidth={2.4} />
                </View>
                <Text style={styles.modalTitle}>Télécharger les codes</Text>
              </View>

              <TouchableOpacity onPress={closeExportModal} style={styles.closeBtn}>
                <X size={20} color={HEADER_BG} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.exportIntro}>
                {headerName} · {recapEleves.length} élève{recapEleves.length > 1 ? "s" : ""}
              </Text>

              <View style={styles.exportFormatGrid}>
                <TouchableOpacity onPress={() => exportRecap("pdf")} style={styles.exportOptionBtn}>
                  <Text style={styles.exportOptionTitle}>PDF</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => exportRecap("word")} style={styles.exportOptionBtn}>
                  <Text style={styles.exportOptionTitle}>Word</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => exportRecap("excel")} style={styles.exportOptionBtn}>
                  <Text style={styles.exportOptionTitle}>Excel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={!!deleteTarget} animationType="fade" transparent onRequestClose={cancelDeleteEleve}>
        <Pressable style={styles.modalOverlay} onPress={cancelDeleteEleve}>
          <Pressable style={[styles.modalCard, { width: Math.min(width - 28, 460) }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <View style={styles.modalIconRed}>
                  <Trash2 size={20} color="#FFFFFF" strokeWidth={2.4} />
                </View>
                <Text style={styles.modalTitle}>Supprimer un élève</Text>
              </View>

              <TouchableOpacity onPress={cancelDeleteEleve} style={styles.closeBtn}>
                <X size={20} color={HEADER_BG} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.deleteText}>
                Voulez-vous vraiment supprimer <Text style={styles.deleteName}>{deleteTarget?.name || "cet élève"}</Text> ?
              </Text>

              <View style={styles.modalActions}>
                <TouchableOpacity onPress={cancelDeleteEleve} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Annuler</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={confirmDeleteEleve} style={styles.deleteBtn} disabled={!!deletingId}>
                  <Trash2 size={16} color="#FFFFFF" strokeWidth={2.4} />
                  <Text style={styles.deleteBtnText}>{deletingId ? "Suppression..." : "Supprimer"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <BottomBar currentPage="gestionGroupes" onNavigate={setPage} />
    </SafeAreaView>
  );
};

export default GestionEleves;

/* ======================= Styles ======================= */
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },

  fill: {
    flex: 1,
  },

  centerScreen: {
    flex: 1,
    backgroundColor: PAGE_BG,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  centerText: {
    marginTop: 14,
    color: CARD_TITLE,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },

  backBtnLarge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: HEADER_BG,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  backBtnLargeText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  header: {
    backgroundColor: HEADER_BG,
    justifyContent: "center",
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 6,
  },

  headerMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
  },

  headerBackBtn: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 13,
    backgroundColor: "#2B79B1",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.28)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },

  headerBackText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },

  headerTitleBox: {
    flex: 1,
    minWidth: 0,
  },

  headerTitle: {
    color: HEADER_TITLE,
    fontWeight: "900",
    letterSpacing: 0.8,
    textAlign: "center",
  },

  headerSubtitle: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 12.5,
    fontWeight: "700",
    marginTop: 2,
    textAlign: "center",
  },

  subHeader: {
    backgroundColor: "#2B79B1",
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.14)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },

  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  headerActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: HEADER_ICON_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  headerSearchBar: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  inputHeader: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    borderRadius: 14,
    color: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ web: 10, default: 9 }),
    fontWeight: "700",
  },

  headerSearchClose: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: HEADER_ICON_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  contentZone: {
    flex: 1,
    backgroundColor: CONTENT_BG,
    borderTopWidth: 1,
    borderTopColor: CONTENT_BORDER,
  },

  emptyBox: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 18,
    padding: 16,
    ...(Platform.OS === "ios" ? IOS_SHADOW : {}),
    elevation: Platform.OS === "android" ? 2 : 0,
  },

  emptyText: {
    color: CARD_MUTED,
    textAlign: "center",
    fontWeight: "700",
  },

  columnWrapper: {
    justifyContent: "flex-start",
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },

  itemOuter: {
    marginBottom: GRID_GAP,
  },

  studentCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 10,
    justifyContent: "space-between",
    overflow: "hidden",
    ...(Platform.OS === "ios" ? IOS_SHADOW : {}),
    elevation: Platform.OS === "android" ? 2 : 0,
  },
  genderAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },

  cardHeaderLine: {
    height: 34,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 6,
  },

  cardTopActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  studentMainContent: {
    flex: 1,
    justifyContent: "flex-end",
    paddingTop: 8,
  },

  numberPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: BLUE_BORDER,
  },

  numberPillText: {
    color: HEADER_BG,
    fontSize: 10.5,
    fontWeight: "900",
  },

  studentName: {
    color: CARD_TITLE,
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 19,
    minHeight: 38,
    marginBottom: 8,
  },

  studentNamePhone: {
    fontSize: 13,
    lineHeight: 16,
    minHeight: 32,
    marginBottom: 7,
  },

  studentNameVerySmall: {
    fontSize: 12,
    lineHeight: 15,
    minHeight: 30,
  },

  codeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "#DCE7EF",
  },

  codeLabel: {
    color: CARD_MUTED,
    fontSize: 10.5,
    fontWeight: "900",
  },

  codeMono: {
    flexShrink: 1,
    color: CARD_TITLE,
    fontSize: 11.5,
    fontWeight: "900",
    fontFamily: READABLE_CODE_FONT,
    fontVariant: ["tabular-nums"],
  },
  tableauAssignmentBox: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    maxWidth: "100%",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "#E0F2FE",
    borderWidth: 1,
    borderColor: "#BAE6FD",
  },
  tableauAssignmentLabel: {
    color: HEADER_BG,
    fontSize: 10.5,
    fontWeight: "900",
  },
  tableauAssignmentValue: {
    color: CARD_TITLE,
    fontSize: 12,
    fontWeight: "900",
    fontFamily: READABLE_CODE_FONT,
    fontVariant: ["tabular-nums"],
  },

  iconBtn: {
    width: 31,
    height: 31,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: BLUE_BORDER,
  },

  actionDeleteSoft: {
    backgroundColor: "rgba(255,255,255,0.72)",
    borderColor: "rgba(220,38,38,0.22)",
  },

  fabWrap: {
    position: "absolute",
    bottom: BOTTOM_BAR_HEIGHT + 24,
    left: 0,
    right: 0,
    alignItems: "center",
  },

  fab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 999,
    backgroundColor: GREEN,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },

  fabText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },

  modalKeyboardView: {
    flex: 1,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(11,31,48,0.48)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },

  modalScroll: {
    alignSelf: "stretch",
    width: "100%",
  },

  modalScrollContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
  },

  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 26,
    padding: 16,
    borderWidth: 1,
    borderColor: "#D5E1EA",
    ...(Platform.OS === "ios" ? IOS_SHADOW : {}),
    elevation: Platform.OS === "android" ? 4 : 0,
  },

  editModalCard: {
    maxHeight: "92%",
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },

  modalTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  modalIconBlue: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: HEADER_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  modalIconRed: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: RED,
    alignItems: "center",
    justifyContent: "center",
  },

  modalTitle: {
    flex: 1,
    color: HEADER_BG,
    fontSize: 20,
    fontWeight: "900",
  },

  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#EEF6FC",
    alignItems: "center",
    justifyContent: "center",
  },

  modalBody: {},

  label: {
    color: CARD_MUTED,
    fontSize: 12,
    marginBottom: 6,
    fontWeight: "900",
  },

  input: {
    backgroundColor: "#F6FAFD",
    borderWidth: 1,
    borderColor: BLUE_BORDER,
    borderRadius: 14,
    color: CARD_TITLE,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ web: 11, default: 10 }),
    fontSize: 15,
    fontWeight: "800",
  },

  pickerWrap: {
    backgroundColor: "#F6FAFD",
    borderWidth: 1,
    borderColor: BLUE_BORDER,
    borderRadius: 14,
    overflow: "hidden",
  },

  picker: {
    color: CARD_TITLE,
    height: 46,
  },

  genderSegment: {
    flexDirection: "row",
    gap: 10,
  },

  genderOption: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#F6FAFD",
    borderWidth: 1,
    borderColor: BLUE_BORDER,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  genderOptionActive: {
    backgroundColor: HEADER_BG,
    borderColor: HEADER_BG,
  },

  genderOptionText: {
    color: HEADER_BG,
    fontSize: 14,
    fontWeight: "900",
  },

  genderOptionTextActive: {
    color: "#FFFFFF",
  },

  nextNumberBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: BLUE_SOFT,
    borderWidth: 1,
    borderColor: BLUE_BORDER,
  },

  nextNumberText: {
    color: HEADER_BG,
    fontWeight: "900",
  },

  codeEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  codeEditBox: {
    flex: 1,
    minHeight: 46,
    backgroundColor: "#F6FAFD",
    borderWidth: 1,
    borderColor: BLUE_BORDER,
    borderRadius: 14,
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  codeEditText: {
    color: CARD_TITLE,
    fontSize: 16,
    fontWeight: "900",
    fontFamily: READABLE_CODE_FONT,
    fontVariant: ["tabular-nums"],
  },

  resetCodeBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: BLUE_SOFT,
    borderWidth: 1,
    borderColor: BLUE_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  tableauEditRow: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F6FAFD",
    borderWidth: 1,
    borderColor: BLUE_BORDER,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  tableauEditHint: {
    color: CARD_MUTED,
    fontSize: 12,
    fontWeight: "700",
    marginTop: -5,
    marginBottom: 8,
  },
  tableauEditInput: {
    flex: 1,
    minHeight: 42,
    color: CARD_TITLE,
    fontSize: 16,
    fontWeight: "900",
    fontFamily: READABLE_CODE_FONT,
    fontVariant: ["tabular-nums"],
  },

  exportIntro: {
    color: CARD_MUTED,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 14,
  },

  exportFormatGrid: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },

  exportOptionBtn: {
    flex: 1,
    minWidth: 112,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BLUE_SOFT,
    borderWidth: 1,
    borderColor: BLUE_BORDER,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 16,
  },

  exportOptionTitle: {
    color: HEADER_BG,
    fontSize: 15,
    fontWeight: "900",
  },

  modalActions: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },

  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: GREEN,
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 14,
  },

  primaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },

  secondaryBtn: {
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: BLUE_SOFT,
    borderWidth: 1,
    borderColor: BLUE_BORDER,
  },

  secondaryBtnText: {
    color: HEADER_BG,
    fontWeight: "900",
  },

  deleteText: {
    color: CARD_TITLE,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },

  deleteName: {
    fontWeight: "900",
  },

  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: RED,
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 14,
  },

  deleteBtnText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
});
