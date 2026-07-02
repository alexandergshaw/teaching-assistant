import { describe, it, expect } from "vitest";
import { answerFromContext, expandQuestionWithHistory } from "./answer";

const CORPUS =
  "Recursion is when a function calls itself to solve a smaller version of the problem. " +
  "Every recursive function needs a base case to stop. " +
  "The midterm exam is on October 12 in room 204. " +
  "Office hours are Tuesdays from 2pm to 4pm.";

describe("answerFromContext", () => {
  it("retrieves the sentences relevant to the question, verbatim", () => {
    const answer = answerFromContext("When is the midterm exam?", CORPUS);
    expect(answer).toContain("The midterm exam is on October 12 in room 204.");
    expect(answer).not.toContain("Office hours");
  });

  it("answers definition questions with a definition sentence from the text", () => {
    const answer = answerFromContext("What is recursion?", CORPUS);
    expect(answer).toBe("Recursion is when a function calls itself to solve a smaller version of the problem.");
  });

  it("summarizes on a summary intent", () => {
    const answer = answerFromContext("Can you summarize this?", CORPUS);
    expect(answer).toMatch(/^(?:In summary:|The main points:|Briefly:)/);
    expect(answer.length).toBeGreaterThan(30);
  });

  it("says so honestly when the text does not address the question", () => {
    const answer = answerFromContext("What is the airspeed of a swallow?", CORPUS);
    expect(answer).toContain("doesn't appear to address that");
  });

  it("handles empty inputs without throwing", () => {
    expect(answerFromContext("", CORPUS)).toContain("doesn't appear to address");
    expect(answerFromContext("question?", "")).toContain("doesn't appear to address");
  });

  it("is deterministic", () => {
    expect(answerFromContext("base case?", CORPUS)).toBe(answerFromContext("base case?", CORPUS));
  });
});

describe("conversational follow-ups", () => {
  it("expands a terse follow-up with the earlier turns' subject terms", () => {
    const expanded = expandQuestionWithHistory("when is it?", [
      { role: "user", text: "Tell me about the midterm exam" },
      { role: "model", text: "The midterm exam is on October 12 in room 204." },
    ]);
    expect(expanded).toContain("when is it?");
    expect(expanded).toContain("midterm");
  });

  it("leaves self-contained questions unchanged", () => {
    const question = "When is the final project deadline?";
    expect(expandQuestionWithHistory(question, [{ role: "user", text: "about recursion" }])).toBe(question);
  });

  it("resolves a follow-up against the right sentence in the corpus", () => {
    const history = [{ role: "user", text: "Tell me about the midterm exam" }];
    const answer = answerFromContext("when is it?", CORPUS, history);
    expect(answer).toContain("The midterm exam is on October 12 in room 204.");
    expect(answer).not.toContain("Office hours");
  });

  it("behaves exactly as before when no history is given", () => {
    expect(answerFromContext("When is the midterm exam?", CORPUS)).toBe(
      answerFromContext("When is the midterm exam?", CORPUS, [])
    );
  });
});
