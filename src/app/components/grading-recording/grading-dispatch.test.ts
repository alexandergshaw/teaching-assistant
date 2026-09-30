import { describe, it, expect } from "vitest";
import {
  checkGradingReadiness,
  MISSING_RUBRIC_MESSAGE,
  NO_SUBMISSIONS_TO_GRADE_MESSAGE,
  buildSingleSubmission,
  gradingRowGradeAction,
  recordGradeDispatch,
  beginGradeAttempt,
  computeGradeConfirmThreshold,
  sumGradeAttempts,
  requiresGradeConfirm,
} from "./grading-dispatch";
import type { GradingRow } from "./grading-row";

function makeRow(overrides: Partial<GradingRow> = {}): GradingRow {
  return {
    id: "grade-1",
    studentName: "Maria Alvarez",
    nameMatch: "no-roster",
    rosterCandidates: [],
    submissionText: "A submission about the reading.",
    state: "pending",
    totalScore: "",
    strengths: "",
    improvements: "",
    overallComment: "",
    error: "",
    userEdited: false,
    rubricAreas: [],
    suggestedSubmissionKind: "unknown",
    submissionKindCue: "",
    submissionKind: "unknown",
    ...overrides,
  };
}

describe("checkGradingReadiness (item 5: rubric required before grading, not before capturing)", () => {
  it("refuses with NO_SUBMISSIONS_TO_GRADE_MESSAGE when the table is empty, rubric or not", () => {
    expect(checkGradingReadiness("A real rubric", 0)).toEqual({ ok: false, reason: NO_SUBMISSIONS_TO_GRADE_MESSAGE });
    expect(checkGradingReadiness("", 0)).toEqual({ ok: false, reason: NO_SUBMISSIONS_TO_GRADE_MESSAGE });
  });

  it("refuses with MISSING_RUBRIC_MESSAGE when there are rows but no rubric text", () => {
    expect(checkGradingReadiness("", 3)).toEqual({ ok: false, reason: MISSING_RUBRIC_MESSAGE });
  });

  it("refuses on whitespace-only rubric text - not just a literally empty string", () => {
    expect(checkGradingReadiness("   \n  ", 3)).toEqual({ ok: false, reason: MISSING_RUBRIC_MESSAGE });
  });

  it("is ok once both a rubric and at least one row exist", () => {
    expect(checkGradingReadiness("Grade for clarity and evidence.", 3)).toEqual({ ok: true, reason: null });
  });

  it("recording first, pasting the rubric after, is exactly the flow this allows - rows can exist with no rubric yet without being refused for the WRONG reason", () => {
    const result = checkGradingReadiness("", 5);
    // The refusal is about the missing rubric, not a claim that capturing
    // without one was itself invalid.
    expect(result.reason).toBe(MISSING_RUBRIC_MESSAGE);
  });
});

// A38 wave 1 (docs/a38-acceptance-criteria.md AC-1 stronger form;
// docs/a38-scope.md section 4.6 Unit 1): buildSingleSubmission's return
// type IS a single submission object, never an array - "sends more than
// one row" is unrepresentable at this function's own signature. This test
// is the direct-call id proof AC-1's stronger form asks for; the
// one-element-array-literal call site itself is pinned by
// useGradingRowGrade.wiring.test.ts, by reading, since no hook is driven
// here.
describe("buildSingleSubmission (AC-1 Unit 1: the single-row submission builder)", () => {
  it("returns exactly one submission object mirroring the row's own four fields - id, studentName, submissionText, submissionKind", () => {
    const row = makeRow({
      id: "row-7",
      studentName: "Diego Chen",
      submissionText: "The essay argues for causation.",
      submissionKind: "reply",
    });
    const submission = buildSingleSubmission(row);
    expect(submission).toEqual({
      id: "row-7",
      studentName: "Diego Chen",
      submissionText: "The essay argues for causation.",
      submissionKind: "reply",
    });
  });

  it("the returned object is not an array - it has no `length` property at all", () => {
    const submission = buildSingleSubmission(makeRow());
    expect(Array.isArray(submission)).toBe(false);
    expect((submission as unknown as { length?: unknown }).length).toBeUndefined();
  });

  it("carries the pressed row's id, not some other row's - proven with two distinct rows", () => {
    const a = buildSingleSubmission(makeRow({ id: "a" }));
    const b = buildSingleSubmission(makeRow({ id: "b" }));
    expect(a.id).toBe("a");
    expect(b.id).toBe("b");
  });

  it("does not read or leak any scored/feedback field - only the four submission fields cross this boundary", () => {
    const row = makeRow({ totalScore: "9/10", strengths: "secret grader notes" });
    const submission = buildSingleSubmission(row);
    expect(Object.keys(submission).sort()).toEqual(["id", "studentName", "submissionKind", "submissionText"].sort());
  });
});

// docs/a38-scope.md section 4.4's eligibility table: pending/failed/ready
// are all offered; grading is not (this row is the one in flight).
// P-6: `failed` MUST be eligible - it is where a bound-overflow row lands
// (AC-5), and excluding it is exactly the defect this feature exists to fix.
describe("gradingRowGradeAction (A38 wave 1, docs/a38-scope.md section 4.4's eligibility table)", () => {
  it("pending is eligible, labelled Grade", () => {
    expect(gradingRowGradeAction(makeRow({ state: "pending" }), true)).toEqual({ gradeable: true, label: "Grade" });
  });

  it("failed is eligible, labelled Re-grade - the bound-overflow remedy (P-6)", () => {
    expect(gradingRowGradeAction(makeRow({ state: "failed" }), true)).toEqual({ gradeable: true, label: "Re-grade" });
  });

  it("ready is eligible, labelled Re-grade", () => {
    expect(gradingRowGradeAction(makeRow({ state: "ready" }), true)).toEqual({ gradeable: true, label: "Re-grade" });
  });

  it("grading is never eligible - this row is the one already in flight", () => {
    const result = gradingRowGradeAction(makeRow({ state: "grading" }), true);
    expect(result.gradeable).toBe(false);
    expect(result.label).toBe("Grading…");
  });

  it("no rubric present makes every non-grading state ineligible, regardless of row.state", () => {
    expect(gradingRowGradeAction(makeRow({ state: "pending" }), false).gradeable).toBe(false);
    expect(gradingRowGradeAction(makeRow({ state: "failed" }), false).gradeable).toBe(false);
    expect(gradingRowGradeAction(makeRow({ state: "ready" }), false).gradeable).toBe(false);
  });

  it("a grading row reports ineligible even when a rubric is present - it is not the rubric that disables it", () => {
    expect(gradingRowGradeAction(makeRow({ state: "grading" }), true).gradeable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A38 wave 2 (docs/a38-acceptance-criteria.md AC-3): the spend-cap counter
// and the confirm-above-N threshold, driven directly - no hook, nothing
// rendered.
// ---------------------------------------------------------------------------

describe("recordGradeDispatch (AC-3 Unit 2: the ONE increment primitive)", () => {
  it("recordGradeDispatch(undefined) is 1 - the first dispatch on a never-attempted row", () => {
    expect(recordGradeDispatch(undefined)).toBe(1);
    expect(recordGradeDispatch()).toBe(1);
  });

  it("recordGradeDispatch(0) is 1", () => {
    expect(recordGradeDispatch(0)).toBe(1);
  });

  it("increments from any prior count", () => {
    expect(recordGradeDispatch(4)).toBe(5);
  });
});

describe("beginGradeAttempt (AC-3: increments on DISPATCH, before the grade action's own await; anti-Ruling-6)", () => {
  it("sets state to 'grading' and gradeAttempts to 1 on a never-attempted row", () => {
    const row = makeRow({ state: "pending" });
    const next = beginGradeAttempt(row);
    expect(next.state).toBe("grading");
    expect(next.gradeAttempts).toBe(1);
  });

  it("increments gradeAttempts from whatever the row already carried", () => {
    const row = makeRow({ state: "failed", gradeAttempts: 2 });
    expect(beginGradeAttempt(row).gradeAttempts).toBe(3);
  });

  it("ANTI-RULING-6: a dispatch that later ERRORS still counted - simulated here by calling beginGradeAttempt (the dispatch) then restoring state WITHOUT touching gradeAttempts (the error-outcome entry point, setGradingRowState in grading-rows.ts) - the count must survive the restore, never fall back to 0", () => {
    const row = makeRow({ state: "pending" });
    const dispatched = beginGradeAttempt(row);
    expect(dispatched.gradeAttempts).toBe(1);
    // The error-outcome restore is a plain spread that leaves gradeAttempts
    // untouched - modelled directly here (grading-rows.test.ts exercises the
    // real setGradingRowState for this same claim against the row store).
    const restored = { ...dispatched, state: "pending" as const };
    expect(restored.gradeAttempts).toBe(1);
  });

  it("does not mutate the input row", () => {
    const row = makeRow({ state: "pending" });
    beginGradeAttempt(row);
    expect(row.state).toBe("pending");
    expect(row.gradeAttempts).toBeUndefined();
  });
});

describe("computeGradeConfirmThreshold (AC-3 Ruling 9: N = min(totalCount, maxSubmissions), never totalCount alone)", () => {
  it("the bound is the binding constraint when it is smaller than the table", () => {
    expect(computeGradeConfirmThreshold(200, 3)).toBe(3);
  });

  it("the table size is the binding constraint when it is smaller than the bound", () => {
    expect(computeGradeConfirmThreshold(2, 40)).toBe(2);
  });

  it("a null (not-yet-fetched) bound falls back to totalCount - never fires EARLIER than a real bound would allow", () => {
    expect(computeGradeConfirmThreshold(200, null)).toBe(200);
  });
});

describe("sumGradeAttempts", () => {
  it("sums every row's gradeAttempts, treating an absent count as 0", () => {
    const rows = [makeRow({ id: "a", gradeAttempts: 2 }), makeRow({ id: "b" }), makeRow({ id: "c", gradeAttempts: 5 })];
    expect(sumGradeAttempts(rows)).toBe(7);
  });

  it("an empty table sums to 0", () => {
    expect(sumGradeAttempts([])).toBe(0);
  });
});

describe("requiresGradeConfirm (DECISION 2: confirm ABOVE N - at or above N, so the Nth dispatch itself is gated)", () => {
  it("below N: no confirm required", () => {
    expect(requiresGradeConfirm(2, 3)).toBe(false);
  });

  it("at N: confirm required (not merely past it)", () => {
    expect(requiresGradeConfirm(3, 3)).toBe(true);
  });

  it("above N: confirm required", () => {
    expect(requiresGradeConfirm(10, 3)).toBe(true);
  });
});
