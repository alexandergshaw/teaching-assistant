// Real unit tests for the pure write-routing rules extracted out of
// CourseItemsView.tsx (finding 6): unlike courseItemsView.wiring.test.ts,
// which can only regex-match source text because vitest here never renders a
// component, this file calls the functions directly.
import { describe, it, expect } from "vitest";
import { effectiveKindOf, groupSelectedByEffectiveKind, type NewQuizFlagged } from "./courseItems-routing";

describe("effectiveKindOf", () => {
  it("routes a New Quiz row to Assignment from the Quiz tab (D1)", () => {
    const item: NewQuizFlagged = { isNewQuiz: true };
    expect(effectiveKindOf(item, "Quiz")).toBe("Assignment");
  });

  it("routes a Classic quiz row (no isNewQuiz flag) to Quiz from the Quiz tab", () => {
    const item: NewQuizFlagged = {};
    expect(effectiveKindOf(item, "Quiz")).toBe("Quiz");
  });

  it("routes an ordinary assignment row to Assignment from the Assignment tab", () => {
    const item: NewQuizFlagged = {};
    expect(effectiveKindOf(item, "Assignment")).toBe("Assignment");
  });

  it("never routes a New Quiz row to Quiz, even when isNewQuiz is explicitly false", () => {
    const item: NewQuizFlagged = { isNewQuiz: false };
    expect(effectiveKindOf(item, "Quiz")).toBe("Quiz");
  });
});

describe("groupSelectedByEffectiveKind", () => {
  it("splits a mixed selection (Classic quiz + New Quiz + plain assignment) into exactly the right groups, with no overlap and no dropped ids", () => {
    const itemsById = new Map<string, NewQuizFlagged>([
      ["classic-1", {}],
      ["classic-2", { isNewQuiz: false }],
      ["newquiz-1", { isNewQuiz: true }],
      ["newquiz-2", { isNewQuiz: true }],
    ]);
    const groups = groupSelectedByEffectiveKind(
      ["classic-1", "classic-2", "newquiz-1", "newquiz-2"],
      itemsById,
      "Quiz"
    );
    expect(groups.Quiz.sort()).toEqual(["classic-1", "classic-2"]);
    expect(groups.Assignment.sort()).toEqual(["newquiz-1", "newquiz-2"]);
    // No overlap: no id appears in both groups.
    const overlap = groups.Assignment.filter((id) => groups.Quiz.includes(id));
    expect(overlap).toEqual([]);
    // No dropped ids: every selected id lands in exactly one group.
    expect(groups.Assignment.length + groups.Quiz.length).toBe(4);
  });

  it("collapses to a single group of Assignment ids when kind is Assignment (the Assignments tab never contains a New Quiz row, C3)", () => {
    const itemsById = new Map<string, NewQuizFlagged>([
      ["a-1", {}],
      ["a-2", {}],
    ]);
    const groups = groupSelectedByEffectiveKind(["a-1", "a-2"], itemsById, "Assignment");
    expect(groups.Assignment.sort()).toEqual(["a-1", "a-2"]);
    expect(groups.Quiz).toEqual([]);
  });

  it("silently drops an id with no matching entry in itemsById, rather than guessing at its kind", () => {
    const itemsById = new Map<string, NewQuizFlagged>([["known", {}]]);
    const groups = groupSelectedByEffectiveKind(["known", "vanished"], itemsById, "Quiz");
    expect(groups.Quiz).toEqual(["known"]);
    expect(groups.Assignment).toEqual([]);
  });

  it("returns empty groups for an empty selection", () => {
    const groups = groupSelectedByEffectiveKind([], new Map(), "Quiz");
    expect(groups).toEqual({ Assignment: [], Quiz: [] });
  });
});
