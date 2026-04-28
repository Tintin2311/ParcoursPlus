// src/CodesBalises/BaliseTableau.tsx
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
import {
  ArrowLeft,
  Save,
  Tag,
  Grid3x3,
  Columns3,
  Rows3,
  Wand2,
} from "lucide-react-native";
import { supabase } from "../supabaseClient";

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

const MIN_SIZE = 2;
const MAX_SIZE = 10;

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
const C_TABLE = "#FFF8EC";
const C_TABLE_BORDER = "#F1D5A5";
const C_TABLE_HEADER = "#F59E0B";

const IOS_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 8,
};

const safeFormatType = (value: any): BaliseFormatType => {
  if (value === "code") return "code";
  if (value === "qrcode") return "qrcode";
  if (value === "poincon") return "poincon";
  return "tableau";
};

const clampSize = (n: number) => Math.max(MIN_SIZE, Math.min(MAX_SIZE, n));

const makeColumnLetters = (count: number) =>
  Array.from({ length: count }, (_, i) => String.fromCharCode(65 + i));

const makeRowNumbers = (count: number) =>
  Array.from({ length: count }, (_, i) => String(i + 1));

const normalizeCellValue = (value: string) => String(value ?? "").trim();

const buildFallbackCode = (columns: number, rows: number) =>
  `TABLEAU ${columns}x${rows}`;

const mapFormatRow = (row: any): BaliseFormat => ({
  id: String(row.id),
  balise_id: String(row.balise_id),
  user_id: row.user_id ?? null,
  format_type: safeFormatType(row.format_type),
  label: String(row.label ?? "Tableau"),
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
  const { data, error } = await supabase
    .from("balise_formats")
    .select("id, balise_id, user_id, format_type, label, is_default, payload, created_at")
    .eq("id", formatId)
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return mapFormatRow(data);
};

const updateFormatInSupabase = async (
  formatId: string,
  userId: string,
  label: string,
  payload: Record<string, any>
) => {
  const { error } = await supabase
    .from("balise_formats")
    .update({
      label,
      payload,
    })
    .eq("id", formatId)
    .eq("user_id", userId);

  if (error) throw error;
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

const pruneCellsOutsideBounds = (
  cells: Record<string, string>,
  columns: number,
  rows: number
) => {
  const colLetters = new Set(makeColumnLetters(columns));
  const rowValues = new Set(makeRowNumbers(rows));

  const next: Record<string, string> = {};

  Object.entries(cells || {}).forEach(([key, value]) => {
    const match = key.match(/^([A-Z])(\d+)$/);
    if (!match) return;

    const col = match[1];
    const row = match[2];

    if (colLetters.has(col) && rowValues.has(row)) {
      next[key] = String(value ?? "");
    }
  });

  return next;
};

const BaliseTableau: React.FC<Props> = ({ setPage = () => {} }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [userId, setUserId] = useState("");
  const [baliseDraft, setBaliseDraft] = useState<BaliseEditDraft | null>(null);
  const [formatDraft, setFormatDraft] = useState<BaliseFormat | null>(null);

  const [label, setLabel] = useState("Tableau");
  const [tableName, setTableName] = useState("Tableau");
  const [columns, setColumns] = useState(4);
  const [rows, setRows] = useState(4);
  const [cells, setCells] = useState<Record<string, string>>({});

  const numeroBalise = useMemo(
    () => String(baliseDraft?.balise_numero ?? "—"),
    [baliseDraft]
  );

  const columnLetters = useMemo(() => makeColumnLetters(columns), [columns]);
  const rowNumbers = useMemo(() => makeRowNumbers(rows), [rows]);

  const filledCount = useMemo(() => {
    return Object.values(cells).filter((v) => normalizeCellValue(v) !== "").length;
  }, [cells]);

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

        if (parsedFormatDraft.format_type !== "tableau") {
          throw new Error("Le format ouvert n'est pas un format tableau.");
        }

        const freshFormat = await readFormatFromSupabase(parsedFormatDraft.id, authUserId);
        const payload = freshFormat.payload || {};

        const nextColumns = clampSize(Number(payload.columns ?? 4));
        const nextRows = clampSize(Number(payload.rows ?? 4));
        const nextCells =
          payload.cells && typeof payload.cells === "object" ? payload.cells : {};

        setBaliseDraft(parsedBaliseDraft);
        setFormatDraft(freshFormat);
        setLabel(String(freshFormat.label ?? "Tableau"));
        setTableName(String(payload.name ?? "Tableau"));
        setColumns(nextColumns);
        setRows(nextRows);
        setCells(pruneCellsOutsideBounds(nextCells, nextColumns, nextRows));
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

  const setCellValue = (cellKey: string, value: string) => {
    setCells((prev) => ({
      ...prev,
      [cellKey]: value,
    }));
  };

  const changeColumns = (delta: number) => {
    setColumns((prev) => {
      const next = clampSize(prev + delta);
      setCells((old) => pruneCellsOutsideBounds(old, next, rows));
      return next;
    });
  };

  const changeRows = (delta: number) => {
    setRows((prev) => {
      const next = clampSize(prev + delta);
      setCells((old) => pruneCellsOutsideBounds(old, columns, next));
      return next;
    });
  };

  const fillNumericExample = () => {
    const exampleRows = makeRowNumbers(rows);
    const exampleCols = makeColumnLetters(columns);
    const next: Record<string, string> = {};

    let current = 111;
    for (const r of exampleRows) {
      for (const c of exampleCols) {
        next[`${c}${r}`] = String(current);
        current += 7;
      }
    }

    setCells(next);
  };

  const fillMixedExample = () => {
    const exampleRows = makeRowNumbers(rows);
    const exampleCols = makeColumnLetters(columns);
    const next: Record<string, string> = {};

    for (let ri = 0; ri < exampleRows.length; ri++) {
      for (let ci = 0; ci < exampleCols.length; ci++) {
        const c = exampleCols[ci];
        const r = exampleRows[ri];
        next[`${c}${r}`] = `${(ci + 2) % 10}${c.toLowerCase()}${ri + 1}`;
      }
    }

    setCells(next);
  };

  const handleSave = async () => {
    if (!formatDraft || !baliseDraft || !userId) return;

    const cleanLabel = String(label ?? "").trim() || "Tableau";
    const cleanName = String(tableName ?? "").trim() || "Tableau";
    const cleanColumns = clampSize(columns);
    const cleanRows = clampSize(rows);
    const cleanCells = pruneCellsOutsideBounds(cells, cleanColumns, cleanRows);

    try {
      setSaving(true);

      const nextPayload = {
        ...(formatDraft.payload || {}),
        name: cleanName,
        columns: cleanColumns,
        rows: cleanRows,
        cells: cleanCells,
      };

      await updateFormatInSupabase(formatDraft.id, userId, cleanLabel, nextPayload);

      if (formatDraft.is_default) {
        await updateBaliseFallbackCodeInSupabase(
          formatDraft.balise_id,
          userId,
          buildFallbackCode(cleanColumns, cleanRows)
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

      Alert.alert("Succès", "Le format tableau a bien été enregistré.", [
        {
          text: "OK",
          onPress: goBack,
        },
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
          <Text style={styles.loadingText}>Chargement du format tableau...</Text>
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
          <Text style={styles.headerTitle}>BALISE TABLEAU</Text>
          <Text style={styles.headerSubtitle}>Balise n° {numeroBalise}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.numeroChip}>
              <Text style={styles.numeroChipTxt}>N° {numeroBalise}</Text>
            </View>

            {formatDraft?.is_default && (
              <View style={styles.defaultChip}>
                <Text style={styles.defaultChipTxt}>Format par défaut</Text>
              </View>
            )}
          </View>

          <Text style={styles.sectionTitle}>Tableau à double entrée</Text>
          <Text style={styles.sectionText}>
            Le professeur remplit lui-même les cases du tableau. Ensuite, chaque élève
            peut être associé à une case repère différente comme A1, B3, C2, etc.
          </Text>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Nom du format</Text>
            <View style={styles.inputWithIcon}>
              <Tag size={16} color="rgba(15,23,42,0.55)" />
              <TextInput
                value={label}
                onChangeText={setLabel}
                placeholder="Ex : Tableau évaluation"
                placeholderTextColor="rgba(15,23,42,0.4)"
                style={styles.inputWithIconText}
              />
            </View>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Nom du tableau</Text>
            <View style={styles.inputWithIcon}>
              <Grid3x3 size={16} color="rgba(15,23,42,0.55)" />
              <TextInput
                value={tableName}
                onChangeText={setTableName}
                placeholder="Ex : Tableau orange 5x6"
                placeholderTextColor="rgba(15,23,42,0.4)"
                style={styles.inputWithIconText}
              />
            </View>
          </View>

          <View style={styles.countersRow}>
            <View style={styles.counterCard}>
              <View style={styles.counterHeader}>
                <Columns3 size={16} color="#92400e" />
                <Text style={styles.counterTitle}>Colonnes</Text>
              </View>

              <View style={styles.counterControls}>
                <TouchableOpacity
                  onPress={() => changeColumns(-1)}
                  style={styles.counterBtn}
                  activeOpacity={0.9}
                >
                  <Text style={styles.counterBtnTxt}>−</Text>
                </TouchableOpacity>

                <Text style={styles.counterValue}>{columns}</Text>

                <TouchableOpacity
                  onPress={() => changeColumns(1)}
                  style={styles.counterBtn}
                  activeOpacity={0.9}
                >
                  <Text style={styles.counterBtnTxt}>+</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.counterCard}>
              <View style={styles.counterHeader}>
                <Rows3 size={16} color="#92400e" />
                <Text style={styles.counterTitle}>Lignes</Text>
              </View>

              <View style={styles.counterControls}>
                <TouchableOpacity
                  onPress={() => changeRows(-1)}
                  style={styles.counterBtn}
                  activeOpacity={0.9}
                >
                  <Text style={styles.counterBtnTxt}>−</Text>
                </TouchableOpacity>

                <Text style={styles.counterValue}>{rows}</Text>

                <TouchableOpacity
                  onPress={() => changeRows(1)}
                  style={styles.counterBtn}
                  activeOpacity={0.9}
                >
                  <Text style={styles.counterBtnTxt}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.quickActions}>
            <TouchableOpacity
              onPress={fillNumericExample}
              style={styles.quickBtn}
              activeOpacity={0.9}
            >
              <Wand2 size={15} color="#92400e" />
              <Text style={styles.quickBtnTxt}>Exemple chiffres</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={fillMixedExample}
              style={styles.quickBtn}
              activeOpacity={0.9}
            >
              <Wand2 size={15} color="#92400e" />
              <Text style={styles.quickBtnTxt}>Exemple mixte</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.previewInfo}>
            <Text style={styles.previewInfoTitle}>{tableName.trim() || "Tableau"}</Text>
            <Text style={styles.previewInfoText}>
              {columns} colonnes × {rows} lignes • {filledCount}/{columns * rows} cases remplies
            </Text>
            <Text style={styles.previewInfoText}>
              Exemple d’usage : Albert → A1, Léa → B3.
            </Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.tableWrap}>
              <View style={styles.tableHeaderRow}>
                <View style={styles.cornerCell} />
                {columnLetters.map((letter) => (
                  <View key={letter} style={styles.headerCell}>
                    <Text style={styles.headerCellTxt}>{letter}</Text>
                  </View>
                ))}
              </View>

              {rowNumbers.map((rowNum) => (
                <View key={rowNum} style={styles.tableRow}>
                  <View style={styles.sideCell}>
                    <Text style={styles.headerCellTxt}>{rowNum}</Text>
                  </View>

                  {columnLetters.map((letter) => {
                    const key = `${letter}${rowNum}`;
                    return (
                      <TextInput
                        key={key}
                        value={String(cells[key] ?? "")}
                        onChangeText={(v) => setCellValue(key, v)}
                        placeholder={key}
                        placeholderTextColor="rgba(146,64,14,0.35)"
                        style={styles.cellInput}
                        autoCorrect={false}
                      />
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>

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

export default BaliseTableau;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C_BG,
  },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 10,
    color: C_MUTED,
    fontWeight: "600",
  },

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
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 12,
    marginTop: 2,
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 40,
  },

  card: {
    backgroundColor: C_CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 16,
    ...(Platform.OS === "ios" ? IOS_SHADOW : {}),
    elevation: Platform.OS === "android" ? 2 : 0,
  },

  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  numeroChip: {
    backgroundColor: C_SKY,
    borderWidth: 1,
    borderColor: C_SKY_BORDER,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  numeroChipTxt: {
    color: C_TEXT,
    fontWeight: "800",
  },
  defaultChip: {
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#86EFAC",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  defaultChipTxt: {
    color: "#166534",
    fontWeight: "800",
    fontSize: 12,
  },

  sectionTitle: {
    color: C_TEXT,
    fontSize: 22,
    fontWeight: "900",
  },
  sectionText: {
    color: C_MUTED,
    marginTop: 8,
    lineHeight: 21,
  },

  fieldBlock: {
    marginTop: 16,
  },
  fieldLabel: {
    color: C_MUTED,
    fontSize: 12,
    marginBottom: 6,
    fontWeight: "700",
  },

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

  countersRow: {
    marginTop: 16,
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  counterCard: {
    flex: 1,
    minWidth: 150,
    backgroundColor: C_TABLE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C_TABLE_BORDER,
    padding: 12,
  },
  counterHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  counterTitle: {
    color: "#92400e",
    fontWeight: "800",
  },
  counterControls: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  counterBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: C_TABLE_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  counterBtnTxt: {
    color: "#92400e",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 24,
  },
  counterValue: {
    color: "#92400e",
    fontWeight: "900",
    fontSize: 24,
  },

  quickActions: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  quickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C_TABLE,
    borderWidth: 1,
    borderColor: C_TABLE_BORDER,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickBtnTxt: {
    color: "#92400e",
    fontWeight: "800",
  },

  previewInfo: {
    marginTop: 16,
    backgroundColor: C_SKY,
    borderWidth: 1,
    borderColor: C_SKY_BORDER,
    borderRadius: 16,
    padding: 14,
  },
  previewInfoTitle: {
    color: C_TEXT,
    fontWeight: "800",
    fontSize: 16,
  },
  previewInfoText: {
    color: C_MUTED,
    marginTop: 6,
    lineHeight: 20,
  },

  tableWrap: {
    marginTop: 16,
    backgroundColor: C_TABLE,
    borderWidth: 1,
    borderColor: C_TABLE_BORDER,
    borderRadius: 18,
    padding: 10,
  },
  tableHeaderRow: {
    flexDirection: "row",
  },
  tableRow: {
    flexDirection: "row",
  },
  cornerCell: {
    width: 52,
    height: 44,
  },
  headerCell: {
    width: 110,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  sideCell: {
    width: 52,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCellTxt: {
    color: C_TABLE_HEADER,
    fontWeight: "900",
    fontSize: 18,
  },
  cellInput: {
    width: 110,
    height: 58,
    borderWidth: 1,
    borderColor: C_TABLE_BORDER,
    backgroundColor: "#fff",
    textAlign: "center",
    color: "#92400e",
    fontWeight: "700",
    fontSize: 16,
  },

  saveBtn: {
    marginTop: 20,
    borderRadius: 14,
    backgroundColor: C_SUCCESS,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnTxt: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 15,
  },

  secondaryBtn: {
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.06)",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnTxt: {
    color: C_TEXT,
    fontWeight: "800",
  },
});