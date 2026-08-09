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
import { buildRepoGradePostPlan, repoGradePostCandidateRows } from "./repoGradesPosting";
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
  /** True while THIS column's bulk post call is in flight - governs its
   * button's busy state, independent of any other column's post attempt. */
  columnPosting: Readonly<Record<string, boolean>>;
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
  assignments,
  cellEdits,
  columnPosting,
  onAssignmentChange,
  onPostColumn,
}: {
  column: RepoGradeColumn;
  rows: RepoGradeRow[];
  assignments: CanvasAssignmentBrief[];
  cellEdits: RepoGradeCellEditsByRepo;
  columnPosting: Readonly<Record<string, boolean>>;
  onAssignmentChange: (folder: string, assignmentId: string | null) => void;
  onPostColumn: (column: RepoGradeColumn) => void;
}) {
  const candidates = repoGradePostCandidateRows(rows, cellEdits, column.folder);
  const plan = buildRepoGradePostPlan(candidates, column.assignmentId);
  const alreadyAttempted = rows.some(
    (row) => getRepoGradeCellEdit(cellEdits, row.repo, column.folder).postStatus !== "idle"
  );
  const busy = !!columnPosting[column.folder];

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
  columnPosting,
}: RepoGradesGridProps) {
  if (rows.length === 0) {
    return <p className={pageStyles.emptyState}>No repositories matched this org (and prefix filter, if set).</p>;
  }

  return (
    <div className={styles.gridWrap}>
      <table className={styles.grid} role="table">
        <thead>
          <tr>
            <th scope="col" className={styles.selectHeader}>
              <span className={pageStyles.fieldHint}>Select</span>
            </th>
            <th scope="col">Repo</th>
            <th scope="col">Binding</th>
            {columns.map((column) => (
              <th scope="col" key={column.folder}>
                <ColumnHeaderControls
                  column={column}
                  rows={rows}
                  assignments={assignments}
                  cellEdits={cellEdits}
                  columnPosting={columnPosting}
                  onAssignmentChange={onAssignmentChange}
                  onPostColumn={onPostColumn}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.repo}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Select ${row.repo}`}
                  checked={selected.has(row.repo)}
                  onChange={() => onToggleSelected(row.repo)}
                />
              </td>
              <td>
                <a href={row.htmlUrl} target="_blank" rel="noopener noreferrer" className={styles.repoLink}>
                  {row.repo}
                </a>
                {row.folderError && <div className={pageStyles.error}>{row.folderError}</div>}
              </td>
              <td>
                <RepoBindingControl row={row} roster={roster} onAcceptBinding={onAcceptBinding} />
              </td>
              {columns.map((column) => {
                const cell = row.cells[column.folder];
                return (
                  <td key={column.folder}>
                    {cell.status === "ungraded" ? (
                      <RepoGradeCellControl
                        row={row}
                        column={column}
                        edit={getRepoGradeCellEdit(cellEdits, row.repo, column.folder)}
                        onScoreChange={(score) => onScoreChange(row.repo, column.folder, score)}
                        onCommentChange={(comment) => onCommentChange(row.repo, column.folder, comment)}
                        onGrade={() => onGradeCell(row, column)}
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
