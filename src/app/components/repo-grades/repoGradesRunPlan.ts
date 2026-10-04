// Pure label leaf for the Repo Grades column header's Grade and Post buttons
// (repo-grader smoothing W1, backlog row A7). It turns already-computed counts
// and flags into the two RESTING label strings; the caller keeps computing the
// plans (buildBulkGradePlan / buildRepoGradePostPlan stay in RepoGradesGrid.tsx)
// and keeps the transient "Grading X of Y" / "Posting" overlays. This file
// calls no grading or posting action - it only formats text, so a future Run
// bar and the column header can share one source for the wording.

export interface RepoGradesRunPlanInput {
  folder: string;
  /** gradePlan.targets.length, computed by the caller. */
  gradeTargetCount: number;
  /** bulkSelectionOnly && selected.size > 0. */
  scopedToSelection: boolean;
  scanTruncated: boolean;
  alreadyAttempted: boolean;
  /** plan.postable.length, computed by the caller. */
  postableCount: number;
}

export interface RepoGradesRunPlanLabels {
  /** Resting grade label - no "Grading X of Y" overlay. */
  gradeLabel: string;
  /** Resting post label - no "Posting" overlay. */
  postLabel: string;
}

export function repoGradesRunPlanLabels(input: RepoGradesRunPlanInput): RepoGradesRunPlanLabels {
  const { folder, gradeTargetCount, scopedToSelection, scanTruncated, alreadyAttempted, postableCount } = input;
  const gradeLabel =
    gradeTargetCount === 0
      ? `Nothing to grade in ${folder}`
      : `Grade ${scopedToSelection ? `${gradeTargetCount} selected` : `all ${gradeTargetCount}`} repo${gradeTargetCount === 1 ? "" : "s"} in ${folder}${scanTruncated ? " (scan incomplete)" : ""}`;
  const postLabel = `${alreadyAttempted ? "Re-post" : "Post"} ${postableCount} grade(s)`;
  return { gradeLabel, postLabel };
}
