import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import {
  ArrowLeft,
  Book,
  Bookmark,
  Briefcase,
  Camera,
  Check,
  Cloud,
  Coffee,
  Edit3,
  Folder as FolderIcon,
  FolderOpen,
  Gift,
  Heart,
  MoreVertical,
  Move,
  Search,
  Sun,
  Target,
  Trash2,
  X,
} from "lucide-react-native";
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from "react-native-draggable-flatlist";
import { supabase } from "./supabaseClient";
import BottomBar from "./ui/BottomBar";

/* =======================
   Types
======================= */
type Props = {
  setPage: (p: any) => void;
  setParcoursId?: (id: string | null) => void;
  professeur?: { id?: string | null; user_id?: string | null } | null;
};

type BaseItem = {
  id: string;
  created_at?: string | null;
  ordre: number;
};

type Course = BaseItem & {
  type: "course";
  nom: string;
  description?: string | null;
  balises: number;
  folder_id: string | null;
  user_id?: string | null;
  professeur_id?: string | null;
};

type Folder = BaseItem & {
  type: "folder";
  nom: string;
  description?: string | null;
  color: FolderColor;
  icon: FolderIconName;
  parent_folder_id: string | null;
  children: TreeItem[];
};

type TreeItem = Folder | Course;

type FolderColor =
  | "purple"
  | "indigo"
  | "fuchsia"
  | "red"
  | "green"
  | "blue"
  | "yellow";

type FolderIconName =
  | "Folder"
  | "Bookmark"
  | "Briefcase"
  | "Cloud"
  | "Sun"
  | "Heart"
  | "Book"
  | "Coffee"
  | "Gift"
  | "Camera";

/* =======================
   Constantes
======================= */
const C_BG = "#EFEFEF";
const C_HEADER = "#87A7BA";
const C_TEXT = "#0f172a";
const C_MUTED = "rgba(15,23,42,0.65)";
const C_BORDER = "rgba(0,0,0,0.08)";
const C_PRIMARY = "#0ea5e9";
const C_DANGER = "#ef4444";
const BOTTOM_BAR_HEIGHT = 78;

const colorOptions: FolderColor[] = [
  "purple",
  "indigo",
  "fuchsia",
  "red",
  "green",
  "blue",
  "yellow",
];

const iconOptions: FolderIconName[] = [
  "Folder",
  "Bookmark",
  "Briefcase",
  "Cloud",
  "Sun",
  "Heart",
  "Book",
  "Coffee",
  "Gift",
  "Camera",
];

/* =======================
   Icônes / couleurs dossier
======================= */
const folderIcons: Record<
  FolderIconName,
  React.ComponentType<{ size?: number; color?: string }>
> = {
  Folder: FolderIcon,
  Bookmark,
  Briefcase,
  Cloud,
  Sun,
  Heart,
  Book,
  Coffee,
  Gift,
  Camera,
};

const folderColors: Record<
  FolderColor,
  { bg: string; soft: string; text: string }
> = {
  purple: {
    bg: "#7c3aed",
    soft: "rgba(124,58,237,0.14)",
    text: "#5b21b6",
  },
  indigo: {
    bg: "#4f46e5",
    soft: "rgba(79,70,229,0.14)",
    text: "#3730a3",
  },
  fuchsia: {
    bg: "#c026d3",
    soft: "rgba(192,38,211,0.14)",
    text: "#a21caf",
  },
  red: {
    bg: "#dc2626",
    soft: "rgba(220,38,38,0.14)",
    text: "#991b1b",
  },
  green: {
    bg: "#16a34a",
    soft: "rgba(22,163,74,0.14)",
    text: "#166534",
  },
  blue: {
    bg: "#2563eb",
    soft: "rgba(37,99,235,0.14)",
    text: "#1d4ed8",
  },
  yellow: {
    bg: "#d97706",
    soft: "rgba(217,119,6,0.14)",
    text: "#92400e",
  },
};

/* =======================
   Helpers
======================= */
const sortByOrdre = (a: TreeItem, b: TreeItem) => (a.ordre ?? 0) - (b.ordre ?? 0);

const mapSupabaseDataToFrontend = (
  supabaseFolders: any[],
  supabaseParcours: any[]
): TreeItem[] => {
  const folders = new Map<string, Folder>();
  const courses = new Map<string, Course>();

  for (const f of supabaseFolders || []) {
    if (!f?.id) continue;
    const name = String(f.name || "").trim();
    if (!name) continue;

    folders.set(f.id, {
      id: f.id,
      type: "folder",
      nom: name,
      description: f.description ?? null,
      color: (f.color as FolderColor) || "purple",
      icon: (f.icon as FolderIconName) || "Folder",
      parent_folder_id: f.parent_folder_id ?? null,
      created_at: f.created_at ?? null,
      ordre: Number(f.ordre ?? 0),
      children: [],
    });
  }

  for (const p of supabaseParcours || []) {
    if (!p?.id) continue;
    const name = String(p.nom || "").trim();
    if (!name) continue;

    courses.set(p.id, {
      id: p.id,
      type: "course",
      nom: name,
      description: p.description ?? null,
      balises: Array.isArray(p.balises_ordre) ? p.balises_ordre.length : 0,
      folder_id: p.folder_id ?? null,
      user_id: p.user_id ?? null,
      professeur_id: p.professeur_id ?? null,
      created_at: p.created_at ?? null,
      ordre: Number(p.ordre ?? 0),
    });
  }

  const roots: TreeItem[] = [];

  courses.forEach((course) => {
    if (course.folder_id && folders.has(course.folder_id)) {
      folders.get(course.folder_id)!.children.push(course);
    } else {
      roots.push(course);
    }
  });

  folders.forEach((folder) => {
    if (folder.parent_folder_id && folders.has(folder.parent_folder_id)) {
      folders.get(folder.parent_folder_id)!.children.push(folder);
    } else {
      roots.push(folder);
    }
  });

  const sortRec = (list: TreeItem[]) => {
    list.sort(sortByOrdre);
    list.forEach((item) => {
      if (item.type === "folder") sortRec(item.children);
    });
  };

  sortRec(roots);
  return roots;
};

const findItemRecursive = (id: string, list: TreeItem[]): TreeItem | null => {
  for (const item of list) {
    if (item.id === id) return item;
    if (item.type === "folder") {
      const found = findItemRecursive(id, item.children);
      if (found) return found;
    }
  }
  return null;
};

const deleteItemRecursive = (id: string, list: TreeItem[]): TreeItem[] =>
  list
    .filter((item) => item.id !== id)
    .map((item) =>
      item.type === "folder"
        ? { ...item, children: deleteItemRecursive(id, item.children) }
        : item
    );

const flattenFolders = (items: TreeItem[]): Folder[] => {
  const result: Folder[] = [];

  const walk = (list: TreeItem[]) => {
    for (const item of list) {
      if (item.type === "folder") {
        result.push(item);
        walk(item.children);
      }
    }
  };

  walk(items);
  return result;
};

const getVisibleItems = (
  items: TreeItem[],
  currentFolder: Folder | null,
  searchTerm: string
): TreeItem[] => {
  let list: TreeItem[] = currentFolder
    ? currentFolder.children
    : items.filter((item) =>
        item.type === "folder" ? !item.parent_folder_id : !item.folder_id
      );

  if (searchTerm.trim()) {
    const q = searchTerm.trim().toLowerCase();
    list = list.filter((item) => item.nom.toLowerCase().includes(q));
  }

  return [...list].sort(sortByOrdre);
};

const getFolderPathLabel = (folderId: string, items: TreeItem[]): string => {
  const names: string[] = [];
  let current = findItemRecursive(folderId, items);

  while (current && current.type === "folder") {
    names.unshift(current.nom);
    current = current.parent_folder_id
      ? findItemRecursive(current.parent_folder_id, items)
      : null;
  }

  return names.join(" / ");
};

const isFolderDescendant = (
  folderToMoveId: string,
  possibleDescendantId: string,
  items: TreeItem[]
): boolean => {
  const folder = findItemRecursive(folderToMoveId, items);
  if (!folder || folder.type !== "folder") return false;

  const walk = (list: TreeItem[]): boolean => {
    for (const item of list) {
      if (item.id === possibleDescendantId) return true;
      if (item.type === "folder" && walk(item.children)) return true;
    }
    return false;
  };

  return walk(folder.children);
};

const getDestinationChildren = (
  items: TreeItem[],
  destinationFolderId: string | null,
  movingItems: TreeItem[]
): Folder[] => {
  const sourceList: TreeItem[] =
    destinationFolderId === null
      ? items.filter((item) => item.type === "folder" && !item.parent_folder_id)
      : (findItemRecursive(destinationFolderId, items) as Folder | null)?.children ?? [];

  const foldersOnly: Folder[] = sourceList.filter(
    (item): item is Folder => item.type === "folder"
  );

  const blockedIds = new Set<string>();

  movingItems.forEach((movingItem) => {
    if (movingItem.type === "folder") {
      blockedIds.add(movingItem.id);
      flattenFolders([movingItem]).forEach((f) => blockedIds.add(f.id));
    }
  });

  return foldersOnly.filter((folder) => !blockedIds.has(folder.id));
};

const getMaxOrdreInDestination = (
  items: TreeItem[],
  destinationFolderId: string | null
): number => {
  const list: TreeItem[] =
    destinationFolderId === null
      ? items.filter((item) =>
          item.type === "folder" ? !item.parent_folder_id : !item.folder_id
        )
      : (findItemRecursive(destinationFolderId, items) as Folder | null)?.children ?? [];

  return Math.max(-1, ...list.map((item) => item.ordre ?? 0));
};

const reorderArray = <T,>(arr: T[], fromIndex: number, toIndex: number): T[] => {
  const next = [...arr];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
};

const updateChildrenForFolder = (
  items: TreeItem[],
  folderId: string,
  nextChildren: TreeItem[]
): TreeItem[] =>
  items.map((item) => {
    if (item.type === "folder") {
      if (item.id === folderId) {
        return { ...item, children: nextChildren };
      }
      return {
        ...item,
        children: updateChildrenForFolder(item.children, folderId, nextChildren),
      };
    }
    return item;
  });

const updateOrdresSequentially = (list: TreeItem[]): TreeItem[] =>
  list.map((item, index) => ({ ...item, ordre: index }));

const buildDeleteErrorMessage = (e: any, fallback: string) => {
  const message =
    e?.message || e?.details || e?.hint || e?.error_description || fallback;
  return String(message);
};

/* =======================
   Composant principal
======================= */
const MesParcours: React.FC<Props> = ({
  setPage,
  setParcoursId = () => {},
  professeur = null,
}) => {
  const [items, setItems] = useState<TreeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingSilently, setRefreshingSilently] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);

  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState<"create" | "edit">("create");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("");
  const [folderDescription, setFolderDescription] = useState("");
  const [folderColor, setFolderColor] = useState<FolderColor>("purple");
  const [folderIcon, setFolderIcon] = useState<FolderIconName>("Folder");
  const [savingFolder, setSavingFolder] = useState(false);

  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TreeItem | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [movingItems, setMovingItems] = useState<TreeItem[]>([]);
  const [moveDestinationCurrentFolderId, setMoveDestinationCurrentFolderId] =
    useState<string | null>(null);
  const [moveDestinationSelectedFolderId, setMoveDestinationSelectedFolderId] =
    useState<string | null>(null);
  const [movingItemSaving, setMovingItemSaving] = useState(false);

  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<TreeItem | null>(null);
  const [deletingItem, setDeletingItem] = useState(false);

  const loadData = useCallback(
    async (silent = false) => {
      try {
        if (silent) setRefreshingSilently(true);
        else {
          setLoading(true);
          setError(null);
        }

        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;

        const connectedUserId = authData.user?.id ?? null;
        const ownerId = professeur?.user_id ?? professeur?.id ?? connectedUserId;

        if (!ownerId) {
          throw new Error("Professeur non connecté.");
        }

        const [
          { data: foldersData, error: foldersError },
          { data: parcoursData, error: parcoursError },
        ] = await Promise.all([
          supabase
            .from("parcours_folders")
            .select("*")
            .eq("user_id", ownerId)
            .order("ordre", { ascending: true }),

          supabase
            .from("parcours")
            .select("*")
            .eq("user_id", ownerId)
            .order("ordre", { ascending: true }),
        ]);

        if (foldersError) throw foldersError;
        if (parcoursError) throw parcoursError;

        const tree = mapSupabaseDataToFrontend(foldersData || [], parcoursData || []);
        setItems(tree);

        if (currentFolderId) {
          const stillExists = findItemRecursive(currentFolderId, tree);
          if (!stillExists || stillExists.type !== "folder") {
            setCurrentFolderId(null);
          }
        }
      } catch (e: any) {
        console.error("❌ MesParcours load:", e);
        setError(e?.message || "Impossible de charger les parcours.");
      } finally {
        if (silent) setRefreshingSilently(false);
        else setLoading(false);
      }
    },
    [currentFolderId, professeur]
  );

  const refreshData = useCallback(async () => {
    await loadData(false);
  }, [loadData]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    const channel = supabase
      .channel("mes-parcours-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "parcours" },
        async () => {
          await loadData(true);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "parcours_folders" },
        async () => {
          await loadData(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  const currentFolder = useMemo(() => {
    if (!currentFolderId) return null;
    const found = findItemRecursive(currentFolderId, items);
    return found && found.type === "folder" ? found : null;
  }, [currentFolderId, items]);

  const visibleItems = useMemo(
    () => getVisibleItems(items, currentFolder, searchTerm),
    [items, currentFolder, searchTerm]
  );

  const persistSiblingOrder = useCallback(
    async (siblings: TreeItem[], folderId: string | null) => {
      const normalized = updateOrdresSequentially(siblings);

      const foldersToUpdate = normalized.filter(
        (item): item is Folder => item.type === "folder"
      );
      const coursesToUpdate = normalized.filter(
        (item): item is Course => item.type === "course"
      );

      for (const folder of foldersToUpdate) {
        const { error } = await supabase
          .from("parcours_folders")
          .update({
            ordre: folder.ordre,
            parent_folder_id: folderId,
          })
          .eq("id", folder.id);

        if (error) throw error;
      }

      for (const course of coursesToUpdate) {
        const { error } = await supabase
          .from("parcours")
          .update({
            ordre: course.ordre,
            folder_id: folderId,
          })
          .eq("id", course.id);

        if (error) throw error;
      }
    },
    []
  );

  const moveVisibleItem = useCallback(
    async (itemId: string, direction: "up" | "down") => {
      if (ordering || searchTerm.trim()) return;

      const siblings = currentFolder
        ? [...currentFolder.children].sort(sortByOrdre)
        : [...items.filter((item) =>
            item.type === "folder" ? !item.parent_folder_id : !item.folder_id
          )].sort(sortByOrdre);

      const fromIndex = siblings.findIndex((item) => item.id === itemId);
      if (fromIndex < 0) return;

      const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
      if (toIndex < 0 || toIndex >= siblings.length) return;

      const reordered = updateOrdresSequentially(
        reorderArray(siblings, fromIndex, toIndex)
      );

      const optimistic = currentFolder
        ? updateChildrenForFolder(items, currentFolder.id, reordered)
        : reordered;

      setItems(optimistic);

      try {
        setOrdering(true);
        await persistSiblingOrder(reordered, currentFolder?.id ?? null);
        await loadData(true);
      } catch (e: any) {
        console.error("❌ reorder visible items:", e);
        window?.alert?.("Impossible de réorganiser les éléments.");
        await loadData(true);
      } finally {
        setOrdering(false);
      }
    },
    [ordering, searchTerm, currentFolder, items, persistSiblingOrder, loadData]
  );

  const handleDragEndVisibleItems = useCallback(
    async (nextData: TreeItem[]) => {
      if (searchTerm.trim()) return;

      const reordered = updateOrdresSequentially(nextData);

      const optimistic = currentFolder
        ? updateChildrenForFolder(items, currentFolder.id, reordered)
        : reordered;

      setItems(optimistic);

      try {
        setOrdering(true);
        await persistSiblingOrder(reordered, currentFolder?.id ?? null);
        await loadData(true);
      } catch (e: any) {
        console.error("❌ drag reorder:", e);
        window?.alert?.("Impossible d'enregistrer le nouvel ordre.");
        await loadData(true);
      } finally {
        setOrdering(false);
      }
    },
    [searchTerm, currentFolder, items, persistSiblingOrder, loadData]
  );

  const openFolder = useCallback(
    (folder: Folder) => {
      if (selectionMode) return;
      setCurrentFolderId(folder.id);
      setSearchTerm("");
      setSearchVisible(false);
    },
    [selectionMode]
  );

  const goBack = useCallback(() => {
    if (selectionMode) {
      setSelectionMode(false);
      setSelectedIds([]);
      return;
    }

    if (currentFolder) {
      if (currentFolder.parent_folder_id) {
        setCurrentFolderId(currentFolder.parent_folder_id);
      } else {
        setCurrentFolderId(null);
      }
      setSearchTerm("");
      setSearchVisible(false);
      return;
    }

    setPage("gestionParcours");
  }, [selectionMode, currentFolder, setPage]);

  const toggleSearch = useCallback(() => {
    setSearchVisible((prev) => {
      const next = !prev;
      if (!next) setSearchTerm("");
      return next;
    });
  }, []);

  const openCreateFolderModal = useCallback(() => {
    setFolderModalMode("create");
    setEditingFolderId(null);
    setFolderName("");
    setFolderDescription("");
    setFolderColor("purple");
    setFolderIcon("Folder");
    setFolderModalVisible(true);
  }, []);

  const openEditFolderModal = useCallback((folder: Folder) => {
    setFolderModalMode("edit");
    setEditingFolderId(folder.id);
    setFolderName(folder.nom);
    setFolderDescription(folder.description || "");
    setFolderColor(folder.color || "purple");
    setFolderIcon(folder.icon || "Folder");
    setFolderModalVisible(true);
  }, []);

  const handleSaveFolder = useCallback(async () => {
    const finalName = folderName.trim();
    if (!finalName) {
      window?.alert?.("Le nom du dossier est obligatoire.");
      return;
    }

    try {
      setSavingFolder(true);

      if (folderModalMode === "create") {
        const baseList = currentFolder
          ? currentFolder.children
          : items.filter((item) =>
              item.type === "folder" ? !item.parent_folder_id : !item.folder_id
            );

        const nextOrdre = Math.max(-1, ...baseList.map((i) => i.ordre ?? 0)) + 1;

       const { data: authData, error: authError } = await supabase.auth.getUser();

if (authError) throw authError;

const ownerId = authData.user?.id ?? null;

if (!ownerId) {
  throw new Error("Impossible de créer le dossier : utilisateur non connecté.");
}

const { error } = await supabase.from("parcours_folders").insert({
  name: finalName,
  description: folderDescription.trim() || null,
  color: folderColor,
  icon: folderIcon,
  parent_folder_id: currentFolder?.id ?? null,
  ordre: nextOrdre,
  user_id: ownerId,
});

        if (error) throw error;
      } else if (editingFolderId) {
        const { error } = await supabase
          .from("parcours_folders")
          .update({
            name: finalName,
            description: folderDescription.trim() || null,
            color: folderColor,
            icon: folderIcon,
          })
          .eq("id", editingFolderId);

        if (error) throw error;
      }

      setFolderModalVisible(false);
      await loadData(true);
    } catch (e: any) {
      console.error("❌ save folder:", e);
      window?.alert?.(e?.message || "Impossible d'enregistrer le dossier.");
    } finally {
      setSavingFolder(false);
    }
   }, [
    folderName,
    folderDescription,
    folderColor,
    folderIcon,
    folderModalMode,
    editingFolderId,
    currentFolder,
    items,
    loadData,
  ]);

  const requestDeleteItem = useCallback((item: TreeItem) => {
    setActionSheetVisible(false);
    setSelectedItem(null);
    setItemToDelete(item);
    setConfirmDeleteVisible(true);
  }, []);

  const closeDeleteModal = useCallback(() => {
    if (deletingItem) return;
    setConfirmDeleteVisible(false);
    setItemToDelete(null);
  }, [deletingItem]);

  const confirmDeleteItem = useCallback(async () => {
    if (!itemToDelete) return;

    try {
      setDeletingItem(true);

      if (itemToDelete.type === "folder") {
        console.log("🗑️ tentative suppression dossier", {
          id: itemToDelete.id,
          nom: itemToDelete.nom,
          parent_folder_id: itemToDelete.parent_folder_id,
        });

        const { data, error } = await supabase
          .from("parcours_folders")
          .delete()
          .eq("id", itemToDelete.id)
          .select("id");

        console.log("🗑️ résultat suppression dossier", { data, error });

        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error(
            "Aucune ligne supprimée. Vérifie les policies RLS ou les contraintes SQL."
          );
        }

        const nextItems = deleteItemRecursive(itemToDelete.id, items);
        setItems(nextItems);

        if (currentFolderId === itemToDelete.id) {
          setCurrentFolderId(null);
        }
      } else {
        console.log("🗑️ tentative suppression parcours", {
          id: itemToDelete.id,
          nom: itemToDelete.nom,
          folder_id: itemToDelete.folder_id,
          user_id: itemToDelete.user_id,
          professeur_id: itemToDelete.professeur_id,
        });

        const { data, error } = await supabase
          .from("parcours")
          .delete()
          .eq("id", itemToDelete.id)
          .select("id");

        console.log("🗑️ résultat suppression parcours", { data, error });

        if (error) throw error;
        if (!data || data.length === 0) {
          throw new Error(
            "Aucune ligne supprimée. Vérifie les policies RLS ou les contraintes SQL."
          );
        }

        setItems((prev) => deleteItemRecursive(itemToDelete.id, prev));
      }

      setConfirmDeleteVisible(false);
      setItemToDelete(null);
      await loadData(true);
    } catch (e: any) {
      console.error("❌ delete item:", e);
      window?.alert?.(
        buildDeleteErrorMessage(e, "Suppression impossible.")
      );
    } finally {
      setDeletingItem(false);
    }
  }, [itemToDelete, items, currentFolderId, loadData]);

  const handleOpenCourse = useCallback(
  (courseId: string) => {
    if (selectionMode) return;

    setParcoursId(courseId);

    setPage({
      name: "ModifierUnParcours",
      parcoursId: courseId,
    });
  },
  [selectionMode, setParcoursId, setPage]
);

 const handleCreateCourse = useCallback(() => {
  setParcoursId(null);
  setPage("CreerUnNouveauParcours");
}, [setParcoursId, setPage]);

  const openItemActions = useCallback(
    (item: TreeItem) => {
      if (selectionMode) return;
      setSelectedItem(item);
      setActionSheetVisible(true);
    },
    [selectionMode]
  );

  const closeItemActions = useCallback(() => {
    setActionSheetVisible(false);
    setSelectedItem(null);
  }, []);

  const startSelectionWithItem = useCallback((item: TreeItem) => {
    setSelectionMode(true);
    setSelectedIds([item.id]);
  }, []);

  const toggleItemSelection = useCallback((itemId: string) => {
    setSelectedIds((prev) => {
      const exists = prev.includes(itemId);
      if (exists) {
        const next = prev.filter((id) => id !== itemId);
        if (next.length === 0) {
          setSelectionMode(false);
        }
        return next;
      }
      return [...prev, itemId];
    });
  }, []);

  const selectedItems = useMemo(
    () =>
      selectedIds
        .map((id) => findItemRecursive(id, items))
        .filter(Boolean) as TreeItem[],
    [selectedIds, items]
  );

  const openMoveModalForItems = useCallback((itemsToMove: TreeItem[]) => {
    if (!itemsToMove.length) return;
    setMovingItems(itemsToMove);
    setMoveDestinationCurrentFolderId(null);
    setMoveDestinationSelectedFolderId(null);
    setMoveModalVisible(true);
  }, []);

  const openMoveModalForSingle = useCallback(
    (item: TreeItem) => {
      openMoveModalForItems([item]);
    },
    [openMoveModalForItems]
  );

  const closeMoveModal = useCallback(() => {
    setMoveModalVisible(false);
    setMovingItems([]);
    setMoveDestinationCurrentFolderId(null);
    setMoveDestinationSelectedFolderId(null);
  }, []);

  const moveNavigatorCurrentFolder = useMemo(() => {
    if (moveDestinationCurrentFolderId === null) return null;
    const found = findItemRecursive(moveDestinationCurrentFolderId, items);
    return found && found.type === "folder" ? found : null;
  }, [moveDestinationCurrentFolderId, items]);

  const moveNavigatorChildren = useMemo(
    () => getDestinationChildren(items, moveDestinationCurrentFolderId, movingItems),
    [items, moveDestinationCurrentFolderId, movingItems]
  );

  const handleMoveNavigatorOpenFolder = useCallback((folder: Folder) => {
    setMoveDestinationCurrentFolderId(folder.id);
    setMoveDestinationSelectedFolderId(folder.id);
  }, []);

  const handleMoveNavigatorBack = useCallback(() => {
    if (moveNavigatorCurrentFolder?.parent_folder_id) {
      setMoveDestinationCurrentFolderId(moveNavigatorCurrentFolder.parent_folder_id);
      setMoveDestinationSelectedFolderId(moveNavigatorCurrentFolder.parent_folder_id);
      return;
    }

    setMoveDestinationCurrentFolderId(null);
    setMoveDestinationSelectedFolderId(null);
  }, [moveNavigatorCurrentFolder]);

  const handleMoveToCurrentDestination = useCallback(() => {
    setMoveDestinationSelectedFolderId(moveDestinationCurrentFolderId);
  }, [moveDestinationCurrentFolderId]);

  const handleMoveItems = useCallback(async () => {
    if (!movingItems.length) return;

    try {
      setMovingItemSaving(true);

      let nextOrdre = getMaxOrdreInDestination(items, moveDestinationSelectedFolderId) + 1;

      for (const movingItem of movingItems) {
        if (movingItem.type === "course") {
          const { error } = await supabase
            .from("parcours")
            .update({
              folder_id: moveDestinationSelectedFolderId,
              ordre: nextOrdre,
            })
            .eq("id", movingItem.id);

          if (error) throw error;
        } else {
          if (moveDestinationSelectedFolderId === movingItem.id) {
            throw new Error("Un dossier ne peut pas être déplacé dans lui-même.");
          }

          if (
            moveDestinationSelectedFolderId &&
            isFolderDescendant(movingItem.id, moveDestinationSelectedFolderId, items)
          ) {
            throw new Error(
              "Un dossier ne peut pas être déplacé dans un de ses sous-dossiers."
            );
          }

          const { error } = await supabase
            .from("parcours_folders")
            .update({
              parent_folder_id: moveDestinationSelectedFolderId,
              ordre: nextOrdre,
            })
            .eq("id", movingItem.id);

          if (error) throw error;
        }

        nextOrdre += 1;
      }

      closeMoveModal();
      closeItemActions();
      setSelectionMode(false);
      setSelectedIds([]);
      await loadData(true);
    } catch (e: any) {
      console.error("❌ move items:", e);
      window?.alert?.(e?.message || "Déplacement impossible.");
    } finally {
      setMovingItemSaving(false);
    }
  }, [
    movingItems,
    moveDestinationSelectedFolderId,
    items,
    closeMoveModal,
    closeItemActions,
    loadData,
  ]);

  const renderVisibleItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<TreeItem>) => {
      if (item.type === "folder") {
        return (
          <ScaleDecorator>
            <FolderCard
              folder={item}
              onOpen={openFolder}
              onMore={openItemActions}
              onLongPress={startSelectionWithItem}
              selectionMode={selectionMode}
              selected={selectedIds.includes(item.id)}
              onToggleSelect={toggleItemSelection}
              onMoveUp={() => moveVisibleItem(item.id, "up")}
              onMoveDown={() => moveVisibleItem(item.id, "down")}
              canMoveUp={!ordering && !searchTerm.trim()}
              canMoveDown={!ordering && !searchTerm.trim()}
              onDrag={drag}
              dragDisabled={!!searchTerm.trim() || selectionMode || ordering}
              isDragging={isActive}
            />
          </ScaleDecorator>
        );
      }

      return (
        <ScaleDecorator>
          <CourseCard
            course={item}
            onOpen={handleOpenCourse}
            onMore={openItemActions}
            onLongPress={startSelectionWithItem}
            selectionMode={selectionMode}
            selected={selectedIds.includes(item.id)}
            onToggleSelect={toggleItemSelection}
            onMoveUp={() => moveVisibleItem(item.id, "up")}
            onMoveDown={() => moveVisibleItem(item.id, "down")}
            canMoveUp={!ordering && !searchTerm.trim()}
            canMoveDown={!ordering && !searchTerm.trim()}
            onDrag={drag}
            dragDisabled={!!searchTerm.trim() || selectionMode || ordering}
            isDragging={isActive}
          />
        </ScaleDecorator>
      );
    },
    [
      openFolder,
      openItemActions,
      startSelectionWithItem,
      selectionMode,
      selectedIds,
      toggleItemSelection,
      moveVisibleItem,
      ordering,
      searchTerm,
      handleOpenCourse,
    ]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C_PRIMARY} />
          <Text style={styles.loadingText}>Chargement des parcours...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loadingWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={refreshData} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={goBack} style={styles.topIconBtn} activeOpacity={0.85}>
            <ArrowLeft size={18} color="#fff" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>
              {selectionMode
                ? `${selectedIds.length} sélectionné${selectedIds.length > 1 ? "s" : ""}`
                : "Mes Parcours"}
            </Text>
            {!selectionMode && refreshingSilently ? (
              <Text style={styles.headerSyncText}>Synchronisation…</Text>
            ) : null}
            {!selectionMode && ordering ? (
              <Text style={styles.headerSyncText}>Réorganisation…</Text>
            ) : null}
          </View>

          <View style={styles.headerActions}>
            {selectionMode ? (
              <>
                <TouchableOpacity
                  onPress={() => openMoveModalForItems(selectedItems)}
                  style={styles.topIconBtn}
                  activeOpacity={0.9}
                >
                  <Move size={18} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    setSelectionMode(false);
                    setSelectedIds([]);
                  }}
                  style={styles.topIconBtn}
                  activeOpacity={0.9}
                >
                  <X size={18} color="#fff" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  onPress={openCreateFolderModal}
                  style={styles.topIconBtn}
                  activeOpacity={0.9}
                >
                  <FolderOpen size={18} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleCreateCourse}
                  style={styles.topIconBtn}
                  activeOpacity={0.9}
                >
                  <Target size={18} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={toggleSearch}
                  style={[
                    styles.topIconBtn,
                    searchVisible && styles.topIconBtnActive,
                  ]}
                  activeOpacity={0.9}
                >
                  <Search size={18} color="#fff" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {searchVisible && !selectionMode && (
          <View style={styles.searchBarWrap}>
            <Search
              size={16}
              color="rgba(255,255,255,0.85)"
              style={styles.headerSearchIcon}
            />
            <TextInput
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder={
                currentFolder
                  ? `Rechercher dans ${currentFolder.nom}`
                  : "Rechercher"
              }
              placeholderTextColor="rgba(255,255,255,0.78)"
              style={styles.headerSearchInput}
            />
          </View>
        )}
      </View>

      {!!searchTerm.trim() && (
        <View style={styles.orderHintBox}>
          <Text style={styles.orderHintText}>
            Le glissé-déposé et le tri par flèches sont désactivés pendant une recherche.
          </Text>
        </View>
      )}

      {visibleItems.length === 0 ? (
        <View style={styles.emptyArea}>
          <View style={styles.emptyBox}>
            <FolderOpen size={34} color="rgba(15,23,42,0.35)" />
            <Text style={styles.emptyTitle}>Aucun élément</Text>
            <Text style={styles.emptyText}>
              {searchTerm.trim()
                ? "Aucun résultat pour cette recherche."
                : currentFolder
                ? "Ce dossier est vide."
                : "Aucun dossier ou parcours pour le moment."}
            </Text>
          </View>
        </View>
      ) : (
        <DraggableFlatList
          data={visibleItems}
          keyExtractor={(item) => item.id}
          renderItem={renderVisibleItem}
          onDragEnd={({ data }) => handleDragEndVisibleItems(data)}
          activationDistance={18}
          autoscrollSpeed={120}
          autoscrollThreshold={80}
          containerStyle={styles.list}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 12,
            paddingBottom: BOTTOM_BAR_HEIGHT + 120,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}

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
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              {folderModalMode === "create"
                ? currentFolder
                  ? "Nouveau sous-dossier"
                  : "Nouveau dossier"
                : "Modifier le dossier"}
            </Text>

            <TouchableOpacity
              onPress={() => setFolderModalVisible(false)}
              style={styles.sheetCloseBtn}
            >
              <X size={18} color={C_TEXT} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ maxHeight: 520 }}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ gap: 12 }}>
              <View>
                <Text style={styles.label}>Nom du dossier *</Text>
                <TextInput
                  value={folderName}
                  onChangeText={setFolderName}
                  placeholder="Ex : 6ème A / Forêt / Cycle 1"
                  placeholderTextColor="rgba(15,23,42,0.4)"
                  style={styles.input}
                />
              </View>

              <View>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  value={folderDescription}
                  onChangeText={setFolderDescription}
                  placeholder="Description facultative"
                  placeholderTextColor="rgba(15,23,42,0.4)"
                  style={[styles.input, styles.textarea]}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              <View>
                <Text style={styles.label}>Couleur</Text>
                <View style={styles.colorsRow}>
                  {colorOptions.map((color) => {
                    const palette = folderColors[color];
                    const selected = folderColor === color;
                    return (
                      <TouchableOpacity
                        key={color}
                        onPress={() => setFolderColor(color)}
                        style={[
                          styles.colorDot,
                          { backgroundColor: palette.bg },
                          selected && styles.colorDotSelected,
                        ]}
                      >
                        {selected && <Check size={14} color="#fff" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View>
                <Text style={styles.label}>Icône</Text>
                <View style={styles.iconsGrid}>
                  {iconOptions.map((iconName) => {
                    const IconComp = folderIcons[iconName];
                    const selected = folderIcon === iconName;
                    return (
                      <TouchableOpacity
                        key={iconName}
                        onPress={() => setFolderIcon(iconName)}
                        style={[
                          styles.iconOption,
                          selected && styles.iconOptionSelected,
                        ]}
                      >
                        <IconComp
                          size={18}
                          color={selected ? C_PRIMARY : C_TEXT}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <TouchableOpacity
                onPress={handleSaveFolder}
                style={[styles.saveBtnFull, savingFolder && { opacity: 0.7 }]}
                disabled={savingFolder}
                activeOpacity={0.9}
              >
                <Check size={18} color="#fff" />
                <Text style={styles.saveBtnFullText}>
                  {savingFolder ? "Enregistrement..." : "Enregistrer"}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={actionSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={closeItemActions}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={closeItemActions}
          style={styles.modalBackdrop}
        />
        <View style={styles.actionSheet}>
          <Text style={styles.actionSheetTitle}>{selectedItem?.nom || "Actions"}</Text>

          {selectedItem?.type === "folder" ? (
            <>
              <TouchableOpacity
                onPress={() => {
                  closeItemActions();
                  openEditFolderModal(selectedItem);
                }}
                style={styles.actionRow}
              >
                <Edit3 size={18} color={C_TEXT} />
                <Text style={styles.actionRowText}>Renommer / modifier</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => openMoveModalForSingle(selectedItem)}
                style={styles.actionRow}
              >
                <Move size={18} color={C_TEXT} />
                <Text style={styles.actionRowText}>Déplacer</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => requestDeleteItem(selectedItem)}
                style={styles.actionRow}
              >
                <Trash2 size={18} color={C_DANGER} />
                <Text style={[styles.actionRowText, { color: C_DANGER }]}>Supprimer</Text>
              </TouchableOpacity>
            </>
          ) : selectedItem?.type === "course" ? (
            <>
              <TouchableOpacity
                onPress={() => {
                  closeItemActions();
                  handleOpenCourse(selectedItem.id);
                }}
                style={styles.actionRow}
              >
                <Edit3 size={18} color={C_TEXT} />
                <Text style={styles.actionRowText}>Modifier</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => openMoveModalForSingle(selectedItem)}
                style={styles.actionRow}
              >
                <Move size={18} color={C_TEXT} />
                <Text style={styles.actionRowText}>Déplacer</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => requestDeleteItem(selectedItem)}
                style={styles.actionRow}
              >
                <Trash2 size={18} color={C_DANGER} />
                <Text style={[styles.actionRowText, { color: C_DANGER }]}>Supprimer</Text>
              </TouchableOpacity>
            </>
          ) : null}

          <TouchableOpacity onPress={closeItemActions} style={styles.cancelBtn}>
            <Text style={styles.cancelBtnText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal
        visible={confirmDeleteVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={closeDeleteModal}
          style={styles.modalBackdrop}
        />
        <View style={styles.confirmCard}>
          <View style={styles.confirmIconWrap}>
            <Trash2 size={22} color={C_DANGER} />
          </View>

          <Text style={styles.confirmTitle}>
            {itemToDelete?.type === "folder"
              ? "Supprimer le dossier"
              : "Supprimer le parcours"}
          </Text>

          <Text style={styles.confirmText}>
            {itemToDelete?.type === "folder"
              ? `Voulez-vous supprimer « ${itemToDelete?.nom} » et son contenu ?`
              : `Voulez-vous supprimer « ${itemToDelete?.nom} » ?`}
          </Text>

          <View style={styles.confirmActions}>
            <TouchableOpacity
              onPress={closeDeleteModal}
              disabled={deletingItem}
              style={[styles.confirmBtnSecondary, deletingItem && styles.btnDisabled]}
              activeOpacity={0.9}
            >
              <Text style={styles.confirmBtnSecondaryText}>Annuler</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={confirmDeleteItem}
              disabled={deletingItem}
              style={[styles.confirmBtnDanger, deletingItem && styles.btnDisabled]}
              activeOpacity={0.9}
            >
              <Trash2 size={16} color="#fff" />
              <Text style={styles.confirmBtnDangerText}>
                {deletingItem ? "Suppression..." : "Supprimer"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={moveModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeMoveModal}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={closeMoveModal}
          style={styles.modalBackdrop}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              Déplacer{" "}
              {movingItems.length > 1
                ? `${movingItems.length} éléments`
                : movingItems[0]?.type === "folder"
                ? "le dossier"
                : "le parcours"}
            </Text>

            <TouchableOpacity
              onPress={closeMoveModal}
              style={styles.sheetCloseBtn}
            >
              <X size={18} color={C_TEXT} />
            </TouchableOpacity>
          </View>

          <Text style={styles.moveHelperText}>
            {moveDestinationCurrentFolderId
              ? `Destination en cours : ${getFolderPathLabel(
                  moveDestinationCurrentFolderId,
                  items
                )}`
              : "Destination en cours : Racine"}
          </Text>

          <View style={styles.moveTopActions}>
            <TouchableOpacity
              onPress={handleMoveNavigatorBack}
              style={styles.moveNavBtn}
              activeOpacity={0.88}
            >
              <ArrowLeft size={16} color={C_TEXT} />
              <Text style={styles.moveNavBtnText}>Retour</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleMoveToCurrentDestination}
              style={[styles.moveNavBtn, styles.moveChooseHereBtn]}
              activeOpacity={0.88}
            >
              <Check size={16} color={C_PRIMARY} />
              <Text style={styles.moveChooseHereText}>Choisir ici</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => {
              setMoveDestinationCurrentFolderId(null);
              setMoveDestinationSelectedFolderId(null);
            }}
            style={[
              styles.destinationRow,
              moveDestinationSelectedFolderId === null &&
                styles.destinationRowSelected,
            ]}
            activeOpacity={0.88}
          >
            <Text style={styles.destinationText}>Racine</Text>
            {moveDestinationSelectedFolderId === null && (
              <Check size={16} color={C_PRIMARY} />
            )}
          </TouchableOpacity>

          <ScrollView
            style={{ maxHeight: 320 }}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {moveNavigatorChildren.length === 0 ? (
              <View style={styles.emptyMiniBox}>
                <Text style={styles.emptyMiniText}>Aucun sous-dossier ici.</Text>
              </View>
            ) : (
              moveNavigatorChildren.map((folder) => (
                <TouchableOpacity
                  key={folder.id}
                  onPress={() => handleMoveNavigatorOpenFolder(folder)}
                  style={[
                    styles.destinationRow,
                    moveDestinationSelectedFolderId === folder.id &&
                      styles.destinationRowSelected,
                  ]}
                  activeOpacity={0.88}
                >
                  <Text style={styles.destinationText}>{folder.nom}</Text>
                  <View style={styles.destinationRight}>
                    {moveDestinationSelectedFolderId === folder.id && (
                      <Check size={16} color={C_PRIMARY} />
                    )}
                    <Text style={styles.chevronText}>›</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          <TouchableOpacity
            onPress={handleMoveItems}
            style={[styles.saveBtnFull, movingItemSaving && { opacity: 0.7 }]}
            disabled={movingItemSaving}
            activeOpacity={0.9}
          >
            <Move size={18} color="#fff" />
            <Text style={styles.saveBtnFullText}>
              {movingItemSaving ? "Déplacement..." : "Valider le déplacement"}
            </Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <BottomBar currentPage="gestionParcours" onNavigate={setPage} />
    </SafeAreaView>
  );
};

export default MesParcours;

/* =======================
   Cards
======================= */
const FolderCard: React.FC<{
  folder: Folder;
  onOpen: (folder: Folder) => void;
  onMore: (item: TreeItem) => void;
  onLongPress: (item: TreeItem) => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (itemId: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDrag: () => void;
  dragDisabled: boolean;
  isDragging: boolean;
}> = ({
  folder,
  onOpen,
  onMore,
  onLongPress,
  selectionMode,
  selected,
  onToggleSelect,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onDrag,
  dragDisabled,
  isDragging,
}) => {
  const palette = folderColors[folder.color || "purple"];
  const IconComp = folderIcons[folder.icon || "Folder"];

  const courseCount = folder.children.filter((c) => c.type === "course").length;
  const subFolderCount = folder.children.filter((c) => c.type === "folder").length;

  const handlePress = () => {
    if (selectionMode) {
      onToggleSelect(folder.id);
      return;
    }
    onOpen(folder);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={() => onLongPress(folder)}
      activeOpacity={0.9}
      style={[
        styles.card,
        selected && styles.cardSelected,
        isDragging && styles.cardDragging,
      ]}
    >
      <View style={styles.cardTopRow}>
        <View style={[styles.folderIconWrap, { backgroundColor: palette.soft }]}>
          <IconComp size={22} color={palette.bg} />
        </View>

        <View style={styles.cardTopRight}>
          {selectionMode && (
            <View
              style={[
                styles.selectCircle,
                selected && styles.selectCircleActive,
              ]}
            >
              {selected && <Check size={14} color="#fff" />}
            </View>
          )}

          {!selectionMode && (
            <>
              <TouchableOpacity
                onLongPress={onDrag}
                disabled={dragDisabled}
                style={[styles.dragHandle, dragDisabled && styles.dragHandleDisabled]}
              >
                <Move size={16} color={dragDisabled ? "rgba(15,23,42,0.25)" : C_TEXT} />
              </TouchableOpacity>

              <View style={styles.reorderActions}>
                <TouchableOpacity
                  onPress={onMoveUp}
                  disabled={!canMoveUp}
                  style={[styles.reorderBtn, !canMoveUp && styles.reorderBtnDisabled]}
                >
                  <Text style={styles.reorderBtnText}>↑</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={onMoveDown}
                  disabled={!canMoveDown}
                  style={[styles.reorderBtn, !canMoveDown && styles.reorderBtnDisabled]}
                >
                  <Text style={styles.reorderBtnText}>↓</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => onMore(folder)}
                style={styles.moreBtn}
                hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
              >
                <MoreVertical size={18} color="rgba(15,23,42,0.65)" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <Text style={styles.cardTitle}>{folder.nom}</Text>

      {!!folder.description && (
        <Text style={styles.cardDescription} numberOfLines={2}>
          {folder.description}
        </Text>
      )}

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          {courseCount} parcours • {subFolderCount} sous-dossiers
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const CourseCard: React.FC<{
  course: Course;
  onOpen: (courseId: string) => void;
  onMore: (item: TreeItem) => void;
  onLongPress: (item: TreeItem) => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (itemId: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onDrag: () => void;
  dragDisabled: boolean;
  isDragging: boolean;
}> = ({
  course,
  onOpen,
  onMore,
  onLongPress,
  selectionMode,
  selected,
  onToggleSelect,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onDrag,
  dragDisabled,
  isDragging,
}) => {
  const handlePress = () => {
    if (selectionMode) {
      onToggleSelect(course.id);
      return;
    }
    onOpen(course.id);
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={() => onLongPress(course)}
      activeOpacity={0.9}
      style={[
        styles.card,
        selected && styles.cardSelected,
        isDragging && styles.cardDragging,
      ]}
    >
      <View style={styles.cardTopRow}>
        <View style={styles.courseIconWrap}>
          <Target size={20} color="#fff" />
        </View>

        <View style={styles.cardTopRight}>
          {selectionMode && (
            <View
              style={[
                styles.selectCircle,
                selected && styles.selectCircleActive,
              ]}
            >
              {selected && <Check size={14} color="#fff" />}
            </View>
          )}

          {!selectionMode && (
            <>
              <TouchableOpacity
                onLongPress={onDrag}
                disabled={dragDisabled}
                style={[styles.dragHandle, dragDisabled && styles.dragHandleDisabled]}
              >
                <Move size={16} color={dragDisabled ? "rgba(15,23,42,0.25)" : C_TEXT} />
              </TouchableOpacity>

              <View style={styles.reorderActions}>
                <TouchableOpacity
                  onPress={onMoveUp}
                  disabled={!canMoveUp}
                  style={[styles.reorderBtn, !canMoveUp && styles.reorderBtnDisabled]}
                >
                  <Text style={styles.reorderBtnText}>↑</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={onMoveDown}
                  disabled={!canMoveDown}
                  style={[styles.reorderBtn, !canMoveDown && styles.reorderBtnDisabled]}
                >
                  <Text style={styles.reorderBtnText}>↓</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => onMore(course)}
                style={styles.moreBtn}
                hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}
              >
                <MoreVertical size={18} color="rgba(15,23,42,0.65)" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <Text style={styles.cardTitle}>{course.nom}</Text>

      {!!course.description && (
        <Text style={styles.cardDescription} numberOfLines={2}>
          {course.description}
        </Text>
      )}

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{course.balises} balises</Text>
      </View>
    </TouchableOpacity>
  );
};

/* =======================
   Styles
======================= */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C_BG,
  },

  list: {
    flex: 1,
  },

  emptyArea: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: BOTTOM_BAR_HEIGHT + 120,
  },

  loadingWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  loadingText: {
    color: C_TEXT,
    fontWeight: "700",
  },
  errorText: {
    color: C_DANGER,
    textAlign: "center",
    fontWeight: "700",
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: C_PRIMARY,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryBtnText: {
    color: "#fff",
    fontWeight: "800",
  },

  header: {
    backgroundColor: C_HEADER,
    paddingHorizontal: 12,
    paddingTop: Platform.select({ ios: 10, android: 10, default: 10 }),
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 2,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },
  headerSyncText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  topIconBtnActive: {
    backgroundColor: "rgba(255,255,255,0.28)",
  },

  searchBarWrap: {
    marginTop: 10,
    position: "relative",
  },
  headerSearchIcon: {
    position: "absolute",
    left: 10,
    top: 12,
    zIndex: 1,
  },
  headerSearchInput: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    borderRadius: 12,
    color: "#fff",
    paddingLeft: 34,
    paddingRight: 12,
    paddingVertical: Platform.select({ web: 10, default: 11 }),
  },

  orderHintBox: {
    backgroundColor: "rgba(14,165,233,0.08)",
    borderWidth: 1,
    borderColor: "rgba(14,165,233,0.18)",
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 12,
    marginTop: 12,
  },
  orderHintText: {
    color: C_PRIMARY,
    fontWeight: "700",
    fontSize: 12,
  },

  emptyBox: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 16,
    padding: 22,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    color: C_TEXT,
    fontWeight: "800",
    fontSize: 16,
  },
  emptyText: {
    color: C_MUTED,
    textAlign: "center",
  },

  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 16,
    padding: 14,
  },
  cardSelected: {
    borderColor: "rgba(14,165,233,0.45)",
    backgroundColor: "rgba(14,165,233,0.08)",
  },
  cardDragging: {
    opacity: 0.95,
    borderColor: "rgba(14,165,233,0.45)",
    backgroundColor: "rgba(14,165,233,0.08)",
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cardTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  folderIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  courseIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C_PRIMARY,
  },
  dragHandle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  dragHandleDisabled: {
    opacity: 0.35,
  },
  reorderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  reorderBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  reorderBtnDisabled: {
    opacity: 0.35,
  },
  reorderBtnText: {
    color: C_TEXT,
    fontSize: 15,
    fontWeight: "900",
  },
  moreBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "rgba(15,23,42,0.25)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  selectCircleActive: {
    backgroundColor: C_PRIMARY,
    borderColor: C_PRIMARY,
  },
  cardTitle: {
    color: C_TEXT,
    fontWeight: "800",
    fontSize: 16,
  },
  cardDescription: {
    color: C_MUTED,
    marginTop: 5,
    lineHeight: 18,
  },
  metaRow: {
    marginTop: 10,
  },
  metaText: {
    color: C_MUTED,
    fontWeight: "600",
  },

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  sheet: {
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
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sheetTitle: {
    color: C_TEXT,
    fontSize: 18,
    fontWeight: "800",
  },
  sheetCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },

  label: {
    color: C_MUTED,
    fontSize: 12,
    marginBottom: 6,
    fontWeight: "700",
  },
  input: {
    backgroundColor: "rgba(0,0,0,0.03)",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 12,
    color: C_TEXT,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ web: 10, default: 11 }),
  },
  textarea: {
    minHeight: 88,
    paddingTop: 12,
  },

  colorsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  colorDotSelected: {
    borderWidth: 2,
    borderColor: "#fff",
  },

  iconsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  iconOption: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "rgba(0,0,0,0.03)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconOptionSelected: {
    borderColor: "rgba(14,165,233,0.45)",
    backgroundColor: "rgba(14,165,233,0.10)",
  },

  saveBtnFull: {
    marginTop: 10,
    backgroundColor: C_PRIMARY,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  saveBtnFullText: {
    color: "#fff",
    fontWeight: "800",
  },

  actionSheet: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 20,
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 14,
  },
  actionSheetTitle: {
    color: C_TEXT,
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  actionRowText: {
    color: C_TEXT,
    fontWeight: "700",
  },
  cancelBtn: {
    marginTop: 8,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelBtnText: {
    color: C_TEXT,
    fontWeight: "800",
  },

  confirmCard: {
    position: "absolute",
    left: 16,
    right: 16,
    top: "50%",
    transform: [{ translateY: -110 }],
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 18,
  },
  confirmIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(239,68,68,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    alignSelf: "center",
  },
  confirmTitle: {
    color: C_TEXT,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
  },
  confirmText: {
    marginTop: 8,
    color: C_MUTED,
    textAlign: "center",
    lineHeight: 20,
  },
  confirmActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  confirmBtnSecondary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtnSecondaryText: {
    color: C_TEXT,
    fontWeight: "800",
  },
  confirmBtnDanger: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: C_DANGER,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  confirmBtnDangerText: {
    color: "#fff",
    fontWeight: "800",
  },
  btnDisabled: {
    opacity: 0.65,
  },

  moveHelperText: {
    color: C_MUTED,
    marginBottom: 10,
    fontWeight: "600",
  },
  moveTopActions: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  moveNavBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "rgba(0,0,0,0.03)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  moveNavBtnText: {
    color: C_TEXT,
    fontWeight: "700",
  },
  moveChooseHereBtn: {
    backgroundColor: "rgba(14,165,233,0.08)",
    borderColor: "rgba(14,165,233,0.25)",
  },
  moveChooseHereText: {
    color: C_PRIMARY,
    fontWeight: "800",
  },
  destinationRow: {
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
  destinationRowSelected: {
    backgroundColor: "rgba(14,165,233,0.08)",
    borderColor: "rgba(14,165,233,0.35)",
  },
  destinationText: {
    color: C_TEXT,
    fontWeight: "600",
    flex: 1,
  },
  destinationRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  chevronText: {
    color: C_MUTED,
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 20,
  },
  emptyMiniBox: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "rgba(0,0,0,0.03)",
    padding: 14,
    alignItems: "center",
  },
  emptyMiniText: {
    color: C_MUTED,
  },
});
