import { supabase } from "./supabaseClient";

/* =========================================================
   TYPES
========================================================= */

export type ConditionType = "=" | "≥" | "≤" | "entre";
export type TentativePageMode = "general" | "personnalise";

export type AttemptDetail = {
  balise_id?: string | null;
  numero_balise?: number | null;
  code_saisi?: string | null;
  code_attendu?: string | null;
  correct?: boolean | null;
  points_balise?: number | null;
  already_validated?: boolean | null;
  newly_validated?: boolean | null;
};

export type TentativeRow = {
  id?: string;
  student_id?: string;
  parcours_id?: string;
  tentatives_numero?: number | null;
  score?: number | null;
  total_balises?: number | null;
  points_earned?: number | null;
  details?: AttemptDetail[] | string | null;
  created_at?: string | null;
};

export type ParcoursBaremeTentativeRow = {
  id: string;
  teacher_id: string;
  order_index: number;
  condition_type: ConditionType;
  attempts_value: number | null;
  attempts_min: number | null;
  attempts_max: number | null;
  points: number;
  color_hex?: string | null;
  attempt_page: number;
};

export type GroupPointsConfigRow = {
  id?: string;
  group_id: string;
  professeur_id?: string | null;
  modes?: any;
  points_par_parcours?: number | string | null;
  points_per_correct?: number | string | null;
  points_par_balise?: number | string | null;
  tentative_page_mode?: TentativePageMode | string | null;
  tentative_page_default?: number | string | null;
  tentative_page_assignments?: any;
  settings_json?: any;
  config?: any;
  updated_at?: string | null;
  [key: string]: any;
};

export type ModesCumules = {
  tentatives: boolean;
  balises: boolean;
  parcours: boolean;
};

export type ParcoursPointsConfig = {
  enabled: boolean;
  modes: ModesCumules;
  pointsPerCorrect: number;
  pointsParParcours: number;
  pointsParBalise: number;
  tentativePageMode: TentativePageMode;
  tentativePageDefault: number | null;
  tentativePageAssignments: Record<string, number>;
};

export type ResolvedTentativeConfig = {
  pointsConfig: ParcoursPointsConfig;
  resolvedAttemptPage: number | null;
  resolvedGroupId: string | null;
  resolvedProfesseurId: string | null;
  supportParcoursId: string | null;
};

export type ProgressState = {
  validatedIds: string[];
  validatedCount: number;
  totalPoints: number;
  lastPointsGain: number;
  tentativesCount: number;
  completionAttemptNumber: number | null;
};

export type GainBreakdown = {
  tentativeNumero: number;
  newlyValidatedCount: number;
  tentativesPoints: number;
  balisesPoints: number;
  parcoursPoints: number;
  totalGain: number;
  willComplete: boolean;
  tentativeBaremeMatched: ParcoursBaremeTentativeRow | null;
  resolvedTentativePage: number | null;
  resolvedGroupId: string | null;
  resolvedProfesseurId: string | null;
  supportParcoursId: string | null;
};

export type BaliseLite = {
  id: string;
  code?: string | null;
  points?: number | null;
  numero_balise?: number | null;
  ordre?: number;
};

export type DebugTentativesState = {
  groupId: string | null;
  professeurId: string | null;
  supportParcoursId: string | null;
  pageRetenue: number | null;
  completionAttemptNumber: number | null;
  baremeCount: number;
  baremeRows: Array<{
    order_index: number;
    condition_type: ConditionType;
    attempts_value: number | null;
    attempts_min: number | null;
    attempts_max: number | null;
    points: number;
    attempt_page: number;
  }>;
  matchedRow: {
    order_index: number;
    condition_type: ConditionType;
    attempts_value: number | null;
    attempts_min: number | null;
    attempts_max: number | null;
    points: number;
  } | null;
};

/* =========================================================
   CONSTANTES
========================================================= */

const TABLE_GROUP_CONFIGS = "group_points_configs";
const TABLE_ATTEMPTS = "eleve_parcours_tentatives";
const TABLE_STATS = "eleve_parcours_stats";
const TABLE_BAREMES = "group_tentative_baremes";
const TABLE_BAREME_PAGES = "group_tentative_bareme_pages";

/* =========================================================
   HELPERS
========================================================= */

export const sanitize = (s: string | null | undefined) =>
  String(s ?? "").trim().toUpperCase();

export const parseNumeric = (
  value: number | string | null | undefined,
  fallback: number
): number => {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
};

export const formatPoints = (value: number): string => {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
};

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
  if (["true", "1", "yes", "oui"].includes(s)) return true;
  if (["false", "0", "no", "non"].includes(s)) return false;

  return fallback;
};

const sanitizeAssignments = (value: any): Record<string, number> => {
  if (!value) return {};
  const parsed = safeParseObject(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const out: Record<string, number> = {};
  Object.entries(parsed).forEach(([k, v]) => {
    const n = Number(v);
    if (k && Number.isFinite(n) && n >= 1) out[k] = n;
  });

  return out;
};

const parseDetailsArray = (value: any): AttemptDetail[] => {
  if (Array.isArray(value)) return value;
  const parsed = safeParseObject(value);
  return Array.isArray(parsed) ? parsed : [];
};

async function resolveTeacherId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/* =========================================================
   CONFIG PAR DÉFAUT
========================================================= */

export const getDefaultPointsConfig = (): ParcoursPointsConfig => ({
  enabled: true,
  modes: { tentatives: true, balises: false, parcours: false },
  pointsPerCorrect: 0,
  pointsParParcours: 0,
  pointsParBalise: 0,
  tentativePageMode: "general",
  tentativePageDefault: null,
  tentativePageAssignments: {},
});

/* =========================================================
   RÉSOLUTION CONFIG DE CLASSE
========================================================= */

const resolveGroupPointsConfig = (
  row: GroupPointsConfigRow | null
): ParcoursPointsConfig => {
  if (!row) return getDefaultPointsConfig();

  const configObj = safeParseObject(row?.config);
  const settingsObj = safeParseObject(row?.settings_json);
  const modesObj = safeParseObject(row?.modes);

  const modes: ModesCumules = {
    tentatives: toBool(
      modesObj?.tentatives ?? configObj?.tentatives ?? settingsObj?.tentatives,
      false
    ),
    balises: toBool(
      modesObj?.balises ?? configObj?.balises ?? settingsObj?.balises,
      false
    ),
    parcours: toBool(
      modesObj?.parcours ?? configObj?.parcours ?? settingsObj?.parcours,
      false
    ),
  };

  if (!modes.tentatives && !modes.balises && !modes.parcours) {
    modes.tentatives = true;
  }

  const tentativePageMode: TentativePageMode =
    row?.tentative_page_mode === "personnalise" ? "personnalise" : "general";

  return {
    enabled: true,
    modes,
    pointsPerCorrect: parseNumeric(
      row?.points_per_correct ??
        configObj?.points_per_correct ??
        settingsObj?.points_per_correct,
      0
    ),
    pointsParParcours: parseNumeric(
      row?.points_par_parcours ??
        configObj?.points_par_parcours ??
        settingsObj?.points_par_parcours,
      0
    ),
    pointsParBalise: parseNumeric(
      row?.points_par_balise ??
        configObj?.points_par_balise ??
        settingsObj?.points_par_balise,
      0
    ),
    tentativePageMode,
    tentativePageDefault:
      row?.tentative_page_default == null ? null : Number(row.tentative_page_default) || null,
    tentativePageAssignments: sanitizeAssignments(row?.tentative_page_assignments),
  };
};

/* =========================================================
   COMPATIBILITÉ ANCIENNE API
========================================================= */

export async function resolveSupportParcoursId(
  _professeurId?: string | null
): Promise<string | null> {
  return null;
}

/* =========================================================
   CHARGEMENT DE LA CONFIG RÉSOLUE
========================================================= */

export const loadResolvedTentativeConfig = async (
  groupId: string | null,
  parcoursId?: string
): Promise<ResolvedTentativeConfig> => {
  if (!groupId) {
    return {
      pointsConfig: getDefaultPointsConfig(),
      resolvedAttemptPage: null,
      resolvedGroupId: null,
      resolvedProfesseurId: null,
      supportParcoursId: null,
    };
  }

  const authTeacherId = await resolveTeacherId();

  let query = supabase
    .from(TABLE_GROUP_CONFIGS)
    .select("*")
    .eq("group_id", groupId)
    .order("updated_at", { ascending: false })
    .limit(5);

  if (authTeacherId) {
    query = query.eq("professeur_id", authTeacherId);
  }

  const { data, error } = await query;

  if (error) throw error;

  const row = ((data as GroupPointsConfigRow[] | null) ?? [])[0] ?? null;
  const pointsConfig = resolveGroupPointsConfig(row);

  let resolvedAttemptPage: number | null = null;

  if (pointsConfig.tentativePageMode === "personnalise") {
    resolvedAttemptPage = parcoursId
      ? pointsConfig.tentativePageAssignments[parcoursId] ?? null
      : null;
  } else {
    resolvedAttemptPage = pointsConfig.tentativePageDefault ?? null;
  }

  const resolvedProfesseurId =
    row?.professeur_id != null
      ? String(row.professeur_id)
      : authTeacherId
      ? String(authTeacherId)
      : null;

  return {
    pointsConfig,
    resolvedAttemptPage,
    resolvedGroupId: groupId,
    resolvedProfesseurId,
    supportParcoursId: null,
  };
};

/* =========================================================
   CHARGEMENT DES BARÈMES
========================================================= */

export const loadParcoursTentativeBaremeRows = async (
  professeurId: string | null,
  attemptPage: number | null
): Promise<ParcoursBaremeTentativeRow[]> => {
  if (!professeurId || !attemptPage) return [];

  const { data, error } = await supabase
    .from(TABLE_BAREMES)
    .select("*")
    .eq("teacher_id", professeurId)
    .eq("attempt_page", attemptPage)
    .order("order_index", { ascending: true });

  if (error) throw error;

  return ((data as any[]) || []).map((r) => ({
    id: String(r.id),
    teacher_id: String(r.teacher_id),
    order_index: Number(r.order_index ?? 0),
    condition_type: (r.condition_type as ConditionType) || "=",
    attempts_value: r.attempts_value == null ? null : Number(r.attempts_value),
    attempts_min: r.attempts_min == null ? null : Number(r.attempts_min),
    attempts_max: r.attempts_max == null ? null : Number(r.attempts_max),
    points: Number(r.points ?? 0),
    color_hex: r.color_hex ?? null,
    attempt_page: Number(r.attempt_page ?? 1),
  }));
};

/* =========================================================
   HISTORIQUE DES TENTATIVES
========================================================= */

export const loadAttemptsHistory = async (
  studentId: string | null,
  parcoursId: string | undefined
): Promise<TentativeRow[]> => {
  if (!studentId || !parcoursId) return [];

  const { data, error } = await supabase
    .from(TABLE_ATTEMPTS)
    .select("*")
    .eq("student_id", studentId)
    .eq("parcours_id", parcoursId)
    .order("tentatives_numero", { ascending: true });

  if (error) throw error;

  return ((data as TentativeRow[]) || []).filter(Boolean);
};

const getValidatedIdsFromAttempts = (attempts: TentativeRow[]): string[] => {
  const validated = new Set<string>();

  attempts.forEach((attempt) => {
    const details = parseDetailsArray(attempt.details);
    details.forEach((detail) => {
      const baliseId = String(detail?.balise_id ?? "").trim();
      if (baliseId && detail?.correct === true) validated.add(baliseId);
    });
  });

  return Array.from(validated);
};

const getCompletionAttemptNumber = (
  attempts: TentativeRow[],
  totalBalises: number
): number | null => {
  if (totalBalises <= 0) return null;

  const validated = new Set<string>();

  for (let i = 0; i < attempts.length; i += 1) {
    const attempt = attempts[i];
    const details = parseDetailsArray(attempt.details);

    details.forEach((detail) => {
      const baliseId = String(detail?.balise_id ?? "").trim();
      if (baliseId && detail?.correct === true) validated.add(baliseId);
    });

    if (validated.size >= totalBalises) {
      return Number(attempt.tentatives_numero ?? i + 1);
    }
  }

  return null;
};

/* =========================================================
   MOTEUR DE RÈGLES TENTATIVES
========================================================= */

const matchesTentativeCondition = (
  row: ParcoursBaremeTentativeRow,
  attemptNumber: number
): boolean => {
  if (row.condition_type === "=") {
    return attemptNumber === Number(row.attempts_value ?? -999999);
  }

  if (row.condition_type === "≥") {
    return attemptNumber >= Number(row.attempts_value ?? 0);
  }

  if (row.condition_type === "≤") {
    return attemptNumber <= Number(row.attempts_value ?? 0);
  }

  if (row.condition_type === "entre") {
    const min = Number(row.attempts_min ?? 0);
    const max = Number(row.attempts_max ?? 0);
    return attemptNumber >= min && attemptNumber <= max;
  }

  return false;
};

const getTentativeBaremePoints = (
  rows: ParcoursBaremeTentativeRow[],
  attemptNumber: number
): { points: number; matched: ParcoursBaremeTentativeRow | null } => {
  const ordered = [...rows].sort((a, b) => a.order_index - b.order_index);
  const matched = ordered.find((row) => matchesTentativeCondition(row, attemptNumber)) || null;

  return {
    points: matched ? Number(matched.points ?? 0) : 0,
    matched,
  };
};

/* =========================================================
   CALCUL SCORE AFFICHÉ
========================================================= */

export const computeCurrentDisplayedScore = ({
  balises,
  validatedIds,
  completionAttemptNumber,
  pointsConfig,
  tentativeBaremeRows,
}: {
  balises: BaliseLite[];
  validatedIds: string[];
  completionAttemptNumber: number | null;
  pointsConfig: ParcoursPointsConfig;
  tentativeBaremeRows: ParcoursBaremeTentativeRow[];
}): {
  totalPoints: number;
  balisesPoints: number;
  parcoursPoints: number;
  tentativesPoints: number;
  tentativeBaremeMatched: ParcoursBaremeTentativeRow | null;
} => {
  const validatedSet = new Set(validatedIds);
  const validatedBalises = balises.filter((b) => validatedSet.has(b.id));

  const balisesPoints = validatedBalises.reduce((sum, balise) => {
    const raw = Number(balise.points);
    const pts = Number.isFinite(raw) ? raw : pointsConfig.pointsParBalise;
    return sum + pts;
  }, 0);

  const isCompleted = balises.length > 0 && validatedIds.length >= balises.length;

  const parcoursPoints =
    pointsConfig.modes.parcours && isCompleted ? pointsConfig.pointsParParcours : 0;

  let tentativesPoints = 0;
  let tentativeBaremeMatched: ParcoursBaremeTentativeRow | null = null;

  if (pointsConfig.modes.tentatives && isCompleted && completionAttemptNumber != null) {
    const result = getTentativeBaremePoints(tentativeBaremeRows, completionAttemptNumber);
    tentativeBaremeMatched = result.matched;
    tentativesPoints = result.matched ? result.points : pointsConfig.pointsPerCorrect;
  }

  return {
    totalPoints: balisesPoints + parcoursPoints + tentativesPoints,
    balisesPoints,
    parcoursPoints,
    tentativesPoints,
    tentativeBaremeMatched,
  };
};

export const buildProgressFromAttempts = (
  attempts: TentativeRow[],
  totalBalises: number,
  balises: BaliseLite[] = [],
  pointsConfig: ParcoursPointsConfig = getDefaultPointsConfig(),
  tentativeBaremeRows: ParcoursBaremeTentativeRow[] = []
): ProgressState => {
  const validatedIds = getValidatedIdsFromAttempts(attempts);
  const completionAttemptNumber = getCompletionAttemptNumber(attempts, totalBalises);

  const score = computeCurrentDisplayedScore({
    balises,
    validatedIds,
    completionAttemptNumber,
    pointsConfig,
    tentativeBaremeRows,
  });

  const lastPointsGain =
    attempts.length > 0 ? parseNumeric(attempts[attempts.length - 1]?.points_earned, 0) : 0;

  return {
    validatedIds,
    validatedCount: validatedIds.length,
    totalPoints: score.totalPoints,
    lastPointsGain,
    tentativesCount: attempts.length,
    completionAttemptNumber,
  };
};

/* =========================================================
   CALCUL DU GAIN DE LA NOUVELLE TENTATIVE
========================================================= */

export const computeTentativeGainBreakdown = ({
  balises,
  validatedIds,
  nextResults,
  tentativesCount,
  pointsConfig,
  tentativeBaremeRows,
  resolvedTentativePage,
  resolvedGroupId,
  resolvedProfesseurId,
  supportParcoursId,
}: {
  balises: BaliseLite[];
  validatedIds: string[];
  nextResults: Record<string, boolean | null>;
  tentativesCount: number;
  pointsConfig: ParcoursPointsConfig;
  tentativeBaremeRows: ParcoursBaremeTentativeRow[];
  resolvedTentativePage: number | null;
  resolvedGroupId: string | null;
  resolvedProfesseurId: string | null;
  supportParcoursId: string | null;
}): GainBreakdown => {
  const validatedSet = new Set(validatedIds);

  const newlyValidatedBalises = balises.filter(
    (balise) => !validatedSet.has(balise.id) && nextResults[balise.id] === true
  );

  const tentativeNumero = tentativesCount + 1;
  const newlyValidatedCount = newlyValidatedBalises.length;
  const futureValidatedCount = validatedIds.length + newlyValidatedCount;
  const willComplete = balises.length > 0 && futureValidatedCount >= balises.length;
  const wasAlreadyComplete = balises.length > 0 && validatedIds.length >= balises.length;

  const balisesPoints = newlyValidatedBalises.reduce((sum, balise) => {
    const raw = Number(balise.points);
    const pts = Number.isFinite(raw) ? raw : pointsConfig.pointsParBalise;
    return sum + pts;
  }, 0);

  const parcoursPoints =
    pointsConfig.modes.parcours && willComplete && !wasAlreadyComplete
      ? pointsConfig.pointsParParcours
      : 0;

  let tentativesPoints = 0;
  let tentativeBaremeMatched: ParcoursBaremeTentativeRow | null = null;

  if (pointsConfig.modes.tentatives && willComplete && !wasAlreadyComplete) {
    const result = getTentativeBaremePoints(tentativeBaremeRows, tentativeNumero);
    tentativeBaremeMatched = result.matched;
    tentativesPoints = result.matched ? result.points : pointsConfig.pointsPerCorrect;
  }

  return {
    tentativeNumero,
    newlyValidatedCount,
    tentativesPoints,
    balisesPoints,
    parcoursPoints,
    totalGain: balisesPoints + parcoursPoints + tentativesPoints,
    willComplete,
    tentativeBaremeMatched,
    resolvedTentativePage,
    resolvedGroupId,
    resolvedProfesseurId,
    supportParcoursId,
  };
};

/* =========================================================
   SAUVEGARDE D’UNE TENTATIVE
========================================================= */

export const saveTentativeWithStats = async ({
  studentId,
  parcoursId,
  balises,
  validatedIds,
  codesSaisis,
  nextResults,
  pointsConfig,
  breakdown,
  currentDisplayedTotal,
}: {
  studentId: string;
  parcoursId: string;
  balises: BaliseLite[];
  validatedIds: string[];
  codesSaisis: Record<string, string>;
  nextResults: Record<string, boolean | null>;
  pointsConfig: ParcoursPointsConfig;
  breakdown: GainBreakdown;
  currentDisplayedTotal: number;
}) => {
  const validatedSet = new Set(validatedIds);
  const totalBalises = balises.length;

  const details = balises.map((balise) => {
    const alreadyValidated = validatedSet.has(balise.id);
    const newlyValidated = !alreadyValidated && nextResults[balise.id] === true;

    return {
      balise_id: balise.id,
      numero_balise: balise.numero_balise ?? balise.ordre ?? null,
      code_saisi: alreadyValidated ? null : sanitize(codesSaisis[balise.id]),
      code_attendu: alreadyValidated ? null : sanitize(balise.code),
      correct: alreadyValidated ? true : nextResults[balise.id] === true,
      points_balise: parseNumeric(balise.points, pointsConfig.pointsParBalise),
      already_validated: alreadyValidated,
      newly_validated: newlyValidated,
    };
  });

  const nextValidatedCount = validatedIds.length + breakdown.newlyValidatedCount;
  const nextDisplayedTotal = currentDisplayedTotal + breakdown.totalGain;
  const nextTentativesCount = breakdown.tentativeNumero;

  const { error: insertError } = await supabase
    .from(TABLE_ATTEMPTS)
    .insert({
      student_id: studentId,
      parcours_id: parcoursId,
      score: nextValidatedCount,
      total_balises: totalBalises,
      tentatives_numero: breakdown.tentativeNumero,
      points_earned: breakdown.totalGain,
      details,
    });

  if (insertError) throw insertError;

  const { error: upsertStatsError } = await supabase
    .from(TABLE_STATS)
    .upsert(
      {
        student_id: studentId,
        parcours_id: parcoursId,
        best_score: nextValidatedCount,
        last_score: nextValidatedCount,
        total_balises: totalBalises,
        tentatives_count: nextTentativesCount,
        last_tentative_at: new Date().toISOString(),
        best_points: nextDisplayedTotal,
        last_points: breakdown.totalGain,
      },
      { onConflict: "student_id,parcours_id" }
    );

  if (upsertStatsError) {
    console.warn("Upsert stats échoué mais tentative enregistrée :", upsertStatsError);
  }

  const newlyValidatedIds = balises
    .filter((b) => !validatedSet.has(b.id) && nextResults[b.id] === true)
    .map((b) => b.id);

  return {
    details,
    newlyValidatedIds,
    nextValidatedCount,
    nextDisplayedTotal,
    nextTentativesCount,
  };
};

/* =========================================================
   DEBUG
========================================================= */

export const buildTentativesDebugState = ({
  groupId,
  professeurId,
  supportParcoursId,
  pageRetenue,
  completionAttemptNumber,
  baremeRows,
}: {
  groupId: string | null;
  professeurId: string | null;
  supportParcoursId: string | null;
  pageRetenue: number | null;
  completionAttemptNumber: number | null;
  baremeRows: ParcoursBaremeTentativeRow[];
}): DebugTentativesState => {
  const matched =
    completionAttemptNumber == null
      ? null
      : getTentativeBaremePoints(baremeRows, completionAttemptNumber).matched;

  return {
    groupId,
    professeurId,
    supportParcoursId,
    pageRetenue,
    completionAttemptNumber,
    baremeCount: baremeRows.length,
    baremeRows: baremeRows.map((r) => ({
      order_index: r.order_index,
      condition_type: r.condition_type,
      attempts_value: r.attempts_value,
      attempts_min: r.attempts_min,
      attempts_max: r.attempts_max,
      points: r.points,
      attempt_page: r.attempt_page,
    })),
    matchedRow: matched
      ? {
          order_index: matched.order_index,
          condition_type: matched.condition_type,
          attempts_value: matched.attempts_value,
          attempts_min: matched.attempts_min,
          attempts_max: matched.attempts_max,
          points: matched.points,
        }
      : null,
  };
};