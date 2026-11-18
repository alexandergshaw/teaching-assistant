import { expect, it } from "vitest";
import { notebookGradeBinding } from "./notebook-grade-binding";
it("binds the exact grading content independent of object key order and attempt reference", async () => {
  const first = { entry: { student: "A", content: "one" }, rubric: "ten", notebookAttempt: "id-one" };
  expect(await notebookGradeBinding(first)).toBe(await notebookGradeBinding({ rubric: "ten", notebookAttempt: "id-two", entry: { content: "one", student: "A" } }));
  expect(await notebookGradeBinding(first)).not.toBe(await notebookGradeBinding({ entry: { student: "B", content: "one" }, rubric: "ten" }));
  expect(await notebookGradeBinding(first)).not.toBe(await notebookGradeBinding({ entry: { student: "A", content: "one" }, rubric: "different" }));
});
