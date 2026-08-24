// The three deduction tiers every generated rubric uses, in one place.
//
// WHY THIS MODULE EXISTS. `generateRubric`'s prompt (./rubric.ts) tells the
// model to write exactly three subcategory lines per area and names their
// percentages in the prompt text itself. Two separate consumers then turn the
// model's reply into Canvas rubric rating tiers - the `lms-rubric` workflow
// step and chunk H's rubric bulk action - and until 2026-08-24 the workflow
// step built its ladder at 100/50/0 while the prompt promised 100/75/50.
//
// The rubric TEXT therefore said a "Meets Expectations" answer earns 75
// percent and the Canvas rubric awarded it 50, with the bottom tier worth
// nothing instead of half. On a 25-point criterion that is a 6.25-point
// discrepancy per criterion between what the rubric says and what it scores.
// Nobody reading the rubric in Canvas could see it, because the tier LABELS
// came from the same generated text that promised the other numbers - the
// document and the scoring disagreed while looking like one artifact.
//
// So the percentages live HERE, the prompt is RENDERED from them rather than
// restating them, and every consumer derives from the same array. Drift is not
// prevented by a comment asking future readers to keep two lists in step; it
// is prevented by there being one list.
//
// DELIBERATELY DEPENDENCY-FREE. ./rubric.ts imports `callLlm`, so a shared lib
// reachable from the client cannot import it - see this repo's recorded
// registry-client-bundle guard. This module imports nothing, so the workflow
// step, the pure planning lib and the prompt can all read it safely.

export interface RubricDeductionTier {
  /** The tier's name, exactly as the prompt asks the model to write it and
   *  exactly as it should appear as a Canvas rating's description. */
  label: string;
  /** Share of the criterion's own point value this tier awards - NOT a share
   *  of the whole rubric. 100 means full marks for that one criterion. */
  percent: number;
  /** The parenthetical the prompt pairs with the percentage. Prompt wording
   *  only; no consumer parses it. */
  deductionNote: string;
  /** The bracketed instruction the prompt gives the model for what to write
   *  after the colon. Prompt wording only. */
  guidance: string;
}

/**
 * Ordered best-to-worst. The ORDER is contractual: `parseGeneratedRubric`
 * returns a row's subcategories in the order the model wrote them, and a
 * consumer that cannot parse a percentage out of a label falls back to this
 * array positionally.
 */
export const RUBRIC_DEDUCTION_TIERS: readonly RubricDeductionTier[] = [
  {
    label: "Excellent",
    percent: 100,
    deductionNote: "no deductions",
    guidance: "[Specific criteria for full credit]",
  },
  {
    label: "Meets Expectations",
    percent: 75,
    deductionNote: "25% deducted",
    guidance: "[What is missing or partially done that causes the deduction]",
  },
  {
    label: "Needs Improvement",
    percent: 50,
    deductionNote: "50% deducted",
    guidance: "[Significant deficiencies that reduce the score by half]",
  },
];

/** Just the percentages, best-to-worst - the shape a consumer wants when it
 *  is falling back positionally rather than reading a parsed label. */
export const RUBRIC_TIER_PERCENTS: readonly number[] = RUBRIC_DEDUCTION_TIERS.map((t) => t.percent);

/**
 * The three prompt lines, rendered from the array above. `generateRubric`
 * interpolates this instead of spelling the tiers out, so the prompt cannot
 * say one thing while a consumer does another.
 *
 * The em dash is deliberate and must not be "fixed" to a hyphen: this string
 * reproduces the prompt text that has always shipped, and changing what the
 * model reads is a behaviour change, not a formatting one.
 */
export function rubricTierPromptLines(): string {
  return RUBRIC_DEDUCTION_TIERS.map(
    (t) => `  "  ${t.label} (${t.percent}% — ${t.deductionNote}): ${t.guidance}"`
  ).join("\n");
}

/**
 * Turn one criterion's own point value into Canvas rating tiers.
 *
 * `subcategoryLabels` are the model's own subcategory labels for that
 * criterion, in the order it wrote them (`RubricRow.subcategories[].label`).
 * A percentage parsed out of the label WINS over the positional fallback,
 * because the label is what the instructor and the student actually read - if
 * the model wrote "Meets Expectations (70%)" then 70 is the honest number to
 * score, even though the prompt asked for 75. The fallback only covers a
 * label that carries no percentage at all.
 */
export function rubricRatingsForPoints(
  criterionPoints: number,
  subcategoryLabels: readonly string[] = []
): Array<{ description: string; points: number }> {
  const source = subcategoryLabels.length > 0 ? subcategoryLabels : RUBRIC_DEDUCTION_TIERS.map((t) => t.label);
  return source.map((rawLabel, i) => {
    const label = String(rawLabel).trim();
    const match = label.match(/(\d+(?:\.\d+)?)\s*%/);
    const percent = match ? Number(match[1]) : RUBRIC_TIER_PERCENTS[i] ?? 0;
    return {
      description: label || RUBRIC_DEDUCTION_TIERS[i]?.label || `Tier ${i + 1}`,
      points: Math.round(criterionPoints * (percent / 100) * 100) / 100,
    };
  });
}
