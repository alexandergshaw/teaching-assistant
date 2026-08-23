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
  // FINDING 2 FIX: this fixture used to be `assignmentItems = [{ id: "902" }]`
  // - a shape listBulkItems("Assignment") no longer emits now that bulk.ts's
  // bug fix stopped excluding New Quizzes from the Assignment listing (a New
  // Quiz IS a real Assignment object, so it appears in BOTH `assignmentItems`
  // and `quizItems` now, exactly like `901` below - see bulk.ts's own "may
  // legitimately appear in both tabs now" tests). That stale fixture was WHY
  // the "901 must not appear twice" assertion further down used to pass even
  // while the double-delete bug it was meant to catch was live: with only
  // one item in `assignmentItems` (and it not being the New Quiz), the old,
  // unfiltered `realAssignmentItems` could never actually produce the
  // duplicate. Restoring the real shape here - a New Quiz id present in BOTH
  // lists, the way Canvas's own data genuinely looks - is what makes these
  // tests actually exercise the fix (see course-copy-purge.ts's own
  // `!i.isNewQuiz` filter and its header comment for the corrected logic).
  const assignmentItems = [{ id: "902" }, { id: "901", isNewQuiz: true }];
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

// Finding (REGRESSION.md check 8): listBulkItems("Assignment") now INCLUDES
// (no longer excludes) Classic-quiz and graded-discussion shadow assignments
// for EVERY course (Finding 1's bug fix, bulk.ts), not only ones with New
// Quizzes. That silently changed CourseCopyModal's DESTRUCTIVE purge path
// too: ticking "Assignments" alone used to also delete a destination
// course's Classic quizzes and graded discussions, because their shadow
// assignment rows used to be part of the
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

// BUG FIX UPDATE (live report 2026-08-22): listBulkItems("Assignment") no
// longer excludes classic-quiz and graded-discussion shadow assignment rows
// from its OWN output (the Assignments tab must show them too, labelled -
// bulk.ts's own header) - so `assignmentItems` passed into this function can
// now legitimately contain both. These tests pin that the exclusion
// enforcing "Assignments alone never deletes a quiz or discussion" is now
// done EXPLICITLY inside planAssignmentPurgeDeletes itself (filtering by the
// row's own isClassicQuizShadow/isGradedDiscussionShadow flag), never
// inherited from the listing having already left them out.
describe("planAssignmentPurgeDeletes filters shadow rows out of assignmentItems itself, explicitly (A4)", () => {
  it("a classic-quiz-shadow row present in assignmentItems is excluded from the Assignment delete set even when ticking Assignments alone", () => {
    const plan = planAssignmentPurgeDeletes({
      purgeAssignments: true,
      purgeQuizzes: false,
      assignmentItems: [{ id: "902" }, { id: "903", isClassicQuizShadow: true }],
      quizItems: [],
    });
    expect(plan).toEqual([{ kind: "Assignment", ids: ["902"] }]);
  });

  it("a graded-discussion-shadow row present in assignmentItems is excluded from the Assignment delete set even when ticking Assignments alone", () => {
    const plan = planAssignmentPurgeDeletes({
      purgeAssignments: true,
      purgeQuizzes: false,
      assignmentItems: [{ id: "902" }, { id: "904", isGradedDiscussionShadow: true }],
      quizItems: [],
    });
    expect(plan).toEqual([{ kind: "Assignment", ids: ["902"] }]);
  });

  it("both shadow kinds are excluded together, alongside a New Quiz (from quizItems) which IS still included, and ticking Quizzes too still never deletes the shadow rows by the assignment id", () => {
    const plan = planAssignmentPurgeDeletes({
      purgeAssignments: true,
      purgeQuizzes: true,
      assignmentItems: [
        { id: "902" },
        { id: "903", isClassicQuizShadow: true },
        { id: "904", isGradedDiscussionShadow: true },
      ],
      quizItems: [{ id: "55" }, { id: "901", isNewQuiz: true }],
    });
    const assignmentGroup = plan.find((p) => p.kind === "Assignment");
    // Ordinary assignment (902) plus the New Quiz (901, from quizItems) -
    // never 903 or 904, the two shadow assignment ids.
    expect(assignmentGroup?.ids.sort()).toEqual(["901", "902"]);
    expect(assignmentGroup?.ids).not.toContain("903");
    expect(assignmentGroup?.ids).not.toContain("904");
    // The Classic quiz is deleted through its own id, via the Quiz group.
    expect(plan.find((p) => p.kind === "Quiz")?.ids).toEqual(["55"]);
  });

  it("SABOTAGE CHECK: an id collision between a shadow assignment (Assignment:42) and an unrelated quiz (Quiz:42) never cross-matches - the shadow row is still excluded purely by its own flag, never by its numeric id", () => {
    const plan = planAssignmentPurgeDeletes({
      purgeAssignments: true,
      purgeQuizzes: true,
      assignmentItems: [{ id: "42", isClassicQuizShadow: true }],
      quizItems: [{ id: "42" }],
    });
    // The shadow assignment (Assignment:42) must never appear in the
    // Assignment delete group - only the quiz's own id (Quiz:42) is deleted,
    // through the Quiz group.
    expect(plan.find((p) => p.kind === "Assignment")).toBeUndefined();
    expect(plan).toEqual([{ kind: "Quiz", ids: ["42"] }]);
  });
});
