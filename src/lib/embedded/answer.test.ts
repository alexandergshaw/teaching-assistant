import { describe, it, expect } from "vitest";
import { answerFromContext } from "./answer";

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
