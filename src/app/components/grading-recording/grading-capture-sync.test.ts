import { describe, it, expect } from "vitest";
import { syncGradingRowsFromExtracted } from "./grading-capture-sync";
import { mergeExtractedSubmissions } from "./grading-submission-merge";
import type { GradingRow } from "./grading-row";

function makeRow(overrides: Partial<GradingRow> = {}): GradingRow {
  return {
    id: "row-1",
    studentName: "Maria Alvarez",
    nameMatch: "no-roster",
    rosterCandidates: [],
    submissionText: "original text",
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

let idCounter = 0;
function testMintId(): string {
  idCounter += 1;
  return `minted-${idCounter}`;
}

describe("syncGradingRowsFromExtracted", () => {
  it("mints a fresh row (via the injected mintId) for a submission with no existing row at that index", () => {
    idCounter = 0;
    const next = syncGradingRowsFromExtracted([{ name: "Maria Alvarez", text: "hello" }], [], testMintId);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("minted-1");
    expect(next[0].studentName).toBe("Maria Alvarez");
    expect(next[0].submissionText).toBe("hello");
    expect(next[0].state).toBe("pending");
  });

  it("a new row defaults to nameMatch 'no-roster' with no candidates - roster matching happens in a later pass, never a guess here", () => {
    const next = syncGradingRowsFromExtracted([{ name: "Maria Alvarez", text: "hello" }], [], testMintId);
    expect(next[0].nameMatch).toBe("no-roster");
    expect(next[0].rosterCandidates).toEqual([]);
  });

  it("an existing row at the same index is UPDATED in place - same id, refreshed text, progress preserved", () => {
    const existing = makeRow({
      id: "row-1",
      studentName: "Maria Alvarez",
      submissionText: "partial text",
      state: "ready",
      totalScore: "9/10",
      strengths: "hand-typed strengths",
      userEdited: true,
      nameMatch: "matched",
      rosterCandidates: ["Maria Alvarez"],
    });
    const next = syncGradingRowsFromExtracted(
      [{ name: "Maria Alvarez", text: "the fuller reading of the same submission" }],
      [existing],
      testMintId
    );
    expect(next).toHaveLength(1);
    // Same id - never re-minted for an existing submission.
    expect(next[0].id).toBe("row-1");
    // Read fields refreshed.
    expect(next[0].submissionText).toBe("the fuller reading of the same submission");
    // Grading progress and instructor edits carried forward untouched.
    expect(next[0].state).toBe("ready");
    expect(next[0].totalScore).toBe("9/10");
    expect(next[0].strengths).toBe("hand-typed strengths");
    expect(next[0].userEdited).toBe(true);
    // The roster verdict is left exactly as it was - this function never
    // touches it (see this file's header: that is applyRosterMatch's job).
    expect(next[0].nameMatch).toBe("matched");
    expect(next[0].rosterCandidates).toEqual(["Maria Alvarez"]);
  });

  it("mixes an update (index 0) with a fresh mint (index 1) in one call", () => {
    idCounter = 0;
    const existing = makeRow({ id: "row-1", studentName: "Maria Alvarez" });
    const next = syncGradingRowsFromExtracted(
      [
        { name: "Maria Alvarez", text: "updated" },
        { name: "Diego Chen", text: "brand new" },
      ],
      [existing],
      testMintId
    );
    expect(next).toHaveLength(2);
    expect(next[0].id).toBe("row-1");
    expect(next[1].id).toBe("minted-1");
    expect(next[1].studentName).toBe("Diego Chen");
  });

  it("does not mutate the input rows array or its entries", () => {
    const existing = makeRow({ id: "row-1", submissionText: "original" });
    const rows = [existing];
    syncGradingRowsFromExtracted([{ name: "Maria Alvarez", text: "changed" }], rows, testMintId);
    expect(rows[0]).toBe(existing);
    expect(existing.submissionText).toBe("original");
  });
});

describe("syncGradingRowsFromExtracted - end-to-end with mergeExtractedSubmissions across two batches (Blocker 2)", () => {
  // Reproduces GradingRecordingPanel.tsx's real wiring (runExtraction):
  // each batch's raw ExtractedSubmission[] is folded through
  // mergeExtractedSubmissions against the running `extractedRef.current`
  // BEFORE syncGradingRowsFromExtracted ever sees it - so a continuation
  // that mergeExtractedSubmissions correctly recognizes (grading-submission-
  // merge.ts's findContinuationOverlap) lands at the SAME array index as the
  // first batch's reading, and this file's positional-alignment invariant
  // then does the rest: the SAME row is updated in place, never a second
  // one minted.
  it("a submission whose top is read in batch 1 and whose body is read in batch 2 ends up as ONE row, not two, with progress preserved", () => {
    idCounter = 0;

    // Batch 1: only the top of a long submission is visible.
    const batch1 = mergeExtractedSubmissions([], [
      {
        name: "Maria Alvarez",
        text: "Mitochondria are the powerhouse of the cell and they produce energy during the process of cellular respiration",
      },
    ]);
    const rowsAfterBatch1 = syncGradingRowsFromExtracted(batch1.submissions, [], testMintId);
    expect(rowsAfterBatch1).toHaveLength(1);
    const rowId = rowsAfterBatch1[0].id;

    // Instructor (or the app) starts grading this row before the rest of
    // the submission has even been captured - state that must survive.
    const rowsInProgress = rowsAfterBatch1.map((r) => ({ ...r, state: "grading" as const, totalScore: "7/10" }));

    // Batch 2: the recording has scrolled on; only the body is visible now
    // (its own opening shares nothing with batch 1's reading), but the
    // capture overlap leaves the same six-token splice
    // findContinuationOverlap looks for.
    const batch2 = mergeExtractedSubmissions(batch1.submissions, [
      {
        name: "Maria Alvarez",
        text: "During the process of cellular respiration the cell converts glucose into usable energy in the form of ATP molecules for the organism to use",
      },
    ]);
    expect(batch2.submissions).toHaveLength(1); // joined, not appended
    expect(batch2.mergedCount).toBe(1);
    expect(batch2.addedCount).toBe(0);

    const rowsAfterBatch2 = syncGradingRowsFromExtracted(batch2.submissions, rowsInProgress, testMintId);

    // Still exactly one row for this student - the defect this closes was
    // "each graded on a fragment against the whole rubric... penalised
    // twice" from a SECOND row being minted here.
    expect(rowsAfterBatch2).toHaveLength(1);
    // Same row id - never re-minted for a continuation.
    expect(rowsAfterBatch2[0].id).toBe(rowId);
    // In-progress grading state carried forward untouched.
    expect(rowsAfterBatch2[0].state).toBe("grading");
    expect(rowsAfterBatch2[0].totalScore).toBe("7/10");
    // The row's text now holds the FULL joined submission, not a fragment.
    expect(rowsAfterBatch2[0].submissionText).toContain("powerhouse of the cell");
    expect(rowsAfterBatch2[0].submissionText).toContain("ATP molecules");
  });
});
