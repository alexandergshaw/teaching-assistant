// Pure column-model builders for the Tasks grid (AC15 item 85, B1/WCAG
// 2.1.1/2.4.3) - pulled out of TasksGrid.tsx (which sits at a 1000-line hard
// cap) so that file has real headroom rather than a squeeze, the same
// reason useColumnDrag.ts (useColumnDrag.ts:3-11) and gridFocus.ts were
// split out before it. Like gridNavigation.ts and
// gridHeaderAccessibleName.ts, this is PURE - no DOM, no React - so it
// belongs in a plain `.ts` module a real vitest test can exercise (this
// repo's suite runs `environment: "node"`, gridFocus.ts:1-9); see
// gridColumnModel.test.ts. TasksGrid.tsx keeps the `useMemo` wrapping
// itself (memoization is a rendering concern, not a modeling one) and calls
// straight into these.
//
// `GridColumn` is imported as a TYPE ONLY (erased at compile time, unlike
// useColumnDrag.ts's identical `import type { GridColumn }`) - a VALUE
// import from TaskGridRow.tsx would drag its MUI/React/CSS-module graph
// into this module's transitive closure, breaking the "no component, MUI or
// CSS import" property gridColumnModel.test.ts checks for (the same
// property gridFocus.test.ts checks of gridFocus.ts). `groupIdOf`'s own
// one-line body is duplicated inline in buildColumnGroupIds below instead
// of imported, for exactly that reason - TaskGridRow.tsx re-exports it (and
// uses it internally) unchanged.
import type { TaskDefinition, TaskGroupId } from "@/lib/course-tasks";
import type { GridColumn } from "./TaskGridRow";

/**
 * One GridColumn per visible task, or one roll-up per collapsed group (AC15
 * item 85). A group with zero visible tasks contributes nothing at all -
 * AC7 item 37's "does not break the header spans" guarantee. Never mutates
 * `groups`/`tasks`.
 */
export function buildGridColumns(
  groups: { id: TaskGroupId; label: string }[],
  tasks: TaskDefinition[],
  collapsedGroups: ReadonlySet<TaskGroupId>
): GridColumn[] {
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
}

/** AC-A item 251: the group each grid column belongs to, in column order -
 * derived from the same `columns` array the index maps below use, so it
 * cannot drift. Feeds `groupToggleFocusSlot` (gridFocus.ts). Inlines
 * TaskGridRow.tsx's `groupIdOf` (see this file's header comment for why it
 * is not imported). */
export function buildColumnGroupIds(columns: GridColumn[]): TaskGroupId[] {
  return columns.map((c) => (c.kind === "rollup" ? c.groupId : c.task.group));
}

/** Column-index lookups for the two header rows (B1, WCAG 2.1.1/2.4.3): the
 * per-task header button occupies EXACTLY one real column, reusing the same
 * column index the body already assigns via `columns` - this is what lets
 * the header row join the roving-tabindex model as "row -1" instead of
 * forty-plus ungoverned tab stops. The `+ 2` accounts for the two frozen
 * columns (identity, progress) that precede every grid column. */
export function buildColIndexByTaskId(columns: GridColumn[]): Map<string, number> {
  const map = new Map<string, number>();
  columns.forEach((c, i) => {
    if (c.kind === "task") map.set(c.task.id, i + 2);
  });
  return map;
}

/** Same as buildColIndexByTaskId, for a collapsed group's rollup column. */
export function buildColIndexByGroupId(columns: GridColumn[]): Map<TaskGroupId, number> {
  const map = new Map<TaskGroupId, number>();
  columns.forEach((c, i) => {
    if (c.kind === "rollup") map.set(c.groupId, i + 2);
  });
  return map;
}
