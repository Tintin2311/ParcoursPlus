import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  ImageBackground,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { supabase } from "./supabaseClient";
import BottomBarEleve from "./ui/BottomBarEleve";

const BG_GAME =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/AccueilElevePaysage.png";

const LS_ECRIRE_RESULTAT_FOLDER_ID = "ecrireResultat.currentFolderId";
const LS_ECRIRE_RESULTAT_FOLDER_HISTORY = "ecrireResultat.folderHistory";
const LS_ECRIRE_RESULTAT_SCROLL_Y = "ecrireResultat.scrollY";

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
  group_name?: string | null;
};

type ParcoursRow = {
  id: string;
  nom?: string | null;
  name?: string | null;
  folder_id?: string | null;
  groupes_associes?: any;
  balises_ordre?: any;
  ordre?: number | null;
  created_at?: string | null;
  [key: string]: any;
};

type FolderRow = {
  id: string;
  nom?: string | null;
  name?: string | null;
  parent_folder_id?: string | null;
  groupes_associes?: any;
  ordre?: number | null;
  created_at?: string | null;
  [key: string]: any;
};

type ParcoursStatRow = {
  parcours_id: string;
  best_score?: number | null;
  last_score?: number | null;
  total_balises?: number | null;
  tentatives_count?: number | null;
  parcours_termine?: boolean | null;
  best_points?: number | null;
  last_points?: number | null;
};

type ParcoursStatus = "not_started" | "started" | "completed";

type RenderedNode =
  | (FolderRow & { type: "folder"; displayName: string })
  | (ParcoursRow & { type: "parcours"; displayName: string });

type Props = {
  setPage: SetPageFn;
  eleveConnecte?: EleveConnecte | null;
  parcoursGlobaux?: ParcoursRow[];
  dossiersParcours?: FolderRow[];
  setParcoursActif?: (p: any) => void;
};

type EcrireResultatMemoryCache = {
  resolvedEleve: EleveConnecte | null;
  classeNom: string | null;
  parcoursData: ParcoursRow[];
  foldersData: FolderRow[];
  parcoursStats: Record<string, ParcoursStatRow>;
  currentFolderId: string | null;
  folderHistory: (string | null)[];
  scrollY: number;
};

let ecrireResultatMemoryCache: EcrireResultatMemoryCache | null = null;

const C_TEXT = "#0B2540";
const C_MUTED = "#57708A";
const C_GOLD = "#FBBF24";

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

const getDisplayName = (row: any) =>
  String(row?.nom ?? row?.name ?? "Sans nom");

const sortByOrdreThenDate = (a: any, b: any) => {
  const ordreA = Number.isFinite(Number(a?.ordre)) ? Number(a.ordre) : 999999;
  const ordreB = Number.isFinite(Number(b?.ordre)) ? Number(b.ordre) : 999999;

  if (ordreA !== ordreB) return ordreA - ordreB;

  const dateA = a?.created_at ? new Date(a.created_at).getTime() : 0;
  const dateB = b?.created_at ? new Date(b.created_at).getTime() : 0;

  if (dateA !== dateB) return dateA - dateB;

  return getDisplayName(a).localeCompare(getDisplayName(b), "fr");
};

const normalizeAssoc = (value: any): string[] => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }

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

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      // ignore
    }

    return [raw];
  }

  return [];
};

const isParcoursVisibleForGroup = (
  parcours: ParcoursRow,
  groupId: string | null | undefined
) => {
  if (!groupId) return false;
  return normalizeAssoc(parcours.groupes_associes).includes(String(groupId));
};

const isFolderVisibleForGroup = (
  folder: FolderRow,
  groupId: string | null | undefined,
  allFolders: FolderRow[],
  allParcours: ParcoursRow[]
): boolean => {
  if (!groupId) return false;

  const directAssoc = normalizeAssoc(folder.groupes_associes).includes(String(groupId));
  if (directAssoc) return true;

  const directParcoursVisible = allParcours.some(
    (p) => (p.folder_id ?? null) === folder.id && isParcoursVisibleForGroup(p, groupId)
  );
  if (directParcoursVisible) return true;

  const childFolders = allFolders.filter((f) => (f.parent_folder_id ?? null) === folder.id);
  return childFolders.some((child) =>
    isFolderVisibleForGroup(child, groupId, allFolders, allParcours)
  );
};

const parseStoredStudent = (raw: string | null): EleveConnecte | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as EleveConnecte;
  } catch {
    return null;
  }
};

const getStatusFromStat = (stat?: ParcoursStatRow | null): ParcoursStatus => {
  if (!stat) return "not_started";

  const bestScore = Number(stat.best_score ?? 0);
  const lastScore = Number(stat.last_score ?? 0);
  const totalBalises = Number(stat.total_balises ?? 0);
  const tentativesCount = Number(stat.tentatives_count ?? 0);

  if (
    stat.parcours_termine === true ||
    (totalBalises > 0 && (bestScore >= totalBalises || lastScore >= totalBalises))
  ) {
    return "completed";
  }

  if (tentativesCount > 0 || bestScore > 0 || lastScore > 0) return "started";
  return "not_started";
};

const EcrireResultat: React.FC<Props> = ({
  setPage,
  eleveConnecte,
  parcoursGlobaux = [],
  dossiersParcours = [],
  setParcoursActif,
}) => {
  const initialCache = ecrireResultatMemoryCache;
  const initialScrollY = initialCache?.scrollY ?? 0;
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollYRef = useRef(initialScrollY);
  const restoreScrollYRef = useRef<number | null>(null);
  const restoreDoneRef = useRef(false);

  const [loading, setLoading] = useState(!initialCache);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [resolvedEleve, setResolvedEleve] = useState<EleveConnecte | null>(
    initialCache?.resolvedEleve ?? null
  );
  const [classeNom, setClasseNom] = useState<string | null>(initialCache?.classeNom ?? null);
  const [parcoursData, setParcoursData] = useState<ParcoursRow[]>(
    initialCache?.parcoursData ?? []
  );
  const [foldersData, setFoldersData] = useState<FolderRow[]>(initialCache?.foldersData ?? []);
  const [parcoursStats, setParcoursStats] = useState<Record<string, ParcoursStatRow>>(
    initialCache?.parcoursStats ?? {}
  );
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(
    initialCache?.currentFolderId ?? null
  );
  const [folderHistory, setFolderHistory] = useState<(string | null)[]>(
    initialCache?.folderHistory ?? []
  );
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isRestoringScroll, setIsRestoringScroll] = useState(false);

  const groupId = resolvedEleve?.group_id ?? null;
  const eleveNom = resolvedEleve?.display_name ?? "Élève";

  const currentFolder = useMemo(
    () => foldersData.find((f) => f.id === currentFolderId) ?? null,
    [foldersData, currentFolderId]
  );

  const pageTitle = currentFolder ? getDisplayName(currentFolder) : "PARCOURS";

  const resolveEleveAndClasse = useCallback(async () => {
    let baseEleve: EleveConnecte | null = eleveConnecte ?? null;

    if (!baseEleve) {
      const raw = await AsyncStorage.getItem("eleveConnecte");
      baseEleve = parseStoredStudent(raw);
    }

    if (!baseEleve) {
      setResolvedEleve(null);
      setClasseNom(null);
      return null;
    }

    let rpcRow: RpcStudentRow | null = null;

    if (baseEleve.code) {
      const rpc = await supabase.rpc("student_name_and_group_by_code", {
        p_code: baseEleve.code,
      });

      if (!rpc.error && rpc.data) {
        rpcRow = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
      }
    }

    const studentId = rpcRow?.id ?? baseEleve.id ?? baseEleve.uuid ?? null;
    const studentName = rpcRow?.name ?? baseEleve.display_name ?? null;
    const studentGroupId = rpcRow?.group_id ?? baseEleve.group_id ?? null;
    const studentGroupName = rpcRow?.group_name ?? null;

    const merged: EleveConnecte = {
      ...baseEleve,
      id: studentId ?? baseEleve.id,
      uuid: baseEleve.uuid,
      display_name: studentName ?? baseEleve.display_name ?? null,
      group_id: studentGroupId ?? null,
    };

    setResolvedEleve(merged);
    setClasseNom(studentGroupName);

    try {
      await AsyncStorage.setItem("eleveConnecte", JSON.stringify(merged));
    } catch {
      // ignore
    }

    return merged;
  }, [eleveConnecte]);

  const fetchParcoursStats = useCallback(async (resolvedStudentId: string | null) => {
    if (!resolvedStudentId) {
      setParcoursStats({});
      return {};
    }

    const { data, error } = await supabase
      .from("eleve_parcours_stats")
      .select(
        "parcours_id,best_score,last_score,total_balises,tentatives_count,parcours_termine,best_points,last_points"
      )
      .eq("student_id", resolvedStudentId);

    if (error) {
      setParcoursStats({});
      return {};
    }

    const map: Record<string, ParcoursStatRow> = {};
    ((data as ParcoursStatRow[]) || []).forEach((row) => {
      if (row?.parcours_id) map[String(row.parcours_id)] = row;
    });

    setParcoursStats(map);
    return map;
  }, []);

  const fetchData = useCallback(async () => {
    const memoryCache = ecrireResultatMemoryCache;
    const hasMemoryCache = !!memoryCache;

    setLoading(!hasMemoryCache);
    setScreenError(null);

    try {
      const eleve = await resolveEleveAndClasse();
      const resolvedStudentId = eleve?.id ?? eleve?.uuid ?? null;

      let nextParcours = Array.isArray(parcoursGlobaux) ? parcoursGlobaux : [];
      let nextFolders = Array.isArray(dossiersParcours) ? dossiersParcours : [];

      if (!nextParcours.length) {
        const { data, error } = await supabase
          .from("parcours")
          .select("*")
          .order("ordre", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true });

        if (error) throw error;
        nextParcours = data || [];
      }

      if (!nextFolders.length) {
        const { data, error } = await supabase
          .from("parcours_folders")
          .select("*")
          .order("ordre", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true });

        if (error) throw error;
        nextFolders = data || [];
      }

      const normalizedParcours = (nextParcours || [])
        .map((p) => ({
          ...p,
          nom: getDisplayName(p),
          groupes_associes: normalizeAssoc(p.groupes_associes),
        }))
        .sort(sortByOrdreThenDate);

      const normalizedFolders = (nextFolders || [])
        .map((f) => ({
          ...f,
          nom: getDisplayName(f),
          groupes_associes: normalizeAssoc(f.groupes_associes),
        }))
        .sort(sortByOrdreThenDate);

      setParcoursData(normalizedParcours);
      setFoldersData(normalizedFolders);

      const nextStats = await fetchParcoursStats(resolvedStudentId);

      const folderExists = (id: string | null) =>
        id === null || nextFolders.some((folder) => String(folder.id) === String(id));

      let restoredFolderId: string | null = null;
      let restoredFolderHistory: (string | null)[] = [];
      let restoredScrollY = 0;

      if (memoryCache) {
        restoredFolderId = folderExists(memoryCache.currentFolderId)
          ? memoryCache.currentFolderId
          : null;
        restoredFolderHistory = memoryCache.folderHistory.filter(
          (id) => id === null || (typeof id === "string" && folderExists(id))
        );
        restoredScrollY = Math.max(0, Number(memoryCache.scrollY ?? 0) || 0);
      } else {
        const savedFolderId = await AsyncStorage.getItem(LS_ECRIRE_RESULTAT_FOLDER_ID);
        const savedFolderHistoryRaw = await AsyncStorage.getItem(LS_ECRIRE_RESULTAT_FOLDER_HISTORY);
        const savedScrollYRaw = await AsyncStorage.getItem(LS_ECRIRE_RESULTAT_SCROLL_Y);

        restoredFolderId = savedFolderId && folderExists(savedFolderId) ? savedFolderId : null;

        try {
          const parsed = savedFolderHistoryRaw ? JSON.parse(savedFolderHistoryRaw) : [];
          restoredFolderHistory = Array.isArray(parsed)
            ? parsed.filter((id) => id === null || (typeof id === "string" && folderExists(id)))
            : [];
        } catch {
          restoredFolderHistory = [];
        }

        restoredScrollY = Math.max(0, Number(savedScrollYRaw ?? 0) || 0);
      }

      setCurrentFolderId(restoredFolderId);
      setFolderHistory(restoredFolderHistory);
      restoreScrollYRef.current = restoredScrollY;
      if (!hasMemoryCache) {
        setIsRestoringScroll(restoredScrollY > 0);
      }
      setSearchTerm("");
      setSearchVisible(false);

      ecrireResultatMemoryCache = {
        resolvedEleve: eleve ?? null,
        classeNom: ecrireResultatMemoryCache?.classeNom ?? null,
        parcoursData: normalizedParcours,
        foldersData: normalizedFolders,
        parcoursStats: nextStats,
        currentFolderId: restoredFolderId,
        folderHistory: restoredFolderHistory,
        scrollY: restoredScrollY,
      };
    } catch (err: any) {
      setScreenError(err?.message || "Impossible de charger les données.");
    } finally {
      setLoading(false);
    }
  }, [parcoursGlobaux, dossiersParcours, resolveEleveAndClasse, fetchParcoursStats]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!initialCache || initialScrollY <= 0) return;

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: initialScrollY, animated: false });
    });
  }, [initialCache, initialScrollY]);

  useEffect(() => {
    if (loading) return;

    ecrireResultatMemoryCache = {
      resolvedEleve,
      classeNom,
      parcoursData,
      foldersData,
      parcoursStats,
      currentFolderId,
      folderHistory,
      scrollY: scrollYRef.current,
    };
  }, [
    loading,
    resolvedEleve,
    classeNom,
    parcoursData,
    foldersData,
    parcoursStats,
    currentFolderId,
    folderHistory,
  ]);

  const getDirectFolders = useCallback(
    (parentId: string | null) =>
      foldersData
        .filter((f) => (f.parent_folder_id ?? null) === parentId)
        .sort(sortByOrdreThenDate),
    [foldersData]
  );

  const getDirectParcours = useCallback(
    (folderId: string | null) =>
      parcoursData
        .filter((p) => (p.folder_id ?? null) === folderId)
        .sort(sortByOrdreThenDate),
    [parcoursData]
  );

  const getAllVisibleParcoursInsideFolder = useCallback(
    (folderId: string): ParcoursRow[] => {
      if (!groupId) return [];

      const directParcours = getDirectParcours(folderId).filter((p) =>
        isParcoursVisibleForGroup(p, groupId)
      );

      const childFolders = getDirectFolders(folderId).filter((folder) =>
        isFolderVisibleForGroup(folder, groupId, foldersData, parcoursData)
      );

      const childParcours = childFolders.flatMap((child) =>
        getAllVisibleParcoursInsideFolder(child.id)
      );

      return [...directParcours, ...childParcours];
    },
    [groupId, getDirectFolders, getDirectParcours, foldersData, parcoursData]
  );

  const getParcoursProgress = useCallback(
    (parcoursId: string) => {
      const status = getStatusFromStat(parcoursStats[parcoursId]);
      if (status === "completed") return 100;
      if (status === "started") return 50;
      return 0;
    },
    [parcoursStats]
  );

  const getFolderProgress = useCallback(
    (folderId: string) => {
      const parcours = getAllVisibleParcoursInsideFolder(folderId);
      if (!parcours.length) return 0;

      const total = parcours.reduce((sum, p) => sum + getParcoursProgress(p.id), 0);
      return Math.round(total / parcours.length);
    },
    [getAllVisibleParcoursInsideFolder, getParcoursProgress]
  );

  const openFolder = useCallback(
    (folderId: string) => {
      const nextHistory = [...folderHistory, currentFolderId];

      setFolderHistory(nextHistory);
      setCurrentFolderId(folderId);
      setSearchTerm("");
      setSearchVisible(false);

      AsyncStorage.multiSet([
        [LS_ECRIRE_RESULTAT_FOLDER_ID, folderId],
        [LS_ECRIRE_RESULTAT_FOLDER_HISTORY, JSON.stringify(nextHistory)],
        [LS_ECRIRE_RESULTAT_SCROLL_Y, "0"],
      ]).catch(() => null);
    },
    [currentFolderId, folderHistory]
  );

  const goBackFolder = useCallback(() => {
    if (folderHistory.length === 0) {
      setCurrentFolderId(null);
      setSearchTerm("");
      setSearchVisible(false);

      AsyncStorage.multiSet([
        [LS_ECRIRE_RESULTAT_FOLDER_ID, ""],
        [LS_ECRIRE_RESULTAT_FOLDER_HISTORY, JSON.stringify([])],
        [LS_ECRIRE_RESULTAT_SCROLL_Y, "0"],
      ]).catch(() => null);
      return;
    }

    const previous = folderHistory[folderHistory.length - 1];
    const nextHistory = folderHistory.slice(0, -1);

    setFolderHistory(nextHistory);
    setCurrentFolderId(previous);
    setSearchTerm("");
    setSearchVisible(false);

    AsyncStorage.multiSet([
      [LS_ECRIRE_RESULTAT_FOLDER_ID, previous ?? ""],
      [LS_ECRIRE_RESULTAT_FOLDER_HISTORY, JSON.stringify(nextHistory)],
      [LS_ECRIRE_RESULTAT_SCROLL_Y, "0"],
    ]).catch(() => null);
  }, [folderHistory]);

  const visibleNodes = useMemo(() => {
    if (!groupId) return [] as RenderedNode[];

    const s = searchTerm.trim().toLowerCase();

    if (s) {
      const visibleFolders = foldersData
        .filter((folder) =>
          isFolderVisibleForGroup(folder, groupId, foldersData, parcoursData)
        )
        .filter((folder) => getDisplayName(folder).toLowerCase().includes(s))
        .map((folder) => ({
          ...folder,
          type: "folder" as const,
          displayName: getDisplayName(folder),
        }));

      const visibleParcours = parcoursData
        .filter((p) => isParcoursVisibleForGroup(p, groupId))
        .filter((p) => getDisplayName(p).toLowerCase().includes(s))
        .map((p) => ({
          ...p,
          type: "parcours" as const,
          displayName: getDisplayName(p),
        }));

      return [...visibleFolders, ...visibleParcours].sort(sortByOrdreThenDate);
    }

    const directFolders = getDirectFolders(currentFolderId)
      .filter((folder) =>
        isFolderVisibleForGroup(folder, groupId, foldersData, parcoursData)
      )
      .map((folder) => ({
        ...folder,
        type: "folder" as const,
        displayName: getDisplayName(folder),
      }));

    const directParcours = getDirectParcours(currentFolderId)
      .filter((p) => isParcoursVisibleForGroup(p, groupId))
      .map((p) => ({
        ...p,
        type: "parcours" as const,
        displayName: getDisplayName(p),
      }));

    return [...directFolders, ...directParcours];
  }, [
    groupId,
    searchTerm,
    foldersData,
    parcoursData,
    currentFolderId,
    getDirectFolders,
    getDirectParcours,
  ]);

  useEffect(() => {
    if (loading || !isRestoringScroll || restoreScrollYRef.current === null) return;

    restoreDoneRef.current = false;
  }, [loading, visibleNodes.length, currentFolderId]);

  const restoreScrollPosition = useCallback(() => {
    if (loading || !isRestoringScroll || restoreDoneRef.current) return;
    if (restoreScrollYRef.current === null) return;

    const y = restoreScrollYRef.current;
    restoreDoneRef.current = true;
    restoreScrollYRef.current = null;

    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y, animated: false });
      requestAnimationFrame(() => {
        setIsRestoringScroll(false);
      });
    });
  }, [isRestoringScroll, loading]);

  const sourceDescription = useMemo(() => {
    if (!resolvedEleve) return "Aucun élève détecté";
    if (!groupId) return `${eleveNom} • Aucune classe trouvée`;
    if (!classeNom) return `${eleveNom} • Classe inconnue`;
    return `${eleveNom} • ${classeNom}`;
  }, [resolvedEleve, groupId, classeNom, eleveNom]);

  const handleOpenParcours = useCallback(
    (parcours: ParcoursRow) => {
      ecrireResultatMemoryCache = {
        resolvedEleve,
        classeNom,
        parcoursData,
        foldersData,
        parcoursStats,
        currentFolderId,
        folderHistory,
        scrollY: scrollYRef.current,
      };

      AsyncStorage.multiSet([
        [LS_ECRIRE_RESULTAT_FOLDER_ID, currentFolderId ?? ""],
        [LS_ECRIRE_RESULTAT_FOLDER_HISTORY, JSON.stringify(folderHistory)],
        [LS_ECRIRE_RESULTAT_SCROLL_Y, String(scrollYRef.current)],
      ]).catch(() => null);

      setParcoursActif?.(parcours);
      setPage("EcrireCodeBaliseEleve");
    },
    [
      resolvedEleve,
      classeNom,
      parcoursData,
      foldersData,
      parcoursStats,
      currentFolderId,
      folderHistory,
      setParcoursActif,
      setPage,
    ]
  );

  const renderNode = ({ item }: { item: RenderedNode }) => {
    const isFolder = item.type === "folder";
    const stat = !isFolder ? parcoursStats[item.id] : null;
    const status = !isFolder ? getStatusFromStat(stat) : "not_started";

    const isCompleted = status === "completed";
    const isStarted = status === "started";

    const progress = isFolder ? getFolderProgress(item.id) : getParcoursProgress(item.id);

    const cardColors: [string, string] = isFolder
      ? ["rgba(255,255,255,0.94)", "rgba(220,244,255,0.88)"]
      : isCompleted
      ? ["rgba(236,253,245,0.98)", "rgba(187,247,208,0.92)"]
      : isStarted
      ? ["rgba(255,251,235,0.98)", "rgba(254,215,170,0.90)"]
      : ["rgba(255,255,255,0.96)", "rgba(224,231,255,0.88)"];

    const progressColors: [string, string] =
      progress >= 100
        ? ["#15803D", "#22C55E"]
        : progress > 0
        ? ["#EA580C", "#FBBF24"]
        : ["#4338CA", "#38BDF8"];

    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => {
          if (isFolder) openFolder(item.id);
          else handleOpenParcours(item as ParcoursRow);
        }}
        style={[styles.nodeOuter, webPanYStyle]}
      >
        <LinearGradient
          colors={cardColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.nodeCard}
        >
          <LinearGradient
            colors={progressColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.progressBadge}
          >
            <Text style={styles.progressText}>{progress}%</Text>
          </LinearGradient>

          <View style={styles.nodeTextWrap}>
            <Text numberOfLines={1} style={styles.nodeTitle}>
              {item.displayName}
            </Text>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ImageBackground source={{ uri: BG_GAME }} style={styles.bg} resizeMode="cover">
        <LinearGradient
          colors={[
            "rgba(5,18,30,0.55)",
            "rgba(9,34,54,0.38)",
            "rgba(234,246,255,0.88)",
            "rgba(234,246,255,0.96)",
          ]}
          locations={[0, 0.22, 0.58, 1]}
          style={styles.container}
        >
          <View style={(loading || isRestoringScroll) && styles.restoreHidden}>
            <View style={styles.topBar}>
              {currentFolderId && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.topIconButton}
                  onPress={goBackFolder}
                >
                  <Feather name="arrow-left" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              )}

              <View style={styles.topTextWrap}>
                <Text numberOfLines={1} style={styles.pageTitle}>
                  {pageTitle}
                </Text>
                <Text numberOfLines={1} style={styles.pageSubtitle}>
                  {sourceDescription}
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.topIconButton, searchVisible && styles.topIconButtonActive]}
                onPress={() => {
                  setSearchVisible((prev) => !prev);
                  if (searchVisible) setSearchTerm("");
                }}
              >
                <Feather name={searchVisible ? "x" : "search"} size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {searchVisible && (
              <View style={styles.topSearchWrap}>
                <View style={styles.searchBox}>
                  <Feather name="search" size={18} color={C_MUTED} />
                  <TextInput
                    value={searchTerm}
                    onChangeText={setSearchTerm}
                    placeholder="Rechercher..."
                    placeholderTextColor="#8AA0B7"
                    style={styles.searchInput}
                    autoFocus
                  />
                </View>
              </View>
            )}
          </View>

          <ScrollView
            ref={scrollRef}
            style={[styles.scroll, (loading || isRestoringScroll) && styles.restoreHidden, webScrollStyle]}
            contentOffset={{ x: 0, y: initialScrollY }}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            scrollEventThrottle={16}
            onScroll={(event) => {
              scrollYRef.current = event.nativeEvent.contentOffset.y;
            }}
            onContentSizeChange={restoreScrollPosition}
            onLayout={restoreScrollPosition}
          >
            {loading ? (
              <View style={styles.stateCard}>
                <ActivityIndicator size="large" color={C_GOLD} />
                <Text style={styles.stateTitle}>Chargement...</Text>
                <Text style={styles.stateText}>Préparation des parcours.</Text>
              </View>
            ) : screenError ? (
              <View style={styles.stateCard}>
                <Feather name="alert-circle" size={42} color={C_GOLD} />
                <Text style={styles.stateTitle}>Erreur</Text>
                <Text style={styles.stateText}>{screenError}</Text>
              </View>
            ) : !groupId ? (
              <View style={styles.stateCard}>
                <Feather name="users" size={42} color={C_GOLD} />
                <Text style={styles.stateTitle}>Aucune classe trouvée</Text>
                <Text style={styles.stateText}>
                  Impossible de retrouver la classe de l’élève.
                </Text>
              </View>
            ) : visibleNodes.length === 0 ? (
              <View style={styles.stateCard}>
                <Feather name="map" size={42} color={C_GOLD} />
                <Text style={styles.stateTitle}>
                  {searchTerm.trim() ? "Aucun résultat" : "Aucun parcours"}
                </Text>
                <Text style={styles.stateText}>
                  {searchTerm.trim()
                    ? "Aucun dossier ou parcours ne correspond à ta recherche."
                    : "Aucun parcours n’est disponible pour cette classe."}
                </Text>
              </View>
            ) : (
              <View style={webPanYStyle}>
                {visibleNodes.map((item, index) => (
                  <View key={`${item.type}-${item.id}`}>
                    {renderNode({ item })}
                    {index < visibleNodes.length - 1 && <View style={{ height: 12 }} />}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <BottomBarEleve currentPage="EcrireResultat" onNavigate={setPage} />
        </LinearGradient>
      </ImageBackground>
    </SafeAreaView>
  );
};

export default EcrireResultat;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#061827" },
  bg: { flex: 1 },
  container: { flex: 1, overflow: "hidden" },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 14 : 8,
    paddingBottom: 12,
    backgroundColor: "rgba(8, 30, 48, 0.72)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.18)",
  },

  topTextWrap: {
    flex: 1,
    minWidth: 0,
  },

  topIconButton: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },

  topIconButtonActive: {
    backgroundColor: "rgba(56,189,248,0.32)",
  },

  pageTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  pageSubtitle: {
    color: "#DDF7FF",
    fontSize: 12,
    marginTop: 2,
    fontWeight: "800",
  },

  topSearchWrap: {
    backgroundColor: "rgba(8, 30, 48, 0.72)",
    paddingHorizontal: 14,
    paddingBottom: 12,
  },

  searchBox: {
    height: 50,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 13,
  },

  searchInput: {
    flex: 1,
    color: C_TEXT,
    fontSize: 14,
    fontWeight: "800",
  },

  scroll: {
    flex: 1,
  },

  restoreHidden: {
    opacity: 0,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 118,
  },

  nodeOuter: {
    borderRadius: 22,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },

  nodeCard: {
    minHeight: 68,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.58)",
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  progressBadge: {
    width: 54,
    height: 44,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.58)",
  },

  progressText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  nodeTextWrap: {
    flex: 1,
    minWidth: 0,
  },

  nodeTitle: {
    color: C_TEXT,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.15,
  },

  stateCard: {
    backgroundColor: "rgba(255,255,255,0.93)",
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
});
