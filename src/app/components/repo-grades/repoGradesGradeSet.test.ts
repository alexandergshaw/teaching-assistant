// RG-SEARCH-STICKY Wave C: frozen oracles for toggleRepoInGradeSet (T1-T4) and
// resolveGradeScope (G1-G4), hand-authored from
// docs/repo-grades-wave-c-test-notes.md sections 4-5.
import { describe, it, expect } from "vitest";
import { resolveGradeScope, toggleRepoInGradeSet } from "./repoGradesGradeSet";

describe("toggleRepoInGradeSet", () => {
  it("T1: adds an absent repo", () => {
    expect(Array.from(toggleRepoInGradeSet(new Set(["a"]), "b")).sort()).toEqual(["a", "b"]);
  });

  it("T2: removes a present repo", () => {
    expect(Array.from(toggleRepoInGradeSet(new Set(["a"]), "a"))).toEqual([]);
  });

  it("T3: never mutates the input", () => {
    const input = new Set(["a"]);
    const before = Array.from(input).sort();
    toggleRepoInGradeSet(input, "b");
    expect(Array.from(input).sort()).toEqual(before);
  });

  it("T4: returns a new Set object", () => {
    const input = new Set(["a"]);
    expect(toggleRepoInGradeSet(input, "b")).not.toBe(input);
  });
});

describe("resolveGradeScope", () => {
  const TWO = new Set(["a", "b"]);
  const ROWS: Array<[string, ReadonlySet<string>, boolean, boolean, boolean]> = [
    ["G1 empty set, toggle off", new Set<string>(), false, false, false],
    ["G2 empty set, toggle on", new Set<string>(), true, true, false],
    ["G3 selection, toggle off (F3-c core)", TWO, false, true, true],
    ["G4 selection, toggle on", TWO, true, true, true],
  ];
  for (const [name, selected, toggle, selectionOnly, scopedToSelection] of ROWS) {
    it(name, () => {
      expect(resolveGradeScope(selected, toggle)).toEqual({ selectionOnly, scopedToSelection });
    });
  }
});
