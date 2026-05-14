// PersonnalisationTentatives.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
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
  created_at?: string | null;
};

type BaremePageRow = {
  id: string;
  teacher_id: string;
  page_number: number;
  page_name: string;
  created_at?: string | null;
};

type ConfigRow = {
  id?: string;
  teacher_id: string;
  parcours_id: string;
  tentative_page_number: number;
  updated_at?: string | null;
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
const C_GREEN = "#059669";
const C_RED = "#EF4444";

const PURPLE_FROM = "#EDE9FE";
const PURPLE_TO = "#C4B5FD";
const BLUE_FROM = "#D8ECFF";
const BLUE_TO = "#A8D8F5";

const CONFIG_TABLE = "parcours_tentative_baremes";

const getDisplayName = (row: any) => String(row?.nom ?? row?.name ?? "Sans nom");

const rowBelongsToTeacher = (row: any, teacherId: string | null) => {
  if (!teacherId) return false;
  const owner = row?.teacher_id ?? row?.professeur_id ?? row?.user_id ?? null;
  if (owner == null) return true;
  return String(owner) === String(teacherId);
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
  const [parcours, setParcours] = useState<ParcoursRow[]>([]);
  const [baremes, setBaremes] = useState<BaremePageRow[]>([]);

  const [selectedParcoursId, setSelectedParcoursId] = useState<string | null>(null);
  const [selectedPageNumber, setSelectedPageNumber] = useState<number | null>(null);

  const [existingConfigs, setExistingConfigs] = useState<Record<string, number>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedParcours = useMemo(
    () => parcours.find((p) => p.id === selectedParcoursId) ?? null,
    [parcours, selectedParcoursId]
  );

  const selectedBareme = useMemo(
    () => baremes.find((b) => b.page_number === selectedPageNumber) ?? null,
    [baremes, selectedPageNumber]
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

      const [parcoursRes, baremesRes, configsRes] = await Promise.all([
        supabase
          .from("parcours")
          .select("*")
          .order("created_at", { ascending: true }),

        supabase
          .from("group_tentative_bareme_pages")
          .select("id, teacher_id, page_number, page_name, created_at")
          .eq("teacher_id", authTeacherId)
          .order("page_number", { ascending: true }),

        supabase
          .from(CONFIG_TABLE)
          .select("*")
          .eq("teacher_id", authTeacherId),
      ]);

      if (parcoursRes.error) throw parcoursRes.error;
      if (baremesRes.error) throw baremesRes.error;

      const nextParcours = ((parcoursRes.data ?? []) as ParcoursRow[])
        .filter((p) => rowBelongsToTeacher(p, authTeacherId))
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

      const nextConfigs: Record<string, number> = {};

      if (!configsRes.error) {
        ((configsRes.data ?? []) as ConfigRow[]).forEach((row) => {
          if (row.parcours_id && row.tentative_page_number != null) {
            nextConfigs[String(row.parcours_id)] = Number(row.tentative_page_number);
          }
        });
      }

      setParcours(nextParcours);
      setBaremes(nextBaremes);
      setExistingConfigs(nextConfigs);

      const firstParcoursId = nextParcours[0]?.id ?? null;
      setSelectedParcoursId((prev) =>
        prev && nextParcours.some((p) => p.id === prev) ? prev : firstParcoursId
      );

      const initialPage =
        firstParcoursId && nextConfigs[firstParcoursId]
          ? nextConfigs[firstParcoursId]
          : nextBaremes[0]?.page_number ?? null;

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
      return baremes[0]?.page_number ?? null;
    });
  }, [baremes, existingConfigs, selectedParcoursId]);

  const handleSave = async () => {
    if (!teacherId) {
      Alert.alert("Erreur", "Professeur introuvable.");
      return;
    }

    if (!selectedParcoursId) {
      Alert.alert("Erreur", "Choisis un parcours.");
      return;
    }

    if (!selectedPageNumber) {
      Alert.alert("Erreur", "Choisis un barème de tentatives.");
      return;
    }

    setSaving(true);

    try {
      const payload = {
        teacher_id: teacherId,
        parcours_id: selectedParcoursId,
        tentative_page_number: selectedPageNumber,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from(CONFIG_TABLE)
        .upsert(payload, {
          onConflict: "teacher_id,parcours_id",
        });

      if (error) throw error;

      setExistingConfigs((prev) => ({
        ...prev,
        [selectedParcoursId]: selectedPageNumber,
      }));

      Alert.alert(
        "Barème enregistré",
        "Ce parcours utilisera ce barème de tentatives personnalisé."
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
    if (!teacherId || !selectedParcoursId) return;

    setSaving(true);

    try {
      const { error } = await supabase
        .from(CONFIG_TABLE)
        .delete()
        .eq("teacher_id", teacherId)
        .eq("parcours_id", selectedParcoursId);

      if (error) throw error;

      setExistingConfigs((prev) => {
        const next = { ...prev };
        delete next[selectedParcoursId];
        return next;
      });

      setSelectedPageNumber(baremes[0]?.page_number ?? null);

      Alert.alert(
        "Personnalisation supprimée",
        "Ce parcours utilisera de nouveau le barème général."
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

  const hasCustomConfig = !!(selectedParcoursId && existingConfigs[selectedParcoursId] != null);

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
          <Text style={styles.headerSub}>Barème personnalisé par parcours</Text>
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
                Choisis un parcours puis attribue-lui un barème de tentatives déjà existant.
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>1. Choisir un parcours</Text>

            {parcours.length === 0 ? (
              <Text style={styles.emptyText}>Aucun parcours trouvé.</Text>
            ) : (
              parcours.map((p) => {
                const active = p.id === selectedParcoursId;
                const customPage = existingConfigs[p.id];
                const customBareme = baremes.find((b) => b.page_number === customPage);

                return (
                  <TouchableOpacity
                    key={p.id}
                    activeOpacity={0.92}
                    onPress={() => setSelectedParcoursId(p.id)}
                    style={[styles.optionCard, active && styles.optionCardActive]}
                  >
                    <LinearGradient
                      colors={[BLUE_FROM, BLUE_TO]}
                      style={styles.optionIcon}
                    >
                      <Feather name="map" size={20} color="#1D4ED8" />
                    </LinearGradient>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionTitle} numberOfLines={1}>
                        {getDisplayName(p)}
                      </Text>

                      <Text style={styles.optionSub} numberOfLines={1}>
                        {customBareme
                          ? `Barème perso : ${customBareme.page_name}`
                          : "Barème général"}
                      </Text>
                    </View>

                    {active ? (
                      <Feather name="check-circle" size={21} color={C_GREEN} />
                    ) : null}
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>2. Choisir un barème existant</Text>

            {baremes.length === 0 ? (
              <Text style={styles.emptyText}>
                Aucun barème de tentatives trouvé. Crée d’abord une page de barème dans l’écran Tentatives.
              </Text>
            ) : (
              baremes.map((b) => {
                const active = b.page_number === selectedPageNumber;

                return (
                  <TouchableOpacity
                    key={b.id}
                    activeOpacity={0.92}
                    onPress={() => setSelectedPageNumber(b.page_number)}
                    style={[styles.baremeCard, active && styles.baremeCardActive]}
                  >
                    <LinearGradient
                      colors={[PURPLE_FROM, PURPLE_TO]}
                      style={styles.baremeIcon}
                    >
                      <Feather name="layers" size={20} color={C_PURPLE} />
                    </LinearGradient>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionTitle} numberOfLines={1}>
                        {b.page_name || `Barème ${b.page_number}`}
                      </Text>

                      <Text style={styles.optionSub}>Page {b.page_number}</Text>
                    </View>

                    {active ? (
                      <Feather name="check-circle" size={21} color={C_PURPLE} />
                    ) : null}
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>Aperçu</Text>

            <Text style={styles.previewTitle} numberOfLines={2}>
              {selectedParcours ? getDisplayName(selectedParcours) : "Aucun parcours"}
            </Text>

            <View style={styles.previewArrow}>
              <Feather name="arrow-down" size={18} color="rgba(255,255,255,0.75)" />
            </View>

            <Text style={styles.previewBareme} numberOfLines={2}>
              {selectedBareme ? selectedBareme.page_name : "Aucun barème"}
            </Text>

            {hasCustomConfig ? (
              <View style={styles.customPill}>
                <Text style={styles.customPillText}>Déjà personnalisé</Text>
              </View>
            ) : (
              <View style={styles.generalPill}>
                <Text style={styles.generalPillText}>Utilise encore le barème général</Text>
              </View>
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
              disabled={saving || !selectedParcoursId || !selectedPageNumber}
              style={[
                styles.saveWrap,
                (saving || !selectedParcoursId || !selectedPageNumber) && { opacity: 0.55 },
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

  baremeCard: {
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

  baremeCardActive: {
    backgroundColor: C_PURPLE_BG,
    borderColor: "rgba(124,58,237,0.28)",
  },

  baremeIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyText: {
    color: C_SUB,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
  },

  previewCard: {
    backgroundColor: C_HEADER,
    borderRadius: 26,
    padding: 22,
    alignItems: "center",
  },

  previewLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 13,
    fontWeight: "800",
  },

  previewTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 8,
    textAlign: "center",
  },

  previewArrow: {
    marginTop: 10,
    marginBottom: 8,
  },

  previewBareme: {
    color: "#DDD6FE",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },

  customPill: {
    marginTop: 14,
    borderRadius: 999,
    backgroundColor: "rgba(167,243,208,0.15)",
    borderWidth: 1,
    borderColor: "rgba(167,243,208,0.35)",
    paddingHorizontal: 13,
    paddingVertical: 8,
  },

  customPillText: {
    color: "#A7F3D0",
    fontSize: 12,
    fontWeight: "900",
  },

  generalPill: {
    marginTop: 14,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 13,
    paddingVertical: 8,
  },

  generalPillText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    fontWeight: "900",
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
});