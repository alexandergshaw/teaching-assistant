// Additional coverage beyond the TDD suite (columnOrder.test.ts).
//
// focusSlotForTask is the pure decision behind the AC4 item 17 fix: after a
// reorder moves a task, TasksGrid.tsx needs to know which (row, col) to
// call .focus() on. This REPLACES an earlier version (resyncFocusSlot) that
// tried to infer the target from "wherever the DOM currently reports focus
// is" - provably wrong, since React's keyed-list reconciliation can blur
// the moved node to document.body mid-move, and body is never a value in
// the roving-tabindex registry a DOM-inspecting search could find. This
// version sidesteps that: every caller already knows WHICH task it just
// moved, so this is a direct lookup, not a search.
import { describe, it, expect } from "vitest";
import { focusSlotForTask, shiftArrowDirection } from "./columnOrder";

describe("focusSlotForTask", () => {
  it("returns the task's header row (-1) at its current column index", () => {
    const colIndexByTaskId = new Map([
      ["d1", 2],
      ["d2", 3],
      ["d3", 4],
    ]);
    expect(focusSlotForTask(colIndexByTaskId, "d2")).toEqual({ row: -1, col: 3 });
  });

  it("finds a task at its NEW index after a reorder changed the map", () => {
    // The exact scenario the fix exists for: d1 moved from col 2 to col 4.
    const before = new Map([
      ["d1", 2],
      ["d2", 3],
      ["d3", 4],
    ]);
    const after = new Map([
      ["d2", 2],
      ["d3", 3],
      ["d1", 4],
    ]);
    expect(focusSlotForTask(before, "d1")).toEqual({ row: -1, col: 2 });
    expect(focusSlotForTask(after, "d1")).toEqual({ row: -1, col: 4 });
  });

  it("returns null for a task not in the map (hidden, retired, or a rolled-back write)", () => {
    const colIndexByTaskId = new Map([["d1", 2]]);
    expect(focusSlotForTask(colIndexByTaskId, "ghost")).toBeNull();
  });

  it("does not depend on document.activeElement or any DOM state at all", () => {
    // Unlike the resyncFocusSlot it replaces, this never returns null just
    // because nothing (or the wrong thing) currently holds DOM focus - it
    // answers "where IS this task", full stop, given only the lookup.
    const colIndexByTaskId = new Map([["d1", 5]]);
    expect(focusSlotForTask(colIndexByTaskId, "d1")).toEqual({ row: -1, col: 5 });
  });

  it("does not mutate the map it is given", () => {
    const colIndexByTaskId = new Map([["d1", 2]]);
    const snapshot = new Map(colIndexByTaskId);
    focusSlotForTask(colIndexByTaskId, "d1");
    expect(colIndexByTaskId).toEqual(snapshot);
  });
});

// shiftArrowDirection's modifier-key fix: Ctrl+Shift+Arrow is a standard OS
// text-selection chord and must not also trigger a column reorder.
describe("shiftArrowDirection (Ctrl/Alt/Meta rejection)", () => {
  it("still accepts a plain Shift+Left/Right", () => {
    expect(shiftArrowDirection(true, "ArrowLeft", false, false, false)).toBe("left");
    expect(shiftArrowDirection(true, "ArrowRight", false, false, false)).toBe("right");
  });

  it("rejects Ctrl+Shift+Arrow", () => {
    expect(shiftArrowDirection(true, "ArrowLeft", true, false, false)).toBeNull();
    expect(shiftArrowDirection(true, "ArrowRight", true, false, false)).toBeNull();
  });

  it("rejects Alt+Shift+Arrow", () => {
    expect(shiftArrowDirection(true, "ArrowLeft", false, true, false)).toBeNull();
  });

  it("rejects Meta+Shift+Arrow", () => {
    expect(shiftArrowDirection(true, "ArrowRight", false, false, true)).toBeNull();
  });

  it("still rejects a bare arrow with no Shift at all", () => {
    expect(shiftArrowDirection(false, "ArrowLeft", false, false, false)).toBeNull();
  });
});
