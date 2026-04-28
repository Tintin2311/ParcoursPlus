import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  TextInput,
  useWindowDimensions,
  Modal,
  Pressable,
  FlatList,
  Keyboard,
  ScrollView,
  ActivityIndicator,
  LayoutChangeEvent,
} from "react-native";
import BottomBar from "./ui/BottomBar";
import { ArrowLeft, Trash2, Palette as PaletteIcon, Plus, X, Check } from "lucide-react-native";
import { supabase } from "./supabaseClient";
import { GestureHandlerRootView, Swipeable, RectButton } from "react-native-gesture-handler";

/* ======================= Types ======================= */
type ConditionType = "=" | "≥" | "≤" | "entre";

type Row = {
  id: string;
  teacher_id: string;
  order_index: number;
  condition_type: ConditionType;
  attempts_value: number | null;
  attempts_min: number | null;
  attempts_max: number | null;
  points: number;
  color_hex: string;
  attempt_page: number;
  created_at?: string | null;
};

type PageRow = {
  id: string;
  teacher_id: string;
  page_number: number;
  page_name: string;
  created_at?: string | null;
};

type Props = {
  setPage: (p: string) => void;
};

type HSVColor = { h: number; s: number; v: number };

/* ======================= Thème ======================= */
const C_BG = "#F2F5F8";
const C_HEADER = "#A9C7D6";
const C_TEXT = "#0f172a";
const C_BORDER = "rgba(15,23,42,0.10)";
const BOTTOM_BAR_HEIGHT = 78;

/* ======================= Supabase ======================= */
const TABLE = "group_tentative_baremes";
const TABLE_PAGES = "group_tentative_bareme_pages";

/* ======================= ColorWheel (optional) ======================= */
let ColorWheel: any = null;
let WheelColorPicker: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ColorWheel = require("react-native-color-wheel").ColorWheel;
} catch {
  ColorWheel = null;
}
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WheelColorPicker = require("react-native-wheel-color-picker").default;
} catch {
  WheelColorPicker = null;
}

/* ======================= Helpers ======================= */
const withAlpha = (hex: string, a: number) => {
  const h = (hex || "#000000").replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
};

const clamp = (n: number, min = 0, max = 255) => Math.max(min, Math.min(max, n));

const rgbToHex = (r: number, g: number, b: number) => {
  const toHex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${toHex(clamp(r))}${toHex(clamp(g))}${toHex(clamp(b))}`;
};

const hsvToHex = (h: number, s: number, v: number) => {
  const hNorm = h > 1 ? (h % 360) / 60 : h * 6;
  const i = Math.floor(hNorm);
  const f = hNorm - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r = 0;
  let g = 0;
  let b = 0;

  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    default:
      r = v;
      g = p;
      b = q;
      break;
  }

  return rgbToHex(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
};

const formatPoints = (p: number) => (Number.isFinite(p) ? String(p).replace(".", ",") : "0");

const parsePointsInput = (v: string) => {
  const cleaned = (v || "").replace(",", ".").replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

const toIntOrNull = (v: string) => {
  const cleaned = (v || "").replace(/[^0-9]/g, "");
  if (!cleaned) return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
};

const normalizeHex = (v: string) => {
  const s = (v || "").trim();
  if (!s) return "#000000";
  const t = s.startsWith("#") ? s : `#${s}`;
  return /^#[0-9a-fA-F]{6}$/.test(t) ? t : "#000000";
};

const getConditionLabel = (type: ConditionType) => {
  switch (type) {
    case "=":
      return "Égale à";
    case "≥":
      return "Supérieur ou égal à";
    case "≤":
      return "Inférieur ou égal à";
    case "entre":
      return "De X à X";
    default:
      return "";
  }
};

const getAttemptsLabel = (n: number | null | undefined) => {
  return Number(n) === 1 ? "tentative" : "tentatives";
};

const IntervalGlyph: React.FC<{ size: number; stroke?: string }> = ({
  size,
  stroke = C_TEXT,
}) => {
  const t = Math.max(2, Math.round(size * 0.09));
  const h = Math.round(size * 0.86);
  const w = Math.round(size * 0.94);
  const vPad = Math.round((size - h) / 2);

  return (
    <View
      style={{
        width: w,
        height: size,
        paddingVertical: vPad,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View
        style={{
          width: Math.round(w * 0.34),
          height: h,
          borderLeftWidth: t,
          borderTopWidth: t,
          borderBottomWidth: t,
          borderColor: stroke,
        }}
      />
      <View style={{ width: Math.round(w * 0.1) }} />
      <View
        style={{
          width: Math.round(w * 0.34),
          height: h,
          borderRightWidth: t,
          borderTopWidth: t,
          borderBottomWidth: t,
          borderColor: stroke,
        }}
      />
    </View>
  );
};

async function resolveTeacherId(): Promise<string | null> {
  try {
    const auth = await supabase.auth.getUser();
    return auth.data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/* ======================= Page ======================= */
const GestionResultatsTentatives: React.FC<Props> = ({ setPage }) => {
  const { width: winW } = useWindowDimensions();
  const COMPACT = winW < 370;
  const IS_SMALL_SCREEN = winW < 430;
  const SPACING = winW >= 768 ? 20 : 12;
  const HPAD = Math.max(12, Math.min(20, Math.round(winW * 0.04)));
  const wheelSize = Math.min(320, winW - 40);

  const IS_WEB = Platform.OS === "web";
  const ENABLE_SWIPE = !IS_WEB;

  const PALETTE = useMemo(
    () => [
      "#22C55E",
      "#059669",
      "#F59E0B",
      "#FB923C",
      "#EF4444",
      "#3B82F6",
      "#1E3A8A",
      "#8B5CF6",
      "#06B6D4",
      "#111827",
    ],
    []
  );

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [teacherReady, setTeacherReady] = useState(false);

  const [pages, setPages] = useState<PageRow[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingError, setSavingError] = useState<string | null>(null);

  const [symbolPickerFor, setSymbolPickerFor] = useState<string | null>(null);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [wheelVisible, setWheelVisible] = useState(false);
  const [hex, setHex] = useState("#3B82F6");
  const [hexInput, setHexInput] = useState("#3B82F6");

  const [editing, setEditing] = useState<{ id: string; field: "attempts" | "points" } | null>(
    null
  );
  const [temp, setTemp] = useState<string>("");

  const [editingPageTitle, setEditingPageTitle] = useState(false);
  const [pageTitleDraft, setPageTitleDraft] = useState("");

  const flushTimer = useRef<any>(null);
  const pendingById = useRef<Map<string, Partial<Row>>>(new Map());
  const deletingIds = useRef<Set<string>>(new Set());
  const swipeRefs = useRef<Map<string, Swipeable>>(new Map());

  const listRef = useRef<FlatList<Row> | null>(null);
  const pendingScrollToBottom = useRef(false);

  const [fabH, setFabH] = useState(0);
  const EXTRA_BOTTOM = BOTTOM_BAR_HEIGHT + fabH + 22;

  const insertingRef = useRef(false);
  const [inserting, setInserting] = useState(false);

  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const reportSb = (ctx: string, err: any, showToUser = true) => {
    const msg =
      (err?.message as string) ||
      (err?.error_description as string) ||
      JSON.stringify(err);
    console.error(`[Supabase] ${ctx}`, err);
    if (showToUser) setSavingError(`${ctx}: ${msg}`);
  };

  /* ========= Boot teacher ========= */
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      setSavingError(null);

      try {
        const tid = await resolveTeacherId();
        if (cancelled) return;
        setTeacherId(tid);
        setTeacherReady(!!tid);
      } catch (e: any) {
        if (!cancelled) {
          setTeacherId(null);
          setTeacherReady(false);
          setSavingError(e?.message || "Impossible de retrouver le professeur connecté.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ========= LOAD PAGES ========= */
  useEffect(() => {
    let cancelled = false;

    const loadPages = async () => {
      if (!teacherReady || !teacherId) {
        if (!cancelled) {
          setPages([]);
          setCurrentPage(1);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from(TABLE_PAGES)
          .select("id, teacher_id, page_number, page_name, created_at")
          .eq("teacher_id", teacherId)
          .order("page_number", { ascending: true });

        if (error) {
          reportSb("LOAD_PAGES", error);
          if (!cancelled) setPages([]);
          return;
        }

        let list: PageRow[] = (data || []).map((p: any) => ({
          id: String(p.id),
          teacher_id: String(p.teacher_id),
          page_number: Number(p.page_number ?? 1),
          page_name: String(p.page_name || `PAGE ${Number(p.page_number ?? 1)}`),
          created_at: p.created_at ?? null,
        }));

        if (list.length === 0) {
          const { data: ins, error: insErr } = await supabase
            .from(TABLE_PAGES)
            .insert({
              teacher_id: teacherId,
              page_number: 1,
              page_name: "PAGE 1",
            })
            .select("id, teacher_id, page_number, page_name, created_at")
            .single();

          if (!insErr && ins) {
            list = [
              {
                id: String((ins as any).id),
                teacher_id: String((ins as any).teacher_id),
                page_number: Number((ins as any).page_number ?? 1),
                page_name: String((ins as any).page_name || "PAGE 1"),
                created_at: (ins as any).created_at ?? null,
              },
            ];
          }
        }

        if (!cancelled) {
          setPages(list);
          const exists = list.some((p) => p.page_number === currentPage);
          if (!exists) setCurrentPage(list[0]?.page_number ?? 1);
        }
      } catch (e) {
        console.error("LOAD_PAGES crash:", e);
        if (!cancelled) setPages([]);
      }
    };

    loadPages();
    return () => {
      cancelled = true;
    };
  }, [teacherReady, teacherId, currentPage]);

  const currentPageObj = useMemo(
    () => pages.find((p) => p.page_number === currentPage) || null,
    [pages, currentPage]
  );

  useEffect(() => {
    if (currentPageObj) setPageTitleDraft(currentPageObj.page_name);
  }, [currentPageObj?.id]);

  /* ========= Scroll helper ========= */
  const scrollToVeryBottom = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        listRef.current?.scrollToEnd({ animated: true });
      });
    });
  }, []);

  const requestScrollToBottomAfterAdd = useCallback(() => {
    pendingScrollToBottom.current = true;
    setTimeout(() => scrollToVeryBottom(), 60);
  }, [scrollToVeryBottom]);

  const onContentSizeChange = useCallback(() => {
    if (pendingScrollToBottom.current) {
      pendingScrollToBottom.current = false;
      scrollToVeryBottom();
    }
  }, [scrollToVeryBottom]);

  /* ========= Flush updates ========= */
  const scheduleFlush = () => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(async () => {
      flushTimer.current = null;
      if (!teacherId) return;

      const entries = Array.from(pendingById.current.entries());
      pendingById.current.clear();
      if (entries.length === 0) return;

      try {
        setSavingError(null);

        for (const [id, patch] of entries) {
          if (deletingIds.current.has(id)) continue;

          const payload: any = {};
          if (patch.order_index !== undefined) payload.order_index = patch.order_index;
          if (patch.condition_type !== undefined) payload.condition_type = patch.condition_type;
          if (patch.attempts_value !== undefined) payload.attempts_value = patch.attempts_value;
          if (patch.attempts_min !== undefined) payload.attempts_min = patch.attempts_min;
          if (patch.attempts_max !== undefined) payload.attempts_max = patch.attempts_max;
          if (patch.points !== undefined) payload.points = patch.points;
          if (patch.color_hex !== undefined) payload.color_hex = patch.color_hex;

          const { error } = await supabase
            .from(TABLE)
            .update(payload)
            .eq("id", id)
            .eq("teacher_id", teacherId);

          if (error) {
            reportSb("UPDATE", error);
            break;
          }
        }
      } catch (e) {
        console.error("FLUSH crash:", e);
        setSavingError("Erreur sauvegarde (voir console).");
      }
    }, 300);
  };

  const patchRowLocalAndRemote = (id: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    const cur = pendingById.current.get(id) || {};
    pendingById.current.set(id, { ...cur, ...patch });
    scheduleFlush();
  };

  /* ========= Actions ========= */
  const handleBack = () => {
    setSymbolPickerFor(null);
    setColorPickerFor(null);
    setWheelVisible(false);
    Keyboard.dismiss();
    setPage("GestionResultats");
  };

  const closeAllSwipes = () => {
    if (!ENABLE_SWIPE) return;
    swipeRefs.current.forEach((ref) => ref?.close?.());
  };

  const calcNextAttemptsValue = () => {
    const maxValue = rows.reduce((acc, r) => {
      const v =
        r.condition_type === "entre"
          ? Math.max(acc, Number(r.attempts_max ?? 0))
          : Math.max(acc, Number(r.attempts_value ?? 0));
      return v;
    }, 0);
    return maxValue + 1;
  };

  const getNextOrderIndexCandidate = () => {
    const maxLoaded = rows.reduce(
      (m, r) => (Number.isFinite(r.order_index) ? Math.max(m, r.order_index) : m),
      0
    );
    return Math.max(0, maxLoaded) + 1;
  };

  const normalizeOrderIndexesIfNeeded = useCallback(
    async (list: Row[]) => {
      if (!teacherId || !teacherReady) return;
      if (!list || list.length <= 1) return;

      const maxIdx = list.reduce((m, r) => Math.max(m, Number(r.order_index ?? 0)), 0);
      const sorted = [...list].sort((a, b) => a.order_index - b.order_index);

      let gapCrazy = false;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].order_index - sorted[i - 1].order_index > 1000) {
          gapCrazy = true;
          break;
        }
      }

      const needs = maxIdx > 10000 || gapCrazy;
      if (!needs) return;

      const targetFinal = sorted.map((r, i) => ({ id: r.id, order_index: i + 1 }));

      setRows((prev) => {
        const map = new Map(targetFinal.map((t) => [t.id, t.order_index]));
        return prev
          .map((r) => (map.has(r.id) ? { ...r, order_index: map.get(r.id)! } : r))
          .sort((a, b) => a.order_index - b.order_index);
      });

      try {
        for (let i = 0; i < targetFinal.length; i++) {
          const id = targetFinal[i].id;
          const tmp = -(i + 1);
          const { error } = await supabase
            .from(TABLE)
            .update({ order_index: tmp })
            .eq("id", id)
            .eq("teacher_id", teacherId);

          if (error) {
            reportSb("NORMALIZE_TMP", error, false);
            return;
          }
        }

        for (const t of targetFinal) {
          const { error } = await supabase
            .from(TABLE)
            .update({ order_index: t.order_index })
            .eq("id", t.id)
            .eq("teacher_id", teacherId);

          if (error) {
            reportSb("NORMALIZE_FINAL", error, false);
            return;
          }
        }
      } catch (e) {
        console.error("NORMALIZE crash:", e);
      }
    },
    [teacherId, teacherReady]
  );

  /* ========= LOAD ROWS ========= */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!teacherReady || !teacherId) {
        if (!cancelled) setRows([]);
        return;
      }

      setLoading(true);
      setSavingError(null);

      try {
        const { data, error } = await supabase
          .from(TABLE)
          .select(
            "id, teacher_id, order_index, condition_type, attempts_value, attempts_min, attempts_max, points, color_hex, attempt_page, created_at"
          )
          .eq("teacher_id", teacherId)
          .eq("attempt_page", currentPage)
          .order("order_index", { ascending: true });

        if (error) {
          reportSb("LOAD", error);
          if (!cancelled) setRows([]);
        } else {
          const clean = (data || []).map((r: any) => ({
            id: String(r.id),
            teacher_id: String(r.teacher_id),
            order_index: Number(r.order_index ?? 0),
            condition_type: (r.condition_type as ConditionType) || "=",
            attempts_value: r.attempts_value == null ? null : Number(r.attempts_value),
            attempts_min: r.attempts_min == null ? null : Number(r.attempts_min),
            attempts_max: r.attempts_max == null ? null : Number(r.attempts_max),
            points: Number(r.points ?? 0),
            color_hex: String(r.color_hex || "#3B82F6"),
            attempt_page: Number(r.attempt_page ?? currentPage),
            created_at: r.created_at ?? null,
          })) as Row[];

          if (!cancelled) setRows(clean);

          setTimeout(() => {
            if (!cancelled) normalizeOrderIndexesIfNeeded(clean);
          }, 0);
        }
      } catch (e) {
        console.error("LOAD crash:", e);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [teacherReady, teacherId, currentPage, normalizeOrderIndexesIfNeeded]);

  /* ========= Add condition ========= */
  const onAddCondition = async () => {
    if (!teacherReady || !teacherId) return;
    if (loading) return;
    if (insertingRef.current) return;

    insertingRef.current = true;
    setInserting(true);
    setSavingError(null);
    closeAllSwipes();

    const attempts_value = calcNextAttemptsValue();

    try {
      let lastErr: any = null;
      let order_index = getNextOrderIndexCandidate();

      for (let attempt = 0; attempt < 40; attempt++) {
        const { data, error } = await supabase
          .from(TABLE)
          .insert({
            teacher_id: teacherId,
            attempt_page: currentPage,
            order_index,
            condition_type: "=",
            attempts_value,
            attempts_min: null,
            attempts_max: null,
            points: 0,
            color_hex: "#3B82F6",
          })
          .select(
            "id, teacher_id, order_index, condition_type, attempts_value, attempts_min, attempts_max, points, color_hex, attempt_page, created_at"
          )
          .single();

        if (!error && data) {
          const inserted: Row = {
            id: String((data as any).id),
            teacher_id: String((data as any).teacher_id),
            order_index: Number((data as any).order_index ?? order_index),
            condition_type: ((data as any).condition_type as ConditionType) || "=",
            attempts_value:
              (data as any).attempts_value == null ? null : Number((data as any).attempts_value),
            attempts_min:
              (data as any).attempts_min == null ? null : Number((data as any).attempts_min),
            attempts_max:
              (data as any).attempts_max == null ? null : Number((data as any).attempts_max),
            points: Number((data as any).points ?? 0),
            color_hex: String((data as any).color_hex || "#3B82F6"),
            attempt_page: Number((data as any).attempt_page ?? currentPage),
            created_at: (data as any).created_at ?? null,
          };

          setRows((prev) => [...prev, inserted].sort((a, b) => a.order_index - b.order_index));
          requestScrollToBottomAfterAdd();
          setTimeout(() => normalizeOrderIndexesIfNeeded([...rows, inserted]), 0);
          return;
        }

        if ((error as any)?.code === "23505") {
          lastErr = error;
          order_index += 1;
          continue;
        }

        lastErr = error;
        break;
      }

      if (lastErr) {
        console.log("INSERT ERROR FULL:", JSON.stringify(lastErr, null, 2));
        reportSb("INSERT", lastErr);
      }
    } catch (e) {
      console.error("INSERT crash:", e);
      setSavingError("Erreur INSERT (voir console).");
    } finally {
      insertingRef.current = false;
      setInserting(false);
    }
  };

  const requestDelete = (id: string) => {
    closeAllSwipes();
    setConfirmingDeleteId(id);
  };

  const doDelete = async (id: string) => {
    if (!teacherId) return;

    swipeRefs.current.get(id)?.close?.();
    deletingIds.current.add(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
    setConfirmingDeleteId(null);

    try {
      const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq("id", id)
        .eq("teacher_id", teacherId);

      if (error) reportSb("DELETE", error);
    } catch (e) {
      console.error("DELETE crash:", e);
      setSavingError("Erreur DELETE (voir console).");
    } finally {
      deletingIds.current.delete(id);
    }
  };

  /* ========= Pages ========= */
  const canAddPage = pages.length < 10;

  const createPage = async () => {
    if (!teacherId || !teacherReady) return;
    if (!canAddPage) return;

    const nextNum = Math.max(0, ...pages.map((p) => p.page_number)) + 1;
    const name = `PAGE ${nextNum}`;

    try {
      const { data, error } = await supabase
        .from(TABLE_PAGES)
        .insert({
          teacher_id: teacherId,
          page_number: nextNum,
          page_name: name,
        })
        .select("id, teacher_id, page_number, page_name, created_at")
        .single();

      if (error) {
        reportSb("CREATE_PAGE", error);
        return;
      }

      const inserted: PageRow = {
        id: String((data as any).id),
        teacher_id: String((data as any).teacher_id),
        page_number: Number((data as any).page_number ?? nextNum),
        page_name: String((data as any).page_name || name),
        created_at: (data as any).created_at ?? null,
      };

      const newPages = [...pages, inserted].sort((a, b) => a.page_number - b.page_number);
      setPages(newPages);
      setCurrentPage(inserted.page_number);
    } catch (e) {
      console.error("CREATE_PAGE crash:", e);
      setSavingError("Erreur création page (voir console).");
    }
  };

  const deleteCurrentPage = async () => {
    if (!teacherId || !teacherReady) return;
    if (pages.length <= 1) return;
    setConfirmingDeleteId(`__PAGE__${currentPage}`);
  };

  const doDeletePage = async () => {
    if (!teacherId || !teacherReady) return;
    if (pages.length <= 1) return;

    const pageToDelete = currentPage;
    setConfirmingDeleteId(null);

    try {
      const { error: delCondErr } = await supabase
        .from(TABLE)
        .delete()
        .eq("teacher_id", teacherId)
        .eq("attempt_page", pageToDelete);

      if (delCondErr) reportSb("DELETE_PAGE_CONDITIONS", delCondErr);

      const p = pages.find((x) => x.page_number === pageToDelete);
      if (p) {
        const { error: delPageErr } = await supabase
          .from(TABLE_PAGES)
          .delete()
          .eq("id", p.id)
          .eq("teacher_id", teacherId);

        if (delPageErr) reportSb("DELETE_PAGE", delPageErr);
      }

      const remaining = pages
        .filter((x) => x.page_number !== pageToDelete)
        .sort((a, b) => a.page_number - b.page_number);

      setPages(remaining);
      setCurrentPage(remaining[0]?.page_number ?? 1);
    } catch (e) {
      console.error("DELETE_PAGE crash:", e);
      setSavingError("Erreur suppression page (voir console).");
    }
  };

  const savePageTitle = async () => {
    if (!teacherId || !teacherReady || !currentPageObj) return;
    const newName = (pageTitleDraft || "").trim() || `PAGE ${currentPage}`;

    try {
      const { error } = await supabase
        .from(TABLE_PAGES)
        .update({ page_name: newName })
        .eq("id", currentPageObj.id)
        .eq("teacher_id", teacherId);

      if (error) {
        reportSb("UPDATE_PAGE_NAME", error);
        return;
      }

      setPages((prev) =>
        prev.map((p) => (p.id === currentPageObj.id ? { ...p, page_name: newName } : p))
      );
      setEditingPageTitle(false);
    } catch (e) {
      console.error("UPDATE_PAGE_NAME crash:", e);
      setSavingError("Erreur renommage page (voir console).");
    }
  };

  /* ========= Symbol picker ========= */
  const openSymbolPicker = (id: string) => {
    closeAllSwipes();
    setSymbolPickerFor(id);
  };

  const applySymbol = (val: ConditionType) => {
    const id = symbolPickerFor;
    if (!id) return;

    const r = rows.find((x) => x.id === id);
    if (!r) {
      setSymbolPickerFor(null);
      return;
    }

    if (val === "entre") {
      const base =
        r.condition_type === "entre"
          ? Number(r.attempts_min ?? 1)
          : Number(r.attempts_value ?? 1);

      patchRowLocalAndRemote(id, {
        condition_type: "entre",
        attempts_value: null,
        attempts_min: base,
        attempts_max: base + 3,
      });
    } else {
      const base =
        r.condition_type === "entre"
          ? Number(r.attempts_min ?? 1)
          : Number(r.attempts_value ?? 1);

      patchRowLocalAndRemote(id, {
        condition_type: val,
        attempts_value: base,
        attempts_min: null,
        attempts_max: null,
      });
    }

    setSymbolPickerFor(null);
  };

  /* ========= Inline edit ========= */
  const startEdit = (id: string, field: "attempts" | "points") => {
    closeAllSwipes();
    const r = rows.find((x) => x.id === id);
    if (!r) return;

    if (field === "attempts" && r.condition_type === "entre") return;

    setEditing({ id, field });
    if (field === "points") setTemp(formatPoints(r.points));
    else setTemp(String(r.attempts_value ?? ""));
  };

  const commitEdit = () => {
    if (!editing) return;
    const { id, field } = editing;

    const r = rows.find((x) => x.id === id);
    if (!r) {
      setEditing(null);
      setTemp("");
      return;
    }

    if (field === "points") {
      patchRowLocalAndRemote(id, { points: parsePointsInput(temp) });
    } else if (r.condition_type !== "entre") {
      patchRowLocalAndRemote(id, { attempts_value: toIntOrNull(temp) ?? 0 });
    }

    setEditing(null);
    setTemp("");
  };

  /* ========= Color picker ========= */
  const openColorPicker = (id: string) => {
    closeAllSwipes();
    const r = rows.find((x) => x.id === id);
    if (!r) return;

    setColorPickerFor(id);
    const base = r.color_hex || "#3B82F6";
    setHex(base);
    setHexInput(base.toUpperCase());
  };

  const applyColor = (color: string) => {
    const id = colorPickerFor;
    if (!id) return;
    const c = normalizeHex(color);
    setHex(c);
    setHexInput(c.toUpperCase());
    patchRowLocalAndRemote(id, { color_hex: c });
  };

  /* ========= Swipe actions ========= */
  const renderRightActions = (id: string) => {
    return (
      <View style={styles.rightActionsWrap}>
        <RectButton style={styles.swipeDeleteBtn} onPress={() => requestDelete(id)}>
          <Trash2 size={20} color="#991b1b" />
        </RectButton>
      </View>
    );
  };

  /* ========= Render ========= */
  const renderRowCard = (item: Row) => {
    const bg = withAlpha(item.color_hex, 0.12);
    const border = withAlpha(item.color_hex, 0.45);

    const symbolSize = COMPACT ? 18 : Math.min(22, Math.round(winW * 0.05));
    const valueSize = COMPACT ? 16 : Math.min(20, Math.round(winW * 0.048));

    return (
      <Pressable
        onPress={() => swipeRefs.current.get(item.id)?.close?.()}
        style={[styles.card, { borderColor: border, backgroundColor: bg }]}
      >
        <View style={styles.row}>
          <TouchableOpacity
            style={[styles.cellSymbol, COMPACT && styles.cellSymbolCompact]}
            onPress={() => openSymbolPicker(item.id)}
            activeOpacity={0.9}
          >
            {item.condition_type === "entre" ? (
              <IntervalGlyph size={symbolSize} />
            ) : (
              <Text style={[styles.symbolTxt, { fontSize: symbolSize }]}>{item.condition_type}</Text>
            )}
          </TouchableOpacity>

          {item.condition_type === "entre" ? (
            <View style={[styles.cellRange, COMPACT && styles.cellRangeCompact]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
                <TextInput
                  value={item.attempts_min === null ? "" : String(item.attempts_min)}
                  onChangeText={(v) =>
                    patchRowLocalAndRemote(item.id, { attempts_min: toIntOrNull(v) })
                  }
                  keyboardType="number-pad"
                  returnKeyType="done"
                  style={[styles.inlineInput, styles.inputSlim]}
                  placeholder="5"
                  placeholderTextColor="rgba(0,0,0,0.35)"
                />
                <Text style={styles.sepTxt}> à </Text>
                <TextInput
                  value={item.attempts_max === null ? "" : String(item.attempts_max)}
                  onChangeText={(v) =>
                    patchRowLocalAndRemote(item.id, { attempts_max: toIntOrNull(v) })
                  }
                  keyboardType="number-pad"
                  returnKeyType="done"
                  style={[styles.inlineInput, styles.inputSlim]}
                  placeholder="8"
                  placeholderTextColor="rgba(0,0,0,0.35)"
                />
              </View>
              <Text style={styles.metaTxtCentered}>tentatives</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.cellValue, COMPACT && styles.cellValueCompact]}
              onPress={() => startEdit(item.id, "attempts")}
              activeOpacity={0.9}
            >
              {editing && editing.id === item.id && editing.field === "attempts" ? (
                <>
                  <TextInput
                    autoFocus
                    value={temp}
                    onChangeText={setTemp}
                    onSubmitEditing={commitEdit}
                    onBlur={commitEdit}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    style={[styles.inlineInput, { minWidth: 42, textAlign: "center" }]}
                  />
                  <Text style={styles.metaTxtCentered}>
                    {getAttemptsLabel(toIntOrNull(temp) ?? 0)}
                  </Text>
                </>
              ) : (
                <>
                  <Text
                    style={[styles.valueTxt, { fontSize: valueSize }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {String(item.attempts_value ?? "")}
                  </Text>
                  <Text style={styles.metaTxtCentered}>
                    {getAttemptsLabel(item.attempts_value)}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.cellPoints, COMPACT && styles.cellPointsCompact]}
            onPress={() => startEdit(item.id, "points")}
            activeOpacity={0.9}
          >
            {editing && editing.id === item.id && editing.field === "points" ? (
              <>
                <TextInput
                  autoFocus
                  value={temp}
                  onChangeText={setTemp}
                  onSubmitEditing={commitEdit}
                  onBlur={commitEdit}
                  keyboardType={Platform.OS === "ios" ? "numbers-and-punctuation" : "decimal-pad"}
                  returnKeyType="done"
                  style={[styles.inlineInput, { minWidth: 52, textAlign: "center" }]}
                />
                <Text style={styles.metaTxtCentered}>points</Text>
              </>
            ) : (
              <>
                <Text
                  style={[styles.valueTxt, { fontSize: valueSize }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatPoints(item.points)}
                </Text>
                <Text style={styles.metaTxtCentered}>points</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.colorDotWrap}
            onPress={() => openColorPicker(item.id)}
            activeOpacity={0.9}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View
              style={[
                styles.colorDot,
                { backgroundColor: item.color_hex, borderColor: withAlpha("#000", 0.25) },
              ]}
            />
          </TouchableOpacity>

          {IS_WEB ? (
            <TouchableOpacity
              onPress={() => requestDelete(item.id)}
              style={styles.webDeleteBtn}
              activeOpacity={0.9}
            >
              <Trash2 size={18} color="#991b1b" />
            </TouchableOpacity>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const renderItem = ({ item }: { item: Row }) => {
    if (ENABLE_SWIPE) {
      return (
        <View style={styles.itemWrap}>
          <Swipeable
            ref={(ref) => {
              if (ref) swipeRefs.current.set(item.id, ref);
            }}
            renderRightActions={() => renderRightActions(item.id)}
            overshootRight={false}
            rightThreshold={18}
            friction={2}
            onSwipeableWillOpen={() => {
              swipeRefs.current.forEach((r, key) => {
                if (key !== item.id) r?.close?.();
              });
            }}
          >
            {renderRowCard(item)}
          </Swipeable>
        </View>
      );
    }

    return <View style={styles.itemWrap}>{renderRowCard(item)}</View>;
  };

  const empty = !loading && rows.length === 0;

  const renderPagesBar = () => {
    return (
      <View style={styles.pagesBar}>
        <View style={styles.pagesRow}>
          {pages
            .slice()
            .sort((a, b) => a.page_number - b.page_number)
            .map((p) => {
              const active = p.page_number === currentPage;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => setCurrentPage(p.page_number)}
                  style={[styles.pageBtn, active ? styles.pageBtnActive : null]}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.pageBtnTxt, active ? styles.pageBtnTxtActive : null]}>
                    {p.page_number}
                  </Text>
                </TouchableOpacity>
              );
            })}

          <TouchableOpacity
            onPress={createPage}
            disabled={!canAddPage || !teacherId}
            style={[
              styles.pageBtn,
              styles.pageBtnAdd,
              (!canAddPage || !teacherId) && { opacity: 0.35 },
            ]}
            activeOpacity={0.9}
          >
            <Plus size={16} color={C_TEXT} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={deleteCurrentPage}
            disabled={!teacherId || pages.length <= 1}
            style={[
              styles.pageBtn,
              styles.pageBtnDel,
              (!teacherId || pages.length <= 1) && { opacity: 0.35 },
            ]}
            activeOpacity={0.9}
          >
            <Trash2 size={16} color="#991b1b" />
          </TouchableOpacity>
        </View>

        <View style={styles.pageTitleRow}>
          {editingPageTitle ? (
            <TextInput
              value={pageTitleDraft}
              onChangeText={setPageTitleDraft}
              onBlur={savePageTitle}
              onSubmitEditing={savePageTitle}
              autoFocus
              style={styles.pageTitleInput}
              returnKeyType="done"
              placeholder={`PAGE ${currentPage}`}
              placeholderTextColor="rgba(15,23,42,0.35)"
            />
          ) : (
            <TouchableOpacity
              onPress={() => setEditingPageTitle(true)}
              activeOpacity={0.85}
              style={styles.pageTitleTouch}
            >
              <Text style={styles.pageTitleTxt} numberOfLines={1} adjustsFontSizeToFit>
                {currentPageObj?.page_name || `PAGE ${currentPage}`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const confirmIsPage = confirmingDeleteId?.startsWith("__PAGE__") ?? false;
  const confirmPageNumber = confirmIsPage
    ? Number((confirmingDeleteId || "").replace("__PAGE__", ""))
    : null;

  const selectedCondition =
    symbolPickerFor != null
      ? rows.find((r) => r.id === symbolPickerFor)?.condition_type ?? null
      : null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C_BG }}>
      <SafeAreaView style={[styles.root, { backgroundColor: C_BG }]}>
        <View style={styles.header}>
          <View style={styles.headerSide}>
            <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.9}>
              <ArrowLeft size={18} color={C_TEXT} />
              <Text style={styles.backTxt}>Retour</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit>
              Tentatives
            </Text>
          </View>

          <View style={[styles.headerSide, { alignItems: "flex-end" }]}>
            <View style={{ height: 36 }} />
          </View>
        </View>

        {renderPagesBar()}

        <View style={{ flex: 1 }}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator />
              <Text style={{ marginTop: 8, fontWeight: "800", color: "rgba(15,23,42,0.7)" }}>
                Chargement…
              </Text>
            </View>
          ) : !teacherId ? (
            <View style={styles.center}>
              <Text style={{ fontWeight: "900", fontSize: 16, color: C_TEXT }}>
                Professeur introuvable
              </Text>
              <Text
                style={{
                  marginTop: 6,
                  fontWeight: "700",
                  color: "rgba(15,23,42,0.7)",
                  textAlign: "center",
                }}
              >
                Impossible de retrouver le compte connecté.
              </Text>
            </View>
          ) : empty ? (
            <View style={styles.center}>
              <Text style={{ fontWeight: "900", fontSize: 16, color: C_TEXT }}>Page vide</Text>
              <Text
                style={{
                  marginTop: 6,
                  fontWeight: "700",
                  color: "rgba(15,23,42,0.7)",
                  textAlign: "center",
                }}
              >
                Appuie sur “Ajouter une condition”.
              </Text>
            </View>
          ) : (
            <FlatList
              ref={(r) => {
                listRef.current = r;
              }}
              data={rows}
              keyExtractor={(it) => it.id}
              renderItem={renderItem}
              style={{ flex: 1 }}
              contentContainerStyle={{
                paddingHorizontal: HPAD,
                paddingTop: SPACING,
                paddingBottom: EXTRA_BOTTOM,
              }}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={() => {
                Keyboard.dismiss();
                closeAllSwipes();
              }}
              onContentSizeChange={onContentSizeChange}
              showsVerticalScrollIndicator
            />
          )}
        </View>

        <View
          pointerEvents="box-none"
          style={[
            styles.fabWrap,
            {
              bottom: BOTTOM_BAR_HEIGHT + 10,
            },
          ]}
          onLayout={(e: LayoutChangeEvent) => setFabH(e.nativeEvent.layout.height)}
        >
          <TouchableOpacity
            onPress={onAddCondition}
            style={[styles.fabBtn, (!teacherReady || loading || inserting) && { opacity: 0.55 }]}
            activeOpacity={0.92}
            disabled={!teacherReady || loading || inserting}
          >
            <Plus size={18} color="#ffffff" />
            <Text style={styles.fabTxt}>{inserting ? "Ajout…" : "Ajouter une condition"}</Text>
          </TouchableOpacity>

          {savingError ? (
            <TouchableOpacity
              onPress={() => setSavingError(null)}
              activeOpacity={0.8}
              style={{ marginTop: 8 }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "900",
                  color: "#7f1d1d",
                  textAlign: "center",
                }}
              >
                Erreur (tap)
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Modal
          visible={confirmingDeleteId !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setConfirmingDeleteId(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { maxWidth: 460 }]}>
              <View style={styles.modalScroll}>
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalTitle}>
                    {confirmIsPage ? "Supprimer la page ?" : "Supprimer la condition ?"}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setConfirmingDeleteId(null)}
                    style={styles.iconBtn}
                    activeOpacity={0.8}
                  >
                    <X size={16} color={C_TEXT} />
                  </TouchableOpacity>
                </View>

                <Text style={{ color: "rgba(15,23,42,0.75)", fontWeight: "700", marginTop: 6 }}>
                  {confirmIsPage
                    ? `La page ${confirmPageNumber} et ses conditions seront supprimées. Action irréversible.`
                    : "Cette action est irréversible."}
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "flex-end",
                    gap: 10 as any,
                    marginTop: 16,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setConfirmingDeleteId(null)}
                    style={[styles.primaryBtn, { backgroundColor: "rgba(15,23,42,0.15)" }]}
                    activeOpacity={0.9}
                  >
                    <Text style={[styles.primaryBtnTxt, { color: C_TEXT }]}>Annuler</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      if (!confirmingDeleteId) return;
                      if (confirmingDeleteId.startsWith("__PAGE__")) doDeletePage();
                      else doDelete(confirmingDeleteId);
                    }}
                    style={[styles.primaryBtn, { backgroundColor: "#991b1b" }]}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.primaryBtnTxt}>Supprimer</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={symbolPickerFor !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setSymbolPickerFor(null)}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalCard,
                styles.symbolModalCard,
                IS_SMALL_SCREEN && styles.symbolModalCardMobile,
              ]}
            >
              <ScrollView
                contentContainerStyle={styles.modalScroll}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.modalHeaderRow}>
                  <View style={styles.symbolHeaderLeft}>
                    <Text style={styles.modalTitle}>Choisir une condition</Text>
                    <Text style={styles.symbolHeaderSub}>
                      Sélectionne le type de comparaison à utiliser.
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => setSymbolPickerFor(null)}
                    style={styles.iconBtn}
                    activeOpacity={0.8}
                  >
                    <X size={16} color={C_TEXT} />
                  </TouchableOpacity>
                </View>

                <View style={styles.symbolGrid}>
                  {(["=", "≥", "≤", "entre"] as ConditionType[]).map((s) => {
                    const selected = selectedCondition === s;

                    return (
                      <TouchableOpacity
                        key={s}
                        style={[
                          styles.symbolCard,
                          IS_SMALL_SCREEN && styles.symbolCardMobile,
                          selected && styles.symbolCardSelected,
                        ]}
                        onPress={() => applySymbol(s)}
                        activeOpacity={0.92}
                      >
                        <View style={styles.symbolCardTop}>
                          <View
                            style={[
                              styles.symbolIconBadge,
                              selected && styles.symbolIconBadgeSelected,
                            ]}
                          >
                            {s === "entre" ? (
                              <IntervalGlyph size={22} />
                            ) : (
                              <Text style={styles.symbolBtnTxt}>{s}</Text>
                            )}
                          </View>

                          {selected ? (
                            <View style={styles.symbolCheck}>
                              <Check size={14} color="#ffffff" />
                            </View>
                          ) : null}
                        </View>

                        <Text style={styles.symbolBtnHelpTitle}>{getConditionLabel(s)}</Text>

                        <Text style={styles.symbolBtnHelpSub}>
                          {s === "=" && "Exemple : exactement 3 tentatives"}
                          {s === "≥" && "Exemple : 3 tentatives ou plus"}
                          {s === "≤" && "Exemple : 3 tentatives ou moins"}
                          {s === "entre" && "Exemple : de 3 à 5 tentatives"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.symbolInfoBox}>
                  <Text style={styles.symbolInfoText}>
                    {IS_WEB
                      ? "Astuce : utilise la poubelle à droite pour supprimer une ligne."
                      : "Astuce : glisse une ligne vers la gauche pour afficher la poubelle."}
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={colorPickerFor !== null}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setColorPickerFor(null);
            setWheelVisible(false);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeaderRow}>
                  <View style={styles.modalTitleRow}>
                    <PaletteIcon size={18} color={C_TEXT} />
                    <Text style={[styles.modalTitle, { marginLeft: 8 }]}>Couleur du barème</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setColorPickerFor(null);
                      setWheelVisible(false);
                    }}
                    style={styles.iconBtn}
                    activeOpacity={0.8}
                  >
                    <X size={16} color={C_TEXT} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.sectionTitle}>Couleurs rapides</Text>

                <View style={styles.paletteGrid}>
                  {PALETTE.map((c) => {
                    const selected = c.toLowerCase() === hex.toLowerCase();
                    return (
                      <Pressable
                        key={c}
                        onPress={() => applyColor(c)}
                        style={[
                          styles.paletteDot,
                          { backgroundColor: c },
                          selected && styles.paletteDotSelected,
                        ]}
                      />
                    );
                  })}

                  <Pressable onPress={() => setWheelVisible(true)} style={styles.wheelDotWrapper}>
                    <View style={styles.wheelDotOuter}>
                      <View style={styles.wheelDotRingRow}>
                        <View style={[styles.wheelDotRingSegment, { backgroundColor: "#F97316" }]} />
                        <View style={[styles.wheelDotRingSegment, { backgroundColor: "#EC4899" }]} />
                        <View style={[styles.wheelDotRingSegment, { backgroundColor: "#6366F1" }]} />
                        <View style={[styles.wheelDotRingSegment, { backgroundColor: "#22C55E" }]} />
                      </View>
                    </View>
                    <Text style={styles.wheelDotLabel}>Roue</Text>
                  </Pressable>
                </View>

                <Text style={styles.hexLabel}>
                  Couleur : <Text style={styles.hexValue}>{hex.toUpperCase()}</Text>
                </Text>

                <View style={{ alignItems: "flex-end", marginTop: 14 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setColorPickerFor(null);
                      setWheelVisible(false);
                    }}
                    style={styles.primaryBtn}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.primaryBtnTxt}>Terminer</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal visible={wheelVisible} transparent animationType="fade" onRequestClose={() => setWheelVisible(false)}>
          <View style={styles.wheelOverlay}>
            <View style={styles.wheelCard}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.modalTitle}>Roue chromatique</Text>
                <TouchableOpacity onPress={() => setWheelVisible(false)} style={styles.iconBtn} activeOpacity={0.8}>
                  <X size={16} color={C_TEXT} />
                </TouchableOpacity>
              </View>

              <Text style={styles.webPickerLabel}>Choisis une couleur librement</Text>

              {Platform.OS === "web" ? (
                <View style={styles.webColorInputRow}>
                  {/* @ts-ignore */}
                  <input
                    type="color"
                    value={hex}
                    onChange={(e: any) => applyColor((e.target.value as string) || "#000000")}
                    style={{
                      width: 90,
                      height: 90,
                      border: "none",
                      padding: 0,
                      background: "transparent",
                      cursor: "pointer",
                      borderRadius: "999px",
                    }}
                  />
                </View>
              ) : WheelColorPicker ? (
                <View style={styles.colorWheelContainer}>
                  <WheelColorPicker
                    color={hex}
                    onColorChangeComplete={(c: string) => applyColor(c)}
                    thumbSize={28}
                    sliderSize={0}
                    noSnap
                    row={false}
                    swatches={false}
                    style={{ width: wheelSize, height: wheelSize }}
                  />
                </View>
              ) : ColorWheel ? (
                <View style={styles.colorWheelContainer}>
                  <ColorWheel
                    initialColor={hex}
                    onColorChange={(hsv: HSVColor) => applyColor(hsvToHex(hsv.h, hsv.s, hsv.v))}
                    style={{ width: wheelSize, height: wheelSize }}
                    thumbStyle={styles.colorWheelThumb}
                  />
                </View>
              ) : (
                <View style={{ marginTop: 14 }}>
                  <Text style={{ fontWeight: "900", color: C_TEXT }}>Saisie HEX (fallback)</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10 }}>
                    <View style={[styles.hexPreview, { backgroundColor: hex }]} />
                    <TextInput
                      value={hexInput}
                      onChangeText={(v) => {
                        setHexInput(v);
                        const n = normalizeHex(v);
                        applyColor(n);
                      }}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      style={[
                        styles.inlineInput,
                        {
                          flex: 1,
                          marginLeft: 10,
                          paddingVertical: 8,
                          borderBottomWidth: 1,
                          borderBottomColor: "rgba(15,23,42,0.28)",
                        },
                      ]}
                    />
                  </View>
                </View>
              )}

              <Text style={styles.hexLabelCenter}>{hex.toUpperCase()}</Text>

              <View style={{ alignItems: "flex-end", marginTop: 12 }}>
                <TouchableOpacity onPress={() => setWheelVisible(false)} style={styles.primaryBtn} activeOpacity={0.9}>
                  <Text style={styles.primaryBtnTxt}>Valider</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <BottomBar currentPage="GestionPoints" onNavigate={setPage} />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

export default GestionResultatsTentatives;

/* ======================= Styles ======================= */
const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    backgroundColor: C_HEADER,
    paddingHorizontal: 12,
    paddingTop: Platform.select({ ios: 12, android: 12, default: 12 }),
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    alignItems: "center",
  },
  headerSide: { width: 92, alignItems: "flex-start", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  headerTitle: { color: C_TEXT, fontSize: 20, fontWeight: "900" },

  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.6)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  backTxt: { color: C_TEXT, fontWeight: "800", marginLeft: 6 },

  pagesBar: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
    backgroundColor: "rgba(255,255,255,0.35)",
  },

  pagesRow: { flexDirection: "row", alignItems: "center", gap: 8 as any, flexWrap: "wrap" },

  pageBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  pageBtnActive: {
    backgroundColor: "#FBBF24",
    borderColor: "rgba(0,0,0,0.12)",
  },
  pageBtnTxt: { fontWeight: "900", color: C_TEXT },
  pageBtnTxtActive: { color: "#111827" },

  pageBtnAdd: { backgroundColor: "rgba(255,255,255,0.85)" },
  pageBtnDel: { backgroundColor: "rgba(239,68,68,0.14)", borderColor: "rgba(239,68,68,0.30)" },

  pageTitleRow: { marginTop: 10, alignItems: "center" },
  pageTitleTouch: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 10 },
  pageTitleTxt: { fontWeight: "950" as any, fontSize: 18, color: C_TEXT },
  pageTitleInput: {
    minWidth: 180,
    maxWidth: "100%",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.75)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.12)",
    fontWeight: "900",
    color: C_TEXT,
    textAlign: "center",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none", outlineWidth: 0 } as any) : null),
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },

  itemWrap: { marginBottom: 10 },

  card: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  row: { flexDirection: "row", alignItems: "center" },

  cellSymbol: {
    width: 52,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C_BORDER,
    backgroundColor: "rgba(248,250,252,0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  cellSymbolCompact: { width: 48, height: 38 },

  cellValue: {
    minWidth: 78,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    backgroundColor: "rgba(248,250,252,0.9)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    marginRight: 8,
    flexGrow: 1,
  },
  cellValueCompact: { minWidth: 70, height: 38, paddingHorizontal: 8 },

  cellPoints: {
    width: 74,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    backgroundColor: "rgba(248,250,252,0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    paddingHorizontal: 8,
  },
  cellPointsCompact: { width: 68, height: 38 },

  cellRange: {
    minWidth: 118,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    backgroundColor: "rgba(248,250,252,0.9)",
    paddingHorizontal: 6,
    marginRight: 8,
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  cellRangeCompact: { minWidth: 110, height: 38, paddingHorizontal: 6 },

  symbolTxt: { fontWeight: "900", color: C_TEXT, letterSpacing: 0.5 },
  valueTxt: { fontWeight: "900", color: C_TEXT },

  metaTxtCentered: {
    fontSize: 10,
    fontWeight: "800",
    color: "rgba(15,23,42,0.6)",
    marginTop: 2,
    textAlign: "center",
    width: "100%",
  },
  sepTxt: { color: "rgba(15,23,42,0.7)", fontWeight: "900" },

  inlineInput: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15,23,42,0.28)",
    borderRadius: 0,
    paddingHorizontal: 2,
    paddingVertical: Platform.select({ web: 2, default: 1 }),
    fontWeight: "900",
    color: C_TEXT,
    textAlignVertical: "center",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none", outlineWidth: 0 } as any) : null),
  },
  inputSlim: { width: 36, minWidth: 32, textAlign: "center" },

  colorDotWrap: { width: 26, alignItems: "center", justifyContent: "center", marginRight: 2 },
  colorDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },

  webDeleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(239,68,68,0.12)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.28)",
    marginLeft: 4,
  },

  rightActionsWrap: {
    width: 64,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  swipeDeleteBtn: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "rgba(239,68,68,0.14)",
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.30)",
    alignItems: "center",
    justifyContent: "center",
  },

  fabWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  fabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10 as any,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: "#10B981",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 6,
  },
  fabTxt: { color: "white", fontWeight: "900" },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "90%",
    backgroundColor: "#F9FAFB",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    overflow: "hidden",
  },

  symbolModalCard: {
    maxWidth: 560,
    borderRadius: 24,
  },
  symbolModalCardMobile: {
    maxWidth: "100%",
    width: "100%",
    borderRadius: 22,
  },

  modalScroll: { padding: 14 },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  modalTitleRow: { flexDirection: "row", alignItems: "center" },
  modalTitle: { color: C_TEXT, fontWeight: "900", fontSize: 16 },

  symbolHeaderLeft: {
    flex: 1,
    paddingRight: 12,
  },
  symbolHeaderSub: {
    marginTop: 4,
    color: "rgba(15,23,42,0.65)",
    fontWeight: "700",
    fontSize: 12,
    lineHeight: 18,
  },

  iconBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.06)",
  },

  symbolGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 14,
    justifyContent: "space-between",
  },
  symbolCard: {
    width: "48.3%",
    minHeight: 134,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 2,
  },
  symbolCardMobile: {
    width: "100%",
    minHeight: 118,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  symbolCardSelected: {
    borderColor: "rgba(59,130,246,0.35)",
    backgroundColor: "rgba(59,130,246,0.06)",
  },
  symbolCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  symbolIconBadge: {
    minWidth: 48,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(15,23,42,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  symbolIconBadgeSelected: {
    backgroundColor: "rgba(59,130,246,0.14)",
  },
  symbolCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
  },
  symbolBtnTxt: { color: C_TEXT, fontWeight: "900", fontSize: 20 },
  symbolBtnHelpTitle: {
    marginTop: 12,
    color: C_TEXT,
    fontWeight: "900",
    fontSize: 14,
  },
  symbolBtnHelpSub: {
    marginTop: 6,
    color: "rgba(15,23,42,0.7)",
    fontWeight: "700",
    fontSize: 12,
    lineHeight: 17,
  },
  symbolInfoBox: {
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(15,23,42,0.05)",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.06)",
  },
  symbolInfoText: {
    color: "rgba(15,23,42,0.72)",
    fontWeight: "700",
    fontSize: 12,
    lineHeight: 18,
  },

  sectionTitle: { marginTop: 10, marginBottom: 8, fontWeight: "900", color: C_TEXT },
  paletteGrid: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },

  paletteDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.12)",
  },
  paletteDotSelected: {
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
    transform: [{ scale: 1.08 }],
  },

  wheelDotWrapper: { alignItems: "center", marginLeft: 2, marginBottom: 8 },
  wheelDotOuter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(15,23,42,0.2)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  wheelDotRingRow: { flexDirection: "row", width: 30, height: 30 },
  wheelDotRingSegment: { flex: 1 },
  wheelDotLabel: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: "700",
    color: "rgba(15,23,42,0.8)",
  },

  hexLabel: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(15,23,42,0.75)",
  },
  hexValue: { fontWeight: "900", color: C_TEXT },

  wheelOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  wheelCard: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "95%",
    backgroundColor: "#F9FAFB",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.2)",
    padding: 16,
  },

  colorWheelContainer: {
    marginTop: 10,
    marginBottom: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  colorWheelThumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#ffffff",
    backgroundColor: "rgba(0,0,0,0.3)",
  },

  webPickerLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(15,23,42,0.8)",
    marginTop: 6,
    textAlign: "center",
  },
  hexLabelCenter: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "900",
    color: C_TEXT,
    marginTop: 6,
  },

  primaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#0f172a",
  },
  primaryBtnTxt: { color: "white", fontWeight: "800", fontSize: 13 },

  webColorInputRow: { marginTop: 14, alignItems: "center", justifyContent: "center" },

  hexPreview: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "rgba(15,23,42,0.18)",
  },
});