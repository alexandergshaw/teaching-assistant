"use client";

// The Tasks tab's matrix - a hand-built `<table role="grid">` (AC15 item 83:
// deliberately NOT MUI DataGrid - column pinning and range selection are
// paid-tier features there, and this app already builds sticky tables by
// hand, see CoursesTable.tsx). Shared by BOTH sub-views (Term Setup and
// Daily/Weekly - AC1 item 7): the caller resolves the catalog, the group
// list, the rows, and passes them in, so this file never knows which
// sub-view it is rendering.
//
// Owns: the two sticky header rows (group band + task headers), the sticky
// footer of per-task outstanding counts, the frozen identity/progress
// columns, the APG roving-tabindex keyboard model (AC15 item 95/96,
// amendment 125's F2/Escape) - including the two header rows, which
// participate in the SAME roving-tabindex scheme as the body at virtual row
// indices -1 (per-task headers and collapsed-group rollups, one per real
// column) and -2 (an expanded group's own collapse toggle, registered at the
// first column of its span) - Ctrl+D fill-down, the scroll region's
// tabindex/role/name and scroll shadows (item 87), and the hover/focus
// crosshair (item 113). Per-cell editing (status cycle, note popover) lives
// in TaskCell.tsx; per-row layout lives in TaskGridRow.tsx; this file is the
// engine that ties them together into one grid.
import type React from "react";
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  taskCellAt,
  type TaskCell as TaskCellValue,
  type TaskDefinition,
  type TaskGroupId,
  type TaskStatus,
} from "@/lib/course-tasks";
import {
  ALL_FILTER,
  appendSentence,
  computeTaskProgress,
  countColumnOutstanding,
  describeTaskColumnFilters,
  distinctInstitutions,
  hasActiveColumnFilter,
  terminated,
  type TaskColumnFilters,
  type TaskRow,
  type TaskSortField,
  type TaskSortState,
} from "@/lib/course-tasks-view";
import TaskGridRow, { type GridColumn } from "./TaskGridRow";
import { buildGridColumns, buildColumnGroupIds, buildColIndexByTaskId, buildColIndexByGroupId } from "./gridColumnModel";
import { SortDirectionGlyph, FilterActiveGlyph } from "./TaskCell";
import TaskColumnMenu, { type ColumnMenuTarget } from "./TaskColumnMenu";
import { groupToggleFocusSlot } from "./gridFocus";
import { nextGridFocus } from "./gridNavigation";
import { courseHeaderAccessibleName, progressHeaderAccessibleName } from "./gridHeaderAccessibleName";
import { useGridMetrics } from "./useGridMetrics";
import { useScrollShadows } from "./useScrollShadows";
import { focusSlotForTask, shiftArrowDirection, type ReorderableColumn } from "./columnOrder";
import { DragHandle, dragHeaderClassName, useColumnDrag } from "./useColumnDrag";
import type { TaskInstructionMap } from "@/lib/task-institution-instructions";
import styles from "./TasksGrid.module.css";
import dragStyles from "./columnDrag.module.css";

/** Sort fields the frozen Course header's aria-sort/indicator speak for
 * (AC-D item 221's "one header cell" rule): course name and the
 * institution/term it displays underneath the name (the AC document's
 * "Scope decisions" section) all live under the ONE Course header, not a
 * separate header of their own. */
const COURSE_SORT_FIELDS: ReadonlySet<TaskSortField> = new Set(["name", "institution", "term"]);

export type Density = "compact" | "default" | "comfortable";

const DENSITY_ROW_PX: Record<Density, number> = { compact: 32, default: 36, comfortable: 44 };

const NAV_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];

export interface TasksGridProps {
  /** Accessible name for the horizontal-scroll region (AC15 item 88 - the
   * visible title lives OUTSIDE the table, since `<caption>` does not
   * honour `position: sticky` and scrolls away). */
  regionLabel: string;
  groups: { id: TaskGroupId; label: string }[];
  /** The already-resolved, already-column-filtered task list, group-
   * contiguous (resolveTaskCatalog's own guarantee). */
  tasks: TaskDefinition[];
  rows: TaskRow[];
  collapsedGroups: ReadonlySet<TaskGroupId>;
  onToggleGroupCollapse: (id: TaskGroupId) => void;
  nowMs: number;
  density: Density;
  highlightOutstanding: boolean;
  /** Keyed `${courseId}:${taskId}`. */
  cellErrors: Record<string, string>;
  /**
   * Per-(institution, task) instruction text (docs/task-institution-
   * instructions-acceptance-criteria.md AC3/AC4) - threaded straight through
   * to TaskGridRow, unchanged. This file makes no resolution decision of its
   * own: TaskGridRow is the first place in the render tree that holds both
   * a row's course.institution and each column's task id, so that is where
   * resolveTaskInstruction is actually called (AC3 item 11 - the ONLY place
   * a lookup happens).
   */
  instructions: TaskInstructionMap;
  /**
   * Saves (or, given a blank body, deletes) one institution's instruction
   * for one task (docs/task-institution-instructions-acceptance-criteria.md
   * AC5) - threaded straight through to TaskGridRow (the cell editor) AND
   * TaskColumnMenu (the column menu), the SAME mutator either surface
   * calls. This file makes no save decision of its own.
   */
  onSaveInstruction: (institution: string, taskId: string, body: string) => void;
  onCellChange: (courseId: string, taskId: string, nextCell: TaskCellValue) => void;
  onColumnBulkSet: (task: TaskDefinition, status: TaskStatus) => void;
  onRowBulkSet: (courseId: string, courseName: string, status: TaskStatus) => void;
  onFillDown: (task: TaskDefinition, sourceCell: TaskCellValue, targetCourseIds: string[]) => void;

  // AC-A/AC-D: sort/column-filter state, already RESOLVED by the caller
  // (resolveTaskSort/visible-columns-scoped) so the header's aria-sort and
  // indicators can never disagree with the row order sortTaskRows actually
  // produced (item 205).
  sort: TaskSortState;
  onSortChange: (sort: TaskSortState) => void;
  columnFilters: TaskColumnFilters;
  onColumnFilterChange: (taskId: string, statuses: TaskStatus[]) => void;

  // AC-D item 220: the Course/Progress header menus bind to the SAME state
  // as the toolbar's own institution/term selects and outstanding-only
  // checkbox - passed straight through from TasksTab, never a second copy.
  institution: string;
  onInstitutionChange: (v: string) => void;
  institutionOptions: string[];
  term: string;
  onTermChange: (v: string) => void;
  termOptions: string[];
  /** Effective value (item 220: bound to `effectiveOutstandingOnly`, never
   * the raw toggle - a zero-applicable-columns progress must not silently
   * empty the table through this entry point either). */
  outstandingOnly: boolean;
  onOutstandingOnlyChange: (v: boolean) => void;
  outstandingOnlyDisabled: boolean;

  // Column reorder (AC1-AC7): reorderColumns is C5's input from TasksTab,
  // never this file's visible-only `columns` above (AC8 item 39). TasksTab
  // owns the columnOrder.ts calls and the bulk persist.
  reorderColumns: ReorderableColumn[];
  onReorderStep: (taskId: string, direction: "left" | "right") => void;
  onReorderDrop: (draggedTaskId: string, targetTaskId: string) => void;
  onMoveColumn: (taskId: string, kind: "left" | "right" | "start" | "end") => void;
}

export default function TasksGrid({
  regionLabel,
  groups,
  tasks,
  rows,
  collapsedGroups,
  onToggleGroupCollapse,
  nowMs,
  density,
  highlightOutstanding,
  cellErrors,
  instructions,
  onSaveInstruction,
  onCellChange,
  onColumnBulkSet,
  onRowBulkSet,
  onFillDown,
  sort,
  onSortChange,
  columnFilters,
  onColumnFilterChange,
  institution,
  onInstitutionChange,
  institutionOptions,
  term,
  onTermChange,
  termOptions,
  outstandingOnly,
  onOutstandingOnlyChange,
  outstandingOnlyDisabled,
  reorderColumns,
  onReorderStep,
  onReorderDrop,
  onMoveColumn,
}: TasksGridProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const refsRef = useRef<Map<string, HTMLElement>>(new Map());
  const regionLabelId = useId();

  const registerRef = useCallback((row: number, col: number, el: HTMLElement | null) => {
    const key = `${row}:${col}`;
    if (el) refsRef.current.set(key, el);
    else refsRef.current.delete(key);
  }, []);

  // ---------------------------------------------------------------------
  // Column model (AC15 item 85, B1/WCAG 2.1.1/2.4.3, AC-A item 251) - the
  // pure builders live in gridColumnModel.ts (line-budget split; see its
  // header comment), memoized here since memoization is a rendering
  // concern, not a modeling one.
  const columns: GridColumn[] = useMemo(
    () => buildGridColumns(groups, tasks, collapsedGroups),
    [groups, tasks, collapsedGroups]
  );
  const columnGroupIds = useMemo(() => buildColumnGroupIds(columns), [columns]);
  const colIndexByTaskId = useMemo(() => buildColIndexByTaskId(columns), [columns]);
  const colIndexByGroupId = useMemo(() => buildColIndexByGroupId(columns), [columns]);

  // AC5 item 21: institutions present among the currently VISIBLE rows -
  // computed once here (the pure existing helper, never re-derived) and
  // handed to TaskColumnMenu, which decides from the resulting count
  // whether its Instructions section edits one institution directly or
  // lists several for the instructor to pick from.
  const visibleInstitutions = useMemo(() => distinctInstitutions(rows), [rows]);

  const totalCols = columns.length + 2; // + identity + progress
  const totalRows = rows.length;

  // ---------------------------------------------------------------------
  // Roving tabindex (AC15 item 96): exactly one (row, col) pair is tabbable
  // at a time. Row -1 holds the per-task header buttons and a collapsed
  // group's rollup button (one per real column, same indices the body
  // uses); row -2 holds an EXPANDED group's own collapse-toggle button,
  // which spans several columns and is registered only at the first one
  // (B1). Clamped whenever the data shrinks (a filter/sort change, or fewer
  // columns after hiding some) so focus never points past the end. Clamping
  // happens during RENDER (React's documented "adjusting state during
  // rendering" pattern - https://react.dev/learn/you-might-not-need-an-effect)
  // rather than in a useEffect that calls setState synchronously, which
  // this repo's lint config forbids; the `!==` guard keeps this from
  // looping, since setState is only actually called when the clamp changes
  // something. Only the UPPER bound is clamped - row -2/-1 are always valid
  // and never need clamping down to 0.
  const [focus, setFocusState] = useState({ row: 0, col: 0 });
  // B4/C2: with zero matching rows there is no body cell to fall back on,
  // so a body row (0 or greater) clamps down to row -1 (the header) rather
  // than row 0 - a column whose filter removed every row still renders its
  // header, and that header is where the user goes to undo the filter. Row
  // -1 and -2 are BOTH always valid here (see the comment above) and must
  // pass through UNCHANGED - `Math.min(focus.row, -1)` does exactly that:
  // it only ever pulls a non-negative row down to -1, it never touches -2.
  // A bare `totalRows === 0 ? -1 : ...` (this file's own previous version)
  // clamped -2 down to -1 as well, desyncing the tabbable element (still
  // the row -2 band button) from the newly-forced-to--1 focus state.
  const clampedFocusRow =
    totalRows === 0 ? Math.min(focus.row, -1) : Math.min(focus.row, Math.max(0, totalRows - 1));
  const clampedFocusCol = Math.min(focus.col, Math.max(0, totalCols - 1));
  if (clampedFocusRow !== focus.row || clampedFocusCol !== focus.col) {
    setFocusState({ row: clampedFocusRow, col: clampedFocusCol });
  }

  const [hover, setHover] = useState<{ row: number | null; col: number | null }>({ row: null, col: null });

  const pendingReorderFocusRef = useRef<string | null>(null); // AC4 item 17: task id a reorder just moved

  // Column drag (AC6/AC7): pointer mechanics live in useColumnDrag.ts. The
  // roving-tabindex model below stays here - entries 232/233/234 pin it.
  const handleReorderDrop = useCallback((draggedTaskId: string, targetTaskId: string) => {
    pendingReorderFocusRef.current = draggedTaskId;
    onReorderDrop(draggedTaskId, targetTaskId);
  }, [onReorderDrop]);
  const { drag, flashId, dragPointerDown, dragPointerMove, dragPointerUp } = useColumnDrag(columns, scrollRef, handleReorderDrop);
  const dragHintId = useId();
  // AC3: the column menu's move commands arm the same pending-focus ref.
  const handleMoveColumn = useCallback((taskId: string, kind: "left" | "right" | "start" | "end") => {
    pendingReorderFocusRef.current = taskId;
    onMoveColumn(taskId, kind);
  }, [onMoveColumn]);

  const rowHeightPx = DENSITY_ROW_PX[density];

  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------------
  // Sticky-pane clearance (B2, WCAG 2.2 SC 2.4.11) and the scroll-clearance
  // math that depends on it (AC16 amendment 135) - moved to
  // useGridMetrics.ts (line-budget split; see its header comment). Density
  // only ever acts as a re-measure trigger here, never a value read inside
  // the hook, so it is passed through as-is.
  const { metrics, tableStyle, ensureVisible } = useGridMetrics(scrollRef, density, columns.length, rows.length);

  // B3: the only thing focusCellAt still does for scrolling is flag that
  // the upcoming native "focus" event was caused by keyboard navigation
  // (read once, by the grid's own onFocus below, then cleared) - the actual
  // ensureVisible call happens from that ONE handler instead of here, so
  // every entry path (arrow keys via this function, Tab/Shift+Tab, a mouse
  // click) clears the sticky panes the same way, not just arrow-key moves.
  const keyboardScrollRef = useRef(false);

  const focusCellAt = useCallback((row: number, col: number) => {
    const el = refsRef.current.get(`${row}:${col}`);
    if (!el) return;
    keyboardScrollRef.current = true;
    el.focus();
    setFocusState({ row, col });
  }, []);

  // Group-toggle focus fix (AC-B items 255-259): collapsing an expanded
  // group from its own band button (row -2) makes that slot cease to exist,
  // so the grid goes untabbable until a click re-seeds focus.
  // `handleGroupToggle` is the ONE handler all three activation points (the
  // two below, plus TaskGridRow.tsx's body rollup cell) route through,
  // passing the row activated - never `focus.row`, which may lag it.
  const pendingFocusRef = useRef<{ row: number; col: number } | null>(null);

  const handleGroupToggle = useCallback(
    (groupId: TaskGroupId, activatedRow: number) => {
      const slot = groupToggleFocusSlot(columnGroupIds, groupId, activatedRow);
      if (slot) {
        // Item 259: only arm the pending DOM-focus target if the activating
        // control held DOM focus - `refsRef` still holds it at this (row,
        // col) key pre-toggle, i.e. `document.activeElement === e.currentTarget`
        // at its own call site. Guards a Safari mouse click (no auto-focus).
        const activatingEl = refsRef.current.get(`${activatedRow}:${slot.col}`);
        if (activatingEl && document.activeElement === activatingEl) pendingFocusRef.current = slot;
        setFocusState({ row: slot.row, col: slot.col });
      }
      onToggleGroupCollapse(groupId);
    },
    [columnGroupIds, onToggleGroupCollapse]
  );

  // Item 257: moves DOM focus to the replacement control post-mount.
  // Deliberately NO dependency array - keying this on `columns.length`, like
  // this file's other two effects, would silently break the fix: collapsing
  // a group whose only visible task is one column turns one column into one
  // rollup, `columns.length` is UNCHANGED, and focus never gets restored.
  useLayoutEffect(() => {
    const target = pendingFocusRef.current;
    pendingFocusRef.current = null; // item 258: cleared unconditionally, before any lookup
    if (!target) return;
    const el = refsRef.current.get(`${target.row}:${target.col}`);
    if (!el) return;
    keyboardScrollRef.current = true;
    el.focus();
  });

  // Column-reorder focus fix (AC4 item 17), rewritten: node REUSE is not
  // FOCUS RETENTION. For [A,B] -> [B,A], React's keyed reconciliation moves
  // whichever child had the LOWER old index (A) via `insertBefore`, which
  // blurs a focused descendant to `document.body` BEFORE re-inserting it -
  // a value never in the roving-tabindex registry, so scanning "what does
  // the DOM report as focused" (the old approach) found nothing.
  // ASYMMETRIC BY DIRECTION (only the step moving the focused node loses
  // it), hence easy to miss testing one direction. Fix: never ask the DOM -
  // every reorder route already knows WHICH task it just moved
  // (`pendingReorderFocusRef` above); `focusSlotForTask` (columnOrder.ts)
  // looks it up directly. No guard against the group-toggle effect above is
  // needed (unlike before) - this never searches the DOM, only acts when
  // armed, and a toggle never arms it.
  useLayoutEffect(() => {
    const taskId = pendingReorderFocusRef.current;
    pendingReorderFocusRef.current = null; // cleared unconditionally, before any lookup
    if (!taskId) return;
    const slot = focusSlotForTask(colIndexByTaskId, taskId);
    if (!slot) return;
    const el = refsRef.current.get(`${slot.row}:${slot.col}`);
    if (!el) return;
    keyboardScrollRef.current = true;
    el.focus();
    setFocusState(slot);
  }, [colIndexByTaskId]);

  /** B3: focus events bubble, so one handler on the grid element itself
   * (the `<table role="grid">`) sees every entry path - tabbing in,
   * Shift+Tab back in, a click, and the programmatic `el.focus()` calls
   * arrow-key navigation makes - and clears the sticky panes uniformly.
   * Previously this only ran from the arrow-key path, so the FIRST
   * keyboard entry into a scrolled grid (Tab, or a click) landed flush
   * under the sticky header with no clearance at all. */
  const handleGridFocus = useCallback(
    (e: React.FocusEvent<HTMLTableElement>) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const rowAttr = target.getAttribute("data-row");
      const colAttr = target.getAttribute("data-col");
      if (rowAttr === null || colAttr === null) return;
      const row = Number(rowAttr);
      const col = Number(colAttr);
      if (!Number.isFinite(row) || !Number.isFinite(col)) return;
      const isKeyboardNav = keyboardScrollRef.current;
      keyboardScrollRef.current = false;
      const behavior: ScrollBehavior = isKeyboardNav || reducedMotion ? "auto" : "smooth";
      ensureVisible(row, col, target, behavior);
    },
    [ensureVisible, reducedMotion]
  );

  // AC15 item 95: the actual arrow-key/Home/End/Page arithmetic lives in
  // gridNavigation.ts (nextGridFocus, pure and separately tested) - this
  // wrapper only supplies the live bounds (from the scroll container's own
  // rendered height, not a guessed constant) and commits the result.
  const handleNavigate = useCallback(
    (row: number, col: number, key: string, ctrlKey: boolean) => {
      const container = scrollRef.current;
      const visibleRows = container
        ? Math.max(1, Math.floor((container.clientHeight - metrics.headerH - metrics.footerH) / rowHeightPx))
        : 10;
      const next = nextGridFocus(row, col, key, ctrlKey, {
        maxRow: Math.max(0, totalRows - 1),
        maxCol: Math.max(0, totalCols - 1),
        visibleRows,
      });
      if (next) focusCellAt(next.row, next.col);
    },
    [totalRows, totalCols, metrics.headerH, metrics.footerH, rowHeightPx, focusCellAt]
  );

  const handleFillDown = useCallback(
    (row: number, col: number) => {
      const gridCol = columns[col - 2];
      if (!gridCol || gridCol.kind !== "task") return;
      const sourceRow = rows[row];
      if (!sourceRow) return;
      const sourceCell = taskCellAt(sourceRow.cells, gridCol.task.id);
      const targets = rows.slice(row + 1).map((r) => r.course.id);
      if (targets.length === 0) return;
      onFillDown(gridCol.task, sourceCell, targets);
    },
    [columns, rows, onFillDown]
  );

  // AC15 item 87: scroll-shadow state moved to useScrollShadows.ts
  // (line-budget split; see its header comment).
  const { scrollLeftEdge, scrollRightEdge, updateScrollShadows } = useScrollShadows(scrollRef, columns.length, rows.length);

  // ---------------------------------------------------------------------
  // Column header menu (AC-D items 218-220): EVERY header - Course,
  // Progress, and each task column - is a button that opens this same menu,
  // now part of the header row's own roving-tabindex slot (B1) rather than
  // a free-floating extra tab stop.
  const [columnMenu, setColumnMenu] = useState<{ target: ColumnMenuTarget; anchor: HTMLElement } | null>(null);
  const openColumnMenu = (target: ColumnMenuTarget, anchor: HTMLElement) => setColumnMenu({ target, anchor });
  const closeColumnMenu = () => setColumnMenu(null);

  // The ONE source of the chip/header/announcement text for an active
  // column filter (item 236) - computed once per render rather than
  // per-header, and looked up by task id below.
  const columnFilterDescriptors = useMemo(() => describeTaskColumnFilters(columnFilters, tasks), [columnFilters, tasks]);
  const columnFilterByTaskId = useMemo(
    () => new Map(columnFilterDescriptors.map((d) => [d.taskId, d])),
    [columnFilterDescriptors]
  );

  const groupOutstandingSum = (groupTasks: TaskDefinition[]) =>
    groupTasks.reduce((sum, t) => sum + countColumnOutstanding(rows, t.id, t.cadence, nowMs), 0);

  const handleHeaderKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    row: number,
    col: number,
    activate: () => void
  ) => {
    if (NAV_KEYS.includes(e.key)) {
      e.preventDefault();
      handleNavigate(row, col, e.key, e.ctrlKey || e.metaKey);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  };

  // AC-D item 221: aria-sort lives on exactly ONE header cell, moving as the
  // sort moves. The Course header speaks for all three fields it displays
  // (COURSE_SORT_FIELDS); Progress and each task column speak only for
  // themselves. `undefined` (never "none") on every other header, so the
  // attribute is simply ABSENT there, matching the W3C APG guidance cited in
  // the AC document's implementation plan.
  const ariaSortDirection = sort.direction === "asc" ? "ascending" : "descending";
  const courseAriaSort = COURSE_SORT_FIELDS.has(sort.field) ? ariaSortDirection : undefined;
  const progressAriaSort = sort.field === "progress" ? ariaSortDirection : undefined;
  const courseFilterActive = institution !== ALL_FILTER || term !== ALL_FILTER;

  // B3 (item 223): these two frozen headers render visible text ("Course" /
  // "Progress") plus `aria-hidden` glyphs, so with text content already
  // present `title` is at most a description, never the accessible name -
  // an `aria-label` has to state the active constraint in words the same
  // way the per-task headers already do below. The actual string-building
  // (item 223) lives in gridHeaderAccessibleName.ts (line-budget split; see
  // its header comment) - built from the SAME institution/term/
  // outstandingOnly state the corner menus and the toolbar share (item
  // 220), so it can never read differently from what those controls show.
  const courseAccessibleName = courseHeaderAccessibleName(
    institution,
    term,
    ALL_FILTER,
    Boolean(courseAriaSort),
    sort.direction
  );
  const progressAccessibleName = progressHeaderAccessibleName(outstandingOnly, Boolean(progressAriaSort), sort.direction);

  return (
    <div className={styles.scrollRegionWrap} data-scroll-left={scrollLeftEdge} data-scroll-right={scrollRightEdge}>
      {/* AC15 item 88: the visible title lives OUTSIDE the sticky table
          (a <caption> would scroll away with it); this hidden element names
          the scroll region via aria-labelledby. A region's accessible name
          does not require a heading (S17) - using one here skipped from the
          tab's own <h1> straight to an <h3> with nothing in between. */}
      <span id={regionLabelId} className={styles.srOnly}>
        {regionLabel}
      </span>
      {/* AC5 item 22: named by every task header button's aria-describedby - ONE shared hint, not one per column. */}
      <span id={dragHintId} className={styles.srOnly}>
        Press Shift plus Left or Right arrow on the column header to reorder without dragging.
      </span>

      <div
        ref={scrollRef}
        className={styles.scrollRegion}
        tabIndex={0}
        role="region"
        aria-labelledby={regionLabelId}
        onScroll={updateScrollShadows}
        style={tableStyle}
      >
        {/* N5: --ttg-identity-w/--ttg-left-w are set here (not on the
            <table>) so both the table's own frozen-column CSS AND these
            sibling scroll-shadow divs can read the same measured values -
            a custom property set on the table would not inherit sideways
            to its siblings. */}
        <div className={styles.scrollShadowLeft} />
        <div className={styles.scrollShadowRight} />

        <table
          className={styles.table}
          data-density={density}
          data-highlight={highlightOutstanding ? "true" : "false"}
          role="grid"
          aria-rowcount={totalRows + 3}
          aria-colcount={totalCols}
          onFocus={handleGridFocus}
        >
          <caption className={styles.srOnly}>{regionLabel}</caption>
          <thead>
            <tr className={styles.headerRow1}>
              {/* S11: two single-column headers (each `scope="col"`) instead
                  of one `colSpan={2}` "Course" cell - the previous version
                  made the progress cell announce as "Course, 12/38" because
                  it had no header of its own. AC-D item 218: both frozen
                  headers are buttons that open the column menu, joining the
                  roving-tabindex model at row -1, columns 0 and 1 - the same
                  slots the body's identity/progress cells already use at
                  every row, so ArrowUp from body row 0 lands here instead of
                  nowhere (B1's fix extended to the two frozen columns). */}
              <th rowSpan={2} scope="col" className={styles.cornerCell} aria-sort={courseAriaSort}>
                <button
                  type="button"
                  className={styles.cornerHeaderButton}
                  ref={(el) => registerRef(-1, 0, el)}
                  tabIndex={clampedFocusRow === -1 && clampedFocusCol === 0 ? 0 : -1}
                  data-row={-1}
                  data-col={0}
                  onFocus={() => setFocusState({ row: -1, col: 0 })}
                  onClick={(e) => openColumnMenu({ kind: "course" }, e.currentTarget)}
                  onKeyDown={(e) =>
                    handleHeaderKeyDown(e, -1, 0, () => openColumnMenu({ kind: "course" }, e.currentTarget))
                  }
                  aria-label={courseAccessibleName}
                  title="Course - click to sort or filter by institution/term"
                >
                  <span>Course</span>
                  {courseAriaSort && <SortDirectionGlyph direction={sort.direction} />}
                  {courseFilterActive && <FilterActiveGlyph />}
                </button>
              </th>
              <th rowSpan={2} scope="col" className={styles.cornerCell} aria-sort={progressAriaSort}>
                <button
                  type="button"
                  className={styles.cornerHeaderButton}
                  ref={(el) => registerRef(-1, 1, el)}
                  tabIndex={clampedFocusRow === -1 && clampedFocusCol === 1 ? 0 : -1}
                  data-row={-1}
                  data-col={1}
                  onFocus={() => setFocusState({ row: -1, col: 1 })}
                  onClick={(e) => openColumnMenu({ kind: "progress" }, e.currentTarget)}
                  onKeyDown={(e) =>
                    handleHeaderKeyDown(e, -1, 1, () => openColumnMenu({ kind: "progress" }, e.currentTarget))
                  }
                  aria-label={progressAccessibleName}
                  title="Progress - click to sort or show outstanding only"
                >
                  <span>Progress</span>
                  {progressAriaSort && <SortDirectionGlyph direction={sort.direction} />}
                  {outstandingOnly && <FilterActiveGlyph />}
                </button>
              </th>
              {groups.map((group) => {
                const groupTasks = tasks.filter((t) => t.group === group.id);
                if (groupTasks.length === 0) return null;
                const collapsed = collapsedGroups.has(group.id);
                if (collapsed) {
                  // A collapsed group has no row-2 cell of its own, so its
                  // rollup button stands in for that column's header entry
                  // and lives at row -1 (N1: `scope="col"` - it now covers
                  // exactly one column, not a group of them).
                  const colIndex = colIndexByGroupId.get(group.id) ?? -1;
                  const tabbable = clampedFocusRow === -1 && clampedFocusCol === colIndex;
                  const activate = () => handleGroupToggle(group.id, -1); // item 255: expands, from row -1
                  // B6: collapsing a group removes its sorted task's OWN
                  // `<th>` from the DOM, but not the sort itself - the row
                  // order is still governed by that task (visibleTasks/
                  // resolveTaskSort/sortTaskRows never look at collapse
                  // state), so the rollup `<th>` standing in for the whole
                  // group is where aria-sort and the direction glyph have
                  // to move to. Exactly one header carries aria-sort in
                  // every state - never zero, never two.
                  const sortedTask = sort.field === "task" ? groupTasks.find((t) => t.id === sort.taskId) : undefined;
                  const rollupAriaLabel = sortedTask
                    ? terminated(
                        `${group.label} group, collapsed, sorted by ${sortedTask.label}, ${sort.direction === "asc" ? "ascending" : "descending"}`
                      )
                    : undefined;
                  return (
                    <th
                      key={group.id}
                      rowSpan={2}
                      scope="col"
                      className={`${styles.groupBandCell} ${styles.groupBoundary}`}
                      aria-sort={sortedTask ? ariaSortDirection : undefined}
                    >
                      <button
                        type="button"
                        className={styles.rollupButton}
                        ref={(el) => registerRef(-1, colIndex, el)}
                        tabIndex={tabbable ? 0 : -1}
                        data-row={-1}
                        data-col={colIndex}
                        onFocus={() => setFocusState({ row: -1, col: colIndex })}
                        onClick={activate}
                        onKeyDown={(e) => handleHeaderKeyDown(e, -1, colIndex, activate)}
                        aria-expanded={false}
                        aria-label={rollupAriaLabel}
                        title={`Expand ${group.label}`}
                      >
                        <span aria-hidden="true">{"▸"}</span> {group.label}
                        {sortedTask && <SortDirectionGlyph direction={sort.direction} />}
                      </button>
                    </th>
                  );
                }
                // An expanded group's own collapse toggle spans every task
                // column underneath it, so it cannot occupy a single (row,
                // col) slot the same way the per-task headers below it do -
                // it is registered at row -2, at the first column of its
                // span (B1).
                // `groupTasks.length === 0` already returned null above, so
                // `groupTasks[0]` always exists here (C5: the previous
                // `groupTasks.length > 0 ? ... : -1` ternary's false branch
                // was dead code - unreachable given the early return).
                const firstColIndex = colIndexByTaskId.get(groupTasks[0].id) ?? -1;
                const bandTabbable = clampedFocusRow === -2 && clampedFocusCol === firstColIndex;
                const activate = () => handleGroupToggle(group.id, -2); // item 255: collapses, from row -2
                return (
                  <th
                    key={group.id}
                    colSpan={groupTasks.length}
                    scope="colgroup"
                    className={`${styles.groupBandCell} ${styles.groupBoundary}`}
                  >
                    <button
                      type="button"
                      className={styles.rollupButton}
                      ref={(el) => registerRef(-2, firstColIndex, el)}
                      tabIndex={bandTabbable ? 0 : -1}
                      data-row={-2}
                      data-col={firstColIndex}
                      onFocus={() => setFocusState({ row: -2, col: firstColIndex })}
                      onClick={activate}
                      onKeyDown={(e) => handleHeaderKeyDown(e, -2, firstColIndex, activate)}
                      aria-expanded={true}
                      title={`Collapse ${group.label}`}
                    >
                      <span aria-hidden="true">{"▾"}</span> {group.label}
                    </button>
                  </th>
                );
              })}
            </tr>
            <tr className={styles.headerRow2}>
              {groups.flatMap((group) => {
                if (collapsedGroups.has(group.id)) return [];
                const groupTasks = tasks.filter((t) => t.group === group.id);
                return groupTasks.map((task, i) => {
                  const outstanding = countColumnOutstanding(rows, task.id, task.cadence, nowMs);
                  const colIndex = colIndexByTaskId.get(task.id) ?? -1;
                  const tabbable = clampedFocusRow === -1 && clampedFocusCol === colIndex;
                  const activate = (anchor: HTMLElement) => openColumnMenu({ kind: "task", task }, anchor);
                  const isSorted = sort.field === "task" && sort.taskId === task.id;
                  const filterDescriptor = columnFilterByTaskId.get(task.id);
                  const isFiltered = hasActiveColumnFilter(columnFilters, task.id);
                  // AC-D item 223: the header's accessible name states the
                  // active constraint in words - "Textbook ordered?, filtered
                  // to Not done, Blocked. Sorted ascending." - built from the
                  // SAME descriptor (describeTaskColumnFilters) the chips and
                  // the live-region announcement use, so the three can never
                  // read differently for the same state. B9: joined via
                  // terminated/appendSentence rather than a blind `+= ". "`
                  // - about 40 of the catalog's task labels already end in
                  // "?", and appending ". Sorted ascending." straight after
                  // one read "Textbook ordered?. Sorted ascending." with two
                  // terminators back to back.
                  let accessibleName = task.label;
                  if (filterDescriptor) accessibleName = terminated(`${accessibleName}, filtered to ${filterDescriptor.statusWords}`);
                  if (isSorted) accessibleName = appendSentence(accessibleName, `Sorted ${sort.direction === "asc" ? "ascending" : "descending"}`);

                  return (
                    <th
                      key={task.id}
                      scope="col"
                      // AC7 items 30/31/33 (dragHeaderClassName, useColumnDrag.ts): dim/insertion-line/flash.
                      className={`${styles.taskHeaderCell}${i === 0 ? ` ${styles.groupBoundary}` : ""}${dragHeaderClassName(drag, flashId, colIndexByTaskId, task.id, colIndex)}`}
                      aria-sort={isSorted ? ariaSortDirection : undefined}
                    >
                      {/* AC24: DragHandle and the menu button are SIBLINGS, never nested. */}
                      <div className={dragStyles.taskHeaderRow}>
                        <DragHandle task={task} onDown={dragPointerDown} onMove={dragPointerMove} onUp={dragPointerUp} />
                        <button
                          type="button"
                          className={styles.taskHeaderInner}
                          style={{ border: 0, background: "transparent", cursor: "pointer", font: "inherit", width: "100%" }}
                          ref={(el) => registerRef(-1, colIndex, el)}
                          tabIndex={tabbable ? 0 : -1}
                          data-row={-1}
                          data-col={colIndex}
                          onFocus={() => setFocusState({ row: -1, col: colIndex })}
                          onClick={(e) => activate(e.currentTarget)}
                          // AC4 items 13/15: Shift+Left/Right reorder (shiftArrowDirection); bare arrows still navigate (item 14).
                          onKeyDown={(e) => {
                            const shiftDirection = shiftArrowDirection(e.shiftKey, e.key, e.ctrlKey, e.altKey, e.metaKey);
                            if (!shiftDirection) {
                              handleHeaderKeyDown(e, -1, colIndex, () => activate(e.currentTarget));
                              return;
                            }
                            e.preventDefault();
                            pendingReorderFocusRef.current = task.id;
                            onReorderStep(task.id, shiftDirection);
                          }}
                          aria-label={accessibleName}
                          // The pointer-only handle is unreachable by keyboard - this button gets the shared hint too.
                          aria-describedby={dragHintId}
                          title={`${task.label} - ${outstanding} outstanding. Click to sort, filter or bulk-update. Shift plus Left or Right arrow reorders this column.`}
                        >
                          <span className={styles.taskHeaderLabel}>{task.label}</span>
                          <span className={styles.taskHeaderIndicators} aria-hidden="true">
                            {isSorted && <SortDirectionGlyph direction={sort.direction} />}
                            {isFiltered && <FilterActiveGlyph />}
                          </span>
                        </button>
                      </div>
                    </th>
                  );
                });
              })}
            </tr>
          </thead>

          <tbody>
            {rows.map((row, rowIndex) => (
              <TaskGridRow
                key={row.course.id}
                rowIndex={rowIndex}
                course={row.course}
                cells={row.cells}
                columns={columns}
                progress={computeTaskProgress(row.cells, tasks, nowMs)}
                nowMs={nowMs}
                isActiveRow={hover.row === rowIndex || clampedFocusRow === rowIndex}
                focusRow={clampedFocusRow}
                focusCol={clampedFocusCol}
                hoveredCol={hover.col}
                cellErrors={Object.fromEntries(
                  Object.entries(cellErrors)
                    .filter(([key]) => key.startsWith(`${row.course.id}:`))
                    .map(([key, value]) => [key.slice(row.course.id.length + 1), value])
                )}
                instructions={instructions}
                onSaveInstruction={onSaveInstruction}
                registerRef={registerRef}
                onFocusCell={(r, c) => setFocusState({ row: r, col: c })}
                onNavigate={handleNavigate}
                onCellChange={onCellChange}
                onFillDown={handleFillDown}
                onToggleGroupCollapse={handleGroupToggle}
                onBulkRowSet={onRowBulkSet}
                onRowMouseEnter={(r) => setHover((h) => ({ ...h, row: r }))}
                onColMouseEnter={(c) => setHover((h) => ({ ...h, col: c }))}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={totalCols} className={styles.emptyState}>
                  No courses match the current filters.
                </td>
              </tr>
            )}
          </tbody>

          <tfoot>
            <tr className={styles.footerRow}>
              <th scope="row" className={styles.identityCell}>
                Outstanding
              </th>
              <td className={styles.progressCell} />
              {columns.map((col) => {
                if (col.kind === "rollup") {
                  return (
                    <td key={col.groupId} className={`${styles.rollupCell} ${styles.groupBoundary}`}>
                      {groupOutstandingSum(col.tasks)}
                    </td>
                  );
                }
                return (
                  <td key={col.task.id} className={styles.statusCell}>
                    {countColumnOutstanding(rows, col.task.id, col.task.cadence, nowMs)}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <TaskColumnMenu
        anchorEl={columnMenu?.anchor ?? null}
        target={columnMenu?.target ?? null}
        onClose={closeColumnMenu}
        sort={sort}
        onSortChange={onSortChange}
        columnFilters={columnFilters}
        onColumnFilterChange={onColumnFilterChange}
        onColumnBulkSet={onColumnBulkSet}
        reorderColumns={reorderColumns}
        onMoveColumn={handleMoveColumn}
        institution={institution}
        onInstitutionChange={onInstitutionChange}
        institutionOptions={institutionOptions}
        term={term}
        onTermChange={onTermChange}
        termOptions={termOptions}
        outstandingOnly={outstandingOnly}
        onOutstandingOnlyChange={onOutstandingOnlyChange}
        outstandingOnlyDisabled={outstandingOnlyDisabled}
        visibleInstitutions={visibleInstitutions}
        instructions={instructions}
        onSaveInstruction={onSaveInstruction}
      />
    </div>
  );
}
