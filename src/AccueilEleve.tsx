// src/AccueilEleve.tsx

import React from "react";
import {
  ActivityIndicator,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import BottomBarEleve from "./ui/BottomBarEleve";
import { supabase } from "./supabaseClient";

const BG_MOBILE =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/AccueilEleveBackground.png";

const BG_PAYSAGE =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/AccueilElevePaysage.png";

type EleveMin = {
  id?: string | null;
  uuid?: string | null;
  code?: string | null;
  display_name?: string | null;
  name?: string | null;
  nom?: string | null;
  group_id?: string | null;
};

type ParcoursRow = {
  id: string;
  nom?: string | null;
  name?: string | null;
  groupes_associes?: any;
  folder_id?: string | null;
  ordre?: number | null;
  created_at?: string | null;
  [key: string]: any;
};

type StatRow = {
  parcours_id: string;
  best_points?: number | null;
  last_points?: number | null;
  best_score?: number | null;
  last_score?: number | null;
  total_balises?: number | null;
  tentatives_count?: number | null;
  parcours_termine?: boolean | null;
};

type Props = {
  setPage: (p: string) => void;
  eleveConnecte: EleveMin | null;
  handleDeconnexion: () => Promise<void> | void;
  setParcoursActif?: (p: any) => void;
};

const C_TEXT = "#0B2540";
const C_MUTED = "#57708A";
const C_GOLD = "#FBBF24";
const C_BLUE = "#1F75B8";
const C_BLUE_DARK = "#0F4C75";
const C_GREEN = "#22C55E";
const C_ORANGE = "#F97316";
const C_RED = "#EF4444";

const getDisplayName = (row: any) =>
  String(row?.nom ?? row?.name ?? "Sans nom");

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

const isStatCompleted = (row: StatRow) => {
  const bestScore = Number(row.best_score ?? 0);
  const lastScore = Number(row.last_score ?? 0);
  const totalBalises = Number(row.total_balises ?? 0);

  return (
    row.parcours_termine === true ||
    (totalBalises > 0 && (bestScore >= totalBalises || lastScore >= totalBalises))
  );
};

const formatPoints = (value: number) =>
  Math.round(value || 0).toLocaleString("fr-FR");

const AccueilEleve: React.FC<Props> = ({
  setPage,
  eleveConnecte,
  handleDeconnexion,
  setParcoursActif,
}) => {
  const { width, height } = useWindowDimensions();

  const isLandscape = width > height;
  const isLargeScreen = width >= 768;
  const isSmall = width < 420;

  const backgroundImage = isLandscape || isLargeScreen ? BG_PAYSAGE : BG_MOBILE;

  const studentId = eleveConnecte?.id ?? eleveConnecte?.uuid ?? null;
  const groupId = eleveConnecte?.group_id ?? null;

  const nom = (
    eleveConnecte?.display_name ??
    eleveConnecte?.name ??
    eleveConnecte?.nom ??
    "AVENTURIER"
  ).toUpperCase();

  const [loading, setLoading] = React.useState(true);
  const [score, setScore] = React.useState(0);
  const [totalParcours, setTotalParcours] = React.useState(0);
  const [completedParcours, setCompletedParcours] = React.useState(0);
  const [continueParcours, setContinueParcours] =
    React.useState<ParcoursRow | null>(null);

  const [confirmVisible, setConfirmVisible] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);

  React.useEffect(() => {
    const loadHome = async () => {
      setLoading(true);

      try {
        if (!studentId) return;

        const [{ data: statsData }, { data: parcoursData }] = await Promise.all([
          supabase
            .from("eleve_parcours_stats")
            .select(
              "parcours_id,best_points,last_points,best_score,last_score,total_balises,tentatives_count,parcours_termine"
            )
            .eq("student_id", studentId),
          supabase
            .from("parcours")
            .select("*")
            .order("ordre", { ascending: true, nullsFirst: false })
            .order("created_at", { ascending: true }),
        ]);

        const stats = ((statsData as StatRow[]) || []).filter(Boolean);
        const allParcours = ((parcoursData as ParcoursRow[]) || []).filter(Boolean);

        const visibleParcours = groupId
          ? allParcours.filter((p) => isParcoursVisibleForGroup(p, groupId))
          : allParcours;

        const visibleIds = new Set(visibleParcours.map((p) => String(p.id)));
        const visibleStats = stats.filter((s) => visibleIds.has(String(s.parcours_id)));

        const totalPts = visibleStats.reduce((sum, row) => {
          return sum + Number(row.best_points ?? row.last_points ?? 0);
        }, 0);

        const completed = visibleStats.filter(isStatCompleted).length;

        const startedNotDoneStats = visibleStats.filter((row) => {
          const bestScore = Number(row.best_score ?? 0);
          const lastScore = Number(row.last_score ?? 0);
          const tentatives = Number(row.tentatives_count ?? 0);

          return (
            !isStatCompleted(row) &&
            (tentatives > 0 || bestScore > 0 || lastScore > 0)
          );
        });

        const firstContinue = startedNotDoneStats[0]
          ? visibleParcours.find(
              (p) => String(p.id) === String(startedNotDoneStats[0].parcours_id)
            ) ?? null
          : null;

        setScore(totalPts);
        setTotalParcours(visibleParcours.length);
        setCompletedParcours(completed);
        setContinueParcours(firstContinue);
      } finally {
        setLoading(false);
      }
    };

    loadHome();
  }, [studentId, groupId]);

  const level = Math.floor(score / 500) + 1;
  const currentXp = score % 500;
  const xpProgress = totalParcours > 0 ? (currentXp / 500) * 100 : 0;
  const globalProgress =
    totalParcours > 0 ? Math.round((completedParcours / totalParcours) * 100) : 0;

  const onLogout = async () => {
    if (loggingOut) return;

    try {
      setLoggingOut(true);
      await handleDeconnexion();
      setConfirmVisible(false);
    } finally {
      setLoggingOut(false);
    }
  };

  const openContinueParcours = () => {
    if (continueParcours) {
      setParcoursActif?.(continueParcours);
      setPage("EcrireCodeBaliseEleve");
      return;
    }

    setPage("EcrireResultat");
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ImageBackground source={{ uri: backgroundImage }} style={styles.bg} resizeMode="cover">
        <LinearGradient
          colors={[
            "rgba(5,18,30,0.50)",
            "rgba(9,34,54,0.28)",
            "rgba(234,246,255,0.30)",
            "rgba(234,246,255,0.70)",
          ]}
          locations={[0, 0.24, 0.62, 1]}
          style={styles.container}
        >
          <View style={styles.topBar}>
            <View style={styles.nameCard}>
              <Text numberOfLines={1} style={styles.nameText}>
                {nom}
              </Text>
            </View>

            <Pressable
              onPress={() => setConfirmVisible(true)}
              style={styles.logoutBtn}
            >
              <Feather name="log-out" size={18} color="#FFFFFF" />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.scrollContent,
              isLargeScreen && styles.scrollContentLarge,
            ]}
          >
            <View style={[styles.levelPanel, isSmall && styles.levelPanelSmall]}>
              <View style={styles.levelBadge}>
                <Text style={styles.levelSmall}>NIVEAU</Text>
                <Text style={styles.levelNumber}>{level}</Text>
              </View>

              <View style={styles.levelInfo}>
                <View style={styles.levelTopRow}>
                  <Text style={styles.levelTitle}>EXPÉRIENCE</Text>
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.levelValue}>{currentXp}/500 pts</Text>
                  )}
                </View>

                <View style={styles.xpTrack}>
                  <View
                    style={[
                      styles.xpFill,
                      { width: `${Math.max(3, Math.min(100, xpProgress))}%` as any },
                    ]}
                  />
                </View>

                <View style={styles.progressMetaRow}>
                  <Text numberOfLines={1} style={styles.progressMetaText}>
                    Parcours terminés : {completedParcours}/{totalParcours}
                  </Text>
                  <Text style={styles.progressMetaText}>{globalProgress}%</Text>
                </View>
              </View>
            </View>

            <View style={styles.actionsGrid}>
              <View style={styles.actionsRow}>
                <ActionCard
                  icon="map"
                  title="PARCOURS EN COURS"
                  subtitle={
                    continueParcours ? getDisplayName(continueParcours) : "Aucun"
                  }
                  accent={continueParcours ? C_ORANGE : C_BLUE}
                  onPress={openContinueParcours}
                />

                <ActionCard
                  icon="crosshair"
                  title="DUEL"
                  subtitle="Bientôt disponible"
                  accent={C_RED}
                  onPress={() => setPage("AccueilEleve")}
                />
              </View>

              <View style={styles.actionsRow}>
                <ActionCard
                  icon="briefcase"
                  title="INVENTAIRE"
                  subtitle="Bientôt disponible"
                  accent="#8B5CF6"
                  onPress={() => setPage("AccueilEleve")}
                />

                <ActionCard
                  icon="award"
                  title="TOURNOIS"
                  subtitle="Classement"
                  accent={C_GREEN}
                  onPress={() => setPage("ClassementEleve")}
                />
              </View>
            </View>
          </ScrollView>

          <Modal transparent visible={confirmVisible} animationType="fade">
            <View style={styles.modalBg}>
              <View style={styles.modalBox}>
                <Text style={styles.modalTitle}>Déconnexion</Text>
                <Text style={styles.modalText}>
                  Souhaites-tu vraiment te déconnecter ?
                </Text>

                <View style={styles.modalActions}>
                  <Pressable
                    style={styles.cancelBtn}
                    onPress={() => setConfirmVisible(false)}
                  >
                    <Text style={styles.cancelText}>Annuler</Text>
                  </Pressable>

                  <Pressable style={styles.confirmBtn} onPress={onLogout}>
                    {loggingOut ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.confirmText}>Déconnexion</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

          <BottomBarEleve
            currentPage="AccueilEleve"
            onNavigate={(page) => setPage(page)}
          />
        </LinearGradient>
      </ImageBackground>
    </SafeAreaView>
  );
};

function ActionCard({
  icon,
  title,
  subtitle,
  accent,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  subtitle: string;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.actionOuter}>
      <LinearGradient
        colors={["rgba(255,255,255,0.96)", "rgba(224,244,255,0.88)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.actionCard}
      >
        <View style={[styles.actionIcon, { backgroundColor: `${accent}22` }]}>
          <Feather name={icon} size={22} color={accent} />
        </View>

        <Text numberOfLines={1} style={styles.actionTitle}>
          {title}
        </Text>

        <Text numberOfLines={2} style={styles.actionSubtitle}>
          {subtitle}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

export default AccueilEleve;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#061827",
  },

  bg: {
    flex: 1,
  },

  container: {
    flex: 1,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 14 : 8,
    paddingBottom: 12,
    backgroundColor: "rgba(8,30,48,0.72)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.18)",
  },

  nameCard: {
    flex: 1,
    minHeight: 42,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    justifyContent: "center",
    paddingHorizontal: 14,
  },

  nameText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  logoutBtn: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 118,
  },

  scrollContentLarge: {
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },

  levelPanel: {
    minHeight: 98,
    borderRadius: 24,
    backgroundColor: "rgba(8,30,48,0.76)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 12,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },

  levelPanelSmall: {
    minHeight: 92,
    padding: 10,
  },

  levelBadge: {
    width: 74,
    height: 74,
    borderRadius: 22,
    backgroundColor: "rgba(251,191,36,0.16)",
    borderWidth: 2,
    borderColor: "rgba(251,191,36,0.78)",
    alignItems: "center",
    justifyContent: "center",
  },

  levelSmall: {
    color: C_GOLD,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  levelNumber: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 34,
  },

  levelInfo: {
    flex: 1,
    minWidth: 0,
  },

  levelTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },

  levelTitle: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  levelValue: {
    color: "#DBEAFE",
    fontSize: 12,
    fontWeight: "900",
  },

  xpTrack: {
    height: 12,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.16)",
    overflow: "hidden",
  },

  xpFill: {
    height: "100%",
    borderRadius: 99,
    backgroundColor: C_GOLD,
  },

  progressMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 8,
  },

  progressMetaText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: "800",
  },

  actionsGrid: {
    gap: 12,
  },

  actionsRow: {
    flexDirection: "row",
    gap: 12,
  },

  actionOuter: {
    flex: 1,
    borderRadius: 22,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },

  actionCard: {
    minHeight: 112,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.58)",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    overflow: "hidden",
  },

  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },

  actionTitle: {
    color: C_TEXT,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0.2,
  },

  actionSubtitle: {
    color: C_MUTED,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 4,
    lineHeight: 15,
  },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.58)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },

  modalBox: {
    width: "86%",
    maxWidth: 420,
    padding: 20,
    borderRadius: 22,
    backgroundColor: "#111827",
  },

  modalTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 8,
  },

  modalText: {
    color: "#E5E7EB",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    fontWeight: "700",
  },

  modalActions: {
    flexDirection: "row",
    gap: 12,
  },

  cancelBtn: {
    flex: 1,
    padding: 13,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.10)",
  },

  confirmBtn: {
    flex: 1,
    padding: 13,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: C_RED,
  },

  cancelText: {
    color: "#D1D5DB",
    fontWeight: "900",
  },

  confirmText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
});