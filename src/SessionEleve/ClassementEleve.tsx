// src/SessionEleve/ClassementEleve.tsx

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
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BarChart2, Search, Trophy, X } from "lucide-react-native";
import { Feather } from "@expo/vector-icons";
import { supabase } from "../supabaseClient";
import BottomBarEleve from "../ui/BottomBarEleve";

const BG_GAME =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/AccueilElevePaysage.png";

type Props = { setPage?: (page: string) => void };

type ModePage = "classement" | "statistiques";
type OngletClassement = "classe" | "niveau" | "classes";

type EleveConnecte = {
  id?: string;
  uuid?: string;
  code?: string;
  group_id?: string | null;
  display_name?: string | null;
};

type ClassementRow = {
  id: string;
  nom: string;
  points: number;
  classe: string;
  groupId: string | null;
  niveau: string;
};

type ClasseAverageRow = {
  id: string;
  classe: string;
  niveau: string;
  moyenne: number;
  totalPoints: number;
  eleves: number;
  isCurrentClass: boolean;
};

type ClassementRpcRow = {
  student_id?: string | null;
  student_name?: string | null;
  group_id?: string | null;
  group_name?: string | null;
  total_points?: number | string | null;
};

const C_TEXT = "#0B2540";
const C_MUTED = "#57708A";
const C_GOLD = "#FBBF24";
const C_BLUE = "#1F75B8";

const WEB_SCROLL_STYLE =
  Platform.OS === "web"
    ? ({
        touchAction: "pan-y",
        WebkitOverflowScrolling: "touch",
        overflowY: "auto",
      } as any)
    : null;

export default function ClassementEleve({ setPage }: Props) {
  const { width } = useWindowDimensions();
  const isSmall = width < 520;

  const scrollYRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const podiumYRef = useRef<number | null>(null);
  const myRowYRef = useRef<number | null>(null);
  const myRowHeightRef = useRef(0);

  const [modePage, setModePage] = useState<ModePage>("classement");
  const [onglet, setOnglet] = useState<OngletClassement>("classe");
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [screenError, setScreenError] = useState<string | null>(null);

  const [rows, setRows] = useState<ClassementRow[]>([]);
  const [currentStudentId, setCurrentStudentId] = useState<string | null>(null);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [currentNiveau, setCurrentNiveau] = useState<string | null>(null);
  const [isMyRowVisible, setIsMyRowVisible] = useState(true);

  const resolveCurrentEleve = useCallback(async (): Promise<EleveConnecte | null> => {
    try {
      const raw =
        (await AsyncStorage.getItem("eleveConnecte")) ||
        (await AsyncStorage.getItem("eleveCache")) ||
        (await AsyncStorage.getItem("LS_ELEVE_CACHE"));

      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;

      return parsed as EleveConnecte;
    } catch {
      return null;
    }
  }, []);

  const loadClassement = useCallback(async () => {
    setLoading(true);
    setScreenError(null);

    try {
      const currentEleve = await resolveCurrentEleve();

      let nextCurrentStudentId = currentEleve?.id ?? currentEleve?.uuid ?? null;
      let nextCurrentGroupId = currentEleve?.group_id ?? null;

      if ((!nextCurrentStudentId || !nextCurrentGroupId) && currentEleve?.code) {
        const rpcStudent = await supabase.rpc("student_name_by_code", {
          p_code: currentEleve.code,
        });

        if (!rpcStudent.error && rpcStudent.data) {
          const studentRow = Array.isArray(rpcStudent.data)
            ? rpcStudent.data[0]
            : rpcStudent.data;

          nextCurrentStudentId = studentRow?.id ?? nextCurrentStudentId;
          nextCurrentGroupId = studentRow?.group_id ?? nextCurrentGroupId;
        }
      }

      const { data, error } = await supabase.rpc("classement_eleves");
      if (error) throw error;

      const normalized: ClassementRow[] = ((data as ClassementRpcRow[]) || [])
        .filter((row) => !!row?.student_id)
        .map((row) => {
          const classeName = String(row.group_name ?? "Classe inconnue");

          return {
            id: String(row.student_id),
            nom: String(row.student_name ?? "Élève"),
            points: Math.round(Number(row.total_points ?? 0)),
            classe: classeName,
            groupId: row.group_id ? String(row.group_id) : null,
            niveau: detectNiveau(classeName),
          };
        });

      const currentRow = normalized.find((row) => row.id === nextCurrentStudentId);

      setCurrentStudentId(nextCurrentStudentId);
      setCurrentGroupId(nextCurrentGroupId ?? currentRow?.groupId ?? null);
      setCurrentNiveau(currentRow?.niveau ?? null);
      setRows(normalized);
    } catch (error: any) {
      setRows([]);
      setScreenError(error?.message || "Impossible de charger le classement.");
    } finally {
      setLoading(false);
    }
  }, [resolveCurrentEleve]);

  useEffect(() => {
    loadClassement();
  }, [loadClassement]);

  const filteredRows = useMemo(() => {
    let filtered = [...rows];

    if (onglet === "classe" && currentGroupId) {
      filtered = filtered.filter((row) => row.groupId === currentGroupId);
    }

    if (
      (onglet === "niveau" || onglet === "classes") &&
      currentNiveau &&
      currentNiveau !== "Niveau inconnu"
    ) {
      filtered = filtered.filter((row) => row.niveau === currentNiveau);
    }

    return filtered.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return a.nom.localeCompare(b.nom, "fr");
    });
  }, [rows, onglet, currentGroupId, currentNiveau]);

  const isClassRanking = onglet === "classes";
  const niveauLabel =
    currentNiveau && currentNiveau !== "Niveau inconnu" ? currentNiveau : "Niveau";

  const classAverageRows = useMemo(() => {
    const groups = new Map<
      string,
      {
        classe: string;
        niveau: string;
        totalPoints: number;
        eleves: number;
        isCurrentClass: boolean;
      }
    >();

    filteredRows.forEach((row) => {
      const key = row.groupId ?? row.classe;
      const current = groups.get(key) ?? {
        classe: row.classe,
        niveau: row.niveau,
        totalPoints: 0,
        eleves: 0,
        isCurrentClass: false,
      };

      current.totalPoints += row.points;
      current.eleves += 1;
      current.isCurrentClass =
        current.isCurrentClass || (!!currentGroupId && row.groupId === currentGroupId);
      groups.set(key, current);
    });

    return Array.from(groups.entries())
      .map(([id, group]) => ({
        id,
        classe: group.classe,
        niveau: group.niveau,
        totalPoints: group.totalPoints,
        eleves: group.eleves,
        moyenne: group.eleves > 0 ? group.totalPoints / group.eleves : 0,
        isCurrentClass: group.isCurrentClass,
      }))
      .sort((a, b) => {
        if (b.moyenne !== a.moyenne) return b.moyenne - a.moyenne;
        return a.classe.localeCompare(b.classe, "fr");
      });
  }, [filteredRows, currentGroupId]);

  const normalizedSearch = normalizeSearch(searchTerm);
  const isSearching = normalizedSearch.length > 0;

  const visibleRows = useMemo(() => {
    if (!normalizedSearch) return filteredRows;

    return filteredRows.filter((row) => {
      const searchable = normalizeSearch(`${row.nom} ${row.classe} ${row.niveau}`);
      return searchable.includes(normalizedSearch);
    });
  }, [filteredRows, normalizedSearch]);

  const visibleClassRows = useMemo(() => {
    if (!normalizedSearch) return classAverageRows;

    return classAverageRows.filter((row) => {
      const searchable = normalizeSearch(`${row.classe} ${row.niveau}`);
      return searchable.includes(normalizedSearch);
    });
  }, [classAverageRows, normalizedSearch]);

  const rowRankMap = useMemo(() => {
    const ranks = new Map<string, number>();
    filteredRows.forEach((row, index) => ranks.set(row.id, index + 1));
    return ranks;
  }, [filteredRows]);

  const classRankMap = useMemo(() => {
    const ranks = new Map<string, number>();
    classAverageRows.forEach((row, index) => ranks.set(row.id, index + 1));
    return ranks;
  }, [classAverageRows]);

  const podium = isSearching || isClassRanking ? [] : filteredRows.slice(0, 3);
  const remainingRows = isSearching ? visibleRows : filteredRows.slice(3);
  const classPodium = isSearching ? [] : classAverageRows.slice(0, 3);
  const remainingClassRows = isSearching ? visibleClassRows : classAverageRows.slice(3);

  const currentRank = useMemo(() => {
    if (!currentStudentId) return null;
    const index = filteredRows.findIndex((row) => row.id === currentStudentId);
    return index >= 0 ? index + 1 : null;
  }, [filteredRows, currentStudentId]);

  const currentRow = useMemo(() => {
    if (!currentStudentId) return null;
    return filteredRows.find((row) => row.id === currentStudentId) ?? null;
  }, [filteredRows, currentStudentId]);

  const updateMyVisibility = useCallback(() => {
    if (!currentRow || !currentRank) {
      setIsMyRowVisible(true);
      return;
    }

    const rowY = myRowYRef.current;
    const rowH = myRowHeightRef.current || 62;

    if (typeof rowY !== "number") {
      setIsMyRowVisible(false);
      return;
    }

    const scrollY = scrollYRef.current;
    const viewportH = viewportHeightRef.current || 1;

    const visibleTop = scrollY + 4;
    const visibleBottom = scrollY + viewportH - 92;

    const rowBottom = rowY + rowH;
    const visible = rowBottom > visibleTop && rowY < visibleBottom;

    setIsMyRowVisible(visible);
  }, [currentRank, currentRow]);

  useEffect(() => {
    podiumYRef.current = null;
    myRowYRef.current = null;
    myRowHeightRef.current = 0;
    setIsMyRowVisible(true);

    requestAnimationFrame(() => {
      updateMyVisibility();
    });
  }, [
    onglet,
    modePage,
    visibleRows.length,
    visibleClassRows.length,
    currentStudentId,
    updateMyVisibility,
  ]);

  const registerMyRowLayout = useCallback(
    (absoluteY: number, height: number) => {
      myRowYRef.current = absoluteY;
      myRowHeightRef.current = height;
      requestAnimationFrame(updateMyVisibility);
    },
    [updateMyVisibility]
  );

  const showMyFloatingRank =
    modePage === "classement" &&
    !isSearching &&
    !isClassRanking &&
    !!currentRow &&
    !!currentRank &&
    !isMyRowVisible;

  return (
    <SafeAreaView style={styles.safe}>
      <ImageBackground source={{ uri: BG_GAME }} style={styles.bg} resizeMode="cover">
        <LinearGradient
          colors={[
            "rgba(5,18,30,0.58)",
            "rgba(9,34,54,0.42)",
            "rgba(234,246,255,0.88)",
            "rgba(234,246,255,0.96)",
          ]}
          locations={[0, 0.24, 0.6, 1]}
          style={styles.container}
        >
          <View style={styles.topBar}>
            <View style={styles.topTextWrap}>
              <Text numberOfLines={1} style={styles.pageTitle}>
                SUCCÈS
              </Text>
            </View>

            {modePage === "classement" && (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  setSearchVisible((prev) => {
                    const next = !prev;
                    if (!next) setSearchTerm("");
                    return next;
                  });
                }}
                style={[
                  styles.topModeBtn,
                  searchVisible && styles.topModeBtnActive,
                ]}
              >
                <Search size={19} color="#fff" />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setModePage("classement")}
              style={[
                styles.topModeBtn,
                modePage === "classement" && styles.topModeBtnActive,
              ]}
            >
              <Trophy size={19} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setModePage("statistiques")}
              style={[
                styles.topModeBtn,
                modePage === "statistiques" && styles.topModeBtnActive,
              ]}
            >
              <BarChart2 size={19} color="#fff" />
            </TouchableOpacity>
          </View>

          {modePage === "classement" && (
            <View style={styles.tabsPanel}>
              <TabButton label="Classe" active={onglet === "classe"} onPress={() => setOnglet("classe")} />
              <TabButton label={niveauLabel} active={onglet === "niveau"} onPress={() => setOnglet("niveau")} />
              <TabButton label="VS Classes" active={onglet === "classes"} onPress={() => setOnglet("classes")} />
            </View>
          )}

          {modePage === "classement" && searchVisible && (
            <View style={styles.searchPanel}>
              <Search size={17} color={C_MUTED} />
              <TextInput
                value={searchTerm}
                onChangeText={setSearchTerm}
                placeholder={isClassRanking ? "Rechercher une classe" : "Rechercher un élève"}
                placeholderTextColor="#7C91A5"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.searchInput}
              />
              {!!searchTerm && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSearchTerm("")}
                  style={styles.searchClearBtn}
                >
                  <X size={16} color={C_MUTED} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {modePage === "classement" ? (
            <ScrollView
              style={[styles.list, WEB_SCROLL_STYLE]}
              contentContainerStyle={[
                styles.scrollContent,
                isSmall && { paddingHorizontal: 12 },
                showMyFloatingRank && { paddingBottom: 120 },
              ]}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
              onLayout={(event) => {
                viewportHeightRef.current = event.nativeEvent.layout.height;
                requestAnimationFrame(updateMyVisibility);
              }}
              onScroll={(event) => {
                scrollYRef.current = event.nativeEvent.contentOffset.y;
                updateMyVisibility();
              }}
            >
              {loading ? (
                <View pointerEvents="none" style={styles.stateCard}>
                  <ActivityIndicator size="large" color={C_GOLD} />
                  <Text style={styles.stateTitle}>Chargement...</Text>
                  <Text style={styles.stateText}>Préparation du classement.</Text>
                </View>
              ) : screenError ? (
                <View pointerEvents="none" style={styles.stateCard}>
                  <Feather name="alert-circle" size={42} color={C_GOLD} />
                  <Text style={styles.stateTitle}>Erreur</Text>
                  <Text style={styles.stateText}>{screenError}</Text>
                </View>
              ) : isClassRanking ? (
                classAverageRows.length === 0 ? (
                  <View pointerEvents="none" style={styles.stateCard}>
                    <Trophy size={44} color={C_GOLD} />
                    <Text style={styles.stateTitle}>Aucune classe</Text>
                    <Text style={styles.stateText}>
                      Impossible de calculer une moyenne pour ce niveau.
                    </Text>
                  </View>
                ) : visibleClassRows.length === 0 ? (
                  <View pointerEvents="none" style={styles.stateCard}>
                    <Search size={44} color={C_GOLD} />
                    <Text style={styles.stateTitle}>Aucune classe trouvée</Text>
                    <Text style={styles.stateText}>
                      Essaie avec un autre nom de classe.
                    </Text>
                  </View>
                ) : (
                  <>
                    {!isSearching && (
                      <View pointerEvents="none">
                        <ClassPodium rows={classPodium} />
                      </View>
                    )}

                    <View pointerEvents="none" style={styles.rankingList}>
                      {remainingClassRows.map((item, index) => (
                        <View
                          key={item.id}
                          style={index > 0 && styles.rankingItemSpacing}
                        >
                          <ClassRankingCard
                            row={item}
                            rank={classRankMap.get(item.id) ?? index + 4}
                          />
                        </View>
                      ))}
                    </View>
                  </>
                )
              ) : filteredRows.length === 0 ? (
                <View pointerEvents="none" style={styles.stateCard}>
                  <Trophy size={44} color={C_GOLD} />
                  <Text style={styles.stateTitle}>Aucun classement</Text>
                  <Text style={styles.stateText}>
                    Aucun score n’est encore disponible.
                  </Text>
                </View>
              ) : visibleRows.length === 0 ? (
                <View pointerEvents="none" style={styles.stateCard}>
                  <Search size={44} color={C_GOLD} />
                  <Text style={styles.stateTitle}>Aucun élève trouvé</Text>
                  <Text style={styles.stateText}>
                    Essaie avec un autre prénom ou nom.
                  </Text>
                </View>
              ) : (
                <>
                  {!isSearching && (
                    <View
                      pointerEvents="none"
                      onLayout={(event) => {
                        podiumYRef.current = event.nativeEvent.layout.y;
                        requestAnimationFrame(updateMyVisibility);
                      }}
                    >
                      <Podium
                        rows={podium}
                        showClasse={onglet === "niveau"}
                        currentStudentId={currentStudentId}
                        podiumYRef={podiumYRef}
                        onCurrentLayout={registerMyRowLayout}
                      />
                    </View>
                  )}

                  <View pointerEvents="none" style={styles.rankingList}>
                    {remainingRows.map((item, index) => {
                      const rank = rowRankMap.get(item.id) ?? index + 4;
                      const isCurrent = item.id === currentStudentId;

                      return (
                        <View
                          key={item.id}
                          style={index > 0 && styles.rankingItemSpacing}
                          onLayout={(event) => {
                            if (isCurrent) {
                              registerMyRowLayout(
                                event.nativeEvent.layout.y,
                                event.nativeEvent.layout.height
                              );
                            }
                          }}
                        >
                          <RankingCard
                            row={item}
                            rank={rank}
                            isCurrent={isCurrent}
                            showClasse={onglet !== "classe"}
                          />
                        </View>
                      );
                    })}
                  </View>
                </>
              )}
            </ScrollView>
          ) : (
            <ScrollView
              style={[styles.list, WEB_SCROLL_STYLE]}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View pointerEvents="none" style={styles.stateCard}>
                <BarChart2 size={48} color={C_GOLD} />
                <Text style={styles.stateTitle}>Statistiques individuelles</Text>
                <Text style={styles.stateText}>En cours de création.</Text>
              </View>
            </ScrollView>
          )}

          {showMyFloatingRank && currentRow && currentRank && (
            <View pointerEvents="none" style={styles.myRankFloating}>
              <LinearGradient
                colors={["#4F8DEB", "#2C6FD0"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.myRankCard}
              >
                <View style={styles.myRankBadge}>
                  <Text style={styles.myRankNumber}>{currentRank}</Text>
                </View>

                <View style={styles.myRankTextWrap}>
                  <Text numberOfLines={1} style={styles.myRankName}>
                    {currentRow.nom}
                  </Text>
                </View>

                <View style={styles.myRankPointsBadge}>
                  <Text style={styles.myRankPoints}>
                    {formatPoints(currentRow.points)}
                  </Text>
                  <Text style={styles.myRankPts}>pts</Text>
                </View>
              </LinearGradient>
            </View>
          )}

          <BottomBarEleve
            currentPage="ClassementEleve"
            onNavigate={(page) => setPage?.(page)}
          />
        </LinearGradient>
      </ImageBackground>
    </SafeAreaView>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.tabButton, active && styles.tabButtonActive]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Podium({
  rows,
  showClasse,
  currentStudentId,
  podiumYRef,
  onCurrentLayout,
}: {
  rows: ClassementRow[];
  showClasse: boolean;
  currentStudentId: string | null;
  podiumYRef: React.MutableRefObject<number | null>;
  onCurrentLayout: (absoluteY: number, height: number) => void;
}) {
  return (
    <View style={styles.podiumWrap}>
      <PodiumCard
        row={rows[1] ?? null}
        rank={2}
        showClasse={showClasse}
        currentStudentId={currentStudentId}
        podiumYRef={podiumYRef}
        onCurrentLayout={onCurrentLayout}
      />
      <PodiumCard
        row={rows[0] ?? null}
        rank={1}
        showClasse={showClasse}
        currentStudentId={currentStudentId}
        podiumYRef={podiumYRef}
        onCurrentLayout={onCurrentLayout}
      />
      <PodiumCard
        row={rows[2] ?? null}
        rank={3}
        showClasse={showClasse}
        currentStudentId={currentStudentId}
        podiumYRef={podiumYRef}
        onCurrentLayout={onCurrentLayout}
      />
    </View>
  );
}

function PodiumCard({
  row,
  rank,
  showClasse,
  currentStudentId,
  podiumYRef,
  onCurrentLayout,
}: {
  row: ClassementRow | null;
  rank: 1 | 2 | 3;
  showClasse: boolean;
  currentStudentId: string | null;
  podiumYRef: React.MutableRefObject<number | null>;
  onCurrentLayout: (absoluteY: number, height: number) => void;
}) {
  const isFirst = rank === 1;
  const isCurrent = !!row && row.id === currentStudentId;
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";

  const colors: [string, string] =
    rank === 1
      ? ["#FBBF24", "#F97316"]
      : rank === 2
      ? ["#CBD5E1", "#94A3B8"]
      : ["#FDBA74", "#C2410C"];

  return (
    <View
      onLayout={(event) => {
        if (isCurrent) {
          const podiumY = podiumYRef.current ?? 0;
          onCurrentLayout(
            podiumY + event.nativeEvent.layout.y,
            event.nativeEvent.layout.height
          );
        }
      }}
      style={[styles.podiumCardWrap, isFirst && styles.podiumCardFirstWrap]}
    >
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.podiumCard, isFirst && styles.podiumCardFirst]}
      >
        <Text style={styles.podiumMedal}>{medal}</Text>

        <Text numberOfLines={1} style={styles.podiumName}>
          {row?.nom ?? "-"}
        </Text>

        {showClasse && row && (
          <Text numberOfLines={1} style={styles.podiumClasse}>
            {row.classe}
          </Text>
        )}

        <Text style={styles.podiumPoints}>{row ? formatPoints(row.points) : "0"}</Text>
        <Text style={styles.podiumPtsLabel}>pts</Text>
      </LinearGradient>
    </View>
  );
}

function RankingCard({
  row,
  rank,
  isCurrent,
  showClasse,
}: {
  row: ClassementRow;
  rank: number;
  isCurrent: boolean;
  showClasse: boolean;
}) {
  return (
    <LinearGradient
      colors={
        isCurrent
          ? ["rgba(255,251,235,0.98)", "rgba(254,215,170,0.94)"]
          : ["rgba(255,255,255,0.96)", "rgba(224,231,255,0.88)"]
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.rankCard, isCurrent && styles.rankCardCurrent]}
    >
      <View style={styles.rankBadge}>
        <Text style={styles.rankBadgeText}>{rank}</Text>
      </View>

      <View style={styles.rankTextWrap}>
        <Text numberOfLines={1} style={styles.rankName}>
          {row.nom}
        </Text>
        {showClasse && (
          <Text numberOfLines={1} style={styles.rankClasse}>
            {row.classe}
          </Text>
        )}
      </View>

      <View style={styles.pointsBadge}>
        <Text style={styles.pointsValue}>{formatPoints(row.points)}</Text>
        <Text style={styles.pointsLabel}>pts</Text>
      </View>
    </LinearGradient>
  );
}

function ClassPodium({ rows }: { rows: ClasseAverageRow[] }) {
  return (
    <View style={styles.podiumWrap}>
      <ClassPodiumCard row={rows[1] ?? null} rank={2} />
      <ClassPodiumCard row={rows[0] ?? null} rank={1} />
      <ClassPodiumCard row={rows[2] ?? null} rank={3} />
    </View>
  );
}

function ClassPodiumCard({
  row,
  rank,
}: {
  row: ClasseAverageRow | null;
  rank: 1 | 2 | 3;
}) {
  const isFirst = rank === 1;
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";

  const colors: [string, string] =
    rank === 1
      ? ["#FBBF24", "#F97316"]
      : rank === 2
      ? ["#CBD5E1", "#94A3B8"]
      : ["#FDBA74", "#C2410C"];

  return (
    <View style={[styles.podiumCardWrap, isFirst && styles.podiumCardFirstWrap]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.podiumCard,
          styles.classPodiumCard,
          isFirst && styles.podiumCardFirst,
        ]}
      >
        <Text style={styles.podiumMedal}>{medal}</Text>

        <Text numberOfLines={2} style={styles.classPodiumName}>
          {row?.classe ?? "-"}
        </Text>

        <Text style={styles.podiumPoints}>
          {row ? formatPoints(row.moyenne) : "0"}
        </Text>
        <Text style={styles.podiumPtsLabel}>moy.</Text>
      </LinearGradient>
    </View>
  );
}

function ClassRankingCard({
  row,
  rank,
}: {
  row: ClasseAverageRow;
  rank: number;
}) {
  return (
    <LinearGradient
      colors={
        row.isCurrentClass
          ? ["rgba(255,251,235,0.98)", "rgba(254,215,170,0.94)"]
          : ["rgba(255,255,255,0.96)", "rgba(224,231,255,0.88)"]
      }
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.rankCard, row.isCurrentClass && styles.rankCardCurrent]}
    >
      <View style={styles.rankBadge}>
        <Text style={styles.rankBadgeText}>{rank}</Text>
      </View>

      <View style={styles.rankTextWrap}>
        <Text numberOfLines={1} style={styles.rankName}>
          {row.classe}
        </Text>
      </View>

      <View style={styles.pointsBadge}>
        <Text style={styles.pointsValue}>{formatPoints(row.moyenne)}</Text>
        <Text style={styles.pointsLabel}>moy.</Text>
      </View>
    </LinearGradient>
  );
}

function detectNiveau(classeName: string): string {
  const lower = classeName.toLowerCase();
  if (lower.includes("6")) return "6ème";
  if (lower.includes("5")) return "5ème";
  if (lower.includes("4")) return "4ème";
  if (lower.includes("3")) return "3ème";
  return "Niveau inconnu";
}

function formatPoints(value: number) {
  return Math.round(value || 0).toLocaleString("fr-FR");
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#061827" },
  bg: { flex: 1 },
  container: { flex: 1, minHeight: 0, paddingBottom: 96 },

  list: {
    flex: 1,
    minHeight: 0,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 14 : 8,
    paddingBottom: 10,
    backgroundColor: "rgba(8,30,48,0.72)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.18)",
  },

  topTextWrap: { flex: 1, minWidth: 0 },

  pageTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
  },

  pageSubtitle: {
    color: "#DDF7FF",
    fontSize: 12,
    marginTop: 1,
    fontWeight: "800",
  },

  topModeBtn: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },

  topModeBtnActive: {
    backgroundColor: "rgba(56,189,248,0.34)",
    borderColor: "rgba(255,255,255,0.36)",
  },

  tabsPanel: {
    marginHorizontal: 14,
    marginTop: 8,
    padding: 5,
    borderRadius: 18,
    backgroundColor: "rgba(8,30,48,0.62)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    flexDirection: "row",
    gap: 5,
  },

  tabButton: {
    flex: 1,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.20)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },

  tabButtonActive: {
    backgroundColor: "#FBBF24",
    borderColor: "rgba(255,255,255,0.58)",
  },

  tabText: { color: "#EAF6FF", fontSize: 13, fontWeight: "900" },
  tabTextActive: { color: "#78350F" },

  searchPanel: {
    marginHorizontal: 14,
    marginTop: 8,
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.62)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    color: C_TEXT,
    fontSize: 15,
    fontWeight: "800",
    paddingVertical: 9,
    outlineStyle: "none" as any,
  },

  searchClearBtn: {
    width: 30,
    height: 30,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(87,112,138,0.12)",
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 22,
  },

  rankingList: {
    width: "100%",
  },

  rankingItemSpacing: {
    marginTop: 8,
  },

  podiumWrap: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 8,
    marginBottom: 12,
  },

  podiumCardWrap: {
    flex: 1,
    maxWidth: 150,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 4,
  },

  podiumCardFirstWrap: { flex: 1.12, maxWidth: 168 },

  podiumCard: {
    minHeight: 118,
    borderRadius: 22,
    padding: 9,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.62)",
    overflow: "hidden",
  },

  podiumCardFirst: { minHeight: 146 },
  podiumMedal: { fontSize: 34, marginBottom: 4 },

  classPodiumCard: {
    paddingHorizontal: 7,
  },

  podiumName: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
    width: "100%",
    textShadowColor: "rgba(0,0,0,0.26)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  classPodiumName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 19,
    textAlign: "center",
    width: "100%",
    minHeight: 38,
    textShadowColor: "rgba(0,0,0,0.26)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  podiumClasse: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 10,
    fontWeight: "900",
    marginTop: 2,
    textAlign: "center",
    width: "100%",
    textShadowColor: "rgba(0,0,0,0.22)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  podiumPoints: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "900",
    marginTop: 4,
    textShadowColor: "rgba(0,0,0,0.26)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  podiumPtsLabel: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 10,
    fontWeight: "900",
  },

  rankCard: {
    minHeight: 62,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.58)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },

  rankCardCurrent: {
    borderColor: "rgba(251,191,36,0.80)",
  },

  rankBadge: {
    width: 44,
    height: 40,
    borderRadius: 15,
    backgroundColor: C_BLUE,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  rankBadgeText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },

  rankTextWrap: { flex: 1, minWidth: 0 },

  rankName: {
    color: C_TEXT,
    fontSize: 15,
    fontWeight: "900",
  },

  rankClasse: {
    color: C_MUTED,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 1,
  },

  pointsBadge: {
    minWidth: 76,
    minHeight: 40,
    borderRadius: 15,
    backgroundColor: C_GOLD,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.58)",
  },

  pointsValue: {
    color: "#78350F",
    fontSize: 14,
    fontWeight: "900",
  },

  pointsLabel: {
    color: "#92400E",
    fontSize: 9,
    fontWeight: "900",
  },

  myRankFloating: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 96,
    zIndex: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 7,
  },

  myRankCard: {
    minHeight: 62,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.34)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  myRankBadge: {
    width: 44,
    height: 40,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  myRankNumber: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },

  myRankTextWrap: { flex: 1, minWidth: 0 },

  myRankName: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },

  myRankPointsBadge: {
    minWidth: 76,
    minHeight: 40,
    borderRadius: 15,
    backgroundColor: C_GOLD,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.58)",
  },

  myRankPoints: {
    color: "#78350F",
    fontSize: 14,
    fontWeight: "900",
  },

  myRankPts: {
    color: "#92400E",
    fontSize: 9,
    fontWeight: "900",
  },

  stateCard: {
    backgroundColor: "rgba(255,255,255,0.94)",
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
