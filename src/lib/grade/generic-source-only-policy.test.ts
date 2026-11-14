import { expect,it } from "vitest";
import { hasSufficientGeneralRubricEvidence, isExplicitWrittenOnlyAssignment } from "./generic-source-only-policy";
it("permits explicitly written work but holds ambiguous or executable requirements",()=>{
  expect(isExplicitWrittenOnlyAssignment("Write about ethical decisions.","Evaluate the essay for clarity and evidence.")).toBe(true);
  expect(isExplicitWrittenOnlyAssignment("Write an essay and run the program.","Evaluate clarity.")).toBe(false);
  expect(isExplicitWrittenOnlyAssignment("Complete the assignment.","Correctness: 10 points.")).toBe(false);
  expect(isExplicitWrittenOnlyAssignment("Write a report about SQL queries.","Evaluate analysis.")).toBe(false);
});
it("requires review for execution, test coverage, output and ambiguous programming rubrics",()=>{
  for (const rubric of ["Run the program: 20 points", "Test coverage: 30 points", "Correct output: 20 points", "Correctness: 20 points"]) {
    expect(hasSufficientGeneralRubricEvidence("Assess the submitted program.", rubric)).toBe(false);
  }
  expect(hasSufficientGeneralRubricEvidence("Explain the topic.", "Evaluate the essay for clarity.")).toBe(true);
});
it("allows explicit static SQL review while holding execution requirements",()=>{
  expect(isExplicitWrittenOnlyAssignment("Review the submitted statements.","Analyze the SQL queries for clarity.")).toBe(true);
  expect(isExplicitWrittenOnlyAssignment("Run the statements against the database.","Analyze the SQL queries for clarity.")).toBe(false);
  expect(isExplicitWrittenOnlyAssignment("Produce correct results.","Review SQL queries.")).toBe(false);
});
