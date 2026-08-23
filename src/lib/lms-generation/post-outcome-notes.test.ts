// Direct, in-memory-fixture unit tests for post-outcome-notes.ts's pure
// helpers - extracted from src/app/actions/lms-generation.ts (step-10 fixer
// round). No vi.mock anywhere: every function here is I/O-free.
import { describe, it, expect } from "vitest";
import { harvestPostOutcomeNotes, resolveDiscussionDeadlinesForPost, otherModuleNamesFor } from "./post-outcome-notes";
import type { PostStepOutcome } from "./commit-plan";

function discussionFields() {
  return {
    title: "Introduce Yourself",
    message: "<p>Tell us about yourself.</p>",
    pointsPossible: 20,
    initialPostAt: "2026-09-04T03:59:00.000Z",
    repliesDueAt: "2026-09-07T03:59:00.000Z",
    requiredReplyCount: 2,
    published: false,
    useCheckpoints: false,
    initialPostPoints: 10,
    repliesPoints: 10,
  };
}

describe("harvestPostOutcomeNotes", () => {
  it("returns [] for an empty outcome list", () => {
    expect(harvestPostOutcomeNotes([])).toEqual([]);
  });

  it("returns [] when create-discussion succeeded via the checkpoints path (no detail)", () => {
    const outcomes: PostStepOutcome[] = [{ step: { step: "create-discussion", fields: discussionFields() }, status: "done" }];
    expect(harvestPostOutcomeNotes(outcomes)).toEqual([]);
  });

  it("SABOTAGE TARGET: surfaces the classic-fallback detail when create-discussion succeeded WITH a detail", () => {
    const outcomes: PostStepOutcome[] = [
      { step: { step: "create-discussion", fields: discussionFields() }, status: "done", detail: "Classic fallback reason" },
    ];
    expect(harvestPostOutcomeNotes(outcomes)).toEqual(["Classic fallback reason"]);
  });

  it("ignores a FAILED create-discussion's detail - that belongs to summary.text, not notes", () => {
    const outcomes: PostStepOutcome[] = [
      { step: { step: "create-discussion", fields: discussionFields() }, status: "failed", detail: "Canvas is down" },
    ];
    expect(harvestPostOutcomeNotes(outcomes)).toEqual([]);
  });

  it("ignores a non-discussion step's detail entirely", () => {
    const outcomes: PostStepOutcome[] = [{ step: { step: "create-page", title: "T", body: "b" }, status: "done", detail: "irrelevant" }];
    expect(harvestPostOutcomeNotes(outcomes)).toEqual([]);
  });
});

describe("resolveDiscussionDeadlinesForPost (Finding 1)", () => {
  it("threads the caller's own discussionDeadlines straight through unchanged", () => {
    const input = { initialPostAt: "2026-01-09T04:59:00.000Z", repliesDueAt: "2026-01-12T04:59:00.000Z", note: "N" };
    expect(resolveDiscussionDeadlinesForPost(input)).toEqual({
      deadlines: { initialPostAt: input.initialPostAt, repliesDueAt: input.repliesDueAt },
      note: "N",
    });
  });

  // SABOTAGE TARGET: this is the exact defect Finding 1 fixed - the server
  // used to fall back to computing a REAL instant here (via
  // planIntroDiscussionPost, whose .toISOString() call would run on this
  // server process). Undefined input must always produce EMPTY dates, never
  // a computed one, regardless of what the caller could theoretically have
  // supplied.
  it("SABOTAGE TARGET: undefined input emits empty dates and the fixed 'not supplied' note - never a computed instant", () => {
    expect(resolveDiscussionDeadlinesForPost(undefined)).toEqual({
      deadlines: { initialPostAt: "", repliesDueAt: "" },
      note: "The client did not supply computed deadlines for this discussion, so no due or lock dates were set.",
    });
  });
});

describe("otherModuleNamesFor (researcher finding)", () => {
  const COURSE_MODULES = [
    { id: 10, name: "Module 1" },
    { id: 11, name: "Module 2" },
    { id: 12, name: "Module 3" },
  ];

  it("excludes by IDENTITY when moduleIds is non-empty (the checkmarked-module case)", () => {
    expect(otherModuleNamesFor(COURSE_MODULES, [10], "anything - ignored when moduleIds is non-empty")).toEqual([
      "Module 2",
      "Module 3",
    ]);
  });

  it("SABOTAGE TARGET: excludes the checkmarked module even when moduleLabel is the DEFAULT_MODULE_LABEL fallback (no real name match)", () => {
    // The old, buggy behaviour compared course module names against
    // "the selected material" (DEFAULT_MODULE_LABEL) as a STRING - nothing
    // ever matches that, so the checkmarked module's own name used to leak
    // through. This is the case that pins the fix.
    expect(otherModuleNamesFor(COURSE_MODULES, [10], "the selected material")).toEqual(["Module 2", "Module 3"]);
  });

  it("falls back to a NAME match when moduleIds is empty (the items-only case, W5)", () => {
    expect(otherModuleNamesFor(COURSE_MODULES, [], "Module 1")).toEqual(["Module 2", "Module 3"]);
  });

  it("excludes nothing when moduleIds is empty and moduleLabel matches no real module name", () => {
    expect(otherModuleNamesFor(COURSE_MODULES, [], "the selected material")).toEqual(["Module 1", "Module 2", "Module 3"]);
  });
});
