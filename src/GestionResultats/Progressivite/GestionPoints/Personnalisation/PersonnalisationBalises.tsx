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
  balises_ordre?: any;
  teacher_id?: string | null;
  professeur_id?: string | null;
  user_id?: string | null;
  created_at?: string | null;
};

type BaliseRow = {
  id: string;
  code?: string | null;
  points?: number | null;
  numero_balise?: number | null;
  user_id?: string | null;
  teacher_id?: string | null;
  professeur_id?: string | null;
  [key: string]: any;
};

type OverrideRow = {
  id?: string;
  parcours_id: string;
  balise_id: string;
  points: number;
  teacher_id: string;
  updated_at?: string | null;
};

const C_BG = "#EEF3F7";
const C_HEADER = "#1F5B86";
const C_HEADER_BTN = "#2D6C97";
const C_CARD = "#FFFFFF";
const C_BORDER = "#D6E0EA";
const C_TEXT = "#233548";
const C_SUB = "#5F7386";
const C_BLUE = "#1D4ED8";
const C_BLUE_BG = "#E8F1FD";
const C_GREEN = "#059669";
const C_RED = "#EF4444";

const OVERRIDES_TABLE = "parcours_balise_points";

const getDisplayName = (row: any) => String(row?.nom ?? row?.name ?? "Sans nom");

const parseBalisesOrdre = (value: any): string[] => {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map(String).map((v) => v.trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(String).map((v) => v.trim()).filter(Boolean);
      }
    } catch {}

    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return [];
};

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

function ParcoursPickerModal({
  visible,
  parcours,
  selectedParcoursId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  parcours: ParcoursRow[];
  selectedParcoursId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Choisir un parcours</Text>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose}>
              <Feather name="x" size={20} color={C_TEXT} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {parcours.length === 0 ? (
              <Text style={styles.emptyText}>Aucun parcours trouvé.</Text>
            ) : (
              parcours.map((p) => {
                const active = p.id === selectedParcoursId;

                return (
                  <TouchableOpacity
                    key={p.id}
                    activeOpacity={0.9}
                    style={[
                      styles.parcoursOption,
                      active && styles.parcoursOptionActive,
                    ]}
                    onPress={() => {
                      onSelect(p.id);
                      onClose();
                    }}
                  >
                    <View style={styles.parcoursOptionIcon}>
                      <Feather name="map" size={18} color={C_BLUE} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.parcoursOptionTitle}>{getDisplayName(p)}</Text>
                      <Text style={styles.parcoursOptionSub}>
                        {parseBalisesOrdre(p.balises_ordre).length} balise(s)
                      </Text>
                    </View>

                    {active ? <Feather name="check" size={18} color={C_GREEN} /> : null}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function PersonnalisationBalises({ setPage }: Props) {
  const [teacherId, setTeacherId] = useState<string | null>(null);

  const [parcours, setParcours] = useState<ParcoursRow[]>([]);
  const [selectedParcoursId, setSelectedParcoursId] = useState<string | null>(null);

  const [allBalises, setAllBalises] = useState<BaliseRow[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  const [isLoading, setIsLoading] = useState(true);
  const [isSavingId, setIsSavingId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  const selectedParcours = useMemo(
    () => parcours.find((p) => p.id === selectedParcoursId) ?? null,
    [parcours, selectedParcoursId]
  );

  const selectedTokens = useMemo(
    () => parseBalisesOrdre(selectedParcours?.balises_ordre),
    [selectedParcours]
  );

  const balisesDuParcours = useMemo(() => {
    if (!selectedParcours) return [];

    const byId = new Map(allBalises.map((b) => [String(b.id), b]));
    const byNumero = new Map(
      allBalises
        .filter((b) => b.numero_balise != null)
        .map((b) => [String(b.numero_balise), b])
    );
    const byCode = new Map(
      allBalises
        .filter((b) => b.code)
        .map((b) => [String(b.code).trim(), b])
    );

    const used = new Set<string>();
    const ordered: BaliseRow[] = [];

    selectedTokens.forEach((token) => {
      const clean = String(token).trim();
      const found = byId.get(clean) || byNumero.get(clean) || byCode.get(clean);

      if (found && !used.has(String(found.id))) {
        used.add(String(found.id));
        ordered.push(found);
      }
    });

    return ordered;
  }, [allBalises, selectedParcours, selectedTokens]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setErrorText(null);

    try {
      const authTeacherId = await resolveTeacherId();
      setTeacherId(authTeacherId);

      if (!authTeacherId) {
        setErrorText("Impossible de retrouver le professeur connecté.");
        return;
      }

      const [parcoursRes, balisesRes] = await Promise.all([
        supabase
          .from("parcours")
          .select("*")
          .order("created_at", { ascending: true }),
        supabase
          .from("balises")
          .select("*")
          .order("numero_balise", { ascending: true }),
      ]);

      if (parcoursRes.error) throw parcoursRes.error;
      if (balisesRes.error) throw balisesRes.error;

      const nextParcours = ((parcoursRes.data ?? []) as ParcoursRow[])
        .filter((p) => rowBelongsToTeacher(p, authTeacherId))
        .map((p) => ({
          ...p,
          id: String(p.id),
          nom: getDisplayName(p),
        }));

      const nextBalises = ((balisesRes.data ?? []) as BaliseRow[])
        .filter((b) => rowBelongsToTeacher(b, authTeacherId))
        .map((b) => ({
          ...b,
          id: String(b.id),
          points: Number(b.points ?? 0),
        }));

      setParcours(nextParcours);
      setAllBalises(nextBalises);

      setSelectedParcoursId((prev) => {
        if (prev && nextParcours.some((p) => p.id === prev)) return prev;
        return nextParcours[0]?.id ?? null;
      });
    } catch (err: any) {
      console.error("Erreur chargement PersonnalisationBalises :", err);
      setErrorText(err?.message ?? "Erreur inconnue.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchOverrides = useCallback(async () => {
    if (!teacherId || !selectedParcoursId) {
      setOverrides({});
      setDraftValues({});
      return;
    }

    try {
      const { data, error } = await supabase
        .from(OVERRIDES_TABLE)
        .select("*")
        .eq("teacher_id", teacherId)
        .eq("parcours_id", selectedParcoursId);

      if (error) throw error;

      const nextOverrides: Record<string, number> = {};
      const nextDrafts: Record<string, string> = {};

      ((data ?? []) as OverrideRow[]).forEach((row) => {
        const id = String(row.balise_id);
        const points = Number(row.points ?? 0);

        nextOverrides[id] = points;
        nextDrafts[id] = String(points);
      });

      setOverrides(nextOverrides);
      setDraftValues(nextDrafts);
    } catch (err: any) {
      console.error("Erreur chargement personnalisations balises :", err);
      setOverrides({});
      setDraftValues({});
    }
  }, [selectedParcoursId, teacherId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  const getEffectivePoints = (balise: BaliseRow) => {
    const id = String(balise.id);
    if (overrides[id] != null) return Number(overrides[id]);
    return Number(balise.points ?? 0);
  };

  const getDraftValue = (balise: BaliseRow) => {
    const id = String(balise.id);
    if (draftValues[id] != null) return draftValues[id];
    return String(getEffectivePoints(balise));
  };

  const saveBaliseValue = async (balise: BaliseRow) => {
    if (!teacherId || !selectedParcoursId) return;

    const baliseId = String(balise.id);
    const raw = getDraftValue(balise).replace(",", ".");
    const nextPoints = Number(raw);

    if (!Number.isFinite(nextPoints)) {
      Alert.alert("Valeur invalide", "Entre un nombre valide.");
      return;
    }

    setIsSavingId(baliseId);

    try {
      const payload = {
        teacher_id: teacherId,
        parcours_id: selectedParcoursId,
        balise_id: baliseId,
        points: nextPoints,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from(OVERRIDES_TABLE)
        .upsert(payload, {
          onConflict: "teacher_id,parcours_id,balise_id",
        });

      if (error) throw error;

      setOverrides((prev) => ({
        ...prev,
        [baliseId]: nextPoints,
      }));

      setDraftValues((prev) => ({
        ...prev,
        [baliseId]: String(nextPoints),
      }));

      Alert.alert("Valeur enregistrée", "Cette valeur est personnalisée uniquement pour ce parcours.");
    } catch (err: any) {
      console.error("Erreur sauvegarde valeur balise :", err);
      Alert.alert(
        "Erreur",
        `Impossible d'enregistrer la personnalisation.\n\n${err?.message ?? "Erreur inconnue"}`
      );
    } finally {
      setIsSavingId(null);
    }
  };

  const resetBaliseValue = async (balise: BaliseRow) => {
    if (!teacherId || !selectedParcoursId) return;

    const baliseId = String(balise.id);

    setIsSavingId(baliseId);

    try {
      const { error } = await supabase
        .from(OVERRIDES_TABLE)
        .delete()
        .eq("teacher_id", teacherId)
        .eq("parcours_id", selectedParcoursId)
        .eq("balise_id", baliseId);

      if (error) throw error;

      setOverrides((prev) => {
        const next = { ...prev };
        delete next[baliseId];
        return next;
      });

      setDraftValues((prev) => ({
        ...prev,
        [baliseId]: String(Number(balise.points ?? 0)),
      }));
    } catch (err: any) {
      console.error("Erreur reset valeur balise :", err);
      Alert.alert(
        "Erreur",
        `Impossible de revenir à la valeur de base.\n\n${err?.message ?? "Erreur inconnue"}`
      );
    } finally {
      setIsSavingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => setPage("gestionPoints")}
          activeOpacity={0.9}
        >
          <Feather name="arrow-left" size={21} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={styles.headerTextBox}>
          <Text style={styles.headerTitle}>Balises</Text>
          <Text style={styles.headerSub}>Valeurs personnalisées par parcours</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={C_BLUE} />
            <Text style={styles.stateTitle}>Chargement...</Text>
            <Text style={styles.stateText}>Récupération des parcours et des balises.</Text>
          </View>
        ) : errorText ? (
          <View style={styles.stateCard}>
            <View style={styles.errorIcon}>
              <Feather name="alert-circle" size={26} color={C_RED} />
            </View>
            <Text style={styles.stateTitle}>Erreur</Text>
            <Text style={styles.stateText}>{errorText}</Text>

            <TouchableOpacity style={styles.primaryBtn} onPress={fetchData}>
              <Text style={styles.primaryBtnText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroIcon}>
                <Feather name="tag" size={28} color={C_BLUE} />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>Personnalisation des balises</Text>
                <Text style={styles.heroText}>
                  Modifie les points d’une balise uniquement pour le parcours choisi.
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Parcours cible</Text>

              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.parcoursSelector}
                onPress={() => setPickerVisible(true)}
              >
                <View style={styles.parcoursSelectorLeft}>
                  <View style={styles.selectorIcon}>
                    <Feather name="map" size={18} color={C_BLUE} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.selectorTitle} numberOfLines={1}>
                      {selectedParcours ? getDisplayName(selectedParcours) : "Choisir un parcours"}
                    </Text>
                    <Text style={styles.selectorSub}>
                      {selectedParcours
                        ? `${selectedTokens.length} balise(s) dans ce parcours`
                        : "Aucun parcours sélectionné"}
                    </Text>
                  </View>
                </View>

                <Feather name="chevron-down" size={20} color={C_BLUE} />
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View>
                  <Text style={styles.cardTitle}>Balises du parcours</Text>
                  <Text style={styles.cardSub}>
                    La valeur de base reste inchangée partout ailleurs.
                  </Text>
                </View>

                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{balisesDuParcours.length}</Text>
                </View>
              </View>

              {!selectedParcours ? (
                <Text style={styles.emptyText}>Choisis un parcours pour afficher ses balises.</Text>
              ) : balisesDuParcours.length === 0 ? (
                <Text style={styles.emptyText}>
                  Aucune balise reconnue dans ce parcours.
                </Text>
              ) : (
                balisesDuParcours.map((balise, index) => {
                  const baliseId = String(balise.id);
                  const basePoints = Number(balise.points ?? 0);
                  const hasOverride = overrides[baliseId] != null;
                  const saving = isSavingId === baliseId;

                  return (
                    <View key={baliseId} style={styles.baliseCard}>
                      <View style={styles.baliseTopRow}>
                        <View style={styles.baliseBadge}>
                          <Text style={styles.baliseBadgeText}>
                            {balise.numero_balise ?? index + 1}
                          </Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={styles.baliseTitle}>
                            Balise {balise.numero_balise ?? index + 1}
                          </Text>
                          <Text style={styles.baliseSub} numberOfLines={1}>
                            Code : {balise.code || "—"}
                          </Text>
                        </View>

                        {hasOverride ? (
                          <View style={styles.customPill}>
                            <Text style={styles.customPillText}>Personnalisée</Text>
                          </View>
                        ) : (
                          <View style={styles.basePill}>
                            <Text style={styles.basePillText}>Base</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.pointsRow}>
                        <View style={styles.baseBox}>
                          <Text style={styles.boxLabel}>Base</Text>
                          <Text style={styles.boxValue}>{basePoints} pts</Text>
                        </View>

                        <View style={styles.customBox}>
                          <Text style={styles.boxLabel}>Pour ce parcours</Text>

                          <View style={styles.inputLine}>
                            <TextInput
                              value={getDraftValue(balise)}
                              onChangeText={(txt) => {
                                const cleaned = txt.replace(/[^0-9.,-]/g, "");
                                setDraftValues((prev) => ({
                                  ...prev,
                                  [baliseId]: cleaned,
                                }));
                              }}
                              keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "numeric"}
                              style={styles.pointsInput}
                            />
                            <Text style={styles.pointsUnit}>pts</Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.actionsRow}>
                        <TouchableOpacity
                          activeOpacity={0.9}
                          style={[styles.secondaryBtn, !hasOverride && { opacity: 0.45 }]}
                          disabled={!hasOverride || saving}
                          onPress={() => resetBaliseValue(balise)}
                        >
                          <Text style={styles.secondaryBtnText}>Valeur de base</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.9}
                          style={styles.saveBtn}
                          disabled={saving}
                          onPress={() => saveBaliseValue(balise)}
                        >
                          {saving ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Feather name="save" size={14} color="#FFFFFF" />
                          )}
                          <Text style={styles.saveBtnText}>Enregistrer</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </>
        )}
      </ScrollView>

      <ParcoursPickerModal
        visible={pickerVisible}
        parcours={parcours}
        selectedParcoursId={selectedParcoursId}
        onClose={() => setPickerVisible(false)}
        onSelect={setSelectedParcoursId}
      />
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

  headerTextBox: {
    flex: 1,
  },

  headerTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "900",
  },

  headerSub: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },

  content: {
    padding: 14,
    gap: 14,
    paddingBottom: 34,
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
    width: 62,
    height: 62,
    borderRadius: 20,
    backgroundColor: C_BLUE_BG,
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

  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 12,
  },

  cardTitle: {
    color: C_TEXT,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 5,
  },

  cardSub: {
    color: C_SUB,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },

  parcoursSelector: {
    minHeight: 62,
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: C_BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  parcoursSelectorLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  selectorIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: C_BLUE_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  selectorTitle: {
    color: C_TEXT,
    fontSize: 14,
    fontWeight: "900",
  },

  selectorSub: {
    color: C_SUB,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },

  countPill: {
    minWidth: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C_BLUE_BG,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },

  countPillText: {
    color: C_BLUE,
    fontSize: 13,
    fontWeight: "900",
  },

  baliseCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#F8FAFC",
    padding: 12,
    marginBottom: 12,
  },

  baliseTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  baliseBadge: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: C_BLUE_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  baliseBadgeText: {
    color: C_BLUE,
    fontSize: 14,
    fontWeight: "900",
  },

  baliseTitle: {
    color: C_TEXT,
    fontSize: 15,
    fontWeight: "900",
  },

  baliseSub: {
    color: C_SUB,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },

  customPill: {
    borderRadius: 999,
    backgroundColor: "rgba(5,150,105,0.12)",
    borderWidth: 1,
    borderColor: "rgba(5,150,105,0.25)",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  customPillText: {
    color: C_GREEN,
    fontSize: 10,
    fontWeight: "900",
  },

  basePill: {
    borderRadius: 999,
    backgroundColor: "rgba(95,115,134,0.10)",
    borderWidth: 1,
    borderColor: "rgba(95,115,134,0.18)",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  basePillText: {
    color: C_SUB,
    fontSize: 10,
    fontWeight: "900",
  },

  pointsRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
  },

  baseBox: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 10,
  },

  customBox: {
    flex: 1.35,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(29,78,216,0.20)",
    padding: 10,
  },

  boxLabel: {
    color: C_SUB,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 5,
  },

  boxValue: {
    color: C_TEXT,
    fontSize: 16,
    fontWeight: "900",
  },

  inputLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  pointsInput: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#F8FAFC",
    color: C_TEXT,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === "web" ? 8 : 6,
  },

  pointsUnit: {
    color: C_TEXT,
    fontSize: 13,
    fontWeight: "900",
  },

  actionsRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
  },

  secondaryBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: "#E2E8F0",
    borderWidth: 1,
    borderColor: C_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },

  secondaryBtnText: {
    color: C_TEXT,
    fontSize: 12,
    fontWeight: "900",
  },

  saveBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: C_HEADER,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },

  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },

  stateCard: {
    backgroundColor: C_CARD,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 22,
    alignItems: "center",
  },

  stateTitle: {
    color: C_TEXT,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 10,
  },

  stateText: {
    color: C_SUB,
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },

  errorIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: "rgba(239,68,68,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },

  primaryBtn: {
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: C_HEADER,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },

  emptyText: {
    color: C_SUB,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 20,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.32)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },

  modalCard: {
    width: "100%",
    maxWidth: 560,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
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

  modalTitle: {
    color: C_TEXT,
    fontSize: 18,
    fontWeight: "900",
  },

  modalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: "rgba(15,23,42,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },

  parcoursOption: {
    minHeight: 62,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  parcoursOptionActive: {
    backgroundColor: C_BLUE_BG,
    borderColor: "rgba(29,78,216,0.25)",
  },

  parcoursOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  parcoursOptionTitle: {
    color: C_TEXT,
    fontSize: 14,
    fontWeight: "900",
  },

  parcoursOptionSub: {
    color: C_SUB,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
});