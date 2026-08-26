// TDD for the owner's report of 2026-08-26:
//   "the grader applied inconsistent totals to each of the assignments.
//    i don't need totals. i need percentages with clearly viewable and
//    copyable comments"
//
// WRITTEN BEFORE THE IMPLEMENTATION - ./repoGradeScoreDisplay does not exist
// yet, so this file currently fails to collect. Make it pass without changing
// what it asserts; if an assertion is wrong, report it rather than editing it.
//
// THE EVIDENCE. Their exported log holds two bulk runs over the SAME folder
// ("assignments") with the SAME README instructions, eleven repos each. The
// denominators are arbitrary both WITHIN a run and BETWEEN runs for the same
// repo:
//
//   run 1  81.25/100  350/400  40/40  13/16  35/40  40/40 ...
//   run 2  84.50/100  100/100  100/100  37/40  400/400  400/400 ...
//
// THE CAUSE, verified at src/app/actions/github-repos.ts:680:
//
//   const effectiveRubric = rubric.trim() || (await generateRubric(
//     `${instructions}\n\n${digest.text}`, provider));
//
// With the rubric textarea blank - its default - a rubric is generated PER
// CALL, from a prompt that includes `digest.text`, THAT REPO'S OWN CONTENT.
// So every student is graded against a different rubric derived from their
// own submission, and each rubric invents its own point total.
//
// This module does NOT fix that. It fixes the display half the owner asked
// for: a percentage is comparable across runs and across students no matter
// what denominator a generated rubric happened to pick. The root cause - one
// rubric per run rather than one per repo - is tracked separately, because
// normalizing the display makes scores COMPARABLE without making them
// CONSISTENT. Proof from their own log, in percentage terms: one repo moved
// 100% -> 85% and two moved 87.5% -> 100% between the two runs.
import { describe, expect, it } from "vitest";
import {
  formatScorePercent,
  parseScoreFraction,
  scorePercentValue,
  summarizeScoreSpread,
} from "./repoGradeScoreDisplay";

describe("parseScoreFraction - reading what the grader actually returns", () => {
  // `totalScore` is a STRING shaped "earned/possible" (grade/types.ts:29), not
  // a number. Every one of these is a real value from the owner's log.
  it("parses the plain integer form", () => {
    expect(parseScoreFraction("40/40")).toEqual({ earned: 40, possible: 40 });
    expect(parseScoreFraction("13/16")).toEqual({ earned: 13, possible: 16 });
    expect(parseScoreFraction("350/400")).toEqual({ earned: 350, possible: 400 });
  });

  it("parses the decimal form the grader also emits", () => {
    expect(parseScoreFraction("81.25/100")).toEqual({ earned: 81.25, possible: 100 });
    expect(parseScoreFraction("37.50/40")).toEqual({ earned: 37.5, possible: 40 });
  });

  it("tolerates surrounding whitespace and spaces around the slash", () => {
    expect(parseScoreFraction("  35 / 40 ")).toEqual({ earned: 35, possible: 40 });
  });

  it("returns null for a value it cannot read, rather than guessing", () => {
    for (const bad of ["", "   ", "pass", "40", "40/", "/40", "a/b", "40/0"]) {
      expect(parseScoreFraction(bad)).toBeNull();
    }
  });

  it("returns null when the denominator is zero, so nothing divides by it", () => {
    expect(parseScoreFraction("0/0")).toBeNull();
  });
});

describe("scorePercentValue - the number the instructor actually wants", () => {
  it("normalizes the log's differing denominators onto one scale", () => {
    // These four are all the SAME performance wearing different totals.
    expect(scorePercentValue("13/16")).toBeCloseTo(81.25, 5);
    expect(scorePercentValue("81.25/100")).toBeCloseTo(81.25, 5);
    expect(scorePercentValue("350/400")).toBeCloseTo(87.5, 5);
    expect(scorePercentValue("35/40")).toBeCloseTo(87.5, 5);
  });

  it("makes two repos with different denominators directly comparable", () => {
    expect(scorePercentValue("350/400")).toBe(scorePercentValue("35/40"));
  });

  it("returns null for an unreadable score", () => {
    expect(scorePercentValue("pass")).toBeNull();
  });
});

describe("formatScorePercent - what the cell shows", () => {
  it("shows a percentage, not a total", () => {
    expect(formatScorePercent("350/400")).toBe("87.5%");
    expect(formatScorePercent("40/40")).toBe("100%");
  });

  it("drops a trailing zero rather than showing 87.50%", () => {
    expect(formatScorePercent("35/40")).toBe("87.5%");
    expect(formatScorePercent("100/100")).toBe("100%");
  });

  it("keeps two decimals when they carry real information", () => {
    expect(formatScorePercent("13/16")).toBe("81.25%");
  });

  it("passes an unreadable score through unchanged rather than blanking it", () => {
    // Losing a score the instructor can see, because this module could not
    // parse it, would be worse than showing the raw string.
    expect(formatScorePercent("pass")).toBe("pass");
    expect(formatScorePercent("")).toBe("");
  });

  it("never shows the denominator - that is the whole point of the change", () => {
    for (const raw of ["13/16", "350/400", "81.25/100", "37.50/40"]) {
      expect(formatScorePercent(raw)).not.toContain("/");
    }
  });
});

describe("summarizeScoreSpread - surfacing that the rubrics disagreed", () => {
  // The instructor could not see the problem until they exported a log and
  // read it by eye. The view should say it.
  it("reports how many distinct denominators a run used", () => {
    const summary = summarizeScoreSpread(["81.25/100", "350/400", "40/40", "13/16", "35/40"]);
    expect(summary.distinctDenominators).toBe(4);
  });

  it("flags a run whose repos were graded against differently-scaled rubrics", () => {
    const summary = summarizeScoreSpread(["81.25/100", "350/400", "13/16"]);
    expect(summary.inconsistentScales).toBe(true);
  });

  it("does not flag a run where every repo shared one scale", () => {
    const summary = summarizeScoreSpread(["90/100", "85/100", "100/100"]);
    expect(summary.inconsistentScales).toBe(false);
    expect(summary.distinctDenominators).toBe(1);
  });

  it("ignores unreadable scores rather than counting them as a scale", () => {
    const summary = summarizeScoreSpread(["90/100", "pass", "", "85/100"]);
    expect(summary.distinctDenominators).toBe(1);
    expect(summary.inconsistentScales).toBe(false);
  });

  it("says nothing about an empty run", () => {
    const summary = summarizeScoreSpread([]);
    expect(summary.distinctDenominators).toBe(0);
    expect(summary.inconsistentScales).toBe(false);
  });

  it("explains the cause in words the instructor can act on", () => {
    // Denominators here are 100, 400 and 16 - three distinct scales.
    const summary = summarizeScoreSpread(["81.25/100", "350/400", "13/16"]);
    expect(summary.distinctDenominators).toBe(3);
    expect(summary.detail.toLowerCase()).toContain("rubric");
    expect(summary.detail).toContain("3");
  });

  it("has nothing to explain when the scales agreed", () => {
    expect(summarizeScoreSpread(["90/100", "85/100"]).detail).toBe("");
  });
});
