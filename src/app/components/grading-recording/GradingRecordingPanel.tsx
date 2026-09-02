"use client";

// Manual > Recording > "Grading (via recording)" - the assembly panel for
// grading-via-recording (docs/grading-via-recording-acceptance-criteria.md,
// the owner's own words in that file's header). Ties together pieces built
// across several waves: capture (useDiscussionCapture, reused whole - R4),
// extraction (extractGradingSubmissionsAction, grading-submission-merge.ts),
// the table (useGradingRows/GradingTable, a sibling file set built and left
// unwired for this task to reach), roster matching (grading-roster-match.ts),
// and grading itself (gradeCapturedSubmissionsAction - a sibling's action,
// coded against the exact signature this task's brief pins; see the import
// below for where it is expected to live).
//
// R0-1/R0-2: this panel never writes a grade anywhere and never persists a
// row into grading_drafts - GradingRow (grading-row.ts) has no field that
// could carry a Canvas identity, so there is nothing here TO post even by
// accident, structurally, not by convention.
//
// Item 5: the rubric is required before GRADING, not before CAPTURING - an
// instructor can start a capture, walk through several submissions, and
// paste the rubric only once ready to grade. checkGradingReadiness
// (grading-dispatch.ts) is the one place that rule lives; handleGradeAll
// below refuses to call gradeCapturedSubmissionsAction at all when it says
// not to, and always shows why.
//
// Launch handoff (items 2/3, mirroring the Knowledge base's existing
// "Start recording" -> Discussion replies handoff exactly): this panel stays
// mounted for the whole RecordingTab lifetime (RecordingTab.tsx renders it
// inside the same always-mounted, display:none-toggled stack every other
// inner view uses), so - exactly like RecordingTab's own recView switch - it
// registers ONE live RECORDING_LAUNCH_EVENT listener on mount (never a
// mount-only read of a one-shot value; see recording-launch.ts's own header
// for why that would only ever observe the first launch of a session) and
// reacts to every dispatch whose `view` is "grading": `openRubric: true`
// opens the rubric modal, and a `knowledgeContext` present on THAT SPECIFIC
// dispatch is drained from the one-shot slot - never opportunistically, which
// would risk stealing a context meant for an unrelated, not-yet-started
// drafting flow elsewhere in the app (see recording-launch.ts's own
// navigateToRecordingTool doc comment for the exact failure mode this
// avoids).
//
// R3a/roster matching: item 4's own seam order is capture -> extraction ->
// mergeExtractedSubmissions -> rows via setAllRows -> roster match via
// applyRosterMatch -> grading via the sibling's action -> applyGradingResult
// - followed literally below. grading-capture-sync.ts's
// syncGradingRowsFromExtracted deliberately does NOT touch the roster verdict
// (see its own header) - this file calls matchNameAgainstRoster and
// applyRosterMatch itself, once per row, right after every setAllRows.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import styles from "../../page.module.css";
import { useLlmProvider } from "@/lib/llm-provider";
import { useDiscussionCapture } from "../recording/useDiscussionCapture";
import { EXTRACT_BATCH_WIRE_BUDGET } from "../recording/discussion-capture";
import {
  RECORDING_LAUNCH_EVENT,
  parseRecordingLaunch,
  takeRecordingKnowledgeContext,
  type RecordingKnowledgeContext,
} from "@/lib/recording-launch";
import { returnToKnowledge } from "@/lib/knowledge-return";
import { returnTargetPageId } from "./grading-context-display";
// AC3 (docs/knowledge-recording-handoff-acceptance-criteria.md section 4):
// shared with DiscussionRepliesPanel.tsx - supersedes this panel's own former
// static formatContextPagesList line with an interactive, removable list.
// That formatter was deleted rather than left exported once this replaced its
// only caller; see grading-context-display.ts's header for why a tested
// export with no consumer is worse than no export at all.
import CarriedKnowledgePages from "../recording/CarriedKnowledgePages";
// AC3/4b (docs/knowledge-recording-handoff-acceptance-criteria.md section 4):
// "add" - shared with DiscussionRepliesPanel.tsx. Rendered unconditionally,
// unlike the label/CarriedKnowledgePages block below - an instructor
// carrying nothing yet (no Knowledge-base launch at all) is this feature's
// primary case, not an edge case of an already-launched run.
import AddKnowledgePages from "../recording/AddKnowledgePages";
import { extractGradingSubmissionsAction } from "@/app/actions/grading-submission-extract";
// The sibling GRADING action - coded against the exact signature this task's
// brief pinned, before this file's own path (src/app/actions/grading-
// submission-grade.ts, following extractGradingSubmissionsAction's own
// naming) existed. It landed, with that exact signature, while this panel
// was being built - see this task's report for the confirmation.
import { gradeCapturedSubmissionsAction } from "@/app/actions/grading-submission-grade";
import { GRADING_EXTRACT_BATCH_SIZE } from "./grading-extraction-prompt";
import { mergeExtractedSubmissions, type ExtractedSubmission } from "./grading-submission-merge";
import { matchNameAgainstRoster } from "./grading-roster-match";
import { useGradingRows } from "./useGradingRows";
import GradingTable from "./GradingTable";
import { RubricInputModal } from "./RubricInputModal";
import { useGradingCourses } from "./useGradingCourses";
import { parseRosterNames } from "./grading-course-roster";
import { syncGradingRowsFromExtracted } from "./grading-capture-sync";
import { checkGradingReadiness } from "./grading-dispatch";
import { describeExtractionOutcome, isDangerNotice, type GradingExtractionOutcome } from "./grading-extraction-outcome";
import { classifyGradingResult } from "./grading-rows";
// docs/DEV_LOOP.md's "every feature needs a downloadable log" rule - this
// surface is the newest and most in need of it (it reads names off a screen,
// merges readings, skips unnamed submissions, drops frames, and grades; every
// one of those is a silent-failure candidate). Collection (the refs/effects
// below) lives here, mirroring useDiscussionReplies.ts's own split;
// assembly/formatting is entirely grading-recording-log.ts, per that module's
// own header.
import {
  makeGradingRecordingLogBatch,
  buildGradingRecordingRunLog,
  summarizeGradingRecordingRunLog,
  gradingRecordingLogSummaryLine,
  formatGradingRecordingLogCsv,
  formatGradingRecordingLogJson,
  gradingRecordingLogFileName,
  type GradingRecordingLogBatch,
  type GradingRecordingLogEncodeNotice,
  type GradingRecordingLogGradingRun,
} from "./grading-recording-log";
import { triggerFileDownload } from "../course-planning/utils";

// STORAGE KEY CANARY (grading-rows.test.ts's own "grading-recording persisted
// key canary" - self-contained, since recording-split.structure.test.ts's
// scan is non-recursive and cannot see this directory): a bound `const`, not
// a bare literal at the call site, mirroring useGradingRows.ts's own
// STORAGE_KEY_FILTER/STORAGE_KEY_SORT idiom - the canary's isWired() helper
// covers both the direct-literal shape and this indirect-const shape.
const STORAGE_KEY_COURSE = "ta-rec-grade-course";

interface Notice extends GradingExtractionOutcome {
  id: string;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function GradingRecordingPanel({ active }: { active: boolean }) {
  const [provider] = useLlmProvider();
  // BLOCKER 4: `droppedFrames` and `frameEncodeNotice` are now destructured
  // and surfaced below - a frame dropped to backpressure used to take its
  // submission with it silently: the student vanished from the table with
  // no notice at all, which is exactly R1a's "an unreadable or incomplete
  // run must never look like a complete one".
  const { capturing, elapsedSec, pendingFrames, droppedFrames, frameEncodeNotice, stalled, previewRef, start, stop, takeFrameBatch } =
    useDiscussionCapture();

  // docs/DEV_LOOP.md's downloadable-log rule: collection. State, not refs -
  // eslint-plugin-react-hooks forbids reading a ref's `.current` during
  // render (Cannot access refs during render), and the summary line/download
  // handler below both need a render-time read - mirrors
  // useDiscussionReplies.ts's own identical choice (logStartedAt/logBatches/
  // etc. are all useState there too, not refs - see that file's own
  // logStartedAt/setLogBatches for the shipped precedent this follows).
  // `logStartedAt`/`logEndedAt` are set directly in handleStartStop below
  // (an event handler, not an effect) for the same reason
  // useDiscussionReplies.ts's own start()/stop() set theirs directly rather
  // than watching a `capturing` transition.
  const [logStartedAt, setLogStartedAt] = useState("");
  const [logEndedAt, setLogEndedAt] = useState("");
  const [logBatches, setLogBatches] = useState<GradingRecordingLogBatch[]>([]);
  const [logEncodeNotices, setLogEncodeNotices] = useState<GradingRecordingLogEncodeNotice[]>([]);
  const [logGradingRuns, setLogGradingRuns] = useState<GradingRecordingLogGradingRun[]>([]);
  // useDiscussionCapture.ts's frameEncodeNotice is live, MOST-RECENT-only
  // state (reset to null on every start()) - collected here as its own
  // append-only event stream so a session that hit it more than once still
  // shows every occurrence in the downloaded log, not just the last. The
  // comparison ref is read/written only inside this effect, never during
  // render, so it does not trip the same rule the state above exists for.
  const prevEncodeNoticeRef = useRef<string | null>(null);
  useEffect(() => {
    if (frameEncodeNotice && frameEncodeNotice !== prevEncodeNoticeRef.current) {
      setLogEncodeNotices((prev) => [...prev, { at: new Date().toISOString(), text: frameEncodeNotice }]);
    }
    prevEncodeNoticeRef.current = frameEncodeNotice;
  }, [frameEncodeNotice]);

  const { courses, coursesLoading, coursesError } = useGradingCourses(active);

  const [courseId, setCourseIdState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(STORAGE_KEY_COURSE) ?? "";
  });
  const setCourseId = useCallback((next: string) => {
    setCourseIdState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY_COURSE, next);
    } catch {
      // Best-effort, mirrors useGradingRows.ts's own low-stakes-control
      // handling for its filter/sort keys - losing this persistence does not
      // affect the in-memory session.
    }
  }, []);

  const selectedCourse = (courses ?? []).find((c) => c.id === courseId) ?? null;
  const selectedRosterText = selectedCourse?.roster ?? null;

  const gradingRows = useGradingRows();
  const rawRowsRef = useRef(gradingRows.rawRows);
  useEffect(() => {
    rawRowsRef.current = gradingRows.rawRows;
  }, [gradingRows.rawRows]);

  // R3a: re-match every current row whenever the SELECTED COURSE'S ROSTER
  // TEXT (a primitive string/null - not the `courses` array or `courseId`
  // alone, so this also re-fires once the course list finishes loading and
  // the real roster text becomes available) changes - covers an instructor
  // picking a course (or a different one) after rows already exist, not just
  // rows minted during a later extraction (which get their own immediate
  // pass in runExtraction below). Guarded per-row so a course with an
  // unchanged roster produces no redundant applyRosterMatch calls once
  // everything already agrees.
  useEffect(() => {
    const rosterNames = parseRosterNames(selectedRosterText);
    for (const row of rawRowsRef.current) {
      const match = matchNameAgainstRoster(row.studentName, rosterNames);
      if (match.nameMatch !== row.nameMatch || match.rosterCandidates.join("") !== row.rosterCandidates.join("")) {
        gradingRows.applyRosterMatch(row.id, match);
      }
    }
    // gradingRows.applyRosterMatch is useCallback-stable (useGradingRows.ts) -
    // intentionally NOT depending on gradingRows.rawRows itself (read via the
    // ref above instead), or this would re-run on every row mutation,
    // including the ones IT just made.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRosterText]);

  const [rubricText, setRubricText] = useState("");
  const [rubricModalOpen, setRubricModalOpen] = useState(false);
  const rubricButtonRef = useRef<HTMLButtonElement>(null);

  const [knowledgeContext, setKnowledgeContext] = useState<RecordingKnowledgeContext | null>(null);

  const [notices, setNotices] = useState<Notice[]>([]);
  const pushNotices = useCallback((outcomes: GradingExtractionOutcome[]) => {
    if (outcomes.length === 0) return;
    setNotices((prev) => [...prev, ...outcomes.map((o) => ({ ...o, id: crypto.randomUUID() }))]);
  }, []);
  const dismissNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const extractedRef = useRef<ExtractedSubmission[]>([]);
  const [extracting, setExtracting] = useState(false);

  // FIX 1 (silent-fold visibility): mergeExtractedSubmissions already reports
  // addedCount/mergedCount per call - this is the running SESSION TOTAL of
  // every reading it has ever classified (added-as-new plus folded-into-
  // existing), summed across every extraction batch so far. Compared against
  // gradingRows.totalCount (the live, currently-distinct row count - always
  // equal to the most recent merge.submissions.length, since
  // syncGradingRowsFromExtracted mints exactly one row per merged
  // submission), this is what lets an instructor who recorded twelve
  // students and sees eleven rows notice the gap: folding is normal (that is
  // the whole point of merging overlapping frames), so the count alone is
  // ordinary information, not a danger notice - but an unexpectedly LOW
  // submission count relative to what was actually recorded is the signal a
  // silent over-merge produces, and this makes that number impossible to
  // miss.
  const [totalReadingsCount, setTotalReadingsCount] = useState(0);

  // Launch handoff (items 2/3) - see this file's own header for the full
  // reasoning on the live-listener shape and the one-shot knowledgeContext
  // drain guard.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = e instanceof CustomEvent ? parseRecordingLaunch(e.detail) : null;
      if (!detail || detail.view !== "grading") return;
      if (detail.openRubric) setRubricModalOpen(true);
      if (detail.knowledgeContext) {
        const taken = takeRecordingKnowledgeContext();
        if (taken) setKnowledgeContext(taken);
      }
    };
    window.addEventListener(RECORDING_LAUNCH_EVENT, handler);
    return () => window.removeEventListener(RECORDING_LAUNCH_EVENT, handler);
  }, []);

  const runExtraction = useCallback(async () => {
    const frames = takeFrameBatch(GRADING_EXTRACT_BATCH_SIZE, EXTRACT_BATCH_WIRE_BUDGET);
    if (frames.length === 0) return;
    // AGENTS.md's setState-in-effect idiom: this function is invoked
    // (`void runExtraction()`) from the drain effect below - a setState
    // reached SYNCHRONOUSLY from an effect (even indirectly, through a
    // called function) is what react-hooks/set-state-in-effect rejects. The
    // microtask hop below is a real gate, not a no-op - it is what makes
    // every setState from here on happen strictly AFTER the effect body has
    // returned, exactly like AiChatFab.tsx's own tone-status effect.
    await Promise.resolve();
    setExtracting(true);
    try {
      const result = await extractGradingSubmissionsAction(
        frames.map((f) => ({ base64: f.base64 })),
        provider
      );
      if ("error" in result) {
        setLogBatches((prev) => [
          ...prev,
          makeGradingRecordingLogBatch({ at: new Date().toISOString(), framesInBatch: frames.length, error: result.error }),
        ]);
        pushNotices(describeExtractionOutcome(result, 0));
        return;
      }
      const merge = mergeExtractedSubmissions(extractedRef.current, result.submissions);
      extractedRef.current = merge.submissions;
      setLogBatches((prev) => [
        ...prev,
        makeGradingRecordingLogBatch({
          at: new Date().toISOString(),
          framesInBatch: frames.length,
          submissionsExtracted: result.submissions.length,
          added: merge.addedCount,
          merged: merge.mergedCount,
          skippedUnnamed: result.skippedUnnamed,
          confirmedEmpty: result.confirmedEmpty,
        }),
      ]);
      pushNotices(describeExtractionOutcome(result, merge.addedCount));
      setTotalReadingsCount((prev) => prev + merge.addedCount + merge.mergedCount);

      const nextRows = syncGradingRowsFromExtracted(merge.submissions, rawRowsRef.current);
      gradingRows.setAllRows(nextRows);

      // R3a: roster-match every row in THIS synced table right away, so a
      // newly-minted row never sits at the neutral "no-roster" default for
      // longer than one tick when a real roster is already selected.
      const rosterNames = parseRosterNames(selectedRosterText);
      for (const row of nextRows) {
        const match = matchNameAgainstRoster(row.studentName, rosterNames);
        gradingRows.applyRosterMatch(row.id, match);
      }
    } finally {
      setExtracting(false);
    }
  }, [takeFrameBatch, provider, pushNotices, gradingRows, selectedRosterText]);

  // Drains the capture queue as frames arrive, and keeps draining after Stop
  // - mirroring useDiscussionCapture's own documented contract ("the
  // extraction loop outlives capturing===false and drains it to empty").
  //
  // AGENTS.md's setState-in-effect idiom, applied the same way AiChatFab.tsx's
  // own tone-status effect does: an inline async IIFE with a `cancelled`
  // flag, invoked from the effect body rather than calling a setState-
  // touching function directly - react-hooks/set-state-in-effect traces a
  // same-file useCallback's body and flags a setState reachable from it, so
  // `runExtraction` (which does set state, after its own await gate) is
  // called from inside this wrapper instead of directly from the effect.
  useEffect(() => {
    if (extracting) return;
    if (pendingFrames === 0) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await runExtraction();
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingFrames, extracting, runExtraction]);

  const handleStartStop = useCallback(() => {
    if (capturing) {
      setLogEndedAt(new Date().toISOString());
      stop();
      return;
    }
    // `startedAt` is the first Start this panel mount, never overwritten by
    // a later one - mirrors useDiscussionReplies.ts's own start()
    // (functional updater keeps whatever is already set).
    setLogStartedAt((prev) => prev || new Date().toISOString());
    setLogEndedAt("");
    void start({ saveVideo: false });
  }, [capturing, start, stop]);

  const [gradeError, setGradeError] = useState<string | null>(null);
  const [gradingBusy, setGradingBusy] = useState(false);

  const handleGradeAll = useCallback(async () => {
    const readiness = checkGradingReadiness(rubricText, gradingRows.totalCount);
    if (!readiness.ok) {
      setGradeError(readiness.reason);
      // docs/DEV_LOOP.md's downloadable-log rule: a refused attempt is a real
      // event ("why didn't grading run") - logged here rather than silently
      // leaving no trace of the click at all.
      setLogGradingRuns((prev) => [
        ...prev,
        {
          at: new Date().toISOString(),
          rowCount: gradingRows.totalCount,
          blocked: true,
          reason: readiness.reason ?? "",
          error: "",
          graded: 0,
          failed: 0,
        },
      ]);
      return;
    }
    setGradeError(null);
    setGradingBusy(true);
    try {
      const submissions = gradingRows.rawRows.map((r) => ({
        id: r.id,
        studentName: r.studentName,
        submissionText: r.submissionText,
      }));
      const result = await gradeCapturedSubmissionsAction(
        submissions,
        rubricText.trim(),
        knowledgeContext?.text,
        provider
      );
      if ("error" in result) {
        setGradeError(result.error);
        setLogGradingRuns((prev) => [
          ...prev,
          {
            at: new Date().toISOString(),
            rowCount: submissions.length,
            blocked: false,
            reason: "",
            error: result.error,
            graded: 0,
            failed: 0,
          },
        ]);
        return;
      }
      // BLOCKER 3: classifyGradingResult (grading-rows.ts) is the one place
      // that recovers a per-submission failure from gradeCapturedSubmissionsAction's
      // result (which carries no separate state/error field - see that
      // function's own header) and turns it into a real "failed" row with
      // its verbatim message in `error`, never a feedback field. Applying
      // every result as "ready" unconditionally (the previous code here) is
      // exactly what made GradingRow's "failed" state and `error` field
      // dead code.
      let graded = 0;
      let failed = 0;
      for (const r of result.results) {
        const classified = classifyGradingResult(r);
        if (classified.state === "failed") failed += 1;
        else graded += 1;
        gradingRows.applyGradingResult(r.id, classified);
      }
      setLogGradingRuns((prev) => [
        ...prev,
        { at: new Date().toISOString(), rowCount: submissions.length, blocked: false, reason: "", error: "", graded, failed },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not grade these submissions.";
      setGradeError(message);
      setLogGradingRuns((prev) => [
        ...prev,
        {
          at: new Date().toISOString(),
          rowCount: gradingRows.totalCount,
          blocked: false,
          reason: "",
          error: message,
          graded: 0,
          failed: 0,
        },
      ]);
    } finally {
      setGradingBusy(false);
    }
  }, [rubricText, gradingRows, knowledgeContext, provider]);

  // docs/DEV_LOOP.md's downloadable-log rule: assembled fresh on every
  // render (cheap - a handful of array spreads over state that only grows on
  // a real event) so the on-screen summary line and a download click always
  // agree, and so a download can never be built from a stale prior render's
  // course/rubric/knowledge-context settings.
  const currentGradingLog = buildGradingRecordingRunLog(
    {
      startedAt: logStartedAt,
      endedAt: logEndedAt,
      courseName: selectedCourse?.name ?? "",
      rubricPresent: rubricText.trim() !== "",
      knowledgeContextPresent: knowledgeContext !== null,
      droppedFrames,
      batches: logBatches,
      encodeNotices: logEncodeNotices,
      gradingRuns: logGradingRuns,
    },
    gradingRows.rawRows
  );
  const handleDownloadLog = (format: "csv" | "json") => {
    const now = new Date().toISOString();
    const text =
      format === "csv"
        ? formatGradingRecordingLogCsv(currentGradingLog)
        : formatGradingRecordingLogJson(currentGradingLog, { exportedAt: now });
    const filename = gradingRecordingLogFileName(currentGradingLog.courseName, format, now);
    const mimeType = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
    triggerFileDownload(new Blob([text], { type: mimeType }), filename);
  };

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>Grading and feedback (from a recording)</h2>
        <p className={styles.adaptPanelSubtitle}>
          Screen-record yourself walking through student submissions - the app reads them off the screen and scores
          them against a rubric you provide. Nothing here is bound to a student record or posted to an LMS; it is a
          working surface to review, edit, and copy from.
        </p>
      </div>

      {/* docs/DEV_LOOP.md: "a downloadable log ... displayed in a prominent
          location". Placed immediately under the header, before every other
          control - never gated on `gradingRows.totalCount > 0` or on a
          capture/grade having run, since a failed or empty run (a capture
          that never found a readable name, a "Grade submissions" click
          refused for a missing rubric) is exactly when this needs to be
          reachable without hunting - mirrors
          recording/DiscussionRepliesPanel.tsx's own identical placement and
          reasoning. */}
      <div className={styles.fieldHint} style={{ margin: "0 0 var(--space-1)", display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
        <span>{gradingRecordingLogSummaryLine(summarizeGradingRecordingRunLog(currentGradingLog))}</span>
        <Button size="small" variant="text" style={{ minWidth: 0 }} onClick={() => handleDownloadLog("csv")}>
          Download run log (CSV)
        </Button>
        <Button size="small" variant="text" style={{ minWidth: 0 }} onClick={() => handleDownloadLog("json")}>
          Download run log (JSON)
        </Button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", alignItems: "flex-start" }}>
        <TextField
          select
          label="Course (for roster matching)"
          size="small"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          disabled={coursesLoading}
          sx={{ minWidth: 240 }}
        >
          <MenuItem value="">No course selected</MenuItem>
          {(courses ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <div>
          <Button variant="outlined" size="small" ref={rubricButtonRef} onClick={() => setRubricModalOpen(true)}>
            {rubricText ? "Edit rubric" : "Add rubric"}
          </Button>
          <p className={styles.fieldHint} style={{ margin: "var(--space-1) 0 0" }}>
            {rubricText
              ? `Rubric set (${rubricText.trim().length} characters).`
              : "No rubric yet - you can capture submissions first and add one when you are ready to grade."}
          </p>
        </div>
      </div>
      {coursesError && (
        <p className={styles.fieldHint}>Could not load your courses - roster matching is unavailable, capture still works.</p>
      )}
      {courseId && !selectedRosterText && (
        <p className={styles.fieldHint}>
          This course has no roster on file - names will show as &quot;No roster to check&quot; until one is added to its course tile.
        </p>
      )}
      {/* AC2/AC3/AC4 of docs/knowledge-recording-handoff-acceptance-criteria.md:
          extends this existing notice (already the reference implementation
          the sibling "discussions" destination is matched against) with the
          carried pages, individually removable, and a way back to where they
          were selected - without touching the label sentence or its
          placement. `pages` is ALREADY filtered to only what the budget
          included (AC1 - KnowledgeTab.tsx's includedContextPages, before this
          ever launches); CarriedKnowledgePages.tsx re-derives inclusion fresh
          on every removal (never assumes the original filter still holds -
          see that file's own header). Renders nothing when knowledgeContext
          is null (AC2's "carrying nothing renders nothing") - unchanged. */}
      {knowledgeContext && (
        <div className={styles.field} style={{ gap: "var(--space-1)" }}>
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {`Grading with Knowledge Base context: ${knowledgeContext.label ?? "selected pages"}.`}{" "}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => returnToKnowledge(returnTargetPageId(knowledgeContext.pages))}
            >
              Back to Knowledge
            </button>
          </p>
          <CarriedKnowledgePages context={knowledgeContext} onChange={setKnowledgeContext} />
        </div>
      )}
      {/* AC3/4b: rendered OUTSIDE the `knowledgeContext &&` gate above -
          unlike the label/CarriedKnowledgePages block, this must still offer
          something when nothing is carried yet at all. */}
      <AddKnowledgePages context={knowledgeContext} onChange={setKnowledgeContext} />

      <div className={styles.ghActions}>
        <Button variant="contained" size="small" onClick={handleStartStop}>
          {capturing ? "Stop capture" : "Start capture"}
        </Button>
        <Button variant="outlined" size="small" disabled={gradingBusy} onClick={() => void handleGradeAll()}>
          {gradingBusy ? "Grading…" : "Grade submissions"}
        </Button>
      </div>
      <p className={styles.fieldHint}>You can also stop from your browser&apos;s sharing bar.</p>

      <div aria-hidden="true" style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-2)" }}>
        {/* Rendered unconditionally, never `{capturing && <video ...>}` - same
            reasoning as DiscussionRepliesPanel.tsx/LegibilityProbeModal.tsx's
            own identical comment: useDiscussionCapture's start() assigns
            previewRef.current.srcObject synchronously, BEFORE it sets
            capturing true, so a conditionally-mounted element would still be
            null at that exact moment. */}
        <video
          ref={previewRef}
          style={{
            width: 240,
            aspectRatio: "16 / 9",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--card-border)",
            // No token resolves to black - nothing renders as text over this
            // surface, it is only the camera's "no frame yet" backdrop, and
            // it deliberately mirrors DiscussionRepliesPanel.module.css's and
            // LegibilityProbeModal.module.css's identical .previewVideo
            // idiom rather than diverging from it. See this file's
            // aesthetics-pass report for the same note.
            background: "#000",
            objectFit: "cover",
            display: capturing ? undefined : "none",
          }}
          autoPlay
          muted
          playsInline
        />
        {capturing && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>
            <span>{fmt(elapsedSec)}</span>
            <span>
              {gradingRows.totalCount === 0
                ? "Capturing - 0 submissions so far."
                : `${gradingRows.totalCount} submission${gradingRows.totalCount === 1 ? "" : "s"} found`}
            </span>
            {extracting && <span>Reading the screen…</span>}
            {pendingFrames > 0 && <span>Catching up - scroll a little slower.</span>}
          </div>
        )}
      </div>
      {stalled && (
        <p className={styles.error}>
          Nothing new has been read off the screen for 30 seconds. Keep this app&apos;s tab visible in a second window while you scroll.
        </p>
      )}
      {/* BLOCKER 4 / R1a: surfaced with the SAME danger urgency as the
          skipped-unnamed notice below (isDangerNotice's own rule) - a
          dropped frame silently takes its submission with it, which is
          exactly the "unreadable or incomplete run must never look like a
          complete one" failure mode this whole feature is gated on
          measuring. Wording for the dropped-frame sentence is reused
          verbatim from the shipped precedent - recording/
          DiscussionRepliesPanel.tsx's own AC63 drop notice - rather than
          inventing a second string for the same fact. Shown for the whole
          session (not gated on capturing/stopped) - the loss is permanent
          the moment it happens. */}
      {droppedFrames > 0 && (
        <p className={styles.error} role="alert">
          Some of the screen scrolled past faster than it could be read. Scroll back over that section to catch it.
        </p>
      )}
      {/* FIX 1: ordinary information, not danger (styles.fieldHint, no
          role="alert") - a fold is the expected, normal outcome of reading
          overlapping frames. The point is that the NUMBER stays visible for
          the whole session (not gated on `capturing`, same as the dropped-
          frames notice above) so an unexpectedly low submission count -
          fewer rows than students actually recorded - stands out on its own,
          without this line itself trying to sound alarmed. */}
      {totalReadingsCount > 0 && (
        <p className={styles.fieldHint}>
          {totalReadingsCount} reading{totalReadingsCount === 1 ? "" : "s"} merged into {gradingRows.totalCount}{" "}
          submission{gradingRows.totalCount === 1 ? "" : "s"} so far.
        </p>
      )}
      {frameEncodeNotice && (
        <p className={styles.error} role="alert">
          {frameEncodeNotice}
        </p>
      )}

      {notices.length > 0 && (
        <div className={styles.field}>
          {notices.map((n) => (
            <p
              key={n.id}
              className={isDangerNotice(n.kind) ? styles.error : styles.fieldHint}
              role={isDangerNotice(n.kind) ? "alert" : "status"}
            >
              {n.text}{" "}
              <button type="button" className={styles.linkButton} onClick={() => dismissNotice(n.id)}>
                Dismiss
              </button>
            </p>
          ))}
        </div>
      )}

      {gradeError && (
        <p className={styles.error} role="alert">
          {gradeError}
        </p>
      )}

      <GradingTable
        rows={gradingRows.rows}
        totalCount={gradingRows.totalCount}
        filterText={gradingRows.filterText}
        setFilterText={gradingRows.setFilterText}
        sort={gradingRows.sort}
        setSort={gradingRows.setSort}
        onEditField={gradingRows.editField}
        onRemoveRow={gradingRows.removeRow}
        onClearTable={gradingRows.clearTable}
      />

      {rubricModalOpen && (
        <RubricInputModal
          onSubmit={(text) => {
            setRubricText(text);
            setRubricModalOpen(false);
          }}
          onClose={() => setRubricModalOpen(false)}
          restoreFocusRef={rubricButtonRef}
        />
      )}
    </div>
  );
}
