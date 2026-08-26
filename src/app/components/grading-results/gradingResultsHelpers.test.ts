// Oracle for the pure extraction in gradingResultsHelpers.ts.
//
// Every expected value below is a FROZEN LITERAL obtained by running the
// CURRENT (pre-extraction) implementation from GradingResults.tsx in
// isolation - a standalone copy of the original source, executed with plain
// node, independent of both the old and new files - and pasting its actual
// output. None of these expectations are computed by calling the function
// under test and asserting it equals itself; that would be the tautology
// this repo has been burned by before (see AGENTS.md / project memory on
// "refactors disarm tests"). If a future change to these helpers alters
// their output, these literals will NOT move to match it - the test will
// fail, as intended.
//
// buildCsvContent had ZERO test coverage before this file existed. Its
// "CSV-escaping edge case" test below is the actual oracle for that: a
// student name and comment containing a comma, a double quote, and an
// embedded newline all at once. A second assertion in that same test proves
// the oracle has teeth by running a deliberately BROKEN CSV builder (no
// quoting, no quote-doubling, no CRLF normalization) through the identical
// input and confirming its output is NOT what a broken implementation would
// produce - i.e. this test would fail against broken escaping.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SORT,
  FEEDBACK_FIELDS,
  FEEDBACK_FIELD_META,
  applyFeedbackFieldEdit,
  blankRowEdit,
  buildCsvContent,
  compareText,
  composeOverallCommentLocal,
  defaultRowEdit,
  escapeCsvCell,
  formatFeedback,
  formatPoints,
  gradingResultsEditsKey,
  loadGradingResultsEdits,
  loadPersistedEdits,
  mergeStoredRowEdit,
  parseDenominator,
  parseEarnedPoints,
  parseScoreValue,
  persistGradingResultsEdits,
  recomputeTotal,
  seedEdits,
  sortColumnKey,
  type AreaEdit,
  type GradingRun,
  type RowEdit,
} from "./gradingResultsHelpers";
// Safe ONLY here: this is a test file, never bundled to the client. See
// composeOverallCommentLocal's own doc comment in gradingResultsHelpers.ts
// for why the file under test does NOT import this itself.
import { composeOverallComment } from "@/lib/grade";

describe("DEFAULT_SORT", () => {
  it("sorts by student ascending", () => {
    expect(DEFAULT_SORT).toEqual({ column: { kind: "student" }, direction: "asc" });
  });
});

describe("sortColumnKey", () => {
  it("returns the bare kind for non-rubric columns", () => {
    expect(sortColumnKey({ kind: "student" })).toBe("student");
  });

  it("namespaces rubric columns by area", () => {
    expect(sortColumnKey({ kind: "rubric", area: "Code Quality" })).toBe("rubric:Code Quality");
  });
});

describe("compareText", () => {
  it("is case-insensitive and locale-aware", () => {
    expect(compareText("banana", "Apple")).toBe(1);
  });

  it("compares numeric substrings numerically", () => {
    expect(compareText("item2", "item10")).toBe(-1);
  });

  it("returns 0 for equal strings", () => {
    expect(compareText("same", "same")).toBe(0);
  });
});

describe("parseEarnedPoints", () => {
  it("extracts the numerator of a fraction", () => {
    expect(parseEarnedPoints("8/10")).toBe("8");
  });

  it("extracts a bare number when there is no fraction", () => {
    expect(parseEarnedPoints("85%")).toBe("85");
  });

  it("returns an empty string for no input", () => {
    expect(parseEarnedPoints("")).toBe("");
  });

  it("returns an empty string when there are no digits", () => {
    expect(parseEarnedPoints("no numbers here")).toBe("");
  });

  it("preserves a negative numerator", () => {
    expect(parseEarnedPoints("-3/5")).toBe("-3");
  });
});

describe("parseScoreValue", () => {
  it("parses the leading number out of a fraction", () => {
    expect(parseScoreValue("8/10")).toBe(8);
  });

  it("parses a decimal", () => {
    expect(parseScoreValue("7.5")).toBe(7.5);
  });

  it("returns null for an empty string", () => {
    expect(parseScoreValue("")).toBeNull();
  });

  it("returns null when there is no number", () => {
    expect(parseScoreValue("abc")).toBeNull();
  });

  it("parses a negative decimal", () => {
    expect(parseScoreValue("-2.5")).toBe(-2.5);
  });
});

describe("parseDenominator", () => {
  it("extracts the integer denominator", () => {
    expect(parseDenominator("8/10")).toBe(10);
  });

  it("returns null when there is no denominator", () => {
    expect(parseDenominator("8")).toBeNull();
  });

  it("extracts a decimal denominator, tolerating surrounding spaces", () => {
    expect(parseDenominator("8 / 12.5")).toBe(12.5);
  });
});

describe("formatPoints", () => {
  it("renders an integer with no decimal", () => {
    expect(formatPoints(8)).toBe("8");
  });

  it("renders a half-point value", () => {
    expect(formatPoints(7.5)).toBe("7.5");
  });

  it("rounds to two decimal places", () => {
    expect(formatPoints(7.526)).toBe("7.53");
  });

  it("preserves a negative integer", () => {
    expect(formatPoints(-3)).toBe("-3");
  });
});

describe("formatFeedback", () => {
  // This is the LOCAL formatFeedback (originally GradingResults.tsx:161),
  // which collapses em/en dashes to ", " in a single feedback string. It is
  // unrelated to src/lib/grade/parsing.ts:232's formatFeedback, which takes
  // a comment plus rubric areas plus a total score and returns a composed
  // block - a different function with a different signature.
  it("replaces em and en dashes with a comma", () => {
    expect(formatFeedback("Good work – nice job — well done")).toBe(
      "Good work, nice job, well done"
    );
  });

  it("leaves text with no dashes unchanged", () => {
    expect(formatFeedback("no dashes here")).toBe("no dashes here");
  });
});

describe("escapeCsvCell", () => {
  it("quotes the value and doubles embedded quotes, normalizing CRLF to LF", () => {
    expect(escapeCsvCell('He said "hi", then\r\nleft')).toBe(
      '"He said ""hi"", then\nleft"'
    );
  });

  it("quotes a plain value with no special characters", () => {
    expect(escapeCsvCell("plain")).toBe('"plain"');
  });
});

describe("seedEdits", () => {
  // FROZEN LITERAL, updated deliberately for this feature (not weakened):
  // GradeResult (src/lib/grade/types.ts) gained three REQUIRED fields -
  // strengths, improvements, resubmitNotice - as its own change ahead of
  // this one (docs/grading-results-feedback-boxes-acceptance-criteria.md
  // A1 item 1), and seedEdits' contract is "one RowEdit per result", so its
  // output necessarily grew the same three fields. The three NEW expected
  // values below are copied verbatim from the two new fixture fields they
  // seed from (seedEdits does no transformation on them, exactly like
  // `overall`/`total`), so this remains a real oracle, not a tautology: a
  // seedEdits that dropped, renamed, or mis-copied one of the three new
  // fields would still fail this assertion.
  it("seeds one RowEdit per result, keyed by student name", () => {
    const run: GradingRun = {
      results: [
        {
          student: "Alice Smith",
          totalScore: "18/20",
          overallComment: "Great job overall.",
          strengths: "Clear logic and good naming.",
          improvements: "Add more comments.",
          resubmitNotice: "",
          rubricAreas: [
            { area: "Code Quality", score: "9/10" },
            { area: "Correctness", score: "9/10" },
          ],
        },
        {
          student: "Bob Jones",
          totalScore: "15/20",
          overallComment: "Needs improvement.",
          strengths: "Solid effort.",
          improvements: "Fix the off-by-one bug.",
          resubmitNotice:
            "You are welcome to resubmit this assignment, and I will regrade it with no late penalty.",
          rubricAreas: [
            { area: "Code Quality", score: "7/10" },
            { area: "Correctness", score: "8/10" },
          ],
        },
      ],
    } as unknown as GradingRun;

    expect(seedEdits(run)).toEqual({
      "Alice Smith": {
        total: "18/20",
        overall: "Great job overall.",
        strengths: "Clear logic and good naming.",
        improvements: "Add more comments.",
        resubmitNotice: "",
        areas: { "Code Quality": { score: "9/10" }, Correctness: { score: "9/10" } },
      },
      "Bob Jones": {
        total: "15/20",
        overall: "Needs improvement.",
        strengths: "Solid effort.",
        improvements: "Fix the off-by-one bug.",
        resubmitNotice:
          "You are welcome to resubmit this assignment, and I will regrade it with no late penalty.",
        areas: { "Code Quality": { score: "7/10" }, Correctness: { score: "8/10" } },
      },
    });
  });
});

describe("recomputeTotal", () => {
  const areaNames = ["Code Quality", "Correctness"];

  it("sums summed denominators when the current total has none", () => {
    const areas: Record<string, AreaEdit> = {
      "Code Quality": { score: "9/10" },
      Correctness: { score: "8/10" },
    };
    expect(recomputeTotal(areas, areaNames, "17")).toBe("17/20");
  });

  it("keeps the current total's own denominator", () => {
    const areas: Record<string, AreaEdit> = {
      "Code Quality": { score: "9/10" },
      Correctness: { score: "8/10" },
    };
    expect(recomputeTotal(areas, areaNames, "17/20")).toBe("17/20");
  });

  it("drops the denominator entirely when a criterion is blank and the current total has none", () => {
    const areas: Record<string, AreaEdit> = {
      "Code Quality": { score: "9/10" },
      Correctness: { score: "" },
    };
    expect(recomputeTotal(areas, areaNames, "17")).toBe("9");
  });

  it("returns the current total unchanged when no criterion has a numeric score", () => {
    const areas: Record<string, AreaEdit> = {
      "Code Quality": { score: "" },
      Correctness: { score: "" },
    };
    expect(recomputeTotal(areas, areaNames, "17/20")).toBe("17/20");
  });

  it("sums bare (denominator-less) scores", () => {
    const areas: Record<string, AreaEdit> = {
      "Code Quality": { score: "9" },
      Correctness: { score: "8" },
    };
    expect(recomputeTotal(areas, areaNames, "17")).toBe("17");
  });
});

describe("buildCsvContent", () => {
  // FROZEN LITERAL, updated deliberately for this feature (not weakened):
  // A5 item 20 (docs/grading-results-feedback-boxes-acceptance-criteria.md)
  // decided the CSV's answer for the three feedback texts is THREE SEPARATE
  // COLUMNS - "Strengths", "Improvements", "Resubmit Notice" - replacing the
  // single "Overall Comment" column this test used to pin. The Canvas
  // comment (unaffected by this change) keeps reading the composed
  // `overall`/`overallComment` instead - see GradingResults.tsx's
  // handlePostGrades/handlePostOne, which this file's helpers do not touch.
  it("builds header + one row per result, edits taking priority over the seeded value", () => {
    const run: GradingRun = {
      rubricAreaNames: ["Code Quality", "Correctness"],
      results: [
        {
          student: "Alice Smith",
          totalScore: "18/20",
          overallComment: "Great job overall.",
          strengths: "Concise and correct implementation.",
          improvements: "Add input validation.",
          resubmitNotice: "",
          rubricAreas: [
            { area: "Code Quality", score: "9/10" },
            { area: "Correctness", score: "9/10" },
          ],
          submittedFiles: [
            { name: "main.py", extension: "py" },
            { name: "test.py", extension: "py" },
          ],
        },
      ],
    } as unknown as GradingRun;
    const edits: Record<string, RowEdit> = {
      "Alice Smith": {
        total: "18/20",
        overall: "Great job overall.",
        strengths: "Concise and correct implementation.",
        improvements: "Add input validation.",
        resubmitNotice: "",
        areas: { "Code Quality": { score: "9/10" }, Correctness: { score: "9/10" } },
      },
    };

    expect(buildCsvContent(run, edits)).toBe(
      '"Student","Code Quality Score","Correctness Score","Total Score","Strengths","Improvements","Resubmit Notice","Submitted Files","Submitted Extensions"\n' +
        '"Alice Smith","9/10","9/10","18/20","Concise and correct implementation.","Add input validation.","","main.py; test.py","py"'
    );
  });

  // The CSV-escaping oracle: a comma, a double quote, AND an embedded newline
  // in the same fields, all at once - the classic case a naive CSV builder
  // gets wrong. buildCsvContent had no test at all before gradingResultsHelpers.ts
  // existed. FROZEN LITERAL, updated deliberately for this feature: the
  // torture-test content moves from `overallComment` (no longer a CSV
  // column) onto `improvements` (now a real column), and the student/quote
  // escaping substring is reused byte-for-byte from the pre-existing
  // literal, since escapeCsvCell's own logic is unchanged.
  it("escapes a comma, a double quote, and an embedded newline together (the CSV-escaping oracle)", () => {
    const run: GradingRun = {
      rubricAreaNames: ["Code Quality"],
      results: [
        {
          student: 'Smith, "Al"',
          totalScore: "10/10",
          overallComment: 'Great job, "well done"\nKeep it up',
          strengths: "Great job",
          improvements: 'Great job, "well done"\nKeep it up',
          resubmitNotice: "",
          rubricAreas: [{ area: "Code Quality", score: "10/10" }],
          submittedFiles: [{ name: "a.py", extension: "py" }],
        },
      ],
    } as unknown as GradingRun;

    const expected =
      '"Student","Code Quality Score","Total Score","Strengths","Improvements","Resubmit Notice","Submitted Files","Submitted Extensions"\n' +
      '"Smith, ""Al""","10/10","10/10","Great job","Great job, ""well done""\nKeep it up","","a.py","py"';

    const actual = buildCsvContent(run, {});
    expect(actual).toBe(expected);

    // Prove the oracle has teeth: a deliberately BROKEN CSV builder (no
    // quoting, no quote-doubling, no CRLF normalization) run through the
    // exact same input produces a DIFFERENT string than the correct one
    // above - so this test would fail if buildCsvContent's escaping broke.
    const brokenCsvCell = (value: string) => value;
    const brokenRow = [
      run.results[0].student,
      run.results[0].rubricAreas[0].score,
      run.results[0].totalScore,
      run.results[0].strengths,
      run.results[0].improvements,
      run.results[0].resubmitNotice,
      run.results[0].submittedFiles[0].name,
      run.results[0].submittedFiles[0].extension,
    ]
      .map(brokenCsvCell)
      .join(",");
    expect(brokenRow).toBe(
      'Smith, "Al",10/10,10/10,Great job,Great job, "well done"\nKeep it up,,a.py,py'
    );
    expect(actual).not.toBe(
      'Student,Code Quality Score,Total Score,Strengths,Improvements,Resubmit Notice,Submitted Files,Submitted Extensions\n' +
        brokenRow
    );
  });
});

// ── A2/A3 additions (docs/grading-results-feedback-boxes-acceptance-criteria.md) ──

describe("FEEDBACK_FIELD_META", () => {
  it("never invents fallback copy text for resubmitNotice (an empty box there is the honest, full-credit state)", () => {
    expect(FEEDBACK_FIELD_META.resubmitNotice.emptyCopyFallback).toBe("");
  });

  it("has an entry for every field in FEEDBACK_FIELDS, and vice versa", () => {
    expect(Object.keys(FEEDBACK_FIELD_META).sort()).toEqual([...FEEDBACK_FIELDS].sort());
  });
});

describe("blankRowEdit", () => {
  it("returns an all-empty RowEdit", () => {
    expect(blankRowEdit()).toEqual({
      total: "",
      overall: "",
      strengths: "",
      improvements: "",
      resubmitNotice: "",
      areas: {},
    });
  });
});

describe("defaultRowEdit", () => {
  it("seeds total/overall/strengths/improvements/resubmitNotice from the result, with empty areas", () => {
    const result = {
      totalScore: "9/10",
      overallComment: "Nice work. Fix the edge case.",
      strengths: "Nice work.",
      improvements: "Fix the edge case.",
      resubmitNotice: "",
    } as unknown as Parameters<typeof defaultRowEdit>[0];

    expect(defaultRowEdit(result)).toEqual({
      total: "9/10",
      overall: "Nice work. Fix the edge case.",
      strengths: "Nice work.",
      improvements: "Fix the edge case.",
      resubmitNotice: "",
      areas: {},
    });
  });
});

describe("applyFeedbackFieldEdit", () => {
  const baseRow: RowEdit = {
    total: "8/10",
    overall: "Old composed text",
    strengths: "Good structure.",
    improvements: "Add tests.",
    resubmitNotice: "You are welcome to resubmit this assignment, and I will regrade it with no late penalty.",
    areas: {},
  };

  it("patches the given field and leaves the others untouched", () => {
    const next = applyFeedbackFieldEdit(baseRow, "improvements", "Add more tests.");
    expect(next.improvements).toBe("Add more tests.");
    expect(next.strengths).toBe(baseRow.strengths);
    expect(next.resubmitNotice).toBe(baseRow.resubmitNotice);
    expect(next.total).toBe(baseRow.total);
  });

  it("recomputes `overall` as composeOverallComment's output, in strengths/improvements/resubmitNotice order", () => {
    const next = applyFeedbackFieldEdit(baseRow, "strengths", "Great structure.");
    expect(next.overall).toBe(
      "Great structure. Add tests. You are welcome to resubmit this assignment, and I will regrade it with no late penalty."
    );
  });

  it("drops the notice from `overall` when resubmitNotice is edited to empty (full credit)", () => {
    const next = applyFeedbackFieldEdit(baseRow, "resubmitNotice", "");
    expect(next.overall).toBe("Good structure. Add tests.");
  });

  it("never leaves `overall` inconsistent with the three parts it composes", () => {
    let row = baseRow;
    for (const field of FEEDBACK_FIELDS) {
      row = applyFeedbackFieldEdit(row, field, `edited ${field}`);
      expect(row.overall).toBe([row.strengths, row.improvements, row.resubmitNotice].join(" "));
    }
  });
});

describe("gradingResultsEditsKey", () => {
  it("scopes the key to the assignment's canvasUrl", () => {
    expect(gradingResultsEditsKey("https://canvas.example.edu/courses/1/assignments/2")).toBe(
      "ta-grading-results-edits:https://canvas.example.edu/courses/1/assignments/2"
    );
  });

  it("produces different keys for different assignments (the leak this key exists to prevent)", () => {
    const keyA = gradingResultsEditsKey("https://canvas.example.edu/courses/1/assignments/2");
    const keyB = gradingResultsEditsKey("https://canvas.example.edu/courses/9/assignments/9");
    expect(keyA).not.toBe(keyB);
  });
});

describe("mergeStoredRowEdit", () => {
  const fallback: RowEdit = {
    total: "10/10",
    overall: "Seeded overall",
    strengths: "Seeded strengths",
    improvements: "Seeded improvements",
    resubmitNotice: "Seeded notice",
    areas: { "Code Quality": { score: "10/10" } },
  };

  it("takes each valid stored field over the fallback, and recomputes overall from the restored parts", () => {
    const stored = {
      total: "8/10",
      strengths: "Stored strengths",
      improvements: "Stored improvements",
      resubmitNotice: "",
      areas: { "Code Quality": { score: "8/10" } },
    };
    expect(mergeStoredRowEdit(stored, fallback)).toEqual({
      total: "8/10",
      overall: "Stored strengths Stored improvements",
      strengths: "Stored strengths",
      improvements: "Stored improvements",
      resubmitNotice: "",
      areas: { "Code Quality": { score: "8/10" } },
    });
  });

  it("falls back field-by-field when a stored field is missing or the wrong type", () => {
    const stored = { strengths: "Stored strengths", improvements: 42, areas: "not an object" };
    const merged = mergeStoredRowEdit(stored, fallback);
    expect(merged.total).toBe(fallback.total); // missing -> fallback
    expect(merged.strengths).toBe("Stored strengths"); // valid -> stored
    expect(merged.improvements).toBe(fallback.improvements); // wrong type -> fallback
    expect(merged.areas).toEqual(fallback.areas); // wrong type -> fallback
  });

  it("never trusts a stored `overall` - always recomputes it from the restored three parts", () => {
    const stored = {
      overall: "a stale or hand-edited value that does not match the parts below",
      strengths: "S",
      improvements: "I",
      resubmitNotice: "",
    };
    expect(mergeStoredRowEdit(stored, fallback).overall).toBe("S I");
  });

  it("degrades entirely to the fallback's own fields for null, a primitive, or an array - " +
    "but STILL recomputes overall rather than trusting fallback.overall verbatim " +
    "(fallback.overall is deliberately mismatched from its own three parts above, to prove this)", () => {
    const expectedFromFallback = {
      ...fallback,
      overall: "Seeded strengths Seeded improvements Seeded notice",
    };
    expect(mergeStoredRowEdit(null, fallback)).toEqual(expectedFromFallback);
    expect(mergeStoredRowEdit("not an object", fallback)).toEqual(expectedFromFallback);
    expect(mergeStoredRowEdit([1, 2, 3], fallback)).toEqual(expectedFromFallback);
  });
});

describe("loadPersistedEdits", () => {
  const run: GradingRun = {
    results: [
      {
        student: "Alice Smith",
        totalScore: "18/20",
        overallComment: "Great job overall.",
        strengths: "Great job.",
        improvements: "",
        resubmitNotice: "",
        rubricAreas: [{ area: "Code Quality", score: "9/10" }],
      },
    ],
  } as unknown as GradingRun;

  it("returns the seeded map when raw is null", () => {
    expect(loadPersistedEdits(null, run)).toEqual(seedEdits(run));
  });

  it("returns the seeded map when raw is malformed JSON", () => {
    expect(loadPersistedEdits("{not json", run)).toEqual(seedEdits(run));
  });

  it("returns the seeded map when the parsed top level is an array", () => {
    expect(loadPersistedEdits("[1,2,3]", run)).toEqual(seedEdits(run));
  });

  it("merges a valid stored row onto the seeded row for a student in the current run", () => {
    const raw = JSON.stringify({
      "Alice Smith": { total: "20/20", strengths: "Excellent.", improvements: "", resubmitNotice: "" },
    });
    const result = loadPersistedEdits(raw, run);
    expect(result["Alice Smith"].total).toBe("20/20");
    expect(result["Alice Smith"].strengths).toBe("Excellent.");
  });

  it("drops a student who is not in the current run rather than resurrecting a phantom row", () => {
    const raw = JSON.stringify({
      "Alice Smith": { total: "20/20", strengths: "", improvements: "", resubmitNotice: "" },
      "Ghost Student": { total: "0/20", strengths: "should never appear", improvements: "", resubmitNotice: "" },
    });
    const result = loadPersistedEdits(raw, run);
    expect(Object.keys(result)).toEqual(["Alice Smith"]);
  });
});

describe("localStorage-backed persistence (loadGradingResultsEdits / persistGradingResultsEdits)", () => {
  // Same in-memory Storage stub as src/app/components/repo-grades/repoGradesUiState.test.ts:
  // vitest.config.ts runs with environment: "node", so there is no window/
  // localStorage global by default.
  class FakeStorage {
    private store = new Map<string, string>();
    throwOnSet = false;

    getItem(key: string): string | null {
      return this.store.has(key) ? (this.store.get(key) as string) : null;
    }

    setItem(key: string, value: string): void {
      if (this.throwOnSet) throw new Error("quota exceeded (simulated)");
      this.store.set(key, value);
    }
  }

  let fakeStorage: FakeStorage;
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

  const run: GradingRun = {
    results: [
      {
        student: "Alice Smith",
        totalScore: "18/20",
        overallComment: "Great job overall.",
        strengths: "Great job.",
        improvements: "",
        resubmitNotice: "",
        rubricAreas: [],
      },
    ],
  } as unknown as GradingRun;

  beforeEach(() => {
    fakeStorage = new FakeStorage();
    (globalThis as { window?: unknown }).window = globalThis;
    (globalThis as { localStorage?: unknown }).localStorage = fakeStorage;
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
    (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
  });

  it("returns the seeded map when window is undefined (SSR)", () => {
    (globalThis as { window?: unknown }).window = undefined;
    expect(loadGradingResultsEdits("https://canvas.example.edu/a/1", run)).toEqual(seedEdits(run));
  });

  it("round-trips a persisted edit under the assignment-scoped key", () => {
    const canvasUrl = "https://canvas.example.edu/courses/1/assignments/2";
    const seeded = seedEdits(run);
    const edited = applyFeedbackFieldEdit(seeded["Alice Smith"], "strengths", "Outstanding work.");
    persistGradingResultsEdits(canvasUrl, { ...seeded, "Alice Smith": edited });

    expect(fakeStorage.getItem(gradingResultsEditsKey(canvasUrl))).not.toBeNull();
    const restored = loadGradingResultsEdits(canvasUrl, run);
    expect(restored["Alice Smith"].strengths).toBe("Outstanding work.");
  });

  it("keeps a different canvasUrl's persisted edits untouched (the leak A3 item 12 guards against)", () => {
    const urlA = "https://canvas.example.edu/courses/1/assignments/2";
    const urlB = "https://canvas.example.edu/courses/9/assignments/9";
    const seeded = seedEdits(run);
    const edited = applyFeedbackFieldEdit(seeded["Alice Smith"], "strengths", "Only for assignment A.");
    persistGradingResultsEdits(urlA, { ...seeded, "Alice Smith": edited });

    const restoredB = loadGradingResultsEdits(urlB, run);
    expect(restoredB["Alice Smith"].strengths).toBe("Great job."); // seeded, not leaked from A
  });

  it("swallows a write failure (quota, private browsing) instead of throwing", () => {
    fakeStorage.throwOnSet = true;
    expect(() => persistGradingResultsEdits("https://canvas.example.edu/a/1", seedEdits(run))).not.toThrow();
  });
});

describe("composeOverallCommentLocal stays byte-identical to composeOverallComment", () => {
  // gradingResultsHelpers.ts deliberately does NOT import composeOverallComment
  // from "@/lib/grade" (see composeOverallCommentLocal's own doc comment for
  // why: that barrel transitively imports server-only code, which breaks
  // `next build` for this "use client" file's bundle even though tsc/eslint/
  // vitest all stay green). This test is the other half of that promise: it
  // imports the REAL composeOverallComment here, where doing so is safe (a
  // test file is never bundled to the client), and proves the local
  // duplicate produces identical output across a representative input table
  // - so a future edit to either implementation that drifts from the other
  // fails loudly instead of silently diverging.
  const cases: [name: string, strengths: string, improvements: string, resubmitNotice: string][] = [
    ["all three present", "Clear logic.", "Add tests.", "You may resubmit."],
    ["resubmitNotice empty (full credit)", "Clear logic.", "Add tests.", ""],
    ["improvements empty", "Clear logic.", "", "You may resubmit."],
    ["only strengths", "Clear logic.", "", ""],
    ["all empty", "", "", ""],
    ["whitespace-only parts treated as empty", "   ", "Add tests.", "  "],
  ];

  it.each(cases)("%s", (_name, strengths, improvements, resubmitNotice) => {
    expect(composeOverallCommentLocal(strengths, improvements, resubmitNotice)).toBe(
      composeOverallComment(strengths, improvements, resubmitNotice)
    );
  });
});

describe("grading-results client files stay client-bundle-safe", () => {
  // Regression guard for the exact bug this feature shipped once: this
  // directory's gradingResultsHelpers.ts imported composeOverallComment from
  // "@/lib/grade" as a VALUE import. That barrel transitively imports
  // server-only code (grade.ts -> grade/rubric.ts -> research/rubric-bank.ts
  // -> research/db.ts -> src/lib/supabase/server.ts, which imports
  // next/headers) - `next build` failed to compile any Pages Router entry
  // point reachable from GradingResults.tsx, while `npx tsc --noEmit`,
  // `npx eslint`, and `npx vitest run` all stayed green on the break. Modeled
  // on src/lib/workflows/course-schedule-docx.test.ts:28-50 and
  // src/lib/workflows/registry/steps.weekly-announcement-schedule.test.ts:57-70,
  // both of which record the identical lesson: only `next build` catches
  // this class of defect, so a source-reading guard test is the only thing
  // that keeps it caught on every routine run.
  const CLIENT_FILES = ["./gradingResultsHelpers.ts", "./RowFeedbackBoxes.tsx", "../GradingResults.tsx"];

  // A quoted import specifier, not this describe block's own prose above
  // (which mentions next/headers and @/lib/grade in backticks/code font
  // while explaining exactly why this guard exists) - matching the "from
  // '...'" shape every banned string can only appear in as a real import.
  const BANNED_IMPORT_PATTERNS: RegExp[] = [
    /from ["']@\/lib\/grade["']/,
    /from ["']@\/lib\/grade\//,
    /from ["']@\/lib\/supabase\/server["']/,
    /from ["']next\/headers["']/,
  ];

  it("canary: the ban patterns actually fire on a known-bad import string", () => {
    const knownBad = [
      'import { composeOverallComment } from "@/lib/grade";',
      "import { composeOverallComment } from '@/lib/grade';",
      'import { generateRubric } from "@/lib/grade/rubric";',
      'import { createServiceClient } from "@/lib/supabase/server";',
      'import { headers } from "next/headers";',
    ];
    for (const fixture of knownBad) {
      expect(BANNED_IMPORT_PATTERNS.some((pattern) => pattern.test(fixture))).toBe(true);
    }
    // And a negative control: an ordinary, unrelated import must NOT trip it,
    // so this canary is proven to discriminate, not just match everything.
    expect(BANNED_IMPORT_PATTERNS.some((pattern) => pattern.test('import { useState } from "react";'))).toBe(
      false
    );
  });

  it.each(CLIENT_FILES)("%s never imports @/lib/grade (or a submodule), @/lib/supabase/server, or next/headers", (relativePath) => {
    const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
    for (const pattern of BANNED_IMPORT_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
  });
});
