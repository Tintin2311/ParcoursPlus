// src/GestionAssociationsParcours.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import BottomBar from "./ui/BottomBar";
import { Feather } from "@expo/vector-icons";
import { supabase } from "./supabaseClient";

/* ======================= Types ======================= */
type Props = {
  professeur?: any;
  setPage: (page: string) => void;
};

type ParcoursRow = {
  id: string;
  nom?: string | null;
  name?: string | null;
  folder_id?: string | null;
  groupes_associes?: any;
  created_at?: string | null;
  [key: string]: any;
};

type FolderRow = {
  id: string;
  nom?: string | null;
  name?: string | null;
  parent_folder_id?: string | null;
  parent_id?: string | null;
  groupes_associes?: any;
  created_at?: string | null;
  [key: string]: any;
};

type GroupRow = {
  id: string;
  nom?: string | null;
  name?: string | null;
  folder_id?: string | null;
  created_at?: string | null;
  type?: "classe" | "groupe_session";
  code?: string | null;
  student_ids?: string[] | null;
  [key: string]: any;
};

type RenderedItem =
  | (FolderRow & { type: "dossier"; indentation: number; nomAffiche: string })
  | (ParcoursRow & { type: "parcours"; indentation: number; nomAffiche: string });

type SavingStatusMap = Record<string, "saving" | "saved" | "error" | null>;

type AssocStatus =
  | "full"
  | "partial"
  | "empty"
  | "not_associated"
  | "parcours_on"
  | "parcours_off";

/* ======================= Thème ======================= */
const C_BG = "#EDF2F6";
const C_HEADER = "#1F5B86";
const C_HEADER_ICON = "#2D6C97";
const C_TEXT = "#233548";
const C_SUB = "#6B7E8E";
const C_BORDER = "#C9D5DF";
const C_CARD = "#FFFFFF";
const C_MUTED = "#6B7E8E";
const C_PANEL_BLUE = "#1F5B86";
const BOTTOM_BAR_HEIGHT = 78;

const BLUE_FROM = "#E7F2FA";
const BLUE_TO = "#CFE0EC";
const GREEN_FROM = "#D8F5EA";
const GREEN_TO = "#A7F3D0";
const ORANGE_FROM = "#FFE8B5";
const ORANGE_TO = "#FDBA74";
const RED_FROM = "#FCA5A5";
const RED_TO = "#F87171";
const PURPLE_FROM = "#F0EAFE";
const PURPLE_TO = "#DDD6FE";

/* ======================= Modal Info ======================= */
const INFO_PAGES = [
  {
    title: "À quoi sert cette page ?",
    body: [
      "Cette page permet de choisir quels dossiers et parcours sont visibles pour une classe ou un groupe.",
      "Tu peux comparer une source avec une cible.",
      "Tu peux copier rapidement la configuration d'une classe ou d'un groupe vers un autre.",
    ],
  },
  {
    title: "Lecture rapide du tableau",
    body: [
      "🟦 Parcours coché = visible pour la classe ou le groupe.",
      "🟩 Dossier complet = tous ses parcours sont visibles.",
      "🟧 Dossier partiel = seulement une partie des parcours est visible.",
      "⬜ Non coché = retiré.",
    ],
  },
  {
    title: "Choix des classes et groupes",
    body: [
      "Les classes sont rangées dans leurs dossiers et sous-dossiers.",
      "La même source ne peut pas être choisie à la fois en source et en cible.",
      "Les dossiers du picker sont fermés par défaut.",
    ],
  },
];

function InformationAssociations({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const page = INFO_PAGES[pageIndex];

  useEffect(() => {
    if (visible) setPageIndex(0);
  }, [visible]);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={infoStyles.overlay}>
        <View style={infoStyles.card}>
          <View style={infoStyles.header}>
            <Text style={infoStyles.title}>{page.title}</Text>
            <TouchableOpacity onPress={onClose} style={infoStyles.closeBtn} activeOpacity={0.9}>
              <Feather name="x" size={22} color={C_TEXT} />
            </TouchableOpacity>
          </View>

          <View style={infoStyles.pageBadge}>
            <Text style={infoStyles.pageBadgeText}>
              Page {pageIndex + 1} / {INFO_PAGES.length}
            </Text>
          </View>

          <View style={infoStyles.content}>
            {page.body.map((line, index) => (
              <Text key={index} style={infoStyles.body}>
                {line}
              </Text>
            ))}
          </View>

          <View style={infoStyles.dotsRow}>
            {INFO_PAGES.map((_, idx) => (
              <View key={idx} style={[infoStyles.dot, idx === pageIndex && infoStyles.dotActive]} />
            ))}
          </View>

          <View style={infoStyles.actions}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setPageIndex((p) => Math.max(0, p - 1))}
              disabled={pageIndex === 0}
              style={[infoStyles.secondaryBtn, pageIndex === 0 && infoStyles.btnDisabled]}
            >
              <Text style={infoStyles.secondaryBtnText}>Précédent</Text>
            </TouchableOpacity>

            {pageIndex < INFO_PAGES.length - 1 ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setPageIndex((p) => Math.min(INFO_PAGES.length - 1, p + 1))}
                style={infoStyles.primaryBtn}
              >
                <Text style={infoStyles.primaryBtnText}>Suivant</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity activeOpacity={0.9} onPress={onClose} style={infoStyles.primaryBtn}>
                <Text style={infoStyles.primaryBtnText}>Fermer</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ======================= Helpers ======================= */
const cleanId = (value: any): string | null => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const sameId = (a: any, b: any) => {
  const aa = cleanId(a);
  const bb = cleanId(b);
  return aa !== null && bb !== null && aa === bb;
};

const normalizeGroupesAssocies = (value: any): string[] => {
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

const sameStringArray = (a: string[], b: string[]) => {
  const aa = [...new Set(a)].sort();
  const bb = [...new Set(b)].sort();
  return JSON.stringify(aa) === JSON.stringify(bb);
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isDeadlockLikeError = (err: any) => {
  const message = String(err?.message ?? err?.details ?? err?.hint ?? "").toLowerCase();
  const code = String(err?.code ?? "");
  return code === "40P01" || message.includes("deadlock") || message.includes("sharelock");
};

const withOrWithoutGroup = (currentValue: any, groupeId: string, shouldAdd: boolean) => {
  const current = normalizeGroupesAssocies(currentValue);
  return shouldAdd
    ? [...new Set([...current, groupeId])]
    : current.filter((id) => id !== groupeId);
};

const pastelByStatus = (status: AssocStatus) => {
  switch (status) {
    case "full":
      return {
        from: GREEN_FROM,
        to: GREEN_TO,
        bgTint: "rgba(16,185,129,0.10)",
        borderTint: "rgba(16,185,129,0.28)",
        iconColor: "#166534",
      };
    case "partial":
      return {
        from: ORANGE_FROM,
        to: ORANGE_TO,
        bgTint: "rgba(245,158,11,0.10)",
        borderTint: "rgba(245,158,11,0.28)",
        iconColor: "#B45309",
      };
    case "empty":
      return {
        from: "#E2E8F0",
        to: "#CBD5E1",
        bgTint: "rgba(148,163,184,0.12)",
        borderTint: "rgba(148,163,184,0.22)",
        iconColor: "#64748B",
      };
    case "parcours_on":
      return {
        from: BLUE_FROM,
        to: BLUE_TO,
        bgTint: "rgba(59,130,246,0.10)",
        borderTint: "rgba(59,130,246,0.28)",
        iconColor: "#1D4ED8",
      };
    default:
      return {
        from: "#E2E8F0",
        to: "#CBD5E1",
        bgTint: "rgba(148,163,184,0.10)",
        borderTint: "rgba(148,163,184,0.20)",
        iconColor: "#64748B",
      };
  }
};

const getDisplayName = (row: any) => String(row?.nom ?? row?.name ?? "Sans nom");

const getParentFolderId = (folder: FolderRow) =>
  cleanId(folder.parent_folder_id ?? folder.parent_id ?? null);

const shortCode = (name?: string | null) => {
  const n = (name || "").trim();
  const m = n.match(/(\d+\s*[A-Z])|(\d+[A-Z])/i);
  if (m) return m[0].replace(/\s+/g, "").toUpperCase();
  const letters = n.replace(/[^\p{L}\p{N}]/gu, "");
  return letters.slice(0, 3).toUpperCase() || "GP";
};

const groupPalette = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;

  switch (Math.abs(h) % 4) {
    case 0:
      return {
        from: BLUE_FROM,
        to: BLUE_TO,
        text: "#1D4ED8",
        tint: "rgba(59,130,246,0.10)",
        border: "rgba(59,130,246,0.26)",
      };
    case 1:
      return {
        from: GREEN_FROM,
        to: GREEN_TO,
        text: "#047857",
        tint: "rgba(16,185,129,0.10)",
        border: "rgba(16,185,129,0.26)",
      };
    case 2:
      return {
        from: ORANGE_FROM,
        to: ORANGE_TO,
        text: "#B45309",
        tint: "rgba(245,158,11,0.10)",
        border: "rgba(245,158,11,0.26)",
      };
    default:
      return {
        from: PURPLE_FROM,
        to: PURPLE_TO,
        text: "#6D28D9",
        tint: "rgba(139,92,246,0.10)",
        border: "rgba(139,92,246,0.26)",
      };
  }
};

/* ======================= Picker hiérarchique des classes et groupes ======================= */
function GroupPickerModal({
  visible,
  title,
  groups,
  folders,
  selectedId,
  forbiddenId,
  allowNone,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  groups: GroupRow[];
  folders: FolderRow[];
  selectedId: string | null;
  forbiddenId?: string | null;
  allowNone?: boolean;
  onClose: () => void;
  onSelect: (id: string | null) => void;
}) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    setExpandedFolders(new Set());
  }, [visible]);

  const topFolders = useMemo(
    () => folders.filter((f) => getParentFolderId(f) == null),
    [folders]
  );

  const getChildFolders = useCallback(
    (folderId: string | null) => folders.filter((f) => getParentFolderId(f) === cleanId(folderId)),
    [folders]
  );

  const getGroupsInFolder = useCallback(
    (folderId: string | null) => groups.filter((g) => cleanId(g.folder_id) === cleanId(folderId)),
    [groups]
  );

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });
  };

  const renderGroupOption = (group: GroupRow, depth: number) => {
    const selected = selectedId === group.id;
    const disabled = forbiddenId === group.id;
    const palette = groupPalette(group.id);

    return (
      <TouchableOpacity
        key={`group-${group.id}`}
        activeOpacity={disabled ? 1 : 0.92}
        disabled={disabled}
        onPress={() => {
          if (disabled) return;
          onSelect(group.id);
          onClose();
        }}
        style={[
          styles.modalOption,
          { marginLeft: depth * 14, opacity: disabled ? 0.45 : 1 },
          selected && { borderColor: palette.border, backgroundColor: palette.tint },
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
              {group.type === "groupe_session" ? "GR" : shortCode(getDisplayName(group))}
            </Text>
          </LinearGradient>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.modalOptionText} numberOfLines={1}>
              {getDisplayName(group)}
            </Text>
            {group.type === "groupe_session" ? (
              <Text style={styles.modalOptionSubText} numberOfLines={1}>
                Groupe · {group.student_ids?.length ?? 0} élèves
              </Text>
            ) : null}
          </View>
        </View>

        {disabled ? (
          <Feather name="slash" size={18} color="#94A3B8" />
        ) : selected ? (
          <Feather name="check" size={18} color="#059669" />
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderFolderTree = (folder: FolderRow, depth: number): React.ReactNode => {
    const isOpen = expandedFolders.has(folder.id);

    return (
      <View key={`folder-${folder.id}`}>
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => toggleFolder(folder.id)}
          style={[styles.pickerFolderRow, { marginLeft: depth * 14 }]}
        >
          <View style={styles.pickerFolderLeft}>
            <LinearGradient
              colors={["#E2E8F0", "#CBD5E1"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.pickerFolderIcon}
            >
              <Feather name={isOpen ? "folder-minus" : "folder"} size={16} color="#64748B" />
            </LinearGradient>

            <Text style={styles.pickerFolderText} numberOfLines={1}>
              {getDisplayName(folder)}
            </Text>
          </View>

          <Feather name={isOpen ? "chevron-down" : "chevron-right"} size={16} color={C_MUTED} />
        </TouchableOpacity>

        {isOpen ? (
          <View>
            {getGroupsInFolder(folder.id).map((group) => renderGroupOption(group, depth + 1))}
            {getChildFolders(folder.id).map((child) => renderFolderTree(child, depth + 1))}
          </View>
        ) : null}
      </View>
    );
  };

  const rootGroups = useMemo(
    () => getGroupsInFolder(null).filter((group) => group.type !== "groupe_session"),
    [getGroupsInFolder]
  );

  const sessionGroups = useMemo(
    () => groups.filter((group) => group.type === "groupe_session"),
    [groups]
  );

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>

            <TouchableOpacity activeOpacity={0.9} onPress={onClose} style={styles.modalCloseBtn}>
              <Feather name="x" size={20} color={C_TEXT} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 430 }} showsVerticalScrollIndicator={false}>
            {allowNone ? (
              <TouchableOpacity
                activeOpacity={0.92}
                onPress={() => {
                  onSelect(null);
                  onClose();
                }}
                style={[
                  styles.modalOption,
                  selectedId == null && {
                    borderColor: "rgba(59,130,246,0.28)",
                    backgroundColor: "rgba(59,130,246,0.08)",
                  },
                ]}
              >
                <Text style={styles.modalOptionText}>Aucune</Text>
                {selectedId == null ? <Feather name="check" size={18} color="#2563EB" /> : null}
              </TouchableOpacity>
            ) : null}

            {rootGroups.map((group) => renderGroupOption(group, 0))}
            {topFolders.map((folder) => renderFolderTree(folder, 0))}
            {sessionGroups.length > 0 ? (
              <View style={styles.modalSectionTitleWrap}>
                <Text style={styles.modalSectionTitle}>Groupes</Text>
              </View>
            ) : null}
            {sessionGroups.map((group) => renderGroupOption(group, 0))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ======================= Page ======================= */
export default function GestionAssociationsParcours({ professeur, setPage }: Props) {
  const { width: winW } = useWindowDimensions();
  const isPhone = winW < 768;

  const professeurId: string | null = professeur?.user_id ?? professeur?.id ?? null;
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [parcoursData, setParcoursData] = useState<ParcoursRow[]>([]);
  const [groupesData, setGroupesData] = useState<GroupRow[]>([]);
  const [parcoursFoldersData, setParcoursFoldersData] = useState<FolderRow[]>([]);
  const [groupFoldersData, setGroupFoldersData] = useState<FolderRow[]>([]);

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<SavingStatusMap>({});
  const [selectedSourceGroup, setSelectedSourceGroup] = useState<string | null>(null);
  const [selectedTargetGroup, setSelectedTargetGroup] = useState<string | null>(null);
  const [groupPickerMode, setGroupPickerMode] = useState<"source" | "target" | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [copyStatus, setCopyStatus] = useState<null | "success" | "error" | "warning">(null);

  useEffect(() => {
    return () => {
      Object.values(saveTimersRef.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (selectedSourceGroup && selectedTargetGroup && selectedSourceGroup === selectedTargetGroup) {
      setSelectedTargetGroup(null);
    }
  }, [selectedSourceGroup, selectedTargetGroup]);

  const markSaving = useCallback((key: string, status: "saving" | "saved" | "error") => {
    if (saveTimersRef.current[key]) clearTimeout(saveTimersRef.current[key]);

    setSavingStatus((prev) => ({ ...prev, [key]: status }));

    if (status !== "saving") {
      saveTimersRef.current[key] = setTimeout(() => {
        setSavingStatus((prev) => ({ ...prev, [key]: null }));
      }, status === "saved" ? 650 : 1300);
    }
  }, []);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });
  }, []);

  const getDirectChildFolders = useCallback(
    (folderId: string | null) =>
      parcoursFoldersData.filter((f) => getParentFolderId(f) === cleanId(folderId)),
    [parcoursFoldersData]
  );

  const getDirectParcours = useCallback(
    (folderId: string | null) => parcoursData.filter((p) => cleanId(p.folder_id) === cleanId(folderId)),
    [parcoursData]
  );

  const getAllNestedParcours = useCallback(
    (folderId: string): ParcoursRow[] => {
      const visited = new Set<string>();

      const gather = (currentFolderId: string): ParcoursRow[] => {
        if (visited.has(currentFolderId)) return [];
        visited.add(currentFolderId);

        const direct = parcoursData.filter((p) => sameId(p.folder_id, currentFolderId));
        const children = parcoursFoldersData.filter((f) => sameId(getParentFolderId(f), currentFolderId));

        return [
          ...direct,
          ...children.flatMap((child) => gather(child.id)),
        ];
      };

      return gather(folderId);
    },
    [parcoursData, parcoursFoldersData]
  );

  const getAllNestedFolders = useCallback(
    (folderId: string): FolderRow[] => {
      const visited = new Set<string>();

      const gather = (currentFolderId: string): FolderRow[] => {
        if (visited.has(currentFolderId)) return [];
        visited.add(currentFolderId);

        const children = parcoursFoldersData.filter((f) => sameId(getParentFolderId(f), currentFolderId));

        return [
          ...children,
          ...children.flatMap((child) => gather(child.id)),
        ];
      };

      return gather(folderId);
    },
    [parcoursFoldersData]
  );

  const updateParcoursInSupabase = useCallback(
    async (parcoursId: string, newGroupesAssocies: string[]) => {
      if (!professeurId) {
        throw new Error("Chargement du professeur connecté...");
      }

      const clean = [...new Set(normalizeGroupesAssocies(newGroupesAssocies))];
      const statusKey = `parcours-${parcoursId}`;

      markSaving(statusKey, "saving");

      const { error } = await supabase
        .from("parcours")
        .update({ groupes_associes: clean })
        .eq("id", parcoursId);

      if (error) {
        markSaving(statusKey, "error");
        throw error;
      }

      markSaving(statusKey, "saved");
    },
    [markSaving, professeurId]
  );

  const updateFolderInSupabase = useCallback(
    async (folderId: string, newGroupesAssocies: string[]) => {
      if (!professeurId) {
        throw new Error("Chargement du professeur connecté...");
      }

      const clean = [...new Set(normalizeGroupesAssocies(newGroupesAssocies))];
      const statusKey = `dossier-${folderId}`;

      markSaving(statusKey, "saving");

      const { error } = await supabase
        .from("parcours_folders")
        .update({ groupes_associes: clean })
        .eq("id", folderId);

      if (error) {
        markSaving(statusKey, "error");
        throw error;
      }

      markSaving(statusKey, "saved");
    },
    [markSaving, professeurId]
  );

  const saveManySequentially = useCallback(
    async <T extends { id: string }>(
      rows: T[],
      saveOne: (id: string, groupes: string[]) => Promise<void>
    ) => {
      for (const row of rows) {
        await saveOne(row.id, normalizeGroupesAssocies((row as any).groupes_associes));
      }
    },
    []
  );

  const saveManyFastBatched = useCallback(
    async <T extends { id: string }>(
      rows: T[],
      saveOne: (id: string, groupes: string[]) => Promise<void>,
      batchSize = 6
    ) => {
      const chunks: T[][] = [];

      for (let i = 0; i < rows.length; i += batchSize) {
        chunks.push(rows.slice(i, i + batchSize));
      }

      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(async (row) => {
            try {
              await saveOne(row.id, normalizeGroupesAssocies((row as any).groupes_associes));
            } catch (err: any) {
              if (!isDeadlockLikeError(err)) throw err;

              await wait(250);
              await saveOne(row.id, normalizeGroupesAssocies((row as any).groupes_associes));
            }
          })
        );
      }
    },
    []
  );

  const syncFolderAncestorsForGroup = useCallback(
    async (
      startingFolderId: string | null | undefined,
      groupeId: string,
      updatedParcoursSnapshot: ParcoursRow[]
    ) => {
      let currentFolderId = cleanId(startingFolderId);

      while (currentFolderId) {
        const folder = parcoursFoldersData.find((f) => sameId(f.id, currentFolderId));
        if (!folder) break;

        const visited = new Set<string>();

        const gather = (fId: string): ParcoursRow[] => {
          if (visited.has(fId)) return [];
          visited.add(fId);

          const direct = updatedParcoursSnapshot.filter((p) => sameId(p.folder_id, fId));
          const kids = parcoursFoldersData.filter((f) => sameId(getParentFolderId(f), fId));

          return [
            ...direct,
            ...kids.flatMap((k) => gather(k.id)),
          ];
        };

        const nestedParcours = gather(folder.id);
        const shouldBeAssociated = nestedParcours.some((p) =>
          normalizeGroupesAssocies(p.groupes_associes).includes(groupeId)
        );

        const currentAssociations = normalizeGroupesAssocies(folder.groupes_associes);
        const alreadyAssociated = currentAssociations.includes(groupeId);

        let nextAssociations = currentAssociations;

        if (shouldBeAssociated && !alreadyAssociated) {
          nextAssociations = [...new Set([...currentAssociations, groupeId])];
        } else if (!shouldBeAssociated && alreadyAssociated) {
          nextAssociations = currentAssociations.filter((id) => id !== groupeId);
        }

        if (!sameStringArray(nextAssociations, currentAssociations)) {
          setParcoursFoldersData((prev) =>
            prev.map((f) =>
              sameId(f.id, folder.id) ? { ...f, groupes_associes: nextAssociations } : f
            )
          );

          await updateFolderInSupabase(folder.id, nextAssociations);
        }

        currentFolderId = getParentFolderId(folder);
      }
    },
    [parcoursFoldersData, updateFolderInSupabase]
  );

  const fetchData = useCallback(async () => {
    if (!professeurId) {
      setIsLoading(false);
      setScreenError("Chargement du professeur connecté...");
      return;
    }

    setIsLoading(true);
    setScreenError(null);

    try {
      const [parcoursRes, groupsRes, groupSessionsRes, parcoursFoldersRes, groupFoldersRes] = await Promise.all([
        supabase
          .from("parcours")
          .select("*")
          .eq("user_id", professeurId)
          .order("created_at", { ascending: true }),

        supabase
          .from("groups")
          .select("*")
          .eq("teacher_id", professeurId)
          .order("created_at", { ascending: true }),

        supabase
          .from("GroupeSessionEleves")
          .select("id, code, nom, teacher_id, group_id, student_ids")
          .eq("teacher_id", professeurId),

        supabase
          .from("parcours_folders")
          .select("*")
          .eq("user_id", professeurId)
          .order("created_at", { ascending: true }),

        supabase
          .from("folders")
          .select("*")
          .eq("user_id", professeurId)
          .order("created_at", { ascending: true }),
      ]);

      if (parcoursRes.error) throw parcoursRes.error;
      if (groupsRes.error) throw groupsRes.error;
      if (groupSessionsRes.error) throw groupSessionsRes.error;
      if (parcoursFoldersRes.error) throw parcoursFoldersRes.error;
      if (groupFoldersRes.error) throw groupFoldersRes.error;

      const parcours = (parcoursRes.data ?? []).map((p) => ({
        ...p,
        id: String(p.id),
        folder_id: cleanId(p.folder_id),
        nom: getDisplayName(p),
        groupes_associes: normalizeGroupesAssocies(p.groupes_associes),
      }));

      const groupes = (groupsRes.data ?? []).map((g) => ({
        ...g,
        id: String(g.id),
        folder_id: cleanId(g.folder_id),
        nom: getDisplayName(g),
        type: "classe" as const,
      }));

      const groupSessions = (groupSessionsRes.data ?? []).map((session: any) => ({
        ...session,
        id: String(session.id),
        folder_id: null,
        nom: `${session.nom ?? "Groupe"} · ${session.code ?? ""}`.trim(),
        name: `${session.nom ?? "Groupe"} · ${session.code ?? ""}`.trim(),
        code: session.code ?? null,
        student_ids: Array.isArray(session.student_ids) ? session.student_ids.map(String) : [],
        type: "groupe_session" as const,
      }));

      const parcoursFolders = (parcoursFoldersRes.data ?? []).map((f) => ({
        ...f,
        id: String(f.id),
        parent_folder_id: cleanId(f.parent_folder_id),
        parent_id: cleanId(f.parent_id),
        nom: getDisplayName(f),
        groupes_associes: normalizeGroupesAssocies(f.groupes_associes),
      }));

      const groupFolders = (groupFoldersRes.data ?? []).map((f) => ({
        ...f,
        id: String(f.id),
        parent_folder_id: cleanId(f.parent_folder_id),
        parent_id: cleanId(f.parent_id),
        nom: getDisplayName(f),
      }));

      setParcoursData(parcours);
      setGroupesData([...groupes, ...groupSessions]);
      setParcoursFoldersData(parcoursFolders);
      setGroupFoldersData(groupFolders);

      setSelectedSourceGroup((prev) => {
        if (prev && groupes.some((g) => g.id === prev)) return prev;
        return groupes[0]?.id ?? null;
      });

      setSelectedTargetGroup((prev) => {
        if (prev && groupes.some((g) => g.id === prev)) return prev;
        return null;
      });
    } catch (err: any) {
      console.error("Erreur chargement associations :", err);
      setScreenError(`Impossible de charger les données : ${err?.message ?? "erreur inconnue"}.`);
    } finally {
      setIsLoading(false);
    }
  }, [professeurId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getFolderStatus = useCallback(
    (folder: FolderRow, groupeId: string): "empty" | "not_associated" | "partial" | "full" => {
      const nested = getAllNestedParcours(folder.id);
      if (nested.length === 0) return "empty";

      const count = nested.filter((p) =>
        normalizeGroupesAssocies(p.groupes_associes).includes(groupeId)
      ).length;

      if (count === 0) return "not_associated";
      if (count < nested.length) return "partial";
      return "full";
    },
    [getAllNestedParcours]
  );

  const handleFolderGroupeAssociation = useCallback(
    async (folder: FolderRow, groupeId: string, isChecked: boolean) => {
      const folderIds = [folder.id, ...getAllNestedFolders(folder.id).map((f) => f.id)];
      const folderIdSet = new Set(folderIds.map(String));

      const parcoursIds = getAllNestedParcours(folder.id).map((p) => p.id);
      const parcoursIdSet = new Set(parcoursIds.map(String));

      if (parcoursIdSet.size === 0) {
        Alert.alert(
          "Aucun parcours trouvé",
          "Ce dossier ne contient aucun parcours récupéré par l'application. Vérifie que les parcours sont bien rattachés au bon folder_id."
        );
        return;
      }

      const updatedFoldersLocal = parcoursFoldersData.map((f) => {
        if (!folderIdSet.has(String(f.id))) return f;

        const current = normalizeGroupesAssocies(f.groupes_associes);
        const next = withOrWithoutGroup(current, groupeId, isChecked);

        return {
          ...f,
          groupes_associes: next,
          __changed: !sameStringArray(current, next),
        };
      });

      const updatedParcoursLocal = parcoursData.map((p) => {
        if (!parcoursIdSet.has(String(p.id))) return p;

        const current = normalizeGroupesAssocies(p.groupes_associes);
        const next = withOrWithoutGroup(current, groupeId, isChecked);

        return {
          ...p,
          groupes_associes: next,
          __changed: !sameStringArray(current, next),
        };
      });

      setParcoursFoldersData(updatedFoldersLocal.map(({ __changed, ...f }: any) => f));
      setParcoursData(updatedParcoursLocal.map(({ __changed, ...p }: any) => p));

      try {
        const foldersToUpdate = updatedFoldersLocal.filter((f: any) => f.__changed);
        const parcoursToUpdate = updatedParcoursLocal.filter((p: any) => p.__changed);

        await saveManySequentially(parcoursToUpdate, updateParcoursInSupabase);
        await saveManySequentially(foldersToUpdate, updateFolderInSupabase);
        await syncFolderAncestorsForGroup(folder.id, groupeId, updatedParcoursLocal);
      } catch (err: any) {
        Alert.alert(
          "Erreur d'enregistrement",
          err?.message ?? "Une partie de l'association n'a pas pu être enregistrée. Réessaie dans quelques secondes."
        );
      }
    },
    [
      fetchData,
      getAllNestedFolders,
      getAllNestedParcours,
      parcoursData,
      parcoursFoldersData,
      saveManySequentially,
      syncFolderAncestorsForGroup,
      updateFolderInSupabase,
      updateParcoursInSupabase,
    ]
  );

  const handleParcoursGroupeAssociation = useCallback(
    async (parcours: ParcoursRow, groupeId: string) => {
      const updatedParcoursLocal = parcoursData.map((p) => {
        if (!sameId(p.id, parcours.id)) return p;

        const current = normalizeGroupesAssocies(p.groupes_associes);

        return {
          ...p,
          groupes_associes: current.includes(groupeId)
            ? current.filter((id) => id !== groupeId)
            : [...current, groupeId],
        };
      });

      setParcoursData(updatedParcoursLocal);

      const updatedTarget = updatedParcoursLocal.find((p) => sameId(p.id, parcours.id));
      if (!updatedTarget) return;

      try {
        await updateParcoursInSupabase(
          updatedTarget.id,
          normalizeGroupesAssocies(updatedTarget.groupes_associes)
        );

        await syncFolderAncestorsForGroup(
          updatedTarget.folder_id,
          groupeId,
          updatedParcoursLocal
        );
      } catch (err: any) {
        Alert.alert("Erreur", err?.message ?? "Impossible d'enregistrer la modification.");
        fetchData();
      }
    },
    [fetchData, parcoursData, syncFolderAncestorsForGroup, updateParcoursInSupabase]
  );

  const buildRenderedItems = useCallback((): RenderedItem[] => {
    const items: RenderedItem[] = [];

    const buildTree = (folderId: string, depth: number) => {
      const folder = parcoursFoldersData.find((f) => sameId(f.id, folderId));
      if (!folder) return;

      items.push({
        ...folder,
        type: "dossier",
        indentation: depth,
        nomAffiche: getDisplayName(folder),
      });

      if (!expandedFolders.has(folderId)) return;

      getDirectParcours(folderId).forEach((p) => {
        items.push({
          ...p,
          type: "parcours",
          indentation: depth + 1,
          nomAffiche: getDisplayName(p),
        });
      });

      getDirectChildFolders(folderId).forEach((child) => buildTree(child.id, depth + 1));
    };

    getDirectChildFolders(null).forEach((folder) => buildTree(folder.id, 0));

    getDirectParcours(null).forEach((p) => {
      items.push({
        ...p,
        type: "parcours",
        indentation: 0,
        nomAffiche: getDisplayName(p),
      });
    });

    return items;
  }, [expandedFolders, getDirectChildFolders, getDirectParcours, parcoursFoldersData]);

  const itemsToShow = useMemo(() => {
    let items = buildRenderedItems();

    if (searchTerm.trim()) {
      const s = searchTerm.trim().toLowerCase();
      items = items.filter((item) => item.nomAffiche.toLowerCase().includes(s));
    }

    return items;
  }, [buildRenderedItems, searchTerm]);

  const totalUnassociatedFolders = useMemo(
    () =>
      parcoursFoldersData.filter(
        (f) => normalizeGroupesAssocies(f.groupes_associes).length === 0
      ).length,
    [parcoursFoldersData]
  );

  const totalUnassociatedParcours = useMemo(
    () =>
      parcoursData.filter((p) => normalizeGroupesAssocies(p.groupes_associes).length === 0)
        .length,
    [parcoursData]
  );

  const totalAssociatedParcours = useMemo(
    () =>
      parcoursData.filter((p) => normalizeGroupesAssocies(p.groupes_associes).length > 0)
        .length,
    [parcoursData]
  );

  const sourceGroup = groupesData.find((g) => g.id === selectedSourceGroup) ?? null;
  const targetGroup = selectedTargetGroup
    ? groupesData.find((g) => g.id === selectedTargetGroup) ?? null
    : null;

  const showTargetColumn = !!targetGroup;
  const showCopyCard = !!targetGroup && !!sourceGroup;

  const handleCopyAssociations = useCallback(async () => {
    if (!selectedSourceGroup || !selectedTargetGroup || selectedSourceGroup === selectedTargetGroup) {
      setCopyStatus("warning");
      setTimeout(() => setCopyStatus(null), 1800);
      return;
    }

    setIsCopying(true);
    setCopyStatus(null);

    try {
      const sourceParcoursIds = new Set(
        parcoursData
          .filter((p) => normalizeGroupesAssocies(p.groupes_associes).includes(selectedSourceGroup))
          .map((p) => p.id)
      );

      const sourceFolderIds = new Set(
        parcoursFoldersData
          .filter((f) => normalizeGroupesAssocies(f.groupes_associes).includes(selectedSourceGroup))
          .map((f) => f.id)
      );

      const nextParcours = parcoursData.map((p) => {
        const current = normalizeGroupesAssocies(p.groupes_associes);
        const next = sourceParcoursIds.has(p.id)
          ? [...new Set([...current, selectedTargetGroup])]
          : current.filter((id) => id !== selectedTargetGroup);

        return {
          ...p,
          groupes_associes: next,
          __changed: !sameStringArray(current, next),
        };
      });

      const nextFolders = parcoursFoldersData.map((f) => {
        const current = normalizeGroupesAssocies(f.groupes_associes);
        const next = sourceFolderIds.has(f.id)
          ? [...new Set([...current, selectedTargetGroup])]
          : current.filter((id) => id !== selectedTargetGroup);

        return {
          ...f,
          groupes_associes: next,
          __changed: !sameStringArray(current, next),
        };
      });

      const parcoursToSave = nextParcours.filter((p: any) => p.__changed);
      const foldersToSave = nextFolders.filter((f: any) => f.__changed);

      setParcoursData(nextParcours.map(({ __changed, ...p }: any) => p));
      setParcoursFoldersData(nextFolders.map(({ __changed, ...f }: any) => f));

      await saveManySequentially(parcoursToSave, updateParcoursInSupabase);
      await saveManySequentially(foldersToSave, updateFolderInSupabase);

      setCopyStatus("success");
      setTimeout(() => setCopyStatus(null), 1800);
    } catch (err: any) {
      console.error("Erreur copie associations :", err);
      setCopyStatus("error");
      Alert.alert(
        "Erreur de copie",
        err?.message ?? "La copie n'a pas pu être enregistrée. Réessaie dans quelques secondes."
      );
      setTimeout(() => setCopyStatus(null), 2200);
    } finally {
      setIsCopying(false);
    }
  }, [
    fetchData,
    saveManySequentially,
    parcoursData,
    parcoursFoldersData,
    selectedSourceGroup,
    selectedTargetGroup,
    updateFolderInSupabase,
    updateParcoursInSupabase,
  ]);

  const renderCopyButtonText = () => {
    if (isCopying) return "Copie...";
    if (copyStatus === "success") return "Copié";
    if (copyStatus === "error") return "Erreur";
    if (copyStatus === "warning") return "2 sources différentes";
    return "Copier source → cible";
  };

  const hasNoData =
    !isLoading && !screenError && (parcoursData.length === 0 || groupesData.length === 0);

  const getSaveStatePill = (status: "saving" | "saved" | "error" | null | undefined) => {
    return (
      <View style={styles.savePillSlot}>
        {!status ? null : status === "saving" ? (
          <View style={[styles.savePill, { backgroundColor: "rgba(59,130,246,0.10)" }]}>
            <ActivityIndicator size="small" color="#2563EB" />
          </View>
        ) : status === "saved" ? (
          <View style={[styles.savePill, { backgroundColor: "rgba(16,185,129,0.12)" }]}>
            <Feather name="check" size={11} color="#059669" />
          </View>
        ) : (
          <View style={[styles.savePill, { backgroundColor: "rgba(239,68,68,0.12)" }]}>
            <Feather name="x" size={11} color="#DC2626" />
          </View>
        )}
      </View>
    );
  };

  const renderAssociationControl = (item: RenderedItem, groupeId: string | null) => {
    if (!groupeId) return null;

    const keyPrefix = item.type === "dossier" ? "dossier" : "parcours";
    const statusKey = `${keyPrefix}-${item.id}`;

    let status: AssocStatus = "not_associated";
    let iconName: keyof typeof Feather.glyphMap = "square";

    if (item.type === "parcours") {
      const checked = normalizeGroupesAssocies(item.groupes_associes).includes(groupeId);
      status = checked ? "parcours_on" : "parcours_off";
      iconName = checked ? "check-square" : "square";
    } else {
      const fs = getFolderStatus(item, groupeId);
      status = fs;

      if (fs === "full") iconName = "check-square";
      else if (fs === "partial") iconName = "minus-square";
      else if (fs === "empty") iconName = "slash";
      else iconName = "square";
    }

    const palette = pastelByStatus(status);
    const currentFolderStatus = item.type === "dossier" ? getFolderStatus(item, groupeId) : null;
    const disabled = item.type === "dossier" && currentFolderStatus === "empty";

    return (
      <View style={styles.associationControlWrap}>
        <TouchableOpacity
          activeOpacity={0.92}
          disabled={disabled}
          onPress={() => {
            if (item.type === "dossier") {
              handleFolderGroupeAssociation(item, groupeId, currentFolderStatus !== "full");
            } else {
              handleParcoursGroupeAssociation(item, groupeId);
            }
          }}
          style={[
            styles.associationButtonCompact,
            {
              borderColor: palette.borderTint,
              backgroundColor: palette.bgTint,
              opacity: disabled ? 0.45 : 1,
            },
          ]}
        >
          <LinearGradient
            colors={[palette.from, palette.to]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.associationBadgeCompact}
          >
            <Feather name={iconName} size={isPhone ? 14 : 16} color={palette.iconColor} />
          </LinearGradient>
        </TouchableOpacity>

        {getSaveStatePill(savingStatus[statusKey])}
      </View>
    );
  };

  const renderRow = (item: RenderedItem) => {
    const isFolder = item.type === "dossier";
    const leftPadding = 8 + item.indentation * (isPhone ? 12 : 18);

    const leftPalette = isFolder
      ? pastelByStatus(selectedSourceGroup ? getFolderStatus(item, selectedSourceGroup) : "not_associated")
      : pastelByStatus(
          selectedSourceGroup &&
            normalizeGroupesAssocies(item.groupes_associes).includes(selectedSourceGroup)
            ? "parcours_on"
            : "parcours_off"
        );

    return (
      <View key={`${item.type}-${item.id}`} style={styles.tableRow}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            if (isFolder) toggleFolder(item.id);
          }}
          style={[styles.tableNameCell, { paddingLeft: leftPadding }]}
        >
          <LinearGradient
            colors={[leftPalette.from, leftPalette.to]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.rowIcon}
          >
            {isFolder ? (
              <Feather
                name={expandedFolders.has(item.id) ? "folder-minus" : "folder"}
                size={isPhone ? 14 : 16}
                color={leftPalette.iconColor}
              />
            ) : (
              <Feather name="map" size={isPhone ? 14 : 16} color={leftPalette.iconColor} />
            )}
          </LinearGradient>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={styles.rowTitle}
              numberOfLines={1}
              ellipsizeMode="tail"
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {item.nomAffiche}
            </Text>

            <Text style={styles.rowSubtitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {isFolder ? "Dossier" : "Parcours"}
            </Text>
          </View>

          {isFolder ? (
            <Feather
              name={expandedFolders.has(item.id) ? "chevron-down" : "chevron-right"}
              size={14}
              color={C_MUTED}
            />
          ) : null}
        </TouchableOpacity>

        <View style={styles.tableAssocCell}>
          {renderAssociationControl(item, selectedSourceGroup)}
        </View>

        {showTargetColumn ? (
          <View style={styles.tableAssocCell}>
            {renderAssociationControl(item, targetGroup?.id ?? null)}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: C_BG }]}> 
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setPage("gestionParcours")}
          style={styles.backButton}
        >
          <Feather name="arrow-left" size={21} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>ASSOCIATION</Text>
          <Text style={styles.headerSubtitle}>Classes, groupes & parcours</Text>
        </View>

        <View style={styles.topActions}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setShowFilters((v) => !v)}
            style={[styles.topIconButton, showFilters && styles.topIconButtonActive]}
          >
            <Feather name="search" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity activeOpacity={0.9} onPress={() => setShowInfo(true)} style={styles.topIconButton}>
            <Feather name="info" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: isPhone ? 10 : 16,
          paddingTop: 12,
          paddingBottom: BOTTOM_BAR_HEIGHT + 18,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {showFilters ? (
          <View style={styles.sectionCardCompact}>
            <View style={styles.searchBox}>
              <Feather name="search" size={17} color={C_MUTED} />
              <TextInput
                placeholder="Rechercher..."
                placeholderTextColor="#94A3B8"
                value={searchTerm}
                onChangeText={setSearchTerm}
                style={styles.searchInput}
              />
              {!!searchTerm && (
                <TouchableOpacity activeOpacity={0.9} onPress={() => setSearchTerm("")}> 
                  <Feather name="x" size={18} color={C_MUTED} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : null}

        <View style={styles.selectorRow}>
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => setGroupPickerMode("source")}
            style={styles.selectorChip}
          >
            <Feather name="users" size={14} color="#1D4ED8" />
            <Text style={styles.selectorValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {sourceGroup ? getDisplayName(sourceGroup) : "Choisir source"}
            </Text>
            <Feather name="chevron-down" size={14} color="#1D4ED8" />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.92}
            onPress={() => setGroupPickerMode("target")}
            style={[styles.selectorChip, styles.selectorChipPurple]}
          >
            <Feather name="copy" size={14} color="#6D28D9" />
            <Text
              style={[styles.selectorValue, { color: "#6D28D9" }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {targetGroup ? getDisplayName(targetGroup) : "Aucune"}
            </Text>
            <Feather name="chevron-down" size={14} color="#6D28D9" />
          </TouchableOpacity>
        </View>

        {showCopyCard ? (
          <TouchableOpacity
            activeOpacity={0.92}
            onPress={handleCopyAssociations}
            disabled={isCopying || !selectedSourceGroup || !selectedTargetGroup || selectedSourceGroup === selectedTargetGroup}
            style={[
              styles.copyBarCard,
              (isCopying || !selectedSourceGroup || !selectedTargetGroup || selectedSourceGroup === selectedTargetGroup) && {
                opacity: 0.55,
              },
            ]}
          >
            <LinearGradient
              colors={
                copyStatus === "success"
                  ? [GREEN_FROM, GREEN_TO]
                  : copyStatus === "error"
                  ? [RED_FROM, RED_TO]
                  : copyStatus === "warning"
                  ? [ORANGE_FROM, ORANGE_TO]
                  : [BLUE_FROM, BLUE_TO]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.copyBarInner}
            >
              {isCopying ? (
                <ActivityIndicator color="#1F2937" />
              ) : (
                <Feather name="copy" size={16} color="#1F2937" />
              )}
              <Text style={styles.copyBarText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                {renderCopyButtonText()}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : null}

        {isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.stateTitle}>Chargement des données...</Text>
            <Text style={styles.stateText}>Récupération des parcours, dossiers, classes et groupes.</Text>
          </View>
        ) : screenError ? (
          <View style={styles.stateCard}>
            <LinearGradient colors={[RED_FROM, RED_TO]} style={styles.stateBadge}>
              <Feather name="alert-circle" size={24} color="#1F2937" />
            </LinearGradient>
            <Text style={styles.stateTitle}>Erreur de chargement</Text>
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
            <Text style={styles.stateTitle}>Données insuffisantes</Text>
            <Text style={styles.stateText}>
              Il faut au moins un parcours et une classe ou un groupe dans Supabase pour commencer.
            </Text>
            <TouchableOpacity activeOpacity={0.92} onPress={() => setPage("gestionParcours")} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Retour</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.sectionCardTable}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.tableHeaderName]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                Parcours
              </Text>

              <Text style={[styles.tableHeaderText, styles.tableHeaderAssoc]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                Src
              </Text>

              {showTargetColumn ? (
                <Text style={[styles.tableHeaderText, styles.tableHeaderAssoc]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  Cible
                </Text>
              ) : null}
            </View>

            {itemsToShow.length === 0 ? (
              <Text style={styles.emptyText}>Aucun élément ne correspond à ta recherche.</Text>
            ) : (
              <View style={styles.tableBody}>{itemsToShow.map(renderRow)}</View>
            )}
          </View>
        )}

        <View style={styles.statsPanel}>
          <View style={styles.statsPanelHeader}>
            <Feather name="info" size={18} color="#BFD2FF" />
            <Text style={styles.statsPanelTitle}>Informations</Text>
          </View>

          <View style={styles.statsGridHorizontal}>
            {[
              { label: "Dossiers non associés", value: totalUnassociatedFolders },
              { label: "Parcours non associés", value: totalUnassociatedParcours },
              { label: "Parcours associés", value: totalAssociatedParcours },
              { label: "Classes / groupes", value: groupesData.length },
            ].map(({ label, value }) => (
              <View key={label} style={styles.statsMiniBlock}>
                <Text style={styles.statsMiniLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.65}>
                  {label}
                </Text>
                <Text style={styles.statsMiniValue}>{value}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <GroupPickerModal
        visible={groupPickerMode === "source"}
        title="Choisir la source"
        groups={groupesData}
        folders={groupFoldersData}
        selectedId={selectedSourceGroup}
        forbiddenId={selectedTargetGroup}
        onClose={() => setGroupPickerMode(null)}
        onSelect={(id) => {
          setSelectedSourceGroup(id);
          if (id && id === selectedTargetGroup) setSelectedTargetGroup(null);
        }}
      />

      <GroupPickerModal
        visible={groupPickerMode === "target"}
        title="Choisir la cible"
        groups={groupesData}
        folders={groupFoldersData}
        selectedId={selectedTargetGroup}
        forbiddenId={selectedSourceGroup}
        allowNone
        onClose={() => setGroupPickerMode(null)}
        onSelect={(id) => {
          if (id && id === selectedSourceGroup) return;
          setSelectedTargetGroup(id);
        }}
      />

      <InformationAssociations visible={showInfo} onClose={() => setShowInfo(false)} />
      <BottomBar currentPage="gestionParcours" onNavigate={setPage} />
    </SafeAreaView>
  );
}

/* ======================= Styles ======================= */
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { backgroundColor: C_HEADER, paddingHorizontal: 14, paddingTop: Platform.select({ ios: 10, android: 10, default: 10 }), paddingBottom: 10, minHeight: 78, borderBottomWidth: 1, borderBottomColor: "#174B70", flexDirection: "row", alignItems: "center", gap: 10 },
  headerCenter: { flex: 1, justifyContent: "center" },
  headerTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "900", letterSpacing: 0.8 },
  headerSubtitle: { color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: "800", marginTop: 1 },
  topActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  backButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: C_HEADER_ICON, alignItems: "center", justifyContent: "center" },
  topIconButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: C_HEADER_ICON, alignItems: "center", justifyContent: "center" },
  topIconButtonActive: { backgroundColor: "#3B7EAC" },
  sectionCardCompact: { backgroundColor: C_CARD, borderWidth: 1, borderColor: C_BORDER, borderRadius: 18, padding: 10, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.08, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2 },
  sectionCardTable: { backgroundColor: C_CARD, borderWidth: 1, borderColor: C_BORDER, borderRadius: 18, overflow: "hidden", marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.08, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F2F8FC", borderRadius: 15, borderWidth: 1, borderColor: "#CFE0EC", paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, color: C_TEXT, fontSize: 14 },
  selectorRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  selectorChip: { flex: 1, minHeight: 42, borderRadius: 16, borderWidth: 1, borderColor: "#CFE0EC", backgroundColor: "#F2F8FC", paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  selectorChipPurple: { borderColor: "#D8CDF2", backgroundColor: "#F4F0FF" },
  selectorValue: { flex: 1, color: "#1F5B86", fontWeight: "900", fontSize: 12 },
  copyBarCard: { marginBottom: 12, borderRadius: 18, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.08, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 2 },
  copyBarInner: { minHeight: 46, borderRadius: 18, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 10 },
  copyBarText: { color: "#1F2937", fontWeight: "900", fontSize: 13, flexShrink: 1 },
  tableHeader: { minHeight: 42, backgroundColor: "#F2F8FC", borderBottomWidth: 1, borderBottomColor: "#CFE0EC", flexDirection: "row", alignItems: "center", paddingHorizontal: 8 },
  tableHeaderText: { color: "#516B7E", fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
  tableHeaderName: { flex: 1, paddingRight: 6 },
  tableHeaderAssoc: { width: 58, textAlign: "center" },
  tableBody: { paddingBottom: 4 },
  tableRow: { minHeight: 72, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)", flexDirection: "row", alignItems: "center", paddingHorizontal: 4 },
  tableNameCell: { flex: 1, minHeight: 56, flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 4, minWidth: 0 },
  tableAssocCell: { width: 58, alignItems: "center", justifyContent: "center" },
  rowIcon: { width: 28, height: 28, borderRadius: 10, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  rowTitle: { color: C_TEXT, fontSize: 13, fontWeight: "900" },
  rowSubtitle: { color: C_MUTED, fontSize: 10, fontWeight: "600", marginTop: 1 },
  associationControlWrap: { alignItems: "center", justifyContent: "center", width: 48, minHeight: 58 },
  associationButtonCompact: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", padding: 4 },
  associationBadgeCompact: { width: 26, height: 26, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  savePillSlot: { marginTop: 3, width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  savePill: { borderRadius: 999, width: 16, height: 16, alignItems: "center", justifyContent: "center" },
  emptyText: { color: C_SUB, fontSize: 14, textAlign: "center", paddingVertical: 16 },
  stateCard: { backgroundColor: C_CARD, borderWidth: 1, borderColor: C_BORDER, borderRadius: 16, padding: 20, marginBottom: 12, alignItems: "center", shadowColor: "rgba(0,0,0,0.10)", shadowOpacity: 0.16, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 2 },
  stateBadge: { width: 54, height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  stateTitle: { color: C_TEXT, fontSize: 17, fontWeight: "800", textAlign: "center" },
  stateText: { color: C_SUB, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 },
  retryBtn: { marginTop: 14, backgroundColor: "#2563EB", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  retryBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  statsPanel: { marginTop: 2, borderRadius: 22, overflow: "hidden", backgroundColor: C_PANEL_BLUE, shadowColor: "#000", shadowOpacity: 0.08, shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 3 },
  statsPanelHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
  statsPanelTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  statsGridHorizontal: { flexDirection: "row", paddingHorizontal: 8, paddingBottom: 12, gap: 8 },
  statsMiniBlock: { flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.10)", alignItems: "center", justifyContent: "center", minWidth: 0 },
  statsMiniLabel: { color: "rgba(255,255,255,0.76)", fontSize: 10, fontWeight: "700", textAlign: "center", marginBottom: 4, width: "100%" },
  statsMiniValue: { color: "#A7F3D0", fontSize: 22, fontWeight: "900", textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.28)", alignItems: "center", justifyContent: "center", padding: 20 },
  modalCard: { width: "100%", maxWidth: 520, backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1, borderColor: C_BORDER, padding: 14 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  modalTitle: { color: C_TEXT, fontSize: 17, fontWeight: "800" },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.05)", alignItems: "center", justifyContent: "center" },
  pickerFolderRow: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: C_BORDER, backgroundColor: "#F8FAFC", paddingHorizontal: 10, marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerFolderLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  pickerFolderIcon: { width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pickerFolderText: { color: C_TEXT, fontSize: 13, fontWeight: "800", flex: 1 },
  modalOption: { minHeight: 54, borderRadius: 14, borderWidth: 1, borderColor: C_BORDER, backgroundColor: "#FFFFFF", paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalOptionLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  modalOptionAvatar: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  modalOptionAvatarText: { fontSize: 11, fontWeight: "900" },
  modalOptionText: { color: C_TEXT, fontSize: 14, fontWeight: "700", flex: 1 },
  modalOptionSubText: { color: C_MUTED, fontSize: 11, fontWeight: "700", marginTop: 2 },
  modalSectionTitleWrap: { paddingTop: 8, paddingBottom: 6 },
  modalSectionTitle: { color: C_MUTED, fontSize: 11, fontWeight: "900", textTransform: "uppercase" },
});

const infoStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(15,23,42,0.28)", alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 520, backgroundColor: "#FFFFFF", borderRadius: 22, borderWidth: 1, borderColor: C_BORDER, padding: 18, shadowColor: "rgba(0,0,0,0.18)", shadowOpacity: 0.18, shadowOffset: { width: 0, height: 6 }, shadowRadius: 14, elevation: 4 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  title: { flex: 1, color: C_TEXT, fontSize: 19, fontWeight: "800" },
  closeBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.05)", alignItems: "center", justifyContent: "center" },
  pageBadge: { alignSelf: "flex-start", marginTop: 10, marginBottom: 12, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(59,130,246,0.10)", borderWidth: 1, borderColor: "rgba(59,130,246,0.18)" },
  pageBadgeText: { color: "#2563EB", fontWeight: "700", fontSize: 12 },
  content: { minHeight: 130, justifyContent: "flex-start" },
  body: { color: C_TEXT, fontSize: 15, lineHeight: 22, marginBottom: 10 },
  dotsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6, marginBottom: 14 },
  dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: "rgba(148,163,184,0.45)" },
  dotActive: { width: 20, backgroundColor: "#2563EB" },
  actions: { flexDirection: "row", gap: 10 },
  secondaryBtn: { flex: 1, minHeight: 46, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" },
  secondaryBtnText: { color: C_TEXT, fontWeight: "800" },
  primaryBtn: { flex: 1, minHeight: 46, borderRadius: 14, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center" },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "800" },
  btnDisabled: { opacity: 0.45 },
});
