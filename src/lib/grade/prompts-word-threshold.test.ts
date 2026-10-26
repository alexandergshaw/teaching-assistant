import { expect, it } from "vitest";
import { buildSystemPrompt, LENGTH_DEDUCTION_DIRECTIVE, type AxisScope } from "./prompts";
function prompt(axis: AxisScope, enabled: boolean, threshold?: number, evidence?: string) {
  return buildSystemPrompt("Minimum 500 words", "Content (10 pts): reasoning", [], "some", "in-overall-comment", axis, "balanced", undefined, true, enabled, evidence, threshold);
}
it.each(["all", "initial-post-only", "reply-only"] as const)("sends the inclusive threshold rule on %s", (axis) => {
  const actual = prompt(axis, true, 25, "EVIDENCE_CONTRACT_SENTINEL");
  expect(actual).toContain("shortfall = R - actualStudentWords");
  expect(actual).toContain("shortfall >= 25 words");
  expect(actual).toContain("A shortfall smaller than 25 words must receive no length deduction");
  expect(actual).toContain("work at or above R must receive no length deduction");
  expect(actual).toContain("minimum word count is missing or ambiguous");
  expect(actual).toContain("do not invent a numeric minimum");
  expect(actual).toContain("Other rubric and content deductions remain unchanged");
  expect(actual).not.toContain(LENGTH_DEDUCTION_DIRECTIVE);
  expect(actual).toContain("EVIDENCE_CONTRACT_SENTINEL");
});
it("OFF is byte-equivalent with or without a threshold", () => expect(prompt("all", false, 25)).toBe(prompt("all", false)));
it("absent preserves the legacy ON directive byte for byte", () => {
  expect(prompt("all", true)).toBe(prompt("all", false) + "\n\n" + LENGTH_DEDUCTION_DIRECTIVE);
});
