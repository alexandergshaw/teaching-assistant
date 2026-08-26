// TDD for U12.52 and the pre-existing postability defect it exposes.
// WRITTEN BEFORE THE IMPLEMENTATION - ./repoGradePostScore does not exist yet.
// Make it pass without changing what it asserts; if an assertion is wrong,
// report it rather than editing it.
//
// TWO FACTS THAT TOGETHER DECIDE WHAT REACHES THE GRADEBOOK.
//
// 1. NO AI-GRADED SCORE IS POSTABLE TODAY. repo-grade-postability.ts:67-69
//    does `Number(scoreTrimmed)` and rejects a non-finite result. A freshly
//    graded cell's score is the raw `totalScore` string, shaped
//    "earned/possible" (grade/types.ts:29) - so `Number("350/400")` is NaN and
//    the cell reports `"350/400" is not a valid score.` The only way to post
//    an AI grade is to hand-retype it as a bare number, for every student.
//    This is pre-existing (last touched in d8829c3) and is why the whole
//    grade-to-gradebook path has never worked end to end.
//
// 2. THE DENOMINATOR IS ARBITRARY. With the rubric field blank,
//    `generateRubric` runs per repo and is fed that repo's own content
//    (github-repos.ts:680), so one run produced denominators of 100, 400, 40
//    and 16 across eleven students. Posting the raw NUMERATOR would therefore
//    send 350 to one student and 13 to another for the same quality of work.
//
// THEREFORE the only meaningful quantity is the PERCENTAGE, scaled to the
// Canvas assignment's own points. `CanvasAssignmentBrief` already carries
// `pointsPossible: number | null` (src/lib/canvas/listings.ts:8-12).
//
// THE RULE THIS MODULE ENCODES, and the reason each half exists:
//   - a score the INSTRUCTOR typed as a bare number posts unchanged. It is an
//     explicit human decision about a specific assignment and must never be
//     rescaled behind their back.
//   - a score the GRADER produced as a fraction is converted to a percentage
//     and scaled to the assignment's pointsPossible.
//   - when pointsPossible is unknown, nothing is silently invented.
//
// This writes to a live Canvas gradebook with no undo, no audit table and no
// dry run. Every branch below is a decision about a real student's record.
import { describe, expect, it } from "vitest";
import { describePostScore, resolvePostScore } from "./repoGradePostScore";

describe("resolvePostScore - an instructor-typed number is never rescaled", () => {
  it("posts a bare number exactly as typed", () => {
    expect(resolvePostScore("37", 40)).toEqual({ ok: true, score: 37, rescaled: false });
  });

  it("posts a bare decimal exactly as typed", () => {
    expect(resolvePostScore("37.5", 40)).toEqual({ ok: true, score: 37.5, rescaled: false });
  });

  it("posts a typed number unchanged even when it exceeds pointsPossible - extra credit is the instructor's call", () => {
    expect(resolvePostScore("45", 40)).toEqual({ ok: true, score: 45, rescaled: false });
  });

  it("posts a typed zero rather than treating it as absent", () => {
    expect(resolvePostScore("0", 40)).toEqual({ ok: true, score: 0, rescaled: false });
  });

  it("posts a typed number even when the assignment has no points value", () => {
    expect(resolvePostScore("37", null)).toEqual({ ok: true, score: 37, rescaled: false });
  });

  it("tolerates surrounding whitespace on a typed number", () => {
    expect(resolvePostScore("  37  ", 40)).toEqual({ ok: true, score: 37, rescaled: false });
  });
});

describe("resolvePostScore - a grader fraction is scaled to the assignment", () => {
  it("scales a fraction to the assignment's own points", () => {
    // 350/400 is 87.5%, and 87.5% of a 40-point assignment is 35.
    expect(resolvePostScore("350/400", 40)).toEqual({ ok: true, score: 35, rescaled: true });
  });

  it("gives two students with the same percentage the same posted score, despite different denominators", () => {
    // This is the whole point. In the owner's log these two were the same
    // performance wearing different arbitrary totals.
    const a = resolvePostScore("350/400", 100);
    const b = resolvePostScore("35/40", 100);
    expect(a).toEqual(b);
    expect(a).toEqual({ ok: true, score: 87.5, rescaled: true });
  });

  it("scales the 16-point rubric the grader invented onto a 100-point assignment", () => {
    // 13/16 is 81.25%.
    expect(resolvePostScore("13/16", 100)).toEqual({ ok: true, score: 81.25, rescaled: true });
  });

  it("passes a full-marks fraction through as full marks", () => {
    expect(resolvePostScore("40/40", 40)).toEqual({ ok: true, score: 40, rescaled: true });
    expect(resolvePostScore("400/400", 20)).toEqual({ ok: true, score: 20, rescaled: true });
  });

  it("rounds to two decimals rather than sending a long float to Canvas", () => {
    // 2/3 is 66.666...% of 40 = 26.666..., which must not post as 26.66666667.
    const result = resolvePostScore("2/3", 40);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.score).toBe(26.67);
  });

  it("handles a zero numerator without turning it into a refusal", () => {
    expect(resolvePostScore("0/40", 100)).toEqual({ ok: true, score: 0, rescaled: true });
  });
});

describe("resolvePostScore - what it refuses, and why", () => {
  it("REFUSES to guess when the assignment has no points value and the score is a fraction", () => {
    // Posting 87.5 into an assignment whose scale is unknown could mean 87.5
    // out of 10. Refusing is the only safe branch on a no-undo write.
    const result = resolvePostScore("350/400", null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.toLowerCase()).toContain("points");
  });

  it("refuses an empty score", () => {
    expect(resolvePostScore("", 40).ok).toBe(false);
    expect(resolvePostScore("   ", 40).ok).toBe(false);
  });

  it("refuses a score it cannot read at all, naming what it saw", () => {
    const result = resolvePostScore("pass", 40);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("pass");
  });

  it("refuses a fraction with a zero denominator rather than dividing by it", () => {
    expect(resolvePostScore("0/0", 40).ok).toBe(false);
    expect(resolvePostScore("5/0", 40).ok).toBe(false);
  });

  it("refuses a zero or negative pointsPossible rather than scaling onto it", () => {
    expect(resolvePostScore("35/40", 0).ok).toBe(false);
    expect(resolvePostScore("35/40", -10).ok).toBe(false);
  });

  it("never returns a non-finite score", () => {
    for (const raw of ["350/400", "37", "0/40", "pass", "", "1/0"]) {
      for (const points of [40, 100, null, 0]) {
        const result = resolvePostScore(raw, points);
        if (result.ok) expect(Number.isFinite(result.score)).toBe(true);
      }
    }
  });
});

describe("describePostScore - the cell must say which number will reach Canvas", () => {
  it("names the posted value and the assignment's scale when a fraction was rescaled", () => {
    const text = describePostScore("350/400", 40);
    expect(text).toContain("35");
    expect(text).toContain("40");
  });

  it("says a typed score posts as typed, without implying a conversion", () => {
    const text = describePostScore("37", 40).toLowerCase();
    expect(text).toContain("37");
    expect(text).not.toContain("87.5");
  });

  it("explains the refusal when the assignment has no points value", () => {
    const text = describePostScore("350/400", null).toLowerCase();
    expect(text).toContain("points");
  });

  it("says nothing misleading for an unreadable score", () => {
    expect(describePostScore("pass", 40).length).toBeGreaterThan(0);
  });
});
