import React, { useState } from "react";
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { supabase } from "./SupabaseClient";

export default function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [pwd1, setPwd1] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submit = async () => {
    setNotice(null);
    setErrorMsg(null);

    if (!pwd1 || pwd1.length < 8) {
      setErrorMsg("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (pwd1 !== pwd2) {
      setErrorMsg("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd1 });
      if (error) throw error;
      setNotice("Mot de passe mis à jour. Tu peux te reconnecter.");
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Impossible de mettre à jour le mot de passe.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>Définir un nouveau mot de passe</Text>

        <TextInput
          placeholder="Nouveau mot de passe"
          placeholderTextColor="#8892a6"
          secureTextEntry
          value={pwd1}
          onChangeText={setPwd1}
          style={styles.input}
        />
        <TextInput
          placeholder="Confirmer le mot de passe"
          placeholderTextColor="#8892a6"
          secureTextEntry
          value={pwd2}
          onChangeText={setPwd2}
          style={styles.input}
        />

        <Pressable onPress={submit} style={styles.btn} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Mettre à jour</Text>}
        </Pressable>

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {errorMsg ? <Text style={styles.error}>{errorMsg}</Text> : null}

        <Pressable onPress={onDone} style={{ marginTop: 14 }}>
          <Text style={{ color: "#9fb0d9", textAlign: "center" }}>Revenir à l’accueil</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b0f19", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: 360, borderWidth: 2, borderColor: "#ffffff22", borderRadius: 16, padding: 16, backgroundColor: "#ffffff08" },
  title: { color: "white", fontWeight: "800", fontSize: 18, textAlign: "center", marginBottom: 10 },
  input: {
    backgroundColor: "#101729",
    color: "white",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#233055",
    marginBottom: 10,
  },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: "#50C878" },
  btnText: { color: "white", fontWeight: "800" },
  notice: {
    color: "#C7F0FF",
    backgroundColor: "rgba(80,200,255,0.12)",
    borderColor: "rgba(80,200,255,0.45)",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 10,
    textAlign: "center",
  },
  error: {
    color: "#FFD5D5",
    backgroundColor: "rgba(255,80,80,0.12)",
    borderColor: "rgba(255,80,80,0.45)",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 10,
    textAlign: "center",
  },
});
