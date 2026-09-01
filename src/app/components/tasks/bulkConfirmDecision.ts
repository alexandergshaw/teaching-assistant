// Pure decisions behind every bulk-write confirmation on the Tasks grid
// (column bulk-set, row bulk-set, Ctrl+D fill-down - AC6). Extracted so the
// THRESHOLD a keystroke has to cross before it demands a confirmation is
// provable from frozen literals, not from reading TasksTab.tsx - vitest here
// is node-env and renders no component (see this repo's own AGENTS.md-linked
// notes), so a decision left inline in the .tsx would be untestable.
//
// BLOCKER 1 (Tasks-tab UX audit): at the start of a term every cell in a
// column is still "open". The OLD single threshold this repo shipped -
// "confirm only when a target cell already holds a non-open value that
// differs from what's about to be written" (overwritesMeaningfully, still
// used for column/row bulk-set below) - reads as `count === 0` in exactly
// that all-open state, so Ctrl+D silently rewrote every course below the
// cursor with no dialog at all. decideFillDownConfirm fixes this ONLY for
// fill-down (the audit's own fix): once a fill would touch more than one
// row, it confirms unconditionally, regardless of what those rows currently
// hold - a single-row fill keeps the old low-risk threshold, since one cell
// is no more dangerous than a manual edit.
import type { TaskCell as TaskCellValue, TaskStatus } from "@/lib/course-tasks";
import { TASK_STATUS_WORDS } from "@/lib/course-tasks";

/** True when a target cell already holds a value that a bulk write would
 * silently clobber - it is not already `open`, and its current status
 * differs from what is about to be written. This is the ORIGINAL AC6 rule,
 * unchanged, and still governs column/row bulk-set below - only fill-down's
 * threshold changes (see the header comment). */
export function overwritesMeaningfully(cell: TaskCellValue, nextStatus: TaskStatus): boolean {
  return cell.status !== "open" && cell.status !== nextStatus;
}

/** Whether writing `sourceCell` over `target` would actually change what is
 * stored - status OR note, since a fill-down carries the whole cell, not
 * just the status. `doneAt` is deliberately excluded: it is a derived
 * timestamp of the status transition (setTaskCellStatus re-stamps it even on
 * a same-status "done" -> "done" write), not a value an instructor is
 * choosing between, so two cells that agree on status and note read as
 * unchanged even if their doneAt differs. */
function cellsDiffer(target: TaskCellValue, sourceCell: TaskCellValue): boolean {
  return target.status !== sourceCell.status || target.note !== sourceCell.note;
}

export interface BulkConfirmDecision {
  requiresConfirm: boolean;
  /** Courses the confirm message should say will change. */
  count: number;
}

export interface FillDownConfirmDecision extends BulkConfirmDecision {
  /** True once the fill touches more than one row - the branch BLOCKER 1
   * added. Carried on the decision (rather than recomputed at the call site)
   * so the message builder below can never disagree with the decision that
   * produced it about which wording applies. */
  manyRows: boolean;
}

/** Column/row bulk-set (AC6, unchanged by this wave): confirm only when the
 * write would clobber an existing non-open value. */
export function decideStatusBulkConfirm(cells: TaskCellValue[], nextStatus: TaskStatus): BulkConfirmDecision {
  const count = cells.filter((c) => overwritesMeaningfully(c, nextStatus)).length;
  return { requiresConfirm: count > 0, count };
}

/** Ctrl+D fill-down (BLOCKER 1's fix). `cells` is every TARGET row's current
 * cell for the column being filled, in row order below the cursor;
 * `sourceCell` is the value about to be written into all of them.
 *
 * - More than one target row: confirms whenever at least one target would
 *   actually change (cellsDiffer), and `count` is EVERY row that would
 *   change - not just the ones that already held a meaningful, non-open
 *   value. This is the exact case that used to slip through silently: 25
 *   open cells about to become "done" is 25 real changes, even though the
 *   OLD rule counted zero of them as "meaningful overwrites".
 * - Exactly one target row: unchanged low-risk behavior - a single cell is
 *   no different from a manual edit, so it keeps the original
 *   overwritesMeaningfully threshold rather than confirming on every
 *   same-row fill.
 * - Zero target rows: never reached by TasksGrid.tsx's own guard
 *   (`targets.length === 0` returns before calling onFillDown), but reads as
 *   "nothing to confirm" here too, for a caller that skips that guard.
 */
export function decideFillDownConfirm(cells: TaskCellValue[], sourceCell: TaskCellValue): FillDownConfirmDecision {
  const manyRows = cells.length > 1;
  if (manyRows) {
    const count = cells.filter((c) => cellsDiffer(c, sourceCell)).length;
    return { requiresConfirm: count > 0, count, manyRows };
  }
  const count = cells.filter((c) => overwritesMeaningfully(c, sourceCell.status)).length;
  return { requiresConfirm: count > 0, count, manyRows };
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
}

/** Confirm-dialog body for a column bulk-set ("set this task to X for every
 * visible course"). Unchanged copy from before this wave. */
export function buildColumnBulkMessage(taskLabel: string, status: TaskStatus, count: number): string {
  return `This will overwrite ${count} existing value${plural(count)} in "${taskLabel}" with ${TASK_STATUS_WORDS[status]}. Continue?`;
}

/** Confirm-dialog body for a row bulk-set ("set every visible task for this
 * one course"). Unchanged copy from before this wave. */
export function buildRowBulkMessage(courseName: string, status: TaskStatus, count: number): string {
  return `This will overwrite ${count} existing value${plural(count)} for ${courseName} with ${TASK_STATUS_WORDS[status]}. Continue?`;
}

/** Confirm-dialog body for Ctrl+D fill-down. When `decision.manyRows` is
 * true (BLOCKER 1's new branch) the message NAMES the count and the anchor
 * course the fill started from, so the instructor reads exactly what is
 * about to happen rather than a generic "N existing values" - matching the
 * audit's own suggested phrasing. The single-row branch keeps the original
 * "This will overwrite..." copy, since that path is reached only when the
 * one target cell already held a meaningful, differing value. */
export function buildFillDownMessage(
  taskLabel: string,
  status: TaskStatus,
  decision: FillDownConfirmDecision,
  anchorCourseName: string
): string {
  if (decision.manyRows) {
    return `Fill "${taskLabel}" = ${TASK_STATUS_WORDS[status]} into the ${decision.count} course${plural(decision.count)} below ${anchorCourseName}?`;
  }
  return `This will overwrite ${decision.count} existing value${plural(decision.count)} in "${taskLabel}" below. Continue?`;
}

// ---------------------------------------------------------------------------
// BLOCKER 2: the bulk-outcome announcement text - what actually happened,
// after the write. Pulled out as pure builders (rather than left as inline
// template strings in useTaskBulkActions.ts) so the "3 of 26 succeeded"
// wording is provable from frozen literals, matching this module's other
// message builders above.

/** Column bulk-set outcome ("Set X to Y for N of M courses."). */
export function buildColumnBulkOutcome(taskLabel: string, status: TaskStatus, succeeded: number, total: number): string {
  return `Set ${taskLabel} to ${TASK_STATUS_WORDS[status]} for ${succeeded} of ${total} course${plural(total)}.`;
}

/** Row bulk-set outcome - a single course, a single request, so this is a
 * plain success/failure sentence rather than an "N of M" count. */
export function buildRowBulkOutcome(
  courseName: string,
  status: TaskStatus,
  taskCount: number,
  ok: boolean,
  error?: string
): string {
  if (ok) return `Set ${taskCount} task${plural(taskCount)} to ${TASK_STATUS_WORDS[status]} for ${courseName}.`;
  return `Could not update ${courseName}: ${error}`;
}

/** Fill-down outcome ("Filled X down to N of M courses."). */
export function buildFillDownOutcome(taskLabel: string, succeeded: number, total: number): string {
  return `Filled ${taskLabel} down to ${succeeded} of ${total} course${plural(total)}.`;
}
