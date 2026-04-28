// src/CreationCompteProf.tsx
import React, { memo, useMemo, useState } from "react";
import {
  Platform,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Feather } from "@expo/vector-icons";
import { FontAwesome5 } from "@expo/vector-icons";

type ModeConnexion = "accueil" | "prof" | "eleve";

type ProfesseurLight = {
  email?: string | null;
  code?: string | null;
  user_id?: string | null;
};

type Props = {
  setPage: (p: string) => void;
  setModeConnexion: (m: ModeConnexion) => void;

  newProfName: string;
  setNewProfName: (v: string) => void;

  newProfPrenom: string;
  setNewProfPrenom: (v: string) => void;

  newProfEmail: string;
  setNewProfEmail: (v: string) => void;

  newProfCode: string;
  setNewProfCode: (v: string) => void;

  newProfPassword: string;
  setNewProfPassword: (v: string) => void;

  newProfPasswordConfirm: string;
  setNewProfPasswordConfirm: (v: string) => void;

  professeurs: ProfesseurLight[];
  genererCodeUnique: (liste: ProfesseurLight[]) => string; // laissé pour compatibilité
  setCodeValidationEnvoye: (code: string) => void;
  supabase: SupabaseClient;

  emailjs?: any;
};

type FieldProps = {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  editable: boolean;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address";
  right?: React.ReactNode;
  maxLength?: number;
};

const COLORS = {
  bg: "#0b1220",
  card: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.12)",
  inputBorder: "rgba(255,255,255,0.20)",
  label: "rgba(255,255,255,0.75)",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.8)",
  placeholder: "rgba(255,255,255,0.6)",
  green: "#10b981",
  lightGreen: "#86efac",
  blueInfoBg: "rgba(59,130,246,0.10)",
  blueInfoBorder: "rgba(59,130,246,0.35)",
  blueInfoText: "#bfdbfe",
  errorBg: "rgba(239,68,68,0.10)",
  errorBorder: "rgba(239,68,68,0.35)",
  errorText: "#fecaca",
};

const FormField = memo(function FormField({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  editable,
  secureTextEntry = false,
  autoCapitalize = "sentences",
  keyboardType = "default",
  right,
  maxLength,
}: FieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>

      <View style={styles.inputShell}>
        <Feather name={icon} size={18} color={COLORS.muted} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.placeholder}
          editable={editable}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          autoCorrect={false}
          spellCheck={false}
          maxLength={maxLength}
          style={styles.input}
        />
        {right}
      </View>
    </View>
  );
});

export default function CreationCompteProf({
  setPage,
  setModeConnexion,
  newProfName,
  setNewProfName,
  newProfPrenom,
  setNewProfPrenom,
  newProfEmail,
  setNewProfEmail,
  newProfCode,
  setNewProfCode,
  newProfPassword,
  setNewProfPassword,
  newProfPasswordConfirm,
  setNewProfPasswordConfirm,
  professeurs,
  genererCodeUnique,
  setCodeValidationEnvoye,
  supabase,
}: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const cleanEmail = (s: string) => s.trim().toLowerCase();

  const normalizeCode = (s: string) =>
    s
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/[^A-Z0-9_-]/g, "");

  const passwordValid = useMemo(() => {
    if (!newProfPassword) return true;
    return /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{6,}$/.test(newProfPassword);
  }, [newProfPassword]);

  const passwordsMatch = useMemo(() => {
    if (!newProfPasswordConfirm) return true;
    return newProfPassword === newProfPasswordConfirm;
  }, [newProfPassword, newProfPasswordConfirm]);

  const codeNormalized = useMemo(() => normalizeCode(newProfCode), [newProfCode]);

  const codeAlreadyUsed = useMemo(() => {
    return professeurs.some(
      (p) => normalizeCode(p.code || "") === codeNormalized && !!codeNormalized
    );
  }, [professeurs, codeNormalized]);

  const showMessage = (message: string) => {
    if (Platform.OS === "web") {
      alert(message);
    } else {
      Alert.alert("Parcours+", message);
    }
  };

  const validate = (): string | null => {
    if (!newProfName.trim()) return "Renseigne ton nom.";
    if (!newProfPrenom.trim()) return "Renseigne ton prénom.";
    if (!newProfEmail.trim()) return "Renseigne ton adresse email.";
    if (!codeNormalized) return "Renseigne un code unique.";
    if (codeNormalized.length < 4) return "Le code unique doit contenir au moins 4 caractères.";
    if (codeAlreadyUsed) return "Ce code unique est déjà utilisé par un autre enseignant.";
    if (!newProfPassword) return "Renseigne ton mot de passe.";
    if (!newProfPasswordConfirm) return "Confirme ton mot de passe.";

    if (!passwordValid) {
      return "Mot de passe invalide : 6 caractères minimum, avec 1 majuscule, 1 chiffre et 1 symbole.";
    }

    if (newProfPassword !== newProfPasswordConfirm) {
      return "Les mots de passe ne correspondent pas.";
    }

    const emailNorm = cleanEmail(newProfEmail);
    if (professeurs.some((p) => cleanEmail(p.email || "") === emailNorm)) {
      return "Un profil professeur existe déjà avec cette adresse email.";
    }

    return null;
  };

  const handleCreateAccount = async () => {
    if (loading) return;

    const validationError = validate();
    if (validationError) {
      showMessage(validationError);
      return;
    }

    setLoading(true);

    try {
      const email = cleanEmail(newProfEmail);
      const chosenCode = codeNormalized;
      const codeConfirmation = Math.floor(100000 + Math.random() * 900000).toString();

      setCodeValidationEnvoye(codeConfirmation);

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password: newProfPassword,
        options: {
          data: {
            nom: newProfName.trim(),
            prenom: newProfPrenom.trim(),
            code: chosenCode,
          },
        },
      });

      if (authError) {
        console.error("❌ Auth signUp error:", authError);

        if (authError.status === 429) {
          showMessage("Trop de tentatives de création. Réessaie dans quelques instants.");
          return;
        }

        const msg = authError.message?.toLowerCase?.() || "";
        if (msg.includes("already registered") || msg.includes("already been registered")) {
          showMessage("Cette adresse email est déjà utilisée.");
          return;
        }

        showMessage("Erreur lors de la création du compte : " + authError.message);
        return;
      }

      if (!authData.user?.id) {
        console.error("❌ signUp sans user.id :", authData);
        showMessage("Le compte a été créé partiellement, mais l'identifiant utilisateur est introuvable.");
        return;
      }

      setNewProfPassword("");
      setNewProfPasswordConfirm("");

      showMessage(
        authData.session
          ? "✅ Compte professeur créé avec succès."
          : "✅ Compte créé. Vérifie maintenant ton email pour confirmer l’adresse."
      );

      setPage("accueil");
      setModeConnexion("accueil");
    } catch (e: any) {
      console.error("❌ Unexpected error in CreationCompteProf:", e);
      showMessage("Une erreur inattendue est survenue pendant la création du compte.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => {
              if (loading) return;
              setPage("accueil");
              setModeConnexion("accueil");
            }}
            disabled={loading}
            style={[styles.backButton, loading && styles.disabled]}
          >
            <View style={styles.backInner}>
              <Feather name="arrow-left" size={18} color={COLORS.muted} />
              <Text style={styles.backText}>Retour</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <View style={styles.capBadge}>
              <FontAwesome5 name="graduation-cap" size={44} color="#fff" />
            </View>

            <Text style={styles.title}>Création</Text>
            <Text style={styles.subtitle}>de compte professeur</Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.card}>
          <FormField
            label="Nom"
            icon="user"
            value={newProfName}
            onChangeText={setNewProfName}
            placeholder="Nom"
            editable={!loading}
            autoCapitalize="words"
          />

          <FormField
            label="Prénom"
            icon="user"
            value={newProfPrenom}
            onChangeText={setNewProfPrenom}
            placeholder="Prénom"
            editable={!loading}
            autoCapitalize="words"
          />

          <FormField
            label="Adresse email"
            icon="mail"
            value={newProfEmail}
            onChangeText={setNewProfEmail}
            placeholder="Adresse email"
            editable={!loading}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <FormField
            label="Code unique"
            icon="hash"
            value={newProfCode}
            onChangeText={(t) => setNewProfCode(normalizeCode(t))}
            placeholder="Ex : EPS6A ou COLLEGE2025"
            editable={!loading}
            autoCapitalize="characters"
            maxLength={24}
          />

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Ce code sera l’identifiant de connexion de vos élèves. Ce code sera
              modifiable par la suite dans les paramètres.
            </Text>
          </View>

          {codeAlreadyUsed && !!codeNormalized && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                Ce code unique est déjà utilisé. Choisis-en un autre.
              </Text>
            </View>
          )}

          <FormField
            label="Mot de passe"
            icon="lock"
            value={newProfPassword}
            onChangeText={setNewProfPassword}
            placeholder="Mot de passe"
            editable={!loading}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            right={
              <TouchableOpacity
                onPress={() => setShowPassword((s) => !s)}
                disabled={loading}
                style={styles.eyeButton}
              >
                <Feather
                  name={showPassword ? "eye-off" : "eye"}
                  size={18}
                  color={COLORS.muted}
                />
              </TouchableOpacity>
            }
          />

          {!passwordValid && !!newProfPassword && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                Le mot de passe doit contenir au moins 6 caractères, une majuscule,
                un chiffre et un symbole.
              </Text>
            </View>
          )}

          <FormField
            label="Confirmer le mot de passe"
            icon="lock"
            value={newProfPasswordConfirm}
            onChangeText={setNewProfPasswordConfirm}
            placeholder="Confirmer le mot de passe"
            editable={!loading}
            secureTextEntry={!showPasswordConfirm}
            autoCapitalize="none"
            right={
              <TouchableOpacity
                onPress={() => setShowPasswordConfirm((s) => !s)}
                disabled={loading}
                style={styles.eyeButton}
              >
                <Feather
                  name={showPasswordConfirm ? "eye-off" : "eye"}
                  size={18}
                  color={COLORS.muted}
                />
              </TouchableOpacity>
            }
          />

          {!passwordsMatch && !!newProfPasswordConfirm && (
            <View style={styles.errorBoxSmall}>
              <Text style={styles.errorText}>
                Les mots de passe ne correspondent pas.
              </Text>
            </View>
          )}

          <TouchableOpacity
            onPress={handleCreateAccount}
            disabled={loading}
            style={[styles.submitButton, loading && styles.disabled]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather
                  name="check-circle"
                  size={18}
                  color="#fff"
                  style={styles.submitIcon}
                />
                <Text style={styles.submitText}>Créer mon compte</Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.footerNoteWrap}>
            <Text style={styles.footerNote}>
              Le compte est créé dans Auth, puis le profil professeur est rempli
              automatiquement par le trigger SQL côté Supabase.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  backInner: {
    flexDirection: "row",
    alignItems: "center",
  },
  backText: {
    color: COLORS.muted,
    marginLeft: 6,
  },
  headerCenter: {
    alignItems: "center",
    flex: 1,
    paddingHorizontal: 8,
  },
  headerSpacer: {
    width: 56,
  },
  capBadge: {
    width: 112,
    height: 112,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16,185,129,0.25)",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.40)",
  },
  title: {
    color: "white",
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -0.5,
    textAlign: "center",
    ...(Platform.OS === "web"
      ? ({ textShadow: "0px 3px 12px rgba(0,0,0,0.35)" } as any)
      : {
          textShadowColor: "rgba(0,0,0,0.35)",
          textShadowOffset: { width: 0, height: 3 },
          textShadowRadius: 12,
        }),
  },
  subtitle: {
    color: COLORS.lightGreen,
    fontSize: 22,
    fontWeight: "700",
    marginTop: 2,
    textAlign: "center",
  },
  card: {
    maxWidth: 640,
    width: "100%",
    alignSelf: "center",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    borderRadius: 24,
  },
  fieldWrap: {
    marginBottom: 12,
  },
  fieldLabel: {
    color: COLORS.label,
    marginBottom: 6,
  },
  inputShell: {
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.01)",
  },
  input: {
    flex: 1,
    color: COLORS.text,
    paddingVertical: 12,
    marginLeft: 8,
    outlineStyle: "none" as any,
  },
  eyeButton: {
    padding: 6,
  },
  infoBox: {
    backgroundColor: COLORS.blueInfoBg,
    borderColor: COLORS.blueInfoBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: -4,
    marginBottom: 12,
  },
  infoText: {
    color: COLORS.blueInfoText,
    fontSize: 12,
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: COLORS.errorBg,
    borderColor: COLORS.errorBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginTop: -4,
    marginBottom: 12,
  },
  errorBoxSmall: {
    backgroundColor: COLORS.errorBg,
    borderColor: COLORS.errorBorder,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
    marginTop: -4,
    marginBottom: 4,
  },
  errorText: {
    color: COLORS.errorText,
    fontSize: 12,
    lineHeight: 18,
  },
  submitButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: COLORS.green,
    flexDirection: "row",
    justifyContent: "center",
  },
  submitIcon: {
    marginRight: 8,
  },
  submitText: {
    color: "white",
    fontWeight: "700",
  },
  footerNoteWrap: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  footerNote: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  disabled: {
    opacity: 0.6,
  },
});