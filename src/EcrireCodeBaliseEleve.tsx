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
  buildProgressFromAttempts,
  buildTentativesDebugState,
  computeCurrentDisplayedScore,
  computeTentativeGainBreakdown,
  formatPoints,
  getDefaultPointsConfig,
  loadAttemptsHistory,
  loadParcoursTentativeBaremeRows,
  loadResolvedTentativeConfig,
  parseNumeric,
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
   Theme
========================= */
const C_BG = "#07111F";
const C_BG_2 = "#0B1728";
const C_CARD = "#101D32";
const C_TEXT = "#F8FAFC";
const C_MUTED = "#A9B8D0";
const C_BORDER = "rgba(255,255,255,0.08)";
const C_BLUE = "#60A5FA";
const C_GOLD = "#F59E0B";

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

  const loadAttemptsAndConfig = useCallback(
    async (
      resolvedStudentId: string | null,
      resolvedGroupId: string | null,
      resolvedParcoursId?: string,
      orderedBalises: BaliseAffichee[] = []
    ) => {
      const [attempts, resolvedConfig] = await Promise.all([
        loadAttemptsHistory(resolvedStudentId, resolvedParcoursId),
        loadResolvedTentativeConfig(resolvedGroupId, resolvedParcoursId),
      ]);

      const baremes = await loadParcoursTentativeBaremeRows(
        resolvedConfig.resolvedProfesseurId,
        resolvedConfig.resolvedAttemptPage
      );

      const progress = buildProgressFromAttempts(
        attempts,
        orderedBalises.length,
        orderedBalises,
        resolvedConfig.pointsConfig,
        baremes
      );

      setAttemptsHistory(attempts);
      setValidatedBaliseIds(progress.validatedIds);
      setCompletionAttemptNumber(progress.completionAttemptNumber);
      setSavedScore(progress.validatedCount);
      setTentativesCount(progress.tentativesCount);
      setSavedPointsTotal(progress.totalPoints);
      setLastPointsGain(progress.lastPointsGain);

      setPointsConfig(resolvedConfig.pointsConfig);
      setResolvedTentativePage(resolvedConfig.resolvedAttemptPage);
      setResolvedTentativeGroupId(resolvedConfig.resolvedGroupId);
      setResolvedProfesseurId(resolvedConfig.resolvedProfesseurId);
      setSupportParcoursId(resolvedConfig.supportParcoursId);
      setTentativeBaremeRows(baremes);
    },
    []
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setScreenError(null);

    try {
      if (!parcoursActif?.id) {
        setBalises([]);
        setAttemptsHistory([]);
        setValidatedBaliseIds([]);
        setCompletionAttemptNumber(null);
        setSavedScore(0);
        setTentativesCount(0);
        setSavedPointsTotal(0);
        setLastPointsGain(0);
        setPointsConfig(getDefaultPointsConfig());
        setTentativeBaremeRows([]);
        setResolvedTentativePage(null);
        setResolvedTentativeGroupId(null);
        setResolvedProfesseurId(null);
        setSupportParcoursId(null);
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
      setBalises([]);
      setAttemptsHistory([]);
      setValidatedBaliseIds([]);
      setCompletionAttemptNumber(null);
      setSavedScore(0);
      setTentativesCount(0);
      setSavedPointsTotal(0);
      setLastPointsGain(0);
      setPointsConfig(getDefaultPointsConfig());
      setTentativeBaremeRows([]);
      setResolvedTentativePage(null);
      setResolvedTentativeGroupId(null);
      setResolvedProfesseurId(null);
      setSupportParcoursId(null);
    } finally {
      setLoading(false);
    }
  }, [loadAttemptsAndConfig, parcoursActif, resolveStudent]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const liveScore = useMemo(() => {
    return computeCurrentDisplayedScore({
      balises,
      validatedIds: validatedBaliseIds,
      completionAttemptNumber,
      pointsConfig,
      tentativeBaremeRows,
    });
  }, [
    balises,
    validatedBaliseIds,
    completionAttemptNumber,
    pointsConfig,
    tentativeBaremeRows,
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
    pointsConfig.tentativePageMode,
    pointsConfig.pointsPerCorrect,
    pointsConfig.pointsParBalise,
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

      const newAttemptRow: TentativeRow = {
        student_id: studentId,
        parcours_id: parcoursActif.id,
        tentatives_numero: breakdown.tentativeNumero,
        score: result.nextValidatedCount,
        total_balises: balises.length,
        points_earned: breakdown.totalGain,
        details: result.details as AttemptDetail[],
      };

      const nextAttemptsHistory = [...attemptsHistory, newAttemptRow];
      const nextCompletionAttemptNumber =
        breakdown.willComplete && completionAttemptNumber == null
          ? breakdown.tentativeNumero
          : completionAttemptNumber;

      const recomputedScore = computeCurrentDisplayedScore({
        balises,
        validatedIds: nextValidatedIds,
        completionAttemptNumber: nextCompletionAttemptNumber,
        pointsConfig,
        tentativeBaremeRows,
      });

      setAttemptsHistory(nextAttemptsHistory);
      setValidatedBaliseIds(nextValidatedIds);
      setSavedScore(result.nextValidatedCount);
      setTentativesCount(result.nextTentativesCount);
      setSavedPointsTotal(recomputedScore.totalPoints);
      setLastPointsGain(breakdown.totalGain);

      if (breakdown.willComplete && completionAttemptNumber == null) {
        setCompletionAttemptNumber(breakdown.tentativeNumero);
      }

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
        nextSavedPointsTotal: recomputedScore.totalPoints,
        nextValidatedCount: result.nextValidatedCount,
        nextTentativesCount: result.nextTentativesCount,
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
      attemptsHistory,
      completionAttemptNumber,
      tentativeBaremeRows,
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
        `Total enregistré : ${formatPoints(nextSavedPointsTotal)} pts`,
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
    const displayBalisePoints = Number.isFinite(Number(item.points))
      ? Number(item.points)
      : pointsConfig.pointsParBalise;

    return (
      <View
        style={[
          styles.baliseCard,
          result === true && styles.baliseCardOk,
          result === false && styles.baliseCardKo,
        ]}
      >
        <View style={styles.baliseHeader}>
          <View style={styles.badgeNumero}>
            <Text style={styles.badgeNumeroText}>#{item.numero_balise ?? item.ordre}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.baliseTitle}>Balise {item.numero_balise ?? item.ordre}</Text>
          </View>

          <View style={styles.pointsBadgeMini}>
            <Text style={styles.pointsBadgeMiniText}>
              {formatPoints(displayBalisePoints)} pts
            </Text>
          </View>
        </View>

        {alreadyValidated ? (
          <View style={styles.validatedRow}>
            <Feather name="check-circle" size={18} color="#86EFAC" />
            <Text style={styles.validatedText}>Balise déjà validée — code masqué</Text>
          </View>
        ) : (
          <View style={styles.inputWrap}>
            <Feather name="lock" size={16} color={C_MUTED} />
            <TextInput
              value={saisie}
              onChangeText={(txt) => handleChangeCode(item.id, txt)}
              placeholder="Entrer le code"
              placeholderTextColor="#7C8DA8"
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

          {!loading && !screenError && (
            <View style={styles.infoCard}>
              <View style={styles.infoHeader}>
                <Feather name="shield" size={16} color="#93C5FD" />
                <Text style={styles.infoTitle}>Progression enregistrée</Text>
              </View>

              <Text style={styles.infoLine}>
                Balises validées :{" "}
                <Text style={styles.infoStrong}>
                  {validatedBaliseIds.length}/{balises.length}
                </Text>
              </Text>
              <Text style={styles.infoLine}>
                Dernier gain :{" "}
                <Text style={styles.infoStrong}>{formatPoints(lastPointsGain)} pts</Text>
              </Text>
              <Text style={styles.infoLine}>
                Total : <Text style={styles.infoStrong}>{formatPoints(savedPointsTotal)} pts</Text>
              </Text>
              <Text style={styles.infoLine}>
                Page tentatives :{" "}
                <Text style={styles.infoStrong}>
                  {resolvedTentativePage ? `Page ${resolvedTentativePage}` : "aucune"}
                </Text>
              </Text>
              <Text style={styles.infoLine}>
                Classe source :{" "}
                <Text style={styles.infoStrong}>
                  {resolvedTentativeGroupId ?? "aucune"}
                </Text>
              </Text>
              <Text style={styles.infoLine}>
                Professeur source :{" "}
                <Text style={styles.infoStrong}>
                  {resolvedProfesseurId ?? "aucun"}
                </Text>
              </Text>
              <Text style={styles.infoLine}>
                Parcours support :{" "}
                <Text style={styles.infoStrong}>
                  {supportParcoursId ?? "aucun"}
                </Text>
              </Text>
              <Text style={styles.infoLine}>
                Barème chargé :{" "}
                <Text style={styles.infoStrong}>{tentativeBaremeRows.length} ligne(s)</Text>
              </Text>
              <Text style={styles.infoLine}>
                Parcours terminé :{" "}
                <Text style={styles.infoStrong}>{isCompleted ? "oui" : "non"}</Text>
              </Text>

              {completionAttemptNumber != null ? (
                <Text style={styles.infoLine}>
                  Tentative de fin :{" "}
                  <Text style={styles.infoStrong}>n°{completionAttemptNumber}</Text>
                </Text>
              ) : null}
            </View>
          )}

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
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(4,12,24,0.72)",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  pageTitle: {
    flex: 1,
    color: C_TEXT,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },

  bigScorePill: {
    minWidth: 82,
    height: 40,
    borderRadius: 14,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,158,11,0.16)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.30)",
  },
  bigScoreValue: {
    color: "#FDE68A",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 17,
  },
  bigScoreLabel: {
    color: "#FCD34D",
    fontSize: 10,
    fontWeight: "800",
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
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: {
    color: C_TEXT,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
  },
  statLabel: {
    color: C_MUTED,
    fontSize: 10,
    marginTop: 4,
    fontWeight: "700",
    textAlign: "center",
  },

  infoCard: {
    backgroundColor: "rgba(96,165,250,0.08)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.20)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  infoTitle: {
    color: "#DBEAFE",
    fontSize: 14,
    fontWeight: "900",
  },
  infoLine: {
    color: "#BFDBFE",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  infoStrong: {
    color: "#FFFFFF",
    fontWeight: "900",
  },

  baliseCard: {
    backgroundColor: C_CARD,
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 18,
    padding: 14,
  },
  baliseCardOk: {
    borderColor: "rgba(34,197,94,0.45)",
    backgroundColor: "rgba(34,197,94,0.08)",
  },
  baliseCardKo: {
    borderColor: "rgba(239,68,68,0.45)",
    backgroundColor: "rgba(239,68,68,0.08)",
  },

  baliseHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  badgeNumero: {
    minWidth: 54,
    height: 34,
    borderRadius: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(96,165,250,0.16)",
    borderWidth: 1,
    borderColor: "rgba(96,165,250,0.30)",
  },
  badgeNumeroText: {
    color: "#DBEAFE",
    fontWeight: "900",
    fontSize: 12,
  },
  baliseTitle: {
    color: C_TEXT,
    fontSize: 15,
    fontWeight: "900",
  },

  pointsBadgeMini: {
    minWidth: 54,
    height: 28,
    borderRadius: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,158,11,0.14)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.24)",
  },
  pointsBadgeMiniText: {
    color: "#FDE68A",
    fontSize: 11,
    fontWeight: "900",
  },

  inputWrap: {
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: C_BORDER,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    color: C_TEXT,
    fontSize: 14,
    fontWeight: "800",
  },

  validatedRow: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "rgba(34,197,94,0.08)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.24)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
  },
  validatedText: {
    flex: 1,
    color: "#DCFCE7",
    fontSize: 13,
    fontWeight: "800",
  },

  okText: {
    marginTop: 10,
    color: "#86EFAC",
    fontWeight: "900",
    fontSize: 13,
  },
  koText: {
    marginTop: 10,
    color: "#FCA5A5",
    fontWeight: "900",
    fontSize: 13,
  },

  stateCard: {
    backgroundColor: C_CARD,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
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
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
  },
  verifyAllBtnDone: {
    backgroundColor: "#16A34A",
  },
  verifyAllBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2,8,18,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "85%",
    backgroundColor: C_CARD,
    borderRadius: 20,
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
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  modalLine: {
    color: "#E2E8F0",
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 2,
  },
});