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

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SORT,
  buildCsvContent,
  compareText,
  escapeCsvCell,
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
  it("seeds one RowEdit per result, keyed by student name", () => {
    const run: GradingRun = {
      results: [
        {
          student: "Alice Smith",
          totalScore: "18/20",
          overallComment: "Great job overall.",
          rubricAreas: [
            { area: "Code Quality", score: "9/10" },
            { area: "Correctness", score: "9/10" },
          ],
        },
        {
          student: "Bob Jones",
          totalScore: "15/20",
          overallComment: "Needs improvement.",
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
        areas: { "Code Quality": { score: "9/10" }, Correctness: { score: "9/10" } },
      },
      "Bob Jones": {
        total: "15/20",
        overall: "Needs improvement.",
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
  it("builds header + one row per result, edits taking priority over the seeded value", () => {
    const run: GradingRun = {
      rubricAreaNames: ["Code Quality", "Correctness"],
      results: [
        {
          student: "Alice Smith",
          totalScore: "18/20",
          overallComment: "Great job overall.",
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
        areas: { "Code Quality": { score: "9/10" }, Correctness: { score: "9/10" } },
      },
    };

    expect(buildCsvContent(run, edits)).toBe(
      '"Student","Code Quality Score","Correctness Score","Total Score","Overall Comment","Submitted Files","Submitted Extensions"\n' +
        '"Alice Smith","9/10","9/10","18/20","Great job overall.","main.py; test.py","py"'
    );
  });

  // The CSV-escaping oracle: a comma, a double quote, AND an embedded newline
  // in the same fields, all at once - the classic case a naive CSV builder
  // gets wrong. buildCsvContent had no test at all before this file existed.
  it("escapes a comma, a double quote, and an embedded newline together (the CSV-escaping oracle)", () => {
    const run: GradingRun = {
      rubricAreaNames: ["Code Quality"],
      results: [
        {
          student: 'Smith, "Al"',
          totalScore: "10/10",
          overallComment: 'Great job, "well done"\nKeep it up',
          rubricAreas: [{ area: "Code Quality", score: "10/10" }],
          submittedFiles: [{ name: "a.py", extension: "py" }],
        },
      ],
    } as unknown as GradingRun;

    const expected =
      '"Student","Code Quality Score","Total Score","Overall Comment","Submitted Files","Submitted Extensions"\n' +
      '"Smith, ""Al""","10/10","10/10","Great job, ""well done""\nKeep it up","a.py","py"';

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
      run.results[0].overallComment,
      run.results[0].submittedFiles[0].name,
      run.results[0].submittedFiles[0].extension,
    ]
      .map(brokenCsvCell)
      .join(",");
    expect(brokenRow).toBe(
      'Smith, "Al",10/10,10/10,Great job, "well done"\nKeep it up,a.py,py'
    );
    expect(actual).not.toBe(
      'Student,Code Quality Score,Total Score,Overall Comment,Submitted Files,Submitted Extensions\n' +
        brokenRow
    );
  });
});
