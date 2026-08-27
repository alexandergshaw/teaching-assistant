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
import { useState } from "react";
import { repoGradePostability } from "@/lib/repo-grade-postability";
import type { RepoGradeColumn, RepoGradeRow } from "./repoGradesRows";
import type { RepoGradeCellEdit } from "./repoGradesCellEdits";
// docs/grading-results-feedback-boxes-acceptance-criteria.md, brought to this
// surface after it shipped on GradingResults.tsx first (REGRESSION entry
// 355): three independently-copyable feedback boxes replace the single
// free-text comment textarea this file used to render directly. REUSES
// grading-results/RowFeedbackBoxes.tsx and FeedbackExpandModal.tsx AS-IS
// (both components, not a fork) via their new optional `namePrefix` prop -
// added specifically so this surface's own naming need ("many repos, each
// split into several folder columns, on screen at once" - an accessible name
// must carry the folder AND the repo) does not require a second copy of
// either component's labels/wording. `edit.comment` (still the field
// repoGradesPosting.ts posts to Canvas, unchanged) is no longer
// independently editable - see repoGradesCellEdits.ts's
// applyRepoGradeFeedbackFieldEdit doc comment.
import { RowFeedbackBoxes } from "../grading-results/RowFeedbackBoxes";
import { FeedbackExpandModal } from "../grading-results/FeedbackExpandModal";
import type { FeedbackBoxesEdit, FeedbackField } from "../grading-results/gradingResultsHelpers";
// docs/grading-results-file-viewer-acceptance-criteria.md, brought to this
// surface after it shipped on GradingResults.tsx first (REGRESSION entries
// 356/357/359): browsing a graded cell's own files, reusing
// SubmittedFilesPanel.tsx UNCHANGED rather than a second file viewer - it
// already renders ONLY the files it is handed (never a live GitHub fetch),
// which is exactly the "show what was actually graded" guarantee this
// control needs. Imported directly from its existing home under
// grading-results/ (a plain cross-folder import) rather than moved: nothing
// about this feature requires a neutral location, and moving a file nobody
// asked to move only adds churn and risk to an already-shared component.
import SubmittedFilesPanel from "../grading-results/SubmittedFilesPanel";
// U12.48/U12.52 (docs/repo-grades-ux-overhaul-acceptance-criteria.md): the
// instructor reads a PERCENTAGE beside the score field, never a raw total -
// but the editable score field itself keeps showing `edit.score` exactly as
// gradeRepoAction/the instructor produced it (still a bare "value={edit.score}"
// controlled input, pinned by repoGrades.wiring.test.ts:188). That raw text is
// what repoGradePostability and buildRepoGradePostPlan (repoGradesPosting.ts)
// read to decide what actually posts to Canvas - changing what this input
// SHOWS as its value would change what gets posted. formatScorePercent is
// display-only, read-only, and never fed back into onScoreChange.
import { formatScorePercent, scorePercentValue } from "./repoGradeScoreDisplay";
// U12.52: the pre-existing postability defect Part 2 fixes, and its
// companion display rule - repoGradePostScore.test.ts is that module's
// specification. describePostScore never re-derives the decision itself
// (resolvePostScore, called by repoGradePostability below, already decided
// it) - it only names, in words, exactly what a Post click would send, so
// the instructor is never left guessing whether "350/400" or "35" (out of a
// 40-point assignment) is the number about to reach a live gradebook.
import { describePostScore } from "./repoGradePostScore";
// JOB A (docs/rubric-criteria-breakdown-acceptance-criteria.md): rubricAreas
// has been written onto every graded cell's edit state since
// useRepoGradesGradingActions.ts:263, but was never read back by this
// component (or any other .tsx) - plumbing 100 percent, display 0 percent.
// repoGradeBreakdownWillPost is the SAME predicate buildRepoGradePostPlan
// (repoGradesPosting.ts) uses to decide whether a cell's breakdown actually
// travels in a post payload - imported here, never re-derived, so the
// truthful caption below can never drift out of sync with the real posting
// rule (B3).
import { repoGradeBreakdownWillPost } from "./repoGradesPosting";
import styles from "./repo-grades.module.css";
import pageStyles from "../../page.module.css";

export interface RepoGradeCellControlProps {
  row: RepoGradeRow;
  column: RepoGradeColumn;
  edit: RepoGradeCellEdit;
  /** The mapped Canvas assignment's own points value, or null when unknown
   * (no mapping yet, or the assignment carries no points value) -
   * RepoGradesGrid.tsx's pointsPossibleForColumn, the SAME value its column
   * header's Post button count is computed from. Threaded through to both
   * repoGradePostability (below) and describePostScore so this cell's own
   * postability and its "what will post" text can never disagree with the
   * column header. */
  pointsPossible: number | null;
  onScoreChange: (score: string) => void;
  /** Patches one of the three feedback boxes - repoGradesCellEdits.ts's
   * applyRepoGradeFeedbackFieldEdit is the ONE place this recomputes
   * `edit.comment`, reached through index.tsx's handleFeedbackFieldChange.
   * Replaces the old `onCommentChange` prop (REGRESSION entry 355's
   * "comment is no longer independently editable" rule, applied here). */
  onFeedbackFieldChange: (field: FeedbackField, value: string) => void;
  onGrade: () => void;
  /**
   * AC "posting and reflow" A4: posts (or retries/re-posts) THIS cell alone -
   * a one-element-array call, mirroring GradingResults.tsx:363-390's
   * handlePostOne, so retrying one failed row never touches a neighbour's
   * already-"posted" status. Deliberately zero-arg, matching `onGrade`'s own
   * shape - the caller closes over `row`/`column` itself.
   *
   * Optional, not required: the real handler (postCanvasGradesAction may be
   * called from index.tsx alone - repoGrades.wiring.test.ts enforces this)
   * has to be threaded down through RepoGradesGrid.tsx's JSX, which this
   * implementation wave's file set explicitly excludes editing. This prop is
   * fully wired and ready on THIS side; RepoGradesGrid.tsx needs one small
   * addition - a matching prop on RepoGradesGridProps, forwarded here as
   * `onPostOne={() => onPostOneCell(row, column)}` - before the button below
   * is reachable in the running app. Until then it simply does not render.
   */
  onPostOne?: () => void;
}

export default function RepoGradeCellControl({
  row,
  column,
  edit,
  pointsPossible,
  onScoreChange,
  onFeedbackFieldChange,
  onGrade,
  onPostOne,
}: RepoGradeCellControlProps) {
  // docs/grading-results-file-viewer-acceptance-criteria.md: whether this
  // cell's "Browse files" panel is open. Local state only - the panel shows
  // ONLY edit.submittedFiles (what THIS grading call actually read), never a
  // live GitHub fetch, so there is nothing to load on open.
  const [filesOpen, setFilesOpen] = useState(false);
  // docs/grading-results-feedback-boxes-acceptance-criteria.md: the
  // RowFeedbackBoxes/FeedbackExpandModal copy state and expand-modal state
  // this cell owns, mirroring GithubGradingPanel.tsx's own copiedKey/onCopy
  // pair (the SAME "await the write, then clear after 1.5s" idiom, not a
  // second one) since GradingResults.tsx's own copiedKey lives one level up
  // from RowFeedbackBoxes there too - one cell here plays the same role one
  // results-table row does there.
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedField, setExpandedField] = useState<FeedbackField | null>(null);
  const handleCopyFeedback = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  };
  // The minimal shape both reused components read (gradingResultsHelpers.ts's
  // FeedbackBoxesEdit) - `overall` maps to this surface's `comment` (still
  // the field that actually posts to Canvas; RowFeedbackBoxes only reads
  // `overall` for its "copy all" fallback, never writes it).
  const feedbackEdit: FeedbackBoxesEdit = {
    overall: edit.comment,
    strengths: edit.strengths,
    improvements: edit.improvements,
    resubmitNotice: edit.resubmitNotice,
  };
  // Always folderPresent: true - see the module header for why that is safe
  // for every cell this component is ever asked to render.
  const postability = repoGradePostability({
    bindingState: row.binding.state,
    canvasUserId: row.binding.canvasUserId,
    assignmentId: column.assignmentId,
    folderPresent: true,
    score: edit.score,
    pointsPossible,
  });
  // U12.52: shown only once every OTHER postability gate has already passed -
  // describePostScore only looks at score/pointsPossible, so showing it
  // whenever the binding/assignment/folder gates are still failing would
  // read as "this will post" for a row that is nowhere close to postable.
  // When postability itself failed on the score/scale, postability.reason
  // (below) already carries that exact same text.
  const postScoreDescription = postability.postable ? describePostScore(edit.score, pointsPossible) : null;

  const postStatusClass =
    edit.postStatus === "error" ? styles.postStatusError : edit.postStatus === "posted" ? styles.postStatusPosted : styles.postStatusPosting;

  // A4: label/disabled state for the per-row post/retry button - "Post" once
  // postable and never attempted, "Retry" after an error, "Re-post" after a
  // success (so re-posting an already-posted row reads as the deliberate act
  // it is, never a disguised "Post"), "Posting..." while in flight. Disabled
  // while in flight, or while idle-and-not-yet-postable (the postReason span
  // below already explains why).
  const postButtonLabel =
    edit.postStatus === "posting" ? "Posting..." : edit.postStatus === "posted" ? "Re-post" : edit.postStatus === "error" ? "Retry" : "Post";
  const postButtonDisabled = edit.postStatus === "posting" || (edit.postStatus === "idle" && !postability.postable);

  // U12.48: only shown once the raw score actually parses as an
  // "earned/possible" fraction - an unreadable or not-yet-graded score already
  // reads fine in the input alone, and repeating it here would just show the
  // same text twice.
  const scorePercent = scorePercentValue(edit.score) !== null ? formatScorePercent(edit.score) : null;

  // JOB A/B3: whether THIS cell's breakdown would actually reach Canvas if
  // it were posted right now - both this cell's overall postability
  // (binding/assignment/folder/score all passing) AND repoGradeBreakdownWillPost's
  // own four checks, so the caption below is truthful even for a cell that
  // is not otherwise postable at all (nothing posts either way in that
  // case). Computed unconditionally (cheap, pure) rather than only inside
  // the JSX below, so it stays next to the rest of this component's derived
  // display state.
  const breakdownWillPost =
    postability.postable &&
    repoGradeBreakdownWillPost({
      rubricAreasLength: edit.rubricAreas.length,
      currentScore: edit.score,
      generatedScore: edit.generatedScore,
      pointsPossible,
    });

  return (
    <div className={styles.cellControl}>
      <div className={styles.cellInputs}>
        <div className={styles.scoreRow}>
          <input
            type="text"
            inputMode="decimal"
            value={edit.score}
            onChange={(e) => onScoreChange(e.target.value)}
            aria-label={`${column.folder} score for ${row.repo}`}
            placeholder="Score"
            className={styles.scoreInput}
          />
          {scorePercent && <span className={styles.scorePercent}>{scorePercent}</span>}
        </div>
        <RowFeedbackBoxes
          student={row.repo}
          edit={feedbackEdit}
          copiedKey={copiedKey}
          onCopy={handleCopyFeedback}
          onChangeField={onFeedbackFieldChange}
          onExpand={(field) => setExpandedField(field)}
          namePrefix={column.folder}
        />
      </div>
      {expandedField && (
        <FeedbackExpandModal
          student={row.repo}
          field={expandedField}
          edit={feedbackEdit}
          onChange={onFeedbackFieldChange}
          onClose={() => setExpandedField(null)}
          namePrefix={column.folder}
        />
      )}
      {edit.rubricAreas.length > 0 && (
        <div className={styles.rubricBreakdown}>
          {edit.rubricAreas.map((area, index) => {
            // B1: computed from THIS area's own score string alone - never
            // from a rubric's declared points (scaleResultToPoints rescales
            // every area's numerator AND denominator, and an AI-generated
            // rubric's declared points are null by construction; see
            // repoGradeScoreDisplay.ts for the full reasoning). Shown only
            // when it actually parses - a blank score (engine.ts:212 emits
            // "" for an area routinely) or an unreadable one shows the raw
            // text alone, never a fabricated NaN%.
            const areaPercent = scorePercentValue(area.score) !== null ? formatScorePercent(area.score) : null;
            return (
              <div key={`${area.area}-${index}`} className={styles.rubricBreakdownArea}>
                <span className={styles.rubricBreakdownName}>{area.area}</span>
                <span className={styles.rubricBreakdownScore}>{area.score || "-"}</span>
                {areaPercent && <span className={styles.scorePercent}>{areaPercent}</span>}
              </div>
            );
          })}
          {/* B3: a truthful one-line statement, driven by the SAME
              repoGradeBreakdownWillPost predicate buildRepoGradePostPlan
              uses to build the real post payload - never a hand-rolled
              re-check of the same condition, so this can never say
              something the actual post does not do. Today this reads "for
              reference only" for every fresh Repo Grades grade (gradeRepoAction
              omits pointsPossible, so a fresh fraction score is always
              rescaled - see this module's own header for the verified
              chain) - but it is computed, not hardcoded, so it stays
              truthful if that ever changes. */}
          <span className={styles.postReason}>
            {breakdownWillPost
              ? "This breakdown will be included when this grade posts to Canvas."
              : "This breakdown is shown for reference only - it does not post to Canvas."}
          </span>
        </div>
      )}
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
        {onPostOne && (
          <button
            type="button"
            className={pageStyles.linkButton}
            disabled={postButtonDisabled}
            onClick={() => {
              onPostOne();
            }}
          >
            {postButtonLabel}
          </button>
        )}
        {/* docs/grading-results-file-viewer-acceptance-criteria.md: only
            rendered once this cell HAS files to show - a graded cell whose
            digest genuinely carried none, or a cell never graded, has
            nothing this button could open. Reuses SubmittedFilesPanel.tsx
            unchanged (see this file's import comment) - the panel itself
            already carries F3's truncation-honesty notices. */}
        {edit.submittedFiles.length > 0 && (
          <button
            type="button"
            className={pageStyles.linkButton}
            aria-label={`Browse the ${column.folder} files for ${row.repo}`}
            onClick={() => {
              setFilesOpen(true);
            }}
          >
            Browse files ({edit.submittedFiles.length})
          </button>
        )}
        {postScoreDescription && <span className={styles.postReason}>{postScoreDescription}</span>}
        {!postability.postable && <span className={styles.postReason}>{postability.reason}</span>}
      </div>
      {filesOpen && (
        <SubmittedFilesPanel
          student={row.repo}
          files={edit.submittedFiles}
          submissionTruncated={edit.submissionTruncated}
          onClose={() => setFilesOpen(false)}
        />
      )}
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
