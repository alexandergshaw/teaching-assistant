import { describe, it, expect } from "vitest";
import { editAssessmentField, applyAssessmentResult } from "../assessment-shared/assessment-row";
import {
  createEmptySnapshotRow,
  mintSnapshotRowId,
  summarizeShotReports,
  selectShotsForGradeCall,
  computeSnapshotTotalScore,
  buildTranscriptBlock,
  GRADE_PASS_IMAGE_BUDGET_BYTES,
  READ_BATCH_SIZE,
  type SnapshotShotReadReport,
} from "./snapshot-row";

describe("mintSnapshotRowId", () => {
  it("mints distinct ids even in the same millisecond", () => {
    const now = 12345;
    const a = mintSnapshotRowId(now);
    const b = mintSnapshotRowId(now);
    expect(a).not.toBe(b);
  });
});

describe("createEmptySnapshotRow", () => {
  it("starts pending, unedited, with no postable identity field and no evidence yet", () => {
    const row = createEmptySnapshotRow("r1", "Sam");
    expect(row.state).toBe("pending");
    expect(row.userEdited).toBe(false);
    expect(row.studentName).toBe("Sam");
    expect(row.rubricAreas).toEqual([]);
    expect(row.missingRoles).toEqual([]);
    expect(row.instructionLikeContent).toBe(false);
    expect("userId" in row).toBe(false);
  });
});

describe("SnapshotAssessmentRow reuses the shared assessment-row.ts mutators unchanged", () => {
  it("editAssessmentField promotes a pending row to ready and marks it edited", () => {
    const row = createEmptySnapshotRow("r1", "Sam");
    const edited = editAssessmentField(row, "totalScore", "9/10");
    expect(edited.totalScore).toBe("9/10");
    expect(edited.userEdited).toBe(true);
    expect(edited.state).toBe("ready");
  });

  it("applyAssessmentResult refuses to overwrite an edited row's scored fields", () => {
    const row = editAssessmentField(createEmptySnapshotRow("r1", "Sam"), "overallComment", "hand-typed comment");
    const result = applyAssessmentResult(row, {
      state: "ready",
      totalScore: "1/10",
      strengths: "machine strengths",
      improvements: "machine improvements",
      overallComment: "machine comment",
    });
    expect(result.overallComment).toBe("hand-typed comment");
    expect(result.state).toBe("ready");
  });
});

describe("summarizeShotReports (U8.1's tally)", () => {
  it("counts read/partly-read/not-read separately", () => {
    const reports: SnapshotShotReadReport[] = [
      { shotIndex: 1, role: "replies", status: "read" },
      { shotIndex: 2, role: "replies", status: "read" },
      { shotIndex: 3, role: "replies", status: "not-read", reason: "too blurry" },
    ];
    expect(summarizeShotReports(reports)).toEqual({ read: 2, partlyRead: 0, notRead: 1 });
  });

  it("returns all zeros for an empty report list", () => {
    expect(summarizeShotReports([])).toEqual({ read: 0, partlyRead: 0, notRead: 0 });
  });
});

describe("selectShotsForGradeCall (A1e's measured fallback)", () => {
  it("includes every shot when the total is under budget", () => {
    const shots = [
      { globalIndex: 1, role: "rubric" as const, base64: "a".repeat(1000) },
      { globalIndex: 2, role: "submission" as const, base64: "b".repeat(1000) },
    ];
    const result = selectShotsForGradeCall(shots, 10_000);
    expect(result.included).toHaveLength(2);
    expect(result.excludedRoles).toEqual([]);
    expect(result.fallbackNote).toBeUndefined();
  });

  it("prioritizes rubric and assignment over work roles when the budget is spent", () => {
    const shots = [
      { globalIndex: 1, role: "submission" as const, base64: "x".repeat(600) },
      { globalIndex: 2, role: "rubric" as const, base64: "y".repeat(600) },
      { globalIndex: 3, role: "assignment" as const, base64: "z".repeat(600) },
    ];
    const result = selectShotsForGradeCall(shots, 1300);
    const includedRoles = result.included.map((s) => s.role).sort();
    expect(includedRoles).toEqual(["assignment", "rubric"]);
    expect(result.excludedRoles).toEqual(["submission"]);
    expect(result.fallbackNote).toMatch(/sent as transcription text only, not as images/);
  });

  it("defaults to GRADE_PASS_IMAGE_BUDGET_BYTES (2.5 MB) when no budget is given", () => {
    const shots = [{ globalIndex: 1, role: "rubric" as const, base64: "a".repeat(100) }];
    const result = selectShotsForGradeCall(shots);
    expect(result.included).toHaveLength(1);
    expect(GRADE_PASS_IMAGE_BUDGET_BYTES).toBe(2.5 * 1024 * 1024);
  });
});

describe("computeSnapshotTotalScore (reuses src/lib/grade/parsing's deriveTotalScore, never re-derived)", () => {
  it("sums earned/possible across areas when no explicit total is given", () => {
    expect(
      computeSnapshotTotalScore([
        { area: "Correctness", score: "8/10" },
        { area: "Style", score: "4/5" },
      ])
    ).toBe("12/15");
  });

  it("returns empty for an empty rubric result list", () => {
    expect(computeSnapshotTotalScore([])).toBe("");
  });
});

describe("buildTranscriptBlock (A1f)", () => {
  it("labels each shot by role and index, sorted, omitting unread shots", () => {
    const block = buildTranscriptBlock([
      { shotIndex: 2, role: "rubric", transcript: "Correctness: 10 pts." },
      { shotIndex: 1, role: "assignment", transcript: "Write a function." },
      { shotIndex: 3, role: "submission", transcript: "" },
    ]);
    expect(block).toBe("Shot 1 (role: assignment):\nWrite a function.\n\nShot 2 (role: rubric):\nCorrectness: 10 pts.");
  });

  it("returns an empty string when nothing has been read yet", () => {
    expect(buildTranscriptBlock([])).toBe("");
  });
});

describe("READ_BATCH_SIZE", () => {
  it("is a small, positive batch size (D: one action call per batch, client-orchestrated)", () => {
    expect(READ_BATCH_SIZE).toBeGreaterThan(0);
    expect(READ_BATCH_SIZE).toBeLessThanOrEqual(12);
  });
});

// ---------------------------------------------------------------------------
// C: THE IDENTITY SABOTAGE (manual, not automated here - tsc is reserved for
// the wave gate per this-repo.md/loop-implementer.md). Recorded for the
// report: adding `userId?: number` to SnapshotAssessmentRow in snapshot-row.ts
// and leaving editAssessmentField(row, ...)/applyAssessmentResult(row, ...)
// above unchanged makes `npx tsc --noEmit` fail at both call sites with
// "Argument of type 'SnapshotAssessmentRow' is not assignable to parameter
// of type 'never'" (the same NoPostableIdentity mechanism no-postable-
// identity.types.ts already proves fires at a generic call site) - because
// NoPostableIdentity<SnapshotAssessmentRow> resolves to never the moment the
// interface carries any of assessment-row.ts's ForbiddenIdentityKeys.
// Reverting the field restores a clean tsc run. Both sides are quoted in the
// wave report, not repeated here as a test, since this file's own leaves are
// exercised by vitest (node-env, no tsc) and the type-level guard itself is
// already covered by no-postable-identity.types.ts.
// ---------------------------------------------------------------------------
