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
  teacher_id?: string | null;
  modes?: any;
  points_par_parcours?: number | string | null;
  pointsParParcours?: number | string | null;
  parcours_bonus_mode?: "general" | "personnalise" | string | null;
  parcoursBonusMode?: "general" | "personnalise" | string | null;
  parcours_bonus_overrides?: any;
  parcoursBonusOverrides?: any;
  points_per_correct?: number | string | null;
  pointsPerCorrect?: number | string | null;
  points_par_balise?: number | string | null;
  pointsParBalise?: number | string | null;
  tentative_page_mode?: TentativePageMode | string | null;
  tentativePageMode?: TentativePageMode | string | null;
  tentative_page_default?: number | string | null;
  tentativePageDefault?: number | string | null;
  tentative_page_assignments?: any;
  tentativePageAssignments?: any;
  balise_point_overrides?: any;
  balisePointOverrides?: any;
  tentative_source_assignments?: any;
  tentativeSourceAssignments?: any;
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
  balisePointOverrides: Record<string, number>;
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
  parcoursTermine: boolean;
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
  originalBaliseId?: string | null;
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
   TABLES
========================================================= */

const TABLE_GROUP_CONFIGS = "group_points_configs";
const TABLE_ATTEMPTS = "eleve_parcours_tentatives";
const TABLE_STATS = "eleve_parcours_stats";
const TABLE_BAREMES = "group_tentative_baremes";
const TABLE_GROUPS = "groups";
const TABLE_PARCOURS = "parcours";
const TABLE_PARCOURS_TERMINE_BONUSES = "personnaliser_parcours_termines";

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
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
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
  if (["true", "1", "yes", "oui", "on"].includes(s)) return true;
  if (["false", "0", "no", "non", "off"].includes(s)) return false;

  return fallback;
};

const uniqueStrings = (values: Array<string | null | undefined>) =>
  Array.from(new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean)));

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

const sanitizeBalisePointOverrides = (value: any): Record<string, Record<string, number>> => {
  const parsed = safeParseObject(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const out: Record<string, Record<string, number>> = {};
  Object.entries(parsed).forEach(([parcoursId, rawBalises]) => {
    const balisesObj = safeParseObject(rawBalises);
    if (!balisesObj || typeof balisesObj !== "object" || Array.isArray(balisesObj)) return;

    const values: Record<string, number> = {};
    Object.entries(balisesObj).forEach(([baliseId, points]) => {
      const n = Number(points);
      if (baliseId && Number.isFinite(n) && n >= 0) values[baliseId] = n;
    });

    if (Object.keys(values).length > 0) out[parcoursId] = values;
  });

  return out;
};

const readBalisePointOverrides = (row: GroupPointsConfigRow | null) => {
  if (!row) return {};

  const configObj = safeParseObject(row?.config);
  const settingsObj = safeParseObject(row?.settings_json);
  const sourceAssignments = safeParseObject(
    row?.tentative_source_assignments ?? row?.tentativeSourceAssignments
  );

  return {
    ...sanitizeBalisePointOverrides(settingsObj?.balise_point_overrides ?? settingsObj?.balisePointOverrides),
    ...sanitizeBalisePointOverrides(configObj?.balise_point_overrides ?? configObj?.balisePointOverrides),
    ...sanitizeBalisePointOverrides(row?.balise_point_overrides ?? row?.balisePointOverrides),
    ...sanitizeBalisePointOverrides(sourceAssignments?.balise_point_overrides ?? sourceAssignments?.balisePointOverrides),
  };
};

const getBalisePoints = (balise: BaliseLite, pointsConfig: ParcoursPointsConfig) => {
  const ids = [balise.originalBaliseId, balise.id].map((id) => String(id ?? "").trim()).filter(Boolean);
  for (const id of ids) {
    const override = pointsConfig.balisePointOverrides[id];
    if (override != null) return override;
  }

  const raw = Number(balise.points);
  return Number.isFinite(raw) ? raw : pointsConfig.pointsParBalise;
};

const sanitizePointOverrides = (value: any): Record<string, number> => {
  if (!value) return {};
  const parsed = safeParseObject(value);
  const source =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed.parcours_bonus_overrides ?? parsed.parcoursBonusOverrides ?? parsed
      : null;

  if (!source || typeof source !== "object" || Array.isArray(source)) return {};

  const out: Record<string, number> = {};
  Object.entries(source).forEach(([k, v]) => {
    const n = Number(v);
    if (k && Number.isFinite(n) && n >= 0) out[k] = n;
  });

  return out;
};

const readParcoursBonusOverrides = (row: GroupPointsConfigRow | null): Record<string, number> => {
  if (!row) return {};
  const configObj = safeParseObject(row?.config);
  const settingsObj = safeParseObject(row?.settings_json);
  const sourceAssignments = safeParseObject(
    row?.tentative_source_assignments ?? row?.tentativeSourceAssignments
  );

  return {
    ...sanitizePointOverrides(settingsObj?.parcours_bonus_overrides ?? settingsObj?.parcoursBonusOverrides),
    ...sanitizePointOverrides(configObj?.parcours_bonus_overrides ?? configObj?.parcoursBonusOverrides),
    ...sanitizePointOverrides(row?.parcours_bonus_overrides ?? row?.parcoursBonusOverrides),
    ...sanitizePointOverrides(sourceAssignments?.parcours_bonus_overrides ?? sourceAssignments?.parcoursBonusOverrides),
  };
};

const readParcoursBonusMode = (row: GroupPointsConfigRow | null) => {
  if (!row) return "general";
  const configObj = safeParseObject(row?.config);
  const settingsObj = safeParseObject(row?.settings_json);
  const mode =
    row?.parcours_bonus_mode ??
    row?.parcoursBonusMode ??
    configObj?.parcours_bonus_mode ??
    configObj?.parcoursBonusMode ??
    settingsObj?.parcours_bonus_mode ??
    settingsObj?.parcoursBonusMode;

  return mode === "personnalise" ? "personnalise" : "general";
};

const parseDetailsArray = (value: any): AttemptDetail[] => {
  if (Array.isArray(value)) return value;
  const parsed = safeParseObject(value);
  return Array.isArray(parsed) ? parsed : [];
};

const getTeacherIdFromAnyRow = (row: any): string | null => {
  const candidates = uniqueStrings([
    row?.professeur_id,
    row?.teacher_id,
    row?.user_id,
    row?.owner_id,
  ]);
  return candidates[0] ?? null;
};

async function resolveAuthTeacherId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

const loadGroupTeacherId = async (groupId: string | null): Promise<string | null> => {
  if (!groupId) return null;

  const { data, error } = await supabase
    .from(TABLE_GROUPS)
    .select("*")
    .eq("id", groupId)
    .limit(1);

  if (error) return null;

  const row = ((data as any[]) ?? [])[0] ?? null;
  return getTeacherIdFromAnyRow(row);
};

const loadParcoursTeacherId = async (
  parcoursId?: string | null
): Promise<string | null> => {
  if (!parcoursId) return null;

  const { data, error } = await supabase
    .from(TABLE_PARCOURS)
    .select("*")
    .eq("id", parcoursId)
    .limit(1);

  if (error) return null;

  const row = ((data as any[]) ?? [])[0] ?? null;
  return getTeacherIdFromAnyRow(row);
};

const loadExistingStats = async (
  studentId: string,
  parcoursId: string
): Promise<any | null> => {
  const { data, error } = await supabase
    .from(TABLE_STATS)
    .select("*")
    .eq("student_id", studentId)
    .eq("parcours_id", parcoursId)
    .limit(1);

  if (error) return null;
  return ((data as any[]) ?? [])[0] ?? null;
};

const loadParcoursTermineBonus = async ({
  groupId,
  parcoursId,
  professeurId,
}: {
  groupId: string | null;
  parcoursId?: string | null;
  professeurId?: string | null;
}): Promise<number | null> => {
  if (!groupId || !parcoursId) return null;

  const buildQuery = (withTeacher: boolean) => {
    let query = supabase
      .from(TABLE_PARCOURS_TERMINE_BONUSES)
      .select("points_personnalises")
      .eq("group_id", groupId)
      .eq("parcours_id", parcoursId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1);

    if (withTeacher && professeurId) query = query.eq("professeur_id", professeurId);
    return query;
  };

  let { data, error } = await buildQuery(true);

  if (!error && (!data || (data as any[]).length === 0) && professeurId) {
    const fallback = await buildQuery(false);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.warn("Lecture bonus parcours terminé personnalisés impossible :", error);
    return null;
  }

  const value = (data as any[])?.[0]?.points_personnalises;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/* =========================================================
   CONFIG PAR DÉFAUT
========================================================= */

export const getDefaultPointsConfig = (): ParcoursPointsConfig => ({
  enabled: true,
  modes: {
    tentatives: false,
    balises: true,
    parcours: false,
  },
  pointsPerCorrect: 0,
  pointsParParcours: 0,
  pointsParBalise: 0,
  balisePointOverrides: {},
  tentativePageMode: "general",
  tentativePageDefault: null,
  tentativePageAssignments: {},
});

/* =========================================================
   LECTURE ROBUSTE DES CONFIGS
========================================================= */

const readModes = (row: GroupPointsConfigRow | null): ModesCumules => {
  if (!row) return getDefaultPointsConfig().modes;

  const configObj = safeParseObject(row?.config);
  const settingsObj = safeParseObject(row?.settings_json);
  const modesObj = safeParseObject(row?.modes);

  return {
    balises: toBool(
      modesObj?.balises ??
        configObj?.modes?.balises ??
        configObj?.balises ??
        settingsObj?.modes?.balises ??
        settingsObj?.balises,
      true
    ),
    parcours: toBool(
      modesObj?.parcours ??
        configObj?.modes?.parcours ??
        configObj?.parcours ??
        settingsObj?.modes?.parcours ??
        settingsObj?.parcours,
      false
    ),
    tentatives: toBool(
      modesObj?.tentatives ??
        configObj?.modes?.tentatives ??
        configObj?.tentatives ??
        settingsObj?.modes?.tentatives ??
        settingsObj?.tentatives,
      false
    ),
  };
};

const getRowPointsParParcours = (row: GroupPointsConfigRow | null): number => {
  if (!row) return 0;

  const configObj = safeParseObject(row?.config);
  const settingsObj = safeParseObject(row?.settings_json);

  return parseNumeric(
    row?.points_par_parcours ??
      row?.pointsParParcours ??
      configObj?.points_par_parcours ??
      configObj?.pointsParParcours ??
      settingsObj?.points_par_parcours ??
      settingsObj?.pointsParParcours,
    0
  );
};

const getRowUpdatedTime = (row: GroupPointsConfigRow): number => {
  const t = row.updated_at ? new Date(row.updated_at).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

const rowScore = (row: GroupPointsConfigRow): number => {
  const modes = readModes(row);
  const pointsParParcours = getRowPointsParParcours(row);
  const hasParcours = modes.parcours || pointsParParcours > 0;

  return (
    (pointsParParcours > 0 ? 1_000_000 : 0) +
    (hasParcours ? 500_000 : 0) +
    (modes.balises ? 50_000 : 0) +
    (modes.tentatives ? 50_000 : 0) +
    pointsParParcours +
    getRowUpdatedTime(row) / 10_000_000_000
  );
};

const pickBestConfigRow = (
  rows: GroupPointsConfigRow[],
  candidateTeacherIds: string[] = []
): GroupPointsConfigRow | null => {
  if (!rows.length) return null;

  const rowsWithParcours = rows.filter((r) => readModes(r).parcours || getRowPointsParParcours(r) > 0);
  const rowPool = rowsWithParcours.length > 0 ? rowsWithParcours : rows;

  const sorted = [...rowPool].sort((a, b) => {
    const scoreDiff = rowScore(b) - rowScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return getRowUpdatedTime(b) - getRowUpdatedTime(a);
  });

  const selected = sorted[0] ?? null;

  console.log("CONFIG CHOISIE POUR POINTS", {
    candidateTeacherIds,
    selected: selected
      ? {
          id: selected.id,
          group_id: selected.group_id,
          professeur_id: selected.professeur_id ?? selected.teacher_id ?? null,
          modes: selected.modes,
          points_par_parcours: selected.points_par_parcours,
          score: rowScore(selected),
        }
      : null,
    allRows: rows.map((r) => ({
      id: r.id,
      professeur_id: r.professeur_id ?? r.teacher_id ?? null,
      modes: r.modes,
      points_par_parcours: r.points_par_parcours,
      score: rowScore(r),
    })),
  });

  return selected;
};

const resolveGroupPointsConfig = (
  row: GroupPointsConfigRow | null,
  parcoursId?: string
): ParcoursPointsConfig => {
  if (!row) return getDefaultPointsConfig();

  const configObj = safeParseObject(row?.config);
  const settingsObj = safeParseObject(row?.settings_json);

  const modes = readModes(row);
  const basePointsParParcours = getRowPointsParParcours(row);
  const bonusMode =
    row?.parcours_bonus_mode ??
    row?.parcoursBonusMode ??
    configObj?.parcours_bonus_mode ??
    configObj?.parcoursBonusMode ??
    settingsObj?.parcours_bonus_mode ??
    settingsObj?.parcoursBonusMode;
  const bonusOverrides = readParcoursBonusOverrides(row);
  const pointsParParcours =
    bonusMode === "personnalise" && parcoursId && bonusOverrides[parcoursId] != null
      ? bonusOverrides[parcoursId]
      : basePointsParParcours;

  const rawPointsPerCorrect =
    row?.points_per_correct ??
    row?.pointsPerCorrect ??
    configObj?.points_per_correct ??
    configObj?.pointsPerCorrect ??
    settingsObj?.points_per_correct ??
    settingsObj?.pointsPerCorrect;

  const rawPointsParBalise =
    row?.points_par_balise ??
    row?.pointsParBalise ??
    configObj?.points_par_balise ??
    configObj?.pointsParBalise ??
    settingsObj?.points_par_balise ??
    settingsObj?.pointsParBalise;

  if (pointsParParcours > 0) {
    modes.parcours = true;
  }

  if (!modes.balises && !modes.parcours && !modes.tentatives) {
    modes.balises = true;
  }

  const tentativePageMode: TentativePageMode =
    row?.tentative_page_mode === "personnalise" ||
    row?.tentativePageMode === "personnalise" ||
    configObj?.tentative_page_mode === "personnalise" ||
    configObj?.tentativePageMode === "personnalise" ||
    settingsObj?.tentative_page_mode === "personnalise" ||
    settingsObj?.tentativePageMode === "personnalise"
      ? "personnalise"
      : "general";

  const tentativePageDefaultRaw =
    row?.tentative_page_default ??
    row?.tentativePageDefault ??
    configObj?.tentative_page_default ??
    configObj?.tentativePageDefault ??
    settingsObj?.tentative_page_default ??
    settingsObj?.tentativePageDefault;

  const rawAssignments =
    row?.tentative_page_assignments ??
    row?.tentativePageAssignments ??
    configObj?.tentative_page_assignments ??
    configObj?.tentativePageAssignments ??
    settingsObj?.tentative_page_assignments ??
    settingsObj?.tentativePageAssignments;
  const allBaliseOverrides = readBalisePointOverrides(row);

  const pointsConfig: ParcoursPointsConfig = {
    enabled: true,
    modes,
    pointsPerCorrect: parseNumeric(rawPointsPerCorrect, 0),
    pointsParParcours,
    pointsParBalise: parseNumeric(rawPointsParBalise, 0),
    balisePointOverrides: parcoursId ? allBaliseOverrides[parcoursId] ?? {} : {},
    tentativePageMode,
    tentativePageDefault:
      tentativePageDefaultRaw == null ? null : Number(tentativePageDefaultRaw) || null,
    tentativePageAssignments: sanitizeAssignments(rawAssignments),
  };

  console.log("CONFIG POINTS RÉSOLUE", pointsConfig);

  return pointsConfig;
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
   CHARGEMENT CONFIG + DÉDOUBLONNAGE AUTOMATIQUE
========================================================= */

export const loadResolvedTentativeConfig = async (
  groupId: string | null,
  parcoursId?: string,
  _studentId?: string | null
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

  const [authTeacherId, groupTeacherId, parcoursTeacherId] = await Promise.all([
    resolveAuthTeacherId(),
    loadGroupTeacherId(groupId),
    loadParcoursTeacherId(parcoursId),
  ]);

  const candidateTeacherIds = uniqueStrings([
    authTeacherId,
    groupTeacherId,
    parcoursTeacherId,
  ]);

  const { data, error } = await supabase
    .from(TABLE_GROUP_CONFIGS)
    .select("*")
    .eq("group_id", groupId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) throw error;

  const rows = ((data as GroupPointsConfigRow[]) || []).filter(Boolean);
  const bestRow = pickBestConfigRow(rows, candidateTeacherIds);

  if (bestRow && rows.length > 1) {
    const idsToDelete = rows
      .filter((r) => r.id && r.id !== bestRow.id)
      .map((r) => String(r.id));

    if (idsToDelete.length > 0) {
      supabase
        .from(TABLE_GROUP_CONFIGS)
        .delete()
        .in("id", idsToDelete)
        .then(({ error: deleteError }) => {
          if (deleteError) {
            console.warn("Déduplication group_points_configs échouée :", deleteError);
          } else {
            console.log(
              `Déduplication group_points_configs : ${idsToDelete.length} doublon(s) supprimé(s) pour group_id=${groupId}`
            );
          }
        });
    }
  }

  const resolvedProfesseurId =
    getTeacherIdFromAnyRow(bestRow) ??
    groupTeacherId ??
    parcoursTeacherId ??
    authTeacherId ??
    null;

  const pointsConfig = resolveGroupPointsConfig(bestRow, parcoursId);
  const customParcoursBonus =
    readParcoursBonusMode(bestRow) === "personnalise"
      ? await loadParcoursTermineBonus({
          groupId,
          parcoursId,
          professeurId: resolvedProfesseurId,
        })
      : null;

  if (customParcoursBonus != null) {
    pointsConfig.pointsParParcours = customParcoursBonus;
    pointsConfig.modes.parcours = true;
  }

  const resolvedAttemptPage =
    pointsConfig.tentativePageMode === "personnalise"
      ? parcoursId
        ? pointsConfig.tentativePageAssignments[parcoursId] ??
          pointsConfig.tentativePageDefault ??
          null
        : null
      : pointsConfig.tentativePageDefault ?? null;

  return {
    pointsConfig,
    resolvedAttemptPage,
    resolvedGroupId: groupId,
    resolvedProfesseurId,
    supportParcoursId: null,
  };
};

/* =========================================================
   BARÈMES TENTATIVES
========================================================= */

export const loadParcoursTentativeBaremeRows = async (
  professeurId: string | null,
  attemptPage: number | null
): Promise<ParcoursBaremeTentativeRow[]> => {
  if (!attemptPage) return [];

  let rows: any[] = [];

  if (professeurId) {
    const { data, error } = await supabase
      .from(TABLE_BAREMES)
      .select("*")
      .eq("teacher_id", professeurId)
      .eq("attempt_page", attemptPage)
      .order("order_index", { ascending: true });

    if (error) throw error;
    rows = (data as any[]) || [];
  }

  if (rows.length === 0) {
    const { data, error } = await supabase
      .from(TABLE_BAREMES)
      .select("*")
      .eq("attempt_page", attemptPage)
      .order("order_index", { ascending: true });

    if (!error && data && data.length > 0) rows = data as any[];
  }

  return rows.map((r) => ({
    id: String(r.id),
    teacher_id: String(r.teacher_id ?? professeurId ?? ""),
    order_index: Number(r.order_index ?? 0),
    condition_type: (r.condition_type as ConditionType) || "=",
    attempts_value: r.attempts_value == null ? null : Number(r.attempts_value),
    attempts_min: r.attempts_min == null ? null : Number(r.attempts_min),
    attempts_max: r.attempts_max == null ? null : Number(r.attempts_max),
    points: Number(r.points ?? 0),
    color_hex: r.color_hex ?? null,
    attempt_page: Number(r.attempt_page ?? attemptPage),
  }));
};

/* =========================================================
   HISTORIQUE
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

  for (let i = 0; i < attempts.length; i++) {
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
   CALCUL
========================================================= */

const matchesTentativeCondition = (
  row: ParcoursBaremeTentativeRow,
  attemptNumber: number
): boolean => {
  if (row.condition_type === "=") return attemptNumber === Number(row.attempts_value ?? -999999);
  if (row.condition_type === "≥") return attemptNumber >= Number(row.attempts_value ?? 0);
  if (row.condition_type === "≤") return attemptNumber <= Number(row.attempts_value ?? 0);
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
}) => {
  const totalBalises = balises.length;
  const validatedSet = new Set(validatedIds);
  const validatedBalises = balises.filter((b) => validatedSet.has(b.id));
  const parcoursTermine = totalBalises > 0 && validatedBalises.length >= totalBalises;

  const balisesPoints = pointsConfig.modes.balises
    ? validatedBalises.reduce((sum, balise) => {
        return sum + getBalisePoints(balise, pointsConfig);
      }, 0)
    : 0;

  const parcoursPoints =
    pointsConfig.modes.parcours && parcoursTermine
      ? Number(pointsConfig.pointsParParcours || 0)
      : 0;

  let tentativesPoints = 0;
  let tentativeBaremeMatched: ParcoursBaremeTentativeRow | null = null;

  if (pointsConfig.modes.tentatives && parcoursTermine && completionAttemptNumber != null) {
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
  const parcoursTermine = totalBalises > 0 && validatedIds.length >= totalBalises;

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
    parcoursTermine,
  };
};

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
  const futureValidatedCount = validatedIds.length + newlyValidatedBalises.length;
  const willComplete = balises.length > 0 && futureValidatedCount >= balises.length;
  const wasAlreadyComplete = balises.length > 0 && validatedIds.length >= balises.length;

  const balisesPoints = pointsConfig.modes.balises
    ? newlyValidatedBalises.reduce((sum, balise) => {
        return sum + getBalisePoints(balise, pointsConfig);
      }, 0)
    : 0;

  const parcoursPoints =
    pointsConfig.modes.parcours && willComplete && !wasAlreadyComplete
      ? Number(pointsConfig.pointsParParcours || 0)
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
    newlyValidatedCount: newlyValidatedBalises.length,
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
   RECALCUL + STATS
========================================================= */

export const recomputeAndSyncStats = async ({
  studentId,
  parcoursId,
  balises,
  pointsConfig,
  tentativeBaremeRows,
}: {
  studentId: string | null;
  parcoursId: string | undefined;
  balises: BaliseLite[];
  pointsConfig: ParcoursPointsConfig;
  tentativeBaremeRows: ParcoursBaremeTentativeRow[];
}): Promise<ProgressState> => {
  if (!studentId || !parcoursId) {
    return {
      validatedIds: [],
      validatedCount: 0,
      totalPoints: 0,
      lastPointsGain: 0,
      tentativesCount: 0,
      completionAttemptNumber: null,
      parcoursTermine: false,
    };
  }

  const attempts = await loadAttemptsHistory(studentId, parcoursId);
  const progress = buildProgressFromAttempts(
    attempts,
    balises.length,
    balises,
    pointsConfig,
    tentativeBaremeRows
  );

  const { error } = await supabase.from(TABLE_STATS).upsert(
    {
      student_id: studentId,
      parcours_id: parcoursId,
      best_score: progress.validatedCount,
      last_score: progress.validatedCount,
      total_balises: balises.length,
      tentatives_count: progress.tentativesCount,
      last_tentative_at:
        attempts.length > 0
          ? attempts[attempts.length - 1]?.created_at ?? new Date().toISOString()
          : null,
      best_points: progress.totalPoints,
      last_points: progress.totalPoints,
      parcours_termine: progress.parcoursTermine,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,parcours_id" }
  );

  if (error) {
    console.warn("Synchronisation eleve_parcours_stats échouée :", error);
  }

  return progress;
};

/* =========================================================
   SAUVEGARDE TENTATIVE
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

  const details: AttemptDetail[] = balises.map((balise) => {
    const alreadyValidated = validatedSet.has(balise.id);
    const newlyValidated = !alreadyValidated && nextResults[balise.id] === true;

    return {
      balise_id: balise.id,
      numero_balise: balise.numero_balise ?? balise.ordre ?? null,
      code_saisi: alreadyValidated ? null : sanitize(codesSaisis[balise.id]),
      code_attendu: alreadyValidated ? null : sanitize(balise.code),
      correct: alreadyValidated ? true : nextResults[balise.id] === true,
      points_balise: getBalisePoints(balise, pointsConfig),
      already_validated: alreadyValidated,
      newly_validated: newlyValidated,
    };
  });

  const nextValidatedCount = validatedIds.length + breakdown.newlyValidatedCount;
  const nextDisplayedTotal = currentDisplayedTotal + breakdown.totalGain;
  const nextTentativesCount = breakdown.tentativeNumero;
  const parcoursTermine = totalBalises > 0 && nextValidatedCount >= totalBalises;

  const { error: insertError } = await supabase.from(TABLE_ATTEMPTS).insert({
    student_id: studentId,
    parcours_id: parcoursId,
    score: nextValidatedCount,
    total_balises: totalBalises,
    tentatives_numero: breakdown.tentativeNumero,
    points_earned: breakdown.totalGain,
    details,
  });

  if (insertError) throw insertError;

  const existingStats = await loadExistingStats(studentId, parcoursId);
  const previousBestScore = parseNumeric(existingStats?.best_score, 0);
  const previousBestPoints = parseNumeric(existingStats?.best_points, 0);

  const bestScore = Math.max(previousBestScore, nextValidatedCount);
  const bestPoints = Math.max(previousBestPoints, nextDisplayedTotal);

  const { error: upsertStatsError } = await supabase.from(TABLE_STATS).upsert(
    {
      student_id: studentId,
      parcours_id: parcoursId,
      best_score: bestScore,
      last_score: nextValidatedCount,
      total_balises: totalBalises,
      tentatives_count: nextTentativesCount,
      last_tentative_at: new Date().toISOString(),
      best_points: bestPoints,
      last_points: nextDisplayedTotal,
      parcours_termine: parcoursTermine,
      updated_at: new Date().toISOString(),
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
    parcoursTermine,
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
