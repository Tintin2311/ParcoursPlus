export type BaliseFormatType = "code" | "poincon" | "qrcode" | "tableau";

export type BaliseFormatCompat = {
  id?: string | null;
  balise_id?: string | null;
  user_id?: string | null;
  format_type: BaliseFormatType;
  label?: string | null;
  is_default?: boolean | null;
  payload?: Record<string, any> | null;
  created_at?: string | null;
};

const FORMAT_TYPES: BaliseFormatType[] = ["code", "poincon", "qrcode", "tableau"];
const COMPACT_BALISE_SELECT =
  "id, user_id, code, format_types, poincon_rows, poincon_cols, poincon_cells, tableau_rows, tableau_cols, tableau_cells, qrcode_value";
const LEGACY_FORMAT_SELECT = "id, balise_id, user_id, format_type, label, is_default, payload, created_at";

const makeSyntheticFormatId = (baliseId: string, formatType: BaliseFormatType) =>
  `balise:${baliseId}:${formatType}`;

const isMissingCompactFormatColumnsError = (error: any) => {
  const msg = String(error?.message || error?.details || "").toLowerCase();
  return (
    (msg.includes("format_types") ||
      msg.includes("poincon_rows") ||
      msg.includes("poincon_cols") ||
      msg.includes("poincon_cells") ||
      msg.includes("tableau_rows") ||
      msg.includes("tableau_cols") ||
      msg.includes("tableau_cells") ||
      msg.includes("qrcode_value")) &&
    (msg.includes("column") || msg.includes("schema cache"))
  );
};

const isMissingLegacyFormatsError = (error: any) => {
  const msg = String(error?.message || error?.details || "").toLowerCase();
  return (
    (msg.includes("balise_formats") || msg.includes("relation")) &&
    (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("not found"))
  );
};

const mapLegacyFormatRow = (row: any): BaliseFormatCompat | null => {
  const formatType = String(row?.format_type ?? "") as BaliseFormatType;
  if (!isBaliseFormatType(formatType)) return null;

  return {
    id: row?.id ? String(row.id) : null,
    balise_id: row?.balise_id ? String(row.balise_id) : null,
    user_id: row?.user_id ?? null,
    format_type: formatType,
    label: row?.label ?? null,
    is_default: !!row?.is_default,
    payload: row?.payload && typeof row.payload === "object" ? row.payload : {},
    created_at: row?.created_at ?? null,
  };
};

const mergeFormats = (primary: BaliseFormatCompat[], fallback: BaliseFormatCompat[]) => {
  const map = new Map<string, BaliseFormatCompat>();

  fallback.forEach((row) => {
    const key = `${row.balise_id ?? ""}:${row.format_type}`;
    if (row.balise_id && row.format_type) map.set(key, row);
  });

  primary.forEach((row) => {
    const key = `${row.balise_id ?? ""}:${row.format_type}`;
    if (row.balise_id && row.format_type) map.set(key, row);
  });

  return Array.from(map.values());
};

const fetchLegacyBaliseFormats = async (
  supabase: any,
  userId?: string | null,
  baliseIds?: string[]
): Promise<BaliseFormatCompat[]> => {
  let query = supabase.from("balise_formats").select(LEGACY_FORMAT_SELECT);
  if (userId) query = query.eq("user_id", userId);
  if (baliseIds?.length) query = query.in("balise_id", baliseIds);

  const { data, error } = await query;

  if (error) {
    if (isMissingLegacyFormatsError(error)) return [];
    throw error;
  }

  return (data || []).map(mapLegacyFormatRow).filter(Boolean) as BaliseFormatCompat[];
};

const clampGridSize = (value: any, fallback = 4) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(2, Math.min(6, Math.round(n)));
};

const makeCellKey = (row: number, col: number) => `${row}-${col}`;

const cellsToDots = (cells: any, rows: number, cols: number) => {
  const dots: Record<string, boolean> = {};

  if (!Array.isArray(cells)) return dots;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (!!cells?.[r]?.[c]) dots[makeCellKey(r, c)] = true;
    }
  }

  return dots;
};

const dotsToCells = (dots: Record<string, any>, rows: number, cols: number) =>
  Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => !!dots?.[makeCellKey(r, c)])
  );

const hasPoinconCells = (cells: any) =>
  Array.isArray(cells) && cells.some((row) => Array.isArray(row) && row.some(Boolean));

const hasTableauCells = (cells: any) =>
  cells && typeof cells === "object" && !Array.isArray(cells) && Object.values(cells).some((value) => String(value ?? "").trim());

const normalizePoinconPayload = (payload: Record<string, any> = {}) => {
  const rows = clampGridSize(payload.rows, 4);
  const cols = clampGridSize(payload.cols, 4);

  const rawCells = Array.isArray(payload.cells) ? payload.cells : null;
  const rawDots =
    payload.dots && typeof payload.dots === "object" && !Array.isArray(payload.dots)
      ? payload.dots
      : rawCells
        ? cellsToDots(rawCells, rows, cols)
        : {};

  const dots: Record<string, boolean> = {};
  Object.entries(rawDots || {}).forEach(([key, value]) => {
    if (!value) return;
    const [rRaw, cRaw] = key.split("-");
    const r = Number(rRaw);
    const c = Number(cRaw);
    if (Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < rows && c >= 0 && c < cols) {
      dots[key] = true;
    }
  });

  return {
    rows,
    cols,
    cells: rawCells ?? dotsToCells(dots, rows, cols),
    dots,
  };
};

const buildCompactBaliseFormatUpdate = (formats: BaliseFormatCompat[]) => {
  const cleanFormats = (formats || []).filter((format) => isBaliseFormatType(format?.format_type));
  const typeSet = new Set<BaliseFormatType>(cleanFormats.map((format) => format.format_type));

  const poincon = cleanFormats.find((format) => format.format_type === "poincon");
  const tableau = cleanFormats.find((format) => format.format_type === "tableau");
  const qrcode = cleanFormats.find((format) => format.format_type === "qrcode");

  const poinconPayload = poincon ? normalizePoinconPayload(poincon.payload ?? {}) : null;
  const tableauPayload = tableau?.payload && typeof tableau.payload === "object" ? tableau.payload : {};
  const qrcodePayload = qrcode?.payload && typeof qrcode.payload === "object" ? qrcode.payload : {};

  return {
    format_types: Array.from(typeSet),
    poincon_rows: poinconPayload?.rows ?? null,
    poincon_cols: poinconPayload?.cols ?? null,
    poincon_cells: poinconPayload?.cells ?? null,
    tableau_rows: tableau ? clampGridSize(tableauPayload.rows, 4) : null,
    tableau_cols: tableau ? clampGridSize(tableauPayload.cols, 4) : null,
    tableau_cells: tableau ? tableauPayload.cells && typeof tableauPayload.cells === "object" ? tableauPayload.cells : {} : null,
    qrcode_value: qrcode ? String(qrcodePayload.value ?? qrcodePayload.url ?? qrcodePayload.text ?? "") : null,
  };
};

export const updateBaliseFormatsJson = async (
  supabase: any,
  baliseId: string,
  userId: string,
  formats: BaliseFormatCompat[]
) => {
  const compactUpdate = buildCompactBaliseFormatUpdate(formats);

  const compactResult = await supabase
    .from("balises")
    .update(compactUpdate)
    .eq("id", baliseId)
    .eq("user_id", userId);

  if (!compactResult.error) return true;
  if (isMissingCompactFormatColumnsError(compactResult.error)) return false;
  throw compactResult.error;
};

const isBaliseFormatType = (value: any): value is BaliseFormatType =>
  FORMAT_TYPES.includes(String(value) as BaliseFormatType);

const rowsFromBalisesCompactColumns = (balises: any[]): BaliseFormatCompat[] => {
  const rows: BaliseFormatCompat[] = [];

  (balises || []).forEach((balise) => {
    const baliseId = String(balise.id);
    const userId = balise.user_id ?? null;
    const rawTypes = Array.isArray(balise.format_types) ? balise.format_types : [];
    const typeSet = new Set<BaliseFormatType>();

    rawTypes.forEach((value: any) => {
      if (isBaliseFormatType(value)) typeSet.add(value);
    });

    if (String(balise.code ?? "").trim()) typeSet.add("code");
    if (hasPoinconCells(balise.poincon_cells)) typeSet.add("poincon");
    if (hasTableauCells(balise.tableau_cells)) typeSet.add("tableau");
    if (String(balise.qrcode_value ?? "").trim()) typeSet.add("qrcode");

    FORMAT_TYPES.forEach((formatType) => {
      if (!typeSet.has(formatType)) return;

      if (formatType === "code") {
        rows.push({
          id: makeSyntheticFormatId(baliseId, "code"),
          balise_id: baliseId,
          user_id: userId,
          format_type: "code",
          label: "Code simple",
          is_default: false,
          payload: {},
          created_at: null,
        });
        return;
      }

      if (formatType === "poincon") {
        const rowsCount = clampGridSize(balise.poincon_rows, 4);
        const colsCount = clampGridSize(balise.poincon_cols, 4);
        const cells = Array.isArray(balise.poincon_cells)
          ? balise.poincon_cells
          : dotsToCells({}, rowsCount, colsCount);

        rows.push({
          id: makeSyntheticFormatId(baliseId, "poincon"),
          balise_id: baliseId,
          user_id: userId,
          format_type: "poincon",
          label: "Poinçon",
          is_default: false,
          payload: {
            rows: rowsCount,
            cols: colsCount,
            cells,
            dots: cellsToDots(cells, rowsCount, colsCount),
          },
          created_at: null,
        });
        return;
      }

      if (formatType === "tableau") {
        rows.push({
          id: makeSyntheticFormatId(baliseId, "tableau"),
          balise_id: baliseId,
          user_id: userId,
          format_type: "tableau",
          label: "Tableau",
          is_default: false,
          payload: {
            rows: clampGridSize(balise.tableau_rows, 4),
            cols: clampGridSize(balise.tableau_cols, 4),
            cells:
              balise.tableau_cells && typeof balise.tableau_cells === "object" && !Array.isArray(balise.tableau_cells)
                ? balise.tableau_cells
                : {},
          },
          created_at: null,
        });
        return;
      }

      rows.push({
        id: makeSyntheticFormatId(baliseId, "qrcode"),
        balise_id: baliseId,
        user_id: userId,
        format_type: "qrcode",
        label: "QR code",
        is_default: false,
        payload: { value: String(balise.qrcode_value ?? "") },
        created_at: null,
      });
    });
  });

  return rows;
};

const findFormatInBalisesCompactColumns = async (
  supabase: any,
  formatId: string,
  userId: string
): Promise<BaliseFormatCompat | null> => {
  const syntheticMatch = String(formatId).match(/^balise:(.+):(code|poincon|qrcode|tableau)$/);
  if (!syntheticMatch) return null;

  const [, baliseId, formatType] = syntheticMatch;
  const { data, error } = await supabase
    .from("balises")
    .select(COMPACT_BALISE_SELECT)
    .eq("id", baliseId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingCompactFormatColumnsError(error)) return null;
    throw error;
  }

  return (
    rowsFromBalisesCompactColumns(data ? [data] : []).find(
      (row) => row.format_type === formatType
    ) ?? null
  );
};

export const fetchAllBaliseFormatsCompat = async (
  supabase: any,
  userId?: string | null
): Promise<BaliseFormatCompat[]> => {
  let balisesQuery = supabase.from("balises").select(COMPACT_BALISE_SELECT);
  if (userId) balisesQuery = balisesQuery.eq("user_id", userId);

  const balisesResult = await balisesQuery;
  const legacyRows = await fetchLegacyBaliseFormats(supabase, userId);

  if (!balisesResult.error) {
    return mergeFormats(rowsFromBalisesCompactColumns(balisesResult.data || []), legacyRows);
  }

  if (isMissingCompactFormatColumnsError(balisesResult.error)) return legacyRows;
  throw balisesResult.error;
};

export const fetchBaliseFormatsByBaliseIdsCompat = async (
  supabase: any,
  baliseIds: string[]
): Promise<BaliseFormatCompat[]> => {
  const cleanIds = Array.from(
    new Set(baliseIds.map((id) => String(id ?? "").trim()).filter(Boolean))
  );

  if (!cleanIds.length) return [];

  const legacyRows = await fetchLegacyBaliseFormats(supabase, null, cleanIds);

  const { data, error } = await supabase
    .from("balises")
    .select(COMPACT_BALISE_SELECT)
    .in("id", cleanIds);

  if (!error) return mergeFormats(rowsFromBalisesCompactColumns(data || []), legacyRows);
  if (isMissingCompactFormatColumnsError(error)) return legacyRows;
  throw error;
};

export const fetchBaliseFormatsByBaliseIdCompat = async (
  supabase: any,
  baliseId: string,
  userId: string
): Promise<BaliseFormatCompat[]> => {
  const { data: baliseData, error: baliseError } = await supabase
    .from("balises")
    .select(COMPACT_BALISE_SELECT)
    .eq("id", baliseId)
    .eq("user_id", userId)
    .maybeSingle();

  const legacyRows = await fetchLegacyBaliseFormats(supabase, userId, [baliseId]);

  if (!baliseError && baliseData) {
    return mergeFormats(rowsFromBalisesCompactColumns([baliseData]), legacyRows);
  }

  if (baliseError && isMissingCompactFormatColumnsError(baliseError)) return legacyRows;
  if (baliseError) throw baliseError;
  return legacyRows;
};

export const fetchBaliseFormatByIdCompat = async (
  supabase: any,
  formatId: string,
  userId: string
): Promise<BaliseFormatCompat> => {
  const fromCompact = await findFormatInBalisesCompactColumns(supabase, formatId, userId);
  if (fromCompact) return fromCompact;

  throw new Error("Format introuvable.");
};

export const updateBaliseFormatByIdCompat = async (
  supabase: any,
  formatId: string,
  userId: string,
  label: string,
  payload: Record<string, any>
) => {
  const format = await fetchBaliseFormatByIdCompat(supabase, formatId, userId);

  if (!format.balise_id || !format.format_type) return;

  const existingFormats = await fetchBaliseFormatsByBaliseIdCompat(supabase, format.balise_id, userId);
  const nextFormats = existingFormats.map((existing) =>
    existing.format_type === format.format_type
      ? {
          ...existing,
          id: format.id ?? formatId,
          label,
          is_default: !!format.is_default,
          payload,
        }
      : existing
  );

  if (!nextFormats.some((existing) => existing.format_type === format.format_type)) {
    nextFormats.push({
      ...format,
      id: format.id ?? formatId,
      label,
      payload,
    });
  }

  await updateBaliseFormatsJson(supabase, format.balise_id, userId, nextFormats);
};
