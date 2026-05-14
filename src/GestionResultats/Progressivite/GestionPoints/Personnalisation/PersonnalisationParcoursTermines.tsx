// PersonnalisationParcoursTermines.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  user_id?: string | null;
  ordre?: number | null;
};

type ParcoursRow = {
  id: string;
  nom?: string | null;
  folder_id?: string | null;
  user_id?: string | null;
  ordre?: number | null;
  groupes_associes?: any;
  bonus_points_personnalise?: number | null;
};

type GroupConfigRow = {
  id?: string;
  group_id?: string | null;
  professeur_id?: string | null;
  modes?: any;
  points_par_parcours?: number | string | null;
  parcours_bonus_mode?: "general" | "personnalise" | null;
  updated_at?: string | null;
  [key: string]: any;
};

type BonusMode = "general" | "personnalise";

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

const folderName = (f: FolderRow) => String(f.name || f.nom || "Sans nom").trim();
const parcoursName = (p: ParcoursRow) => String(p.nom || "Sans nom").trim();
const onlyDigits = (value: string) => value.replace(/[^0-9]/g, "");

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

const extractGroupIds = (value: any): string[] => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v).trim()).filter(Boolean);
      }
    } catch {
      // format texte simple
    }

    return raw
      .replace(/[{}\[\]"]/g, "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return [];
};

const modeParcoursIsActive = (modesValue: any) => {
  const modes = parseJsonObject(modesValue);
  return !!modes?.parcours;
};

const numberOrFallback = (value: any, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const getBestConfigForParcours = (p: ParcoursRow, configs: GroupConfigRow[]) => {
  const groupIds = extractGroupIds(p.groupes_associes);
  if (!groupIds.length) return null;

  return configs
    .filter((cfg) => cfg.group_id && groupIds.includes(String(cfg.group_id)))
    .filter((cfg) => modeParcoursIsActive(cfg.modes))
    .sort((a, b) => {
      const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tb - ta;
    })[0] ?? null;
};

export default function PersonnalisationParcoursTermines({ setPage }: Props) {
  const { width } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveTimeouts] = useState<Record<string, any>>({});

  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [parcours, setParcours] = useState<ParcoursRow[]>([]);
  const [groupConfigs, setGroupConfigs] = useState<GroupConfigRow[]>([]);

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
    (nextParcours: ParcoursRow[], nextConfigs: GroupConfigRow[]) => {
      const nextGeneral: Record<string, number> = {};
      const nextModes: Record<string, BonusMode> = {};
      const nextBonus: Record<string, string> = {};
      const backfillRows: ParcoursRow[] = [];

      const normalizedParcours = nextParcours.map((p) => {
        const bestConfig = getBestConfigForParcours(p, nextConfigs);
        const general = numberOrFallback(bestConfig?.points_par_parcours, DEFAULT_GLOBAL_BONUS);
        const mode: BonusMode = bestConfig?.parcours_bonus_mode === "personnalise" ? "personnalise" : "general";
        const value = p.bonus_points_personnalise ?? general;

        nextGeneral[p.id] = general;
        nextModes[p.id] = mode;
        nextBonus[p.id] = String(mode === "personnalise" ? value : general);

        if (p.bonus_points_personnalise == null) {
          backfillRows.push({ ...p, bonus_points_personnalise: general });
        }

        return { ...p, bonus_points_personnalise: value };
      });

      return { normalizedParcours, nextGeneral, nextModes, nextBonus, backfillRows };
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

      const [foldersRes, parcoursRes, configsRes] = await Promise.all([
        supabase
          .from("parcours_folders")
          .select("*")
          .eq("user_id", connectedUserId)
          .order("ordre", { ascending: true }),
        supabase
          .from("parcours")
          .select("*")
          .eq("user_id", connectedUserId)
          .order("ordre", { ascending: true }),
        supabase
          .from("group_points_configs")
          .select("*")
          .eq("professeur_id", connectedUserId)
          .order("updated_at", { ascending: false, nullsFirst: false }),
      ]);

      if (foldersRes.error) throw foldersRes.error;
      if (parcoursRes.error) throw parcoursRes.error;
      if (configsRes.error) throw configsRes.error;

      const nextFolders = (foldersRes.data || []) as FolderRow[];
      const rawParcours = (parcoursRes.data || []) as ParcoursRow[];
      const nextConfigs = (configsRes.data || []) as GroupConfigRow[];

      const { normalizedParcours, nextGeneral, nextModes, nextBonus, backfillRows } =
        computeDerivedState(rawParcours, nextConfigs);

      const nextFolderBonus: Record<string, string> = {};
      nextFolders.forEach((f) => {
        const firstChild = normalizedParcours.find((p) => p.folder_id === f.id);
        if (!firstChild) {
          nextFolderBonus[f.id] = String(DEFAULT_GLOBAL_BONUS);
          return;
        }
        nextFolderBonus[f.id] = String(
          nextModes[firstChild.id] === "personnalise"
            ? firstChild.bonus_points_personnalise ?? nextGeneral[firstChild.id]
            : nextGeneral[firstChild.id]
        );
      });

      setFolders(nextFolders);
      setParcours(normalizedParcours);
      setGroupConfigs(nextConfigs);
      setGeneralBonusByParcours(nextGeneral);
      setModeByParcours(nextModes);
      setBonusByParcours(nextBonus);
      setBonusByFolder(nextFolderBonus);

      // Remplit les anciennes lignes NULL avec le bonus général calculé dans ton logiciel.
      // Le mode reste dans group_points_configs, pas dans parcours.
      if (backfillRows.length) {
        await Promise.all(
          backfillRows.map((p) =>
            supabase
              .from("parcours")
              .update({ bonus_points_personnalise: p.bonus_points_personnalise ?? nextGeneral[p.id] ?? DEFAULT_GLOBAL_BONUS })
              .eq("id", p.id)
              .eq("user_id", connectedUserId)
          )
        );
      }
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

  const selectedParcours = useMemo(
    () => parcours.find((p) => p.id === selectedParcoursId) || null,
    [parcours, selectedParcoursId]
  );

  const currentFolder = useMemo(
    () => folders.find((f) => f.id === currentFolderId) || null,
    [folders, currentFolderId]
  );

  const selectedFolder = useMemo(
    () => folders.find((f) => f.id === selectedFolderId) || null,
    [folders, selectedFolderId]
  );

  const getAllFolderIdsInside = useCallback(
    (folderId: string): string[] => {
      const result = [folderId];
      const walk = (parentId: string) => {
        folders
          .filter((f) => f.parent_folder_id === parentId)
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
        current = current.parent_folder_id
          ? folders.find((f) => f.id === current?.parent_folder_id) || null
          : null;
      }
      return names.join(" / ") || "Dossier";
    },
    [folders]
  );

  const parcoursInSelectedFolder = useMemo(() => {
    if (!selectedFolderId) return [];
    const ids = getAllFolderIdsInside(selectedFolderId);
    return parcours.filter((p) => p.folder_id && ids.includes(p.folder_id));
  }, [selectedFolderId, parcours, getAllFolderIdsInside]);

  const getFolderCount = useCallback(
    (folderId: string) => {
      const ids = getAllFolderIdsInside(folderId);
      return parcours.filter((p) => p.folder_id && ids.includes(p.folder_id)).length;
    },
    [getAllFolderIdsInside, parcours]
  );

  const visibleFolders = useMemo(() => {
    const q = normalizeSearch(searchTerm);
    return [...folders]
      .sort((a, b) => folderName(a).localeCompare(folderName(b)))
      .filter((f) => {
        const inCurrentFolder = currentFolderId ? f.parent_folder_id === currentFolderId : !f.parent_folder_id;
        if (!q) return inCurrentFolder;
        return normalizeSearch(folderName(f)).includes(q);
      });
  }, [folders, currentFolderId, searchTerm]);

  const visibleParcours = useMemo(() => {
    const q = normalizeSearch(searchTerm);
    return [...parcours]
      .sort((a, b) => parcoursName(a).localeCompare(parcoursName(b)))
      .filter((p) => {
        const inCurrentFolder = currentFolderId ? p.folder_id === currentFolderId : !p.folder_id;
        if (!q) return inCurrentFolder;
        return normalizeSearch(parcoursName(p)).includes(q);
      });
  }, [parcours, currentFolderId, searchTerm]);

  const selectedPreviewBonus = useMemo(() => {
    if (selectedParcours) return String(getDisplayBonus(selectedParcours));
    if (selectedFolderId) return bonusByFolder[selectedFolderId] || String(DEFAULT_GLOBAL_BONUS);
    return String(DEFAULT_GLOBAL_BONUS);
  }, [selectedParcours, selectedFolderId, bonusByFolder, getDisplayBonus]);

  const updateParcoursLocal = (parcoursId: string, points: number, displayValue: string) => {
    setParcours((prev) =>
      prev.map((p) =>
        p.id === parcoursId ? { ...p, bonus_points_personnalise: points } : p
      )
    );
    setBonusByParcours((prev) => ({ ...prev, [parcoursId]: displayValue }));
  };

  const saveParcoursValue = async (parcoursId: string, valueToSave: string) => {
    try {
      if (!ownerId) return;
      const general = getGeneralBonus(parcoursId);
      const points = numberOrFallback(valueToSave, general);

      setSavingId(`parcours:${parcoursId}`);

      const { error } = await supabase
        .from("parcours")
        .update({ bonus_points_personnalise: points })
        .eq("id", parcoursId)
        .eq("user_id", ownerId);

      if (error) throw error;
      updateParcoursLocal(parcoursId, points, String(points));
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
    return p ? extractGroupIds(p.groupes_associes) : [];
  };

  const saveModeForParcoursGroups = async (parcoursId: string, mode: BonusMode) => {
    try {
      if (!ownerId) return;

      const groupIds = getGroupIdsForParcours(parcoursId);
      if (!groupIds.length) {
        Alert.alert(
          "Classe introuvable",
          "Ce parcours n'est associé à aucune classe. Le mode général/personnalisé doit être enregistré dans la configuration d'une classe."
        );
        return;
      }

      setSavingId(`parcours:${parcoursId}`);

      const results = await Promise.all(
        groupIds.map((groupId) =>
          supabase
            .from("group_points_configs")
            .update({
              parcours_bonus_mode: mode,
              updated_at: new Date().toISOString(),
            })
            .eq("group_id", groupId)
            .eq("professeur_id", ownerId)
        )
      );

      const firstError = results.find((r) => r.error)?.error;
      if (firstError) throw firstError;

      setGroupConfigs((prev) =>
        prev.map((cfg) =>
          cfg.group_id && groupIds.includes(String(cfg.group_id))
            ? { ...cfg, parcours_bonus_mode: mode, updated_at: new Date().toISOString() }
            : cfg
        )
      );

      setModeByParcours((prev) => ({ ...prev, [parcoursId]: mode }));

      if (mode === "general") {
        const general = getGeneralBonus(parcoursId);
        setBonusByParcours((prev) => ({ ...prev, [parcoursId]: String(general) }));
      }
    } catch (e: any) {
      console.error("❌ save parcours bonus mode:", e);
      Alert.alert("Erreur", e?.message || "Impossible de changer le mode du bonus.");
    } finally {
      setSavingId(null);
    }
  };

  const applyFolderBonusToChildren = (folderId: string, value: string) => {
    const ids = getAllFolderIdsInside(folderId);
    const childParcours = parcours.filter((p) => p.folder_id && ids.includes(p.folder_id));
    const points = numberOrFallback(value, DEFAULT_GLOBAL_BONUS);

    setSelectedFolderId(folderId);
    setBonusByFolder((prev) => ({ ...prev, [folderId]: value }));

    childParcours.forEach((p) => {
      setModeByParcours((prev) => ({ ...prev, [p.id]: "personnalise" }));
      updateParcoursLocal(p.id, points, value);
      triggerAutoSaveParcours(p.id, value);
      saveModeForParcoursGroups(p.id, "personnalise");
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (currentFolderId) {
              const parentId = currentFolder?.parent_folder_id || null;
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
            {currentFolderId && currentFolder ? folderName(currentFolder) : "Bonus personnalisés"}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => setSearchVisible((v) => !v)}
          activeOpacity={0.9}
        >
          <Feather name="search" size={18} color="white" />
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
            <Text style={styles.cardTitle}>Bonus de fin personnalisé</Text>
            <Text style={styles.cardText}>
              Le mode général/personnalisé est enregistré dans la configuration de la classe. La valeur personnalisée reste stockée dans le parcours.
            </Text>
          </View>

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
                const savingThis = parcours.some(
                  (p) => p.folder_id && ids.includes(p.folder_id) && savingId === `parcours:${p.id}`
                );

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
                      <Text style={styles.selectionTitle}>{folderName(f)}</Text>
                      <Text style={styles.selectionSub}>{getFolderPath(f.parent_folder_id)}</Text>
                      <Text style={styles.selectionSub}>
                        {count} parcours concerné{count > 1 ? "s" : ""} • clique pour ouvrir
                      </Text>
                      <Text style={styles.defaultText}>
                        Modifier ce bonus passe les classes associées en mode personnalisé.
                      </Text>
                    </View>

                    <TouchableOpacity activeOpacity={1} onPress={(e: any) => e?.stopPropagation?.()}>
                      <View style={styles.inlineBonusBoxFolder}>
                        <Text style={styles.inlineBonusLabel}>Bonus dossier</Text>
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
                        <View style={styles.autoSaveWrap}>
                          {savingThis ? (
                            <>
                              <ActivityIndicator size="small" color={C_HEADER} />
                              <Text style={styles.autoSaveText}>Enregistrement...</Text>
                            </>
                          ) : (
                            <>
                              <Feather name="check-circle" size={14} color="#059669" />
                              <Text style={styles.autoSaveDoneText}>Auto</Text>
                            </>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>

                    <Feather name="chevron-right" size={18} color={C_SUB} />
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
                  const general = getGeneralBonus(p.id);

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
                        <Text style={styles.selectionTitle}>{parcoursName(p)}</Text>
                        <Text style={styles.selectionSub}>{getFolderPath(p.folder_id)}</Text>
                        <Text style={custom ? styles.savedText : styles.defaultText}>
                          {custom
                            ? `Mode personnalisé : +${p.bonus_points_personnalise ?? general} pts`
                            : `Mode général : +${general} pts`}
                        </Text>
                      </View>

                      <TouchableOpacity activeOpacity={1} onPress={(e: any) => e?.stopPropagation?.()}>
                        <View style={styles.inlineBonusBox}>
                          <Text style={styles.inlineBonusLabel}>Mode classe</Text>

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

                          <Text style={styles.inlineBonusLabel}>Bonus</Text>
                          <View style={styles.inlineInputRow}>
                            <TextInput
                              value={value}
                              onChangeText={(t) => {
                                const nextValue = onlyDigits(t);
                                setBonusByParcours((prev) => ({ ...prev, [p.id]: nextValue }));
                                setModeByParcours((prev) => ({ ...prev, [p.id]: "personnalise" }));
                                triggerAutoSaveParcours(p.id, nextValue);
                                saveModeForParcoursGroups(p.id, "personnalise");
                              }}
                              keyboardType="numeric"
                              style={styles.inlineInput}
                              placeholder="0"
                              placeholderTextColor="rgba(35,53,72,0.35)"
                            />
                            <Text style={styles.inlinePts}>pts</Text>
                          </View>

                          <View style={styles.autoSaveWrap}>
                            {savingThis ? (
                              <>
                                <ActivityIndicator size="small" color={C_HEADER} />
                                <Text style={styles.autoSaveText}>Enregistrement...</Text>
                              </>
                            ) : (
                              <>
                                <Feather name="check-circle" size={14} color="#059669" />
                                <Text style={styles.autoSaveDoneText}>Auto</Text>
                              </>
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Aperçu de la ligne sélectionnée</Text>
            <Text style={styles.previewText}>
              {selectedParcours
                ? parcoursName(selectedParcours)
                : selectedFolder
                ? folderName(selectedFolder)
                : currentFolder
                ? folderName(currentFolder)
                : "Aucun élément sélectionné"}
            </Text>
            {selectedFolderId && (
              <Text style={styles.previewSub}>
                {parcoursInSelectedFolder.length} parcours concerné
                {parcoursInSelectedFolder.length > 1 ? "s" : ""}
              </Text>
            )}
            <Text style={styles.previewPoints}>+{selectedPreviewBonus || "0"} pts</Text>
          </View>
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
  refreshBtn: {
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
  content: { paddingTop: 14, paddingBottom: 80, gap: 14 },
  card: {
    backgroundColor: C_CARD,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 16,
  },
  cardTitle: { color: C_TEXT, fontSize: 19, fontWeight: "900", marginBottom: 8 },
  cardText: { color: C_SUB, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  sectionTitle: { color: C_TEXT, fontSize: 16, fontWeight: "900", marginBottom: 12 },
  selectionCard: {
    minHeight: 88,
    borderRadius: 20,
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
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  selectionBody: { flex: 1, minWidth: 0 },
  selectionTitle: { color: C_TEXT, fontSize: 15, fontWeight: "900" },
  selectionSub: { color: C_SUB, fontSize: 12, fontWeight: "700", marginTop: 2 },
  savedText: { color: "#047857", fontSize: 12, fontWeight: "900", marginTop: 5 },
  defaultText: { color: C_SUB, fontSize: 12, fontWeight: "800", marginTop: 5 },
  emptyText: { color: C_SUB, fontWeight: "700", textAlign: "center", paddingVertical: 12 },
  inlineBonusBoxFolder: {
    width: 146,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(31,91,134,0.14)",
    backgroundColor: "rgba(255,255,255,0.86)",
    padding: 8,
  },
  inlineBonusBox: {
    width: 166,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(31,91,134,0.14)",
    backgroundColor: "rgba(255,255,255,0.86)",
    padding: 8,
  },
  modeSwitchRow: { flexDirection: "row", gap: 5, marginBottom: 7 },
  modeMiniBtn: {
    flex: 1,
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
  inlineBonusLabel: {
    color: C_SUB,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 5,
  },
  inlineInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  inlineInput: {
    width: 62,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#FFFFFF",
    textAlign: "center",
    color: C_TEXT,
    fontSize: 20,
    fontWeight: "900",
    paddingHorizontal: 4,
    paddingVertical: 0,
  },
  inlinePts: { color: C_TEXT, fontSize: 12, fontWeight: "900" },
  autoSaveWrap: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  autoSaveText: { color: C_SUB, fontSize: 11, fontWeight: "800" },
  autoSaveDoneText: { color: "#059669", fontSize: 11, fontWeight: "900" },
  previewCard: {
    backgroundColor: C_HEADER,
    borderRadius: 26,
    padding: 22,
    alignItems: "center",
  },
  previewTitle: { color: "rgba(255,255,255,0.72)", fontSize: 13, fontWeight: "800" },
  previewText: {
    color: "white",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 8,
    textAlign: "center",
  },
  previewSub: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 6,
    textAlign: "center",
  },
  previewPoints: { color: "#A7F3D0", fontSize: 34, fontWeight: "900", marginTop: 8 },
});
