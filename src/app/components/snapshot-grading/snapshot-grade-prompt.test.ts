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

// Backlog 3.5 (scratchpad/b35-rulings.md, Ruling B35-11/B35-12). This is the
// end-to-end version of prompts.test.ts's own scoringInstructionMode test
// (3), verified through the actual entry point an instructor's own Grade
// call goes through - buildSnapshotGradeSystemPrompt, not buildSystemPrompt
// directly - so a regression that dropped the "every" argument from
// snapshot-grade-prompt.ts's own internal call would be caught here even if
// prompts.test.ts stayed green.
describe("buildSnapshotGradeSystemPrompt scopes to scoringInstructionMode=\"every\" (Ruling B35-12)", () => {
  it("a MIXED-points confirmed-areas list does NOT produce the numeric scoring instruction", () => {
    const prompt = buildSnapshotGradeSystemPrompt("Write a function.", "Rubric.", [
      { name: "Thesis", points: 20 },
      { name: "Grammar", points: null },
    ]);
    expect(prompt).not.toMatch(/Score each area out of the points shown for it/);
  });

  it("a uniform all-points confirmed-areas list still produces the numeric scoring instruction", () => {
    const prompt = buildSnapshotGradeSystemPrompt("Write a function.", "Rubric.", [
      { name: "Thesis", points: 20 },
      { name: "Grammar", points: 10 },
    ]);
    expect(prompt).toMatch(/Score each area out of the points shown for it/);
  });
});

// Backlog A11 (docs/backlog.yml row A11, R13): the composed snapshot prompt
// is pinned end to end, in the idiom of the "every"-scoping block above,
// which exists precisely so a dropped argument in this file's own call to
// buildSystemPrompt is caught even when prompts.test.ts stays green.
// Ruling E's whole complaint about the round-1 design was that an appendix
// clause AFTER buildSystemPrompt's own text cannot reverse loci already
// inside the JSON shape the model copies - these two negatives are the
// direct test of that: they fail on an appendix-style fix and pass only on a
// rewrite at source (praiseRouting: "separate-strengths").
describe("buildSnapshotGradeSystemPrompt opts into separate-strengths praise routing (backlog A11, R13)", () => {
  const prompt = buildSnapshotGradeSystemPrompt("Write a function.", "Correctness: 10 pts", [
    { name: "Correctness", points: 10 },
  ]);

  it('the composed prompt contains a "strengths" key in the JSON shape', () => {
    expect(prompt).toMatch(/"strengths":\s*"what the student did well"/);
  });

  it('does NOT contain the default branch\'s "In overallComment, summarize strengths" text', () => {
    expect(prompt).not.toContain("In overallComment, summarize strengths");
  });

  it('does NOT contain the default branch\'s "is the intended division" text (lowercase, per Ruling H\'s correction)', () => {
    expect(prompt).not.toContain("is the intended division");
    // ...and the non-default REWORDING of that same clause IS present, so
    // this is not merely a typo-proof negative - an appendix could never
    // remove the default branch's exact sentence from the base text it
    // follows; only a rewrite at source can.
    expect(prompt).toContain(
      "Praising work in strengths, naming deductions in overallComment, and advising in improvements is how these three fields are meant to divide the feedback."
    );
  });
});
