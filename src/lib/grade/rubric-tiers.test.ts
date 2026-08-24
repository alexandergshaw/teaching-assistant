// Pins the AGREEMENT between generateRubric's prompt and the two consumers
// that turn its reply into Canvas rubric rating tiers - not the literal
// numbers, which is the whole point.
//
// THE DEFECT THIS EXISTS TO PREVENT (found 2026-08-24, fixed the same day):
// the prompt asked the model for three tiers at 100 / 75 / 50 percent, and
// the `lms-rubric` workflow step built Canvas tiers at 100 / 50 / 0 under
// different names. The rubric TEXT said a "Meets Expectations" answer earns
// 75 percent; the Canvas rubric awarded it 50, and the bottom tier was worth
// nothing instead of half. On a 25-point criterion that is 6.25 points per
// criterion between what the document says and what it scores - and it was
// invisible, because the tier labels an instructor reads came from the same
// generated prose that promised the other numbers.
//
// Both lists were internally consistent and neither knew about the other, so
// no test could have caught it by checking either one alone. These tests
// therefore check the RELATIONSHIP, and derive every expectation from
// RUBRIC_DEDUCTION_TIERS rather than restating percentages - a test that
// hardcoded 100/75/50 would itself become a third list to drift from.
//
// Node-env, nothing rendered, no model called.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseGeneratedRubric } from "@/app/utils/rubric";
import {
  RUBRIC_DEDUCTION_TIERS,
  RUBRIC_TIER_PERCENTS,
  rubricRatingsForPoints,
  rubricTierPromptLines,
} from "./rubric-tiers";

function readSource(rel: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), rel), "utf-8");
}

describe("the prompt is RENDERED from the tier table, not a second copy of it", () => {
  it("generateRubric interpolates rubricTierPromptLines() instead of spelling the tiers out", () => {
    const src = readSource("src/lib/grade/rubric.ts");
    expect(src).toContain("rubricTierPromptLines()");
  });

  it("generateRubric's source contains no literal tier line - the failure mode is a second list, so the file must not hold one", () => {
    const src = readSource("src/lib/grade/rubric.ts");
    for (const tier of RUBRIC_DEDUCTION_TIERS) {
      // e.g. `Excellent (100%` - the shape a restated prompt line would have.
      expect(src).not.toContain(`${tier.label} (${tier.percent}%`);
    }
  });

  it("renders one line per tier, each naming that tier's own label and percent", () => {
    const lines = rubricTierPromptLines().split("\n");
    expect(lines).toHaveLength(RUBRIC_DEDUCTION_TIERS.length);
    RUBRIC_DEDUCTION_TIERS.forEach((tier, i) => {
      expect(lines[i]).toContain(tier.label);
      expect(lines[i]).toContain(`${tier.percent}%`);
    });
  });

  it("the rendered lines still parse as subcategory lines, so the model's reply shape is unchanged", () => {
    // The prompt shows the model a QUOTED example of each line. Strip the
    // wrapping quotes to recover the line the model is being asked to emit,
    // then run the real parser over a minimal rubric built from them.
    const exampleLines = rubricTierPromptLines()
      .split("\n")
      .map((l) => l.trim().replace(/^"/, "").replace(/"$/, ""));
    const rubric = ["Design (25%): How well the solution is structured.", ...exampleLines].join("\n");
    const rows = parseGeneratedRubric(rubric);
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows?.[0].subcategories).toHaveLength(RUBRIC_DEDUCTION_TIERS.length);
    RUBRIC_DEDUCTION_TIERS.forEach((tier, i) => {
      expect(rows?.[0].subcategories[i].label).toContain(tier.label);
    });
  });
});

describe("rubricRatingsForPoints scores what the label says", () => {
  it("awards each tier its own labelled percentage of the criterion's points", () => {
    const labels = RUBRIC_DEDUCTION_TIERS.map((t) => `${t.label} (${t.percent}% - x)`);
    const ratings = rubricRatingsForPoints(25, labels);
    RUBRIC_DEDUCTION_TIERS.forEach((tier, i) => {
      expect(ratings[i].points).toBe(25 * (tier.percent / 100));
    });
  });

  it("the top tier is always full marks and the bottom tier is never zero under the shipped table", () => {
    // Stated as a property rather than as numbers: the old ladder's defining
    // shape was a bottom tier worth NOTHING, which is what made a partially
    // correct answer score the same as a blank one.
    const ratings = rubricRatingsForPoints(40, RUBRIC_DEDUCTION_TIERS.map((t) => `${t.label} (${t.percent}%)`));
    expect(ratings[0].points).toBe(40);
    expect(ratings[ratings.length - 1].points).toBeGreaterThan(0);
  });

  it("a label's own percentage WINS over the positional fallback, because the label is what a student reads", () => {
    const ratings = rubricRatingsForPoints(20, ["Excellent (100%)", "Meets Expectations (70%)", "Needs Improvement (40%)"]);
    expect(ratings.map((r) => r.points)).toEqual([20, 14, 8]);
  });

  it("falls back positionally when a label carries no percentage at all", () => {
    const ratings = rubricRatingsForPoints(10, ["Great", "Okay", "Weak"]);
    expect(ratings.map((r) => r.points)).toEqual(RUBRIC_TIER_PERCENTS.map((p) => 10 * (p / 100)));
  });

  it("keeps the model's own label as the Canvas rating description", () => {
    // The old step discarded them for "Full marks"/"Partial credit"/"No
    // marks", so the words in the rubric document and the words in Canvas
    // were different too - not just the numbers.
    const ratings = rubricRatingsForPoints(10, ["Excellent (100%)", "Meets Expectations (75%)", "Needs Improvement (50%)"]);
    expect(ratings.map((r) => r.description)).toEqual([
      "Excellent (100%)",
      "Meets Expectations (75%)",
      "Needs Improvement (50%)",
    ]);
  });
});

describe("every consumer that builds Canvas rating tiers derives from this table", () => {
  it("the lms-rubric workflow step calls the shared helper and holds no ladder of its own", () => {
    const src = readSource("src/lib/workflows/registry/steps.rubrics.ts");
    expect(src).toContain("rubricRatingsForPoints(");
    // The exact literals the defect was made of. Their ABSENCE is the fix.
    expect(src).not.toMatch(/description:\s*"Full marks"/);
    expect(src).not.toMatch(/description:\s*"Partial credit"/);
    expect(src).not.toMatch(/description:\s*"No marks"/);
    expect(src).not.toMatch(/Math\.round\(pointsValue \/ 2\)/);
  });

  it("the rubric bulk action's pure core derives its fallback from RUBRIC_TIER_PERCENTS rather than restating it", () => {
    const src = readSource("src/lib/rubric-bulk-plan.ts");
    expect(src).toContain("RUBRIC_TIER_PERCENTS");
    expect(src).not.toMatch(/DEFAULT_TIER_PERCENTS\s*=\s*\[/);
  });

  it("END TO END: a rubric written exactly as the prompt asks scores exactly what it says", () => {
    // The whole defect in one assertion. Build a rubric in the prompt's own
    // format, parse it with the real parser, score it with the real helper,
    // and require every tier's points to equal the percentage its own label
    // advertises - the property that was false before this fix.
    const exampleLines = rubricTierPromptLines()
      .split("\n")
      .map((l) => l.trim().replace(/^"/, "").replace(/"$/, ""));
    const rubric = ["Correctness (25%): Does it work.", ...exampleLines].join("\n");
    const rows = parseGeneratedRubric(rubric);
    const row = rows?.[0];
    expect(row).toBeDefined();

    const points = Number(String(row?.weight).replace(/[^0-9.]/g, ""));
    const ratings = rubricRatingsForPoints(points, (row?.subcategories ?? []).map((s) => s.label));

    RUBRIC_DEDUCTION_TIERS.forEach((tier, i) => {
      const advertised = points * (tier.percent / 100);
      expect(ratings[i].points).toBe(advertised);
    });
  });
});
