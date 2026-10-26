import type { GradeRunItemRequestBody } from "../grading/incrementalRunPlan";
import type { SessionStudentKey } from "@/lib/grade/repository-evidence-types";

export type RepositorySessionStudent = { key: SessionStudentKey; label: string; sourceCue: string; retainedBytes: number };

export function listRepositoryStudents(sessionEpoch: string, bodies: ReadonlyMap<number, GradeRunItemRequestBody>): RepositorySessionStudent[] {
  return [...bodies].map(([sourceIndex, body]) => ({
    key: { sessionEpoch, sourceIndex }, label: body.entry.student,
    retainedBytes: new TextEncoder().encode(JSON.stringify(body)).byteLength,
    sourceCue: body.entry.submittedFiles.map((file) => file.name).join(", ").slice(0, 180) || body.entry.content.slice(0, 180),
  }));
}
