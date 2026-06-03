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
  useWindowDimensions,
  View,
  type DimensionValue,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import BottomBar from "./ui/BottomBar";
import { supabase } from "./supabaseClient";

/* ======================= Types ======================= */
type PageSetter = (page: string) => void;

type Props = {
  professeur?: any;
  setPage: PageSetter;
};

type FolderRow = {
  id: string;
  nom?: string | null;
  name?: string | null;
  parent_id?: string | null;
  parent_folder_id?: string | null;
  teacher_id?: string | null;
  professeur_id?: string | null;
  user_id?: string | null;
  [key: string]: any;
};

type GroupRow = {
  id: string;
  nom?: string | null;
  name?: string | null;
  folder_id?: string | null;
  professeur_id?: string | null;
  teacher_id?: string | null;
  created_at?: string | null;
  [key: string]: any;
};

type ParcoursRow = {
  id: string;
  nom?: string | null;
  name?: string | null;
  created_at?: string | null;
  [key: string]: any;
};

type TentativePageRow = {
  id: string;
  teacher_id: string;
  page_number: number;
  page_name: string;
  created_at?: string | null;
};

type ModesActifs = {
  tentatives: boolean;
  balises: boolean;
  parcours: boolean;
};

type TentativePageMode = "general" | "personnalise";

type PerGroupConfig = {
  modes: ModesActifs;
  pointsParParcours: number | null;
  parcoursBonusMode: "general" | "personnalise";
  parcoursBonusOverrides: Record<string, number>;
  tentativePageMode: TentativePageMode;
  tentativePageDefault: number | null;
  tentativePageAssignments: Record<string, number>;
  updatedAt?: string | null;
  professeurId?: string | null;
};

/* ======================= Thème ======================= */
const C_BG = "#EDF2F6";
const C_HEADER = "#1F5B86";
const C_TEXT = "#233548";
const C_SUB = "#5F7386";
const C_BORDER = "#C9D5DF";
const C_CARD = "#FFFFFF";
const C_MUTED = "#5F7386";
const C_PANEL_BLUE = "#1F5B86";
const HEADER_ICON_BG = "#2D6C97";
const HEADER_TITLE = "#FFFFFF";
const TEXT_BG = "#E8F1FD";
const BOTTOM_BAR_HEIGHT = 78;
const LS_POINTS_SELECTED_GROUP_ID = "gestionPoints.selectedGroupId";

const BLUE_FROM = "#D8ECFF";
const BLUE_TO = "#A8D8F5";
const GREEN_FROM = "#D8FBE7";
const GREEN_TO = "#A7F3D0";
const ORANGE_FROM = "#FFF1C7";
const ORANGE_TO = "#FDD58A";
const RED_FROM = "#FECACA";
const RED_TO = "#F87171";
const PURPLE_FROM = "#EDE9FE";
const PURPLE_TO = "#C4B5FD";

/* ======================= Helpers ======================= */
const defaultModes: ModesActifs = {
  tentatives: false,
  balises: true,
  parcours: false,
};

const getDisplayName = (row: any) => String(row?.nom ?? row?.name ?? "Sans nom");

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

const normalizeModes = (value: any): ModesActifs => {
  const obj = parseJsonObject(value);

  return {
    tentatives: !!obj?.tentatives,
    balises: !!obj?.balises,
    parcours: !!obj?.parcours,
  };
};

const shortCode = (name?: string | null) => {
  const n = (name || "").trim();
  const m = n.match(/(\d+\s*[A-Z])|(\d+[A-Z])/i);
  if (m) return m[0].replace(/\s+/g, "").toUpperCase();
  const letters = n.replace(/[^\p{L}\p{N}]/gu, "");
  return letters.slice(0, 3).toUpperCase() || "GP";
};

const hashIndex = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const getFolderParentId = (folder: FolderRow) =>
  (folder.parent_id ?? folder.parent_folder_id ?? null) as string | null;

const rowBelongsToTeacher = (row: any, currentTeacherId: string | null) => {
  if (!currentTeacherId) return false;
  const owner = row?.teacher_id ?? row?.professeur_id ?? row?.user_id ?? null;
  if (owner == null) return true;
  return String(owner) === String(currentTeacherId);
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

const readParcoursBonusOverrides = (row: any): Record<string, number> => {
  const config = parseJsonObject(row?.config);
  const settings = parseJsonObject(row?.settings_json);
  const sourceAssignments = parseJsonObject(row?.tentative_source_assignments);

  return {
    ...sanitizePointOverrides(settings?.parcours_bonus_overrides),
    ...sanitizePointOverrides(config?.parcours_bonus_overrides),
    ...sanitizePointOverrides(row?.parcours_bonus_overrides),
    ...sanitizePointOverrides(sourceAssignments?.parcours_bonus_overrides),
  };
};

const readParcoursBonusMode = (row: any): "general" | "personnalise" => {
  const config = parseJsonObject(row?.config);
  const settings = parseJsonObject(row?.settings_json);
  const mode =
    row?.parcours_bonus_mode ??
    config?.parcours_bonus_mode ??
    settings?.parcours_bonus_mode;

  return mode === "personnalise" ? "personnalise" : "general";
};

async function resolveTeacherId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

const getRowScore = (row: any) => {
  const modes = normalizeModes(row?.modes);
  const pointsParParcours =
    row?.points_par_parcours == null ? 0 : Number(row.points_par_parcours) || 0;
  const updatedAt = row?.updated_at ? new Date(row.updated_at).getTime() : 0;

  return (
    (modes.parcours ? 1_000_000 : 0) +
    (pointsParParcours > 0 ? 500_000 : 0) +
    (modes.balises ? 100_000 : 0) +
    (modes.tentatives ? 100_000 : 0) +
    pointsParParcours +
    updatedAt / 10_000_000_000
  );
};

const pickBestConfigRows = (rows: any[]) => {
  const byGroup: Record<string, any> = {};

  [...rows]
    .filter(Boolean)
    .sort((a, b) => getRowScore(b) - getRowScore(a))
    .forEach((row) => {
      const gid = String(row?.group_id ?? "");
      if (!gid || byGroup[gid]) return;
      byGroup[gid] = row;
    });

  return byGroup;
};

const pastelByMode = (
  mode: keyof ModesActifs
): {
  from: string;
  to: string;
  bgTint: string;
  borderTint: string;
  iconColor: string;
} => {
  switch (mode) {
    case "tentatives":
      return {
        from: PURPLE_FROM,
        to: PURPLE_TO,
        bgTint: "rgba(139,92,246,0.12)",
        borderTint: "rgba(139,92,246,0.28)",
        iconColor: "#6D28D9",
      };
    case "balises":
      return {
        from: BLUE_FROM,
        to: BLUE_TO,
        bgTint: "rgba(59,130,246,0.12)",
        borderTint: "rgba(59,130,246,0.28)",
        iconColor: "#1D4ED8",
      };
    case "parcours":
    default:
      return {
        from: GREEN_FROM,
        to: GREEN_TO,
        bgTint: "rgba(16,185,129,0.12)",
        borderTint: "rgba(16,185,129,0.28)",
        iconColor: "#047857",
      };
  }
};

const groupPalette = (id: string) => {
  const idx = hashIndex(id) % 4;
  switch (idx) {
    case 0:
      return {
        from: BLUE_FROM,
        to: BLUE_TO,
        bgTint: "rgba(59,130,246,0.10)",
        borderTint: "rgba(59,130,246,0.26)",
        text: "#1D4ED8",
      };
    case 1:
      return {
        from: GREEN_FROM,
        to: GREEN_TO,
        bgTint: "rgba(16,185,129,0.10)",
        borderTint: "rgba(16,185,129,0.26)",
        text: "#047857",
      };
    case 2:
      return {
        from: ORANGE_FROM,
        to: ORANGE_TO,
        bgTint: "rgba(245,158,11,0.10)",
        borderTint: "rgba(245,158,11,0.26)",
        text: "#B45309",
      };
    default:
      return {
        from: PURPLE_FROM,
        to: PURPLE_TO,
        bgTint: "rgba(139,92,246,0.10)",
        borderTint: "rgba(139,92,246,0.26)",
        text: "#6D28D9",
      };
  }
};

const getModeLabel = (modes: ModesActifs) => {
  const labels = [
    modes.balises ? "Balises" : null,
    modes.parcours ? "Parcours" : null,
    modes.tentatives ? "Tentatives" : null,
  ].filter(Boolean);

  return labels.length ? labels.join(" + ") : "Aucun mode";
};

const getPersonalisationPage = (mode: keyof ModesActifs) => {
  switch (mode) {
    case "parcours":
      return "personnalisationParcoursTermines";
    case "tentatives":
      return "personnalisationTentatives";
    case "balises":
    default:
      return "personnalisationBalises";
  }
};

/* ======================= Modal Info ======================= */
function InformationPoints({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={infoStyles.overlay}>
        <View style={infoStyles.card}>
          <View style={infoStyles.header}>
            <Text style={infoStyles.title}>Principe du calcul</Text>
            <TouchableOpacity onPress={onClose} style={infoStyles.closeBtn} activeOpacity={0.9}>
              <Feather name="x" size={22} color={C_TEXT} />
            </TouchableOpacity>
          </View>

          <View style={infoStyles.content}>
            <Text style={infoStyles.body}>• Balises : chaque balise validée donne ses points.</Text>
            <Text style={infoStyles.body}>
              • Parcours : le bonus est donné uniquement quand toutes les balises sont justes.
            </Text>
            <Text style={infoStyles.body}>
              • Tentatives : le barème choisi donne des points uniquement quand le parcours est terminé.
            </Text>
            <Text style={infoStyles.body}>Tu peux activer un seul mode ou les cumuler.</Text>
          </View>

          <TouchableOpacity activeOpacity={0.9} onPress={onClose} style={infoStyles.primaryBtn}>
            <Text style={infoStyles.primaryBtnText}>Compris</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/* ======================= Modal Choix classe ======================= */
function GroupPickerModal({
  visible,
  groups,
  selectedGroupId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  groups: GroupRow[];
  selectedGroupId: string | null;
  onClose: () => void;
  onSelect: (groupId: string) => void;
}) {
  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choisir la classe</Text>
            <TouchableOpacity activeOpacity={0.9} onPress={onClose} style={styles.modalCloseBtn}>
              <Feather name="x" size={20} color={C_TEXT} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 390 }} showsVerticalScrollIndicator={false}>
            {groups.map((group) => {
              const isSelected = selectedGroupId === group.id;
              const palette = groupPalette(group.id);

              return (
                <TouchableOpacity
                  key={group.id}
                  activeOpacity={0.92}
                  onPress={() => {
                    onSelect(group.id);
                    onClose();
                  }}
                  style={[
                    styles.modalOption,
                    {
                      borderColor: isSelected ? palette.borderTint : C_BORDER,
                      backgroundColor: isSelected ? palette.bgTint : "#FFFFFF",
                    },
                  ]}
                >
                  <View style={styles.modalOptionLeft}>
                    <LinearGradient
                      colors={[palette.from, palette.to]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.modalOptionAvatar}
                    >
                      <Text style={[styles.modalOptionAvatarText, { color: palette.text }]}> 
                        {shortCode(getDisplayName(group))}
                      </Text>
                    </LinearGradient>

                    <Text style={styles.modalOptionText}>{getDisplayName(group)}</Text>
                  </View>

                  {isSelected ? <Feather name="check" size={18} color="#059669" /> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ======================= Bouton mode ======================= */
function CompactModeButton({
  modeKey,
  label,
  icon,
  active,
  selected,
  onPress,
  widthPercent,
}: {
  modeKey: keyof ModesActifs;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  active: boolean;
  selected: boolean;
  onPress: () => void;
  widthPercent: DimensionValue;
}) {
  const palette = pastelByMode(modeKey);

  return (
    <View style={{ width: widthPercent, padding: 5 }}>
      <TouchableOpacity
        activeOpacity={0.92}
        onPress={onPress}
        style={[
          styles.compactModeCard,
          {
            borderColor: selected ? palette.iconColor : active ? palette.borderTint : C_BORDER,
            backgroundColor: selected ? palette.bgTint : "#FFFFFF",
            opacity: selected ? 1 : 0.45,
          },
          selected && styles.compactModeCardSelected,
        ]}
      >
        <View style={styles.compactModeInner}>
          <LinearGradient
            colors={[palette.from, palette.to]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.compactModeIcon}
          >
            <Feather name={icon} size={22} color={palette.iconColor} />
          </LinearGradient>

          <Text style={styles.compactModeLabel} numberOfLines={2}>
            {label}
          </Text>

          <View style={styles.modeStatusLineMini}>
            <View
              style={[
                styles.compactModeDot,
                { backgroundColor: active ? palette.iconColor : "#CBD5E1" },
              ]}
            />
            <Text style={[styles.modeStatusTextMini, { color: active ? palette.iconColor : C_MUTED }]}> 
              {active ? "Activé" : "Off"}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

/* ======================= Page ======================= */
export default function GestionPoints({ setPage }: Props) {
  const { width: winW, height: winH } = useWindowDimensions();
  const compactHeight = winH <= 820;
  const modeWidth: DimensionValue = "33.333%";
  const [selectedMode, setSelectedMode] = useState<keyof ModesActifs>("balises");

  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [perGroupConfigs, setPerGroupConfigs] = useState<Record<string, PerGroupConfig>>({});
  const [teacherId, setTeacherId] = useState<string | null>(null);

  const [allTentativePages, setAllTentativePages] = useState<TentativePageRow[]>([]);
  const [groupParcours, setGroupParcours] = useState<ParcoursRow[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingParcours, setIsLoadingParcours] = useState(false);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [modesActifs, setModesActifs] = useState<ModesActifs>(defaultModes);
  const [pointsParParcours, setPointsParParcours] = useState<number>(10);

  const [tentativePageMode, setTentativePageMode] = useState<TentativePageMode>("general");
  const [tentativePageDefault, setTentativePageDefault] = useState<number | null>(1);
  const [tentativePageAssignments, setTentativePageAssignments] = useState<Record<string, number>>({});

  const [showInfo, setShowInfo] = useState(false);
  const [showGroupPicker, setShowGroupPicker] = useState(false);

  const folderById = useMemo(
    () => Object.fromEntries(folders.map((f) => [String(f.id), f] as const)),
    [folders]
  );

  const pathOf = useCallback(
    (folderId?: string | null) => {
      if (!folderId) return "Sans dossier";
      const names: string[] = [];
      let current: FolderRow | undefined = folderById[folderId];

      while (current) {
        names.unshift(getDisplayName(current));
        const parentId = getFolderParentId(current);
        current = parentId ? folderById[parentId] : undefined;
      }

      return names.join(" / ") || "Sans dossier";
    },
    [folderById]
  );

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );

  const ownerTeacherId = useMemo(() => teacherId, [teacherId]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setScreenError(null);

    try {
      const authTeacherId = await resolveTeacherId();
      setTeacherId(authTeacherId);

      if (!authTeacherId) {
        setGroups([]);
        setFolders([]);
        setPerGroupConfigs({});
        setAllTentativePages([]);
        setSelectedGroupId(null);
        setScreenError("Impossible de retrouver le professeur connecté.");
        return;
      }

      const [groupsRes, foldersRes, configsRes, pagesRes] = await Promise.all([
        supabase
          .from("groups")
          .select("*")
          .eq("teacher_id", authTeacherId)
          .order("created_at", { ascending: true }),
        supabase.from("folders").select("*").order("created_at", { ascending: true }),
        supabase
          .from("group_points_configs")
          .select("*")
          .eq("professeur_id", authTeacherId)
          .order("updated_at", { ascending: false, nullsFirst: false }),
        supabase
          .from("group_tentative_bareme_pages")
          .select("id, teacher_id, page_number, page_name, created_at")
          .eq("teacher_id", authTeacherId)
          .order("page_number", { ascending: true }),
      ]);

      if (groupsRes.error) throw groupsRes.error;
      if (foldersRes.error) throw foldersRes.error;
      if (configsRes.error) throw configsRes.error;
      if (pagesRes.error) throw pagesRes.error;

      const nextGroups = ((groupsRes.data ?? []) as any[])
        .filter((g) => rowBelongsToTeacher(g, authTeacherId))
        .map((g: any) => ({
          ...g,
          nom: getDisplayName(g),
        })) as GroupRow[];

      const nextFolders = ((foldersRes.data ?? []) as any[])
        .filter((f) => rowBelongsToTeacher(f, authTeacherId))
        .map((f: any) => ({
          ...f,
          nom: getDisplayName(f),
        })) as FolderRow[];

      const nextPages = ((pagesRes.data ?? []) as any[]).map((p) => ({
        id: String(p.id),
        teacher_id: String(p.teacher_id),
        page_number: Number(p.page_number ?? 1),
        page_name: String(p.page_name || `PAGE ${Number(p.page_number ?? 1)}`),
        created_at: p.created_at ?? null,
      })) as TentativePageRow[];

      const visibleGroupIds = new Set(nextGroups.map((g) => String(g.id)));
      const bestRowsByGroup = pickBestConfigRows(
        ((configsRes.data ?? []) as any[]).filter(
          (row) =>
            String(row?.professeur_id ?? "") === String(authTeacherId) &&
            visibleGroupIds.has(String(row?.group_id ?? ""))
        )
      );

      const nextConfigs = Object.entries(bestRowsByGroup).reduce(
        (acc: Record<string, PerGroupConfig>, [gid, row]: [string, any]) => {
          acc[gid] = {
            modes: normalizeModes(row.modes),
            pointsParParcours:
              row.points_par_parcours == null ? null : Number(row.points_par_parcours) || 0,
            parcoursBonusMode: readParcoursBonusMode(row),
            parcoursBonusOverrides: readParcoursBonusOverrides(row),
            tentativePageMode:
              row.tentative_page_mode === "personnalise" ? "personnalise" : "general",
            tentativePageDefault:
              row.tentative_page_default == null
                ? null
                : Number(row.tentative_page_default) || null,
            tentativePageAssignments: sanitizeAssignments(row.tentative_page_assignments),
            updatedAt: row.updated_at ?? null,
            professeurId: row.professeur_id ?? null,
          };
          return acc;
        },
        {}
      );

      setGroups(nextGroups);
      setFolders(nextFolders);
      setPerGroupConfigs(nextConfigs);
      setAllTentativePages(nextPages);
      setSelectedGroupId((prev) =>
        prev && visibleGroupIds.has(prev) ? prev : nextGroups[0]?.id ?? null
      );
    } catch (err: any) {
      console.error("Erreur chargement GestionPoints :", err);
      setScreenError(`Impossible de charger la page : ${err?.message ?? "erreur inconnue"}.`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!selectedGroupId) return;
    AsyncStorage.setItem(LS_POINTS_SELECTED_GROUP_ID, selectedGroupId).catch(() => null);
    const cfg = perGroupConfigs[selectedGroupId];

    if (cfg) {
      setModesActifs(normalizeModes(cfg.modes));
      setPointsParParcours(cfg.pointsParParcours ?? 10);
      setTentativePageMode(cfg.tentativePageMode ?? "general");
      setTentativePageDefault(cfg.tentativePageDefault ?? allTentativePages[0]?.page_number ?? 1);
      setTentativePageAssignments(cfg.tentativePageAssignments ?? {});
    } else {
      setModesActifs(defaultModes);
      setPointsParParcours(10);
      setTentativePageMode("general");
      setTentativePageDefault(allTentativePages[0]?.page_number ?? 1);
      setTentativePageAssignments({});
    }
  }, [selectedGroupId, perGroupConfigs, allTentativePages]);

  const fetchGroupParcours = useCallback(
    async (groupId: string) => {
      setIsLoadingParcours(true);

      try {
        if (!ownerTeacherId) {
          setGroupParcours([]);
          return;
        }

        const { data: parcoursRows, error: parcoursError } = await supabase
          .from("parcours")
          .select("*")
          .order("created_at", { ascending: true });

        if (parcoursError) throw parcoursError;

        const list = ((parcoursRows ?? []) as any[])
          .filter((p) => rowBelongsToTeacher(p, ownerTeacherId))
          .filter((p) => {
            const raw = p.groupes_associes;
            if (Array.isArray(raw)) return raw.map(String).includes(groupId);
            if (typeof raw === "string") return raw.includes(groupId);
            return false;
          })
          .map((p) => ({
            ...p,
            id: String(p.id),
            nom: getDisplayName(p),
            name: getDisplayName(p),
            created_at: p.created_at ?? null,
          })) as ParcoursRow[];

        setGroupParcours(list);

        setTentativePageAssignments((prev) => {
          const next = { ...prev };

          list.forEach((p) => {
            if (!next[p.id] && allTentativePages.length > 0) {
              next[p.id] = allTentativePages[0].page_number;
            }
          });

          Object.keys(next).forEach((key) => {
            if (!list.some((p) => p.id === key)) delete next[key];
          });

          return next;
        });

        setTentativePageDefault((prev) => {
          if (prev && allTentativePages.some((p) => p.page_number === prev)) return prev;
          return allTentativePages[0]?.page_number ?? null;
        });
      } catch (err) {
        console.error("Erreur chargement des parcours de la classe :", err);
        setGroupParcours([]);
      } finally {
        setIsLoadingParcours(false);
      }
    },
    [allTentativePages, ownerTeacherId]
  );

  useEffect(() => {
    if (!selectedGroupId) {
      setGroupParcours([]);
      return;
    }
    fetchGroupParcours(selectedGroupId);
  }, [fetchGroupParcours, selectedGroupId]);

  const selectedGroupPath = useMemo(
    () => pathOf(selectedGroup?.folder_id),
    [selectedGroup, pathOf]
  );

  const totalConfigured = useMemo(
    () => groups.filter((g) => !!perGroupConfigs[g.id]).length,
    [groups, perGroupConfigs]
  );

  const selectedConfigured = !!(selectedGroupId && perGroupConfigs[selectedGroupId]);

  const canSaveTentativeConfig = useMemo(() => {
    if (!modesActifs.tentatives) return true;
    if (allTentativePages.length === 0) return false;

    if (tentativePageMode === "general") {
      return Number.isFinite(tentativePageDefault || NaN) && Number(tentativePageDefault) >= 1;
    }

    if (groupParcours.length === 0) return true;

    return groupParcours.every((p) => {
      const n = tentativePageAssignments[p.id];
      return Number.isFinite(n) && n >= 1;
    });
  }, [
    allTentativePages.length,
    groupParcours,
    modesActifs.tentatives,
    tentativePageAssignments,
    tentativePageDefault,
    tentativePageMode,
  ]);

  const hasAtLeastOneMode = modesActifs.balises || modesActifs.parcours || modesActifs.tentatives;

  const canSave =
    !!selectedGroupId &&
    !!ownerTeacherId &&
    !!teacherId &&
    String(ownerTeacherId) === String(teacherId) &&
    hasAtLeastOneMode &&
    (!modesActifs.parcours ||
      (Number.isFinite(pointsParParcours) && Number(pointsParParcours) >= 0)) &&
    canSaveTentativeConfig;

  const toggleMode = (modeId: keyof ModesActifs) => {
    setModesActifs((prev) => ({
      ...prev,
      [modeId]: !prev[modeId],
    }));
  };

  const handleSave = useCallback(async () => {
    if (!canSave || !selectedGroupId || !teacherId) return;

    setIsSaving(true);

    try {
      const cleanedAssignments =
        tentativePageMode === "personnalise"
          ? Object.fromEntries(
              Object.entries(tentativePageAssignments).filter(([_, v]) => {
                const n = Number(v);
                return Number.isFinite(n) && n >= 1;
              })
            )
          : {};

      const payload = {
        group_id: selectedGroupId,
        professeur_id: teacherId,
        modes: {
          tentatives: !!modesActifs.tentatives,
          balises: !!modesActifs.balises,
          parcours: !!modesActifs.parcours,
        },
        points_par_parcours: modesActifs.parcours ? Number(pointsParParcours) || 0 : 0,
        parcours_bonus_mode:
          perGroupConfigs[selectedGroupId]?.parcoursBonusMode ??
          (Object.keys(perGroupConfigs[selectedGroupId]?.parcoursBonusOverrides ?? {}).length
            ? "personnalise"
            : "general"),
        tentative_page_mode: modesActifs.tentatives ? tentativePageMode : "general",
        tentative_page_default:
          modesActifs.tentatives && tentativePageMode === "general"
            ? Number(tentativePageDefault) || 1
            : null,
        tentative_page_assignments:
          modesActifs.tentatives && tentativePageMode === "personnalise"
            ? cleanedAssignments
            : {},
        tentative_source_parcours_id: null,
        tentative_source_assignments: {
          parcours_bonus_overrides: perGroupConfigs[selectedGroupId]?.parcoursBonusOverrides ?? {},
        },
        updated_at: new Date().toISOString(),
      };

      const { error: deleteError } = await supabase
        .from("group_points_configs")
        .delete()
        .eq("group_id", selectedGroupId)
        .eq("professeur_id", teacherId);

      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase.from("group_points_configs").insert(payload);
      if (insertError) throw insertError;

      setPerGroupConfigs((prev) => ({
        ...prev,
        [selectedGroupId]: {
          modes: normalizeModes(payload.modes),
          pointsParParcours: payload.points_par_parcours,
          parcoursBonusMode: payload.parcours_bonus_mode as "general" | "personnalise",
          parcoursBonusOverrides: perGroupConfigs[selectedGroupId]?.parcoursBonusOverrides ?? {},
          tentativePageMode: payload.tentative_page_mode,
          tentativePageDefault: payload.tentative_page_default,
          tentativePageAssignments: sanitizeAssignments(payload.tentative_page_assignments),
          updatedAt: payload.updated_at,
          professeurId: payload.professeur_id,
        },
      }));

      Alert.alert(
        "Configuration enregistrée",
        `Configuration enregistrée pour "${getDisplayName(selectedGroup)}".`
      );
    } catch (err: any) {
      console.error("Erreur sauvegarde GestionPoints :", err);
      Alert.alert(
        "Erreur",
        `Impossible d'enregistrer dans Supabase.\n\n${err?.message ?? "Erreur inconnue"}`
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    canSave,
    modesActifs,
    pointsParParcours,
    selectedGroup,
    selectedGroupId,
    teacherId,
    tentativePageAssignments,
    tentativePageDefault,
    tentativePageMode,
  ]);

  const hasNoData = !isLoading && !screenError && groups.length === 0;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: C_BG }]}> 
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setPage("gestionResultats")}
          style={styles.topIconButton}
        >
          <Feather name="arrow-left" size={20} color={HEADER_TITLE} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Attribution des points</Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setShowInfo(true)}
          style={styles.topIconButton}
        >
          <Feather name="info" size={20} color={HEADER_TITLE} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: winW >= 768 ? 16 : 12,
          paddingTop: 12,
          paddingBottom: BOTTOM_BAR_HEIGHT + 74,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.stateTitle}>Chargement...</Text>
            <Text style={styles.stateText}>Récupération des classes et des configurations.</Text>
          </View>
        ) : screenError ? (
          <View style={styles.stateCard}>
            <LinearGradient colors={[RED_FROM, RED_TO]} style={styles.stateBadge}>
              <Feather name="alert-circle" size={24} color="#1F2937" />
            </LinearGradient>
            <Text style={styles.stateTitle}>Erreur</Text>
            <Text style={styles.stateText}>{screenError}</Text>
            <TouchableOpacity activeOpacity={0.92} onPress={fetchData} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        ) : hasNoData ? (
          <View style={styles.stateCard}>
            <LinearGradient colors={[ORANGE_FROM, ORANGE_TO]} style={styles.stateBadge}>
              <Feather name="info" size={24} color="#1F2937" />
            </LinearGradient>
            <Text style={styles.stateTitle}>Aucune classe trouvée</Text>
            <Text style={styles.stateText}>Aucune classe n'est liée au professeur connecté.</Text>
          </View>
        ) : (
          <>
            <View style={[styles.sectionCard, styles.compactCard]}>
              <View style={styles.sectionTopRow}>
                <Text style={styles.sectionTitle}>Classe cible</Text>

                <TouchableOpacity
                  activeOpacity={0.92}
                  onPress={() => setShowGroupPicker(true)}
                  style={styles.targetChip}
                >
                  <Feather name="users" size={14} color="#1D4ED8" />
                  <Text style={styles.targetChipText} numberOfLines={1}>
                    {selectedGroup ? getDisplayName(selectedGroup) : "Choisir"}
                  </Text>
                  <Feather name="chevron-down" size={14} color="#1D4ED8" />
                </TouchableOpacity>
              </View>

              {!selectedGroup ? (
                <Text style={styles.helperText}>
                  Sélectionne une classe pour afficher sa configuration.
                </Text>
              ) : null}
            </View>

            <View style={[styles.sectionCard, styles.compactCard]}>
              <View style={styles.sectionTopRow}>
                <View>
                  <Text style={styles.sectionTitle}>Modes de calcul</Text>
                  <Text style={styles.sectionSubSmall}>Active puis personnalise chaque mode</Text>
                </View>
              </View>

              <View style={styles.modesRow}> 
                <CompactModeButton
                  modeKey="balises"
                  label="Balises"
                  icon="tag"
                  active={modesActifs.balises}
                  selected={selectedMode === "balises"}
                  onPress={() => setSelectedMode("balises")}
                  widthPercent={modeWidth}
                />
                <CompactModeButton
                  modeKey="parcours"
                  label="Parcours terminé"
                  icon="award"
                  active={modesActifs.parcours}
                  selected={selectedMode === "parcours"}
                  onPress={() => setSelectedMode("parcours")}
                  widthPercent={modeWidth}
                />
                <CompactModeButton
                  modeKey="tentatives"
                  label="Tentatives"
                  icon="target"
                  active={modesActifs.tentatives}
                  selected={selectedMode === "tentatives"}
                  onPress={() => setSelectedMode("tentatives")}
                  widthPercent={modeWidth}
                />
              </View>

              <View style={styles.selectedModePanel}>
                <View style={styles.selectedModePanelHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectedModeTitle}>
                      {selectedMode === "balises"
                        ? "Balises"
                        : selectedMode === "parcours"
                        ? "Parcours terminé"
                        : "Tentatives"}
                    </Text>
                    <Text style={styles.selectedModeSub}>
                      {selectedMode === "balises"
                        ? "Chaque balise validée donne ses points."
                        : selectedMode === "parcours"
                        ? "Ajoute un bonus si tout est juste."
                        : "Choisis le barème des essais."}
                    </Text>
                  </View>

                  <View style={styles.selectedModeActions}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => toggleMode(selectedMode)}
                      style={[
                        styles.modeToggleBtn,
                        modesActifs[selectedMode] && styles.modeToggleBtnActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modeToggleBtnText,
                          modesActifs[selectedMode] && styles.modeToggleBtnTextActive,
                        ]}
                      >
                        {modesActifs[selectedMode] ? "Activé" : "Désactivé"}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => {
                        if (selectedGroupId) {
                          AsyncStorage.setItem(LS_POINTS_SELECTED_GROUP_ID, selectedGroupId).catch(() => null);
                        }
                        setPage(getPersonalisationPage(selectedMode));
                      }}
                      style={styles.customizeModeBtn}
                    >
                      <Feather name="sliders" size={14} color={HEADER_TITLE} />
                      <Text style={styles.customizeModeBtnText}>Personnaliser</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {selectedMode === "parcours" && modesActifs.parcours ? (
                  <View style={styles.selectedModeSettingRow}>
                    <Text style={styles.cardInlineLabel}>Bonus</Text>
                    <View style={styles.inlineInputWrap}>
                      <TextInput
                        value={String(pointsParParcours)}
                        onChangeText={(txt) => {
                          const cleaned = txt.replace(/[^0-9]/g, "");
                          const n = parseInt(cleaned || "0", 10);
                          setPointsParParcours(Number.isFinite(n) ? n : 0);
                        }}
                        keyboardType="numeric"
                        style={styles.inlineInput}
                      />
                      <Text style={styles.inlineInputUnit}>pts</Text>
                    </View>
                  </View>
                ) : null}
              </View>

              {!hasAtLeastOneMode ? (
                <Text style={styles.warningText}>
                  Active au moins un mode pour pouvoir enregistrer.
                </Text>
              ) : null}
            </View>

            {!compactHeight ? (
              <View style={styles.statsPanel}>
                <View style={styles.statsPanelHeader}>
                  <Feather name="bar-chart-2" size={20} color="#BFD2FF" />
                  <Text style={styles.statsPanelTitle}>Résumé</Text>
                </View>

                <View style={styles.statsGridHorizontal}>
                  <View style={styles.statsMiniBlock}>
                    <Text style={styles.statsMiniLabel}>Classes</Text>
                    <Text style={styles.statsMiniValue}>{groups.length}</Text>
                  </View>

                  <View style={styles.statsMiniBlock}>
                    <Text style={styles.statsMiniLabel}>Configurées</Text>
                    <Text style={styles.statsMiniValue}>{totalConfigured}</Text>
                  </View>

                  <View style={styles.statsMiniBlock}>
                    <Text style={styles.statsMiniLabel}>Parcours liés</Text>
                    <Text style={styles.statsMiniValue}>{groupParcours.length}</Text>
                  </View>
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <View style={styles.bottomActionBar}>
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={handleSave}
          disabled={!canSave || isSaving}
          style={[styles.saveButton, (!canSave || isSaving) && { opacity: 0.55 }]}
        >
          <LinearGradient
            colors={[C_HEADER, HEADER_ICON_BG]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.saveButtonInner}
          >
            {isSaving ? (
              <ActivityIndicator color={HEADER_TITLE} />
            ) : (
              <Feather name="save" size={17} color={HEADER_TITLE} />
            )}
            <Text style={styles.saveButtonText}>
              {isSaving ? "Enregistrement..." : "Enregistrer"}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <GroupPickerModal
        visible={showGroupPicker}
        groups={groups}
        selectedGroupId={selectedGroupId}
        onClose={() => setShowGroupPicker(false)}
        onSelect={setSelectedGroupId}
      />

      <InformationPoints visible={showInfo} onClose={() => setShowInfo(false)} />
      <BottomBar currentPage="gestionResultats" onNavigate={setPage} />
    </SafeAreaView>
  );
}

/* ======================= Styles ======================= */
const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    backgroundColor: C_HEADER,
    minHeight: 78,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerCenter: { flex: 1 },
  headerTitle: {
    color: HEADER_TITLE,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  topIconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: HEADER_ICON_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  sectionCard: {
    backgroundColor: C_CARD,
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    shadowColor: "rgba(0,0,0,0.10)",
    shadowOpacity: 0.14,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 2,
  },
  compactCard: { paddingTop: 10, paddingBottom: 10 },

  sectionTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  sectionTitle: { color: C_TEXT, fontSize: 16, fontWeight: "800" },
  sectionSubSmall: {
    color: C_SUB,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },

  targetChip: {
    minHeight: 36,
    maxWidth: "56%",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: TEXT_BG,
    borderWidth: 1,
    borderColor: C_BORDER,
  },
  targetChipText: {
    color: C_HEADER,
    fontWeight: "900",
    fontSize: 12,
    flexShrink: 1,
  },

  helperText: { color: C_SUB, fontSize: 12, fontWeight: "600" },
  warningText: {
    color: "#B45309",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
  },

  modesRow: { flexDirection: "row", flexWrap: "nowrap", marginHorizontal: -5 },
  compactModeCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 6,
    minHeight: 126,
    shadowColor: "rgba(0,0,0,0.08)",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 7,
    elevation: 2,
  },
  compactModeInner: {
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    minHeight: 112,
  },
  compactModeCardSelected: {
    borderWidth: 2.5,
    shadowColor: "rgba(31,91,134,0.28)",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 10,
    elevation: 4,
  },
  compactModeIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  compactModeLabel: {
    color: C_TEXT,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
    minHeight: 28,
  },
  compactModeDot: { width: 8, height: 8, borderRadius: 999 },
  modeStatusLineMini: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
  },
  modeStatusTextMini: { fontSize: 10, fontWeight: "900" },

  cardInlineLabel: {
    color: C_TEXT,
    fontSize: 13,
    fontWeight: "900",
  },
  selectedModePanel: {
    marginTop: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#F8FAFC",
    padding: 12,
  },
  selectedModePanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  selectedModeActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  selectedModeTitle: {
    color: C_TEXT,
    fontSize: 15,
    fontWeight: "900",
  },
  selectedModeSub: {
    color: C_SUB,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
    lineHeight: 16,
  },
  modeToggleBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  modeToggleBtnActive: {
    backgroundColor: TEXT_BG,
    borderColor: C_HEADER,
  },
  modeToggleBtnText: {
    color: C_MUTED,
    fontSize: 12,
    fontWeight: "900",
  },
  modeToggleBtnTextActive: {
    color: C_HEADER,
  },
  customizeModeBtn: {
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C_HEADER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  customizeModeBtnText: {
    color: HEADER_TITLE,
    fontSize: 12,
    fontWeight: "900",
  },
  selectedModeSettingRow: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(95,115,134,0.14)",
    paddingTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  inlineInputWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  inlineInput: {
    width: 64,
    textAlign: "center",
    color: C_TEXT,
    fontWeight: "800",
    fontSize: 15,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.26)",
    borderRadius: 11,
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === "web" ? 8 : 7,
  },
  inlineInputUnit: { color: C_TEXT, fontSize: 13, fontWeight: "800" },

  stateCard: {
    backgroundColor: C_CARD,
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    alignItems: "center",
    shadowColor: "rgba(0,0,0,0.10)",
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 2,
  },
  stateBadge: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  stateTitle: { color: C_TEXT, fontSize: 17, fontWeight: "800", textAlign: "center" },
  stateText: {
    color: C_SUB,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 8,
  },
  retryBtn: {
    marginTop: 14,
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  statsPanel: {
    marginTop: 2,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: C_PANEL_BLUE,
    shadowColor: "rgba(0,0,0,0.18)",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
  },
  statsPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  statsPanelTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  statsGridHorizontal: { flexDirection: "row", paddingHorizontal: 12, paddingBottom: 14, gap: 10 },
  statsMiniBlock: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  statsMiniLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 4,
  },
  statsMiniValue: { color: "#A7F3D0", fontSize: 24, fontWeight: "900", textAlign: "center" },

  bottomActionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: BOTTOM_BAR_HEIGHT - 4,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  saveButton: {
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "rgba(0,0,0,0.14)",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 3,
  },
  saveButtonInner: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  saveButtonText: { color: HEADER_TITLE, fontWeight: "900", fontSize: 15 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.28)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
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
  modalTitle: { color: C_TEXT, fontSize: 17, fontWeight: "800" },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalOption: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalOptionLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  modalOptionAvatar: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOptionAvatarText: { fontSize: 11, fontWeight: "900" },
  modalOptionText: { color: C_TEXT, fontSize: 14, fontWeight: "700" },
});

/* ======================= Styles modal info ======================= */
const infoStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.28)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 18,
    shadowColor: "rgba(0,0,0,0.18)",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { flex: 1, color: C_TEXT, fontSize: 19, fontWeight: "800" },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { marginTop: 14, marginBottom: 16 },
  body: { color: C_TEXT, fontSize: 15, lineHeight: 22, marginBottom: 10 },
  primaryBtn: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "800" },
});
