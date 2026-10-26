import { expect, it } from "vitest";
import { listRepositoryStudents } from "./continuousRepositoryAdapter";
import type { GradeRunItemRequestBody } from "../grading/incrementalRunPlan";
it("lists admitted source indices with original cues without introducing LMS identity", () => {
  const body = { entry: { student: "Sam", content: "original sentinel", submittedFiles: [{ name: "original.txt" }] } } as GradeRunItemRequestBody;
  const students = listRepositoryStudents("session-1", new Map([[7, body], [9, { ...body, entry: { ...body.entry, student: "Sam (2)" } }]]));
  expect(students).toMatchObject([
    { key: { sessionEpoch: "session-1", sourceIndex: 7 }, label: "Sam", sourceCue: "original.txt" },
    { key: { sessionEpoch: "session-1", sourceIndex: 9 }, label: "Sam (2)", sourceCue: "original.txt" },
  ]);
  expect(body.entry.content).toBe("original sentinel");
});
