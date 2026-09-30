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
// advanceGradingCapture deliberately does NOT touch the roster verdict
// (see its own header) - this file calls matchNameAgainstRoster and
// applyRosterMatch itself, once per row, right after every setAllRows.
//
// A9 (docs/REGRESSION.md entry 428): the accumulator is id-correlated to the
// row table (grading-capture-sync.ts's TrackedSubmission), not index-
// correlated - a deleted row can no longer be silently re-minted or
// misattribute a later row's score/feedback to the wrong submission. Wave 2
// moved the accumulator, its Remove/Clear-table wiring, and its per-course
// persisted tombstone set into useGradingCaptureTracking.ts /
// grading-capture-tombstones.ts - see those files' own headers for the
// seeding, ordering and quota-fallback rules a deletion surviving a reload
// depends on.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import { useLlmProvider } from "@/lib/llm-provider";
import { useDiscussionCapture } from "../recording/useDiscussionCapture";
import { accumulateDroppedFrames } from "../recording/discussion-capture";
// docs/recording-controls-ux-acceptance-criteria.md CC1: the one legal
// spelling of a state-dependent primary.
import { variantFor } from "../ui/buttonVariant";
// CC8: the run-log row, re-homed - this panel's own copy is deleted below.
import RunLogRow from "../recording/RunLogRow";
// CC12: the status column moves out of aria-hidden; a throttled, visually
// hidden live region replaces it for assistive tech, using the same
// parameterised sentence/hook DiscussionRepliesPanel.tsx's own file-local
// versions were extracted from.
import { composeCaptureLiveSentence, useThrottledLiveSentence } from "../recording/captureLiveRegion";
import {
  RECORDING_LAUNCH_EVENT,
  parseRecordingLaunch,
  takeRecordingKnowledgeContext,
  type RecordingKnowledgeContext,
} from "@/lib/recording-launch";
// AC3/AC3/4b (docs/knowledge-recording-handoff-acceptance-criteria.md section
// 4): the carried-Knowledge-Base-pages notice and the always-mounted "add a
// page" control - moved into this NEW leaf once this file was pressing on
// file-size-ceiling.structure.test.ts's 1000-line ceiling (wave 3a-ii,
// docs/a39-waves.md section 8.1). See that leaf's own header for the full
// reasoning and the sibling precedent (wave 3a-i's SnapshotGradingPanel.tsx
// extraction).
import GradingRecordingContextPanel from "./GradingRecordingContextPanel";
// The sibling GRADING action - coded against the exact signature this task's
// brief pinned, before this file's own path (src/app/actions/grading-
// submission-grade.ts, following extractGradingSubmissionsAction's own
// naming) existed. It landed, with that exact signature, while this panel
// was being built - see this task's report for the confirmation.
import { gradeCapturedSubmissionsAction } from "@/app/actions/grading-submission-grade";
import { matchNameAgainstRoster } from "./grading-roster-match";
import { useGradingRows } from "./useGradingRows";
import GradingTable from "./GradingTable";
import { RubricInputModal } from "./RubricInputModal";
import { loadRubricMemory, saveRubricMemory, describeRubricOrigin } from "@/lib/grade/rubric-memory";
import { useGradingCourses } from "./useGradingCourses";
import { parseRosterNames } from "./grading-course-roster";
// docs/a16-wave1-scope.md sections 0/6/7: the Capture fieldset (the course
// select with its loading/error/no-roster hints, plus the D22b/D23e
// assessment Autocomplete with its own hint) moved into this NEW leaf once
// this file was pressing on file-size-ceiling.structure.test.ts's 1000-line
// ceiling. No hook moved with it - both useStates, both useCallback setters,
// useGradingCourses, assessmentOptions and assessmentId all stay right here;
// only the already-derived values and setters cross the boundary. See
// GradingCaptureSettings.tsx's own header for the full reasoning and the
// sibling precedent (DiscussionCaptureSettings.tsx/ModuleDeckSettings.tsx).
import GradingCaptureSettings from "./GradingCaptureSettings";
// docs/course-student-intelligence-acceptance-criteria.md D23a/D23b: the
// deadline + authoritative-tool declaration store, and the one component
// that gives it a UI - see that component's own header for the full
// reasoning (the key-matching trap in particular).
import { useGradingAssessmentDeclarations } from "./useGradingAssessmentDeclarations";
import GradingAssessmentDeclarationControls from "./GradingAssessmentDeclarationControls";
import { useGradingCaptureTracking } from "./useGradingCaptureTracking";
// The run's post-capture status block (hint, timer/count/extracting status
// row, throttled live region, stalled notice, merged-readings line) - moved
// into this NEW leaf for the same file-size-ceiling reason as
// GradingRecordingContextPanel above. No hook moved with it; see that
// leaf's own header.
import GradingRecordingCaptureStatus from "./GradingRecordingCaptureStatus";
import { checkGradingReadiness } from "./grading-dispatch";
// A38 wave 0 (docs/a38-wave-plan.md section 3.1): the capture-drain pipeline
// (runExtraction + its drain effect + the `extracting` state) moved out into
// this hook - a pin-free, behaviour-preserving relocation. See that file's
// own header for the full reasoning.
import { useGradingRecordingExtraction } from "./useGradingRecordingExtraction";
import { isDangerNotice, type GradingExtractionOutcome } from "./grading-extraction-outcome";
import { classifyGradingResult } from "./grading-rows";
// A16-3 (docs/a16-plan.md 5.5/9.3, rulings 10/19): the SAME ClassTrendsPanel
// GradingResults.tsx already mounts for the LMS grading surfaces, reached
// here from a run over THIS table instead of a navigated-to destination.
// hasTrendableResults is imported directly from grading-results/
// classTrendsEntry - never re-exported through classTrendsRunCohort.ts
// below, and never redeclared - so both surfaces share exactly one gate
// predicate (ruling 10).
import ClassTrendsPanel from "../drafted-grades/ClassTrendsPanel";
import { hasTrendableResults } from "../grading-results/classTrendsEntry";
import { buildRunCohort, toRunCohortEntry, cohortLabelSpread, type RunCohort } from "./classTrendsRunCohort";
// docs/DEV_LOOP.md's "every feature needs a downloadable log" rule - this
// surface is the newest and most in need of it (it reads names off a screen,
// merges readings, skips unnamed submissions, drops frames, and grades; every
// one of those is a silent-failure candidate). Collection (the refs/effects
// below) lives here, mirroring useDiscussionReplies.ts's own split;
// assembly/formatting is entirely grading-recording-log.ts, per that module's
// own header.
import {
  buildGradingRecordingRunLog,
  summarizeGradingRecordingRunLog,
  gradingRecordingLogSummaryLine,
  buildGradingRecordingLogDownload,
  blockedGradingRun,
  erroredGradingRun,
  completedGradingRun,
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
// docs/course-student-intelligence-acceptance-criteria.md D22b/D23e: the
// instructor's own typed label for what they are currently grading - "the
// blocking piece" per this task's own brief. Same canary discipline as
// STORAGE_KEY_COURSE immediately above (a bound const, added to grading-
// rows.test.ts's key-inventory canary in this same change). Persisted flat,
// not scoped per course, mirroring STORAGE_KEY_COURSE's own single-value
// shape - switching courses does not clear it, the same way switching
// courses does not clear the rubric text either; the instructor is expected
// to type a new one when they move on to grading a different assessment.
const STORAGE_KEY_ASSESSMENT = "ta-rec-grade-assessment";

// A39 wave 3b, path F (docs/owner-decisions-2026-09-23.md DECISION 3): the
// rubric persists through src/lib/grade/rubric-memory.ts, scoped to this
// panel's own course+assessment identity (recordingRubricScope below) so a
// restored rubric can never silently apply to the wrong assignment.
// DECISION 9's transition rule - "when a sixth ta- key lands in this
// directory, the exact-set canary gets written then" - does not defer here:
// this directory ALREADY carries an exact-set canary
// (grading-rows.test.ts's "has exactly the expected set of persisted keys"),
// written back when the sixth key ("ta-rec-grade-assessment") landed, before
// DECISION 9 existed. This is the EIGHTH key in that same directory-wide
// count (filter, sort, course, table, declarations, assessment, dismissed,
// rubric), so the canary the decision would have deferred is already in
// force and this key goes straight into its expected set in the same commit
// - see grading-rows.test.ts's own updated block.
const STORAGE_KEY_RUBRIC = "ta-rec-grade-rubric";

// Scope key for rubric-memory.ts, mirroring CartridgeDropPanel.tsx's own
// cartridgeRubricScope: empty (refused by rubric-memory.ts itself) until
// BOTH the course and the assessment label are known, so an instructor who
// has picked neither cannot restore a rubric that looks like it belongs to
// whatever they pick next.
function recordingRubricScope(courseName: string, assessmentIdValue: string): string {
  return courseName.trim() && assessmentIdValue.trim() ? `recording:${courseName}|${assessmentIdValue}` : "";
}

interface Notice extends GradingExtractionOutcome {
  id: string;
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
  // A16-3: the run cohort THIS RUN produced, captured inside handleGradeAll
  // and never re-derived from gradingRows.rawRows/rows - see that handler's
  // own hinge comment for why. null before any run and after any run that
  // did not complete.
  const [lastRunCohort, setLastRunCohort] = useState<RunCohort | null>(null);
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

  // docs/REGRESSION.md entry 383's Limits, verified real: useDiscussionCapture's
  // own `droppedFrames` resets to 0 on every start() (see that hook's own
  // header/start()), while `logStartedAt` below spans the WHOLE panel
  // session, not just the latest cycle - reading `droppedFrames` live at
  // download time silently lost every earlier Start/Stop cycle's count the
  // moment a new cycle began (a second Start zeroes the hook's counter, and
  // the run log/notice only ever reflected whichever cycle was most recent).
  // `accumulateDroppedFrames` (recording/discussion-capture.ts) is the same
  // tested fold the module-deck-capture panel already uses for this exact
  // reason - see that panel's own AM-G comment, which names THIS file as the
  // pre-existing bug it was written not to repeat. This effect is the ONLY
  // place that calls it; `droppedFramesTotal` - never the hook's live
  // `droppedFrames` - is what reaches the run log and the persistent
  // "scrolled past faster than it could be read" notice below, so both
  // report drops across the whole session, not just since the most recent
  // Start.
  const [droppedFramesTotal, setDroppedFramesTotal] = useState(0);
  const droppedFramesTotalRef = useRef(0);
  const prevLiveDroppedRef = useRef(0);
  useEffect(() => {
    const nextTotal = accumulateDroppedFrames(prevLiveDroppedRef.current, droppedFrames, droppedFramesTotalRef.current);
    prevLiveDroppedRef.current = droppedFrames;
    // react-hooks/set-state-in-effect: only reached when the total actually
    // changed - never an unconditional top-level setState call.
    if (nextTotal !== droppedFramesTotalRef.current) {
      droppedFramesTotalRef.current = nextTotal;
      setDroppedFramesTotal(nextTotal);
    }
  }, [droppedFrames]);

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

  // docs/course-student-intelligence-acceptance-criteria.md D22b/D23e: the
  // assessment selector - "the blocking piece" this task's own brief names.
  // There is no LMS to enumerate assignments from (that is the entire point
  // of this offline surface), so this is a free-text label the instructor
  // types themselves, persisted the same way `courseId` above is. Matches
  // useGradingAssessmentDeclarations.ts's own `assessmentId` convention
  // exactly (an instructor-typed string, trimmed before use as a key) so a
  // name typed here and a deadline declared there refer to the same thing -
  // see that file's own header on why a mismatch between the two would be
  // silent and fatal to the missing-work count.
  const [assessmentLabel, setAssessmentLabelState] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(STORAGE_KEY_ASSESSMENT) ?? "";
  });
  const setAssessmentLabel = useCallback((next: string) => {
    setAssessmentLabelState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY_ASSESSMENT, next);
    } catch {
      // Best-effort, mirrors setCourseId's own identical handling above -
      // losing this persistence does not affect the in-memory session.
    }
  }, []);
  // Trimmed before it ever becomes a scope value - useGradingAssessmentDeclarations.ts's
  // own deserializeGradingDeclarations trims `assessmentId` the same way on
  // read, so " Essay 2 " and "Essay 2" must key identically here too, or a
  // stray trailing space would silently split one assessment's rows across
  // two scopes.
  const assessmentId = assessmentLabel.trim();

  // D23a/D23b: the declaration store itself - GradingAssessmentDeclarationControls
  // below is its only caller anywhere in this app. See that component's own
  // header for why this is a NEW component file rather than more inline
  // JSX here (this file's own 1000-line ceiling).
  const declarations = useGradingAssessmentDeclarations();

  // COURSE-SCOPED - see the note in useDiscussionReplies. This one matters
  // most: recorded grades are the offline gradebook, and an unattributed
  // grade cannot be counted against any course's assessments.
  //
  // ASSESSMENT-SCOPED (D22b/D23e), for the identical reason: a row minted
  // while no assessment is selected reads UNATTRIBUTED on this axis, exactly
  // like `course` does with no course selected - see useGradingRows.ts's own
  // ASSESSMENT SCOPING header section for why this does not also filter the
  // VISIBLE table (only course does that); the assessment tag exists to make
  // a row's assessment attributable for a future per-assessment denominator,
  // not to change what this panel itself shows.
  const gradingRows = useGradingRows(courseId, assessmentId);

  // D22b/D23e: previously-typed assessment labels for the CURRENTLY selected
  // course (drawn from `gradingRows.rawRows`, already course-scoped) - pure
  // typing convenience so an instructor returning to grade more of "Essay 2"
  // tomorrow can pick the exact same label from the list rather than risk a
  // typo that would silently start a second, disconnected assessment bucket.
  // Suggestions only (MUI Autocomplete's `freeSolo`) - never a closed set,
  // since there is no catalogue of assessments to choose from (this file's
  // own header, and grading-row.ts's own `assessment` doc comment, both name
  // this as the reason it must stay free text).
  const assessmentOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const row of gradingRows.rawRows) {
      if (row.assessment) seen.add(row.assessment);
    }
    return Array.from(seen).sort();
  }, [gradingRows.rawRows]);
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
      if (match.nameMatch !== row.nameMatch || match.rosterCandidates.join("\x01") !== row.rosterCandidates.join("\x01")) {
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
  // A39 wave 3b, path F: origin label for a restored rubric (never blank -
  // describeRubricOrigin always names a scope and a time), and the
  // dirty-tracking ref CartridgeDropPanel.tsx's own restore effect uses -
  // the last value THIS restore wrote, so a later restore never overwrites
  // text the instructor has since edited themselves.
  const [rubricOrigin, setRubricOrigin] = useState<string | null>(null);
  const lastRestoredRubricRef = useRef<string | null>(null);

  // A39 wave 3b, path F (docs/owner-decisions-2026-09-23.md DECISION 3):
  // restore only once BOTH course and assessment are known
  // (recordingRubricScope returns "" - and rubric-memory.ts's own
  // empty-scope guard refuses - until then, matching path H exactly), and
  // only into a field the instructor has not since edited themselves. No
  // sole-producer invariant guards rubricText in this file (unlike
  // SnapshotGradingPanel.tsx's applyReviewedRubricText/confirmed-areas
  // reset) - setRubricText's only other caller is RubricInputModal's own
  // onSubmit below, a plain setter with nothing downstream to protect - so
  // setting it directly here does not reproduce path G's hazard.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const scope = recordingRubricScope(selectedCourse?.name ?? "", assessmentId);
      if (!scope) return;
      const loaded = loadRubricMemory(STORAGE_KEY_RUBRIC, scope);
      if (!loaded) return;
      const untouched = rubricText === "" || rubricText === lastRestoredRubricRef.current;
      if (!untouched) return;
      // react-hooks/set-state-in-effect: every setState below follows an
      // await (docs/loop/... set-state-in-effect idiom).
      await Promise.resolve();
      if (cancelled) return;
      if (loaded.entry.rubric !== rubricText) setRubricText(loaded.entry.rubric);
      lastRestoredRubricRef.current = loaded.entry.rubric;
      setRubricOrigin(describeRubricOrigin(loaded, scope));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourse?.name, assessmentId]);

  const [knowledgeContext, setKnowledgeContext] = useState<RecordingKnowledgeContext | null>(null);

  const [notices, setNotices] = useState<Notice[]>([]);
  const pushNotices = useCallback((outcomes: GradingExtractionOutcome[]) => {
    if (outcomes.length === 0) return;
    setNotices((prev) => [...prev, ...outcomes.map((o) => ({ ...o, id: crypto.randomUUID() }))]);
  }, []);
  const dismissNotice = useCallback((id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  }, []);
  // CC14: a per-row "Copy feedback" clipboard failure surfaces through this
  // same notice channel - the "error" kind already renders as a danger
  // notice below, the same urgency DiscussionReplyRow.tsx's own onCopyError
  // gives a failed Copy reply.
  const handleCopyFeedbackError = useCallback(
    (message: string) => pushNotices([{ kind: "error", text: message }]),
    [pushNotices]
  );

  // Wave 2 (docs/REGRESSION.md entry 428, RES-A9-7): the accumulator, its
  // Remove/Clear-table wiring and its per-course persisted tombstone set all
  // live in useGradingCaptureTracking.ts / grading-capture-tombstones.ts.
  // courseScope mirrors useGradingRows.ts's own courseId collapse exactly,
  // so a dismissal persists under the same scope a row does.
  const courseScope = courseId.length > 0 ? courseId : undefined;
  const capture = useGradingCaptureTracking(gradingRows.removeRow, gradingRows.clearTable, courseScope, gradingRows.rawRows);

  // FIX 1 (silent-fold visibility): advanceGradingCapture already reports
  // addedCount/mergedCount per call - this is the running SESSION TOTAL of
  // every reading it has ever classified (added-as-new plus folded-into-
  // existing), summed across every extraction batch so far. Compared against
  // gradingRows.totalCount, this is what lets an instructor who recorded
  // twelve students and sees eleven rows notice the gap: folding is normal
  // (that is the whole point of merging overlapping frames), so the count
  // alone is ordinary information, not a danger notice - but an unexpectedly
  // LOW submission count relative to what was actually recorded is the
  // signal a silent over-merge produces, and this makes that number
  // impossible to miss.
  //
  // AC-A9-15: `gradingRows.totalCount` is NOT simply the most recent
  // advanceGradingCapture call's row count any more - a dismissed entry
  // mints no row and a preserved row (a divergence, or a row this call never
  // touched) adds one with no tracked entry backing it. The true invariant
  // is: `totalCount` equals the count of non-dismissed tracked entries plus
  // any preserved rows.
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

  const { extracting } = useGradingRecordingExtraction({
    takeFrameBatch,
    pendingFrames,
    provider,
    pushNotices,
    gradingRows,
    selectedRosterText,
    capture,
    setLogBatches,
    setTotalReadingsCount,
  });

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
      setLogGradingRuns((prev) => [...prev, blockedGradingRun(new Date().toISOString(), gradingRows.totalCount, readiness.reason ?? "")]);
      // A16-3 (docs/a16-plan.md 9.3, ruling 23): this refusal returns BEFORE
      // any run starts - without this, the trends panel would sit under a
      // fresh grading error while still reporting the PREVIOUS run's cohort.
      setLastRunCohort(null);
      return;
    }
    setGradeError(null);
    setGradingBusy(true);
    try {
      const submissions = gradingRows.rawRows.map((r) => ({
        id: r.id,
        studentName: r.studentName,
        submissionText: r.submissionText,
        submissionKind: r.submissionKind,
      }));
      // A16-3 (docs/a16-plan.md 5.5, ruling 20): the ONE read this feature
      // adds - solely to project id/studentName/assessment for the rows in
      // THIS run, so buildRunCohort below can attribute each result to the
      // row it graded. Never assessmentId/assessmentLabel here - that is
      // the single in-scope value, and using it would make every row carry
      // the same label, silently killing the disclosure line further down.
      const identity = gradingRows.rawRows.map((r) => ({ id: r.id, studentName: r.studentName, assessment: r.assessment }));
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
          erroredGradingRun(new Date().toISOString(), submissions.length, result.error),
        ]);
        setLastRunCohort(null);
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
        completedGradingRun(new Date().toISOString(), submissions.length, graded, failed),
      ]);
      // A16-3 (docs/a16-plan.md 5.5, ruling 19): the cohort THIS run
      // produced, captured now rather than re-derived later from
      // gradingRows.rawRows/rows (a live memo over React state - see
      // buildRunCohort's own header for why that array cannot be captured
      // directly). courseName/assignmentName are snapshotted at this exact
      // click the same way GithubGradingPanel.tsx:398/:861 snapshots
      // lastGradedFolder into its own assignmentName - tied to what THIS
      // run covered even if the course/assessment controls above have since
      // changed. buildRunCohort is a pure leaf (ruling 19) so its own unit
      // test exercises the real merge; this handler only supplies the
      // arguments, and result.results (this run's own results) is the
      // first one - never gradingRows.rawRows/rows.
      const meta = { courseName: selectedCourse?.name ?? "", assignmentName: assessmentId };
      setLastRunCohort(buildRunCohort(result.results, identity, meta));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not grade these submissions.";
      setGradeError(message);
      setLogGradingRuns((prev) => [
        ...prev,
        erroredGradingRun(new Date().toISOString(), gradingRows.totalCount, message),
      ]);
      setLastRunCohort(null);
    } finally {
      setGradingBusy(false);
    }
  }, [rubricText, gradingRows, knowledgeContext, provider, selectedCourse, assessmentId]);

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
      droppedFrames: droppedFramesTotal,
      batches: logBatches,
      encodeNotices: logEncodeNotices,
      gradingRuns: logGradingRuns,
    },
    gradingRows.rawRows
  );
  const handleDownloadLog = (format: "csv" | "json") => {
    const { text, filename, mimeType } = buildGradingRecordingLogDownload(currentGradingLog, format, new Date().toISOString());
    triggerFileDownload(new Blob([text], { type: mimeType }), filename);
  };

  // CC1: the visible reason a disabled Grade submissions primary carries.
  const canGrade = rubricText.trim() !== "";

  // CC12: composeCaptureLiveSentence/useThrottledLiveSentence, adopted
  // whole - Grading's own noun is "submission"/"submissions".
  const captureLiveSentence = composeCaptureLiveSentence({
    count: gradingRows.totalCount,
    noun: { one: "submission", many: "submissions" },
    extracting,
    pendingFrames,
    stalled,
    capturing,
  });
  const throttledLiveSentence = useThrottledLiveSentence(captureLiveSentence);

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
          reasoning. CC8: the byte-identical row this file used to inline is
          now the shared RunLogRow component. */}
      <RunLogRow
        summary={gradingRecordingLogSummaryLine(summarizeGradingRecordingRunLog(currentGradingLog))}
        onDownload={handleDownloadLog}
      />

      {/* Fixer pass finding 7: this used to render at the bottom of the
          panel, below the table, where a notice about a failed extraction
          could scroll out of view before the instructor ever saw it - moved
          here, directly under the header/run-log row, so it is the first
          thing on screen regardless of how far down the table has grown.
          CC11: ONE wrapper carries role="status"/aria-live - no role on the
          individual notices. This replaces the per-notice role="alert" this
          file used to give every danger-kind notice: the 9b finding is that
          several extraction outcomes can arrive close together, and N
          simultaneous role="alert" elements each queue their own
          interruption instead of being read as one update - which is worse,
          not better, for an instructor already mid-task. One status region
          announcing the latest change is the same shape
          DiscussionRepliesPanel.tsx's own notice list uses.
          CC11 fixer pass: the dropped-frames notice, the frame-encode notice
          and a failed-grade error used to render as three separate standalone
          `role="alert"` paragraphs further down the panel - folded in here so
          every notice on this surface lives in the one place an instructor
          already knows to look, matching module deck's own consolidated
          wrapper. `{droppedFramesTotal > 0 &&` stays the exact gate
          GradingRecordingPanel.wiring.test.ts:55 pins; only its render
          location moved. A non-danger extraction outcome ("confirmed-empty",
          "added") now renders as a neutral `controls.notice` box rather than
          a bare `.fieldHint` line, matching module deck's own notice
          treatment. */}
      {(droppedFramesTotal > 0 || frameEncodeNotice || gradeError || notices.length > 0) && (
        <div role="status" aria-live="polite" className={styles.field}>
          {droppedFramesTotal > 0 && (
            <p className={`${controls.notice} ${controls.noticeDanger}`}>
              Some of the screen scrolled past faster than it could be read. Scroll back over that section to catch
              it.
            </p>
          )}
          {frameEncodeNotice && <p className={`${controls.notice} ${controls.noticeDanger}`}>{frameEncodeNotice}</p>}
          {gradeError && <p className={`${controls.notice} ${controls.noticeDanger}`}>{gradeError}</p>}
          {notices.map((n) => (
            <p key={n.id} className={isDangerNotice(n.kind) ? `${controls.notice} ${controls.noticeDanger}` : controls.notice}>
              {n.text}{" "}
              <button type="button" className={styles.linkButton} onClick={() => dismissNotice(n.id)}>
                Dismiss
              </button>
            </p>
          ))}
        </div>
      )}

      {/* CC2: settings grouped under named sections, run row last. */}
      <GradingCaptureSettings
        courseId={courseId}
        setCourseId={setCourseId}
        courses={courses}
        coursesLoading={coursesLoading}
        coursesError={coursesError}
        selectedRosterText={selectedRosterText}
        assessmentOptions={assessmentOptions}
        assessmentLabel={assessmentLabel}
        setAssessmentLabel={setAssessmentLabel}
        assessmentId={assessmentId}
      />

      <GradingAssessmentDeclarationControls
        courseId={courseId}
        assessmentId={assessmentId}
        assessmentLabel={assessmentLabel}
        hasRows={gradingRows.totalCount > 0}
        declarations={declarations}
      />

      <fieldset className={controls.section}>
        <legend className={controls.sectionLegend}>Grading</legend>
        <div className={styles.ghActions}>
          {/* Fixer pass finding 1: with rows captured and no rubric yet,
              "Add rubric" is the real next step - it now takes the fill
              instead of leaving a disabled "Grade submissions" as the only
              contained button on screen. Guarded on !capturing so "Stop
              capture" stays the sole primary while a capture is live (CC1's
              "a live capture beats everything"). */}
          <Button
            variant={variantFor(!capturing && gradingRows.totalCount > 0 && !canGrade)}
            size="small"
            ref={rubricButtonRef}
            onClick={() => setRubricModalOpen(true)}
          >
            {rubricText ? "Edit rubric" : "Add rubric"}
          </Button>
        </div>
        <p className={styles.fieldHint}>
          {rubricText
            ? `Rubric set (${rubricText.trim().length} characters).`
            : "No rubric yet - you can capture submissions first and add one when you are ready to grade."}
        </p>
        {rubricOrigin && <p className={styles.fieldHint}>{rubricOrigin}</p>}
      </fieldset>

      <GradingRecordingContextPanel knowledgeContext={knowledgeContext} setKnowledgeContext={setKnowledgeContext} />

      {/* CC1: the run row - the primary is the next step, and a live capture
          beats everything (Stop capture is primary while capturing). Grading
          rows exist -> Grade submissions is primary; otherwise Start
          capture. Grade submissions with no rubric is disabled with a
          visible reason instead of today's post-click-only refusal - the
          refusal path in handleGradeAll (checkGradingReadiness) still runs
          and still covers the "no submissions" case. */}
      <div className={`${styles.ghActions} ${controls.runRow}`}>
        <Button
          variant={variantFor(capturing || gradingRows.totalCount === 0)}
          color="primary"
          size="small"
          onClick={handleStartStop}
        >
          {capturing ? "Stop capture" : "Start capture"}
        </Button>
        <Button
          variant={variantFor(!capturing && gradingRows.totalCount > 0 && canGrade)}
          size="small"
          loading={gradingBusy}
          loadingPosition="start"
          disabled={!canGrade}
          onClick={() => void handleGradeAll()}
        >
          {gradingBusy ? "Grading…" : "Grade submissions"}
        </Button>
      </div>
      <GradingRecordingCaptureStatus
        capturing={capturing}
        extracting={extracting}
        pendingFrames={pendingFrames}
        elapsedSec={elapsedSec}
        totalCount={gradingRows.totalCount}
        canGrade={canGrade}
        stalled={stalled}
        totalReadingsCount={totalReadingsCount}
        throttledLiveSentence={throttledLiveSentence}
        previewRef={previewRef}
      />
      {/* A16-3 (docs/a16-plan.md 5.5/9.3, ruling 21): the SAME
          ClassTrendsPanel GradingResults.tsx already mounts for the LMS
          grading surfaces - a run over THIS table becomes an OUTPUT of the
          run instead of a navigated-to destination. trendsEntry is hoisted
          once, mirroring GradingResults.tsx's own shipped const, so the
          gate below and the mount read the one build. Gated on
          hasTrendableResults so a run with nothing graded yet renders
          nothing, never a "Trends (0)" button. */}
      {(() => {
        const trendsEntry = lastRunCohort ? toRunCohortEntry(lastRunCohort) : null;
        return (
          trendsEntry &&
          hasTrendableResults(trendsEntry) && (
            <div className={styles.field}>
              <ClassTrendsPanel entry={trendsEntry} defaultExpanded />
              {/* A16-3 (docs/a16-plan.md 5.5.2/9.3, ruling 20): disclosed,
                  never prevented - this table is course-scoped but not
                  assessment-scoped (D22b/D23e above), so one Grade
                  submissions click genuinely can cover more than one
                  assessment label. */}
              {lastRunCohort && cohortLabelSpread(lastRunCohort) && (
                <p className={styles.fieldHint}>
                  This run graded submissions from more than one assessment label - the trends above combine them.
                </p>
              )}
            </div>
          )
        );
      })()}

      <GradingTable
        rows={gradingRows.rows}
        totalCount={gradingRows.totalCount}
        filterText={gradingRows.filterText}
        setFilterText={gradingRows.setFilterText}
        sort={gradingRows.sort}
        setSort={gradingRows.setSort}
        onEditField={gradingRows.editField}
        onRemoveRow={capture.onRemoveRow}
        onMarkLate={gradingRows.markSubmissionLate}
        onClearTable={capture.onClearTable}
        onCopyError={handleCopyFeedbackError}
        onConfirmSubmissionKind={gradingRows.confirmSubmissionKind}
        onAcceptSuggestedKinds={gradingRows.acceptSuggestedKinds}
      />

      {rubricModalOpen && (
        <RubricInputModal
          onSubmit={(text) => {
            setRubricText(text);
            setRubricModalOpen(false);
            // A39 wave 3b, path F: save under THIS submission's actual
            // scope (not any stale state), mirroring CartridgeDropPanel.tsx's
            // own saveScope - the same discipline as its own comment there.
            lastRestoredRubricRef.current = text;
            const scope = recordingRubricScope(selectedCourse?.name ?? "", assessmentId);
            if (scope) saveRubricMemory(STORAGE_KEY_RUBRIC, scope, { rubric: text });
          }}
          onClose={() => setRubricModalOpen(false)}
          restoreFocusRef={rubricButtonRef}
        />
      )}
    </div>
  );
}
