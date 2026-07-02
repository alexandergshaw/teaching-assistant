import { describe, it, expect } from "vitest";
import { scaffoldQuizQuestions, renderQuizText } from "./quiz";

const MATERIAL = [
  "Recursion is when a function calls itself to solve a smaller version of the problem.",
  "A base case is the condition that stops the recursion.",
  "A stack frame is the memory allocated for one function call.",
  "The midterm exam is worth 150 points.",
].join(" ");

describe("scaffoldQuizQuestions", () => {
  it("blanks defined terms out of definition sentences with distractors from the material", () => {
    const questions = scaffoldQuizQuestions(MATERIAL, 5);
    const first = questions[0];
    expect(first.type).toBe("multiple_choice");
    expect(first.prompt).toContain("________");
    expect(first.prompt).not.toMatch(new RegExp(first.answer, "i"));
    expect(first.choices).toContain(first.answer);
    expect(first.choices!.length).toBeGreaterThanOrEqual(3);
    // The answer is verbatim from the source sentence.
    expect(first.source.toLowerCase()).toContain(first.answer.toLowerCase());
  });

  it("blanks numbers out of numeric fact sentences", () => {
    const questions = scaffoldQuizQuestions(MATERIAL, 10);
    const numeric = questions.find((q) => q.answer === "150");
    expect(numeric).toBeDefined();
    expect(numeric!.prompt).toContain("worth ________ points");
  });

  it("falls back to fill-in-the-blank when the material has too few distractor terms", () => {
    const questions = scaffoldQuizQuestions("XSS is bad for the web.", 3);
    expect(questions.length).toBeGreaterThan(0);
    expect(questions[0].type).toBe("fill_blank");
    expect(questions[0].choices).toBeUndefined();
  });

  it("respects the count cap, dedupes sources, and is deterministic", () => {
    const questions = scaffoldQuizQuestions(MATERIAL, 2);
    expect(questions).toHaveLength(2);
    const sources = questions.map((q) => q.source);
    expect(new Set(sources).size).toBe(sources.length);
    expect(scaffoldQuizQuestions(MATERIAL, 5)).toEqual(scaffoldQuizQuestions(MATERIAL, 5));
  });

  it("returns nothing for material with no usable facts", () => {
    expect(scaffoldQuizQuestions("Hi there. Ok. Sure.", 5)).toEqual([]);
  });
});

describe("renderQuizText", () => {
  it("renders numbered questions with lettered choices and an answer key", () => {
    const text = renderQuizText(scaffoldQuizQuestions(MATERIAL, 3));
    expect(text).toMatch(/^1\. Fill in the blank:/);
    expect(text).toContain("a) ");
    expect(text).toContain("Answer key:");
  });

  it("returns an empty string for no questions", () => {
    expect(renderQuizText([])).toBe("");
  });
});
