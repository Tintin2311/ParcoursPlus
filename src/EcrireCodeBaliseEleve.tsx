// src/EcrireCodeBaliseEleve.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { supabase } from "./supabaseClient";
import {
  AttemptDetail,
  GainBreakdown,
  ParcoursBaremeTentativeRow,
  ParcoursPointsConfig,
  TentativeRow,
  buildTentativesDebugState,
  computeCurrentDisplayedScore,
  computeTentativeGainBreakdown,
  formatPoints,
  getDefaultPointsConfig,
  loadAttemptsHistory,
  loadParcoursTentativeBaremeRows,
  loadResolvedTentativeConfig,
  parseNumeric,
  recomputeAndSyncStats,
  sanitize,
  saveTentativeWithStats,
} from "./CalculPointTentatives";

/* =========================
   Types
========================= */
type SetPageFn = (page: any) => void;

type EleveConnecte = {
  id?: string;
  uuid?: string;
  code?: string;
  teacher_id?: string | null;
  group_id?: string | null;
  display_name?: string | null;
};

type RpcStudentRow = {
  id?: string;
  name?: string | null;
  group_id?: string | null;
};

type ParcoursActif = {
  id?: string;
  nom?: string | null;
  name?: string | null;
  balises_ordre?: any;
  user_id?: string | null;
  professeur_id?: string | null;
  [key: string]: any;
};

type BaliseRow = {
  id: string;
  code?: string | null;
  points?: number | null;
  frozen?: boolean | null;
  numero_balise?: number | null;
  nom?: string | null;
  name?: string | null;
  user_id?: string | null;
  [key: string]: any;
};

type BaliseAffichee = BaliseRow & {
  ordre: number;
};

type Props = {
  setPage: SetPageFn;
  eleveConnecte?: EleveConnecte | null;
  parcoursActif?: ParcoursActif | null;
};

/* =========================
   Theme lumineux
========================= */
const C_BG = "#EAF6FF";
const C_BG_2 = "#F8FCFF";
const C_CARD = "#FFFFFF";
const C_TEXT = "#12304A";
const C_MUTED = "#5D7288";
const C_BORDER = "rgba(31,91,134,0.14)";
const C_BLUE = "#1F75B8";
const C_BLUE_DARK = "#1F5B86";
const C_GOLD = "#F59E0B";
const C_GREEN = "#16A34A";
const C_RED = "#DC2626";

/* =========================
   Helpers
========================= */
const getDisplayName = (row: any) => String(row?.nom ?? row?.name ?? "Parcours");

const uniqueStrings = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

const isUuidLike = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );

const isIntegerLike = (value: string) => /^\d+$/.test(value.trim());

const safeParseObject = (value: any): any => {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const toBool = (value: any, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  if (typeof value === "number") return value !== 0;

  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "oui", "on"].includes(s)) return true;
  if (["false", "0", "no", "non", "off"].includes(s)) return false;
  return fallback;
};

const parseJsonObject = (value: any): any => {
  const parsed = safeParseObject(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
};

const parseAssignments = (value: any): Record<string, number> => {
  const obj = parseJsonObject(value);
  const out: Record<string, number> = {};

  Object.entries(obj).forEach(([key, raw]) => {
    const n = Number(raw);
    if (key && Number.isFinite(n) && n >= 1) out[key] = n;
  });

  return out;
};

const extractTokens = (value: any): string[] => {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => extractTokens(item))
      .map((v) => String(v).trim())
      .filter(Boolean);
  }

  if (typeof value === "number") return [String(value)];

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];

    if (raw.startsWith("{") && raw.endsWith("}")) {
      return raw
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim().replace(/^"(.*)"$/, "$1"))
        .filter(Boolean);
    }

    if (
      (raw.startsWith("[") && raw.endsWith("]")) ||
      (raw.startsWith("{") && raw.endsWith("}"))
    ) {
      try {
        const parsed = JSON.parse(raw);
        return extractTokens(parsed);
      } catch {
        // noop
      }
    }

    if (raw.includes(",")) {
      return raw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    }

    return [raw];
  }

  if (typeof value === "object") {
    const candidate =
      value.balise_id ??
      value.id ??
      value.value ??
      value.numero_balise ??
      value.code;

    if (candidate != null) return [String(candidate).trim()].filter(Boolean);
    if (Array.isArray(value.items)) return extractTokens(value.items);
    if (Array.isArray(value.balises)) return extractTokens(value.balises);
    if (Array.isArray(value.data)) return extractTokens(value.data);
  }

  return [];
};

const orderBalisesFromTokens = (
  tokens: string[],
  balises: BaliseRow[]
): BaliseAffichee[] => {
  const byId = new Map<string, BaliseRow>();
  const byNumero = new Map<string, BaliseRow>();
  const byCode = new Map<string, BaliseRow>();

  balises.forEach((b) => {
    byId.set(String(b.id), b);
    if (b.numero_balise != null) byNumero.set(String(b.numero_balise), b);
    if (b.code) byCode.set(sanitize(b.code), b);
  });

  const results: BaliseAffichee[] = [];
  const seen = new Set<string>();

  tokens.forEach((token, index) => {
    const t = String(token).trim();
    if (!t) return;

    let balise: BaliseRow | undefined;

    if (isUuidLike(t)) balise = byId.get(t);
    if (!balise && isIntegerLike(t)) balise = byNumero.get(String(Number(t)));
    if (!balise) balise = byCode.get(sanitize(t));

    if (!balise) return;
    if (balise.frozen === true) return;
    if (seen.has(balise.id)) return;

    seen.add(balise.id);
    results.push({
      ...balise,
      ordre: index + 1,
    });
  });

  return results;
};

const formatConditionLabel = (
  row:
    | ParcoursBaremeTentativeRow
    | {
        condition_type: "=" | "≥" | "≤" | "entre";
        attempts_value: number | null;
        attempts_min: number | null;
        attempts_max: number | null;
      }
) => {
  if (row.condition_type === "entre") {
    return `${row.attempts_min ?? "?"} à ${row.attempts_max ?? "?"}`;
  }
  return `${row.condition_type} ${row.attempts_value ?? "?"}`;
};

const getModesFromRow = (row: any) => {
  const modes = parseJsonObject(row?.modes);
  const config = parseJsonObject(row?.config);
  const settings = parseJsonObject(row?.settings_json);

  return {
    balises: toBool(
      modes?.balises ??
        config?.modes?.balises ??
        config?.balises ??
        settings?.modes?.balises ??
        settings?.balises,
      false
    ),
    parcours: toBool(
      modes?.parcours ??
        config?.modes?.parcours ??
        config?.parcours ??
        settings?.modes?.parcours ??
        settings?.parcours,
      false
    ),
    tentatives: toBool(
      modes?.tentatives ??
        config?.modes?.tentatives ??
        config?.tentatives ??
        settings?.modes?.tentatives ??
        settings?.tentatives,
      false
    ),
  };
};

const getNumberFromRow = (row: any, keys: string[], fallback = 0) => {
  const config = parseJsonObject(row?.config);
  const settings = parseJsonObject(row?.settings_json);

  for (const key of keys) {
    const value = row?.[key] ?? config?.[key] ?? settings?.[key];
    if (value != null) return parseNumeric(value, fallback);
  }

  return fallback;
};

const scoreConfigRow = (row: any) => {
  const modes = getModesFromRow(row);
  const pointsParParcours = getNumberFromRow(row, ["points_par_parcours", "pointsParParcours"], 0);
  const updated = row?.updated_at ? new Date(row.updated_at).getTime() : 0;

  return (
    (pointsParParcours > 0 ? 1_000_000 : 0) +
    (modes.parcours ? 500_000 : 0) +
    (modes.balises ? 50_000 : 0) +
    (modes.tentatives ? 50_000 : 0) +
    pointsParParcours +
    (Number.isFinite(updated) ? updated / 1_000_000_000_000 : 0)
  );
};

const mergeConfigWithBestSupabaseRow = async (
  groupId: string | null,
  parcoursId: string | undefined,
  baseConfig: ParcoursPointsConfig
): Promise<ParcoursPointsConfig> => {
  if (!groupId) return baseConfig;

  const { data, error } = await supabase
    .from("group_points_configs")
    .select("*")
    .eq("group_id", groupId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(20);

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    return baseConfig;
  }

  const bestRow = [...data].sort((a, b) => scoreConfigRow(b) - scoreConfigRow(a))[0];
  const rowModes = getModesFromRow(bestRow);
  const pointsParParcours = getNumberFromRow(
    bestRow,
    ["points_par_parcours", "pointsParParcours"],
    baseConfig.pointsParParcours
  );
  const pointsParBalise = getNumberFromRow(
    bestRow,
    ["points_par_balise", "pointsParBalise"],
    baseConfig.pointsParBalise
  );
  const pointsPerCorrect = getNumberFromRow(
    bestRow,
    ["points_per_correct", "pointsPerCorrect"],
    baseConfig.pointsPerCorrect
  );

  const tentativePageMode =
    bestRow?.tentative_page_mode === "personnalise" ||
    bestRow?.tentativePageMode === "personnalise"
      ? "personnalise"
      : "general";

  const tentativePageDefault =
    bestRow?.tentative_page_default == null && bestRow?.tentativePageDefault == null
      ? baseConfig.tentativePageDefault
      : Number(bestRow?.tentative_page_default ?? bestRow?.tentativePageDefault) || null;

  const assignments = parseAssignments(
    bestRow?.tentative_page_assignments ?? bestRow?.tentativePageAssignments
  );

  const modes = {
    balises: rowModes.balises || baseConfig.modes.balises,
    parcours: rowModes.parcours || baseConfig.modes.parcours || pointsParParcours > 0,
    tentatives: rowModes.tentatives || baseConfig.modes.tentatives,
  };

  if (!modes.balises && !modes.parcours && !modes.tentatives) {
    modes.balises = true;
  }

  const fixedConfig: ParcoursPointsConfig = {
    ...baseConfig,
    modes,
    pointsParParcours,
    pointsParBalise,
    pointsPerCorrect,
    tentativePageMode,
    tentativePageDefault,
    tentativePageAssignments: Object.keys(assignments).length
      ? assignments
      : baseConfig.tentativePageAssignments,
  };

  console.log("CONFIG FORCEE DEPUIS group_points_configs", {
    groupId,
    parcoursId,
    row: {
      id: bestRow?.id,
      modes: bestRow?.modes,
      points_par_parcours: bestRow?.points_par_parcours,
      updated_at: bestRow?.updated_at,
      score: scoreConfigRow(bestRow),
    },
    fixedConfig,
  });

  return fixedConfig;
};

const loadStatParcoursTermine = async (
  studentId: string | null,
  parcoursId: string | undefined
): Promise<boolean> => {
  if (!studentId || !parcoursId) return false;

  const { data, error } = await supabase
    .from("eleve_parcours_stats")
    .select("parcours_termine")
    .eq("student_id", studentId)
    .eq("parcours_id", parcoursId)
    .maybeSingle();

  if (error) return false;
  return data?.parcours_termine === true;
};

/* =========================
   Component
========================= */
const EcrireCodeBaliseEleve: React.FC<Props> = ({
  setPage,
  eleveConnecte,
  parcoursActif,
}) => {
  const { width } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  const [studentId, setStudentId] = useState<string | null>(eleveConnecte?.id ?? null);
  const [studentGroupId, setStudentGroupId] = useState<string | null>(
    eleveConnecte?.group_id ?? null
  );

  const [balises, setBalises] = useState<BaliseAffichee[]>([]);
  const [attemptsHistory, setAttemptsHistory] = useState<TentativeRow[]>([]);
  const [validatedBaliseIds, setValidatedBaliseIds] = useState<string[]>([]);
  const [completionAttemptNumber, setCompletionAttemptNumber] = useState<number | null>(null);

  const [codesSaisis, setCodesSaisis] = useState<Record<string, string>>({});
  const [resultats, setResultats] = useState<Record<string, boolean | null>>({});

  const [savedScore, setSavedScore] = useState(0);
  const [tentativesCount, setTentativesCount] = useState(0);
  const [savedPointsTotal, setSavedPointsTotal] = useState(0);
  const [lastPointsGain, setLastPointsGain] = useState(0);
  const [parcoursTermineDb, setParcoursTermineDb] = useState(false);

  const [pointsConfig, setPointsConfig] = useState<ParcoursPointsConfig>(
    getDefaultPointsConfig()
  );
  const [tentativeBaremeRows, setTentativeBaremeRows] = useState<ParcoursBaremeTentativeRow[]>([]);
  const [resolvedTentativePage, setResolvedTentativePage] = useState<number | null>(null);
  const [resolvedTentativeGroupId, setResolvedTentativeGroupId] = useState<string | null>(null);
  const [resolvedProfesseurId, setResolvedProfesseurId] = useState<string | null>(null);
  const [supportParcoursId, setSupportParcoursId] = useState<string | null>(null);

  const [scoreModalVisible, setScoreModalVisible] = useState(false);

  const parcoursNom = useMemo(() => getDisplayName(parcoursActif), [parcoursActif]);
  const validatedSet = useMemo(() => new Set(validatedBaliseIds), [validatedBaliseIds]);
  const isCompleted = balises.length > 0 && validatedBaliseIds.length >= balises.length;
  const isCompletedEffective = isCompleted || parcoursTermineDb;

  const statCardWidth = useMemo(() => {
    const gap = 8;
    const horizontalPadding = 28;
    const total = width - horizontalPadding - gap * 2;
    return Math.max(96, Math.floor(total / 3));
  }, [width]);

  const resolveStudent = useCallback(async () => {
    let nextStudentId = eleveConnecte?.id ?? null;
    let nextGroupId = eleveConnecte?.group_id ?? null;

    if ((!nextStudentId || !nextGroupId) && eleveConnecte?.code) {
      const rpc = await supabase.rpc("student_name_by_code", {
        p_code: eleveConnecte.code,
      });

      if (!rpc.error && rpc.data) {
        const row: RpcStudentRow = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
        nextStudentId = row?.id ?? nextStudentId;
        nextGroupId = row?.group_id ?? nextGroupId;
      }
    }

    setStudentId(nextStudentId);
    setStudentGroupId(nextGroupId);

    return {
      studentId: nextStudentId,
      groupId: nextGroupId,
    };
  }, [eleveConnecte?.code, eleveConnecte?.group_id, eleveConnecte?.id]);

  const forceParcoursBonusIfNeeded = useCallback(
    ({
      rawTotal,
      score,
      config,
      isTermine,
    }: {
      rawTotal: number;
      score: ReturnType<typeof computeCurrentDisplayedScore>;
      config: ParcoursPointsConfig;
      isTermine: boolean;
    }) => {
      if (!isTermine) return rawTotal;
      if (!config.modes.parcours) return rawTotal;
      if (!config.pointsParParcours || config.pointsParParcours <= 0) return rawTotal;
      if (score.parcoursPoints > 0) return rawTotal;

      return rawTotal + Number(config.pointsParParcours || 0);
    },
    []
  );

  const loadAttemptsAndConfig = useCallback(
    async (
      resolvedStudentId: string | null,
      resolvedGroupId: string | null,
      resolvedParcoursId?: string,
      orderedBalises: BaliseAffichee[] = []
    ) => {
      const baseResolvedConfig = await loadResolvedTentativeConfig(
        resolvedGroupId,
        resolvedParcoursId
      );

      const fixedPointsConfig = await mergeConfigWithBestSupabaseRow(
        resolvedGroupId,
        resolvedParcoursId,
        baseResolvedConfig.pointsConfig
      );

      const fixedAttemptPage =
        fixedPointsConfig.tentativePageMode === "personnalise"
          ? resolvedParcoursId
            ? fixedPointsConfig.tentativePageAssignments[resolvedParcoursId] ?? null
            : null
          : fixedPointsConfig.tentativePageDefault ?? baseResolvedConfig.resolvedAttemptPage;

      const baremes = await loadParcoursTentativeBaremeRows(
        baseResolvedConfig.resolvedProfesseurId,
        fixedAttemptPage
      );

      const progress = await recomputeAndSyncStats({
        studentId: resolvedStudentId,
        parcoursId: resolvedParcoursId,
        balises: orderedBalises,
        pointsConfig: fixedPointsConfig,
        tentativeBaremeRows: baremes,
      });

      const [attempts, dbTermine] = await Promise.all([
        loadAttemptsHistory(resolvedStudentId, resolvedParcoursId),
        loadStatParcoursTermine(resolvedStudentId, resolvedParcoursId),
      ]);

      const effectiveTermine =
        dbTermine ||
        progress.parcoursTermine ||
        (orderedBalises.length > 0 && progress.validatedIds.length >= orderedBalises.length);

      const scoreNow = computeCurrentDisplayedScore({
        balises: orderedBalises,
        validatedIds: progress.validatedIds,
        completionAttemptNumber: progress.completionAttemptNumber,
        pointsConfig: fixedPointsConfig,
        tentativeBaremeRows: baremes,
      });

      const correctedTotal = forceParcoursBonusIfNeeded({
        rawTotal: scoreNow.totalPoints,
        score: scoreNow,
        config: fixedPointsConfig,
        isTermine: effectiveTermine,
      });

      if (
        resolvedStudentId &&
        resolvedParcoursId &&
        effectiveTermine &&
        correctedTotal !== progress.totalPoints
      ) {
        await supabase
          .from("eleve_parcours_stats")
          .update({
            best_points: correctedTotal,
            last_points: correctedTotal,
            parcours_termine: true,
            updated_at: new Date().toISOString(),
          })
          .eq("student_id", resolvedStudentId)
          .eq("parcours_id", resolvedParcoursId);
      }

      console.log("DEBUG SCORE PARCOURS FINAL", {
        modes: fixedPointsConfig.modes,
        pointsParParcours: fixedPointsConfig.pointsParParcours,
        totalBalises: orderedBalises.length,
        validatedCount: progress.validatedIds.length,
        completionAttemptNumber: progress.completionAttemptNumber,
        parcoursTermineDb: dbTermine,
        effectiveTermine,
        scoreNow,
        correctedTotal,
        baremeRows: baremes.length,
        fixedAttemptPage,
      });

      setAttemptsHistory(attempts);
      setValidatedBaliseIds(progress.validatedIds);
      setCompletionAttemptNumber(progress.completionAttemptNumber);
      setSavedScore(progress.validatedCount);
      setTentativesCount(progress.tentativesCount);
      setSavedPointsTotal(correctedTotal);
      setLastPointsGain(progress.lastPointsGain);
      setParcoursTermineDb(effectiveTermine);

      setPointsConfig(fixedPointsConfig);
      setResolvedTentativePage(fixedAttemptPage);
      setResolvedTentativeGroupId(baseResolvedConfig.resolvedGroupId);
      setResolvedProfesseurId(baseResolvedConfig.resolvedProfesseurId);
      setSupportParcoursId(baseResolvedConfig.supportParcoursId);
      setTentativeBaremeRows(baremes);
    },
    [forceParcoursBonusIfNeeded]
  );

  const resetProgress = useCallback(() => {
    setBalises([]);
    setAttemptsHistory([]);
    setValidatedBaliseIds([]);
    setCompletionAttemptNumber(null);
    setSavedScore(0);
    setTentativesCount(0);
    setSavedPointsTotal(0);
    setLastPointsGain(0);
    setParcoursTermineDb(false);
    setPointsConfig(getDefaultPointsConfig());
    setTentativeBaremeRows([]);
    setResolvedTentativePage(null);
    setResolvedTentativeGroupId(null);
    setResolvedProfesseurId(null);
    setSupportParcoursId(null);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setScreenError(null);

    try {
      if (!parcoursActif?.id) {
        resetProgress();
        return;
      }

      const resolved = await resolveStudent();

      const { data: parcoursData, error: parcoursError } = await supabase
        .from("parcours")
        .select("*")
        .eq("id", parcoursActif.id)
        .limit(1);

      if (parcoursError) throw parcoursError;

      const parcoursDb =
        (((parcoursData as ParcoursActif[] | null) ?? [])[0] as ParcoursActif | undefined) ??
        parcoursActif;

      const rawBalisesOrdre = parcoursDb?.balises_ordre ?? parcoursActif?.balises_ordre ?? null;
      const tokens = uniqueStrings(extractTokens(rawBalisesOrdre));

      let orderedBalises: BaliseAffichee[] = [];

      if (tokens.length) {
        const uuidTokens = tokens.filter(isUuidLike);
        const numeroTokens = tokens.filter(isIntegerLike).map((t) => Number(t));
        const codeTokensRaw = tokens.filter((t) => !isUuidLike(t) && !isIntegerLike(t));

        const fetchedBalises: BaliseRow[] = [];

        if (uuidTokens.length) {
          const { data, error } = await supabase.from("balises").select("*").in("id", uuidTokens);
          if (error) throw error;
          fetchedBalises.push(...(((data as BaliseRow[]) || []).filter(Boolean)));
        }

        if (numeroTokens.length) {
          const { data, error } = await supabase
            .from("balises")
            .select("*")
            .in("numero_balise", numeroTokens);
          if (error) throw error;
          fetchedBalises.push(...(((data as BaliseRow[]) || []).filter(Boolean)));
        }

        if (codeTokensRaw.length) {
          const { data, error } = await supabase.from("balises").select("*");
          if (error) throw error;

          const allBalises = ((data as BaliseRow[]) || []).filter(Boolean);
          const normalizedCodes = codeTokensRaw.map((x) => sanitize(x));

          const matchingByCode = allBalises.filter(
            (b) => !!b.code && normalizedCodes.includes(sanitize(b.code))
          );

          fetchedBalises.push(...matchingByCode);
        }

        const uniqBalisesMap = new Map<string, BaliseRow>();
        fetchedBalises.forEach((b) => {
          if (b?.id) uniqBalisesMap.set(String(b.id), b);
        });

        orderedBalises = orderBalisesFromTokens(tokens, Array.from(uniqBalisesMap.values()));
      }

      setBalises(orderedBalises);

      await loadAttemptsAndConfig(
        resolved.studentId,
        resolved.groupId,
        parcoursActif.id,
        orderedBalises
      );
    } catch (err: any) {
      console.error("Erreur EcrireCodeBaliseEleve:", err);
      setScreenError(err?.message || "Impossible de charger les données du parcours.");
      resetProgress();
    } finally {
      setLoading(false);
    }
  }, [loadAttemptsAndConfig, parcoursActif, resetProgress, resolveStudent]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const liveScore = useMemo(() => {
    const score = computeCurrentDisplayedScore({
      balises,
      validatedIds: validatedBaliseIds,
      completionAttemptNumber,
      pointsConfig,
      tentativeBaremeRows,
    });

    if (
      isCompletedEffective &&
      pointsConfig.modes.parcours &&
      pointsConfig.pointsParParcours > 0 &&
      score.parcoursPoints <= 0
    ) {
      return {
        ...score,
        parcoursPoints: pointsConfig.pointsParParcours,
        totalPoints: score.totalPoints + pointsConfig.pointsParParcours,
      };
    }

    return score;
  }, [
    balises,
    validatedBaliseIds,
    completionAttemptNumber,
    pointsConfig,
    tentativeBaremeRows,
    isCompletedEffective,
  ]);

  const debugState = useMemo(() => {
    return buildTentativesDebugState({
      groupId: resolvedTentativeGroupId,
      professeurId: resolvedProfesseurId,
      supportParcoursId,
      pageRetenue: resolvedTentativePage,
      completionAttemptNumber,
      baremeRows: tentativeBaremeRows,
    });
  }, [
    resolvedTentativeGroupId,
    resolvedProfesseurId,
    supportParcoursId,
    resolvedTentativePage,
    completionAttemptNumber,
    tentativeBaremeRows,
  ]);

  const handleChangeCode = useCallback(
    (baliseId: string, value: string) => {
      if (validatedSet.has(baliseId)) return;
      setCodesSaisis((prev) => ({ ...prev, [baliseId]: value }));
      setResultats((prev) => ({ ...prev, [baliseId]: null }));
    },
    [validatedSet]
  );

  const computeGainBreakdown = useCallback(
    (nextResults: Record<string, boolean | null>): GainBreakdown => {
      return computeTentativeGainBreakdown({
        balises,
        validatedIds: validatedBaliseIds,
        nextResults,
        tentativesCount,
        pointsConfig,
        tentativeBaremeRows,
        resolvedTentativePage,
        resolvedGroupId: resolvedTentativeGroupId,
        resolvedProfesseurId,
        supportParcoursId,
      });
    },
    [
      balises,
      validatedBaliseIds,
      tentativesCount,
      pointsConfig,
      tentativeBaremeRows,
      resolvedTentativePage,
      resolvedTentativeGroupId,
      resolvedProfesseurId,
      supportParcoursId,
    ]
  );

  const scoreDetailsLines = useMemo(() => {
    const lines: string[] = [];

    lines.push(`Total enregistré : ${formatPoints(savedPointsTotal)} pts`);
    lines.push(`Balises validées : ${validatedBaliseIds.length}/${balises.length}`);
    lines.push(`Tentatives effectuées : ${tentativesCount}`);
    lines.push(`Dernier gain : ${formatPoints(lastPointsGain)} pts`);
    lines.push("");

    lines.push(`Modes actifs :`);
    lines.push(`• Balises : ${pointsConfig.modes.balises ? "oui" : "non"}`);
    lines.push(`• Parcours terminé : ${pointsConfig.modes.parcours ? "oui" : "non"}`);
    lines.push(`• Tentatives : ${pointsConfig.modes.tentatives ? "oui" : "non"}`);
    lines.push(`Bonus parcours : ${formatPoints(pointsConfig.pointsParParcours)} pts`);
    lines.push(`parcours_termine DB : ${parcoursTermineDb ? "true" : "false"}`);
    lines.push("");

    lines.push(`Mode tentatives : ${pointsConfig.tentativePageMode}`);
    lines.push(
      `Page utilisée : ${resolvedTentativePage ? `Page ${resolvedTentativePage}` : "aucune"}`
    );
    lines.push(`Classe élève : ${studentGroupId ?? "aucune"}`);
    lines.push(`Classe source barème : ${resolvedTentativeGroupId ?? "aucune"}`);
    lines.push(`Professeur source : ${resolvedProfesseurId ?? "aucun"}`);
    lines.push(`Parcours support barème : ${supportParcoursId ?? "aucun"}`);
    lines.push(`Parcours courant : ${parcoursActif?.id ?? "aucun"}`);
    lines.push("");

    lines.push(`Points balises : ${formatPoints(liveScore.balisesPoints)}`);
    lines.push(`Points parcours : ${formatPoints(liveScore.parcoursPoints)}`);
    lines.push(`Points tentatives : ${formatPoints(liveScore.tentativesPoints)}`);
    lines.push(`Fallback tentatives : ${formatPoints(pointsConfig.pointsPerCorrect)}`);
    lines.push(`Points balise fallback : ${formatPoints(pointsConfig.pointsParBalise)}`);
    lines.push("");

    lines.push("Barème tentatives chargé :");
    if (!tentativeBaremeRows.length) {
      lines.push("• Aucun barème trouvé");
    } else {
      tentativeBaremeRows.forEach((row) => {
        lines.push(`• ${formatConditionLabel(row)} → ${formatPoints(row.points)} pts`);
      });
    }

    lines.push("");
    lines.push("Debug :");
    lines.push(`• groupId = ${debugState.groupId ?? "null"}`);
    lines.push(`• professeurId = ${debugState.professeurId ?? "null"}`);
    lines.push(`• supportParcoursId = ${debugState.supportParcoursId ?? "null"}`);
    lines.push(`• page retenue = ${debugState.pageRetenue ?? "null"}`);
    lines.push(
      `• completionAttemptNumber = ${debugState.completionAttemptNumber ?? "null"}`
    );
    lines.push(`• baremeCount = ${debugState.baremeCount}`);

    if (debugState.matchedRow) {
      lines.push(
        `• règle matchée = ${formatConditionLabel(debugState.matchedRow)} → ${formatPoints(
          debugState.matchedRow.points
        )} pts`
      );
    } else {
      lines.push("• règle matchée = aucune");
    }

    if (completionAttemptNumber != null) {
      lines.push("");
      lines.push(`Parcours terminé à la tentative n°${completionAttemptNumber}`);
    }

    if (attemptsHistory.length) {
      lines.push("");
      lines.push("Historique :");
      attemptsHistory.forEach((a, i) => {
        const n = Number(a.tentatives_numero ?? i + 1);
        const pts = parseNumeric(a.points_earned, 0);
        const score = Number(a.score ?? 0);
        lines.push(
          `• Tentative ${n} → +${formatPoints(pts)} pts | score ${score}/${balises.length}`
        );
      });
    }

    return lines;
  }, [
    savedPointsTotal,
    validatedBaliseIds.length,
    balises.length,
    tentativesCount,
    lastPointsGain,
    pointsConfig,
    parcoursTermineDb,
    resolvedTentativePage,
    studentGroupId,
    resolvedTentativeGroupId,
    resolvedProfesseurId,
    supportParcoursId,
    parcoursActif?.id,
    liveScore.balisesPoints,
    liveScore.parcoursPoints,
    liveScore.tentativesPoints,
    tentativeBaremeRows,
    debugState,
    completionAttemptNumber,
    attemptsHistory,
  ]);

  const saveTentativeAndStats = useCallback(
    async (nextResults: Record<string, boolean | null>) => {
      if (!studentId || !parcoursActif?.id) {
        throw new Error("Élève ou parcours introuvable.");
      }

      if (isCompleted) {
        throw new Error("Ce parcours est déjà terminé.");
      }

      const breakdown = computeGainBreakdown(nextResults);

      const result = await saveTentativeWithStats({
        studentId,
        parcoursId: parcoursActif.id,
        balises,
        validatedIds: validatedBaliseIds,
        codesSaisis,
        nextResults,
        pointsConfig,
        breakdown,
        currentDisplayedTotal: savedPointsTotal,
      });

      const nextValidatedIds = Array.from(
        new Set([...validatedBaliseIds, ...result.newlyValidatedIds])
      );

      const nextCompletionAttemptNumber =
        breakdown.willComplete && completionAttemptNumber == null
          ? breakdown.tentativeNumero
          : completionAttemptNumber;

      const nextProgress = await recomputeAndSyncStats({
        studentId,
        parcoursId: parcoursActif.id,
        balises,
        pointsConfig,
        tentativeBaremeRows,
      });

      const dbTermine = await loadStatParcoursTermine(studentId, parcoursActif.id);
      const effectiveTermine =
        dbTermine ||
        nextProgress.parcoursTermine ||
        (balises.length > 0 && nextProgress.validatedIds.length >= balises.length);

      const recomputedScore = computeCurrentDisplayedScore({
        balises,
        validatedIds: nextProgress.validatedIds.length ? nextProgress.validatedIds : nextValidatedIds,
        completionAttemptNumber: nextProgress.completionAttemptNumber ?? nextCompletionAttemptNumber,
        pointsConfig,
        tentativeBaremeRows,
      });

      const correctedTotal = forceParcoursBonusIfNeeded({
        rawTotal: recomputedScore.totalPoints,
        score: recomputedScore,
        config: pointsConfig,
        isTermine: effectiveTermine,
      });

      if (effectiveTermine) {
        await supabase
          .from("eleve_parcours_stats")
          .update({
            best_points: correctedTotal,
            last_points: correctedTotal,
            parcours_termine: true,
            updated_at: new Date().toISOString(),
          })
          .eq("student_id", studentId)
          .eq("parcours_id", parcoursActif.id);
      }

      const newAttemptRow: TentativeRow = {
        student_id: studentId,
        parcours_id: parcoursActif.id,
        tentatives_numero: breakdown.tentativeNumero,
        score: result.nextValidatedCount,
        total_balises: balises.length,
        points_earned: breakdown.totalGain,
        details: result.details as AttemptDetail[],
      };

      setAttemptsHistory((prev) => [...prev, newAttemptRow]);
      setValidatedBaliseIds(nextProgress.validatedIds.length ? nextProgress.validatedIds : nextValidatedIds);
      setSavedScore(nextProgress.validatedCount || result.nextValidatedCount);
      setTentativesCount(nextProgress.tentativesCount || result.nextTentativesCount);
      setSavedPointsTotal(correctedTotal);
      setLastPointsGain(breakdown.totalGain);
      setCompletionAttemptNumber(nextProgress.completionAttemptNumber ?? nextCompletionAttemptNumber);
      setParcoursTermineDb(effectiveTermine);

      setCodesSaisis((prev) => {
        const next = { ...prev };
        result.newlyValidatedIds.forEach((id) => {
          delete next[id];
        });
        return next;
      });

      setResultats((prev) => {
        const next = { ...prev };
        balises.forEach((b) => {
          if (validatedSet.has(b.id)) next[b.id] = true;
        });
        result.newlyValidatedIds.forEach((id) => {
          next[id] = true;
        });
        return next;
      });

      return {
        breakdown,
        nextSavedPointsTotal: correctedTotal,
        nextValidatedCount: nextProgress.validatedCount || result.nextValidatedCount,
        nextTentativesCount: nextProgress.tentativesCount || result.nextTentativesCount,
      };
    },
    [
      studentId,
      parcoursActif?.id,
      isCompleted,
      computeGainBreakdown,
      balises,
      validatedBaliseIds,
      codesSaisis,
      pointsConfig,
      savedPointsTotal,
      completionAttemptNumber,
      tentativeBaremeRows,
      forceParcoursBonusIfNeeded,
      validatedSet,
    ]
  );

  const handleVerifierTout = useCallback(async () => {
    try {
      if (!balises.length) return;

      if (isCompleted) {
        Alert.alert("Parcours terminé", "Ce parcours est déjà entièrement validé.");
        return;
      }

      const hasAnyInput = balises.some(
        (balise) => !validatedSet.has(balise.id) && !!sanitize(codesSaisis[balise.id])
      );

      if (!hasAnyInput) {
        Alert.alert("Aucune saisie", "Entre au moins un code avant de vérifier.");
        return;
      }

      setSaving(true);

      const nextResults: Record<string, boolean | null> = {};
      balises.forEach((balise) => {
        if (validatedSet.has(balise.id)) {
          nextResults[balise.id] = true;
          return;
        }

        const saisi = sanitize(codesSaisis[balise.id]);
        const attendu = sanitize(balise.code);
        nextResults[balise.id] = !!saisi && saisi === attendu;
      });

      setResultats(nextResults);

      const { breakdown, nextSavedPointsTotal, nextValidatedCount, nextTentativesCount } =
        await saveTentativeAndStats(nextResults);

      const lines = [
        `Balises nouvellement validées : ${breakdown.newlyValidatedCount}`,
        `Points balises : ${formatPoints(breakdown.balisesPoints)}`,
        `Points parcours : ${formatPoints(breakdown.parcoursPoints)}`,
        `Points tentatives : ${formatPoints(breakdown.tentativesPoints)}`,
        `Gain total : ${formatPoints(breakdown.totalGain)}`,
        `Score enregistré : ${nextValidatedCount}/${balises.length}`,
        `Total recalculé : ${formatPoints(nextSavedPointsTotal)} pts`,
        `Tentatives : ${nextTentativesCount}`,
      ];

      if (breakdown.resolvedTentativePage) {
        lines.splice(1, 0, `Page de tentative utilisée : ${breakdown.resolvedTentativePage}`);
      }

      if (breakdown.resolvedGroupId) {
        lines.splice(2, 0, `Classe source : ${breakdown.resolvedGroupId}`);
      }

      if (breakdown.resolvedProfesseurId) {
        lines.splice(3, 0, `Professeur source : ${breakdown.resolvedProfesseurId}`);
      }

      if (breakdown.supportParcoursId) {
        lines.splice(4, 0, `Parcours support : ${breakdown.supportParcoursId}`);
      }

      if (breakdown.tentativeBaremeMatched) {
        lines.push(
          `Barème tentatives appliqué : ${formatConditionLabel(
            breakdown.tentativeBaremeMatched
          )}`
        );
      } else if (breakdown.willComplete && pointsConfig.modes.tentatives) {
        lines.push(
          `Barème tentatives appliqué : aucun match → fallback ${formatPoints(
            pointsConfig.pointsPerCorrect
          )} pts`
        );
      }

      if (breakdown.willComplete) {
        lines.unshift("Parcours terminé ✅");
      }

      Alert.alert("Tentative enregistrée", lines.join("\n"));
    } catch (err: any) {
      console.error("Erreur enregistrement tentative:", err);
      Alert.alert("Erreur", err?.message || "Impossible d'enregistrer la tentative.");
    } finally {
      setSaving(false);
    }
  }, [balises, validatedSet, codesSaisis, isCompleted, saveTentativeAndStats, pointsConfig]);

  const renderBalise = ({ item }: { item: BaliseAffichee }) => {
    const alreadyValidated = validatedSet.has(item.id);
    const result = alreadyValidated ? true : resultats[item.id];
    const saisie = codesSaisis[item.id] ?? "";
    const displayBalisePoints = pointsConfig.modes.balises
      ? Number.isFinite(Number(item.points))
        ? Number(item.points)
        : pointsConfig.pointsParBalise
      : 0;

    return (
      <View
        style={[
          styles.baliseCard,
          result === true && styles.baliseCardOk,
          result === false && styles.baliseCardKo,
        ]}
      >
        <View style={styles.baliseHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.baliseTitle}>Balise {item.ordre}</Text>
            <Text style={styles.baliseSubtitle}>Entre le code trouvé sur cette balise</Text>
          </View>

          <View style={styles.pointsBadgeMini}>
            <Text style={styles.pointsBadgeMiniText}>
              {formatPoints(displayBalisePoints)} pts
            </Text>
          </View>
        </View>

        {alreadyValidated ? (
          <View style={styles.validatedRow}>
            <Feather name="check-circle" size={18} color={C_GREEN} />
            <Text style={styles.validatedText}>Balise déjà validée — code masqué</Text>
          </View>
        ) : (
          <View style={styles.inputWrap}>
            <Feather name="lock" size={16} color={C_BLUE_DARK} />
            <TextInput
              value={saisie}
              onChangeText={(txt) => handleChangeCode(item.id, txt)}
              placeholder="Entrer le code"
              placeholderTextColor="#8AA0B7"
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.input}
            />
          </View>
        )}

        {alreadyValidated ? (
          <Text style={styles.okText}>Déjà validée ✅</Text>
        ) : result === true ? (
          <Text style={styles.okText}>Code correct ✅</Text>
        ) : result === false ? (
          <Text style={styles.koText}>Code incorrect ❌</Text>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient colors={[C_BG, C_BG_2]} style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setPage("EcrireResultat")}
            style={styles.iconBtn}
          >
            <Feather name="arrow-left" size={18} color="#fff" />
          </TouchableOpacity>

          <Text style={styles.pageTitle} numberOfLines={1}>
            {parcoursNom}
          </Text>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => setScoreModalVisible(true)}
            style={styles.bigScorePill}
          >
            <Text style={styles.bigScoreValue}>{formatPoints(savedPointsTotal)}</Text>
            <Text style={styles.bigScoreLabel}>pts</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.statsRow}>
            <View style={[styles.statBox, { width: statCardWidth }]}>
              <Text style={styles.statValue}>{balises.length}</Text>
              <Text style={styles.statLabel}>Balises</Text>
            </View>

            <View style={[styles.statBox, { width: statCardWidth }]}>
              <Text style={styles.statValue}>
                {savedScore}/{balises.length}
              </Text>
              <Text style={styles.statLabel}>Score</Text>
            </View>

            <View style={[styles.statBox, { width: statCardWidth }]}>
              <Text style={styles.statValue}>{tentativesCount}</Text>
              <Text style={styles.statLabel}>Tentatives</Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="large" color={C_BLUE} />
              <Text style={styles.stateTitle}>Chargement...</Text>
            </View>
          ) : screenError ? (
            <View style={styles.stateCard}>
              <Feather name="alert-circle" size={42} color={C_GOLD} />
              <Text style={styles.stateTitle}>Erreur</Text>
              <Text style={styles.stateText}>{screenError}</Text>
            </View>
          ) : !parcoursActif?.id ? (
            <View style={styles.stateCard}>
              <Feather name="map" size={42} color={C_GOLD} />
              <Text style={styles.stateTitle}>Aucun parcours sélectionné</Text>
              <Text style={styles.stateText}>
                Reviens à la liste des parcours puis choisis-en un.
              </Text>
            </View>
          ) : balises.length === 0 ? (
            <View style={styles.stateCard}>
              <Feather name="map-pin" size={42} color={C_GOLD} />
              <Text style={styles.stateTitle}>Aucune balise trouvée</Text>
              <Text style={styles.stateText}>
                Ce parcours ne contient aucune balise active à afficher.
              </Text>
            </View>
          ) : (
            <FlatList
              data={balises}
              keyExtractor={(item) => item.id}
              renderItem={renderBalise}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            />
          )}
        </ScrollView>

        {!loading && !screenError && !!balises.length && (
          <View style={styles.bottomBar}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[
                styles.verifyAllBtn,
                (saving || isCompleted) && { opacity: 0.7 },
                isCompleted && styles.verifyAllBtnDone,
              ]}
              onPress={handleVerifierTout}
              disabled={saving || isCompleted}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : isCompleted ? (
                <>
                  <Feather name="award" size={18} color="#fff" />
                  <Text style={styles.verifyAllBtnText}>Parcours terminé</Text>
                </>
              ) : (
                <>
                  <Feather name="check-square" size={18} color="#fff" />
                  <Text style={styles.verifyAllBtnText}>Tout vérifier</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <Modal
          visible={scoreModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setScoreModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Détail des points</Text>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => setScoreModalVisible(false)}
                  style={styles.modalCloseBtn}
                >
                  <Feather name="x" size={18} color="#fff" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {scoreDetailsLines.map((line, idx) => (
                  <Text key={idx} style={styles.modalLine}>
                    {line || " "}
                  </Text>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </LinearGradient>
    </SafeAreaView>
  );
};

export default EcrireCodeBaliseEleve;

/* =========================
   Styles
========================= */
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C_BG },
  container: { flex: 1 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 14 : 8,
    paddingBottom: 12,
    backgroundColor: C_BLUE_DARK,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.18)",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  pageTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },

  bigScorePill: {
    minWidth: 82,
    height: 42,
    borderRadius: 16,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FBBF24",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
  },
  bigScoreValue: {
    color: "#78350F",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 17,
  },
  bigScoreLabel: {
    color: "#92400E",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
  },

  statsRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 14,
  },
  statBox: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1F5B86",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  statValue: {
    color: C_BLUE_DARK,
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  statLabel: {
    color: C_MUTED,
    fontSize: 10,
    marginTop: 4,
    fontWeight: "800",
    textAlign: "center",
  },

  baliseCard: {
    backgroundColor: C_CARD,
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 22,
    padding: 16,
    shadowColor: "#1F5B86",
    shadowOpacity: 0.13,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  baliseCardOk: {
    borderColor: "rgba(22,163,74,0.38)",
    backgroundColor: "#F0FDF4",
  },
  baliseCardKo: {
    borderColor: "rgba(220,38,38,0.34)",
    backgroundColor: "#FEF2F2",
  },

  baliseHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  baliseTitle: {
    color: C_TEXT,
    fontSize: 20,
    fontWeight: "900",
  },
  baliseSubtitle: {
    color: C_MUTED,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },

  pointsBadgeMini: {
    minWidth: 58,
    height: 32,
    borderRadius: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  pointsBadgeMiniText: {
    color: "#92400E",
    fontSize: 11,
    fontWeight: "900",
  },

  inputWrap: {
    height: 50,
    borderRadius: 16,
    backgroundColor: "#F8FBFF",
    borderWidth: 1,
    borderColor: "rgba(31,91,134,0.18)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    color: C_TEXT,
    fontSize: 15,
    fontWeight: "800",
  },

  validatedRow: {
    minHeight: 50,
    borderRadius: 16,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "rgba(22,163,74,0.25)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  validatedText: {
    flex: 1,
    color: "#14532D",
    fontSize: 13,
    fontWeight: "800",
  },

  okText: {
    marginTop: 10,
    color: C_GREEN,
    fontWeight: "900",
    fontSize: 13,
  },
  koText: {
    marginTop: 10,
    color: C_RED,
    fontWeight: "900",
    fontSize: 13,
  },

  stateCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1F5B86",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  stateTitle: {
    color: C_TEXT,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 10,
    textAlign: "center",
  },
  stateText: {
    color: C_MUTED,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },

  bottomBar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
  },
  verifyAllBtn: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: C_BLUE,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    shadowColor: "#1F5B86",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  verifyAllBtnDone: {
    backgroundColor: C_GREEN,
  },
  verifyAllBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,37,58,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "85%",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  modalTitle: {
    flex: 1,
    color: C_TEXT,
    fontSize: 18,
    fontWeight: "900",
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C_BLUE_DARK,
  },
  modalLine: {
    color: "#334155",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 2,
  },
});