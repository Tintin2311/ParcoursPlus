// src/SessionProf/GestionGroupes/CreationGroupeSessionEleve.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { ArrowLeft, RefreshCw, Save, Trash2, Users } from "lucide-react-native";
import { supabase } from "../../supabaseClient";

type SetPageFn = (page: any) => void;

type ProfesseurMinimal = {
  user_id?: string | null;
};

type GroupeMinimal = {
  id: string | number;
  name?: string | null;
  color?: string | null;
  folder_id?: string | null;
  teacher_id?: string | null;
};

type EleveRow = {
  id: string;
  name: string;
  code: string;
  group_id: string;
  teacher_id: string;
  genre?: "M" | "F" | null;
  order_index?: number | null;
};

type GroupeSessionRow = {
  id: string;
  code: string;
  nom?: string | null;
  teacher_id?: string | null;
  group_id?: string | null;
  student_ids: string[];
};

type Props = {
  setPage: SetPageFn;
  professeur: ProfesseurMinimal;
  selectedGroup?: GroupeMinimal | null;
};

const C_BG = "#EDF2F6";
const C_HEADER = "#1F5B86";
const C_HEADER_ICON_BG = "#2D6C97";
const C_CONTENT_BG = "#EEF3F7";
const C_CONTENT_BORDER = "#C6D2DC";
const C_CARD_BG = "#FFFFFF";
const C_CARD_BORDER = "#C9D5DF";
const C_CARD_SOFT = "#F2F8FC";
const C_CARD_SOFT_BORDER = "#CFE0EC";
const C_TEXT = "#233548";
const C_MUTED = "#6B7E8E";
const C_BLUE = "#1F5B86";
const C_BLUE_SOFT = "#EEF6FC";
const C_RED = "#dc2626";
const C_ORANGE = "#f59e0b";

function generateSessionCode() {
  const numbers = Array.from({ length: 6 })
    .map(() => Math.floor(Math.random() * 10))
    .join("");

  return `GR${numbers}`;
}

function getGroupLabel(group?: GroupeMinimal | null) {
  return String(group?.name || "Classe");
}

function uniqueGroups(groups: GroupeMinimal[]) {
  const seen = new Set<string>();
  const result: GroupeMinimal[] = [];

  groups.forEach((group) => {
    const id = String(group.id ?? "");
    if (!id || seen.has(id)) return;
    seen.add(id);
    result.push({ ...group, id });
  });

  return result;
}

const CreationGroupeSessionEleve: React.FC<Props> = ({ setPage, professeur, selectedGroup }) => {
  const { width } = useWindowDimensions();
  const isPhone = width < 700;

  const [classesDisponibles, setClassesDisponibles] = useState<GroupeMinimal[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [classeCounts, setClasseCounts] = useState<Record<string, number>>({});
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<"same_class" | "multi_class" | "all">("same_class");

  const [eleves, setEleves] = useState<EleveRow[]>([]);
  const [sessions, setSessions] = useState<GroupeSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedElevesCache, setSelectedElevesCache] = useState<Record<string, EleveRow>>({});
  const [allElevesCache, setAllElevesCache] = useState<Record<string, EleveRow>>({});
  const [sessionCode, setSessionCode] = useState(generateSessionCode());
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [codeModalSession, setCodeModalSession] = useState<GroupeSessionRow | null>(null);
  const [renameSession, setRenameSession] = useState<GroupeSessionRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  const groupId = selectedClassId;

  const currentClasse = useMemo(
    () => classesDisponibles.find((g) => String(g.id) === String(selectedClassId)) ?? null,
    [classesDisponibles, selectedClassId]
  );

  const groupName = currentClasse ? getGroupLabel(currentClasse) : "Choisir une classe";

  const editingSession = useMemo(() => {
    if (!editingSessionId) return null;
    return sessions.find((session) => session.id === editingSessionId) ?? null;
  }, [editingSessionId, sessions]);

  const sessionsToDisplay = useMemo(() => {
    const base = editingSessionId
      ? sessions.filter((session) => session.id !== editingSessionId)
      : sessions;

    if (filterMode === "all") return base;

    if (filterMode === "multi_class") {
      const currentClassStudentIds = new Set(
        eleves
          .filter((eleve) => String(eleve.group_id || "") === String(groupId || ""))
          .map((eleve) => eleve.id)
      );

      return base.filter((session) => {
        if (session.group_id) return false;
        return (session.student_ids || []).some((id) => currentClassStudentIds.has(String(id)));
      });
    }

    return base.filter((session) => String(session.group_id || "") === String(groupId || ""));
  }, [sessions, editingSessionId, filterMode, groupId, eleves]);

  const usedStudentIds = useMemo(() => {
    const ids = new Set<string>();

    sessions.forEach((session) => {
      if (editingSessionId && session.id === editingSessionId) return;
      (session.student_ids || []).forEach((id) => ids.add(String(id)));
    });

    return ids;
  }, [sessions, editingSessionId]);

  const availableEleves = useMemo(() => {
    const selectedSet = new Set(selectedIds);

    return eleves.filter((eleve) => {
      if (selectedSet.has(eleve.id)) return true;
      return !usedStudentIds.has(eleve.id);
    });
  }, [eleves, selectedIds, usedStudentIds]);

  const selectedEleves = useMemo(() => {
    return selectedIds
      .map((id) => selectedElevesCache[id] || allElevesCache[id])
      .filter(Boolean);
  }, [selectedIds, selectedElevesCache, allElevesCache]);

  const sessionName = useMemo(() => {
    if (selectedEleves.length === 0) return `Session ${groupName}`;
    return selectedEleves.map((e) => e.name).join(" / ");
  }, [selectedEleves, groupName]);

  const getSessionEleves = useCallback(
    (session: GroupeSessionRow) => {
      return (session.student_ids || [])
        .map((id) => allElevesCache[String(id)] || selectedElevesCache[String(id)])
        .filter(Boolean);
    },
    [allElevesCache, selectedElevesCache]
  );

  const resetDraft = useCallback(() => {
    setEditingSessionId(null);
    setSelectedIds([]);
    setSelectedElevesCache({});
    setSessionCode(generateSessionCode());
  }, []);

  const selectClasse = useCallback((classId: string) => {
    setSelectedClassId(classId);
    setClassPickerOpen(false);
  }, []);

  const fetchClasses = useCallback(async () => {
    if (!professeur?.user_id) {
      setClassesDisponibles([]);
      setClassesLoading(false);
      setSelectedClassId(null);
      return;
    }

    setClassesLoading(true);

    const [{ data, error }, studentsCountRes] = await Promise.all([
      supabase
        .from("groups")
        .select("id, name, folder_id, color, teacher_id")
        .eq("teacher_id", professeur.user_id)
        .order("name", { ascending: true }),
      supabase
        .from("students")
        .select("id, group_id")
        .eq("teacher_id", professeur.user_id),
    ]);

    if (error) {
      console.error("Erreur chargement classes:", error.message);
      Alert.alert("Erreur", "Impossible de charger la liste des classes.");
      setClassesDisponibles([]);
      setSelectedClassId(null);
      setClassesLoading(false);
      return;
    }

    const mappedGroups: GroupeMinimal[] = (data || []).map((g: any) => ({
      id: String(g.id),
      name: g.name ?? null,
      folder_id: g.folder_id ?? null,
      color: g.color ?? null,
      teacher_id: g.teacher_id ?? null,
    }));

    const nextGroups = uniqueGroups(mappedGroups).sort((a, b) =>
      getGroupLabel(a).localeCompare(getGroupLabel(b), "fr")
    );

    const nextCounts: Record<string, number> = {};
    (studentsCountRes.data || []).forEach((student: any) => {
      const classId = String(student.group_id || "");
      if (!classId) return;
      nextCounts[classId] = (nextCounts[classId] || 0) + 1;
    });

    setClasseCounts(nextCounts);
    setClassesDisponibles(nextGroups);

    setSelectedClassId((prev) => {
      if (prev && nextGroups.some((g) => String(g.id) === String(prev))) return prev;

      if (
        selectedGroup?.id != null &&
        nextGroups.some((g) => String(g.id) === String(selectedGroup.id))
      ) {
        return String(selectedGroup.id);
      }

      return nextGroups[0]?.id != null ? String(nextGroups[0].id) : null;
    });

    setClassesLoading(false);
  }, [professeur?.user_id, selectedGroup]);

  const fetchData = useCallback(async () => {
    if (!professeur?.user_id || !groupId) {
      setEleves([]);
      setSessions([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const [studentsRes, sessionsRes] = await Promise.all([
      supabase
        .from("students")
        .select("id, name, code, group_id, teacher_id, genre, order_index")
        .eq("teacher_id", professeur.user_id)
        .eq("group_id", groupId)
        .order("order_index", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true }),

      supabase
        .from("GroupeSessionEleves")
        .select("id, code, nom, teacher_id, group_id, student_ids")
        .eq("teacher_id", professeur.user_id),
    ]);

    if (studentsRes.error) {
      console.error("Erreur chargement élèves session groupe:", studentsRes.error.message);
      Alert.alert("Erreur", "Impossible de charger les élèves.");
      setEleves([]);
      setLoading(false);
      return;
    }

    if (sessionsRes.error) {
      console.error("Erreur chargement sessions groupes:", sessionsRes.error.message);
      Alert.alert("Erreur", "Impossible de charger les sessions groupes.");
      setSessions([]);
    }

    const mappedStudents: EleveRow[] = (studentsRes.data || []).map((e: any) => ({
      id: String(e.id),
      name: String(e.name ?? ""),
      code: String(e.code ?? ""),
      group_id: String(e.group_id ?? ""),
      teacher_id: String(e.teacher_id ?? ""),
      genre: e.genre ?? null,
      order_index: typeof e.order_index === "number" ? e.order_index : null,
    }));

    const mappedSessions: GroupeSessionRow[] = (sessionsRes.data || []).map((s: any) => ({
      id: String(s.id),
      code: String(s.code ?? ""),
      nom: s.nom ?? null,
      teacher_id: s.teacher_id ?? null,
      group_id: s.group_id ?? null,
      student_ids: Array.isArray(s.student_ids) ? s.student_ids.map(String) : [],
    }));

    setEleves(mappedStudents);

    setAllElevesCache((cache) => {
      const next = { ...cache };
      mappedStudents.forEach((eleve) => {
        next[eleve.id] = eleve;
      });
      return next;
    });

    setSelectedElevesCache((cache) => {
      const next = { ...cache };
      mappedStudents.forEach((eleve) => {
        if (selectedIds.includes(eleve.id)) {
          next[eleve.id] = eleve;
        }
      });
      return next;
    });

    setSessions(mappedSessions);
    setLoading(false);
  }, [professeur?.user_id, groupId, selectedIds]);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setSelectedDeleteIds([]);
    setDeleteMode(false);
  }, [selectedClassId, filterMode]);

  const toggleEleve = useCallback((eleve: EleveRow) => {
    setSelectedIds((prev) => {
      if (prev.includes(eleve.id)) {
        setSelectedElevesCache((cache) => {
          const next = { ...cache };
          delete next[eleve.id];
          return next;
        });
        return prev.filter((x) => x !== eleve.id);
      }

      setSelectedElevesCache((cache) => ({
        ...cache,
        [eleve.id]: eleve,
      }));

      return [...prev, eleve.id];
    });
  }, []);

  const regenerateCode = useCallback(() => {
    setSessionCode(generateSessionCode());
  }, []);

  const saveSession = useCallback(async () => {
    if (!professeur?.user_id || !groupId) {
      Alert.alert("Erreur", "Professeur ou groupe manquant.");
      return;
    }

    if (selectedIds.length < 2) {
      Alert.alert("Groupe incomplet", "Sélectionne au moins 2 élèves pour créer une session groupe.");
      return;
    }

    const selectedClassIds = selectedEleves
      .map((eleve) => String(eleve.group_id || ""))
      .filter(Boolean);

    const uniqueSelectedClassIds = Array.from(new Set(selectedClassIds));
    const isMultiClassSession = uniqueSelectedClassIds.length > 1;

    const unavailable = selectedIds.filter((id) => usedStudentIds.has(id));
    if (unavailable.length > 0) {
      Alert.alert("Élève déjà utilisé", "Un des élèves sélectionnés est déjà dans une autre session groupe.");
      await fetchData();
      resetDraft();
      return;
    }

    setSaving(true);

    const payload = {
      code: sessionCode,
      nom: sessionName,
      teacher_id: professeur.user_id,
      group_id: isMultiClassSession ? null : groupId,
      student_ids: selectedIds,
    };

    const query = editingSessionId
      ? supabase
          .from("GroupeSessionEleves")
          .update(payload)
          .eq("id", editingSessionId)
          .eq("teacher_id", professeur.user_id)
          .select("id, code, nom, teacher_id, group_id, student_ids")
          .single()
      : supabase
          .from("GroupeSessionEleves")
          .insert(payload)
          .select("id, code, nom, teacher_id, group_id, student_ids")
          .single();

    const { data, error } = await query;

    setSaving(false);

    if (error) {
      console.error(editingSessionId ? "Erreur modification session groupe:" : "Erreur création session groupe:", error.message);

      if (String(error.message || "").toLowerCase().includes("duplicate")) {
        Alert.alert("Code déjà utilisé", "Ce code existe déjà. Génère un nouveau code puis réessaie.");
        return;
      }

      Alert.alert("Erreur", editingSessionId ? "Impossible de modifier la session groupe." : "Impossible de créer la session groupe.");
      return;
    }

    const savedSession: GroupeSessionRow = {
      id: String(data.id),
      code: String(data.code ?? sessionCode),
      nom: data.nom ?? sessionName,
      teacher_id: data.teacher_id ?? professeur.user_id,
      group_id: data.group_id ?? (isMultiClassSession ? null : groupId),
      student_ids: Array.isArray(data.student_ids) ? data.student_ids.map(String) : selectedIds,
    };

    setAllElevesCache((cache) => ({
      ...cache,
      ...selectedElevesCache,
    }));

    setSessions((prev) => {
      if (editingSessionId) {
        return prev.map((session) => (session.id === editingSessionId ? savedSession : session));
      }
      return [savedSession, ...prev];
    });

    resetDraft();
  }, [
    professeur?.user_id,
    groupId,
    selectedIds,
    usedStudentIds,
    fetchData,
    resetDraft,
    sessionCode,
    sessionName,
    editingSessionId,
    selectedEleves,
    selectedElevesCache,
  ]);

  const toggleDeleteMode = useCallback(() => {
    setDeleteMode((prev) => {
      const next = !prev;
      if (!next) setSelectedDeleteIds([]);
      return next;
    });
  }, []);

  const toggleSessionToDelete = useCallback((sessionId: string) => {
    setSelectedDeleteIds((prev) =>
      prev.includes(sessionId)
        ? prev.filter((id) => id !== sessionId)
        : [...prev, sessionId]
    );
  }, []);

  const deleteSelectedSessionsNow = useCallback(async () => {
    if (!professeur?.user_id || selectedDeleteIds.length === 0) return;

    setDeleting(true);

    const { error } = await supabase
      .from("GroupeSessionEleves")
      .delete()
      .in("id", selectedDeleteIds)
      .eq("teacher_id", professeur.user_id);

    setDeleting(false);

    if (error) {
      console.error("Erreur suppression sessions groupes:", error.message);
      Alert.alert("Erreur", "Impossible de supprimer les groupes sélectionnés.");
      return;
    }

    setSessions((prev) => prev.filter((session) => !selectedDeleteIds.includes(session.id)));

    if (editingSessionId && selectedDeleteIds.includes(editingSessionId)) {
      resetDraft();
    }

    setSelectedDeleteIds([]);
    setDeleteMode(false);
  }, [professeur?.user_id, selectedDeleteIds, editingSessionId, resetDraft]);

  const confirmDeleteSelectedSessions = useCallback(() => {
    if (selectedDeleteIds.length === 0) return;

    const message =
      selectedDeleteIds.length === 1
        ? "Supprimer ce groupe ? Les élèves redeviendront disponibles."
        : `Supprimer ces ${selectedDeleteIds.length} groupes ? Les élèves redeviendront disponibles.`;

    if (Platform.OS === "web") {
      const ok = window.confirm(message);
      if (ok) void deleteSelectedSessionsNow();
      return;
    }

    Alert.alert("Supprimer ?", message, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: () => {
          void deleteSelectedSessionsNow();
        },
      },
    ]);
  }, [selectedDeleteIds.length, deleteSelectedSessionsNow]);

  const editSession = useCallback(
    (session: GroupeSessionRow) => {
      setEditingSessionId(session.id);
      const ids = session.student_ids || [];
      setSelectedIds(ids);
      setSelectedElevesCache(() => {
        const cache: Record<string, EleveRow> = {};
        ids.forEach((id) => {
          const eleve = allElevesCache[id] || eleves.find((e) => e.id === id);
          if (eleve) cache[id] = eleve;
        });
        return cache;
      });
      setSessionCode(session.code);
    },
    [eleves, allElevesCache]
  );

  const openRenameSession = useCallback(
    (session: GroupeSessionRow) => {
      if (deleteMode) return;
      setRenameSession(session);
      setRenameValue(String(session.nom || "Groupe"));
    },
    [deleteMode]
  );

  const saveRenameSession = useCallback(async () => {
    if (!professeur?.user_id || !renameSession) return;

    const nextName = renameValue.trim();
    if (!nextName) {
      Alert.alert("Nom manquant", "Écris un nom pour ce groupe.");
      return;
    }

    setSavingRename(true);

    const { error } = await supabase
      .from("GroupeSessionEleves")
      .update({ nom: nextName })
      .eq("id", renameSession.id)
      .eq("teacher_id", professeur.user_id);

    setSavingRename(false);

    if (error) {
      console.error("Erreur modification nom groupe:", error.message);
      Alert.alert("Erreur", "Impossible de modifier le nom du groupe.");
      return;
    }

    setSessions((prev) =>
      prev.map((session) =>
        session.id === renameSession.id ? { ...session, nom: nextName } : session
      )
    );

    setRenameSession(null);
    setRenameValue("");
  }, [professeur?.user_id, renameSession, renameValue]);

  const renderClassesHeader = () => (
    <View style={styles.columnHeader}>
      <View style={styles.columnTitleRow}>
        <Text style={styles.columnHeaderTitle} numberOfLines={1}>Classes</Text>
      </View>

      {classesLoading ? (
        <View style={styles.classTabsLoading}>
          <ActivityIndicator size="small" />
          <Text style={styles.classTabsLoadingText}>Chargement…</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.classPickerBtn}
          onPress={() => setClassPickerOpen(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.classPickerBtnTitle} numberOfLines={1}>
            {groupName}
          </Text>
          <Text style={styles.classPickerBtnSub} numberOfLines={1}>
            {classeCounts[String(groupId || "")] || 0} élève{(classeCounts[String(groupId || "")] || 0) > 1 ? "s" : ""}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderActionsHeader = () => (
    <View style={styles.columnHeader}>
      <View style={styles.columnTitleRow}>
        <Text style={styles.columnHeaderTitle}>Groupes</Text>
        
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.filterBtn, filterMode === "same_class" && styles.filterBtnActive]}
          onPress={() => setFilterMode("same_class")}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.filterBtnText,
              filterMode === "same_class" && styles.filterBtnTextActive,
            ]}
            numberOfLines={1}
          >
            Classe
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterBtn, filterMode === "multi_class" && styles.filterBtnActive]}
          onPress={() => setFilterMode("multi_class")}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.filterBtnText,
              filterMode === "multi_class" && styles.filterBtnTextActive,
            ]}
            numberOfLines={1}
          >
            Multi
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterBtn, filterMode === "all" && styles.filterBtnActive]}
          onPress={() => setFilterMode("all")}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.filterBtnText,
              filterMode === "all" && styles.filterBtnTextActive,
            ]}
            numberOfLines={1}
          >
            Tous
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (!groupId) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backPill} onPress={() => setPage("GestionEleves")}>
            <ArrowLeft size={18} color="#fff" />
            
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>Session groupe</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>Choisir une classe</Text>
          </View>

          <View style={styles.headerIcon}>
            <Users size={21} color="#fff" />
          </View>
        </View>

        <View style={styles.centerBox}>
          <Text style={styles.centerTitle}>Aucune classe disponible</Text>
          <Text style={styles.centerText}>
            Crée ou sélectionne une classe avant de créer des sessions groupes.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setPage("gestionGroupes")}>
            <ArrowLeft size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Retour aux groupes</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backPill} onPress={() => setPage("GestionEleves")}>
          <ArrowLeft size={18} color="#fff" />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>Session groupe</Text>
          
        </View>

        <TouchableOpacity
          style={[styles.headerIcon, deleteMode && styles.headerIconDeleteActive]}
          onPress={toggleDeleteMode}
          activeOpacity={0.85}
        >
          <Trash2 size={21} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={[styles.content, isPhone && styles.contentPhone]}>
        <View style={styles.leftColumn}>
          {renderClassesHeader()}

          <View style={styles.listCard}>
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator />
                <Text style={styles.loadingText}>Chargement des élèves…</Text>
              </View>
            ) : (
              <FlatList
                data={availableEleves}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                  const selected = selectedIds.includes(item.id);

                  return (
                    <TouchableOpacity
                      style={[styles.studentRow, selected && styles.studentRowSelected]}
                      onPress={() => toggleEleve(item)}
                      activeOpacity={0.88}
                    >
                      <View style={styles.studentInfo}>
                        <Text style={styles.studentName} numberOfLines={isPhone ? 2 : 1}>{item.name || "Sans nom"}</Text>
                        {!isPhone && (
                          <Text style={styles.studentMeta} numberOfLines={1}>Code perso : {item.code || "—"}</Text>
                        )}
                      </View>
                      {!isPhone && <Text style={styles.orderText}>N° {item.order_index ?? "—"}</Text>}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>
                      Aucun élève disponible dans cette classe, ou tous les élèves sont déjà dans une session groupe.
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </View>

        <View style={styles.rightColumn}>
          {renderActionsHeader()}

          <View style={styles.codeCard}>
            {sessions.length === 0 && selectedIds.length === 0 ? (
              <View style={styles.emptySessionBox}>
                <Users size={44} color="rgba(35,53,72,0.18)" />
                <Text style={styles.emptySessionTitle}>Aucune session créée</Text>
                <Text style={styles.emptySessionText}>Sélectionne des élèves puis crée une session groupe.</Text>
              </View>
            ) : (
              <FlatList
                data={selectedIds.length > 0 ? [{ id: "preview", preview: true }, ...sessionsToDisplay] : sessionsToDisplay}
                keyExtractor={(item: any) => item.id}
                contentContainerStyle={styles.sessionsListContent}
                renderItem={({ item }: any) => {
                  const isPreview = !!item.preview;
                  const session = item as GroupeSessionRow;
                  const sessionEleves = isPreview ? selectedEleves : getSessionEleves(session);
                  const selectedForDelete = !isPreview && selectedDeleteIds.includes(session.id);

                  return (
                    <TouchableOpacity
                      style={[
                        styles.sessionPreviewCard,
                        isPreview && styles.sessionPreviewCardDraft,
                        selectedForDelete && styles.sessionPreviewCardDeleteSelected,
                      ]}
                      activeOpacity={isPreview ? 1 : 0.88}
                      onPress={() => {
                        if (isPreview) return;
                        if (deleteMode) {
                          toggleSessionToDelete(session.id);
                          return;
                        }
                        editSession(session);
                      }}
                    >
                      <View
                        style={[
                          styles.sessionPreviewTop,
                          isPreview && styles.sessionPreviewTopDraft,
                          selectedForDelete && styles.sessionPreviewTopDeleteSelected,
                        ]}
                      >
                        <View style={styles.sessionStudentCountSquare}>
                          <Text style={styles.sessionStudentCountText}>{sessionEleves.length}</Text>
                        </View>

                        <View style={styles.sessionTitleWrap}>
                          {isPreview ? (
                            <Text
                              style={[
                                styles.sessionTitleTextTopBar,
                                styles.sessionTitleTextTopBarDraft,
                              ]}
                              numberOfLines={1}
                            >
                              Nouveau groupe
                            </Text>
                          ) : (
                            <TouchableOpacity
                              style={styles.sessionNameTopBar}
                              activeOpacity={deleteMode ? 1 : 0.85}
                              onPress={() => openRenameSession(session)}
                              disabled={deleteMode}
                            >
                              <Text style={styles.sessionTitleTextTopBar} numberOfLines={1}>
                                {session.nom || "Groupe"}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        {deleteMode && !isPreview && (
                          <View style={[styles.deleteCheck, selectedForDelete && styles.deleteCheckActive]}>
                            {selectedForDelete && <Text style={styles.deleteCheckText}>✓</Text>}
                          </View>
                        )}
                      </View>

                      <View style={styles.sessionCodeTopBar}>
                        {isPreview && (
                          <TouchableOpacity
                            style={styles.sessionCodeRefreshBtn}
                            onPress={regenerateCode}
                            activeOpacity={0.85}
                          >
                            <RefreshCw size={13} color={C_MUTED} />
                          </TouchableOpacity>
                        )}

                        <View style={styles.sessionCodeRightBlock}>
                          <Text style={styles.sessionCodeTopBarValue} numberOfLines={1}>
                            {isPreview ? sessionCode : session.code || "—"}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.selectedListWrap}>
                        {sessionEleves.map((eleve) => (
                          <View key={eleve.id} style={styles.selectedChip}>
                            <Text style={styles.selectedChipText} numberOfLines={1}>{eleve.name}</Text>
                          </View>
                        ))}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </View>

      <View style={styles.bottomActionBar} pointerEvents="box-none">
        {deleteMode ? (
          selectedDeleteIds.length > 0 ? (
            <TouchableOpacity
              style={[styles.deleteOverlayBtn, deleting && styles.createBtnDisabled]}
              onPress={confirmDeleteSelectedSessions}
              disabled={deleting}
              activeOpacity={0.9}
            >
              <Trash2 size={18} color="#fff" />
              <Text style={styles.createBtnText}>
                {deleting
                  ? "Suppression…"
                  : selectedDeleteIds.length === 1
                    ? "Supprimer le groupe"
                    : `Supprimer ${selectedDeleteIds.length} groupes`}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.deleteModeHintPill}>
              <Trash2 size={15} color={C_RED} />
              <Text style={styles.deleteModeHintText}>Clique sur les groupes à supprimer</Text>
            </View>
          )
        ) : (
          <TouchableOpacity
            style={[styles.createBtn, editingSessionId && styles.updateBtn, (selectedIds.length < 2 || saving) && styles.createBtnDisabled]}
            onPress={saveSession}
            disabled={selectedIds.length < 2 || saving}
            activeOpacity={0.9}
          >
            <Save size={18} color="#fff" />
            <Text style={styles.createBtnText}>
              {saving
                ? editingSessionId
                  ? "Enregistrement…"
                  : "Création…"
                : editingSessionId
                  ? "Enregistrer les modifications"
                  : "Créer la session groupe"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={classPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setClassPickerOpen(false)}
      >
        <View style={styles.classPickerOverlay}>
          <View style={styles.classPickerCard}>
            <Text style={styles.classPickerTitle}>Choisir une classe</Text>

            <FlatList
              data={classesDisponibles}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.classPickerList}
              renderItem={({ item }) => {
                const active = String(item.id) === String(selectedClassId);
                const count = classeCounts[String(item.id)] || 0;

                return (
                  <TouchableOpacity
                    style={[styles.classPickerItem, active && styles.classPickerItemActive]}
                    onPress={() => selectClasse(String(item.id))}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.classPickerItemTitle, active && styles.classPickerItemTitleActive]} numberOfLines={1}>
                      {getGroupLabel(item)}
                    </Text>
                    <Text style={[styles.classPickerItemSub, active && styles.classPickerItemSubActive]} numberOfLines={1}>
                      {count} élève{count > 1 ? "s" : ""}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />

            <TouchableOpacity
              style={styles.classPickerCloseBtn}
              onPress={() => setClassPickerOpen(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.classPickerCloseText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!codeModalSession}
        transparent
        animationType="fade"
        onRequestClose={() => setCodeModalSession(null)}
      >
        <TouchableOpacity
          style={styles.codeModalOverlay}
          activeOpacity={1}
          onPress={() => setCodeModalSession(null)}
        >
          <View style={styles.codeModalCard}>
            <Text style={styles.codeModalLabel}>Code du groupe</Text>
            <Text style={styles.codeModalCode} adjustsFontSizeToFit numberOfLines={1}>
              {codeModalSession?.code || "—"}
            </Text>
            <Text style={styles.codeModalClose}>Toucher pour fermer</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={!!renameSession}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameSession(null)}
      >
        <View style={styles.renameModalOverlay}>
          <View style={styles.renameModalCard}>
            <Text style={styles.renameModalTitle}>Modifier le nom du groupe</Text>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Nom du groupe"
              placeholderTextColor="rgba(35,53,72,0.35)"
              style={styles.renameInput}
              autoFocus
              selectTextOnFocus
            />

            <View style={styles.renameActionsRow}>
              <TouchableOpacity
                style={styles.renameCancelBtn}
                onPress={() => {
                  setRenameSession(null);
                  setRenameValue("");
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.renameCancelText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.renameSaveBtn, savingRename && styles.renameSaveBtnDisabled]}
                onPress={saveRenameSession}
                disabled={savingRename}
                activeOpacity={0.85}
              >
                <Text style={styles.renameSaveText}>{savingRename ? "Enregistrement…" : "Enregistrer"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default CreationGroupeSessionEleve;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C_BG },
  header: {
    backgroundColor: C_HEADER,
    paddingHorizontal: 14,
    paddingTop: Platform.select({ ios: 12, android: 12, default: 12 }),
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C_CONTENT_BORDER,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backPill: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: C_HEADER_ICON_BG,
  },
  
  headerTitleWrap: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 21, fontWeight: "900" },
  headerSubtitle: { color: "rgba(255,255,255,0.9)", marginTop: 2, fontWeight: "700" },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C_HEADER_ICON_BG,
  },
  headerIconDeleteActive: { backgroundColor: C_RED },
  content: {
    flex: 1,
    backgroundColor: C_CONTENT_BG,
    borderTopWidth: 1,
    borderTopColor: C_CONTENT_BORDER,
    padding: 12,
    gap: 12,
    flexDirection: "row",
    alignItems: "stretch",
  },
  contentPhone: {
    padding: 6,
    gap: 6,
    flexDirection: "row",
  },
  leftColumn: { flex: 1, minWidth: 0, gap: 8 },
  rightColumn: { flex: 2, minWidth: 0, gap: 8 },
  columnHeader: {
    minHeight: 76,
    backgroundColor: C_CARD_BG,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C_CARD_BORDER,
    paddingHorizontal: 10,
    paddingVertical: 9,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  columnTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 7,
  },
  columnHeaderTitle: {
    color: C_TEXT,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  columnHeaderSub: { color: C_MUTED, fontSize: 11, fontWeight: "800", maxWidth: 150 },
  classTabsContent: { paddingRight: 10, gap: 8 },
  classPickerBtn: {
    minHeight: 40,
    borderRadius: 13,
    backgroundColor: C_BLUE_SOFT,
    borderWidth: 1,
    borderColor: C_BLUE,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  classPickerBtnTitle: {
    color: C_BLUE,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  classPickerBtnSub: {
    color: C_MUTED,
    fontSize: 10.5,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 1,
  },
  classTabsLoading: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  classTabsLoadingText: { color: C_MUTED, fontWeight: "800", fontSize: 12 },
  classTab: {
    marginRight: 8,
    maxWidth: 110,
    minWidth: 72,
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: C_CARD_SOFT,
    borderWidth: 1,
    borderColor: C_CARD_SOFT_BORDER,
  },
  classTabActive: {
    backgroundColor: C_BLUE_SOFT,
    borderColor: C_BLUE,
    borderWidth: 2,
  },
  classTabText: { color: C_TEXT, fontWeight: "900", fontSize: 12.5 },
  classTabTextActive: { color: C_BLUE },
  emptyClassesPill: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: C_CARD_SOFT,
    borderWidth: 1,
    borderColor: C_CARD_SOFT_BORDER,
  },
  emptyClassesText: { color: C_MUTED, fontWeight: "900", fontSize: 12 },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  filterBtn: {
    flex: 1,
    minWidth: 0,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: C_CARD_SOFT,
    borderWidth: 1,
    borderColor: C_CARD_SOFT_BORDER,
  },
  filterBtnActive: { backgroundColor: C_BLUE_SOFT, borderColor: C_BLUE },
  filterBtnText: {
    color: C_TEXT,
    fontWeight: "900",
    fontSize: 11.5,
    textAlign: "center",
  },
  filterBtnTextActive: { color: C_BLUE },
  listCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: C_CARD_BG,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C_CARD_BORDER,
    overflow: "hidden",
  },
  codeCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: C_CARD_BG,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C_CARD_BORDER,
    padding: 8,
  },
  listContent: { padding: 7, paddingBottom: 96 },
  studentRow: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C_CARD_BORDER,
    backgroundColor: C_CARD_BG,
    paddingHorizontal: 7,
    paddingVertical: 7,
    marginBottom: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  studentRowSelected: { backgroundColor: C_BLUE_SOFT, borderColor: C_BLUE },
  studentInfo: { flex: 1, minWidth: 0 },
  studentName: { color: C_TEXT, fontSize: 12.5, fontWeight: "900", lineHeight: 15 },
  studentMeta: { color: C_MUTED, marginTop: 2, fontSize: 12, fontWeight: "700" },
  orderText: { color: C_MUTED, fontWeight: "900", fontSize: 12 },
  loadingBox: { padding: 30, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 10, color: C_MUTED, fontWeight: "700" },
  emptyBox: { padding: 30, alignItems: "center" },
  emptyText: { color: C_MUTED, fontWeight: "700", textAlign: "center" },
  emptySessionBox: { flex: 1, minHeight: 280, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  emptySessionTitle: { marginTop: 14, color: C_TEXT, fontSize: 18, fontWeight: "900" },
  emptySessionText: { marginTop: 8, color: C_MUTED, textAlign: "center", lineHeight: 20, fontWeight: "700" },
  sessionsListContent: { paddingTop: 10, paddingBottom: 96 },
  sessionPreviewCard: {
    position: "relative",
    marginBottom: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C_CARD_SOFT_BORDER,
    backgroundColor: C_CARD_SOFT,
    paddingHorizontal: 9,
    paddingTop: 9,
    paddingBottom: 10,
    overflow: "hidden",
  },
  sessionPreviewCardDraft: {
    borderColor: "#F59E0B",
    backgroundColor: "#FFF7ED",
  },
  sessionPreviewCardDeleteSelected: {
    borderColor: C_RED,
    borderWidth: 2,
    backgroundColor: "#FEF2F2",
  },
  sessionPreviewTop: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 38,
    marginHorizontal: -9,
    marginTop: -9,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: C_BLUE,
  },
  sessionPreviewTopDraft: {
    backgroundColor: "#F59E0B",
  },
  sessionPreviewTopDeleteSelected: {
    backgroundColor: C_RED,
  },
  sessionStudentCountSquare: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: C_HEADER_ICON_BG,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sessionStudentCountText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
  },
  sessionTitleWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  sessionNameTopBar: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  sessionTitleTextTopBar: {
    flexShrink: 1,
    color: "#fff",
    fontWeight: "900",
    fontSize: 18,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  sessionTitleTextTopBarDraft: {
    color: "#fff",
  },
  deleteCheck: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.95)",
    backgroundColor: "rgba(255,255,255,0.16)",
    flexShrink: 0,
  },
  deleteCheckActive: {
    backgroundColor: "#fff",
  },
  deleteCheckText: {
    color: C_RED,
    fontWeight: "900",
    fontSize: 14,
    lineHeight: 16,
  },
  sessionCodeTopBar: {
    position: "relative",
    minHeight: 32,
    marginHorizontal: -9,
    marginTop: -8,
    marginBottom: 9,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderBottomWidth: 1,
    borderBottomColor: C_CARD_SOFT_BORDER,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  sessionCodeRefreshBtn: {
    position: "absolute",
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(31,91,134,0.06)",
    borderWidth: 1,
    borderColor: "rgba(31,91,134,0.10)",
  },
  sessionCodeRightBlock: {
    alignItems: "center",
    justifyContent: "center",
  },
  sessionCodeTopBarValue: {
    color: C_MUTED,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1,
    textAlign: "center",
  },
  selectedListWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
    alignItems: "flex-start",
  },
  selectedChip: {
    backgroundColor: C_CARD_BG,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C_CARD_SOFT_BORDER,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  selectedChipText: { color: C_TEXT, fontWeight: "800", fontSize: 10.5, lineHeight: 13 },
  bottomActionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 16,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  createBtn: {
    minWidth: 230,
    maxWidth: 420,
    width: "100%",
    borderRadius: 999,
    backgroundColor: C_BLUE,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
  updateBtn: { backgroundColor: C_ORANGE },
  createBtnDisabled: { backgroundColor: "rgba(35,53,72,0.30)" },
  createBtnText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  deleteOverlayBtn: {
    minWidth: 230,
    maxWidth: 420,
    width: "100%",
    borderRadius: 999,
    backgroundColor: C_RED,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
  deleteModeHintPill: {
    maxWidth: 420,
    width: "100%",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.18)",
    paddingVertical: 11,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 4,
  },
  deleteModeHintText: {
    color: C_RED,
    fontWeight: "900",
    fontSize: 13,
    textAlign: "center",
  },
  primaryBtn: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: C_BLUE,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryBtnText: { color: "#fff", fontWeight: "900" },
  centerBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  centerTitle: { color: C_TEXT, fontSize: 22, fontWeight: "900", textAlign: "center" },
  centerText: { marginTop: 8, color: C_MUTED, textAlign: "center", lineHeight: 21 },
  classPickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(11,31,48,0.48)",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
  },
  classPickerCard: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "78%",
    borderRadius: 26,
    backgroundColor: C_CARD_BG,
    padding: 16,
    borderWidth: 1,
    borderColor: "#D5E1EA",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 26,
    elevation: 14,
  },
  classPickerTitle: {
    color: C_BLUE,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 12,
  },
  classPickerList: {
    paddingBottom: 8,
  },
  classPickerItem: {
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: C_CARD_SOFT,
    borderWidth: 1,
    borderColor: C_CARD_SOFT_BORDER,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  classPickerItemActive: {
    backgroundColor: C_BLUE_SOFT,
    borderColor: C_BLUE,
    borderWidth: 2,
  },
  classPickerItemTitle: {
    color: C_TEXT,
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  classPickerItemTitleActive: {
    color: C_BLUE,
  },
  classPickerItemSub: {
    color: C_MUTED,
    fontSize: 11.5,
    fontWeight: "800",
    marginTop: 3,
    textAlign: "center",
  },
  classPickerItemSubActive: {
    color: C_BLUE,
  },
  classPickerCloseBtn: {
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: C_BLUE,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  classPickerCloseText: {
    color: "#fff",
    fontWeight: "900",
  },
  codeModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(11,31,48,0.48)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  codeModalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 26,
    backgroundColor: C_CARD_BG,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D5E1EA",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 26,
    elevation: 14,
  },
  codeModalLabel: {
    color: C_MUTED,
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  codeModalCode: {
    marginTop: 10,
    color: C_BLUE,
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: 1,
  },
  codeModalClose: { marginTop: 18, color: C_MUTED, fontSize: 12, fontWeight: "800" },
  renameModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(11,31,48,0.48)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  renameModalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 26,
    backgroundColor: C_CARD_BG,
    padding: 18,
    borderWidth: 1,
    borderColor: "#D5E1EA",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  renameModalTitle: { color: C_BLUE, fontSize: 17, fontWeight: "900", marginBottom: 12 },
  renameInput: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C_CARD_SOFT_BORDER,
    backgroundColor: C_CARD_SOFT,
    paddingHorizontal: 12,
    color: C_TEXT,
    fontSize: 16,
    fontWeight: "800",
  },
  renameActionsRow: { marginTop: 14, flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  renameCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: C_BLUE_SOFT,
  },
  renameCancelText: { color: C_TEXT, fontWeight: "900" },
  renameSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: C_BLUE,
  },
  renameSaveBtnDisabled: { backgroundColor: "rgba(35,53,72,0.30)" },
  renameSaveText: { color: "#fff", fontWeight: "900" },
});
