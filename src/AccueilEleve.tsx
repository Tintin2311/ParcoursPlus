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

  // Mode session groupe
  isGroupSession?: boolean | null;
  groupSessionId?: string | null;
  groupSessionCode?: string | null;
  groupSessionName?: string | null;
  groupStudents?: EleveMin[] | null;
  targetStudentIds?: string[] | null;
  groupIds?: string[] | null;
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
  updated_at?: string | null;
  created_at?: string | null;
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
const C_GREEN = "#22C55E";
const C_ORANGE = "#F97316";
const C_RED = "#EF4444";

// ─────────────────────────────────────────────
// Titres des niveaux
// ─────────────────────────────────────────────

const LEVEL_TITLES: Record<number, string> = {
  1: "Touriste perdu",
  2: "Ramasseur de plots",
  3: "Explorateur du quartier",
  4: "Aventurier novice",
  5: "Pisteur des sentiers",
  6: "Éclaireur des bois",
  7: "Gardien des balises",
  8: "Maître cartographe",
  9: "Seigneur des boussoles",
  10: "Légende de l’orientation",
};

const getLevelTitle = (level: number) => {
  return LEVEL_TITLES[level] ?? "Mythe des cartes";
};

// ─────────────────────────────────────────────
// Système XP exponentiel
// Niveau 1 : 100 pts
// Niveau 2 : 200 pts
// Niveau 3 : 400 pts
// Niveau 4 : 800 pts
// etc.
// Les points totaux ne repartent jamais à 0.
// ─────────────────────────────────────────────

const BASE_XP_LEVEL = 100;

const getLevelData = (totalXpRaw: number) => {
  const totalXp = Math.max(0, Math.floor(Number(totalXpRaw) || 0));

  let level = 1;
  let xpNeededForCurrentLevel = BASE_XP_LEVEL;
  let accumulatedBeforeLevel = 0;

  while (totalXp >= accumulatedBeforeLevel + xpNeededForCurrentLevel) {
    accumulatedBeforeLevel += xpNeededForCurrentLevel;
    level += 1;
    xpNeededForCurrentLevel *= 2;
  }

  const xpInCurrentLevel = totalXp - accumulatedBeforeLevel;
  const xpProgress =
    xpNeededForCurrentLevel > 0
      ? (xpInCurrentLevel / xpNeededForCurrentLevel) * 100
      : 0;

  return {
    level,
    totalXp,
    xpInCurrentLevel,
    xpNeededForCurrentLevel,
    accumulatedBeforeLevel,
    xpProgress,
    title: getLevelTitle(level),
  };
};

const getDisplayName = (row: any) =>
  String(row?.nom ?? row?.name ?? row?.display_name ?? "Sans nom");

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
    } catch {}
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

const isParcoursVisibleForGroups = (parcours: ParcoursRow, groupIds: string[]) => {
  if (groupIds.length === 0) return false;
  const associatedGroups = normalizeAssoc(parcours.groupes_associes);
  return groupIds.some((groupId) => associatedGroups.includes(String(groupId)));
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

function getStudentId(eleve?: EleveMin | null) {
  return eleve?.id ?? eleve?.uuid ?? null;
}

function getTargetStudentIds(eleve?: EleveMin | null) {
  if (!eleve) return [];

  if (eleve.isGroupSession && Array.isArray(eleve.targetStudentIds)) {
    return Array.from(new Set(eleve.targetStudentIds.map(String).filter(Boolean)));
  }

  if (eleve.isGroupSession && Array.isArray(eleve.groupStudents)) {
    return Array.from(
      new Set(
        eleve.groupStudents
          .map((student) => getStudentId(student))
          .filter(Boolean)
          .map(String)
      )
    );
  }

  const singleId = getStudentId(eleve);
  return singleId ? [String(singleId)] : [];
}

function getTargetClassIds(eleve?: EleveMin | null) {
  if (!eleve) return [];

  const ids: string[] = [];

  if (eleve.isGroupSession && Array.isArray(eleve.groupIds)) {
    ids.push(...eleve.groupIds.map(String).filter(Boolean));
  }

  if (eleve.isGroupSession && Array.isArray(eleve.groupStudents)) {
    ids.push(...eleve.groupStudents.map((student) => student.group_id).filter(Boolean).map(String));
  }

  if (eleve.group_id) ids.push(String(eleve.group_id));

  return Array.from(new Set(ids));
}

function getGroupSessionAssociationId(eleve?: EleveMin | null) {
  if (!eleve?.isGroupSession || !eleve.groupSessionId) return null;
  return String(eleve.groupSessionId);
}

function getMainStudentForDisplay(eleve?: EleveMin | null) {
  if (!eleve) return null;

  if (eleve.isGroupSession && Array.isArray(eleve.groupStudents) && eleve.groupStudents.length > 0) {
    return eleve.groupStudents[0];
  }

  return eleve;
}

function getGroupDisplayName(eleve?: EleveMin | null) {
  if (!eleve?.isGroupSession) return null;

  if (eleve.groupSessionName) return eleve.groupSessionName;

  if (Array.isArray(eleve.groupStudents) && eleve.groupStudents.length > 0) {
    return eleve.groupStudents.map((student) => getDisplayName(student)).join(" / ");
  }

  return eleve.groupSessionCode ? `Groupe ${eleve.groupSessionCode}` : "Session groupe";
}

// ─────────────────────────────────────────────
// ActionCard — style carte de jeu
// ─────────────────────────────────────────────

function ActionCard({
  icon,
  title,
  subtitle,
  onPress,
  locked = false,
  disabled = false,
  isActive = false,
  compact = false,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  subtitle: string;
  onPress: () => void;
  locked?: boolean;
  disabled?: boolean;
  isActive?: boolean;
  compact?: boolean;
}) {
  const borderColors: readonly [string, string, string, string, string] = isActive
    ? ["#5ab0ff", "#1a6ab8", "#0a4a88", "#1a6ab8", "#5ab0ff"]
    : ["#8aafc8", "#4a6e8a", "#2a4e6a", "#4a7090", "#7aaac8"];

  const innerColors: readonly [string, string, string] = isActive
    ? ["#d4eeff", "#b0d8f8", "#88c0f0"]
    : ["#c8dff2", "#9ec4de", "#7aaac8"];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.actionOuter,
        disabled && !locked && styles.actionOuterDisabled,
      ]}
    >
      {/* Bordure extérieure dégradée */}
      <LinearGradient
        colors={borderColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.cardBorder}
      >
        {/* Fond intérieur */}
        <LinearGradient
          colors={innerColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.cardInner, compact && styles.cardInnerCompact]}
        >
          {/* Badge cadenas — coin haut-droit */}
          {locked && (
            <View style={[styles.lockBadge, compact && styles.lockBadgeCompact]}>
              <Feather name="lock" size={compact ? 11 : 13} color="#c0d8f0" />
            </View>
          )}

          {/* Corps de la carte */}
          <View style={[styles.cardBody, compact && styles.cardBodyCompact]}>
            <View
              style={[
                styles.cardIconWrap,
                compact && styles.cardIconWrapCompact,
                { opacity: locked ? 0.5 : 0.82 },
              ]}
            >
              <Feather name={icon} size={compact ? 30 : 38} color="#3a6a8a" />
            </View>

            <Text
              numberOfLines={1}
              style={[
                styles.cardTitle,
                compact && styles.cardTitleCompact,
                isActive && styles.cardTitleActive,
              ]}
            >
              {title}
            </Text>

            <Text
              numberOfLines={2}
              style={[
                styles.cardSub,
                compact && styles.cardSubCompact,
                isActive && styles.cardSubActive,
              ]}
            >
              {subtitle}
            </Text>
          </View>

          {/* Footer */}
          {locked ? (
            <LinearGradient
              colors={["#1a3a5c", "#0d2a45"]}
              style={[styles.cardFooter, compact && styles.cardFooterCompact]}
            >
              <Feather name="lock" size={12} color="#8ab0d0" />
              <Text style={styles.cardFooterText}>BLOQUÉ</Text>
            </LinearGradient>
          ) : (
            <LinearGradient
              colors={["#0a3a78", "#062a60"]}
              style={[styles.cardFooter, styles.cardFooterActive, compact && styles.cardFooterCompact]}
            >
              <View style={styles.diamondBadge}>
                <Feather
                  name="navigation"
                  size={9}
                  color="#a0d8ff"
                  style={{ transform: [{ rotate: "-45deg" }] }}
                />
              </View>
            </LinearGradient>
          )}
        </LinearGradient>
      </LinearGradient>
    </Pressable>
  );
}

// ─────────────────────────────────────────────
// AccueilEleve
// ─────────────────────────────────────────────

const AccueilEleve: React.FC<Props> = ({
  setPage,
  eleveConnecte,
  handleDeconnexion,
}) => {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isLargeScreen = width >= 768;
  const isSmall = width < 420;
  const useCompactActions = width < 520;

  const backgroundImage =
    isLandscape || isLargeScreen ? BG_PAYSAGE : BG_MOBILE;

  const isGroupSession = !!eleveConnecte?.isGroupSession;
  const mainStudent = getMainStudentForDisplay(eleveConnecte);
  const studentId = getStudentId(mainStudent);
  const targetStudentIds = React.useMemo(() => getTargetStudentIds(eleveConnecte), [eleveConnecte]);
  const classIds = React.useMemo(() => getTargetClassIds(eleveConnecte), [eleveConnecte]);
  const sessionAssociationId = React.useMemo(
    () => getGroupSessionAssociationId(eleveConnecte),
    [eleveConnecte]
  );
  const groupKey = `${classIds.join("|")}::${sessionAssociationId ?? ""}`;
  const groupDisplayName = getGroupDisplayName(eleveConnecte);

  const nom = (
    isGroupSession
      ? groupDisplayName ?? "SESSION GROUPE"
      : eleveConnecte?.display_name ??
        eleveConnecte?.name ??
        eleveConnecte?.nom ??
        "AVENTURIER"
  ).toUpperCase();

  const [loading, setLoading] = React.useState(true);
  const [score, setScore] = React.useState(0);
  const [totalParcours, setTotalParcours] = React.useState(0);
  const [completedParcours, setCompletedParcours] = React.useState(0);
  const [confirmVisible, setConfirmVisible] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);

  // ─────────────────────────────────────────────
  // Popup montée de niveau
  // ─────────────────────────────────────────────

  const [levelUpVisible, setLevelUpVisible] = React.useState(false);
  const [newLevelTitle, setNewLevelTitle] = React.useState("");

  const previousLevelRef = React.useRef(1);

  React.useEffect(() => {
    const loadHome = async () => {
      setLoading(true);
      try {
        if (!studentId && targetStudentIds.length === 0) return;

        const statsQueryIds = targetStudentIds.length > 0 ? targetStudentIds : studentId ? [String(studentId)] : [];

        const statsPromise =
          statsQueryIds.length > 1
            ? supabase
                .from("eleve_parcours_stats")
                .select(
                  "student_id,parcours_id,best_points,last_points,best_score,last_score,total_balises,tentatives_count,parcours_termine,updated_at,created_at"
                )
                .in("student_id", statsQueryIds)
            : supabase
                .from("eleve_parcours_stats")
                .select(
                  "student_id,parcours_id,best_points,last_points,best_score,last_score,total_balises,tentatives_count,parcours_termine,updated_at,created_at"
                )
                .eq("student_id", statsQueryIds[0]);

        const [{ data: statsData }, { data: parcoursData }] =
          await Promise.all([
            statsPromise,
            supabase
              .from("parcours")
              .select("*")
              .order("ordre", { ascending: true, nullsFirst: false })
              .order("created_at", { ascending: true }),
          ]);

        const stats = ((statsData as any[]) || []).filter(Boolean) as StatRow[];
        const allParcours = ((parcoursData as ParcoursRow[]) || []).filter(Boolean);
        const effectiveGroupIds =
          sessionAssociationId &&
          allParcours.some((p) => isParcoursVisibleForGroup(p, sessionAssociationId))
            ? [sessionAssociationId]
            : classIds;

        const visibleParcours = effectiveGroupIds.length > 0
          ? allParcours.filter((p) => isParcoursVisibleForGroups(p, effectiveGroupIds))
          : allParcours;

        const visibleIds = new Set(visibleParcours.map((p) => String(p.id)));
        const visibleStats = stats.filter((s) => visibleIds.has(String(s.parcours_id)));

        // En mode groupe, on affiche la moyenne simple des points du groupe,
        // pour éviter de tripler artificiellement le score affiché quand 3 élèves sont ensemble.
        const rawTotalPts = visibleStats.reduce((sum, row) => {
          return sum + Number(row.best_points ?? row.last_points ?? 0);
        }, 0);
        const divisor = isGroupSession ? Math.max(1, statsQueryIds.length) : 1;
        const totalPts = rawTotalPts / divisor;

        const completedByParcours = new Set(
          visibleStats.filter(isStatCompleted).map((row) => String(row.parcours_id))
        );
        const completed = completedByParcours.size;

        setScore(totalPts);
        setTotalParcours(visibleParcours.length);
        setCompletedParcours(completed);
      } finally {
        setLoading(false);
      }
    };

    loadHome();
  }, [studentId, targetStudentIds, groupKey, isGroupSession, classIds, sessionAssociationId]);

  const levelData = React.useMemo(() => getLevelData(score), [score]);

  const level = levelData.level;
  const currentXp = levelData.xpInCurrentLevel;
  const xpNeeded = levelData.xpNeededForCurrentLevel;
  const xpProgress = levelData.xpProgress;
  const currentTitle = levelData.title;

  React.useEffect(() => {
    const oldLevel = previousLevelRef.current;

    if (level > oldLevel) {
      setNewLevelTitle(currentTitle);
      setLevelUpVisible(true);
    }

    previousLevelRef.current = level;
  }, [level, currentTitle]);

  const globalProgress =
    totalParcours > 0
      ? Math.round((completedParcours / totalParcours) * 100)
      : 0;

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

  const subtitleGroup = isGroupSession
    ? `${targetStudentIds.length} élèves connectés avec le code ${eleveConnecte?.groupSessionCode ?? "groupe"}`
    : null;

  return (
    <SafeAreaView style={styles.safe}>
      <ImageBackground
        source={{ uri: backgroundImage }}
        style={styles.bg}
        resizeMode="cover"
      >
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
          {/* ── Top bar ── */}
          <View style={styles.topBar}>
            <View style={styles.nameCard}>
              <Text numberOfLines={1} style={styles.nameText}>
                {nom}
              </Text>
              {!!subtitleGroup && (
                <Text numberOfLines={1} style={styles.groupSubText}>
                  {subtitleGroup}
                </Text>
              )}
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
            {/* ── Panneau mode groupe ── */}
            {isGroupSession && (
              <View style={styles.groupSessionPanel}>
                <View style={styles.groupSessionIcon}>
                  <Feather name="users" size={19} color="#0f766e" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.groupSessionTitle}>Mode groupe actif</Text>
                  <Text style={styles.groupSessionText} numberOfLines={2}>
                    Les résultats seront enregistrés pour tous les élèves de cette session.
                  </Text>
                </View>
              </View>
            )}

            {/* ── Panneau niveau / XP ── */}
            <View
              style={[
                styles.levelPanel,
                isSmall && styles.levelPanelSmall,
              ]}
            >
              <View style={styles.levelBadge}>
                <Text style={styles.levelSmall}>NIVEAU</Text>
                <Text style={styles.levelNumber}>{level}</Text>
              </View>

              <View style={styles.levelInfo}>
                <View style={styles.levelTopRow}>
                  <Text numberOfLines={1} style={styles.levelTitle}>
                    {currentTitle}
                  </Text>
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.levelValue}>
                      {currentXp}/{xpNeeded} pts
                    </Text>
                  )}
                </View>

                <View style={styles.xpTrack}>
                  <View
                    style={[
                      styles.xpFill,
                      {
                        width: `${Math.max(
                          3,
                          Math.min(100, xpProgress)
                        )}%` as any,
                      },
                    ]}
                  />
                </View>

                <View style={styles.progressMetaRow}>
                  <Text
                    numberOfLines={1}
                    style={styles.progressMetaText}
                  >
                    Total : {Math.round(score)} pts
                  </Text>
                  <Text style={styles.progressMetaText}>
                    {Math.round(xpProgress)}%
                  </Text>
                </View>

                <View style={styles.progressMetaRowSecond}>
                  <Text
                    numberOfLines={1}
                    style={styles.progressMetaText}
                  >
                    Parcours terminés : {completedParcours}/{totalParcours}
                  </Text>
                  <Text style={styles.progressMetaText}>
                    {globalProgress}%
                  </Text>
                </View>
              </View>
            </View>

            {/* ── Grille des 3 cartes ── */}
            <View style={styles.actionsGrid}>
              <View style={[styles.actionsRow, useCompactActions && styles.actionsRowCompact]}>
                {/* DUEL */}
                <ActionCard
                  icon="crosshair"
                  title="DUEL"
                  subtitle="Bientôt disponible"
                  locked
                  disabled
                  compact={useCompactActions}
                  onPress={() => {}}
                />

                {/* INVENTAIRE */}
                <ActionCard
                  icon="briefcase"
                  title="INVENTAIRE"
                  subtitle="Bientôt disponible"
                  locked
                  disabled
                  compact={useCompactActions}
                  onPress={() => {}}
                />

                {/* TOURNOIS */}
                <ActionCard
                  icon="award"
                  title="TOURNOIS"
                  subtitle="Bientôt disponible"
                  locked
                  disabled
                  compact={useCompactActions}
                  onPress={() => {}}
                />
              </View>
            </View>
          </ScrollView>

          {/* ── Modal déconnexion ── */}
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

          {/* ── Modal montée de niveau ── */}
          <Modal
            transparent
            visible={levelUpVisible}
            animationType="fade"
          >
            <View style={styles.levelUpOverlay}>
              <LinearGradient
                colors={["#0f2740", "#13395f", "#1b4d80"]}
                style={styles.levelUpBox}
              >
                <Text style={styles.levelUpSmall}>
                  FÉLICITATIONS
                </Text>

                <Text style={styles.levelUpTitle}>
                  Niveau {level}
                </Text>

                <Text style={styles.levelUpText}>
                  Vous devenez
                </Text>

                <Text style={styles.levelUpRank}>
                  {newLevelTitle}
                </Text>

                <Pressable
                  style={styles.levelUpButton}
                  onPress={() => setLevelUpVisible(false)}
                >
                  <Text style={styles.levelUpButtonText}>
                    Continuer
                  </Text>
                </Pressable>
              </LinearGradient>
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

export default AccueilEleve;

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────

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

  // ── Top bar ──────────────────────────────
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
    paddingVertical: 6,
  },

  nameText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: 1.2,
  },

  groupSubText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
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

  // ── Scroll ───────────────────────────────
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

  groupSessionPanel: {
    minHeight: 66,
    borderRadius: 20,
    backgroundColor: "rgba(240,253,250,0.88)",
    borderWidth: 1,
    borderColor: "rgba(20,184,166,0.35)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    marginBottom: 12,
  },

  groupSessionIcon: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: "rgba(20,184,166,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  groupSessionTitle: {
    color: "#0f766e",
    fontSize: 14,
    fontWeight: "900",
  },

  groupSessionText: {
    color: "rgba(15,118,110,0.78)",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
    lineHeight: 16,
  },

  // ── Panneau niveau ────────────────────────
  levelPanel: {
    minHeight: 108,
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
    minHeight: 104,
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
    flex: 1,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.7,
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

  progressMetaRowSecond: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 3,
  },

  progressMetaText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 11,
    fontWeight: "800",
  },

  // ── Grille des cartes ─────────────────────
  actionsGrid: {
    gap: 12,
  },

  actionsRow: {
    flexDirection: "row",
    gap: 12,
  },

  actionsRowCompact: {
    gap: 7,
  },

  actionOuter: {
    flex: 1,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },

  actionOuterDisabled: {
    opacity: 0.7,
  },

  // ── Carte jeu ─────────────────────────────
  cardBorder: {
    borderRadius: 14,
    padding: 2,
    overflow: "hidden",
  },

  cardInner: {
    borderRadius: 12,
    overflow: "hidden",
    minHeight: 162,
    flexDirection: "column",
  },

  cardInnerCompact: {
    minHeight: 138,
  },

  cardBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingTop: 16,
    paddingBottom: 8,
  },

  cardBodyCompact: {
    paddingHorizontal: 5,
    paddingTop: 12,
    paddingBottom: 6,
  },

  cardIconWrap: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },

  cardIconWrapCompact: {
    width: 42,
    height: 42,
    marginBottom: 5,
  },

  cardTitle: {
    color: "#1a3a5c",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  cardTitleCompact: {
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0,
  },

  cardTitleActive: {
    color: "#0a2a50",
  },

  cardSub: {
    color: "#4a6a8a",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 3,
    lineHeight: 15,
  },

  cardSubCompact: {
    fontSize: 9,
    lineHeight: 12,
  },

  cardSubActive: {
    color: "#2a6aaa",
    fontWeight: "700",
  },

  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: 1.5,
    borderTopColor: "#4a7090",
  },

  cardFooterCompact: {
    gap: 4,
    paddingVertical: 6,
  },

  cardFooterActive: {
    borderTopColor: "#3a8ada",
    paddingVertical: 10,
  },

  cardFooterText: {
    color: "#8ab0d0",
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },

  // Badge cadenas — coin haut-droit
  lockBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 10,
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: "rgba(26,48,80,0.85)",
    borderWidth: 1,
    borderColor: "#4a7090",
    alignItems: "center",
    justifyContent: "center",
  },

  lockBadgeCompact: {
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 5,
  },

  // Badge diamant — carte active
  diamondBadge: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: "#1a6ad8",
    borderWidth: 1.5,
    borderColor: "#5ab0ff",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "45deg" }],
  },

  // ── Modal ────────────────────────────────
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

  // ── Popup montée de niveau ─────────────────

  levelUpOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },

  levelUpBox: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 28,
    paddingVertical: 30,
    paddingHorizontal: 24,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.18)",
  },

  levelUpSmall: {
    color: "#FBBF24",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 10,
  },

  levelUpTitle: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "900",
    marginBottom: 10,
  },

  levelUpText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 10,
  },

  levelUpRank: {
    color: "#FDE68A",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 24,
  },

  levelUpButton: {
    backgroundColor: "#FBBF24",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },

  levelUpButtonText: {
    color: "#0f172a",
    fontWeight: "900",
    fontSize: 15,
  },
});
