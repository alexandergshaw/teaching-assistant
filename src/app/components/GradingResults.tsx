"use client";

import type { ReactNode, Ref } from "react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import { postCanvasGradesAction, runSubmissionCodeAction } from "../actions";
import type { PreviewFile } from "./FilePreviewModal";
import type { CodeRunResult } from "@/lib/code-runner";
import { ModalShell } from "./ui/ModalShell";
import { RowFeedbackBoxes } from "./grading-results/RowFeedbackBoxes";
import SubmittedFilesPanel from "./grading-results/SubmittedFilesPanel";
import { CopyIcon, EyeIcon, DownloadIcon } from "./grading-results/icons";
import { useResultsSort } from "./grading-results/useResultsSort";
import { ResultsTableHeaderRow } from "./grading-results/ResultsTableHeaderRow";
import { FeedbackExpandModal } from "./grading-results/FeedbackExpandModal";
import styles from "../page.module.css";
import {
  applyFeedbackFieldEdit,
  blankRowEdit,
  buildCsvContent,
  defaultRowEdit,
  fanOutGradingPostResult,
  filesColumnEmptyLabel,
  loadGradingResultsEdits,
  persistGradingResultsEdits,
  parseEarnedPoints,
  recomputeTotal,
  type AreaEdit,
  type FeedbackField,
  type GradeRow,
  type GradingRun,
  type RowEdit,
} from "./grading-results/gradingResultsHelpers";
// docs/rubric-criteria-breakdown-acceptance-criteria.md B1/B2: the SAME
// tested helpers Repo Grades already uses to show a per-criterion percentage
// beside a raw "8/10"-shaped score (RepoGradeCellControl.tsx follows the same
// "show a percent only when it parses" idiom below). Cross-folder import,
// deliberately not a relocation - this module is pure (no React, no I/O, no
// server-only dependency), so it carries none of the client-bundle risk
// gradingResultsHelpers.ts's own header comment warns about for @/lib/grade;
// src/lib/repo-grade-postability.ts and useLmsAssignmentPull.ts already
// import other repo-grades helpers the same way.
import { formatScorePercent, scorePercentValue } from "./repo-grades/repoGradeScoreDisplay";

// CopyIcon/EyeIcon/DownloadIcon moved to ./grading-results/icons.tsx (this
// file's line-budget extraction). ExpandIcon moved to
// grading-results/RowFeedbackBoxes.tsx (duplicated, not imported - see that
// file's header comment for why) once the single "Overall feedback" expand
// button became three per-box expand buttons.

// Sort helpers, seedEdits, recomputeTotal, buildCsvContent, and their pure
// support functions moved to ./grading-results/gradingResultsHelpers.ts (see
// that file's header comment for the full inventory and why). The sort
// STATE/handlers (sortState, sortedResults, handleSort, sortLabel) later
// moved again, to ./grading-results/useResultsSort.ts, and the <thead> row
// that reads them moved to ./grading-results/ResultsTableHeaderRow.tsx - both
// part of this file's line-budget extraction.

// B1 (ux-audit-grading.md): "skipped" is a genuine third outcome, distinct
// from "posted" and "error" - postCanvasGradesAction's own `skipped` array
// (src/lib/canvas/grades.ts) names a student who had no grade or comment to
// send, so Canvas was never called for them. Treating that as "posted" (the
// pre-fix behaviour: absent from `failures` read as success) is the defect
// this type change exists to make impossible - there is no "idle default
// counts as success" branch left to fall into.
type PostState = { status: "idle" | "posting" | "posted" | "error" | "skipped"; message?: string };

/** B3 (ux-audit-grading.md): what one postAll/handlePostGrades call actually
 * did - returned so a caller (LiveFeedPanel's "Post & next") can decide
 * whether to advance, rather than always advancing and losing the outcome
 * the instant the row changes. `null` means nothing was attempted (no
 * gradable rows, or the confirm was declined). */
export interface GradingPostOutcome {
  posted: number;
  failed: number;
  skipped: number;
}

// ── Component ──────────────────────────────────────────────────────────────

export type GradingResultsProps = {
  /** The grading run to display (non-null; callers gate on results.length). */
  run: GradingRun;
  /** Canvas assignment/discussion URL grades post back to. */
  canvasUrl: string;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => Promise<void>;
  /** `trigger` is the clicked IconButton itself (`event.currentTarget`,
   * captured synchronously in the onClick below) - the caller needs it to
   * set a real `restoreFocusRef` on `FilePreviewModal` instead of guessing
   * at one (decision 9, docs/modal-focus-restoration-acceptance-criteria.md).
   * That caller is page.tsx, two hops up on the non-livefeed path
   * (page.tsx -> GradingTab.tsx -> GradingResults.tsx); three hops via
   * LiveFeedPanel.tsx (page.tsx -> GradingTab.tsx -> LiveFeedPanel.tsx ->
   * GradingResults.tsx). */
  onOpenPreview: (student: string, file: PreviewFile, trigger: HTMLElement) => void;
  /** F4 (docs/grading-results-file-viewer-acceptance-criteria.md): true (the
   * default) for every fresh run, where an empty `submittedFiles` genuinely
   * means the submission had no files. A caller that can show a RESTORED run
   * (GithubGradingPanel.tsx, via its own `runIsRestored`) passes `false` so
   * the Files column can tell "nothing submitted" apart from "not retained"
   * - see filesColumnEmptyLabel in gradingResultsHelpers.ts. */
  filesRetained?: boolean;
  /** Called after any successful post (e.g. to refresh badges and the queue). */
  onPosted?: () => void;
  /** Optional context banner rendered above the results header. */
  banner?: ReactNode;
  /** Ref to the results section: backs the classic flow's scroll-into-view
   * effect, and (wave R3 bug report finding 3) doubles as a focus-restoration
   * fallback for page.tsx's FilePreviewModal - see GradingTab.tsx's merged
   * callback ref at its GradingResults render site. Needs `tabIndex={-1}`
   * below for `.focus()` on it to do anything (useModalDismiss.ts); the
   * LiveFeedPanel.tsx render site below does not pass this, so that branch
   * simply has no candidate here and falls through to page.tsx's own
   * whole-app fallback - confirmed, not assumed. */
  sectionRef?: Ref<HTMLDivElement>;
};

/** Imperative handle so a parent (the Live Feed pane) can drive "Post & Next". */
export interface GradingResultsHandle {
  /** Post every gradable student. Pass false to skip the confirm prompt.
   * B3: returns the outcome (or null if nothing was attempted) so the
   * caller can decide whether it is safe to navigate away - see
   * GradingPostOutcome's own doc comment. */
  postAll: (confirm?: boolean) => Promise<GradingPostOutcome | null>;
}

/**
 * The grading results matrix: per-criterion scores/comments, an editable total
 * (auto-summed from the criteria), overall feedback, per-student and bulk Post
 * to Canvas, SpeedGrader deep links, and CSV export. Owns its own edit/post
 * state so it can be dropped into either the classic flow or the Live Feed
 * detail pane.
 */
const GradingResults = forwardRef<GradingResultsHandle, GradingResultsProps>(function GradingResults({
  run,
  canvasUrl,
  copiedKey,
  onCopy,
  onOpenPreview,
  filesRetained = true,
  onPosted,
  banner,
  sectionRef,
}: GradingResultsProps, ref) {
  // A3 (docs/grading-results-feedback-boxes-acceptance-criteria.md):
  // edits persist under an assignment-scoped key - `edits` is keyed by bare
  // student name, so an unscoped key would leak one assignment's feedback
  // onto a different assignment's identically-named student. Lazy-init reads
  // whatever was last persisted for THIS canvasUrl, validated and merged
  // against the current run by loadGradingResultsEdits (never trusts stored
  // data - see its own doc comment in gradingResultsHelpers.ts).
  const [edits, setEdits] = useState<Record<string, RowEdit>>(() => loadGradingResultsEdits(canvasUrl, run));
  const [prevRun, setPrevRun] = useState(run);
  const [postStatus, setPostStatus] = useState<Record<string, PostState>>({});
  const [postSummary, setPostSummary] = useState("");
  const [posting, setPosting] = useState(false);
  // Which student + which of the three feedback boxes is expanded, or null.
  const [expandedBox, setExpandedBox] = useState<{ student: string; field: FeedbackField } | null>(null);
  const [codeRuns, setCodeRuns] = useState<Record<string, CodeRunResult | null>>({});
  const [codeRunning, setCodeRunning] = useState<Record<string, boolean>>({});
  const [codeOutputStudent, setCodeOutputStudent] = useState<string | null>(null);
  // Task 2: the row whose "Browse all files" panel is open, or null.
  const [browseFilesFor, setBrowseFilesFor] = useState<GradeRow | null>(null);

  // Re-load editable rows when a new run arrives (adjust-state-on-prop-change).
  // Loads from storage (not a bare re-seed) so edits already persisted for
  // this canvasUrl survive a run refresh; loadGradingResultsEdits degrades to
  // the seeded map for a student the new run doesn't have.
  if (run !== prevRun) {
    setPrevRun(run);
    setEdits(loadGradingResultsEdits(canvasUrl, run));
    setPostStatus({});
    setPostSummary("");
    setExpandedBox(null);
    setCodeRuns({});
    setCodeRunning({});
    setCodeOutputStudent(null);
    setBrowseFilesFor(null);
  }

  // Persists on every edits change (grade, per-criterion score, or any of the
  // three feedback boxes) - best-effort, see persistGradingResultsEdits's own
  // doc comment for why a write failure is swallowed rather than thrown.
  useEffect(() => {
    persistGradingResultsEdits(canvasUrl, edits);
  }, [canvasUrl, edits]);

  // docs/rubric-criteria-breakdown-acceptance-criteria.md B5: a row must not
  // keep reading "Posted to Canvas" once the number that was posted has
  // since changed - that badge would misrepresent what is actually live in
  // the gradebook. Called only from edits that can change what posts
  // (updateEdit/updateArea below), never from updateFeedbackField, which
  // never touches a number.
  const clearPostStatus = (student: string) =>
    setPostStatus((prev) => {
      if (!(student in prev)) return prev;
      const next = { ...prev };
      delete next[student];
      return next;
    });

  // docs/rubric-criteria-breakdown-acceptance-criteria.md B5 item 1: a
  // hand-edited total does NOT touch `areas` here - left this way
  // deliberately, not fixed. There is no single correct reaction: clearing
  // the areas would delete already-graded per-criterion detail the
  // instructor may still want to see or export, and no invented recomputed
  // area value could be more than a guess at intent (the instructor may be
  // overriding the total for a reason that has nothing to do with any one
  // criterion - a late-work penalty, a curve). Each area's own percentage
  // (Job B) is computed from that area's OWN score string regardless, so it
  // never claims to sum to whatever the total field currently reads -
  // baselined instead of guessed at.
  const updateEdit = (student: string, patch: Partial<RowEdit>) => {
    setEdits((prev) => ({
      ...prev,
      [student]: { ...(prev[student] ?? blankRowEdit()), ...patch },
    }));
    if (patch.total !== undefined) clearPostStatus(student);
  };

  const updateArea = (student: string, areaName: string, patch: Partial<AreaEdit>) => {
    setEdits((prev) => {
      const row = prev[student] ?? blankRowEdit();
      const area = row.areas[areaName] ?? { score: "" };
      const areas = { ...row.areas, [areaName]: { ...area, ...patch } };
      // Editing a criterion's points re-totals the student automatically.
      const total =
        patch.score !== undefined ? recomputeTotal(areas, run.rubricAreaNames, row.total) : row.total;
      return { ...prev, [student]: { ...row, areas, total } };
    });
    if (patch.score !== undefined) clearPostStatus(student);
  };

  // The only place that patches one of the three feedback boxes - always
  // routes through applyFeedbackFieldEdit so `overall` (what Canvas posting
  // reads) is recomputed in the same step and can never disagree with the
  // three boxes on screen.
  const updateFeedbackField = (student: string, field: FeedbackField, value: string) =>
    setEdits((prev) => {
      const row = prev[student] ?? blankRowEdit();
      return { ...prev, [student]: applyFeedbackFieldEdit(row, field, value) };
    });

  const gradableResults = useMemo(
    () => run.results.filter((r) => typeof r.userId === "number"),
    [run]
  );
  // Results carry Canvas user ids only when they came from Canvas (a single
  // assignment or a Live Feed row), which is exactly when posting back applies.
  const canvasGradable = gradableResults.length > 0;

  const handlePostGrades = useCallback(async (confirm = true): Promise<GradingPostOutcome | null> => {
    if (gradableResults.length === 0) return null;
    if (
      confirm &&
      !window.confirm(
        `Post ${gradableResults.length} grade(s) to Canvas? This writes to the live gradebook.`
      )
    ) {
      return null;
    }

    const payload = gradableResults.map((r) => {
      const edit = edits[r.student] ?? defaultRowEdit(r);
      return {
        userId: r.userId as number,
        grade: parseEarnedPoints(edit.total),
        comment: edit.overall,
        rubricAreas: r.rubricAreas.map((a) => {
          const ae = edit.areas[a.area] ?? { score: a.score };
          return { area: a.area, score: ae.score, comment: "" };
        }),
      };
    });

    setPosting(true);
    setPostSummary("");
    setPostStatus(() => {
      const next: Record<string, PostState> = {};
      for (const r of gradableResults) next[r.student] = { status: "posting" };
      return next;
    });

    const result = await postCanvasGradesAction(canvasUrl, payload);
    setPosting(false);

    if ("error" in result) {
      setPostSummary(result.error);
      setPostStatus(() => {
        const next: Record<string, PostState> = {};
        for (const r of gradableResults) next[r.student] = { status: "error", message: result.error };
        return next;
      });
      return { posted: 0, failed: gradableResults.length, skipped: 0 };
    }

    // B1: the shared, independently-tested decision (gradingResultsHelpers.ts's
    // fanOutGradingPostResult) - a userId in `result.skipped` is "skipped",
    // never folded into "posted" just because it is absent from `failures`.
    const fanout = fanOutGradingPostResult(gradableResults, result);
    setPostStatus(() => {
      const next: Record<string, PostState> = {};
      for (const r of gradableResults) {
        next[r.student] = fanout[r.student] ?? { status: "posted" };
      }
      return next;
    });
    // B1: state the denominator, never a bare count that cannot be told
    // apart from a partial failure - "Posted 28." used to be indistinguishable
    // from a 30-student class where 2 were silently dropped.
    setPostSummary(
      `Posted ${result.posted} of ${gradableResults.length} attempted.` +
        (result.failures.length ? ` ${result.failures.length} failed.` : "") +
        (result.skipped.length ? ` ${result.skipped.length} skipped (no grade or comment to send).` : "")
    );
    onPosted?.();
    return { posted: result.posted, failed: result.failures.length, skipped: result.skipped.length };
  }, [gradableResults, edits, canvasUrl, onPosted]);

  // Expose post-all so the Live Feed pane's "Post & Next" can drive it.
  useImperativeHandle(ref, () => ({ postAll: (confirm = true) => handlePostGrades(confirm) }), [
    handlePostGrades,
  ]);

  // Post a single student's grade, leaving the rest untouched. Same payload
  // shape as the bulk post, with a one-element array.
  const handlePostOne = async (row: GradeRow) => {
    if (typeof row.userId !== "number") return;
    const edit = edits[row.student] ?? defaultRowEdit(row);
    const payload = [
      {
        userId: row.userId,
        grade: parseEarnedPoints(edit.total),
        comment: edit.overall,
        rubricAreas: row.rubricAreas.map((a) => {
          const ae = edit.areas[a.area] ?? { score: a.score };
          return { area: a.area, score: ae.score, comment: "" };
        }),
      },
    ];

    setPostStatus((prev) => ({ ...prev, [row.student]: { status: "posting" } }));
    const res = await postCanvasGradesAction(canvasUrl, payload);
    if ("error" in res) {
      setPostStatus((prev) => ({ ...prev, [row.student]: { status: "error", message: res.error } }));
      return;
    }
    // B1: the SAME fan-out the bulk post uses above (fanOutGradingPostResult),
    // scoped to this one row - a skip is neither "posted" nor "error", and
    // must never fall through to "posted" just because it is absent from
    // `failures`.
    const fanout = fanOutGradingPostResult([row], res);
    setPostStatus((prev) => ({
      ...prev,
      [row.student]: fanout[row.student] ?? { status: "posted" },
    }));
    onPosted?.();
  };

  // Run a single submission's code on demand via the sandbox server action.
  const handleRunCode = async (row: GradeRow) => {
    setCodeRunning((prev) => ({ ...prev, [row.student]: true }));
    try {
      const res = await runSubmissionCodeAction(
        row.submittedFiles.map((f) => ({
          name: f.name,
          extension: f.extension,
          rawBase64: f.rawBase64,
          previewContent: f.previewContent,
        }))
      );
      setCodeRuns((prev) => ({ ...prev, [row.student]: res }));
      setCodeOutputStudent(row.student);
    } catch (err) {
      // Surface a failed run (e.g. an expired session) instead of a stuck spinner.
      setCodeRuns((prev) => ({
        ...prev,
        [row.student]: {
          language: "",
          files: [],
          ran: false,
          exitCode: null,
          stdout: "",
          stderr: "",
          error: err instanceof Error ? err.message : "Run failed.",
        },
      }));
      setCodeOutputStudent(row.student);
    } finally {
      setCodeRunning((prev) => ({ ...prev, [row.student]: false }));
    }
  };

  // The run to show for a row: a fresh manual run wins, else the grading-time run.
  const codeRunFor = (row: GradeRow): CodeRunResult | null =>
    codeRuns[row.student] ?? row.codeExecution ?? null;

  // Deep link to a single student's submission in SpeedGrader, when the run came
  // from a Canvas source (so we have the assignment's SpeedGrader base + userId).
  const speedGraderHref = (userId: number | undefined): string | null =>
    run.speedGraderUrl && typeof userId === "number"
      ? `${run.speedGraderUrl}&student_id=${userId}`
      : null;

  // Sort state, the derived sorted row list, and the handlers that read/write
  // them - see ./grading-results/useResultsSort.ts's own header comment for
  // why this is a pure relocation, not a behaviour change.
  const { sortedResults, sortState, handleSort, sortLabel } = useResultsSort(run);

  const handleDownloadFile = (
    name: string,
    extension: string,
    rawBase64: string,
    mimeType: string
  ) => {
    const byteChars = atob(rawBase64);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArray], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name.toLowerCase().endsWith(`.${extension.toLowerCase()}`) ? name : `${name}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csvContent = buildCsvContent(run, edits);
    if (!csvContent) return;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "grading-results.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className={styles.results} ref={sectionRef} tabIndex={-1}>
      {banner}
      <div className={styles.resultsHeader}>
        <h2>Grading Results</h2>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          {canvasGradable && (
            <Button variant="contained" size="small" onClick={() => handlePostGrades()} disabled={posting}>
              {posting ? "Posting…" : `Post ${gradableResults.length} grade(s) to Canvas`}
            </Button>
          )}
          <Button variant="outlined" size="small" onClick={handleExportCsv}>
            Export CSV
          </Button>
        </div>
      </div>

      {canvasGradable && (
        <p className={styles.fieldHint}>
          Edit grades and comments in the table, then post. Grades write to the
          assignment&apos;s gradebook column and comments are added to each submission. If the Canvas
          assignment has an attached rubric, the per-criterion scores fill the SpeedGrader rubric too
          (matched by name). Use a row&apos;s Post to Canvas button to post just that student, or Open in
          SpeedGrader to jump straight to their submission.
          {postSummary ? ` ${postSummary}` : ""}
        </p>
      )}

      {run.fullCreditChecklist && run.fullCreditChecklist.length > 0 && (
        <section className={styles.resultsChecklist}>
          <h3>What earns full credit</h3>
          <ul>
            {run.fullCreditChecklist.map((item, index) => (
              <li key={`full-credit-${index + 1}`}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {run.sampleAnswer && run.sampleAnswer.trim() && (
        <section className={styles.resultsChecklist}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)" }}>
            <h3 style={{ margin: 0 }}>Sample correct answer</h3>
            <IconButton
              size="small"
              title={copiedKey === "sample-answer" ? "Copied" : "Copy sample answer"}
              aria-label="Copy sample correct answer"
              onClick={() => onCopy("sample-answer", run.sampleAnswer ?? "")}
            >
              <CopyIcon />
            </IconButton>
          </div>
          <div style={{ whiteSpace: "pre-wrap", marginTop: "var(--space-2)" }}>{run.sampleAnswer}</div>
        </section>
      )}

      <div className={styles.matrixWrap}>
        <table className={styles.matrix}>
          <thead>
            <ResultsTableHeaderRow
              rubricAreaNames={run.rubricAreaNames}
              sortState={sortState}
              onSort={handleSort}
              sortLabel={sortLabel}
            />
          </thead>
          <tbody>
            {sortedResults.map((result) => {
              const areaMap = new Map(result.rubricAreas.map((area) => [area.area, area]));
              const edit = edits[result.student] ?? defaultRowEdit(result);
              const status = postStatus[result.student];
              const sgHref = speedGraderHref(result.userId);
              const canPostRow = canvasGradable && typeof result.userId === "number";
              const rowPosting = posting || status?.status === "posting";

              return (
                <tr key={`${result.student}-matrix`}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{result.student}</div>
                    {sgHref && (
                      <a
                        href={sgHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.fieldHint}
                        style={{ display: "inline-block", marginTop: "var(--space-1)" }}
                      >
                        Open in SpeedGrader
                      </a>
                    )}
                    {canPostRow && (
                      <div style={{ marginTop: "var(--space-1)" }}>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handlePostOne(result)}
                          disabled={rowPosting}
                        >
                          {status?.status === "posted" ? "Re-post" : "Post to Canvas"}
                        </Button>
                      </div>
                    )}
                    {status && status.status !== "idle" && (
                      <div
                        className={styles.fieldHint}
                        style={{
                          color:
                            status.status === "error"
                              ? "var(--danger)"
                              : status.status === "skipped"
                                ? "var(--warning-ink)"
                                : undefined,
                        }}
                      >
                        {status.status === "posted"
                          ? "Posted to Canvas"
                          : status.status === "posting"
                            ? "Posting…"
                            : status.status === "skipped"
                              ? "Not posted - no grade or comment to send"
                              : `Failed: ${status.message ?? ""}`}
                      </div>
                    )}
                    {(() => {
                      const cr = codeRunFor(result);
                      // neededStdin (code-runner.ts): this run failed only because
                      // this sandbox's hardcoded empty stdin starved a required
                      // input read, not because of a defect in the student's code
                      // - scored neutrally (excluded, not zeroed - see
                      // embedded-grader/index.ts). Labeling it the same red
                      // "Code: errors" as a genuine failure would mislead the
                      // instructor into thinking it dragged the score down.
                      const label = !cr
                        ? null
                        : cr.error
                          ? "Code: runner error"
                          : cr.neededStdin
                            ? "Code: no input available (not scored)"
                            : cr.ran
                              ? "Code: ran cleanly"
                              : "Code: errors";
                      return (
                        <div style={{ marginTop: "var(--space-1)" }}>
                          {label && (
                            <div
                              className={styles.fieldHint}
                              style={{
                                color:
                                  cr && !cr.error && !cr.neededStdin && !cr.ran
                                    ? "var(--danger)"
                                    : undefined,
                              }}
                            >
                              {label}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: "var(--space-1)", marginTop: "var(--space-1)" }}>
                            <Button
                              variant="outlined"
                              size="small"
                              disabled={codeRunning[result.student]}
                              onClick={() => handleRunCode(result)}
                            >
                              {codeRunning[result.student] ? "Running…" : "Run code"}
                            </Button>
                            {cr && (
                              <Button
                                variant="outlined"
                                size="small"
                                onClick={() => setCodeOutputStudent(result.student)}
                              >
                                View output
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td>
                    {result.submittedFiles.length > 0 ? (
                      <>
                        <ul className={styles.matrixFileList}>
                          {result.submittedFiles.map((file) => (
                            <li key={`${result.student}-file-name-${file.name}`} className={styles.matrixFileItem}>
                              <span className={styles.matrixFileName}>
                                {file.extension && file.extension !== "(none)" && !file.name.toLowerCase().endsWith(`.${file.extension.toLowerCase()}`)
                                  ? `${file.name}.${file.extension}`
                                  : file.name}
                              </span>
                              <div className={styles.fileIconGroup}>
                                <IconButton
                                  size="small"
                                  title={`Preview ${file.name}`}
                                  aria-label={`Preview ${file.name}`}
                                  onClick={(event) =>
                                    onOpenPreview(
                                      result.student,
                                      {
                                        student: result.student,
                                        name: file.name,
                                        extension: file.extension,
                                        content: file.previewContent || "No extracted text available for this file.",
                                        truncated: file.previewTruncated,
                                        // F3 requirement 3: a second, distinct
                                        // cut - the whole submission (this file
                                        // included) may have been trimmed again
                                        // before the model saw it, even when
                                        // this one file's own content was not.
                                        submissionTruncated: result.submissionTruncated,
                                        rawBase64: file.rawBase64,
                                        mimeType: file.mimeType,
                                      },
                                      event.currentTarget
                                    )
                                  }
                                >
                                  <EyeIcon />
                                </IconButton>
                                {file.rawBase64 && (
                                  <IconButton
                                    size="small"
                                    title={`Download ${file.name}`}
                                    aria-label={`Download ${file.name}`}
                                    onClick={() =>
                                      handleDownloadFile(
                                        file.name,
                                        file.extension,
                                        file.rawBase64!,
                                        file.mimeType ?? "application/octet-stream"
                                      )
                                    }
                                  >
                                    <DownloadIcon />
                                  </IconButton>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                        <Button
                          variant="text"
                          size="small"
                          onClick={() => setBrowseFilesFor(result)}
                          sx={{ minWidth: 0, textTransform: "none", p: "var(--space-1) var(--space-1)", mt: 0.5 }}
                        >
                          Browse all files
                        </Button>
                      </>
                    ) : (
                      filesColumnEmptyLabel(filesRetained)
                    )}
                  </td>
                  {run.rubricAreaNames.map((areaName) => {
                    const area = areaMap.get(areaName);
                    const areaEdit = area
                      ? edit.areas[areaName] ?? { score: area.score }
                      : null;
                    // JOB B (docs/rubric-criteria-breakdown-acceptance-criteria.md):
                    // a percentage beside each criterion's raw "8/10"-shaped
                    // score, computed from THAT area's own score string alone
                    // (B1 - never from a rubric's declared points, which can
                    // be rescaled or absent entirely) and shown only when it
                    // actually parses (B1 item 3 - never a fabricated NaN%
                    // for a blank or unreadable score, e.g. an empty area
                    // engine.ts:212 routinely emits before grading).
                    const areaPercent =
                      areaEdit && scorePercentValue(areaEdit.score) !== null
                        ? formatScorePercent(areaEdit.score)
                        : null;
                    return (
                      <td key={`${result.student}-${areaName}`}>
                        {area && areaEdit ? (
                          <div className={styles.rubricAreaCell}>
                            <TextField
                              size="small"
                              value={areaEdit.score}
                              onChange={(e) => updateArea(result.student, areaName, { score: e.target.value })}
                              aria-label={`${areaName} score for ${result.student}`}
                              sx={{ width: 84 }}
                              slotProps={{
                                htmlInput: {
                                  style: {
                                    padding: "var(--space-1) var(--space-2)",
                                    fontVariantNumeric: "tabular-nums",
                                  },
                                },
                              }}
                            />
                            {areaPercent && <span className={styles.rubricAreaPercent}>{areaPercent}</span>}
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                    );
                  })}
                  <td>
                    <TextField
                      size="small"
                      value={edit.total}
                      onChange={(e) => updateEdit(result.student, { total: e.target.value })}
                      aria-label={`Grade for ${result.student}`}
                      sx={{ width: 92 }}
                      slotProps={{
                        htmlInput: {
                          style: {
                            padding: "var(--space-1) var(--space-2)",
                            fontVariantNumeric: "tabular-nums",
                          },
                        },
                      }}
                    />
                  </td>
                  <td>
                    <RowFeedbackBoxes
                      student={result.student}
                      edit={edit}
                      copiedKey={copiedKey}
                      onCopy={onCopy}
                      onChangeField={(field, value) => updateFeedbackField(result.student, field, value)}
                      onExpand={(field) => setExpandedBox({ student: result.student, field })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {expandedBox && (
        <FeedbackExpandModal
          student={expandedBox.student}
          field={expandedBox.field}
          edit={edits[expandedBox.student] ?? blankRowEdit()}
          onChange={(field, value) => updateFeedbackField(expandedBox.student, field, value)}
          onClose={() => setExpandedBox(null)}
        />
      )}
      {codeOutputStudent && (() => {
        const row = run.results.find((r) => r.student === codeOutputStudent);
        const cr = codeRuns[codeOutputStudent] ?? row?.codeExecution ?? null;
        return (
          <ModalShell
            label={`Code output for ${codeOutputStudent}`}
            onDismiss={() => setCodeOutputStudent(null)}
          >
            <div className={styles.previewHeader}>
              <div>
                <p className={styles.previewMeta}>Student: {codeOutputStudent}</p>
                <h3>Code execution{cr && !cr.error ? ` (${cr.language})` : ""}</h3>
              </div>
              <button
                type="button"
                className={styles.previewCloseButton}
                onClick={() => setCodeOutputStudent(null)}
              >
                Close
              </button>
            </div>
            {!cr ? (
              <p className={styles.previewNotice}>No code was run for this submission.</p>
            ) : cr.error ? (
              <p className={styles.previewNotice}>The code runner could not execute this submission: {cr.error}</p>
            ) : (
              <>
                {/* Same neutral case as the row badge above (see its comment):
                    a run that failed ONLY because this sandbox feeds empty
                    stdin is excluded from scoring, not zeroed, so this modal
                    must not report it as a plain "no" - that reads as the
                    student's code being broken when it is not. Wording is
                    reused verbatim from the badge rather than re-invented, so
                    one vocabulary describes this state everywhere. */}
                <p className={styles.previewMeta}>
                  Ran without errors:{" "}
                  {cr.neededStdin ? "no input available (not scored)" : cr.ran ? "yes" : "no"}
                </p>
                {cr.compileOutput && cr.compileOutput.trim() && (
                  <>
                    <p className={styles.previewMeta}>Compiler output</p>
                    <pre className={styles.previewContent}>{cr.compileOutput}</pre>
                  </>
                )}
                <p className={styles.previewMeta}>Output (stdout)</p>
                <pre className={styles.previewContent}>{cr.stdout || "(none)"}</pre>
                {cr.stderr && cr.stderr.trim() && (
                  <>
                    <p className={styles.previewMeta}>Errors (stderr)</p>
                    <pre className={styles.previewContent}>{cr.stderr}</pre>
                  </>
                )}
              </>
            )}
          </ModalShell>
        );
      })()}
      {browseFilesFor && (
        <SubmittedFilesPanel
          student={browseFilesFor.student}
          files={browseFilesFor.submittedFiles}
          submissionTruncated={browseFilesFor.submissionTruncated}
          onClose={() => setBrowseFilesFor(null)}
        />
      )}
    </section>
  );
});

export default GradingResults;
