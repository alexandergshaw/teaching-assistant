import { describe, it, expect } from "vitest";
import { buildSampleAnswerPrompt } from "./grade";

describe("buildSampleAnswerPrompt", () => {
  it("creates a prompt with no MODULE MATERIALS section when context is empty", () => {
    const instructions = "Write a 5-page essay on photosynthesis.";
    const rubric = "Clarity: 5 points\nCompleteness: 5 points";
    const prompt = buildSampleAnswerPrompt(instructions, rubric, "");

    expect(prompt).not.toContain("MODULE MATERIALS");
    expect(prompt).not.toContain("Ground the answer in the module materials");
    expect(prompt).toContain("ASSIGNMENT INSTRUCTIONS:");
    expect(prompt).toContain(instructions);
    expect(prompt).toContain("RUBRIC:");
    expect(prompt).toContain(rubric);
  });

  it("includes MODULE MATERIALS section when context is provided", () => {
    const instructions = "Write a 5-page essay on photosynthesis.";
    const rubric = "Clarity: 5 points\nCompleteness: 5 points";
    const context = "Objectives: Understand photosynthesis\nPages: Light reactions, Calvin cycle";
    const prompt = buildSampleAnswerPrompt(instructions, rubric, context);

    expect(prompt).toContain("MODULE MATERIALS (objectives, pages, and other assignments from this module):");
    expect(prompt).toContain(context);
    expect(prompt).toContain("Ground the answer in the module materials: use the concepts, terminology, and approaches taught in this module.");
  });

  it("maintains correct prompt structure and ordering", () => {
    const instructions = "Write code.";
    const rubric = "Correctness: 10 points";
    const context = "Module: Object-oriented programming";
    const prompt = buildSampleAnswerPrompt(instructions, rubric, context);

    const assignmentIndex = prompt.indexOf("ASSIGNMENT INSTRUCTIONS:");
    const rubricIndex = prompt.indexOf("RUBRIC:");
    const moduleIndex = prompt.indexOf("MODULE MATERIALS");
    const writeSampleIndex = prompt.indexOf("Write a single sample correct answer");
    const rulesIndex = prompt.indexOf("Rules:");

    expect(assignmentIndex).toBeLessThan(rubricIndex);
    expect(rubricIndex).toBeLessThan(moduleIndex);
    expect(moduleIndex).toBeLessThan(writeSampleIndex);
    expect(writeSampleIndex).toBeLessThan(rulesIndex);
  });

  it("preserves byte-identical output for empty context (backward compatibility)", () => {
    const instructions = "Assignment test.";
    const rubric = "Rubric test.";
    const prompt = buildSampleAnswerPrompt(instructions, rubric, "");

    const expectedStartLine = "You are a teaching assistant writing a model answer key for an assignment.";
    expect(prompt.startsWith(expectedStartLine)).toBe(true);
    expect(prompt).toContain("Return ONLY valid JSON");
    expect(prompt).toContain("Do not include any text outside the JSON object.");
  });

  it("includes the grounding rule in the Rules section when context provided", () => {
    const instructions = "Test.";
    const rubric = "Test.";
    const context = "Test.";
    const prompt = buildSampleAnswerPrompt(instructions, rubric, context);

    const rulesIndex = prompt.indexOf("Rules:");
    const groundingRuleIndex = prompt.indexOf("Ground the answer in the module materials");

    expect(rulesIndex).toBeLessThan(groundingRuleIndex);
    expect(prompt.substring(rulesIndex)).toContain("Ground the answer in the module materials");
  });
});
