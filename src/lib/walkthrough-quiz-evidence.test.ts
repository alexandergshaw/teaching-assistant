import { expect, it } from "vitest";
import { addedPromptLines, hasExplicitPromptQuizFact, hasQuizEvidence, hasUnsupportedQuizContent } from "./walkthrough-quiz-evidence";

it("requires current positive quiz evidence, not an example or a negative statement", () => {
  expect(hasQuizEvidence("No quiz is assigned this week.")).toBe(false);
  expect(hasQuizEvidence("Quiz 2 is canceled.")).toBe(false);
  expect(hasQuizEvidence("Quiz 2 is not available.")).toBe(false);
  expect(hasQuizEvidence("Quiz 3 will not be held.")).toBe(false);
  expect(hasQuizEvidence("Quiz 3 is not due until Friday.")).toBe(true);
  expect(hasQuizEvidence("Quiz 3 opens Thursday.")).toBe(true);
  expect(hasQuizEvidence("/docs/quiz.pdf\nQuiz_2.js")).toBe(false);
  expect(hasUnsupportedQuizContent("Weekly update", "Quiz Details\n- Complete the project", "Finish the project.")).toBe(true);
  expect(hasUnsupportedQuizContent("Weekly update", "Knowledge check\n- Open the materials", "Finish the project.")).toBe(true);
  expect(hasUnsupportedQuizContent("Update", "There is no quiz this week.", "Finish the project.")).toBe(false);
});

it("distinguishes explicit added quiz facts from the unchanged template and instructions", () => {
  const original = "Template: Quiz Details\nUse current facts";
  expect(addedPromptLines(original, original + "\nKeep it short.")).not.toContain("Quiz");
  expect(hasExplicitPromptQuizFact("Do not invent quiz information.")).toBe(false);
  expect(hasExplicitPromptQuizFact("Do not invent Quiz 2 due Friday.")).toBe(false);
  expect(hasExplicitPromptQuizFact("Quiz 2 is canceled and was due Friday.")).toBe(false);
  expect(hasExplicitPromptQuizFact("Quiz 2 is not due until Friday.")).toBe(true);
  expect(hasUnsupportedQuizContent("Project", "Time limit: 30 minutes. Number of attempts: 2.", "Project description.")).toBe(false);
  expect(hasExplicitPromptQuizFact("Quiz 2 is due Thursday.")).toBe(true);
});
