// src/CreationBalise.tsx
// Version corrigée : sauvegarde fiable de la balise + formats dans Supabase
// Correction principale : si un auto-save est déjà en cours, on relance une sauvegarde juste après.
// Correction secondaire : les formats sont toujours réinsérés proprement dans balise_formats.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import {
  ArrowLeft,
  ChevronDown,
  FileText,
  Plus,
  Snowflake,
  Trash2,
  X,
} from "lucide-react-native";
import { supabase } from "./supabaseClient";
import {
  fetchBaliseFormatsByBaliseIdCompat,
  isMissingBaliseFormatsTableError,
  updateBaliseFormatsJson,
} from "./baliseFormatsCompat";

/* =========================
   Types
========================= */
type Props = {
  setPage?: (p: any) => void;
};

type BaliseFormatType = "code" | "poincon" | "qrcode" | "tableau";

type Balise = {
  id: string;
  code: string;
  points: number | string;
  frozen: boolean;
  numero_balise: string;
  user_id?: string | null;
};

type ParcoursRef = {
  id: string;
  nom: string;
};

type BaliseEditDraft = {
  balise_id?: string;
  balise_numero?: string;
};

type BaliseFormat = {
  id: string;
  balise_id?: string | null;
  user_id?: string | null;
  format_type: BaliseFormatType;
  label: string;
  is_default: boolean;
  payload: Record<string, any>;
  created_at?: string | null;
};

type ActiveCellEditor = {
  formatId: string;
  cellKey: string;
  value: string;
  placeholder: string;
};

/* =========================
   Constantes
========================= */
const BALISE_EDIT_DRAFT_KEY = "@parcoursplus_balise_edit_draft";

const C_BG = "#EDF2F6";
const C_HEADER = "#1F5B86";
const C_HEADER_2 = "#2C6B98";
const C_BORDER = "rgba(0,0,0,0.08)";
const C_TEXT = "#0f172a";
const C_CONTENT_BG = "#EEF3F7";
const C_CONTENT_BORDER = "#C6D2DC";
const C_SKY_STRONG = "#D6E8FF";

const C_CARD = "#FFFDF7";
const C_CARD_BORDER = "#E7B81A";
const C_MUTED = "rgba(15,23,42,0.68)";
const C_RED = "#ef4444";
const C_BLUE_STRONG = "#1d4ed8";
const C_BLUE_SOFT = "#2563eb";

const IOS_SHADOW = {
  shadowColor: "#000",
  shadowOpacity: 0.08,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 8,
};

const FORMAT_ORDER: BaliseFormatType[] = ["code", "poincon", "qrcode", "tableau"];

const FIXED_FORMAT_LABELS: Record<BaliseFormatType, string> = {
  code: "Code simple",
  poincon: "Poinçon",
  qrcode: "QR code",
  tableau: "Tableau",
};

const FORMAT_OPTIONS: { id: BaliseFormatType; label: string }[] = [
  { id: "code", label: "Code simple" },
  { id: "poincon", label: "Poinçon" },
  { id: "qrcode", label: "QR code" },
  { id: "tableau", label: "Tableau" },
];

const GRID_SIZE_OPTIONS = [2, 3, 4, 5, 6];

/* =========================
   Helpers
========================= */
const escapeHtml = (value: string) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const toNumeroString = (value: any) => {
  if (value == null) return "";
  if (typeof value === "number") return String(value);
  return String(value).trim();
};

const toPointsNumber = (value: any): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").trim().replace(",", ".");
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
};

const normalizeToken = (value: any) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const splitLooseString = (raw: string): string[] =>
  raw
    .split(/[;,|]/g)
    .map((s) => s.trim())
    .filter(Boolean);

const extractTokensFromAny = (value: any): string[] => {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => extractTokensFromAny(item));
  }

  if (typeof value === "object") {
    const out: string[] = [];
    if ((value as any).id != null) out.push(String((value as any).id));
    if ((value as any).balise_id != null) out.push(String((value as any).balise_id));
    if ((value as any).numero_balise != null) out.push(String((value as any).numero_balise));
    if ((value as any).code != null) out.push(String((value as any).code));
    if (Array.isArray((value as any).balises)) out.push(...extractTokensFromAny((value as any).balises));
    if (Array.isArray((value as any).balise_ids)) out.push(...extractTokensFromAny((value as any).balise_ids));
    return out.filter(Boolean);
  }

  const raw = String(value).trim();
  if (!raw) return [];

  if ((raw.startsWith("[") && raw.endsWith("]")) || (raw.startsWith("{") && raw.endsWith("}"))) {
    try {
      return extractTokensFromAny(JSON.parse(raw));
    } catch {
      // noop
    }
  }

  const split = splitLooseString(raw);
  return split.length > 1 ? split : [raw];
};

const matchesBaliseToken = (token: string, balise: Balise) => {
  const t = normalizeToken(token);
  if (!t) return false;

  return (
    t === normalizeToken(balise.id) ||
    t === normalizeToken(balise.numero_balise) ||
    t === normalizeToken(balise.code)
  );
};

const removeBaliseFromValue = (value: any, balise: Balise): any => {
  if (value == null) return value;

  if (Array.isArray(value)) {
    return value.filter((item) => {
      const tokens = extractTokensFromAny(item);
      return !tokens.some((t) => matchesBaliseToken(t, balise));
    });
  }

  if (typeof value === "object") {
    const clone: any = { ...value };

    if (Array.isArray(clone.balises)) {
      clone.balises = clone.balises.filter((item: any) => {
        const tokens = extractTokensFromAny(item);
        return !tokens.some((t) => matchesBaliseToken(t, balise));
      });
    }

    if (Array.isArray(clone.balise_ids)) {
      clone.balise_ids = clone.balise_ids.filter(
        (item: any) => !matchesBaliseToken(String(item), balise)
      );
    }

    return clone;
  }

  const raw = String(value).trim();
  if (!raw) return value;

  const isJsonLike =
    (raw.startsWith("[") && raw.endsWith("]")) ||
    (raw.startsWith("{") && raw.endsWith("}"));

  if (isJsonLike) {
    try {
      const parsed = JSON.parse(raw);
      const cleaned = removeBaliseFromValue(parsed, balise);
      return JSON.stringify(cleaned ?? []);
    } catch {
      // noop
    }
  }

  const sep = raw.includes(";") ? ";" : raw.includes("|") ? "|" : raw.includes(",") ? "," : null;

  if (sep) {
    const kept = raw
      .split(/[;,|]/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((token) => !matchesBaliseToken(token, balise));

    return kept.join(sep === "," ? ", " : `${sep} `);
  }

  if (matchesBaliseToken(raw, balise)) return null;
  return value;
};

const makeCellKey = (row: number, col: number) => `${row}-${col}`;

const toLetter = (index: number) => {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
};

const defaultTablePlaceholder = (row: number, col: number) => `${toLetter(row)}${col + 1}`;

const generateQrSeedValue = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "QR-";
  for (let i = 0; i < 12; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
};

const buildFakeQrMatrix = (value: string, size = 19) => {
  const safe = value || "QR";
  let seed = 0;
  for (let i = 0; i < safe.length; i++) {
    seed = (seed * 33 + safe.charCodeAt(i)) % 2147483647;
  }

  const matrix: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) {
      const inTopLeft = r < 7 && c < 7;
      const inTopRight = r < 7 && c >= size - 7;
      const inBottomLeft = r >= size - 7 && c < 7;

      if (inTopLeft || inTopRight || inBottomLeft) {
        const localR = inBottomLeft ? r - (size - 7) : r;
        const localC = inTopRight ? c - (size - 7) : c;
        const border = localR === 0 || localR === 6 || localC === 0 || localC === 6;
        const center = localR >= 2 && localR <= 4 && localC >= 2 && localC <= 4;
        row.push(border || center);
        continue;
      }

      seed = (seed * 48271) % 2147483647;
      row.push((seed + r * 11 + c * 17) % 2 === 0);
    }
    matrix.push(row);
  }
  return matrix;
};

const clampGridSize = (value: any, fallback = 4) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(2, Math.min(6, Math.round(n)));
};

const dotsToCells = (dots: Record<string, any>, rows: number, cols: number) => {
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => !!dots?.[makeCellKey(r, c)])
  );
};

const cellsToDots = (cells: any, rows: number, cols: number) => {
  const dots: Record<string, boolean> = {};

  if (Array.isArray(cells)) {
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (!!cells?.[r]?.[c]) dots[makeCellKey(r, c)] = true;
      }
    }
  }

  return dots;
};

const normalizePoinconPayloadForSave = (payload: Record<string, any> = {}) => {
  const rows = clampGridSize(payload.rows, 4);
  const cols = clampGridSize(payload.cols, 4);

  const rawDots =
    payload.dots && typeof payload.dots === "object" && !Array.isArray(payload.dots)
      ? payload.dots
      : cellsToDots(payload.cells, rows, cols);

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
    ...payload,
    rows,
    cols,
    dots,
    cells: dotsToCells(dots, rows, cols),
  };
};

const createDefaultFormat = (
  type: BaliseFormatType,
  baliseId?: string | null,
  userId?: string | null
): BaliseFormat => {
  const base = {
    id: `local-format-${Date.now()}-${Math.random()}`,
    balise_id: baliseId ?? null,
    user_id: userId ?? null,
    format_type: type,
    label: FIXED_FORMAT_LABELS[type],
    is_default: false,
  };

  if (type === "code") return { ...base, payload: {} };

  if (type === "poincon") {
    return {
      ...base,
      payload: normalizePoinconPayloadForSave({ rows: 4, cols: 4, dots: {} }),
    };
  }

  if (type === "qrcode") {
    return {
      ...base,
      payload: { value: generateQrSeedValue() },
    };
  }

  return {
    ...base,
    payload: { rows: 4, cols: 4, cells: {} },
  };
};

const ensureCodeFormat = (
  formats: BaliseFormat[],
  baliseId?: string | null,
  userId?: string | null
): BaliseFormat[] => {
  if (formats.some((f) => f.format_type === "code")) return formats;
  return [createDefaultFormat("code", baliseId, userId), ...formats];
};

const areFormatsEqual = (a: BaliseFormat[], b: BaliseFormat[]) => JSON.stringify(a) === JSON.stringify(b);

const normalizeFormatsForCompare = (formats: BaliseFormat[]) =>
  formats.map((f) => ({
    ...f,
    is_default: false,
    label: FIXED_FORMAT_LABELS[f.format_type],
    payload: f.format_type === "poincon" ? normalizePoinconPayloadForSave(f.payload ?? {}) : f.payload ?? {},
  }));

const hasUnsavedChanges = (
  balise: Balise | null,
  initialBalise: Balise | null,
  formats: BaliseFormat[],
  initialFormats: BaliseFormat[]
) => {
  if (!balise || !initialBalise) return false;

  const baliseChanged =
    String(balise.code ?? "") !== String(initialBalise.code ?? "") ||
    String(balise.numero_balise ?? "") !== String(initialBalise.numero_balise ?? "") ||
    String(balise.points ?? "") !== String(initialBalise.points ?? "") ||
    !!balise.frozen !== !!initialBalise.frozen;

  const formatsChanged = !areFormatsEqual(
    normalizeFormatsForCompare(formats),
    normalizeFormatsForCompare(initialFormats)
  );

  return baliseChanged || formatsChanged;
};

/* =========================
   Supabase helpers
========================= */
const getAuthenticatedUserId = async (): Promise<string> => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  if (!user?.id) throw new Error("Utilisateur non connecté.");
  return user.id;
};

const mapBaliseRow = (b: any): Balise => ({
  id: String(b.id),
  code: String(b.code ?? ""),
  points: b.points ?? 0,
  frozen: !!b.frozen,
  numero_balise: toNumeroString(b.numero_balise),
  user_id: b.user_id ?? null,
});

const mapFormatRow = (row: any): BaliseFormat => {
  const formatType = row.format_type as BaliseFormatType;
  const rawPayload = row.payload && typeof row.payload === "object" ? row.payload : {};

  return {
    id: String(row.id),
    balise_id: row.balise_id ? String(row.balise_id) : null,
    user_id: row.user_id ?? null,
    format_type: formatType,
    label: FIXED_FORMAT_LABELS[formatType] ?? String(row.label ?? formatType),
    is_default: false,
    payload: formatType === "poincon" ? normalizePoinconPayloadForSave(rawPayload) : rawPayload,
    created_at: row.created_at ?? null,
  };
};

const fetchBaliseById = async (baliseId: string, userId: string): Promise<Balise | null> => {
  const { data, error } = await supabase
    .from("balises")
    .select("id, code, points, frozen, numero_balise, user_id")
    .eq("id", baliseId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return mapBaliseRow(data);
};

const fetchFormatsByBaliseId = async (baliseId: string, userId: string): Promise<BaliseFormat[]> => {
  const rows = await fetchBaliseFormatsByBaliseIdCompat(supabase, baliseId, userId);
  return rows.map(mapFormatRow);
};

const getNextNumeroFromSupabase = async (userId: string): Promise<string> => {
  const { data, error } = await supabase.from("balises").select("numero_balise").eq("user_id", userId);

  if (error) throw error;

  const used = new Set(
    (data || [])
      .map((b: any) => parseInt(String(b.numero_balise ?? "0"), 10))
      .filter((n: number) => Number.isFinite(n) && n > 0)
  );

  let n = 1;
  while (used.has(n)) n++;
  return String(n);
};

const insertBaliseInSupabase = async (b: Balise, userId: string) => {
  const { data, error } = await supabase
    .from("balises")
    .insert({
      user_id: userId,
      code: String(b.code ?? "").trim(),
      points: toPointsNumber(b.points),
      frozen: !!b.frozen,
      numero_balise: parseInt(b.numero_balise, 10),
    })
    .select("id, code, points, frozen, numero_balise, user_id")
    .single();

  if (error) throw error;
  return mapBaliseRow(data);
};

const updateBaliseInSupabase = async (b: Balise, userId: string) => {
  const { error } = await supabase
    .from("balises")
    .update({
      code: String(b.code ?? "").trim(),
      points: toPointsNumber(b.points),
      frozen: !!b.frozen,
      numero_balise: parseInt(b.numero_balise || "0", 10) || null,
    })
    .eq("id", b.id)
    .eq("user_id", userId);

  if (error) throw error;
};

const deleteBaliseInSupabase = async (baliseId: string, userId: string) => {
  await supabase.from("balise_formats").delete().eq("balise_id", baliseId).eq("user_id", userId);

  const { error } = await supabase.from("balises").delete().eq("id", baliseId).eq("user_id", userId);

  if (error) throw error;
};

const upsertFormatsInSupabase = async (baliseId: string, userId: string, formats: BaliseFormat[]) => {
  const cleanFormats = ensureCodeFormat(formats, baliseId, userId)
    .filter((f) => !!f.format_type)
    .map((format) => ({
      balise_id: baliseId,
      user_id: userId,
      format_type: format.format_type,
      label: FIXED_FORMAT_LABELS[format.format_type],
      is_default: false,
      payload:
        format.format_type === "poincon"
          ? normalizePoinconPayloadForSave(format.payload ?? {})
          : format.payload ?? {},
    }));

  const { error: deleteError } = await supabase
    .from("balise_formats")
    .delete()
    .eq("balise_id", baliseId)
    .eq("user_id", userId);

  const oldTableAvailable = !deleteError;
  if (deleteError && !isMissingBaliseFormatsTableError(deleteError)) throw deleteError;

  if (!cleanFormats.length) {
    await updateBaliseFormatsJson(supabase, baliseId, userId, []);
    return;
  }

  let insertedFormats: any[] | null = null;
  if (oldTableAvailable) {
    const { data, error: insertError } = await supabase
      .from("balise_formats")
      .insert(cleanFormats)
      .select("id, balise_id, user_id, format_type, label, is_default, payload, created_at");
    if (insertError) throw insertError;
    insertedFormats = data;
  }

  await updateBaliseFormatsJson(supabase, baliseId, userId, insertedFormats || cleanFormats);
};

const fetchParcoursUsageForBalise = async (balise: Balise, userId: string): Promise<ParcoursRef[]> => {
  const { data, error } = await supabase
    .from("parcours")
    .select("id, nom, balises_ordre, user_id")
    .eq("user_id", userId);

  if (error) return [];

  const list: ParcoursRef[] = [];
  for (const row of data || []) {
    const tokens = extractTokensFromAny((row as any).balises_ordre);
    const found = tokens.some((t) => matchesBaliseToken(t, balise));

    if (found) {
      list.push({
        id: String((row as any).id),
        nom: String((row as any).nom ?? "Parcours sans nom"),
      });
    }
  }

  return list;
};

const removeBaliseFromSelectedParcours = async (balise: Balise, parcoursIds: string[], userId: string) => {
  if (!parcoursIds.length) return;

  const { data, error } = await supabase
    .from("parcours")
    .select("id, balises_ordre, user_id")
    .eq("user_id", userId)
    .in("id", parcoursIds);

  if (error) throw error;

  for (const row of data || []) {
    const nextValue = removeBaliseFromValue((row as any).balises_ordre, balise);

    const { error: updateError } = await supabase
      .from("parcours")
      .update({ balises_ordre: nextValue })
      .eq("id", (row as any).id)
      .eq("user_id", userId);

    if (updateError) throw updateError;
  }
};

/* =========================
   PDF helper
========================= */
const buildBalisePdfHtml = (balise: Balise, formats: BaliseFormat[], usageList: ParcoursRef[]) => {
  const formatBlocks = formats
    .map((format) => {
      const title = FIXED_FORMAT_LABELS[format.format_type];
      const payload =
        format.format_type === "poincon" ? normalizePoinconPayloadForSave(format.payload || {}) : format.payload || {};

      if (format.format_type === "code") {
        return `
          <div class="card">
            <div class="title">${escapeHtml(title)}</div>
            <div class="code-box">${escapeHtml(String(balise.code ?? "")) || "&nbsp;"}</div>
          </div>
        `;
      }

      if (format.format_type === "qrcode") {
        const matrix = buildFakeQrMatrix(String((payload as any).value ?? "QR"), 17);
        const qrHtml = matrix
          .map(
            (row) =>
              `<div class="qr-row">${row
                .map((filled) => `<span class="qr-pixel ${filled ? "dark" : ""}"></span>`)
                .join("")}</div>`
          )
          .join("");

        return `
          <div class="card">
            <div class="title">${escapeHtml(title)}</div>
            <div class="qr-wrap">${qrHtml}</div>
          </div>
        `;
      }

      if (format.format_type === "poincon") {
        const rows = clampGridSize(payload.rows, 4);
        const cols = clampGridSize(payload.cols, 4);
        const dots = payload.dots || {};

        const grid = Array.from({ length: rows })
          .map((_, r) => {
            const cells = Array.from({ length: cols })
              .map((__, c) => {
                const key = makeCellKey(r, c);
                const active = !!dots[key];
                return `<div class="p-cell">${active ? `<div class="dot"></div>` : ""}</div>`;
              })
              .join("");
            return `<div class="p-row">${cells}</div>`;
          })
          .join("");

        return `
          <div class="card">
            <div class="title">${escapeHtml(title)}</div>
            <div class="p-grid">${grid}</div>
          </div>
        `;
      }

      const rows = clampGridSize(payload.rows, 4);
      const cols = clampGridSize(payload.cols, 4);
      const cells = payload.cells || {};

      const table = Array.from({ length: rows })
        .map((_, r) => {
          const colsHtml = Array.from({ length: cols })
            .map((__, c) => {
              const key = makeCellKey(r, c);
              const value = String(cells[key] ?? "");
              const placeholder = defaultTablePlaceholder(r, c);
              return `<div class="t-cell">${escapeHtml(value || placeholder)}</div>`;
            })
            .join("");
          return `<div class="t-row">${colsHtml}</div>`;
        })
        .join("");

      return `
        <div class="card">
          <div class="title">${escapeHtml(title)}</div>
          <div class="t-grid">${table}</div>
        </div>
      `;
    })
    .join("");

  const usageHtml = usageList.length > 0 ? `<ul>${usageList.map((p) => `<li>${escapeHtml(p.nom)}</li>`).join("")}</ul>` : `<p>Aucun parcours</p>`;

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
          .header { margin-bottom: 20px; }
          .main-title { font-size: 28px; font-weight: 800; margin-bottom: 10px; }
          .meta { display: flex; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
          .chip { background: #eaf3f9; border: 1px solid #c9d5df; border-radius: 12px; padding: 10px 14px; }
          .section { margin-top: 24px; }
          .section-title { font-size: 20px; font-weight: 800; margin-bottom: 14px; }
          .card { border: 1.5px solid #e7b81a; border-radius: 18px; padding: 14px; margin-bottom: 14px; background: #fffdf7; }
          .title { font-size: 18px; font-weight: 800; margin-bottom: 10px; }
          .code-box { border: 1px solid #d8dee5; background: #fff; border-radius: 12px; padding: 12px; min-height: 24px; }
          .qr-wrap { display: inline-block; background: #fff; border: 1px solid #d8dee5; border-radius: 12px; padding: 8px; }
          .qr-row { line-height: 0; }
          .qr-pixel { width: 8px; height: 8px; display: inline-block; background: #fff; }
          .qr-pixel.dark { background: #111827; }
          .p-grid, .t-grid { display: inline-block; padding: 4px; background: #fff; border: 1px solid #d8dee5; border-radius: 12px; }
          .p-row, .t-row { display: flex; gap: 4px; margin-bottom: 4px; }
          .p-row:last-child, .t-row:last-child { margin-bottom: 0; }
          .p-cell, .t-cell { width: 42px; height: 42px; border: 1px solid #d1d5db; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 12px; }
          .dot { width: 12px; height: 12px; border-radius: 999px; background: #111827; }
          ul { margin-top: 8px; padding-left: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="main-title">Récapitulatif balise</div>
          <div class="meta">
            <div class="chip"><strong>N° balise :</strong> ${escapeHtml(String(balise.numero_balise ?? ""))}</div>
            <div class="chip"><strong>Code :</strong> ${escapeHtml(String(balise.code ?? ""))}</div>
            <div class="chip"><strong>Points :</strong> ${escapeHtml(String(balise.points ?? ""))}</div>
            <div class="chip"><strong>Présence :</strong> ${usageList.length} parcours</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Formats</div>
          ${formatBlocks || "<p>Aucun format</p>"}
        </div>

        <div class="section">
          <div class="section-title">Présence dans les parcours</div>
          ${usageHtml}
        </div>
      </body>
    </html>
  `;
};

/* =========================
   Mini icons
========================= */
const MiniCodeIcon = () => (
  <View style={styles.miniIconBox}>
    <Text style={styles.miniCodeA}>A</Text>
    <Text style={styles.miniCodek}>k</Text>
    <Text style={styles.miniCode5}>5</Text>
    <Text style={styles.miniCodeBang}>!</Text>
  </View>
);

const MiniPoinconIcon = () => {
  const dots = new Set(["0-0", "0-2", "1-1", "2-3", "3-0", "3-2"]);
  return (
    <View style={styles.miniGridBox}>
      {Array.from({ length: 4 }).map((_, r) => (
        <View key={`mini-pr-${r}`} style={styles.miniGridRow}>
          {Array.from({ length: 4 }).map((__, c) => {
            const key = `${r}-${c}`;
            const active = dots.has(key);
            return <View key={key} style={styles.miniGridCell}>{active ? <View style={styles.miniGridDot} /> : null}</View>;
          })}
        </View>
      ))}
    </View>
  );
};

const MiniQrIcon = () => {
  const matrix = buildFakeQrMatrix("QR-DEMO", 11);
  return (
    <View style={styles.miniQrBox}>
      {matrix.map((row, r) => (
        <View key={`mqr-r-${r}`} style={styles.miniQrRow}>
          {row.map((filled, c) => (
            <View key={`mqr-${r}-${c}`} style={[styles.miniQrPixel, filled && styles.miniQrPixelDark]} />
          ))}
        </View>
      ))}
    </View>
  );
};

const MiniTableauIcon = () => (
  <View style={styles.miniTableBox}>
    <View style={styles.miniTableRow}>
      <View style={styles.miniTableCell}><Text style={styles.miniTableText}>A1</Text></View>
      <View style={styles.miniTableCell}><Text style={styles.miniTableText}>A2</Text></View>
    </View>
    <View style={styles.miniTableRow}>
      <View style={styles.miniTableCell}><Text style={styles.miniTableText}>B1</Text></View>
      <View style={styles.miniTableCell}><Text style={styles.miniTableText}>B2</Text></View>
    </View>
  </View>
);

const PickerFormatIcon = ({ type }: { type: BaliseFormatType }) => {
  if (type === "code") return <MiniCodeIcon />;
  if (type === "poincon") return <MiniPoinconIcon />;
  if (type === "qrcode") return <MiniQrIcon />;
  return <MiniTableauIcon />;
};

const Rows3Icon = ({ color = "#334155" }: { color?: string }) => (
  <View style={styles.rows3IconWrap}>
    <View style={[styles.rows3Line, { backgroundColor: color }]} />
    <View style={[styles.rows3Line, { backgroundColor: color }]} />
    <View style={[styles.rows3Line, { backgroundColor: color }]} />
  </View>
);

const Cols3Icon = ({ color = "#334155" }: { color?: string }) => (
  <View style={styles.cols3IconWrap}>
    <View style={[styles.cols3Line, { backgroundColor: color }]} />
    <View style={[styles.cols3Line, { backgroundColor: color }]} />
    <View style={[styles.cols3Line, { backgroundColor: color }]} />
  </View>
);

/* =========================
   Grid picker
========================= */
const GridSizePicker = ({
  iconType,
  value,
  onSelect,
}: {
  iconType: "rows" | "cols";
  value: number;
  onSelect: (v: number) => void;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.gridPickerWrap}>
      <Pressable onPress={() => setOpen((prev) => !prev)} style={({ pressed }) => [styles.gridPickerButton, pressed && styles.pressedStyle]}>
        {iconType === "rows" ? <Rows3Icon /> : <Cols3Icon />}
        <Text style={styles.gridPickerButtonText}>{value}</Text>
        <ChevronDown size={14} color="#334155" />
      </Pressable>

      {open ? (
        <View style={styles.gridPickerMenu}>
          {GRID_SIZE_OPTIONS.map((option) => (
            <Pressable
              key={`${iconType}-${option}`}
              onPress={() => {
                onSelect(option);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.gridPickerItem, option === value && styles.gridPickerItemActive, pressed && styles.pressedStyle]}
            >
              <Text style={[styles.gridPickerItemText, option === value && styles.gridPickerItemTextActive]}>{option}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
};

/* =========================
   Card component
========================= */
const FormatCard = ({
  format,
  baliseCode,
  cardWidth,
  cardMinHeight,
  gridZoneHeight,
  isMobile,
  onRemove,
  onChangeCode,
  onChangePayload,
  onStartEditTableCell,
}: {
  format: BaliseFormat;
  baliseCode: string;
  cardWidth: number;
  cardMinHeight: number;
  gridZoneHeight: number;
  isMobile: boolean;
  onRemove: () => void;
  onChangeCode: (v: string) => void;
  onChangePayload: (payload: Record<string, any>) => void;
  onStartEditTableCell: (cell: ActiveCellEditor) => void;
}) => {
  const payload = format.payload || {};
  const isWeb = Platform.OS === "web";
  const compactTopRow = format.format_type === "poincon" || format.format_type === "tableau";

  const getGridMetrics = (rows: number, cols: number) => {
    const outerWidth = cardWidth - 28;
    const gap = isMobile ? 4 : 6;
    const gridPadding = isMobile ? 8 : 10;

    const usableByWidth = outerWidth - gridPadding * 2;
    const usableByHeight = gridZoneHeight - gridPadding * 2;

    const cellFromWidth = Math.floor((usableByWidth - gap * (cols - 1)) / cols);
    const cellFromHeight = Math.floor((usableByHeight - gap * (rows - 1)) / rows);

    const cell = Math.max(isMobile ? 24 : 28, Math.min(cellFromWidth, cellFromHeight));
    const contentWidth = cell * cols + gap * (cols - 1);
    const contentHeight = cell * rows + gap * (rows - 1);

    return {
      gap,
      padding: gridPadding,
      cell,
      wrapWidth: contentWidth + gridPadding * 2,
      wrapHeight: contentHeight + gridPadding * 2,
    };
  };

  const renderTopRow = (rows?: number, cols?: number) => {
    if (!compactTopRow) {
      return (
        <View style={styles.formatCardTopCompact}>
          <Text style={styles.formatTitleTextCompact}>{FIXED_FORMAT_LABELS[format.format_type]}</Text>

          <Pressable onPress={onRemove} style={({ pressed }) => [styles.closeMiniBtnCompact, pressed && styles.pressedStyle]}>
            <X size={14} color="#991b1b" />
          </Pressable>
        </View>
      );
    }

    return (
      <View style={styles.compactHeaderRow}>
        <Text style={styles.compactHeaderTitle}>{FIXED_FORMAT_LABELS[format.format_type]}</Text>

        <View style={styles.compactHeaderControls}>
          <GridSizePicker
            iconType="rows"
            value={rows || 4}
            onSelect={(nextRows) => {
              if (format.format_type === "poincon") {
                const normalized = normalizePoinconPayloadForSave({ ...payload, rows: nextRows, cols: cols || 4 });
                onChangePayload(normalized);
              } else {
                onChangePayload({ ...payload, rows: nextRows, cols, cells: payload.cells || {} });
              }
            }}
          />

          <GridSizePicker
            iconType="cols"
            value={cols || 4}
            onSelect={(nextCols) => {
              if (format.format_type === "poincon") {
                const normalized = normalizePoinconPayloadForSave({ ...payload, rows: rows || 4, cols: nextCols });
                onChangePayload(normalized);
              } else {
                onChangePayload({ ...payload, rows, cols: nextCols, cells: payload.cells || {} });
              }
            }}
          />

          <Pressable onPress={onRemove} style={({ pressed }) => [styles.closeMiniBtnCompact, pressed && styles.pressedStyle]}>
            <X size={14} color="#991b1b" />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderCode = () => (
    <>
      {renderTopRow()}
      <View style={styles.editorBlockCompact}>
        <TextInput
          value={baliseCode}
          onChangeText={onChangeCode}
          placeholder="Entrer le code"
          placeholderTextColor="rgba(15,23,42,0.35)"
          style={styles.cardInputCompact}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />
      </View>
    </>
  );

  const renderPoincon = () => {
    const normalizedPayload = normalizePoinconPayloadForSave(payload);
    const rows = clampGridSize(normalizedPayload.rows, 4);
    const cols = clampGridSize(normalizedPayload.cols, 4);
    const dots = normalizedPayload.dots || {};
    const metrics = getGridMetrics(rows, cols);

    return (
      <>
        {renderTopRow(rows, cols)}
        <View style={styles.editorBlockCompactTight}>
          <View style={[styles.fixedContentZone, { height: gridZoneHeight }]}> 
            <View style={[styles.whiteGridWrapCompact, { width: metrics.wrapWidth, height: metrics.wrapHeight, padding: metrics.padding }]}> 
              {Array.from({ length: rows }).map((_, r) => (
                <View key={`prow-${r}`} style={[styles.whiteGridRowCompact, { gap: metrics.gap, marginBottom: r === rows - 1 ? 0 : metrics.gap }]}> 
                  {Array.from({ length: cols }).map((__, c) => {
                    const key = makeCellKey(r, c);
                    const active = !!dots[key];

                    return (
                      <Pressable
                        key={key}
                        onPress={() => {
                          const nextDots: Record<string, boolean> = { ...dots };
                          if (active) delete nextDots[key];
                          else nextDots[key] = true;

                          onChangePayload(normalizePoinconPayloadForSave({ ...payload, rows, cols, dots: nextDots }));
                        }}
                        style={[styles.whiteGridCellCompact, { width: metrics.cell, height: metrics.cell }]}
                      >
                        {active && <View style={styles.blackDotCompact} />}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      </>
    );
  };

  const renderQrCode = () => {
    const value = String(payload.value ?? "");
    const matrix = buildFakeQrMatrix(value || "QR", isMobile ? 17 : 19);

    return (
      <>
        {renderTopRow()}
        <View style={styles.editorBlockCompact}>
          <View style={styles.qrActionRowCompact}>
            <Pressable onPress={() => onChangePayload({ ...payload, value: generateQrSeedValue() })} style={({ pressed }) => [styles.generateBtnCompact, pressed && styles.pressedStyle]}>
              <Text style={styles.generateBtnTextCompact}>Générer</Text>
            </Pressable>
          </View>

          <View style={[styles.fixedContentZone, { height: gridZoneHeight }]}> 
            <View style={styles.fakeQrWrapCompact}>
              {matrix.map((row, r) => (
                <View key={`qr-r-${r}`} style={styles.fakeQrRow}>
                  {row.map((filled, c) => (
                    <View key={`qr-${r}-${c}`} style={[styles.fakeQrPixelCompact, filled && styles.fakeQrPixelDark]} />
                  ))}
                </View>
              ))}
            </View>
          </View>
        </View>
      </>
    );
  };

  const renderTableau = () => {
    const rows = clampGridSize(payload.rows, 4);
    const cols = clampGridSize(payload.cols, 4);
    const cells = payload.cells || {};
    const metrics = getGridMetrics(rows, cols);

    return (
      <>
        {renderTopRow(rows, cols)}
        <View style={styles.editorBlockCompactTight}>
          <View style={[styles.fixedContentZone, { height: gridZoneHeight }]}> 
            <View style={[styles.tableFixedWrap, { width: metrics.wrapWidth, height: metrics.wrapHeight, padding: metrics.padding }]}> 
              {Array.from({ length: rows }).map((_, r) => (
                <View key={`trow-${r}`} style={[styles.tableEditorRowCompact, { gap: metrics.gap, marginBottom: r === rows - 1 ? 0 : metrics.gap }]}> 
                  {Array.from({ length: cols }).map((__, c) => {
                    const key = makeCellKey(r, c);
                    const currentValue = String(cells[key] ?? "");
                    const placeholder = defaultTablePlaceholder(r, c);

                    if (isWeb) {
                      return (
                        <TextInput
                          key={key}
                          value={currentValue}
                          onChangeText={(v) => onChangePayload({ ...payload, rows, cols, cells: { ...cells, [key]: v } })}
                          placeholder={placeholder}
                          placeholderTextColor="rgba(15,23,42,0.35)"
                          style={[styles.tableCellInputWeb, { width: metrics.cell, height: metrics.cell }]}
                          autoCapitalize="none"
                          autoCorrect={false}
                        />
                      );
                    }

                    return (
                      <Pressable
                        key={key}
                        onPress={() => onStartEditTableCell({ formatId: format.id, cellKey: key, value: currentValue, placeholder })}
                        style={[styles.tableCellPressable, { width: metrics.cell, height: metrics.cell }]}
                      >
                        <Text numberOfLines={1} style={[styles.tableCellPressableText, !currentValue && styles.tableCellPressablePlaceholder]}>
                          {currentValue || placeholder}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>
        </View>
      </>
    );
  };

  return (
    <View style={[styles.formatCard, { width: cardWidth, minHeight: cardMinHeight, height: cardMinHeight }]}> 
      {format.format_type === "code" && renderCode()}
      {format.format_type === "poincon" && renderPoincon()}
      {format.format_type === "qrcode" && renderQrCode()}
      {format.format_type === "tableau" && renderTableau()}
    </View>
  );
};

/* =========================
   Main component
========================= */
const CreationBalise: React.FC<Props> = ({ setPage = () => {} }) => {
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);

  const [currentUserId, setCurrentUserId] = useState("");
  const [balise, setBalise] = useState<Balise | null>(null);
  const [initialBalise, setInitialBalise] = useState<Balise | null>(null);
  const [isNew, setIsNew] = useState(true);

  const [formats, setFormats] = useState<BaliseFormat[]>([]);
  const [initialFormats, setInitialFormats] = useState<BaliseFormat[]>([]);

  const [usageList, setUsageList] = useState<ParcoursRef[]>([]);
  const [selectedParcoursIds, setSelectedParcoursIds] = useState<string[]>([]);
  const [showParcoursList, setShowParcoursList] = useState(false);
  const [removingFromParcours, setRemovingFromParcours] = useState(false);
  const [showDeleteInfo, setShowDeleteInfo] = useState(false);
  const [showFormatPicker, setShowFormatPicker] = useState(false);

  const [activeCellEditor, setActiveCellEditor] = useState<ActiveCellEditor | null>(null);
  const [activeFormatIndex, setActiveFormatIndex] = useState(0);

  const { width, height } = useWindowDimensions();
  const isMobile = width < 760;
  const scrollRef = useRef<ScrollView | null>(null);
  const initialLoadDoneRef = useRef(false);
  const savingRef = useRef(false);
  const saveAgainRef = useRef(false);

  const latestStateRef = useRef<{
    balise: Balise | null;
    formats: BaliseFormat[];
    hasChanges: boolean;
    isNew: boolean;
    currentUserId: string;
  }>({
    balise: null,
    formats: [],
    hasChanges: false,
    isNew: true,
    currentUserId: "",
  });

  const currentUsageCount = usageList.length;
  const currentIsUsed = currentUsageCount > 0;

  const orderedFormats = useMemo(() => {
    return [...formats]
      .map((f) => ({
        ...f,
        label: FIXED_FORMAT_LABELS[f.format_type],
        payload: f.format_type === "poincon" ? normalizePoinconPayloadForSave(f.payload ?? {}) : f.payload ?? {},
      }))
      .sort((a, b) => FORMAT_ORDER.indexOf(a.format_type) - FORMAT_ORDER.indexOf(b.format_type));
  }, [formats]);

  const availableTypes = useMemo(() => {
    const used = new Set(formats.map((f) => f.format_type));
    return FORMAT_OPTIONS.filter((option) => !used.has(option.id));
  }, [formats]);

  const hasChanges = useMemo(
    () => hasUnsavedChanges(balise, initialBalise, formats, initialFormats),
    [balise, initialBalise, formats, initialFormats]
  );

  useEffect(() => {
    latestStateRef.current = { balise, formats, hasChanges, isNew, currentUserId };
  }, [balise, formats, hasChanges, isNew, currentUserId]);

  const cardGap = 16;
  const cardWidth = isMobile ? width - 28 : Math.min(430, width - 180);

  const availableVerticalSpace = height - (isMobile ? 265 : 250);
  const cardMinHeight = isMobile ? Math.max(350, Math.min(510, availableVerticalSpace)) : Math.max(510, Math.min(690, availableVerticalSpace));

  const gridZoneHeight = isMobile ? Math.max(172, Math.min(280, cardMinHeight - 138)) : Math.max(245, Math.min(365, cardMinHeight - 145));

  const sidePadding = Math.max(14, (width - cardWidth) / 2);

  const scrollToFormatIndex = useCallback(
    (index: number, animated = true) => {
      const safeIndex = Math.max(0, index);
      setActiveFormatIndex(safeIndex);
      const x = safeIndex * (cardWidth + cardGap);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x, y: 0, animated });
      });
    },
    [cardWidth]
  );

  const refreshUsage = useCallback(async (targetBalise: Balise, userId: string) => {
    try {
      const nextUsage = await fetchParcoursUsageForBalise(targetBalise, userId);
      setUsageList(nextUsage);

      await AsyncStorage.setItem(
        BALISE_EDIT_DRAFT_KEY,
        JSON.stringify({ balise_id: targetBalise.id, balise_numero: targetBalise.numero_balise })
      );
    } catch {
      setUsageList([]);
    }
  }, []);

  const createBlankBalise = useCallback(async (userId: string) => {
    const nextNumero = await getNextNumeroFromSupabase(userId);
    const newBalise: Balise = {
      id: `new-${Date.now()}`,
      code: "",
      points: "0",
      frozen: false,
      numero_balise: nextNumero,
      user_id: userId,
    };

    const codeFormat = createDefaultFormat("code", null, userId);

    setBalise(newBalise);
    setInitialBalise({ ...newBalise });
    setFormats([codeFormat]);
    setInitialFormats([codeFormat]);
    setIsNew(true);
    setUsageList([]);
    setActiveFormatIndex(0);
  }, []);

  const saveFromSnapshot = useCallback(
    async (snapshot?: {
      balise: Balise | null;
      formats: BaliseFormat[];
      hasChanges: boolean;
      isNew: boolean;
      currentUserId: string;
    }) => {
      if (savingRef.current) {
        saveAgainRef.current = true;
        return;
      }

      savingRef.current = true;

      try {
        const data = snapshot ?? latestStateRef.current;
        const currentBalise = data.balise;
        const currentFormats = data.formats;
        const currentIsNew = data.isNew;
        const userId = data.currentUserId;

        if (!currentBalise || !userId) return;

        const cleanNumeroText = String(currentBalise.numero_balise ?? "").trim();
        const numero = parseInt(cleanNumeroText, 10);

        if (!cleanNumeroText || Number.isNaN(numero) || numero <= 0) {
          Alert.alert("Numéro invalide", "Le numéro de balise doit être un nombre supérieur à 0.");
          return;
        }

        const codeValue = String(currentBalise.code ?? "").trim();

        const safeFormats = ensureCodeFormat(
          currentFormats.map((f) => ({
            ...f,
            payload:
              f.format_type === "poincon"
                ? normalizePoinconPayloadForSave(f.payload ?? {})
                : f.payload ?? {},
          })),
          currentBalise.id.startsWith("new-") ? null : currentBalise.id,
          userId
        );

        if (currentIsNew || currentBalise.id.startsWith("new-")) {
          const inserted = await insertBaliseInSupabase(
            {
              ...currentBalise,
              code: codeValue,
              numero_balise: String(numero),
            },
            userId
          );

          const formatsForInserted = safeFormats.map((f) => ({
            ...f,
            balise_id: inserted.id,
            user_id: userId,
          }));

          await upsertFormatsInSupabase(inserted.id, userId, formatsForInserted);

          const finalBalise: Balise = {
            ...inserted,
            code: codeValue,
            points: String(inserted.points ?? ""),
          };

          const refreshedFormats = ensureCodeFormat(
            await fetchFormatsByBaliseId(inserted.id, userId),
            inserted.id,
            userId
          );

          setBalise(finalBalise);
          setInitialBalise({ ...finalBalise });
          setFormats(refreshedFormats);
          setInitialFormats(JSON.parse(JSON.stringify(refreshedFormats)));
          setIsNew(false);

          latestStateRef.current = {
            balise: finalBalise,
            formats: refreshedFormats,
            hasChanges: false,
            isNew: false,
            currentUserId: userId,
          };

          await AsyncStorage.setItem(
            BALISE_EDIT_DRAFT_KEY,
            JSON.stringify({ balise_id: inserted.id, balise_numero: inserted.numero_balise })
          );

          await refreshUsage(finalBalise, userId);
          return;
        }

        const updatedBalise: Balise = {
          ...currentBalise,
          code: codeValue,
          numero_balise: String(numero),
        };

        await updateBaliseInSupabase(updatedBalise, userId);

        const formatsForUpdate = safeFormats.map((f) => ({
          ...f,
          balise_id: updatedBalise.id,
          user_id: userId,
        }));

        await upsertFormatsInSupabase(updatedBalise.id, userId, formatsForUpdate);

        const refreshedFormats = ensureCodeFormat(
          await fetchFormatsByBaliseId(updatedBalise.id, userId),
          updatedBalise.id,
          userId
        );

        setBalise(updatedBalise);
        setInitialBalise({ ...updatedBalise });
        setFormats(refreshedFormats);
        setInitialFormats(JSON.parse(JSON.stringify(refreshedFormats)));

        latestStateRef.current = {
          balise: updatedBalise,
          formats: refreshedFormats,
          hasChanges: false,
          isNew: false,
          currentUserId: userId,
        };

        await refreshUsage(updatedBalise, userId);
      } catch (e: any) {
        console.error("❌ save CreationBalise:", e);
        Alert.alert("Erreur d'enregistrement", e?.message || "La balise n'a pas pu être enregistrée.");
      } finally {
        savingRef.current = false;

        if (saveAgainRef.current) {
          saveAgainRef.current = false;
          setTimeout(() => saveFromSnapshot(latestStateRef.current), 150);
        }
      }
    },
    [refreshUsage]
  );

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      try {
        setLoading(true);

        const userId = await getAuthenticatedUserId();
        if (!mounted) return;
        setCurrentUserId(userId);

        let parsedDraft: BaliseEditDraft | null = null;

        try {
          const rawDraft = await AsyncStorage.getItem(BALISE_EDIT_DRAFT_KEY);
          parsedDraft = rawDraft ? JSON.parse(rawDraft) : null;
        } catch {
          parsedDraft = null;
        }

        if (parsedDraft?.balise_id) {
          try {
            const existing = await fetchBaliseById(parsedDraft.balise_id, userId);

            if (!existing) {
              await AsyncStorage.removeItem(BALISE_EDIT_DRAFT_KEY);
              await createBlankBalise(userId);
              initialLoadDoneRef.current = true;
              return;
            }

            const existingFormats = ensureCodeFormat(await fetchFormatsByBaliseId(parsedDraft.balise_id, userId), existing.id, userId);

            if (!mounted) return;

            const nextBalise = { ...existing, points: String(existing.points ?? "") };

            setBalise(nextBalise);
            setInitialBalise({ ...nextBalise });
            setFormats(existingFormats);
            setInitialFormats(JSON.parse(JSON.stringify(existingFormats)));
            setIsNew(false);
            setActiveFormatIndex(0);

            latestStateRef.current = {
              balise: nextBalise,
              formats: existingFormats,
              hasChanges: false,
              isNew: false,
              currentUserId: userId,
            };

            await refreshUsage(existing, userId);
            initialLoadDoneRef.current = true;
            return;
          } catch {
            await AsyncStorage.removeItem(BALISE_EDIT_DRAFT_KEY);
            await createBlankBalise(userId);
            initialLoadDoneRef.current = true;
            return;
          }
        }

        await createBlankBalise(userId);
        initialLoadDoneRef.current = true;
      } catch (e: any) {
        if (!mounted) return;
        Alert.alert("Erreur", e?.message || "Impossible d'ouvrir la balise.", [{ text: "OK", onPress: () => setPage("gestionBalises") }]);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    boot();

    return () => {
      mounted = false;
    };
  }, [createBlankBalise, refreshUsage, setPage]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") saveFromSnapshot(latestStateRef.current);
    });

    return () => sub.remove();
  }, [saveFromSnapshot]);

  useEffect(() => {
    if (!orderedFormats.length) {
      setActiveFormatIndex(0);
      return;
    }
    if (activeFormatIndex > orderedFormats.length - 1) {
      setActiveFormatIndex(orderedFormats.length - 1);
      scrollToFormatIndex(orderedFormats.length - 1, false);
    }
  }, [orderedFormats.length, activeFormatIndex, scrollToFormatIndex]);

  const goBack = useCallback(async () => {
    await saveFromSnapshot(latestStateRef.current);
    setPage("gestionBalises");
  }, [saveFromSnapshot, setPage]);

  const updateBaliseDraft = useCallback((patch: Partial<Balise>) => {
    setBalise((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };

      latestStateRef.current = { ...latestStateRef.current, balise: next, hasChanges: true };
      return next;
    });
  }, []);

  useEffect(() => {
    if (!initialLoadDoneRef.current) return;
    if (loading) return;
    if (!hasChanges) return;
    if (!balise || !currentUserId) return;

    const timer = setTimeout(() => {
      saveFromSnapshot({ balise, formats, hasChanges, isNew, currentUserId });
    }, 900);

    return () => clearTimeout(timer);
  }, [balise, formats, hasChanges, isNew, currentUserId, loading, saveFromSnapshot]);

  const addFormat = useCallback(
    (type: BaliseFormatType) => {
      if (!balise) return;

      const created = createDefaultFormat(type, balise.id.startsWith("new-") ? null : balise.id, currentUserId || balise.user_id || null);

      setFormats((prev) => {
        const next = ensureCodeFormat([...prev, created], balise.id, currentUserId);
        setTimeout(() => {
          const nextOrdered = [...next].sort((a, b) => FORMAT_ORDER.indexOf(a.format_type) - FORMAT_ORDER.indexOf(b.format_type));
          const nextIndex = nextOrdered.findIndex((f) => f.id === created.id);
          scrollToFormatIndex(nextIndex, true);
        }, 60);
        return next;
      });

      setShowFormatPicker(false);
    },
    [balise, currentUserId, scrollToFormatIndex]
  );

  const removeFormat = useCallback(
    (formatId: string) => {
      setFormats((prev) => {
        const target = prev.find((f) => f.id === formatId);
        if (target?.format_type === "code") return prev;

        const next = ensureCodeFormat(prev.filter((f) => f.id !== formatId), balise?.id || null, currentUserId);

        setTimeout(() => {
          const newIndex = Math.max(0, Math.min(activeFormatIndex, next.length - 1));
          scrollToFormatIndex(newIndex, true);
        }, 60);

        return next;
      });

      setActiveCellEditor((prev) => (prev?.formatId === formatId ? null : prev));
    },
    [activeFormatIndex, balise?.id, currentUserId, scrollToFormatIndex]
  );

  const updateFormatPayload = useCallback((formatId: string, payload: Record<string, any>) => {
    setFormats((prev) => {
      const next = prev.map((f) =>
        f.id === formatId
          ? {
              ...f,
              label: FIXED_FORMAT_LABELS[f.format_type],
              payload: f.format_type === "poincon" ? normalizePoinconPayloadForSave(payload ?? {}) : payload,
            }
          : f
      );

      latestStateRef.current = {
        ...latestStateRef.current,
        formats: next,
        hasChanges: true,
      };

      return next;
    });
  }, []);

  const handleStartEditTableCell = useCallback((cell: ActiveCellEditor) => setActiveCellEditor(cell), []);
  const handleEditorChange = useCallback((text: string) => setActiveCellEditor((prev) => (prev ? { ...prev, value: text } : prev)), []);

  const handleEditorApply = useCallback(() => {
    if (!activeCellEditor) return;
    const { formatId, cellKey, value } = activeCellEditor;

    setFormats((prev) =>
      prev.map((f) => {
        if (f.id !== formatId) return f;
        const payload = f.payload || {};
        const cells = payload.cells || {};
        return { ...f, payload: { ...payload, cells: { ...cells, [cellKey]: value } } };
      })
    );

    setActiveCellEditor(null);
  }, [activeCellEditor]);

  const handleEditorClear = useCallback(() => {
    if (!activeCellEditor) return;
    const { formatId, cellKey } = activeCellEditor;

    setFormats((prev) =>
      prev.map((f) => {
        if (f.id !== formatId) return f;
        const payload = f.payload || {};
        const cells = { ...(payload.cells || {}) };
        delete cells[cellKey];
        return { ...f, payload: { ...payload, cells } };
      })
    );

    setActiveCellEditor(null);
  }, [activeCellEditor]);

  const handleExportPdf = useCallback(async () => {
    if (!balise) return;

    try {
      setExportingPdf(true);
      const html = buildBalisePdfHtml(balise, orderedFormats, usageList);
      const result = await Print.printToFileAsync({ html });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: "application/pdf", dialogTitle: "Télécharger le PDF de la balise", UTI: "com.adobe.pdf" });
      } else {
        Alert.alert("PDF créé", "Le PDF a été généré.");
      }
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible de générer le PDF.");
    } finally {
      setExportingPdf(false);
    }
  }, [balise, orderedFormats, usageList]);

  const handleToggleFreeze = useCallback(() => {
    if (!latestStateRef.current.balise) return;
    updateBaliseDraft({ frozen: !latestStateRef.current.balise.frozen });
  }, [updateBaliseDraft]);

  const handleDelete = useCallback(() => {
    if (!balise || !currentUserId) return;

    const warningText = currentIsUsed
      ? "Attention : cette balise est encore utilisée dans un ou plusieurs parcours. Tu ne peux pas la supprimer directement tant qu’elle est liée. Tu peux d’abord la retirer des parcours ou la geler."
      : "Attention : cette suppression est définitive.";

    if (Platform.OS === "web") {
      if (!isNew && currentIsUsed) {
        window.alert(warningText);
        setShowDeleteInfo(true);
        setShowParcoursList(true);
        return;
      }

      const confirmed = window.confirm(warningText);
      if (!confirmed) return;

      (async () => {
        try {
          if (!isNew) await deleteBaliseInSupabase(balise.id, currentUserId);
          await AsyncStorage.removeItem(BALISE_EDIT_DRAFT_KEY);
          setPage("gestionBalises");
        } catch (e: any) {
          window.alert(e?.message || "Suppression impossible.");
        }
      })();

      return;
    }

    if (!isNew && currentIsUsed) {
      Alert.alert("Attention", warningText, [
        { text: "Fermer", style: "cancel" },
        {
          text: "Voir les parcours",
          onPress: () => {
            setShowDeleteInfo(true);
            setShowParcoursList(true);
          },
        },
      ]);
      return;
    }

    Alert.alert("Attention", warningText, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          try {
            if (!isNew) await deleteBaliseInSupabase(balise.id, currentUserId);
            await AsyncStorage.removeItem(BALISE_EDIT_DRAFT_KEY);
            setPage("gestionBalises");
          } catch (e: any) {
            Alert.alert("Erreur", e?.message || "Suppression impossible.");
          }
        },
      },
    ]);
  }, [balise, currentUserId, currentIsUsed, isNew, setPage]);

  const toggleParcoursSelection = useCallback((id: string) => {
    setSelectedParcoursIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const handleRemoveFromSelectedParcours = useCallback(async () => {
    if (!balise || !currentUserId) return;

    if (!selectedParcoursIds.length) {
      Alert.alert("Aucun parcours", "Sélectionne au moins un parcours.");
      return;
    }

    try {
      setRemovingFromParcours(true);
      await removeBaliseFromSelectedParcours(balise, selectedParcoursIds, currentUserId);
      await refreshUsage(balise, currentUserId);
      setSelectedParcoursIds([]);
      setShowDeleteInfo(false);
      Alert.alert("Succès", "La balise a bien été retirée des parcours sélectionnés.");
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible de retirer la balise des parcours.");
    } finally {
      setRemovingFromParcours(false);
    }
  }, [balise, currentUserId, refreshUsage, selectedParcoursIds]);

  const handleScrollEnd = useCallback(
    (event: any) => {
      const x = event?.nativeEvent?.contentOffset?.x ?? 0;
      const nextIndex = Math.round(x / (cardWidth + cardGap));
      setActiveFormatIndex(Math.max(0, Math.min(nextIndex, orderedFormats.length - 1)));
    },
    [cardWidth, orderedFormats.length]
  );

  if (loading || !balise) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text style={styles.loadingText}>Chargement de la balise...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar hidden={showFormatPicker} />

      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable onPress={goBack} style={({ pressed }) => [styles.headerBtn, pressed && styles.pressedStyle]} hitSlop={10}>
            <ArrowLeft color="#fff" size={18} />
          </Pressable>

          <View style={styles.headerActions}>
            <Pressable
              onPress={handleExportPdf}
              style={({ pressed }) => [styles.iconBtn, exportingPdf && styles.iconBtnDisabled, pressed && !exportingPdf && styles.pressedStyle]}
              disabled={exportingPdf}
            >
              <FileText size={18} color="#fff" />
            </Pressable>

            <Pressable onPress={handleToggleFreeze} style={({ pressed }) => [styles.iconBtn, balise.frozen && styles.iconBtnFrozenActive, pressed && styles.pressedStyle]}>
              <Snowflake size={18} color="#fff" />
            </Pressable>

            <Pressable onPress={handleDelete} style={({ pressed }) => [styles.iconBtnRed, pressed && styles.pressedStyle]}>
              <Trash2 size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.header2}>
        <View style={styles.header2Chip}>
          <Text style={styles.header2LabelCentered}>N° balise</Text>
          <TextInput
            value={balise.numero_balise}
            onChangeText={(v) => updateBaliseDraft({ numero_balise: v.replace(/[^0-9]/g, "") })}
            keyboardType="number-pad"
            style={styles.header2InputCentered}
            placeholder="0"
            placeholderTextColor="rgba(255,255,255,0.72)"
            textAlign="center"
            returnKeyType="done"
          />
        </View>

        <View style={styles.header2Chip}>
          <Text style={styles.header2LabelCentered}>Points</Text>
          <TextInput
            value={String(balise.points ?? "")}
            onChangeText={(v) => updateBaliseDraft({ points: v })}
            keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
            style={styles.header2InputCentered}
            placeholder="0"
            placeholderTextColor="rgba(255,255,255,0.72)"
            textAlign="center"
            returnKeyType="done"
          />
        </View>

        <Pressable onPress={() => currentUsageCount > 0 && setShowParcoursList(true)} style={({ pressed }) => [styles.header2ChipSmall, pressed && currentUsageCount > 0 && styles.pressedStyle]}>
          <Text style={styles.header2LabelCentered}>Parcours</Text>
          <Text style={styles.header2InputCentered}>{currentUsageCount}</Text>
        </Pressable>
      </View>

      <View style={styles.contentZone}>
        <View style={styles.mainArea}>
          {orderedFormats.length === 0 ? (
            <View style={styles.emptyStateWrap}>
              <Text style={styles.emptyStateText}>Ajoute un nouveau format</Text>
            </View>
          ) : (
            <View style={styles.formatsSection}>
              <ScrollView
                ref={(ref) => {
                  scrollRef.current = ref;
                }}
                horizontal
                pagingEnabled={false}
                decelerationRate="fast"
                snapToInterval={cardWidth + cardGap}
                snapToAlignment="start"
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={[styles.horizontalCardsContent, { paddingHorizontal: sidePadding }]}
                keyboardShouldPersistTaps="handled"
                onMomentumScrollEnd={handleScrollEnd}
                onScrollEndDrag={handleScrollEnd}
                scrollEventThrottle={16}
              >
                {orderedFormats.map((format, index) => (
                  <View key={format.id} style={[styles.cardSlot, { width: cardWidth, marginRight: index === orderedFormats.length - 1 ? 0 : cardGap }]}> 
                    <FormatCard
                      format={format}
                      baliseCode={String(balise.code ?? "")}
                      cardWidth={cardWidth}
                      cardMinHeight={cardMinHeight}
                      gridZoneHeight={gridZoneHeight}
                      isMobile={isMobile}
                      onRemove={() => removeFormat(format.id)}
                      onChangeCode={(v) => updateBaliseDraft({ code: v })}
                      onChangePayload={(payload) => updateFormatPayload(format.id, payload)}
                      onStartEditTableCell={handleStartEditTableCell}
                    />
                  </View>
                ))}
              </ScrollView>

              {orderedFormats.length > 1 ? (
                <View style={styles.paginationDots}>
                  {orderedFormats.map((_, index) => (
                    <Pressable key={`dot-${index}`} onPress={() => scrollToFormatIndex(index, true)} style={[styles.paginationDot, index === activeFormatIndex && styles.paginationDotActive]} />
                  ))}
                </View>
              ) : null}
            </View>
          )}
        </View>
      </View>

      {Platform.OS !== "web" && activeCellEditor ? (
        <View style={styles.floatingEditorBar}>
          <View style={styles.floatingEditorTop}>
            <Text style={styles.floatingEditorTitle}>Édition de la case</Text>
            <Pressable onPress={() => setActiveCellEditor(null)} style={({ pressed }) => [styles.floatingEditorClose, pressed && styles.pressedStyle]}>
              <X size={14} color="#334155" />
            </Pressable>
          </View>

          <TextInput
            value={activeCellEditor.value}
            onChangeText={handleEditorChange}
            placeholder={activeCellEditor.placeholder}
            placeholderTextColor="rgba(15,23,42,0.35)"
            style={styles.floatingEditorInput}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleEditorApply}
          />

          <View style={styles.floatingEditorActions}>
            <Pressable onPress={handleEditorClear} style={({ pressed }) => [styles.floatingEditorGhostBtn, pressed && styles.pressedStyle]}>
              <Text style={styles.floatingEditorGhostTxt}>Effacer</Text>
            </Pressable>

            <Pressable onPress={handleEditorApply} style={({ pressed }) => [styles.floatingEditorPrimaryBtn, pressed && styles.pressedStyle]}>
              <Text style={styles.floatingEditorPrimaryTxt}>Valider</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.fabWrap} pointerEvents="box-none">
        <Pressable
          onPress={() => setShowFormatPicker(true)}
          style={({ pressed }) => [styles.fab, availableTypes.length === 0 && styles.fabDisabled, pressed && availableTypes.length > 0 && styles.pressedStyle]}
          disabled={availableTypes.length === 0}
        >
          <Plus size={22} color="#0f172a" />
          <Text style={styles.fabText}>Créer un format</Text>
        </Pressable>
      </View>

      <Modal visible={showParcoursList} transparent animationType="fade" onRequestClose={() => setShowParcoursList(false)}>
        <View style={styles.modalCenterRoot}>
          <Pressable style={styles.centerBackdrop} onPress={() => setShowParcoursList(false)} />

          <View style={styles.usageModalCard}>
            <View style={styles.modalTopRow}>
              <Text style={styles.modalTitle}>Présence dans les parcours</Text>
              <Pressable onPress={() => setShowParcoursList(false)} style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.pressedStyle]}>
                <X size={16} color="#334155" />
              </Pressable>
            </View>

            {showDeleteInfo && currentIsUsed ? (
              <Text style={styles.warningText}>
                Attention : cette balise est utilisée dans un ou plusieurs parcours. Elle ne peut pas être supprimée tant qu'elle y est encore liée.
              </Text>
            ) : null}

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {usageList.length === 0 ? (
                <View style={styles.noUsageWrap}>
                  <Text style={styles.noUsageText}>Aucun parcours trouvé.</Text>
                </View>
              ) : (
                usageList.map((p) => {
                  const checked = selectedParcoursIds.includes(p.id);

                  return (
                    <Pressable key={p.id} onPress={() => toggleParcoursSelection(p.id)} style={({ pressed }) => [styles.parcoursRow, checked && styles.parcoursRowChecked, pressed && styles.pressedStyle]}>
                      <View style={[styles.checkboxDark, checked && styles.checkboxDarkChecked]} />
                      <Text style={styles.parcoursName}>{p.nom}</Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>

            <View style={styles.modalActionsRow}>
              <Pressable onPress={() => setShowParcoursList(false)} style={({ pressed }) => [styles.secondaryBtnInline, pressed && styles.pressedStyle]}>
                <Text style={styles.secondaryBtnTxt}>Fermer</Text>
              </Pressable>

              <Pressable
                onPress={handleRemoveFromSelectedParcours}
                disabled={selectedParcoursIds.length === 0 || removingFromParcours}
                style={({ pressed }) => [
                  styles.removeFromParcoursBtn,
                  (selectedParcoursIds.length === 0 || removingFromParcours) && styles.removeFromParcoursBtnDisabled,
                  pressed && selectedParcoursIds.length > 0 && !removingFromParcours && styles.pressedStyle,
                ]}
              >
                <Text style={styles.removeFromParcoursBtnTxt}>{removingFromParcours ? "Retrait..." : "Retirer la balise"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showFormatPicker} animationType="fade" transparent={false} presentationStyle="fullScreen" onRequestClose={() => setShowFormatPicker(false)}>
        <SafeAreaView style={styles.fullModalRoot}>
          <StatusBar hidden />
          <View style={styles.fullModalOverlay}>
            <View style={styles.fullModalSheet}>
              <View style={styles.modalTopRow}>
                <Text style={styles.modalTitle}>Ajouter un format</Text>
                <Pressable onPress={() => setShowFormatPicker(false)} style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.pressedStyle]}>
                  <X size={16} color="#334155" />
                </Pressable>
              </View>

              {availableTypes.length === 0 ? (
                <Text style={styles.pickerEmptyText}>Les 4 formats sont déjà présents.</Text>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pickerScrollContent}>
                  <View style={styles.pickerGrid}>
                    {availableTypes.map((option) => (
                      <Pressable key={option.id} onPress={() => addFormat(option.id)} style={({ pressed }) => [styles.pickerItem, pressed && styles.pressedStyle]}>
                        <View style={styles.pickerItemRow}>
                          <PickerFormatIcon type={option.id} />
                          <Text style={styles.pickerItemTitleOnly}>{option.label}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

export default CreationBalise;

/* =========================
   Styles
========================= */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C_BG },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingText: { marginTop: 10, color: "rgba(15,23,42,0.7)", fontWeight: "600" },
  header: {
    backgroundColor: C_HEADER,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 6,
    zIndex: 20,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 44 },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnFrozenActive: { backgroundColor: C_BLUE_STRONG, borderColor: "rgba(255,255,255,0.18)" },
  iconBtnRed: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: C_RED,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnDisabled: { opacity: 0.45 },
  header2: {
    backgroundColor: C_HEADER_2,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    flexDirection: "row",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    zIndex: 10,
  },
  header2Chip: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  header2ChipSmall: {
    width: 96,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  header2LabelCentered: { color: "rgba(255,255,255,0.84)", fontSize: 11, fontWeight: "800", marginBottom: 4, textAlign: "center" },
  header2InputCentered: { color: "#fff", fontSize: 22, fontWeight: "900", paddingVertical: 0, minHeight: 28, width: "100%", textAlign: "center" },
  contentZone: { flex: 1, backgroundColor: C_CONTENT_BG, borderTopWidth: 1, borderTopColor: C_CONTENT_BORDER, overflow: "visible" },
  mainArea: { flex: 1, minHeight: 0, overflow: "visible" },
  formatsSection: { flex: 1, paddingTop: 2, overflow: "visible" },
  horizontalCardsContent: { alignItems: "flex-start", paddingTop: 0, paddingBottom: 118 },
  cardSlot: { justifyContent: "flex-start", alignItems: "center", overflow: "visible", zIndex: 10 },
  emptyStateWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, paddingBottom: 86 },
  emptyStateText: { color: C_MUTED, fontSize: 19, fontWeight: "800", textAlign: "center" },
  formatCard: {
    backgroundColor: C_CARD,
    borderWidth: 1.5,
    borderColor: C_CARD_BORDER,
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    overflow: "visible",
    ...(Platform.OS === "ios" ? IOS_SHADOW : {}),
    elevation: Platform.OS === "android" ? 3 : 0,
    zIndex: 20,
  },
  formatCardTopCompact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, minHeight: 32 },
  formatTitleTextCompact: { color: C_TEXT, fontWeight: "900", fontSize: 16, flex: 1 },
  compactHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 38, overflow: "visible", zIndex: 50 },
  compactHeaderTitle: { color: C_TEXT, fontWeight: "900", fontSize: 16, flexShrink: 0 },
  compactHeaderControls: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0, overflow: "visible", zIndex: 60 },
  closeMiniBtnCompact: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FCA5A5",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  editorBlockCompact: { marginTop: 10, gap: 8 },
  editorBlockCompactTight: { marginTop: 8, gap: 6 },
  cardInputCompact: {
    backgroundColor: "rgba(0,0,0,0.035)",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 14,
    color: C_TEXT,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ web: 12, default: 12 }),
    fontSize: 16,
  },
  gridPickerWrap: { flex: 1, position: "relative", zIndex: 9999, minWidth: 0, overflow: "visible" },
  gridPickerButton: {
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "#fff",
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  gridPickerButtonText: { color: C_TEXT, fontWeight: "800", fontSize: 14, flex: 1 },
  gridPickerMenu: {
    position: "absolute",
    top: 42,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C_BORDER,
    padding: 4,
    zIndex: 99999,
    elevation: 50,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
  },
  gridPickerItem: { paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8 },
  gridPickerItemActive: { backgroundColor: "rgba(37,99,235,0.10)" },
  gridPickerItemText: { color: C_TEXT, fontWeight: "700", fontSize: 13 },
  gridPickerItemTextActive: { color: C_BLUE_SOFT },
  fixedContentZone: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  whiteGridWrapCompact: { backgroundColor: "#fff", borderWidth: 1, borderColor: C_BORDER, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  whiteGridRowCompact: { flexDirection: "row" },
  whiteGridCellCompact: { borderRadius: 9, borderWidth: 1, borderColor: "#d1d5db", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  blackDotCompact: { width: 12, height: 12, borderRadius: 999, backgroundColor: "#111827" },
  qrActionRowCompact: { alignItems: "flex-end" },
  generateBtnCompact: { backgroundColor: C_BLUE_SOFT, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 8 },
  generateBtnTextCompact: { color: "#fff", fontWeight: "800", fontSize: 14 },
  fakeQrWrapCompact: { backgroundColor: "#fff", borderWidth: 1, borderColor: C_BORDER, borderRadius: 14, padding: 10 },
  fakeQrRow: { flexDirection: "row" },
  fakeQrPixelCompact: { width: 7, height: 7, backgroundColor: "#fff" },
  fakeQrPixelDark: { backgroundColor: "#111827" },
  tableFixedWrap: { backgroundColor: "#fff", borderWidth: 1, borderColor: C_BORDER, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  tableEditorRowCompact: { flexDirection: "row" },
  tableCellPressable: { backgroundColor: "#fff", borderWidth: 1, borderColor: C_BORDER, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  tableCellPressableText: { color: C_TEXT, fontSize: 13, fontWeight: "700", textAlign: "center" },
  tableCellPressablePlaceholder: { color: "rgba(15,23,42,0.35)", fontWeight: "600" },
  tableCellInputWeb: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 10,
    textAlign: "center",
    color: C_TEXT,
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 4,
    paddingVertical: 0,
    outlineStyle: "none" as any,
  },
  floatingEditorBar: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 100,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: C_BORDER,
    borderRadius: 18,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 12,
  },
  floatingEditorTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 },
  floatingEditorTitle: { color: C_TEXT, fontWeight: "900", fontSize: 15, flex: 1 },
  floatingEditorClose: { width: 30, height: 30, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" },
  floatingEditorInput: { backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: C_BORDER, borderRadius: 12, color: C_TEXT, paddingHorizontal: 12, paddingVertical: 12, fontSize: 18, fontWeight: "700" },
  floatingEditorActions: { marginTop: 10, flexDirection: "row", gap: 8 },
  floatingEditorGhostBtn: { flex: 1, backgroundColor: "rgba(0,0,0,0.06)", borderRadius: 12, paddingVertical: 11, alignItems: "center", justifyContent: "center" },
  floatingEditorGhostTxt: { color: C_TEXT, fontWeight: "800" },
  floatingEditorPrimaryBtn: { flex: 1, backgroundColor: C_BLUE_SOFT, borderRadius: 12, paddingVertical: 11, alignItems: "center", justifyContent: "center" },
  floatingEditorPrimaryTxt: { color: "#fff", fontWeight: "800" },
  fabWrap: { position: "absolute", bottom: 26, left: 0, right: 0, alignItems: "center", zIndex: 5 },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: C_SKY_STRONG,
    borderWidth: 1,
    borderColor: "#C9D5DF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
  fabDisabled: { opacity: 0.45 },
  fabText: { color: "#233548", fontWeight: "800" },
  paginationDots: { position: "absolute", left: 0, right: 0, bottom: 98, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, zIndex: 5 },
  paginationDot: { width: 9, height: 9, borderRadius: 999, backgroundColor: "rgba(15,23,42,0.18)" },
  paginationDotActive: { width: 22, backgroundColor: C_BLUE_SOFT },
  modalCenterRoot: { flex: 1, alignItems: "center", justifyContent: "center", padding: 18 },
  centerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  usageModalCard: { width: "100%", maxWidth: 620, backgroundColor: "#fff", borderRadius: 24, padding: 18, borderWidth: 1, borderColor: C_BORDER },
  modalTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  modalTitle: { color: C_TEXT, fontSize: 20, fontWeight: "900", flex: 1 },
  modalCloseBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.06)", alignItems: "center", justifyContent: "center" },
  pickerEmptyText: { color: C_MUTED, fontWeight: "600" },
  pickerScrollContent: { paddingBottom: 8 },
  pickerGrid: { gap: 10 },
  pickerItem: { backgroundColor: "#EAF3F9", borderWidth: 1, borderColor: "#C9D5DF", borderRadius: 16, padding: 16 },
  pickerItemRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  pickerItemTitleOnly: { color: C_TEXT, fontWeight: "900", fontSize: 18, flexShrink: 1 },
  noUsageWrap: { paddingVertical: 18, alignItems: "center" },
  noUsageText: { color: C_MUTED, fontWeight: "600" },
  warningText: { color: "#b45309", fontWeight: "700", lineHeight: 20, marginBottom: 12 },
  parcoursRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 13,
    marginBottom: 9,
  },
  parcoursRowChecked: { backgroundColor: "rgba(16,185,129,0.10)", borderColor: "rgba(16,185,129,0.35)" },
  parcoursName: { flex: 1, color: C_TEXT, fontWeight: "700" },
  checkboxDark: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: "rgba(0,0,0,0.3)", backgroundColor: "transparent" },
  checkboxDarkChecked: { backgroundColor: "#10b981", borderColor: "#10b981" },
  modalActionsRow: { marginTop: 12, flexDirection: "row", gap: 10, alignItems: "center" },
  secondaryBtnInline: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.06)" },
  secondaryBtnTxt: { color: C_TEXT, fontWeight: "800" },
  removeFromParcoursBtn: { flex: 1, backgroundColor: "#ef4444", paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  removeFromParcoursBtnDisabled: { opacity: 0.5 },
  removeFromParcoursBtnTxt: { color: "#fff", fontWeight: "800", textAlign: "center" },
  pressedStyle: { opacity: 0.82 },
  fullModalRoot: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)" },
  fullModalOverlay: { flex: 1, justifyContent: "center", padding: 16 },
  fullModalSheet: { width: "100%", maxWidth: 620, alignSelf: "center", backgroundColor: "#fff", borderRadius: 26, padding: 18, borderWidth: 1, borderColor: C_BORDER, maxHeight: "92%" },
  miniIconBox: { width: 74, height: 74, borderRadius: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(15,23,42,0.15)", alignItems: "center", justifyContent: "center", flexDirection: "row" },
  miniCodeA: { fontSize: 22, fontWeight: "900", color: "#1e293b" },
  miniCodek: { fontSize: 20, fontWeight: "900", color: "#2563eb", marginLeft: 1, marginTop: 3 },
  miniCode5: { fontSize: 22, fontWeight: "900", color: "#f59e0b", marginLeft: 2 },
  miniCodeBang: { fontSize: 22, fontWeight: "900", color: "#ef4444", marginLeft: 2 },
  miniGridBox: { width: 74, height: 74, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(15,23,42,0.15)", padding: 4, justifyContent: "center" },
  miniGridRow: { flexDirection: "row", flex: 1 },
  miniGridCell: { flex: 1, borderWidth: 0.5, borderColor: "rgba(15,23,42,0.35)", alignItems: "center", justifyContent: "center" },
  miniGridDot: { width: 9, height: 9, borderRadius: 999, backgroundColor: "#111827" },
  miniQrBox: { width: 74, height: 74, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(15,23,42,0.15)", padding: 6, alignItems: "center", justifyContent: "center" },
  miniQrRow: { flexDirection: "row" },
  miniQrPixel: { width: 5, height: 5, backgroundColor: "#fff" },
  miniQrPixelDark: { backgroundColor: "#111827" },
  miniTableBox: { width: 74, height: 74, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(15,23,42,0.15)", overflow: "hidden" },
  miniTableRow: { flexDirection: "row", flex: 1 },
  miniTableCell: { flex: 1, borderWidth: 0.5, borderColor: "rgba(15,23,42,0.35)", alignItems: "center", justifyContent: "center" },
  miniTableText: { fontSize: 13, fontWeight: "800", color: "#1f2937" },
  rows3IconWrap: { width: 16, height: 14, justifyContent: "space-between" },
  rows3Line: { height: 2.2, borderRadius: 999, width: "100%" },
  cols3IconWrap: { width: 16, height: 14, flexDirection: "row", justifyContent: "space-between" },
  cols3Line: { width: 2.2, borderRadius: 999, height: "100%" },
});
