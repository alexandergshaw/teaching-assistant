"use client";

// Repo Grades view - grading and posting action handlers. Pulled out of
// index.tsx ONLY because that file hit this codebase's 1000-line-per-file cap
// and had nowhere left to grow, not because these handlers needed a home of
// their own - they are the biggest cohesive block of real logic that file
// had left. This hook owns the on-demand per-cell grading call
// (handleGradeCell), the "grade this whole column" bulk run (the
// useRepoGradesBulkGrade wiring plus handleBulkCellUpdate/handleBulkOutcomes/
// handleGradeColumn), and posting to the live Canvas gradebook
// (handlePostColumn, handlePostOneCell), along with the `columnPosting`
// per-column busy state; a bulk-grade plan is built from
// mergeRepoGradeLiveScores (repoGradesCellEdits.ts - see that function's own
// header comment for why this used to be a private copy here, named
// withLiveScores, until docs/repo-grades-name-columns-and-sorting-
// acceptance-criteria.md N4 item 13 required consolidating it). Everything
// this hook reads that index.tsx itself owns (rows,
// cellEdits and its setter, the current selection, the relevant uiState
// fields, the activity-log recorder, setPostSummary, the LLM provider, and
// the current course) comes in as an explicit params object - this hook owns
// no state index.tsx did not already own before the move, except
// `columnPosting`, which belongs entirely to the posting handlers here.
//
// vitest in this codebase is node-env and collects only src/**/*.test.ts, so
// this hook is never rendered by any test - the "dangerous call is only ever
// reachable from a real onClick, never an effect" and "a log entry is never
// recorded for a write that did not persist" guarantees are instead proven by
// repoGrades.wiring.test.ts's source-reading guards against this file, the
// same idiom that file already used against index.tsx before this move.
//
// This is a MOVE, not a rewrite: every handler below is unchanged from
// index.tsx except for reading its inputs off `params` instead of off local
// state/props. No behavior, no user-visible string, and no disabled
// condition changed as part of this extraction (the later withLiveScores ->
// mergeRepoGradeLiveScores consolidation is a pure rename/relocation, not a
// behavior change either - see that function's own header comment).
import { useState } from "react";
import { gradeRepoAction, postCanvasGradesAction } from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";
import type { LlmProvider } from "@/lib/llm";
import {
  applyRepoGradeFeedbackFieldEdit,
  getRepoGradeCellEdit,
  mergeRepoGradeLiveScores,
  setRepoGradeCellEdit,
  type RepoGradeCellEdit,
  type RepoGradeCellEditsByRepo,
} from "./repoGradesCellEdits";
import type { FeedbackField } from "../grading-results/gradingResultsHelpers";
import type { RepoGradeLogEntry, RepoGradeLogEventKind } from "./repoGradesLog";
import type { RepoGradeColumn, RepoGradeRow } from "./repoGradesRows";
import {
  buildRepoGradePostPlan,
  fanOutRepoGradePostResult,
  repoGradeAssignmentUrl,
  repoGradePostCandidateRows,
  scopeRepoGradeRowsToSelection,
} from "./repoGradesPosting";
import { buildBulkGradePlan, type BulkGradeOutcome } from "./repoGradesBulkGrade";
import { useRepoGradesBulkGrade } from "./useRepoGradesBulkGrade";
// Type-only: ResolvedRubric is useRepoGradesRubricSource.ts's own return
// shape (docs/repo-grades-rubric-picker-acceptance-criteria.md). This file
// never resolves a rubric itself - both grading paths below call the ONE
// shared `resolveRubricForColumn` the caller (index.tsx) passes in, which is
// the sole guarantee (item 16) that a per-cell grade and a bulk column grade
// can never disagree about which rubric a column uses.
import type { ResolvedRubric } from "./useRepoGradesRubricSource";

/** AC item 64/76: both grading paths' log `detail` used to gate a
 * `Rubric used: <text>` line on the page-level rubric field being blank
 * (baseline docs/REGRESSION.md entry 352). That field no longer exists here
 * - `ResolvedRubric` replaces it - so the gate becomes source-aware instead
 * of blank-aware: `generate` (the field was left blank, exactly today's
 * behaviour) still logs the full generated text, because that text is the
 * only place it is ever visible. Every OTHER source (`assignment`, `live`,
 * `export`, `manual`) is already visible elsewhere (the textarea, or the
 * column header's rubric description) - repeating its full text on every
 * graded cell would bloat the log for no new information, so this logs only
 * WHICH source and WHICH rubric were used, matching the "only show if it
 * adds something" rule this file already applies to `feedbackNote` below.
 * `failureReason` is appended whenever the resolver set one (AC item 13: a
 * lookup failure never blocks grading, but it must never be silent either). */
function describeResolvedRubricForLog(resolved: ResolvedRubric, generatedRubricText: string): string {
  if (resolved.source === "generate") return `Rubric used: ${generatedRubricText}`;
  const identity = resolved.identity ? ` "${resolved.identity}"` : "";
  const failure = resolved.failureReason ? ` - ${resolved.failureReason}` : "";
  return `Rubric source: ${resolved.source}${identity}${failure}`;
}

export interface UseRepoGradesGradingActionsParams {
  /** The rows currently shown, in display order (index.tsx's sortedRows). */
  rows: readonly RepoGradeRow[];
  cellEdits: RepoGradeCellEditsByRepo;
  setCellEdits: (updater: (prev: RepoGradeCellEditsByRepo) => RepoGradeCellEditsByRepo) => void;
  /** The checked repo ids (index.tsx's `selected`). */
  selected: ReadonlySet<string>;
  instructions: string;
  /** The shared resolver both grading paths use (item 16) -
   * useRepoGradesRubricSource.ts's `resolveRubricForColumn`, passed straight
   * through from index.tsx's hook call. Replaces the old page-level
   * `rubric: string` param entirely; neither this hook nor its bulk-grade
   * sibling reads a page-level rubric string anymore. */
  resolveRubricForColumn: (assignmentId: string | null) => Promise<ResolvedRubric>;
  /** AC item 50 - the FULL, mapping-applied column list (index.tsx's
   * `columnsWithMapping`, never the folder-scoped `displayedColumns`), so
   * handleGradeColumn can look up ANY folder's `assignmentId` by name even
   * when the grid is currently scoped to a different folder. Without this
   * the bulk path could not reach a column's assignment mapping at all - see
   * handleGradeColumn's own comment below for why that is exactly the
   * reachability failure this project has shipped before. */
  columns: readonly RepoGradeColumn[];
  useReadmeInstructions: boolean;
  bulkSelectionOnly: boolean;
  /** index.tsx's uiState.courseId. Used only to reset `columnPosting` back
   * to {} on a course switch, via the SAME render-phase compare-and-adjust
   * idiom index.tsx's own cellStateResetForCourse branch uses for cellEdits/
   * postSummary/log - the two must stay in the same commit so a course
   * switch can never leave one course's posting-busy flags visible against a
   * different course's rows. */
  courseId: string;
  /** The selected course, for its name and Canvas URL. Posting is a no-op
   * (both handlers return immediately) while this is null. */
  course: Course | null;
  provider: LlmProvider;
  /** index.tsx's activity-log recorder pair - unchanged from before the
   * move, including the rule that a log entry is only ever recorded inside
   * the non-error branch of the call it describes. */
  recordLog: (entries: readonly RepoGradeLogEntry[]) => void;
  buildLogEntry: (
    kind: RepoGradeLogEventKind,
    fields?: Partial<Omit<RepoGradeLogEntry, "kind" | "at" | "courseId" | "courseName">>
  ) => RepoGradeLogEntry;
  /** index.tsx's single role="status" aria-live region. Never add a second. */
  setPostSummary: (message: string) => void;
}

export interface UseRepoGradesGradingActionsResult {
  handleScoreChange: (repo: string, folder: string, score: string) => void;
  /** Replaces the old `handleCommentChange` (REGRESSION entry 355's "comment
   * is no longer independently editable" rule, applied to this surface) -
   * routes every box edit through applyRepoGradeFeedbackFieldEdit, the ONE
   * place `edit.comment` is recomputed from the three parts. */
  handleFeedbackFieldChange: (repo: string, folder: string, field: FeedbackField, value: string) => void;
  handleGradeCell: (row: RepoGradeRow, column: RepoGradeColumn) => Promise<void>;
  /** U12.52: `pointsPossible` is the mapped Canvas assignment's own points
   * value (RepoGradesGrid.tsx's pointsPossibleForColumn) - the SAME value
   * that column's header count was computed from, so this call can never
   * scale a fraction score differently than the button that triggered it
   * claimed it would. */
  handlePostColumn: (column: RepoGradeColumn, pointsPossible: number | null) => Promise<void>;
  handlePostOneCell: (row: RepoGradeRow, column: RepoGradeColumn, pointsPossible: number | null) => Promise<void>;
  /** Per-column posting busy state - index.tsx's old `columnPosting`, now
   * owned here since only the posting handlers below ever write to it. */
  columnPosting: Readonly<Record<string, boolean>>;
  handleGradeColumn: (folder: string) => void;
  bulkRunningFolder: string | null;
  bulkProgress: { done: number; total: number } | null;
}

export function useRepoGradesGradingActions(
  params: UseRepoGradesGradingActionsParams
): UseRepoGradesGradingActionsResult {
  const {
    rows,
    cellEdits,
    setCellEdits,
    selected,
    instructions,
    resolveRubricForColumn,
    columns,
    useReadmeInstructions,
    bulkSelectionOnly,
    courseId,
    course,
    provider,
    recordLog,
    buildLogEntry,
    setPostSummary,
  } = params;

  const [columnPosting, setColumnPosting] = useState<Record<string, boolean>>({});
  // Same render-phase compare-and-adjust idiom index.tsx's own
  // cellStateResetForCourse branch uses - never a useEffect (this file must
  // define none). Runs during the same render as that branch, so both
  // commits land together and a course switch cannot leave one course's
  // posting-busy flags visible against another course's rows.
  const [columnPostingResetForCourse, setColumnPostingResetForCourse] = useState<string | null>(null);
  if (courseId !== columnPostingResetForCourse) {
    setColumnPostingResetForCourse(courseId);
    setColumnPosting({});
  }

  const handleScoreChange = (repo: string, folder: string, score: string) => {
    // docs/rubric-criteria-breakdown-acceptance-criteria.md B5: a cell must
    // not keep reading "Posted to Canvas" once the score that was posted has
    // since changed by hand - that status would misrepresent what is
    // actually live in the gradebook. Reset to "idle" (this cell's own
    // untouched state - defaultRepoGradeCellEdit) on every score edit, not
    // on a feedback-box edit (handleFeedbackFieldChange below), which never
    // changes what number posts.
    setCellEdits((prev) => setRepoGradeCellEdit(prev, repo, folder, { score, postStatus: "idle", postMessage: null }));
  };

  // docs/grading-results-feedback-boxes-acceptance-criteria.md, brought to
  // this surface after it shipped on GradingResults.tsx first (REGRESSION
  // entry 355): the ONE place a box edit reaches `edit.comment` - reads the
  // cell's CURRENT edit (so a patch always starts from the latest strengths/
  // improvements/resubmitNotice, not a stale closure), applies the one
  // field's new value via applyRepoGradeFeedbackFieldEdit (which recomputes
  // `comment` in the SAME step), then writes the whole result back. Replaces
  // handleCommentChange, which used to write `comment` directly - keeping
  // both would give `comment` two writers, exactly the drift this feature
  // exists to prevent (see repoGradesCellEdits.ts's own doc comment on the
  // field).
  const handleFeedbackFieldChange = (repo: string, folder: string, field: FeedbackField, value: string) => {
    setCellEdits((prev) => {
      const current = getRepoGradeCellEdit(prev, repo, folder);
      const next = applyRepoGradeFeedbackFieldEdit(current, field, value);
      return setRepoGradeCellEdit(prev, repo, folder, next);
    });
  };

  // AC4 item 21: reuses gradeRepoAction with `folderPath` as the `pathPrefix` -
  // the same call folder-per-module grading already makes - never a new
  // grading engine. Gated behind RepoGradeCellControl's "Grade" button click
  // only (see that file's header and repoGrades.wiring.test.ts's canary-
  // paired guard) - never on render, matching REGRESSION entries 98 and 101.
  //
  // AC "posting and reflow" A3: also records `rubricAreas` and
  // `generatedScore` on the cell edit - the ONLY place either is ever set
  // (never by handleScoreChange/handleFeedbackFieldChange above) - so
  // repoGradesPosting.ts's repoGradeScoreWasEdited can later tell "the
  // instructor left the AI's score alone" from "the instructor hand-edited
  // it" by comparing the CURRENT score field against `generatedScore`, the
  // score exactly as THIS call produced it.
  const handleGradeCell = async (row: RepoGradeRow, column: RepoGradeColumn) => {
    const cell = row.cells[column.folder];
    // Defensive guard mirroring RepoGradeCellControl's own render condition
    // (it is only ever mounted for an "ungraded" cell) - a stale closure
    // from a re-scan mid-edit should never grade a folder that turned out
    // not to exist.
    if (cell.status !== "ungraded") return;
    setCellEdits((prev) => setRepoGradeCellEdit(prev, row.repo, column.folder, { grading: true, gradeError: null }));
    // AC item 16: the ONE shared resolver - never re-derive a rubric string
    // from uiState here. `resolveRubricForColumn` never throws (its own
    // contract) and always resolves, so this call never needs a try/catch of
    // its own.
    const resolved = await resolveRubricForColumn(column.assignmentId);
    // AC item 57/71 (docs/repo-grades-rubric-picker-acceptance-criteria.md) -
    // a PRE-EXISTING defect, fixed here because this call is already being
    // rewritten to thread the resolved rubric through, not a claim of the
    // picker feature itself: this call used to pass only SIX of
    // gradeRepoAction's seven positional arguments (docs/REGRESSION.md entry
    // 352), omitting `useReadmeInstructions` entirely, so the README
    // checkbox was honoured by "Grade all" (useRepoGradesBulkGrade.ts's own
    // call already passed it) and silently ignored by this per-cell "Grade"
    // button. All seven are passed below - gradeRepoAction's own signature
    // is untouched (src/app/actions/github-repos.ts:617-624 already declares
    // seven parameters), so this needed no eighth positional argument.
    const result = await gradeRepoAction(
      row.repo,
      instructions,
      resolved.text,
      provider,
      undefined,
      column.folder,
      useReadmeInstructions
    );
    if ("error" in result) {
      setCellEdits((prev) => setRepoGradeCellEdit(prev, row.repo, column.folder, { grading: false, gradeError: result.error }));
      // L1 item 2. A grading failure otherwise leaves only a per-cell error
      // string that the next attempt overwrites.
      recordLog([buildLogEntry("grade-failed", { repo: row.repo, folder: column.folder, detail: result.error })]);
      return;
    }
    const first = result.run.results[0];
    setCellEdits((prev) =>
      setRepoGradeCellEdit(prev, row.repo, column.folder, {
        grading: false,
        gradeError: null,
        score: first?.totalScore ?? "",
        // `comment` is set directly here, not through
        // applyRepoGradeFeedbackFieldEdit: `first.overallComment` is ALREADY
        // composeOverallComment(strengths, improvements, resubmitNotice)'s
        // output (src/lib/grade/types.ts's own guarantee on the field), so
        // recomposing it from the three parts below would recompute the
        // exact same string a second time. A grading call is the one
        // producer that is allowed to set `comment` directly, because it is
        // also the one place that sets strengths/improvements/resubmitNotice
        // - the two can never disagree here by construction. Every OTHER
        // writer (a box edit) goes through applyRepoGradeFeedbackFieldEdit
        // instead - see handleFeedbackFieldChange above.
        comment: first?.overallComment ?? "",
        strengths: first?.strengths ?? "",
        improvements: first?.improvements ?? "",
        resubmitNotice: first?.resubmitNotice ?? "",
        rubricAreas: first?.rubricAreas ?? [],
        generatedScore: first?.totalScore ?? null,
        // docs/grading-results-file-viewer-acceptance-criteria.md, brought to
        // this surface after it shipped on GradingResults.tsx first
        // (REGRESSION entries 356/357/359): the files this call ACTUALLY
        // read, with their contents - never re-fetched live from GitHub for
        // display. Set at the SAME time as rubricAreas/generatedScore, by
        // the SAME grading call, never by hand.
        submittedFiles: first?.submittedFiles ?? [],
        submissionTruncated: first?.submissionTruncated ?? false,
        // Live defect fix (this feature): gradeRepoAction's LLM branch has
        // been running the repo's code in the sandbox since fa057050 wired up
        // real `submittedFiles` for it (engine.ts's gradeStudentEntries
        // already sets `codeExecution` on every GradeResult), but this was
        // the only place that result ever reached - and it was dropped here,
        // every field EXCEPT this one copied onto the cell. An
        // execution-influenced grade must be visible to the instructor who
        // has to defend it; RepoGradeCellControl.tsx is what actually shows
        // it. `null`, not `undefined`, so this always overwrites a PREVIOUS
        // grading call's code run rather than leaving a stale one on screen
        // when the newest run had no runnable code at all.
        codeExecution: first?.codeExecution ?? null,
      })
    );
    // L1 item 1: the score AS GENERATED, with the provider that produced it -
    // so a later "why is this score what it is" question can tell an AI
    // result from a hand-typed one even after the instructor has edited the
    // cell (the same distinction repoGradeScoreWasEdited makes at post time).
    // docs/folder-scoped-grading-completeness-acceptance-criteria.md C2: the
    // grading path used to COMPUTE whether the submission was cut and then
    // throw both flags away, so an instructor could not tell "the model read
    // my whole folder" from "it read the first fraction of it". Both are now
    // returned, and this is where they become visible - in the log that is
    // already this view's durable, downloadable record (entry 333), so the
    // fact survives the note and travels in the CSV.
    //
    // `digestTruncated` means the INGEST hit a cap collecting the folder;
    // `submissionTruncated` means the assembled text was cut again before the
    // model saw it. They are different cuts at different layers, so they are
    // named separately rather than merged into one "truncated" - a reader
    // chasing missing code needs to know WHICH budget to raise.
    const cuts: string[] = [];
    if (result.digestTruncated) cuts.push("some folder files were left out of the digest");
    if (first?.submissionTruncated) cuts.push("the submission text was truncated before grading");
    // U12.50: `result.rubric` and `first.feedback` (src/lib/grade/types.ts:30)
    // used to be requested off this call and then never read again - neither
    // is discarded now. There is no per-cell UI slot for either yet (that
    // would mean extending RepoGradeCellEdit, out of this wave's file set),
    // so both are captured into THIS call's own log entry instead -
    // RepoGradeLogEntry.detail is already free text (L2 item 10's own
    // comment), so this needs no schema change, and the log is already this
    // view's durable, downloadable record. The rubric is only worth logging
    // when it was GENERATED (the instructor left the rubric field blank) -
    // an instructor-typed rubric is already visible in the textarea, and
    // repeating a possibly-long rubric on every one of a run's graded cells
    // would bloat the log for no new information. `feedback` is only logged
    // when it differs from `overallComment` (the same "only show if it adds
    // something" rule DraftedGradesTab.tsx:663 already applies to the two).
    const rubricNote = describeResolvedRubricForLog(resolved, result.rubric);
    const feedbackNote = first?.feedback && first.feedback !== first?.overallComment ? `Feedback: ${first.feedback}` : "";
    const detail = [
      cuts.length > 0 ? `Graded by ${provider} - ${cuts.join("; ")}` : `Graded by ${provider}`,
      rubricNote,
      feedbackNote,
    ]
      .filter((part) => part !== "")
      .join(" | ");
    if (cuts.length > 0) {
      setPostSummary(`${row.repo} / ${column.folder}: graded, but ${cuts.join("; ")}.`);
    }

    recordLog([
      buildLogEntry("grade-succeeded", {
        repo: row.repo,
        folder: column.folder,
        score: first?.totalScore ?? "",
        detail,
      }),
    ]);
  };

  // AC5 items 27-32: the dangerous half. ONE postCanvasGradesAction call for
  // this column's postable rows (built by repoGradePostCandidateRows +
  // buildRepoGradePostPlan - the SAME two functions RepoGradesGrid.tsx's
  // column header calls to compute the button's own count/enabled state, so
  // the two can never disagree - AC5 item 28), gated behind an explicit
  // confirm naming the count (AC5 item 29, the exact existing wording from
  // GradingResults.tsx:293), with the userId -> row map built BEFORE posting
  // so every attempted row flips to "posting" first, then
  // fanOutRepoGradePostResult maps the real result back per row after the
  // call resolves (AC5 item 30, copying GradingResults.tsx:300-352's shape).
  //
  // AC "posting and reflow" A1: `selected` now governs which rows this call
  // even CONSIDERS - scopeRepoGradeRowsToSelection (repoGradesPosting.ts)
  // narrows `rows` to the checked repos before candidate assembly when a
  // selection exists, and is a no-op (whole column) when it does not. This
  // is the fix for the real defect the "posting and reflow" AC's A1 names:
  // before this, `selected` gated nothing on the post path at all, so
  // ticking four students and clicking Post silently graded-and-posted every
  // postable row in the column instead.
  //
  // NOTE (flagged plainly, not papered over): RepoGradesGrid.tsx's column
  // header button (ColumnHeaderControls) computes ITS OWN postable count
  // from the UNSCOPED `rows` it was given - it has no `selected` prop wired
  // to it, so that header count/enabled-state can now legitimately disagree
  // with what actually gets posted whenever a selection is active (it will
  // show the whole column's count even though only the selection posts). The
  // confirm dialog below and the "nothing postable in the current scope"
  // summary message always describe the REAL, selection-scoped plan, so the
  // actual write is never mis-stated - only the header's separate, always-
  // visible count can be stale relative to it. Closing that requires
  // threading `selected` into RepoGradesGrid.tsx's ColumnHeaderControls.
  const handlePostColumn = async (column: RepoGradeColumn, pointsPossible: number | null) => {
    if (!course) return;
    const scopedRows = scopeRepoGradeRowsToSelection(rows, selected);
    const candidates = repoGradePostCandidateRows(scopedRows, cellEdits, column.folder);
    const plan = buildRepoGradePostPlan(candidates, column.assignmentId, pointsPossible);
    const usingSelection = selected.size > 0;
    // Now reachable post-A1 (e.g. every selected row is unbound) - say so.
    if (plan.postable.length === 0) {
      const summary = usingSelection
        ? `${column.folder}: none of the ${selected.size} selected row(s) are postable in this column.`
        : `${column.folder}: nothing is postable in this column yet.`;
      setPostSummary(summary);
      // L1 item 5: every skipped row with its OWN reason from the plan, not
      // just the one-line summary - "why was this student not posted" is the
      // question the log exists to answer, and the reasons differ per row
      // (unbound, no folder, no score, no assignment mapped).
      recordLog([
        buildLogEntry("post-skipped", { folder: column.folder, assignmentId: column.assignmentId ?? "", detail: summary }),
        ...plan.skipped.map((skip) =>
          buildLogEntry("post-skipped", {
            repo: skip.repo,
            folder: column.folder,
            assignmentId: column.assignmentId ?? "",
            detail: skip.reason,
          })
        ),
      ]);
      return;
    }

    // A2: base sentence byte-identical to GradingResults.tsx:293-295.
    const scopeSentence = usingSelection
      ? ` This posts only your ${plan.postable.length} selected row(s), not the whole column.`
      : ` No rows are selected, so this posts the whole column (all ${plan.postable.length} postable row(s)).`;
    if (!window.confirm(`Post ${plan.postable.length} grade(s) to Canvas? This writes to the live gradebook.${scopeSentence}`)) {
      // L1 item 6: "nothing happened and I do not remember why" is exactly
      // the question a log exists to answer.
      recordLog([
        buildLogEntry("post-cancelled", {
          folder: column.folder,
          assignmentId: column.assignmentId ?? "",
          detail: `Declined the confirm for ${plan.postable.length} grade(s)`,
        }),
      ]);
      return;
    }

    const assignmentUrl = column.assignmentId ? repoGradeAssignmentUrl(course.canvasUrl ?? "", column.assignmentId) : null;
    if (!assignmentUrl) {
      const summary = `${column.folder}: could not build a Canvas assignment URL for "${course.name}" - check the course's Canvas URL.`;
      setPostSummary(summary);
      recordLog([
        buildLogEntry("post-skipped", { folder: column.folder, assignmentId: column.assignmentId ?? "", detail: summary }),
      ]);
      return;
    }

    setColumnPosting((prev) => ({ ...prev, [column.folder]: true }));
    setCellEdits((prev) => {
      let next = prev;
      for (const item of plan.postable) {
        next = setRepoGradeCellEdit(next, item.repo, column.folder, { postStatus: "posting", postMessage: null });
      }
      return next;
    });

    const result = await postCanvasGradesAction(assignmentUrl, plan.postable.map((p) => p.grade));

    const fanout = fanOutRepoGradePostResult(
      plan.postable.map((p) => ({ repo: p.repo, userId: p.userId })),
      result
    );
    setCellEdits((prev) => {
      let next = prev;
      for (const outcome of fanout) {
        next = setRepoGradeCellEdit(next, outcome.repo, column.folder, {
          postStatus: outcome.postStatus,
          postMessage: outcome.postMessage,
        });
      }
      return next;
    });
    setColumnPosting((prev) => ({ ...prev, [column.folder]: false }));

    // L1 items 3-5: one entry per ATTEMPTED row carrying the exact score that
    // went out (read off the plan, never re-read from the edit state, which
    // the instructor may have kept typing into while the call was in flight),
    // plus one per row the plan dropped before the call.
    const gradeByRepo = new Map(plan.postable.map((item) => [item.repo, item.grade.grade]));
    recordLog([
      ...fanout.map((outcome) =>
        buildLogEntry(outcome.postStatus === "error" ? "post-failed" : "post-succeeded", {
          repo: outcome.repo,
          folder: column.folder,
          assignmentId: column.assignmentId ?? "",
          score: gradeByRepo.get(outcome.repo) ?? "",
          detail: outcome.postMessage ?? "",
        })
      ),
      ...plan.skipped.map((skip) =>
        buildLogEntry("post-skipped", {
          repo: skip.repo,
          folder: column.folder,
          assignmentId: column.assignmentId ?? "",
          detail: skip.reason,
        })
      ),
    ]);

    const failedCount = fanout.filter((f) => f.postStatus === "error").length;
    setPostSummary(
      `${column.folder}: posted ${fanout.length - failedCount}${failedCount ? `, ${failedCount} failed` : ""}.`
    );
  };

  // AC "posting and reflow" A4: retries (or deliberately re-posts) exactly
  // ONE cell - a one-element-array call mirroring GradingResults.tsx:363-390's
  // handlePostOne, reusing the SAME repoGradePostCandidateRows /
  // buildRepoGradePostPlan / fanOutRepoGradePostResult pipeline
  // handlePostColumn uses (scoped to `[row]`), so a retry can never disagree
  // with what a whole-column post would have done for that exact row, and
  // never touches any other row's status. No confirm dialog, by design: this
  // app treats click cost as a first-class factor and a single, already-
  // scoped row is a deliberate enough act on its own (handlePostOne itself
  // has none either).
  //
  // WIRED: passed to RepoGradesGrid as `onPostOneCell`, which forwards it into
  // each cell as RepoGradeCellControl's `onPostOne`. It did not ship switched
  // off - the failure mode docs/REGRESSION.md entry 211 records.
  const handlePostOneCell = async (row: RepoGradeRow, column: RepoGradeColumn, pointsPossible: number | null) => {
    if (!course) return;
    const candidates = repoGradePostCandidateRows([row], cellEdits, column.folder);
    const plan = buildRepoGradePostPlan(candidates, column.assignmentId, pointsPossible);
    if (plan.postable.length === 0) {
      // This path is otherwise completely silent (by design - the button that
      // reaches it is already only rendered for a plausible cell), which is
      // precisely why the log should say the retry did nothing and name the
      // plan's own reason for it.
      recordLog(
        plan.skipped.map((skip) =>
          buildLogEntry("post-skipped", {
            repo: skip.repo,
            folder: column.folder,
            assignmentId: column.assignmentId ?? "",
            detail: skip.reason,
          })
        )
      );
      return;
    }

    const assignmentUrl = column.assignmentId ? repoGradeAssignmentUrl(course.canvasUrl ?? "", column.assignmentId) : null;
    if (!assignmentUrl) {
      const summary = `${column.folder}: could not build a Canvas assignment URL for "${course.name}" - check the course's Canvas URL.`;
      setPostSummary(summary);
      recordLog([
        buildLogEntry("post-skipped", {
          repo: row.repo,
          folder: column.folder,
          assignmentId: column.assignmentId ?? "",
          detail: summary,
        }),
      ]);
      return;
    }

    setCellEdits((prev) => setRepoGradeCellEdit(prev, row.repo, column.folder, { postStatus: "posting", postMessage: null }));

    const result = await postCanvasGradesAction(assignmentUrl, plan.postable.map((p) => p.grade));

    const fanout = fanOutRepoGradePostResult(
      plan.postable.map((p) => ({ repo: p.repo, userId: p.userId })),
      result
    );
    setCellEdits((prev) => {
      let next = prev;
      for (const outcome of fanout) {
        next = setRepoGradeCellEdit(next, outcome.repo, column.folder, {
          postStatus: outcome.postStatus,
          postMessage: outcome.postMessage,
        });
      }
      return next;
    });

    const singleGrade = plan.postable[0]?.grade.grade ?? "";
    recordLog(
      fanout.map((outcome) =>
        buildLogEntry(outcome.postStatus === "error" ? "post-failed" : "post-succeeded", {
          repo: outcome.repo,
          folder: column.folder,
          assignmentId: column.assignmentId ?? "",
          score: singleGrade,
          detail: outcome.postMessage ?? "Single-row retry",
        })
      )
    );

    const failed = fanout.some((f) => f.postStatus === "error");
    setPostSummary(`${row.repo} / ${column.folder}: ${failed ? "failed to post." : "posted."}`);
  };

  // ---- "Grade all": grades a whole column at once against each folder's
  // README (or the fallback instructions), unbound repos included - the
  // batch loop itself lives in the sibling useRepoGradesBulkGrade hook; this
  // block only supplies its callbacks and builds the plan a click starts it
  // with. buildBulkGradePlan never reads row.binding - do not add a binding
  // check here, that reintroduces the friction this feature removes.
  const handleBulkCellUpdate = (repo: string, folder: string, patch: Partial<RepoGradeCellEdit>) => {
    setCellEdits((prev) => setRepoGradeCellEdit(prev, repo, folder, patch));
  };

  // Same log kinds handleGradeCell already records above - a bulk grade is
  // still, per row, an on-demand AI grading call.
  const handleBulkOutcomes = (outcomes: readonly BulkGradeOutcome[]) => {
    recordLog(
      outcomes.map((o) => buildLogEntry(o.status === "graded" ? "grade-succeeded" : "grade-failed", { repo: o.repo, folder: o.folder, score: o.score, detail: o.detail }))
    );
  };

  const { runningFolder: bulkRunningFolder, progress: bulkProgress, runBulkGrade } = useRepoGradesBulkGrade({
    provider,
    instructions,
    useReadmeInstructions,
    onCellUpdate: handleBulkCellUpdate,
    onOutcomes: handleBulkOutcomes,
    onAnnounce: setPostSummary,
  });

  // buildRepoGradeRows always emits a cell with score "" - the live score
  // lives in `cellEdits`. buildBulkGradePlan reads `cell.score` as its
  // "already graded" signal, so the plan below is built from
  // mergeRepoGradeLiveScores's merged view (repoGradesCellEdits.ts), never
  // raw `rows` - a second "Grade all" would otherwise re-spend a model call
  // on every already-graded repo. An empty plan announces its skip reasons
  // instead of firing a no-op batch call.
  //
  // AC item 50 - THE reachability seam this feature would otherwise ship
  // half-dead through (docs/repo-grades-rubric-picker-acceptance-criteria.md).
  // Before this wave, this function received only `folder` (a plain string)
  // and had no `columns` array to search, so it could never learn that
  // column's `assignmentId` - an `assignment`-source rubric picked for a
  // "Grade all" run would have had nothing to resolve against, silently
  // grading the whole column against a generated rubric instead of the one
  // the instructor picked, with every other gate green. `columns` (the FULL,
  // mapping-applied list - see this hook's params doc comment on why not the
  // folder-scoped displayed one) closes that: the SAME assignmentId
  // handleGradeCell would use for a cell in this column is what gets
  // resolved here, once, for the whole run - not per repo, matching
  // establishSharedRubric's own "one rubric per run" rule in the sibling
  // hook.
  const handleGradeColumn = async (folder: string) => {
    const plan = buildBulkGradePlan({ rows: mergeRepoGradeLiveScores(rows, cellEdits), folder, selected, selectionOnly: bulkSelectionOnly });
    if (plan.targets.length === 0) {
      const reasons = plan.skipped.length > 0 ? plan.skipped.map((s) => `${s.repo}: ${s.reason}`).join("; ") : "no repos have this folder.";
      setPostSummary(`${folder}: nothing to grade - ${reasons}`);
      return;
    }
    const column = columns.find((c) => c.folder === folder) ?? { folder, assignmentId: null };
    const resolved = await resolveRubricForColumn(column.assignmentId);
    void runBulkGrade(plan, resolved);
  };

  return {
    handleScoreChange,
    handleFeedbackFieldChange,
    handleGradeCell,
    handlePostColumn,
    handlePostOneCell,
    columnPosting,
    handleGradeColumn,
    bulkRunningFolder,
    bulkProgress,
  };
}
