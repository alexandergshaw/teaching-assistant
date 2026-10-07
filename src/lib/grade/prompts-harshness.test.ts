import { describe, it, expect } from "vitest";
import { harshnessDirectiveForLevel } from "./prompts";
import type { GradeHarshness } from "./types";

// Oracle 2 (docs/grading-chat-harshness-w1-test-notes.md section 2). Both
// directive literals are DUPLICATED here, never imported from prompts.ts, so a
// change to the production constants goes red instead of comparing a value
// with itself.
const STRICT = "Grade strictly. Hold the submission to the full requirements of each rubric area, and deduct for every shortfall you can point to in the submission. Do not round up or give the benefit of the doubt when a requirement is only partly met. Still cite the specific reason for each deduction, and never invent a problem the submission does not actually have.";
const LENIENT = "Grade leniently. Give the benefit of the doubt wherever a rubric area is substantially met, treat minor or cosmetic issues as not worth a deduction, and award full points for an area unless there is a clear, evidenced shortfall. Do not award points for work that is genuinely missing.";

describe("harshnessDirectiveForLevel", () => {
  it("maps lenient to the frozen lenient directive", () => {
    expect(harshnessDirectiveForLevel("lenient")).toBe(LENIENT);
  });

  it("maps strict to the frozen strict directive", () => {
    expect(harshnessDirectiveForLevel("strict")).toBe(STRICT);
  });

  it("maps balanced to the empty string", () => {
    expect(harshnessDirectiveForLevel("balanced")).toBe("");
  });

  it("maps undefined to the empty string", () => {
    expect(harshnessDirectiveForLevel(undefined)).toBe("");
  });

  it("maps an unrecognised value to the empty string rather than throwing", () => {
    expect(harshnessDirectiveForLevel("sideways" as GradeHarshness)).toBe("");
  });

  it("control: the two directives are non-empty and distinct", () => {
    expect(STRICT.length).toBeGreaterThan(0);
    expect(LENIENT.length).toBeGreaterThan(0);
    expect(STRICT).not.toBe(LENIENT);
  });
});
