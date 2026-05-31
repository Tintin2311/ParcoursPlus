import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ArrowLeft, Save, Tag, ScanSearch, Shapes } from "lucide-react-native";
import { supabase } from "../supabaseClient";
import { fetchBaliseFormatByIdCompat, updateBaliseFormatByIdCompat } from "../baliseFormatsCompat";

type Props = {
  setPage?: (p: any) => void;
};

type BaliseEditDraft = {
  balise_id: string;
  balise_numero?: string;
};

type BaliseFormatType = "code" | "tableau" | "qrcode" | "poincon";

type BaliseFormat = {
  id: string;
  balise_id: string;
  user_id?: string | null;
  format_type: BaliseFormatType;
  label: string;
  is_default: boolean;
  payload: Record<string, any>;
  created_at?: string | null;
};

const BALISE_EDIT_DRAFT_KEY = "@parcoursplus_balise_edit_draft";
const BALISE_FORMAT_EDIT_DRAFT_KEY = "@parcoursplus_balise_format_edit_draft";

const C_BG = "#EDF2F6";
const C_HEADER = "#1F5B86";
const C_TEXT = "#0f172a";
const C_MUTED = "rgba(15,23,42,0.7)";
const C_CARD = "#FFFFFF";
const C_BORDER = "rgba(0,0,0,0.08)";
const C_INPUT_BG = "rgba(0,0,0,0.04)";
const C_SKY = "#EAF3F9";
const C_SKY_BORDER = "#C9D5DF";
const C_PRIMARY = "#0ea5e9";
const C_SUCCESS = "#16a34a";

const IOS_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 8,
};

const safeFormatType = (value: any): BaliseFormatType => {
  if (value === "code") return "code";
  if (value === "tableau") return "tableau";
  if (value === "qrcode") return "qrcode";
  return "poincon";
};

const mapFormatRow = (row: any): BaliseFormat => ({
  id: String(row.id),
  balise_id: String(row.balise_id),
  user_id: row.user_id ?? null,
  format_type: safeFormatType(row.format_type),
  label: String(row.label ?? "Poinçon"),
  is_default: !!row.is_default,
  payload: row.payload && typeof row.payload === "object" ? row.payload : {},
  created_at: row.created_at ?? null,
});

const getAuthenticatedUserId = async (): Promise<string> => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user?.id) throw new Error("Utilisateur non connecté.");
  return user.id;
};

const readFormatFromSupabase = async (
  formatId: string,
  userId: string
): Promise<BaliseFormat> => {
  const row = await fetchBaliseFormatByIdCompat(supabase, formatId, userId);
  return mapFormatRow(row);
};

const updateFormatInSupabase = async (
  formatId: string,
  userId: string,
  label: string,
  payload: Record<string, any>
) => {
  await updateBaliseFormatByIdCompat(supabase, formatId, userId, label, payload);
};

const updateBaliseFallbackCodeInSupabase = async (
  baliseId: string,
  userId: string,
  codeValue: string
) => {
  const { error } = await supabase
    .from("balises")
    .update({
      code: codeValue,
    })
    .eq("id", baliseId)
    .eq("user_id", userId);

  if (error) throw error;
};

const BalisePoincon: React.FC<Props> = ({ setPage = () => {} }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userId, setUserId] = useState("");
  const [baliseDraft, setBaliseDraft] = useState<BaliseEditDraft | null>(null);
  const [formatDraft, setFormatDraft] = useState<BaliseFormat | null>(null);

  const [label, setLabel] = useState("Poinçon");
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");

  const numeroBalise = useMemo(
    () => String(baliseDraft?.balise_numero ?? "—"),
    [baliseDraft]
  );

  const goBack = () => setPage("GestionBalises");

  useEffect(() => {
    const boot = async () => {
      try {
        const authUserId = await getAuthenticatedUserId();
        setUserId(authUserId);

        const [rawBaliseDraft, rawFormatDraft] = await Promise.all([
          AsyncStorage.getItem(BALISE_EDIT_DRAFT_KEY),
          AsyncStorage.getItem(BALISE_FORMAT_EDIT_DRAFT_KEY),
        ]);

        if (!rawBaliseDraft || !rawFormatDraft) {
          throw new Error("Aucun format en cours d'édition.");
        }

        const parsedBaliseDraft: BaliseEditDraft = JSON.parse(rawBaliseDraft);
        const parsedFormatDraft: BaliseFormat = mapFormatRow(JSON.parse(rawFormatDraft));

        if (parsedFormatDraft.format_type !== "poincon") {
          throw new Error("Le format ouvert n'est pas un format poinçon.");
        }

        const freshFormat = await readFormatFromSupabase(parsedFormatDraft.id, authUserId);

        setBaliseDraft(parsedBaliseDraft);
        setFormatDraft(freshFormat);
        setLabel(String(freshFormat.label ?? "Poinçon"));
        setValue(String(freshFormat.payload?.value ?? ""));
        setDescription(String(freshFormat.payload?.description ?? ""));
      } catch (e: any) {
        Alert.alert(
          "Impossible d'ouvrir le format",
          e?.message || "Le format demandé est introuvable."
        );
        goBack();
      } finally {
        setLoading(false);
      }
    };

    boot();
  }, []);

  const handleSave = async () => {
    if (!formatDraft || !baliseDraft || !userId) return;

    const cleanLabel = String(label ?? "").trim() || "Poinçon";
    const cleanValue = String(value ?? "").trim();
    const cleanDescription = String(description ?? "").trim();

    if (!cleanValue) {
      Alert.alert("Valeur manquante", "Merci de saisir la valeur du poinçon.");
      return;
    }

    try {
      setSaving(true);

      const nextPayload = {
        ...(formatDraft.payload || {}),
        value: cleanValue,
        description: cleanDescription,
      };

      await updateFormatInSupabase(formatDraft.id, userId, cleanLabel, nextPayload);

      if (formatDraft.is_default) {
        await updateBaliseFallbackCodeInSupabase(
          formatDraft.balise_id,
          userId,
          `POINCON:${cleanValue}`
        );
      }

      const nextFormatDraft: BaliseFormat = {
        ...formatDraft,
        label: cleanLabel,
        payload: nextPayload,
      };

      await AsyncStorage.setItem(
        BALISE_FORMAT_EDIT_DRAFT_KEY,
        JSON.stringify(nextFormatDraft)
      );

      Alert.alert("Succès", "Le format poinçon a bien été enregistré.", [
        { text: "OK", onPress: goBack },
      ]);
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible d'enregistrer ce format.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={C_PRIMARY} />
          <Text style={styles.loadingText}>Chargement du format poinçon...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.headerBack} activeOpacity={0.9}>
          <ArrowLeft color="#fff" size={20} />
        </TouchableOpacity>

        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle}>BALISE POINÇON</Text>
          <Text style={styles.headerSubtitle}>Balise n° {numeroBalise}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Format poinçon</Text>
          <Text style={styles.sectionText}>
            Cette page sert à enregistrer une valeur ou un repère associé à un poinçon.
          </Text>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Nom du format</Text>
            <View style={styles.inputWithIcon}>
              <Tag size={16} color="rgba(15,23,42,0.55)" />
              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder="Ex : Poinçon cycle 2"
                placeholderTextColor="rgba(15,23,42,0.4)"
                style={styles.inputWithIconText}
              />
            </View>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Valeur du poinçon</Text>
            <View style={styles.inputWithIcon}>
              <ScanSearch size={16} color="rgba(15,23,42,0.55)" />
              <TextInput
                value={value}
                onChangeText={setValue}
                placeholder="Ex : triangle, 8 trous, A7..."
                placeholderTextColor="rgba(15,23,42,0.4)"
                style={styles.inputWithIconText}
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Description</Text>
            <View style={styles.inputWithIcon}>
              <Shapes size={16} color="rgba(15,23,42,0.55)" />
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Ex : poinçon carré avec encoche"
                placeholderTextColor="rgba(15,23,42,0.4)"
                style={styles.inputWithIconText}
              />
            </View>
          </View>

          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>{label.trim() || "Poinçon"}</Text>
            <View style={styles.fakePunch}>
              <Text style={styles.fakePunchText}>⟐</Text>
            </View>
            <Text style={styles.previewValue}>{value || "Aucune valeur"}</Text>
            <Text style={styles.previewHint}>
              Cette page est une base simple. On pourra ensuite la faire évoluer vers
              un vrai système visuel de poinçons.
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleSave}
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            activeOpacity={0.9}
            disabled={saving}
          >
            <Save color="#fff" size={18} />
            <Text style={styles.saveBtnTxt}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={goBack}
            style={styles.secondaryBtn}
            activeOpacity={0.9}
            disabled={saving}
          >
            <Text style={styles.secondaryBtnTxt}>Retour</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default BalisePoincon;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C_BG },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingText: { marginTop: 10, color: C_MUTED, fontWeight: "600" },

  header: {
    backgroundColor: C_HEADER,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerBack: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: { flex: 1, minWidth: 0 },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "800", letterSpacing: 0.5 },
  headerSubtitle: { color: "rgba(255,255,255,0.88)", fontSize: 12, marginTop: 2 },

  scroll: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 40 },

  card: {
    backgroundColor: C_CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 16,
    ...(Platform.OS === "ios" ? IOS_SHADOW : {}),
    elevation: Platform.OS === "android" ? 2 : 0,
  },

  sectionTitle: { color: C_TEXT, fontSize: 22, fontWeight: "900" },
  sectionText: { color: C_MUTED, marginTop: 8, lineHeight: 21 },

  fieldBlock: { marginTop: 16 },
  fieldLabel: { color: C_MUTED, fontSize: 12, marginBottom: 6, fontWeight: "700" },

  inputWithIcon: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: C_INPUT_BG,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inputWithIconText: {
    flex: 1,
    color: C_TEXT,
    paddingVertical: Platform.select({ web: 10, default: 11 }),
  },

  previewCard: {
    marginTop: 18,
    backgroundColor: C_SKY,
    borderWidth: 1,
    borderColor: C_SKY_BORDER,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
  },
  previewTitle: { color: C_TEXT, fontWeight: "800", fontSize: 16 },
  fakePunch: {
    width: 90,
    height: 90,
    borderRadius: 999,
    backgroundColor: "#1f2937",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  fakePunchText: { color: "#fff", fontWeight: "900", fontSize: 28 },
  previewValue: {
    marginTop: 12,
    color: C_TEXT,
    fontWeight: "700",
    textAlign: "center",
  },
  previewHint: {
    marginTop: 8,
    color: C_MUTED,
    lineHeight: 20,
    textAlign: "center",
  },

  saveBtn: {
    marginTop: 18,
    borderRadius: 14,
    backgroundColor: C_SUCCESS,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },

  secondaryBtn: {
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.06)",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnTxt: { color: C_TEXT, fontWeight: "800" },
});
