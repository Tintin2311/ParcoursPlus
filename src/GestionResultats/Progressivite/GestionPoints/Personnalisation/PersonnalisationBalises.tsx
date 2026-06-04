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
  TextInput,
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

type ViewMode = "balises" | "parcours";

type GroupRow = {
  id: string;
  nom?: string | null;
  name?: string | null;
  teacher_id?: string | null;
  professeur_id?: string | null;
  user_id?: string | null;
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
};

type ParcoursRow = {
  id: string;
  nom?: string | null;
  name?: string | null;
  balises_ordre?: any;
  folder_id?: string | null;
  parent_parcours_folders_id?: string | null;
  groupes_associes?: any;
  teacher_id?: string | null;
  professeur_id?: string | null;
  user_id?: string | null;
};

type BaliseRow = {
  id: string;
  code?: string | null;
  points?: number | string | null;
  numero_balise?: number | string | null;
  user_id?: string | null;
  teacher_id?: string | null;
  professeur_id?: string | null;
};

type GroupConfigRow = {
  id?: string;
  group_id?: string | null;
  professeur_id?: string | null;
  modes?: any;
  points_par_parcours?: number | string | null;
  parcours_bonus_mode?: string | null;
  parcours_bonus_overrides?: any;
  tentative_page_mode?: string | null;
  tentative_page_default?: number | string | null;
  tentative_page_assignments?: any;
  tentative_source_assignments?: any;
  balise_point_overrides?: any;
  updated_at?: string | null;
  [key: string]: any;
};

const C_BG = "#EEF3F7";
const C_HEADER = "#1F5B86";
const C_HEADER_BTN = "#2D6C97";
const C_CARD = "#FFFFFF";
const C_BORDER = "#C6D2DC";
const C_TEXT = "#233548";
const C_SUB = "#5F7386";
const C_BLUE = "#1D4ED8";
const C_BLUE_BG = "#D8ECFF";
const C_GREEN_BG = "#E7FBEF";
const C_GREEN = "#047857";

const LS_POINTS_SELECTED_GROUP_ID = "gestionPoints.selectedGroupId";

const getName = (row: any) => String(row?.nom ?? row?.name ?? "Sans nom");
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

const parseObject = (value: any): any => {
  if (!value) return {};
  if (typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const parseBalisesOrdre = (value: any): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).map((v) => v.trim()).filter(Boolean);
    } catch {}
    return value.split(/[;,|]/g).map((v) => v.trim()).filter(Boolean);
  }
  return [];
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

const parcoursBelongsToGroup = (parcours: ParcoursRow, groupId: string | null) => {
  if (!groupId) return true;
  return extractGroupIds(parcours.groupes_associes).includes(String(groupId));
};

const readStoredGroupId = async () => {
  const asyncValue = await AsyncStorage.getItem(LS_POINTS_SELECTED_GROUP_ID);
  if (asyncValue) return asyncValue;
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.localStorage.getItem(LS_POINTS_SELECTED_GROUP_ID);
  }
  return null;
};

const sanitizeBaliseOverrides = (value: any): Record<string, Record<string, number>> => {
  const obj = parseObject(value);
  const out: Record<string, Record<string, number>> = {};
  Object.entries(obj).forEach(([parcoursId, balisesValue]) => {
    const balisesObj = parseObject(balisesValue);
    const row: Record<string, number> = {};
    Object.entries(balisesObj).forEach(([baliseId, points]) => {
      const n = Number(points);
      if (baliseId && Number.isFinite(n)) row[baliseId] = n;
    });
    if (Object.keys(row).length > 0) out[parcoursId] = row;
  });
  return out;
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

const ensureBalisesMode = (modesValue: any) => {
  const modes = parseObject(modesValue);
  return {
    tentatives: !!modes.tentatives,
    parcours: !!modes.parcours,
    balises: true,
  };
};

async function resolveTeacherId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

export default function PersonnalisationBalises({ setPage }: Props) {
  const { width } = useWindowDimensions();

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showGroupPicker, setShowGroupPicker] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>("balises");
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [allParcours, setAllParcours] = useState<ParcoursRow[]>([]);
  const [parcours, setParcours] = useState<ParcoursRow[]>([]);
  const [balises, setBalises] = useState<BaliseRow[]>([]);
  const [configs, setConfigs] = useState<GroupConfigRow[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Record<string, number>>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const [selectedBaliseId, setSelectedBaliseId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedParcoursId, setSelectedParcoursId] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedGroupName = useMemo(() => {
    const group = groups.find((g) => String(g.id) === String(selectedGroupId));
    return group ? getName(group) : "Classe";
  }, [groups, selectedGroupId]);

  const baliseById = useMemo(() => new Map(balises.map((b) => [String(b.id), b])), [balises]);
  const baliseByNumero = useMemo(
    () => new Map(balises.filter((b) => b.numero_balise != null).map((b) => [String(b.numero_balise), b])),
    [balises]
  );
  const baliseByCode = useMemo(
    () => new Map(balises.filter((b) => b.code).map((b) => [String(b.code).trim(), b])),
    [balises]
  );

  const getBalisesForParcours = useCallback(
    (p: ParcoursRow) => {
      const used = new Set<string>();
      const rows: BaliseRow[] = [];
      parseBalisesOrdre(p.balises_ordre).forEach((token) => {
        const clean = String(token).trim();
        const found = baliseById.get(clean) ?? baliseByNumero.get(clean) ?? baliseByCode.get(clean);
        if (found && !used.has(String(found.id))) {
          used.add(String(found.id));
          rows.push(found);
        }
      });
      return rows;
    },
    [baliseByCode, baliseById, baliseByNumero]
  );

  const parcoursByBalise = useMemo(() => {
    const map: Record<string, ParcoursRow[]> = {};
    parcours.forEach((p) => {
      getBalisesForParcours(p).forEach((b) => {
        const id = String(b.id);
        if (!map[id]) map[id] = [];
        map[id].push(p);
      });
    });
    return map;
  }, [getBalisesForParcours, parcours]);

  const visibleBalises = useMemo(
    () => balises.filter((b) => (parcoursByBalise[String(b.id)] ?? []).length > 0),
    [balises, parcoursByBalise]
  );

  useEffect(() => {
    setSelectedBaliseId((prev) =>
      prev && visibleBalises.some((b) => b.id === prev) ? prev : visibleBalises[0]?.id ?? null
    );
  }, [visibleBalises]);

  const getAllFolderIdsInside = useCallback(
    (folderId: string) => {
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
      const ids = getAllFolderIdsInside(folderId);
      return parcours.filter((p) => {
        const folderId = parcoursFolderId(p);
        return !!folderId && ids.includes(folderId);
      });
    },
    [getAllFolderIdsInside, parcours]
  );

  const visibleFolders = useMemo(
    () =>
      folders
        .filter((folder) => !folderParentId(folder))
        .filter((folder) => getParcoursInFolder(folder.id).length > 0)
        .sort((a, b) => getName(a).localeCompare(getName(b))),
    [folders, getParcoursInFolder]
  );

  const parcoursInSelectedFolder = useMemo(
    () => (selectedFolderId ? getParcoursInFolder(selectedFolderId) : []),
    [getParcoursInFolder, selectedFolderId]
  );

  const selectedParcours = useMemo(
    () => parcours.find((p) => p.id === selectedParcoursId) ?? null,
    [parcours, selectedParcoursId]
  );

  const balisesForSelectedParcours = useMemo(
    () => (selectedParcours ? getBalisesForParcours(selectedParcours) : []),
    [getBalisesForParcours, selectedParcours]
  );

  const getBasePoints = (balise: BaliseRow) => Number(balise.points ?? 0) || 0;
  const getEffectivePoints = (parcoursId: string, balise: BaliseRow) =>
    overrides[parcoursId]?.[String(balise.id)] ?? getBasePoints(balise);
  const draftKey = (parcoursId: string, baliseId: string) => `${parcoursId}:${baliseId}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const authTeacherId = await resolveTeacherId();
      setTeacherId(authTeacherId);
      if (!authTeacherId) throw new Error("Professeur introuvable.");

      const storedGroupId = await readStoredGroupId();
      const [groupsRes, foldersRes, parcoursRes, balisesRes, configsRes] = await Promise.all([
        supabase.from("groups").select("*").order("created_at", { ascending: true }),
        supabase.from("parcours_folders").select("*").order("ordre", { ascending: true }),
        supabase.from("parcours").select("*").order("ordre", { ascending: true }),
        supabase.from("balises").select("*").order("numero_balise", { ascending: true }),
        supabase
          .from("group_points_configs")
          .select("*")
          .eq("professeur_id", authTeacherId)
          .order("updated_at", { ascending: false, nullsFirst: false }),
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (foldersRes.error) throw foldersRes.error;
      if (parcoursRes.error) throw parcoursRes.error;
      if (balisesRes.error) throw balisesRes.error;
      if (configsRes.error) throw configsRes.error;

      const nextGroups = ((groupsRes.data ?? []) as GroupRow[]).filter((g) =>
        rowBelongsToTeacher(g, authTeacherId)
      );
      const nextConfigs = (configsRes.data ?? []) as GroupConfigRow[];
      const targetGroupId =
        storedGroupId && nextGroups.some((g) => String(g.id) === String(storedGroupId))
          ? storedGroupId
          : nextGroups[0]?.id ?? null;
      const currentConfig = getConfigForGroup(targetGroupId, nextConfigs);

      const nextFolders = ((foldersRes.data ?? []) as FolderRow[])
        .filter((f) => rowBelongsToTeacher(f, authTeacherId))
        .map((f) => ({ ...f, id: String(f.id) }));
      const nextAllParcours = ((parcoursRes.data ?? []) as ParcoursRow[])
        .filter((p) => rowBelongsToTeacher(p, authTeacherId))
        .map((p) => ({ ...p, id: String(p.id), nom: getName(p) }));
      const nextParcours = nextAllParcours.filter((p) => parcoursBelongsToGroup(p, targetGroupId));
      const nextBalises = ((balisesRes.data ?? []) as BaliseRow[])
        .filter((b) => rowBelongsToTeacher(b, authTeacherId))
        .map((b) => ({ ...b, id: String(b.id) }));

      setGroups(nextGroups);
      setSelectedGroupId(targetGroupId);
      setFolders(nextFolders);
      setAllParcours(nextAllParcours);
      setParcours(nextParcours);
      setBalises(nextBalises);
      setConfigs(nextConfigs);
      setOverrides(sanitizeBaliseOverrides(currentConfig?.balise_point_overrides));
      setSelectedBaliseId((prev) =>
        prev && nextBalises.some((b) => b.id === prev) ? prev : nextBalises[0]?.id ?? null
      );
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible de charger les données.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const currentConfig = getConfigForGroup(selectedGroupId, configs);
    setOverrides(sanitizeBaliseOverrides(currentConfig?.balise_point_overrides));
    setParcours(allParcours.filter((p) => parcoursBelongsToGroup(p, selectedGroupId)));
    setSelectedBaliseId(null);
    setSelectedFolderId(null);
    setSelectedParcoursId(null);
    if (selectedGroupId) {
      AsyncStorage.setItem(LS_POINTS_SELECTED_GROUP_ID, selectedGroupId).catch(() => null);
    }
  }, [allParcours, configs, selectedGroupId]);

  const recalculerParcours = async (parcoursId: string) => {
    if (!selectedGroupId) return;

    const { data: studentsData, error: studentsError } = await supabase
      .from("students")
      .select("id")
      .eq("group_id", selectedGroupId);

    if (studentsError) throw studentsError;

    const studentIds = ((studentsData ?? []) as any[])
      .map((row) => String(row?.id ?? ""))
      .filter(Boolean);

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

  const saveValue = async (parcoursId: string, balise: BaliseRow) => {
    if (!teacherId || !selectedGroupId) return;
    const baliseId = String(balise.id);
    const key = draftKey(parcoursId, baliseId);
    const raw = (drafts[key] ?? String(getEffectivePoints(parcoursId, balise))).replace(",", ".");
    const nextPoints = Number(raw);
    if (!Number.isFinite(nextPoints)) {
      Alert.alert("Valeur invalide", "Entre un nombre valide.");
      return;
    }

    setSavingKey(key);
    try {
      const current = getConfigForGroup(selectedGroupId, configs);
      const nextOverrides = sanitizeBaliseOverrides(current?.balise_point_overrides);
      nextOverrides[parcoursId] = {
        ...(nextOverrides[parcoursId] ?? {}),
        [baliseId]: nextPoints,
      };

      const payload = {
        group_id: selectedGroupId,
        professeur_id: teacherId,
        modes: ensureBalisesMode(current?.modes),
        points_par_parcours: current?.points_par_parcours ?? 0,
        parcours_bonus_mode: current?.parcours_bonus_mode ?? "general",
        parcours_bonus_overrides: current?.parcours_bonus_overrides ?? {},
        tentative_page_mode: current?.tentative_page_mode ?? "general",
        tentative_page_default: current?.tentative_page_default ?? null,
        tentative_page_assignments: current?.tentative_page_assignments ?? {},
        tentative_source_assignments: current?.tentative_source_assignments ?? {},
        balise_point_overrides: nextOverrides,
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

      setOverrides(nextOverrides);
      setConfigs((prev) => {
        const exists = prev.some((cfg) => String(cfg.group_id) === String(selectedGroupId));
        const nextRow = { ...(current ?? {}), ...payload };
        return exists
          ? prev.map((cfg) => (String(cfg.group_id) === String(selectedGroupId) ? nextRow : cfg))
          : [...prev, nextRow];
      });
      await recalculerParcours(parcoursId);
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible d'enregistrer.");
    } finally {
      setSavingKey(null);
    }
  };

  const renderPointsInput = (parcoursId: string, balise: BaliseRow) => {
    const baliseId = String(balise.id);
    const key = draftKey(parcoursId, baliseId);
    const saving = savingKey === key;
    return (
      <View style={styles.pointsControl}>
        <TextInput
          value={drafts[key] ?? String(getEffectivePoints(parcoursId, balise))}
          onChangeText={(txt) =>
            setDrafts((prev) => ({ ...prev, [key]: txt.replace(/[^0-9.,-]/g, "") }))
          }
          keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "numeric"}
          style={styles.pointsInput}
        />
        <Text style={styles.pointsUnit}>pts</Text>
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.saveMiniBtn}
          onPress={() => saveValue(parcoursId, balise)}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Feather name="check" size={16} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderBalisesView = () => {
    const selectedBalise = balises.find((b) => b.id === selectedBaliseId) ?? null;
    const usedIn = selectedBalise ? parcoursByBalise[String(selectedBalise.id)] ?? [] : [];

    return (
      <>
        <View style={styles.gridCard}>
          {visibleBalises.map((balise) => {
            const active = balise.id === selectedBaliseId;
            return (
              <TouchableOpacity
                key={balise.id}
                activeOpacity={0.9}
                style={[styles.baliseTile, active && styles.baliseTileActive]}
                onPress={() => setSelectedBaliseId(balise.id)}
              >
                <Text style={[styles.baliseTileText, active && styles.baliseTileTextActive]}>
                  {balise.numero_balise ?? "?"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            {selectedBalise ? `Balise ${selectedBalise.numero_balise ?? ""}` : "Balise"}
          </Text>
          {usedIn.length === 0 ? (
            <Text style={styles.emptyText}>Aucun parcours pour cette balise.</Text>
          ) : (
            usedIn.map((p) => (
              <View key={p.id} style={styles.rowCard}>
                <Feather name="map" size={18} color={C_BLUE} />
                <Text style={styles.rowTitle} numberOfLines={1}>{getName(p)}</Text>
                {selectedBalise ? renderPointsInput(p.id, selectedBalise) : null}
              </View>
            ))
          )}
        </View>
      </>
    );
  };

  const renderParcoursView = () => (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Dossiers</Text>
      {visibleFolders.map((folder) => {
        const open = selectedFolderId === folder.id;
        const childParcours = getParcoursInFolder(folder.id);
        return (
          <View key={folder.id}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.folderRow, open && styles.folderRowActive]}
              onPress={() => {
                setSelectedFolderId((prev) => (prev === folder.id ? null : folder.id));
                setSelectedParcoursId(null);
              }}
            >
              <Feather name="folder" size={20} color={C_BLUE} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{getName(folder)}</Text>
                <Text style={styles.rowSub}>{childParcours.length} parcours</Text>
              </View>
            </TouchableOpacity>

            {open ? (
              <View style={styles.folderDetails}>
                {childParcours.map((p) => {
                  const active = selectedParcoursId === p.id;
                  const courseBalises = getBalisesForParcours(p);
                  return (
                    <View key={p.id}>
                      <TouchableOpacity
                        activeOpacity={0.9}
                        style={[styles.parcoursRow, active && styles.parcoursRowActive]}
                        onPress={() => setSelectedParcoursId((prev) => (prev === p.id ? null : p.id))}
                      >
                        <Feather name="map" size={17} color={C_GREEN} />
                        <Text style={styles.rowTitle} numberOfLines={1}>{getName(p)}</Text>
                      </TouchableOpacity>

                      {active ? (
                        <View style={styles.balisesInParcours}>
                          {courseBalises.map((balise) => (
                            <View key={balise.id} style={styles.rowCardCompact}>
                              <Text style={styles.baliseInlineTitle}>
                                Balise {balise.numero_balise ?? "?"}
                              </Text>
                              {renderPointsInput(p.id, balise)}
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => setPage("gestionPoints")} activeOpacity={0.9}>
          <Feather name="arrow-left" size={21} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTextBox}>
          <Text style={styles.headerTitle}>Balises</Text>
          <Text style={styles.headerSub}>{selectedGroupName} • Points personnalisés</Text>
        </View>
        <TouchableOpacity
          style={styles.topIconBtn}
          activeOpacity={0.9}
          onPress={() =>
            Alert.alert(
              "Balises",
              "Choisis une classe et un mode visuel. Les points sont personnalisés pour un parcours précis."
            )
          }
        >
          <Feather name="info" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: width >= 900 ? 24 : 14 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topControls}>
          <TouchableOpacity style={styles.classBtn} onPress={() => setShowGroupPicker(true)} activeOpacity={0.9}>
            <Feather name="users" size={16} color={C_HEADER} />
            <Text style={styles.classBtnText}>{selectedGroupName}</Text>
            <Feather name="chevron-down" size={16} color={C_HEADER} />
          </TouchableOpacity>

          <View style={styles.segmented}>
            <TouchableOpacity
              style={[styles.segmentBtn, viewMode === "balises" && styles.segmentBtnActive]}
              onPress={() => setViewMode("balises")}
            >
              <Text style={[styles.segmentText, viewMode === "balises" && styles.segmentTextActive]}>Balises</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, viewMode === "parcours" && styles.segmentBtnActive]}
              onPress={() => setViewMode("parcours")}
            >
              <Text style={[styles.segmentText, viewMode === "parcours" && styles.segmentTextActive]}>Parcours</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={C_BLUE} />
            <Text style={styles.emptyText}>Chargement...</Text>
          </View>
        ) : viewMode === "balises" ? (
          renderBalisesView()
        ) : (
          renderParcoursView()
        )}
      </ScrollView>

      <Modal transparent animationType="fade" visible={showGroupPicker} onRequestClose={() => setShowGroupPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choisir la classe</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowGroupPicker(false)}>
                <Feather name="x" size={18} color={C_TEXT} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              {groups.map((group) => {
                const active = group.id === selectedGroupId;
                return (
                  <TouchableOpacity
                    key={group.id}
                    style={[styles.modalOption, active && styles.modalOptionActive]}
                    onPress={() => {
                      setSelectedGroupId(group.id);
                      setShowGroupPicker(false);
                    }}
                  >
                    <Text style={[styles.modalOptionText, active && styles.modalOptionTextActive]}>{getName(group)}</Text>
                    {active ? <Feather name="check" size={18} color={C_HEADER} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C_BG },
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
  topIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: C_HEADER_BTN,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextBox: { flex: 1 },
  headerTitle: { color: "#FFFFFF", fontSize: 21, fontWeight: "900" },
  headerSub: { color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: "700", marginTop: 2 },
  content: { paddingTop: 14, paddingBottom: 40, gap: 12 },
  topControls: {
    backgroundColor: C_CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 12,
    gap: 10,
  },
  classBtn: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 12,
  },
  classBtnText: { color: C_TEXT, fontWeight: "900", fontSize: 13 },
  segmented: { flexDirection: "row", gap: 8 },
  segmentBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: C_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentBtnActive: { backgroundColor: C_HEADER, borderColor: C_HEADER },
  segmentText: { color: C_SUB, fontWeight: "900", fontSize: 12 },
  segmentTextActive: { color: "#FFFFFF" },
  card: {
    backgroundColor: C_CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 16,
  },
  gridCard: {
    backgroundColor: C_CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sectionTitle: { color: C_TEXT, fontSize: 16, fontWeight: "900", marginBottom: 12 },
  baliseTile: {
    width: 54,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  baliseTileActive: { backgroundColor: C_BLUE_BG, borderColor: "rgba(29,78,216,0.30)" },
  baliseTileText: { color: C_TEXT, fontSize: 16, fontWeight: "900" },
  baliseTileTextActive: { color: C_BLUE },
  rowCard: {
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowCardCompact: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowTitle: { flex: 1, color: C_TEXT, fontSize: 14, fontWeight: "900" },
  rowSub: { color: C_SUB, fontSize: 12, fontWeight: "700", marginTop: 2 },
  folderRow: {
    minHeight: 68,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  folderRowActive: { backgroundColor: C_BLUE_BG, borderColor: "rgba(29,78,216,0.25)" },
  folderDetails: {
    marginLeft: 22,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: C_BORDER,
    gap: 8,
    marginBottom: 10,
  },
  parcoursRow: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  parcoursRowActive: { backgroundColor: C_GREEN_BG, borderColor: "rgba(4,120,87,0.20)" },
  balisesInParcours: { gap: 7, marginLeft: 22, marginTop: 7, marginBottom: 8 },
  baliseInlineTitle: { flex: 1, color: C_TEXT, fontSize: 13, fontWeight: "900" },
  pointsControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pointsInput: {
    width: 58,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(29,78,216,0.22)",
    backgroundColor: "#F8FAFC",
    color: C_TEXT,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "900",
    paddingHorizontal: 4,
    paddingVertical: 0,
  },
  pointsUnit: { color: C_TEXT, fontSize: 12, fontWeight: "900" },
  saveMiniBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C_HEADER,
    alignItems: "center",
    justifyContent: "center",
  },
  stateCard: {
    backgroundColor: C_CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 20,
    alignItems: "center",
  },
  emptyText: { color: C_SUB, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.32)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
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
  modalTitle: { color: C_TEXT, fontSize: 17, fontWeight: "900" },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(15,23,42,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalOption: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalOptionActive: { backgroundColor: C_BLUE_BG, borderColor: "rgba(29,78,216,0.25)" },
  modalOptionText: { color: C_TEXT, fontSize: 14, fontWeight: "900" },
  modalOptionTextActive: { color: C_HEADER },
});
