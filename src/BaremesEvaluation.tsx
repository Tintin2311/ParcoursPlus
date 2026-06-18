import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Grid2X2, LayoutList, Plus, Trash2 } from "lucide-react-native";

import BottomBar from "./ui/BottomBar";
import { supabase } from "./supabaseClient";

type Props = {
  setPage?: (page: string) => void;
};

type TableType = "simple" | "double";
type Metric = "time" | "beacons" | "score";
type AxisMode = "row" | "column";
type InsertPosition = "before" | "after";

type AxisBand = {
  id: string;
  minSec?: number;
  maxSec?: number;
  value?: number;
};

type EvalCell = {
  points: string;
};

type EvaluationBareme = {
  id: string;
  pageNumber: number;
  name: string;
  configured: boolean;
  tableType: TableType;
  rowMetric: Metric | null;
  columnMetric: Metric | null;
  rows: AxisBand[];
  columns: AxisBand[];
  cells: Record<string, EvalCell>;
};

const PAGE_BG = "#EDF2F6";
const HEADER_BG = "#1F5B86";
const HEADER_ICON_BG = "#2D6C97";
const CONTENT_BG = "#EEF3F7";
const PANEL_BG = "#FFFFFF";
const BORDER = "rgba(15,23,42,0.12)";
const TEXT = "#0f172a";
const MUTED = "#64748B";
const BLUE = "#3B82F6";
const YELLOW = "#FFC947";
const BOTTOM_BAR_HEIGHT = 78;

const TABLE_PAGES = "group_evaluation_bareme_pages";
const TABLE_AXES = "group_evaluation_bareme_axes";
const TABLE_CELLS = "group_evaluation_bareme_cells";

const METRIC_OPTIONS: { value: Metric; label: string; short: string }[] = [
  { value: "time", label: "Temps", short: "Temps" },
  { value: "beacons", label: "Nombre de balises trouvées", short: "Balises" },
  { value: "score", label: "Score du parcours", short: "Score" },
];

const uid = () => `eval_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const cellKey = (rowId: string, colId: string) => `${rowId}__${colId}`;

const metricLabel = (metric: Metric | null) =>
  METRIC_OPTIONS.find((item) => item.value === metric)?.short || "";

const clampNumber = (value: number, min = 0, max = 9999) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

const secondsToParts = (seconds = 0) => ({
  minutes: Math.floor(seconds / 60),
  seconds: seconds % 60,
});

const cleanInt = (text: string) => {
  const cleaned = text.replace(/[^0-9]/g, "");
  return cleaned ? clampNumber(Number(cleaned)) : 0;
};

const getAutoValue = (metric: Metric | null, index: number) => {
  if (metric === "beacons") return index + 1;
  if (metric === "score") return index + 1;
  return undefined;
};

async function resolveTeacherId(): Promise<string | null> {
  try {
    const auth = await supabase.auth.getUser();
    return auth.data?.user?.id ?? null;
  } catch {
    return null;
  }
}

function makeBand(metric: Metric, index: number): AxisBand {
  if (metric === "time") {
    return {
      id: uid(),
      minSec: index * 300,
      maxSec: (index + 1) * 300,
    };
  }

  if (metric === "score") {
    return {
      id: uid(),
      minSec: index * 10,
      maxSec: (index + 1) * 10,
    };
  }

  return {
    id: uid(),
    value: index + 1,
  };
}

function makeColumns(tableType: TableType, columnMetric: Metric | null) {
  if (tableType === "simple") return [{ id: "simple", value: 0 }];
  return Array.from({ length: 5 }, (_, index) => ({
    ...makeBand(columnMetric || "beacons", index),
    value: columnMetric === "beacons" ? getAutoValue(columnMetric, index) : undefined,
  }));
}

function createCells(rows: AxisBand[], columns: AxisBand[]) {
  return rows.reduce<Record<string, EvalCell>>((acc, row) => {
    columns.forEach((column) => {
      acc[cellKey(row.id, column.id)] = { points: "0" };
    });
    return acc;
  }, {});
}

function defaultBareme(pageNumber = 1): EvaluationBareme {
  const rowMetric: Metric | null = null;
  const columnMetric: Metric | null = null;
  const tableType: TableType = "simple";
  const rows = [makeBand("time", 0), makeBand("time", 1), makeBand("time", 2)];
  const columns = makeColumns(tableType, null);

  return {
    id: uid(),
    pageNumber,
    name: `EVALUATION ${pageNumber}`,
    configured: false,
    tableType,
    rowMetric,
    columnMetric,
    rows,
    columns,
    cells: createCells(rows, columns),
  };
}

function duplicateBareme(source: EvaluationBareme, pageNumber: number, id: string): EvaluationBareme {
  const rows = source.rows.map((row) => ({ ...row, id: uid() }));
  const columns = source.columns.map((column) => ({ ...column, id: uid() }));
  const cells: Record<string, EvalCell> = {};

  rows.forEach((row, rowIndex) => {
    columns.forEach((column, columnIndex) => {
      const sourceRow = source.rows[rowIndex];
      const sourceColumn = source.columns[columnIndex];
      const sourceCell = source.cells[cellKey(sourceRow.id, sourceColumn.id)];
      cells[cellKey(row.id, column.id)] = {
        points: String(sourceCell?.points ?? "0"),
      };
    });
  });

  return {
    ...source,
    id,
    pageNumber,
    name: `${source.name || `EVALUATION ${source.pageNumber}`} copie`,
    rows,
    columns,
    cells,
  };
}

function ensureCells(bareme: EvaluationBareme): EvaluationBareme {
  const cells = { ...bareme.cells };
  bareme.rows.forEach((row) => {
    bareme.columns.forEach((column) => {
      const key = cellKey(row.id, column.id);
      if (!cells[key]) cells[key] = { points: "0" };
    });
  });
  return { ...bareme, cells };
}

const isUuid = (value: string | null | undefined) =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const toPointNumber = (value: string) => {
  const normalized = String(value || "0").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const axisPayload = (
  teacherId: string,
  bareme: EvaluationBareme,
  axis: "row" | "column",
  metric: Metric | "points",
  band: AxisBand,
  orderIndex: number
) => ({
  teacher_id: teacherId,
  bareme_page_id: bareme.id,
  axis,
  metric,
  order_index: orderIndex,
  beacon_count: metric === "beacons" ? Number(band.value ?? orderIndex + 1) : null,
  time_min_seconds: metric === "time" ? Number(band.minSec ?? 0) : null,
  time_max_seconds: metric === "time" ? Number(band.maxSec ?? 0) : null,
  score_min: metric === "score" ? Number(band.minSec ?? 0) : null,
  score_max: metric === "score" ? Number(band.maxSec ?? 0) : null,
});

export default function BaremesEvaluation({ setPage }: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1100;
  const isTablet = width >= 768 && width < 1100;
  const isSmall = width < 640;

  const horizontalPadding = isDesktop ? 28 : isTablet ? 22 : 12;
  const headerHeight = isDesktop ? 86 : isTablet ? 82 : 78;
  const headerTitleSize = isDesktop ? 20 : isTablet ? 19 : 18;
  const headerIconSize = isDesktop ? 20 : isTablet ? 19 : 18;
  const headerIconBox = isDesktop ? 40 : isTablet ? 40 : 38;

  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [baremes, setBaremes] = useState<EvaluationBareme[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState<AxisMode | null>(null);
  const [selectedDeleteId, setSelectedDeleteId] = useState<string | null>(null);
  const [insertMode, setInsertMode] = useState<AxisMode | null>(null);
  const [selectedInsertId, setSelectedInsertId] = useState<string | null>(null);
  const saveTimer = useRef<any>(null);
  const hydratedRef = useRef(false);
  const savingRef = useRef(false);

  const currentBareme = useMemo(
    () => baremes.find((item) => item.id === currentId) || baremes[0] || null,
    [baremes, currentId]
  );

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      const tid = await resolveTeacherId();
      if (!cancelled) {
        setTeacherId(tid);
        setAuthChecked(true);
      }
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const axisFromDb = (row: any): AxisBand => {
    const metric = row.metric as Metric | "points";
    if (metric === "time") {
      return {
        id: String(row.id),
        minSec: Number(row.time_min_seconds ?? 0),
        maxSec: Number(row.time_max_seconds ?? 0),
      };
    }
    if (metric === "score") {
      return {
        id: String(row.id),
        minSec: Number(row.score_min ?? 0),
        maxSec: Number(row.score_max ?? 0),
      };
    }
    return {
      id: String(row.id),
      value: Number(row.beacon_count ?? row.order_index + 1),
    };
  };

  const insertPage = async (pageNumber: number, name = `EVALUATION ${pageNumber}`) => {
    if (!teacherId) return defaultBareme(pageNumber);
    const { data, error } = await supabase
      .from(TABLE_PAGES)
      .insert({
        teacher_id: teacherId,
        page_number: pageNumber,
        page_name: name,
        table_type: "simple",
        row_metric: null,
        column_metric: null,
      })
      .select("id, page_number, page_name, table_type, row_metric, column_metric")
      .single();
    if (error) throw error;
    return { ...defaultBareme(pageNumber), id: String(data.id), name: String(data.page_name || name) };
  };

  const loadBaremes = async (tid: string) => {
    const { data: pageRows, error: pagesError } = await supabase
      .from(TABLE_PAGES)
      .select("id, page_number, page_name, table_type, row_metric, column_metric")
      .eq("teacher_id", tid)
      .order("page_number", { ascending: true });

    if (pagesError) throw pagesError;

    let pages = pageRows || [];
    if (pages.length === 0) {
      const created = await insertPage(1);
      return [created];
    }

    const pageIds = pages.map((page: any) => page.id);
    const [{ data: axisRows, error: axesError }, { data: cellRows, error: cellsError }] =
      await Promise.all([
        supabase
          .from(TABLE_AXES)
          .select("*")
          .in("bareme_page_id", pageIds)
          .order("order_index", { ascending: true }),
        supabase.from(TABLE_CELLS).select("*").in("bareme_page_id", pageIds),
      ]);

    if (axesError) throw axesError;
    if (cellsError) throw cellsError;

    return pages.map((page: any, index: number) => {
      const pageAxes = (axisRows || []).filter((axis: any) => axis.bareme_page_id === page.id);
      const rows = pageAxes
        .filter((axis: any) => axis.axis === "row")
        .sort((a: any, b: any) => Number(a.order_index) - Number(b.order_index))
        .map(axisFromDb);
      const columns = pageAxes
        .filter((axis: any) => axis.axis === "column")
        .sort((a: any, b: any) => Number(a.order_index) - Number(b.order_index))
        .map(axisFromDb);

      const cells: Record<string, EvalCell> = {};
      (cellRows || [])
        .filter((cell: any) => cell.bareme_page_id === page.id)
        .forEach((cell: any) => {
          cells[cellKey(String(cell.row_axis_id), String(cell.column_axis_id))] = {
            points: String(cell.points ?? "0"),
          };
        });

      return ensureCells({
        id: String(page.id),
        pageNumber: Number(page.page_number ?? index + 1),
        name: String(page.page_name || `EVALUATION ${index + 1}`),
        configured: rows.length > 0 && columns.length > 0 && !!page.row_metric,
        tableType: page.table_type === "double" ? "double" : "simple",
        rowMetric: (page.row_metric as Metric | null) || null,
        columnMetric: (page.column_metric as Metric | null) || null,
        rows: rows.length ? rows : defaultBareme(index + 1).rows,
        columns: columns.length ? columns : makeColumns(page.table_type === "double" ? "double" : "simple", page.column_metric as Metric | null),
        cells,
      });
    });
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!authChecked) return;
      if (!teacherId) {
        const fallback = [defaultBareme(1)];
        if (!cancelled) {
          setBaremes(fallback);
          setCurrentId(fallback[0].id);
          hydratedRef.current = true;
          setLoading(false);
        }
        return;
      }
      hydratedRef.current = false;
      setLoading(true);

      try {
        const list = await loadBaremes(teacherId);
        if (!cancelled) {
          setBaremes(list);
          setCurrentId(list[0]?.id || null);
          hydratedRef.current = true;
        }
      } catch (error) {
        console.error("[Supabase] LOAD_EVALUATION_BAREMES", error);
        const fallback = [defaultBareme(1)];
        if (!cancelled) {
          setBaremes(fallback);
          setCurrentId(fallback[0].id);
          hydratedRef.current = true;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [authChecked, teacherId]);

  const saveBaremeToSupabase = async (bareme: EvaluationBareme, tid: string) => {
    if (!isUuid(bareme.id)) return;

    const tableType = bareme.tableType;
    const rowMetric = bareme.rowMetric;
    const columnMetric = tableType === "double" ? bareme.columnMetric : null;

    const { error: pageError } = await supabase
      .from(TABLE_PAGES)
      .update({
        page_number: bareme.pageNumber,
        page_name: bareme.name || `EVALUATION ${bareme.pageNumber}`,
        table_type: tableType,
        row_metric: rowMetric,
        column_metric: columnMetric,
        updated_at: new Date().toISOString(),
      })
      .eq("id", bareme.id)
      .eq("teacher_id", tid);

    if (pageError) throw pageError;

    await supabase.from(TABLE_CELLS).delete().eq("bareme_page_id", bareme.id).eq("teacher_id", tid);
    await supabase.from(TABLE_AXES).delete().eq("bareme_page_id", bareme.id).eq("teacher_id", tid);

    if (!bareme.configured || !rowMetric) return;
    if (tableType === "double" && !columnMetric) return;

    const rowPayloads = bareme.rows.map((row, index) =>
      axisPayload(tid, bareme, "row", rowMetric, row, index)
    );
    const columnPayloads = bareme.columns.map((column, index) =>
      axisPayload(tid, bareme, "column", tableType === "double" ? columnMetric || "beacons" : "points", column, index)
    );

    const { data: insertedAxes, error: axesError } = await supabase
      .from(TABLE_AXES)
      .insert([...rowPayloads, ...columnPayloads])
      .select("id, axis, order_index");

    if (axesError) throw axesError;

    const rowAxisIds = new Map<number, string>();
    const columnAxisIds = new Map<number, string>();
    (insertedAxes || []).forEach((axis: any) => {
      if (axis.axis === "row") rowAxisIds.set(Number(axis.order_index), String(axis.id));
      if (axis.axis === "column") columnAxisIds.set(Number(axis.order_index), String(axis.id));
    });

    const cellPayloads: any[] = [];
    bareme.rows.forEach((row, rowIndex) => {
      bareme.columns.forEach((column, columnIndex) => {
        const rowAxisId = rowAxisIds.get(rowIndex);
        const columnAxisId = columnAxisIds.get(columnIndex);
        if (!rowAxisId || !columnAxisId) return;
        cellPayloads.push({
          teacher_id: tid,
          bareme_page_id: bareme.id,
          row_axis_id: rowAxisId,
          column_axis_id: columnAxisId,
          points: toPointNumber(bareme.cells[cellKey(row.id, column.id)]?.points || "0"),
        });
      });
    });

    if (cellPayloads.length > 0) {
      const { error: cellsError } = await supabase.from(TABLE_CELLS).insert(cellPayloads);
      if (cellsError) throw cellsError;
    }
  };

  const saveAllBaremes = async (list: EvaluationBareme[], tid: string) => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      for (const bareme of list) {
        await saveBaremeToSupabase(bareme, tid);
      }
    } catch (error) {
      console.error("[Supabase] SAVE_EVALUATION_BAREMES", error);
    } finally {
      savingRef.current = false;
    }
  };

  useEffect(() => {
    if (!teacherId || loading || !hydratedRef.current || baremes.length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveAllBaremes(baremes, teacherId).catch(() => null);
    }, 550);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [baremes, loading, teacherId]);

  const updateCurrent = (patcher: (bareme: EvaluationBareme) => EvaluationBareme) => {
    setBaremes((prev) =>
      prev.map((item) => (item.id === currentBareme?.id ? ensureCells(patcher(item)) : item))
    );
  };

  const addBareme = async () => {
    const pageNumber = baremes.length + 1;
    try {
      const created = teacherId ? await insertPage(pageNumber) : defaultBareme(pageNumber);
      setBaremes((prev) => {
        const next = [...prev, created];
        setCurrentId(created.id);
        return next;
      });
    } catch (error) {
      console.error("[Supabase] CREATE_EVALUATION_BAREME_PAGE", error);
    }
  };

  const copyBareme = async () => {
    if (!currentBareme) return;
    const pageNumber = baremes.length + 1;
    try {
      const created = teacherId ? await insertPage(pageNumber, `${currentBareme.name || `EVALUATION ${currentBareme.pageNumber}`} copie`) : defaultBareme(pageNumber);
      const copied = duplicateBareme(currentBareme, pageNumber, created.id);

      setBaremes((prev) => {
        const next = [...prev, copied];
        setCurrentId(copied.id);
        return next;
      });
    } catch (error) {
      console.error("[Supabase] COPY_EVALUATION_BAREME_PAGE", error);
    }
  };

  const deleteBareme = async () => {
    if (!currentBareme || baremes.length <= 1) return;
    const deletedId = currentBareme.id;

    if (teacherId && isUuid(deletedId)) {
      const { error } = await supabase
        .from(TABLE_PAGES)
        .delete()
        .eq("id", deletedId)
        .eq("teacher_id", teacherId);
      if (error) {
        console.error("[Supabase] DELETE_EVALUATION_BAREME_PAGE", error);
        return;
      }
    }

    setBaremes((prev) => {
      const filtered = prev
        .filter((item) => item.id !== deletedId)
        .map((item, index) => ({ ...item, pageNumber: index + 1 }));
      setCurrentId(filtered[0]?.id || null);
      return filtered;
    });
  };

  const setTableType = (tableType: TableType) => {
    if (!currentBareme) return;

    updateCurrent((bareme) => {
      const columnMetric =
        tableType === "double"
          ? bareme.columnMetric === bareme.rowMetric
            ? null
            : bareme.columnMetric
          : null;

      return {
        ...bareme,
        configured: false,
        tableType,
        columnMetric,
      };
    });
  };

  const setAxisMetric = (axis: "row" | "column", metric: Metric) => {
    updateCurrent((bareme) => {
      if (axis === "row") {
        const nextRowMetric = bareme.rowMetric === metric ? null : metric;
        const nextColumnMetric = bareme.columnMetric === nextRowMetric ? null : bareme.columnMetric;

        return {
          ...bareme,
          configured: false,
          rowMetric: nextRowMetric,
          columnMetric: bareme.tableType === "double" ? nextColumnMetric : null,
        };
      }

      const nextColumnMetric = bareme.columnMetric === metric ? null : metric;
      const nextRowMetric = bareme.rowMetric === nextColumnMetric ? null : bareme.rowMetric;

      return {
        ...bareme,
        configured: false,
        rowMetric: nextRowMetric,
        columnMetric: nextColumnMetric,
      };
    });
  };

  const createTable = () => {
    if (!currentBareme) return;
    updateCurrent((bareme) => {
      if (!bareme.rowMetric) return bareme;
      if (bareme.tableType === "double" && !bareme.columnMetric) return bareme;
      const rows = [makeBand(bareme.rowMetric, 0), makeBand(bareme.rowMetric, 1), makeBand(bareme.rowMetric, 2)];
      const columns = makeColumns(bareme.tableType, bareme.tableType === "double" ? bareme.columnMetric : null);

      return {
        ...bareme,
        configured: true,
        columns,
        rows,
        cells: createCells(rows, columns),
      };
    });
  };

  const addRow = () => {
    if (!currentBareme?.rowMetric) return;
    updateCurrent((bareme) => ({
      ...bareme,
      rows: bareme.rowMetric
        ? [...bareme.rows, makeBand(bareme.rowMetric, bareme.rows.length)]
        : bareme.rows,
    }));
  };

  const addColumn = () => {
    if (!currentBareme || currentBareme.tableType !== "double" || !currentBareme.columnMetric) return;
    updateCurrent((bareme) => ({
      ...bareme,
      columns: [
        ...bareme.columns,
        {
          ...makeBand(bareme.columnMetric || "beacons", bareme.columns.length),
          value: getAutoValue(bareme.columnMetric, bareme.columns.length),
        },
      ],
    }));
  };

  const resequenceBeaconColumns = (bareme: EvaluationBareme, columns: AxisBand[]) =>
    bareme.columnMetric === "beacons"
      ? columns.map((column, index) => ({ ...column, value: index + 1 }))
      : columns;

  const insertRowAt = (targetId: string, position: InsertPosition) => {
    if (!currentBareme?.rowMetric) return;
    updateCurrent((bareme) => {
      const targetIndex = bareme.rows.findIndex((row) => row.id === targetId);
      if (targetIndex < 0 || !bareme.rowMetric) return bareme;

      const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
      const nextRows = [...bareme.rows];
      nextRows.splice(insertIndex, 0, makeBand(bareme.rowMetric, insertIndex));

      return {
        ...bareme,
        rows: nextRows,
      };
    });
  };

  const insertColumnAt = (targetId: string, position: InsertPosition) => {
    if (!currentBareme || currentBareme.tableType !== "double" || !currentBareme.columnMetric) return;
    updateCurrent((bareme) => {
      if (bareme.tableType !== "double" || !bareme.columnMetric) return bareme;

      const targetIndex = bareme.columns.findIndex((column) => column.id === targetId);
      if (targetIndex < 0) return bareme;

      const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
      const nextColumns = [...bareme.columns];
      nextColumns.splice(insertIndex, 0, {
        ...makeBand(bareme.columnMetric, insertIndex),
        value: getAutoValue(bareme.columnMetric, insertIndex),
      });

      return {
        ...bareme,
        columns: resequenceBeaconColumns(bareme, nextColumns),
      };
    });
  };

  const rebuildAxisKeepPoints = (bareme: EvaluationBareme, axis: "row" | "column", metric: Metric) => {
    const oldRows = bareme.rows;
    const oldColumns = bareme.columns;
    const nextRows =
      axis === "row"
        ? oldRows.map((row, index) => ({
            ...makeBand(metric, index),
            id: row.id,
          }))
        : oldRows;
    const nextColumns =
      axis === "column"
        ? oldColumns.map((column, index) => ({
            ...makeBand(metric, index),
            id: column.id,
            value: getAutoValue(metric, index),
          }))
        : oldColumns;

    return ensureCells({
      ...bareme,
      configured: true,
      rowMetric: axis === "row" ? metric : bareme.rowMetric,
      columnMetric: axis === "column" ? metric : bareme.columnMetric,
      rows: nextRows,
      columns: nextColumns,
    });
  };

  const changeConfiguredAxis = (axis: "row" | "column") => {
    if (!currentBareme) return;
    const currentMetric = axis === "row" ? currentBareme.rowMetric : currentBareme.columnMetric;
    const blockedMetric = axis === "row" ? currentBareme.columnMetric : currentBareme.rowMetric;
    const options = METRIC_OPTIONS.filter((option) => option.value !== blockedMetric);
    const currentIndex = Math.max(0, options.findIndex((option) => option.value === currentMetric));
    const nextMetric = options[(currentIndex + 1) % options.length]?.value;
    if (!nextMetric) return;

    updateCurrent((bareme) => rebuildAxisKeepPoints(bareme, axis, nextMetric));
  };

  const deleteRow = (rowId: string) => {
    if (!currentBareme || currentBareme.rows.length <= 1) return;
    updateCurrent((bareme) => ({
      ...bareme,
      rows: bareme.rows.filter((row) => row.id !== rowId),
    }));
  };

  const deleteColumn = (columnId: string) => {
    if (!currentBareme || currentBareme.tableType !== "double" || currentBareme.columns.length <= 1) return;
    updateCurrent((bareme) => ({
      ...bareme,
      columns: resequenceBeaconColumns(
        bareme,
        bareme.columns.filter((column) => column.id !== columnId)
      ),
    }));
  };

  const toggleDeleteMode = (mode: AxisMode) => {
    setDeleteMode((current) => (current === mode ? null : mode));
    setSelectedDeleteId(null);
    setInsertMode(null);
    setSelectedInsertId(null);
  };

  const toggleInsertMode = (mode: AxisMode) => {
    setInsertMode((current) => (current === mode ? null : mode));
    setSelectedInsertId(null);
    setDeleteMode(null);
    setSelectedDeleteId(null);
  };

  const confirmDeleteSelection = () => {
    if (!selectedDeleteId || !deleteMode) return;
    if (deleteMode === "row") deleteRow(selectedDeleteId);
    if (deleteMode === "column") deleteColumn(selectedDeleteId);
    setSelectedDeleteId(null);
    setDeleteMode(null);
  };

  const confirmInsertSelection = (position: InsertPosition) => {
    if (!selectedInsertId || !insertMode) return;
    if (insertMode === "row") insertRowAt(selectedInsertId, position);
    if (insertMode === "column") insertColumnAt(selectedInsertId, position);
    setSelectedInsertId(null);
    setInsertMode(null);
  };

  const updateBand = (axis: "row" | "column", bandId: string, patch: Partial<AxisBand>) => {
    const key = axis === "row" ? "rows" : "columns";
    updateCurrent((bareme) => ({
      ...bareme,
      [key]: bareme[key].map((band) => (band.id === bandId ? { ...band, ...patch } : band)),
    }));
  };

  const updateCell = (rowId: string, columnId: string, points: string) => {
    updateCurrent((bareme) => {
      const key = cellKey(rowId, columnId);
      return {
        ...bareme,
        cells: {
          ...bareme.cells,
          [key]: { points },
        },
      };
    });
  };

  const cleanDecimalInput = (text: string) => {
    let value = text.replace(/[^0-9.,]/g, "").replace(",", ".");
    const firstDot = value.indexOf(".");
    if (firstDot >= 0) {
      value =
        value.slice(0, firstDot + 1) +
        value
          .slice(firstDot + 1)
          .replace(/\./g, "");
    }
    return value;
  };

  const retour = () => setPage?.("GestionResultats");

  const renderPagesBar = () => (
    <View style={styles.pagesBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pagesRow}>
        {baremes.map((bareme) => {
          const active = bareme.id === currentBareme?.id;
          return (
            <TouchableOpacity
              key={bareme.id}
              onPress={() => setCurrentId(bareme.id)}
              style={[styles.pageBtn, active && styles.pageBtnActive]}
              activeOpacity={0.9}
            >
              <Text style={[styles.pageBtnTxt, active && styles.pageBtnTxtActive]}>{bareme.pageNumber}</Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity onPress={addBareme} style={[styles.pageBtn, styles.pageBtnAdd]} activeOpacity={0.9}>
          <Plus size={16} color={TEXT} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={copyBareme}
          disabled={!currentBareme}
          style={[styles.copyBaremeBtn, !currentBareme && styles.disabled]}
          activeOpacity={0.9}
        >
          <Copy size={15} color="#1D4ED8" strokeWidth={2.5} />
          <Text style={styles.copyBaremeText}>Copier</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={deleteBareme}
          disabled={baremes.length <= 1}
          style={[styles.pageBtn, styles.pageBtnDel, baremes.length <= 1 && styles.disabled]}
          activeOpacity={0.9}
        >
          <Trash2 size={16} color="#991b1b" />
        </TouchableOpacity>
      </ScrollView>

      {currentBareme ? (
        <TextInput
          value={currentBareme.name}
          onChangeText={(name) => updateCurrent((bareme) => ({ ...bareme, name }))}
          style={styles.baremeNameInput}
          placeholder={`EVALUATION ${currentBareme.pageNumber}`}
          placeholderTextColor="rgba(15,23,42,0.35)"
        />
      ) : null}
    </View>
  );

  const renderAxisChoice = (axis: "column" | "row") => {
    if (!currentBareme) return null;
    const selected = axis === "column" ? currentBareme.columnMetric : currentBareme.rowMetric;
    const blocked = axis === "column" ? currentBareme.rowMetric : currentBareme.columnMetric;

    return (
      <View style={styles.choiceGrid}>
        {METRIC_OPTIONS.map((option) => {
          const active = selected === option.value;
          const unavailable = blocked === option.value;

          if (unavailable) return null;

          return (
            <TouchableOpacity
              key={option.value}
              activeOpacity={0.9}
              onPress={() => setAxisMetric(axis, option.value)}
              style={[styles.choiceBtn, active && styles.choiceBtnActive]}
            >
              <Text
                style={[styles.choiceText, active && styles.choiceTextActive]}
                numberOfLines={2}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderSetupCard = () => {
    if (!currentBareme) return null;
    const canCreate =
      currentBareme.tableType === "double"
        ? !!currentBareme.rowMetric && !!currentBareme.columnMetric
        : !!currentBareme.rowMetric;

    return (
      <View style={styles.setupShell}>
        <View style={[styles.setupCard, isSmall && styles.setupCardMobile]}>
          <Text style={styles.setupTitle}>Créer le tableau</Text>

          <View style={styles.setupSection}>
            <Text style={styles.setupStep}>1. Type de tableau</Text>
            <View style={styles.segment}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setTableType("simple")}
                style={[styles.segmentBtn, currentBareme.tableType === "simple" && styles.segmentBtnActive]}
              >
                <LayoutList size={16} color={currentBareme.tableType === "simple" ? "#166534" : TEXT} />
                <Text
                  style={[
                    styles.segmentTxt,
                    currentBareme.tableType === "simple" && styles.segmentTxtActive,
                  ]}
                >
                  Tableau simple
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setTableType("double")}
                style={[styles.segmentBtn, currentBareme.tableType === "double" && styles.segmentBtnActive]}
              >
                <Grid2X2 size={16} color={currentBareme.tableType === "double" ? "#166534" : TEXT} />
                <Text
                  style={[
                    styles.segmentTxt,
                    currentBareme.tableType === "double" && styles.segmentTxtActive,
                  ]}
                >
                  Tableau à double entrée
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.setupSection}>
            <Text style={styles.setupStep}>2. Colonne</Text>
            {currentBareme.tableType === "double" ? (
              renderAxisChoice("column")
            ) : (
              <View style={styles.simpleRoleBox}>
                <Text style={styles.simpleRoleTitle}>Variable du tableau simple</Text>
                <View style={styles.choiceGrid}>
                  {METRIC_OPTIONS.map((option) => {
                    const active = currentBareme.rowMetric === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        activeOpacity={0.9}
                        onPress={() => setAxisMetric("row", option.value)}
                        style={[styles.choiceBtn, active && styles.choiceBtnActive]}
                      >
                        <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.simpleRoleNote}>Les points restent dans les cases du tableau.</Text>
              </View>
            )}
          </View>

          {currentBareme.tableType === "double" ? (
            <View style={styles.setupSection}>
              <Text style={styles.setupStep}>3. Ligne</Text>
              {renderAxisChoice("row")}
              <Text style={styles.simpleRoleNote}>
                Les points seront saisis à l'intersection des lignes et colonnes.
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.92}
            disabled={!canCreate}
            onPress={createTable}
            style={[styles.createBtn, !canCreate && styles.createBtnDisabled]}
          >
            <Text style={styles.createBtnText}>Créer le tableau</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderBandEditor = (metric: Metric, band: AxisBand, axis: "row" | "column") => {
    const update = (patch: Partial<AxisBand>) => updateBand(axis, band.id, patch);

    if (metric === "time") {
      const start = secondsToParts(band.minSec || 0);
      const end = secondsToParts(band.maxSec || 0);

      return (
        <View style={styles.timeEditor}>
          <TimePartInput
            value={start.minutes}
            label="min"
            onChange={(minutes) => update({ minSec: minutes * 60 + start.seconds })}
          />
          <TimePartInput
            value={start.seconds}
            label="s"
            onChange={(seconds) => update({ minSec: start.minutes * 60 + clampNumber(seconds, 0, 59) })}
          />
          <Text style={styles.toTxt}>à</Text>
          <TimePartInput
            value={end.minutes}
            label="min"
            onChange={(minutes) => update({ maxSec: minutes * 60 + end.seconds })}
          />
          <TimePartInput
            value={end.seconds}
            label="s"
            onChange={(seconds) => update({ maxSec: end.minutes * 60 + clampNumber(seconds, 0, 59) })}
          />
        </View>
      );
    }

    if (metric === "score") {
      return (
        <View style={styles.scoreRangeEditor}>
          <Text style={styles.rangeLabel}>de</Text>
          <TextInput
            value={String(band.minSec ?? 0)}
            onChangeText={(text) => update({ minSec: cleanInt(text) })}
            keyboardType="number-pad"
            style={styles.rangeInput}
          />
          <Text style={styles.rangeLabel}>à</Text>
          <TextInput
            value={String(band.maxSec ?? 0)}
            onChangeText={(text) => update({ maxSec: cleanInt(text) })}
            keyboardType="number-pad"
            style={styles.rangeInput}
          />
        </View>
      );
    }

    return (
      <TextInput
        value={String(band.value ?? 0)}
        onChangeText={(text) => update({ value: cleanInt(text) })}
        keyboardType="number-pad"
        style={styles.valueInput}
      />
    );
  };

  const renderTable = () => {
    if (!currentBareme) return null;
    if (!currentBareme.configured) return renderSetupCard();

    const columnWidth = currentBareme.tableType === "double" ? (isSmall ? 148 : 170) : 142;
    const leftWidth = isSmall ? 226 : currentBareme.tableType === "double" ? 250 : 270;

    return (
      <View style={styles.tablePanel}>
        <View style={styles.tableTopRow}>
          <View>
            <Text style={styles.tableTitle}>{currentBareme.name || `EVALUATION ${currentBareme.pageNumber}`}</Text>
            <Text style={styles.tableSubtitle}>
              {currentBareme.tableType === "double"
                ? `${metricLabel(currentBareme.rowMetric)} / ${metricLabel(currentBareme.columnMetric)}`
                : metricLabel(currentBareme.rowMetric)}
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => updateCurrent((bareme) => ({ ...bareme, configured: false }))}
            style={styles.editSetupBtn}
          >
            <Text style={styles.editSetupText}>Modifier</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            {currentBareme.tableType === "double" ? (
              <View style={styles.tableRow}>
                <View style={[styles.cornerTopBlank, { width: leftWidth }]} />
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => changeConfiguredAxis("column")}
                  style={[styles.columnGroupHeader, { width: columnWidth * currentBareme.columns.length }]}
                >
                  <Text style={styles.columnGroupHeaderText} numberOfLines={1}>
                    {METRIC_OPTIONS.find((item) => item.value === currentBareme.columnMetric)?.label ||
                      metricLabel(currentBareme.columnMetric)}
                  </Text>
                </TouchableOpacity>
                <View style={{ width: 74 }} />
              </View>
            ) : null}

            <View style={styles.tableRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => changeConfiguredAxis("row")}
                style={[styles.cornerCell, { width: leftWidth }]}
              >
                <Text style={styles.cornerSub} numberOfLines={1}>
                  {metricLabel(currentBareme.rowMetric)}
                </Text>
              </TouchableOpacity>

              {currentBareme.columns.map((column) => {
                const selectedColumn = deleteMode === "column" && selectedDeleteId === column.id;
                const insertSelectedColumn = insertMode === "column" && selectedInsertId === column.id;
                return (
                <TouchableOpacity
                  key={column.id}
                  activeOpacity={deleteMode === "column" || insertMode === "column" ? 0.88 : 1}
                  onPress={() => {
                    if (deleteMode === "column") setSelectedDeleteId(column.id);
                    if (insertMode === "column") setSelectedInsertId(column.id);
                  }}
                  style={[
                    styles.headerCell,
                    { width: columnWidth },
                    selectedColumn && styles.deleteSelectedCell,
                    insertSelectedColumn && styles.insertSelectedCell,
                  ]}
                >
                  <View style={styles.headerCellTop}>
                    {currentBareme.tableType === "simple" || currentBareme.columnMetric === "beacons" ? (
                      <Text
                        style={[
                          styles.headerCellTitle,
                          currentBareme.columnMetric === "beacons" && styles.beaconNumberTitle,
                        ]}
                        numberOfLines={1}
                      >
                        {currentBareme.tableType === "simple" ? "Points" : String(column.value ?? "")}
                      </Text>
                    ) : null}
                  </View>

                  {currentBareme.tableType === "double" &&
                  currentBareme.columnMetric &&
                  currentBareme.columnMetric !== "beacons"
                    ? renderBandEditor(currentBareme.columnMetric, column, "column")
                    : null}
                </TouchableOpacity>
                );
              })}

              {currentBareme.tableType === "double" ? (
                <TouchableOpacity onPress={addColumn} style={[styles.addColumnBtn, { width: 74 }]}>
                  <Plus size={17} color="#166534" />
                  <Text style={styles.addBtnTxt}>Col.</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {currentBareme.rows.map((row) => (
              <View key={row.id} style={styles.tableRow}>
                <TouchableOpacity
                  activeOpacity={deleteMode === "row" || insertMode === "row" ? 0.88 : 1}
                  onPress={() => {
                    if (deleteMode === "row") setSelectedDeleteId(row.id);
                    if (insertMode === "row") setSelectedInsertId(row.id);
                  }}
                  style={[
                    styles.rowHeaderCell,
                    { width: leftWidth },
                    deleteMode === "row" && selectedDeleteId === row.id && styles.deleteSelectedCell,
                    insertMode === "row" && selectedInsertId === row.id && styles.insertSelectedCell,
                  ]}
                >
                  <View style={styles.rowHeaderTop}>
                    <Text style={styles.rowHeaderTitle} numberOfLines={1}>
                      {metricLabel(currentBareme.rowMetric)}
                    </Text>
                  </View>
                  {renderBandEditor(currentBareme.rowMetric, row, "row")}
                </TouchableOpacity>

                {currentBareme.columns.map((column) => {
                  const key = cellKey(row.id, column.id);
                  const cell = currentBareme.cells[key] || { points: "0" };

                  return (
                    <View
                      key={column.id}
                      style={[
                        styles.scoreCell,
                        { width: columnWidth },
                        deleteMode === "row" && selectedDeleteId === row.id && styles.deleteSelectedCell,
                        deleteMode === "column" && selectedDeleteId === column.id && styles.deleteSelectedCell,
                        insertMode === "row" && selectedInsertId === row.id && styles.insertSelectedCell,
                        insertMode === "column" && selectedInsertId === column.id && styles.insertSelectedCell,
                      ]}
                    >
                      <TextInput
                        value={String(cell.points ?? "")}
                        onChangeText={(text) =>
                          updateCell(row.id, column.id, cleanDecimalInput(text))
                        }
                        keyboardType="decimal-pad"
                        style={styles.scoreInput}
                      />
                      <Text style={styles.pointsSuffix}>pts</Text>
                    </View>
                  );
                })}
              </View>
            ))}

            <TouchableOpacity onPress={addRow} style={[styles.addRowBtn, { width: leftWidth }]}>
              <Plus size={18} color="#166534" />
              <Text style={styles.addBtnTxt}>Ajouter une ligne</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.fill}>
        <View
          style={[
            styles.header,
            {
              minHeight: headerHeight,
              paddingHorizontal: horizontalPadding,
            },
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={retour}
            style={[
              styles.topIconButton,
              {
                width: headerIconBox,
                height: headerIconBox,
                borderRadius: 12,
              },
            ]}
          >
            <ArrowLeft size={headerIconSize} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { fontSize: headerTitleSize }]}>Evaluation</Text>
          </View>

          <View style={styles.headerTools}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => toggleInsertMode("row")}
              style={[
                styles.headerToolBtn,
                insertMode === "row" && styles.headerToolBtnActive,
                !currentBareme?.configured && styles.headerToolBtnDisabled,
              ]}
              disabled={!currentBareme?.configured}
            >
              <View style={styles.insertToolWrap}>
                <Plus size={14} color="#BBF7D0" strokeWidth={3} />
                <View style={styles.insertRowGlyph} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => toggleInsertMode("column")}
              style={[
                styles.headerToolBtn,
                insertMode === "column" && styles.headerToolBtnActive,
                (!currentBareme?.configured || currentBareme?.tableType !== "double") &&
                  styles.headerToolBtnDisabled,
              ]}
              disabled={!currentBareme?.configured || currentBareme?.tableType !== "double"}
            >
              <View style={styles.insertToolWrap}>
                <Plus size={14} color="#BBF7D0" strokeWidth={3} />
                <View style={styles.insertColumnGlyph} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => toggleDeleteMode("row")}
              style={[
                styles.headerToolBtn,
                deleteMode === "row" && styles.headerToolBtnActive,
                !currentBareme?.configured && styles.headerToolBtnDisabled,
              ]}
              disabled={!currentBareme?.configured}
            >
              <View style={styles.deleteRowGlyph} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => toggleDeleteMode("column")}
              style={[
                styles.headerToolBtn,
                deleteMode === "column" && styles.headerToolBtnActive,
                (!currentBareme?.configured || currentBareme?.tableType !== "double") &&
                  styles.headerToolBtnDisabled,
              ]}
              disabled={!currentBareme?.configured || currentBareme?.tableType !== "double"}
            >
              <View style={styles.deleteColumnGlyph} />
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
            <Text style={styles.loadingTxt}>Chargement...</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.contentZone}
            contentContainerStyle={{
              minHeight: "100%",
              paddingHorizontal: horizontalPadding,
              paddingTop: 12,
              paddingBottom: BOTTOM_BAR_HEIGHT + 28,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {renderPagesBar()}
            {renderTable()}
          </ScrollView>
        )}

        {insertMode && selectedInsertId ? (
          <View pointerEvents="box-none" style={styles.actionOverlayWrap}>
            <View style={styles.insertOverlayPanel}>
              <TouchableOpacity
                activeOpacity={0.92}
                onPress={() => confirmInsertSelection("before")}
                style={styles.insertOverlayBtn}
              >
                {insertMode === "row" ? (
                  <ArrowUp size={18} color="#FFFFFF" strokeWidth={3} />
                ) : (
                  <ArrowLeft size={18} color="#FFFFFF" strokeWidth={3} />
                )}
                <Text style={styles.actionOverlayText}>
                  {insertMode === "row" ? "Au-dessus" : "À gauche"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.92}
                onPress={() => confirmInsertSelection("after")}
                style={styles.insertOverlayBtn}
              >
                {insertMode === "row" ? (
                  <ArrowDown size={18} color="#FFFFFF" strokeWidth={3} />
                ) : (
                  <ArrowRight size={18} color="#FFFFFF" strokeWidth={3} />
                )}
                <Text style={styles.actionOverlayText}>
                  {insertMode === "row" ? "En dessous" : "À droite"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {deleteMode && selectedDeleteId ? (
          <View pointerEvents="box-none" style={styles.deleteOverlayWrap}>
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={confirmDeleteSelection}
              style={styles.deleteOverlayBtn}
            >
              <Trash2 size={18} color="#FFFFFF" />
              <Text style={styles.actionOverlayText}>
                Supprimer la {deleteMode === "row" ? "ligne" : "colonne"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <BottomBar currentPage="gestionResultats" onNavigate={setPage as any} />
      </View>
    </SafeAreaView>
  );
}

function TimePartInput({
  value,
  label,
  onChange,
}: {
  value: number;
  label: string;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.timePart}>
      <TextInput
        value={String(value ?? 0)}
        onChangeText={(text) => onChange(cleanInt(text))}
        keyboardType="number-pad"
        style={styles.timeInput}
      />
      <Text style={styles.timeLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: PAGE_BG,
  },

  fill: {
    flex: 1,
  },

  header: {
    backgroundColor: HEADER_BG,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  topIconButton: {
    backgroundColor: HEADER_ICON_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  headerCenter: {
    flex: 1,
  },

  headerTitle: {
    color: "#FFFFFF",
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  headerTools: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  headerToolBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },

  headerToolBtnActive: {
    backgroundColor: "rgba(255,255,255,0.22)",
    borderColor: "rgba(255,255,255,0.35)",
  },

  headerToolBtnDisabled: {
    opacity: 0.35,
  },

  deleteRowGlyph: {
    width: 26,
    height: 7,
    borderRadius: 999,
    backgroundColor: "#EF4444",
  },

  deleteColumnGlyph: {
    width: 7,
    height: 26,
    borderRadius: 999,
    backgroundColor: "#EF4444",
  },

  insertToolWrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },

  insertRowGlyph: {
    width: 24,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#22C55E",
  },

  insertColumnGlyph: {
    width: 6,
    height: 24,
    borderRadius: 999,
    backgroundColor: "#22C55E",
  },

  contentZone: {
    flex: 1,
    backgroundColor: CONTENT_BG,
    borderTopWidth: 1,
    borderTopColor: "rgba(15,23,42,0.10)",
  },

  center: {
    flex: 1,
    backgroundColor: CONTENT_BG,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingTxt: {
    marginTop: 8,
    color: MUTED,
    fontWeight: "800",
  },

  pagesBar: {
    marginBottom: 10,
  },

  pagesRow: {
    gap: 8,
    alignItems: "center",
    paddingBottom: 10,
  },

  pageBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },

  pageBtnActive: {
    backgroundColor: YELLOW,
    borderColor: "#D99B08",
  },

  pageBtnAdd: {
    backgroundColor: "#FFFFFF",
  },

  pageBtnDel: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FCA5A5",
  },

  copyBaremeBtn: {
    height: 34,
    borderRadius: 10,
    backgroundColor: "#DBEAFE",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.35)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
  },

  copyBaremeText: {
    color: "#1D4ED8",
    fontWeight: "900",
    fontSize: 12,
  },

  pageBtnTxt: {
    color: TEXT,
    fontWeight: "900",
  },

  pageBtnTxtActive: {
    color: "#111827",
  },

  disabled: {
    opacity: 0.35,
  },

  baremeNameInput: {
    alignSelf: "center",
    minWidth: 210,
    maxWidth: 420,
    width: "72%",
    height: 42,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    textAlign: "center",
    color: TEXT,
    fontWeight: "900",
    fontSize: 17,
    paddingHorizontal: 12,
  },

  setupShell: {
    flexGrow: 1,
    minHeight: 430,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
  },

  setupCard: {
    width: "100%",
    maxWidth: 760,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: PANEL_BG,
    padding: 20,
    gap: 18,
  },

  setupCardMobile: {
    padding: 14,
    gap: 14,
  },

  setupTitle: {
    color: TEXT,
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
  },

  setupSection: {
    gap: 10,
  },

  setupStep: {
    color: TEXT,
    fontSize: 15,
    fontWeight: "900",
  },

  segment: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },

  segmentBtn: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    flexGrow: 1,
  },

  segmentBtnActive: {
    backgroundColor: "#DCFCE7",
    borderColor: "rgba(34,197,94,0.45)",
  },

  segmentTxt: {
    color: TEXT,
    fontWeight: "900",
    fontSize: 13,
    textAlign: "center",
  },

  segmentTxtActive: {
    color: "#166534",
  },

  choiceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  choiceBtn: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
    flexBasis: 150,
  },

  choiceBtnActive: {
    backgroundColor: "#DBEAFE",
    borderColor: "rgba(59,130,246,0.45)",
  },

  choiceText: {
    color: TEXT,
    fontWeight: "800",
    fontSize: 12,
    textAlign: "center",
  },

  choiceTextActive: {
    color: "#1D4ED8",
  },

  roleList: {
    gap: 10,
  },

  roleRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.10)",
    backgroundColor: "#F8FAFC",
    padding: 10,
    gap: 8,
  },

  roleMetricName: {
    color: TEXT,
    fontWeight: "900",
    fontSize: 13,
  },

  roleChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  roleChoiceBtn: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    flexGrow: 1,
    flexBasis: 92,
  },

  roleChoiceBtnActive: {
    backgroundColor: "#DBEAFE",
    borderColor: "rgba(59,130,246,0.45)",
  },

  roleChoiceText: {
    color: TEXT,
    fontWeight: "800",
    fontSize: 12,
  },

  roleChoiceTextActive: {
    color: "#1D4ED8",
  },

  simpleRoleBox: {
    gap: 8,
  },

  simpleRoleTitle: {
    color: MUTED,
    fontWeight: "900",
    fontSize: 12,
  },

  simpleRoleNote: {
    color: MUTED,
    fontWeight: "800",
    fontSize: 12,
  },

  fixedColumnBox: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.10)",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  fixedColumnText: {
    color: MUTED,
    fontWeight: "900",
  },

  createBtn: {
    alignSelf: "center",
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: BLUE,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 26,
    marginTop: 2,
  },

  createBtnDisabled: {
    backgroundColor: "#94A3B8",
    opacity: 0.65,
  },

  createBtnText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 15,
  },

  tablePanel: {
    backgroundColor: PANEL_BG,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
  },

  tableTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
    flexWrap: "wrap",
  },

  tableTitle: {
    color: TEXT,
    fontWeight: "900",
    fontSize: 16,
  },

  tableSubtitle: {
    color: MUTED,
    fontWeight: "800",
    fontSize: 12,
    marginTop: 2,
  },

  editSetupBtn: {
    minHeight: 34,
    borderRadius: 10,
    backgroundColor: "#E8F1FD",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.22)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },

  editSetupText: {
    color: "#1D4ED8",
    fontWeight: "900",
    fontSize: 12,
  },

  tableRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },

  cornerTopBlank: {
    height: 34,
    backgroundColor: "transparent",
  },

  columnGroupHeader: {
    height: 34,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#E8F1FD",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },

  columnGroupHeaderText: {
    color: TEXT,
    fontWeight: "900",
    fontSize: 13,
  },

  cornerCell: {
    minHeight: 76,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#E8F1FD",
    borderTopLeftRadius: 12,
    padding: 10,
    justifyContent: "center",
  },

  cornerSub: {
    color: TEXT,
    fontSize: 13,
    fontWeight: "900",
  },

  headerCell: {
    minHeight: 76,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: BORDER,
    backgroundColor: "#F8FAFC",
    padding: 8,
    justifyContent: "center",
  },

  headerCellTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 6,
  },

  headerCellTitle: {
    color: TEXT,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },

  beaconNumberTitle: {
    fontSize: 22,
    lineHeight: 26,
  },

  rowHeaderCell: {
    minHeight: 76,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: BORDER,
    backgroundColor: "#F8FAFC",
    padding: 8,
    justifyContent: "center",
  },

  rowHeaderTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 6,
  },

  rowHeaderTitle: {
    color: TEXT,
    fontSize: 12,
    fontWeight: "900",
  },

  miniIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "rgba(15,23,42,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },

  deleteSelectedCell: {
    backgroundColor: "#FEE2E2",
    borderColor: "#EF4444",
  },

  insertSelectedCell: {
    backgroundColor: "#DCFCE7",
    borderColor: "#22C55E",
  },

  scoreCell: {
    minHeight: 76,
    borderWidth: 1,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },

  scoreInput: {
    width: 48,
    height: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.12)",
    backgroundColor: "#F8FAFC",
    color: TEXT,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
    padding: 0,
  },

  pointsSuffix: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "900",
    marginLeft: 4,
  },

  timeEditor: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },

  timePart: {
    width: 45,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.12)",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },

  timeInput: {
    minWidth: 18,
    color: TEXT,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
    padding: 0,
  },

  timeLabel: {
    color: MUTED,
    fontSize: 9,
    fontWeight: "900",
    marginLeft: 2,
  },

  toTxt: {
    color: MUTED,
    fontWeight: "900",
    fontSize: 12,
  },

  valueInput: {
    width: 84,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.12)",
    backgroundColor: "#FFFFFF",
    color: TEXT,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
    paddingHorizontal: 8,
  },

  scoreRangeEditor: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 5,
  },

  rangeLabel: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "900",
  },

  rangeInput: {
    width: 52,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.12)",
    backgroundColor: "#FFFFFF",
    color: TEXT,
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
    paddingHorizontal: 6,
  },

  addColumnBtn: {
    minHeight: 76,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: BORDER,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },

  addRowBtn: {
    height: 44,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: BORDER,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    backgroundColor: "#DCFCE7",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  addBtnTxt: {
    color: "#166534",
    fontWeight: "900",
    fontSize: 12,
  },

  deleteOverlayWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: BOTTOM_BAR_HEIGHT + 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  actionOverlayWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: BOTTOM_BAR_HEIGHT + 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  insertOverlayPanel: {
    minHeight: 50,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.10)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 5,
    gap: 6,
  },

  insertOverlayBtn: {
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: "#16A34A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    gap: 7,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },

  deleteOverlayBtn: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: "#DC2626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },

  actionOverlayText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 15,
  },
});
