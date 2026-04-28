// src/GestionEleves.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import BottomBar from "./ui/BottomBar";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import {
  ArrowLeft,
  UserPlus,
  Edit3,
  Trash2,
  Save,
  X,
  Search,
  ArrowUpAZ,
  ArrowDownAZ,
  Hash,
} from "lucide-react-native";
import { supabase } from "./supabaseClient";

/* ======================= Types ======================= */
type SetPageFn = (page: any) => void;
type ProfesseurMinimal = { user_id?: string | null };

type GroupeMinimal = {
  id: string | number;
  name?: string;
  nom?: string;
  color?: string;
  teacher_id?: string | number;
};

type GenreEleve = "M" | "F" | null;
type SortMode = "order_asc" | "order_desc" | "alpha_asc" | "alpha_desc";

interface Eleve {
  id: string;
  name: string;
  code: string;
  group_id: string;
  teacher_id: string;
  genre: GenreEleve;
  order_index: number | null;
}

type Props = {
  setPage: SetPageFn;
  professeur: ProfesseurMinimal;
  selectedGroup?: GroupeMinimal | null;
  selectedGroupId?: string | null;
  setModeConnexion?: (mode: any) => void;
};

/* ======================= Thème ======================= */
const C_BG = "#EFEFEF";
const C_HEADER = "#87A7BA";
const C_BORDER = "rgba(0,0,0,0.08)";
const C_TEXT = "#0f172a";

const TAG_FILLE_BG = "rgba(236,72,153,0.20)";
const TAG_GARCON_BG = "rgba(59,130,246,0.20)";
const TAG_NEUTRE_BG = "rgba(15,23,42,0.08)";

const TAG_FILLE_TEXT = "#be185d";
const TAG_GARCON_TEXT = "#1d4ed8";
const TAG_NEUTRE_TEXT = "#334155";

const BOTTOM_BAR_HEIGHT = 78;
const SAFE_EXTRA_IOS = Platform.OS === "ios" ? 0 : 0;
const GRID_GAP = 8;

/* ======================= Helpers ======================= */
function normalizeText(v: string) {
  return (v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getColumnCount(width: number) {
  if (width >= 1500) return 6;
  if (width >= 1250) return 5;
  if (width >= 980) return 4;
  if (width >= 700) return 3;
  if (width >= 420) return 2;
  return 2;
}

const GestionEleves: React.FC<Props> = ({ setPage, professeur, selectedGroup, selectedGroupId }) => {
  const { width } = useWindowDimensions();

  const numColumns = useMemo(() => getColumnCount(width), [width]);
  const contentPadding = 10;
  const totalGap = GRID_GAP * (numColumns - 1);
  const usableWidth = Math.max(0, width - contentPadding * 2 - totalGap);
  const cardWidth = usableWidth / numColumns;

  const isPhone = width < 700;
  const isSmallPhone = width < 430;
  const isCompactHeader = width < 700;
  const isVerySmall = width < 420;

  const cardHeight = useMemo(() => {
    if (width < 430) return 104;
    if (width < 700) return 114;
    return 132;
  }, [width]);

  const [eleves, setEleves] = useState<Eleve[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("order_asc");

  const [showAddModal, setShowAddModal] = useState(false);

  const [editingEleveId, setEditingEleveId] = useState<string | null>(null);
  const [editedEleveName, setEditedEleveName] = useState("");
  const [editedEleveGenre, setEditedEleveGenre] = useState<GenreEleve>("M");

  const [newEleveName, setNewEleveName] = useState("");
  const [newEleveGenre, setNewEleveGenre] = useState<GenreEleve>("M");

  const [refreshing, setRefreshing] = useState(false);
  const [emptyHint, setEmptyHint] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Eleve | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const groupId: string | null = useMemo(() => {
    const id = selectedGroup?.id ?? selectedGroupId ?? null;
    return id != null ? String(id) : null;
  }, [selectedGroup, selectedGroupId]);

  /* ======================= Fetch ======================= */
  const fetchEleves = useCallback(async () => {
    setEmptyHint(null);

    if (!professeur?.user_id || !groupId) {
      setEleves([]);
      setIsLoaded(true);
      return;
    }

    const { data, error } = await supabase
      .from("students")
      .select("id, name, code, group_id, teacher_id, genre, order_index")
      .eq("teacher_id", professeur.user_id)
      .eq("group_id", groupId)
      .order("order_index", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Erreur chargement élèves:", error.message);
      Alert.alert("Erreur", "Impossible de charger les élèves.");
      setEleves([]);
      setIsLoaded(true);
      return;
    }

    const mapped: Eleve[] = (data || []).map((e: any) => ({
      id: String(e.id),
      name: String(e.name ?? ""),
      code: String(e.code ?? ""),
      group_id: String(e.group_id ?? ""),
      teacher_id: String(e.teacher_id ?? ""),
      genre: (e.genre as GenreEleve) ?? null,
      order_index: typeof e.order_index === "number" ? e.order_index : null,
    }));

    if (mapped.length === 0) {
      setEmptyHint("Aucun élève trouvé dans ce groupe.");
    }

    setEleves(mapped);
    setIsLoaded(true);
  }, [professeur?.user_id, groupId]);

  useEffect(() => {
    setIsLoaded(false);
    fetchEleves();
  }, [fetchEleves]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEleves();
    setRefreshing(false);
  }, [fetchEleves]);

  /* ======================= Utils ======================= */
  const generateEleveCode = useCallback(() => {
    let newCode: string;
    do {
      newCode = Math.floor(100000 + Math.random() * 900000).toString();
    } while (eleves.some((e) => e.code === newCode));
    return newCode;
  }, [eleves]);

  const nextOrderIndex = useMemo(() => {
    const maxVal = eleves.reduce((acc, e) => {
      const n = typeof e.order_index === "number" ? e.order_index : 0;
      return Math.max(acc, n);
    }, 0);
    return maxVal + 1;
  }, [eleves]);

  const genreLabel = useCallback((genre: GenreEleve) => {
    if (genre === "M") return "Garçon";
    if (genre === "F") return "Fille";
    return "Non défini";
  }, []);

  const genreBadgeStyle = useCallback((genre: GenreEleve) => {
    if (genre === "M") return { backgroundColor: TAG_GARCON_BG, color: TAG_GARCON_TEXT };
    if (genre === "F") return { backgroundColor: TAG_FILLE_BG, color: TAG_FILLE_TEXT };
    return { backgroundColor: TAG_NEUTRE_BG, color: TAG_NEUTRE_TEXT };
  }, []);

  const filteredAndSortedEleves = useMemo(() => {
    const q = normalizeText(searchTerm);

    let list = eleves.filter((e) => {
      if (!q) return true;
      return normalizeText(e.name).includes(q) || String(e.code || "").includes(q);
    });

    list = [...list].sort((a, b) => {
      const aName = normalizeText(a.name);
      const bName = normalizeText(b.name);
      const aOrder = typeof a.order_index === "number" ? a.order_index : Number.MAX_SAFE_INTEGER;
      const bOrder = typeof b.order_index === "number" ? b.order_index : Number.MAX_SAFE_INTEGER;

      if (sortMode === "order_asc") {
        if (aOrder !== bOrder) return aOrder - bOrder;
        return aName.localeCompare(bName, "fr", { sensitivity: "base" });
      }

      if (sortMode === "order_desc") {
        if (aOrder !== bOrder) return bOrder - aOrder;
        return bName.localeCompare(aName, "fr", { sensitivity: "base" });
      }

      if (sortMode === "alpha_asc") {
        const cmp = aName.localeCompare(bName, "fr", { sensitivity: "base" });
        if (cmp !== 0) return cmp;
        return aOrder - bOrder;
      }

      const cmp = bName.localeCompare(aName, "fr", { sensitivity: "base" });
      if (cmp !== 0) return cmp;
      return bOrder - aOrder;
    });

    return list;
  }, [eleves, searchTerm, sortMode]);

  const startEditing = useCallback((eleve: Eleve) => {
    setEditingEleveId(eleve.id);
    setEditedEleveName(eleve.name);
    setEditedEleveGenre(eleve.genre ?? "M");
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingEleveId(null);
    setEditedEleveName("");
    setEditedEleveGenre("M");
  }, []);

  const openAddModal = useCallback(() => {
    setShowAddModal(true);
  }, []);

  const closeAddModal = useCallback(() => {
    setShowAddModal(false);
    setNewEleveName("");
    setNewEleveGenre("M");
    Keyboard.dismiss();
  }, []);

  const cycleSortMode = useCallback(() => {
    setSortMode((prev) => {
      if (prev === "order_asc") return "order_desc";
      if (prev === "order_desc") return "alpha_asc";
      if (prev === "alpha_asc") return "alpha_desc";
      return "order_asc";
    });
  }, []);

  const sortLabel = useMemo(() => {
    if (sortMode === "order_asc") return "N° ↑";
    if (sortMode === "order_desc") return "N° ↓";
    if (sortMode === "alpha_asc") return "A → Z";
    return "Z → A";
  }, [sortMode]);

  /* ======================= CRUD ======================= */
  const addEleveToSupabase = async () => {
    const trimmedName = newEleveName.trim();

    if (!trimmedName) {
      return Alert.alert("Manque d'info", "Veuillez entrer un nom pour l'élève.");
    }

    if (!professeur?.user_id || !groupId) {
      return Alert.alert("Erreur", "Professeur ou groupe manquant.");
    }

    const alreadyExists = eleves.some((e) => normalizeText(e.name) === normalizeText(trimmedName));
    if (alreadyExists) {
      return Alert.alert("Doublon", "Un élève avec ce nom existe déjà dans ce groupe.");
    }

    const code = generateEleveCode();

    const { error } = await supabase.from("students").insert({
      name: trimmedName,
      code,
      group_id: groupId,
      teacher_id: professeur.user_id,
      genre: newEleveGenre,
      order_index: nextOrderIndex,
    });

    if (error) {
      console.error("Erreur ajout élève:", error.message);
      Alert.alert("Erreur", "Impossible d'ajouter l'élève.");
      return;
    }

    closeAddModal();
    await fetchEleves();
  };

  const updateEleveInSupabase = async (eleveId: string) => {
    const trimmedName = editedEleveName.trim();

    if (!trimmedName) {
      return Alert.alert("Nom vide", "Le nom de l'élève ne peut pas être vide.");
    }

    if (!professeur?.user_id || !groupId) {
      Alert.alert("Erreur", "Professeur ou groupe manquant.");
      cancelEditing();
      return;
    }

    const others = eleves.filter((e) => e.id !== eleveId);
    if (others.some((e) => normalizeText(e.name) === normalizeText(trimmedName))) {
      return Alert.alert("Doublon", "Un autre élève avec ce nom existe déjà dans ce groupe.");
    }

    const { error } = await supabase
      .from("students")
      .update({
        name: trimmedName,
        genre: editedEleveGenre,
      })
      .eq("id", eleveId)
      .eq("teacher_id", professeur.user_id)
      .eq("group_id", groupId);

    if (error) {
      console.error("Erreur MAJ élève:", error.message);
      Alert.alert("Erreur", "Impossible de mettre à jour l'élève.");
      return;
    }

    cancelEditing();
    await fetchEleves();
  };

  const askDeleteEleve = useCallback((eleve: Eleve) => {
    setDeleteTarget(eleve);
  }, []);

  const cancelDeleteEleve = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  const confirmDeleteEleve = useCallback(async () => {
    if (!deleteTarget || !professeur?.user_id || !groupId) {
      setDeleteTarget(null);
      return;
    }

    setDeletingId(deleteTarget.id);

    const { error } = await supabase
      .from("students")
      .delete()
      .eq("id", deleteTarget.id)
      .eq("teacher_id", professeur.user_id)
      .eq("group_id", groupId);

    setDeletingId(null);

    if (error) {
      console.error("Erreur suppression élève:", error.message);
      Alert.alert("Erreur", "Impossible de supprimer l'élève.");
      return;
    }

    if (editingEleveId === deleteTarget.id) {
      cancelEditing();
    }

    setDeleteTarget(null);
    await fetchEleves();
  }, [deleteTarget, professeur?.user_id, groupId, editingEleveId, fetchEleves, cancelEditing]);

  /* ======================= Etats rapides ======================= */
  if (!groupId) {
    return (
      <SafeAreaView style={styles.fullscreenCenter}>
        <TouchableOpacity onPress={() => setPage("gestionGroupes")} style={styles.backPill}>
          <ArrowLeft size={18} color="#fff" />
          <Text style={styles.backPillText}>Retour aux groupes</Text>
        </TouchableOpacity>

        <Text style={[styles.centerText, { marginTop: 16, color: C_TEXT }]}>
          Choisissez un groupe dans la page précédente.
        </Text>

        <View style={{ height: BOTTOM_BAR_HEIGHT + SAFE_EXTRA_IOS }} />
        <BottomBar currentPage="gestionGroupes" onNavigate={setPage} />
      </SafeAreaView>
    );
  }

  if (!isLoaded) {
    return (
      <SafeAreaView style={styles.fullscreenCenter}>
        <ActivityIndicator size="large" />
        <Text style={[styles.centerText, { marginTop: 12, color: C_TEXT }]}>Chargement des élèves…</Text>
        <View style={{ height: BOTTOM_BAR_HEIGHT + SAFE_EXTRA_IOS }} />
        <BottomBar currentPage="gestionGroupes" onNavigate={setPage} />
      </SafeAreaView>
    );
  }

  const headerName = selectedGroup?.name ?? selectedGroup?.nom ?? "Groupe";

  return (
    <SafeAreaView style={styles.root}>
      <View style={[styles.header, isCompactHeader && styles.headerCompact]}>
        <TouchableOpacity
          onPress={() => setPage("gestionGroupes")}
          style={styles.backPill}
          accessibilityRole="button"
          accessibilityLabel="Retour aux groupes"
        >
          <ArrowLeft size={18} color="#fff" />
          {!isVerySmall && <Text style={styles.backBtnText}>Retour</Text>}
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerName}
          </Text>
          <Text style={styles.headerSubtitle}>
            {eleves.length} élève{eleves.length > 1 ? "s" : ""}
          </Text>

          {showSearch && (
            <View style={styles.headerSearchBar}>
              <TextInput
                placeholder="Rechercher un élève…"
                placeholderTextColor="rgba(255,255,255,0.85)"
                value={searchTerm}
                onChangeText={setSearchTerm}
                style={styles.inputHeader}
                returnKeyType="search"
                autoFocus
              />
              <TouchableOpacity onPress={() => setShowSearch(false)} style={styles.headerSearchClose}>
                <Text style={styles.headerSearchCloseTxt}>Fermer</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={() => setShowSearch((v) => !v)}
          style={styles.searchIcon}
          accessibilityLabel="Rechercher"
        >
          <Search size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        key={`grid-${numColumns}`}
        data={filteredAndSortedEleves}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={onRefresh}
        keyboardShouldPersistTaps="handled"
        numColumns={numColumns}
        contentContainerStyle={{
          paddingHorizontal: contentPadding,
          paddingTop: 8,
          paddingBottom: BOTTOM_BAR_HEIGHT + 100,
        }}
        columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
        ListHeaderComponent={
          <View>
            <View style={styles.listTopRow}>
              <Text style={styles.sectionTitle}>Liste des élèves ({filteredAndSortedEleves.length})</Text>

              <TouchableOpacity
                style={styles.sortBtn}
                onPress={cycleSortMode}
                accessibilityLabel="Changer le mode de tri"
              >
                {sortMode === "alpha_asc" ? (
                  <ArrowUpAZ size={16} color={C_TEXT} />
                ) : sortMode === "alpha_desc" ? (
                  <ArrowDownAZ size={16} color={C_TEXT} />
                ) : (
                  <Hash size={16} color={C_TEXT} />
                )}
                <Text style={styles.sortBtnText}>{sortLabel}</Text>
              </TouchableOpacity>
            </View>

            {emptyHint && filteredAndSortedEleves.length === 0 && (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>{emptyHint}</Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const badge = genreBadgeStyle(item.genre);

          return (
            <View style={[styles.itemOuter, { width: cardWidth }]}>
              <View style={[styles.studentCard, { height: cardHeight, minHeight: cardHeight }]}>
                <View style={styles.studentTop}>
                  {editingEleveId === item.id ? (
                    <>
                      <TextInput
                        value={editedEleveName}
                        onChangeText={setEditedEleveName}
                        style={[styles.editInput, isPhone && styles.editInputPhone]}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={() => updateEleveInSupabase(item.id)}
                      />

                      <View style={styles.editPickerBlock}>
                        <Text style={styles.smallLabel}>Genre</Text>
                        <View style={styles.pickerWrapSmall}>
                          <Picker
                            selectedValue={editedEleveGenre ?? "M"}
                            onValueChange={(val) => setEditedEleveGenre((val as GenreEleve) ?? "M")}
                            dropdownIconColor={C_TEXT}
                            style={[styles.pickerSmall, isPhone && styles.pickerSmallPhone]}
                          >
                            <Picker.Item label="Garçon" value="M" />
                            <Picker.Item label="Fille" value="F" />
                          </Picker>
                        </View>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.topMetaRow}>
                        <View style={styles.numberPill}>
                          <Text style={styles.numberPillText}>N° {item.order_index ?? "—"}</Text>
                        </View>
                      </View>

                      <Text
                        style={[
                          styles.studentName,
                          isPhone && styles.studentNamePhone,
                          isSmallPhone && styles.studentNameSmallPhone,
                        ]}
                        numberOfLines={2}
                      >
                        {item.name || "Sans nom"}
                      </Text>

                      <View
                        style={[
                          styles.genreBadge,
                          isPhone && styles.genreBadgePhone,
                          { backgroundColor: badge.backgroundColor },
                        ]}
                      >
                        <Text
                          style={[
                            styles.genreBadgeText,
                            isPhone && styles.genreBadgeTextPhone,
                            { color: badge.color },
                          ]}
                          numberOfLines={1}
                        >
                          {genreLabel(item.genre)}
                        </Text>
                      </View>

                      <View style={styles.codeRow}>
                        <Text style={[styles.codeLabel, isPhone && styles.codeLabelPhone]}>Code</Text>
                        <Text style={[styles.codeMono, isPhone && styles.codeMonoPhone]} numberOfLines={1}>
                          {item.code}
                        </Text>
                      </View>
                    </>
                  )}
                </View>

                <View style={[styles.actionsRow, isPhone && styles.actionsRowPhone]}>
                  {editingEleveId === item.id ? (
                    <>
                      <TouchableOpacity
                        onPress={() => updateEleveInSupabase(item.id)}
                        style={[styles.iconBtn, styles.actionSave, isPhone && styles.iconBtnPhone]}
                        accessibilityLabel="Sauvegarder"
                      >
                        <Save size={isPhone ? 14 : 16} color={C_TEXT} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={cancelEditing}
                        style={[styles.iconBtn, styles.actionCancel, isPhone && styles.iconBtnPhone]}
                        accessibilityLabel="Annuler"
                      >
                        <X size={isPhone ? 14 : 16} color={C_TEXT} />
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity
                        onPress={() => startEditing(item)}
                        style={[styles.iconBtn, isPhone && styles.iconBtnPhone]}
                        accessibilityLabel="Modifier l'élève"
                      >
                        <Edit3 size={isPhone ? 14 : 16} color={C_TEXT} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => askDeleteEleve(item)}
                        style={[styles.iconBtn, styles.actionDelete, isPhone && styles.iconBtnPhone]}
                        accessibilityLabel="Supprimer l'élève"
                      >
                        <Trash2 size={isPhone ? 14 : 16} color="#991b1b" />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            </View>
          );
        }}
      />

      {/* Bouton flottant style "Créer une balise" */}
      <View style={styles.fabWrap}>
        <TouchableOpacity onPress={openAddModal} style={styles.fab} activeOpacity={0.9}>
          <UserPlus size={22} color="#fff" />
          <Text style={styles.fabText}>Ajouter un élève</Text>
        </TouchableOpacity>
      </View>

      {/* Modal ajout */}
      <Modal visible={showAddModal} animationType="fade" transparent onRequestClose={closeAddModal}>
        <Pressable style={styles.modalOverlay} onPress={closeAddModal}>
          <Pressable
            style={[styles.modalCard, { width: Math.min(width - 28, 520) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <UserPlus size={20} color="#10b981" />
                <Text style={styles.modalTitle}>Ajouter un nouvel élève</Text>
              </View>

              <TouchableOpacity onPress={closeAddModal} style={styles.modalCloseBtn}>
                <X size={18} color={C_TEXT} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.label}>Nom de l'élève</Text>
              <TextInput
                placeholder="Ex : Jean Dupont"
                placeholderTextColor="rgba(15,23,42,0.45)"
                value={newEleveName}
                onChangeText={setNewEleveName}
                onSubmitEditing={addEleveToSupabase}
                style={styles.input}
                returnKeyType="done"
                autoFocus
              />

              <Text style={[styles.label, { marginTop: 12 }]}>Genre</Text>
              <View style={styles.pickerWrap}>
                <Picker
                  selectedValue={newEleveGenre ?? "M"}
                  onValueChange={(val) => setNewEleveGenre((val as GenreEleve) ?? "M")}
                  dropdownIconColor={C_TEXT}
                  style={styles.picker}
                >
                  <Picker.Item label="Garçon" value="M" />
                  <Picker.Item label="Fille" value="F" />
                </Picker>
              </View>

              <View style={styles.nextNumberBox}>
                <Text style={styles.nextNumberText}>Le prochain élève aura le numéro {nextOrderIndex}.</Text>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity onPress={closeAddModal} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Annuler</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={addEleveToSupabase} style={styles.primaryBtn}>
                  <UserPlus size={16} color="#fff" />
                  <Text style={styles.primaryBtnText}>Ajouter</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal suppression */}
      <Modal visible={!!deleteTarget} animationType="fade" transparent onRequestClose={cancelDeleteEleve}>
        <Pressable style={styles.modalOverlay} onPress={cancelDeleteEleve}>
          <Pressable
            style={[styles.modalCard, { width: Math.min(width - 28, 460) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Trash2 size={20} color="#dc2626" />
                <Text style={styles.modalTitle}>Supprimer un élève</Text>
              </View>

              <TouchableOpacity onPress={cancelDeleteEleve} style={styles.modalCloseBtn}>
                <X size={18} color={C_TEXT} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.deleteText}>
                Voulez-vous vraiment supprimer <Text style={styles.deleteName}>{deleteTarget?.name || "cet élève"}</Text> ?
              </Text>

              <View style={styles.modalActions}>
                <TouchableOpacity onPress={cancelDeleteEleve} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Annuler</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={confirmDeleteEleve}
                  style={styles.deleteBtn}
                  disabled={!!deletingId}
                >
                  <Trash2 size={16} color="#fff" />
                  <Text style={styles.deleteBtnText}>{deletingId ? "Suppression..." : "Supprimer"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <BottomBar currentPage="gestionGroupes" onNavigate={setPage} />
    </SafeAreaView>
  );
};

export default GestionEleves;

/* ======================= Styles ======================= */
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C_BG,
  },

  fullscreenCenter: {
    flex: 1,
    backgroundColor: C_BG,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  centerText: {
    fontSize: 16,
    textAlign: "center",
    opacity: 0.9,
  },

  header: {
    backgroundColor: C_HEADER,
    paddingHorizontal: 14,
    paddingTop: Platform.select({ ios: 12, android: 12, default: 12 }),
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  headerCompact: {
    paddingHorizontal: 10,
  },

  backPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    marginTop: 2,
  },
  backPillText: {
    color: "#fff",
    fontWeight: "700",
    marginLeft: 6,
  },
  backBtnText: {
    color: "#fff",
    marginLeft: 6,
    fontWeight: "800",
  },

  headerTitleWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
  },
  headerTitle: {
    color: "white",
    fontSize: 22,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.92)",
    marginTop: 2,
  },

  searchIcon: {
    padding: 8,
    borderRadius: 10,
    marginTop: 2,
  },

  headerSearchBar: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  inputHeader: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: 12,
    color: "white",
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ web: 10, default: 8 }),
  },
  headerSearchClose: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  headerSearchCloseTxt: {
    color: "white",
    fontWeight: "800",
  },

  listTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
    flexWrap: "wrap",
  },

  sectionTitle: {
    color: C_TEXT,
    fontWeight: "800",
    fontSize: 18,
    flexShrink: 1,
  },

  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.06)",
    borderWidth: 1,
    borderColor: C_BORDER,
  },
  sortBtnText: {
    color: C_TEXT,
    fontWeight: "800",
    fontSize: 13,
  },

  emptyBox: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  emptyText: {
    color: "rgba(15,23,42,0.7)",
    textAlign: "center",
  },

  columnWrapper: {
    justifyContent: "flex-start",
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  itemOuter: {
    marginBottom: GRID_GAP,
  },

  studentCard: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 12,
    padding: 8,
    justifyContent: "space-between",
  },
  studentTop: {
    flex: 1,
    minHeight: 0,
  },

  topMetaRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 4,
  },
  numberPill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.07)",
    alignSelf: "flex-start",
  },
  numberPillText: {
    color: C_TEXT,
    fontSize: 10,
    fontWeight: "800",
  },

  studentName: {
    color: C_TEXT,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
    minHeight: 34,
    marginBottom: 5,
  },
  studentNamePhone: {
    fontSize: 12.5,
    lineHeight: 15,
    minHeight: 30,
    marginBottom: 4,
  },
  studentNameSmallPhone: {
    fontSize: 11.5,
    lineHeight: 14,
    minHeight: 28,
  },

  genreBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    marginBottom: 5,
    maxWidth: "100%",
  },
  genreBadgePhone: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4,
  },
  genreBadgeText: {
    fontSize: 10.5,
    fontWeight: "800",
  },
  genreBadgeTextPhone: {
    fontSize: 9.5,
  },

  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  codeLabel: {
    color: "rgba(15,23,42,0.75)",
    fontSize: 10.5,
    fontWeight: "700",
  },
  codeLabelPhone: {
    fontSize: 9.5,
  },
  codeMono: {
    flexShrink: 1,
    color: C_TEXT,
    fontSize: 11,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    backgroundColor: "rgba(0,0,0,0.04)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 7,
  },
  codeMonoPhone: {
    fontSize: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },

  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "flex-end",
    marginTop: 6,
  },
  actionsRowPhone: {
    gap: 5,
    marginTop: 4,
  },

  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.04)",
    borderWidth: 1,
    borderColor: C_BORDER,
  },
  iconBtnPhone: {
    width: 26,
    height: 26,
  },

  actionSave: {
    backgroundColor: "rgba(59,130,246,0.14)",
    borderColor: "rgba(59,130,246,0.35)",
  },
  actionCancel: {
    backgroundColor: "rgba(239,68,68,0.14)",
    borderColor: "rgba(239,68,68,0.35)",
  },
  actionDelete: {
    backgroundColor: "rgba(239,68,68,0.14)",
    borderColor: "rgba(239,68,68,0.35)",
  },

  editInput: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 10,
    color: C_TEXT,
    paddingHorizontal: 10,
    paddingVertical: Platform.select({ web: 8, default: 7 }),
    fontSize: 13,
    marginBottom: 8,
  },
  editInputPhone: {
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 6,
  },

  editPickerBlock: {
    marginTop: 2,
  },
  smallLabel: {
    color: "rgba(15,23,42,0.7)",
    fontSize: 11,
    marginBottom: 4,
    fontWeight: "700",
  },
  pickerWrapSmall: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 10,
    overflow: "hidden",
  },
  pickerSmall: {
    color: C_TEXT,
    height: 38,
  },
  pickerSmallPhone: {
    height: 34,
  },

  /* ===== Bouton flottant style GestionBalises ===== */
  fabWrap: {
    position: "absolute",
    bottom: BOTTOM_BAR_HEIGHT + 24,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#10b981",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  fabText: {
    color: "#fff",
    fontWeight: "800",
  },

  /* ===== Modales ===== */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(2,6,23,0.38)",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C_BORDER,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  modalTitle: {
    color: C_TEXT,
    fontSize: 18,
    fontWeight: "800",
    flexShrink: 1,
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.04)",
    borderWidth: 1,
    borderColor: C_BORDER,
  },
  modalBody: {
    padding: 16,
  },

  label: {
    color: "rgba(15,23,42,0.75)",
    fontSize: 12,
    marginBottom: 6,
    fontWeight: "700",
  },
  input: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 12,
    color: C_TEXT,
    paddingHorizontal: 12,
    paddingVertical: Platform.select({ web: 10, default: 9 }),
    fontSize: 15,
  },
  pickerWrap: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 12,
    overflow: "hidden",
  },
  picker: {
    color: C_TEXT,
    height: 44,
  },

  nextNumberBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: "rgba(15,23,42,0.05)",
    borderWidth: 1,
    borderColor: C_BORDER,
  },
  nextNumberText: {
    color: C_TEXT,
    fontWeight: "700",
  },

  modalActions: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    flexWrap: "wrap",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#10b981",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderWidth: 1,
    borderColor: C_BORDER,
  },
  secondaryBtnText: {
    color: C_TEXT,
    fontWeight: "800",
  },

  deleteText: {
    color: C_TEXT,
    fontSize: 15,
    lineHeight: 22,
  },
  deleteName: {
    fontWeight: "800",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#dc2626",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  deleteBtnText: {
    color: "#fff",
    fontWeight: "800",
  },
});