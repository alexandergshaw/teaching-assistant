// docs/grading-via-recording-acceptance-criteria.md R4/R4a/item 5.
//
// SABOTAGE CHECK LOG (verified by actually breaking the source and
// re-running, then reverting):
//   1. Widened GRADING_ROW_HAYSTACK (grading-row.ts) to a 3-tuple including
//      overallComment -> "GRADING_ROW_HAYSTACK returns exactly [studentName,
//      submissionText]" failed (toEqual length mismatch) as expected, and
//      "a query matching only feedback text finds nothing" ALSO failed (now
//      matching), proving the pin test would have caught a widened search.
//      Reverted (grading-row.ts is out of this file's scope to edit for
//      real, this was probe-only).
//   2. Inverted applyGradingResultToRow's `if (row.userEdited)` to
//      `if (!row.userEdited)` -> "an edited row's scored fields are never
//      overwritten by a re-grade" failed as expected (the edited row's
//      hand-typed strengths were replaced). Reverted.
//   3. Removed the `direction === "asc" ? cmp : -cmp` distinction by hard-
//      coding sortGradingRowsForTable's direction to "asc" regardless of the
//      `sort` argument -> "name-desc sorts descending" failed as expected.
//      Reverted (this would have meant re-testing compareNameKey itself,
//      which is discussion-table-view.ts's own file - the point of this
//      sabotage was confirming THIS file's direction-selection line, not
//      compareNameKey, is what the test actually exercises).

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  sortGradingRowsForTable,
  filterGradingRowsForTable,
  isGradingSort,
  editGradingRowField,
  applyGradingResultToRow,
  applyRosterMatchToRow,
  classifyGradingResult,
  GRADING_FAILURE_PREFIX,
  removeGradingRow,
  gradingClearTableSignature,
  GRADING_TABLE_COLUMN_COUNT,
  DEFAULT_GRADING_SORT,
} from "./grading-rows";
import { GRADING_ROW_HAYSTACK, type GradingRow } from "./grading-row";
import { filterRowsByQuery } from "../recording/discussion-table-view";

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
    ...overrides,
  };
}

describe("GRADING_ROW_HAYSTACK (R4a pin)", () => {
  it("returns exactly [studentName, submissionText], in that order - never the generated feedback", () => {
    const row = makeRow({
      studentName: "Maria Alvarez",
      submissionText: "The essay discusses causation.",
      strengths: "Maria shows strong analysis.",
      improvements: "Maria could cite more sources.",
      overallComment: "Great work, Maria.",
    });
    expect(GRADING_ROW_HAYSTACK(row)).toEqual(["Maria Alvarez", "The essay discusses causation."]);
  });

  it("a query that only appears in feedback text (not the name or submission) finds nothing - R4a's whole point", () => {
    const rows = [
      makeRow({ id: "a", studentName: "Zed Osei", submissionText: "unrelated content", overallComment: "Great argument, Zed." }),
      makeRow({ id: "b", studentName: "Zed Osei", submissionText: "unrelated content", overallComment: "no name mentioned here" }),
    ];
    // Both rows share the same name/submission text (so a name search would
    // find both); "Great argument" only appears in row a's FEEDBACK, which
    // the haystack excludes, so it must find neither row.
    expect(filterRowsByQuery(rows, "great argument", GRADING_ROW_HAYSTACK).map((r) => r.id)).toEqual([]);
  });

  it("is a real haystack for filterRowsByQuery - matches on submissionText", () => {
    const rows = [
      makeRow({ id: "a", studentName: "Zed", submissionText: "mentions kant here" }),
      makeRow({ id: "b", studentName: "Zed", submissionText: "no philosophy word" }),
    ];
    expect(filterRowsByQuery(rows, "kant", GRADING_ROW_HAYSTACK).map((r) => r.id)).toEqual(["a"]);
  });

  it("matches on studentName", () => {
    const rows = [makeRow({ id: "a", studentName: "Maria Alvarez" }), makeRow({ id: "b", studentName: "Diego Chen" })];
    expect(filterRowsByQuery(rows, "diego", GRADING_ROW_HAYSTACK).map((r) => r.id)).toEqual(["b"]);
  });
});

describe("filterGradingRowsForTable", () => {
  it("delegates to the shared filterRowsByQuery/GRADING_ROW_HAYSTACK pair rather than reimplementing filtering", () => {
    const rows = [makeRow({ id: "a", studentName: "Alpha" }), makeRow({ id: "b", studentName: "Beta" })];
    expect(filterGradingRowsForTable(rows, "beta").map((r) => r.id)).toEqual(
      filterRowsByQuery(rows, "beta", GRADING_ROW_HAYSTACK).map((r) => r.id)
    );
  });

  it("an empty query returns the input array BY REFERENCE (F9's discipline, inherited from filterRowsByQuery)", () => {
    const rows = [makeRow()];
    expect(filterGradingRowsForTable(rows, "")).toBe(rows);
  });
});

describe("sortGradingRowsForTable", () => {
  it("name-asc sorts ascending, case-insensitively", () => {
    const rows = [makeRow({ id: "a", studentName: "zed" }), makeRow({ id: "b", studentName: "Alvarez" }), makeRow({ id: "c", studentName: "maria" })];
    expect(sortGradingRowsForTable(rows, "name-asc").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("name-desc sorts descending", () => {
    const rows = [makeRow({ id: "a", studentName: "zed" }), makeRow({ id: "b", studentName: "Alvarez" }), makeRow({ id: "c", studentName: "maria" })];
    expect(sortGradingRowsForTable(rows, "name-desc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("a blank studentName sorts LAST in both directions (compareNameKey's own rule, inherited)", () => {
    const rows = [makeRow({ id: "a", studentName: "" }), makeRow({ id: "b", studentName: "Alvarez" })];
    expect(sortGradingRowsForTable(rows, "name-asc").map((r) => r.id)).toEqual(["b", "a"]);
    expect(sortGradingRowsForTable(rows, "name-desc").map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("does not mutate the input array", () => {
    const rows = [makeRow({ id: "a", studentName: "zed" }), makeRow({ id: "b", studentName: "alvarez" })];
    const original = rows.slice();
    sortGradingRowsForTable(rows, "name-asc");
    expect(rows).toEqual(original);
  });
});

describe("isGradingSort", () => {
  it("accepts both valid sorts", () => {
    expect(isGradingSort("name-asc")).toBe(true);
    expect(isGradingSort("name-desc")).toBe(true);
  });

  it("rejects an unrecognized/stale persisted value, garbage, and non-strings", () => {
    expect(isGradingSort("captured-asc")).toBe(false);
    expect(isGradingSort("")).toBe(false);
    expect(isGradingSort(null)).toBe(false);
    expect(isGradingSort(undefined)).toBe(false);
    expect(isGradingSort(42)).toBe(false);
  });

  it("DEFAULT_GRADING_SORT is itself a valid sort", () => {
    expect(isGradingSort(DEFAULT_GRADING_SORT)).toBe(true);
  });
});

describe("GRADING_TABLE_COLUMN_COUNT", () => {
  it("is 5 (Name / Name match / State / Score / Actions)", () => {
    expect(GRADING_TABLE_COLUMN_COUNT).toBe(5);
  });
});

describe("editGradingRowField (AC18-equivalent)", () => {
  it("sets the field, marks userEdited, and clears any stale error", () => {
    const row = makeRow({ state: "failed", error: "stale failure" });
    const next = editGradingRowField(row, "strengths", "Strong thesis.");
    expect(next.strengths).toBe("Strong thesis.");
    expect(next.userEdited).toBe(true);
    expect(next.error).toBe("");
  });

  it("promotes a pending row to ready", () => {
    const row = makeRow({ state: "pending" });
    expect(editGradingRowField(row, "totalScore", "8/10").state).toBe("ready");
  });

  it("promotes a failed row to ready", () => {
    const row = makeRow({ state: "failed" });
    expect(editGradingRowField(row, "overallComment", "Nice work.").state).toBe("ready");
  });

  it("leaves a grading/ready row's state untouched", () => {
    expect(editGradingRowField(makeRow({ state: "grading" }), "improvements", "x").state).toBe("grading");
    expect(editGradingRowField(makeRow({ state: "ready" }), "improvements", "x").state).toBe("ready");
  });

  it("does not mutate the input row", () => {
    const row = makeRow({ strengths: "original" });
    editGradingRowField(row, "strengths", "changed");
    expect(row.strengths).toBe("original");
    expect(row.userEdited).toBe(false);
  });
});

describe("applyGradingResultToRow (AC44-equivalent userEdited guard, item 5)", () => {
  const result = {
    totalScore: "9/10",
    strengths: "Machine strengths.",
    improvements: "Machine improvements.",
    overallComment: "Machine comment.",
    state: "ready" as const,
  };

  it("an UNEDITED row accepts the full result", () => {
    const row = makeRow({ userEdited: false });
    const next = applyGradingResultToRow(row, result);
    expect(next.totalScore).toBe("9/10");
    expect(next.strengths).toBe("Machine strengths.");
    expect(next.improvements).toBe("Machine improvements.");
    expect(next.overallComment).toBe("Machine comment.");
    expect(next.state).toBe("ready");
  });

  it("an EDITED row's scored fields are never overwritten by a re-grade - the whole point of item 5", () => {
    const row = makeRow({
      userEdited: true,
      totalScore: "10/10 (my own call)",
      strengths: "My own hand-typed strengths.",
      improvements: "My own hand-typed improvements.",
      overallComment: "My own hand-typed comment.",
    });
    const next = applyGradingResultToRow(row, result);
    expect(next.totalScore).toBe("10/10 (my own call)");
    expect(next.strengths).toBe("My own hand-typed strengths.");
    expect(next.improvements).toBe("My own hand-typed improvements.");
    expect(next.overallComment).toBe("My own hand-typed comment.");
  });

  it("an EDITED row's state and error still update from a fresh grading attempt - only the four scored fields are held back", () => {
    const row = makeRow({ userEdited: true, state: "grading" });
    const next = applyGradingResultToRow(row, { ...result, state: "failed", error: "Model call failed." });
    expect(next.state).toBe("failed");
    expect(next.error).toBe("Model call failed.");
    expect(next.userEdited).toBe(true);
  });

  it("a missing error on the result clears any stale error to empty string, not undefined/null", () => {
    const row = makeRow({ userEdited: false, error: "stale" });
    const next = applyGradingResultToRow(row, result);
    expect(next.error).toBe("");
  });
});

describe("applyRosterMatchToRow", () => {
  it("sets nameMatch and rosterCandidates regardless of userEdited - the roster verdict is not an instructor-editable field", () => {
    const row = makeRow({ userEdited: true, nameMatch: "no-roster", rosterCandidates: [] });
    const next = applyRosterMatchToRow(row, { nameMatch: "matched", rosterCandidates: ["Maria Alvarez"] });
    expect(next.nameMatch).toBe("matched");
    expect(next.rosterCandidates).toEqual(["Maria Alvarez"]);
  });

  it("never touches studentName - the read name stays verbatim (grading-row.ts's own rule)", () => {
    const row = makeRow({ studentName: "M. Alvarez (as read)" });
    const next = applyRosterMatchToRow(row, { nameMatch: "matched", rosterCandidates: ["Maria Alvarez"] });
    expect(next.studentName).toBe("M. Alvarez (as read)");
  });
});

// ---------------------------------------------------------------------------
// BLOCKER 3: classifyGradingResult - the ONE place that turns a
// gradeCapturedSubmissionsAction result (four feedback strings, no
// discriminator field) into applyGradingResultToRow's own GradingResultInput
// (state + error). Frozen literals throughout, matching the REAL shapes
// composeFailedGradingRow/gradeSubmission's catch branch actually produce -
// never a shape this repo's production code cannot emit.
// ---------------------------------------------------------------------------

describe("classifyGradingResult (BLOCKER 3 / FIX 2 - a failure must land in \"failed\" with its message in `error`, never a feedback field, decided by the real `failed` discriminator, never by sniffing `strengths`)", () => {
  it("an ordinary success maps to state \"ready\" with every field passed through unchanged", () => {
    const result = {
      totalScore: "9/10",
      strengths: "Strong thesis.",
      improvements: "Cite more sources.",
      overallComment: "Strong thesis. Cite more sources.",
      failed: false,
    };
    expect(classifyGradingResult(result)).toEqual({
      totalScore: "9/10",
      strengths: "Strong thesis.",
      improvements: "Cite more sources.",
      overallComment: "Strong thesis. Cite more sources.",
      state: "ready",
    });
  });

  it("a composeFailedGradingRow-shaped result (the real production shape) maps to \"failed\" with the verbatim message in `error`, and every feedback field blanked", () => {
    // The exact shape composeFailedGradingRow (grading-feedback-prompt.ts)
    // produces for message "Gemini rejected the request (400)." - totalScore
    // "", improvements "", strengths carrying the prefixed message,
    // overallComment composed from strengths alone (composeOverallComment
    // with empty improvements/resubmitNotice is a no-op join), and
    // failed: true.
    const result = {
      totalScore: "",
      strengths: "This submission could not be graded: Gemini rejected the request (400).",
      improvements: "",
      overallComment: "This submission could not be graded: Gemini rejected the request (400).",
      failed: true,
    };
    const next = classifyGradingResult(result);
    expect(next.state).toBe("failed");
    expect(next.error).toBe("Gemini rejected the request (400).");
    expect(next.totalScore).toBe("");
    expect(next.strengths).toBe("");
    expect(next.improvements).toBe("");
    expect(next.overallComment).toBe("");
  });

  it("the verbatim message survives exactly - not truncated, not re-worded, not generic", () => {
    const message = "network exploded, and then it kept exploding for another 12 seconds";
    const next = classifyGradingResult({
      totalScore: "",
      strengths: `${GRADING_FAILURE_PREFIX}${message}`,
      improvements: "",
      overallComment: `${GRADING_FAILURE_PREFIX}${message}`,
      failed: true,
    });
    expect(next.error).toBe(message);
  });

  it("a success whose strengths merely CONTAINS the failure prefix (not at the start) is never misclassified", () => {
    const result = {
      totalScore: "8/10",
      strengths: "The student wrote: \"This submission could not be graded: by a human, only by a machine.\"",
      improvements: "",
      overallComment: "fine",
      failed: false,
    };
    expect(classifyGradingResult(result).state).toBe("ready");
  });

  // ---------------------------------------------------------------------
  // FIX 2's actual point: the OLD classifier decided purely from
  // `strengths.startsWith(GRADING_FAILURE_PREFIX)`, so these next two cases
  // are exactly the two failure directions the brief names - a real success
  // whose authored feedback happens to OPEN with the pinned sentence (would
  // have been misclassified "failed" under the old code, wiping the
  // student's real feedback), and a real failure whose message has been
  // reworded so it no longer carries that literal prefix at all (would have
  // been misclassified "ready" under the old code, rendering the error
  // string as a finished green row's student-facing comment - the exact
  // BLOCKER 3 defect, reintroduced by a wording change). Both are decided
  // correctly here because the discriminator is a real boolean, never prose.
  // ---------------------------------------------------------------------

  it("a REAL success whose authored feedback happens to OPEN with the exact failure sentence is never misclassified as failed, because `failed` (not `strengths`) decides it", () => {
    const result = {
      totalScore: "10/10",
      strengths: "This submission could not be graded: that phrase is literally the title of the essay.",
      improvements: "",
      overallComment: "This submission could not be graded: that phrase is literally the title of the essay.",
      failed: false,
    };
    const next = classifyGradingResult(result);
    expect(next.state).toBe("ready");
    // The real feedback is preserved untouched - the old prefix-matching
    // classifier would have blanked all four fields here.
    expect(next.strengths).toBe(result.strengths);
    expect(next.overallComment).toBe(result.overallComment);
    expect(next.totalScore).toBe("10/10");
  });

  it("a REAL failure whose message has been reworded so it no longer starts with GRADING_FAILURE_PREFIX at all is still classified failed, because `failed` (not the prefix) decides it", () => {
    const result = {
      totalScore: "",
      strengths: "Grading failed for this submission - the model timed out after 30 seconds.",
      improvements: "",
      overallComment: "Grading failed for this submission - the model timed out after 30 seconds.",
      failed: true,
    };
    const next = classifyGradingResult(result);
    expect(next.state).toBe("failed");
    // No pinned prefix to strip, so the whole message is kept verbatim as
    // the error - never silently dropped, and never left inside a feedback
    // field pretending to be a finished row.
    expect(next.error).toBe("Grading failed for this submission - the model timed out after 30 seconds.");
    expect(next.strengths).toBe("");
    expect(next.overallComment).toBe("");
  });
});

describe("removeGradingRow (\"no row can be removed\" fix)", () => {
  it("removes exactly the row with the matching id, leaving the others untouched and in order", () => {
    const rows = [makeRow({ id: "a" }), makeRow({ id: "b" }), makeRow({ id: "c" })];
    expect(removeGradingRow(rows, "b").map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("an id not present in the table is a no-op that returns the SAME array reference", () => {
    const rows = [makeRow({ id: "a" })];
    expect(removeGradingRow(rows, "missing")).toBe(rows);
  });

  it("does not mutate the input array", () => {
    const rows = [makeRow({ id: "a" }), makeRow({ id: "b" })];
    const original = rows.slice();
    removeGradingRow(rows, "a");
    expect(rows).toEqual(original);
  });
});

describe("gradingClearTableSignature (\"Clear table\" confirm-arm signature - AC19/AC19a discipline)", () => {
  it("is built from the row count alone", () => {
    expect(gradingClearTableSignature(0)).toBe("0");
    expect(gradingClearTableSignature(3)).toBe("3");
    expect(gradingClearTableSignature(42)).toBe("42");
  });

  it("changes when the row count changes - a landed row disarms a stale confirmation", () => {
    expect(gradingClearTableSignature(3)).not.toBe(gradingClearTableSignature(4));
  });

  it("is stable for the same count - re-arming compares equal to the CURRENT signature, not a snapshot in time", () => {
    expect(gradingClearTableSignature(5)).toBe(gradingClearTableSignature(5));
  });
});

// ---------------------------------------------------------------------------
// Self-contained localStorage key canary for this directory
// (src/app/components/grading-recording/), mirroring
// recording/recording-split.structure.test.ts's own "localStorage key
// canary" section - that check scans src/app/components/recording/ with
// fs.readdirSync and cannot see this directory at all (different path), so
// a persisted control added here needs its OWN canary rather than silently
// riding on that one. Two facts checked, same as that file's own "hole 1"
// blocks: (1) the exact set of ta-rec-grade-* keys this directory uses, so
// a stray/typo'd key or a silently-added third one is caught, and (2) every
// key in that set has both a read AND a write call wired to its literal
// string - proven necessary by useDiscussionRepliesRunLog's own sibling
// canary catching a deleted write with the read (and the key string itself)
// left untouched.
//
// AC55-style discipline: this describe block itself must never spell out
// the bare "ta-rec-grade-" prefix followed by nothing - doing so would be
// harvested by ITS OWN regex below as a fake key with an empty suffix
// (useReplyRows.ts's STORAGE_KEY_TABLE comment documents this exact
// footgun). Every mention of a key in this file's comments is the FULL
// literal key ("ta-rec-grade-filter" / "ta-rec-grade-sort" /
// "ta-rec-grade-course" / "ta-rec-grade-table"), never a bare prefix.
//
// "ta-rec-grade-course" (the panel's course picker, for R3a roster
// matching) was added by GradingRecordingPanel.tsx, which lives in this same
// directory and is therefore already covered by `files`/`combined` below
// with no change to the scan itself - only the two expectation lists needed
// updating.
//
// "ta-rec-grade-table" (THE GAP fix - the row array itself, not just
// filter/sort) was added by useGradingRows.ts, which also already lives in
// this same directory - same story, only the two expectation lists below
// needed updating, again with no change to the scan itself.
// ---------------------------------------------------------------------------

describe("grading-recording persisted key canary (self-contained - recording-split.structure.test.ts cannot see this directory)", () => {
  const dir = path.resolve(process.cwd(), "src/app/components/grading-recording");
  const files = fs.readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
  const combined = files.map((f) => fs.readFileSync(path.join(dir, f), "utf-8")).join("\n");

  it("finds at least one ta-rec-grade-prefixed key to check - a check over nothing proves nothing", () => {
    const keys = combined.match(/ta-rec-grade-[a-z-]*/g) ?? [];
    expect(keys.length).toBeGreaterThan(0);
  });

  it("has exactly the expected set of persisted keys (filter, sort, course, table)", () => {
    const keys = Array.from(new Set(combined.match(/ta-rec-grade-[a-z-]*/g) ?? [])).sort();
    expect(keys).toEqual(["ta-rec-grade-course", "ta-rec-grade-filter", "ta-rec-grade-sort", "ta-rec-grade-table"]);
  });

  // Mirrors recording-split.structure.test.ts's own isWired helper: a key
  // may be wired DIRECTLY (the literal string is itself the argument of the
  // read/write call) or INDIRECTLY (bound to a `const NAME = "key"`
  // identifier, with that identifier - not the literal - at the call site,
  // which is what useGradingRows.ts actually does for these two keys, the
  // same STORAGE_KEY_* shape useReplyRows.ts uses for its own three keys).
  // Either shape counts as wired.
  function isWired(key: string, callKind: "read" | "write"): boolean {
    const directPattern =
      callKind === "read"
        ? new RegExp(`localStorage\\.getItem\\(\\s*["']${key}["']\\s*\\)`)
        : new RegExp(`localStorage\\.setItem\\(\\s*["']${key}["']\\s*,`);
    if (directPattern.test(combined)) return true;

    const constNames = Array.from(combined.matchAll(new RegExp(`const\\s+(\\w+)\\s*=\\s*["']${key}["']`, "g"))).map(
      (m) => m[1]
    );
    if (constNames.length === 0) return false;

    return constNames.some((name) => {
      const pattern =
        callKind === "read"
          ? new RegExp(`localStorage\\.getItem\\(\\s*${name}\\s*\\)`)
          : new RegExp(`localStorage\\.setItem\\(\\s*${name}\\s*,`);
      return pattern.test(combined);
    });
  }

  it.each(["ta-rec-grade-filter", "ta-rec-grade-sort", "ta-rec-grade-course", "ta-rec-grade-table"])(
    '"%s" has both a localStorage read and a localStorage write call wired to that key (directly, or via a const STORAGE_KEY_* binding)',
    (key) => {
      expect(isWired(key, "read"), `expected a localStorage read call wired to "${key}"`).toBe(true);
      expect(isWired(key, "write"), `expected a localStorage write call wired to "${key}"`).toBe(true);
    }
  );
});
