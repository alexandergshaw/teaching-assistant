import { describe, it, expect } from "vitest";
import {
  GRADE_FRAMING_HEADER,
  GRADE_PRECEDENCE_CLAUSE,
  GRADE_GENEROSITY_COUNTER_CLAUSE,
  INSTRUCTOR_INSTRUCTIONS_HEADER,
  buildSnapshotGradeSystemPrompt,
} from "./snapshot-grade-prompt";

describe("buildSnapshotGradeSystemPrompt", () => {
  const prompt = buildSnapshotGradeSystemPrompt("Write a function.", "Correctness: 10 pts", [
    { name: "Correctness", points: 10 },
  ]);

  it("carries the framing header verbatim", () => {
    expect(prompt).toContain(GRADE_FRAMING_HEADER);
  });

  it("carries the precedence clause verbatim, naming the rubric as the ONLY source of standards", () => {
    expect(prompt).toContain(GRADE_PRECEDENCE_CLAUSE);
    expect(prompt).toMatch(/ONLY source of grading standards/);
  });

  it("carries the shared buildSystemPrompt's own generosity clause, quoted accurately in full (not truncated)", () => {
    expect(prompt).toContain(
      "Grade generously by default, but do not automatically award full points when an explicit rubric violation is present."
    );
  });

  it("places the counter-clause AFTER the shared prompt's generosity clause", () => {
    const generosityIndex = prompt.indexOf("Grade generously by default");
    const counterIndex = prompt.indexOf(GRADE_GENEROSITY_COUNTER_CLAUSE);
    expect(generosityIndex).toBeGreaterThan(-1);
    expect(counterIndex).toBeGreaterThan(generosityIndex);
  });

  it("requires an instructionLikeContent flag and its verbatim quote field", () => {
    expect(prompt).toMatch(/"instructionLikeContent"/);
    expect(prompt).toMatch(/"instructionLikeContentQuote"/);
  });

  it("requires per-area verbatim citations tied to a shot index", () => {
    expect(prompt).toMatch(/"rubricAreaEvidence"/);
    expect(prompt).toMatch(/"quote"/);
    expect(prompt).toMatch(/"shotIndex"/);
    expect(prompt).toMatch(/copy the quote exactly as written in the transcription/i);
  });

  it("requires a missingRoles report naming roles never supplied at all", () => {
    expect(prompt).toMatch(/"missingRoles"/);
  });

  it("places the framing and precedence clause BEFORE the shared system prompt", () => {
    const framingIndex = prompt.indexOf(GRADE_FRAMING_HEADER);
    const precedenceIndex = prompt.indexOf(GRADE_PRECEDENCE_CLAUSE);
    const sharedIndex = prompt.indexOf("You are a teaching assistant helping to grade student submissions.");
    expect(framingIndex).toBeGreaterThan(-1);
    expect(precedenceIndex).toBeGreaterThan(framingIndex);
    expect(sharedIndex).toBeGreaterThan(precedenceIndex);
  });

  it("with no instructorInstructions argument, the prompt carries no instructor-instructions block at all", () => {
    expect(prompt).not.toContain(INSTRUCTOR_INSTRUCTIONS_HEADER);
    expect(prompt).not.toContain("INSTRUCTOR INSTRUCTIONS:");
  });
});

// H1-D (BINDING): the acceptance failure this must not become is a field
// that reaches the prompt-builder's signature and is then silently dropped
// from the actual composed string, or reaches the string but is overridden
// by an unamended precedence clause. Both halves must hold in ONE assertion
// set - a grep for the field name in the source proves neither.
describe("buildSnapshotGradeSystemPrompt with instructor-authored grading instructions (H1-D)", () => {
  const INSTRUCTOR_TEXT = "Focus feedback on argument structure; go easy on minor grammar slips.";
  const prompt = buildSnapshotGradeSystemPrompt(
    "Write a function.",
    "Correctness: 10 pts",
    [{ name: "Correctness", points: 10 }],
    INSTRUCTOR_TEXT
  );

  it("the composed prompt contains the instructor's own text, verbatim", () => {
    expect(prompt).toContain(INSTRUCTOR_TEXT);
  });

  it("the composed prompt contains the amended precedence sentence naming the instructor-instructions trust class", () => {
    // [\s\S]* rather than /s: the dotAll flag needs ES2018 and tsconfig.json
    // targets ES2017, so `/s` is a TS1501 error here even though it runs fine.
    expect(prompt).toMatch(/INSTRUCTOR INSTRUCTIONS[\s\S]*different trust class/);
    expect(GRADE_PRECEDENCE_CLAUSE).toMatch(/different trust class/);
  });

  it("frames the instructor text as NOT part of the captured work material", () => {
    expect(prompt).toContain(INSTRUCTOR_INSTRUCTIONS_HEADER);
    const headerIndex = prompt.indexOf(INSTRUCTOR_INSTRUCTIONS_HEADER);
    const textIndex = prompt.indexOf(INSTRUCTOR_TEXT);
    expect(headerIndex).toBeGreaterThan(-1);
    expect(textIndex).toBeGreaterThan(headerIndex);
  });

  it("still states the rubric alone governs what counts as meeting a criterion, even with instructions supplied", () => {
    expect(prompt).toMatch(/cannot change what counts as meeting a rubric criterion/);
  });

  it("blank/whitespace-only instructions produce no instructor block, same as omitting the argument", () => {
    const blankPrompt = buildSnapshotGradeSystemPrompt(
      "Write a function.",
      "Correctness: 10 pts",
      [{ name: "Correctness", points: 10 }],
      "   "
    );
    expect(blankPrompt).not.toContain(INSTRUCTOR_INSTRUCTIONS_HEADER);
  });
});
