import { describe, it, expect } from "vitest";
import { parseGeneratedRubric } from "@/app/utils/rubric";
import {
  buildPercentSpecFromRows,
  scaleSpecToPoints,
  classifyRubricEligibility,
  planRubricMaterialization,
  percentSum,
  type RubricPercentSpec,
  type RubricPlanItem,
} from "./rubric-bulk-plan";

// ---------------------------------------------------------------------------
// Realistic `generateRubric` prose (src/lib/grade/rubric.ts:156's prompt
// format), fed against an ASSIGNMENT DESCRIPTION rather than the repo-file or
// schedule material every existing caller uses today - this is the AC's
// "risk 2": does the format survive that input, and does a dropped area get
// caught rather than silently producing a rubric that "parses fine" while
// summing to less than 100 percent.
// ---------------------------------------------------------------------------

const ESSAY_RUBRIC_PROSE = `Thesis and Argument (25%): The essay states a clear, arguable thesis and supports it throughout.
  Excellent (100% - no deductions): Thesis is specific, arguable, and consistently supported.
  Meets Expectations (75% - 25% deducted): Thesis is present but vague or inconsistently supported.
  Needs Improvement (50% - 50% deducted): Thesis is missing, unclear, or unsupported.
Evidence and Support (25%): Claims are backed by specific evidence from the assigned readings.
  Excellent (100% - no deductions): Every claim cites specific, relevant evidence.
  Meets Expectations (75% - 25% deducted): Most claims are supported; some are unsupported.
  Needs Improvement (50% - 50% deducted): Claims are largely unsupported by evidence.
Organization and Structure (25%): The essay follows a logical paragraph structure with transitions.
  Excellent (100% - no deductions): Clear structure with effective transitions throughout.
  Meets Expectations (75% - 25% deducted): Structure is mostly clear but transitions are weak.
  Needs Improvement (50% - 50% deducted): Structure is difficult to follow.
Grammar and Mechanics (25%): The essay is free of grammar, spelling, and punctuation errors.
  Excellent (100% - no deductions): Free of grammar, spelling, and punctuation errors.
  Meets Expectations (75% - 25% deducted): A few minor errors that do not impede reading.
  Needs Improvement (50% - 50% deducted): Frequent errors that impede reading.`;

const LAB_REPORT_RUBRIC_PROSE = `Data Collection (33%): Data is recorded completely and accurately per the lab procedure.
  Excellent (100% - no deductions): All required measurements recorded accurately with units.
  Meets Expectations (75% - 25% deducted): Most measurements recorded; minor omissions.
  Needs Improvement (50% - 50% deducted): Significant missing or inaccurate data.
Analysis (33%): Calculations are correct and results are interpreted against expected outcomes.
  Excellent (100% - no deductions): Calculations correct; interpretation ties results to theory.
  Meets Expectations (75% - 25% deducted): Calculations mostly correct; interpretation is thin.
  Needs Improvement (50% - 50% deducted): Calculations incorrect or interpretation missing.
Conclusion (34%): The conclusion addresses the lab's hypothesis and sources of error.
  Excellent (100% - no deductions): Conclusion addresses hypothesis and sources of error fully.
  Meets Expectations (75% - 25% deducted): Conclusion addresses hypothesis but not error sources.
  Needs Improvement (50% - 50% deducted): Conclusion is missing or does not address the hypothesis.`;

const PRESENTATION_RUBRIC_PROSE = `Content Accuracy (20%): The slides accurately represent the assigned topic.
  Excellent (100% - no deductions): Content is accurate and comprehensive.
  Meets Expectations (75% - 25% deducted): Content is mostly accurate with minor gaps.
  Needs Improvement (50% - 50% deducted): Content has significant inaccuracies or gaps.
Visual Design (20%): Slides are legible and free of clutter.
  Excellent (100% - no deductions): Slides are clean, legible, and well organized.
  Meets Expectations (75% - 25% deducted): Slides are legible but cluttered in places.
  Needs Improvement (50% - 50% deducted): Slides are difficult to read or disorganized.
Delivery (20%): The presenter speaks clearly and stays within the time limit.
  Excellent (100% - no deductions): Clear delivery, within the time limit.
  Meets Expectations (75% - 25% deducted): Mostly clear delivery, slightly over/under time.
  Needs Improvement (50% - 50% deducted): Difficult to follow or well outside the time limit.
Use of Sources (20%): Sources are cited correctly and are relevant to the topic.
  Excellent (100% - no deductions): Sources are relevant and correctly cited throughout.
  Meets Expectations (75% - 25% deducted): Sources are present but citation is inconsistent.
  Needs Improvement (50% - 50% deducted): Sources are missing or irrelevant.
Q&A Handling (20%): The presenter answers audience questions accurately.
  Excellent (100% - no deductions): Answers are accurate and directly address the question.
  Meets Expectations (75% - 25% deducted): Answers are mostly accurate but sometimes vague.
  Needs Improvement (50% - 50% deducted): Answers are inaccurate or avoid the question.`;

// One area line deliberately malformed (no percentage in parentheses at all,
// so parseGeneratedRubric's own row regex - `^(.+?)\s*\((\d+(?:\.\d+)?\s*%?)\)\s*:\s*(.*)$`
// - cannot match it and the line is dropped, per the parser's `if (!match)
// continue`). This is risk 2's exact failure shape: three of four areas
// survive parsing "fine" at 75 percent total, no error from the parser itself.
const MALFORMED_ESSAY_RUBRIC_PROSE = `Thesis and Argument (25%): The essay states a clear, arguable thesis and supports it throughout.
  Excellent (100% - no deductions): Thesis is specific, arguable, and consistently supported.
  Meets Expectations (75% - 25% deducted): Thesis is present but vague or inconsistently supported.
  Needs Improvement (50% - 50% deducted): Thesis is missing, unclear, or unsupported.
Evidence and Support 25 percent - claims are backed by specific evidence from the readings.
  Excellent: Every claim cites specific, relevant evidence.
  Meets Expectations: Most claims are supported; some are unsupported.
  Needs Improvement: Claims are largely unsupported by evidence.
Organization and Structure (25%): The essay follows a logical paragraph structure with transitions.
  Excellent (100% - no deductions): Clear structure with effective transitions throughout.
  Meets Expectations (75% - 25% deducted): Structure is mostly clear but transitions are weak.
  Needs Improvement (50% - 50% deducted): Structure is difficult to follow.
Grammar and Mechanics (25%): The essay is free of grammar, spelling, and punctuation errors.
  Excellent (100% - no deductions): Free of grammar, spelling, and punctuation errors.
  Meets Expectations (75% - 25% deducted): A few minor errors that do not impede reading.
  Needs Improvement (50% - 50% deducted): Frequent errors that impede reading.`;

function buildItem(overrides: Partial<RubricPlanItem> & { key: string }): RubricPlanItem {
  return {
    type: "Assignment",
    contentId: 1,
    pointsPossible: 100,
    ...overrides,
  };
}

describe("buildPercentSpecFromRows - risk 2 (generateRubric prose survives an assignment description)", () => {
  it("parses a 4-area essay rubric (25/25/25/25) into a spec summing to 100", () => {
    const rows = parseGeneratedRubric(ESSAY_RUBRIC_PROSE);
    expect(rows).not.toBeNull();
    const result = buildPercentSpecFromRows(rows!, "Essay Rubric");
    expect("spec" in result).toBe(true);
    const spec = (result as { spec: RubricPercentSpec }).spec;
    expect(spec.criteria).toHaveLength(4);
    expect(percentSum(spec)).toBe(100);
  });

  it("parses a 3-area lab report rubric (33/33/34) into a spec summing to 100", () => {
    const rows = parseGeneratedRubric(LAB_REPORT_RUBRIC_PROSE);
    expect(rows).not.toBeNull();
    const result = buildPercentSpecFromRows(rows!, "Lab Report Rubric");
    expect("spec" in result).toBe(true);
    const spec = (result as { spec: RubricPercentSpec }).spec;
    expect(spec.criteria.map((c) => c.percent)).toEqual([33, 33, 34]);
    expect(percentSum(spec)).toBe(100);
  });

  it("parses a 5-area presentation rubric (20 each) into a spec summing to 100", () => {
    const rows = parseGeneratedRubric(PRESENTATION_RUBRIC_PROSE);
    expect(rows).not.toBeNull();
    const result = buildPercentSpecFromRows(rows!, "Presentation Rubric");
    expect("spec" in result).toBe(true);
    const spec = (result as { spec: RubricPercentSpec }).spec;
    expect(spec.criteria).toHaveLength(5);
    expect(percentSum(spec)).toBe(100);
  });

  it("REFUSES a spec built from a malformed variant that drops one area (parser 'parses fine' at 75 percent)", () => {
    const rows = parseGeneratedRubric(MALFORMED_ESSAY_RUBRIC_PROSE);
    // The parser itself does not fail loudly - this is exactly risk 2's danger.
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(3);
    const sumOfParsedRows = rows!.reduce((s, r) => s + Number(r.weight.replace(/[^0-9.]/g, "")), 0);
    expect(sumOfParsedRows).toBe(75);

    const result = buildPercentSpecFromRows(rows!, "Essay Rubric");
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/75 percent/);
  });

  it("carries each row's own description onto the criterion's longDescription, distinct from its rating tiers' longDescriptions", () => {
    const rows = parseGeneratedRubric(ESSAY_RUBRIC_PROSE);
    expect(rows).not.toBeNull();
    const result = buildPercentSpecFromRows(rows!, "Essay Rubric");
    expect("spec" in result).toBe(true);
    const spec = (result as { spec: RubricPercentSpec }).spec;

    // FACT: the criterion's own longDescription is the prose that followed
    // the area's "(25%):" - not the area name, not any rating tier's text.
    expect(spec.criteria[0].description).toBe("Thesis and Argument");
    expect(spec.criteria[0].longDescription).toBe(
      "The essay states a clear, arguable thesis and supports it throughout."
    );

    // ORDERING/DISTINCTNESS: every criterion's longDescription differs from
    // every one of its own rating tiers' longDescriptions - carrying the
    // criterion's prose through must not overwrite or duplicate the
    // rating-tier prose that already flowed through buildRatingsFromSubcategories.
    for (const criterion of spec.criteria) {
      expect(criterion.longDescription).toBeTruthy();
      for (const rating of criterion.ratings) {
        expect(rating.longDescription).toBeTruthy();
        expect(rating.longDescription).not.toBe(criterion.longDescription);
      }
    }

    // End to end: scaleSpecToPoints must carry the criterion's longDescription
    // through to RubricCriterionInput unchanged, alongside (not instead of)
    // each rating's own longDescription.
    const criteria = scaleSpecToPoints(spec, 100);
    expect(criteria[0].longDescription).toBe(
      "The essay states a clear, arguable thesis and supports it throughout."
    );
    const excellentTier = criteria[0].ratings.find((r) => r.description.startsWith("Excellent"));
    expect(excellentTier?.longDescription).toBe(
      "Thesis is specific, arguable, and consistently supported."
    );
    expect(criteria[0].longDescription).not.toBe(excellentTier?.longDescription);
  });
});

describe("scaleSpecToPoints - AC1b rounding invariant (criteria must sum to the assignment's own total)", () => {
  const fourEqualSpec: RubricPercentSpec = {
    title: "Four Equal Areas",
    criteria: [25, 25, 25, 25].map((percent, i) => ({
      description: `Area ${i + 1}`,
      percent,
      ratings: [
        { description: "Excellent", percent: 100 },
        { description: "Meets Expectations", percent: 75 },
        { description: "Needs Improvement", percent: 50 },
      ],
    })),
  };

  const threeUnequalSpec: RubricPercentSpec = {
    title: "Three Areas",
    criteria: [33, 33, 34].map((percent, i) => ({
      description: `Area ${i + 1}`,
      percent,
      ratings: [],
    })),
  };

  // Extended beyond the original [90, 7, 33, 100, 1] (all integers, all
  // exact-100-percent specs): that set is exactly why C1 (fractional totals)
  // and C2 (a within-tolerance percent spec that over-sums) both walked
  // straight through every existing test. 7.5/2.5/0.5 are C1's own repro
  // totals (a 7.5-point lab worksheet); `toBeCloseTo` rather than `toBe`
  // because a fractional total now produces fractional criteria points, and
  // IEEE754 addition of values like 1.9 + 1.9 + 1.9 + 1.8 is not guaranteed
  // to land on the bit-exact literal 7.5.
  it.each([90, 7, 33, 100, 1, 7.5, 2.5, 0.5])(
    "sums exactly to the total for a 4-criteria 25/25/25/25 spec at %s points",
    (total) => {
      const criteria = scaleSpecToPoints(fourEqualSpec, total);
      const sum = criteria.reduce((s, c) => s + c.points, 0);
      expect(sum).toBeCloseTo(total, 9);
    }
  );

  it.each([90, 7, 33, 100, 1, 7.5, 2.5, 0.5])(
    "sums exactly to the total for a 3-criteria 33/33/34 spec at %s points",
    (total) => {
      const criteria = scaleSpecToPoints(threeUnequalSpec, total);
      const sum = criteria.reduce((s, c) => s + c.points, 0);
      expect(sum).toBeCloseTo(total, 9);
    }
  );

  // C2's exact repro shape: "34%, 34%, 33%" sums to 101, inside
  // PERCENT_SUM_TOLERANCE, so buildPercentSpecFromRows accepts it - and the
  // old literal-100 division produced a rubric summing to 101 percent of
  // whatever total it was scaled to. Every one of these totals (including
  // C1's fractional ones, so the two fixes are proven together) must still
  // land on the total exactly, never over by the tolerance's own slack.
  const overSumSpec: RubricPercentSpec = {
    title: "Over-sum (101%) Areas",
    criteria: [34, 34, 33].map((percent, i) => ({ description: `Area ${i + 1}`, percent, ratings: [] })),
  };

  it.each([90, 7, 33, 100, 1, 7.5, 2.5, 0.5])(
    "sums exactly to the total for a 3-criteria 34/34/33 (percent sum 101) spec at %s points",
    (total) => {
      const criteria = scaleSpecToPoints(overSumSpec, total);
      const sum = criteria.reduce((s, c) => s + c.points, 0);
      expect(sum).toBeCloseTo(total, 9);
    }
  );

  // The other side of PERCENT_SUM_TOLERANCE: "33%, 33%, 33%" sums to 99 and
  // is likewise accepted. The bug report calls this direction "fine" even
  // before the fix, but normalising against the real percent sum must not
  // regress it - a spec summing UNDER 100 must still land on the total
  // exactly, not under it.
  const underSumSpec: RubricPercentSpec = {
    title: "Under-sum (99%) Areas",
    criteria: [33, 33, 33].map((percent, i) => ({ description: `Area ${i + 1}`, percent, ratings: [] })),
  };

  it.each([90, 7, 33, 100, 1, 7.5, 2.5, 0.5])(
    "sums exactly to the total for a 3-criteria 33/33/33 (percent sum 99) spec at %s points",
    (total) => {
      const criteria = scaleSpecToPoints(underSumSpec, total);
      const sum = criteria.reduce((s, c) => s + c.points, 0);
      expect(sum).toBeCloseTo(total, 9);
    }
  );

  it("gives every criterion at least a non-negative integer point value", () => {
    const criteria = scaleSpecToPoints(threeUnequalSpec, 1);
    for (const c of criteria) {
      expect(Number.isInteger(c.points)).toBe(true);
      expect(c.points).toBeGreaterThanOrEqual(0);
    }
  });

  // FROZEN LITERAL ORACLE, not a re-implementation of the algorithm under
  // test. The prior version of this test re-derived RubricBuilderModal's own
  // `Math.round((pct / 100) * total)` formula INLINE and ran it only at
  // total=100 with an even 25/25/25/25 split - the one case where plain
  // per-criterion rounding and this file's largest-remainder correction are
  // trivially identical (each share is already a whole number, so there is
  // nothing for the correction to do). That comparison could never fail even
  // if scaleSpecToPoints regressed, because both sides of the assertion were
  // computed by the same formula. This repo has a recorded lesson that a
  // refactor turns a comparison test into a tautology (see
  // docs/REGRESSION.md's note on refactors disarming tests) - the fix is the
  // same here: pin literal numbers, computed by hand from the algorithm's own
  // documented steps (floor each share, hand the leftover units to the
  // largest fractional remainders, ties broken by index), at totals that do
  // NOT divide evenly, plus one genuinely fractional total (7.5, C1's own
  // repro case) where the correction is doing real work.
  it.each([
    [100, [25, 25, 25, 25]],
    [7, [2, 2, 2, 1]],
    [33, [9, 8, 8, 8]],
    [7.5, [1.9, 1.9, 1.9, 1.8]],
    [2.5, [0.7, 0.6, 0.6, 0.6]],
  ] as const)("four-criteria 25/25/25/25 spec at %s points yields exactly %j", (total, expected) => {
    const criteria = scaleSpecToPoints(fourEqualSpec, total);
    expect(criteria.map((c) => c.points)).toEqual([...expected]);
  });

  it.each([
    [100, [33, 33, 34]],
    [7, [2, 2, 3]],
    [1, [0, 0, 1]],
    [7.5, [2.5, 2.5, 2.5]],
  ] as const)("three-criteria 33/33/34 spec at %s points yields exactly %j", (total, expected) => {
    const criteria = scaleSpecToPoints(threeUnequalSpec, total);
    expect(criteria.map((c) => c.points)).toEqual([...expected]);
  });

  it("falls back to a total of 100 for a non-positive or missing total, like RubricBuilderModal's own fallback", () => {
    const criteria = scaleSpecToPoints(fourEqualSpec, 0);
    expect(criteria.reduce((s, c) => s + c.points, 0)).toBe(100);
  });

  it("scales rating tiers relative to their own criterion's points, independent of the sum correction", () => {
    const criteria = scaleSpecToPoints(fourEqualSpec, 90);
    for (const c of criteria) {
      const excellent = c.ratings.find((r) => r.description === "Excellent")!;
      const meets = c.ratings.find((r) => r.description === "Meets Expectations")!;
      const needs = c.ratings.find((r) => r.description === "Needs Improvement")!;
      expect(excellent.points).toBe(c.points);
      expect(meets.points).toBe(Math.round(c.points * 0.75));
      expect(needs.points).toBe(Math.round(c.points * 0.5));
    }
  });
});

describe("classifyRubricEligibility - AC4", () => {
  it("is eligible for an ordinary published assignment with points", () => {
    const item = buildItem({ key: "a" });
    expect(classifyRubricEligibility(item)).toEqual({ kind: "eligible" });
  });

  // Pinned to the EXACT reason per case, not `toContain` on a two-element
  // array: the prior version accepted either "unsupported-type" or
  // "missing-content-id" for every type here, so it would still have passed
  // if a Page carrying a contentId were misclassified as
  // "missing-content-id" instead of "unsupported-type" (or vice versa for a
  // SubHeader). classifyRubricEligibility checks `item.type !== "Assignment"`
  // BEFORE it ever looks at `contentId`, so every one of these non-Assignment
  // types is "unsupported-type" regardless of whether contentId is present -
  // that ordering is the fact this test pins.
  it.each(["Page", "File", "SubHeader", "ExternalUrl", "ExternalTool", "Quiz", "Discussion"])(
    "is ineligible (unsupported-type) for a %s module item",
    (type) => {
      const item = buildItem({ key: "x", type, contentId: type === "SubHeader" ? null : 1 });
      expect(classifyRubricEligibility(item)).toEqual({ kind: "ineligible", reason: "unsupported-type" });
    }
  );

  it("is ineligible (missing-content-id) for an Assignment-typed item with no content id", () => {
    const item = buildItem({ key: "no-content", contentId: null });
    expect(classifyRubricEligibility(item)).toEqual({ kind: "ineligible", reason: "missing-content-id" });
  });

  it("is ineligible (new-quiz) when isNewQuiz is explicitly true, even though type is Assignment", () => {
    const item = buildItem({ key: "nq", isNewQuiz: true });
    expect(classifyRubricEligibility(item)).toEqual({ kind: "ineligible", reason: "new-quiz" });
  });

  it("is eligible when isNewQuiz is undefined (unknown defaults to not-a-New-Quiz)", () => {
    const item = buildItem({ key: "unknown-nq", isNewQuiz: undefined });
    expect(classifyRubricEligibility(item)).toEqual({ kind: "eligible" });
  });

  it("is 'already-has-rubric' (a DISTINCT outcome from ineligible) when existingRubricId is set", () => {
    const item = buildItem({ key: "has-one", existingRubricId: 555 });
    expect(classifyRubricEligibility(item)).toEqual({ kind: "already-has-rubric", rubricId: 555 });
  });

  it("is ineligible (missing-points) for an eligible-typed item with no point total", () => {
    const item = buildItem({ key: "zero-pts", pointsPossible: 0 });
    expect(classifyRubricEligibility(item)).toEqual({ kind: "ineligible", reason: "missing-points" });
  });

  it("checks new-quiz and already-has-rubric before missing-points, so both outcomes are reported even at 0 points", () => {
    const newQuizZeroPts = buildItem({ key: "nq0", isNewQuiz: true, pointsPossible: 0 });
    expect(classifyRubricEligibility(newQuizZeroPts)).toEqual({ kind: "ineligible", reason: "new-quiz" });

    const hasRubricZeroPts = buildItem({ key: "hr0", existingRubricId: 9, pointsPossible: 0 });
    expect(classifyRubricEligibility(hasRubricZeroPts)).toEqual({ kind: "already-has-rubric", rubricId: 9 });
  });
});

describe("planRubricMaterialization - AC1 distinct-total grouping", () => {
  it("groups ten identical 100-point items into exactly ONE materialisation group", () => {
    const items = Array.from({ length: 10 }, (_, i) => buildItem({ key: `a${i}`, pointsPossible: 100 }));
    const plan = planRubricMaterialization(items);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0].pointsTotal).toBe(100);
    expect(plan.groups[0].items).toHaveLength(10);
  });

  it("splits a mixed selection into one group per distinct total, with the right items attached to each", () => {
    const items = [
      buildItem({ key: "a", pointsPossible: 100 }),
      buildItem({ key: "b", pointsPossible: 50 }),
      buildItem({ key: "c", pointsPossible: 100 }),
      buildItem({ key: "d", pointsPossible: 25 }),
      buildItem({ key: "e", pointsPossible: 50 }),
    ];
    const plan = planRubricMaterialization(items);
    expect(plan.groups).toHaveLength(3);

    const byTotal = new Map(plan.groups.map((g) => [g.pointsTotal, g.items.map((i) => i.key)]));
    expect(byTotal.get(100)).toEqual(["a", "c"]);
    expect(byTotal.get(50)).toEqual(["b", "e"]);
    expect(byTotal.get(25)).toEqual(["d"]);
  });

  it("never drops an item: every input item lands in exactly one of groups/alreadyHasRubric/ineligible", () => {
    const items = [
      buildItem({ key: "eligible", pointsPossible: 100 }),
      buildItem({ key: "has-rubric", existingRubricId: 7 }),
      buildItem({ key: "page", type: "Page", contentId: null }),
      buildItem({ key: "new-quiz", isNewQuiz: true }),
      buildItem({ key: "zero-points", pointsPossible: 0 }),
    ];
    const plan = planRubricMaterialization(items);
    const accountedFor = [
      ...plan.groups.flatMap((g) => g.items.map((i) => i.key)),
      ...plan.alreadyHasRubric.map((r) => r.item.key),
      ...plan.ineligible.map((r) => r.item.key),
    ];
    expect(accountedFor.sort()).toEqual(items.map((i) => i.key).sort());
    expect(plan.alreadyHasRubric).toEqual([{ item: items[1], rubricId: 7 }]);
    expect(plan.ineligible.map((r) => r.item.key).sort()).toEqual(["new-quiz", "page", "zero-points"]);
  });
});


