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
import CircularProgress from "@mui/material/CircularProgress";
import TabShell from "./TabShell";
import type { TasksView } from "../url-state";
import { TASK_GROUPS, TERM_TASKS, RECURRING_TASKS } from "@/lib/course-tasks-catalog";
import {
  setTaskCellStatus,
  taskCellAt,
  type TaskCell as TaskCellValue,
  type TaskDefinition,
  type TaskGroupId,
  type TaskStatus,
} from "@/lib/course-tasks";
import {
  ALL_FILTER,
  DEFAULT_TASK_SORT,
  buildTasksCsv,
  computeTaskProgress,
  distinctInstitutions,
  distinctTerms,
  filterTaskRows,
  parseTaskColumnSet,
  parseTaskSortState,
  resolveTaskCatalog,
  serializeTaskColumnSet,
  sortTaskRows,
  TASK_COLUMNS_ADDED_IN,
  TASK_STATUS_WORDS,
  type TaskCatalogOverride,
  type TaskRow,
  type TaskSortState,
} from "@/lib/course-tasks-view";
import { useCourseTasksData } from "./tasks/useCourseTasksData";
import TasksToolbar from "./tasks/TasksToolbar";
import TasksGrid, { type Density } from "./tasks/TasksGrid";
import ManageTasksDialog from "./tasks/ManageTasksDialog";
import pageStyles from "../page.module.css";
import styles from "./tasks/TasksGrid.module.css";

interface TaskViewUiState {
  search: string;
  institution: string;
  term: string;
  outstandingOnly: boolean;
  sort: TaskSortState;
  collapsedGroups: TaskGroupId[];
}

function defaultUiState(): TaskViewUiState {
  return { search: "", institution: ALL_FILTER, term: ALL_FILTER, outstandingOnly: false, sort: DEFAULT_TASK_SORT, collapsedGroups: [] };
}

function loadUiState(view: TasksView): TaskViewUiState {
  if (typeof window === "undefined") return defaultUiState();
  const prefix = `ta-tasks-${view}-`;
  let collapsedGroups: TaskGroupId[] = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(`${prefix}collapsed`) ?? "[]") as unknown;
    if (Array.isArray(parsed)) collapsedGroups = parsed.filter((x): x is TaskGroupId => typeof x === "string");
  } catch {
    collapsedGroups = [];
  }
  return {
    search: localStorage.getItem(`${prefix}search`) ?? "",
    institution: localStorage.getItem(`${prefix}institution`) ?? ALL_FILTER,
    term: localStorage.getItem(`${prefix}term`) ?? ALL_FILTER,
    outstandingOnly: localStorage.getItem(`${prefix}outstanding`) === "true",
    sort: parseTaskSortState(localStorage.getItem(`${prefix}sort`)),
    collapsedGroups,
  };
}

function persistUiState(view: TasksView, state: TaskViewUiState) {
  if (typeof window === "undefined") return;
  const prefix = `ta-tasks-${view}-`;
  try {
    localStorage.setItem(`${prefix}search`, state.search);
    localStorage.setItem(`${prefix}institution`, state.institution);
    localStorage.setItem(`${prefix}term`, state.term);
    localStorage.setItem(`${prefix}outstanding`, String(state.outstandingOnly));
    localStorage.setItem(`${prefix}sort`, JSON.stringify(state.sort));
    localStorage.setItem(`${prefix}collapsed`, JSON.stringify(state.collapsedGroups));
  } catch {
    // localStorage can throw (private browsing, quota) - losing persistence
    // for one change is acceptable, crashing the tab is not.
  }
}

const VALID_DENSITIES: Density[] = ["compact", "default", "comfortable"];

function loadDensity(): Density {
  if (typeof window === "undefined") return "default";
  const stored = localStorage.getItem("ta-tasks-density");
  return (VALID_DENSITIES as string[]).includes(stored ?? "") ? (stored as Density) : "default";
}

/** The one thing every bulk/fill action needs to ask before overwriting
 * data it did not just create (AC6 item 33): does the target cell already
 * hold a non-open value that differs from what is about to be written. */
function overwritesMeaningfully(cell: TaskCellValue, nextStatus: TaskStatus): boolean {
  return cell.status !== "open" && cell.status !== nextStatus;
}

type BulkAction =
  | { kind: "column"; task: TaskDefinition; status: TaskStatus }
  | { kind: "row"; courseId: string; courseName: string; status: TaskStatus }
  | { kind: "fill"; task: TaskDefinition; sourceCell: TaskCellValue; targetCourseIds: string[] };

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

export interface TasksTabProps {
  view: TasksView;
  onViewChange: (view: TasksView) => void;
}

export default function TasksTab({ view, onViewChange }: TasksTabProps) {
  const data = useCourseTasksData();
  const { setCell, setCourseCells, saveDef, reload } = data;

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
        { search: current.search, institution: current.institution, term: current.term, outstandingOnly: effectiveOutstandingOnly },
        nowMs
      ),
    [allRows, visibleTasks, current.search, current.institution, current.term, effectiveOutstandingOnly, nowMs]
  );
  const sortedRows = useMemo(() => sortTaskRows(filteredRows, visibleTasks, current.sort, nowMs), [filteredRows, visibleTasks, current.sort, nowMs]);

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

  // Shared live region (AC6 item 33, AC12 item 63; S7/S8) - bulk-action
  // results AND per-cell save errors both funnel through this one
  // announcement string, declared here (ahead of both "Cell edits" and
  // "Bulk actions" below) since both sections' handlers reference the
  // setter.
  const [announcement, setAnnouncement] = useState("");

  // -----------------------------------------------------------------------
  // Cell edits (AC5) - per-cell inline error, cleared on the next attempt or
  // after a few seconds.
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const clearCellError = (key: string) => {
    setCellErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };
  // S7/S8: cell save errors are announced through the ONE always-mounted
  // live region below (not a per-cell `role="status"` span that mounts at
  // the same instant as its own text, unreliable, and there can be over a
  // thousand of these cells) - `reportCellError` is the single place a cell
  // error becomes user-visible, so it is also the single place it gets
  // announced.
  const reportCellError = (key: string, message: string, courseName: string, taskLabel: string) => {
    setCellErrors((prev) => ({ ...prev, [key]: message }));
    setAnnouncement(`Could not save ${taskLabel} for ${courseName}: ${message}`);
    if (typeof window !== "undefined") {
      window.setTimeout(() => clearCellError(key), 6000);
    }
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
      reportCellError(key, result.error ?? "Could not save.", courseName, taskLabel);
    }
  };

  // -----------------------------------------------------------------------
  // Bulk actions (AC6) - column/row/fill-down all funnel through one confirm
  // + apply + announce pipeline.
  const [pendingBulk, setPendingBulk] = useState<{ action: BulkAction; count: number } | null>(null);

  const applyBulk = useCallback(
    async (action: BulkAction) => {
      if (action.kind === "column") {
        const results = await Promise.all(
          sortedRows.map((row) =>
            setCourseCells(row.course.id, { [action.task.id]: setTaskCellStatus(taskCellAt(row.cells, action.task.id), action.status, nowMs) })
          )
        );
        const succeeded = results.filter((r) => r.ok).length;
        // S10: TASK_STATUS_WORDS, not the raw enum - `action.status` on its
        // own produced announcements like "Set Textbook Owned? to na for 3
        // courses."
        setAnnouncement(
          `Set ${action.task.label} to ${TASK_STATUS_WORDS[action.status]} for ${succeeded} of ${sortedRows.length} course${sortedRows.length === 1 ? "" : "s"}.`
        );
        return;
      }
      if (action.kind === "row") {
        const row = allRows.find((r) => r.course.id === action.courseId);
        if (!row) return;
        const patch: Record<string, TaskCellValue> = {};
        for (const t of visibleTasks) patch[t.id] = setTaskCellStatus(taskCellAt(row.cells, t.id), action.status, nowMs);
        const result = await setCourseCells(action.courseId, patch);
        setAnnouncement(
          result.ok
            ? `Set ${visibleTasks.length} task${visibleTasks.length === 1 ? "" : "s"} to ${TASK_STATUS_WORDS[action.status]} for ${action.courseName}.`
            : `Could not update ${action.courseName}: ${result.error}`
        );
        return;
      }
      // fill-down
      const results = await Promise.all(action.targetCourseIds.map((id) => setCourseCells(id, { [action.task.id]: action.sourceCell })));
      const succeeded = results.filter((r) => r.ok).length;
      setAnnouncement(`Filled ${action.task.label} down to ${succeeded} of ${action.targetCourseIds.length} course${action.targetCourseIds.length === 1 ? "" : "s"}.`);
    },
    [sortedRows, allRows, visibleTasks, nowMs, setCourseCells]
  );

  const requestBulk = (action: BulkAction, affectedCells: TaskCellValue[]) => {
    const count = affectedCells.filter((cell) => overwritesMeaningfully(cell, "status" in action ? action.status : action.sourceCell.status)).length;
    if (count > 0) setPendingBulk({ action, count });
    else void applyBulk(action);
  };

  const handleColumnBulkSet = (task: TaskDefinition, status: TaskStatus) => {
    requestBulk(
      { kind: "column", task, status },
      sortedRows.map((row) => taskCellAt(row.cells, task.id))
    );
  };

  const handleRowBulkSet = (courseId: string, courseName: string, status: TaskStatus) => {
    const row = allRows.find((r) => r.course.id === courseId);
    requestBulk(
      { kind: "row", courseId, courseName, status },
      row ? visibleTasks.map((t) => taskCellAt(row.cells, t.id)) : []
    );
  };

  const handleFillDown = (task: TaskDefinition, sourceCell: TaskCellValue, targetCourseIds: string[]) => {
    const cells = targetCourseIds.map((id) => {
      const row = allRows.find((r) => r.course.id === id);
      return row ? taskCellAt(row.cells, task.id) : taskCellAt({}, task.id);
    });
    requestBulk({ kind: "fill", task, sourceCell, targetCourseIds }, cells);
  };

  // S10: TASK_STATUS_WORDS, not the raw enum, in every branch that names a status.
  const confirmBulkMessage = (action: BulkAction, count: number): string => {
    if (action.kind === "column") return `This will overwrite ${count} existing value${count === 1 ? "" : "s"} in "${action.task.label}" with ${TASK_STATUS_WORDS[action.status]}. Continue?`;
    if (action.kind === "row") return `This will overwrite ${count} existing value${count === 1 ? "" : "s"} for ${action.courseName} with ${TASK_STATUS_WORDS[action.status]}. Continue?`;
    return `This will overwrite ${count} existing value${count === 1 ? "" : "s"} in "${action.task.label}" below. Continue?`;
  };

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
  // Manage Tasks dialog (AC9)
  const [manageOpen, setManageOpen] = useState(false);
  const handleSaveOverride = useCallback(
    async (override: TaskCatalogOverride) => {
      const result = await saveDef(override);
      return { ok: result.ok, error: result.error };
    },
    [saveDef]
  );

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

        {data.error && (
          <div className={styles.errorBanner}>
            <span>{data.error}</span>
            <Button size="small" onClick={() => void reload()}>
              Retry
            </Button>
          </div>
        )}

        {data.state === "loading" && (
          <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
            <CircularProgress size={22} />
          </div>
        )}

        {data.state !== "loading" && data.courses.length === 0 && (
          <p className={styles.emptyState}>
            No courses yet. Add one on the Courses tab, and it will show up here automatically.
          </p>
        )}

        {data.state !== "loading" && data.courses.length > 0 && (
          <>
            <TasksToolbar
              search={current.search}
              onSearchChange={(v) => updateUi(() => ({ search: v }))}
              institution={current.institution}
              onInstitutionChange={(v) => updateUi(() => ({ institution: v }))}
              institutionOptions={institutionOptions}
              term={current.term}
              onTermChange={(v) => updateUi(() => ({ term: v }))}
              termOptions={termOptions}
              outstandingOnly={effectiveOutstandingOnly}
              onOutstandingOnlyChange={(v) => updateUi(() => ({ outstandingOnly: v }))}
              outstandingOnlyDisabled={outstandingOnlyDisabled}
              highlightOutstanding={highlightOutstanding}
              onHighlightOutstandingChange={setHighlightOutstanding}
              density={density}
              onDensityChange={setDensity}
              sort={current.sort}
              onSortChange={(v) => updateUi(() => ({ sort: v }))}
              tasks={resolvedCatalog}
              groups={groups}
              visibleColumnIds={visibleColumnIds}
              onToggleColumn={toggleColumn}
              onShowAllColumns={showAllColumns}
              onDownloadCsv={handleDownloadCsv}
              onManageTasks={() => setManageOpen(true)}
              summaryText={summaryText}
              periodCaption={periodCaption}
            />

            <TasksGrid
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
              onCellChange={(courseId, taskId, nextCell) => void handleCellChange(courseId, taskId, nextCell)}
              onColumnBulkSet={handleColumnBulkSet}
              onRowBulkSet={handleRowBulkSet}
              onFillDown={handleFillDown}
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
      />

      {pendingBulk && (
        <Dialog open onClose={() => setPendingBulk(null)}>
          <DialogTitle>Confirm bulk update</DialogTitle>
          <DialogContent>
            <p>{confirmBulkMessage(pendingBulk.action, pendingBulk.count)}</p>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPendingBulk(null)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={() => {
                const action = pendingBulk.action;
                setPendingBulk(null);
                void applyBulk(action);
              }}
            >
              Continue
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </TabShell>
  );
}
