// PersonnalisationParcoursTermines.tsx

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  professeur?: { id?: string | null; user_id?: string | null } | null;
};

type FolderRow = {
  id: string;
  name?: string | null;
  nom?: string | null;
  parent_folder_id?: string | null;
  parent_parcours_folders_id?: string | null;
  user_id?: string | null;
  teacher_id?: string | null;
  professeur_id?: string | null;
  groupes_associes?: any;
  ordre?: number | null;
};

type ParcoursRow = {
  id: string;
  nom?: string | null;
  folder_id?: string | null;
  parent_parcours_folders_id?: string | null;
  user_id?: string | null;
  teacher_id?: string | null;
  professeur_id?: string | null;
  ordre?: number | null;
  groupes_associes?: any;
  bonus_points_personnalise?: number | null;
};

type GroupRow = {
  id: string;
  nom?: string | null;
  name?: string | null;
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
  parcours_bonus_mode?: "general" | "personnalise" | null;
  parcours_bonus_overrides?: any;
  tentative_source_assignments?: any;
  config?: any;
  settings_json?: any;
  updated_at?: string | null;
  [key: string]: any;
};

type BonusMode = "general" | "personnalise";

type ParcoursTermineBonusRow = {
  id?: string;
  professeur_id: string;
  group_id: string;
  parcours_id: string;
  points_personnalises: number | string;
  updated_at?: string | null;
};

const C_BG = "#EEF7F3";
const C_HEADER = "#1F5B86";
const C_CARD = "#FFFFFF";
const C_BORDER = "#D3E4DD";
const C_TEXT = "#233548";
const C_SUB = "#5F7386";

const GREEN_1 = "#D8FBE7";
const GREEN_2 = "#A7F3D0";
const ORANGE_1 = "#FFF3D6";
const ORANGE_2 = "#FFD58F";

const DEFAULT_GLOBAL_BONUS = 10;
const LS_POINTS_SELECTED_GROUP_ID = "gestionPoints.selectedGroupId";
const TABLE_PARCOURS_TERMINE_BONUSES = "personnaliser_parcours_termines";

const folderName = (f: FolderRow) => String(f.name || f.nom || "Sans nom").trim();
const parcoursName = (p: ParcoursRow) => String(p.nom || "Sans nom").trim();
const onlyDigits = (value: string) => value.replace(/[^0-9]/g, "");
const folderParentId = (f: FolderRow) => f.parent_folder_id ?? f.parent_parcours_folders_id ?? null;
const parcoursFolderId = (p: ParcoursRow) => p.folder_id ?? p.parent_parcours_folders_id ?? null;

const normalizeSearch = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const parseJsonObject = (value: any): any => {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const extractIdFromAny = (value: any): string[] => {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number") {
    const id = String(value).trim();
    return id ? [id] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(extractIdFromAny);
  }
  if (typeof value === "object") {
    return uniqueIds([
      value.id,
      value.group_id,
      value.groupId,
      value.classe_id,
      value.classeId,
      value.value,
    ]);
  }
  return [];
};

const extractGroupIds = (value: any): string[] => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return uniqueIds(value.flatMap(extractIdFromAny));
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      return uniqueIds(extractIdFromAny(parsed));
    } catch {
      // format texte simple
    }

    return raw
      .replace(/[{}\[\]"]/g, "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return uniqueIds(extractIdFromAny(value));
};

const modeParcoursIsActive = (modesValue: any) => {
  const modes = parseJsonObject(modesValue);
  return !!modes?.parcours;
};

const ensureParcoursMode = (modesValue: any) => {
  const modes = parseJsonObject(modesValue) ?? {};
  return {
    tentatives: !!modes.tentatives,
    balises: modes.balises !== false,
    parcours: true,
  };
};

const numberOrFallback = (value: any, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const isMissingTableError = (error: any) => {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("could not find the table");
};

const sanitizePointOverrides = (value: any): Record<string, number> => {
  const obj = parseJsonObject(value);
  const source =
    obj && typeof obj === "object" && !Array.isArray(obj)
      ? obj.parcours_bonus_overrides ?? obj
      : null;

  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const out: Record<string, number> = {};
  Object.entries(source).forEach(([k, v]) => {
    const n = Number(v);
    if (k && Number.isFinite(n) && n >= 0) out[k] = n;
  });

  return out;
};

const readParcoursBonusOverrides = (row?: GroupConfigRow | null): Record<string, number> => {
  if (!row) return {};
  const config = parseJsonObject(row.config);
  const settings = parseJsonObject(row.settings_json);
  const sourceAssignments = parseJsonObject(row.tentative_source_assignments);

  return {
    ...sanitizePointOverrides(settings?.parcours_bonus_overrides),
    ...sanitizePointOverrides(config?.parcours_bonus_overrides),
    ...sanitizePointOverrides(row.parcours_bonus_overrides),
    ...sanitizePointOverrides(sourceAssignments?.parcours_bonus_overrides),
  };
};

const readParcoursBonusMode = (row?: GroupConfigRow | null): BonusMode => {
  if (!row) return "general";
  const config = parseJsonObject(row.config);
  const settings = parseJsonObject(row.settings_json);
  const mode =
    row.parcours_bonus_mode ??
    config?.parcours_bonus_mode ??
    settings?.parcours_bonus_mode;

  return mode === "personnalise" ? "personnalise" : "general";
};

const getConfigForGroup = (groupId: string | null, configs: GroupConfigRow[]) => {
  if (!groupId) return null;

  const groupRows = configs
    .filter((cfg) => cfg.group_id && String(cfg.group_id) === String(groupId));

  const rowPool = groupRows.some((cfg) => modeParcoursIsActive(cfg.modes))
    ? groupRows.filter((cfg) => modeParcoursIsActive(cfg.modes))
    : groupRows;

  return rowPool
    .sort((a, b) => {
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tb - ta;
    })[0] ?? null;
};

const parcoursBelongsToGroup = (
  p: ParcoursRow,
  groupId: string | null,
  _folderRows: FolderRow[] = []
) => {
  if (!groupId) return true;
  return extractGroupIds(p.groupes_associes).includes(String(groupId));
};

const rowBelongsToTeacher = (row: any, teacherId: string | null) => {
  if (!teacherId) return false;
  const owners = uniqueIds([row?.teacher_id, row?.professeur_id, row?.user_id]);
  if (owners.length === 0) return true;
  return owners.includes(String(teacherId));
};

const uniqueIds = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));

const readStoredGroupId = async () => {
  const asyncValue = await AsyncStorage.getItem(LS_POINTS_SELECTED_GROUP_ID);
  if (asyncValue) return asyncValue;

  if (Platform.OS === "web" && typeof window !== "undefined") {
    return window.localStorage.getItem(LS_POINTS_SELECTED_GROUP_ID);
  }

  return null;
};

export default function PersonnalisationParcoursTermines({ setPage }: Props) {
  const { width } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveTimeouts] = useState<Record<string, any>>({});
  const folderSaveSeqRef = useRef<Record<string, number>>({});

  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [parcours, setParcours] = useState<ParcoursRow[]>([]);
  const [groupConfigs, setGroupConfigs] = useState<GroupConfigRow[]>([]);
  const [bonusRows, setBonusRows] = useState<ParcoursTermineBonusRow[]>([]);

  const [generalBonusByParcours, setGeneralBonusByParcours] = useState<Record<string, number>>({});
  const [modeByParcours, setModeByParcours] = useState<Record<string, BonusMode>>({});
  const [bonusByParcours, setBonusByParcours] = useState<Record<string, string>>({});
  const [bonusByFolder, setBonusByFolder] = useState<Record<string, string>>({});

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [selectedParcoursId, setSelectedParcoursId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const getGeneralBonus = useCallback(
    (parcoursId: string) => generalBonusByParcours[parcoursId] ?? DEFAULT_GLOBAL_BONUS,
    [generalBonusByParcours]
  );

  const getMode = useCallback(
    (parcoursId: string): BonusMode => modeByParcours[parcoursId] ?? "general",
    [modeByParcours]
  );

  const getDisplayBonus = useCallback(
    (p: ParcoursRow) => {
      const general = getGeneralBonus(p.id);
      const mode = getMode(p.id);
      return mode === "personnalise" ? p.bonus_points_personnalise ?? general : general;
    },
    [getGeneralBonus, getMode]
  );

  const computeDerivedState = useCallback(
    (
      nextParcours: ParcoursRow[],
      nextConfigs: GroupConfigRow[],
      nextBonusRows: ParcoursTermineBonusRow[],
      targetGroupId: string | null
    ) => {
      const nextGeneral: Record<string, number> = {};
      const nextModes: Record<string, BonusMode> = {};
      const nextBonus: Record<string, string> = {};
      const groupConfig = getConfigForGroup(targetGroupId, nextConfigs);
      const legacyOverrides = readParcoursBonusOverrides(groupConfig);
      const tableOverrides = new Map(
        nextBonusRows
          .filter((row) => String(row.group_id) === String(targetGroupId))
          .map((row) => [String(row.parcours_id), numberOrFallback(row.points_personnalises, DEFAULT_GLOBAL_BONUS)])
      );

      const normalizedParcours = nextParcours.map((p) => {
        const general = numberOrFallback(groupConfig?.points_par_parcours, DEFAULT_GLOBAL_BONUS);
        const tableValue = tableOverrides.get(p.id);
        const legacyValue = legacyOverrides[p.id];
        const hasCustom = tableValue != null || legacyValue != null;
        const customValue = tableValue ?? legacyValue ?? p.bonus_points_personnalise ?? general;

        nextGeneral[p.id] = general;
        nextModes[p.id] = hasCustom ? "personnalise" : readParcoursBonusMode(groupConfig);
        nextBonus[p.id] = String(hasCustom ? customValue : general);

        return { ...p, bonus_points_personnalise: customValue };
      });

      return { normalizedParcours, nextGeneral, nextModes, nextBonus };
    },
    []
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;

      const connectedUserId = authData.user?.id ?? null;
      if (!connectedUserId) throw new Error("Professeur non connecté.");

      setOwnerId(connectedUserId);
      const storedGroupId = await readStoredGroupId();

      const [groupsRes, foldersRes, parcoursRes, configsRes, bonusRes] = await Promise.all([
        supabase
          .from("groups")
          .select("*")
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
          .from("group_points_configs")
          .select("*")
          .eq("professeur_id", connectedUserId)
          .order("updated_at", { ascending: false, nullsFirst: false }),
        supabase
          .from(TABLE_PARCOURS_TERMINE_BONUSES)
          .select("*")
          .eq("professeur_id", connectedUserId)
          .order("updated_at", { ascending: false, nullsFirst: false }),
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (foldersRes.error) throw foldersRes.error;
      if (parcoursRes.error) throw parcoursRes.error;
      if (configsRes.error) throw configsRes.error;
      if (bonusRes.error && !isMissingTableError(bonusRes.error)) throw bonusRes.error;

      const nextGroups = ((groupsRes.data || []) as GroupRow[]).filter((g) =>
        rowBelongsToTeacher(g, connectedUserId)
      );
      const storedGroupIsValid =
        !!storedGroupId && nextGroups.some((g) => String(g.id) === String(storedGroupId));
      const targetGroupId =
        storedGroupIsValid
          ? storedGroupId
          : nextGroups[0]?.id ?? null;
      const nextFolders = ((foldersRes.data || []) as FolderRow[]).filter((f) =>
        rowBelongsToTeacher(f, connectedUserId)
      );
      const rawParcours = ((parcoursRes.data || []) as ParcoursRow[])
        .filter((p) => rowBelongsToTeacher(p, connectedUserId))
        .filter((p) => parcoursBelongsToGroup(p, targetGroupId, nextFolders));
      const nextConfigs = (configsRes.data || []) as GroupConfigRow[];
      const nextBonusRows = bonusRes.error ? [] : (bonusRes.data || []) as ParcoursTermineBonusRow[];

      const { normalizedParcours, nextGeneral, nextModes, nextBonus } =
        computeDerivedState(rawParcours, nextConfigs, nextBonusRows, targetGroupId);

      const nextFolderBonus: Record<string, string> = {};
      nextFolders.forEach((f) => {
        const childIds = new Set<string>();
        const walk = (folderId: string) => {
          childIds.add(folderId);
          nextFolders
            .filter((child) => folderParentId(child) === folderId)
            .forEach((child) => walk(child.id));
        };
        walk(f.id);

        const children = normalizedParcours.filter((p) => {
          const folderId = parcoursFolderId(p);
          return !!folderId && childIds.has(folderId);
        });

        if (children.length === 0) {
          nextFolderBonus[f.id] = String(DEFAULT_GLOBAL_BONUS);
          return;
        }

        const values = children.map((p) =>
          nextModes[p.id] === "personnalise"
            ? numberOrFallback(p.bonus_points_personnalise, nextGeneral[p.id])
            : nextGeneral[p.id]
        );
        const firstValue = values[0] ?? DEFAULT_GLOBAL_BONUS;
        nextFolderBonus[f.id] = String(firstValue);
      });

      setGroups(nextGroups);
      setSelectedGroupId(targetGroupId);
      setFolders(nextFolders);
      setParcours(normalizedParcours);
      setGroupConfigs(nextConfigs);
      setBonusRows(nextBonusRows);
      setGeneralBonusByParcours(nextGeneral);
      setModeByParcours(nextModes);
      setBonusByParcours(nextBonus);
      setBonusByFolder(nextFolderBonus);

    } catch (e: any) {
      console.error("❌ PersonnalisationParcoursTermines load:", e);
      Alert.alert("Erreur", e?.message || "Impossible de charger les données.");
    } finally {
      setLoading(false);
    }
  }, [computeDerivedState]);

  useEffect(() => {
    load();
  }, [load]);

  const currentFolder = useMemo(
    () => folders.find((f) => f.id === currentFolderId) || null,
    [folders, currentFolderId]
  );

  const selectedGroupName = useMemo(() => {
    const group = groups.find((g) => String(g.id) === String(selectedGroupId));
    return group ? String(group.nom ?? group.name ?? "Classe") : "Classe cible";
  }, [groups, selectedGroupId]);

  const getAllFolderIdsInside = useCallback(
    (folderId: string): string[] => {
      const result = [folderId];
      const walk = (parentId: string) => {
        folders
          .filter((f) => folderParentId(f) === parentId)
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

  const getFolderPath = useCallback(
    (folderId: string | null | undefined): string => {
      if (!folderId) return "Racine";
      const names: string[] = [];
      let current = folders.find((f) => f.id === folderId) || null;
      while (current) {
        names.unshift(folderName(current));
        const parentId = folderParentId(current);
        current = parentId
          ? folders.find((f) => f.id === parentId) || null
          : null;
      }
      return names.join(" / ") || "Dossier";
    },
    [folders]
  );

  const getFolderCount = useCallback(
    (folderId: string) => {
      const ids = getAllFolderIdsInside(folderId);
      return parcours.filter((p) => {
        const folderId = parcoursFolderId(p);
        return !!folderId && ids.includes(folderId);
      }).length;
    },
    [getAllFolderIdsInside, parcours]
  );

  const visibleFolders = useMemo(() => {
    const q = normalizeSearch(searchTerm);
    return [...folders]
      .sort((a, b) => folderName(a).localeCompare(folderName(b)))
      .filter((f) => {
        const parentId = folderParentId(f);
        const inCurrentFolder = currentFolderId ? parentId === currentFolderId : !parentId;
        if (!q) return inCurrentFolder;
        return normalizeSearch(folderName(f)).includes(q);
      });
  }, [folders, currentFolderId, searchTerm]);

  const visibleParcours = useMemo(() => {
    const q = normalizeSearch(searchTerm);
    return [...parcours]
      .sort((a, b) => parcoursName(a).localeCompare(parcoursName(b)))
      .filter((p) => {
        const folderId = parcoursFolderId(p);
        const inCurrentFolder = currentFolderId ? folderId === currentFolderId : !folderId;
        if (!q) return inCurrentFolder;
        return normalizeSearch(parcoursName(p)).includes(q);
      });
  }, [parcours, currentFolderId, searchTerm]);

  const updateParcoursLocal = (parcoursId: string, points: number, displayValue: string) => {
    setParcours((prev) =>
      prev.map((p) =>
        p.id === parcoursId ? { ...p, bonus_points_personnalise: points } : p
      )
    );
    setBonusByParcours((prev) => ({ ...prev, [parcoursId]: displayValue }));
  };

  const fetchGroupParcoursRows = async (groupId: string): Promise<ParcoursRow[]> => {
    const { data, error } = await supabase
      .from("parcours")
      .select("id,nom,folder_id,parent_parcours_folders_id,groupes_associes,user_id,professeur_id,ordre");

    if (error) throw error;

    return ((data ?? []) as ParcoursRow[])
      .filter((p) => rowBelongsToTeacher(p, ownerId))
      .filter((p) => parcoursBelongsToGroup(p, groupId, folders));
  };

  const fetchFolderParcoursRows = async (folderId: string): Promise<ParcoursRow[]> => {
    if (!selectedGroupId) return [];
    const folderIds = getAllFolderIdsInside(folderId);

    const { data, error } = await supabase
      .from("parcours")
      .select("id,nom,folder_id,parent_parcours_folders_id,groupes_associes,user_id,professeur_id,ordre");

    if (error) throw error;

    return ((data ?? []) as ParcoursRow[])
      .filter((p) => {
        const childFolderId = parcoursFolderId(p);
        return !!childFolderId && folderIds.includes(childFolderId);
      })
      .filter((p) => rowBelongsToTeacher(p, ownerId))
      .filter((p) => parcoursBelongsToGroup(p, selectedGroupId, folders));
  };

  const updateGroupConfigLocal = (
    groupId: string,
    patch: Partial<GroupConfigRow> & { parcours_bonus_overrides?: Record<string, number> }
  ) => {
    setGroupConfigs((prev) => {
      const now = new Date().toISOString();
      const found = prev.some((cfg) => String(cfg.group_id) === String(groupId));
      const next = prev.map((cfg) =>
        String(cfg.group_id) === String(groupId)
          ? { ...cfg, ...patch, updated_at: now }
          : cfg
      );

      if (found) return next;

      return [
        ...next,
        {
          group_id: groupId,
          professeur_id: ownerId,
          modes: { balises: true, parcours: true, tentatives: false },
          points_par_parcours: DEFAULT_GLOBAL_BONUS,
          parcours_bonus_mode: "personnalise",
          ...patch,
          updated_at: now,
        },
      ];
    });
  };

  const syncCompletedStatsForBonusChange = async ({
    groupId,
    previousMode,
    nextMode,
    previousOverrides,
    nextOverrides,
    previousGeneralBonus,
    nextGeneralBonus,
  }: {
    groupId: string;
    previousMode: BonusMode;
    nextMode: BonusMode;
    previousOverrides: Record<string, number>;
    nextOverrides: Record<string, number>;
    previousGeneralBonus: number;
    nextGeneralBonus: number;
  }) => {
    let targetParcoursIds = uniqueIds(
      parcours
        .filter((p) => parcoursBelongsToGroup(p, groupId, folders))
        .map((p) => p.id)
    );

    try {
      const dbParcoursRows = await fetchGroupParcoursRows(groupId);
      const dbParcoursIds = uniqueIds(dbParcoursRows.map((p) => p.id));
      if (dbParcoursIds.length > 0) targetParcoursIds = dbParcoursIds;
    } catch (e) {
      console.warn("Chargement des parcours de la classe pour recalcul impossible :", e);
    }

    const overrideIds = uniqueIds([
      ...Object.keys(previousOverrides),
      ...Object.keys(nextOverrides),
    ]);

    const allowedIds = new Set(targetParcoursIds);
    targetParcoursIds = uniqueIds([
      ...targetParcoursIds,
      ...overrideIds.filter((id) => allowedIds.size === 0 || allowedIds.has(id)),
    ]);

    if (targetParcoursIds.length === 0) return;

    const changedParcoursIds = targetParcoursIds
      .filter((parcoursId) => {
        const oldBonus =
          previousMode === "personnalise"
            ? previousOverrides[parcoursId] ?? previousGeneralBonus
            : previousGeneralBonus;
        const newBonus =
          nextMode === "personnalise"
            ? nextOverrides[parcoursId] ?? nextGeneralBonus
            : nextGeneralBonus;
        return oldBonus !== newBonus;
      });

    const recalcParcoursIds = uniqueIds([
      ...changedParcoursIds,
      ...overrideIds.filter((id) => allowedIds.size === 0 || allowedIds.has(id)),
    ]);

    if (recalcParcoursIds.length === 0) return;

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

    const { data: statsData, error: statsError } = await supabase
      .from("eleve_parcours_stats")
      .select("student_id, parcours_id")
      .in("student_id", studentIds)
      .in("parcours_id", recalcParcoursIds);

    if (statsError) throw statsError;

    const { data: attemptsData, error: attemptsError } = await supabase
      .from("eleve_parcours_tentatives")
      .select("student_id, parcours_id")
      .in("student_id", studentIds)
      .in("parcours_id", recalcParcoursIds);

    if (attemptsError) throw attemptsError;

    const pairs = new Map<string, { student_id: string; parcours_id: string }>();
    [...((statsData ?? []) as any[]), ...((attemptsData ?? []) as any[])].forEach((row) => {
      if (!row?.student_id || !row?.parcours_id) return;
      const pair = {
        student_id: String(row.student_id),
        parcours_id: String(row.parcours_id),
      };
      pairs.set(`${pair.student_id}:${pair.parcours_id}`, pair);
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

  const ensureGroupParcoursMode = async (groupId: string) => {
    const current = getConfigForGroup(groupId, groupConfigs);
    const nextModes = ensureParcoursMode(current?.modes);

    const payload = {
      group_id: groupId,
      professeur_id: ownerId,
      modes: nextModes,
      points_par_parcours: current?.points_par_parcours ?? DEFAULT_GLOBAL_BONUS,
      parcours_bonus_mode: "personnalise" as const,
      tentative_page_mode: current?.tentative_page_mode ?? "general",
      tentative_page_default: current?.tentative_page_default ?? null,
      tentative_page_assignments: current?.tentative_page_assignments ?? {},
      tentative_source_parcours_id: current?.tentative_source_parcours_id ?? null,
      tentative_source_assignments: current?.tentative_source_assignments ?? {},
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("group_points_configs")
      .update(payload)
      .eq("group_id", groupId)
      .eq("professeur_id", ownerId)
      .select("*");

    if (error) throw error;

    if (!data || data.length === 0) {
      const { error: insertError } = await supabase.from("group_points_configs").insert(payload);
      if (insertError) throw insertError;
    }

    updateGroupConfigLocal(groupId, {
      modes: payload.modes,
      points_par_parcours: payload.points_par_parcours,
      parcours_bonus_mode: payload.parcours_bonus_mode,
      tentative_source_assignments: payload.tentative_source_assignments,
    });
  };

  const getStoredOverridesForGroup = useCallback(
    (groupId: string) => {
      const current = getConfigForGroup(groupId, groupConfigs);
      const overrides = readParcoursBonusOverrides(current);

      bonusRows
        .filter((row) => String(row.group_id) === String(groupId))
        .forEach((row) => {
          overrides[String(row.parcours_id)] = numberOrFallback(
            row.points_personnalises,
            DEFAULT_GLOBAL_BONUS
          );
        });

      return overrides;
    },
    [bonusRows, groupConfigs]
  );

  const upsertParcoursBonusRows = async (
    groupId: string,
    parcoursRows: ParcoursRow[],
    points: number
  ) => {
    if (!ownerId || parcoursRows.length === 0) return;

    const targetRows = parcoursRows.filter((p) => parcoursBelongsToGroup(p, groupId, folders));
    if (targetRows.length === 0) return;

    const current = getConfigForGroup(groupId, groupConfigs);
    const previousOverrides = getStoredOverridesForGroup(groupId);
    const nextOverrides = { ...previousOverrides };
    targetRows.forEach((p) => {
      nextOverrides[p.id] = points;
    });

    await ensureGroupParcoursMode(groupId);

    const payload = targetRows.map((p) => ({
      professeur_id: ownerId,
      group_id: groupId,
      parcours_id: p.id,
      points_personnalises: points,
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from(TABLE_PARCOURS_TERMINE_BONUSES)
      .upsert(payload, { onConflict: "professeur_id,group_id,parcours_id" })
      .select("*");

    if (error) throw error;

    await syncCompletedStatsForBonusChange({
      groupId,
      previousMode: "personnalise",
      nextMode: "personnalise",
      previousOverrides,
      nextOverrides,
      previousGeneralBonus: numberOrFallback(current?.points_par_parcours, DEFAULT_GLOBAL_BONUS),
      nextGeneralBonus: numberOrFallback(current?.points_par_parcours, DEFAULT_GLOBAL_BONUS),
    });

    setBonusRows((prev) => {
      const replaced = new Set(targetRows.map((p) => String(p.id)));
      return [
        ...prev.filter(
          (row) =>
            String(row.group_id) !== String(groupId) ||
            !replaced.has(String(row.parcours_id))
        ),
        ...(((data as ParcoursTermineBonusRow[]) ?? []) || []),
      ];
    });
  };

  const deleteParcoursBonusRow = async (groupId: string, parcoursId: string) => {
    if (!ownerId) return;

    const current = getConfigForGroup(groupId, groupConfigs);
    const previousOverrides = getStoredOverridesForGroup(groupId);
    const nextOverrides = { ...previousOverrides };
    delete nextOverrides[parcoursId];

    const { error } = await supabase
      .from(TABLE_PARCOURS_TERMINE_BONUSES)
      .delete()
      .eq("professeur_id", ownerId)
      .eq("group_id", groupId)
      .eq("parcours_id", parcoursId);

    if (error) throw error;

    await syncCompletedStatsForBonusChange({
      groupId,
      previousMode: "personnalise",
      nextMode: "personnalise",
      previousOverrides,
      nextOverrides,
      previousGeneralBonus: numberOrFallback(current?.points_par_parcours, DEFAULT_GLOBAL_BONUS),
      nextGeneralBonus: numberOrFallback(current?.points_par_parcours, DEFAULT_GLOBAL_BONUS),
    });

    setBonusRows((prev) =>
      prev.filter(
        (row) =>
          String(row.group_id) !== String(groupId) ||
          String(row.parcours_id) !== String(parcoursId)
      )
    );
  };

  const saveParcoursValue = async (parcoursId: string, valueToSave: string) => {
    try {
      if (!ownerId || !selectedGroupId) return;
      const general = getGeneralBonus(parcoursId);
      const points = numberOrFallback(valueToSave, general);
      const targetParcours = parcours.find((p) => p.id === parcoursId);
      if (!targetParcours) return;

      setSavingId(`parcours:${parcoursId}`);
      await upsertParcoursBonusRows(selectedGroupId, [targetParcours], points);
      updateParcoursLocal(parcoursId, points, String(points));
      setModeByParcours((prev) => ({ ...prev, [parcoursId]: "personnalise" }));
    } catch (e) {
      console.error("❌ save parcours bonus:", e);
    } finally {
      setSavingId(null);
    }
  };

  const triggerAutoSaveParcours = (parcoursId: string, valueToSave: string) => {
    const key = `parcours:${parcoursId}`;
    if (saveTimeouts[key]) clearTimeout(saveTimeouts[key]);
    saveTimeouts[key] = setTimeout(() => saveParcoursValue(parcoursId, valueToSave), 700);
  };

  const getGroupIdsForParcours = (parcoursId: string) => {
    const p = parcours.find((row) => row.id === parcoursId);
    if (!p) return [];
    return extractGroupIds(p.groupes_associes);
  };

  const saveModeForParcoursGroups = async (parcoursId: string, mode: BonusMode) => {
    try {
      if (!ownerId || !selectedGroupId) return;
      if (!getGroupIdsForParcours(parcoursId).includes(String(selectedGroupId))) {
        Alert.alert(
          "Classe introuvable",
          "Ce parcours n'est pas associé à la classe cible."
        );
        return;
      }

      setSavingId(`parcours:${parcoursId}`);
      if (mode === "general") {
        const general = getGeneralBonus(parcoursId);
        await deleteParcoursBonusRow(selectedGroupId, parcoursId);
        setModeByParcours((prev) => ({ ...prev, [parcoursId]: "general" }));
        setBonusByParcours((prev) => ({ ...prev, [parcoursId]: String(general) }));
      } else {
        const currentValue = numberOrFallback(bonusByParcours[parcoursId], getGeneralBonus(parcoursId));
        const targetParcours = parcours.find((p) => p.id === parcoursId);
        if (targetParcours) {
          await upsertParcoursBonusRows(selectedGroupId, [targetParcours], currentValue);
          updateParcoursLocal(parcoursId, currentValue, String(currentValue));
        }
        setModeByParcours((prev) => ({ ...prev, [parcoursId]: "personnalise" }));
      }
    } catch (e: any) {
      console.error("❌ save parcours bonus mode:", e);
      Alert.alert("Erreur", e?.message || "Impossible de changer le mode du bonus.");
    } finally {
      setSavingId(null);
    }
  };

  const saveManyParcoursValues = async (parcoursRows: ParcoursRow[], valueToSave: string) => {
    try {
      if (!ownerId || !selectedGroupId || parcoursRows.length === 0) return;

      const points = numberOrFallback(valueToSave, DEFAULT_GLOBAL_BONUS);

      setSavingId(`folder:${parcoursRows[0].folder_id ?? parcoursRows[0].parent_parcours_folders_id ?? "root"}`);
      await upsertParcoursBonusRows(selectedGroupId, parcoursRows, points);

      parcoursRows.forEach((p) => {
        updateParcoursLocal(p.id, points, String(points));
      });
      setModeByParcours((prev) => {
        const next = { ...prev };
        parcoursRows.forEach((p) => {
          next[p.id] = "personnalise";
        });
        return next;
      });
    } catch (e) {
      console.error("❌ save folder parcours bonus:", e);
    } finally {
      setSavingId(null);
    }
  };

  const applyFolderBonusToChildren = async (folderId: string, value: string) => {
    const nextSeq = (folderSaveSeqRef.current[folderId] ?? 0) + 1;
    folderSaveSeqRef.current[folderId] = nextSeq;
    const ids = getAllFolderIdsInside(folderId);
    const points = numberOrFallback(value, DEFAULT_GLOBAL_BONUS);

    setSelectedFolderId(folderId);
    setBonusByFolder((prev) => ({ ...prev, [folderId]: value }));

    const localChildParcours = parcours.filter((p) => {
      const folderId = parcoursFolderId(p);
      return !!folderId && ids.includes(folderId);
    });
    localChildParcours.forEach((p) => {
      setModeByParcours((prev) => ({ ...prev, [p.id]: "personnalise" }));
      updateParcoursLocal(p.id, points, value);
    });

    let childParcours = localChildParcours;
    try {
      const fetched = await fetchFolderParcoursRows(folderId);
      if (fetched.length > 0) {
        childParcours = fetched;
        setParcours((prev) => {
          const known = new Set(prev.map((p) => p.id));
          const additions = fetched.filter((p) => !known.has(p.id));
          if (additions.length === 0) return prev;
          return [...prev, ...additions];
        });
        fetched.forEach((p) => {
          setModeByParcours((prev) => ({ ...prev, [p.id]: "personnalise" }));
          updateParcoursLocal(p.id, points, value);
        });
      }
    } catch (e) {
      console.warn("Chargement des parcours du dossier impossible :", e);
    }

    if (folderSaveSeqRef.current[folderId] !== nextSeq) return;

    const key = `folder:${folderId}`;
    if (saveTimeouts[key]) clearTimeout(saveTimeouts[key]);
    saveTimeouts[key] = setTimeout(async () => {
      setSavingId(key);
      await saveManyParcoursValues(childParcours, value);
    }, 400);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (currentFolderId) {
              const parentId = currentFolder ? folderParentId(currentFolder) : null;
              setCurrentFolderId(parentId);
              setSelectedFolderId(parentId);
              setSelectedParcoursId(null);
            } else {
              setPage("GestionPoints");
            }
          }}
          activeOpacity={0.9}
        >
          <Feather name="arrow-left" size={20} color="white" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Parcours terminés</Text>
          <Text style={styles.headerSub}>
            {currentFolderId && currentFolder ? folderName(currentFolder) : `${selectedGroupName} • Bonus personnalisés`}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.topIconBtn}
          onPress={() => setSearchVisible((v) => !v)}
          activeOpacity={0.9}
        >
          <Feather name="search" size={18} color="white" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.topIconBtn}
          onPress={() =>
            Alert.alert(
              "Parcours terminés",
              "Choisis un bonus par dossier. Ouvre un dossier pour modifier un parcours précis."
            )
          }
          activeOpacity={0.9}
        >
          <Feather name="info" size={18} color="white" />
        </TouchableOpacity>
      </View>

      {searchVisible && (
        <View style={styles.searchBarWrap}>
          <Feather name="search" size={16} color={C_SUB} />
          <TextInput
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Rechercher un dossier ou un parcours..."
            placeholderTextColor="rgba(95,115,134,0.65)"
            style={styles.searchInput}
          />
          {!!searchTerm && (
            <TouchableOpacity onPress={() => setSearchTerm("")}>
              <Feather name="x" size={17} color={C_SUB} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C_HEADER} />
          <Text style={styles.loadingText}>Chargement des parcours...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingHorizontal: width >= 900 ? 24 : 14 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {currentFolderId ? "Dossiers dans ce dossier" : "Dossiers"}
            </Text>

            {visibleFolders.length === 0 ? (
              <Text style={styles.emptyText}>
                {searchTerm.trim()
                  ? "Aucun dossier trouvé."
                  : currentFolderId
                  ? "Aucun sous-dossier ici."
                  : "Aucun dossier trouvé."}
              </Text>
            ) : (
              visibleFolders.map((f) => {
                const active = selectedFolderId === f.id;
                const count = getFolderCount(f.id);
                const value = bonusByFolder[f.id] ?? String(DEFAULT_GLOBAL_BONUS);
                const ids = getAllFolderIdsInside(f.id);
                const savingThis =
                  savingId === `folder:${f.id}` ||
                  parcours.some((p) => {
                    const folderId = parcoursFolderId(p);
                    return !!folderId && ids.includes(folderId) && savingId === `parcours:${p.id}`;
                  });

                return (
                  <TouchableOpacity
                    key={f.id}
                    activeOpacity={0.92}
                    onPress={() => {
                      setCurrentFolderId(f.id);
                      setSelectedFolderId(f.id);
                      setSelectedParcoursId(null);
                    }}
                    style={[styles.selectionCard, active && styles.selectionCardOrange]}
                  >
                    <LinearGradient colors={[ORANGE_1, ORANGE_2]} style={styles.selectionIcon}>
                      <Feather name="folder" size={20} color="#B45309" />
                    </LinearGradient>

                    <View style={styles.selectionBody}>
                      <Text style={styles.selectionTitle} numberOfLines={1}>{folderName(f)}</Text>
                      <Text style={styles.selectionSub} numberOfLines={1}>
                        {count} parcours
                      </Text>
                    </View>

                    <TouchableOpacity activeOpacity={1} onPress={(e: any) => e?.stopPropagation?.()}>
                      <View style={styles.inlineBonusControl}>
                        <View style={styles.inlineInputRow}>
                          <TextInput
                            value={value}
                            onChangeText={(t) => applyFolderBonusToChildren(f.id, onlyDigits(t))}
                            keyboardType="numeric"
                            style={styles.inlineInput}
                            placeholder="0"
                            placeholderTextColor="rgba(35,53,72,0.35)"
                          />
                          <Text style={styles.inlinePts}>pts</Text>
                        </View>
                        {savingThis ? <ActivityIndicator size="small" color={C_HEADER} /> : null}
                      </View>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          {currentFolderId && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Parcours de ce dossier</Text>

              {visibleParcours.length === 0 ? (
                <Text style={styles.emptyText}>Aucun parcours trouvé.</Text>
              ) : (
                visibleParcours.map((p) => {
                  const active = selectedParcoursId === p.id;
                  const value = bonusByParcours[p.id] ?? String(getGeneralBonus(p.id));
                  const savingThis = savingId === `parcours:${p.id}`;
                  const custom = getMode(p.id) === "personnalise";

                  return (
                    <TouchableOpacity
                      key={p.id}
                      activeOpacity={0.92}
                      onPress={() => setSelectedParcoursId(p.id)}
                      style={[styles.selectionCard, active && styles.selectionCardActive]}
                    >
                      <LinearGradient colors={[GREEN_1, GREEN_2]} style={styles.selectionIcon}>
                        <Feather name="map" size={20} color="#047857" />
                      </LinearGradient>

                      <View style={styles.selectionBody}>
                        <Text style={styles.selectionTitle} numberOfLines={1}>{parcoursName(p)}</Text>
                      </View>

                      <TouchableOpacity activeOpacity={1} onPress={(e: any) => e?.stopPropagation?.()}>
                        <View style={styles.inlineParcoursControl}>
                          <View style={styles.modeSwitchRow}>
                            <TouchableOpacity
                              activeOpacity={0.9}
                              onPress={() => saveModeForParcoursGroups(p.id, "general")}
                              style={[styles.modeMiniBtn, !custom && styles.modeMiniBtnActive]}
                            >
                              <Text style={[styles.modeMiniText, !custom && styles.modeMiniTextActive]}>Général</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              activeOpacity={0.9}
                              onPress={() => saveModeForParcoursGroups(p.id, "personnalise")}
                              style={[styles.modeMiniBtn, custom && styles.modeMiniBtnActive]}
                            >
                              <Text style={[styles.modeMiniText, custom && styles.modeMiniTextActive]}>Perso</Text>
                            </TouchableOpacity>
                          </View>

                          <View style={styles.inlineInputRow}>
                            <TextInput
                              value={value}
                              onChangeText={(t) => {
                                const nextValue = onlyDigits(t);
                                const points = numberOrFallback(nextValue, getGeneralBonus(p.id));
                                setBonusByParcours((prev) => ({ ...prev, [p.id]: nextValue }));
                                setModeByParcours((prev) => ({ ...prev, [p.id]: "personnalise" }));
                                updateParcoursLocal(p.id, points, nextValue);
                                triggerAutoSaveParcours(p.id, nextValue);
                              }}
                              keyboardType="numeric"
                              style={styles.inlineInput}
                              placeholder="0"
                              placeholderTextColor="rgba(35,53,72,0.35)"
                            />
                            <Text style={styles.inlinePts}>pts</Text>
                          </View>
                          {savingThis ? <ActivityIndicator size="small" color={C_HEADER} /> : null}
                        </View>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C_BG },
  header: {
    backgroundColor: C_HEADER,
    paddingHorizontal: 16,
    paddingTop: Platform.select({ ios: 16, android: 16, default: 14 }),
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  topIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  searchBarWrap: {
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 2,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: C_TEXT,
    fontWeight: "800",
    paddingVertical: Platform.select({ web: 10, default: 9 }),
    outlineStyle: "none" as any,
  },
  headerTitle: { color: "white", fontSize: 21, fontWeight: "900" },
  headerSub: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { color: C_TEXT, fontWeight: "800" },
  content: { paddingTop: 14, paddingBottom: 80, gap: 12 },
  card: {
    backgroundColor: C_CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 16,
  },
  sectionTitle: { color: C_TEXT, fontSize: 16, fontWeight: "900", marginBottom: 12 },
  selectionCard: {
    minHeight: 76,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectionCardActive: { borderColor: "#8EE2BE", backgroundColor: "#F0FFF7" },
  selectionCardOrange: { borderColor: "#FFD58F", backgroundColor: "#FFF8EB" },
  selectionIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  selectionBody: { flex: 1, minWidth: 0 },
  selectionTitle: { color: C_TEXT, fontSize: 15, fontWeight: "900" },
  selectionSub: { color: C_SUB, fontSize: 12, fontWeight: "700", marginTop: 2 },
  emptyText: { color: C_SUB, fontWeight: "700", textAlign: "center", paddingVertical: 12 },
  inlineBonusControl: {
    minWidth: 96,
    minHeight: 42,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  inlineParcoursControl: {
    minWidth: 150,
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#FFFFFF",
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  modeSwitchRow: { flexDirection: "row", gap: 5 },
  modeMiniBtn: {
    width: 64,
    minHeight: 28,
    borderRadius: 10,
    backgroundColor: "rgba(35,53,72,0.06)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  modeMiniBtnActive: { backgroundColor: C_HEADER },
  modeMiniText: { color: C_SUB, fontSize: 10, fontWeight: "900" },
  modeMiniTextActive: { color: "#FFFFFF" },
  inlineInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  inlineInput: {
    width: 58,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.26)",
    backgroundColor: "#F8FFFB",
    textAlign: "center",
    color: C_TEXT,
    fontSize: 18,
    fontWeight: "900",
    paddingHorizontal: 4,
    paddingVertical: 0,
  },
  inlinePts: { color: C_TEXT, fontSize: 12, fontWeight: "900" },
});
