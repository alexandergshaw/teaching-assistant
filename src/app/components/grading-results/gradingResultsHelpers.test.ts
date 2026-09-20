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

// This file's row-edit-state builders/mergers/persistence tests moved to
// gradingResultsHelpersEditState.test.ts, and its wiring/guard tests (source-
// text reads of GradingResults.tsx and the client-bundle-safety sweep) moved
// to gradingResultsHelpersWiring.test.ts - both splits are pure moves made
// when this file approached the project's 1000-line-per-file cap
// (docs/DEV_LOOP.md); no assertion was changed, weakened, or retyped.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SORT,
  buildCsvContent,
  compareText,
  copyAllFeedbackText,
  escapeCsvCell,
  FILES_NOT_RETAINED_LABEL,
  filesColumnEmptyLabel,
  formatFeedback,
  formatPoints,
  parseDenominator,
  parseEarnedPoints,
  parseScoreValue,
  recomputeTotal,
  seedEdits,
  sortColumnKey,
  type AreaEdit,
  type GradingRun,
  type RowEdit,
} from "./gradingResultsHelpers";

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

// sortGradeRows has its own oracle file, sortGradeRows.test.ts, in this same
// directory - split out to keep this file under the project's 1000-line-per-
// file cap rather than because the concern is unrelated (it is the same
// "pure logic extracted from GradingResults.tsx, proven with frozen
// literals" pattern this file's header comment describes).

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

// "Copy all feedback" used to copy `overall`, which composeOverallComment
// builds by joining the three boxes with a single SPACE - correct for an LMS
// comment field, wrong for the clipboard, where the instructor pastes three
// distinct blocks and got one run-on paragraph. These pin the blank line, and
// pin that `overall` itself is NOT what is copied any more.
describe("copyAllFeedbackText", () => {
  const edit = (over: Partial<Record<"overall" | "strengths" | "improvements" | "resubmitNotice", string>> = {}) => ({
    overall: "",
    strengths: "",
    improvements: "",
    resubmitNotice: "",
    ...over,
  });

  it("joins the three boxes with a BLANK LINE, in FEEDBACK_FIELDS order", () => {
    expect(
      copyAllFeedbackText(
        edit({
          strengths: "Clear variable names.",
          improvements: "Add a zero check before dividing.",
          resubmitNotice: "You are welcome to resubmit.",
          // Present and deliberately DIFFERENT, to prove it is not the source.
          overall: "SPACE JOINED OVERALL",
        })
      )
    ).toBe("Clear variable names.\n\nAdd a zero check before dividing.\n\nYou are welcome to resubmit.");
  });

  it("drops an empty box rather than leaving a doubled blank line", () => {
    expect(
      copyAllFeedbackText(edit({ strengths: "Nice work.", improvements: "   ", resubmitNotice: "Resubmit freely." }))
    ).toBe("Nice work.\n\nResubmit freely.");
  });

  it("still normalises dashes inside each block", () => {
    expect(copyAllFeedbackText(edit({ strengths: "Good – solid", improvements: "Try — this" }))).toBe(
      "Good, solid\n\nTry, this"
    );
  });

  it("falls back to overall when every box is empty (an embedded-grader result)", () => {
    expect(copyAllFeedbackText(edit({ overall: "Composed comment only." }))).toBe("Composed comment only.");
  });

  it("falls back to a stated placeholder when there is nothing at all, never an empty clipboard", () => {
    expect(copyAllFeedbackText(edit())).toBe("No feedback provided.");
  });
});

describe("filesColumnEmptyLabel", () => {
  // F4 (docs/grading-results-file-viewer-acceptance-criteria.md): an empty
  // Files column must read differently for a genuinely file-less submission
  // than for a restored run/draft whose files were never persisted back.
  it("shows the genuine dash when this run's files were retained", () => {
    expect(filesColumnEmptyLabel(true)).toBe("-");
  });

  it("shows the honest explanation when this run's files were not retained", () => {
    expect(filesColumnEmptyLabel(false)).toBe(FILES_NOT_RETAINED_LABEL);
  });

  it("the two labels are distinct strings (the whole point of the flag)", () => {
    expect(filesColumnEmptyLabel(true)).not.toBe(filesColumnEmptyLabel(false));
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

  // docs/rubric-criteria-breakdown-acceptance-criteria.md B5: a percent-shaped
  // score used to be read by parseScoreValue as though its leading digits
  // were raw points earned (e.g. "85%" contributed 85 points), wildly
  // inflating a recomputed total. It must be skipped exactly like a blank
  // score instead.
  it("B5 fix: a percent-shaped score is skipped, not added as 85 raw points", () => {
    const areas: Record<string, AreaEdit> = {
      "Code Quality": { score: "85%" },
      Correctness: { score: "8/10" },
    };
    expect(recomputeTotal(areas, areaNames, "17/20")).toBe("8/20");
  });

  it("B5 fix: with no total denominator either, a percent-shaped score's digits never leak into the earned-only fallback", () => {
    const areas: Record<string, AreaEdit> = {
      "Code Quality": { score: "85%" },
      Correctness: { score: "8" },
    };
    expect(recomputeTotal(areas, areaNames, "17")).toBe("8");
  });

  // SABOTAGE-CHECK ANCHOR: temporarily removing the `|| trimmedScore.endsWith("%")`
  // clause (leaving only the blank-score check) was verified to make the
  // first B5 fix test above FAIL - it returned "93/20" (85 + 8) instead of
  // "8/20", because parseScoreValue("85%") reads 85 as a plain number. The
  // change was reverted after confirming the failure.
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

// B1's fanOutGradingPostResult tests (and the GradingResults.tsx wiring
// check for it) live in their own file, gradingResultsPostOutcome.test.ts -
// this file was already close to the repo's 1000-line-per-file ceiling
// (docs/DEV_LOOP.md) and adding them here would have pushed it over.
