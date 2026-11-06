import type { RepoGradeCellEdit } from "./repoGradesCellEdits";
import type { RepoGradeQueueState } from "./repoGradeQueue";

export function gradeStatusForEdit(edit: RepoGradeCellEdit, stage?: RepoGradeQueueState | null) {
  return stage ?? edit.gradeRunStage ?? (edit.grading ? "running" : null)
    ?? edit.gradeAttemptStatus ?? (edit.gradeError ? "failed"
      : edit.retainedResults?.length
        ? edit.retainedResults.at(-1)?.source.submissionTruncated ? "partial" : "succeeded"
        : edit.generatedScore != null ? edit.submissionTruncated ? "partial" : "succeeded"
          : edit.score.trim() ? "draft-score" : "not-started");
}
