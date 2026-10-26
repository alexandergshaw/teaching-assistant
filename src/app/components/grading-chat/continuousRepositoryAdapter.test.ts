import { expect, it } from "vitest";
import { createContinuousRepositoryAdapter, listRepositoryStudents } from "./continuousRepositoryAdapter";
import type { GradeResult } from "@/lib/grade/types";
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
it("compares body, grade revision, pending state and epoch before atomic adoption", () => {
  const body = { sourceIndex: 7, entry: { student: "Sam", content: "ORIGINAL", mergedFileCount: 1, submittedFiles: [] } } as unknown as GradeRunItemRequestBody;
  const result = { student: "Sam", totalScore: "6/10", rubricAreas: [], overallComment: "", strengths: "", improvements: "", resubmitNotice: "", feedback: "", mergedFileCount: 1, submittedFiles: [], userId: 41 } as GradeResult;
  const bodies = new Map([[7, body]]), arrived = [{ sourceIndex: 7, result }], revisions = new Map([[7, 1]]), pending = new Set<number>();
  let epoch = "session-1", published = 0;
  const adapter = createContinuousRepositoryAdapter({ bodies, arrived, revisions, pending, originals: new Map(), epoch: () => epoch, rubricFingerprint: "rubric", publish: () => { published += 1; } });
  const snapshot = adapter.capture({ sessionEpoch: "session-1", sourceIndex: 7 })!;
  const entry = { ...body.entry, content: "ORIGINAL plus NEW_EVIDENCE" }, proposed = { ...result, student: "forged", userId: 999, totalScore: "9/10" } as GradeResult;
  revisions.set(7, 2); expect(adapter.adopt(snapshot, proposed, entry)).toBe(false); revisions.set(7, 1);
  bodies.set(7, { ...body, entry: { ...body.entry, content: "changed" } }); expect(adapter.adopt(snapshot, proposed, entry)).toBe(false); bodies.set(7, body);
  pending.add(7); expect(adapter.adopt(snapshot, proposed, entry)).toBe(false); pending.clear();
  epoch = "session-2"; expect(adapter.adopt(snapshot, proposed, entry)).toBe(false); epoch = "session-1";
  expect(adapter.adopt(snapshot, proposed, entry)).toBe(true); expect(published).toBe(1);
  expect(arrived[0].result).toMatchObject({ student: "Sam", userId: 41, totalScore: "9/10" }); expect(bodies.get(7)!.entry.content).toBe("ORIGINAL plus NEW_EVIDENCE");
  expect(revisions.get(7)).toBe(2); expect(adapter.capture(snapshot.key)!.originalBody.entry.content).toBe("ORIGINAL");
});
