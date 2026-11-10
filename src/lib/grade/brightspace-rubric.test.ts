import { expect, it } from "vitest";
import { extractRubricCriteria } from "./rubric";
import { resolveRunHeader } from "./run-header";

const names = ["Code Reflection", "Pseudocode or Flowchart", "Specifications and Correctness: Algorithm", "Specifications and Correctness: Data Structure", "Annotation and Documentation", "Modular and Reusable", "Readability"];
const weights = [25, 10, 20, 20, 10, 10, 5];
const rubric = ["Criteria", "Meets Expectations (100%)", "Partially Meets Expectations (70%)", "Does Not Meet Expectations (0%)", "Value", ...names.flatMap((name, i) => [name, "Complete work", "Partial work", "Missing work", String(weights[i])]), "Total:", "100%"].join("\n");

it("extracts the seven actual criteria and weights rather than the rating headings", async () => {
  expect(extractRubricCriteria(rubric)).toEqual(names.map((name, i) => ({ name, points: weights[i] })));
  const header = await resolveRunHeader("Explain your work", rubric, "gemini", { synthesizeRubricWhenBlank: false });
  expect(header.kind).toBe("ok"); if (header.kind === "ok") expect(header.criteriaNames).toEqual(names);
});
it.each([rubric.replace("\n25\n", "\nmissing\n"), rubric.replace("Partially Meets Expectations (70%)\n", ""), rubric.replace("Criteria\n", ""), rubric.replace("Criteria\n", "").replace("Partially Meets Expectations (70%)\n", ""), rubric.replace("Partially Meets Expectations (70%)\n", "").replace("Does Not Meet Expectations (0%)\n", "").replace("Meets Expectations (100%)", "Heading\nExtra\nMore\nText\nMeets Expectations (100%)"), rubric.replace("\n5\nTotal:", "\n7\nTotal:")])("refuses a malformed recognized table at the session header", async (bad) => {
  expect((await resolveRunHeader("Explain your work", bad, "gemini", { synthesizeRubricWhenBlank: false })).kind).toBe("refused");
  expect(() => extractRubricCriteria(bad)).toThrow(/could not be read/);
});
it("leaves unrelated ordinary rubric formats on the existing parser", () => {
  expect(extractRubricCriteria("Writing (20 pts): quality\nMeets Expectations (100%)")).toEqual([{ name: "Writing", points: 20 }]);
});
it.each([rubric.replace("Code Reflection", "Code-Style").replace("Pseudocode or Flowchart", "Code Style"), `${rubric}\n${rubric}`])("refuses normalized duplicate names or multiple tables", async (bad) => {
  expect((await resolveRunHeader("Explain your work", bad, "gemini", { synthesizeRubricWhenBlank: false })).kind).toBe("refused");
});
