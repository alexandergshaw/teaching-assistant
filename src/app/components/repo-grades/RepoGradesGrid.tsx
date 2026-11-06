"use client";

// Rows group repositories by confirmed student and columns are assignment
// folders. Every decision this component needs (which
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
import { useId, useRef } from "react";
import { Button, Checkbox, Link, Select, Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel } from "@mui/material";
import { FeedbackDisclosure } from "./RepoDashboardFeedback";
import { RepoGradeResultDetails } from "./RepoGradesDashboard";
import RepoBindingControl from "./RepoBindingControl";
import RepoGradeCellControl from "./RepoGradeCellControl";
import RepoGradeStatusChip from "./RepoGradeStatusChip";
import type { RepoGradeQueueCommand, RepoGradeQueueSnapshot } from "./repoGradeQueue";
import type { RepoBindingRosterEntry } from "@/lib/repo-student-bindings";
import type { RepoGradeColumn, RepoGradeRow, RepoGradeSortState, SortDirection } from "./repoGradesRows";
import { toggleRepoGradeSort } from "./repoGradesRows";
import { getRepoGradeCellEdit, mergeRepoGradeLiveScores, type RepoGradeCellEditsByRepo } from "./repoGradesCellEdits";
import { buildRepoGradePostPlan, repoGradePostCandidateRows, scopeRepoGradeRowsToSelection } from "./repoGradesPosting";
import { buildBulkGradePlan } from "./repoGradesBulkGrade";
import { resolveGradeScope } from "./repoGradesGradeSet";
import { repoGradesRunPlanLabels } from "./repoGradesRunPlan";
import { buildRepoGradeRowLinkHref, buildRepoGradeRowLinkText } from "./repoGradeTreeLink";
import { ALL_FOLDERS } from "./repoGradesFolderSelection";
import type { RepoGradeMatrix, visibleRepoGradebookRows } from "./repoGradesDashboardModel";
import type { FeedbackField } from "../grading-results/gradingResultsHelpers";
// Type-only import - see useRepoGradesData.ts's header comment for why this
// is safe from a "use client" module even though CanvasAssignmentBrief is
// only ever produced at runtime through the "use server" listCourseAssignmentsAction.
import type { CanvasAssignmentBrief } from "@/lib/canvas";
import styles from "./repo-grades.module.css";
import dashboardStyles from "./repo-grades-dashboard.module.css";
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

/** `aria-sort`'s value for one header cell - "ascending"/"descending" only
 * while THIS field (and, for a folder column, this exact folder) is the
 * active sort; `undefined` (never "none") otherwise, so the attribute is
 * simply absent on every other header - matching TasksGrid.tsx's own AC-D
 * item 221 precedent. */
function sortAriaValue(active: boolean, direction: SortDirection): "ascending" | "descending" | undefined {
  if (!active) return undefined;
  return direction === "asc" ? "ascending" : "descending";
}

export interface RepoGradesGridProps {
  columns: RepoGradeColumn[];
  /** The folder-scoped, query-FREE row set. Feeds every plan surface (the
   * column header's Grade/Post counts and disabled state) and the empty-state
   * test. The search query must never reach it (RG-SEARCH-STICKY). */
  rows: RepoGradeRow[];
  /** Display columns and grouped rows, including saved-only evaluations. */
  resultColumns: RepoGradeMatrix["columns"];
  gradebookRows: ReturnType<typeof visibleRepoGradebookRows>;
  roster: RepoBindingRosterEntry[];
  /** A5 - the folder this view is currently scoped to, exactly as
   * index.tsx's resolveSelectedFolder produced it (a raw folder name, or
   * repoGradesFolderSelection.ts's ALL_FOLDERS sentinel), threaded straight
   * from index.tsx's `currentSelectedFolder`. Required, never optional and
   * never inferred from `columns.length`: an ALL_FOLDERS selection whose
   * displayed column set happens to have length 1 must still fall back to
   * the repo root (repoGradeTreeLink.ts's buildRepoGradeRowLinkHref), not a
   * folder-specific link. Drives both the row link's href and whether its
   * accessible name states a branch at all (Ruling A5-9: stating one in the
   * ALL_FOLDERS view would be false, since that href pins no branch). */
  selectedFolder: string;
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
  bulkQueue: RepoGradeQueueSnapshot | null;
  onControlGradeColumn: (folder: string, command: RepoGradeQueueCommand) => void;
  onControlGradeCell: (repo: string, folder: string, command: RepoGradeQueueCommand) => void;
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
  loading: boolean;
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

/** One column header's assignment picker + bulk Post/Re-post button. Split
 * out of the `<thead>` map purely for readability - it owns no state of its
 * own and makes no decision repoGradesPosting.ts has not already made. */
function ColumnHeaderControls({
  column,
  label,
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
  bulkQueue,
  onControlGradeColumn,
  bulkSelectionOnly,
  scanTruncated,
  rubricDescription,
  codeScoringDisclosure,
  sort,
  onSortChange,
}: {
  column: RepoGradeColumn;
  label: string;
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
  bulkQueue: RepoGradeQueueSnapshot | null;
  onControlGradeColumn: (folder: string, command: RepoGradeQueueCommand) => void;
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
  const gradeButtonRef = useRef<HTMLButtonElement>(null);
  const queueStatusId = useId();
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
  const gradeScope = resolveGradeScope(selected, bulkSelectionOnly);
  const gradePlan = buildBulkGradePlan({ rows: liveRows, folder: column.folder, selected, selectionOnly: gradeScope.selectionOnly });
  const gradeTargetCount = gradePlan.targets.length;
  const scopedToSelection = gradeScope.scopedToSelection;
  // Resting label wording lives in the pure repoGradesRunPlan leaf; the
  // transient overlays (grading progress here, "Posting" on the Post button)
  // stay in this component because they are render state.
  const { gradeLabel, postLabel } = repoGradesRunPlanLabels({
    folder: column.folder,
    gradeTargetCount,
    scopedToSelection,
    scanTruncated,
    alreadyAttempted,
    postableCount: plan.postable.length,
  });
  const queue = gradingThisColumn ? bulkQueue : null;
  const canControl = !!queue?.waiting && queue.folderState !== "stopping";
  const command = queue?.folderState === "paused" ? "resume" : "pause";
  const gradeAllLabel = canControl ? (command === "resume" ? "Resume folder queue" : "Pause folder queue")
    : gradingThisColumn ? "Folder run in progress" : gradeLabel;
  const gradeDisabled = bulkRunning ? !canControl : gradeTargetCount === 0;
  const folderName = column.folder || "Repository root";

  // N4 items 11/13: this column's own sort - a click toggles ascending/
  // descending on THIS folder's score via toggleRepoGradeSort's "folder"
  // branch, never a decision made here.
  const folderSortActive = sort.field === "folder" && sort.folder === column.folder;

  return (
    <div className={styles.columnHeader}>
      <TableSortLabel
        component="button"
        active={folderSortActive}
        direction={folderSortActive ? sort.direction : "asc"}
        className={styles.sortHeaderButton}
        sx={{ font: "inherit", fontWeight: 600 }}
        onClick={() => onSortChange(toggleRepoGradeSort(sort, "folder", column.folder))}
        aria-label={`Sort by ${label} score`}
        title="Sort by browser percentage when available, then saved percentage"
      >
        {label}
      </TableSortLabel>
      {column.folder && column.folder !== label && <span className={dashboardStyles.matrixMeta}>{column.folder}</span>}
      <div className={styles.manualGradeControls} role="group" aria-label={`Manual folder grading: ${folderName}`}>
        <span className={styles.manualGradeLabel}>Manual grading</span>
        <div className={styles.gradeActions}>
          <Button
            ref={gradeButtonRef}
            type="button"
            variant="contained"
            size="small"
            aria-label={gradingThisColumn ? `${gradeAllLabel}: ${folderName}` : gradeAllLabel}
            aria-describedby={gradingThisColumn ? queueStatusId : undefined}
            aria-disabled={gradeDisabled}
            sx={{ '&[aria-disabled="true"]': { color: "text.disabled", bgcolor: "action.disabledBackground" } }}
            onClick={() => {
              if (gradeDisabled) return;
              if (canControl) onControlGradeColumn(column.folder, command);
              else onGradeColumn(column.folder);
            }}
          >
            {gradeAllLabel}
          </Button>
          {canControl && (
            <Button type="button" size="small" variant="outlined" color="error" aria-label={`Stop queued grades: ${folderName}`}
              onClick={() => {
                gradeButtonRef.current?.focus();
                onControlGradeColumn(column.folder, "stop");
              }}>
              Stop queued grades
            </Button>
          )}
        </div>
        <span id={queueStatusId} className={styles.postReason} role="status">
          {gradingThisColumn && <>
            {queue?.folderState === "paused" && "Folder queue paused. "}
            {queue?.folderState === "stopping" && "Folder queue stopped. "}
            {bulkProgress && `${bulkProgress.done} of ${bulkProgress.total} finished.`}
            {!!queue?.waiting && ` ${queue.waiting} waiting.`}
            {!!queue?.running && ` ${queue.running} in progress will finish.`}
            {!!queue?.stopped && ` ${queue.stopped} stopped before starting.`}
          </>}
        </span>
      </div>
      <FeedbackDisclosure compact title="Folder options" label={`Folder options: ${column.folder}`}>
        <Select native size="small" fullWidth
          inputProps={{ "aria-label": `Canvas assignment for the ${column.folder} column` }}
          value={column.assignmentId ?? ""}
          onChange={(e) => onAssignmentChange(column.folder, e.target.value || null)}
        >
          <option value="">Choose an assignment…</option>
          {assignments.map((assignment) => (
            <option key={assignment.id} value={assignment.id}>
              {assignment.name}
            </option>
          ))}
        </Select>
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
      </FeedbackDisclosure>
    </div>
  );
}

export default function RepoGradesGrid({
  columns,
  rows,
  resultColumns,
  gradebookRows,
  roster,
  selectedFolder,
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
  bulkQueue,
  onControlGradeColumn,
  onControlGradeCell,
  bulkSelectionOnly,
  scanTruncated,
  emptyStateMessage,
  loading,
  describeColumnRubric,
  codeScoringDisclosure,
}: RepoGradesGridProps) {

  const operationsByFolder = new Map(columns.map((column) => [column.folder, column]));
  const visibleColumns = selectedFolder === ALL_FOLDERS ? resultColumns
    : resultColumns.filter(({ folder }) => folder === selectedFolder);

  if (gradebookRows.length === 0 && visibleColumns.length === 0) {
    return (
      <p className={pageStyles.emptyState}>
        {loading ? "Loading gradebook…" : emptyStateMessage ?? "No repositories or assignment results to display."}
      </p>
    );
  }

  return (
    <Table size="small" className={styles.grid} role="table" aria-label="Repository gradebook by student and assignment" aria-busy={loading}>
      <TableHead role="rowgroup">
        <TableRow role="row">
          <TableCell component="th" scope="col" role="columnheader" className={styles.studentColumn}
            aria-sort={sortAriaValue(sort.field === "repo", sort.direction)}>
            <TableSortLabel component="button" active={sort.field === "repo"} direction={sort.field === "repo" ? sort.direction : "asc"}
              aria-label="Sort by repository"
              onClick={() => onSortChange(toggleRepoGradeSort(sort, "repo"))}>
              Student / repository
            </TableSortLabel>
          </TableCell>
          {visibleColumns.map(({ folder, label }) => {
            const column = operationsByFolder.get(folder);
            const folderSortActive = sort.field === "folder" && sort.folder === folder;
            return (
              <TableCell component="th" scope="col" role="columnheader" key={folder}
                aria-sort={sortAriaValue(folderSortActive, sort.direction)}>
                {column ? (
                  <ColumnHeaderControls
                    column={column}
                    label={label}
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
                    bulkQueue={bulkQueue}
                    onControlGradeColumn={onControlGradeColumn}
                    bulkSelectionOnly={bulkSelectionOnly}
                    scanTruncated={scanTruncated}
                    rubricDescription={describeColumnRubric(column.assignmentId)}
                    codeScoringDisclosure={codeScoringDisclosure}
                    sort={sort}
                    onSortChange={onSortChange}
                  />
                ) : (
                  <TableSortLabel component="button" active={folderSortActive} direction={folderSortActive ? sort.direction : "asc"}
                    aria-label={`Sort by ${label} score`}
                    title="Sort by browser percentage when available, then saved percentage"
                    onClick={() => onSortChange(toggleRepoGradeSort(sort, "folder", folder))}>
                    {label}
                  </TableSortLabel>
                )}
              </TableCell>
            );
          })}
        </TableRow>
      </TableHead>
      <TableBody role="rowgroup">
        {gradebookRows.map(({ key, name, repos }) => (
          <TableRow role="row" key={key}>
            <TableCell component="th" scope="row" role="rowheader" className={styles.studentColumn}>
              {name && <strong>{name}</strong>}
              {!repos.length && <span className={dashboardStyles.matrixMeta}>No linked repository</span>}
              {repos.map((repo) => (
                <RepoGradebookIdentity key={repo.name} repo={repo.name} row={repo.active} linked={name !== null}
                  roster={roster} selectedFolder={selectedFolder} selected={selected}
                  onToggleSelected={onToggleSelected} onAcceptBinding={onAcceptBinding} />
              ))}
            </TableCell>
            {visibleColumns.map(({ folder, label }) => {
              const column = operationsByFolder.get(folder);
              const pointsPossible = column ? pointsPossibleForColumn(column, assignments) : null;
              return (
                <TableCell role="cell" key={folder}>
                  <span className={styles.cellColumnLabel} aria-hidden="true">{label}</span>
                  {!repos.length && <span aria-label="No repository result">—</span>}
                  {repos.map((repo) => {
                    const row = repo.active;
                    const cell = row?.cells[folder];
                    const editableEdit = row && column && cell?.status === "ungraded"
                      ? getRepoGradeCellEdit(cellEdits, row.repo, folder) : undefined;
                    return (
                      <div key={repo.name} className={dashboardStyles.matrixResult}>
                        {repos.length > 1 && <strong>{repo.name}</strong>}
                        {row && column && editableEdit ? (
                          <RepoGradeCellControl
                            row={row}
                            column={column}
                            edit={editableEdit}
                            hasSavedResult={!!repo.cells.get(folder)?.saved}
                            pointsPossible={pointsPossible}
                            onScoreChange={(score) => onScoreChange(row.repo, column.folder, score)}
                            onFeedbackFieldChange={(field, value) => onFeedbackFieldChange(row.repo, column.folder, field, value)}
                            onGrade={() => onGradeCell(row, column)}
                            onControlGrade={(command) => onControlGradeCell(row.repo, column.folder, command)}
                            queueState={bulkRunningFolder === column.folder ? bulkQueue?.cells.get(row.repo) : undefined}
                            folderPaused={bulkRunningFolder === column.folder && bulkQueue?.folderState === "paused"}
                            onPostOne={() => onPostOneCell(row, column, pointsPossible)}
                          />
                        ) : cell && cell.status !== "ungraded" && <RepoGradeStatusChip status={cell.status} />}
                        <RepoGradeResultDetails repo={repo} folder={folder}
                          editableEdit={editableEdit} hasScanStatus={!!cell} />
                      </div>
                    );
                  })}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
        {gradebookRows.length === 0 && (
          <TableRow role="row">
            <TableCell role="cell" colSpan={visibleColumns.length + 1}>
              {loading ? "Loading gradebook…" : emptyStateMessage ?? "No students or repositories match your search."}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function RepoGradebookIdentity({ repo, row, linked, roster, selectedFolder, selected, onToggleSelected, onAcceptBinding }: {
  repo: string;
  row: RepoGradeRow | undefined;
  linked: boolean;
} & Pick<RepoGradesGridProps, "roster" | "selectedFolder" | "selected" | "onToggleSelected" | "onAcceptBinding">) {
  if (!row) return (
    <div className={styles.repoIdentity}>
      {repo}
      {!linked && <span className={dashboardStyles.matrixMeta}>Unlinked repository</span>}
    </div>
  );
  const repoLinkHref = buildRepoGradeRowLinkHref(row.htmlUrl, row.defaultBranch, selectedFolder);
  const isFolderScoped = selectedFolder !== ALL_FOLDERS && selectedFolder !== "";
  const repoLinkAccessibleName = isFolderScoped ? buildRepoGradeRowLinkText(row.repo, row.defaultBranch) : undefined;
  return (
    <div className={styles.repoIdentity}>
      <div className={styles.repoIdentityControls}>
        <Checkbox size="small" checked={selected.has(row.repo)}
          slotProps={{ input: { "aria-label": `Select ${row.repo}` } }}
          onChange={() => onToggleSelected(row.repo)} />
        {repoLinkHref ? (
          <Link href={repoLinkHref} target="_blank" rel="noopener noreferrer" className={styles.repoLink}
            aria-label={repoLinkAccessibleName} title={repoLinkAccessibleName} underline="hover">
            {row.repo}
          </Link>
        ) : row.repo}
      </div>
      {row.folderError && <div className={pageStyles.error}>{row.folderError}</div>}
      {row.binding.state !== "confirmed" && (
        <FeedbackDisclosure compact title="Bind student" label={`Bind student to ${row.repo}`}>
          <RepoBindingControl row={row} roster={roster} onAcceptBinding={onAcceptBinding} />
        </FeedbackDisclosure>
      )}
    </div>
  );
}
