"use client";

// Repo Grades view - AC4 items 20-21, AC5 (docs/repo-grades-view-acceptance-
// criteria.md). One grid cell's editable content: an on-demand "Grade"
// action that calls gradeRepoAction (task 2 of the wave brief - the SAME
// call folder-per-module grading already makes, with `folderPath` as the
// `pathPrefix` - never a new grading engine), editable score/comment text
// fields following GradingResults.tsx:781-832's idiom (a controlled input
// bound to local edit state, an aria-label naming exactly what it edits),
// and this cell's own postability reason and post status.
//
// Only ever rendered for a cell whose derived status is "ungraded"
// (RepoGradesGrid.tsx keeps missing-folder/scan-error cells on the existing
// plain CellStatus text - task 3: "A cell whose status is missing-folder or
// scan-error is not gradeable and not postable, and the reason shows" -
// there is nothing to edit or grade for those, so this component is never
// asked to render one, and `folderPresent: true` below is always correct
// for exactly that reason).
//
// Grading is gated behind the "Grade" button's onClick only - never called on
// render or from an effect (REGRESSION entries 98 and 101: per-item LLM
// billing and network cost on render is the failure mode those entries exist
// to prevent). repoGrades.wiring.test.ts's canary-paired callSitesGatedByClick
// guard (already proven against RepoBindingControl.tsx) is extended to this
// file for the same guarantee - see that file's second describe block.
//
// The postability reason shown below the inputs comes from
// repoGradePostability (src/lib/repo-grade-postability.ts) - the SAME
// predicate repoGradesPosting.ts's buildRepoGradePostPlan uses to build the
// actual post payload for the whole column - never a hand-rolled re-check of
// the same conditions, so the reason text shown here and the column post
// button's real postability can never disagree (AC5 item 28).
import { repoGradePostability } from "@/lib/repo-grade-postability";
import type { RepoGradeColumn, RepoGradeRow } from "./repoGradesRows";
import type { RepoGradeCellEdit } from "./repoGradesCellEdits";
import styles from "./repo-grades.module.css";
import pageStyles from "../../page.module.css";

export interface RepoGradeCellControlProps {
  row: RepoGradeRow;
  column: RepoGradeColumn;
  edit: RepoGradeCellEdit;
  onScoreChange: (score: string) => void;
  onCommentChange: (comment: string) => void;
  onGrade: () => void;
}

export default function RepoGradeCellControl({ row, column, edit, onScoreChange, onCommentChange, onGrade }: RepoGradeCellControlProps) {
  // Always folderPresent: true - see the module header for why that is safe
  // for every cell this component is ever asked to render.
  const postability = repoGradePostability({
    bindingState: row.binding.state,
    canvasUserId: row.binding.canvasUserId,
    assignmentId: column.assignmentId,
    folderPresent: true,
    score: edit.score,
  });

  const postStatusClass =
    edit.postStatus === "error" ? styles.postStatusError : edit.postStatus === "posted" ? styles.postStatusPosted : styles.postStatusPosting;

  return (
    <div className={styles.cellControl}>
      <div className={styles.cellInputs}>
        <input
          type="text"
          inputMode="decimal"
          value={edit.score}
          onChange={(e) => onScoreChange(e.target.value)}
          aria-label={`${column.folder} score for ${row.repo}`}
          placeholder="Score"
          className={styles.scoreInput}
        />
        <input
          type="text"
          value={edit.comment}
          onChange={(e) => onCommentChange(e.target.value)}
          aria-label={`${column.folder} comment for ${row.repo}`}
          placeholder="Comment (optional)"
          className={styles.commentInput}
        />
      </div>
      <div className={styles.cellActions}>
        <button
          type="button"
          className={pageStyles.linkButton}
          disabled={edit.grading}
          onClick={() => {
            onGrade();
          }}
        >
          {edit.grading ? "Grading..." : "Grade"}
        </button>
        {!postability.postable && <span className={styles.postReason}>{postability.reason}</span>}
      </div>
      {edit.gradeError && (
        <span className={pageStyles.error} role="alert">
          {edit.gradeError}
        </span>
      )}
      {edit.postStatus !== "idle" && (
        <span className={postStatusClass}>
          {edit.postStatus === "posting"
            ? "Posting..."
            : edit.postStatus === "posted"
              ? "Posted to Canvas"
              : `Failed: ${edit.postMessage ?? ""}`}
        </span>
      )}
    </div>
  );
}
