// src/SessionEleve/ClassementEleve.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, BarChart2, Trophy } from "lucide-react-native";
import { supabase } from "../supabaseClient";
import BottomBarEleve from "../ui/BottomBarEleve";

type Props = {
  setPage?: (page: string) => void;
};

type ModePage = "classement" | "statistiques";
type OngletClassement = "classe" | "niveau" | "college";

type ClassementRow = {
  id: string;
  nom: string;
  points: number;
  classe: string;
  niveau: string;
};

const BG_1 = "#252E83";
const BG_2 = "#5874D8";
const BLUE = "#4F76D8";
const BLUE_DARK = "#314C9D";
const CARD = "#DDE6F6";
const CARD_BORDER = "#9FC4F4";

export default function ClassementEleve({ setPage }: Props) {
  const { width } = useWindowDimensions();
  const isSmall = width < 520;

  const [modePage, setModePage] = useState<ModePage>("classement");
  const [onglet, setOnglet] = useState<OngletClassement>("classe");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ClassementRow[]>([]);

  const loadClassement = useCallback(async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("students")
        .select(`
          id,
          name,
          group_id,
          groups:group_id (
            id,
            name
          )
        `);

      if (error) throw error;

      const normalized: ClassementRow[] = (data || []).map((s: any) => {
        const classeName = s.groups?.name || "Classe inconnue";

        return {
          id: String(s.id),
          nom: s.name || "Élève",
          points: 0,
          classe: classeName,
          niveau: detectNiveau(classeName),
        };
      });

      setRows(normalized);
    } catch (e) {
      console.log("Erreur classement :", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClassement();
  }, [loadClassement]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => b.points - a.points);
  }, [rows]);

  const totalEleves = rows.length;
  const totalPoints = rows.reduce((sum, r) => sum + r.points, 0);
  const meilleurScore = rows.length > 0 ? Math.max(...rows.map((r) => r.points)) : 0;

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={[BG_1, BG_2]} style={styles.container}>
        <View style={styles.backgroundDecor1} />
        <View style={styles.backgroundDecor2} />
        <View style={styles.backgroundDecor3} />

        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setPage?.("AccueilEleve")}
            activeOpacity={0.85}
          >
            <ArrowLeft size={34} color="#fff" strokeWidth={4} />
          </TouchableOpacity>

          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>Score</Text>
            <View style={styles.titleLine} />
          </View>
        </View>

        <View style={styles.mainSwitch}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setModePage("classement")}
            style={[
              styles.mainSwitchBtn,
              modePage === "classement" && styles.mainSwitchBtnActive,
            ]}
          >
            <Trophy size={18} color="#fff" />
            <Text style={styles.mainSwitchText}>Classement</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setModePage("statistiques")}
            style={[
              styles.mainSwitchBtn,
              modePage === "statistiques" && styles.mainSwitchBtnActive,
            ]}
          >
            <BarChart2 size={18} color="#fff" />
            <Text style={styles.mainSwitchText}>Statistiques</Text>
          </TouchableOpacity>
        </View>

        {modePage === "classement" ? (
          <View style={[styles.panel, isSmall && styles.panelSmall]}>
            <View style={styles.tabs}>
              <TabButton
                label="Classe"
                active={onglet === "classe"}
                onPress={() => setOnglet("classe")}
              />
              <TabButton
                label="Niveau"
                active={onglet === "niveau"}
                onPress={() => setOnglet("niveau")}
              />
              <TabButton
                label="Collège"
                active={onglet === "college"}
                onPress={() => setOnglet("college")}
              />
            </View>

            <View style={styles.tableHeader}>
              <Text style={[styles.headerCell, styles.rangCell]}>Rang</Text>
              <Text style={[styles.headerCell, styles.nomCell]}>Nom</Text>
              <Text style={[styles.headerCell, styles.pointsCell]}>Points</Text>
              {onglet !== "classe" && (
                <Text style={[styles.headerCell, styles.classeCell]}>Classe</Text>
              )}
            </View>

            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.loadingText}>Chargement...</Text>
              </View>
            ) : (
              <FlatList
                data={sortedRows}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                renderItem={({ item, index }) => (
                  <ClassementCard
                    row={item}
                    rank={index + 1}
                    showClasse={onglet !== "classe"}
                  />
                )}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Trophy size={44} color="#fff" />
                    <Text style={styles.emptyText}>
                      Aucun élève classé pour le moment
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        ) : (
          <View style={[styles.panel, isSmall && styles.panelSmall]}>
            <View style={styles.statsGrid}>
              <StatCard label="Élèves classés" value={String(totalEleves)} />
              <StatCard label="Points cumulés" value={formatPoints(totalPoints)} />
              <StatCard label="Meilleur score" value={formatPoints(meilleurScore)} />
            </View>

            <View style={styles.statsInfoBox}>
              <BarChart2 size={42} color="#fff" />
              <Text style={styles.statsInfoTitle}>Statistiques</Text>
              <Text style={styles.statsInfoText}>
                Ici, on pourra ensuite afficher les parcours réussis, les tentatives,
                la progression et les meilleurs résultats.
              </Text>
            </View>
          </View>
        )}

        <BottomBarEleve
          currentPage="ClassementEleve"
          onNavigate={(page) => setPage?.(page)}
        />
      </LinearGradient>
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
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.tabButton, active && styles.tabButtonActive]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {label}
      </Text>
      {active && <View style={styles.tabTriangle} />}
    </TouchableOpacity>
  );
}

function ClassementCard({
  row,
  rank,
  showClasse,
}: {
  row: ClassementRow;
  rank: number;
  showClasse: boolean;
}) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;

  return (
    <View style={[styles.card, rank <= 3 && styles.cardTop]}>
      <View style={styles.rankBox}>
        {medal ? (
          <Text style={styles.medal}>{medal}</Text>
        ) : (
          <Text style={styles.rankText}>{rank}</Text>
        )}
      </View>

      <View style={styles.nameBox}>
        <Text numberOfLines={1} style={styles.studentName}>
          {row.nom}
        </Text>
      </View>

      <Text style={styles.pointsText}>{formatPoints(row.points)}</Text>

      {showClasse && (
        <Text numberOfLines={1} style={styles.classeText}>
          {row.classe}
        </Text>
      )}
    </View>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
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
  return Math.round(value).toLocaleString("fr-FR");
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG_1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === "web" ? 24 : 10,
    paddingBottom: 90,
    overflow: "hidden",
  },

  backgroundDecor1: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(255,255,255,0.06)",
    right: -70,
    top: -40,
  },
  backgroundDecor2: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.05)",
    left: -50,
    bottom: 70,
  },
  backgroundDecor3: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "rgba(255,255,255,0.06)",
    right: 60,
    bottom: 120,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    minHeight: 66,
  },
  backButton: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  titleLine: {
    width: "86%",
    height: 3,
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderRadius: 99,
  },

  mainSwitch: {
    flexDirection: "row",
    backgroundColor: "rgba(15,23,42,0.55)",
    borderRadius: 18,
    padding: 5,
    marginBottom: 10,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  mainSwitchBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  mainSwitchBtnActive: {
    backgroundColor: "#5D82EE",
  },
  mainSwitchText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },

  panel: {
    flex: 1,
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    borderRadius: 22,
    backgroundColor: "#F4FAFF",
    padding: 10,
  },
  panelSmall: {
    borderRadius: 18,
    padding: 8,
  },

  tabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  tabButton: {
    flex: 1,
    height: 60,
    borderRadius: 14,
    backgroundColor: BLUE_DARK,
    alignItems: "center",
    justifyContent: "center",
  },
  tabButtonActive: {
    backgroundColor: "#5D82EE",
  },
  tabText: {
    color: "#E7EEFF",
    fontSize: 18,
    fontWeight: "900",
  },
  tabTextActive: {
    color: "#fff",
  },
  tabTriangle: {
    position: "absolute",
    bottom: -9,
    width: 0,
    height: 0,
    borderLeftWidth: 13,
    borderRightWidth: 13,
    borderTopWidth: 13,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#5D82EE",
  },

  tableHeader: {
    height: 48,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: BLUE,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  headerCell: {
    color: "#263B74",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  rangCell: {
    width: 72,
  },
  nomCell: {
    flex: 1,
    textAlign: "left",
  },
  pointsCell: {
    width: 110,
  },
  classeCell: {
    width: 86,
  },

  listContent: {
    paddingTop: 8,
    paddingBottom: 18,
  },

  card: {
    minHeight: 84,
    borderRadius: 15,
    backgroundColor: CARD,
    borderWidth: 2,
    borderColor: CARD_BORDER,
    marginBottom: 9,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
  },
  cardTop: {
    backgroundColor: "#E6EDFB",
    borderColor: "#A9CBFA",
  },

  rankBox: {
    width: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  medal: {
    fontSize: 42,
  },
  rankText: {
    fontSize: 24,
    fontWeight: "900",
    color: "#222",
  },

  nameBox: {
    flex: 1,
    justifyContent: "center",
    paddingRight: 8,
  },
  studentName: {
    color: "#344169",
    fontSize: 21,
    fontWeight: "900",
  },
  pointsText: {
    width: 110,
    textAlign: "center",
    color: "#46527C",
    fontSize: 20,
    fontWeight: "900",
  },
  classeText: {
    width: 86,
    textAlign: "center",
    color: "#46527C",
    fontSize: 15,
    fontWeight: "900",
  },

  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BLUE,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  loadingText: {
    marginTop: 12,
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },

  empty: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BLUE,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    padding: 24,
  },
  emptyText: {
    marginTop: 12,
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
  },

  statsGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    minHeight: 100,
    borderRadius: 18,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  statValue: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "900",
  },
  statLabel: {
    color: "#DDE7FF",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 6,
  },
  statsInfoBox: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: BLUE_DARK,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  statsInfoTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 12,
  },
  statsInfoText: {
    color: "#DDE7FF",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 22,
    marginTop: 10,
  },
});