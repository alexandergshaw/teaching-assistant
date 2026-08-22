import { describe, expect, it } from "vitest";
import { planAssignmentPurgeDeletes, planQuizPurgeDeletes } from "./course-copy-purge";

// Regression: CourseCopyModal's purge path used to hand the WHOLE "Quiz"
// listBulkItems result to bulkDeleteAction(destUrl, "Quiz", ids). Once
// listBulkItems("Quiz") started merging in New Quizzes (LTI-backed
// assignments, flagged isNewQuiz, keyed by their ASSIGNMENT id - see
// src/lib/canvas-modules/bulk.ts), that single call would issue
// DELETE /quizzes/{assignmentId} for every New Quiz row: the wrong Canvas
// resource. These tests pin that a New Quiz row is routed to the assignment
// delete path instead, and that Classic quizzes still go through the quiz
// path unchanged.

describe("planQuizPurgeDeletes", () => {
  it("routes a Classic quiz through the Quiz delete path", () => {
    const plan = planQuizPurgeDeletes([{ id: "55", title: "Classic Quiz" } as never]);
    expect(plan).toEqual([{ kind: "Quiz", ids: ["55"] }]);
  });

  it("routes a New Quiz (isNewQuiz: true) through the Assignment delete path, never Quiz", () => {
    const plan = planQuizPurgeDeletes([{ id: "901", isNewQuiz: true } as never]);
    expect(plan).toEqual([{ kind: "Assignment", ids: ["901"] }]);
    // The regression this pins: no delete call may ever be issued against
    // the quiz endpoint for a New Quiz's (assignment) id.
    const quizCall = plan.find((p) => p.kind === "Quiz");
    expect(quizCall).toBeUndefined();
  });

  it("splits a mixed list: Classic quizzes to Quiz, New Quizzes to Assignment, each id in exactly one group", () => {
    const plan = planQuizPurgeDeletes([
      { id: "55", isNewQuiz: undefined } as never,
      { id: "901", isNewQuiz: true } as never,
      { id: "56", isNewQuiz: undefined } as never,
      { id: "902", isNewQuiz: true } as never,
    ]);
    const quizGroup = plan.find((p) => p.kind === "Quiz");
    const assignmentGroup = plan.find((p) => p.kind === "Assignment");
    expect(quizGroup?.ids.sort()).toEqual(["55", "56"]);
    expect(assignmentGroup?.ids.sort()).toEqual(["901", "902"]);
  });

  it("omits a group entirely when it would be empty (no pointless zero-id delete calls)", () => {
    const allNewQuizzes = planQuizPurgeDeletes([{ id: "901", isNewQuiz: true } as never]);
    expect(allNewQuizzes.some((p) => p.kind === "Quiz")).toBe(false);

    const allClassic = planQuizPurgeDeletes([{ id: "55" } as never]);
    expect(allClassic.some((p) => p.kind === "Assignment")).toBe(false);
  });

  it("returns an empty plan for an empty list", () => {
    expect(planQuizPurgeDeletes([])).toEqual([]);
  });
});

// Finding 5 regression: CourseCopyModal's purge path used to plan the
// "Assignments" and "Quizzes" purge checkboxes as two fully independent loop
// iterations. Once listBulkItems("Assignment") stopped returning New Quizzes
// (C3), ticking ONLY "Assignments" silently stopped purging them at all - they
// survived in the destination course and re-imported as duplicates. These
// tests pin the three required behaviours: "Assignments" alone still purges
// New Quizzes, "Quizzes" alone still does too (unchanged from
// planQuizPurgeDeletes), and ticking BOTH purges each New Quiz exactly once.
describe("planAssignmentPurgeDeletes", () => {
  const assignmentItems = [{ id: "902" }];
  const quizItems = [{ id: "55" }, { id: "901", isNewQuiz: true }];

  it("does nothing when neither purge type is ticked", () => {
    expect(
      planAssignmentPurgeDeletes({ purgeAssignments: false, purgeQuizzes: false, assignmentItems, quizItems })
    ).toEqual([]);
  });

  it("Finding 5: ticking Assignments ALONE still purges New Quizzes, merged with ordinary assignments", () => {
    const plan = planAssignmentPurgeDeletes({
      purgeAssignments: true,
      purgeQuizzes: false,
      assignmentItems,
      quizItems,
    });

    // No Quiz-kind delete at all - "Quizzes" was not ticked, so the Classic
    // quiz (55) must be left alone.
    expect(plan.find((p) => p.kind === "Quiz")).toBeUndefined();
    const assignmentGroup = plan.find((p) => p.kind === "Assignment");
    expect(assignmentGroup?.ids.sort()).toEqual(["901", "902"]);
  });

  it("ticking Quizzes alone still routes Classic quizzes to Quiz and New Quizzes to Assignment (matches planQuizPurgeDeletes)", () => {
    const plan = planAssignmentPurgeDeletes({
      purgeAssignments: false,
      purgeQuizzes: true,
      assignmentItems,
      quizItems,
    });

    expect(plan.find((p) => p.kind === "Quiz")?.ids).toEqual(["55"]);
    expect(plan.find((p) => p.kind === "Assignment")?.ids).toEqual(["901"]);
  });

  it("ticking BOTH purges each New Quiz exactly once - a single merged Assignment delete call, not two", () => {
    const plan = planAssignmentPurgeDeletes({
      purgeAssignments: true,
      purgeQuizzes: true,
      assignmentItems,
      quizItems,
    });

    const assignmentGroups = plan.filter((p) => p.kind === "Assignment");
    expect(assignmentGroups).toHaveLength(1);
    expect(assignmentGroups[0].ids.sort()).toEqual(["901", "902"]);
    // 901 must not appear twice within the merged list either.
    expect(assignmentGroups[0].ids.filter((id) => id === "901")).toHaveLength(1);

    expect(plan.find((p) => p.kind === "Quiz")?.ids).toEqual(["55"]);
  });

  it("omits an Assignment group entirely when it would be empty", () => {
    const plan = planAssignmentPurgeDeletes({
      purgeAssignments: false,
      purgeQuizzes: true,
      assignmentItems: [],
      quizItems: [{ id: "55" }],
    });
    expect(plan).toEqual([{ kind: "Quiz", ids: ["55"] }]);
  });
});

// Finding (REGRESSION.md check 8): listBulkItems("Assignment") now excludes
// Classic-quiz and graded-discussion shadow assignments for EVERY course
// (Finding 1), not only ones with New Quizzes. That silently changed
// CourseCopyModal's DESTRUCTIVE purge path too: ticking "Assignments" alone
// used to also delete a destination course's Classic quizzes and graded
// discussions, because their shadow assignment rows used to be part of the
// "Assignment" list and DELETE /assignments/{shadowId} cascades into
// deleting the quiz/discussion itself. These tests pin the DELIBERATE
// decision (see planAssignmentPurgeDeletes' own comment): that old sweep is
// NOT restored. "Assignments" alone deletes only real Assignment objects
// (ordinary assignments plus New Quizzes, which ARE Assignment objects);
// "Quizzes" is required to delete a Classic quiz; "Discussions" (handled
// entirely outside this file, in CourseCopyModal.tsx's own kindMap loop over
// the Discussion kind and the /discussion_topics endpoint) is required to
// delete a graded discussion.
describe("Finding (REGRESSION.md check 8): checkbox-to-Canvas-object purge semantics are deliberate", () => {
  it("ticking Assignments alone never deletes a Classic quiz, even when one is present in quizItems", () => {
    // quizItems shaped exactly like the real listBulkItems("Quiz") output for
    // a course with one Classic quiz and no New Quizzes: a real quiz id off
    // /quizzes, carrying no isNewQuiz flag at all (bulk.ts never sets one for
    // Classic quizzes) - not a shadow assignment row, which listBulkItems
    // already keeps out of both lists.
    const plan = planAssignmentPurgeDeletes({
      purgeAssignments: true,
      purgeQuizzes: false,
      assignmentItems: [{ id: "902" }],
      quizItems: [{ id: "55" }],
    });

    // No Quiz-kind delete call at all: the Classic quiz must survive.
    expect(plan.find((p) => p.kind === "Quiz")).toBeUndefined();
    // The Assignment-kind delete call must contain only the real assignment,
    // never the Classic quiz's id.
    expect(plan).toEqual([{ kind: "Assignment", ids: ["902"] }]);
  });

  it("ticking Quizzes is what deletes a Classic quiz - Assignments alone cannot reach it", () => {
    const plan = planAssignmentPurgeDeletes({
      purgeAssignments: false,
      purgeQuizzes: true,
      assignmentItems: [],
      quizItems: [{ id: "55" }],
    });
    expect(plan).toEqual([{ kind: "Quiz", ids: ["55"] }]);
  });
});
