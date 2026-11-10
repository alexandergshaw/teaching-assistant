import { describe, expect, it } from "vitest";
import { reportsLengthCriterionDeduction, reportsLengthPenalty } from "./reported-length-penalty";
describe("explicit length-penalty signal", () => {
  it.each(["Deducted 2 points for word count", "A length penalty was applied", "Word count: 3 points deducted", "Deducted 5 points for falling below 300 words", "A penalty was applied for the word minimum", "Subtracted points because it was only 2 pages", "Lost 2 points for word count", "2 points off for word count", "Deducted 2.5 points for word count"])("flags %s", (text) => expect(reportsLengthPenalty(text)).toBe(true));
  it.each(["No length penalty was applied", "The argument is short but clear", "Deducted for missing evidence", "Did not apply a length penalty", "No points were deducted for word count"])("leaves %s unflagged", (text) => expect(reportsLengthPenalty(text)).toBe(false));
});
describe("explicit length-only criterion", () => {
  it("flags a numeric shortfall on a length-only rubric area", () => {
    expect(reportsLengthCriterionDeduction("Word Count", "4/5")).toBe(true);
    expect(reportsLengthCriterionDeduction("Submission Length", "0/2")).toBe(true);
  });
  it("does not assume ordinary content criteria or full credit are length penalties", () => {
    expect(reportsLengthCriterionDeduction("Clarity and length", "4/5")).toBe(false);
    expect(reportsLengthCriterionDeduction("Word Count", "5/5")).toBe(false);
    expect(reportsLengthCriterionDeduction("Word Count", "not scored")).toBe(false);
  });
});
