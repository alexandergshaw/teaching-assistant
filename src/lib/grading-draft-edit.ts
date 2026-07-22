import type { GradingDraftPayload } from "./grading-drafts";

/**
 * Pure function to replace a rubric area comment in a grading draft payload.
 * Returns a new payload with only the targeted result's area comment replaced.
 * Does not mutate the input. No-op (returns a clone) if target not found.
 */
export function replaceAreaComment(
  payload: GradingDraftPayload,
  runIndex: number,
  resultIndex: number,
  areaName: string,
  newComment: string
): GradingDraftPayload {
  const newRuns = payload.runs.map((entry, runIdx) => ({
    ...entry,
    run: {
      ...entry.run,
      results: entry.run.results.map((result, resIdx) => {
        if (runIdx !== runIndex || resIdx !== resultIndex) {
          return result;
        }
        return {
          ...result,
          rubricAreas: result.rubricAreas.map((area) => {
            if (area.area !== areaName) {
              return area;
            }
            return {
              ...area,
              comment: newComment,
            };
          }),
        };
      }),
    },
  }));

  return { runs: newRuns };
}
