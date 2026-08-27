// Repo Grades view - AC4 items 20-21 (docs/repo-grades-view-acceptance-criteria.md):
// the local, in-memory editable state one grid cell carries once grading
// starts - a score, a comment, whether an AI grading call is in flight (and
// its error, if any), and this cell's own post status/message. This is
// deliberately SEPARATE from RepoGradeCell (repoGradesRows.ts) - that type is
// re-derived from the org scan on every render (buildRepoGradeGridModel is
// pure and has no memory of an edit a user just typed), while this state is
// genuinely stateful UI memory that must survive across re-derivations of the
// grid model (e.g. the instructor re-sorting the grid, or the selection Set
// changing) without losing an in-progress edit.
//
// Keyed two levels deep (repo, then folder) rather than by a single composite
// string key - a nested Record makes the "one repo's other folders, and every
// other repo entirely, are untouched by an edit to one cell" guarantee
// visible directly in the data shape rather than relying on a key-collision
// argument, and it is what the sabotage check for this module actually pins:
// editing (repoA, week-1) must never mutate (repoA, week-2) or (repoB,
// week-1).
//
// Pure, no I/O, no React - the .tsx (RepoGradeCellControl.tsx) only calls
// getRepoGradeCellEdit to read and setRepoGradeCellEdit to write, exactly the
// "decide here, render there" split AC6 item 37 requires.

import type { RepoGradeCell, RepoGradePostStatus, RepoGradeRow } from "./repoGradesRows";
// Type-only import (erased at build time - safe from a "use client"-adjacent
// module the same way useRepoGradesData.ts's own header comment documents
// for CanvasAssignmentBrief) - RubricAreaResult/SubmittedFileInfo are the
// shapes gradeRepoAction's GradeResult.rubricAreas/submittedFiles carry
// (src/lib/grade/types.ts), re-exported from the src/lib/grade.ts barrel.
import type { RubricAreaResult, SubmittedFileInfo } from "@/lib/grade";
// Type-only (erased at build time, same client-bundle-safety rule as the
// import above) - CodeRunResult is gradeRepoAction's GradeResult.codeExecution
// shape (src/lib/grade/types.ts re-exports it from src/lib/code-runner.ts).
// Every other .tsx that already displays a CodeRunResult (GradingResults.tsx,
// FilePreviewModal.tsx, drafted-grades/SubmissionCodePanel.tsx) imports it the
// same way, straight from code-runner.ts.
import type { CodeRunResult } from "@/lib/code-runner";
// docs/grading-results-feedback-boxes-acceptance-criteria.md's three-box
// feature landed on the OTHER surface first (REGRESSION entry 355) and
// already solved "how do three independently-copyable feedback fields
// compose into the one field that actually posts" - FeedbackField names the
// three fields, and composeOverallCommentLocal is the byte-identical-to-
// composeOverallComment composer, proven so by
// gradingResultsHelpers.test.ts's own parity test. Reused here (VALUE
// import, not just the type) rather than re-derived a third time - this
// module is not "use client" itself, but repoGradesCellEdits.ts's values are
// consumed by index.tsx, a "use client" component tree, so the
// same client-bundle-safety rule applies: gradingResultsHelpers.ts's own
// guard test (its "client files stay client-bundle-safe" describe block)
// already proves it carries no import reaching @/lib/grade / next/headers /
// @/lib/supabase/server, so importing IT (never the @/lib/grade barrel
// itself) is safe from here too.
import { composeOverallCommentLocal, type FeedbackField } from "../grading-results/gradingResultsHelpers";

export interface RepoGradeCellEdit {
  /** Raw, editable score text - typed directly, or seeded by a grading call. */
  score: string;
  /** The composed feedback text actually posted to Canvas
   * (repoGradesPosting.ts reads this field, unchanged by this feature) -
   * seeded by a grading call, or recomposed from `strengths`/`improvements`/
   * `resubmitNotice` below by applyRepoGradeFeedbackFieldEdit below, the ONE
   * place this field is ever written once a cell has any of the three parts.
   * Never independently editable - there is no UI path left that sets
   * `comment` directly, matching gradingResultsHelpers.ts's RowEdit.overall
   * invariant on the other surface (REGRESSION entry 355). */
  comment: string;
  /** What the repo did well - one of the three independently-copyable
   * feedback boxes the instructor asked for (docs/grading-results-feedback-
   * boxes-acceptance-criteria.md, brought to this surface by this feature).
   * "" until this cell has been graded, or when a producer genuinely has
   * nothing to say. */
  strengths: string;
  /** What the repo could do better. "" when a producer cannot honestly
   * produce improvement text - never filler invented to fill the box. */
  improvements: string;
  /** RESUBMIT_NOTICE verbatim when points were deducted, "" at full credit -
   * see src/lib/grade/types.ts's own doc comment on the field this mirrors. */
  resubmitNotice: string;
  /** True only while an on-demand gradeRepoAction call for this exact cell is
   * in flight - never true on render, matching REGRESSION entries 98 and 101
   * (per-item LLM billing must be an explicit action, never a render side
   * effect). */
  grading: boolean;
  /** The grading call's own error message, or null. Cleared on the next
   * grading attempt or on a successful grade. */
  gradeError: string | null;
  /** This cell's own post status - "idle" until this SPECIFIC cell has been
   * included in a column post attempt at least once. Distinct from a whole
   * column's aggregate posting state (index.tsx's columnPosting), which
   * governs the column's Post/Re-post button's busy state. */
  postStatus: RepoGradePostStatus;
  /** Set only when postStatus is "error" - that failure's own message
   * (fanOutRepoGradePostResult in repoGradesPosting.ts is what produces it). */
  postMessage: string | null;
  /** AC "posting and reflow" A3: the rubric breakdown gradeRepoAction's last
   * successful grading call for this cell returned - [] until this cell has
   * been graded. Set ONLY by a grading call (index.tsx's handleGradeCell),
   * never by a score/comment edit, so it always reflects "what the AI most
   * recently produced," independent of anything the instructor later types.
   * Carried through to the post payload by repoGradesPosting.ts's
   * buildRepoGradePostPlan, gated by `generatedScore` below. */
  rubricAreas: RubricAreaResult[];
  /** AC "posting and reflow" A3: `score` exactly as gradeRepoAction's last
   * successful grading call for this cell produced it (e.g. "18/20") - null
   * until this cell has been graded. Set at the SAME time as `rubricAreas`
   * (and never by onScoreChange), which is what lets a later hand-edit of
   * `score` be told apart from the AI's original output: compare the two via
   * repoGradesPosting.ts's repoGradeScoreWasEdited before trusting
   * `rubricAreas` enough to post it. */
  generatedScore: string | null;
  /** docs/grading-results-file-viewer-acceptance-criteria.md, brought to this
   * surface by this feature: the files gradeRepoAction's last successful
   * grading call for this cell ACTUALLY read, with their contents - the
   * digest that was graded, never a live GitHub fetch (showing the
   * instructor something other than what was graded is the exact failure
   * this feature exists to prevent). Set at the SAME time as `rubricAreas`/
   * `generatedScore` - only by a grading call, never by hand. Held here, in
   * this ephemeral React state, deliberately: index.tsx's own header comment
   * on `cellEdits` already establishes that this state is NEVER persisted to
   * localStorage (reset to EMPTY_REPO_GRADE_CELL_EDITS on every course
   * switch), so storing full file contents here carries none of the
   * localStorage-bloat/invalidation risk that ruled out re-persisting them
   * elsewhere (github-grading-run-store.ts, grading-review-rows.ts).
   * [] until this cell has been graded, or when the grading run genuinely
   * had no files. */
  submittedFiles: SubmittedFileInfo[];
  /** True when the ASSEMBLED submission text was cut again, after ingestion,
   * before the model ever saw it (GradeResult.submissionTruncated) - the
   * SECOND, separately-named cut carried through so the browsing panel can
   * say "the grader saw less than you are seeing" even when no individual
   * file's own `previewTruncated` fired. false until this cell has been
   * graded. */
  submissionTruncated: boolean;
  /** Result of running this cell's code in the sandbox, when gradeRepoAction's
   * LLM branch had anything runnable - set at the SAME time as `rubricAreas`/
   * `submittedFiles`, only by a grading call, never by hand. `null` until
   * this cell has been graded, or when the grading run genuinely had nothing
   * runnable. This has been a LIVE, silent defect since commit fa057050: repo
   * grading has been executing student code and feeding the result into the
   * grading prompt (src/lib/grade/engine.ts's gradeStudentEntries already
   * sets GradeResult.codeExecution) since real `submittedFiles` started
   * reaching it, but neither grading path here ever copied the result onto
   * the cell - an execution-influenced grade had nowhere on screen to be
   * explained. RepoGradeCellControl.tsx is what actually shows it. */
  codeExecution: CodeRunResult | null;
}

/** The state a cell that has never been touched (no grading call, no post
 * attempt, no typed edit) reads as. Exported so both this module's default
 * lookup and its tests share one definition of "untouched". */
export function defaultRepoGradeCellEdit(): RepoGradeCellEdit {
  return {
    score: "",
    comment: "",
    strengths: "",
    improvements: "",
    resubmitNotice: "",
    grading: false,
    gradeError: null,
    postStatus: "idle",
    postMessage: null,
    rubricAreas: [],
    generatedScore: null,
    submittedFiles: [],
    submissionTruncated: false,
    codeExecution: null,
  };
}

/**
 * The ONE writer of `comment` once a cell has any of the three feedback
 * parts (see the field's own doc comment above) - patches one field and
 * recomputes `comment` as composeOverallCommentLocal's output in the SAME
 * step, so a caller can never produce a RepoGradeCellEdit whose `comment`
 * disagrees with its three parts. Mirrors gradingResultsHelpers.ts's
 * applyFeedbackFieldEdit exactly (same composer, same "patch one field,
 * recompute in lockstep" shape) - this is what stops Canvas
 * (repoGradesPosting.ts reads `comment` unchanged) from ever receiving text
 * that disagrees with what the three boxes show on screen.
 */
export function applyRepoGradeFeedbackFieldEdit(
  edit: RepoGradeCellEdit,
  field: FeedbackField,
  value: string
): RepoGradeCellEdit {
  const next: RepoGradeCellEdit = { ...edit, [field]: value };
  next.comment = composeOverallCommentLocal(next.strengths, next.improvements, next.resubmitNotice);
  return next;
}

export type RepoGradeCellEditsByRepo = Readonly<Record<string, Readonly<Record<string, RepoGradeCellEdit>>>>;

export const EMPTY_REPO_GRADE_CELL_EDITS: RepoGradeCellEditsByRepo = {};

/** Reads one cell's edit state, defaulting to `defaultRepoGradeCellEdit()`
 * when this exact (repo, folder) pair has never been written. Never throws -
 * a lookup miss is the normal, expected case for the vast majority of cells
 * in a large grid that no one has interacted with yet. */
export function getRepoGradeCellEdit(edits: RepoGradeCellEditsByRepo, repo: string, folder: string): RepoGradeCellEdit {
  return edits[repo]?.[folder] ?? defaultRepoGradeCellEdit();
}

/**
 * Returns a NEW edits object with exactly one (repo, folder) cell patched -
 * starting from its current value (or the default, if untouched) merged with
 * `patch` - and every other repo's entry, and every OTHER folder under this
 * same repo, carried over UNCHANGED (same object references, so a caller
 * diffing old vs new only sees the one cell that actually changed). Never
 * mutates `edits`.
 */
export function setRepoGradeCellEdit(
  edits: RepoGradeCellEditsByRepo,
  repo: string,
  folder: string,
  patch: Partial<RepoGradeCellEdit>
): RepoGradeCellEditsByRepo {
  const current = getRepoGradeCellEdit(edits, repo, folder);
  return {
    ...edits,
    [repo]: {
      ...(edits[repo] ?? {}),
      [folder]: { ...current, ...patch },
    },
  };
}

/**
 * buildRepoGradeRows (repoGradesRows.ts) always emits a cell with score ""
 * - the live score lives here, in `cellEdits`. Any caller that needs to
 * treat a row's cells as "what is actually on screen right now" (a bulk-
 * grade plan's "already graded" check, a column header's live postable
 * count, or a sort by a folder column's score) needs THIS merged view, never
 * raw rows - reading raw rows would re-spend a model call on an
 * already-graded repo, undercount a column's postable rows, or sort by a
 * value nothing on screen shows.
 *
 * This is the ONE copy: docs/repo-grades-name-columns-and-sorting-
 * acceptance-criteria.md N4 item 13 found this same merge already
 * duplicated once (RepoGradesGrid.tsx's own `liveRows`, itself copied
 * verbatim from useRepoGradesGradingActions.ts's private `withLiveScores`)
 * and required consolidating rather than adding a third copy for sorting -
 * both of those call sites, and repoGradesRows.ts's own folder-sort
 * comparator, now read `getRepoGradeCellEdit` (directly, for the sort) or
 * this function (for the two call sites that need every column merged at
 * once) instead of hand-rolling the merge again.
 */
export function mergeRepoGradeLiveScores(rows: readonly RepoGradeRow[], edits: RepoGradeCellEditsByRepo): RepoGradeRow[] {
  return rows.map((row) => {
    const cells: Record<string, RepoGradeCell> = {};
    for (const [folder, cell] of Object.entries(row.cells)) {
      cells[folder] = { ...cell, score: getRepoGradeCellEdit(edits, row.repo, folder).score };
    }
    return { ...row, cells };
  });
}
