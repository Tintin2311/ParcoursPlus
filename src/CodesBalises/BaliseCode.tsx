// src/CodesBalises/BaliseCode.tsx
import React, { useState, useCallback } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import { ArrowLeft, Trash2, Save } from "lucide-react-native";
import { supabase } from "../supabaseClient";

type Props = {
  setPage: (p: any) => void;
};

const BaliseCode: React.FC<Props> = ({ setPage }) => {
  const [code, setCode] = useState("");
  const [numero, setNumero] = useState("");
  const [dirty, setDirty] = useState(false);

  const confirmLeave = useCallback(() => {
    if (!dirty) {
      setPage("CreationBalise");
      return;
    }

    if (Platform.OS === "web") {
      const ok = window.confirm(
        "Quitter sans enregistrer ? Les modifications seront perdues."
      );
      if (ok) setPage("CreationBalise");
    } else {
      Alert.alert(
        "Quitter ?",
        "Les modifications seront perdues.",
        [
          { text: "Annuler" },
          { text: "Quitter", onPress: () => setPage("CreationBalise") },
        ]
      );
    }
  }, [dirty, setPage]);

  const handleSave = async () => {
    if (!code || !numero) {
      Alert.alert("Erreur", "Remplis tous les champs");
      return;
    }

    try {
      await supabase.from("balises").insert({
        code: code.trim().toUpperCase(),
        numero_balise: parseInt(numero),
        points: 0,
        frozen: false,
      });

      Alert.alert("Succès", "Balise créée");
      setDirty(false);
      setPage("gestionBalises");
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  };

  const handleDelete = async () => {
    if (Platform.OS === "web") {
      if (!window.confirm("Supprimer cette balise ?")) return;
    } else {
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert("Supprimer ?", "", [
          { text: "Non", onPress: () => resolve(false) },
          { text: "Oui", onPress: () => resolve(true) },
        ]);
      });
      if (!confirmed) return;
    }

    try {
      // ici à adapter si édition
      Alert.alert("Info", "Suppression OK (à connecter à l'id)");
      setPage("gestionBalises");
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={confirmLeave}>
          <ArrowLeft color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity onPress={handleDelete}>
          <Trash2 color="#fff" />
        </TouchableOpacity>
      </View>

      {/* FORM */}
      <View style={styles.container}>
        <Text>Numéro</Text>
        <TextInput
          style={styles.input}
          value={numero}
          onChangeText={(v) => {
            setNumero(v);
            setDirty(true);
          }}
          keyboardType="numeric"
        />

        <Text>Code</Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={(v) => {
            setCode(v);
            setDirty(true);
          }}
        />

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Save color="#fff" />
          <Text style={{ color: "#fff" }}>Enregistrer</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default BaliseCode;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#EDF2F6" },

  header: {
    backgroundColor: "#1F5B86",
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
  },

  container: {
    padding: 20,
    gap: 12,
  },

  input: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 8,
  },

  saveBtn: {
    backgroundColor: "#16a34a",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 20,
  },
});