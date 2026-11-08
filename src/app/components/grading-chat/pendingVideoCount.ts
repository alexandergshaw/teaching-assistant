import type { GradeRunItemRequestBody } from "../grading/incrementalRunPlan";

/** Counts pending rows whose retained submission contains a video reference. */
export function countPendingVideos(pending: ReadonlySet<number>, bodies: ReadonlyMap<number, GradeRunItemRequestBody>): number {
  let count = 0;
  for (const sourceIndex of pending) {
    const body = bodies.get(sourceIndex);
    if (body && body.entry.submittedFiles.some((file) => file.videoRef !== undefined)) count += 1;
  }
  return count;
}
