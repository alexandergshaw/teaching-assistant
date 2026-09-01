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
//
// The rubric picker (docs/repo-grades-rubric-picker-acceptance-criteria.md,
// item 44) adds one more line to that header: a `<span>` naming which rubric
// this column will actually be graded against, sitting directly above the
// Grade and Post buttons so that fact is visible before either irreversible
// click, not only in the log afterwards. The string comes from
// `describeColumnRubric`, a prop threaded straight from index.tsx's
// `useRepoGradesRubricSource` hook call - this file calls that function once
// per column (it is pure and reads only an in-memory cache, never a
// network) and hands the resulting STRING to `ColumnHeaderControls`, which
// never calls it itself. Same "render what a pure function decided, resolve
// nothing here" posture as the rest of this file.
import Button from "@mui/material/Button";
import RepoBindingControl from "./RepoBindingControl";
import RepoGradeCellControl from "./RepoGradeCellControl";
import type { RepoBindingRosterEntry } from "@/lib/repo-student-bindings";
import type { RepoGradeCellStatus, RepoGradeColumn, RepoGradeRow, RepoGradeSortField, RepoGradeSortState, SortDirection } from "./repoGradesRows";
import { toggleRepoGradeSort } from "./repoGradesRows";
import { getRepoGradeCellEdit, mergeRepoGradeLiveScores, type RepoGradeCellEditsByRepo } from "./repoGradesCellEdits";
import { deriveRepoGradeStudentName, repoGradeLastNameCellText } from "./repoGradeStudentName";
import { buildRepoGradePostPlan, repoGradePostCandidateRows, scopeRepoGradeRowsToSelection } from "./repoGradesPosting";
import { buildBulkGradePlan } from "./repoGradesBulkGrade";
import type { FeedbackField } from "../grading-results/gradingResultsHelpers";
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

// ---------------------------------------------------------------------------
// N4 (docs/repo-grades-name-columns-and-sorting-acceptance-criteria.md):
// every column gets a header control, not just the two `<select>` fields the
// controls panel offered before. Follows TasksGrid.tsx's own precedent
// (aria-sort on the header cell, a button that toggles the sort, a shape-only
// direction glyph) rather than reinventing the pattern - but the glyph itself
// is redrawn LOCALLY, not imported from TaskCell.tsx: that file also imports
// several @mui/material modules for its own popover editor, and this is the
// app's only wholly non-MUI feature folder (this file's own module import
// list has never carried an @mui import and must not gain one via a
// cross-folder reuse of an otherwise-unrelated export). Same triangle shape,
// same "no colour, shape only" rule TaskCell.tsx's own comment states.

/** Ascending/descending triangle, matching TaskCell.tsx's SortDirectionGlyph
 * exactly (same points, same viewBox) - redrawn here rather than imported,
 * per this file's header comment above. */
function SortDirectionGlyph({ direction }: { direction: SortDirection }) {
  const points = direction === "asc" ? "10,4 16,15 4,15" : "10,16 16,5 4,5";
  return (
    <svg width={10} height={10} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <polygon points={points} fill="currentColor" />
    </svg>
  );
}

/** `aria-sort`'s value for one header cell - "ascending"/"descending" only
 * while THIS field (and, for a folder column, this exact folder) is the
 * active sort; `undefined` (never "none") otherwise, so the attribute is
 * simply absent on every other header - matching TasksGrid.tsx's own AC-D
 * item 221 precedent. */
function sortAriaValue(active: boolean, direction: SortDirection): "ascending" | "descending" | undefined {
  if (!active) return undefined;
  return direction === "asc" ? "ascending" : "descending";
}

/** One plain (non-folder) column's clickable header: a button that toggles
 * the sort via toggleRepoGradeSort (repoGradesRows.ts - the ONE place that
 * decision is made, so this component stays a plain forward of it), showing
 * the direction glyph only while this field is the active sort. */
function SortableColumnHeader({
  field,
  label,
  sort,
  onSortChange,
}: {
  field: Exclude<RepoGradeSortField, "folder">;
  label: string;
  sort: RepoGradeSortState;
  onSortChange: (next: RepoGradeSortState) => void;
}) {
  const active = sort.field === field;
  return (
    <th scope="col" role="columnheader" aria-sort={sortAriaValue(active, sort.direction)}>
      <button
        type="button"
        className={styles.sortHeaderButton}
        onClick={() => onSortChange(toggleRepoGradeSort(sort, field))}
      >
        <span>{label}</span>
        {active && <SortDirectionGlyph direction={sort.direction} />}
      </button>
    </th>
  );
}

export interface RepoGradesGridProps {
  columns: RepoGradeColumn[];
  rows: RepoGradeRow[];
  roster: RepoBindingRosterEntry[];
  /** N4 (docs/repo-grades-name-columns-and-sorting-acceptance-criteria.md) -
   * the sort every header button below reflects and toggles. index.tsx owns
   * the state (uiState.sort) and already resolves a stale folder sort before
   * handing rows to this component; this file never resolves it a second
   * time, it only reads `sort.field`/`sort.folder` to decide which header
   * carries `aria-sort` right now. */
  sort: RepoGradeSortState;
  onSortChange: (next: RepoGradeSortState) => void;
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
  /** Replaces the old `onCommentChange` (REGRESSION entry 355's "comment is
   * no longer independently editable" rule, applied to this surface) -
   * patches one of the three feedback boxes for one cell. */
  onFeedbackFieldChange: (repo: string, folder: string, field: FeedbackField, value: string) => void;
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
  /** AC item 44 (docs/repo-grades-rubric-picker-acceptance-criteria.md) -
   * `useRepoGradesRubricSource.ts`'s own `describeColumn(assignmentId)`,
   * passed straight through from index.tsx. Pure and synchronous per that
   * hook's contract - it reads the per-column resolved-rubric cache and
   * never fetches - so calling it once per column below, on every render,
   * can never trigger a network call. This component calls it per column
   * and hands `ColumnHeaderControls` the resulting STRING (its own
   * `rubricDescription` prop), never the function itself, so that
   * subcomponent stays a pure renderer with nothing left to resolve. */
  describeColumnRubric: (assignmentId: string | null) => string;
  /** Task B (docs for this feature, request 1) - true only while the embedded
   * engine is selected AND the instructor has turned on "Score code
   * execution" (index.tsx computes both checks together, this component
   * only renders the result). Shown next to `rubricDescription` above - the
   * SAME "pre-post disclosure" line this header already carries for which
   * rubric a column grades against - because a "Code runs" criterion will
   * not show up as its own rubric line in Canvas's SpeedGrader
   * (canvas/grades.ts:88-89 skips any rubric area with no matching Canvas
   * criterion) even though it still moves the posted total. */
  codeScoringDisclosure: boolean;
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
  rubricDescription,
  codeScoringDisclosure,
  sort,
  onSortChange,
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
  /** AC item 44 - already-resolved text naming which rubric this column
   * grades against right now, computed by the caller from
   * `describeColumnRubric(column.assignmentId)`. This component only
   * renders it - see this file's `RepoGradesGridProps.describeColumnRubric`
   * doc comment for why the call happens one level up. */
  rubricDescription: string;
  /** See RepoGradesGridProps.codeScoringDisclosure above - forwarded
   * unchanged, one per column so every column's header states it. */
  codeScoringDisclosure: boolean;
  /** N4 items 11-13 - this column's own sort toggle (by its cellEdits score,
   * via toggleRepoGradeSort's "folder" branch). The enclosing `<th>` (in the
   * main render below, not here) carries `aria-sort` for this exact folder. */
  sort: RepoGradeSortState;
  onSortChange: (next: RepoGradeSortState) => void;
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
  // checked rows (repoGradesBulkGrade.ts:80). mergeRepoGradeLiveScores
  // (repoGradesCellEdits.ts) is the ONE shared copy of this merge - docs/
  // repo-grades-name-columns-and-sorting-acceptance-criteria.md N4 item 13
  // found it already duplicated here (a private copy also lived in
  // useRepoGradesGradingActions.ts, named withLiveScores) and required
  // consolidating rather than adding a THIRD copy for sorting - so this LABEL
  // agrees with what handleGradeColumn's own plan will cover, without this
  // file ever calling the dangerous action itself.
  const liveRows: RepoGradeRow[] = mergeRepoGradeLiveScores(rows, cellEdits);
  const gradePlan = buildBulkGradePlan({ rows: liveRows, folder: column.folder, selected, selectionOnly: bulkSelectionOnly });
  const gradeTargetCount = gradePlan.targets.length;
  const scopedToSelection = bulkSelectionOnly && selected.size > 0;
  const restingGradeLabel =
    gradeTargetCount === 0
      ? `Nothing to grade in ${column.folder}`
      : `Grade ${scopedToSelection ? `${gradeTargetCount} selected` : `all ${gradeTargetCount}`} repo${gradeTargetCount === 1 ? "" : "s"} in ${column.folder}${scanTruncated ? " (scan incomplete)" : ""}`;
  const gradeAllLabel =
    gradingThisColumn && bulkProgress ? `Grading ${bulkProgress.done} of ${bulkProgress.total}…` : restingGradeLabel;

  // N4 items 11/13: this column's own sort - a click toggles ascending/
  // descending on THIS folder's score via toggleRepoGradeSort's "folder"
  // branch, never a decision made here.
  const folderSortActive = sort.field === "folder" && sort.folder === column.folder;

  return (
    <div className={styles.columnHeader}>
      <button
        type="button"
        className={styles.sortHeaderButton}
        onClick={() => onSortChange(toggleRepoGradeSort(sort, "folder", column.folder))}
        aria-label={`Sort by ${column.folder} score`}
      >
        <span className={styles.columnHeaderFolder}>{column.folder}</span>
        {folderSortActive && <SortDirectionGlyph direction={sort.direction} />}
      </button>
      <select
        aria-label={`Canvas assignment for the ${column.folder} column`}
        value={column.assignmentId ?? ""}
        onChange={(e) => onAssignmentChange(column.folder, e.target.value || null)}
      >
        <option value="">Choose an assignment…</option>
        {assignments.map((assignment) => (
          <option key={assignment.id} value={assignment.id}>
            {assignment.name}
          </option>
        ))}
      </select>
      {/* AC item 44 - which rubric this column will actually be graded
          against, for EVERY source, sitting directly above the two
          dangerous buttons that consume it so an instructor can see it
          BEFORE clicking Grade or Post rather than only in the log
          afterwards. Reuses `styles.postReason`, already this grid's "small
          muted explanatory line inside a header cell" primitive (see the
          identical class on the not-yet-postable reason in
          RepoGradeCellControl.tsx). */}
      <span className={styles.postReason}>{rubricDescription}</span>
      {/* Task B - same pre-post-disclosure primitive as rubricDescription
          above, one line down: a "Code runs" criterion moves this column's
          posted total but will not show as its own line in SpeedGrader (see
          this component's own doc comment on `codeScoringDisclosure`). */}
      {codeScoringDisclosure && (
        <span className={styles.postReason}>
          Code execution is scored into this total, but will not appear as its own line in Canvas&apos;s SpeedGrader
          rubric.
        </span>
      )}
      {/* Repo Grades UI consistency audit item #2 - these two buttons write to
          a live Canvas gradebook and bill per-item LLM calls, so they carry
          MUI's primary weight (`variant="contained"`) rather than this
          folder's usual tertiary `linkButton`, matching how
          GradingResults.tsx:425 renders the same Post-to-Canvas action.
          Behaviour-preserving: `disabled`/`onClick`/children are unchanged,
          and repoGrades.wiring.test.ts's pinned source-text assertions
          (`disabled={busy || plan.postable.length === 0}`,
          `plan.postable.length`, `alreadyAttempted ? "Re-post" : "Post"`)
          survive verbatim as JSX prop/child text on a MUI Button. */}
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
        variant="contained"
        size="small"
        disabled={busy || plan.postable.length === 0}
        onClick={() => {
          onPostColumn(column, pointsPossible);
        }}
      >
        {busy ? "Posting…" : `${alreadyAttempted ? "Re-post" : "Post"} ${plan.postable.length} grade(s)`}
      </Button>
    </div>
  );
}

export default function RepoGradesGrid({
  columns,
  rows,
  roster,
  sort,
  onSortChange,
  selected,
  onToggleSelected,
  onAcceptBinding,
  assignments,
  cellEdits,
  onScoreChange,
  onFeedbackFieldChange,
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
  describeColumnRubric,
  codeScoringDisclosure,
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
            <SortableColumnHeader field="repo" label="Repo" sort={sort} onSortChange={onSortChange} />
            {/* N2/N3 - derived from `row.binding.student` alone (repoGradeStudentName.ts),
                never a second roster lookup, so these two columns can never
                disagree with the Binding cell rendered beside them. */}
            <SortableColumnHeader field="firstName" label="First name" sort={sort} onSortChange={onSortChange} />
            <SortableColumnHeader field="lastName" label="Last name" sort={sort} onSortChange={onSortChange} />
            <SortableColumnHeader field="binding" label="Binding" sort={sort} onSortChange={onSortChange} />
            {columns.map((column) => {
              const folderSortActive = sort.field === "folder" && sort.folder === column.folder;
              return (
                <th
                  scope="col"
                  role="columnheader"
                  key={column.folder}
                  aria-sort={sortAriaValue(folderSortActive, sort.direction)}
                >
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
                    rubricDescription={describeColumnRubric(column.assignmentId)}
                    codeScoringDisclosure={codeScoringDisclosure}
                    sort={sort}
                    onSortChange={onSortChange}
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((row) => {
            // N2/N3 - the ONE derivation, read from `row.binding.student`/
            // `row.binding.studentSortable` alone (repoGradeStudentName.ts),
            // computed once per row and used by BOTH name cells below. The
            // sort key (repoGradesRows.ts's sortFieldValue) calls the exact
            // same function over the exact same two fields - never a second,
            // independently-derived value - so the table can never sort by
            // something other than what these two cells display (N5 item 16;
            // repoGradesSliceB.guards.test.ts pins this with a canary).
            const nameParts = deriveRepoGradeStudentName(row.binding.student, row.binding.studentSortable);
            return (
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
                <td role="cell">{nameParts.firstName}</td>
                <td role="cell">
                  {repoGradeLastNameCellText(nameParts)}
                  {/* N2 item 4 - a visible marker for a GUESSED split, with
                      the correction instruction in a `title` tooltip rather
                      than permanently expanding every row - "explicit"
                      (comma), "canvas" (Canvas's own split) and "single"
                      (last name honestly unknown) are never marked, only
                      "derived" is. */}
                  {nameParts.source === "derived" && (
                    <span className={styles.nameDerivedMark} title={nameParts.correctionHint ?? undefined}>
                      {" "}
                      (derived)
                    </span>
                  )}
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
                          onFeedbackFieldChange={(field, value) => onFeedbackFieldChange(row.repo, column.folder, field, value)}
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
