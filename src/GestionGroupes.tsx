// src/GestionGroupes.tsx

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  Modal,
  Platform,
  useWindowDimensions,
  Animated,
  Easing,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { FolderOpen, ChevronLeft, Plus, Trash2, Pencil } from "lucide-react-native";
import { supabase } from "./supabaseClient";

/* ────────────────────────────────────────────────────────────── */
/* Types                                                         */
/* ────────────────────────────────────────────────────────────── */

type Professor = { user_id?: string | null } | null;

type Student = {
  id: string;
  name: string;
  code: string;
  teacherId: string;
  groupId?: string | null;
};

type Group = {
  id: string;
  name: string;
  folderId: string | null;
  color: string;
  teacherId: string;
  niveau?: string | null;
  students: Student[];
};

type FolderT = {
  id: string;
  name: string;
  parentId: string | null;
  teacherId: string;
};

type DragItem =
  | {
      type: "folder";
      id: string;
      name: string;
      originFolderId: string | null;
    }
  | {
      type: "group";
      id: string;
      name: string;
      originFolderId: string | null;
      color: string;
      niveau?: string | null;
      students: Student[];
    };

type ZoneKind = "folder" | "back" | "canvas";

type DropZone = {
  key: string;
  kind: ZoneKind;
  destFolderId: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
};

type SelectionItem =
  | {
      type: "folder";
      id: string;
      name: string;
    }
  | {
      type: "group";
      id: string;
      name: string;
    };

type InfoState = {
  title: string;
  message: string;
} | null;

type Props = {
  setPage?: (p: string) => void;
  professeur?: Professor;
  setProfesseur?: (p: any) => void;
  setModeConnexion?: (m: any) => void;
  initialFolderId?: string | null;
  setLastFolderId?: (folderId: string | null) => void;
  setSelectedGroup?: (g: {
    id: any;
    nom: string;
    eleves: any[];
    color?: string;
    niveau?: string | null;
    folderId?: string | null;
  }) => void;
  setSelectedGroupUuid?: (g: {
    id: string;
    nom: string;
    eleves: any[];
    color?: string;
    niveau?: string | null;
    folderId?: string | null;
  }) => void;
};

/* ────────────────────────────────────────────────────────────── */
/* Constantes                                                    */
/* ────────────────────────────────────────────────────────────── */

const COLORS = [
  "#E74C3C",
  "#E67E22",
  "#F1C40F",
  "#2ECC71",
  "#1ABC9C",
  "#3498DB",
  "#9B59B6",
  "#E91E63",
];

const LONG_PRESS_MS = 420;
const WEB_DRAG_THRESHOLD = 5;
const CANCEL_MOVE_PX = 10;
const TAP_MAX_MOVE_PX = 7;
const HOVER_NAV_MS = 620;
const AUTOSCROLL_EDGE = 90;
const AUTOSCROLL_STEP = 12;
const DROP_PAD = 28;
const IS_WEB = Platform.OS === "web";

const trim = (s: string) => s.replace(/\s+/g, " ").trim();

const getLastGestionGroupesFolderId = () => {
  const value = (globalThis as any).__gestionGroupesLastFolderId;
  return typeof value === "string" ? value : null;
};

function isDescendant(
  folders: FolderT[],
  candidateId: string | null,
  draggedId: string
): boolean {
  let cur = candidateId;
  while (cur) {
    if (cur === draggedId) return true;
    cur = folders.find((f) => f.id === cur)?.parentId ?? null;
  }
  return false;
}

function getFolderDepth(folderId: string, folders: FolderT[]) {
  let depth = 0;
  let cur = folders.find((f) => f.id === folderId) ?? null;
  while (cur?.parentId) {
    depth += 1;
    cur = folders.find((f) => f.id === cur?.parentId) ?? null;
  }
  return depth;
}

function measureRef(
  ref: any
): Promise<{ x: number; y: number; w: number; h: number } | null> {
  return new Promise((resolve) => {
    if (!ref?.measureInWindow) return resolve(null);
    requestAnimationFrame(() => {
      try {
        ref.measureInWindow((x: number, y: number, w: number, h: number) => {
          resolve(w > 0 && h > 0 ? { x, y, w, h } : null);
        });
      } catch {
        resolve(null);
      }
    });
  });
}

/* ────────────────────────────────────────────────────────────── */
/* Cartes                                                        */
/* ────────────────────────────────────────────────────────────── */

function FolderCardContent({
  name,
  sf,
  sg,
  selectedForDelete,
}: {
  name: string;
  sf: number;
  sg: number;
  selectedForDelete?: boolean;
}) {
  return (
    <View style={s.folderCardInner}>
      <View style={[s.folderIcon, selectedForDelete && s.folderIconDelete]}>
        <FolderOpen
          size={22}
          color={selectedForDelete ? "#fff" : "#1F5B86"}
          strokeWidth={2.2}
        />
      </View>
      <View style={s.folderText}>
        <Text
          style={[s.folderName, selectedForDelete && s.deleteTextStrong]}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text style={[s.folderMeta, selectedForDelete && s.deleteTextSoft]}>
          {sf} dossier{sf !== 1 ? "s" : ""} · {sg} classe{sg !== 1 ? "s" : ""}
        </Text>
      </View>
    </View>
  );
}

function GroupChipContent({
  group,
  selectedForDelete,
}: {
  group: Group;
  selectedForDelete?: boolean;
}) {
  return (
    <View style={s.groupChipInner}>
      <View style={s.groupTextWrap}>
        <Text
          style={[s.groupName, selectedForDelete && s.deleteTextStrong]}
          numberOfLines={2}
        >
          {group.name}
        </Text>
        {!!group.niveau && (
          <Text
            style={[
              s.groupMeta,
              s.groupMetaFirst,
              selectedForDelete && s.deleteTextSoft,
            ]}
            numberOfLines={1}
          >
            {group.niveau}
          </Text>
        )}
        <Text
          style={[
            s.groupMeta,
            !group.niveau && s.groupMetaFirst,
            selectedForDelete && s.deleteTextSoft,
          ]}
          numberOfLines={1}
        >
          {group.students.length} élève{group.students.length !== 1 ? "s" : ""}
        </Text>
      </View>
    </View>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Preview flottant                                              */
/* ────────────────────────────────────────────────────────────── */

function PreviewCard({
  item,
  folders,
  groups,
  previewWidth,
}: {
  item: DragItem;
  folders: FolderT[];
  groups: Group[];
  previewWidth: number;
}) {
  if (item.type === "group") {
    const fakeGroup: Group = {
      id: item.id,
      name: item.name,
      folderId: item.originFolderId,
      color: item.color,
      teacherId: "",
      niveau: item.niveau ?? null,
      students: item.students,
    };

    return (
      <View
        style={[
          s.groupChip,
          pv.previewCommon,
          { width: previewWidth, borderColor: item.color },
        ]}
      >
        <GroupChipContent group={fakeGroup} />
      </View>
    );
  }

  const sf = folders.filter((f) => f.parentId === item.id).length;
  const sg = groups.filter((g) => g.folderId === item.id).length;

  return (
    <View style={[s.folderCard, pv.previewCommon, { width: previewWidth }]}>
      <FolderCardContent name={item.name} sf={sf} sg={sg} />
    </View>
  );
}

const pv = StyleSheet.create({
  previewCommon: {
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 14,
  },
});

/* ────────────────────────────────────────────────────────────── */
/* Composant principal                                           */
/* ────────────────────────────────────────────────────────────── */

export default function GestionGroupes(props: Props) {
  const { setPage, professeur, initialFolderId, setLastFolderId } = props;
  const teacherId = professeur?.user_id ?? null;
  const { width, height } = useWindowDimensions();

  const headerTopPad = Platform.OS === "ios" ? 10 : IS_WEB ? 12 : 8;
  const deleteOverlayBottom = IS_WEB ? 96 : 96;
  const deleteOverlayWidth = IS_WEB ? 260 : width - 28;
  const isMobileLayout = width < 720;

  const groupItemWidth = useMemo(() => {
    if (IS_WEB) return 170;
    const outerPadding = 16 * 2;
    const totalGap = 10 * 3;
    const usable = width - outerPadding - totalGap;
    const size = Math.floor(usable / 4);
    return Math.max(72, size);
  }, [width]);

  const [folders, setFolders] = useState<FolderT[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(
    () => initialFolderId ?? getLastGestionGroupesFolderId()
  );

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState(COLORS[0]);
  const [newGroupNiveau, setNewGroupNiveau] = useState<string | null>(null);
  const [newCustomNiveau, setNewCustomNiveau] = useState("");
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [niveauToRename, setNiveauToRename] = useState<string | null>(null);
  const [renameNiveauName, setRenameNiveauName] = useState("");
  const [niveauToDelete, setNiveauToDelete] = useState<string | null>(null);
  const [isUpdatingNiveau, setIsUpdatingNiveau] = useState(false);

  const [organizeMode, setOrganizeMode] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMap, setSelectedMap] = useState<Record<string, SelectionItem>>(
    {}
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [infoState, setInfoState] = useState<InfoState>(null);

  const dragX = useRef(new Animated.Value(-9999)).current;
  const dragY = useRef(new Animated.Value(-9999)).current;
  const dragScale = useRef(new Animated.Value(1)).current;
  const jiggle = useRef(new Animated.Value(0)).current;

  const aliveRef = useRef(true);
  const selectedFolderRef = useRef<string | null>(null);
  const organizeModeRef = useRef(false);
  const foldersRef = useRef<FolderT[]>([]);
  const groupsRef = useRef<Group[]>([]);
  const dragItemRef = useRef<DragItem | null>(null);
  const isDraggingRef = useRef(false);
  const highlightRef = useRef<string | null>(null);
  const latestPointerRef = useRef<{ x: number; y: number } | null>(null);
  const fingerOffset = useRef({ x: 0, y: 0 });
  const previewSizeRef = useRef({ w: 160, h: 80 });
  const dropZonesRef = useRef<DropZone[]>([]);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoScrollActiveRef = useRef(false);
  const navHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navHoverKeyRef = useRef<string | null>(null);

  const scrollYRef = useRef(0);
  const viewportHRef = useRef(0);
  const contentHRef = useRef(0);

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchMovedRef = useRef(false);
  const dragHappenedRef = useRef(false);

  const scrollRef = useRef<ScrollView | null>(null);
  const backBtnRef = useRef<View | null>(null);
  const canvasRef = useRef<View | null>(null);
  const folderRefs = useRef<Record<string, View | null>>({});
  const groupRefs = useRef<Record<string, View | null>>({});

  const webPressRef = useRef<{
    item: DragItem;
    onTap?: () => void;
    startX: number;
    startY: number;
    dragged: boolean;
  } | null>(null);
  const webMoveRef = useRef<((e: MouseEvent) => void) | null>(null);
  const webUpRef = useRef<((e: MouseEvent) => void) | null>(null);

  useEffect(() => {
    selectedFolderRef.current = selectedFolder;
    (globalThis as any).__gestionGroupesLastFolderId = selectedFolder;
    setLastFolderId?.(selectedFolder);
  }, [selectedFolder, setLastFolderId]);

  useEffect(() => {
    organizeModeRef.current = organizeMode;
  }, [organizeMode]);

  useEffect(() => {
    foldersRef.current = folders;
  }, [folders]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
      if (navHoverTimer.current) clearTimeout(navHoverTimer.current);

      if (IS_WEB && typeof document !== "undefined") {
        if (webMoveRef.current) {
          document.removeEventListener("mousemove", webMoveRef.current);
        }
        if (webUpRef.current) {
          document.removeEventListener("mouseup", webUpRef.current);
        }
        if (document.body) {
          document.body.style.userSelect = "";
          document.body.style.cursor = "";
        }
      }
    };
  }, []);

  useEffect(() => {
    if (IS_WEB || !organizeMode || selectionMode) {
      jiggle.stopAnimation();
      jiggle.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(jiggle, {
          toValue: 1.5,
          duration: 80,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(jiggle, {
          toValue: -1.5,
          duration: 80,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(jiggle, {
          toValue: 0,
          duration: 80,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => {
      loop.stop();
      jiggle.setValue(0);
    };
  }, [organizeMode, jiggle, selectionMode]);

  const showInfo = useCallback((title: string, message: string) => {
    setInfoState({ title, message });
  }, []);

  const selectionCount = useMemo(
    () => Object.keys(selectedMap).length,
    [selectedMap]
  );

  const toggleSelection = useCallback((item: SelectionItem) => {
    const key = `${item.type}:${item.id}`;
    setSelectedMap((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: item };
    });
  }, []);

  const isSelected = useCallback(
    (type: "folder" | "group", id: string) => !!selectedMap[`${type}:${id}`],
    [selectedMap]
  );

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedMap({});
  }, []);

  const fetchAll = useCallback(async () => {
    if (!teacherId) {
      setFolders([]);
      setGroups([]);
      return;
    }

    try {
      const [fRes, gRes] = await Promise.all([
        supabase
          .from("folders")
          .select("id,nom,parent_id,user_id")
          .eq("user_id", teacherId),
        supabase
          .from("groups")
          .select("id,name,folder_id,color,teacher_id,niveau")
          .eq("teacher_id", teacherId),
      ]);

      if (fRes.error) throw fRes.error;
      if (gRes.error) throw gRes.error;

      const mappedFolders: FolderT[] = (fRes.data || []).map((f: any) => ({
        id: String(f.id),
        name: String(f.nom ?? ""),
        parentId: f.parent_id ? String(f.parent_id) : null,
        teacherId: String(f.user_id ?? ""),
      }));

      const mappedGroups: Group[] = (gRes.data || []).map((g: any) => ({
        id: String(g.id),
        name: String(g.name ?? ""),
        folderId: g.folder_id ? String(g.folder_id) : null,
        color: String(g.color ?? "#3498DB"),
        teacherId: String(g.teacher_id ?? ""),
        niveau: g.niveau ? String(g.niveau) : null,
        students: [],
      }));

      const groupIds = mappedGroups.map((g) => g.id);

      let studentsData: any[] = [];
      if (groupIds.length) {
        const sRes = await supabase
          .from("students")
          .select("id,name,code,group_id,teacher_id")
          .in("group_id", groupIds)
          .eq("teacher_id", teacherId);

        if (sRes.error) throw sRes.error;
        studentsData = sRes.data || [];
      }

      const byGroup = new Map<string, Student[]>();
      studentsData.forEach((st: any) => {
        const gid = String(st.group_id ?? "");
        const arr = byGroup.get(gid) ?? [];
        arr.push({
          id: String(st.id ?? ""),
          name: String(st.name ?? ""),
          code: String(st.code ?? ""),
          groupId: gid || null,
          teacherId: String(st.teacher_id ?? ""),
        });
        byGroup.set(gid, arr);
      });

      if (!aliveRef.current) return;

      setFolders(mappedFolders);
      setGroups(
        mappedGroups.map((g) => ({
          ...g,
          students: byGroup.get(g.id) ?? [],
        }))
      );
    } catch (e) {
      console.error("fetchAll", e);
      showInfo("Erreur", "Impossible de charger les dossiers et les classes.");
    }
  }, [teacherId, showInfo]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const breadcrumb = useMemo(() => {
    if (!teacherId || !selectedFolder) return [] as FolderT[];
    const path: FolderT[] = [];
    let cur: string | null = selectedFolder;

    while (cur) {
      const f = folders.find((x) => x.id === cur && x.teacherId === teacherId);
      if (!f) break;
      path.unshift(f);
      cur = f.parentId;
    }

    return path;
  }, [folders, selectedFolder, teacherId]);

  const currentFolders = useMemo(() => {
    if (!teacherId) return [];
    return folders.filter(
      (f) => f.teacherId === teacherId && f.parentId === selectedFolder
    );
  }, [folders, teacherId, selectedFolder]);

  const currentGroups = useMemo(() => {
    if (!teacherId) return [];
    return groups.filter(
      (g) => g.teacherId === teacherId && g.folderId === selectedFolder
    );
  }, [groups, teacherId, selectedFolder]);

  const niveaux = useMemo(() => {
    const names = new Set<string>();
    groups.forEach((group) => {
      const niveau = trim(group.niveau ?? "");
      if (niveau) names.add(niveau);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [groups]);

  const titleFolder = breadcrumb.length
    ? breadcrumb[breadcrumb.length - 1].name
    : "MES GROUPES";

  const killTimers = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (autoScrollTimer.current) {
      clearInterval(autoScrollTimer.current);
      autoScrollTimer.current = null;
    }
    autoScrollActiveRef.current = false;
    if (navHoverTimer.current) {
      clearTimeout(navHoverTimer.current);
      navHoverTimer.current = null;
    }
    navHoverKeyRef.current = null;
  }, []);

  const detachWeb = useCallback(() => {
    if (!IS_WEB || typeof document === "undefined") return;

    if (webMoveRef.current) {
      document.removeEventListener("mousemove", webMoveRef.current);
    }
    if (webUpRef.current) {
      document.removeEventListener("mouseup", webUpRef.current);
    }

    webMoveRef.current = null;
    webUpRef.current = null;
    webPressRef.current = null;

    if (document.body) {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
  }, []);

  const refreshZones = useCallback(
    async (opts?: { parentFolderId?: string | null }) => {
      const zones: DropZone[] = [];

      const canvasM = await measureRef(canvasRef.current);
      if (canvasM) {
        zones.push({
          key: "canvas",
          kind: "canvas",
          destFolderId: selectedFolderRef.current,
          ...canvasM,
        });
      }

      for (const [id, ref] of Object.entries(folderRefs.current)) {
        const m = await measureRef(ref);
        if (m) {
          zones.push({
            key: `folder:${id}`,
            kind: "folder",
            destFolderId: id,
            ...m,
          });
        }
      }

      const backM = await measureRef(backBtnRef.current);
      if (backM) {
        const parentId =
          opts?.parentFolderId !== undefined
            ? opts.parentFolderId
            : breadcrumb.length >= 2
              ? breadcrumb[breadcrumb.length - 2]?.id ?? null
              : null;

        zones.push({
          key: "back",
          kind: "back",
          destFolderId: parentId,
          ...backM,
        });
      }

      dropZonesRef.current = zones;
    },
    [breadcrumb]
  );

  const findZone = useCallback((px: number, py: number, item: DragItem) => {
    let best: DropZone | null = null;
    let bestScore = Infinity;

    for (const z of dropZonesRef.current) {
      if (px < z.x - DROP_PAD || px > z.x + z.w + DROP_PAD) continue;
      if (py < z.y - DROP_PAD || py > z.y + z.h + DROP_PAD) continue;

      if (z.kind === "folder" && item.type === "folder") {
        if (z.destFolderId === item.id) continue;
        if (isDescendant(foldersRef.current, z.destFolderId, item.id)) continue;
      }

      const cx = z.x + z.w / 2;
      const cy = z.y + z.h / 2;
      const dist = Math.hypot(px - cx, py - cy);
      const score = z.kind === "canvas" ? dist + 250 : dist;

      if (score < bestScore) {
        bestScore = score;
        best = z;
      }
    }

    return best;
  }, []);

  const stopAutoScroll = useCallback(
    async (shouldRefresh = true) => {
      if (autoScrollTimer.current) {
        clearInterval(autoScrollTimer.current);
        autoScrollTimer.current = null;
      }

      const wasActive = autoScrollActiveRef.current;
      autoScrollActiveRef.current = false;

      if (wasActive && shouldRefresh) {
        await refreshZones();
        const pt = latestPointerRef.current;
        const item = dragItemRef.current;
        if (pt && item) {
          const z = findZone(pt.x, pt.y, item);
          const k = z?.key ?? "canvas";
          if (k !== highlightRef.current) {
            highlightRef.current = k;
            setHighlightKey(k);
          }
        }
      }
    },
    [refreshZones, findZone]
  );

  useEffect(() => {
    const t = setTimeout(() => refreshZones(), 80);
    return () => clearTimeout(t);
  }, [
    currentFolders.length,
    currentGroups.length,
    selectedFolder,
    refreshZones,
  ]);

  useEffect(() => {
    if (currentGroups.length === 0 && editMode) {
      setEditMode(false);
    }
  }, [currentGroups.length, editMode]);

  const requestDeleteSelection = useCallback(() => {
    if (!selectionCount) return;
    setShowDeleteConfirm(true);
  }, [selectionCount]);

  const performDeleteSelection = useCallback(async () => {
    if (!teacherId || selectionCount === 0 || isDeleting) return;

    setIsDeleting(true);

    try {
      const selectedItems = Object.values(selectedMap);

      const folderIdsToDelete = new Set(
        selectedItems.filter((x) => x.type === "folder").map((x) => x.id)
      );

      const groupIdsToDelete = new Set(
        selectedItems.filter((x) => x.type === "group").map((x) => x.id)
      );

      let changed = true;
      while (changed) {
        changed = false;

        foldersRef.current.forEach((folder) => {
          if (
            folder.parentId &&
            folderIdsToDelete.has(folder.parentId) &&
            !folderIdsToDelete.has(folder.id)
          ) {
            folderIdsToDelete.add(folder.id);
            changed = true;
          }
        });
      }

      groupsRef.current.forEach((group) => {
        if (group.folderId && folderIdsToDelete.has(group.folderId)) {
          groupIdsToDelete.add(group.id);
        }
      });

      const allGroupIds = Array.from(groupIdsToDelete);
      const allFolderIds = Array.from(folderIdsToDelete);

      if (allGroupIds.length) {
        const clearStudents = await supabase
          .from("students")
          .update({ group_id: null })
          .in("group_id", allGroupIds)
          .eq("teacher_id", teacherId);

        if (clearStudents.error) throw clearStudents.error;

        const deleteGroupsRes = await supabase
          .from("groups")
          .delete()
          .in("id", allGroupIds)
          .eq("teacher_id", teacherId);

        if (deleteGroupsRes.error) throw deleteGroupsRes.error;
      }

      if (allFolderIds.length) {
        const orderedFolderIds = [...allFolderIds].sort(
          (a, b) =>
            getFolderDepth(b, foldersRef.current) -
            getFolderDepth(a, foldersRef.current)
        );

        for (const folderId of orderedFolderIds) {
          const deleteFolderRes = await supabase
            .from("folders")
            .delete()
            .eq("id", folderId)
            .eq("user_id", teacherId);

          if (deleteFolderRes.error) throw deleteFolderRes.error;
        }
      }

      if (
        selectedFolderRef.current &&
        folderIdsToDelete.has(selectedFolderRef.current)
      ) {
        selectedFolderRef.current = null;
        setSelectedFolder(null);
      }

      setShowDeleteConfirm(false);
      exitSelectionMode();
      await fetchAll();
      setTimeout(() => refreshZones(), 100);
    } catch (e) {
      console.error("performDeleteSelection", e);
      showInfo("Erreur", "Impossible de supprimer les éléments sélectionnés.");
    } finally {
      if (aliveRef.current) {
        setIsDeleting(false);
      }
    }
  }, [
    teacherId,
    selectionCount,
    isDeleting,
    selectedMap,
    exitSelectionMode,
    fetchAll,
    refreshZones,
    showInfo,
  ]);

  const clearNavHover = useCallback(() => {
    if (navHoverTimer.current) {
      clearTimeout(navHoverTimer.current);
      navHoverTimer.current = null;
    }
    navHoverKeyRef.current = null;
  }, []);

  const scheduleNavHover = useCallback(
    (zone: DropZone | null, item: DragItem) => {
      if (!zone || zone.kind === "canvas") {
        clearNavHover();
        return;
      }

      if (zone.key === navHoverKeyRef.current) return;

      if (zone.kind === "folder") {
        if (
          !zone.destFolderId ||
          zone.destFolderId === selectedFolderRef.current
        ) {
          clearNavHover();
          return;
        }
        if (item.type === "folder") {
          if (zone.destFolderId === item.id) {
            clearNavHover();
            return;
          }
          if (isDescendant(foldersRef.current, zone.destFolderId, item.id)) {
            clearNavHover();
            return;
          }
        }
      }

      if (zone.kind === "back" && selectedFolderRef.current === null) {
        clearNavHover();
        return;
      }

      clearNavHover();
      navHoverKeyRef.current = zone.key;

      navHoverTimer.current = setTimeout(async () => {
        navHoverTimer.current = null;

        if (!aliveRef.current || !isDraggingRef.current) return;
        if (navHoverKeyRef.current !== zone.key) return;

        let nextFolderId: string | null;
        if (zone.kind === "folder") {
          nextFolderId = zone.destFolderId;
        } else {
          const cur = selectedFolderRef.current;
          nextFolderId =
            foldersRef.current.find((f) => f.id === cur)?.parentId ?? null;
        }

        selectedFolderRef.current = nextFolderId;
        setSelectedFolder(nextFolderId);

        const newParent = nextFolderId
          ? foldersRef.current.find((f) => f.id === nextFolderId)?.parentId ??
            null
          : null;

        await refreshZones({ parentFolderId: newParent });

        navHoverKeyRef.current = null;

        const pt = latestPointerRef.current;
        if (pt && dragItemRef.current) {
          dragX.setValue(pt.x - fingerOffset.current.x);
          dragY.setValue(pt.y - fingerOffset.current.y);

          const newZone = findZone(pt.x, pt.y, dragItemRef.current);
          const key = newZone?.key ?? "canvas";
          highlightRef.current = key;
          setHighlightKey(key);
        }
      }, HOVER_NAV_MS);
    },
    [clearNavHover, findZone, refreshZones, dragX, dragY]
  );

  const onMove = useCallback(
    async (px: number, py: number) => {
      if (!isDraggingRef.current || !dragItemRef.current) return;

      latestPointerRef.current = { x: px, y: py };

      dragX.setValue(px - fingerOffset.current.x);
      dragY.setValue(py - fingerOffset.current.y);

      const zone = findZone(px, py, dragItemRef.current);
      const key = zone?.key ?? "canvas";

      if (key !== highlightRef.current) {
        highlightRef.current = key;
        setHighlightKey(key);
      }

      scheduleNavHover(zone, dragItemRef.current);

      const vph = viewportHRef.current;
      const nearEdge = py < AUTOSCROLL_EDGE || py > vph - AUTOSCROLL_EDGE;

      if (!nearEdge) {
        await stopAutoScroll();
        return;
      }

      const dir = py < AUTOSCROLL_EDGE ? -1 : 1;

      if (autoScrollActiveRef.current) return;

      autoScrollActiveRef.current = true;

      autoScrollTimer.current = setInterval(() => {
        const maxY = Math.max(0, contentHRef.current - viewportHRef.current);
        const next = Math.max(
          0,
          Math.min(maxY, scrollYRef.current + dir * AUTOSCROLL_STEP)
        );

        if (next === scrollYRef.current) {
          stopAutoScroll();
          return;
        }

        scrollYRef.current = next;
        scrollRef.current?.scrollTo({ y: next, animated: false });

        const pt = latestPointerRef.current;
        if (pt) {
          dragX.setValue(pt.x - fingerOffset.current.x);
          dragY.setValue(pt.y - fingerOffset.current.y);
        }
      }, 16);
    },
    [dragX, dragY, findZone, scheduleNavHover, stopAutoScroll]
  );

  const resetDragVisual = useCallback(() => {
    isDraggingRef.current = false;
    dragItemRef.current = null;
    highlightRef.current = null;
    latestPointerRef.current = null;

    killTimers();
    detachWeb();

    setDragItem(null);
    setDraggingId(null);
    setHighlightKey(null);

    dragX.setValue(-9999);
    dragY.setValue(-9999);

    Animated.spring(dragScale, {
      toValue: 1,
      useNativeDriver: true,
      friction: 6,
    }).start();

    touchStartRef.current = null;
    touchMovedRef.current = false;
  }, [dragScale, dragX, dragY, killTimers, detachWeb]);

  const onUp = useCallback(
    async (px?: number, py?: number) => {
      if (!isDraggingRef.current) return;

      await stopAutoScroll();

      const item = dragItemRef.current;
      let targetZone: DropZone | null = null;
      let pointerDist = 9999;

      if (item) {
        const pointer =
          px !== undefined && py !== undefined
            ? { x: px, y: py }
            : latestPointerRef.current;

        if (pointer) {
          targetZone = findZone(pointer.x, pointer.y, item);
          const start = touchStartRef.current;
          if (start) {
            pointerDist = Math.hypot(pointer.x - start.x, pointer.y - start.y);
          }
        }
      }

      const currentFolder = selectedFolderRef.current;

      resetDragVisual();
      if (!item) return;

      let dest: string | null;
      if (targetZone?.kind === "folder") {
        dest = targetZone.destFolderId;
      } else if (targetZone?.kind === "back") {
        dest = targetZone.destFolderId;
      } else {
        dest = currentFolder;
      }

      const noRealMove =
        pointerDist <= TAP_MAX_MOVE_PX && dest === item.originFolderId;

      if (noRealMove) return;

      try {
        if (item.type === "folder") {
          if (dest === item.originFolderId) return;
          if (dest === item.id) return;
          if (isDescendant(foldersRef.current, dest, item.id)) return;

          const res = await supabase
            .from("folders")
            .update({ parent_id: dest })
            .eq("id", item.id)
            .eq("user_id", teacherId);

          if (res.error) throw res.error;
        } else {
          if (dest === item.originFolderId) return;

          const res = await supabase
            .from("groups")
            .update({ folder_id: dest })
            .eq("id", item.id)
            .eq("teacher_id", teacherId);

          if (res.error) throw res.error;
        }

        await fetchAll();
        setTimeout(() => refreshZones(), 100);
      } catch (e) {
        console.error("onUp drop", e);
        showInfo("Erreur", "Impossible de déplacer cet élément.");
      }
    },
    [
      findZone,
      resetDragVisual,
      teacherId,
      fetchAll,
      refreshZones,
      stopAutoScroll,
      showInfo,
    ]
  );

  const startDrag = useCallback(
    async (item: DragItem, pressX: number, pressY: number) => {
      if (!aliveRef.current || selectionMode) return;

      const refMap =
        item.type === "folder" ? folderRefs.current : groupRefs.current;
      const m = await measureRef(refMap[item.id]);

      fingerOffset.current = {
        x: m ? pressX - m.x : 30,
        y: m ? pressY - m.y : 20,
      };

      previewSizeRef.current = {
        w: m?.w ?? (item.type === "group" ? groupItemWidth : 280),
        h: m?.h ?? 80,
      };

      dragX.setValue(pressX - fingerOffset.current.x);
      dragY.setValue(pressY - fingerOffset.current.y);
      dragScale.setValue(1);

      Animated.spring(dragScale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 6,
        tension: 120,
      }).start();

      dragItemRef.current = item;
      isDraggingRef.current = true;
      latestPointerRef.current = { x: pressX, y: pressY };
      dragHappenedRef.current = true;

      if (!organizeModeRef.current) {
        organizeModeRef.current = true;
        setOrganizeMode(true);
      }

      setDragItem(item);
      setDraggingId(item.id);
      setHighlightKey("canvas");
      highlightRef.current = "canvas";

      await refreshZones();

      if (IS_WEB && typeof document !== "undefined" && document.body) {
        document.body.style.userSelect = "none";
        document.body.style.cursor = "grabbing";
      }
    },
    [dragX, dragY, dragScale, refreshZones, groupItemWidth, selectionMode]
  );

  const attachWebListeners = useCallback(
    (item: DragItem, onTap?: () => void, startX = 0, startY = 0) => {
      if (!IS_WEB || typeof document === "undefined" || selectionMode) return;

      detachWeb();

      webPressRef.current = {
        item,
        onTap,
        startX,
        startY,
        dragged: false,
      };

      const handleMove = async (e: MouseEvent) => {
        const session = webPressRef.current;
        if (!session) return;

        const dist = Math.hypot(
          e.clientX - session.startX,
          e.clientY - session.startY
        );

        if (!session.dragged && dist >= WEB_DRAG_THRESHOLD) {
          session.dragged = true;
          await startDrag(session.item, e.clientX, e.clientY);
        }

        if (isDraggingRef.current) {
          e.preventDefault();
          onMove(e.clientX, e.clientY);
        }
      };

      const handleUp = (e: MouseEvent) => {
        const session = webPressRef.current;
        const wasDrag = isDraggingRef.current;

        if (wasDrag) {
          onUp(e.clientX, e.clientY);
          return;
        }

        detachWeb();

        const dist = Math.hypot(
          e.clientX - (session?.startX ?? 0),
          e.clientY - (session?.startY ?? 0)
        );

        if (dist < WEB_DRAG_THRESHOLD) {
          session?.onTap?.();
        }
      };

      webMoveRef.current = handleMove;
      webUpRef.current = handleUp;

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [detachWeb, startDrag, onMove, onUp, selectionMode]
  );

  const makeWebHandlers = useCallback(
    (item: DragItem, onTap?: () => void) => ({
      onMouseDown(e: any) {
        if (e?.button !== 0) return;
        e.preventDefault();
        attachWebListeners(item, onTap, e.clientX, e.clientY);
      },
    }),
    [attachWebListeners]
  );

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const scheduleLongPress = useCallback(
    (item: DragItem, px: number, py: number) => {
      cancelLongPress();
      dragHappenedRef.current = false;

      longPressTimer.current = setTimeout(async () => {
        longPressTimer.current = null;
        await startDrag(item, px, py);
      }, LONG_PRESS_MS);
    },
    [cancelLongPress, startDrag]
  );

  const makeTouchHandlers = useCallback(
    (item: DragItem, onTap?: () => void) => ({
      onTouchStart(e: any) {
        if (selectionMode) return;
        const t = e.nativeEvent.touches?.[0];
        if (!t) return;

        touchStartRef.current = { x: t.pageX, y: t.pageY };
        touchMovedRef.current = false;
        dragHappenedRef.current = false;

        scheduleLongPress(item, t.pageX, t.pageY);
      },

      onTouchMove(e: any) {
        if (selectionMode) return;
        const t = e.nativeEvent.touches?.[0];
        if (!t) return;

        const start = touchStartRef.current;
        if (start) {
          const dist = Math.hypot(t.pageX - start.x, t.pageY - start.y);
          if (dist > CANCEL_MOVE_PX) {
            touchMovedRef.current = true;
          }
        }

        if (!isDraggingRef.current) {
          if (touchMovedRef.current && !dragHappenedRef.current) {
            cancelLongPress();
          }
          return;
        }
      },

      onTouchEnd() {
        if (selectionMode) return;
        if (isDraggingRef.current) return;

        cancelLongPress();

        const shouldOpen =
          !organizeModeRef.current &&
          !touchMovedRef.current &&
          !dragHappenedRef.current;

        if (shouldOpen) {
          onTap?.();
        }

        touchStartRef.current = null;
        touchMovedRef.current = false;
      },

      onTouchCancel() {
        if (selectionMode) return;
        if (isDraggingRef.current) return;

        cancelLongPress();
        touchStartRef.current = null;
        touchMovedRef.current = false;
      },
    }),
    [scheduleLongPress, cancelLongPress, selectionMode]
  );

  const createFolder = async () => {
    const name = trim(folderName);
    if (!name || !teacherId) return;

    if (
      folders.some(
        (f) =>
          f.teacherId === teacherId &&
          f.parentId === selectedFolder &&
          f.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      showInfo("Nom déjà utilisé", "Un dossier avec ce nom existe déjà ici.");
      return;
    }

    try {
      const res = await supabase.from("folders").insert({
        nom: name,
        user_id: teacherId,
        parent_id: selectedFolder,
        type_element: "dossier",
      });

      if (res.error) throw res.error;

      setShowCreateFolder(false);
      setFolderName("");
      await fetchAll();
    } catch (e) {
      console.error("createFolder", e);
      showInfo("Erreur", "Impossible de créer le dossier.");
    }
  };

  const resetGroupForm = useCallback(() => {
    setShowCreateGroup(false);
    setEditingGroup(null);
    setNewGroupName("");
    setNewGroupColor(COLORS[0]);
    setNewGroupNiveau(null);
    setNewCustomNiveau("");
  }, []);

  const openCreateGroupModal = useCallback(() => {
    setEditingGroup(null);
    setNewGroupName("");
    setNewGroupColor(COLORS[0]);
    setNewGroupNiveau(null);
    setNewCustomNiveau("");
    setShowCreateGroup(true);
  }, []);

  const openEditGroupModal = useCallback(
    (group: Group) => {
      if (selectionMode || organizeModeRef.current || isDraggingRef.current) return;

      setEditMode(false);
      const niveau = trim(group.niveau ?? "");
      setEditingGroup(group);
      setNewGroupName(group.name);
      setNewGroupColor(group.color);
      setNewGroupNiveau(niveau || null);
      setNewCustomNiveau("");
      setShowCreateGroup(true);
    },
    [selectionMode]
  );

  const saveGroup = async () => {
    const name = trim(newGroupName);
    if (!name || !teacherId) return;

    if (
      groups.some(
        (g) =>
          g.id !== editingGroup?.id &&
          g.teacherId === teacherId &&
          g.folderId === selectedFolder &&
          g.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      showInfo("Nom déjà utilisé", "Une classe avec ce nom existe déjà ici.");
      return;
    }

    const customNiveau = trim(newCustomNiveau);
    const niveau = customNiveau || newGroupNiveau || null;

    try {
      const payload = {
        name,
        color: newGroupColor,
        niveau,
      };

      const res = editingGroup
        ? await supabase
            .from("groups")
            .update(payload)
            .eq("id", editingGroup.id)
            .eq("teacher_id", teacherId)
        : await supabase.from("groups").insert({
            ...payload,
            teacher_id: teacherId,
            folder_id: selectedFolder,
          });

      if (res.error) throw res.error;

      resetGroupForm();
      await fetchAll();
    } catch (e) {
      console.error("saveGroup", e);
      showInfo(
        "Erreur",
        editingGroup
          ? "Impossible de modifier la classe."
          : "Impossible de créer la classe."
      );
    }
  };

  const openRenameNiveau = useCallback((niveau: string) => {
    setNiveauToRename(niveau);
    setRenameNiveauName(niveau);
  }, []);

  const renameNiveau = useCallback(async () => {
    const oldName = trim(niveauToRename ?? "");
    const nextName = trim(renameNiveauName);
    if (!teacherId || !oldName || !nextName || isUpdatingNiveau) return;

    if (oldName.toLowerCase() !== nextName.toLowerCase()) {
      const alreadyExists = niveaux.some(
        (niveau) =>
          niveau.toLowerCase() === nextName.toLowerCase() &&
          niveau.toLowerCase() !== oldName.toLowerCase()
      );

      if (alreadyExists) {
        showInfo("Niveau déjà utilisé", "Un niveau avec ce nom existe déjà.");
        return;
      }
    }

    setIsUpdatingNiveau(true);
    try {
      const res = await supabase
        .from("groups")
        .update({ niveau: nextName })
        .eq("teacher_id", teacherId)
        .eq("niveau", oldName);

      if (res.error) throw res.error;

      if (newGroupNiveau === oldName) {
        setNewGroupNiveau(nextName);
      }

      setNiveauToRename(null);
      setRenameNiveauName("");
      await fetchAll();
    } catch (e) {
      console.error("renameNiveau", e);
      showInfo("Erreur", "Impossible de renommer ce niveau.");
    } finally {
      if (aliveRef.current) setIsUpdatingNiveau(false);
    }
  }, [
    teacherId,
    niveauToRename,
    renameNiveauName,
    isUpdatingNiveau,
    niveaux,
    newGroupNiveau,
    fetchAll,
    showInfo,
  ]);

  const deleteNiveau = useCallback(async () => {
    const niveau = trim(niveauToDelete ?? "");
    if (!teacherId || !niveau || isUpdatingNiveau) return;

    setIsUpdatingNiveau(true);
    try {
      const res = await supabase
        .from("groups")
        .update({ niveau: null })
        .eq("teacher_id", teacherId)
        .eq("niveau", niveau);

      if (res.error) throw res.error;

      if (newGroupNiveau === niveau) {
        setNewGroupNiveau(null);
      }

      setNiveauToDelete(null);
      await fetchAll();
    } catch (e) {
      console.error("deleteNiveau", e);
      showInfo("Erreur", "Impossible de supprimer ce niveau.");
    } finally {
      if (aliveRef.current) setIsUpdatingNiveau(false);
    }
  }, [
    teacherId,
    niveauToDelete,
    isUpdatingNiveau,
    newGroupNiveau,
    fetchAll,
    showInfo,
  ]);

  const openGroup = useCallback(
    (g: Group) => {
      if (selectionMode) {
        toggleSelection({ type: "group", id: g.id, name: g.name });
        return;
      }
      if (isDraggingRef.current) return;
      if (organizeModeRef.current) return;
      if (editMode) {
        openEditGroupModal(g);
        return;
      }

      const payload = {
        id: g.id,
        nom: g.name,
        eleves: g.students,
        color: g.color,
        niveau: g.niveau ?? null,
        folderId: g.folderId ?? null,
      };

      (globalThis as any).__gestionGroupesLastFolderId = g.folderId ?? null;
      props.setSelectedGroupUuid?.(payload);
      props.setSelectedGroup?.(payload as any);

      setTimeout(() => setPage?.("GestionEleves"), 0);
    },
    [props, setPage, selectionMode, toggleSelection, editMode, openEditGroupModal]
  );

  const openFolder = useCallback(
    (id: string, name?: string) => {
      if (selectionMode) {
        toggleSelection({ type: "folder", id, name: name ?? "" });
        return;
      }
      if (isDraggingRef.current) return;
      if (organizeModeRef.current) return;
      if (editMode) return;

      selectedFolderRef.current = id;
      setSelectedFolder(id);
    },
    [selectionMode, toggleSelection, editMode]
  );

  const goBack = useCallback(() => {
    if (!selectedFolder || isDeleting) return;
    const next = breadcrumb[breadcrumb.length - 2]?.id ?? null;
    selectedFolderRef.current = next;
    setSelectedFolder(next);
  }, [selectedFolder, breadcrumb, isDeleting]);

  const toggleSelectionMode = useCallback(() => {
    if (isDeleting) return;
    resetDragVisual();
    organizeModeRef.current = false;
    setOrganizeMode(false);
    setEditMode(false);
    setSelectionMode((prev) => {
      if (prev) {
        setSelectedMap({});
        return false;
      }
      return true;
    });
  }, [isDeleting, resetDragVisual]);

  const toggleEditMode = useCallback(() => {
    if (isDeleting || selectionMode) return;
    resetDragVisual();
    organizeModeRef.current = false;
    setOrganizeMode(false);
    setEditMode((prev) => !prev);
  }, [isDeleting, selectionMode, resetDragVisual]);

  const rootResponderHandlers = !IS_WEB
    ? {
        onStartShouldSetResponderCapture: () => false,
        onMoveShouldSetResponderCapture: () =>
          isDraggingRef.current && !selectionMode,
        onResponderMove: (e: any) => {
          if (!isDraggingRef.current || selectionMode) return;
          const t =
            e.nativeEvent.touches?.[0] ||
            e.nativeEvent.changedTouches?.[0];
          if (!t) return;
          onMove(t.pageX, t.pageY);
        },
        onResponderRelease: (e: any) => {
          if (!isDraggingRef.current || selectionMode) return;
          const t =
            e.nativeEvent.changedTouches?.[0] ||
            e.nativeEvent.touches?.[0];
          onUp(t?.pageX, t?.pageY);
        },
        onResponderTerminate: (e: any) => {
          if (!isDraggingRef.current || selectionMode) return;
          const t =
            e.nativeEvent.changedTouches?.[0] ||
            e.nativeEvent.touches?.[0];
          onUp(t?.pageX, t?.pageY);
        },
        onResponderTerminationRequest: () => false,
      }
    : {};

  const jiggleRot = jiggle.interpolate({
    inputRange: [-1.5, 0, 1.5],
    outputRange: ["-1.4deg", "0deg", "1.4deg"],
  });

  const backIsDropTarget = highlightKey === "back" && !!dragItem;

  return (
    <View style={s.root} {...rootResponderHandlers}>
      <View style={[s.header, { paddingTop: headerTopPad }]}>
        <View style={s.headerTopRow}>
          <View
            ref={(r) => {
              backBtnRef.current = r as any;
            }}
            style={s.headerBackWrap}
          >
            {selectedFolder !== null ? (
              <Pressable
                style={[s.backBtn, backIsDropTarget && s.backBtnDrop]}
                onPress={goBack}
                disabled={isDeleting}
              >
                <ChevronLeft size={19} color="#fff" strokeWidth={3} />
                <Text style={s.backBtnText}>Retour</Text>
              </Pressable>
            ) : (
              <Text
                style={s.headerTitle}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {titleFolder}
              </Text>
            )}
          </View>

          <View style={s.headerRight}>
            {currentGroups.length > 0 && (
              <Pressable
                style={[s.topIconBtn, editMode && s.topIconBtnEditActive]}
                onPress={toggleEditMode}
                disabled={isDeleting || selectionMode}
              >
                <Pencil
                  size={18}
                  color={editMode ? "#1F5B86" : "#fff"}
                  strokeWidth={2.6}
                />
              </Pressable>
            )}

            <Pressable
              style={s.topIconBtn}
              onPress={() => setShowCreateMenu(true)}
              disabled={isDeleting || selectionMode || editMode}
            >
              <Plus size={18} color="#fff" strokeWidth={2.8} />
            </Pressable>

            <Pressable
              style={[s.topIconBtn, selectionMode && s.topIconBtnActive]}
              onPress={toggleSelectionMode}
              disabled={isDeleting || editMode}
            >
              <Trash2 size={18} color="#fff" strokeWidth={2.6} />
            </Pressable>
          </View>
        </View>

      </View>

      {selectedFolder !== null && (
        <View style={s.subHeader}>
          <Text
            style={s.subHeaderTitle}
            numberOfLines={isMobileLayout ? 2 : 1}
            ellipsizeMode="tail"
          >
            {titleFolder}
          </Text>
        </View>
      )}

      {organizeMode && !dragItem && !selectionMode && (
        <View style={s.editBanner}>
          <Text style={s.editBannerText}>
            Mode déplacement activé · Touchez le vide pour quitter
          </Text>
        </View>
      )}

      {editMode && !selectionMode && (
        <View style={s.editBanner}>
          <Text style={s.editBannerText}>
            Mode modification activé · Touchez une classe
          </Text>
        </View>
      )}

      <Pressable
        style={s.flex1}
        onPress={() => {
          if (selectionMode) return;
          if (editMode) {
            setEditMode(false);
            return;
          }
          if (organizeMode && !dragItem) {
            organizeModeRef.current = false;
            setOrganizeMode(false);
          }
        }}
      >
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={[
            s.scrollContent,
            { paddingBottom: selectionMode ? 190 : 120 },
          ]}
          scrollEnabled={!dragItem}
          onScroll={(e) => {
            scrollYRef.current = e.nativeEvent.contentOffset.y;
          }}
          onLayout={(e) => {
            viewportHRef.current = e.nativeEvent.layout.height;
          }}
          onContentSizeChange={(_, h) => {
            contentHRef.current = h;
          }}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          <View
            ref={(r) => {
              canvasRef.current = r as any;
            }}
            style={[s.canvasArea, { minHeight: height * 0.55 }]}
          >
            {currentFolders.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>DOSSIERS</Text>

                <View style={s.folderList}>
                  {currentFolders.map((folder) => {
                    const item: DragItem = {
                      type: "folder",
                      id: folder.id,
                      name: folder.name,
                      originFolderId: folder.parentId,
                    };

                    const hidden = draggingId === folder.id;
                    const hl = highlightKey === `folder:${folder.id}`;
                    const selectedForDelete = isSelected("folder", folder.id);
                    const sf = folders.filter((f) => f.parentId === folder.id).length;
                    const sg = groups.filter((g) => g.folderId === folder.id).length;

                    const handlers = selectionMode
                      ? {}
                      : IS_WEB
                        ? makeWebHandlers(item, () =>
                            openFolder(folder.id, folder.name)
                          )
                        : makeTouchHandlers(item, () =>
                            openFolder(folder.id, folder.name)
                          );

                    return (
                      <Animated.View
                        key={folder.id}
                        ref={(r) => {
                          folderRefs.current[folder.id] = r as any;
                        }}
                        style={[
                          s.folderCard,
                          hl && s.dropActive,
                          hidden && s.sourceHidden,
                          selectedForDelete && s.deleteSelectedCard,
                          (organizeMode || editMode) &&
                            !hidden &&
                            !selectionMode && {
                              transform: [{ rotate: jiggleRot }],
                            },
                        ]}
                      >
                        <Pressable
                          style={s.fullHit}
                          onPress={() => openFolder(folder.id, folder.name)}
                          {...handlers}
                        >
                          <FolderCardContent
                            name={folder.name}
                            sf={sf}
                            sg={sg}
                            selectedForDelete={selectedForDelete}
                          />
                        </Pressable>
                      </Animated.View>
                    );
                  })}
                </View>
              </View>
            )}

            {currentGroups.length > 0 && (
              <View style={s.section}>
                <Text style={s.sectionTitle}>CLASSES</Text>

                <View style={s.groupGrid}>
                  {currentGroups.map((group) => {
                    const item: DragItem = {
                      type: "group",
                      id: group.id,
                      name: group.name,
                      originFolderId: group.folderId,
                      color: group.color,
                      niveau: group.niveau ?? null,
                      students: group.students,
                    };

                    const hidden = draggingId === group.id;
                    const selectedForDelete = isSelected("group", group.id);

                    const handlers = selectionMode || editMode
                      ? {}
                      : IS_WEB
                        ? makeWebHandlers(item, () => openGroup(group))
                        : makeTouchHandlers(item, () => openGroup(group));

                    return (
                      <Animated.View
                        key={group.id}
                        ref={(r) => {
                          groupRefs.current[group.id] = r as any;
                        }}
                        style={[
                          s.groupChip,
                          {
                            borderColor: selectedForDelete
                              ? "#D84A4A"
                              : group.color,
                            width: groupItemWidth,
                          },
                          hidden && s.sourceHidden,
                          selectedForDelete && s.deleteSelectedCard,
                          organizeMode &&
                            !hidden &&
                            !selectionMode && {
                              transform: [{ rotate: jiggleRot }],
                            },
                        ]}
                      >
                        <Pressable
                          style={s.fullHit}
                          onPress={() => openGroup(group)}
                          {...handlers}
                        >
                          <GroupChipContent
                            group={group}
                            selectedForDelete={selectedForDelete}
                          />
                        </Pressable>
                      </Animated.View>
                    );
                  })}
                </View>
              </View>
            )}

            {currentFolders.length === 0 && currentGroups.length === 0 && (
              <View style={s.empty}>
                <FolderOpen size={52} color="#c0cdd8" strokeWidth={1.4} />
                <Text style={s.emptyTitle}>Aucun contenu ici</Text>
                <Text style={s.emptyBody}>
                  Créez un dossier ou une classe{"\n"}avec le bouton +
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </Pressable>

      {selectionMode && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
          <View
            pointerEvents="box-none"
            style={[
              s.deleteOverlay,
              { bottom: deleteOverlayBottom },
            ]}
          >
            <Pressable
              style={[
                s.deleteOverlayButton,
                { width: deleteOverlayWidth },
                selectionCount === 0 && s.deleteOverlayButtonDisabled,
              ]}
              onPress={requestDeleteSelection}
              disabled={selectionCount === 0 || isDeleting}
            >
              {isDeleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Trash2 size={18} color="#fff" strokeWidth={2.6} />
                  <Text style={s.deleteOverlayButtonText}>Supprimer</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {dragItem && <View pointerEvents="none" style={s.invisibleDropZone} />}

      {dragItem && !selectionMode && (
        <Animated.View
          pointerEvents="none"
          style={[
            s.floatingPreview,
            {
              transform: [
                { translateX: dragX },
                { translateY: dragY },
                { scale: dragScale },
              ],
            },
          ]}
        >
          <PreviewCard
            item={dragItem}
            folders={folders}
            groups={groups}
            previewWidth={previewSizeRef.current.w}
          />
        </Animated.View>
      )}

      <Modal
        visible={showCreateMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateMenu(false)}
      >
        <View style={s.overlay}>
          <View style={s.smallMenu}>
            <Text style={s.smallMenuTitle}>Créer</Text>

            <Pressable
              style={s.smallMenuAction}
              onPress={() => {
                setShowCreateMenu(false);
                setShowCreateFolder(true);
              }}
            >
              <Text style={s.smallMenuActionText}>Nouveau dossier</Text>
            </Pressable>

            <Pressable
              style={s.smallMenuAction}
              onPress={() => {
                setShowCreateMenu(false);
                openCreateGroupModal();
              }}
            >
              <Text style={s.smallMenuActionText}>Nouvelle classe</Text>
            </Pressable>

            <Pressable
              style={s.smallMenuCancel}
              onPress={() => setShowCreateMenu(false)}
            >
              <Text style={s.smallMenuCancelText}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCreateFolder}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateFolder(false)}
      >
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Nouveau dossier</Text>
            <TextInput
              style={s.input}
              placeholder="Nom du dossier"
              placeholderTextColor="#a0adb8"
              value={folderName}
              onChangeText={setFolderName}
              autoFocus
              onSubmitEditing={createFolder}
            />
            <View style={s.modalActions}>
              <Pressable
                style={s.btnCancel}
                onPress={() => {
                  setShowCreateFolder(false);
                  setFolderName("");
                }}
              >
                <Text style={s.btnCancelText}>Annuler</Text>
              </Pressable>

              <Pressable style={s.btnConfirm} onPress={createFolder}>
                <Text style={s.btnConfirmText}>Créer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCreateGroup}
        transparent
        animationType="fade"
        onRequestClose={resetGroupForm}
      >
        <View style={s.overlay}>
          <View style={[s.modal, s.groupModal]}>
            <ScrollView
              style={s.groupModalScroll}
              contentContainerStyle={s.groupModalContent}
              keyboardShouldPersistTaps="handled"
              alwaysBounceVertical
              showsVerticalScrollIndicator={false}
            >
              <Text style={s.modalTitle}>{editingGroup ? "Modifier la classe" : "Nouvelle classe"}</Text>

              <TextInput
                style={s.input}
                placeholder="Nom de la classe"
                placeholderTextColor="#a0adb8"
                value={newGroupName}
                onChangeText={setNewGroupName}
                onSubmitEditing={saveGroup}
              />

            <View style={s.levelBlock}>
              <Text style={s.levelLabel}>Niveau</Text>
              <View style={s.levelRow}>
                <Pressable
                  style={[
                    s.levelPill,
                    !newGroupNiveau && !trim(newCustomNiveau) && s.levelPillActive,
                  ]}
                  onPress={() => {
                    setNewGroupNiveau(null);
                    setNewCustomNiveau("");
                  }}
                >
                  <Text
                    style={[
                      s.levelPillText,
                      !newGroupNiveau && !trim(newCustomNiveau) && s.levelPillTextActive,
                    ]}
                  >
                    Aucun
                  </Text>
                </Pressable>
              </View>

              {niveaux.length > 0 && (
                <View style={s.levelManageList}>
                  {niveaux.map((niveau) => {
                    const active =
                      newGroupNiveau === niveau && !trim(newCustomNiveau);

                    return (
                      <View
                        key={niveau}
                        style={[
                          s.levelManageRow,
                          active && s.levelManageRowActive,
                        ]}
                      >
                        <Pressable
                          style={s.levelManageSelect}
                          onPress={() => {
                            setNewGroupNiveau(niveau);
                            setNewCustomNiveau("");
                          }}
                        >
                          <Text
                            style={[
                              s.levelManageName,
                              active && s.levelManageNameActive,
                            ]}
                            numberOfLines={1}
                          >
                            {niveau}
                          </Text>
                        </Pressable>

                        <Pressable
                          style={s.levelIconBtn}
                          onPress={() => openRenameNiveau(niveau)}
                          hitSlop={8}
                        >
                          <Pencil size={13} color="#1F5B86" strokeWidth={2.6} />
                        </Pressable>
                        <Pressable
                          style={[s.levelIconBtn, s.levelIconBtnDanger]}
                          onPress={() => setNiveauToDelete(niveau)}
                          hitSlop={8}
                        >
                          <Trash2 size={13} color="#D84A4A" strokeWidth={2.6} />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              )}

              <TextInput
                style={s.input}
                placeholder="Créer ou saisir un niveau"
                placeholderTextColor="#a0adb8"
                value={newCustomNiveau}
                onChangeText={(value) => {
                  setNewCustomNiveau(value);
                  if (trim(value)) setNewGroupNiveau(null);
                }}
                onSubmitEditing={saveGroup}
              />
            </View>

            <View style={s.colorRow}>
              {COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setNewGroupColor(c)}
                  style={[
                    s.colorBtn,
                    { backgroundColor: c },
                    newGroupColor === c && s.colorBtnActive,
                  ]}
                />
              ))}
            </View>

              <View style={s.modalActions}>
                <Pressable
                  style={s.btnCancel}
                  onPress={() => {
                    resetGroupForm();
                  }}
                >
                  <Text style={s.btnCancelText}>Annuler</Text>
                </Pressable>

                <Pressable style={s.btnConfirm} onPress={saveGroup}>
                  <Text style={s.btnConfirmText}>{editingGroup ? "Modifier" : "Créer"}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isDeleting) setShowDeleteConfirm(false);
        }}
      >
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Supprimer</Text>
            <Text style={s.confirmBody}>
              Attention, tout ce qui se trouve à l'intérieur des dossiers
              sélectionnés sera définitivement supprimé.
            </Text>

            <View style={s.modalActions}>
              <Pressable
                style={s.btnCancel}
                onPress={() => {
                  if (!isDeleting) setShowDeleteConfirm(false);
                }}
                disabled={isDeleting}
              >
                <Text style={s.btnCancelText}>Annuler</Text>
              </Pressable>

              <Pressable
                style={[s.btnConfirm, s.btnDanger]}
                onPress={performDeleteSelection}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.btnConfirmText}>Supprimer</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!niveauToRename}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isUpdatingNiveau) {
            setNiveauToRename(null);
            setRenameNiveauName("");
          }
        }}
      >
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Renommer le niveau</Text>
            <TextInput
              style={s.input}
              placeholder="Nom du niveau"
              placeholderTextColor="#a0adb8"
              value={renameNiveauName}
              onChangeText={setRenameNiveauName}
              autoFocus
              onSubmitEditing={renameNiveau}
            />

            <View style={s.modalActions}>
              <Pressable
                style={s.btnCancel}
                onPress={() => {
                  if (!isUpdatingNiveau) {
                    setNiveauToRename(null);
                    setRenameNiveauName("");
                  }
                }}
                disabled={isUpdatingNiveau}
              >
                <Text style={s.btnCancelText}>Annuler</Text>
              </Pressable>

              <Pressable
                style={s.btnConfirm}
                onPress={renameNiveau}
                disabled={isUpdatingNiveau || !trim(renameNiveauName)}
              >
                {isUpdatingNiveau ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.btnConfirmText}>Renommer</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!niveauToDelete}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!isUpdatingNiveau) setNiveauToDelete(null);
        }}
      >
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Supprimer le niveau</Text>
            <Text style={s.confirmBody}>
              Ce niveau sera retiré de toutes les classes qui l'utilisent.
            </Text>

            <View style={s.modalActions}>
              <Pressable
                style={s.btnCancel}
                onPress={() => {
                  if (!isUpdatingNiveau) setNiveauToDelete(null);
                }}
                disabled={isUpdatingNiveau}
              >
                <Text style={s.btnCancelText}>Annuler</Text>
              </Pressable>

              <Pressable
                style={[s.btnConfirm, s.btnDanger]}
                onPress={deleteNiveau}
                disabled={isUpdatingNiveau}
              >
                {isUpdatingNiveau ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.btnConfirmText}>Supprimer</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!infoState}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoState(null)}
      >
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>{infoState?.title}</Text>
            <Text style={s.confirmBody}>{infoState?.message}</Text>

            <View style={s.modalActions}>
              <Pressable
                style={s.btnConfirm}
                onPress={() => setInfoState(null)}
              >
                <Text style={s.btnConfirmText}>OK</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Styles                                                        */
/* ────────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#edf2f6",
  },
  flex1: {
    flex: 1,
  },

  header: {
    backgroundColor: "#1F5B86",
    paddingBottom: 10,
    paddingHorizontal: 14,
    gap: 4,
    position: "relative",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 6,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    gap: 10,
  },
  headerBackWrap: {
    justifyContent: "center",
    alignItems: "flex-start",
    minWidth: 88,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 100,
    justifyContent: "flex-end",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.15,
    includeFontPadding: false,
    lineHeight: 20,
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
  subHeaderTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#fff",
    letterSpacing: 0.2,
    includeFontPadding: false,
    lineHeight: 18,
  },

  topIconBtn: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1.8,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  topIconBtnActive: {
    backgroundColor: "#D84A4A",
    borderColor: "rgba(255,255,255,0.4)",
  },
  topIconBtnEditActive: {
    backgroundColor: "#fff",
    borderColor: "rgba(255,255,255,0.9)",
  },

  backBtn: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 13,
    backgroundColor: "#2B79B1",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.28)",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  backBtnDrop: {
    backgroundColor: "#1a5fa0",
    borderColor: "#7ec8ff",
    shadowColor: "#7ec8ff",
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  backBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },

  editBanner: {
    backgroundColor: "#185074",
    paddingVertical: 7,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  editBannerText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  canvasArea: {
    minHeight: 500,
  },

  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "800",
    color: "#8a9eb0",
    letterSpacing: 1.4,
    marginBottom: 9,
  },

  folderList: {
    gap: 8,
  },
  folderCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d0dce6",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
    overflow: "hidden",
    position: "relative",
  },
  folderCardInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 13,
    gap: 12,
  },
  folderIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#e6f0fa",
    alignItems: "center",
    justifyContent: "center",
  },
  folderIconDelete: {
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  folderText: {
    flex: 1,
    minWidth: 0,
  },
  folderName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a2a3a",
  },
  folderMeta: {
    fontSize: 12,
    color: "#6b7f8e",
    marginTop: 2,
  },

  groupGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  groupChip: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 2.5,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
    overflow: "hidden",
    position: "relative",
  },
  groupChipInner: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 4,
    minHeight: 82,
  },
  groupTextWrap: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },
  groupName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1a2a3a",
    textAlign: "center",
    lineHeight: 18,
  },
  groupMeta: {
    fontSize: 10,
    color: "#6b7f8e",
    textAlign: "center",
  },
  groupMetaFirst: {
    marginTop: 7,
  },

  fullHit: {
    width: "100%",
  },

  deleteSelectedCard: {
    backgroundColor: "#D84A4A",
    borderColor: "#B93333",
    shadowColor: "#D84A4A",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 5,
  },
  deleteTextStrong: {
    color: "#fff",
  },
  deleteTextSoft: {
    color: "rgba(255,255,255,0.88)",
  },

  dropActive: {
    borderColor: "#2980e8",
    borderWidth: 2.5,
    backgroundColor: "#eef5ff",
    shadowColor: "#2980e8",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 7,
  },

  sourceHidden: {
    opacity: 0,
  },

  invisibleDropZone: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4000,
    opacity: 0,
  },

  floatingPreview: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 9999,
  },

  deleteOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 60000,
    elevation: 60000,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteOverlayButton: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: "#D84A4A",
    paddingHorizontal: 22,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 14,
  },
  deleteOverlayButtonDisabled: {
    backgroundColor: "#C9D3DB",
  },
  deleteOverlayButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },

  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#8a9eb0",
  },
  emptyBody: {
    fontSize: 13,
    color: "#a8b8c4",
    textAlign: "center",
    lineHeight: 20,
  },

  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.48)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modal: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: 360,
    maxWidth: "100%",
    gap: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  smallMenu: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    width: 320,
    maxWidth: "100%",
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  smallMenuTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1a2a3a",
    textAlign: "center",
    marginBottom: 4,
  },
  smallMenuAction: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: "#edf4fb",
    borderWidth: 1.5,
    borderColor: "#d7e4ef",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  smallMenuActionText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1F5B86",
  },
  smallMenuCancel: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "#f3f5f7",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  smallMenuCancelText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#7a8c9a",
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#1a2a3a",
  },
  groupModal: {
    maxHeight: "88%",
    padding: 0,
    overflow: "hidden",
  },
  groupModalScroll: {
    width: "100%",
  },
  groupModalContent: {
    gap: 16,
    padding: 24,
    paddingBottom: 28,
  },
  confirmBody: {
    fontSize: 14,
    color: "#5f7282",
    lineHeight: 22,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#d0dce6",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: "#1a2a3a",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  btnCancel: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#f0f4f8",
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  btnCancelText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#8a9eb0",
  },
  btnConfirm: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#1F5B86",
    minWidth: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDanger: {
    backgroundColor: "#D84A4A",
  },
  btnConfirmText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
  },
  levelBlock: {
    gap: 8,
  },
  levelLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: "#6b7f8e",
  },
  levelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  levelPill: {
    minHeight: 34,
    maxWidth: "100%",
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#d0dce6",
    backgroundColor: "#f6f9fb",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  levelPillActive: {
    backgroundColor: "#1F5B86",
    borderColor: "#1F5B86",
  },
  levelPillText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#526879",
  },
  levelPillTextActive: {
    color: "#fff",
  },
  levelManageList: {
    gap: 6,
  },
  levelManageRow: {
    minHeight: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#d7e4ef",
    backgroundColor: "#f8fbfd",
    paddingLeft: 12,
    paddingRight: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  levelManageRowActive: {
    backgroundColor: "#1F5B86",
    borderColor: "#1F5B86",
  },
  levelManageSelect: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    justifyContent: "center",
  },
  levelManageName: {
    fontSize: 13,
    fontWeight: "800",
    color: "#526879",
  },
  levelManageNameActive: {
    color: "#fff",
  },
  levelIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "#edf4fb",
    alignItems: "center",
    justifyContent: "center",
  },
  levelIconBtnDanger: {
    backgroundColor: "#fff1f1",
  },

  colorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  colorBtnActive: {
    borderWidth: 3,
    borderColor: "#1a2a3a",
  },
});
