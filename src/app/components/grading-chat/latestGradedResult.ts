import type { GradeResult, GradingRun } from "../../../lib/grade/types";

// GRADER-WORKFLOW-OVERHAUL M1. The newest ARRIVED result is the LAST element of
// run.results by position: a graded row has no sourceIndex to compare, and the
// ascending order is inherited from mergeArrivedResults (incrementalRunPlan.ts).
export function selectLatestResult(run: GradingRun): GradeResult | null {
  return run.results.at(-1) ?? null;
}
