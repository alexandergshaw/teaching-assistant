"use client";

// The Tasks tab (AC1): a courses x tasks matrix with two sub-views sharing
// ONE grid component (TasksGrid) - Term Setup (the once-per-term catalog,
// AC3) and Daily/Weekly (the period-scoped catalog, AC14). This file owns
// the tab-level wiring: the data hook, every persisted filter/sort/column/
// density control, the resolved catalog per sub-view, bulk-action
// confirmation + announcements, CSV export, and the Manage Tasks dialog. It
// deliberately does not reimplement any decision course-tasks.ts/
// course-tasks-view.ts already makes (filtering, sorting, progress, CSV,
// catalog resolution) - see those modules for the actual logic.
import type React from "react";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TabShell from "./TabShell";
import type { TasksView } from "../url-state";
import { TASK_GROUPS, TERM_TASKS, RECURRING_TASKS } from "@/lib/course-tasks-catalog";
import {
  type TaskCell as TaskCellValue,
  type TaskGroupId,
  type TaskStatus,
} from "@/lib/course-tasks";
import {
  ALL_FILTER,
  baseTaskCatalogOverride,
  buildTasksCsv,
  computeTaskProgress,
  describeTaskColumnFilters,
  distinctInstitutions,
  distinctTerms,
  filterTaskRows,
  hasActiveColumnFilter,
  normalizeTaskColumnFilters,
  parseTaskColumnSet,
  resolveTaskCatalog,
  resolveTaskSort,
  serializeTaskColumnSet,
  sortTaskRows,
  TASK_COLUMNS_ADDED_IN,
  terminated,
  type TaskCatalogOverride,
  type TaskColumnFilters,
  type TaskRow,
  type TaskRowFilters,
  type TaskSortState,
} from "@/lib/course-tasks-view";
import {
  debounceElapsed,
  groupPositionAssignments,
  isValidDropTarget,
  moveToGroupEdge,
  moveWithinGroup,
  positionWithinGroup,
  stepWithinGroup,
  type ReorderableColumn,
} from "./tasks/columnOrder";
import { useCourseTasksData } from "./tasks/useCourseTasksData";
import { useTaskCellErrors } from "./tasks/useTaskCellErrors";
import { useTaskBulkActions } from "./tasks/useTaskBulkActions";
import { shouldShowEmptyState, shouldShowMainContent, errorBannerText } from "./tasks/taskLoadState";
import TasksToolbar from "./tasks/TasksToolbar";
import TasksGrid, { type Density, type TasksGridHandle } from "./tasks/TasksGrid";
import ManageTasksDialog from "./tasks/ManageTasksDialog";
import TaskAttachmentsDialog from "./tasks/TaskAttachmentsDialog";
import { taskAttachmentsAt } from "@/lib/course-task-attachments";
import {
  loadUiState,
  persistUiState,
  loadDensity,
  loadTaskColumnFilters,
  persistTaskColumnFilters,
  type TaskViewUiState,
} from "./tasks/tasksUiState";
import pageStyles from "../page.module.css";
import styles from "./tasks/TasksGrid.module.css";

// Impure Date.now() read isolated in this tiny top-level helper (mirrors
// currentTimeMs in WeeklyChecklistCell.tsx) so eslint's react-hooks/purity
// rule - which flags a DIRECT Date.now() call inside a component body - reads
// clean, while the component still gets an accurate "now" every render
// without a live ticker (AC14 item 78: "the component re-derives on mount
// and on sub-view entry"). course-tasks.ts/course-tasks-view.ts themselves
// stay pure modules; this is the one place their nowMs parameters are
// actually sourced from the clock for the Tasks tab.
function currentTimeMs(): number {
  return Date.now();
}

// AC-F item 229's announcement prose for the four non-task sort fields - a
// small, presentation-only map local to this component (unlike
// TASK_STATUS_WORDS, this text is never compared or persisted, so a second
// copy here reading slightly differently from the toolbar's own
// SORT_FIELD_LABELS is not a drift risk the way a status word would be).
const SORT_FIELD_ANNOUNCE_LABELS: Record<"name" | "institution" | "term" | "progress", string> = {
  name: "Course",
  institution: "Institution",
  term: "Term",
  progress: "Progress",
};

export interface TasksTabProps {
  view: TasksView;
  onViewChange: (view: TasksView) => void;
}

export default function TasksTab({ view, onViewChange }: TasksTabProps) {
  const data = useCourseTasksData();
  const { setCell, setCourseCells, setInstruction, saveDef, saveDefs, reload } = data;

  const nowMs = currentTimeMs();

  const [uiState, setUiState] = useState<Record<TasksView, TaskViewUiState>>(() => ({
    term: loadUiState("term"),
    recurring: loadUiState("recurring"),
  }));
  const current = uiState[view];

  const updateUi = useCallback(
    (patch: (prevView: TaskViewUiState) => Partial<TaskViewUiState>) => {
      setUiState((prev) => {
        const nextView = { ...prev[view], ...patch(prev[view]) };
        persistUiState(view, nextView);
        return { ...prev, [view]: nextView };
      });
    },
    [view]
  );

  const [rawColumns, setRawColumns] = useState<Record<TasksView, string | null>>(() => ({
    term: typeof window === "undefined" ? null : localStorage.getItem("ta-tasks-term-columns"),
    recurring: typeof window === "undefined" ? null : localStorage.getItem("ta-tasks-recurring-columns"),
  }));

  // AC-C: task-column filters, on their OWN per-sub-view storage key (item
  // 216) via the pure taskColumnFiltersKey builder tasksUiState.ts wraps -
  // Term Setup and Daily/Weekly keep separate filter state, exactly like
  // every other control here.
  const [columnFiltersState, setColumnFiltersState] = useState<Record<TasksView, TaskColumnFilters>>(() => ({
    term: loadTaskColumnFilters("term"),
    recurring: loadTaskColumnFilters("recurring"),
  }));
  const columnFilters = columnFiltersState[view];

  const [density, setDensityState] = useState<Density>(loadDensity);
  const setDensity = (d: Density) => {
    setDensityState(d);
    try {
      if (typeof window !== "undefined") localStorage.setItem("ta-tasks-density", d);
    } catch {
      // best-effort persistence only
    }
  };

  const [highlightOutstanding, setHighlightState] = useState<boolean>(() =>
    typeof window === "undefined" ? false : localStorage.getItem("ta-tasks-highlight") === "true"
  );
  const setHighlightOutstanding = (v: boolean) => {
    setHighlightState(v);
    try {
      if (typeof window !== "undefined") localStorage.setItem("ta-tasks-highlight", String(v));
    } catch {
      // best-effort persistence only
    }
  };

  // -----------------------------------------------------------------------
  // Catalog resolution (AC9) - one call, shared by both sub-views because
  // resolveTaskCatalog itself is parametrized on `view`.
  const builtIns = view === "term" ? TERM_TASKS : RECURRING_TASKS;
  const groups = useMemo(() => TASK_GROUPS.filter((g) => g.view === view).map((g) => ({ id: g.id, label: g.label })), [view]);
  const resolvedCatalog = useMemo(() => resolveTaskCatalog(builtIns, data.overrides, view), [builtIns, data.overrides, view]);
  const resolvedIds = useMemo(() => resolvedCatalog.map((t) => t.id), [resolvedCatalog]);

  const visibleColumnIds = useMemo(
    () => new Set(parseTaskColumnSet(rawColumns[view], { allIds: resolvedIds, addedIn: TASK_COLUMNS_ADDED_IN })),
    [rawColumns, view, resolvedIds]
  );
  const visibleTasks = useMemo(() => resolvedCatalog.filter((t) => visibleColumnIds.has(t.id)), [resolvedCatalog, visibleColumnIds]);

  // C5: the column-reorder module's input, built from resolvedCatalog +
  // visibleColumnIds - NEVER from TasksGrid's own `columns`, which (via
  // tasks={visibleTasks} below) only ever contains VISIBLE tasks. Feeding
  // the reorder module from there would leave every hidden task's position
  // untouched, sorting it to the end of its group the next time the catalog
  // resolves (AC8 item 39).
  const reorderColumns: ReorderableColumn[] = useMemo(
    () => resolvedCatalog.map((t) => ({ id: t.id, group: t.group, visible: visibleColumnIds.has(t.id) })),
    [resolvedCatalog, visibleColumnIds]
  );

  const toggleColumn = (taskId: string) => {
    const next = visibleColumnIds.has(taskId)
      ? resolvedIds.filter((id) => visibleColumnIds.has(id) && id !== taskId)
      : [...resolvedIds.filter((id) => visibleColumnIds.has(id)), taskId];
    const serialized = serializeTaskColumnSet(next, resolvedIds);
    setRawColumns((prev) => ({ ...prev, [view]: serialized }));
    try {
      if (typeof window !== "undefined") localStorage.setItem(`ta-tasks-${view}-columns`, serialized);
    } catch {
      // best-effort persistence only
    }
  };

  const showAllColumns = () => {
    const serialized = serializeTaskColumnSet(resolvedIds, resolvedIds);
    setRawColumns((prev) => ({ ...prev, [view]: serialized }));
    try {
      if (typeof window !== "undefined") localStorage.setItem(`ta-tasks-${view}-columns`, serialized);
    } catch {
      // best-effort persistence only
    }
  };

  const collapsedGroupsSet = useMemo(() => new Set(current.collapsedGroups), [current.collapsedGroups]);
  const toggleGroupCollapse = (groupId: TaskGroupId) => {
    updateUi((prevView) => ({
      collapsedGroups: prevView.collapsedGroups.includes(groupId)
        ? prevView.collapsedGroups.filter((g) => g !== groupId)
        : [...prevView.collapsedGroups, groupId],
    }));
  };

  // -----------------------------------------------------------------------
  // Rows, filters, sort (AC7/AC8)
  const allRows: TaskRow[] = useMemo(
    () => data.courses.map((c) => ({ course: c, cells: data.cellsByCourse[c.id] ?? {} })),
    [data.courses, data.cellsByCourse]
  );
  const institutionOptions = useMemo(() => distinctInstitutions(allRows), [allRows]);
  const termOptions = useMemo(() => distinctTerms(allRows), [allRows]);

  // Amendment 132: outstandingOnly is scoped to the visible task columns,
  // and disabled entirely (never silently emptying the table) once every
  // column in the view is hidden.
  const outstandingOnlyDisabled = visibleTasks.length === 0;
  const effectiveOutstandingOnly = outstandingOnlyDisabled ? false : current.outstandingOnly;

  const filteredRows = useMemo(
    () =>
      filterTaskRows(
        allRows,
        visibleTasks,
        {
          search: current.search,
          institution: current.institution,
          term: current.term,
          outstandingOnly: effectiveOutstandingOnly,
          columns: columnFilters,
        },
        nowMs
      ),
    [allRows, visibleTasks, current.search, current.institution, current.term, effectiveOutstandingOnly, columnFilters, nowMs]
  );
  // item 205: resolved ONCE here, so the grid's aria-sort/indicators, the
  // toolbar's Sort select, and the actual row order below can never
  // disagree about what "the current sort" is - a sort naming a
  // hidden/retired/deleted column degrades to DEFAULT_TASK_SORT everywhere
  // at once rather than in three places that could drift apart.
  const resolvedSort = useMemo(() => resolveTaskSort(current.sort, visibleTasks), [current.sort, visibleTasks]);
  const sortedRows = useMemo(() => sortTaskRows(filteredRows, visibleTasks, resolvedSort, nowMs), [filteredRows, visibleTasks, resolvedSort, nowMs]);

  const overallProgress = useMemo(() => {
    return sortedRows.reduce(
      (acc, row) => {
        const p = computeTaskProgress(row.cells, visibleTasks, nowMs);
        return { done: acc.done + p.done, applicable: acc.applicable + p.applicable };
      },
      { done: 0, applicable: 0 }
    );
  }, [sortedRows, visibleTasks, nowMs]);

  const summaryText =
    data.courses.length === 0
      ? ""
      : `${overallProgress.done}/${overallProgress.applicable} done across ${sortedRows.length} course${sortedRows.length === 1 ? "" : "s"}`;

  const periodCaption =
    view === "recurring" ? "Daily tasks clear at midnight; weekly tasks clear Sunday." : undefined;

  // BLOCKER 3/4 + SHOULD 8: the one place "is there an error, and which
  // wording" gets decided (taskLoadState.ts, pure/tested) - both the error
  // banner and the empty-state gate below read from `data.state`/`data.error`
  // directly, but only through these two helpers, never a re-derived
  // `data.error &&`/`data.courses.length === 0` pair of their own.
  const errorText = errorBannerText(data.state, data.error);

  // Shared live region (AC6 item 33, AC12 item 63; S7/S8) - bulk-action
  // results AND per-cell save errors both funnel through this one
  // announcement string, declared here (ahead of both "Cell edits" and
  // "Bulk actions" below) since both sections' handlers reference the
  // setter.
  const [announcement, setAnnouncement] = useState("");

  // -----------------------------------------------------------------------
  // Sort and column filters (AC-A/AC-B/AC-F item 229) - the handlers behind
  // every new entry point this feature adds (toolbar Sort select, each
  // header's menu, the filter chips). Sort/filter state itself lives in
  // `uiState`/`columnFiltersState` above; these are where a change becomes
  // both persisted AND announced.
  const handleSortChange = (next: TaskSortState) => {
    updateUi(() => ({ sort: next }));
    const resolved = resolveTaskSort(next, visibleTasks);
    const label =
      resolved.field === "task"
        ? (resolvedCatalog.find((t) => t.id === resolved.taskId)?.label ?? "column")
        : SORT_FIELD_ANNOUNCE_LABELS[resolved.field];
    setAnnouncement(`Sorted by ${label}, ${resolved.direction === "asc" ? "ascending" : "descending"}.`);
  };

  // B7 (item 229): the "N of M courses shown" recount, shared by EVERY
  // filter entry point - a task column's filter, institution, term, and
  // outstanding-only alike, since item 220's scope decisions make the
  // latter three the Course/Progress columns' own filters - so they all
  // announce identically instead of each hand-rolling its own slightly
  // different filterTaskRows call. Computed SYNCHRONOUSLY against explicit
  // overrides (rather than reading the memoized `sortedRows`, which will
  // not reflect a change until the next render) so the announcement is
  // accurate to the change that just happened, not the one before it.
  const recountShownText = useCallback(
    (overrides: Partial<Pick<TaskRowFilters, "search" | "institution" | "term" | "outstandingOnly" | "columns">>) => {
      const total = allRows.length;
      const count = filterTaskRows(
        allRows,
        visibleTasks,
        {
          search: current.search,
          institution: current.institution,
          term: current.term,
          outstandingOnly: effectiveOutstandingOnly,
          columns: columnFilters,
          ...overrides,
        },
        nowMs
      ).length;
      return `${count} of ${total} course${total === 1 ? "" : "s"} shown.`;
    },
    [allRows, visibleTasks, current.search, current.institution, current.term, effectiveOutstandingOnly, columnFilters, nowMs]
  );

  const handleColumnFilterChange = (taskId: string, statuses: TaskStatus[]) => {
    const nextColumns = normalizeTaskColumnFilters({ ...columnFilters, [taskId]: statuses });
    setColumnFiltersState((prev) => ({ ...prev, [view]: nextColumns }));
    persistTaskColumnFilters(view, nextColumns);

    const task = resolvedCatalog.find((t) => t.id === taskId);
    if (!task) return;
    const shownText = recountShownText({ columns: nextColumns });
    if (hasActiveColumnFilter(nextColumns, taskId)) {
      const statusWords = describeTaskColumnFilters(nextColumns, visibleTasks).find((d) => d.taskId === taskId)?.statusWords ?? "";
      // C4: `task.label` is one of the ~40 catalog labels that can already
      // end in "?" - `terminated` (shared with TasksGrid.tsx, moved to
      // course-tasks-view.ts so this path gets it too) avoids a blind
      // `+ "."` producing "Textbook ordered?. 26 of 26 courses shown."
      setAnnouncement(`${terminated(`Filtered ${task.label} to ${statusWords}`)} ${shownText}`);
    } else {
      setAnnouncement(`${terminated(`Cleared filter on ${task.label}`)} ${shownText}`);
    }
  };

  const handleClearColumnFilter = (taskId: string) => handleColumnFilterChange(taskId, []);

  // B7 (item 229): institution/term/outstanding-only are the Course and
  // Progress columns' OWN filters (item 220's scope decision), reached from
  // the very same header menus as a task column's filter - so they route
  // through the same announcement + recount path above instead of
  // `updateUi` alone, which announced nothing. Named handlers (not a
  // second inline `updateUi` arrow at each call site) so the toolbar's
  // controls and the Course/Progress header menu's controls - which item
  // 220 requires to be the SAME controlled value/handler pair - genuinely
  // share one implementation rather than two copies that could drift
  // apart on whether they announce at all.
  const handleInstitutionChange = (v: string) => {
    updateUi(() => ({ institution: v }));
    const shownText = recountShownText({ institution: v });
    setAnnouncement(
      v === ALL_FILTER ? `Cleared filter on Course. ${shownText}` : `Filtered Course to Institution: ${v}. ${shownText}`
    );
  };

  const handleTermChange = (v: string) => {
    updateUi(() => ({ term: v }));
    const shownText = recountShownText({ term: v });
    setAnnouncement(v === ALL_FILTER ? `Cleared filter on Course. ${shownText}` : `Filtered Course to Term: ${v}. ${shownText}`);
  };

  const handleOutstandingOnlyChange = (v: boolean) => {
    updateUi(() => ({ outstandingOnly: v }));
    // C5: guarded the same way `effectiveOutstandingOnly` guards the base
    // filters object below (amendment 132) - both entry points that can
    // reach this handler are themselves disabled while outstandingOnlyDisabled
    // is true, so this is currently unreachable, but passing the raw `v`
    // here would silently bypass the guard the moment that stops being true.
    const shownText = recountShownText({ outstandingOnly: outstandingOnlyDisabled ? false : v });
    setAnnouncement(v ? `Filtered Progress to outstanding only. ${shownText}` : `Cleared filter on Progress. ${shownText}`);
  };

  // item 226: resets every active FILTER - search, institution, term,
  // outstanding-only, and every column filter - never the sort, the
  // column-visibility set, or density, which are separate controls with
  // their own reset paths.
  const handleClearAllFilters = () => {
    updateUi(() => ({ search: "", institution: ALL_FILTER, term: ALL_FILTER, outstandingOnly: false }));
    setColumnFiltersState((prev) => ({ ...prev, [view]: {} }));
    persistTaskColumnFilters(view, {});
    setAnnouncement("Cleared all filters.");
  };

  // -----------------------------------------------------------------------
  // Cell edits (AC5) - per-cell inline error. State lives in
  // useTaskCellErrors.ts (line-budget split - shared with the bulk-action
  // hook below, which reports/clears the SAME map for a bulk write's
  // per-course outcomes, BLOCKER 2).
  //
  // SHOULD 7: the error is cleared ONLY on the next attempt for that same
  // (courseId, taskId) key (clearCellError below, at the START of
  // handleCellChange) or on a bulk write that SUCCEEDED for it
  // (useTaskBulkActions.ts) - never on a timer. The optimistic value has
  // already reverted by the time a failure reaches here
  // (useCourseTasksData.ts), so a clock-based clear used to erase the ONLY
  // visible evidence of the failure while the cell quietly showed the old
  // status again.
  const { cellErrors, reportCellError: markCellError, clearCellError } = useTaskCellErrors();
  // S7/S8: cell save errors are announced through the ONE always-mounted
  // live region below (not a per-cell `role="status"` span that mounts at
  // the same instant as its own text, unreliable, and there can be over a
  // thousand of these cells) - `reportCellSaveError` is the single place a
  // single-cell edit's error becomes user-visible, so it is also the single
  // place it gets announced.
  const reportCellSaveError = (key: string, message: string, courseName: string, taskLabel: string) => {
    markCellError(key, message);
    setAnnouncement(`Could not save ${taskLabel} for ${courseName}: ${message}`);
  };

  // Not wrapped in useCallback: every caller below already wraps it in its
  // own inline arrow (TasksGrid's onCellChange prop), so memoizing this
  // would not save a child re-render either way - simpler to leave it a
  // plain function than to reason about exhaustive-deps for no benefit.
  const handleCellChange = async (courseId: string, taskId: string, nextCell: TaskCellValue) => {
    const key = `${courseId}:${taskId}`;
    clearCellError(key);
    const result = await setCell(courseId, taskId, nextCell);
    if (!result.ok) {
      const courseName = allRows.find((r) => r.course.id === courseId)?.course.name ?? "this course";
      const taskLabel = resolvedCatalog.find((t) => t.id === taskId)?.label ?? "this task";
      reportCellSaveError(key, result.error ?? "Could not save.", courseName, taskLabel);
    }
  };

  // -----------------------------------------------------------------------
  // Institution instructions (AC5, docs/task-institution-instructions-
  // acceptance-criteria.md) - both editing surfaces (TaskCell's cell editor,
  // TaskColumnMenu's column menu) funnel through this ONE handler, which
  // announces success/failure through the SAME polite live region every
  // other Tasks-tab action uses (item 23) - never a per-cell region. The
  // hook (useCourseTasksData.ts) already reverted its own optimistic
  // local-map update by the time a failure reaches here (item 26); this
  // handler's only job is to make that failure audible rather than silent.
  const handleSaveInstruction = async (institution: string, taskId: string, body: string) => {
    const taskLabel = resolvedCatalog.find((t) => t.id === taskId)?.label ?? "this task";
    const result = await setInstruction(institution, taskId, body);
    if (!result.ok) {
      setAnnouncement(
        `Could not save instructions for ${taskLabel} at ${institution}: ${result.error ?? "save failed"}.`
      );
      return;
    }
    // AC5 item 25: a blank body is a clear, not a save - said in the
    // announcement so an instructor who just deleted a shared instruction
    // does not read "Saved" and wonder whether it actually took.
    setAnnouncement(
      body.trim() === ""
        ? `Cleared instructions for ${taskLabel} at ${institution}.`
        : `Saved instructions for ${taskLabel} at ${institution}.`
    );
  };

  // -----------------------------------------------------------------------
  // Bulk actions (AC6) - column/row/fill-down all funnel through one confirm
  // + apply + announce pipeline. State/writes/counting-and-messaging all
  // live in useTaskBulkActions.ts / bulkConfirmDecision.ts (line-budget
  // split, BLOCKER 1/2 fixes) - this file only wires the hook's inputs
  // (current filtered/sorted rows, the shared cell-error map, the shared
  // announcement) through to it and renders the confirm dialog it drives.
  const {
    pendingBulk,
    cancelBulk,
    confirmBulk,
    handleColumnBulkSet,
    handleRowBulkSet,
    handleFillDown,
  } = useTaskBulkActions({
    sortedRows,
    allRows,
    visibleTasks,
    nowMs,
    setCourseCells,
    reportCellError: markCellError,
    clearCellError,
    setAnnouncement,
  });
  // SHOULD 5: see the Dialog's own comment below.
  const bulkConfirmDescId = useId();

  // -----------------------------------------------------------------------
  // CSV export (AC10, period stated for AC14 item 80)
  const handleDownloadCsv = () => {
    const generatedLabel = view === "recurring" ? `Snapshot taken ${new Date(nowMs).toLocaleString()}` : undefined;
    const csv = buildTasksCsv(sortedRows, visibleTasks, nowMs, generatedLabel);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tasks-${view}-${new Date(nowMs).toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // -----------------------------------------------------------------------
  // Column reorder (AC1-AC7): drag, Shift+Left/Right, and the column menu's
  // move commands all funnel through applyReorder - the ONE place that
  // turns a columnOrder.ts result into a bulk write (AC2). A move that
  // returns null (already at the edge, cross-group, unknown id) is simply
  // dropped; the pure layer already decided it was not a real move.
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const lastReorderFlushRef = useRef<number | null>(null);
  const pendingReorderRef = useRef<{ text: string; timeout: number } | null>(null);

  // AC5 item 19: debounced to 100ms via the pure debounceElapsed helper, so
  // a fast drag's rapid position changes announce at most every 100ms - the
  // trailing-most text always wins once the interval elapses.
  const announceReorder = useCallback((text: string) => {
    const now = Date.now();
    if (debounceElapsed(lastReorderFlushRef.current, now)) {
      lastReorderFlushRef.current = now;
      setReorderAnnouncement(text);
      return;
    }
    if (pendingReorderRef.current) window.clearTimeout(pendingReorderRef.current.timeout);
    const timeout = window.setTimeout(() => {
      lastReorderFlushRef.current = Date.now();
      setReorderAnnouncement(text);
      pendingReorderRef.current = null;
    }, 100);
    pendingReorderRef.current = { text, timeout };
  }, []);

  const applyReorder = useCallback(
    async (moved: ReorderableColumn[] | null, movedTaskId: string) => {
      if (!moved) return;
      const groupId = moved.find((c) => c.id === movedTaskId)?.group;
      if (!groupId) return;
      const label = resolvedCatalog.find((t) => t.id === movedTaskId)?.label ?? movedTaskId;
      const nextOverrides = groupPositionAssignments(moved, groupId).map((a) => ({
        ...baseTaskCatalogOverride(a.taskId, builtIns, data.overrides),
        position: a.position,
      }));
      const result = await saveDefs(nextOverrides);
      if (!result.ok) {
        announceReorder(`Could not reorder ${label}: ${result.error ?? "save failed"}.`);
        return;
      }
      // AC5 item 20: the pure module supplies index/total only - the label
      // and group label come from here, which already holds both.
      const pos = positionWithinGroup(moved, movedTaskId);
      const groupLabel = groups.find((g) => g.id === groupId)?.label ?? "";
      if (pos) announceReorder(`${label} moved to position ${pos.index} of ${pos.total} in ${groupLabel}.`);
    },
    [resolvedCatalog, builtIns, data.overrides, saveDefs, groups, announceReorder]
  );

  const handleReorderStep = (taskId: string, direction: "left" | "right") =>
    void applyReorder(stepWithinGroup(reorderColumns, taskId, direction), taskId);

  const handleReorderDrop = (draggedTaskId: string, targetTaskId: string) => {
    if (!isValidDropTarget(reorderColumns, draggedTaskId, targetTaskId)) return;
    void applyReorder(moveWithinGroup(reorderColumns, draggedTaskId, targetTaskId), draggedTaskId);
  };

  const handleMoveColumn = (taskId: string, kind: "left" | "right" | "start" | "end") => {
    const moved =
      kind === "left" || kind === "right"
        ? stepWithinGroup(reorderColumns, taskId, kind)
        : moveToGroupEdge(reorderColumns, taskId, kind);
    void applyReorder(moved, taskId);
  };

  // -----------------------------------------------------------------------
  // Manage Tasks dialog (AC9)
  const [manageOpen, setManageOpen] = useState(false);
  const handleSaveOverride = useCallback(
    async (override: TaskCatalogOverride) => {
      const result = await saveDef(override);
      return { ok: result.ok, error: result.error };
    },
    [saveDef]
  );
  // AC2 item 8: the dialog's own move buttons share this bulk path too.
  const handleSaveOverrides = useCallback(
    async (overrides: TaskCatalogOverride[]) => {
      const result = await saveDefs(overrides);
      return { ok: result.ok, error: result.error };
    },
    [saveDefs]
  );

  // -----------------------------------------------------------------------
  // Attachments dialog (docs/task-cell-attachments-acceptance-criteria.md
  // AC5) - exactly ONE TaskAttachmentsDialog is rendered below, driven by
  // this single {courseId, taskId} | null state (item 23). `gridRef` reaches
  // into TasksGrid's OWN roving-tabindex ref registry (item 25) rather than
  // a second registry built just for this - see TasksGrid.tsx's
  // TasksGridHandle for the mechanism.
  const [attachmentTarget, setAttachmentTarget] = useState<{ courseId: string; taskId: string } | null>(null);
  const gridRef = useRef<TasksGridHandle>(null);
  // Accessibility review fix 6: the cell to restore focus to once the
  // dialog's exit transition has actually finished - captured here (rather
  // than read back out of `attachmentTarget`, which handleCloseAttachments
  // clears immediately) because handleAttachmentsExited fires on a LATER
  // render, after `attachmentTarget` is already null.
  const pendingAttachmentFocusRef = useRef<{ courseId: string; taskId: string } | null>(null);
  // Regression fix: `attachmentTarget` nulls on close (handleCloseAttachments,
  // below) while the dialog is still visible for its own fade-out transition,
  // so deriving the title's course/task labels from `attachmentTarget` alone
  // collapses them to "" for the duration of that transition (the heading
  // reads "Attachments - , "). This mirrors `attachmentTarget` but is set on
  // open and cleared only in handleAttachmentsExited once the transition (and
  // the dialog) is actually gone - the SAME moment pendingAttachmentFocusRef
  // above already clears on, not a second mechanism. State, not a ref: a ref
  // read during render is a lint error (react-hooks/refs) and would not
  // reliably re-render this component's own JSX when it changed.
  const [attachmentDisplayTarget, setAttachmentDisplayTarget] = useState<{ courseId: string; taskId: string } | null>(
    null
  );

  const handleOpenAttachments = useCallback((courseId: string, taskId: string) => {
    setAttachmentTarget({ courseId, taskId });
    setAttachmentDisplayTarget({ courseId, taskId });
  }, []);

  // Item 25: closing the dialog only ever clears the state that controls
  // whether it is mounted - it must NOT itself move DOM focus. React
  // batches this alongside the Dialog's `open` prop going false, so the
  // dialog is still mounted and its FocusTrap still active for several more
  // renders (the whole exit transition); calling gridRef.focusCell here
  // would race MUI's own internal focus handling (see item 6's fix in
  // TaskAttachmentsDialog.tsx). The actual restoration is deferred to
  // handleAttachmentsExited below, which the dialog only calls once its
  // trap is fully gone. `attachmentDisplayTarget` is deliberately NOT cleared
  // here either, for the identical reason.
  const handleCloseAttachments = useCallback(() => {
    pendingAttachmentFocusRef.current = attachmentTarget;
    setAttachmentTarget(null);
  }, [attachmentTarget]);

  // Accessibility review fix 6: the ONE place DOM focus actually moves back
  // to the grid - wired to TaskAttachmentsDialog's onExited (MUI's Fade
  // onExited, which only fires after the exit transition, and therefore
  // the focus trap, is completely done). Also the one place
  // `attachmentDisplayTarget` clears, for the same reason.
  const handleAttachmentsExited = useCallback(() => {
    const target = pendingAttachmentFocusRef.current;
    pendingAttachmentFocusRef.current = null;
    setAttachmentDisplayTarget(null);
    if (target) gridRef.current?.focusCell(target.courseId, target.taskId);
  }, []);

  const attachmentCourseName = attachmentDisplayTarget
    ? (allRows.find((r) => r.course.id === attachmentDisplayTarget.courseId)?.course.name ?? "")
    : "";
  const attachmentTaskLabel = attachmentDisplayTarget
    ? (resolvedCatalog.find((t) => t.id === attachmentDisplayTarget.taskId)?.label ?? "")
    : "";

  // -----------------------------------------------------------------------
  // Sub-view tabs (AC1 item 3, AC12 item 65): role="tablist"/"tab" with
  // aria-selected and arrow-key movement between the two, matching
  // WorkflowsPanel's existing inner-tab treatment (styles.lessonInnerTab).
  // S12: aria-controls on each tab plus a single role="tabpanel" wrapping
  // the content below (aria-labelledby the currently-active tab's id) - only
  // one sub-view is ever rendered at a time, so both tabs point at the same
  // panel id rather than each getting its own.
  const tabRefs = useRef<Record<TasksView, HTMLButtonElement | null>>({ term: null, recurring: null });
  const idBase = useId();
  const termTabId = `${idBase}-term-tab`;
  const recurringTabId = `${idBase}-recurring-tab`;
  const panelId = `${idBase}-panel`;
  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    let next: TasksView | null = null;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") next = view === "term" ? "recurring" : "term";
    else if (e.key === "Home") next = "term";
    else if (e.key === "End") next = "recurring";
    else return;
    e.preventDefault();
    if (next !== view) onViewChange(next);
    tabRefs.current[next]?.focus();
  };

  const subnav = (
    <div className={pageStyles.manualSubnav}>
      <div className={pageStyles.lessonInnerTabs} role="tablist" aria-label="Tasks view">
        <button
          type="button"
          role="tab"
          id={termTabId}
          aria-controls={panelId}
          ref={(el) => {
            tabRefs.current.term = el;
          }}
          aria-selected={view === "term"}
          tabIndex={view === "term" ? 0 : -1}
          className={`${pageStyles.lessonInnerTab}${view === "term" ? ` ${pageStyles.lessonInnerTabActive}` : ""}`}
          onClick={() => onViewChange("term")}
          onKeyDown={handleTabKeyDown}
        >
          Term Setup
        </button>
        <button
          type="button"
          role="tab"
          id={recurringTabId}
          aria-controls={panelId}
          ref={(el) => {
            tabRefs.current.recurring = el;
          }}
          aria-selected={view === "recurring"}
          tabIndex={view === "recurring" ? 0 : -1}
          className={`${pageStyles.lessonInnerTab}${view === "recurring" ? ` ${pageStyles.lessonInnerTabActive}` : ""}`}
          onClick={() => onViewChange("recurring")}
          onKeyDown={handleTabKeyDown}
        >
          Daily / Weekly
        </button>
      </div>
    </div>
  );

  return (
    <TabShell
      subnav={subnav}
      eyebrow="Tasks"
      title={view === "term" ? "Term setup" : "Daily / weekly"}
      subtitle="Track once-per-term setup work and day-to-day upkeep across every course, in one matrix."
    >
      {/* S12: the tablist above had no tabpanel at all - aria-controls
          pointed nowhere, and this content was never marked as the thing
          the selected tab actually controls. Only one sub-view is ever
          rendered at a time, so a single panel (labelled by whichever tab
          is currently active) is correct here, not one per tab. */}
      <div role="tabpanel" id={panelId} aria-labelledby={view === "term" ? termTabId : recurringTabId} tabIndex={-1}>
        <div role="status" aria-live="polite" className={styles.srOnly}>
          {announcement}
        </div>
        {/* AC5 item 18: a SEPARATE assertive region for reorder activity -
            reorder is rapid and a stale queued "polite" announcement would
            mislead, which is exactly why this is not folded into the region
            above. No `role` here (deliberately, a correction: `role="status"`
            carries an IMPLICIT `aria-live="polite"`, so pairing it with an
            explicit `aria-live="assertive"` was contradictory markup) - the
            bare `aria-live="assertive"` alone is what actually governs how
            this region is announced. */}
        <div aria-live="assertive" className={styles.srOnly}>
          {reorderAnnouncement}
        </div>

        {/* BLOCKER 3/4: errorBannerText tells a hard failure ("state" ===
            "error", possibly zero cached courses) apart from a SILENT
            background-refresh failure (state stays "idle", stale data still
            shown - SHOULD 8) - the two need different wording, and BOTH now
            get `role="alert"`, which this banner never carried before (an
            instructor whose load failed was told nothing at all by a screen
            reader; the tab simply looked like it had no courses). */}
        {errorText && (
          <div className={styles.errorBanner} role="alert">
            <span>{errorText}</span>
            <Button size="small" onClick={() => void reload()}>
              Retry
            </Button>
          </div>
        )}

        {/* AC8: the app's existing spinner idiom (.loadingState + .spinner +
            .loadingTitle, page.module.css) rather than a bare MUI spinner -
            the same pattern used elsewhere in the app for a surface's
            loading state, so every tab reads identically while data loads. */}
        {data.state === "loading" && (
          <div className={pageStyles.loadingState} role="status" aria-live="polite">
            <span className={pageStyles.spinner} aria-hidden="true" />
            <div>
              <p className={pageStyles.loadingTitle}>Loading tasks…</p>
            </div>
          </div>
        )}

        {/* BLOCKER 3: gated on state === "idle" (shouldShowEmptyState), not
            merely "not loading" - a failed load used to fall through to this
            exact sentence, telling an instructor whose network blipped that
            their account has no courses at all. */}
        {shouldShowEmptyState(data.state, data.courses.length) && (
          <p className={styles.emptyState}>
            No courses yet. Add one on the Courses tab, and it will show up here automatically.
          </p>
        )}

        {shouldShowMainContent(data.state, data.courses.length) && (
          <>
            <TasksToolbar
              search={current.search}
              onSearchChange={(v) => updateUi(() => ({ search: v }))}
              institution={current.institution}
              onInstitutionChange={handleInstitutionChange}
              institutionOptions={institutionOptions}
              term={current.term}
              onTermChange={handleTermChange}
              termOptions={termOptions}
              outstandingOnly={effectiveOutstandingOnly}
              onOutstandingOnlyChange={handleOutstandingOnlyChange}
              outstandingOnlyDisabled={outstandingOnlyDisabled}
              highlightOutstanding={highlightOutstanding}
              onHighlightOutstandingChange={setHighlightOutstanding}
              density={density}
              onDensityChange={setDensity}
              sort={resolvedSort}
              onSortChange={handleSortChange}
              tasks={resolvedCatalog}
              groups={groups}
              visibleColumnIds={visibleColumnIds}
              onToggleColumn={toggleColumn}
              onShowAllColumns={showAllColumns}
              onDownloadCsv={handleDownloadCsv}
              onManageTasks={() => setManageOpen(true)}
              summaryText={summaryText}
              // BLOCKER 2: the SAME announcement string the srOnly live
              // region above already carries, now ALSO shown visibly next to
              // the summary figure - a bulk outcome ("Set X to Y for 3 of 26
              // courses.") used to reach a sighted instructor nowhere but
              // that 1px-clipped region, so a partial failure and a full
              // success looked identical on screen.
              statusText={announcement}
              // SHOULD 8: a manual escape hatch from the silent-refresh path
              // (mount-time reload when the cache is warm, and the
              // attachments dialog's onChanged) - previously the ONLY way to
              // force a fresh load was the Retry button, which only ever
              // appeared after a NON-silent failure.
              refreshing={data.refreshing}
              onRefresh={() => void reload()}
              periodCaption={periodCaption}
              columnFilters={columnFilters}
              onClearColumnFilter={handleClearColumnFilter}
              onClearAllFilters={handleClearAllFilters}
            />

            <TasksGrid
              ref={gridRef}
              regionLabel={view === "term" ? "Term setup tasks by course" : "Daily and weekly tasks by course"}
              groups={groups}
              tasks={visibleTasks}
              rows={sortedRows}
              collapsedGroups={collapsedGroupsSet}
              onToggleGroupCollapse={toggleGroupCollapse}
              nowMs={nowMs}
              density={density}
              highlightOutstanding={highlightOutstanding}
              cellErrors={cellErrors}
              instructions={data.instructions}
              onSaveInstruction={(institution, taskId, body) => void handleSaveInstruction(institution, taskId, body)}
              attachments={data.attachments}
              onOpenAttachments={handleOpenAttachments}
              onCellChange={(courseId, taskId, nextCell) => void handleCellChange(courseId, taskId, nextCell)}
              onColumnBulkSet={handleColumnBulkSet}
              onRowBulkSet={handleRowBulkSet}
              onFillDown={handleFillDown}
              sort={resolvedSort}
              onSortChange={handleSortChange}
              columnFilters={columnFilters}
              onColumnFilterChange={handleColumnFilterChange}
              institution={current.institution}
              onInstitutionChange={handleInstitutionChange}
              institutionOptions={institutionOptions}
              term={current.term}
              onTermChange={handleTermChange}
              termOptions={termOptions}
              outstandingOnly={effectiveOutstandingOnly}
              onOutstandingOnlyChange={handleOutstandingOnlyChange}
              outstandingOnlyDisabled={outstandingOnlyDisabled}
              reorderColumns={reorderColumns}
              onReorderStep={handleReorderStep}
              onReorderDrop={handleReorderDrop}
              onMoveColumn={handleMoveColumn}
            />
          </>
        )}
      </div>

      <ManageTasksDialog
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        view={view}
        viewLabel={view === "term" ? "Term Setup" : "Daily / Weekly"}
        groups={groups}
        builtIns={builtIns}
        overrides={data.overrides}
        onSaveOverride={handleSaveOverride}
        onSaveOverrides={handleSaveOverrides}
      />

      {/* AC5 item 23: exactly ONE TaskAttachmentsDialog, controlled the same
          way ManageTasksDialog above is - always mounted, driven by a
          boolean `open` - rather than mounted/unmounted per target, so its
          own close transition is never cut short. */}
      <TaskAttachmentsDialog
        open={attachmentTarget !== null}
        onClose={handleCloseAttachments}
        onExited={handleAttachmentsExited}
        courseId={attachmentTarget?.courseId ?? ""}
        courseName={attachmentCourseName}
        taskId={attachmentTarget?.taskId ?? ""}
        taskLabel={attachmentTaskLabel}
        attachments={attachmentTarget ? taskAttachmentsAt(data.attachments, attachmentTarget.courseId, attachmentTarget.taskId) : []}
        onChanged={() => void reload({ silent: true })}
      />

      {/* SHOULD 5: MUI's Dialog auto-wires aria-labelledby from DialogTitle
          but does NOT auto-wire aria-describedby (Dialog.js only forwards it
          when passed explicitly) - this repo already fixed the identical gap
          at CoursesTable.tsx:450-455/747 (copied verbatim here), so without
          `bulkConfirmDescId` a screen-reader user heard "Confirm bulk
          update" plus two buttons and NOTHING of the actual consequence
          (BLOCKER 1's whole point). */}
      {pendingBulk && (
        <Dialog open onClose={cancelBulk} aria-describedby={bulkConfirmDescId}>
          <DialogTitle>Confirm bulk update</DialogTitle>
          <DialogContent>
            <p id={bulkConfirmDescId}>{pendingBulk.message}</p>
          </DialogContent>
          <DialogActions>
            <Button onClick={cancelBulk}>Cancel</Button>
            <Button variant="contained" onClick={confirmBulk}>
              Continue
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </TabShell>
  );
}
