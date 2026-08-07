// Pure decision for the Tasks grid's roving-tabindex slot after a group's
// collapse/expand toggle - docs/tasks-group-toggle-focus-acceptance-criteria.md
// items 250-254. Pulled out of TasksGrid.tsx on purpose: this repo's vitest
// runs `environment: "node"` and only collects `src/**/*.test.ts`, so a
// module that never imports a component, MUI, or a CSS module is the only
// part of this fix a real test can exercise (see gridFocus.test.ts). The
// grid itself - the layout effect, the ref lookup, the `.focus()` call, and
// the resulting tab order - stays outside that boundary and is verified by
// reading, not by this file.
import type { TaskGroupId } from "@/lib/course-tasks";

/** Two frozen columns (identity, progress) precede every grid column - the
 * same `+ 2` `colIndexByTaskId`/`colIndexByGroupId`/`totalCols` already use
 * in TasksGrid.tsx (item 252). */
const FROZEN_COLS = 2;

export interface GridFocusSlot {
  row: number;
  col: number;
}

/**
 * Returns the `{row, col}` the roving-tabindex slot must hold after
 * `groupId` is toggled, or `null` when that group contributes no columns -
 * an unknown id, or one whose only visible tasks were hidden (item 254).
 * Never throws.
 *
 * `columnGroupIds` is the group each grid column belongs to, in column
 * order, in the layout BEFORE the toggle (item 251) - a rollup contributes
 * its own group id, a task column its task's group. The caller derives it
 * from the same `columns` array `colIndexByTaskId`/`colIndexByGroupId` use,
 * via the exported `groupIdOf` (TaskGridRow.tsx).
 *
 * `activatedRow` is the row the toggle was activated from. It is passed
 * through unchanged EXCEPT row -2, which becomes -1: the band button's own
 * row does not survive its own group collapsing, and the rollup that
 * replaces it lives at row -1 (item 253). This function does not validate
 * `activatedRow` against a row count - that is the caller's render-time
 * clamp's job.
 *
 * Never mutates `columnGroupIds`.
 */
export function groupToggleFocusSlot(
  columnGroupIds: readonly TaskGroupId[],
  groupId: TaskGroupId,
  activatedRow: number
): GridFocusSlot | null {
  const firstIndex = columnGroupIds.indexOf(groupId);
  if (firstIndex === -1) return null;

  return {
    row: activatedRow === -2 ? -1 : activatedRow,
    col: firstIndex + FROZEN_COLS,
  };
}
