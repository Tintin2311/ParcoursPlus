// src/EcrireCodeBaliseEleve.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ImageBackground,
  Keyboard,
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
  instanceKey: string;
  originalBaliseId: string;
  tokenSource: string;
};

type Props = {
  setPage: SetPageFn;
  eleveConnecte?: EleveConnecte | null;
  parcoursActif?: ParcoursActif | null;
  handleDeconnexion?: () => Promise<void> | void;
};

const BG_GAME =
  "https://aswhubzprehjnunbpkwc.supabase.co/storage/v1/object/public/background/AccueilElevePaysage.png";

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
const C_RED_FLASH = "#FF1F1F";

const formatPointUnit = (value: number | string | null | undefined) => {
  const n = Number(value ?? 0);
  return Math.abs(n) <= 1 ? "pt" : "pts";
};

const formatPointsLabel = (value: number | string | null | undefined) => {
  return `${formatPoints(value as any)} ${formatPointUnit(value)}`;
};

const getDisplayName = (row: any) => String(row?.nom ?? row?.name ?? "Parcours");

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
  const occurrenceCounter = new Map<string, number>();

  tokens.forEach((token, index) => {
    const t = String(token).trim();
    if (!t) return;

    let balise: BaliseRow | undefined;

    if (isUuidLike(t)) balise = byId.get(t);
    if (!balise && isIntegerLike(t)) balise = byNumero.get(String(Number(t)));
    if (!balise) balise = byCode.get(sanitize(t));

    if (!balise) return;
    if (balise.frozen === true) return;

    const originalBaliseId = String(balise.id);
    const occurrenceNumber = (occurrenceCounter.get(originalBaliseId) ?? 0) + 1;
    occurrenceCounter.set(originalBaliseId, occurrenceNumber);

    const instanceKey = `${originalBaliseId}__occ_${occurrenceNumber}__pos_${index}`;

    results.push({
      ...balise,
      id: instanceKey,
      originalBaliseId,
      instanceKey,
      tokenSource: t,
      ordre: results.length + 1,
    });
  });

  return results;
};

const normalizeValidatedIdsForOccurrences = (
  rawValidatedIds: string[],
  orderedBalises: BaliseAffichee[]
): string[] => {
  if (!rawValidatedIds.length || !orderedBalises.length) return rawValidatedIds;

  const orderedKeys = new Set(orderedBalises.map((b) => b.instanceKey));
  const hasModernKeys = rawValidatedIds.some((id) => orderedKeys.has(id));

  if (hasModernKeys) {
    return rawValidatedIds.filter((id) => orderedKeys.has(id));
  }

  const usedKeys = new Set<string>();
  const normalized: string[] = [];

  rawValidatedIds.forEach((oldId) => {
    const match = orderedBalises.find(
      (b) => b.originalBaliseId === oldId && !usedKeys.has(b.instanceKey)
    );

    if (match) {
      usedKeys.add(match.instanceKey);
      normalized.push(match.instanceKey);
    }
  });

  return normalized;
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

  return {
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

const EcrireCodeBaliseEleve: React.FC<Props> = ({
  setPage,
  eleveConnecte,
  parcoursActif,
  handleDeconnexion,
}) => {
  const { width, height } = useWindowDimensions();

  const scrollRef = useRef<ScrollView | null>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const rowYRefs = useRef<Record<string, number>>({});
  const rowHeightRefs = useRef<Record<string, number>>({});
  const scrollYRef = useRef(0);
  const scrollViewHeightRef = useRef(0);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoFocusLockRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  const [confirmLogoutVisible, setConfirmLogoutVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [studentId, setStudentId] = useState<string | null>(eleveConnecte?.id ?? null);
  const [studentGroupId, setStudentGroupId] = useState<string | null>(
    eleveConnecte?.group_id ?? null
  );

  const [balises, setBalises] = useState<BaliseAffichee[]>([]);
  const [activeBaliseKey, setActiveBaliseKey] = useState<string | null>(null);
  const [attemptsHistory, setAttemptsHistory] = useState<TentativeRow[]>([]);
  const [validatedBaliseIds, setValidatedBaliseIds] = useState<string[]>([]);
  const [completionAttemptNumber, setCompletionAttemptNumber] = useState<number | null>(null);

  const [codesSaisis, setCodesSaisis] = useState<Record<string, string>>({});
  const [resultats, setResultats] = useState<Record<string, boolean | null>>({});
  const [inputSelections, setInputSelections] = useState<
    Record<string, { start: number; end: number }>
  >({});

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

  const isCompact = width < 430;
  const boxSize = isCompact ? 36 : 42;
  const boxGap = isCompact ? 5 : 7;

  const bottomScrollSpace = Math.max(360, Math.floor(height * 0.42));

  const statCardWidth = useMemo(() => {
    const gap = 8;
    const scoreWidth = width < 430 ? 86 : 96;
    const horizontalPadding = 24;
    const total = width - horizontalPadding - scoreWidth - gap * 2;
    return Math.max(92, Math.floor(total / 2));
  }, [width]);

  const setInputRef = useCallback((baliseKey: string, ref: TextInput | null) => {
    inputRefs.current[baliseKey] = ref;
  }, []);

  const getExpectedLength = useCallback((balise: BaliseAffichee) => {
    return Math.max(1, sanitize(balise.code ?? "").length);
  }, []);

  const setSelectionForBalise = useCallback(
    (baliseKey: string, value: string, expectedLength: number, forceAll = false) => {
      const cleanLength = sanitize(value).length;
      const shouldSelectAll = forceAll || cleanLength >= expectedLength;
      const nextSelection = shouldSelectAll
        ? { start: 0, end: Math.max(cleanLength, expectedLength) }
        : { start: cleanLength, end: cleanLength };

      setInputSelections((prev) => ({ ...prev, [baliseKey]: nextSelection }));
    },
    []
  );

  const scrollBaliseIntoComfortZone = useCallback(
    (baliseKey: string, animated = true) => {
      const rowY = rowYRefs.current[baliseKey];
      if (typeof rowY !== "number") return;

      const rowHeight = rowHeightRefs.current[baliseKey] ?? 86;
      const viewportHeight = scrollViewHeightRef.current || height;
      const currentY = scrollYRef.current || 0;

      const topComfort = 12;
      const bottomComfort = Platform.OS === "web" ? 128 : 190;

      const visibleTop = currentY + topComfort;
      const visibleBottom = currentY + viewportHeight - bottomComfort;
      const rowBottom = rowY + rowHeight;

      let targetY: number | null = null;

      if (rowY < visibleTop) {
        targetY = Math.max(0, rowY - topComfort);
      } else if (rowBottom > visibleBottom) {
        targetY = Math.max(0, rowBottom - viewportHeight + bottomComfort);
      }

      if (targetY == null) return;

      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: targetY, animated });
      });
    },
    [height]
  );

  const focusBalise = useCallback(
    (balise: BaliseAffichee, forceSelectAll = false, shouldScroll = false) => {
      const key = balise.instanceKey;
      const expectedLength = getExpectedLength(balise);
      const currentValue = codesSaisis[key] ?? "";

      setActiveBaliseKey(key);
      setSelectionForBalise(key, currentValue, expectedLength, forceSelectAll);

      if (shouldScroll) {
        scrollBaliseIntoComfortZone(key, true);
      }

      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => {
        inputRefs.current[key]?.focus?.();
      }, Platform.OS === "web" ? 20 : 70);
    },
    [codesSaisis, getExpectedLength, scrollBaliseIntoComfortZone, setSelectionForBalise]
  );

  const focusNextBalise = useCallback(
    (currentIndex: number) => {
      for (let i = currentIndex + 1; i < balises.length; i += 1) {
        const nextBalise = balises[i];
        if (nextBalise && !validatedSet.has(nextBalise.instanceKey)) {
          focusBalise(nextBalise, false, true);
          return;
        }
      }

      Keyboard.dismiss();
    },
    [balises, focusBalise, validatedSet]
  );

  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    };
  }, []);

  const handleLogout = useCallback(async () => {
    if (loggingOut) return;

    try {
      setLoggingOut(true);

      if (handleDeconnexion) {
        await handleDeconnexion();
      } else {
        await supabase.auth.signOut().catch(() => null);

        await AsyncStorage.multiRemove([
          "LS_LAST_PAGE_ELEVE",
          "LS_ELEVE_CACHE",
          "LS_LAST_MODE",
          "lastPageEleve",
          "eleveCache",
          "lastMode",
        ]).catch(() => null);

        setPage("ParcoursPlus");
      }

      Keyboard.dismiss();
      setConfirmLogoutVisible(false);
    } finally {
      setLoggingOut(false);
    }
  }, [handleDeconnexion, loggingOut, setPage]);

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

    return { studentId: nextStudentId, groupId: nextGroupId };
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

      const progressRaw = await recomputeAndSyncStats({
        studentId: resolvedStudentId,
        parcoursId: resolvedParcoursId,
        balises: orderedBalises,
        pointsConfig: fixedPointsConfig,
        tentativeBaremeRows: baremes,
      });

      const normalizedValidatedIds = normalizeValidatedIdsForOccurrences(
        progressRaw.validatedIds,
        orderedBalises
      );

      const progress = {
        ...progressRaw,
        validatedIds: normalizedValidatedIds,
        validatedCount: normalizedValidatedIds.length,
        parcoursTermine:
          orderedBalises.length > 0 && normalizedValidatedIds.length >= orderedBalises.length,
      };

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
        correctedTotal !== progressRaw.totalPoints
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

      setAttemptsHistory(attempts);
      setValidatedBaliseIds(progress.validatedIds);
      setCompletionAttemptNumber(progress.completionAttemptNumber);
      setSavedScore(progress.validatedCount);
      setTentativesCount(progressRaw.tentativesCount);
      setSavedPointsTotal(correctedTotal);
      setLastPointsGain(progressRaw.lastPointsGain);
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
    setActiveBaliseKey(null);
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
    setCodesSaisis({});
    setResultats({});
    setInputSelections({});
    inputRefs.current = {};
    rowYRefs.current = {};
    rowHeightRefs.current = {};
    autoFocusLockRef.current = null;
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
      const tokens = extractTokens(rawBalisesOrdre);

      let orderedBalises: BaliseAffichee[] = [];

      if (tokens.length) {
        const uuidTokens = Array.from(new Set(tokens.filter(isUuidLike)));
        const numeroTokens = Array.from(
          new Set(tokens.filter(isIntegerLike).map((t) => Number(t)))
        );
        const codeTokensRaw = Array.from(
          new Set(tokens.filter((t) => !isUuidLike(t) && !isIntegerLike(t)))
        );

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
      setActiveBaliseKey(orderedBalises[0]?.instanceKey ?? null);

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

  const handleCodeChange = useCallback(
    (balise: BaliseAffichee, baliseIndex: number, text: string) => {
      const key = balise.instanceKey;
      if (validatedSet.has(key)) return;

      const expectedLength = getExpectedLength(balise);
      const nextValue = sanitize(text).slice(0, expectedLength);
      const nextCursor = nextValue.length;

      setActiveBaliseKey(key);
      setCodesSaisis((prev) => ({ ...prev, [key]: nextValue }));
      setResultats((prev) => ({ ...prev, [key]: null }));
      setInputSelections((prev) => ({
        ...prev,
        [key]: { start: nextCursor, end: nextCursor },
      }));

      if (nextValue.length < expectedLength) {
        autoFocusLockRef.current = null;
        return;
      }

      if (autoFocusLockRef.current === key) return;

      autoFocusLockRef.current = key;
      setTimeout(() => {
        focusNextBalise(baliseIndex);
      }, 90);
    },
    [focusNextBalise, getExpectedLength, validatedSet]
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

      const nextProgressRaw = await recomputeAndSyncStats({
        studentId,
        parcoursId: parcoursActif.id,
        balises,
        pointsConfig,
        tentativeBaremeRows,
      });

      const normalizedNextProgressIds = normalizeValidatedIdsForOccurrences(
        nextProgressRaw.validatedIds.length ? nextProgressRaw.validatedIds : nextValidatedIds,
        balises
      );

      const nextProgress = {
        ...nextProgressRaw,
        validatedIds: normalizedNextProgressIds.length
          ? normalizedNextProgressIds
          : nextValidatedIds,
        validatedCount: normalizedNextProgressIds.length
          ? normalizedNextProgressIds.length
          : nextValidatedIds.length,
        parcoursTermine:
          balises.length > 0 &&
          (normalizedNextProgressIds.length
            ? normalizedNextProgressIds.length
            : nextValidatedIds.length) >= balises.length,
      };

      const dbTermine = await loadStatParcoursTermine(studentId, parcoursActif.id);
      const effectiveTermine =
        dbTermine ||
        nextProgress.parcoursTermine ||
        (balises.length > 0 && nextProgress.validatedIds.length >= balises.length);

      const recomputedScore = computeCurrentDisplayedScore({
        balises,
        validatedIds: nextProgress.validatedIds,
        completionAttemptNumber:
          nextProgress.completionAttemptNumber ?? nextCompletionAttemptNumber,
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

      setAttemptsHistory((prev) => [
        ...prev,
        {
          student_id: studentId,
          parcours_id: parcoursActif.id,
          tentatives_numero: breakdown.tentativeNumero,
          score: nextProgress.validatedCount,
          total_balises: balises.length,
          points_earned: breakdown.totalGain,
          details: result.details as AttemptDetail[],
        },
      ]);

      setValidatedBaliseIds(nextProgress.validatedIds);
      setSavedScore(nextProgress.validatedCount);
      setTentativesCount(nextProgress.tentativesCount || result.nextTentativesCount);
      setSavedPointsTotal(correctedTotal);
      setLastPointsGain(breakdown.totalGain);
      setCompletionAttemptNumber(
        nextProgress.completionAttemptNumber ?? nextCompletionAttemptNumber
      );
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
        nextProgress.validatedIds.forEach((id) => {
          next[id] = true;
        });
        return next;
      });

      return {
        breakdown,
        nextSavedPointsTotal: correctedTotal,
        nextValidatedCount: nextProgress.validatedCount,
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
    ]
  );

  const handleVerifierTout = useCallback(async () => {
    try {
      if (!balises.length) return;

      if (isCompleted) {
        Alert.alert("Parcours terminé", "Ce parcours est déjà entièrement validé.");
        return;
      }

      const hasAnyInput = balises.some((balise) => {
        const key = balise.instanceKey;
        return !validatedSet.has(key) && !!sanitize(codesSaisis[key]);
      });

      if (!hasAnyInput) {
        Alert.alert("Aucune saisie", "Entre au moins un code avant de vérifier.");
        return;
      }

      Keyboard.dismiss();
      setSaving(true);

      const nextResults: Record<string, boolean | null> = {};

      balises.forEach((balise) => {
        const key = balise.instanceKey;

        if (validatedSet.has(key)) {
          nextResults[key] = true;
          return;
        }

        const saisi = sanitize(codesSaisis[key]);
        const attendu = sanitize(balise.code ?? "");

        nextResults[key] = !!saisi && saisi === attendu;
      });

      setResultats(nextResults);

      const { breakdown, nextSavedPointsTotal, nextValidatedCount, nextTentativesCount } =
        await saveTentativeAndStats(nextResults);

      const lines = [
        `Balises nouvellement validées : ${breakdown.newlyValidatedCount}`,
        `Gain total : ${formatPointsLabel(breakdown.totalGain)}`,
        `Score enregistré : ${nextValidatedCount}/${balises.length}`,
        `Total : ${formatPointsLabel(nextSavedPointsTotal)}`,
        `Tentatives : ${nextTentativesCount}`,
      ];

      if (breakdown.willComplete) lines.unshift("Parcours terminé ✅");

      Alert.alert("Tentative enregistrée", lines.join("\n"));
    } catch (err: any) {
      console.error("Erreur enregistrement tentative:", err);
      Alert.alert("Erreur", err?.message || "Impossible d'enregistrer la tentative.");
    } finally {
      setSaving(false);
    }
  }, [balises, validatedSet, codesSaisis, isCompleted, saveTentativeAndStats]);

  const renderCodeBoxes = useCallback(
    (item: BaliseAffichee, baliseIndex: number) => {
      const key = item.instanceKey;
      const expectedLength = getExpectedLength(item);
      const typedValue = codesSaisis[key] ?? "";
      const paddedValue = typedValue.padEnd(expectedLength, " ");
      const result = resultats[key];
      const alreadyValidated = validatedSet.has(key);
      const isActive = activeBaliseKey === key;
      const selection = inputSelections[key];

      return (
        <Pressable
          onPress={() => {
            if (!alreadyValidated) focusBalise(item, true, false);
          }}
          style={[styles.codeBoxesWrap, { gap: boxGap }]}
        >
          <TextInput
            ref={(ref) => setInputRef(key, ref)}
            value={alreadyValidated ? "" : typedValue}
            editable={!alreadyValidated}
            maxLength={expectedLength}
            selection={selection}
            selectTextOnFocus={typedValue.length >= expectedLength}
            onFocus={() => {
              setActiveBaliseKey(key);
              setSelectionForBalise(
                key,
                typedValue,
                expectedLength,
                typedValue.length >= expectedLength
              );
            }}
            onChangeText={(text) => handleCodeChange(item, baliseIndex, text)}
            onSubmitEditing={() => focusNextBalise(baliseIndex)}
            blurOnSubmit={false}
            autoCapitalize="characters"
            autoCorrect={false}
            keyboardType="default"
            returnKeyType="next"
            style={styles.hiddenInput}
          />

          {Array.from({ length: expectedLength }).map((_, charIndex) => {
            const char = paddedValue[charIndex]?.trim() || "";

            return (
              <View
                key={`${key}__box_${charIndex}`}
                style={[
                  styles.codeBoxFake,
                  {
                    width: boxSize,
                    height: boxSize,
                    borderRadius: Math.max(9, Math.floor(boxSize / 4)),
                  },
                  isActive && styles.codeBoxActive,
                  result === true && styles.codeBoxOk,
                  result === false && styles.codeBoxKo,
                  alreadyValidated && styles.codeBoxValidated,
                ]}
              >
                <Text
                  style={[
                    styles.codeBoxFakeText,
                    { fontSize: isCompact ? 16 : 18 },
                    result === true && styles.codeBoxTextOk,
                    result === false && styles.codeBoxTextKo,
                    alreadyValidated && styles.codeBoxTextOk,
                  ]}
                >
                  {alreadyValidated ? "✓" : char}
                </Text>
              </View>
            );
          })}
        </Pressable>
      );
    },
    [
      activeBaliseKey,
      boxGap,
      boxSize,
      codesSaisis,
      focusBalise,
      focusNextBalise,
      getExpectedLength,
      handleCodeChange,
      inputSelections,
      isCompact,
      resultats,
      setInputRef,
      setSelectionForBalise,
      validatedSet,
    ]
  );

  const renderBalise = useCallback(
    ({ item, index }: { item: BaliseAffichee; index: number }) => {
      const key = item.instanceKey;
      const alreadyValidated = validatedSet.has(key);
      const result = alreadyValidated ? true : resultats[key];
      const isActive = activeBaliseKey === key;

      const displayBalisePoints = pointsConfig.modes.balises
        ? Number.isFinite(Number(item.points))
          ? Number(item.points)
          : pointsConfig.pointsParBalise
        : 0;

      return (
        <View
          onLayout={(event) => {
            rowYRefs.current[key] = event.nativeEvent.layout.y;
            rowHeightRefs.current[key] = event.nativeEvent.layout.height;
          }}
          style={[
            styles.baliseLine,
            isActive && styles.baliseLineActive,
            result === true && styles.baliseLineOk,
            result === false && styles.baliseLineKo,
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.95}
            onPress={() => {
              if (!alreadyValidated) focusBalise(item, true, false);
            }}
            style={styles.baliseLineTouchable}
          >
            <LinearGradient
              colors={isActive ? ["#0F5E8C", "#38BDF8"] : ["#E0F2FE", "#FFFFFF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.baliseNumberBlock, isActive && styles.baliseNumberBlockActive]}
            >
              <Text style={[styles.baliseNumberLabel, isActive && styles.baliseNumberLabelActive]}>
                BALISE
              </Text>
              <Text style={[styles.baliseNumber, isActive && styles.baliseNumberActive]}>
                {item.ordre}
              </Text>
              {pointsConfig.modes.balises && (
                <Text style={[styles.pointsLeftText, isActive && styles.pointsLeftTextActive]}>
                  {formatPointsLabel(displayBalisePoints)}
                </Text>
              )}
            </LinearGradient>

            <View style={styles.baliseInputZone}>
              {renderCodeBoxes(item, index)}

              {(alreadyValidated || result === false) && (
                <View style={styles.baliseMetaRow}>
                  {alreadyValidated ? (
                    <Text style={styles.okText}>Validée ✅</Text>
                  ) : result === false ? (
                    <Text style={styles.koText}>Incorrect ❌</Text>
                  ) : (
                    <View style={{ flex: 1 }} />
                  )}
                </View>
              )}
            </View>
          </TouchableOpacity>
        </View>
      );
    },
    [activeBaliseKey, focusBalise, pointsConfig, renderCodeBoxes, resultats, validatedSet]
  );

  return (
    <SafeAreaView style={styles.safe}>
      <ImageBackground source={{ uri: BG_GAME }} style={styles.bg} resizeMode="cover">
        <LinearGradient
          colors={[
            "rgba(5,18,30,0.58)",
            "rgba(9,34,54,0.42)",
            "rgba(234,246,255,0.86)",
            "rgba(234,246,255,0.96)",
          ]}
          locations={[0, 0.25, 0.6, 1]}
          style={styles.container}
        >
          <View>
            <View style={styles.topBar}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setPage("EcrireResultat")}
                style={styles.iconBtn}
              >
                <Feather name="arrow-left" size={18} color="#fff" />
              </TouchableOpacity>

              <Text
                style={styles.pageTitle}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {parcoursNom}
              </Text>

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setConfirmLogoutVisible(true)}
                style={styles.logoutBtn}
              >
                <Feather name="log-out" size={19} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.stickyStatsBar}>
              <View style={[styles.statBox, { width: statCardWidth }]}>
                <Text style={styles.statValue}>
                  {savedScore}/{balises.length}
                </Text>
                <Text style={styles.statLabel}>Balises trouvées</Text>
              </View>

              <View style={[styles.statBox, { width: statCardWidth }]}>
                <Text style={styles.statValue}>{tentativesCount}</Text>
                <Text style={styles.statLabel}>Tentatives</Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setScoreModalVisible(true)}
                style={styles.bigScorePillTop2}
              >
                <Text style={styles.bigScoreValue}>{formatPoints(savedPointsTotal)}</Text>
                <Text style={styles.bigScoreLabel}>{formatPointUnit(savedPointsTotal)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ padding: 12, paddingBottom: bottomScrollSpace }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
            nestedScrollEnabled
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            directionalLockEnabled={false}
            canCancelContentTouches={true}
            onLayout={(event) => {
              scrollViewHeightRef.current = event.nativeEvent.layout.height;
            }}
            onScroll={(event) => {
              scrollYRef.current = event.nativeEvent.contentOffset.y;
            }}
          >
            {loading ? (
              <View style={styles.stateCard}>
                <ActivityIndicator size="large" color={C_GOLD} />
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
                keyExtractor={(item) => item.instanceKey}
                renderItem={renderBalise}
                scrollEnabled={false}
                keyboardShouldPersistTaps="always"
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

          <Modal transparent visible={confirmLogoutVisible} animationType="fade">
            <View style={styles.modalBg}>
              <View style={styles.logoutModalBox}>
                <Text style={styles.logoutModalTitle}>Déconnexion</Text>
                <Text style={styles.logoutModalText}>
                  Souhaites-tu vraiment te déconnecter ?
                </Text>

                <View style={styles.modalActions}>
                  <Pressable
                    style={styles.cancelBtn}
                    onPress={() => setConfirmLogoutVisible(false)}
                  >
                    <Text style={styles.cancelText}>Annuler</Text>
                  </Pressable>

                  <Pressable style={styles.confirmLogoutBtn} onPress={handleLogout}>
                    {loggingOut ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.confirmText}>Déconnexion</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>

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
                  <View style={styles.scoreHeroCard}>
                    <Text style={styles.scoreHeroLabel}>Total actuel</Text>
                    <Text style={styles.scoreHeroValue}>{formatPointsLabel(savedPointsTotal)}</Text>
                  </View>

                  <View style={styles.scoreTable}>
                    <View style={styles.scoreTableHeader}>
                      <Text style={[styles.scoreTh, { flex: 1.5 }]}>Source</Text>
                      <Text style={[styles.scoreTh, { flex: 1 }]}>Points</Text>
                      <Text style={[styles.scoreTh, { flex: 1 }]}>État</Text>
                    </View>

                    <View style={styles.scoreTrBlue}>
                      <Text style={[styles.scoreTdName, { flex: 1.5 }]}>Balises</Text>
                      <Text style={[styles.scoreTdValue, { flex: 1 }]}>
                        {formatPointsLabel(liveScore.balisesPoints)}
                      </Text>
                      <Text style={[styles.scoreTdStatus, { flex: 1 }]}>
                        {validatedBaliseIds.length}/{balises.length}
                      </Text>
                    </View>

                    <View style={styles.scoreTrGreen}>
                      <Text style={[styles.scoreTdName, { flex: 1.5 }]}>Parcours terminé</Text>
                      <Text style={[styles.scoreTdValue, { flex: 1 }]}>
                        {formatPointsLabel(liveScore.parcoursPoints)}
                      </Text>
                      <Text style={[styles.scoreTdStatus, { flex: 1 }]}>
                        {isCompletedEffective ? "Terminé" : "En cours"}
                      </Text>
                    </View>

                    <View style={styles.scoreTrGold}>
                      <Text style={[styles.scoreTdName, { flex: 1.5 }]}>Tentatives</Text>
                      <Text style={[styles.scoreTdValue, { flex: 1 }]}>
                        {formatPointsLabel(liveScore.tentativesPoints)}
                      </Text>
                      <Text style={[styles.scoreTdStatus, { flex: 1 }]}>{tentativesCount}</Text>
                    </View>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>
        </LinearGradient>
      </ImageBackground>
    </SafeAreaView>
  );
};

export default EcrireCodeBaliseEleve;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#061827" },
  bg: { flex: 1 },
  container: { flex: 1 },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 14 : 8,
    paddingBottom: 12,
    backgroundColor: "rgba(8,30,48,0.76)",
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
    borderColor: "rgba(255,255,255,0.28)",
  },
  logoutBtn: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C_RED_FLASH,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.45)",
    shadowColor: C_RED_FLASH,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  pageTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 18,
    lineHeight: 21,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: 0.2,
  },

  stickyStatsBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(8,30,48,0.58)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.14)",
    zIndex: 20,
  },
  statBox: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.48)",
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.16,
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
  bigScorePillTop2: {
    width: 86,
    height: 50,
    borderRadius: 18,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FBBF24",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.55)",
    shadowColor: "#F59E0B",
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  bigScoreValue: {
    color: "#78350F",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 17,
  },
  bigScoreLabel: {
    color: "#92400E",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
  },

  baliseLine: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.58)",
    borderRadius: 22,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    overflow: "hidden",
  },
  baliseLineActive: {
    borderColor: "rgba(56,189,248,0.95)",
    shadowColor: "#38BDF8",
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  baliseLineOk: {
    borderColor: "rgba(34,197,94,0.72)",
    backgroundColor: "rgba(236,253,245,0.96)",
  },
  baliseLineKo: {
    borderColor: "rgba(239,68,68,0.72)",
    backgroundColor: "rgba(254,242,242,0.96)",
  },
  baliseLineTouchable: {
    minHeight: 76,
    paddingVertical: 9,
    paddingLeft: 10,
    paddingRight: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  baliseNumberBlock: {
    width: 76,
    minHeight: 68,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(31,117,184,0.18)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    overflow: "hidden",
  },
  baliseNumberBlockActive: {
    borderColor: "#38BDF8",
  },
  baliseNumberLabel: {
    color: C_MUTED,
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
    letterSpacing: 0.5,
  },
  baliseNumberLabelActive: {
    color: "rgba(255,255,255,0.88)",
  },
  baliseNumber: {
    color: C_BLUE_DARK,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 26,
  },
  baliseNumberActive: {
    color: "#FFFFFF",
  },
  pointsLeftText: {
    marginTop: 2,
    color: "#92400E",
    fontSize: 10,
    fontWeight: "900",
    lineHeight: 12,
  },
  pointsLeftTextActive: {
    color: "#FFE8B0",
  },

  baliseInputZone: {
    flex: 1,
    minWidth: 0,
    minHeight: 68,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  codeBoxesWrap: {
    position: "relative",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  hiddenInput: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    opacity: 0.01,
    color: "transparent",
    backgroundColor: "transparent",
    padding: 0,
    margin: 0,
    borderWidth: 0,
    zIndex: -1,
  },
  codeBoxFake: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderWidth: 2,
    borderColor: "rgba(31,91,134,0.28)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  codeBoxFakeText: {
    color: C_TEXT,
    textAlign: "center",
    fontWeight: "900",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  codeBoxActive: {
    borderColor: "#38BDF8",
    backgroundColor: "#E0F2FE",
  },
  codeBoxOk: {
    borderColor: "rgba(22,163,74,0.70)",
    backgroundColor: "#DCFCE7",
  },
  codeBoxKo: {
    borderColor: "rgba(220,38,38,0.70)",
    backgroundColor: "#FEE2E2",
  },
  codeBoxValidated: {
    borderColor: "rgba(22,163,74,0.70)",
    backgroundColor: "#DCFCE7",
  },
  codeBoxTextOk: {
    color: "#14532D",
  },
  codeBoxTextKo: {
    color: "#7F1D1D",
  },

  baliseMetaRow: {
    marginTop: 5,
    minHeight: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  okText: {
    flex: 1,
    color: C_GREEN,
    fontWeight: "900",
    fontSize: 12,
  },
  koText: {
    flex: 1,
    color: C_RED,
    fontWeight: "900",
    fontSize: 12,
  },

  stateCard: {
    backgroundColor: "rgba(255,255,255,0.94)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.58)",
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
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
    fontWeight: "700",
  },

  bottomBar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 14,
    zIndex: 30,
  },
  verifyAllBtn: {
    minHeight: 56,
    borderRadius: 20,
    backgroundColor: "#1F75B8",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  verifyAllBtnDone: {
    backgroundColor: C_GREEN,
  },
  verifyAllBtnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 15,
  },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(15,37,58,0.62)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  logoutModalBox: {
    width: "88%",
    maxWidth: 420,
    padding: 20,
    borderRadius: 24,
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  logoutModalTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 8,
  },
  logoutModalText: {
    color: "#E5E7EB",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    fontWeight: "700",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    padding: 13,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  confirmLogoutBtn: {
    flex: 1,
    padding: 13,
    alignItems: "center",
    backgroundColor: C_RED_FLASH,
    borderRadius: 12,
  },
  cancelText: {
    color: "#D1D5DB",
    fontWeight: "900",
  },
  confirmText: {
    color: "#fff",
    fontWeight: "900",
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,37,58,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "85%",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.58)",
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

  scoreHeroCard: {
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.28)",
    alignItems: "center",
    marginBottom: 12,
  },
  scoreHeroLabel: {
    color: "#92400E",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  scoreHeroValue: {
    color: "#78350F",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 4,
  },
  scoreTable: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C_BORDER,
    marginBottom: 12,
  },
  scoreTableHeader: {
    flexDirection: "row",
    backgroundColor: C_BLUE_DARK,
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 8,
  },
  scoreTh: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  scoreTrBlue: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderTopWidth: 1,
    borderTopColor: "rgba(31,91,134,0.10)",
  },
  scoreTrGreen: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 8,
    backgroundColor: "#F0FDF4",
    borderTopWidth: 1,
    borderTopColor: "rgba(31,91,134,0.10)",
  },
  scoreTrGold: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 8,
    backgroundColor: "#FFFBEB",
    borderTopWidth: 1,
    borderTopColor: "rgba(31,91,134,0.10)",
  },
  scoreTdName: {
    color: C_TEXT,
    fontSize: 13,
    fontWeight: "900",
  },
  scoreTdValue: {
    color: C_BLUE_DARK,
    fontSize: 13,
    fontWeight: "900",
  },
  scoreTdStatus: {
    color: C_MUTED,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "right",
  },
});