import { describe, it, expect } from "vitest";
import { advanceGradingCapture, type TrackedSubmission } from "./grading-capture-sync";
import { findContinuationOverlap, submissionTextSimilarityDistance, SIMILARITY_THRESHOLD } from "./grading-submission-merge";
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

describe("advanceGradingCapture - single-call behaviour, re-pinned by id (not index)", () => {
  it("mints a fresh row (via the injected mintId) for a submission with no existing tracked entry", () => {
    idCounter = 0;
    const result = advanceGradingCapture([], [], [{ name: "Maria Alvarez", text: "hello" }], testMintId);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe("minted-1");
    expect(result.rows[0].studentName).toBe("Maria Alvarez");
    expect(result.rows[0].submissionText).toBe("hello");
    expect(result.rows[0].state).toBe("pending");
    expect(result.tracked).toHaveLength(1);
    expect(result.tracked[0].rowId).toBe("minted-1");
    expect(result.tracked[0].dismissed).toBe(false);
    expect(result.divergentRowIds).toEqual([]);
  });

  it("a new row defaults to nameMatch 'no-roster' with no candidates - roster matching happens in a later pass, never a guess here", () => {
    idCounter = 0;
    const result = advanceGradingCapture([], [], [{ name: "Maria Alvarez", text: "hello" }], testMintId);
    expect(result.rows[0].nameMatch).toBe("no-roster");
    expect(result.rows[0].rosterCandidates).toEqual([]);
  });

  it("an existing tracked entry whose row still exists is UPDATED IN PLACE - same id, refreshed text, progress preserved, EVEN when the row sits at a different index than the entry", () => {
    idCounter = 0;
    const seed = advanceGradingCapture(
      [],
      [],
      [{ name: "Maria Alvarez", text: "the mitochondria is the powerhouse of the cell" }],
      testMintId
    );
    const rowId = seed.rows[0].id;
    const inProgress = [
      { ...seed.rows[0], state: "ready" as const, totalScore: "9/10", strengths: "hand-typed strengths", userEdited: true },
    ];
    // The row is placed AFTER an unrelated row this call knows nothing
    // about, to prove correlation is by id, never by position.
    const rowsWithUnrelatedFirst = [makeRow({ id: "other-row" }), ...inProgress];

    const result = advanceGradingCapture(
      seed.tracked,
      rowsWithUnrelatedFirst,
      [{ name: "Maria Alvarez", text: "the mitochondria is the powerhouse of the cell and produces ATP through respiration" }],
      testMintId
    );
    const updated = result.rows.find((r) => r.id === rowId)!;
    expect(updated).toBeDefined();
    expect(updated.submissionText).toBe(
      "the mitochondria is the powerhouse of the cell and produces ATP through respiration"
    );
    expect(updated.state).toBe("ready");
    expect(updated.totalScore).toBe("9/10");
    expect(updated.strengths).toBe("hand-typed strengths");
    expect(updated.userEdited).toBe(true);
    // The unrelated row is untouched and preserved.
    expect(result.rows.find((r) => r.id === "other-row")).toBeDefined();
  });

  it("mixes an update (existing tracked entry) with a fresh mint in one call", () => {
    idCounter = 0;
    const seed = advanceGradingCapture(
      [],
      [],
      [{ name: "Maria Alvarez", text: "the mitochondria is the powerhouse of the cell" }],
      testMintId
    );
    const updatedText = "the mitochondria is the powerhouse of the cell and produces ATP";
    const result = advanceGradingCapture(
      seed.tracked,
      seed.rows,
      [
        { name: "Maria Alvarez", text: updatedText },
        { name: "Diego Chen", text: "a completely different submission about something else entirely for grading" },
      ],
      testMintId
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows.some((r) => r.id === seed.rows[0].id && r.submissionText === updatedText)).toBe(true);
    expect(result.rows.some((r) => r.studentName === "Diego Chen" && r.id !== seed.rows[0].id)).toBe(true);
  });

  it("does not mutate the input rows array, tracked array, or their entries", () => {
    idCounter = 0;
    const seed = advanceGradingCapture([], [], [{ name: "Maria Alvarez", text: "original" }], testMintId);
    const rowsSnapshot = seed.rows[0];
    const trackedSnapshot = seed.tracked[0];
    advanceGradingCapture(seed.tracked, seed.rows, [{ name: "Maria Alvarez", text: "changed" }], testMintId);
    expect(seed.rows[0]).toBe(rowsSnapshot);
    expect(seed.rows[0].submissionText).toBe("original");
    expect(seed.tracked[0]).toBe(trackedSnapshot);
  });
});

describe("advanceGradingCapture - end-to-end with mergeExtractedSubmissions across two batches (Blocker 2)", () => {
  it("a submission whose top is read in batch 1 and whose body is read in batch 2 ends up as ONE row, not two, with progress preserved", () => {
    idCounter = 0;
    const batch1 = advanceGradingCapture(
      [],
      [],
      [
        {
          name: "Maria Alvarez",
          text: "Mitochondria are the powerhouse of the cell and they produce energy during the process of cellular respiration",
        },
      ],
      testMintId
    );
    expect(batch1.rows).toHaveLength(1);
    const rowId = batch1.rows[0].id;

    const rowsInProgress = batch1.rows.map((r) => ({ ...r, state: "grading" as const, totalScore: "7/10" }));

    const batch2 = advanceGradingCapture(
      batch1.tracked,
      rowsInProgress,
      [
        {
          name: "Maria Alvarez",
          text: "During the process of cellular respiration the cell converts glucose into usable energy in the form of ATP molecules for the organism to use",
        },
      ],
      testMintId
    );

    expect(batch2.mergedCount).toBe(1);
    expect(batch2.addedCount).toBe(0);
    expect(batch2.rows).toHaveLength(1);
    expect(batch2.rows[0].id).toBe(rowId);
    expect(batch2.rows[0].state).toBe("grading");
    expect(batch2.rows[0].totalScore).toBe("7/10");
    expect(batch2.rows[0].submissionText).toContain("powerhouse of the cell");
    expect(batch2.rows[0].submissionText).toContain("ATP molecules");
  });
});

// ---------------------------------------------------------------------------
// ORACLE-2 - the branch table (AC-A9-1, AC-A9-3, AC-A9-12). Four reachable
// branches, read off TrackedSubmission's own two discriminants plus the two
// set memberships: (1) dismissed; (2) live + byId.has; (3) live +
// minted.has; (4) live + neither. `byId.has AND minted.has` is excluded by
// construction: mintId returns a fresh id every call, so a minted id cannot
// already be a row id - building that input would need a value shape
// production cannot emit.
// ---------------------------------------------------------------------------
describe("advanceGradingCapture - ORACLE-2 branch table", () => {
  it("branch 1 (dismissed): emits no row and carries the entry forward unchanged, never resurrecting its old row from a stale rows array", () => {
    const dismissedEntry: TrackedSubmission = { name: "Gone Student", text: "some text here", rowId: "row-gone", dismissed: true };
    // A stale `rows` array still carrying the dismissed entry's row - this
    // is exactly the resurrection defect (a); the branch must refuse it.
    const staleRows = [makeRow({ id: "row-gone", studentName: "Gone Student" })];
    const result = advanceGradingCapture([dismissedEntry], staleRows, [], () => "unused");
    expect(result.rows.find((r) => r.id === "row-gone")).toBeUndefined();
    expect(result.rows).toHaveLength(0);
    expect(result.tracked).toEqual([dismissedEntry]);
  });

  it("branch 2 (live, byId.has): refreshes only studentName/submissionText, carries every other row field forward untouched", () => {
    const oldText = "the mitochondria is the powerhouse of the cell";
    const newText = "the mitochondria is the powerhouse of the cell and produces ATP";
    const tracked: TrackedSubmission[] = [{ name: "Maria Alvarez", text: oldText, rowId: "row-1", dismissed: false }];
    const rows = [
      makeRow({
        id: "row-1",
        state: "ready",
        totalScore: "8/10",
        strengths: "typed",
        improvements: "typed",
        overallComment: "typed",
        error: "",
        userEdited: true,
        nameMatch: "matched",
        rosterCandidates: ["Maria Alvarez"],
      }),
    ];
    const result = advanceGradingCapture(tracked, rows, [{ name: "Maria Alvarez", text: newText }], () => "unused");
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];
    expect(row.id).toBe("row-1");
    expect(row.submissionText).toBe(newText);
    expect(row.state).toBe("ready");
    expect(row.totalScore).toBe("8/10");
    expect(row.userEdited).toBe(true);
    expect(row.nameMatch).toBe("matched");
  });

  it("branch 3 (live, minted.has): a brand-new entry this call minted gets a blank row", () => {
    idCounter = 0;
    const result = advanceGradingCapture([], [], [{ name: "Diego Chen", text: "brand new submission text" }], testMintId);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe("minted-1");
    expect(result.rows[0].state).toBe("pending");
  });

  it("branch 4 (live, neither): a DIVERGENCE - never suppresses, never treats a missing row as a deletion. Emits a fresh row and reports the old id in divergentRowIds (AC-A9-12)", () => {
    const tracked: TrackedSubmission[] = [{ name: "Maria Alvarez", text: "orphaned entry text here", rowId: "row-missing", dismissed: false }];
    // No row "row-missing" in `rows` at all, and `dismissed` is false - this
    // must NOT be read as an instructor deletion.
    const result = advanceGradingCapture(tracked, [], [], () => "fresh-id");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe("fresh-id");
    expect(result.rows[0].studentName).toBe("Maria Alvarez");
    expect(result.divergentRowIds).toEqual(["row-missing"]);
    // The carried-forward entry now owns the fresh id, and is NOT dismissed.
    expect(result.tracked[0].rowId).toBe("fresh-id");
    expect(result.tracked[0].dismissed).toBe(false);
  });

  it("control: the order of independent tracked entries is a no-op - every cell stays green regardless of which is listed first", () => {
    const dismissedEntry: TrackedSubmission = { name: "Gone Student", text: "gone text here please", rowId: "row-gone", dismissed: true };
    const liveEntry: TrackedSubmission = { name: "Maria Alvarez", text: "live text here please", rowId: "row-1", dismissed: false };
    const rows = [makeRow({ id: "row-1" }), makeRow({ id: "row-gone", studentName: "Gone Student" })];

    const dismissedFirst = advanceGradingCapture([dismissedEntry, liveEntry], rows, [], () => "unused");
    expect(dismissedFirst.rows.map((r) => r.id)).toEqual(["row-1"]);

    const liveFirst = advanceGradingCapture([liveEntry, dismissedEntry], rows, [], () => "unused");
    expect(liveFirst.rows.map((r) => r.id)).toEqual(["row-1"]);
  });
});

// ---------------------------------------------------------------------------
// ORACLE-1 - misattribution (AC-A9-2), frozen literal. Three rows with
// distinct hand-written values and a frozen expected outcome, never computed
// from the input - the defect this closes is a row inheriting ANOTHER row's
// score/feedback/userEdited after a deletion shifts positions.
// ---------------------------------------------------------------------------
describe("advanceGradingCapture - ORACLE-1 misattribution, frozen literal", () => {
  function threeRowFixture() {
    const tracked: TrackedSubmission[] = [
      { name: "Student A", text: "student a submission text here", rowId: "r-a", dismissed: false },
      { name: "Student B", text: "student b submission text here", rowId: "r-b", dismissed: false },
      { name: "Student C", text: "student c submission text here", rowId: "r-c", dismissed: false },
    ];
    const rows = [
      makeRow({ id: "r-a", studentName: "Student A", totalScore: "1/10", strengths: "typed-a", userEdited: false }),
      makeRow({ id: "r-b", studentName: "Student B", totalScore: "2/10", strengths: "typed-b", userEdited: true }),
      makeRow({ id: "r-c", studentName: "Student C", totalScore: "3/10", strengths: "typed-c", userEdited: false }),
    ];
    return { tracked, rows };
  }

  it.each([0, 1, 2])(
    "deleting row index %i (removing it from `rows` only, tracked still has all three) never reassigns a survivor's score/feedback/userEdited to a different id",
    (deletedIndex) => {
      const { tracked, rows } = threeRowFixture();
      const remainingIds = ["r-a", "r-b", "r-c"].filter((_, i) => i !== deletedIndex);
      const rowsAfterDeletion = rows.filter((_, i) => i !== deletedIndex);

      // Next batch carries NO incoming submissions: this oracle isolates
      // what the advance does to the SURVIVING rows when `rows` and `tracked`
      // disagree by one, which is the misattribution defect's exact shape. A
      // re-read of the deleted submission is ORACLE-2's divergence branch and
      // is covered there; naming it here was wrong while `incoming` is [].
      // INCOMING IS LOAD-BEARING, and an empty batch made this oracle unable
      // to see its own defect. Misattribution IS the advance copying an
      // incoming submission's read fields onto the wrong row; with no
      // incoming submissions nothing is copied, so the frozen expectation
      // below held under a deliberately positional correlation. Every
      // surviving submission is re-read here, which is also the ordinary
      // case - an overlapping capture frame re-reads whoever is on screen.
      const incoming = tracked
        .filter((t) => remainingIds.includes(t.rowId))
        .map((t) => ({ name: t.name, text: t.text }));
      const result = advanceGradingCapture(tracked, rowsAfterDeletion, incoming, () => "minted-not-expected");

      // studentName is LOAD-BEARING here and its absence made this oracle
      // tautological. totalScore/strengths/userEdited all ride ON the row
      // object, so looking them up BY ID can never see a correlation defect -
      // measured: with positional correlation restored, all three cells stayed
      // green while the advance handed row r-b the name "Student A". The read
      // fields (studentName, submissionText) are the only ones the advance
      // copies off the submission, so they are the only ones that can land on
      // the wrong row. Do not remove them from this expectation.
      const expected: Record<
        string,
        { studentName: string; totalScore: string; strengths: string; userEdited: boolean }
      > = {
        "r-a": { studentName: "Student A", totalScore: "1/10", strengths: "typed-a", userEdited: false },
        "r-b": { studentName: "Student B", totalScore: "2/10", strengths: "typed-b", userEdited: true },
        "r-c": { studentName: "Student C", totalScore: "3/10", strengths: "typed-c", userEdited: false },
      };
      for (const id of remainingIds) {
        const row = result.rows.find((r) => r.id === id)!;
        expect(row, `expected surviving row ${id} to still be present`).toBeDefined();
        expect(row.studentName).toBe(expected[id].studentName);
        expect(row.totalScore).toBe(expected[id].totalScore);
        expect(row.strengths).toBe(expected[id].strengths);
        expect(row.userEdited).toBe(expected[id].userEdited);
      }
    }
  );
});

// ---------------------------------------------------------------------------
// ORACLE-3 - in-session continuation (AC-A9-5). Real merge, real
// findContinuationOverlap. Four batches: top, delete, body, tail.
// SABOTAGE NOTE (do not "fix" this test to go red at batch three): removing
// branch 1's carry-forward goes red at BATCH FOUR, not batch three - at
// batch 3 the body folds into the dismissed entry, emits no row, and under
// the sabotage the entry is DROPPED entirely, so `rows` is empty and step 5
// appends nothing - output is `[]`, which is what this test already expects
// at that point. Only at batch four, when the tail meets an now-empty
// accumulator and mints a fresh blank row, does the sabotage diverge from
// the correct (still-suppressed) behaviour.
// ---------------------------------------------------------------------------
describe("advanceGradingCapture - ORACLE-3 continuation stays suppressed across a dismissal, in session", () => {
  it("a dismissed entry keeps absorbing later continuations and never re-emits a row for them", () => {
    const topText = "Mitochondria are the powerhouse of the cell and they produce energy during the process of cellular respiration";
    const bodyText = "During the process of cellular respiration the cell converts glucose into usable energy in the form of ATP molecules for the organism";
    const tailText = "Of ATP molecules for the organism to use as fuel throughout every stage of its metabolic activity across the whole day";

    // Independent axis: the top and tail texts share nothing directly - the
    // suppression must survive purely via the tracked accumulator, not via
    // any leftover text-similarity between the endpoints.
    expect(findContinuationOverlap(topText, tailText)).toBeNull();
    expect(submissionTextSimilarityDistance(topText, tailText)).toBeGreaterThan(SIMILARITY_THRESHOLD);

    // Batch 1: top is read.
    const batch1 = advanceGradingCapture([], [], [{ name: "Maria Alvarez", text: topText }], testMintId);
    expect(batch1.rows).toHaveLength(1);

    // The instructor dismisses it (simulated directly here - the commit
    // mechanism itself is a later wave's job; this file's contract is that
    // branch 1 respects `dismissed` however it got set).
    const dismissedTracked: TrackedSubmission[] = batch1.tracked.map((t) => ({ ...t, dismissed: true }));

    // Batch 2 ("delete"): rows reflects the removal - now empty.
    const batch2 = advanceGradingCapture(dismissedTracked, [], [], () => "unused-2");
    expect(batch2.rows).toHaveLength(0);

    // Batch 3 ("body"): a continuation of the dismissed entry's text arrives.
    // It folds into the dismissed entry (still exact name + continuation
    // splice) and emits NO row.
    const batch3 = advanceGradingCapture(batch2.tracked, batch2.rows, [{ name: "Maria Alvarez", text: bodyText }], () => "unused-3");
    expect(batch3.rows).toHaveLength(0);
    expect(batch3.tracked).toHaveLength(1);
    expect(batch3.tracked[0].dismissed).toBe(true);
    expect(batch3.tracked[0].text).toContain("ATP molecules");

    // Batch 4 ("tail"): another continuation, splicing onto the body text
    // (and sharing nothing directly with the top text - see the independent
    // axis above). Must still emit NO row.
    const batch4 = advanceGradingCapture(batch3.tracked, batch3.rows, [{ name: "Maria Alvarez", text: tailText }], () => "unused-4");
    expect(batch4.rows).toHaveLength(0);
    expect(batch4.tracked).toHaveLength(1);
    expect(batch4.tracked[0].dismissed).toBe(true);
  });
});
