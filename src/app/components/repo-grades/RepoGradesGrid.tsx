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
// its own bulk Post/Re-post menu item (AC5 item 27: ONE postCanvasGradesAction
// call per assignment, batching that column's postable rows). The menu item's
// label and enabled state come from repoGradePostCandidateRows +
// buildRepoGradePostPlan (repoGradesPosting.ts) - the SAME two functions
// index.tsx's actual post handler calls to build the real payload - so the
// count shown here and the rows that actually get posted can never disagree
// (AC5 item 28). AC5 item 32: once a column has been posted at least once,
// its action relabels to "Re-post" rather than disappearing, so the UI never
// implies posting is safely reversible or idempotent (it is neither).
//
// The rubric picker (docs/repo-grades-rubric-picker-acceptance-criteria.md,
// item 44) names the rubric in the Grade menu item so it can be read before
// starting the run. The string comes from
// `describeColumnRubric`, a prop threaded straight from index.tsx's
// `useRepoGradesRubricSource` hook call - this file calls that function once
// per column (it is pure and reads only an in-memory cache, never a
// network) and hands the resulting STRING to `ColumnHeaderControls`, which
// never calls it itself. Same "render what a pure function decided, resolve
// nothing here" posture as the rest of this file.
import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Autocomplete, Checkbox, Collapse, Link, ListItemText, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TableSortLabel, TextField, createFilterOptions } from "@mui/material";
import { collectRubricOrder, rubricSlotHeight } from "./rubricAlignment";
import { RepoGradeResultDetails } from "./RepoGradesDashboard";
import RepoGradeActionsMenu from "./RepoGradeActionsMenu";
import { activeTargetRequests, findTargetRequests, latestTargetRequest, RepoTargetGradeActions, TargetRequestChip, multipleTargetRequestMenuItems } from "./RepoTargetGradeActions";
import type { TargetCommand, TargetRequest } from "./useRepoGradeTargetRequests";
import { gradeSelectionKey } from "./repoGradeSelection";
import type { RepoGradeQueueCommand, RepoGradeQueueSnapshot } from "./repoGradeQueue";
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
  assignments: CanvasAssignmentBrief[];
  cellEdits: RepoGradeCellEditsByRepo;
  onScoreChange: (repo: string, folder: string, score: string) => void;
  /** Replaces the old `onCommentChange` (REGRESSION entry 355's "comment is
   * no longer independently editable" rule, applied to this surface) -
   * patches one of the three feedback boxes for one cell. */
  onFeedbackFieldChange: (repo: string, folder: string, field: FeedbackField, value: string) => void;
  onGradeCell: (row: RepoGradeRow, column: RepoGradeColumn) => void;
  onGradeTarget: (repo: string, folder: string) => void;
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
  durableGradeAvailable: boolean;
  durableGradePending: boolean;
  targetRequests: TargetRequest[];
  targetCourseId: string;
  onControlTarget: (id: number, action: TargetCommand) => void;
  selectedGradeCells: ReadonlySet<string>;
  onToggleGradeCells: (targets: { repo: string; folder: string }[]) => void;
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

/** One column header's assignment picker and bulk grade/post actions. */
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
  durableGradeAvailable,
  durableGradePending,
  columnRequests,
  onControlTarget,
  bulkRunningFolder,
  bulkProgress,
  bulkQueue,
  onControlGradeColumn,
  bulkSelectionOnly,
  scanTruncated,
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
  durableGradeAvailable: boolean;
  durableGradePending: boolean;
  columnRequests: TargetRequest[];
  onControlTarget: (id: number, action: TargetCommand) => void;
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
  const [folderOptionsOpen, setFolderOptionsOpen] = useState(false);
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
  const { postLabel } = repoGradesRunPlanLabels({
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
    : gradingThisColumn ? "Folder run in progress" : "Grade assignment";
  const gradeDisabled = canControl ? false : !column.folder || !durableGradeAvailable || durableGradePending || gradingThisColumn;
  const folderName = column.folder || "Repository root";

  // N4 items 11/13: this column's own sort - a click toggles ascending/
  // descending on THIS folder's score via toggleRepoGradeSort's "folder"
  // branch, never a decision made here.
  const folderSortActive = sort.field === "folder" && sort.folder === column.folder;
  const activeRequests = activeTargetRequests(columnRequests);

  return (
    <div className={styles.columnHeader}>
      <div className={styles.actionHeading}>
        <TableSortLabel
          component="button"
          active={folderSortActive}
          direction={folderSortActive ? sort.direction : "asc"}
          className={styles.sortHeaderButton}
          onClick={() => onSortChange(toggleRepoGradeSort(sort, "folder", column.folder))}
          aria-label={`Sort by ${label} score`}
          title={`${label} — sort by saved percentage`}
        >
          <span className={styles.columnTitle}>{label}</span>
        </TableSortLabel>
        <TargetRequestChip request={activeRequests[0] ?? latestTargetRequest(columnRequests)} />
        <RepoGradeActionsMenu label={`Folder actions: ${folderName}`}>
          {(close) => [
            ...(activeRequests.length ? multipleTargetRequestMenuItems(activeRequests, durableGradeAvailable, durableGradePending, !column.folder,
              () => onGradeColumn(column.folder), onControlTarget, close) : [<MenuItem key="grade" disabled={gradeDisabled}
              aria-describedby={gradingThisColumn ? queueStatusId : undefined}
              onClick={() => {
                close();
                if (canControl) onControlGradeColumn(column.folder, command);
                else onGradeColumn(column.folder);
              }}>
              <ListItemText primary={gradeAllLabel} secondary={gradingThisColumn ? null : !column.folder
                ? "Repository root grading is not supported by the saved grading worker."
                : "Uses saved automatic grading settings for this assignment."} />
            </MenuItem>]),
            canControl && (
              <MenuItem key="stop" sx={{ color: "error.main" }} aria-label={`Stop queued grades: ${folderName}`}
                onClick={() => {
                  close();
                  onControlGradeColumn(column.folder, "stop");
                }}>
                Stop queued grades
              </MenuItem>
            ),
            <MenuItem key="post" disabled
              onClick={() => {
                close();
                onPostColumn(column, pointsPossible);
              }}>
              <ListItemText primary={busy ? "Posting…" : postLabel} secondary={codeScoringDisclosure
                ? "Code execution is scored into this total, but will not appear as its own line in Canvas's SpeedGrader rubric."
                : null} />
            </MenuItem>,
            <MenuItem key="options" onClick={() => {
              setFolderOptionsOpen(!folderOptionsOpen);
              close();
            }}>
              {folderOptionsOpen ? "Hide Canvas assignment" : "Choose Canvas assignment"}
            </MenuItem>,
          ]}
        </RepoGradeActionsMenu>
      </div>
      {column.folder && column.folder !== label && (
        <span className={`${dashboardStyles.matrixMeta} ${styles.columnFolder}`} title={column.folder}>{column.folder}</span>
      )}
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
      {busy && <span className={styles.postReason} role="status">Posting to Canvas…</span>}
      <Collapse in={folderOptionsOpen} timeout={0} sx={{ width: "100%" }}>
        <Autocomplete size="small" fullWidth options={assignments}
          value={assignments.find((assignment) => assignment.id === column.assignmentId)
            ?? (column.assignmentId ? { id: column.assignmentId, name: `Assignment ${column.assignmentId} unavailable`, pointsPossible: null } : null)}
          getOptionKey={(assignment) => assignment.id}
          getOptionLabel={(assignment) => assignment.name}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          filterOptions={createFilterOptions({ stringify: (assignment: CanvasAssignmentBrief) => `${assignment.name} ${assignment.id}` })}
          onChange={(_, value) => onAssignmentChange(column.folder, value?.id ?? null)}
          noOptionsText="No matching assignments"
          renderOption={(props, assignment) => {
            const { key, ...optionProps } = props;
            return <li key={key} {...optionProps}>{assignment.name} (ID: {assignment.id})</li>;
          }}
          renderInput={(params) => <TextField {...params} placeholder="Search assignments"
            slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps.htmlInput, "aria-label": `Canvas assignment for the ${column.folder} column` } }} />}
        />
      </Collapse>
    </div>
  );
}

export default function RepoGradesGrid({
  columns,
  rows,
  resultColumns,
  gradebookRows,
  selectedFolder,
  sort,
  onSortChange,
  selected,
  onToggleSelected,
  assignments,
  cellEdits,
  onGradeTarget,
  onAssignmentChange,
  onPostColumn,
  columnPosting,
  onGradeColumn,
  durableGradeAvailable,
  durableGradePending,
  targetRequests,
  targetCourseId,
  onControlTarget,
  selectedGradeCells,
  onToggleGradeCells,
  bulkRunningFolder,
  bulkProgress,
  bulkQueue,
  onControlGradeColumn,
  bulkSelectionOnly,
  scanTruncated,
  emptyStateMessage,
  loading,
  codeScoringDisclosure,
}: RepoGradesGridProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const items = Array.from(table.querySelectorAll<HTMLElement>("[data-rubric-index]"));
    const heads = Array.from(table.querySelectorAll<HTMLElement>("[data-rubric-head]"));
    const itemContent = items.map((item) => item.querySelector<HTMLElement>("[data-rubric-content]"));
    const headContent = heads.map((head) => head.querySelector<HTMLElement>("[data-rubric-head-content]"));
    const measure = () => {
      const headHeight = Math.max(40, ...headContent.map((head) => head?.scrollHeight ?? 0));
      const update = (name: string, value: string) => {
        if (table.style.getPropertyValue(name) !== value) table.style.setProperty(name, value);
      };
      update("--rg-rubric-head", `${headHeight}px`);
      const heights = new Map<string, number>();
      for (const [position, item] of items.entries()) {
        const index = item.dataset.rubricIndex;
        if (index !== undefined) {
          const content = itemContent[position];
          if (!content) continue;
          const box = getComputedStyle(item);
          const verticalChrome = [box.paddingTop, box.paddingBottom, box.borderTopWidth, box.borderBottomWidth]
            .reduce((total, part) => total + (parseFloat(part) || 0), 0);
          heights.set(index, Math.max(heights.get(index) ?? 32, rubricSlotHeight(content.scrollHeight, verticalChrome)));
        }
      }
      for (const [index, height] of heights) update(`--rg-rubric-${index}`, `${height}px`);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; measure(); });
    });
    itemContent.forEach((item) => { if (item) observer.observe(item); });
    headContent.forEach((head) => { if (head) observer.observe(head); });
    return () => { observer.disconnect(); if (frame !== null) cancelAnimationFrame(frame); };
  }, [gradebookRows, gradebookRows.length, resultColumns, resultColumns.length, selectedFolder, loading]);

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

  const rubricOrders = new Map(visibleColumns.map(({ folder }) => {
    const groups = [];
    for (const student of gradebookRows) for (const repo of student.repos) {
      groups.push(repo.cells.get(folder)?.saved?.scored?.rubric ?? []);
    }
    return [folder, collectRubricOrder(groups)] as const;
  }));
  const hasMultipleRepos = gradebookRows.some((student) => student.repos.length > 1);
  const displayedRows = gradebookRows.flatMap((student) => student.repos.length
    ? student.repos.map((repo) => ({ ...student, key: JSON.stringify([student.key, repo.name]), repos: [repo], multipleRepos: student.repos.length > 1 }))
    : [{ ...student, multipleRepos: false }]);

  return (<>
    <Table ref={tableRef} stickyHeader size="small" className={styles.grid} role="table" aria-label="Repository gradebook by student and assignment"
      aria-busy={loading} style={{ "--rg-assignment-count": visibleColumns.length } as CSSProperties}>
      <colgroup>
        <col className={styles.studentTrack} />
        {visibleColumns.length > 0 && <col span={visibleColumns.length} />}
      </colgroup>
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
            const columnTargets = displayedRows.flatMap(({ repos }) => repos.map((repo) => ({ repo: repo.name, folder })));
            const selectedCount = columnTargets.filter(({ repo }) => selectedGradeCells.has(gradeSelectionKey(repo, folder))).length;
            const column = operationsByFolder.get(folder);
            const folderSortActive = sort.field === "folder" && sort.folder === folder;
            return (
              <TableCell component="th" scope="col" role="columnheader" key={folder}
                aria-sort={sortAriaValue(folderSortActive, sort.direction)}>
                <div className={styles.columnSelectionHeading}>
                <Checkbox size="small" className={styles.selectionCheckbox} checked={columnTargets.length > 0 && selectedCount === columnTargets.length}
                  indeterminate={selectedCount > 0 && selectedCount < columnTargets.length} disabled={!folder || columnTargets.length === 0}
                  onChange={() => onToggleGradeCells(columnTargets)}
                  slotProps={{ input: { "aria-label": `Select all repositories in ${label}` } }} />
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
                    durableGradeAvailable={durableGradeAvailable}
                    durableGradePending={durableGradePending}
                    columnRequests={findTargetRequests(targetRequests, targetCourseId, folder, null)}
                    onControlTarget={onControlTarget}
                    bulkRunningFolder={bulkRunningFolder}
                    bulkProgress={bulkProgress}
                    bulkQueue={bulkQueue}
                    onControlGradeColumn={onControlGradeColumn}
                    bulkSelectionOnly={bulkSelectionOnly}
                    scanTruncated={scanTruncated}
                    rubricDescription="Uses saved automatic grading settings for this assignment."
                    codeScoringDisclosure={codeScoringDisclosure}
                    sort={sort}
                    onSortChange={onSortChange}
                  />
                ) : (
                  <div className={styles.actionHeading}><TableSortLabel component="button" active={folderSortActive} direction={folderSortActive ? sort.direction : "asc"}
                    className={styles.sortHeaderButton}
                    aria-label={`Sort by ${label} score`}
                    title={`${label} — sort by saved percentage`}
                    onClick={() => onSortChange(toggleRepoGradeSort(sort, "folder", folder))}>
                    <span className={styles.columnTitle}>{label}</span>
                  </TableSortLabel>
                    <RepoTargetGradeActions label={`Folder actions: ${folder || "Repository root"}`}
                      requests={findTargetRequests(targetRequests, targetCourseId, folder, null)} available={durableGradeAvailable}
                      pending={durableGradePending} root={!folder} onStart={() => onGradeColumn(folder)} onControl={onControlTarget} />
                  </div>
                )}
                </div>
              </TableCell>
            );
          })}
        </TableRow>
      </TableHead>
      <TableBody role="rowgroup">
        {displayedRows.map(({ key, name, repos, multipleRepos }) => (
          <TableRow role="row" key={key}>
            <TableCell component="th" scope="row" role="rowheader" className={styles.studentColumn}>
              {name && <strong>{name}</strong>}
              {!repos.length && <span className={dashboardStyles.matrixMeta}>No linked repository</span>}
              {repos.map((repo) => {
                const rowTargets = visibleColumns.filter(({ folder }) => !!folder).map(({ folder }) => ({ repo: repo.name, folder }));
                const rowCount = rowTargets.filter(({ folder }) => selectedGradeCells.has(gradeSelectionKey(repo.name, folder))).length;
                return <div key={repo.name} className={styles.repoSelectionRow}>
                  <Checkbox size="small" className={styles.selectionCheckbox} checked={rowTargets.length > 0 && rowCount === rowTargets.length}
                    indeterminate={rowCount > 0 && rowCount < rowTargets.length} disabled={!rowTargets.length}
                    onChange={() => onToggleGradeCells(rowTargets)}
                    slotProps={{ input: { "aria-label": `Select ${repo.name} for all visible assignments` } }} />
                  <RepoGradebookIdentity repo={repo.name} row={repo.active} linked={name !== null}
                    selectedFolder={selectedFolder} selected={selected}
                    onToggleSelected={onToggleSelected} />
                </div>;
              })}
            </TableCell>
            {visibleColumns.map(({ folder, label }) => {
              return (
                <TableCell role="cell" key={folder}>
                  <span className={styles.cellColumnLabel} aria-hidden="true">{label}</span>
                  {!repos.length && <span className={dashboardStyles.matrixMeta}>Submission unknown</span>}
                  {repos.map((repo) => {
                    const row = repo.active;
                    const cell = row?.cells[folder];
                    return (
                      <div key={repo.name} className={`${dashboardStyles.matrixResult} ${hasMultipleRepos ? dashboardStyles.matrixResultWithRepoHead : ""}`}>
                        {hasMultipleRepos && <div className={dashboardStyles.matrixRepoHead} title={multipleRepos ? repo.name : undefined}>
                          {multipleRepos && <strong>{repo.name}</strong>}
                        </div>}
                        <div className={dashboardStyles.matrixActions}><RepoTargetGradeActions
                          label={`Grade actions: ${repo.name} / ${folder || "Repository root"}`}
                          requests={findTargetRequests(targetRequests, targetCourseId, folder, repo.name)}
                          hasGradedResult={repo.cells.get(folder)?.saved?.latest.status === "succeeded"}
                          available={durableGradeAvailable} pending={durableGradePending} root={!folder}
                          onStart={() => onGradeTarget(repo.name, folder)} onControl={onControlTarget} /></div>
                        <Checkbox size="small" disabled={!folder} className={`${dashboardStyles.matrixSelection} ${styles.selectionCheckbox}`}
                          checked={selectedGradeCells.has(gradeSelectionKey(repo.name, folder))}
                          onChange={() => onToggleGradeCells([{ repo: repo.name, folder }])}
                          slotProps={{ input: { "aria-label": `Select ${repo.name} for ${label}` } }} />
                        <RepoGradeResultDetails repo={repo} folder={folder}
                          scanStatus={cell?.status} criterionOrder={rubricOrders.get(folder) ?? []} />
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
    </>
  );
}

function RepoGradebookIdentity({ repo, row, linked, selectedFolder, selected, onToggleSelected }: {
  repo: string;
  row: RepoGradeRow | undefined;
  linked: boolean;
} & Pick<RepoGradesGridProps, "selectedFolder" | "selected" | "onToggleSelected">) {
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
        <Checkbox size="small" className={styles.selectionCheckbox} checked={selected.has(row.repo)}
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

    </div>
  );
}
