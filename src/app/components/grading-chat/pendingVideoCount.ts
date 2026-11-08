import type { GradeRunItemRequestBody } from "../grading/incrementalRunPlan";
import { listRepositoryStudents } from "./continuousRepositoryAdapter";

export function pendingDisplay(session: string, pending: ReadonlySet<number>, inFlight: ReadonlySet<number>, bodies: ReadonlyMap<number, GradeRunItemRequestBody>) {
  const labelOf = (index: number) => bodies.get(index)?.entry.student;
  const pendingStudents = new Set<string>();
  for (const index of pending) { const label = labelOf(index); if (label !== undefined) pendingStudents.add(label); }
  const inFlightStudents: string[] = [];
  for (const index of inFlight) { const label = labelOf(index); if (label !== undefined) inFlightStudents.push(label); }
  return { repositoryStudents: listRepositoryStudents(session, bodies), pendingStudents, inFlightStudents };
}

/** Counts pending rows whose retained submission contains a video reference. */
export function countPendingVideos(pending: ReadonlySet<number>, bodies: ReadonlyMap<number, GradeRunItemRequestBody>): number {
  let count = 0;
  for (const sourceIndex of pending) {
    const body = bodies.get(sourceIndex);
    if (body && body.entry.submittedFiles.some((file) => file.videoRef !== undefined)) count += 1;
  }
  return count;
}
