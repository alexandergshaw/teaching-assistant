import type { GradeRunItemRequestBody } from "../grading/incrementalRunPlan";
import type { SessionStudentKey } from "@/lib/grade/repository-evidence-types";
import type { GradeResult, StudentSubmissionEntry } from "@/lib/grade/types";
import type { ArrivedItemResult } from "../grading/incrementalRunPlan";

export type RepositorySessionStudent = { key: SessionStudentKey; label: string; sourceCue: string; retainedBytes: number };

export function listRepositoryStudents(sessionEpoch: string, bodies: ReadonlyMap<number, GradeRunItemRequestBody>): RepositorySessionStudent[] {
  return [...bodies].map(([sourceIndex, body]) => ({
    key: { sessionEpoch, sourceIndex }, label: body.entry.student,
    retainedBytes: new TextEncoder().encode(JSON.stringify(body)).byteLength,
    sourceCue: body.entry.submittedFiles.map((file) => file.name).join(", ").slice(0, 180) || body.entry.content.slice(0, 180),
  }));
}

export type RepositoryStudentSnapshot = { key: SessionStudentKey; body: GradeRunItemRequestBody; originalBody: GradeRunItemRequestBody; result: GradeResult; gradeRevision: number; signature: string; rubricFingerprint: string };
export type ContinuousRepositoryAdapter = {
  capture: (key: SessionStudentKey) => RepositoryStudentSnapshot | null;
  adopt: (snapshot: RepositoryStudentSnapshot, result: GradeResult, entry: StudentSubmissionEntry) => boolean;
};
export function createContinuousRepositoryAdapter(params: {
  epoch: () => string; bodies: Map<number, GradeRunItemRequestBody>; arrived: ArrivedItemResult[];
  pending: Set<number>; revisions: Map<number, number>; rubricFingerprint: string; publish: () => void;
  originals: Map<number, GradeRunItemRequestBody>;
}): ContinuousRepositoryAdapter {
  const capture = (key: SessionStudentKey): RepositoryStudentSnapshot | null => {
    if (key.sessionEpoch !== params.epoch() || params.pending.has(key.sourceIndex)) return null;
    const body = params.bodies.get(key.sourceIndex), result = params.arrived.find((item) => item.sourceIndex === key.sourceIndex)?.result;
    if (!body || !result || result.ungraded) return null;
    if (!params.originals.has(key.sourceIndex)) params.originals.set(key.sourceIndex, body);
    const signature = JSON.stringify([body, result]);
    return structuredClone({ key, body, originalBody: params.originals.get(key.sourceIndex)!, result, gradeRevision: params.revisions.get(key.sourceIndex) ?? 0, signature, rubricFingerprint: params.rubricFingerprint });
  };
  return { capture, adopt(snapshot, result, entry) {
    const actual = capture(snapshot.key);
    if (!actual || actual.signature !== snapshot.signature || actual.gradeRevision !== snapshot.gradeRevision) return false;
    const index = params.arrived.findIndex((item) => item.sourceIndex === snapshot.key.sourceIndex);
    if (index < 0) return false;
    const accepted = { ...result, student: actual.result.student, userId: actual.result.userId } as GradeResult;
    params.bodies.set(snapshot.key.sourceIndex, { ...actual.body, entry: { ...structuredClone(entry), student: actual.body.entry.student, userId: actual.body.entry.userId } });
    params.arrived[index] = { sourceIndex: snapshot.key.sourceIndex, result: accepted };
    params.revisions.set(snapshot.key.sourceIndex, actual.gradeRevision + 1);
    params.publish(); return true;
  } };
}
