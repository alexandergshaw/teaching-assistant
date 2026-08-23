// Real unit tests for the pure eligibility rule extracted out of
// CourseItemsView.tsx (finding 1): unlike courseItemsView.wiring.test.ts,
// which can only regex-match source text because vitest here never renders a
// component, this file calls the functions directly - the only way to
// actually prove a New Quiz id never reaches the rubric/submission-type
// write.
import { describe, it, expect } from "vitest";
import { isOrdinaryAssignmentRow, ordinaryAssignmentSelection } from "./courseItems-eligibility";
import type { RealKindFlagged } from "./courseItems-routing";

describe("isOrdinaryAssignmentRow", () => {
  it("is true for a plain assignment row (no flags set)", () => {
    expect(isOrdinaryAssignmentRow({})).toBe(true);
  });

  it("is false for a New Quiz row", () => {
    expect(isOrdinaryAssignmentRow({ isNewQuiz: true })).toBe(false);
  });

  it("is false for a classic-quiz-shadow row", () => {
    expect(isOrdinaryAssignmentRow({ isClassicQuizShadow: true, shadowQuizId: 55 })).toBe(false);
  });

  it("is false for a graded-discussion-shadow row", () => {
    expect(isOrdinaryAssignmentRow({ isGradedDiscussionShadow: true })).toBe(false);
  });
});

describe("ordinaryAssignmentSelection", () => {
  // FINDING 1's own required proof: a selection containing a New Quiz plus
  // an ordinary assignment must never send the New Quiz's id onward to
  // either write (rubric association, submission-type change).
  it("excludes a New Quiz id from a mixed selection with an ordinary assignment, keeping only the ordinary one", () => {
    const itemsById = new Map<string, RealKindFlagged>([
      ["901", { isNewQuiz: true }],
      ["902", {}],
    ]);
    const { eligible, skipped } = ordinaryAssignmentSelection(["901", "902"], itemsById);
    expect(eligible).toEqual(["902"]);
    expect(eligible).not.toContain("901");
    expect(skipped).toBe(1);
  });

  it("excludes a classic-quiz-shadow id and a graded-discussion-shadow id too, alongside an ordinary assignment", () => {
    const itemsById = new Map<string, RealKindFlagged>([
      ["902", {}],
      ["903", { isClassicQuizShadow: true, shadowQuizId: 55 }],
      ["904", { isGradedDiscussionShadow: true }],
    ]);
    const { eligible, skipped } = ordinaryAssignmentSelection(["902", "903", "904"], itemsById);
    expect(eligible).toEqual(["902"]);
    expect(skipped).toBe(2);
  });

  it("skips (never guesses at) an id with no matching entry in itemsById", () => {
    const itemsById = new Map<string, RealKindFlagged>([["902", {}]]);
    const { eligible, skipped } = ordinaryAssignmentSelection(["902", "vanished"], itemsById);
    expect(eligible).toEqual(["902"]);
    expect(skipped).toBe(1);
  });

  it("returns every id with zero skipped when the whole selection is ordinary assignments", () => {
    const itemsById = new Map<string, RealKindFlagged>([
      ["1", {}],
      ["2", {}],
    ]);
    const { eligible, skipped } = ordinaryAssignmentSelection(["1", "2"], itemsById);
    expect(eligible.sort()).toEqual(["1", "2"]);
    expect(skipped).toBe(0);
  });

  it("returns an empty eligible list with everything skipped when nothing in the selection is ordinary", () => {
    const itemsById = new Map<string, RealKindFlagged>([["901", { isNewQuiz: true }]]);
    const { eligible, skipped } = ordinaryAssignmentSelection(["901"], itemsById);
    expect(eligible).toEqual([]);
    expect(skipped).toBe(1);
  });

  it("returns an empty eligible list with nothing skipped for an empty selection", () => {
    const { eligible, skipped } = ordinaryAssignmentSelection([], new Map());
    expect(eligible).toEqual([]);
    expect(skipped).toBe(0);
  });
});
