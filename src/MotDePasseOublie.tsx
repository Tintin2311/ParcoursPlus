// src/MotDePasseOublie.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  CheckCircle2,
  EyeOff,
  Lock,
  Mail,
  Send,
  XCircle,
} from "lucide-react-native";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultSupabase } from "./supabaseClient";

type Mode = "accueil" | "prof" | "eleve";

type Props = {
  setPage?: (page: string) => void;
  setModeConnexion?: React.Dispatch<React.SetStateAction<Mode>>;
  supabase?: SupabaseClient;
  onBack?: () => void;
  initialErrorMessage?: string;
};

type FeedbackType = "error" | null;

export default function MotDePasseOublie({
  setPage,
  setModeConnexion,
  supabase = defaultSupabase,
  onBack,
  initialErrorMessage = "",
}: Props) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const [feedbackMessage, setFeedbackMessage] = useState(initialErrorMessage);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>(
    initialErrorMessage ? "error" : null
  );

  const [successOverlayVisible, setSuccessOverlayVisible] = useState(false);

  useEffect(() => {
    if (initialErrorMessage) {
      setFeedbackMessage(initialErrorMessage);
      setFeedbackType("error");
    }
  }, [initialErrorMessage]);

  const emailValide = useMemo(() => {
    const value = email.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }, [email]);

  const formulaireValide = !loading && emailValide;

  const handleBack = () => {
    if (loading) return;

    if (onBack) {
      onBack();
      return;
    }

    if (setPage) {
      setPage("accueil");
      return;
    }

    if (setModeConnexion) {
      setModeConnexion("accueil");
    }
  };

  const clearFeedback = () => {
    if (feedbackType || feedbackMessage) {
      setFeedbackMessage("");
      setFeedbackType(null);
    }
  };

  const setErrorFeedback = (message: string) => {
    setFeedbackType("error");
    setFeedbackMessage(message);
  };

  const buildRedirectTo = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return window.location.origin;
    }
    return undefined;
  };

  const handleSendReset = async () => {
    clearFeedback();

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setErrorFeedback("Veuillez renseigner votre adresse email.");
      return;
    }

    if (!emailValide) {
      setErrorFeedback("Veuillez saisir une adresse email valide.");
      return;
    }

    setLoading(true);

    try {
      const { data: exists, error: existsError } = await supabase.rpc(
        "professeur_email_exists",
        { p_email: trimmedEmail }
      );

      if (existsError) {
        setErrorFeedback(
          existsError.message || "Impossible de vérifier cette adresse mail."
        );
        return;
      }

      if (!exists) {
        setErrorFeedback("Aucun compte trouvé avec cette adresse mail.");
        return;
      }

      const redirectTo = buildRedirectTo();

      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo,
      });

      if (error) {
        if (
          error.message?.toLowerCase().includes("email rate limit exceeded")
        ) {
          setErrorFeedback(
            "Trop de demandes ont été envoyées récemment. Veuillez patienter un peu avant de réessayer."
          );
          return;
        }

        setErrorFeedback(
          error.message || "L’envoi du mail de réinitialisation a échoué."
        );
        return;
      }

      setFeedbackMessage("");
      setFeedbackType(null);
      setSuccessOverlayVisible(true);
    } catch (e: any) {
      setErrorFeedback(
        e?.message || "Une erreur inattendue est survenue."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCloseSuccessOverlay = () => {
    setSuccessOverlayVisible(false);
  };

  const handleBackToLogin = () => {
    setSuccessOverlayVisible(false);

    if (setModeConnexion) {
      setModeConnexion("accueil");
    }

    if (setPage) {
      setPage("accueil");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={["#0b1220", "#12243d", "#163456"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Modal
        visible={successOverlayVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseSuccessOverlay}
      >
        <View style={styles.overlayRoot}>
          <View style={styles.overlayBackdrop} />

          <View style={styles.overlayCenter}>
            <View style={styles.modalCard}>
              <View style={styles.modalIconWrap}>
                <CheckCircle2 color="#D8FFE7" size={32} />
              </View>

              <Text style={styles.modalTitle}>Email envoyé avec succès</Text>

              <Text style={styles.modalText}>
                Un email de réinitialisation vient d’être envoyé à :
              </Text>

              <Text style={styles.modalEmail}>{email.trim()}</Text>

              <Text style={styles.modalSmallText}>
                Ouvrez votre boîte mail puis suivez le lien reçu pour définir un nouveau mot de passe.
              </Text>

              <View style={styles.modalActions}>
                <Pressable
                  onPress={handleCloseSuccessOverlay}
                  style={({ pressed }) => [
                    styles.modalSecondaryButton,
                    pressed && { opacity: 0.92 },
                  ]}
                >
                  <Text style={styles.modalSecondaryButtonText}>OK</Text>
                </Pressable>

                <Pressable
                  onPress={handleBackToLogin}
                  style={({ pressed }) => [
                    styles.modalPrimaryButton,
                    pressed && { opacity: 0.92 },
                  ]}
                >
                  <LinearGradient
                    colors={["#3AA0FF", "#2563EB"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.modalPrimaryButtonGradient}
                  >
                    <Text style={styles.modalPrimaryButtonText}>
                      Retour à l’accueil
                    </Text>
                  </LinearGradient>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

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

          <Text style={styles.headerTitle}>Mot de passe oublié</Text>

          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Lock color="#DDEBFF" size={26} />
          </View>

          <Text style={styles.title}>Réinitialiser le mot de passe</Text>
          <Text style={styles.subtitle}>
            Entrez l’adresse email de votre compte. Nous vous enverrons un lien pour choisir un nouveau mot de passe.
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
            <Text style={styles.label}>Adresse email</Text>
            <View style={styles.inputWrap}>
              <Mail color="#CFE2FF" size={18} style={styles.inputIcon} />
              <TextInput
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  clearFeedback();
                }}
                placeholder="Saisissez votre adresse email"
                placeholderTextColor="#8EA6C7"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                style={styles.input}
                editable={!loading}
              />
            </View>

            {!!email.trim() && !emailValide && (
              <Text style={styles.errorText}>
                Veuillez saisir une adresse email valide.
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.submitBtn,
              (!formulaireValide || loading) && styles.submitBtnDisabled,
            ]}
            onPress={handleSendReset}
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
                  <Send color="#FFFFFF" size={16} />
                  <Text style={styles.submitText}>
                    Envoyer le lien de réinitialisation
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.helpCard}>
            <EyeOff color="#CFE2FF" size={16} />
            <Text style={styles.helpText}>
              Pensez à vérifier vos courriers indésirables si vous ne voyez pas le mail arriver rapidement.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0b1220",
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
    paddingLeft: 14,
  },

  inputIcon: {
    marginRight: 10,
  },

  input: {
    flex: 1,
    color: "#FFFFFF",
    paddingRight: 16,
    paddingVertical: 14,
    fontSize: 15,
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

  helpCard: {
    marginTop: 14,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },

  helpText: {
    flex: 1,
    color: "#C9D8EE",
    fontSize: 13,
    lineHeight: 18,
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
  },

  modalEmail: {
    marginTop: 10,
    marginBottom: 12,
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },

  modalSmallText: {
    color: "#AFC3DF",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 22,
  },

  modalActions: {
    width: "100%",
    gap: 10,
  },

  modalSecondaryButton: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },

  modalSecondaryButtonText: {
    color: "#EAF2FF",
    fontSize: 15,
    fontWeight: "800",
  },

  modalPrimaryButton: {
    borderRadius: 16,
    overflow: "hidden",
  },

  modalPrimaryButtonGradient: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  modalPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});