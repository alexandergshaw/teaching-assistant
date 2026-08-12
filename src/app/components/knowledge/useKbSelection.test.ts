import { describe, it, expect } from "vitest";
import type { InstitutionPage } from "@/lib/knowledge-base";
import { toggleSelected, mergeOrClearVisible, pruneSelection } from "./useKbSelection";

// Minimal fixture - only `id` matters to the functions under test here,
// mirroring useModuleSelection.pruning.test.ts's own moduleWith() cast.
function pageWithId(id: string): InstitutionPage {
  return { id } as unknown as InstitutionPage;
}

describe("toggleSelected", () => {
  it("adds an id that is not yet selected", () => {
    const selected = new Set(["a"]);
    expect(toggleSelected(selected, "b")).toEqual(new Set(["a", "b"]));
  });

  it("removes an id that is already selected", () => {
    const selected = new Set(["a", "b"]);
    expect(toggleSelected(selected, "a")).toEqual(new Set(["b"]));
  });

  it("does not mutate the input set", () => {
    const selected = new Set(["a"]);
    toggleSelected(selected, "b");
    expect(selected).toEqual(new Set(["a"]));
  });

  it("always returns a new Set reference", () => {
    const selected = new Set(["a"]);
    expect(toggleSelected(selected, "b")).not.toBe(selected);
  });
});

describe("mergeOrClearVisible", () => {
  it("selects every visible id when none of them are selected yet", () => {
    const selected = new Set<string>();
    expect(mergeOrClearVisible(selected, ["a", "b"])).toEqual(new Set(["a", "b"]));
  });

  it("selects every visible id when only some of them are selected", () => {
    const selected = new Set(["a"]);
    expect(mergeOrClearVisible(selected, ["a", "b"])).toEqual(new Set(["a", "b"]));
  });

  it("deselects every visible id once all of them are already selected", () => {
    const selected = new Set(["a", "b"]);
    expect(mergeOrClearVisible(selected, ["a", "b"])).toEqual(new Set());
  });

  it("merge only touches ids inside visibleIds - a selection outside it (e.g. a collapsed branch) is left alone", () => {
    const selected = new Set(["z"]);
    expect(mergeOrClearVisible(selected, ["a"])).toEqual(new Set(["z", "a"]));
  });

  it("unmerge only touches ids inside visibleIds - an out-of-view selection survives the clear", () => {
    // visibleIds ("a", "b") are fully selected, so this is the unmerge
    // branch; "z" was never part of visibleIds (e.g. it sits inside a
    // collapsed branch, or behind a search filter) and must survive.
    const selected = new Set(["a", "b", "z"]);
    expect(mergeOrClearVisible(selected, ["a", "b"])).toEqual(new Set(["z"]));
  });

  it("is a no-op for an empty visibleIds list", () => {
    const selected = new Set(["a"]);
    expect(mergeOrClearVisible(selected, [])).toEqual(new Set(["a"]));
  });
});

describe("pruneSelection", () => {
  it("drops an id that no longer exists in pages", () => {
    const selected = new Set(["p1", "deleted"]);
    const pages = [pageWithId("p1")];
    expect(pruneSelection(selected, pages)).toEqual(new Set(["p1"]));
  });

  it("keeps every id that still exists, returning the SAME reference (nothing needed pruning)", () => {
    const selected = new Set(["p1", "p2"]);
    const pages = [pageWithId("p1"), pageWithId("p2")];
    expect(pruneSelection(selected, pages)).toBe(selected);
  });

  it("clears everything when the page list belongs to an entirely different institution", () => {
    const selected = new Set(["old-1", "old-2"]);
    const pages = [pageWithId("new-1")];
    expect(pruneSelection(selected, pages).size).toBe(0);
  });

  it("does not prune anything while pages is null (still loading) - same reference back", () => {
    const selected = new Set(["p1"]);
    expect(pruneSelection(selected, null)).toBe(selected);
  });

  it("is a same-reference no-op for an already-empty selection", () => {
    const selected = new Set<string>();
    expect(pruneSelection(selected, [])).toBe(selected);
  });

  it("prunes to empty against a real, loaded, empty page list (distinct from pages === null)", () => {
    const selected = new Set(["p1"]);
    const result = pruneSelection(selected, []);
    expect(result.size).toBe(0);
    expect(result).not.toBe(selected);
  });
});
