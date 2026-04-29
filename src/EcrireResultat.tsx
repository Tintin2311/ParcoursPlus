// src/EcrireResultat.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  FlatList,
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

/* =========================
   Types
========================= */
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

type GroupRow = {
  id: string;
  name?: string | null;
  nom?: string | null;
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
  | (FolderRow & {
      type: "folder";
      depth: number;
      displayName: string;
    })
  | (ParcoursRow & {
      type: "parcours";
      depth: number;
      displayName: string;
    });

type Props = {
  setPage: SetPageFn;
  eleveConnecte?: EleveConnecte | null;
  parcoursGlobaux?: ParcoursRow[];
  dossiersParcours?: FolderRow[];
  setParcoursActif?: (p: any) => void;
};

/* =========================
   Theme
========================= */
const C_BG = "#07111F";
const C_BG_2 = "#0B1728";
const C_CARD = "#101D32";
const C_TEXT = "#F8FAFC";
const C_MUTED = "#A9B8D0";
const C_BORDER = "rgba(255,255,255,0.08)";
const C_GOLD = "#F59E0B";
const C_BLUE = "#60A5FA";

/* =========================
   Helpers
========================= */
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
  const assoc = normalizeAssoc(parcours.groupes_associes);
  return assoc.includes(String(groupId));
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

  const completedByBool = stat.parcours_termine === true;
  const completedByScore =
    totalBalises > 0 && (bestScore >= totalBalises || lastScore >= totalBalises);

  if (completedByBool || completedByScore) return "completed";

  if (tentativesCount > 0 || bestScore > 0 || lastScore > 0) return "started";

  return "not_started";
};

/* =========================
   Component
========================= */
const EcrireResultat: React.FC<Props> = ({
  setPage,
  eleveConnecte,
  parcoursGlobaux = [],
  dossiersParcours = [],
  setParcoursActif,
}) => {
  const [loading, setLoading] = useState(true);
  const [screenError, setScreenError] = useState<string | null>(null);

  const [resolvedEleve, setResolvedEleve] = useState<EleveConnecte | null>(null);
  const [classeNom, setClasseNom] = useState<string | null>(null);

  const [parcoursData, setParcoursData] = useState<ParcoursRow[]>([]);
  const [foldersData, setFoldersData] = useState<FolderRow[]>([]);
  const [parcoursStats, setParcoursStats] = useState<Record<string, ParcoursStatRow>>({});

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");

  const groupId = resolvedEleve?.group_id ?? null;
  const studentId = resolvedEleve?.id ?? resolvedEleve?.uuid ?? null;
  const eleveNom = resolvedEleve?.display_name ?? "Élève";

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

    if (!baseEleve.code) {
      setResolvedEleve(baseEleve);
      setClasseNom(null);
      return baseEleve;
    }

    const rpc = await supabase.rpc("student_name_by_code", {
      p_code: baseEleve.code,
    });

    if (rpc.error || !rpc.data) {
      setResolvedEleve(baseEleve);
      setClasseNom(null);
      return baseEleve;
    }

    const row: RpcStudentRow = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;

    const merged: EleveConnecte = {
      ...baseEleve,
      id: row?.id ?? baseEleve.id,
      display_name: row?.name ?? baseEleve.display_name ?? null,
      group_id: row?.group_id ?? baseEleve.group_id ?? null,
    };

    let groupName: string | null = null;

    if (merged.group_id) {
      const { data: groupData, error: groupError } = await supabase
        .from("groups")
        .select("id, name, nom")
        .eq("id", merged.group_id)
        .maybeSingle();

      if (!groupError && groupData) {
        groupName = getDisplayName(groupData as GroupRow);
      }
    }

    setResolvedEleve(merged);
    setClasseNom(groupName);

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
      return;
    }

    const { data, error } = await supabase
      .from("eleve_parcours_stats")
      .select(
        "parcours_id,best_score,last_score,total_balises,tentatives_count,parcours_termine,best_points,last_points"
      )
      .eq("student_id", resolvedStudentId);

    if (error) {
      console.warn("Impossible de charger les stats parcours élève :", error);
      setParcoursStats({});
      return;
    }

    const map: Record<string, ParcoursStatRow> = {};
    ((data as ParcoursStatRow[]) || []).forEach((row) => {
      if (row?.parcours_id) map[String(row.parcours_id)] = row;
    });

    setParcoursStats(map);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
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

      await fetchParcoursStats(resolvedStudentId);

      setExpandedFolders(new Set());
    } catch (err: any) {
      console.error("Erreur EcrireResultat:", err);
      setScreenError(err?.message || "Impossible de charger les données.");
    } finally {
      setLoading(false);
    }
  }, [parcoursGlobaux, dossiersParcours, resolveEleveAndClasse, fetchParcoursStats]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

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

  const visibleNodes = useMemo(() => {
    if (!groupId) return [] as RenderedNode[];

    const nodes: RenderedNode[] = [];

    const buildTree = (folderId: string, depth: number) => {
      const folder = foldersData.find((f) => f.id === folderId);
      if (!folder) return;

      if (!isFolderVisibleForGroup(folder, groupId, foldersData, parcoursData)) return;

      nodes.push({
        ...folder,
        type: "folder",
        depth,
        displayName: getDisplayName(folder),
      });

      if (!expandedFolders.has(folderId)) return;

      const directParcours = getDirectParcours(folderId).filter((p) =>
        isParcoursVisibleForGroup(p, groupId)
      );

      directParcours.forEach((p) => {
        nodes.push({
          ...p,
          type: "parcours",
          depth: depth + 1,
          displayName: getDisplayName(p),
        });
      });

      const childFolders = getDirectFolders(folderId);
      childFolders.forEach((child) => buildTree(child.id, depth + 1));
    };

    getDirectFolders(null).forEach((folder) => buildTree(folder.id, 0));

    getDirectParcours(null)
      .filter((p) => isParcoursVisibleForGroup(p, groupId))
      .forEach((p) => {
        nodes.push({
          ...p,
          type: "parcours",
          depth: 0,
          displayName: getDisplayName(p),
        });
      });

    if (searchTerm.trim()) {
      const s = searchTerm.trim().toLowerCase();
      return nodes.filter((n) => n.displayName.toLowerCase().includes(s));
    }

    return nodes;
  }, [
    groupId,
    foldersData,
    parcoursData,
    expandedFolders,
    getDirectFolders,
    getDirectParcours,
    searchTerm,
  ]);

  const sourceDescription = useMemo(() => {
    if (!resolvedEleve) return "Aucun élève détecté";
    if (!groupId) return `Aucune classe détectée • ${eleveNom}`;
    if (!classeNom) return `Classe détectée • ${eleveNom}`;
    return `${classeNom} • ${eleveNom}`;
  }, [resolvedEleve, groupId, classeNom, eleveNom]);

  const handleOpenParcours = useCallback(
    (parcours: ParcoursRow) => {
      setParcoursActif?.(parcours);
      setPage("EcrireCodeBaliseEleve");
    },
    [setParcoursActif, setPage]
  );

  const renderNode = ({ item }: { item: RenderedNode }) => {
    const isFolder = item.type === "folder";
    const depth = Math.min(item.depth, 6);
    const offset = depth * 16;

    const stat = !isFolder ? parcoursStats[item.id] : null;
    const status = !isFolder ? getStatusFromStat(stat) : "not_started";

    const isCompleted = status === "completed";
    const isStarted = status === "started";

    const parcoursCardStyle = isCompleted
      ? styles.parcoursCardDone
      : isStarted
      ? styles.parcoursCardStarted
      : styles.parcoursCard;

    const iconColors = isFolder
      ? ["#1E3A8A", "#2563EB"]
      : isCompleted
      ? ["#16A34A", "#22C55E"]
      : isStarted
      ? ["#F59E0B", "#FB923C"]
      : ["#7C3AED", "#2563EB"];

    const rightIcon = isFolder
      ? expandedFolders.has(item.id)
        ? "chevron-down"
        : "chevron-right"
      : isCompleted
      ? "check-circle"
      : isStarted
      ? "clock"
      : "arrow-right-circle";

    const rightColor = isFolder
      ? C_MUTED
      : isCompleted
      ? "#86EFAC"
      : isStarted
      ? "#FDBA74"
      : "#FCD34D";

    const subtitle = isFolder
      ? "Dossier"
      : isCompleted
      ? "Parcours validé"
      : isStarted
      ? "Parcours commencé"
      : "Parcours";

    return (
      <View
        style={[
          styles.nodeCard,
          isFolder ? styles.folderCard : parcoursCardStyle,
          depth > 0 && {
            marginLeft: offset,
            borderLeftWidth: 4,
            borderLeftColor: isCompleted
              ? "rgba(34,197,94,0.55)"
              : isStarted
              ? "rgba(245,158,11,0.55)"
              : depth === 1
              ? "rgba(96,165,250,0.35)"
              : depth === 2
              ? "rgba(167,139,250,0.35)"
              : "rgba(245,158,11,0.35)",
          },
        ]}
      >
        <View style={styles.nodeRow}>
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.nodeLeft}
            onPress={() => {
              if (isFolder) toggleFolder(item.id);
              else handleOpenParcours(item as ParcoursRow);
            }}
          >
            <LinearGradient
              colors={iconColors as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.nodeIcon}
            >
              <Feather
                name={
                  isFolder
                    ? expandedFolders.has(item.id)
                      ? "folder-minus"
                      : "folder"
                    : isCompleted
                    ? "check"
                    : isStarted
                    ? "clock"
                    : "play"
                }
                size={16}
                color="#fff"
              />
            </LinearGradient>

            <View style={styles.nodeTextWrap}>
              <Text numberOfLines={1} style={styles.nodeTitle}>
                {item.displayName}
              </Text>
              <Text style={styles.nodeSubtitle}>{subtitle}</Text>
            </View>

            <Feather name={rightIcon as any} size={18} color={rightColor} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={[C_BG, C_BG_2]} style={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.topBadge}>
            <Feather name="shield" size={18} color="#FDE68A" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.pageTitle}>Mes parcours</Text>
            <Text style={styles.pageSubtitle}>{sourceDescription}</Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setPage("AccueilEleve")}
            style={styles.topRightBtn}
          >
            <Feather name="home" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.heroCard}>
            <LinearGradient
              colors={["rgba(124,58,237,0.22)", "rgba(37,99,235,0.22)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroInner}
            >
              <Text style={styles.heroTitle}>Trouve le bon parcours</Text>
              <Text style={styles.heroText}>
                Choisis un parcours puis saisis les codes des balises.
              </Text>

              <View style={styles.searchBox}>
                <Feather name="search" size={18} color={C_MUTED} />
                <TextInput
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                  placeholder="Rechercher un dossier ou un parcours..."
                  placeholderTextColor="#7C8DA8"
                  style={styles.searchInput}
                />
              </View>
            </LinearGradient>
          </View>

          {loading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="large" color={C_BLUE} />
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
              <Text style={styles.stateTitle}>Aucun parcours disponible</Text>
              <Text style={styles.stateText}>
                Aucun dossier ou parcours n’est associé à cette classe.
              </Text>
            </View>
          ) : (
            <View style={styles.listWrap}>
              <Text style={styles.sectionTitle}>Parcours disponibles</Text>
              <FlatList
                data={visibleNodes}
                keyExtractor={(item) => `${item.type}-${item.id}`}
                renderItem={renderNode}
                scrollEnabled={false}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              />
            </View>
          )}
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
};

export default EcrireResultat;

/* =========================
   Styles
========================= */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C_BG },
  container: { flex: 1 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 14 : 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(4,12,24,0.72)",
  },
  topBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,158,11,0.16)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.30)",
  },
  topRightBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  pageTitle: {
    color: C_TEXT,
    fontSize: 20,
    fontWeight: "900",
  },
  pageSubtitle: {
    color: C_MUTED,
    fontSize: 12,
    marginTop: 2,
    fontWeight: "700",
  },

  heroCard: {
    borderRadius: 22,
    overflow: "hidden",
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: C_CARD,
  },
  heroInner: { padding: 16 },
  heroTitle: {
    color: C_TEXT,
    fontSize: 18,
    fontWeight: "900",
  },
  heroText: {
    color: C_MUTED,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 14,
    fontWeight: "600",
  },

  searchBox: {
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: C_BORDER,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    color: C_TEXT,
    fontSize: 14,
    fontWeight: "700",
  },

  listWrap: {
    backgroundColor: "rgba(16,29,50,0.70)",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 18,
    padding: 10,
  },
  sectionTitle: {
    color: C_TEXT,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 10,
    paddingHorizontal: 2,
  },

  nodeCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  folderCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: "rgba(96,165,250,0.18)",
  },
  parcoursCard: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: "rgba(167,139,250,0.18)",
  },
  parcoursCardStarted: {
    backgroundColor: "rgba(245,158,11,0.13)",
    borderColor: "rgba(245,158,11,0.45)",
  },
  parcoursCardDone: {
    backgroundColor: "rgba(34,197,94,0.13)",
    borderColor: "rgba(34,197,94,0.48)",
  },

  nodeRow: {
    minHeight: 56,
    justifyContent: "center",
  },
  nodeLeft: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  nodeIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  nodeTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  nodeTitle: {
    color: C_TEXT,
    fontSize: 14,
    fontWeight: "800",
  },
  nodeSubtitle: {
    color: C_MUTED,
    fontSize: 11,
    marginTop: 2,
    fontWeight: "700",
  },

  stateCard: {
    backgroundColor: C_CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
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
  },
});