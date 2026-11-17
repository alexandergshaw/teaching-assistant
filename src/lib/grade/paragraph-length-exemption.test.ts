import { describe, expect, it } from "vitest";
import { hasRubricLengthRule, withoutSupportedInstructionLength } from "./length-only-exemption";
import { reportsLengthPenalty, reportsLengthCriterionDeduction } from "./reported-length-penalty";

describe("paragraph length exemptions", () => {
  it.each(["1 to 2", "1–2", "1-2", "1—2", "2"])("removes only a standalone %s paragraph instruction", n => {
    const input = `Directions:\n- Write a post of ${n} paragraphs.\n- Discuss the evidence.`;
    const result = withoutSupportedInstructionLength(input);
    expect(result).not.toBeNull();
    expect(result).toContain("Discuss the evidence.");
    expect(result).not.toContain("paragraphs");
    expect(result).toContain("Write a post.");
  });
  it("accepts the observed standalone written portion direction", () => {
    const result = withoutSupportedInstructionLength("Your written portion should be 1–2 paragraphs in length.\nExplain your work.");
    expect(result).toContain("Your written portion should be included.");
    expect(result).toContain("Explain your work.");
  });
  it("preserves the full preceding same-line submission requirements", () => {
    const prefix = "To complete this assignment, submit the VectorSorting.cpp code files and a code reflection and associated pseudocode or flowchart written portion.";
    const result = withoutSupportedInstructionLength(`${prefix} Your written portion should be 1–2 paragraphs in length.`);
    expect(result).toBe(`${prefix} Your written portion should be included.`);
  });
  it("preserves a mandatory modal", () => {
    expect(withoutSupportedInstructionLength("Your written portion must be 1–2 paragraphs in length.")).toBe("Your written portion must be included.");
  });
  it("refuses a mixed substantive paragraph requirement", () => {
    expect(withoutSupportedInstructionLength("Write 1 to 2 paragraphs explaining the evidence.")).toBeNull();
    expect(hasRubricLengthRule("At least 2 paragraphs are required")).toBe(true);
  });
  it("recognizes paragraph deductions and paragraph-only criteria", () => {
    expect(reportsLengthPenalty("Deducted 2 points for paragraph count.")).toBe(true);
    expect(reportsLengthPenalty("No paragraph count penalty was applied.")).toBe(false);
    expect(reportsLengthCriterionDeduction("Paragraph count", "3/5")).toBe(true);
  });
});
