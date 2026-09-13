import { describe, it, expect } from "vitest";
import { editAssessmentField, applyAssessmentResult } from "../assessment-shared/assessment-row";
import {
  createEmptySnapshotRow,
  mintSnapshotRowId,
  summarizeShotReports,
  selectShotsForGradeCall,
  computeSnapshotTotalScore,
  buildTranscriptBlock,
  upsertSnapshotRow,
  resolveGradeTarget,
  GRADE_PASS_IMAGE_BUDGET_BYTES,
  READ_BATCH_SIZE,
  type SnapshotShotReadReport,
  type SnapshotAssessmentRow,
} from "./snapshot-row";
import { snapshotRowCodec } from "./snapshot-row-serialization";

// Duplicated per-file (test notes M1): not imported from
// snapshot-row-serialization.test.ts or snapshot-shot.test.ts - a
// cross-*.test.ts import re-runs the other file's describe blocks.
function makeFullRow(overrides: Partial<SnapshotAssessmentRow> = {}): SnapshotAssessmentRow {
  return {
    id: "snap-row-1",
    studentName: "Priya N.",
    state: "ready",
    error: "",
    userEdited: false,
    totalScore: "8/10",
    strengths: "Clear thesis.",
    improvements: "Cite the rubric line.",
    overallComment: "Solid work overall.",
    shotReports: [{ shotIndex: 1, role: "post", status: "read" }],
    rubricAreas: [{ area: "Clarity", score: "4/5", quote: "As I see it...", shotIndex: 1, verified: true }],
    missingRoles: ["replies"],
    instructionLikeContent: false,
    instructionLikeContentQuote: undefined,
    imageFallbackNote: undefined,
    evidenceDropped: false,
    ...overrides,
  };
}

function makeMintId(startAt = 0): () => string {
  let n = startAt;
  return () => `minted-${n++}`;
}

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
    expect(row.evidenceDropped).toBe(false);
  });

  it("sets evidenceDropped to false (B3: required on every freshly-minted row, not optional)", () => {
    const row = createEmptySnapshotRow("r1", "Sam");
    expect(row.evidenceDropped).toBe(false);
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

describe("upsertSnapshotRow", () => {
  it("appends a row with a new id", () => {
    const rows = [makeFullRow({ id: "r1" })];
    const next = upsertSnapshotRow(rows, makeFullRow({ id: "r2" }));
    expect(next.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(rows.map((r) => r.id)).toEqual(["r1"]); // input not mutated
  });

  it("replaces the row with a matching id in place, preserving position", () => {
    const rows = [makeFullRow({ id: "r1" }), makeFullRow({ id: "r2" }), makeFullRow({ id: "r3" })];
    const replacement = makeFullRow({ id: "r2", studentName: "Changed" });
    const next = upsertSnapshotRow(rows, replacement);
    expect(next.map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
    expect(next[1].studentName).toBe("Changed");
  });
});

describe("resolveGradeTarget", () => {
  it("merges in place when the active row exists and is not userEdited", () => {
    const active = makeFullRow({ id: "r1", userEdited: false });
    const result = resolveGradeTarget([active], "r1", makeMintId());
    expect(result.isNewRow).toBe(false);
    expect(result.base).toBe(active);
    expect(result.supersededEditedRow).toBeNull();
  });

  it("mints a new row when there is no active row yet (activeId null)", () => {
    const result = resolveGradeTarget([], null, makeMintId());
    expect(result.isNewRow).toBe(true);
    expect(result.supersededEditedRow).toBeNull();
    expect(result.base.id).toBe("minted-0");
    expect(result.base.studentName).toBe("");
  });

  it("mints a new row when activeId points at a row that isn't in the list (M4: the observable consequence is a blank student name)", () => {
    const result = resolveGradeTarget(
      [makeFullRow({ id: "other", studentName: "Someone Else" })],
      "missing-id",
      makeMintId()
    );
    expect(result.isNewRow).toBe(true);
    expect(result.supersededEditedRow).toBeNull();
    expect(result.base.studentName).toBe(""); // M4: not "Someone Else" - a stale id must not borrow the wrong row's name
  });

  it("CONTESTED: mints a new row, inheriting the student name, when the active row is userEdited - never merges into it", () => {
    const active = makeFullRow({ id: "r1", userEdited: true, studentName: "Priya N." });
    const result = resolveGradeTarget([active], "r1", makeMintId());
    expect(result.isNewRow).toBe(true);
    expect(result.base).not.toBe(active);
    expect(result.base.id).toBe("minted-0");
    expect(result.base.studentName).toBe("Priya N.");
    expect(result.base.userEdited).toBe(false);
    expect(result.base.evidenceDropped).toBe(false); // B3: evidenceDropped is REQUIRED on the freshly-minted row too
    expect(result.supersededEditedRow).toBe(active);
  });

  it("a second re-grade of the freshly-minted row merges into it, rather than minting again", () => {
    const active = makeFullRow({ id: "r1", userEdited: true, studentName: "Priya N." });
    const first = resolveGradeTarget([active], "r1", makeMintId());
    const rowsAfterFirstGrade = upsertSnapshotRow([active], first.base);
    const second = resolveGradeTarget(rowsAfterFirstGrade, first.base.id, makeMintId(1));
    expect(second.isNewRow).toBe(false);
    expect(second.base).toBe(first.base);
    expect(second.base.evidenceDropped).toBe(false);
    expect(second.supersededEditedRow).toBeNull();
  });

  it("calls the injected mintId function exactly once on a new-row branch (mintSnapshotRowId's own monotonicity is pinned separately above, not re-tested here)", () => {
    let calls = 0;
    const countingMint = () => {
      calls++;
      return `id-${calls}`;
    };
    resolveGradeTarget([], null, countingMint);
    expect(calls).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// COMPOSED CASE (Ruling 2): a corrupt stored userEdited reads back as
// edited, so the first re-grade after a corrupt read mints a new row rather
// than merging - preserving, not overwriting, feedback that could not be
// proven safe to touch.
// ---------------------------------------------------------------------------

describe("COMPOSED: contested value 1 (fromWire's userEdited default) x resolveGradeTarget's edited-row-never-merges rule", () => {
  it("a row restored with a corrupt userEdited value mints a new row on its first re-grade, preserving (not overwriting) the unreadable row", () => {
    const corruptWire = {
      id: "r1",
      studentName: "Priya N.",
      state: "ready",
      error: "",
      userEdited: "not-a-boolean", // corrupt - not a real boolean
      totalScore: "7/10",
      strengths: "",
      improvements: "",
      overallComment: "",
      shotReports: [],
      rubricAreas: [],
      missingRoles: [],
      instructionLikeContent: false,
      evidenceDropped: false,
    };
    const restored = snapshotRowCodec.fromWire(corruptWire) as SnapshotAssessmentRow;
    expect(restored.userEdited).toBe(true); // contested value 1, restated as this case's precondition

    const result = resolveGradeTarget([restored], restored.id, makeMintId());
    expect(result.isNewRow).toBe(true);
    expect(result.supersededEditedRow).toBe(restored);
    expect(result.base.studentName).toBe("Priya N."); // the split never loses the student's name
  });

  it("contrast: a normally-persisted row (userEdited round-trips as a real boolean) is unaffected", () => {
    const cleanWire = {
      id: "r1",
      studentName: "Priya N.",
      state: "ready",
      error: "",
      userEdited: false,
      totalScore: "7/10",
      strengths: "",
      improvements: "",
      overallComment: "",
      shotReports: [],
      rubricAreas: [],
      missingRoles: [],
      instructionLikeContent: false,
      evidenceDropped: false,
    };
    const restored = snapshotRowCodec.fromWire(cleanWire) as SnapshotAssessmentRow;
    expect(restored.userEdited).toBe(false);
    const result = resolveGradeTarget([restored], restored.id, makeMintId());
    expect(result.isNewRow).toBe(false); // merges - no false split
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
