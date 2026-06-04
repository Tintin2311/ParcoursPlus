// PersonnalisationTentatives.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../../../../supabaseClient";

type Props = {
  setPage: (page: string) => void;
  professeur?: any;
};

type ParcoursRow = {
  id: string;
  nom?: string | null;
  name?: string | null;
  teacher_id?: string | null;
  professeur_id?: string | null;
  user_id?: string | null;
  folder_id?: string | null;
  parent_parcours_folders_id?: string | null;
  created_at?: string | null;
  ordre?: number | null;
  groupes_associes?: any;
};

type FolderRow = {
  id: string;
  nom?: string | null;
  name?: string | null;
  parent_folder_id?: string | null;
  parent_parcours_folders_id?: string | null;
  teacher_id?: string | null;
  professeur_id?: string | null;
  user_id?: string | null;
  ordre?: number | null;
};

type BaremePageRow = {
  id: string;
  teacher_id: string;
  page_number: number;
  page_name: string;
  created_at?: string | null;
};

type GroupRow = {
  id: string;
  name?: string | null;
  nom?: string | null;
  teacher_id?: string | null;
  professeur_id?: string | null;
  user_id?: string | null;
};

type GroupConfigRow = {
  id?: string;
  group_id?: string | null;
  professeur_id?: string | null;
  modes?: any;
  points_par_parcours?: number | string | null;
  parcours_bonus_mode?: "general" | "personnalise" | string | null;
  tentative_page_mode?: "general" | "personnalise" | string | null;
  tentative_page_default?: number | string | null;
  tentative_page_assignments?: any;
  tentative_source_assignments?: any;
  updated_at?: string | null;
  [key: string]: any;
};

const C_BG = "#F3F0FF";
const C_HEADER = "#1F5B86";
const C_HEADER_BTN = "#2D6C97";
const C_CARD = "#FFFFFF";
const C_BORDER = "#D8D0F0";
const C_TEXT = "#233548";
const C_SUB = "#5F7386";
const C_PURPLE = "#7C3AED";
const C_PURPLE_BG = "#EDE9FE";

const PURPLE_FROM = "#EDE9FE";
const PURPLE_TO = "#C4B5FD";
const BLUE_FROM = "#D8ECFF";
const BLUE_TO = "#A8D8F5";

const LS_POINTS_SELECTED_GROUP_ID = "gestionPoints.selectedGroupId";

const getDisplayName = (row: any) => String(row?.nom ?? row?.name ?? "Sans nom");
const folderName = (folder: FolderRow) => String(folder.nom ?? folder.name ?? "Sans nom");
const folderParentId = (folder: FolderRow) =>
  folder.parent_folder_id ?? folder.parent_parcours_folders_id ?? null;
const parcoursFolderId = (parcours: ParcoursRow) =>
  parcours.folder_id ?? parcours.parent_parcours_folders_id ?? null;

const uniqueIds = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));

const rowBelongsToTeacher = (row: any, teacherId: string | null) => {
  if (!teacherId) return false;
  const owners = uniqueIds([row?.teacher_id, row?.professeur_id, row?.user_id]);
  if (owners.length === 0) return true;
  return owners.includes(String(teacherId));
};

const parseJsonObject = (value: any): any => {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const sanitizeAssignments = (value: any): Record<string, number> => {
  const obj = parseJsonObject(value);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};

  const out: Record<string, number> = {};
  Object.entries(obj).forEach(([k, v]) => {
    const n = Number(v);
    if (k && Number.isFinite(n) && n >= 1) out[k] = n;
  });
  return out;
};

const extractIdFromAny = (value: any): string[] => {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number") {
    const id = String(value).trim();
    return id ? [id] : [];
  }
  if (Array.isArray(value)) return value.flatMap(extractIdFromAny);
  if (typeof value === "object") {
    return uniqueIds([value.id, value.group_id, value.groupId, value.classe_id, value.classeId, value.value]);
  }
  return [];
};

const extractGroupIds = (value: any): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return uniqueIds(value.flatMap(extractIdFromAny));
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];
    try {
      return uniqueIds(extractIdFromAny(JSON.parse(raw)));
    } catch {
      return raw.replace(/[{}\[\]"]/g, "").split(",").map((v) => v.trim()).filter(Boolean);
    }
  }
  return uniqueIds(extractIdFromAny(value));
};

const parcoursBelongsToGroup = (p: ParcoursRow, groupId: string | null) => {
  if (!groupId) return true;
  return extractGroupIds(p.groupes_associes).includes(String(groupId));
};

const readStoredGroupId = async () => {
  const asyncValue = await AsyncStorage.getItem(LS_POINTS_SELECTED_GROUP_ID);
  if (asyncValue) return asyncValue;

  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.localStorage.getItem(LS_POINTS_SELECTED_GROUP_ID);
  }

  return null;
};

const getConfigForGroup = (groupId: string | null, configs: GroupConfigRow[]) => {
  if (!groupId) return null;

  return configs
    .filter((cfg) => cfg.group_id && String(cfg.group_id) === String(groupId))
    .sort((a, b) => {
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tb - ta;
    })[0] ?? null;
};

const ensureTentativesMode = (modesValue: any) => {
  const modes = parseJsonObject(modesValue);
  return {
    tentatives: true,
    balises: modes.balises !== false,
    parcours: !!modes.parcours,
  };
};

async function resolveTeacherId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

export default function PersonnalisationTentatives({ setPage }: Props) {
  const { width } = useWindowDimensions();

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState("Classe cible");
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [parcours, setParcours] = useState<ParcoursRow[]>([]);
  const [baremes, setBaremes] = useState<BaremePageRow[]>([]);
  const [groupConfigs, setGroupConfigs] = useState<GroupConfigRow[]>([]);
  const [generalPageNumber, setGeneralPageNumber] = useState<number | null>(null);

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedParcoursId, setSelectedParcoursId] = useState<string | null>(null);
  const [selectedPageNumber, setSelectedPageNumber] = useState<number | null>(null);
  const [showPagePicker, setShowPagePicker] = useState(false);
  const [pagePickerTarget, setPagePickerTarget] = useState<
    { type: "folder" | "parcours"; id: string } | null
  >(null);

  const [existingConfigs, setExistingConfigs] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedParcours = useMemo(
    () => parcours.find((p) => p.id === selectedParcoursId) ?? null,
    [parcours, selectedParcoursId]
  );

  const getAllFolderIdsInside = useCallback(
    (folderId: string): string[] => {
      const result = [folderId];
      const walk = (parentId: string) => {
        folders
          .filter((folder) => folderParentId(folder) === parentId)
          .forEach((child) => {
            result.push(child.id);
            walk(child.id);
          });
      };
      walk(folderId);
      return result;
    },
    [folders]
  );

  const getParcoursInFolder = useCallback(
    (folderId: string) => {
      const folderIds = getAllFolderIdsInside(folderId);
      return parcours.filter((p) => {
        const folderId = parcoursFolderId(p);
        return !!folderId && folderIds.includes(folderId);
      });
    },
    [getAllFolderIdsInside, parcours]
  );

  const getEffectivePageNumber = useCallback(
    (parcoursId: string) =>
      existingConfigs[parcoursId] ?? generalPageNumber ?? baremes[0]?.page_number ?? null,
    [baremes, existingConfigs, generalPageNumber]
  );

  const getFolderEffectivePageNumber = useCallback(
    (folderId: string) => {
      const children = getParcoursInFolder(folderId);
      if (children.length === 0) return generalPageNumber ?? baremes[0]?.page_number ?? null;
      const values = children.map((p) => getEffectivePageNumber(p.id));
      const first = values[0] ?? null;
      const allSame = values.every((value) => Number(value) === Number(first));
      return allSame ? first : null;
    },
    [baremes, generalPageNumber, getEffectivePageNumber, getParcoursInFolder]
  );

  const visibleFolders = useMemo(
    () =>
      [...folders]
        .filter((folder) => !folderParentId(folder))
        .filter((folder) => getParcoursInFolder(folder.id).length > 0)
        .sort((a, b) => folderName(a).localeCompare(folderName(b))),
    [folders, getParcoursInFolder]
  );

  const parcoursInSelectedFolder = useMemo(
    () => (selectedFolderId ? getParcoursInFolder(selectedFolderId) : []),
    [getParcoursInFolder, selectedFolderId]
  );

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const authTeacherId = await resolveTeacherId();
      setTeacherId(authTeacherId);

      if (!authTeacherId) {
        Alert.alert("Erreur", "Impossible de retrouver le professeur connecté.");
        return;
      }

      const storedGroupId = await readStoredGroupId();

      const [groupsRes, foldersRes, parcoursRes, baremesRes, configsRes] = await Promise.all([
        supabase
          .from("groups")
          .select("*")
          .eq("teacher_id", authTeacherId)
          .order("created_at", { ascending: true }),

        supabase
          .from("parcours_folders")
          .select("*")
          .order("ordre", { ascending: true }),

        supabase
          .from("parcours")
          .select("*")
          .order("ordre", { ascending: true }),

        supabase
          .from("group_tentative_bareme_pages")
          .select("id, teacher_id, page_number, page_name, created_at")
          .eq("teacher_id", authTeacherId)
          .order("page_number", { ascending: true }),

        supabase
          .from("group_points_configs")
          .select("*")
          .eq("professeur_id", authTeacherId)
          .order("updated_at", { ascending: false, nullsFirst: false }),
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (foldersRes.error) throw foldersRes.error;
      if (parcoursRes.error) throw parcoursRes.error;
      if (baremesRes.error) throw baremesRes.error;
      if (configsRes.error) throw configsRes.error;

      const groups = ((groupsRes.data ?? []) as GroupRow[]).filter((g) =>
        rowBelongsToTeacher(g, authTeacherId)
      );
      const storedGroupIsValid =
        !!storedGroupId && groups.some((g) => String(g.id) === String(storedGroupId));
      const targetGroupId = storedGroupIsValid ? storedGroupId : groups[0]?.id ?? null;
      const targetGroup = groups.find((g) => String(g.id) === String(targetGroupId)) ?? null;
      const nextGroupConfigs = (configsRes.data ?? []) as GroupConfigRow[];
      const currentConfig = getConfigForGroup(targetGroupId, nextGroupConfigs);
      const assignments = sanitizeAssignments(currentConfig?.tentative_page_assignments);
      const defaultPage =
        currentConfig?.tentative_page_default == null
          ? null
          : Number(currentConfig.tentative_page_default) || null;
      const nextFolders = ((foldersRes.data ?? []) as FolderRow[])
        .filter((f) => rowBelongsToTeacher(f, authTeacherId))
        .map((f) => ({ ...f, id: String(f.id) }));

      const nextParcours = ((parcoursRes.data ?? []) as ParcoursRow[])
        .filter((p) => rowBelongsToTeacher(p, authTeacherId))
        .filter((p) => parcoursBelongsToGroup(p, targetGroupId))
        .map((p) => ({
          ...p,
          id: String(p.id),
          nom: getDisplayName(p),
        }));

      const nextBaremes = ((baremesRes.data ?? []) as any[]).map((b) => ({
        id: String(b.id),
        teacher_id: String(b.teacher_id),
        page_number: Number(b.page_number ?? 1),
        page_name: String(b.page_name || `Barème ${Number(b.page_number ?? 1)}`),
        created_at: b.created_at ?? null,
      })) as BaremePageRow[];

      setSelectedGroupId(targetGroupId);
      setSelectedGroupName(targetGroup ? getDisplayName(targetGroup) : "Classe cible");
      setGroupConfigs(nextGroupConfigs);
      setFolders(nextFolders);
      setParcours(nextParcours);
      setBaremes(nextBaremes);
      setExistingConfigs(assignments);
      setGeneralPageNumber(defaultPage ?? nextBaremes[0]?.page_number ?? null);

      const firstParcoursId = nextParcours[0]?.id ?? null;
      setSelectedParcoursId((prev) =>
        prev && nextParcours.some((p) => p.id === prev) ? prev : firstParcoursId
      );

      const initialPage =
        firstParcoursId && assignments[firstParcoursId]
          ? assignments[firstParcoursId]
          : defaultPage ?? nextBaremes[0]?.page_number ?? null;

      setSelectedPageNumber((prev) =>
        prev && nextBaremes.some((b) => b.page_number === prev) ? prev : initialPage
      );
    } catch (e: any) {
      console.error("Erreur chargement PersonnalisationTentatives :", e);
      Alert.alert("Erreur", e?.message || "Impossible de charger les données.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!selectedParcoursId) return;

    const existing = existingConfigs[selectedParcoursId];
    if (existing && baremes.some((b) => b.page_number === existing)) {
      setSelectedPageNumber(existing);
      return;
    }

    setSelectedPageNumber((prev) => {
      if (prev && baremes.some((b) => b.page_number === prev)) return prev;
      return generalPageNumber ?? baremes[0]?.page_number ?? null;
    });
  }, [baremes, existingConfigs, generalPageNumber, selectedParcoursId]);

  const updateConfigLocal = (groupId: string, patch: Partial<GroupConfigRow>) => {
    setGroupConfigs((prev) => {
      const now = new Date().toISOString();
      const found = prev.some((cfg) => String(cfg.group_id) === String(groupId));
      const next = prev.map((cfg) =>
        String(cfg.group_id) === String(groupId) ? { ...cfg, ...patch, updated_at: now } : cfg
      );
      if (found) return next;
      return [
        ...next,
        {
          group_id: groupId,
          professeur_id: teacherId,
          modes: { balises: true, parcours: false, tentatives: true },
          points_par_parcours: 0,
          tentative_page_mode: "personnalise",
          tentative_page_default: generalPageNumber ?? baremes[0]?.page_number ?? 1,
          tentative_page_assignments: {},
          ...patch,
          updated_at: now,
        },
      ];
    });
  };

  const recalcParcoursForGroup = async (groupId: string, parcoursId: string) => {
    const { data: studentsData, error: studentsError } = await supabase
      .from("students")
      .select("id")
      .eq("group_id", groupId);

    if (studentsError) throw studentsError;

    const studentIds = ((studentsData ?? []) as any[])
      .map((row) => row.id)
      .filter(Boolean)
      .map(String);

    if (studentIds.length === 0) return;

    const [statsRes, attemptsRes] = await Promise.all([
      supabase
        .from("eleve_parcours_stats")
        .select("student_id, parcours_id")
        .in("student_id", studentIds)
        .eq("parcours_id", parcoursId),
      supabase
        .from("eleve_parcours_tentatives")
        .select("student_id, parcours_id")
        .in("student_id", studentIds)
        .eq("parcours_id", parcoursId),
    ]);

    if (statsRes.error) throw statsRes.error;
    if (attemptsRes.error) throw attemptsRes.error;

    const pairs = new Map<string, { student_id: string; parcours_id: string }>();
    [...((statsRes.data ?? []) as any[]), ...((attemptsRes.data ?? []) as any[])].forEach((row) => {
      if (!row?.student_id || !row?.parcours_id) return;
      pairs.set(`${row.student_id}:${row.parcours_id}`, {
        student_id: String(row.student_id),
        parcours_id: String(row.parcours_id),
      });
    });

    await Promise.all(
      Array.from(pairs.values()).map(async (row) => {
        const { error } = await supabase.rpc("recalculer_stats_eleve_parcours", {
          p_student_id: row.student_id,
          p_parcours_id: row.parcours_id,
        });
        if (error) throw error;
      })
    );
  };

  const handleSave = async () => {
    if (!teacherId || !selectedGroupId) {
      Alert.alert("Erreur", "Professeur introuvable.");
      return;
    }

    const targetParcoursIds = selectedParcoursId
      ? [selectedParcoursId]
      : selectedFolderId
      ? getParcoursInFolder(selectedFolderId).map((p) => p.id)
      : [];

    if (targetParcoursIds.length === 0) {
      Alert.alert("Erreur", "Choisis un dossier ou un parcours.");
      return;
    }

    if (!selectedPageNumber) {
      Alert.alert("Erreur", "Choisis un barème de tentatives.");
      return;
    }

    setSaving(true);

    try {
      const current = getConfigForGroup(selectedGroupId, groupConfigs);
      const nextAssignments = { ...sanitizeAssignments(current?.tentative_page_assignments) };
      targetParcoursIds.forEach((parcoursId) => {
        nextAssignments[parcoursId] = selectedPageNumber;
      });
      const payload = {
        group_id: selectedGroupId,
        professeur_id: teacherId,
        modes: ensureTentativesMode(current?.modes),
        points_par_parcours: current?.points_par_parcours ?? 0,
        parcours_bonus_mode: current?.parcours_bonus_mode ?? "general",
        tentative_page_mode: "personnalise" as const,
        tentative_page_default:
          current?.tentative_page_default ?? generalPageNumber ?? baremes[0]?.page_number ?? 1,
        tentative_page_assignments: nextAssignments,
        tentative_source_parcours_id: current?.tentative_source_parcours_id ?? null,
        tentative_source_assignments: current?.tentative_source_assignments ?? {},
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("group_points_configs")
        .update(payload)
        .eq("group_id", selectedGroupId)
        .eq("professeur_id", teacherId)
        .select("*");

      if (error) throw error;

      if (!data || data.length === 0) {
        const { error: insertError } = await supabase.from("group_points_configs").insert(payload);
        if (insertError) throw insertError;
      }

      await Promise.all(
        targetParcoursIds.map((parcoursId) => recalcParcoursForGroup(selectedGroupId, parcoursId))
      );

      setExistingConfigs(nextAssignments);
      updateConfigLocal(selectedGroupId, payload);

      Alert.alert(
        "Barème enregistré",
        selectedParcoursId
          ? "Ce parcours utilisera ce barème de tentatives personnalisé."
          : "Tous les parcours de ce dossier utiliseront ce barème de tentatives."
      );
    } catch (e: any) {
      console.error("Erreur sauvegarde PersonnalisationTentatives :", e);
      Alert.alert(
        "Erreur",
        e?.message || "Impossible d'enregistrer le barème personnalisé."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!teacherId || !selectedGroupId || (!selectedParcoursId && !selectedFolderId)) return;

    setSaving(true);

    try {
      const current = getConfigForGroup(selectedGroupId, groupConfigs);
      const nextAssignments = sanitizeAssignments(current?.tentative_page_assignments);
      const targetParcoursIds = selectedParcoursId
        ? [selectedParcoursId]
        : selectedFolderId
        ? getParcoursInFolder(selectedFolderId).map((p) => p.id)
        : [];
      targetParcoursIds.forEach((parcoursId) => {
        delete nextAssignments[parcoursId];
      });

      const payload = {
        group_id: selectedGroupId,
        professeur_id: teacherId,
        modes: ensureTentativesMode(current?.modes),
        points_par_parcours: current?.points_par_parcours ?? 0,
        parcours_bonus_mode: current?.parcours_bonus_mode ?? "general",
        tentative_page_mode:
          Object.keys(nextAssignments).length > 0 ? ("personnalise" as const) : ("general" as const),
        tentative_page_default:
          current?.tentative_page_default ?? generalPageNumber ?? baremes[0]?.page_number ?? 1,
        tentative_page_assignments: nextAssignments,
        tentative_source_parcours_id: current?.tentative_source_parcours_id ?? null,
        tentative_source_assignments: current?.tentative_source_assignments ?? {},
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("group_points_configs")
        .update(payload)
        .eq("group_id", selectedGroupId)
        .eq("professeur_id", teacherId);

      if (error) throw error;

      await Promise.all(
        targetParcoursIds.map((parcoursId) => recalcParcoursForGroup(selectedGroupId, parcoursId))
      );

      setExistingConfigs((prev) => {
        const next = { ...prev };
        targetParcoursIds.forEach((parcoursId) => {
          delete next[parcoursId];
        });
        return next;
      });
      updateConfigLocal(selectedGroupId, payload);

      setSelectedPageNumber(generalPageNumber ?? baremes[0]?.page_number ?? null);

      Alert.alert(
        "Personnalisation supprimée",
        selectedParcoursId
          ? "Ce parcours utilisera de nouveau le barème général."
          : "Les parcours de ce dossier utiliseront de nouveau le barème général."
      );
    } catch (e: any) {
      console.error("Erreur suppression personnalisation tentatives :", e);
      Alert.alert(
        "Erreur",
        e?.message || "Impossible de supprimer la personnalisation."
      );
    } finally {
      setSaving(false);
    }
  };

  const applyPickedPage = (pageNumber: number) => {
    if (pagePickerTarget?.type === "folder") {
      const targetFolderId = pagePickerTarget.id;
      const targetParcoursIds = getParcoursInFolder(targetFolderId).map((p) => p.id);

      setSelectedFolderId(targetFolderId);
      setSelectedParcoursId(null);
      setSelectedPageNumber(pageNumber);
      setExistingConfigs((prev) => {
        const next = { ...prev };
        targetParcoursIds.forEach((parcoursId) => {
          next[parcoursId] = pageNumber;
        });
        return next;
      });
    }

    if (pagePickerTarget?.type === "parcours") {
      const targetParcoursId = pagePickerTarget.id;

      setSelectedParcoursId(targetParcoursId);
      setSelectedPageNumber(pageNumber);
      setExistingConfigs((prev) => ({
        ...prev,
        [targetParcoursId]: pageNumber,
      }));
    }

    setShowPagePicker(false);
  };

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId]
  );

  const hasCustomConfig = selectedParcoursId
    ? existingConfigs[selectedParcoursId] != null
    : selectedFolderId
    ? getParcoursInFolder(selectedFolderId).some((p) => existingConfigs[p.id] != null)
    : false;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.backBtn}
          onPress={() => setPage("GestionPoints")}
        >
          <Feather name="arrow-left" size={21} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Tentatives</Text>
          <Text style={styles.headerSub}>{selectedGroupName} • Barèmes personnalisés</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C_PURPLE} />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingHorizontal: width >= 900 ? 24 : 14 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <LinearGradient
              colors={[PURPLE_FROM, PURPLE_TO]}
              style={styles.heroIcon}
            >
              <Feather name="target" size={30} color={C_PURPLE} />
            </LinearGradient>

            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>Personnalisation des tentatives</Text>
              <Text style={styles.heroText}>
                Choisis la page de barème utilisée par chaque parcours de la classe cible.
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>1. Choisir un dossier</Text>

            {visibleFolders.length === 0 ? (
              <Text style={styles.emptyText}>Aucun dossier trouvé pour cette classe.</Text>
            ) : (
              visibleFolders.map((folder) => {
                const open = selectedFolderId === folder.id;
                const folderParcours = getParcoursInFolder(folder.id);
                const folderPageNumber = open && selectedPageNumber
                  ? selectedPageNumber
                  : getFolderEffectivePageNumber(folder.id);
                const folderBareme =
                  baremes.find((b) => Number(b.page_number) === Number(folderPageNumber)) ?? null;

                return (
                  <View key={folder.id}>
                    <TouchableOpacity
                      activeOpacity={0.92}
                      onPress={() => {
                        setSelectedFolderId((prev) => (prev === folder.id ? null : folder.id));
                        setSelectedParcoursId(null);
                        setSelectedPageNumber(folderPageNumber);
                      }}
                      style={[styles.optionCard, open && styles.optionCardActive]}
                    >
                      <LinearGradient
                        colors={[BLUE_FROM, BLUE_TO]}
                        style={styles.optionIcon}
                      >
                        <Feather name="folder" size={20} color="#1D4ED8" />
                      </LinearGradient>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.optionTitle} numberOfLines={1}>
                          {folderName(folder)}
                        </Text>

                        <Text style={styles.optionSub} numberOfLines={1}>
                          {folderParcours.length} parcours concernés
                        </Text>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => {
                          setSelectedFolderId(folder.id);
                          setSelectedParcoursId(null);
                          setSelectedPageNumber(folderPageNumber ?? generalPageNumber ?? baremes[0]?.page_number ?? null);
                          setPagePickerTarget({ type: "folder", id: folder.id });
                          setShowPagePicker(true);
                        }}
                        style={styles.currentBaremeChip}
                      >
                        <Text style={styles.currentBaremeChipText} numberOfLines={1}>
                          {folderBareme?.page_name || "Pages mixtes"}
                        </Text>
                      </TouchableOpacity>
                    </TouchableOpacity>

                    {open ? (
                      <View style={styles.folderDetails}>
                        {parcoursInSelectedFolder.map((p) => {
                          const active = p.id === selectedParcoursId;
                          const effectivePageNumber =
                            active && selectedPageNumber
                              ? selectedPageNumber
                              : getEffectivePageNumber(p.id);
                          const effectiveBareme =
                            baremes.find((b) => Number(b.page_number) === Number(effectivePageNumber)) ??
                            null;

                          return (
                            <TouchableOpacity
                              key={p.id}
                              activeOpacity={0.9}
                              onPress={() => {
                                setSelectedParcoursId(p.id);
                                setSelectedPageNumber(effectivePageNumber);
                              }}
                              style={[styles.parcoursRow, active && styles.parcoursRowActive]}
                            >
                              <Feather name="map" size={17} color="#1D4ED8" />
                              <View style={{ flex: 1 }}>
                                <Text style={styles.parcoursRowTitle} numberOfLines={1}>
                                  {getDisplayName(p)}
                                </Text>
                              </View>
                              <TouchableOpacity
                                activeOpacity={0.9}
                                onPress={() => {
                                  setSelectedParcoursId(p.id);
                                  setSelectedPageNumber(effectivePageNumber);
                                  setPagePickerTarget({ type: "parcours", id: p.id });
                                  setShowPagePicker(true);
                                }}
                                style={styles.currentBaremeChipSmall}
                              >
                                <Text style={styles.currentBaremeChipText} numberOfLines={1}>
                                  {effectiveBareme?.page_name || "Aucune page"}
                                </Text>
                              </TouchableOpacity>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={!hasCustomConfig || saving}
              style={[styles.resetBtn, (!hasCustomConfig || saving) && { opacity: 0.45 }]}
              onPress={handleReset}
            >
              <Text style={styles.resetBtnText}>Réinitialiser</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.92}
              disabled={saving || (!selectedParcoursId && !selectedFolderId) || !selectedPageNumber}
              style={[
                styles.saveWrap,
                (saving || (!selectedParcoursId && !selectedFolderId) || !selectedPageNumber) && {
                  opacity: 0.55,
                },
              ]}
              onPress={handleSave}
            >
              <LinearGradient
                colors={[C_HEADER, "#2B7BB6"]}
                style={styles.saveBtn}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Feather name="save" size={18} color="#FFFFFF" />
                    <Text style={styles.saveText}>Enregistrer</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      <Modal
        transparent
        animationType="fade"
        visible={showPagePicker}
        onRequestClose={() => setShowPagePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choisir la page de tentative</Text>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setShowPagePicker(false)}
                style={styles.modalCloseBtn}
              >
                <Feather name="x" size={18} color={C_TEXT} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pagePickerList} showsVerticalScrollIndicator={false}>
              {baremes.map((b) => {
                const active = Number(selectedPageNumber) === Number(b.page_number);

                return (
                  <TouchableOpacity
                    key={b.id}
                    activeOpacity={0.9}
                    onPress={() => applyPickedPage(b.page_number)}
                    style={[
                      styles.pagePickerOption,
                      active && styles.pagePickerOptionActive,
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.pagePickerOptionTitle,
                          active && styles.pagePickerOptionTitleActive,
                        ]}
                        numberOfLines={1}
                      >
                        {b.page_name || `Page ${b.page_number}`}
                      </Text>
                      <Text
                        style={[
                          styles.pagePickerOptionSub,
                          active && styles.pagePickerOptionTitleActive,
                        ]}
                      >
                        page {b.page_number}
                      </Text>
                    </View>
                    {active ? <Feather name="check" size={18} color={C_PURPLE} /> : null}
                  </TouchableOpacity>
                );
              })}

              {baremes.length === 0 ? (
                <Text style={styles.emptyText}>Aucun barème de tentatives trouvé.</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C_BG,
  },

  header: {
    backgroundColor: C_HEADER,
    minHeight: 78,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: C_HEADER_BTN,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
  },

  headerSub: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: C_SUB,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 10,
  },

  content: {
    paddingTop: 14,
    paddingBottom: 60,
    gap: 14,
  },

  heroCard: {
    backgroundColor: C_CARD,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  heroTitle: {
    color: C_TEXT,
    fontSize: 18,
    fontWeight: "900",
  },

  heroText: {
    color: C_SUB,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 4,
  },

  card: {
    backgroundColor: C_CARD,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 16,
  },

  sectionTitle: {
    color: C_TEXT,
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 12,
  },

  optionCard: {
    minHeight: 70,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  optionCardActive: {
    backgroundColor: "#EFF6FF",
    borderColor: "rgba(29,78,216,0.28)",
  },

  optionIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  optionTitle: {
    color: C_TEXT,
    fontSize: 15,
    fontWeight: "900",
  },

  optionSub: {
    color: C_SUB,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },

  currentBaremeChip: {
    minWidth: 118,
    maxWidth: 170,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.32)",
    backgroundColor: C_PURPLE_BG,
    paddingHorizontal: 11,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },

  currentBaremeChipSmall: {
    minWidth: 104,
    maxWidth: 150,
    minHeight: 42,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.32)",
    backgroundColor: C_PURPLE_BG,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },

  currentBaremeChipText: {
    color: C_PURPLE,
    fontSize: 13,
    fontWeight: "900",
  },

  folderDetails: {
    marginTop: -2,
    marginBottom: 10,
    marginLeft: 28,
    borderLeftWidth: 2,
    borderLeftColor: C_BORDER,
    paddingLeft: 14,
    gap: 8,
  },

  parcoursRow: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(216,208,240,0.72)",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  parcoursRowActive: {
    backgroundColor: "#F8F5FF",
    borderColor: "rgba(124,58,237,0.28)",
  },

  parcoursRowTitle: {
    color: C_TEXT,
    fontSize: 13,
    fontWeight: "900",
  },

  emptyText: {
    color: C_SUB,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
  },

  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },

  resetBtn: {
    flex: 0.9,
    minHeight: 58,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: C_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },

  resetBtnText: {
    color: C_TEXT,
    fontSize: 14,
    fontWeight: "900",
  },

  saveWrap: {
    flex: 1.35,
  },

  saveBtn: {
    minHeight: 58,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },

  saveText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.30)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },

  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 14,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  modalTitle: {
    color: C_TEXT,
    fontSize: 17,
    fontWeight: "900",
  },

  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },

  pagePickerList: {
    maxHeight: 360,
  },

  pagePickerOption: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  pagePickerOptionActive: {
    borderColor: "rgba(124,58,237,0.34)",
    backgroundColor: C_PURPLE_BG,
  },

  pagePickerOptionTitle: {
    color: C_TEXT,
    fontSize: 14,
    fontWeight: "900",
  },

  pagePickerOptionTitleActive: {
    color: C_PURPLE,
  },

  pagePickerOptionSub: {
    color: C_SUB,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
});
