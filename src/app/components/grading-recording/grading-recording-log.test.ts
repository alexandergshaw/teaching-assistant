import { describe, it, expect } from "vitest";
import {
  buildGradingRecordingLogRowEntry,
  buildGradingRecordingRunLog,
  makeGradingRecordingLogBatch,
  summarizeGradingRecordingRunLog,
  gradingRecordingLogSummaryLine,
  formatGradingRecordingLogCsv,
  formatGradingRecordingLogJson,
  gradingRecordingLogFileName,
  type GradingRecordingLogInput,
  type GradingRecordingRunLog,
} from "./grading-recording-log";
import type { GradingRow } from "./grading-row";

const AT = "2026-08-31T09:00:00.000Z";

function row(overrides: Partial<GradingRow> & { id: string; studentName: string }): GradingRow {
  return {
    nameMatch: "no-roster",
    rosterCandidates: [],
    submissionText: "submission text",
    state: "pending",
    totalScore: "",
    strengths: "",
    improvements: "",
    overallComment: "",
    error: "",
    userEdited: false,
    ...overrides,
  };
}

function emptyInput(overrides: Partial<GradingRecordingLogInput> = {}): GradingRecordingLogInput {
  return {
    startedAt: "",
    endedAt: "",
    courseName: "",
    rubricPresent: false,
    knowledgeContextPresent: false,
    droppedFrames: 0,
    batches: [],
    encodeNotices: [],
    gradingRuns: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildGradingRecordingLogRowEntry - per-row mapping. Deliberately excludes
// submissionText/strengths/improvements/overallComment (this file's own
// header explains why) - pinned here so a future edit that starts leaking
// one of those fields back in turns this test red.
// ---------------------------------------------------------------------------

describe("buildGradingRecordingLogRowEntry", () => {
  it("maps exactly the documented fields, never submissionText or the full feedback fields", () => {
    const r = row({
      id: "row-1",
      studentName: "Diego Chen",
      nameMatch: "matched",
      rosterCandidates: ["Diego Chen"],
      state: "ready",
      totalScore: "18/20",
      strengths: "Clear thesis.",
      improvements: "Cite sources.",
      overallComment: "Good work.",
      userEdited: true,
      submissionText: "the actual submitted essay text",
    });
    const entry = buildGradingRecordingLogRowEntry(r);
    expect(entry).toEqual({
      rowId: "row-1",
      studentName: "Diego Chen",
      nameMatch: "matched",
      rosterCandidates: ["Diego Chen"],
      state: "ready",
      userEdited: true,
      totalScore: "18/20",
      error: "",
    });
    expect(Object.keys(entry)).not.toContain("submissionText");
    expect(Object.keys(entry)).not.toContain("strengths");
    expect(Object.keys(entry)).not.toContain("improvements");
    expect(Object.keys(entry)).not.toContain("overallComment");
  });

  it("carries a verbatim error message through unchanged", () => {
    const r = row({ id: "row-2", studentName: "A", state: "failed", error: "The model returned an empty response." });
    const entry = buildGradingRecordingLogRowEntry(r);
    expect(entry.error).toBe("The model returned an empty response.");
    expect(entry.state).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// buildGradingRecordingRunLog - order preservation (never reorders/drops).
// ---------------------------------------------------------------------------

describe("buildGradingRecordingRunLog", () => {
  it("uses rawRows in the exact order given, never reordering or dropping", () => {
    const rows = [
      row({ id: "r1", studentName: "Zed" }),
      row({ id: "r2", studentName: "Alice" }),
      row({ id: "r3", studentName: "Mid" }),
    ];
    const log = buildGradingRecordingRunLog(emptyInput(), rows);
    expect(log.rows.map((r) => r.rowId)).toEqual(["r1", "r2", "r3"]);
  });

  it("spreads every input field through unchanged", () => {
    const input = emptyInput({ courseName: "CS 101", rubricPresent: true, droppedFrames: 4 });
    const log = buildGradingRecordingRunLog(input, []);
    expect(log.courseName).toBe("CS 101");
    expect(log.rubricPresent).toBe(true);
    expect(log.droppedFrames).toBe(4);
    expect(log.rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// makeGradingRecordingLogBatch - defaults.
// ---------------------------------------------------------------------------

describe("makeGradingRecordingLogBatch", () => {
  it("defaults every field but at/framesInBatch to its nothing-happened value", () => {
    expect(makeGradingRecordingLogBatch({ at: AT, framesInBatch: 3 })).toEqual({
      at: AT,
      framesInBatch: 3,
      submissionsExtracted: 0,
      added: 0,
      merged: 0,
      skippedUnnamed: 0,
      confirmedEmpty: false,
      error: "",
    });
  });

  it("carries an error batch's verbatim message with every count at 0", () => {
    const batch = makeGradingRecordingLogBatch({ at: AT, framesInBatch: 5, error: "503 Service Unavailable" });
    expect(batch.error).toBe("503 Service Unavailable");
    expect(batch.submissionsExtracted).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// summarizeGradingRecordingRunLog - exhaustive state counting and batch/run
// totals. Sabotage-checked: a version of this function that swapped `ready`
// and `failed` in the switch, or that summed batches[0] only instead of
// looping, was manually reproduced against these exact numbers and DID turn
// this test red before the real implementation was restored - see this
// file's own report for the exact mutation tried.
// ---------------------------------------------------------------------------

describe("summarizeGradingRecordingRunLog", () => {
  it("counts every GradingRowState bucket independently, summing to totalRows", () => {
    // Every bucket gets a DIFFERENT count (1/2/3/4) - not just "at least one
    // row per state" - so a bug that swapped which counter any TWO states
    // increment (e.g. pending<->failed) cannot hide behind two buckets that
    // happen to land on the same number. See this file's own header note on
    // why a symmetric count is exactly the "default on both sides" pitfall
    // AGENTS.md warns about.
    const rows: GradingRow[] = [
      row({ id: "r1", studentName: "A", state: "pending" }),
      row({ id: "r2", studentName: "B", state: "grading" }),
      row({ id: "r3", studentName: "C", state: "grading" }),
      row({ id: "r4", studentName: "D", state: "ready" }),
      row({ id: "r5", studentName: "E", state: "ready" }),
      row({ id: "r6", studentName: "F", state: "ready", userEdited: true }),
      row({ id: "r7", studentName: "G", state: "failed" }),
      row({ id: "r8", studentName: "H", state: "failed" }),
      row({ id: "r9", studentName: "I", state: "failed" }),
      row({ id: "r10", studentName: "J", state: "failed" }),
    ];
    const log = buildGradingRecordingRunLog(emptyInput(), rows);
    const summary = summarizeGradingRecordingRunLog(log);
    expect(summary.totalRows).toBe(10);
    expect(summary.pending).toBe(1);
    expect(summary.grading).toBe(2);
    expect(summary.ready).toBe(3);
    expect(summary.failed).toBe(4);
    expect(summary.userEditedRows).toBe(1);
    expect(summary.pending + summary.grading + summary.ready + summary.failed).toBe(summary.totalRows);
  });

  it("sums batch counts across MULTIPLE batches, never just the first", () => {
    const log = buildGradingRecordingRunLog(
      emptyInput({
        batches: [
          makeGradingRecordingLogBatch({ at: AT, framesInBatch: 4, submissionsExtracted: 2, added: 2, merged: 0, skippedUnnamed: 1 }),
          makeGradingRecordingLogBatch({ at: AT, framesInBatch: 4, submissionsExtracted: 3, added: 1, merged: 2, skippedUnnamed: 0 }),
          makeGradingRecordingLogBatch({ at: AT, framesInBatch: 4, error: "network error" }),
        ],
      }),
      []
    );
    const summary = summarizeGradingRecordingRunLog(log);
    expect(summary.batchesSent).toBe(3);
    expect(summary.submissionsExtractedTotal).toBe(5);
    expect(summary.addedTotal).toBe(3);
    expect(summary.mergedTotal).toBe(2);
    expect(summary.skippedUnnamedTotal).toBe(1);
  });

  it("splits grading-run attempts into blocked vs errored vs clean, never conflating them", () => {
    const log = buildGradingRecordingRunLog(
      emptyInput({
        gradingRuns: [
          { at: AT, rowCount: 0, blocked: true, reason: "Nothing to grade yet.", error: "", graded: 0, failed: 0 },
          { at: AT, rowCount: 0, blocked: true, reason: "Add a rubric first.", error: "", graded: 0, failed: 0 },
          { at: AT, rowCount: 2, blocked: false, reason: "", error: "500 Internal Server Error", graded: 0, failed: 0 },
          { at: AT, rowCount: 2, blocked: false, reason: "", error: "", graded: 1, failed: 1 },
        ],
      }),
      []
    );
    const summary = summarizeGradingRecordingRunLog(log);
    expect(summary.gradingRunsTotal).toBe(4);
    expect(summary.gradingRunsBlocked).toBe(2);
    expect(summary.gradingRunsErrored).toBe(1);
  });

  it("throws on an unhandled GradingRowState rather than silently miscounting it (exhaustiveness guard)", () => {
    const rows = [row({ id: "r1", studentName: "A" })];
    (rows[0] as unknown as { state: string }).state = "not-a-real-state";
    const log = buildGradingRecordingRunLog(emptyInput(), rows);
    expect(() => summarizeGradingRecordingRunLog(log)).toThrow(/Unhandled grading row state/);
  });
});

// ---------------------------------------------------------------------------
// gradingRecordingLogSummaryLine - frozen literal oracle.
// ---------------------------------------------------------------------------

describe("gradingRecordingLogSummaryLine", () => {
  it("renders the base sentence with no trailing clauses when nothing skipped/dropped", () => {
    const summary = summarizeGradingRecordingRunLog(
      buildGradingRecordingRunLog(
        emptyInput({ batches: [makeGradingRecordingLogBatch({ at: AT, framesInBatch: 4, submissionsExtracted: 2, added: 2 })] }),
        [row({ id: "r1", studentName: "A", state: "ready" }), row({ id: "r2", studentName: "B", state: "failed" })]
      )
    );
    expect(gradingRecordingLogSummaryLine(summary)).toBe(
      "2 submissions captured across 1 batch - 1 graded, 1 failed, 0 never graded, 0 edited by hand."
    );
  });

  it("appends the skipped-unnamed and dropped-frames clauses only when non-zero", () => {
    const summary = summarizeGradingRecordingRunLog(
      buildGradingRecordingRunLog(
        emptyInput({
          droppedFrames: 2,
          batches: [makeGradingRecordingLogBatch({ at: AT, framesInBatch: 4, skippedUnnamed: 3 })],
        }),
        []
      )
    );
    expect(gradingRecordingLogSummaryLine(summary)).toBe(
      "0 submissions captured across 1 batch - 0 graded, 0 failed, 0 never graded, 0 edited by hand. " +
        "3 submissions skipped for an unreadable name. 2 frames dropped."
    );
  });
});

// ---------------------------------------------------------------------------
// formatGradingRecordingLogCsv - frozen literal oracle, escaping included.
// ---------------------------------------------------------------------------

describe("formatGradingRecordingLogCsv", () => {
  it("renders the exact five-section CSV, escaping a comma in a field", () => {
    const log: GradingRecordingRunLog = buildGradingRecordingRunLog(
      emptyInput({
        startedAt: AT,
        endedAt: AT,
        courseName: "CS 101",
        rubricPresent: true,
        knowledgeContextPresent: false,
        droppedFrames: 1,
        batches: [
          makeGradingRecordingLogBatch({
            at: AT,
            framesInBatch: 4,
            submissionsExtracted: 2,
            added: 2,
            merged: 0,
            skippedUnnamed: 0,
            confirmedEmpty: false,
          }),
        ],
        encodeNotices: [{ at: AT, text: "One captured frame was too large to send" }],
        gradingRuns: [{ at: AT, rowCount: 1, blocked: false, reason: "", error: "", graded: 1, failed: 0 }],
      }),
      [row({ id: "r1", studentName: "Smith, Jane", state: "ready", totalScore: "9/10" })]
    );
    const csv = formatGradingRecordingLogCsv(log);
    expect(csv).toBe(
      [
        "=== Run ===",
        "Field,Value",
        `Started,${AT}`,
        `Ended,${AT}`,
        "Course,CS 101",
        "Rubric present,Yes",
        "Knowledge Base context present,No",
        "Dropped frames,1",
        "",
        "=== Batches ===",
        "At,Frames in batch,Submissions extracted,Added,Merged,Skipped unnamed,Confirmed empty,Error",
        `${AT},4,2,2,0,0,No,`,
        "",
        "=== Encode notices ===",
        "At,Text",
        `${AT},One captured frame was too large to send`,
        "",
        "=== Grading runs ===",
        "At,Row count,Blocked,Reason,Error,Graded,Failed",
        `${AT},1,No,,,1,0`,
        "",
        "=== Rows ===",
        "Row ID,Student name,Name match,Roster candidates,State,User edited,Total score,Error",
        `r1,"Smith, Jane",no-roster,,ready,No,9/10,`,
      ].join("\r\n")
    );
  });
});

// ---------------------------------------------------------------------------
// formatGradingRecordingLogJson - object shape, exportedAt.
// ---------------------------------------------------------------------------

describe("formatGradingRecordingLogJson", () => {
  it("wraps the log in an object with exportedAt, never a bare array", () => {
    const log = buildGradingRecordingRunLog(emptyInput({ courseName: "CS 101" }), [row({ id: "r1", studentName: "A" })]);
    const parsed = JSON.parse(formatGradingRecordingLogJson(log, { exportedAt: AT }));
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed.exportedAt).toBe(AT);
    expect(parsed.courseName).toBe("CS 101");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].rowId).toBe("r1");
  });
});

// ---------------------------------------------------------------------------
// gradingRecordingLogFileName.
// ---------------------------------------------------------------------------

describe("gradingRecordingLogFileName", () => {
  it("slugifies the course name and stamps the timestamp", () => {
    expect(gradingRecordingLogFileName("CS 101: Intro!", "csv", "2026-08-31T09:05:07.000Z")).toBe(
      "grading-recording-log-cs-101-intro-20260831-090507.csv"
    );
  });

  it("drops a blank course segment without a dangling double dash", () => {
    expect(gradingRecordingLogFileName("", "json", "2026-08-31T09:05:07.000Z")).toBe(
      "grading-recording-log-20260831-090507.json"
    );
  });
});
