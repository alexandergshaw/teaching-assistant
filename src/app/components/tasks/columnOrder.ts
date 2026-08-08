// Pure reorder layer for the Tasks grid's column drag/keyboard/menu
// reordering - docs/tasks-column-reorder-acceptance-criteria.md. Copies
// gridFocus.ts's shape: no React, no MUI, no CSS module, no DOM, so this is
// the only part of the feature a real test can exercise (vitest runs
// environment:"node" and collects only src/**/*.test.ts - nothing in a .tsx
// is ever rendered). TasksGrid.tsx is at 918 of its 1000-line cap, so every
// decision that does not need a DOM node lives here instead.
//
// INPUT CONTRACT (C5): `ReorderableColumn[]` is built by TasksTab from
// `resolvedCatalog` + `visibleColumnIds`, NOT from TasksGrid's own `columns`
// array - that array is built from `tasks={visibleTasks}` (TasksTab.tsx),
// so it never contains a hidden task. Feeding this module from there would
// leave every hidden task's `position` untouched (null), which
// resolveTaskCatalog reads as +Infinity and sorts to the end of the group -
// exactly what AC8 item 39 forbids. Every function below therefore expects
// (and, for groupPositionAssignments, GUARANTEES) that every task in a
// group is represented, hidden or not.
import type { TaskGroupId } from "@/lib/course-tasks";

export interface ReorderableColumn {
  id: string;
  group: TaskGroupId;
  visible: boolean;
}

export interface GroupPosition {
  /** 1-based, among VISIBLE columns of the group only (item 20: "position 4
   * of 17" is what the user can perceive, not a raw array index). */
  index: number;
  total: number;
}

export interface PositionAssignment {
  taskId: string;
  position: number;
}

function indicesForGroup(columns: readonly ReorderableColumn[], group: TaskGroupId): number[] {
  const out: number[] = [];
  columns.forEach((c, i) => {
    if (c.group === group) out.push(i);
  });
  return out;
}

/** AC1 item 2 / REGRESSION entry 232 check 15: a drop target must be a
 * VISIBLE column (it has no on-screen header otherwise) in the SAME group
 * as the dragged column, and not the dragged column itself. */
export function isValidDropTarget(
  columns: readonly ReorderableColumn[],
  draggedId: string,
  targetId: string
): boolean {
  if (draggedId === targetId) return false;
  const dragged = columns.find((c) => c.id === draggedId);
  const target = columns.find((c) => c.id === targetId);
  if (!dragged || !target) return false;
  if (!dragged.visible || !target.visible) return false;
  return dragged.group === target.group;
}

/** Moves `fromId` to occupy `toId`'s array slot within their shared group -
 * the drag-drop primitive (AC1 item 1). Returns null (never clamps - item
 * 2) when the two are not in the same group. Any hidden column sitting
 * between them keeps its RELATIVE position - it is simply carried along by
 * the splice, never independently reordered (item 4's "carries hidden
 * columns along" case). Never mutates `columns`. */
export function moveWithinGroup(
  columns: readonly ReorderableColumn[],
  fromId: string,
  toId: string
): ReorderableColumn[] | null {
  const fromIdx = columns.findIndex((c) => c.id === fromId);
  const toIdx = columns.findIndex((c) => c.id === toId);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return null;
  if (columns[fromIdx].group !== columns[toIdx].group) return null;

  const result = columns.slice();
  const [moved] = result.splice(fromIdx, 1);
  const insertAfter = fromIdx < toIdx;
  const newToIdx = result.findIndex((c) => c.id === toId);
  result.splice(insertAfter ? newToIdx + 1 : newToIdx, 0, moved);
  return result;
}

/** A visible column together with any hidden columns of the SAME group
 * immediately preceding it in raw array order - moveColumnInOrder's
 * (courses-table-helpers.ts) nearest-visible-neighbour rule, extended to
 * carry that hidden run along as one block rather than stranding it.
 *
 * WHY NOT JUST CALL moveColumnInOrder: that function's own splice - remove
 * at `from`, then `next.splice(target, 0, id)` reusing `target` as computed
 * against the PRE-removal array - is NOT invertible across a hidden column,
 * and this module's own round-trip test (columnOrder.test.ts, "steps back
 * to where it came from") would fail against a verbatim port of it. Concrete
 * counter-example, traced against the real function: order
 * ["d1","d2","d3","d4"] with d2 hidden. moveColumnInOrder(..., "d1", "down")
 * gives ["d2","d3","d1","d4"] - matches this module's own `stepWithinGroup`
 * for the same input, so far so good. But running it AGAIN on that result,
 * moveColumnInOrder(["d2","d3","d1","d4"], ..., "d1", "up") gives
 * ["d2","d1","d3","d4"] - NOT the original ["d1","d2","d3","d4"]. The
 * neighbour it swaps against (d3) is not glued to ITS OWN hidden prefix
 * (d2) the way this module's chunk model requires for the round trip to
 * land back on d1's true starting position. `chunkStartIndex` is exactly
 * the fix: it walks back through d3's own hidden prefix too, so the two
 * neighbouring RUNS (not just their single visible cells) swap as blocks.
 * This is what makes stepWithinGroup its own inverse (right then left
 * restores the exact original order) even across a hidden gap - swapping
 * only the single visible cell and leaving a neighbour's hidden prefix
 * behind does not round-trip. Do not "simplify" this back to a bare
 * moveColumnInOrder port; the counter-example above is exactly what would
 * break. */
function chunkStartIndex(
  columns: readonly ReorderableColumn[],
  groupIdxSet: ReadonlySet<number>,
  rawIdx: number
): number {
  let start = rawIdx;
  while (groupIdxSet.has(start - 1) && !columns[start - 1].visible) start -= 1;
  return start;
}

function moveChunkNextToIndex(
  columns: readonly ReorderableColumn[],
  groupIdxSet: ReadonlySet<number>,
  idx: number,
  neighborRawIdx: number,
  side: "after" | "before"
): ReorderableColumn[] {
  const chunkStart = chunkStartIndex(columns, groupIdxSet, idx);
  const chunk = columns.slice(chunkStart, idx + 1);
  const result = columns.slice();
  result.splice(chunkStart, chunk.length);
  const insertAt =
    side === "after" ? neighborRawIdx - chunk.length + 1 : chunkStartIndex(columns, groupIdxSet, neighborRawIdx);
  result.splice(insertAt, 0, ...chunk);
  return result;
}

/** Moves `id` one VISIBLE slot toward `direction` within its own group
 * (AC4 item 13 / AC1 item 4), splicing past any hidden columns in the way
 * rather than swapping the raw array neighbour. Null when `id` is hidden,
 * unknown, or already at the visible edge of its group (AC4 item 15 - a
 * no-op, never a move into the next group). */
export function stepWithinGroup(
  columns: readonly ReorderableColumn[],
  id: string,
  direction: "left" | "right"
): ReorderableColumn[] | null {
  const idx = columns.findIndex((c) => c.id === id);
  if (idx === -1 || !columns[idx].visible) return null;
  const groupIdx = indicesForGroup(columns, columns[idx].group);
  const groupIdxSet = new Set(groupIdx);
  const visibleRaw = groupIdx.filter((i) => columns[i].visible);
  const pos = visibleRaw.indexOf(idx);
  const neighborPos = direction === "right" ? pos + 1 : pos - 1;
  if (neighborPos < 0 || neighborPos >= visibleRaw.length) return null;
  return moveChunkNextToIndex(columns, groupIdxSet, idx, visibleRaw[neighborPos], direction === "right" ? "after" : "before");
}

/** Moves `id` to the start or end of the VISIBLE columns of its own group
 * (AC3 item 11's "Move to start/end of group" menu commands). Null when
 * already at that visible edge (item 12: presented as unavailable, not a
 * silent no-op). */
export function moveToGroupEdge(
  columns: readonly ReorderableColumn[],
  id: string,
  edge: "start" | "end"
): ReorderableColumn[] | null {
  const idx = columns.findIndex((c) => c.id === id);
  if (idx === -1 || !columns[idx].visible) return null;
  const groupIdx = indicesForGroup(columns, columns[idx].group);
  const groupIdxSet = new Set(groupIdx);
  const visibleRaw = groupIdx.filter((i) => columns[i].visible);
  const pos = visibleRaw.indexOf(idx);

  if (edge === "start") {
    if (pos <= 0) return null;
    return moveChunkNextToIndex(columns, groupIdxSet, idx, visibleRaw[0], "before");
  }
  if (pos === visibleRaw.length - 1) return null;
  return moveChunkNextToIndex(columns, groupIdxSet, idx, visibleRaw[visibleRaw.length - 1], "after");
}

/** Sequential, zero-based sort-key positions for EVERY column in `group`
 * (hidden or not - item 4/AC8 item 39), in `columns`' current order. These
 * are SORT-KEY ASSIGNMENTS, not the wire payload: a TaskCatalogOverride is
 * eight fields (course-tasks-view.ts), and upsertCourseTaskDef(s) writes
 * every column on conflict, so persisting a bare {taskId, position} would
 * blank a task's label, cadence and retired flag (AC2 item 7). The caller
 * merges each assignment onto the task's existing override (or a fresh
 * built-in-derived one) before writing - baseTaskCatalogOverride in
 * course-tasks-view.ts. */
export function groupPositionAssignments(
  columns: readonly ReorderableColumn[],
  group: TaskGroupId
): PositionAssignment[] {
  return columns.filter((c) => c.group === group).map((c, i) => ({ taskId: c.id, position: i }));
}

/** `id`'s 1-based position among the VISIBLE columns of its own group, and
 * that group's visible total (AC5 item 20's "position 4 of 17"). Null for
 * an unknown or HIDDEN id - a hidden column has no perceivable position for
 * a screen-reader announcement to name. */
export function positionWithinGroup(columns: readonly ReorderableColumn[], id: string): GroupPosition | null {
  const target = columns.find((c) => c.id === id);
  if (!target || !target.visible) return null;
  const visibleInGroup = columns.filter((c) => c.group === target.group && c.visible);
  const index = visibleInGroup.findIndex((c) => c.id === id);
  if (index === -1) return null;
  return { index: index + 1, total: visibleInGroup.length };
}

/** AC5 item 19: whether an announcement queued at `nowMs` should flush
 * immediately, given the previous flush happened at `lastFlushMs` (or never,
 * null) - debounced to `intervalMs` (100ms during a drag) so a fast drag's
 * rapid position changes do not spam an assertive live region. Pure: the
 * caller owns the actual timer/ref plumbing (TasksTab.tsx) and is
 * responsible for flushing the final, most-recent text once the interval
 * elapses even if no further change arrives (a trailing-edge flush) - this
 * only answers "has enough time passed to announce right now". */
export function debounceElapsed(lastFlushMs: number | null, nowMs: number, intervalMs = 100): boolean {
  return lastFlushMs === null || nowMs - lastFlushMs >= intervalMs;
}

/** AC4 items 13/15: which way (if any) a keydown on a task header's own
 * button represents a reorder step - Shift+Left/Right only, never a bare
 * arrow (which keeps its existing roving-tabindex meaning) and NEVER Shift
 * combined with Ctrl/Alt/Meta too - Ctrl+Shift+Arrow is a standard OS
 * text-selection chord, and firing a reorder underneath it would fight
 * whatever the OS/browser does with that combination. Extracted so
 * TasksGrid.tsx's header onKeyDown reads as one decision plus a branch, not
 * an inline ternary chain repeated at the one call site that needs it. */
export function shiftArrowDirection(
  shiftKey: boolean,
  key: string,
  ctrlKey: boolean,
  altKey: boolean,
  metaKey: boolean
): "left" | "right" | null {
  if (!shiftKey || ctrlKey || altKey || metaKey) return null;
  if (key === "ArrowLeft") return "left";
  if (key === "ArrowRight") return "right";
  return null;
}

// ---------------------------------------------------------------------------
// Roving-tabindex target after a reorder (AC4 item 17)

export interface FocusKey {
  row: number;
  col: number;
}

/**
 * AC4 item 17: where the roving-tabindex slot (and real DOM focus) belongs
 * after a reorder moves `taskId` - always its header row (-1) at whatever
 * column index it now occupies, or null when the task cannot be found
 * (hidden, retired, or a write that moved it failed and rolled back).
 *
 * DELIBERATELY AN EXPLICIT LOOKUP, not a "figure out from wherever the DOM
 * currently reports focus is" search - an earlier version of this fix
 * (resyncFocusSlot) worked that way and was wrong. React's keyed-list
 * reconciliation for `<th key={task.id}>` moves whichever child has the
 * LOWER old index for any transition; for an adjacent swap [A,B] -> [B,A]
 * that is always A, regardless of which of the two the user thinks they
 * moved. Moving an already-parented, already-focused node is an
 * `insertBefore`, which runs the DOM removal steps FIRST - and removing a
 * node runs the unfocusing steps for a focused inclusive descendant,
 * moving focus to `document.body` before React re-inserts the node
 * elsewhere. `document.body` is never a value in the roving-tabindex
 * registry, so a generic "resync to wherever focus already is" search can
 * never recover from that: it finds no match and does nothing, silently
 * dropping focus out of the grid. The bug is ASYMMETRIC BY DIRECTION (a
 * step that moves the FOCUSED node loses focus; a step that leaves the
 * focused node in place and moves its NEIGHBOUR does not), which is why it
 * survives casual single-direction testing.
 *
 * The fix is to never depend on the DOM telling us where focus went: every
 * route that can trigger a reorder (a keyboard step, a drag drop, a menu
 * command) already knows WHICH task it just moved, at the moment it moves
 * it. TasksGrid.tsx arms a ref with that task id before calling the
 * TasksTab.tsx callback that performs the reorder, and once the resulting
 * `columns` change lands, looks up this function's answer and calls
 * `.focus()` on it directly - unconditionally, never "only if focus looks
 * wrong" - so the outcome does not depend on which element React happened
 * to physically move.
 */
export function focusSlotForTask(colIndexByTaskId: ReadonlyMap<string, number>, taskId: string): FocusKey | null {
  const col = colIndexByTaskId.get(taskId);
  return col === undefined ? null : { row: -1, col };
}
