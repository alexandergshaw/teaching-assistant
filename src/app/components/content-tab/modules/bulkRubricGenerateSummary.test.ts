// docs/rubric-bulk-action-acceptance-criteria.md, chunk H, agent 2B's slice
// (AC4/AC5) - "Generate & associate rubric"'s pure summarisation core
// (extracted out of useBulkItemActions.ts, which was at 999 of this repo's
// 1000-line ceiling, into ./bulkRubricGenerateSummary.ts - see that file's
// own header for why the move is safe and what stayed behind).
//
// vitest here is node-env and renders NO component (this repo's own
// "vitest is node-env... no component is ever rendered" note, e.g.
// useCarryModulePattern.test.ts's identical header) - a hook's own
// useState/useEffect closures cannot be invoked outside a React render, so
// this file exercises the three PURE functions directly. The wiring itself
// (that the hook's real onClick handler calls the real server action, never
// a stand-in) is proved separately, by reading useBulkItemActions.ts's own
// source text - see useBulkItemActions.test.ts.
//
// Fixtures below use the REAL RubricTargetOutcome/OrphanRubric union types
// imported from src/app/actions/rubric-bulk.ts (this repo's own "fixtures
// must match the emitted shape" lesson) rather than a hand-rolled shape that
// merely looks similar.
import { describe, it, expect } from "vitest";
import type { OrphanRubric, RubricTargetOutcome } from "@/app/actions/rubric-bulk";
import {
  buildRubricGenerationInstructions,
  classifyAssignmentDetailFetch,
  detailFetchFailureOutcome,
  mapWithConcurrency,
  summarizeRubricGenerateOutcomes,
  describeRubricGenerateNote,
  type BulkRubricGenerateReport,
} from "./bulkRubricGenerateSummary";

// ---------------------------------------------------------------------------
// buildRubricGenerationInstructions

describe("buildRubricGenerationInstructions", () => {
  it("joins non-empty title+description parts with a blank line between them", () => {
    const result = buildRubricGenerationInstructions(["Essay 1\nWrite about X", "Essay 2\nWrite about Y"]);
    expect(result).toBe("Essay 1\nWrite about X\n\nEssay 2\nWrite about Y");
  });

  it("drops parts that are blank or whitespace-only", () => {
    const result = buildRubricGenerationInstructions(["Essay 1\nReal text", "   ", ""]);
    expect(result).toBe("Essay 1\nReal text");
  });

  it("falls back to a generic instruction when every part is empty (e.g. no eligible assignment had a description)", () => {
    const result = buildRubricGenerationInstructions([]);
    expect(result).toMatch(/general-purpose grading rubric/i);
  });

  it("falls back to the same generic instruction when parts is non-empty but entirely blank", () => {
    expect(buildRubricGenerationInstructions(["", "   "])).toMatch(/general-purpose grading rubric/i);
  });
});

// ---------------------------------------------------------------------------
// classifyAssignmentDetailFetch / detailFetchFailureOutcome - C3: a failed
// per-item detail fetch must never be read as "no existing rubric".

describe("classifyAssignmentDetailFetch (C3: a failed fetch is never 'no existing rubric')", () => {
  it("reads a successful detail fetch's rubricId and description straight through", () => {
    const result = classifyAssignmentDetailFetch("m1:i1", { detail: { description: "Write an essay.", rubricId: 42 } });
    expect(result).toEqual({ key: "m1:i1", status: "ok", existingRubricId: 42, description: "Write an essay." });
  });

  it("treats a detail fetch with no rubric on the assignment as ok, with existingRubricId undefined", () => {
    const result = classifyAssignmentDetailFetch("m1:i2", { detail: { description: "No rubric yet." } });
    expect(result.status).toBe("ok");
    expect(result).toMatchObject({ existingRubricId: undefined, description: "No rubric yet." });
  });

  // THE SABOTAGE THIS TEST CATCHES: a version of classifyAssignmentDetailFetch
  // that (like the pre-fix code in useBulkItemActions.ts) treats a fetch
  // error as `{ status: "ok", description: "" }` would make this assertion
  // read `result.status === "ok"` instead of `"fetch-failed"` - and an "ok"
  // result with no `existingRubricId` is exactly what made
  // classifyRubricEligibility (rubric-bulk-plan.ts) call a Canvas-500'd
  // assignment ELIGIBLE and overwrite its real rubric. This is the one
  // assertion in the whole chunk that stands between a failed Canvas read
  // and a live grading rubric being silently destroyed.
  it("classifies a fetch error as its own 'fetch-failed' status, never as 'ok' with a blank description", () => {
    const result = classifyAssignmentDetailFetch("m1:i3", { error: "Canvas returned 500" });
    expect(result.status).toBe("fetch-failed");
    expect(result).not.toMatchObject({ status: "ok" });
    if (result.status === "fetch-failed") {
      expect(result.error).toBe("Canvas returned 500");
    }
  });
});

describe("detailFetchFailureOutcome", () => {
  it("turns a fetch-failed outcome into a 'failed' RubricTargetOutcome carrying the fetch's own error text", () => {
    const outcome = detailFetchFailureOutcome({ key: "m2:i9", status: "fetch-failed", error: "timed out" });
    expect(outcome).toEqual({
      itemId: "m2:i9",
      status: "failed",
      reason: "Could not check for an existing rubric: timed out",
    });
  });

  it("is accepted by summarizeRubricGenerateOutcomes as a real failure, not silently dropped (AC4)", () => {
    const failureOutcome = detailFetchFailureOutcome({ key: "x", status: "fetch-failed", error: "boom" });
    const report = summarizeRubricGenerateOutcomes([failureOutcome], []);
    expect(report.failed).toBe(1);
    expect(report.updated).toBe(0);
    expect(report.alreadyHasRubric).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// mapWithConcurrency - C7: bounds the detail-fetch fan-out.

describe("mapWithConcurrency (C7: bounds the unthrottled detail-fetch fan-out)", () => {
  it("never runs more than `limit` calls at once, across more items than the limit", async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency(items, 3, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return n * 10;
    });
    expect(peak).toBeLessThanOrEqual(3);
    // THE SABOTAGE THIS CATCHES: a version that runs every item at once
    // (a bare Promise.all, i.e. the pre-fix shape) would push peak to 8, not
    // 3 - this assertion is the one that actually distinguishes "bounded" from
    // "unbounded", not merely "the function returns something".
    expect(peak).toBe(3);
    expect(results).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
  });

  it("preserves result order even when later items finish before earlier ones", async () => {
    const delays = [30, 0, 20, 0];
    const results = await mapWithConcurrency(delays, 4, async (delay, i) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return i;
    });
    expect(results).toEqual([0, 1, 2, 3]);
  });

  it("handles an empty list without dividing by zero or hanging", async () => {
    const results = await mapWithConcurrency<number, number>([], 5, async (n) => n);
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// summarizeRubricGenerateOutcomes - AC4's three outcomes, counted distinctly.

function outcome(o: RubricTargetOutcome): RubricTargetOutcome {
  return o;
}

describe("summarizeRubricGenerateOutcomes (AC4: three outcomes, never collapsed into one)", () => {
  it("counts updated, already-has-rubric, each ineligible reason, and failed all separately from one mixed batch", () => {
    const outcomes: RubricTargetOutcome[] = [
      outcome({ itemId: "a", status: "updated", rubricId: 1, rubricTitle: "Generated Rubric (100 pts)", pointsPossible: 100 }),
      outcome({ itemId: "b", status: "updated", rubricId: 1, rubricTitle: "Generated Rubric (100 pts)", pointsPossible: 100 }),
      outcome({ itemId: "c", status: "skipped", reason: "already-has-rubric", existingRubricId: 42 }),
      outcome({ itemId: "d", status: "skipped", reason: "ineligible-kind" }),
      outcome({ itemId: "e", status: "skipped", reason: "ineligible-kind" }),
      outcome({ itemId: "f", status: "skipped", reason: "no-content-id" }),
      outcome({ itemId: "g", status: "skipped", reason: "new-quiz" }),
      outcome({ itemId: "h", status: "failed", reason: "Canvas timed out" }),
    ];
    const orphans: OrphanRubric[] = [];
    const report = summarizeRubricGenerateOutcomes(outcomes, orphans);
    expect(report).toEqual({
      updated: 2,
      alreadyHasRubric: 1,
      ineligibleKind: 2,
      ineligibleNewQuiz: 1,
      ineligibleNoContentId: 1,
      failed: 1,
      orphans: [],
    });
  });

  it("passes orphan rubrics through unchanged (AC3: reported by name and id, never auto-deleted)", () => {
    const orphans: OrphanRubric[] = [
      { rubricId: 7, rubricTitle: "Generated Rubric (50 pts)", pointsPossible: 50, attemptedItemIds: ["x"] },
    ];
    const report = summarizeRubricGenerateOutcomes([], orphans);
    expect(report.orphans).toBe(orphans);
  });

  it("returns an all-zero report for an empty outcome list", () => {
    const report = summarizeRubricGenerateOutcomes([], []);
    expect(report.updated).toBe(0);
    expect(report.alreadyHasRubric).toBe(0);
    expect(report.ineligibleKind).toBe(0);
    expect(report.ineligibleNewQuiz).toBe(0);
    expect(report.ineligibleNoContentId).toBe(0);
    expect(report.failed).toBe(0);
  });

  // This test IS the automated sabotage check - not a comment claiming one
  // was performed by hand and left unverified: a version of
  // summarizeRubricGenerateOutcomes that folds "already-has-rubric" into the
  // same bucket as "ineligible-kind" makes it fail (alreadyHasRubric would
  // read 0, ineligibleKind would read 2) while leaving the "no eligible items
  // at all" test above green - proving this specific assertion, not just
  // "the function runs", is what catches the AC4 regression the shipped
  // bulkRubric control already has. (The trailing
  // `alreadyHasRubric !== ineligibleKind + alreadyHasRubric` check that used
  // to sit here was a tautology given the two `toBe` assertions immediately
  // above it - deleted, not kept as decoration.)
  it("keeps 'already has a rubric' and 'can never have one' as different buckets even when both are present", () => {
    const outcomes: RubricTargetOutcome[] = [
      outcome({ itemId: "a", status: "skipped", reason: "already-has-rubric", existingRubricId: 1 }),
      outcome({ itemId: "b", status: "skipped", reason: "ineligible-kind" }),
    ];
    const report = summarizeRubricGenerateOutcomes(outcomes, []);
    expect(report.alreadyHasRubric).toBe(1);
    expect(report.ineligibleKind).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// describeRubricGenerateNote - the instructor-facing text built from a report.

const BASE_REPORT: BulkRubricGenerateReport = {
  updated: 0,
  alreadyHasRubric: 0,
  ineligibleKind: 0,
  ineligibleNewQuiz: 0,
  ineligibleNoContentId: 0,
  failed: 0,
  orphans: [],
};

describe("describeRubricGenerateNote", () => {
  it("reports an action-level error distinctly, before ever mentioning per-item outcomes", () => {
    const note = describeRubricGenerateNote({ ...BASE_REPORT, actionError: "not signed in" });
    expect(note.kind).toBe("error");
    expect(note.text).toBe("not signed in");
  });

  it("reports a generation failure distinctly from a Canvas-write failure", () => {
    const note = describeRubricGenerateNote({ ...BASE_REPORT, generationFailedReason: "model timed out" });
    expect(note.kind).toBe("error");
    expect(note.text).toMatch(/generate the rubric/i);
    expect(note.text).toMatch(/model timed out/);
  });

  it("mentions 'already had a rubric' and 'cannot take a rubric' as separate clauses (AC4)", () => {
    const note = describeRubricGenerateNote({ ...BASE_REPORT, updated: 3, alreadyHasRubric: 2, ineligibleKind: 4 });
    expect(note.text).toMatch(/already had a rubric/i);
    expect(note.text).toMatch(/cannot take a rubric/i);
    expect(note.kind).toBe("success");
  });

  it("names an orphan rubric's title and id, and marks the note as an error (AC3's bounded, stated cost)", () => {
    const note = describeRubricGenerateNote({
      ...BASE_REPORT,
      updated: 1,
      orphans: [{ rubricId: 9, rubricTitle: "Generated Rubric (10 pts)", pointsPossible: 10, attemptedItemIds: ["z"] }],
    });
    expect(note.kind).toBe("error");
    expect(note.text).toMatch(/created but not attached/i);
  });

  it("is a plain success with no extra clauses when everything updated cleanly", () => {
    const note = describeRubricGenerateNote({ ...BASE_REPORT, updated: 5 });
    expect(note.kind).toBe("success");
    expect(note.text).not.toMatch(/already had a rubric/i);
    expect(note.text).not.toMatch(/cannot take a rubric/i);
    expect(note.text).not.toMatch(/failed/i);
  });
});
