"use client";

// Repo Grades view - AC4 items 20-21, AC5 (docs/repo-grades-view-acceptance-
// criteria.md). One grid cell's editable content: an on-demand "Grade"
// action that calls gradeRepoAction (task 2 of the wave brief - the SAME
// call folder-per-module grading already makes, with `folderPath` as the
// `pathPrefix` - never a new grading engine), an editable score field
// following GradingResults.tsx:664-671's idiom (a controlled MUI `TextField`
// bound to local edit state, an aria-label naming exactly what it edits -
// this comment used to cite GradingResults.tsx:781-832, which was the right
// idiom but the wrong line range even when it was written; that file is now
// 775 lines and the real code is at :664-688), and this cell's own
// postability reason and post status.
//
// Only ever rendered for a cell whose derived status is "ungraded"
// (RepoGradesGrid.tsx keeps missing-folder/scan-error cells on the existing
// plain CellStatus text - task 3: "A cell whose status is missing-folder or
// scan-error is not gradeable and not postable, and the reason shows" -
// there is nothing to edit or grade for those, so this component is never
// asked to render one, and `folderPresent: true` below is always correct
// for exactly that reason).
//
// Grading is gated behind the Grade menu item's onClick only - never called on
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
import { useId, useRef, useState } from "react";
import { Collapse, ListItemText, MenuItem, Select, Typography } from "@mui/material";
import TextField from "@mui/material/TextField";
import { CopyStatus, useFeedbackCopy } from "./RepoDashboardFeedback";
import RepoGradeActionsMenu from "./RepoGradeActionsMenu";
import RepoGradeRubricScores from "./RepoGradeRubricScores";
import RepoGradeStatusChip from "./RepoGradeStatusChip";
import { gradeStatusForEdit } from "./repoGradeCellStatus";
import type { RepoGradeQueueCommand, RepoGradeQueueState } from "./repoGradeQueue";
import { repoGradePostability } from "@/lib/repo-grade-postability";
// A13: the live-defect guard - relative path, not the "@/lib/grade" alias:
// repoGradesFeedbackAndFiles.wiring.test.ts bans that alias prefix outright
// for this file (even for a safe submodule) to keep this client bundle away
// from @/lib/grade's server-only barrel.
import { checkRowPostability } from "../../../lib/grade/postable";
// B4: the shipped two-click "arm, then confirm" idiom, reused VERBATIM (not
// reimplemented) - see draftPostArming.ts's header comment for the same
// reuse on the Drafted Grades surface. The signature built below (see
// firstPostSignature) is a plain `repo:folder:score` template string rather
// than that file's JSON.stringify tuple - the three fields (a GitHub repo
// full name, a folder name, a raw score string) are simple, non-JSON-like
// text that cannot itself contain a colon, so a plain delimiter join is
// already collision-safe here without needing JSON.stringify's escaping.
import { isConfirmArmed } from "../content-tab/modules/confirmArming";
// docs for this feature (request 2 - "a button ... that can kick off the
// interpreter/compiler for any specified file(s) in a student's folder"):
// reuses runSubmissionCodeAction, the SAME server action the results page's
// own per-row/per-file Run buttons already call (GradingResults.tsx,
// FilePreviewModal.tsx) - never a second runner or a second action. Type-only
// CodeRunResult import matches those two files' own precedent for a client
// component reading this server-only-runtime shape.
import { runSubmissionCodeAction } from "@/app/actions";
import type { CodeRunResult } from "@/lib/code-runner";
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
  hasSavedResult: boolean;
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
  onControlGrade: (command: RepoGradeQueueCommand) => void;
  queueState?: RepoGradeQueueState;
  folderPaused?: boolean;
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
  hasSavedResult,
  pointsPossible,
  onScoreChange,
  onFeedbackFieldChange,
  onGrade,
  onControlGrade,
  queueState,
  folderPaused,
  onPostOne,
}: RepoGradeCellControlProps) {
  const actionsTriggerRef = useRef<HTMLButtonElement>(null);
  const gradeNoteId = useId();
  const [detailsOpen, setDetailsOpen] = useState(false);
  // docs/grading-results-file-viewer-acceptance-criteria.md: whether this
  // cell's "Browse files" panel is open. Local state only - the panel shows
  // ONLY edit.submittedFiles (what THIS grading call actually read), never a
  // live GitHub fetch, so there is nothing to load on open.
  const [filesOpen, setFilesOpen] = useState(false);
  // Item 3 (docs for this feature): whether this cell's code-run output
  // (stdout/stderr/compileOutput) is expanded. The one-line summary below is
  // always visible - only the full output is behind this toggle, mirroring
  // "Browse files" above (a click for detail, never for the headline fact).
  const [codeRunOpen, setCodeRunOpen] = useState(false);
  // docs for this feature (request 2): the per-row Run control's own state -
  // which file (if any) the instructor picked to override the automatic
  // entry point ("" = let selectCodeRunFiles's chooseEntryPoint decide, the
  // exact default behavior request 2 calls for), whether a manual run is in
  // flight, and its result. A manual run always wins over the grading-time
  // `edit.codeExecution` once one has been made (displayedCodeRun below) -
  // the same "a fresh manual run wins, else the grading-time run" precedent
  // GradingResults.tsx's own codeRunFor already sets, so this control is a
  // second instance of an established pattern, not a new one.
  const [entryPointChoice, setEntryPointChoice] = useState("");
  const [manualRunning, setManualRunning] = useState(false);
  const [manualRun, setManualRun] = useState<CodeRunResult | null>(null);
  const handleRunCode = async () => {
    setManualRunning(true);
    try {
      const files = edit.submittedFiles.map((f) => ({
        name: f.name,
        extension: f.extension,
        rawBase64: f.rawBase64,
        previewContent: f.previewContent,
      }));
      const res = await runSubmissionCodeAction(files, entryPointChoice || undefined);
      setManualRun(
        res ?? {
          language: "",
          files: [],
          ran: false,
          exitCode: null,
          stdout: "",
          stderr: "",
          error: "None of these files are runnable code.",
        }
      );
    } catch (err) {
      // Surface a failed run (e.g. an expired session) instead of a stuck
      // spinner - matches GradingResults.tsx's own handleRunCode catch.
      setManualRun({
        language: "",
        files: [],
        ran: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error: err instanceof Error ? err.message : "Run failed.",
      });
    } finally {
      setManualRunning(false);
      setCodeRunOpen(true);
    }
  };
  // The expanded feedback editor stays scoped to this repo and folder.
  const [expandedField, setExpandedField] = useState<FeedbackField | null>(null);
  // B4 (ux-audit-grading.md): the FIRST post from this cell needs a confirm -
  // a retry (postStatus "error") or a deliberate re-post (postStatus
  // "posted") stays one click, matching handlePostOneCell's own "a single,
  // already-scoped row is a deliberate enough act on its own" reasoning for
  // those cases. `confirmFirstPost` holds the signature the arm was set for
  // (null = not armed); handleScoreChange already resets postStatus to
  // "idle" on every score edit (docs/rubric-criteria-breakdown-acceptance-
  // criteria.md B5), so a changed score both re-enters "first post" AND
  // changes `firstPostSignature` below, disarming any stale arm twice over.
  const [confirmFirstPost, setConfirmFirstPost] = useState<string | null>(null);
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
  const { copy: handleCopyFeedback, copiedKey, failed: copyFailed } = useFeedbackCopy(
    JSON.stringify([row.repo, column.folder, feedbackEdit]),
  );
  // Always folderPresent: true - see the module header for why that is safe
  // for every cell this component is ever asked to render.
  const scorePostability = repoGradePostability({
    bindingState: row.binding.state,
    canvasUserId: row.binding.canvasUserId,
    assignmentId: column.assignmentId,
    folderPresent: true,
    score: edit.score,
    pointsPossible,
  });
  // A13: repoGradePostability only gates on the score - a hand-typed score
  // over an untouched, unreviewed comment would otherwise show this button
  // as postable while buildRepoGradePostPlan (repoGradesPosting.ts) silently
  // drops the row, the exact enabled-state-vs-actual-payload disagreement
  // AC5 item 28 exists to prevent. Checked ONLY once scorePostability itself
  // already passed, so this never overrides a more specific reason above.
  const rowPostability = scorePostability.postable
    ? checkRowPostability({
        producer: {
          totalScore: edit.generatedScore ?? "",
          rubricAreas: edit.rubricAreas,
          overallComment: edit.generatedComment ?? "",
        },
        submittedScore: edit.score,
        submittedComment: edit.comment,
      })
    : { postable: true as const };
  const postability = rowPostability.postable ? scorePostability : rowPostability;
  // U12.52: shown only once every OTHER postability gate has already passed -
  // describePostScore only looks at score/pointsPossible, so showing it
  // whenever the binding/assignment/folder gates are still failing would
  // read as "this will post" for a row that is nowhere close to postable.
  // When postability itself failed on the score/scale, postability.reason
  // (below) already carries that exact same text.
  const postScoreDescription = postability.postable ? describePostScore(edit.score, pointsPossible) : null;

  const postStatusClass =
    edit.postStatus === "error"
      ? styles.postStatusError
      : edit.postStatus === "posted"
        ? styles.postStatusPosted
        : edit.postStatus === "skipped"
          ? styles.postStatusSkipped
          : styles.postStatusPosting;

  // A4: label/disabled state for the per-row post/retry button - "Post" once
  // postable and never attempted, "Retry" after an error, "Re-post" after a
  // success (so re-posting an already-posted row reads as the deliberate act
  // it is, never a disguised "Post"), "Posting..." while in flight. Disabled
  // while in flight, or while idle-and-not-yet-postable (the postReason span
  // below already explains why).
  const postButtonLabel =
    edit.postStatus === "posting" ? "Posting…" : edit.postStatus === "posted" ? "Re-post" : edit.postStatus === "error" ? "Retry" : "Post";
  const postButtonDisabled = edit.postStatus === "posting" || (edit.postStatus === "idle" && !postability.postable);
  // B4: "first post" is exactly the idle/never-attempted case - a retry
  // (postStatus "error") or a re-post (postStatus "posted") is already an
  // established action and stays one click. The signature is scoped to THIS
  // cell's own row/column (fixed props, never change for this component
  // instance) plus the CURRENT score, so a stray click on a never-posted
  // cell cannot reach Canvas, and typing a new score always re-arms.
  const isFirstPost = edit.postStatus === "idle";
  const firstPostSignature = `${row.repo}:${column.folder}:${edit.score}`;
  const firstPostArmed = isConfirmArmed(confirmFirstPost, firstPostSignature);

  // docs for this feature (request 2): a fresh manual Run always wins over
  // the grading-time run for DISPLAY - the exact "a fresh manual run wins,
  // else the grading-time run" precedent GradingResults.tsx's own codeRunFor
  // already sets. Read by the summary/output block near the bottom of this
  // component's JSX, and nowhere else - manualRun is never posted, never
  // scored, and never written back onto `edit` (a Run click is read-only
  // review, not a re-grade).
  const displayedCodeRun = manualRun ?? edit.codeExecution;

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

  const stage = queueState ?? edit.gradeRunStage ?? (edit.grading ? "running" : null);
  const status = gradeStatusForEdit(edit, stage);
  const mayControl = stage === "paused" || stage === "queued";
  const gradeLabel = stage === "queued" ? "Pause grade" : stage === "paused" ? "Resume grade" : "Start grade";
  const gradeDisabled = stage === "running" || stage === "stopped" || (stage === "paused" && !!folderPaused);
  const gradeNote = stage === "running" ? "Already started and will finish."
    : stage === "paused" && folderPaused ? "The folder queue is paused." : null;
  const cellName = `${row.repo} / ${column.folder || "Repository root"}`;
  const blankScore = !detailsOpen && !edit.score.trim();
  const earlierScore = !!edit.score.trim() && edit.generatedScore !== null
    && status !== "succeeded" && status !== "partial";

  return (
    <div className={styles.cellControl}>
      <div className={styles.actionHeading}>
        {(!hasSavedResult || status !== "not-started") && (
          <span role={queueState === undefined ? "status" : undefined}>
            {queueState === undefined && <span className={styles.srOnly}>{cellName}: </span>}
            <RepoGradeStatusChip status={status} active={stage === "running"} source={hasSavedResult ? "Browser" : undefined} />
          </span>
        )}
        {!hasSavedResult && status !== "no-submission" && status !== "succeeded" && status !== "partial" && (
          <Typography variant="caption" color="text.secondary">Folder found</Typography>
        )}
        <RepoGradeActionsMenu label={`Grade actions: ${cellName}`} triggerRef={actionsTriggerRef}
          onClose={() => setConfirmFirstPost(null)}>
          {(close) => [
            <MenuItem key="grade" disabled={gradeDisabled} aria-label={`${gradeLabel}: ${cellName}`}
              aria-describedby={gradeNote ? gradeNoteId : undefined}
              onClick={() => {
                close();
                if (stage === "queued") onControlGrade("pause");
                else if (stage === "paused") onControlGrade("resume");
                else onGrade();
              }}>
              {gradeLabel}
            </MenuItem>,
            mayControl && (
              <MenuItem key="stop" sx={{ color: "error.main" }} aria-label={`Stop queued grade: ${cellName}`}
                onClick={() => {
                  close();
                  onControlGrade("stop");
                }}>
                Stop queued grade
              </MenuItem>
            ),
            onPostOne && (
              <MenuItem key="post" disabled={postButtonDisabled}
                onClick={() => {
                  if (isFirstPost && !firstPostArmed) {
                    setConfirmFirstPost(firstPostSignature);
                    return;
                  }
                  close();
                  onPostOne();
                }}>
                <ListItemText
                  primary={isFirstPost && firstPostArmed ? "Confirm post" : postButtonLabel}
                  secondary={isFirstPost && firstPostArmed ? "This writes to the live Canvas gradebook."
                    : postability.postable ? postScoreDescription : postability.reason}
                />
              </MenuItem>
            ),
            <MenuItem key="details" onClick={() => {
              setDetailsOpen((open) => !open);
              close();
            }}>
              {detailsOpen ? "Hide grade details" : "Show grade details"}
            </MenuItem>,
            edit.submittedFiles.length > 0 && (
              <MenuItem key="files" aria-label={`Browse the ${column.folder} files for ${row.repo}`}
                onClick={() => close(() => setFilesOpen(true))}>
                Browse files ({edit.submittedFiles.length})
              </MenuItem>
            ),
            edit.submittedFiles.length > 0 && (
              <MenuItem key="run" disabled={manualRunning} onClick={() => {
                setDetailsOpen(true);
                close();
                void handleRunCode();
              }}>
                {manualRunning ? "Running..." : "Run"}
              </MenuItem>
            ),
            displayedCodeRun && !displayedCodeRun.error && (
              <MenuItem key="output" onClick={() => {
                if (!codeRunOpen) setDetailsOpen(true);
                setCodeRunOpen(!codeRunOpen);
                close();
              }}>
                {codeRunOpen ? "Hide output" : "Show output"}
              </MenuItem>
            ),
          ]}
        </RepoGradeActionsMenu>
      </div>
      {gradeNote && <span id={gradeNoteId} className={styles.postReason}>{gradeNote}</span>}
      {manualRunning && <span className={styles.postReason} role="status">Running code…</span>}
      <div className={styles.cellInputs} data-blank={blankScore && edit.mergeStatus !== "not-merged" ? true : undefined}>
        {!!edit.score.trim() && !!edit.retainedResults?.length
          ? <Typography variant="caption" color="text.secondary">Browser draft score</Typography>
          : earlierScore && <Typography variant="caption" color="text.secondary">Earlier score</Typography>}
        <div className={styles.scoreRow} data-blank={blankScore || undefined}>
          {/* Repo Grades UI consistency audit item #5 - adopts MUI TextField
              exactly as GradingResults.tsx:664-671 does for the same kind of
              dense per-row score input (`size="small"`, a fixed `sx` width,
              and `slotProps.htmlInput` for the tighter padding a grid cell
              needs). repoGrades.wiring.test.ts:246-247 pins `value={edit.score}`
              and `onChange={(e) => onScoreChange(e.target.value)}` as source
              text - both survive verbatim on a TextField. */}
          <TextField
            type="text"
            size="small"
            slotProps={{
              htmlInput: {
                "aria-label": `${column.folder || "Repository root"} browser score for ${row.repo}`,
                inputMode: "decimal",
                style: { padding: "var(--space-1) var(--space-2)", fontVariantNumeric: "tabular-nums" },
              },
            }}
            value={edit.score}
            onChange={(e) => onScoreChange(e.target.value)}
            placeholder={hasSavedResult ? "Browser score" : "Score"}
            sx={{ width: 84 }}
          />
          {scorePercent && <span className={styles.scorePercent}>{scorePercent}</span>}
        </div>
        {edit.mergeStatus === "not-merged" && (
          <span
            className={styles.mergeBadgeNotMerged}
            title={edit.mergeFoundOnBranch ? `Folder work also exists on branch "${edit.mergeFoundOnBranch}"` : undefined}
          >
            Not merged to target branch
          </span>
        )}
      </div>
      <RepoGradeRubricScores areas={edit.rubricAreas} label={`Rubric scores: ${cellName}`} />
      {edit.submissionTruncated && (earlierScore || !!edit.retainedResults?.length) && (
        <Typography variant="caption" color="text.secondary">Submission truncated</Typography>
      )}
      {edit.rubricAreas.length > 0 && edit.generatedScore !== null && edit.score !== edit.generatedScore && (
        <span className={styles.postReason}>Rubric scores are from the generated result ({edit.generatedScore}).</span>
      )}
      <CopyStatus copied={copiedKey !== null} failed={copyFailed} compact />
      <Collapse in={detailsOpen} timeout={0} unmountOnExit sx={{ width: "100%" }}>
          <RowFeedbackBoxes
            student={row.repo}
            edit={feedbackEdit}
            copiedKey={copiedKey}
            onCopy={handleCopyFeedback}
            onChangeField={onFeedbackFieldChange}
            onExpand={(field) => setExpandedField(field)}
            namePrefix={column.folder}
            showCopyAll={false}
          />
        {edit.submissionTruncated && !earlierScore && !edit.retainedResults?.length && (
          <span className={styles.postReason}>Submission truncated</span>
        )}
        {edit.rubricAreas.length > 0 && (
          <span className={styles.postReason}>
            {breakdownWillPost
              ? "This breakdown will be included when this grade posts to Canvas."
              : "This breakdown is shown for reference only - it does not post to Canvas."}
          </span>
        )}
        {/* Item 3 (docs for this feature): gradeRepoAction's LLM branch has been
            running this repo's code in the sandbox and feeding the result into
            the grading prompt since commit fa057050 - this is the ONE place an
            instructor can see that happened and why it may have moved the
            score. Request 2 (docs for this feature) adds the Run control right
            above it: "any specified file(s) in a student's folder" defaults to
            running the chosen ENTRY POINT with its sibling files available
            (selectCodeRunFiles's own dominant-language grouping - the same
            logic grading's own automatic run already uses), and the select
            below lets the instructor override which file that is. Gated on
            `edit.submittedFiles` (this cell must already be graded once - the
            files a Run would use are exactly what grading last read), not on
            `edit.codeExecution`/`edit.grading`, so it is reachable even for a
            cell graded on the embedded engine with Task B's code-scoring
            toggle off. Reuses runSubmissionCodeAction - the SAME server action
            and CodeRunResult shape GradingResults.tsx's/FilePreviewModal.tsx's
            own Run buttons already call - never a second runner, a second
            action, or a second output viewer: the summary/output rendering
            below is the SAME markup (page.module.css's previewMeta/
            previewNotice/previewContent classes) this file already used for
            `edit.codeExecution` alone, now reading `displayedCodeRun` (a fresh
            manual run when one exists, else the grading-time run - see that
            const's own comment above). */}
        {edit.submittedFiles.length > 0 && (
          <div className={styles.codeRunSummary}>
            <div className={styles.codeRunControls}>
              <label htmlFor={`repo-grade-run-entry-${row.repo}-${column.folder}`} className={pageStyles.previewMeta}>
                Entry point
              </label>
              <Select native size="small"
                value={entryPointChoice}
                onChange={(e) => setEntryPointChoice(e.target.value)}
                inputProps={{
                  id: `repo-grade-run-entry-${row.repo}-${column.folder}`,
                  "aria-label": `Choose which ${column.folder} file to run for ${row.repo}`,
                }}
              >
                <option value="">Auto-detected entry point</option>
                {edit.submittedFiles.map((file) => (
                  <option key={file.name} value={file.name}>
                    {file.name}
                  </option>
                ))}
              </Select>
            </div>
            {displayedCodeRun && (
              <>
                <span className={styles.postReason}>
                  {/* U12.52-style "never make the instructor guess" rule,
                      applied here (docs for this feature, request 2's "Always
                      show WHICH file was executed"): a manual run is labeled as
                      such so it is never mistaken for what was actually scored
                      at grading time - manualRun never writes back onto `edit`
                      (see displayedCodeRun's own comment), so a manual Run can
                      never itself change a posted score. */}
                  {manualRun ? "Manual run (for review - does not change the score): " : "Code run: "}
                  {displayedCodeRun.error
                    ? displayedCodeRun.timedOut
                      ? "timed out before the sandbox reported back."
                      : `could not execute - ${displayedCodeRun.error}`
                    : displayedCodeRun.neededStdin
                      ? `${displayedCodeRun.entryPoint ?? "the submission"} found no input available (not scored)`
                      : `${displayedCodeRun.entryPoint ?? "the submission"} ${
                          displayedCodeRun.ran ? "ran cleanly" : "did not run cleanly"
                        }`}
                </span>
                {codeRunOpen && !displayedCodeRun.error && (
                  <div className={styles.codeRunOutput}>
                    <p className={pageStyles.previewMeta}>
                      Ran without errors:{" "}
                      {displayedCodeRun.neededStdin ? "no input available (not scored)" : displayedCodeRun.ran ? "yes" : "no"}
                    </p>
                    {displayedCodeRun.compileOutput && displayedCodeRun.compileOutput.trim() && (
                      <>
                        <p className={pageStyles.previewMeta}>Compiler output</p>
                        <pre className={pageStyles.previewContent}>{displayedCodeRun.compileOutput}</pre>
                      </>
                    )}
                    <p className={pageStyles.previewMeta}>Output (stdout)</p>
                    <pre className={pageStyles.previewContent}>{displayedCodeRun.stdout || "(none)"}</pre>
                    {displayedCodeRun.stderr && displayedCodeRun.stderr.trim() && (
                      <>
                        <p className={pageStyles.previewMeta}>Errors (stderr)</p>
                        <pre className={pageStyles.previewContent}>{displayedCodeRun.stderr}</pre>
                      </>
                    )}
                    {displayedCodeRun.filesExcluded && displayedCodeRun.filesExcluded.length > 0 && (
                      <>
                        <p className={pageStyles.previewMeta}>Not run</p>
                        <p className={pageStyles.previewNotice}>
                          {displayedCodeRun.filesExcluded.map((f) => f.reason).join(" ")}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Collapse>
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
      {filesOpen && (
        <SubmittedFilesPanel
          student={row.repo}
          files={edit.submittedFiles}
          submissionTruncated={edit.submissionTruncated}
          onClose={() => setFilesOpen(false)}
          restoreFocusRef={actionsTriggerRef}
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
            ? "Posting…"
            : edit.postStatus === "posted"
              ? "Posted to Canvas"
              : edit.postStatus === "skipped"
                ? "Not posted - no grade or comment to send"
                : `Canvas post failed: ${edit.postMessage ?? ""}`}
        </span>
      )}
    </div>
  );
}
