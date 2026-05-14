import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { supabase } from "../../supabaseClient";

type Classe = {
  id: string;
  name?: string | null;
  color?: string | null;
};

type CarteCompetence = {
  id: string;
  user_id: string;
  classe_id: string;
  nom: string;
  description?: string | null;
  couleur?: string | null;
  icone?: string | null;
  ordre?: number | null;
};

const PAGE_BG = "#EDF2F6";
const CONTENT_BG = "#EEF3F7";
const CARD_BG = "#FFFFFF";
const CARD_BORDER = "#C9D5DF";
const CARD_TITLE = "#233548";
const CARD_SUBTITLE = "#5F7386";
const HEADER_BG = "#1F5B86";
const HEADER_ICON_BG = "#2D6C97";
const TEXT_BG = "#E8F1FD";

const COULEURS = ["#38BDF8", "#22C55E", "#F59E0B", "#A855F7", "#EF4444", "#14B8A6"];

const ICONES = [
  { id: "map", label: "Carte", emoji: "🗺️" },
  { id: "compass", label: "Boussole", emoji: "🧭" },
  { id: "target", label: "Précision", emoji: "🎯" },
  { id: "forest", label: "Forêt", emoji: "🌲" },
  { id: "flag", label: "Balises", emoji: "🚩" },
  { id: "star", label: "Défi", emoji: "⭐" },
];

function nomClasse(classe: Classe) {
  return classe.name || "Classe sans nom";
}

function emojiIcone(id?: string | null) {
  return ICONES.find((i) => i.id === id)?.emoji ?? "🗺️";
}

export default function CreationCarteDeCompetence({
  onOpenCarte,
}: {
  onOpenCarte: (carte: CarteCompetence) => void;
}) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1100;
  const isTablet = width >= 768 && width < 1100;
  const isSmall = width < 720;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userId, setUserId] = useState<string | null>(null);
  const [classes, setClasses] = useState<Classe[]>([]);
  const [classeId, setClasseId] = useState<string | null>(null);
  const [cartes, setCartes] = useState<CarteCompetence[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [nom, setNom] = useState("");
  const [description, setDescription] = useState("");
  const [couleur, setCouleur] = useState(COULEURS[0]);
  const [icone, setIcone] = useState("map");

  const horizontalPadding = isDesktop ? 28 : isTablet ? 22 : 14;

  const nbColonnes = useMemo(() => {
    if (width >= 1100) return 4;
    if (width >= 760) return 3;
    return 2;
  }, [width]);

  const charger = useCallback(async () => {
    try {
      setLoading(true);

      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id ?? null;

      if (!uid) {
        setUserId(null);
        setClasses([]);
        setCartes([]);
        return;
      }

      setUserId(uid);

      const { data: classesData, error: classesError } = await supabase
        .from("groups")
        .select("id,name,color")
        .eq("teacher_id", uid)
        .order("name", { ascending: true });

      if (classesError) throw classesError;

      const listeClasses = (classesData ?? []) as Classe[];
      setClasses(listeClasses);

      const premierClasseId = classeId || listeClasses[0]?.id || null;
      setClasseId(premierClasseId);

      if (!premierClasseId) {
        setCartes([]);
        return;
      }

      const { data: cartesData, error: cartesError } = await supabase
        .from("cartes_competences")
        .select("*")
        .eq("user_id", uid)
        .eq("classe_id", premierClasseId)
        .order("ordre", { ascending: true })
        .order("created_at", { ascending: true });

      if (cartesError) throw cartesError;

      setCartes((cartesData ?? []) as CarteCompetence[]);
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Impossible de charger les cartes.");
    } finally {
      setLoading(false);
    }
  }, [classeId]);

  useEffect(() => {
    charger();
  }, [charger]);

  const changerClasse = async (id: string) => {
    setClasseId(id);
    if (!userId) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("cartes_competences")
      .select("*")
      .eq("user_id", userId)
      .eq("classe_id", id)
      .order("ordre", { ascending: true })
      .order("created_at", { ascending: true });

    setLoading(false);

    if (error) {
      Alert.alert("Erreur", error.message);
      return;
    }

    setCartes((data ?? []) as CarteCompetence[]);
  };

  const resetForm = () => {
    setNom("");
    setDescription("");
    setCouleur(COULEURS[0]);
    setIcone("map");
  };

  const creerCarte = async () => {
    if (!userId || !classeId) {
      Alert.alert("Erreur", "Aucune classe sélectionnée.");
      return;
    }

    const propreNom = nom.trim();

    if (!propreNom) {
      Alert.alert("Nom obligatoire", "Donne un nom à ta carte de compétence.");
      return;
    }

    try {
      setSaving(true);

      const { data, error } = await supabase
        .from("cartes_competences")
        .insert({
          user_id: userId,
          classe_id: classeId,
          nom: propreNom,
          description: description.trim() || null,
          couleur,
          icone,
          ordre: cartes.length,
        })
        .select("*")
        .single();

      if (error) throw error;

      setCartes((old) => [...old, data as CarteCompetence]);
      setModalVisible(false);
      resetForm();
    } catch (e: any) {
      Alert.alert("Erreur", e?.message ?? "Impossible de créer la carte.");
    } finally {
      setSaving(false);
    }
  };

  const supprimerCarte = async (carte: CarteCompetence) => {
    const action = async () => {
      const { error } = await supabase
        .from("cartes_competences")
        .delete()
        .eq("id", carte.id);

      if (error) {
        Alert.alert("Erreur", error.message);
        return;
      }

      setCartes((old) => old.filter((c) => c.id !== carte.id));
    };

    if (Platform.OS === "web") {
      const ok = window.confirm(`Supprimer la carte "${carte.nom}" ?`);
      if (ok) action();
      return;
    }

    Alert.alert("Supprimer", `Supprimer la carte "${carte.nom}" ?`, [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: action },
    ]);
  };

  const renderCarte = ({ item }: { item: CarteCompetence }) => (
    <TouchableOpacity
      activeOpacity={0.9}
      style={[
        styles.skillCard,
        {
          width: isSmall ? "47%" : `${100 / nbColonnes - 2}%`,
          borderColor: CARD_BORDER,
        },
      ]}
      onPress={() => onOpenCarte(item)}
    >
      <View style={styles.skillCardInner}>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => supprimerCarte(item)}
          activeOpacity={0.8}
        >
          <Feather name="trash-2" size={16} color="#EF4444" />
        </TouchableOpacity>

        <View style={[styles.iconeBadge, { backgroundColor: item.couleur || HEADER_ICON_BG }]}>
          <Text style={styles.emoji}>{emojiIcone(item.icone)}</Text>
        </View>

        <View style={styles.percentPill}>
          <Text style={styles.percentText}>0 %</Text>
        </View>

        <Text numberOfLines={2} style={styles.cardTitle}>
          {item.nom}
        </Text>

        {!!item.description && (
          <Text numberOfLines={2} style={styles.cardDescription}>
            {item.description}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={[styles.topBar, { paddingHorizontal: horizontalPadding }]}> 
          <View>
            <Text style={styles.title}>Progressivité</Text>
            <Text style={styles.subtitle}>Cartes de compétences</Text>
          </View>

          <TouchableOpacity
            style={styles.addTopBtn}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={26} color="white" />
          </TouchableOpacity>
        </View>

        <View style={[styles.classZone, { paddingHorizontal: horizontalPadding }]}> 
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {classes.map((classe) => {
              const active = classe.id === classeId;
              return (
                <TouchableOpacity
                  key={classe.id}
                  onPress={() => changerClasse(classe.id)}
                  style={[styles.classPill, active && styles.classPillActive]}
                >
                  <Text style={[styles.classText, active && styles.classTextActive]}>
                    {nomClasse(classe)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={HEADER_BG} />
            <Text style={styles.loadingText}>Chargement...</Text>
          </View>
        ) : !classeId ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>🏫</Text>
            <Text style={styles.emptyTitle}>Aucune classe trouvée</Text>
            <Text style={styles.emptyText}>
              Crée d’abord une classe dans la gestion des groupes.
            </Text>
          </View>
        ) : cartes.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>🧭</Text>
            <Text style={styles.emptyTitle}>Aucune carte</Text>
            <Text style={styles.emptyText}>
              Crée une première compétence à travailler en course d’orientation.
            </Text>

            <TouchableOpacity
              style={styles.bigCreateBtn}
              onPress={() => setModalVisible(true)}
            >
              <Feather name="plus" size={24} color="white" />
              <Text style={styles.bigCreateText}>Créer une carte</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={cartes}
            key={nbColonnes}
            numColumns={nbColonnes}
            keyExtractor={(item) => item.id}
            renderItem={renderCarte}
            contentContainerStyle={[styles.grid, { paddingHorizontal: horizontalPadding }]}
            columnWrapperStyle={styles.row}
            showsVerticalScrollIndicator={false}
          />
        )}

        <Modal visible={modalVisible} transparent animationType="fade">
          <Pressable style={styles.modalBackdrop} onPress={() => setModalVisible(false)}>
            <Pressable style={styles.modalCard}>
              <Text style={styles.modalTitle}>Créer une carte</Text>
              <Text style={styles.modalSubtitle}>
                Exemple : Lire une carte, Choisir un itinéraire, Gérer son effort...
              </Text>

              <Text style={styles.label}>Nom</Text>
              <TextInput
                value={nom}
                onChangeText={setNom}
                placeholder="Nom de la compétence"
                placeholderTextColor="#94A3B8"
                style={styles.input}
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Petite description"
                placeholderTextColor="#94A3B8"
                style={[styles.input, styles.textArea]}
                multiline
              />

              <Text style={styles.label}>Icône</Text>
              <View style={styles.iconGrid}>
                {ICONES.map((i) => {
                  const active = i.id === icone;
                  return (
                    <TouchableOpacity
                      key={i.id}
                      style={[styles.iconChoice, active && styles.iconChoiceActive]}
                      onPress={() => setIcone(i.id)}
                    >
                      <Text style={styles.iconEmoji}>{i.emoji}</Text>
                      <Text style={[styles.iconLabel, active && styles.iconLabelActive]}>
                        {i.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>Couleur</Text>
              <View style={styles.colorRow}>
                {COULEURS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    onPress={() => setCouleur(c)}
                    style={[
                      styles.colorDot,
                      { backgroundColor: c },
                      couleur === c && styles.colorDotActive,
                    ]}
                  />
                ))}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={styles.cancelText}>Annuler</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={creerCarte}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text style={styles.saveText}>Créer</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },

  container: {
    flex: 1,
    backgroundColor: CONTENT_BG,
  },

  topBar: {
    minHeight: 92,
    paddingTop: 24,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  title: {
    color: CARD_TITLE,
    fontSize: 31,
    fontWeight: "900",
    letterSpacing: 0.2,
  },

  subtitle: {
    color: CARD_SUBTITLE,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },

  addTopBtn: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: HEADER_BG,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
  },

  classZone: {
    paddingBottom: 14,
  },

  classPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: CARD_BG,
    marginRight: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },

  classPillActive: {
    backgroundColor: HEADER_BG,
    borderColor: HEADER_BG,
  },

  classText: {
    color: CARD_TITLE,
    fontWeight: "900",
  },

  classTextActive: {
    color: "white",
  },

  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingText: {
    color: CARD_SUBTITLE,
    fontWeight: "900",
    marginTop: 10,
  },

  grid: {
    paddingBottom: 120,
  },

  row: {
    justifyContent: "space-between",
  },

  skillCard: {
    marginBottom: 18,
    borderRadius: 22,
    borderWidth: 1,
    backgroundColor: CARD_BG,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    overflow: "hidden",
  },

  skillCardInner: {
    minHeight: 176,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: CARD_BG,
  },

  deleteBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },

  iconeBadge: {
    width: 74,
    height: 74,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    borderWidth: 4,
    borderColor: TEXT_BG,
  },

  emoji: {
    fontSize: 38,
  },

  percentPill: {
    backgroundColor: HEADER_ICON_BG,
    paddingHorizontal: 18,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 7,
  },

  percentText: {
    color: "white",
    fontSize: 18,
    fontWeight: "900",
  },

  cardTitle: {
    color: CARD_TITLE,
    fontSize: 19,
    fontWeight: "900",
    textAlign: "center",
  },

  cardDescription: {
    marginTop: 4,
    color: CARD_SUBTITLE,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },

  emptyBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },

  emptyEmoji: {
    fontSize: 62,
    marginBottom: 10,
  },

  emptyTitle: {
    color: CARD_TITLE,
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
  },

  emptyText: {
    color: CARD_SUBTITLE,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },

  bigCreateBtn: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: HEADER_BG,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 18,
  },

  bigCreateText: {
    color: "white",
    fontWeight: "900",
    fontSize: 16,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },

  modalCard: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "92%",
    backgroundColor: "white",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },

  modalTitle: {
    fontSize: 25,
    fontWeight: "900",
    color: CARD_TITLE,
  },

  modalSubtitle: {
    marginTop: 4,
    color: CARD_SUBTITLE,
    fontWeight: "700",
    lineHeight: 20,
  },

  label: {
    marginTop: 16,
    marginBottom: 7,
    color: CARD_TITLE,
    fontWeight: "900",
  },

  input: {
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontWeight: "800",
    color: CARD_TITLE,
    backgroundColor: "#F8FAFC",
  },

  textArea: {
    minHeight: 76,
    textAlignVertical: "top",
  },

  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  iconChoice: {
    width: "31%",
    minHeight: 72,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },

  iconChoiceActive: {
    backgroundColor: TEXT_BG,
    borderColor: HEADER_ICON_BG,
    borderWidth: 2,
  },

  iconEmoji: {
    fontSize: 24,
  },

  iconLabel: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: "900",
    color: CARD_SUBTITLE,
  },

  iconLabelActive: {
    color: HEADER_BG,
  },

  colorRow: {
    flexDirection: "row",
    gap: 10,
  },

  colorDot: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "white",
  },

  colorDotActive: {
    borderColor: HEADER_BG,
    transform: [{ scale: 1.12 }],
  },

  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 22,
  },

  cancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: "#E2E8F0",
  },

  cancelText: {
    color: "#334155",
    fontWeight: "900",
  },

  saveBtn: {
    minWidth: 110,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 16,
    backgroundColor: HEADER_BG,
    alignItems: "center",
  },

  saveText: {
    color: "white",
    fontWeight: "900",
  },
});