"use client";

// A7 W3 (docs/repo-grader-w3-surface-test-notes.md): the sticky run bar. When
// one folder is selected, Grade and Post live here, next to the pickers that
// decide what they run on, and stay pinned to the top of the viewport while the
// grid scrolls under them - the scroll/cursor-distance cut for Repo Grades. No
// confirm or guard is dropped: both buttons forward to the SAME confirmed
// handlers the column header calls (onGradeColumn / onPostColumn), and this
// file never calls a grading or posting action itself.
//
// The bar shows the folder name and mapped assignment as read-only CONTEXT; the
// real course and folder pickers stay in RepoGradesControls (one id each).
// Plan counts are recomputed here from the SAME pure builders the column header
// uses, and the label wording comes from the shared repoGradesRunPlan leaf, so
// the two surfaces cannot disagree. Imports only browser-safe leaves.
import Button from "@mui/material/Button";
import type { RepoGradeColumn, RepoGradeRow } from "./repoGradesRows";
import { getRepoGradeCellEdit, mergeRepoGradeLiveScores, type RepoGradeCellEditsByRepo } from "./repoGradesCellEdits";
import { buildRepoGradePostPlan, repoGradePostCandidateRows, scopeRepoGradeRowsToSelection } from "./repoGradesPosting";
import { buildBulkGradePlan } from "./repoGradesBulkGrade";
import { resolveGradeScope } from "./repoGradesGradeSet";
import { repoGradesRunPlanLabels } from "./repoGradesRunPlan";
import type { CanvasAssignmentBrief } from "@/lib/canvas";
import styles from "./repo-grades.module.css";

export interface RepoGradesRunBarProps {
  column: RepoGradeColumn;
  rows: RepoGradeRow[];
  selected: ReadonlySet<string>;
  assignments: CanvasAssignmentBrief[];
  cellEdits: RepoGradeCellEditsByRepo;
  columnPosting: Readonly<Record<string, boolean>>;
  bulkRunningFolder: string | null;
  bulkProgress: { done: number; total: number } | null;
  bulkSelectionOnly: boolean;
  scanTruncated: boolean;
  describeColumnRubric: (assignmentId: string | null) => string;
  onGradeColumn: (folder: string) => void;
  onPostColumn: (column: RepoGradeColumn, pointsPossible: number | null) => void;
}

export default function RepoGradesRunBar({
  column,
  rows,
  selected,
  assignments,
  cellEdits,
  columnPosting,
  bulkRunningFolder,
  bulkProgress,
  bulkSelectionOnly,
  scanTruncated,
  describeColumnRubric,
  onGradeColumn,
  onPostColumn,
}: RepoGradesRunBarProps) {
  const mapped = column.assignmentId ? assignments.find((a) => a.id === column.assignmentId) : undefined;
  // Same value the column header derives: null (never 0) for an unmapped column.
  const pointsPossible = mapped ? mapped.pointsPossible : null;
  const scopedRows = scopeRepoGradeRowsToSelection(rows, selected);
  const candidates = repoGradePostCandidateRows(scopedRows, cellEdits, column.folder);
  const plan = buildRepoGradePostPlan(candidates, column.assignmentId, pointsPossible);
  const alreadyAttempted = scopedRows.some(
    (row) => getRepoGradeCellEdit(cellEdits, row.repo, column.folder).postStatus !== "idle"
  );
  const liveRows: RepoGradeRow[] = mergeRepoGradeLiveScores(rows, cellEdits);
  const gradeScope = resolveGradeScope(selected, bulkSelectionOnly);
  const gradePlan = buildBulkGradePlan({ rows: liveRows, folder: column.folder, selected, selectionOnly: gradeScope.selectionOnly });
  const { gradeLabel, postLabel } = repoGradesRunPlanLabels({
    folder: column.folder,
    gradeTargetCount: gradePlan.targets.length,
    scopedToSelection: gradeScope.scopedToSelection,
    scanTruncated,
    alreadyAttempted,
    postableCount: plan.postable.length,
  });
  const busy = !!columnPosting[column.folder];
  const bulkRunning = bulkRunningFolder !== null;
  const gradingThisColumn = bulkRunningFolder === column.folder;
  const gradeAllLabel =
    gradingThisColumn && bulkProgress ? `Grading ${bulkProgress.done} of ${bulkProgress.total}…` : gradeLabel;

  return (
    <div className={styles.runBar} role="group" aria-label={`Run ${column.folder}`}>
      <span className={styles.runBarContext}>
        <span className={styles.runBarFolder}>{column.folder}</span>
        <span className={styles.postReason}>
          {mapped ? `Posts to "${mapped.name}"` : "No Canvas assignment chosen for this folder yet"}
        </span>
        <span className={styles.postReason}>{describeColumnRubric(column.assignmentId)}</span>
      </span>
      <Button
        type="button"
        variant="contained"
        size="small"
        aria-label={gradeAllLabel}
        disabled={bulkRunning}
        onClick={() => {
          onGradeColumn(column.folder);
        }}
      >
        {gradeAllLabel}
      </Button>
      <Button
        type="button"
        variant="outlined"
        size="small"
        disabled={busy || plan.postable.length === 0}
        onClick={() => {
          onPostColumn(column, pointsPossible);
        }}
      >
        {busy ? "Posting…" : postLabel}
      </Button>
    </div>
  );
}
