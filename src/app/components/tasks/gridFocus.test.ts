// TDD contract for the Tasks grid's post-toggle focus decision -
// docs/tasks-group-toggle-focus-acceptance-criteria.md items 250-254. Written
// from the acceptance criteria BEFORE the implementation exists.
//
// This suite exists because the grid itself cannot be tested: this repo's
// vitest runs environment "node", so there is no DOM to render a <table> into
// and no way to observe a real tab order. The arithmetic is therefore pulled
// out into a pure helper and pinned here, so the untestable remainder is
// reduced to "call it, and focus the element it names".
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TaskGroupId } from "@/lib/course-tasks";
import { groupToggleFocusSlot } from "./gridFocus";

// Two frozen columns (identity, progress) precede every grid column, so the
// first grid column is col 2. This mirrors colIndexByTaskId/colIndexByGroupId
// in TasksGrid.tsx, which are both `i + 2` over the same `columns` array.
const FROZEN_COLS = 2;

/** A Term Setup layout: "dependent" expanded over three task columns, then
 * "independent" expanded over two. Column order is group order. */
const EXPANDED: TaskGroupId[] = ["dependent", "dependent", "dependent", "independent", "independent"];

/** The same layout with "dependent" collapsed: its three task columns are
 * replaced by ONE rollup column, in the same starting position. */
const DEPENDENT_COLLAPSED: TaskGroupId[] = ["dependent", "independent", "independent"];

describe("groupToggleFocusSlot", () => {
  it("moves the band button's row -2 to row -1, where the rollup that replaces it lives", () => {
    // The reported bug: collapsing from row -2 left the slot at (-2, col),
    // which ceases to exist, leaving the whole grid untabbable.
    expect(groupToggleFocusSlot(EXPANDED, "dependent", -2)).toEqual({ row: -1, col: FROZEN_COLS });
  });

  it("keeps the header rollup's own row when expanding from row -1", () => {
    expect(groupToggleFocusSlot(DEPENDENT_COLLAPSED, "dependent", -1)).toEqual({ row: -1, col: FROZEN_COLS });
  });

  it("keeps a body row when a rollup CELL in that row is expanded", () => {
    // A body rollup cell is the third activation point. Its slot survives the
    // toggle (the group's first task cell lands on the same column), so the
    // row must pass through unchanged rather than being pulled to the header.
    expect(groupToggleFocusSlot(DEPENDENT_COLLAPSED, "dependent", 0)).toEqual({ row: 0, col: FROZEN_COLS });
    expect(groupToggleFocusSlot(DEPENDENT_COLLAPSED, "dependent", 7)).toEqual({ row: 7, col: FROZEN_COLS });
  });

  it("targets the column the group STARTS at, not the first column of the table", () => {
    // "independent" begins after three "dependent" columns, so its first
    // column is index 3, which is col 5 once the two frozen columns are
    // counted. A helper that ignored preceding groups would return col 2 and
    // pass every test above.
    expect(groupToggleFocusSlot(EXPANDED, "independent", -2)).toEqual({ row: -1, col: FROZEN_COLS + 3 });
  });

  it("uses the SAME column for a group whether IT is expanded or collapsed", () => {
    // The load-bearing fact: a group's starting index does not depend on its
    // own collapse state, because the columns before it are unchanged. This is
    // what lets the caller compute the target before the toggle re-renders.
    //
    // Deliberately asserted on "independent" - the SECOND group. Using the
    // first group would prove nothing: its index is trivially 2 in every
    // layout, so a helper that always returned 2 would pass. And both sides
    // are compared against a literal rather than against each other, because
    // `a?.col === b?.col` is satisfied by `undefined === undefined` when the
    // helper returns null for both.
    const independentExpanded: TaskGroupId[] = ["dependent", "dependent", "dependent", "independent", "independent"];
    const independentCollapsed: TaskGroupId[] = ["dependent", "dependent", "dependent", "independent"];
    expect(groupToggleFocusSlot(independentExpanded, "independent", -2)).toEqual({ row: -1, col: FROZEN_COLS + 3 });
    expect(groupToggleFocusSlot(independentCollapsed, "independent", -1)).toEqual({ row: -1, col: FROZEN_COLS + 3 });
  });

  it("does shift a group's column when a PRECEDING group toggles", () => {
    // The other half of the arithmetic, and NOT a contradiction of the test
    // above: collapsing an earlier group really does move every later group
    // left (REGRESSION #233 check 14 says so). The fix is safe because the
    // target is always recomputed from the layout in hand, never cached.
    const dependentCollapsed: TaskGroupId[] = ["dependent", "independent", "independent"];
    const dependentExpanded: TaskGroupId[] = ["dependent", "dependent", "dependent", "independent", "independent"];
    expect(groupToggleFocusSlot(dependentCollapsed, "independent", -1)).toEqual({ row: -1, col: FROZEN_COLS + 1 });
    expect(groupToggleFocusSlot(dependentExpanded, "independent", -1)).toEqual({ row: -1, col: FROZEN_COLS + 3 });
  });

  it("names a column that is still in range in the layout that FOLLOWS the toggle", () => {
    // The safety property the whole fix rests on and that nothing else pins:
    // the target must survive the post-toggle render-time clamp
    // `Math.min(focus.col, totalCols - 1)` in TasksGrid.tsx. Collapsing three
    // task columns into one rollup shrinks the table; the target must still
    // point inside it.
    const before: TaskGroupId[] = ["dependent", "dependent", "dependent", "independent", "independent"];
    const after: TaskGroupId[] = ["dependent", "independent", "independent"];
    const slot = groupToggleFocusSlot(before, "dependent", -2);
    expect(slot).not.toBeNull();
    expect(slot!.col).toBeLessThanOrEqual(FROZEN_COLS + after.length - 1);
    // ...and the same for the last group, where the bound is tightest.
    const lastBefore: TaskGroupId[] = ["dependent", "independent", "independent"];
    const lastAfter: TaskGroupId[] = ["dependent", "independent"];
    const lastSlot = groupToggleFocusSlot(lastBefore, "independent", -2);
    expect(lastSlot!.col).toBeLessThanOrEqual(FROZEN_COLS + lastAfter.length - 1);
  });

  it("works for the Daily/Weekly sub-view's groups too", () => {
    const recurring: TaskGroupId[] = ["daily", "daily", "weekly"];
    expect(groupToggleFocusSlot(recurring, "daily", -2)).toEqual({ row: -1, col: FROZEN_COLS });
    expect(groupToggleFocusSlot(recurring, "weekly", -2)).toEqual({ row: -1, col: FROZEN_COLS + 2 });
  });

  it("returns null for a group that contributes no columns, rather than guessing", () => {
    // Every task in the group hidden via the Columns chooser: the group renders
    // nothing at all, so there is no slot to move to and the caller must do
    // nothing. A helper returning col 2 here would send focus into a different
    // group's header.
    expect(groupToggleFocusSlot(EXPANDED, "daily", -2)).toBeNull();
    expect(groupToggleFocusSlot([], "dependent", -2)).toBeNull();
  });

  it("never throws on input a corrupted persisted state can actually produce", () => {
    // Not a redundant restatement of the null case above: the collapsed-group
    // list is read back from localStorage and filtered only by
    // `typeof x === "string"` (tasksUiState.ts), so an arbitrary string really
    // can reach this helper as a group id.
    expect(groupToggleFocusSlot(EXPANDED, "not-a-group" as TaskGroupId, -1)).toBeNull();
    expect(() => groupToggleFocusSlot(EXPANDED, "" as TaskGroupId, -1)).not.toThrow();
    expect(groupToggleFocusSlot(EXPANDED, "" as TaskGroupId, -1)).toBeNull();
  });

  it("does not mutate the layout it is given", () => {
    const layout: TaskGroupId[] = [...EXPANDED];
    // Assert the call did something first - "nothing was mutated" is trivially
    // true of a helper that returns null and touches nothing.
    expect(groupToggleFocusSlot(layout, "independent", -2)).toEqual({ row: -1, col: FROZEN_COLS + 3 });
    expect(layout).toEqual(EXPANDED);
  });

  it("stays a pure module - no component, MUI or CSS import", () => {
    // Item 251 is a constraint on the SOURCE, and importing the module cannot
    // check it: vitest transforms .tsx and MUI imports quite happily under
    // environment "node" - only rendering fails. So read the file.
    const source = readFileSync(new URL("./gridFocus.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["'](\.\/[A-Z]|@mui|[^"']*\.module\.css)/);
  });
});
