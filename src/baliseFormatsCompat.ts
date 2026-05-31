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

const makeSyntheticFormatId = (baliseId: string, formatType: BaliseFormatType) =>
  `balise:${baliseId}:${formatType}`;

const isMissingFormatsColumnError = (error: any) => {
  const msg = String(error?.message || error?.details || "").toLowerCase();
  return msg.includes("formats") && (msg.includes("column") || msg.includes("schema cache"));
};

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

export const isMissingBaliseFormatsTableError = (error: any) => {
  const msg = String(error?.message || error?.details || "").toLowerCase();
  return msg.includes("balise_formats") && (msg.includes("does not exist") || msg.includes("relation"));
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

export const buildBaliseFormatsJson = (formats: BaliseFormatCompat[]) => {
  const out: Partial<Record<BaliseFormatType, Record<string, any>>> = {};

  formats.forEach((format) => {
    if (!format?.format_type) return;

    out[format.format_type] = {
      id: format.id ?? null,
      label: format.label ?? null,
      is_default: !!format.is_default,
      payload: format.payload && typeof format.payload === "object" ? format.payload : {},
      created_at: format.created_at ?? null,
    };
  });

  return out;
};

export const updateBaliseFormatsJson = async (
  supabase: any,
  baliseId: string,
  userId: string,
  formats: BaliseFormatCompat[]
) => {
  const compactUpdate = buildCompactBaliseFormatUpdate(formats);
  const formatsJson = buildBaliseFormatsJson(formats);

  const compactResult = await supabase
    .from("balises")
    .update(compactUpdate)
    .eq("id", baliseId)
    .eq("user_id", userId);

  if (!compactResult.error) return true;
  if (!isMissingCompactFormatColumnsError(compactResult.error)) throw compactResult.error;

  const jsonOnly = await supabase
    .from("balises")
    .update({ formats: formatsJson })
    .eq("id", baliseId)
    .eq("user_id", userId);

  if (!jsonOnly.error) return true;
  if (isMissingFormatsColumnError(jsonOnly.error)) return false;
  throw jsonOnly.error;
};

const isBaliseFormatType = (value: any): value is BaliseFormatType =>
  FORMAT_TYPES.includes(String(value) as BaliseFormatType);

const formatFromJsonEntry = (
  baliseId: string,
  userId: string | null,
  formatType: BaliseFormatType,
  value: any
): BaliseFormatCompat | null => {
  if (!value || typeof value !== "object") return null;

  return {
    id: value.id ? String(value.id) : null,
    balise_id: baliseId,
    user_id: userId,
    format_type: formatType,
    label: value.label ?? null,
    is_default: !!value.is_default,
    payload: value.payload && typeof value.payload === "object" ? value.payload : {},
    created_at: value.created_at ?? null,
  };
};

const rowsFromBalisesFormatsJson = (balises: any[]): BaliseFormatCompat[] => {
  const rows: BaliseFormatCompat[] = [];

  (balises || []).forEach((balise) => {
    const formats = balise?.formats && typeof balise.formats === "object" ? balise.formats : {};
    FORMAT_TYPES.forEach((formatType) => {
      const row = formatFromJsonEntry(String(balise.id), balise.user_id ?? null, formatType, formats[formatType]);
      if (row) rows.push(row);
    });
  });

  return rows;
};

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

const findFormatInBalisesJson = async (
  supabase: any,
  formatId: string,
  userId: string
): Promise<BaliseFormatCompat | null> => {
  const { data, error } = await supabase
    .from("balises")
    .select("id, user_id, formats")
    .eq("user_id", userId);

  if (error) {
    if (isMissingFormatsColumnError(error)) return null;
    throw error;
  }

  return (
    rowsFromBalisesFormatsJson(data || []).find((row) => String(row.id ?? "") === String(formatId)) ?? null
  );
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
  if (!balisesResult.error) {
    const rows = rowsFromBalisesCompactColumns(balisesResult.data || []);
    if (rows.length > 0) return rows;
  } else if (!isMissingCompactFormatColumnsError(balisesResult.error)) {
    console.warn("Lecture balises compactes impossible, retour vers balises.formats:", balisesResult.error);
  }

  let jsonBalisesQuery = supabase.from("balises").select("id, user_id, formats");
  if (userId) jsonBalisesQuery = jsonBalisesQuery.eq("user_id", userId);

  const jsonBalisesResult = await jsonBalisesQuery;
  if (!jsonBalisesResult.error) {
    const rows = rowsFromBalisesFormatsJson(jsonBalisesResult.data || []);
    if (rows.length > 0) return rows;
  } else if (!isMissingFormatsColumnError(jsonBalisesResult.error)) {
    console.warn("Lecture balises.formats impossible, retour vers balise_formats:", jsonBalisesResult.error);
  }

  let formatsQuery = supabase
    .from("balise_formats")
    .select("id, balise_id, user_id, format_type, label, is_default, payload, created_at");
  if (userId) formatsQuery = formatsQuery.eq("user_id", userId);

  const { data, error } = await formatsQuery.order("created_at", { ascending: true });
  if (error && isMissingBaliseFormatsTableError(error)) return [];
  if (error) throw error;

  return (data || []).filter((row: any) => isBaliseFormatType(row?.format_type));
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

  if (!baliseError && baliseData) {
    const rows = rowsFromBalisesCompactColumns([baliseData]);
    if (rows.length > 0) return rows;
  } else if (baliseError && !isMissingCompactFormatColumnsError(baliseError)) {
    console.warn("Lecture balise compacte impossible, retour vers balise.formats:", baliseError);
  }

  const { data: jsonBaliseData, error: jsonBaliseError } = await supabase
    .from("balises")
    .select("id, user_id, formats")
    .eq("id", baliseId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!jsonBaliseError && jsonBaliseData) {
    const rows = rowsFromBalisesFormatsJson([jsonBaliseData]);
    if (rows.length > 0) return rows;
  } else if (jsonBaliseError && !isMissingFormatsColumnError(jsonBaliseError)) {
    console.warn("Lecture balise.formats impossible, retour vers balise_formats:", jsonBaliseError);
  }

  const { data, error } = await supabase
    .from("balise_formats")
    .select("id, balise_id, user_id, format_type, label, is_default, payload, created_at")
    .eq("balise_id", baliseId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error && isMissingBaliseFormatsTableError(error)) return [];
  if (error) throw error;
  return (data || []).filter((row: any) => isBaliseFormatType(row?.format_type));
};

export const fetchBaliseFormatByIdCompat = async (
  supabase: any,
  formatId: string,
  userId: string
): Promise<BaliseFormatCompat> => {
  const { data, error } = await supabase
    .from("balise_formats")
    .select("id, balise_id, user_id, format_type, label, is_default, payload, created_at")
    .eq("id", formatId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!error && data) return data;
  if (error && !isMissingBaliseFormatsTableError(error)) {
    const fromCompact = await findFormatInBalisesCompactColumns(supabase, formatId, userId);
    if (fromCompact) return fromCompact;
    const fromJson = await findFormatInBalisesJson(supabase, formatId, userId);
    if (fromJson) return fromJson;
    throw error;
  }

  const fromCompact = await findFormatInBalisesCompactColumns(supabase, formatId, userId);
  if (fromCompact) return fromCompact;

  const fromJson = await findFormatInBalisesJson(supabase, formatId, userId);
  if (fromJson) return fromJson;

  throw new Error("Format introuvable.");
};

export const updateBaliseFormatByIdCompat = async (
  supabase: any,
  formatId: string,
  userId: string,
  label: string,
  payload: Record<string, any>
) => {
  let format = await fetchBaliseFormatByIdCompat(supabase, formatId, userId);

  if (!String(formatId).startsWith("balise:")) {
    const updateResult = await supabase
      .from("balise_formats")
      .update({ label, payload })
      .eq("id", formatId)
      .eq("user_id", userId)
      .select("id, balise_id, user_id, format_type, label, is_default, payload, created_at")
      .maybeSingle();

    if (!updateResult.error && updateResult.data) {
      format = updateResult.data;
    } else if (updateResult.error && !isMissingBaliseFormatsTableError(updateResult.error)) {
      throw updateResult.error;
    }
  }

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
