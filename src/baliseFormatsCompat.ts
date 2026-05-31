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

const isMissingFormatsColumnError = (error: any) => {
  const msg = String(error?.message || error?.details || "").toLowerCase();
  return msg.includes("formats") && (msg.includes("column") || msg.includes("schema cache"));
};

export const isMissingBaliseFormatsTableError = (error: any) => {
  const msg = String(error?.message || error?.details || "").toLowerCase();
  return msg.includes("balise_formats") && (msg.includes("does not exist") || msg.includes("relation"));
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
  const { error } = await supabase
    .from("balises")
    .update({ formats: buildBaliseFormatsJson(formats) })
    .eq("id", baliseId)
    .eq("user_id", userId);

  if (!error) return true;
  if (isMissingFormatsColumnError(error)) return false;

  throw error;
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

export const fetchAllBaliseFormatsCompat = async (
  supabase: any,
  userId?: string | null
): Promise<BaliseFormatCompat[]> => {
  let balisesQuery = supabase.from("balises").select("id, user_id, formats");
  if (userId) balisesQuery = balisesQuery.eq("user_id", userId);

  const balisesResult = await balisesQuery;
  if (!balisesResult.error) {
    const rows = rowsFromBalisesFormatsJson(balisesResult.data || []);
    if (rows.length > 0) return rows;
  } else if (!isMissingFormatsColumnError(balisesResult.error)) {
    console.warn("Lecture balises.formats impossible, retour vers balise_formats:", balisesResult.error);
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
    .select("id, user_id, formats")
    .eq("id", baliseId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!baliseError && baliseData) {
    const rows = rowsFromBalisesFormatsJson([baliseData]);
    if (rows.length > 0) return rows;
  } else if (baliseError && !isMissingFormatsColumnError(baliseError)) {
    console.warn("Lecture balise.formats impossible, retour vers balise_formats:", baliseError);
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
    const fromJson = await findFormatInBalisesJson(supabase, formatId, userId);
    if (fromJson) return fromJson;
    throw error;
  }

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

  if (!format.balise_id || !format.format_type) return;

  const { data: baliseData, error: baliseError } = await supabase
    .from("balises")
    .select("id, user_id, formats")
    .eq("id", format.balise_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (baliseError) {
    if (isMissingFormatsColumnError(baliseError)) return;
    throw baliseError;
  }

  const nextFormats = {
    ...(baliseData?.formats && typeof baliseData.formats === "object" ? baliseData.formats : {}),
    [format.format_type]: {
      id: format.id ?? formatId,
      label,
      is_default: !!format.is_default,
      payload,
      created_at: format.created_at ?? null,
    },
  };

  const { error: updateJsonError } = await supabase
    .from("balises")
    .update({ formats: nextFormats })
    .eq("id", format.balise_id)
    .eq("user_id", userId);

  if (updateJsonError && !isMissingFormatsColumnError(updateJsonError)) {
    throw updateJsonError;
  }
};
