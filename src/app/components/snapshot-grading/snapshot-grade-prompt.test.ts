import { describe, it, expect } from "vitest";
import {
  GRADE_FRAMING_HEADER,
  GRADE_PRECEDENCE_CLAUSE,
  GRADE_GENEROSITY_COUNTER_CLAUSE,
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
});
