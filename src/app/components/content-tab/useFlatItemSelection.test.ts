import { describe, expect, it } from "vitest";
import {
  allVisibleSelected,
  mergeOrClearVisible,
  pruneSelection,
  toggleSelected,
} from "./useFlatItemSelection";

// vitest here is node-env and collects only src/**/*.test.ts, so nothing in
// this suite is ever rendered - the hook itself (useFlatItemSelection) is
// exercised only through the pure functions it is built from, per this
// repo's own instruction that a hook's selection/pruning logic must be
// extracted into pure functions that can actually be called and asserted on,
// rather than writing a test that only appears to cover it.

describe("toggleSelected", () => {
  it("adds an id that isn't selected yet", () => {
    const selected = new Set<string>();
    const next = toggleSelected(selected, "1");
    expect(next).toEqual(new Set(["1"]));
  });

  it("removes an id that is already selected", () => {
    const selected = new Set(["1", "2"]);
    const next = toggleSelected(selected, "1");
    expect(next).toEqual(new Set(["2"]));
  });

  it("always returns a new Set reference, even though selection is not the caller's concern here", () => {
    const selected = new Set(["1"]);
    const next = toggleSelected(selected, "2");
    expect(next).not.toBe(selected);
  });
});

describe("allVisibleSelected", () => {
  it("is true when every visible id is selected", () => {
    const selected = new Set(["1", "2", "3"]);
    expect(allVisibleSelected(selected, ["1", "2"])).toBe(true);
  });

  it("is false when at least one visible id is not selected", () => {
    const selected = new Set(["1"]);
    expect(allVisibleSelected(selected, ["1", "2"])).toBe(false);
  });

  it("is false for an empty visible list - nothing to select all of", () => {
    const selected = new Set(["1"]);
    expect(allVisibleSelected(selected, [])).toBe(false);
  });
});

describe("mergeOrClearVisible", () => {
  it("selects every visible id when not all of them are selected yet (A4)", () => {
    const selected = new Set<string>();
    const next = mergeOrClearVisible(selected, ["1", "2"]);
    expect(next).toEqual(new Set(["1", "2"]));
  });

  it("unselects every visible id when all of them are already selected", () => {
    const selected = new Set(["1", "2"]);
    const next = mergeOrClearVisible(selected, ["1", "2"]);
    expect(next).toEqual(new Set());
  });

  it("leaves a selection outside the visible set untouched either way (A4's own rule)", () => {
    // Selecting: id "9" (outside the filter) must survive.
    const selectedBefore = new Set(["9"]);
    const selectAll = mergeOrClearVisible(selectedBefore, ["1", "2"]);
    expect(selectAll).toEqual(new Set(["9", "1", "2"]));

    // Clearing: id "9" must still survive even though "1"/"2" are the only
    // ones being unmerged.
    const clearAll = mergeOrClearVisible(selectAll, ["1", "2"]);
    expect(clearAll).toEqual(new Set(["9"]));
  });
});

describe("pruneSelection", () => {
  it("drops a selected id that no longer exists in the current list (A5)", () => {
    const selected = new Set(["1", "2"]);
    const next = pruneSelection(selected, ["2"]);
    expect(next).toEqual(new Set(["2"]));
  });

  it("returns the exact same Set reference (no-op) when nothing needed pruning", () => {
    const selected = new Set(["1"]);
    const next = pruneSelection(selected, ["1", "2"]);
    expect(next).toBe(selected);
  });

  it("returns the exact same Set reference for an already-empty selection", () => {
    const selected = new Set<string>();
    const next = pruneSelection(selected, []);
    expect(next).toBe(selected);
  });

  it("drops every id when the current list has shrunk to nothing", () => {
    const selected = new Set(["1", "2", "3"]);
    const next = pruneSelection(selected, []);
    expect(next.size).toBe(0);
  });
});
