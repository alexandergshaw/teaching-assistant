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
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemText from "@mui/material/ListItemText";
import {
  taskCellAt,
  type TaskCell as TaskCellValue,
  type TaskDefinition,
  type TaskGroupId,
  type TaskStatus,
  TASK_STATUSES,
} from "@/lib/course-tasks";
import { computeTaskProgress, countColumnOutstanding, TASK_STATUS_WORDS, type TaskRow } from "@/lib/course-tasks-view";
import TaskGridRow, { type GridColumn } from "./TaskGridRow";
import { StatusGlyph } from "./TaskCell";
import styles from "./TasksGrid.module.css";

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
  onCellChange: (courseId: string, taskId: string, nextCell: TaskCellValue) => void;
  onColumnBulkSet: (task: TaskDefinition, status: TaskStatus) => void;
  onRowBulkSet: (courseId: string, courseName: string, status: TaskStatus) => void;
  onFillDown: (task: TaskDefinition, sourceCell: TaskCellValue, targetCourseIds: string[]) => void;
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
  onCellChange,
  onColumnBulkSet,
  onRowBulkSet,
  onFillDown,
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
  // Column model: one GridColumn per visible task, or one roll-up per
  // collapsed group (AC15 item 85). A group with zero visible tasks
  // contributes nothing at all - AC7 item 37's "does not break the header
  // spans" guarantee.
  const columns: GridColumn[] = useMemo(() => {
    const out: GridColumn[] = [];
    for (const group of groups) {
      const groupTasks = tasks.filter((t) => t.group === group.id);
      if (groupTasks.length === 0) continue;
      if (collapsedGroups.has(group.id)) {
        out.push({ kind: "rollup", groupId: group.id, label: group.label, tasks: groupTasks });
      } else {
        for (const t of groupTasks) out.push({ kind: "task", task: t });
      }
    }
    return out;
  }, [groups, tasks, collapsedGroups]);

  // Column-index lookups for the two header rows (B1, WCAG 2.1.1/2.4.3): the
  // per-task header button and a collapsed group's rollup button occupy
  // EXACTLY one real column each, so they reuse the same column index the
  // body already assigns via `columns` above - this is what lets the header
  // row join the roving-tabindex model as "row -1" instead of forty-plus
  // ungoverned tab stops.
  const colIndexByTaskId = useMemo(() => {
    const map = new Map<string, number>();
    columns.forEach((c, i) => {
      if (c.kind === "task") map.set(c.task.id, i + 2);
    });
    return map;
  }, [columns]);

  const colIndexByGroupId = useMemo(() => {
    const map = new Map<TaskGroupId, number>();
    columns.forEach((c, i) => {
      if (c.kind === "rollup") map.set(c.groupId, i + 2);
    });
    return map;
  }, [columns]);

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
  const clampedFocusRow = Math.min(focus.row, Math.max(0, totalRows - 1));
  const clampedFocusCol = Math.min(focus.col, Math.max(0, totalCols - 1));
  if (clampedFocusRow !== focus.row || clampedFocusCol !== focus.col) {
    setFocusState({ row: clampedFocusRow, col: clampedFocusCol });
  }

  const [hover, setHover] = useState<{ row: number | null; col: number | null }>({ row: null, col: null });

  const rowHeightPx = DENSITY_ROW_PX[density];

  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------------
  // Sticky-pane clearance (B2, WCAG 2.2 SC 2.4.11): MEASURED, never
  // assumed. The header's real height depends on how many lines the
  // longest visible task label wraps to (.taskHeaderLabel clamps at 3,
  // TasksGrid.module.css) and does not scale with density, so a
  // density-derived constant (the previous `rowHeightPx * 2`) drifts from
  // reality - worst at `compact`, where the focused cell ended up entirely
  // hidden behind the header. `thead`/`tfoot` heights and the two frozen
  // cells' widths are read straight off the DOM instead, and re-measured on
  // every resize (a ResizeObserver on the scroll container, plus the
  // window resize event for font/zoom changes that do not resize the
  // container itself) and whenever the column/row set changes (a column
  // being hidden can change how many lines a label wraps to).
  const [metrics, setMetrics] = useState({ headerH: 0, footerH: 0, identityW: 0, leftW: 0 });

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const measure = () => {
      const theadEl = container.querySelector("thead");
      const tfootEl = container.querySelector("tfoot");
      const identityEl = container.querySelector(`.${styles.identityCell}`);
      const progressEl = container.querySelector(`.${styles.progressCell}`);
      const headerH = theadEl ? theadEl.getBoundingClientRect().height : 0;
      const footerH = tfootEl ? tfootEl.getBoundingClientRect().height : 0;
      const identityW = identityEl instanceof HTMLElement ? identityEl.offsetWidth : 0;
      const progressW = progressEl instanceof HTMLElement ? progressEl.offsetWidth : 0;
      const leftW = identityW + progressW;
      setMetrics((prev) =>
        prev.headerH === headerH && prev.footerH === footerH && prev.identityW === identityW && prev.leftW === leftW
          ? prev
          : { headerH, footerH, identityW, leftW }
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    const theadEl = container.querySelector("thead");
    const tfootEl = container.querySelector("tfoot");
    if (theadEl) ro.observe(theadEl);
    if (tfootEl) ro.observe(tfootEl);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [density, columns.length, rows.length]);

  // Only published once something has actually been measured - the CSS
  // fallback (`var(--ttg-left-w, 348px)`) already matches the hardcoded
  // widths .identityCell/.progressCell start with, so leaving the property
  // unset on the very first paint (before this file's own useEffect above
  // has run) avoids a one-frame flash at 0px rather than reproducing it.
  const tableStyle: CSSProperties =
    metrics.leftW > 0
      ? ({
          "--ttg-identity-w": `${metrics.identityW}px`,
          "--ttg-left-w": `${metrics.leftW}px`,
        } as CSSProperties)
      : {};

  /** AC16 amendment 135 (WCAG 2.2 SC 2.4.11): scrolls a cell clear of every
   * sticky pane, not merely into the scroll box's bounding rect - a plain
   * scrollIntoView leaves a cell hidden behind the sticky header/footer/
   * frozen columns exactly at the moment a keyboard user arrows onto it (or
   * tabs/clicks into a scrolled grid - see the grid's onFocus below, B3).
   * `behavior` is passed in rather than decided here: N4 - a HELD arrow key
   * re-triggers this on every step, and "smooth" there re-measures
   * scrollTop mid-animation and accumulates error, so keyboard-driven calls
   * always pass "auto"; a single Tab/click entry can afford "smooth". */
  const ensureVisible = useCallback(
    (row: number, col: number, el: HTMLElement, behavior: ScrollBehavior) => {
      const container = scrollRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      let top = container.scrollTop;
      let left = container.scrollLeft;

      const topBound = cRect.top + metrics.headerH;
      const bottomBound = cRect.bottom - metrics.footerH;
      if (eRect.top < topBound) top -= topBound - eRect.top;
      else if (eRect.bottom > bottomBound) top += eRect.bottom - bottomBound;

      if (col >= 2) {
        const leftBound = cRect.left + metrics.leftW;
        if (eRect.left < leftBound) left -= leftBound - eRect.left;
        else if (eRect.right > cRect.right) left += eRect.right - cRect.right;
      }

      container.scrollTo({ top, left, behavior });
    },
    [metrics.headerH, metrics.footerH, metrics.leftW]
  );

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

  /** The full APG arrow-key contract (AC15 item 95): Left/Right/Up/Down move
   * one cell and stop at the edges; Home/End move to the row's edges;
   * Ctrl+Home/End move to the very first/last cell of the grid; PageUp/
   * PageDown move by a visible page of rows, sized from the scroll
   * container's own rendered height rather than a guessed constant. B1:
   * ArrowUp from body row 0 moves into the header (row -1, and from there
   * row -2 for an expanded group's own collapse toggle); ArrowDown returns
   * the same way - the header rows are not a dead end. */
  const handleNavigate = useCallback(
    (row: number, col: number, key: string, ctrlKey: boolean) => {
      const maxRow = Math.max(0, totalRows - 1);
      const maxCol = Math.max(0, totalCols - 1);
      let nextRow = row;
      let nextCol = col;

      const container = scrollRef.current;
      const visibleRows = container
        ? Math.max(1, Math.floor((container.clientHeight - metrics.headerH - metrics.footerH) / rowHeightPx))
        : 10;

      switch (key) {
        case "ArrowLeft":
          nextCol = Math.max(0, col - 1);
          break;
        case "ArrowRight":
          nextCol = Math.min(maxCol, col + 1);
          break;
        case "ArrowUp":
          nextRow = Math.max(-2, row - 1);
          break;
        case "ArrowDown":
          nextRow = Math.min(maxRow, row + 1);
          break;
        case "Home":
          if (ctrlKey) {
            nextRow = 0;
            nextCol = 0;
          } else {
            nextCol = 0;
          }
          break;
        case "End":
          if (ctrlKey) {
            nextRow = maxRow;
            nextCol = maxCol;
          } else {
            nextCol = maxCol;
          }
          break;
        case "PageUp":
          nextRow = Math.max(0, row - visibleRows);
          break;
        case "PageDown":
          nextRow = Math.min(maxRow, row + visibleRows);
          break;
        default:
          return;
      }
      focusCellAt(nextRow, nextCol);
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

  // ---------------------------------------------------------------------
  // Scroll shadows (AC15 item 87)
  const [scrollLeftEdge, setScrollLeftEdge] = useState(false);
  const [scrollRightEdge, setScrollRightEdge] = useState(false);
  const updateScrollShadows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollLeftEdge(el.scrollLeft > 1);
    setScrollRightEdge(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);
  useEffect(() => {
    updateScrollShadows();
  }, [updateScrollShadows, columns.length, rows.length]);

  // ---------------------------------------------------------------------
  // Column bulk-set menu (AC6 item 30) - a normal, always-reachable button
  // in each task header, now part of the header row's own roving-tabindex
  // slot (B1) rather than a free-floating extra tab stop.
  const [columnMenu, setColumnMenu] = useState<{ task: TaskDefinition; anchor: HTMLElement } | null>(null);

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
                  it had no header of its own. */}
              <th rowSpan={2} scope="col" className={styles.cornerCell}>
                Course
              </th>
              <th rowSpan={2} scope="col" className={styles.cornerCell}>
                Progress
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
                  const activate = () => onToggleGroupCollapse(group.id);
                  return (
                    <th key={group.id} rowSpan={2} scope="col" className={`${styles.groupBandCell} ${styles.groupBoundary}`}>
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
                        title={`Expand ${group.label}`}
                      >
                        <span aria-hidden="true">{"▸"}</span> {group.label}
                      </button>
                    </th>
                  );
                }
                // An expanded group's own collapse toggle spans every task
                // column underneath it, so it cannot occupy a single (row,
                // col) slot the same way the per-task headers below it do -
                // it is registered at row -2, at the first column of its
                // span (B1).
                const firstColIndex = groupTasks.length > 0 ? colIndexByTaskId.get(groupTasks[0].id) ?? -1 : -1;
                const bandTabbable = clampedFocusRow === -2 && clampedFocusCol === firstColIndex;
                const activate = () => onToggleGroupCollapse(group.id);
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
                  const activate = (anchor: HTMLElement) => setColumnMenu({ task, anchor });
                  return (
                    <th
                      key={task.id}
                      scope="col"
                      className={`${styles.taskHeaderCell}${i === 0 ? ` ${styles.groupBoundary}` : ""}`}
                    >
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
                        onKeyDown={(e) => handleHeaderKeyDown(e, -1, colIndex, () => activate(e.currentTarget))}
                        title={`${task.label} - ${outstanding} outstanding. Click for bulk actions.`}
                      >
                        {/* N3: the outstanding count used to also be shown
                            here, duplicating the sticky footer's own count
                            for the same column - the footer is the chosen
                            home for that number, so the header keeps just
                            the task label. */}
                        <span className={styles.taskHeaderLabel}>{task.label}</span>
                      </button>
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
                registerRef={registerRef}
                onFocusCell={(r, c) => setFocusState({ row: r, col: c })}
                onNavigate={handleNavigate}
                onCellChange={onCellChange}
                onFillDown={handleFillDown}
                onToggleGroupCollapse={onToggleGroupCollapse}
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

      <Menu anchorEl={columnMenu?.anchor ?? null} open={Boolean(columnMenu)} onClose={() => setColumnMenu(null)}>
        {columnMenu &&
          TASK_STATUSES.map((status) => (
            <MenuItem
              key={status}
              onClick={() => {
                const task = columnMenu.task;
                setColumnMenu(null);
                onColumnBulkSet(task, status);
              }}
            >
              <StatusGlyph status={status} />
              <ListItemText primary={`Set every visible row to ${TASK_STATUS_WORDS[status]}`} style={{ marginLeft: 8 }} />
            </MenuItem>
          ))}
      </Menu>
    </div>
  );
}
