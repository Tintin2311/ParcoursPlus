// src/NouveauMotDePasse.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
 TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  XCircle,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultSupabase } from "./supabaseClient";

type Props = {
  setPage?: (page: string) => void;
  supabase?: SupabaseClient;
  onBack?: () => void;
};

type FeedbackType = "success" | "error" | null;

type PasswordChecks = {
  minLength: boolean;
  uppercase: boolean;
  lowercase: boolean;
  digit: boolean;
  special: boolean;
};

const SUCCESS_STORAGE_KEY = "parcoursplus_password_update_success";

function getPasswordChecks(password: string): PasswordChecks {
  return {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    digit: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

function isPasswordStrong(password: string): boolean {
  const checks = getPasswordChecks(password);
  return (
    checks.minLength &&
    checks.uppercase &&
    checks.lowercase &&
    checks.digit &&
    checks.special
  );
}

function getMissingPasswordRules(password: string): string[] {
  const checks = getPasswordChecks(password);
  const missing: string[] = [];

  if (!checks.minLength) missing.push("au moins 8 caractères");
  if (!checks.uppercase) missing.push("une majuscule");
  if (!checks.lowercase) missing.push("une minuscule");
  if (!checks.digit) missing.push("un chiffre");
  if (!checks.special) missing.push("un caractère spécial");

  return missing;
}

async function setPersistentSuccessFlag(value: "1" | "0") {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.localStorage.setItem(SUCCESS_STORAGE_KEY, value);
      return;
    }
    await AsyncStorage.setItem(SUCCESS_STORAGE_KEY, value);
  } catch {
    // silencieux
  }
}

async function getPersistentSuccessFlag(): Promise<string | null> {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return window.localStorage.getItem(SUCCESS_STORAGE_KEY);
    }
    return await AsyncStorage.getItem(SUCCESS_STORAGE_KEY);
  } catch {
    return null;
  }
}

async function clearPersistentSuccessFlag() {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.localStorage.removeItem(SUCCESS_STORAGE_KEY);
      return;
    }
    await AsyncStorage.removeItem(SUCCESS_STORAGE_KEY);
  } catch {
    // silencieux
  }
}

export default function NouveauMotDePasse({
  setPage,
  supabase = defaultSupabase,
  onBack,
}: Props) {
  const [motDePasseActuel, setMotDePasseActuel] = useState("");
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState("");
  const [confirmationMotDePasse, setConfirmationMotDePasse] = useState("");

  const [loading, setLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackType, setFeedbackType] = useState<FeedbackType>(null);

  const [showActuel, setShowActuel] = useState(false);
  const [showNouveau, setShowNouveau] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const [successOverlayVisible, setSuccessOverlayVisible] = useState(false);
  const [restoringSuccessState, setRestoringSuccessState] = useState(true);

  useEffect(() => {
    let mounted = true;

    const restoreSuccessState = async () => {
      const flag = await getPersistentSuccessFlag();

      if (!mounted) return;

      if (flag === "1") {
        setSuccessOverlayVisible(true);
      }

      setRestoringSuccessState(false);
    };

    restoreSuccessState();

    return () => {
      mounted = false;
    };
  }, []);

  const passwordChecks = useMemo(
    () => getPasswordChecks(nouveauMotDePasse),
    [nouveauMotDePasse]
  );

  const missingRules = useMemo(
    () => getMissingPasswordRules(nouveauMotDePasse),
    [nouveauMotDePasse]
  );

  const erreurNouveauMotDePasse = useMemo(() => {
    if (!nouveauMotDePasse) return "";

    if (nouveauMotDePasse === motDePasseActuel) {
      return "Le nouveau mot de passe doit être différent du mot de passe actuel.";
    }

    if (!isPasswordStrong(nouveauMotDePasse)) {
      return `Il manque : ${missingRules.join(", ")}.`;
    }

    return "";
  }, [nouveauMotDePasse, motDePasseActuel, missingRules]);

  const erreurConfirmation = useMemo(() => {
    if (!confirmationMotDePasse) return "";
    if (nouveauMotDePasse !== confirmationMotDePasse) {
      return "Les deux nouveaux mots de passe ne sont pas identiques.";
    }
    return "";
  }, [nouveauMotDePasse, confirmationMotDePasse]);

  const formulaireValide =
    !loading &&
    motDePasseActuel.trim().length > 0 &&
    isPasswordStrong(nouveauMotDePasse) &&
    confirmationMotDePasse.length > 0 &&
    nouveauMotDePasse === confirmationMotDePasse &&
    nouveauMotDePasse !== motDePasseActuel;

  const handleBack = () => {
    if (loading) return;

    if (onBack) {
      onBack();
      return;
    }
    if (setPage) {
      setPage("Parametres");
    }
  };

  const setErrorFeedback = (message: string) => {
    setFeedbackType("error");
    setFeedbackMessage(message);
  };

  const clearFeedback = () => {
    if (feedbackType) {
      setFeedbackMessage("");
      setFeedbackType(null);
    }
  };

  const handleCloseSuccessOverlay = async () => {
    setSuccessOverlayVisible(false);
    await clearPersistentSuccessFlag();
  };

  const handleUpdatePassword = async () => {
    if (loading) return;

    setFeedbackMessage("");
    setFeedbackType(null);

    if (!motDePasseActuel || !nouveauMotDePasse || !confirmationMotDePasse) {
      setErrorFeedback("Veuillez remplir tous les champs.");
      return;
    }

    if (nouveauMotDePasse === motDePasseActuel) {
      setErrorFeedback(
        "Le nouveau mot de passe doit être différent du mot de passe actuel."
      );
      return;
    }

    if (!isPasswordStrong(nouveauMotDePasse)) {
      setErrorFeedback(
        `Mot de passe insuffisant : il manque ${missingRules.join(", ")}.`
      );
      return;
    }

    if (nouveauMotDePasse !== confirmationMotDePasse) {
      setErrorFeedback("Les deux nouveaux mots de passe ne sont pas identiques.");
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user?.email) {
        setErrorFeedback("Session introuvable. Veuillez vous reconnecter.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: motDePasseActuel,
      });

      if (signInError) {
        setErrorFeedback("Mauvais mot de passe actuel.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: nouveauMotDePasse,
      });

      if (updateError) {
        setErrorFeedback(
          updateError.message || "La modification du mot de passe a échoué."
        );
        return;
      }

      setMotDePasseActuel("");
      setNouveauMotDePasse("");
      setConfirmationMotDePasse("");
      setFeedbackMessage("");
      setFeedbackType(null);

      // On enregistre le succès AVANT tout éventuel rerender/reload/session refresh.
      await setPersistentSuccessFlag("1");
      setSuccessOverlayVisible(true);
    } catch (e: any) {
      setErrorFeedback(e?.message || "Une erreur inattendue est survenue.");
    } finally {
      setLoading(false);
    }
  };

  const RuleItem = ({
    ok,
    label,
  }: {
    ok: boolean;
    label: string;
  }) => (
    <View style={styles.ruleRow}>
      {ok ? (
        <CheckCircle2 color="#86EFAC" size={16} />
      ) : (
        <XCircle color="#FCA5A5" size={16} />
      )}
      <Text style={[styles.ruleText, ok ? styles.ruleOk : styles.ruleKo]}>
        {label}
      </Text>
    </View>
  );

  if (restoringSuccessState) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LinearGradient
          colors={["#0b1220", "#12243d", "#163456"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.loadingScreen}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={["#0b1220", "#12243d", "#163456"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.backBtn, loading && styles.backBtnDisabled]}
            onPress={handleBack}
            activeOpacity={0.85}
            disabled={loading}
          >
            <ArrowLeft color="#EAF2FF" size={20} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Nouveau mot de passe</Text>

          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <ShieldCheck color="#DDEBFF" size={26} />
          </View>

          <Text style={styles.title}>Modifier le mot de passe</Text>
          <Text style={styles.subtitle}>
            Saisissez votre mot de passe actuel, puis choisissez un nouveau mot
            de passe sécurisé.
          </Text>

          {!!feedbackMessage && feedbackType === "error" && (
            <View style={[styles.feedbackBox, styles.errorBox]}>
              <XCircle color="#FFD3D3" size={18} />
              <Text style={[styles.feedbackText, styles.errorBoxText]}>
                {feedbackMessage}
              </Text>
            </View>
          )}

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Mot de passe actuel</Text>
            <View style={styles.inputWrap}>
              <TextInput
                value={motDePasseActuel}
                onChangeText={(v) => {
                  setMotDePasseActuel(v);
                  clearFeedback();
                }}
                placeholder="Saisissez votre mot de passe actuel"
                placeholderTextColor="#8EA6C7"
                secureTextEntry={!showActuel}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                style={styles.input}
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setShowActuel((v) => !v)}
                style={styles.eyeBtn}
                activeOpacity={0.8}
                disabled={loading}
              >
                {showActuel ? (
                  <EyeOff color="#CFE2FF" size={18} />
                ) : (
                  <Eye color="#CFE2FF" size={18} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Nouveau mot de passe</Text>
            <View style={styles.inputWrap}>
              <TextInput
                value={nouveauMotDePasse}
                onChangeText={(v) => {
                  setNouveauMotDePasse(v);
                  clearFeedback();
                }}
                placeholder="Choisissez un nouveau mot de passe"
                placeholderTextColor="#8EA6C7"
                secureTextEntry={!showNouveau}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                style={styles.input}
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setShowNouveau((v) => !v)}
                style={styles.eyeBtn}
                activeOpacity={0.8}
                disabled={loading}
              >
                {showNouveau ? (
                  <EyeOff color="#CFE2FF" size={18} />
                ) : (
                  <Eye color="#CFE2FF" size={18} />
                )}
              </TouchableOpacity>
            </View>

            {!!erreurNouveauMotDePasse && (
              <Text style={styles.errorText}>{erreurNouveauMotDePasse}</Text>
            )}

            <View style={styles.rulesBox}>
              <RuleItem
                ok={passwordChecks.minLength}
                label="Au moins 8 caractères"
              />
              <RuleItem
                ok={passwordChecks.uppercase}
                label="Au moins une majuscule"
              />
              <RuleItem
                ok={passwordChecks.lowercase}
                label="Au moins une minuscule"
              />
              <RuleItem ok={passwordChecks.digit} label="Au moins un chiffre" />
              <RuleItem
                ok={passwordChecks.special}
                label="Au moins un caractère spécial"
              />
            </View>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Confirmer le nouveau mot de passe</Text>
            <View style={styles.inputWrap}>
              <TextInput
                value={confirmationMotDePasse}
                onChangeText={(v) => {
                  setConfirmationMotDePasse(v);
                  clearFeedback();
                }}
                placeholder="Ressaisissez le nouveau mot de passe"
                placeholderTextColor="#8EA6C7"
                secureTextEntry={!showConfirmation}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                style={styles.input}
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmation((v) => !v)}
                style={styles.eyeBtn}
                activeOpacity={0.8}
                disabled={loading}
              >
                {showConfirmation ? (
                  <EyeOff color="#CFE2FF" size={18} />
                ) : (
                  <Eye color="#CFE2FF" size={18} />
                )}
              </TouchableOpacity>
            </View>
            {!!erreurConfirmation && (
              <Text style={styles.errorText}>{erreurConfirmation}</Text>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.submitBtn,
              (!formulaireValide || loading) && styles.submitBtnDisabled,
            ]}
            onPress={handleUpdatePassword}
            disabled={!formulaireValide || loading}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={
                !formulaireValide || loading
                  ? ["#5C6E88", "#51637B"]
                  : ["#3AA0FF", "#2563EB"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.submitGradient}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Lock color="#FFFFFF" size={16} />
                  <Text style={styles.submitText}>
                    Enregistrer le nouveau mot de passe
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {successOverlayVisible && (
        <View style={styles.overlayRoot}>
          <View style={styles.overlayBackdrop} />

          <View style={styles.overlayCenter}>
            <View style={styles.modalCard}>
              <View style={styles.modalIconWrap}>
                <CheckCircle2 color="#D8FFE7" size={32} />
              </View>

              <Text style={styles.modalTitle}>
                Mot de passe mis à jour avec succès
              </Text>

              <Pressable
                onPress={handleCloseSuccessOverlay}
                style={({ pressed }) => [
                  styles.modalButton,
                  pressed && { opacity: 0.92 },
                ]}
              >
                <LinearGradient
                  colors={["#3AA0FF", "#2563EB"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalButtonGradient}
                >
                  <Text style={styles.modalButtonText}>OK</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0b1220",
  },

  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: Platform.OS === "web" ? 28 : 36,
    justifyContent: "center",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
  },

  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },

  backBtnDisabled: {
    opacity: 0.55,
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    color: "#F5F9FF",
    fontSize: 20,
    fontWeight: "800",
    marginHorizontal: 12,
  },

  headerSpacer: {
    width: 42,
  },

  card: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 560,
    borderRadius: 24,
    padding: 22,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.10)",
    marginBottom: 16,
  },

  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 8,
  },

  subtitle: {
    color: "#C9D8EE",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },

  fieldBlock: {
    marginBottom: 16,
  },

  label: {
    color: "#EAF2FF",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },

  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    backgroundColor: "rgba(7,16,30,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    minHeight: 54,
  },

  input: {
    flex: 1,
    color: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },

  eyeBtn: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },

  errorText: {
    marginTop: 6,
    color: "#FFB4B4",
    fontSize: 13,
    lineHeight: 18,
  },

  feedbackBox: {
    marginBottom: 18,
    minHeight: 46,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
  },

  errorBox: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderColor: "rgba(248,113,113,0.28)",
  },

  feedbackText: {
    flex: 1,
    color: "#EAF2FF",
    fontSize: 13,
    lineHeight: 18,
  },

  errorBoxText: {
    color: "#FFE5E5",
  },

  rulesBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 8,
  },

  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  ruleText: {
    fontSize: 13,
    lineHeight: 18,
  },

  ruleOk: {
    color: "#D8FFE7",
  },

  ruleKo: {
    color: "#FFD7D7",
  },

  submitBtn: {
    marginTop: 8,
    borderRadius: 18,
    overflow: "hidden",
  },

  submitBtnDisabled: {
    opacity: 0.72,
  },

  submitGradient: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    flexDirection: "row",
    gap: 8,
  },

  submitText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },

  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },

  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3,10,20,0.72)",
  },

  overlayCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
  },

  modalCard: {
    width: "100%",
    maxWidth: 430,
    borderRadius: 24,
    padding: 24,
    backgroundColor: "#152235",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 16,
  },

  modalIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(34,197,94,0.16)",
    marginBottom: 16,
  },

  modalTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 10,
  },

  modalText: {
    color: "#C9D8EE",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 22,
  },

  modalButton: {
    width: "100%",
    borderRadius: 16,
    overflow: "hidden",
  },

  modalButtonGradient: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  modalButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});