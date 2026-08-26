"use client";

// Repo Grades view - AC4 (docs/repo-grades-view-acceptance-criteria.md, items
// 19-24) and AC5 (items 25-32). Rows are student repos, columns are
// assignment folders (item 19). Every decision this component needs (which
// columns exist, how a repo's cells are classified, sort order, binding
// suggestions, the per-column assignment mapping, postability, the failure
// fan-out) was already made by pure, independently-tested functions in
// repoGradesRows.ts / repoGradesPosting.ts / repoGradesAssignmentMapping.ts -
// this file only renders what they returned and forwards user actions to
// index.tsx's handlers. That split is required, not stylistic: vitest is
// node-env and collects only src/**/*.test.ts (AC6 item 37), so nothing in
// this file is ever exercised by a real test; repoGrades.wiring.test.ts reads
// it as text to confirm the pieces that DO need a behavioral guarantee
// (binding acceptance, grading, and posting never firing outside an explicit
// click) are actually wired the way the pure modules assume.
//
// A column's header carries its own assignment picker (AC5 items 25-26) and
// its own bulk Post/Re-post button (AC5 item 27: ONE postCanvasGradesAction
// call per assignment, batching that column's postable rows). The button's
// label and enabled state come from repoGradePostCandidateRows +
// buildRepoGradePostPlan (repoGradesPosting.ts) - the SAME two functions
// index.tsx's actual post handler calls to build the real payload - so the
// count shown here and the rows that actually get posted can never disagree
// (AC5 item 28). AC5 item 32: once a column has been posted at least once,
// its button relabels to "Re-post" rather than disappearing, so the UI never
// implies posting is safely reversible or idempotent (it is neither).
import RepoBindingControl from "./RepoBindingControl";
import RepoGradeCellControl from "./RepoGradeCellControl";
import type { RepoBindingRosterEntry } from "@/lib/repo-student-bindings";
import type { RepoGradeCellStatus, RepoGradeColumn, RepoGradeRow } from "./repoGradesRows";
import { getRepoGradeCellEdit, type RepoGradeCellEditsByRepo } from "./repoGradesCellEdits";
import { buildRepoGradePostPlan, repoGradePostCandidateRows, scopeRepoGradeRowsToSelection } from "./repoGradesPosting";
// Type-only import - see useRepoGradesData.ts's header comment for why this
// is safe from a "use client" module even though CanvasAssignmentBrief is
// only ever produced at runtime through the "use server" listCourseAssignmentsAction.
import type { CanvasAssignmentBrief } from "@/lib/canvas";
import styles from "./repo-grades.module.css";
import pageStyles from "../../page.module.css";

export interface RepoGradesGridProps {
  columns: RepoGradeColumn[];
  rows: RepoGradeRow[];
  roster: RepoBindingRosterEntry[];
  selected: ReadonlySet<string>;
  onToggleSelected: (repo: string) => void;
  onAcceptBinding: (
    repo: string,
    canvasUserId: string,
    student: string,
    username: string | null
  ) => Promise<{ ok: true } | { error: string }>;
  assignments: CanvasAssignmentBrief[];
  cellEdits: RepoGradeCellEditsByRepo;
  onScoreChange: (repo: string, folder: string, score: string) => void;
  onCommentChange: (repo: string, folder: string, comment: string) => void;
  onGradeCell: (row: RepoGradeRow, column: RepoGradeColumn) => void;
  onAssignmentChange: (folder: string, assignmentId: string | null) => void;
  onPostColumn: (column: RepoGradeColumn) => void;
  /** Post a SINGLE row's grade for one column (AC A4) - the retry path after a
   * partial column post, so re-sending the failures never re-posts the
   * successes alongside them. Mirrors GradingResults.tsx's own handlePostOne:
   * a one-element payload that touches only that row's status. */
  onPostOneCell: (row: RepoGradeRow, column: RepoGradeColumn) => void;
  /** True while THIS column's bulk post call is in flight - governs its
   * button's busy state, independent of any other column's post attempt. */
  columnPosting: Readonly<Record<string, boolean>>;
  /** GRADING sibling of onPostColumn above - grades every row this column
   * covers (bound or not; see the sibling repoGradesBulkGrade.ts's
   * buildBulkGradePlan, which never filters or orders by row.binding) rather
   * than one cell at a time. index.tsx builds the plan and runs it; this file
   * only reports the click. */
  onGradeColumn: (folder: string) => void;
  /** The folder currently running a bulk grade, or null when no bulk run is
   * in flight - mirrors columnPosting's per-column busy flag, but ONLY one
   * column can bulk-grade at a time (unlike posting, which tracks every
   * column independently), so this is a single value rather than a record. */
  bulkRunningFolder: string | null;
  /** Progress for the column named by bulkRunningFolder - null whenever no
   * bulk run is in flight for ANY column. */
  bulkProgress: { done: number; total: number } | null;
}

const CELL_STATUS_TEXT: Record<RepoGradeCellStatus, string> = {
  "missing-folder": "No folder",
  "scan-error": "Unknown - scan failed",
  ungraded: "Not graded yet",
};

function CellStatus({ status }: { status: RepoGradeCellStatus }) {
  const className =
    status === "missing-folder"
      ? styles.cellMissing
      : status === "scan-error"
        ? styles.cellScanError
        : styles.cellUngraded;
  return <span className={className}>{CELL_STATUS_TEXT[status]}</span>;
}

/** One column header's assignment picker + bulk Post/Re-post button. Split
 * out of the `<thead>` map purely for readability - it owns no state of its
 * own and makes no decision repoGradesPosting.ts has not already made. */
function ColumnHeaderControls({
  column,
  rows,
  selected,
  assignments,
  cellEdits,
  columnPosting,
  onAssignmentChange,
  onPostColumn,
  onGradeColumn,
  bulkRunningFolder,
  bulkProgress,
}: {
  column: RepoGradeColumn;
  rows: RepoGradeRow[];
  selected: ReadonlySet<string>;
  assignments: CanvasAssignmentBrief[];
  cellEdits: RepoGradeCellEditsByRepo;
  columnPosting: Readonly<Record<string, boolean>>;
  onAssignmentChange: (folder: string, assignmentId: string | null) => void;
  onPostColumn: (column: RepoGradeColumn) => void;
  onGradeColumn: (folder: string) => void;
  bulkRunningFolder: string | null;
  bulkProgress: { done: number; total: number } | null;
}) {
  // Scoped exactly as index.tsx's post handler scopes it - see this file's
  // header comment on AC5 item 28. Counting every row while a selection
  // governs posting would claim "Post 30 grade(s)" and then post four.
  const scopedRows = scopeRepoGradeRowsToSelection(rows, selected);
  const candidates = repoGradePostCandidateRows(scopedRows, cellEdits, column.folder);
  const plan = buildRepoGradePostPlan(candidates, column.assignmentId);
  const alreadyAttempted = scopedRows.some(
    (row) => getRepoGradeCellEdit(cellEdits, row.repo, column.folder).postStatus !== "idle"
  );
  const busy = !!columnPosting[column.folder];
  // GRADING sibling of the Post button's own busy/label logic above. Only ONE
  // column can bulk-grade at a time (unlike posting, tracked per-folder in
  // columnPosting), so "is a run in flight at all" and "is THIS column the
  // one running" are two separate checks rather than a single per-folder
  // lookup.
  const bulkRunning = bulkRunningFolder !== null;
  const gradingThisColumn = bulkRunningFolder === column.folder;
  const gradeAllLabel =
    gradingThisColumn && bulkProgress ? `Grading ${bulkProgress.done} of ${bulkProgress.total}...` : "Grade all";

  return (
    <div className={styles.columnHeader}>
      <span className={styles.columnHeaderFolder}>{column.folder}</span>
      <select
        aria-label={`Canvas assignment for the ${column.folder} column`}
        value={column.assignmentId ?? ""}
        onChange={(e) => onAssignmentChange(column.folder, e.target.value || null)}
      >
        <option value="">Choose an assignment...</option>
        {assignments.map((assignment) => (
          <option key={assignment.id} value={assignment.id}>
            {assignment.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={pageStyles.linkButton}
        disabled={bulkRunning}
        onClick={() => {
          onGradeColumn(column.folder);
        }}
      >
        {gradeAllLabel}
      </button>
      <button
        type="button"
        className={pageStyles.linkButton}
        disabled={busy || plan.postable.length === 0}
        onClick={() => {
          onPostColumn(column);
        }}
      >
        {busy ? "Posting..." : `${alreadyAttempted ? "Re-post" : "Post"} ${plan.postable.length} grade(s)`}
      </button>
    </div>
  );
}

export default function RepoGradesGrid({
  columns,
  rows,
  roster,
  selected,
  onToggleSelected,
  onAcceptBinding,
  assignments,
  cellEdits,
  onScoreChange,
  onCommentChange,
  onGradeCell,
  onAssignmentChange,
  onPostColumn,
  onPostOneCell,
  columnPosting,
  onGradeColumn,
  bulkRunningFolder,
  bulkProgress,
}: RepoGradesGridProps) {
  if (rows.length === 0) {
    return <p className={pageStyles.emptyState}>No repositories matched this org (and prefix filter, if set).</p>;
  }

  return (
    <div className={styles.gridWrap}>
      <table className={styles.grid} role="table">
        {/* B3/B4 (docs/repo-grades-posting-and-reflow-acceptance-criteria.md)
            - role="rowgroup"/"row"/"columnheader"/"cell" below are explicit
            equivalents of what a real <table>'s implicit HTML-to-ARIA
            mapping already grants at full width (so they change nothing
            there - B6), and become load-bearing only at the narrow-width
            card layout in repo-grades.module.css's own media query, where
            <tr>/<th>/<td> can no longer keep display: table-row/table-cell.
            See that file's reflow comment for the full explanation. */}
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader" className={styles.selectHeader}>
              <span className={pageStyles.fieldHint}>Select</span>
            </th>
            <th scope="col" role="columnheader">
              Repo
            </th>
            <th scope="col" role="columnheader">
              Binding
            </th>
            {columns.map((column) => (
              <th scope="col" role="columnheader" key={column.folder}>
                <ColumnHeaderControls
                  column={column}
                  rows={rows}
                  selected={selected}
                  assignments={assignments}
                  cellEdits={cellEdits}
                  columnPosting={columnPosting}
                  onAssignmentChange={onAssignmentChange}
                  onPostColumn={onPostColumn}
                  onGradeColumn={onGradeColumn}
                  bulkRunningFolder={bulkRunningFolder}
                  bulkProgress={bulkProgress}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => (
            <tr role="row" key={row.repo}>
              <td role="cell">
                <input
                  type="checkbox"
                  aria-label={`Select ${row.repo}`}
                  checked={selected.has(row.repo)}
                  onChange={() => onToggleSelected(row.repo)}
                />
              </td>
              <td role="cell">
                <a href={row.htmlUrl} target="_blank" rel="noopener noreferrer" className={styles.repoLink}>
                  {row.repo}
                </a>
                {row.folderError && <div className={pageStyles.error}>{row.folderError}</div>}
              </td>
              <td role="cell">
                <RepoBindingControl row={row} roster={roster} onAcceptBinding={onAcceptBinding} />
              </td>
              {columns.map((column) => {
                const cell = row.cells[column.folder];
                return (
                  <td role="cell" key={column.folder}>
                    <span className={styles.cellColumnLabel} aria-hidden="true">
                      {column.folder}
                    </span>
                    {cell.status === "ungraded" ? (
                      <RepoGradeCellControl
                        row={row}
                        column={column}
                        edit={getRepoGradeCellEdit(cellEdits, row.repo, column.folder)}
                        onScoreChange={(score) => onScoreChange(row.repo, column.folder, score)}
                        onCommentChange={(comment) => onCommentChange(row.repo, column.folder, comment)}
                        onGrade={() => onGradeCell(row, column)}
                        onPostOne={() => onPostOneCell(row, column)}
                      />
                    ) : (
                      <CellStatus status={cell.status} />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
