// SMOOTH-WALKTHROUGH W1: the three pure run-decision leaves. Every expected
// value below is a hand-written literal (frozen oracle), never derived by
// calling the function under test.

import { describe, it, expect } from "vitest";
import { shouldAutoDraft, isRunComplete, courseToAutoSelect, type AutoDraftState } from "./walkthrough-run-decisions";

function baseline(): AutoDraftState {
  return {
    autoDraftOn: true,
    capturing: false,
    extracting: false,
    pendingFrames: 0,
    hasMaterial: true,
    hasEmptySlot: true,
    savedFormatsState: "loaded",
    alreadyDraftedThisStop: false,
  };
}

describe("shouldAutoDraft", () => {
  it("R0: the baseline (every condition satisfied) is true", () => {
    expect(shouldAutoDraft(baseline())).toBe(true);
  });

  const flips: ReadonlyArray<{ row: string; change: Partial<AutoDraftState> }> = [
    { row: "R1 autoDraftOn off", change: { autoDraftOn: false } },
    { row: "R2 capturing", change: { capturing: true } },
    { row: "R3 extracting", change: { extracting: true } },
    { row: "R4 frames pending", change: { pendingFrames: 3 } },
    { row: "R5 no material", change: { hasMaterial: false } },
    { row: "R6 no empty slot (cannot overwrite a draft)", change: { hasEmptySlot: false } },
    { row: "R7 saved formats loading", change: { savedFormatsState: "loading" } },
    { row: "R8 already drafted this stop", change: { alreadyDraftedThisStop: true } },
  ];
  for (const { row, change } of flips) {
    it(`${row} -> false`, () => {
      expect(shouldAutoDraft({ ...baseline(), ...change })).toBe(false);
    });
  }

  it("a timed-out or failed saved-formats list does not block (only loading does)", () => {
    expect(shouldAutoDraft({ ...baseline(), savedFormatsState: "timedout" })).toBe(true);
    expect(shouldAutoDraft({ ...baseline(), savedFormatsState: "failed" })).toBe(true);
  });

  it("two flips at once stay false (monotonicity spot check)", () => {
    expect(shouldAutoDraft({ ...baseline(), capturing: true, hasEmptySlot: false })).toBe(false);
  });
});

describe("isRunComplete", () => {
  // Emitted shape: a posted slot carries the course NAME string; unposted is null.
  const P = { postedTo: "Course X" };
  const U = { postedTo: null };

  it("C0 [] -> false (length guard; vacuous truth is unrepresentable)", () => {
    expect(isRunComplete([])).toBe(false);
  });
  it("C1 [U] -> false", () => {
    expect(isRunComplete([U])).toBe(false);
  });
  it("C2 [P] -> true", () => {
    expect(isRunComplete([P])).toBe(true);
  });
  it("C3 [P, P] -> true", () => {
    expect(isRunComplete([P, P])).toBe(true);
  });
  it("C4 [P, U] -> false", () => {
    expect(isRunComplete([P, U])).toBe(false);
  });
  it("C5 [U, U] -> false", () => {
    expect(isRunComplete([U, U])).toBe(false);
  });
});

describe("courseToAutoSelect (reading R; row A8 is the owner-routed T-RULING-1)", () => {
  const c1 = { id: "c1" };
  const c2 = { id: "c2" };

  const rows: ReadonlyArray<{ row: string; courses: readonly { id: string }[]; stored: string | null; expected: string | null }> = [
    { row: "A0", courses: [], stored: "", expected: null },
    { row: "A1", courses: [], stored: null, expected: null },
    { row: "A2", courses: [c1], stored: "", expected: "c1" },
    { row: "A3", courses: [c1], stored: null, expected: "c1" },
    { row: "A4", courses: [c1, c2], stored: "", expected: null },
    { row: "A5", courses: [c1, c2], stored: null, expected: null },
    { row: "A6", courses: [c1], stored: "c1", expected: "c1" },
    { row: "A7", courses: [c1, c2], stored: "c1", expected: "c1" },
    { row: "A8 stale stored + one course", courses: [c1], stored: "c2", expected: null },
    { row: "A9", courses: [c1, c2], stored: "c9", expected: null },
  ];
  for (const r of rows) {
    it(`${r.row}`, () => {
      expect(courseToAutoSelect(r.courses, r.stored)).toBe(r.expected);
    });
  }
});
