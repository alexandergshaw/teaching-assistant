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
import type { RepoGradeCell, RepoGradeCellStatus, RepoGradeColumn, RepoGradeRow } from "./repoGradesRows";
import { getRepoGradeCellEdit, type RepoGradeCellEditsByRepo } from "./repoGradesCellEdits";
import { buildRepoGradePostPlan, repoGradePostCandidateRows, scopeRepoGradeRowsToSelection } from "./repoGradesPosting";
import { buildBulkGradePlan } from "./repoGradesBulkGrade";
// Type-only import - see useRepoGradesData.ts's header comment for why this
// is safe from a "use client" module even though CanvasAssignmentBrief is
// only ever produced at runtime through the "use server" listCourseAssignmentsAction.
import type { CanvasAssignmentBrief } from "@/lib/canvas";
import styles from "./repo-grades.module.css";
import pageStyles from "../../page.module.css";

/**
 * U12.52 / the fairness fix's other half: the ONE place a column's
 * assignmentId is turned into that assignment's own pointsPossible - both the
 * column header's live postable count/plan (ColumnHeaderControls below) and
 * each cell's post payload/description (the main component's own render,
 * RepoGradeCellControl's onPostOne) read it from THIS function over the SAME
 * `assignments` prop, so the two can never disagree about which assignment's
 * points a given column scales onto (the same guarantee AC5 item 28 already
 * requires of postability itself, one layer further out). Returns null - not
 * 0, not NaN - for an unmapped column or an assignment whose own
 * pointsPossible is null, which is exactly the "unknown, refuse to guess"
 * signal resolvePostScore (repoGradePostScore.ts) requires.
 */
function pointsPossibleForColumn(column: RepoGradeColumn, assignments: CanvasAssignmentBrief[]): number | null {
  if (!column.assignmentId) return null;
  const assignment = assignments.find((a) => a.id === column.assignmentId);
  return assignment ? assignment.pointsPossible : null;
}

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
  /** U12.52: `pointsPossible` is the SAME value pointsPossibleForColumn just
   * computed for this column's own postable count/plan above it, so the
   * button's count and the actual post scale identically (never re-derived
   * inside the handler). */
  onPostColumn: (column: RepoGradeColumn, pointsPossible: number | null) => void;
  /** Post a SINGLE row's grade for one column (AC A4) - the retry path after a
   * partial column post, so re-sending the failures never re-posts the
   * successes alongside them. Mirrors GradingResults.tsx's own handlePostOne:
   * a one-element payload that touches only that row's status. `pointsPossible`
   * is the same U12.52 value described on onPostColumn above. */
  onPostOneCell: (row: RepoGradeRow, column: RepoGradeColumn, pointsPossible: number | null) => void;
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
  /** U1.2/U1.7b - whether a "Grade all" run only covers the checked rows
   * (index.tsx's uiState.bulkSelectionOnly). Threaded down so the button's
   * own resting label can say "N selected" instead of implying it covers
   * every repo in the column when it does not. */
  bulkSelectionOnly: boolean;
  /** U1.2 - true when the org scan hit its own listing cap, so the grid's
   * row list may be missing repos the run would otherwise have covered.
   * Threaded down so the "Grade" label can flag that rather than silently
   * asserting completeness it cannot back up. */
  scanTruncated: boolean;
  /** U4.18 - overrides the default "no repositories matched" empty state
   * with a more specific reason (e.g. a folder-scoped view where no scanned
   * repo has that folder) when index.tsx has one to give. */
  emptyStateMessage?: string;
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
  bulkSelectionOnly,
  scanTruncated,
}: {
  column: RepoGradeColumn;
  rows: RepoGradeRow[];
  selected: ReadonlySet<string>;
  assignments: CanvasAssignmentBrief[];
  cellEdits: RepoGradeCellEditsByRepo;
  columnPosting: Readonly<Record<string, boolean>>;
  onAssignmentChange: (folder: string, assignmentId: string | null) => void;
  onPostColumn: (column: RepoGradeColumn, pointsPossible: number | null) => void;
  onGradeColumn: (folder: string) => void;
  bulkRunningFolder: string | null;
  bulkProgress: { done: number; total: number } | null;
  bulkSelectionOnly: boolean;
  scanTruncated: boolean;
}) {
  // Scoped exactly as index.tsx's post handler scopes it - see this file's
  // header comment on AC5 item 28. Counting every row while a selection
  // governs posting would claim "Post 30 grade(s)" and then post four.
  const scopedRows = scopeRepoGradeRowsToSelection(rows, selected);
  const candidates = repoGradePostCandidateRows(scopedRows, cellEdits, column.folder);
  // U12.52: the SAME pointsPossible the actual post (onPostColumn below) will
  // use - both read it from pointsPossibleForColumn over this component's own
  // `assignments` prop, so this button's count can never disagree with what
  // the click it labels actually posts.
  const pointsPossible = pointsPossibleForColumn(column, assignments);
  const plan = buildRepoGradePostPlan(candidates, column.assignmentId, pointsPossible);
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
  // U1.2/U9.38 (this file's own header comment on the "grade this column"
  // click) - the resting label must name the folder and a count derived from
  // the ACTUAL plan a click would run, never a bare "all" that quietly lies
  // when scanTruncated is set or bulkSelectionOnly scopes the run to the
  // checked rows (repoGradesBulkGrade.ts:80). `withLiveScores`'s merge is
  // duplicated here (it is a private helper inside
  // useRepoGradesGradingActions.ts, which this component does not import,
  // matching this file's own layering - see the AC5 item 27 header comment
  // on why gradeRepoAction/postCanvasGradesAction never appear in this file)
  // so this LABEL agrees with what handleGradeColumn's own plan will cover,
  // without this file ever calling the dangerous action itself.
  const liveRows: RepoGradeRow[] = rows.map((row) => {
    const cells: Record<string, RepoGradeCell> = {};
    for (const [folder, cell] of Object.entries(row.cells)) {
      cells[folder] = { ...cell, score: getRepoGradeCellEdit(cellEdits, row.repo, folder).score };
    }
    return { ...row, cells };
  });
  const gradePlan = buildBulkGradePlan({ rows: liveRows, folder: column.folder, selected, selectionOnly: bulkSelectionOnly });
  const gradeTargetCount = gradePlan.targets.length;
  const scopedToSelection = bulkSelectionOnly && selected.size > 0;
  const restingGradeLabel =
    gradeTargetCount === 0
      ? `Nothing to grade in ${column.folder}`
      : `Grade ${scopedToSelection ? `${gradeTargetCount} selected` : `all ${gradeTargetCount}`} repo${gradeTargetCount === 1 ? "" : "s"} in ${column.folder}${scanTruncated ? " (scan incomplete)" : ""}`;
  const gradeAllLabel =
    gradingThisColumn && bulkProgress ? `Grading ${bulkProgress.done} of ${bulkProgress.total}...` : restingGradeLabel;

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
        aria-label={gradeAllLabel}
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
          onPostColumn(column, pointsPossible);
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
  bulkSelectionOnly,
  scanTruncated,
  emptyStateMessage,
}: RepoGradesGridProps) {
  if (rows.length === 0) {
    return (
      <p className={pageStyles.emptyState}>
        {emptyStateMessage ?? "No repositories matched this org (and prefix filter, if set)."}
      </p>
    );
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
                  bulkSelectionOnly={bulkSelectionOnly}
                  scanTruncated={scanTruncated}
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
                // U12.52: the SAME pointsPossible ColumnHeaderControls above
                // computes for this column's Post button - both read
                // pointsPossibleForColumn over this component's own
                // `assignments` prop, so a cell's displayed "what will post"
                // text and its own Post/Re-post click can never disagree with
                // the column header's count.
                const pointsPossible = pointsPossibleForColumn(column, assignments);
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
                        pointsPossible={pointsPossible}
                        onScoreChange={(score) => onScoreChange(row.repo, column.folder, score)}
                        onCommentChange={(comment) => onCommentChange(row.repo, column.folder, comment)}
                        onGrade={() => onGradeCell(row, column)}
                        onPostOne={() => onPostOneCell(row, column, pointsPossible)}
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
