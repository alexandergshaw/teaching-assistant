"use client";

// Snapshot grading (docs/snapshot-grading-acceptance-criteria.md). WAVE 4
// built the reachable capture surface: arm a role, snap the shared screen
// (or paste/drop an image), and manage a tray of shots. WAVE 5 (below) adds
// the read pass, the grade pass, and the result card. A0-2's no-write-back
// ceiling still holds: nothing here ever posts a grade anywhere.
//
// A6d/X7: kept mounted, display:none'd by RecordingTab when another sub-tab
// is active (the `active` prop below) - a live MediaStream keeps running
// behind a hidden panel exactly like every sibling capture surface's does.
// This panel does nothing special about that itself (no pause-on-hide): the
// stream stays live so the instructor can switch tabs mid-session without
// losing their share, matching A6d's "make it deliberate" instruction by
// deliberately choosing to keep it running, the same choice every sibling
// panel already makes.
//
// WAVE 5 adds the read pass and grade pass. D (client-orchestrated, load-
// bearing): handleRead below calls snapshotReadBatchAction ONCE PER BATCH
// from an explicit `for await` loop inside a click handler - never from a
// useEffect, and never one action looping internally over every batch
// (Vercel's 60s cap is per invocation). A7c: no effect in this file ever
// calls snapshotReadBatchAction or snapshotGradeAction on its own - both are
// reachable ONLY through handleRead/handleGrade, both bound to onClick.

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "../../page.module.css";
import { extractPastedImageFiles, isFileDragTypes } from "@/lib/chat/attachments";
import { DEFAULT_PROVIDER } from "@/lib/llm";
import { TextField, Button } from "@mui/material";
import { editAssessmentField, applyAssessmentResult } from "../assessment-shared/assessment-row";
import type { AssessmentFeedbackField } from "../assessment-shared/assessment-row";
import { useSnapshotCapture } from "./useSnapshotCapture";
import { useSnapshotShots } from "./useSnapshotShots";
import {
  checkShotWireBudget,
  groupShotsByRole,
  computeNextStudentCounts,
  describeNextStudentCounts,
  MAX_SHOTS,
  SNAPSHOT_ROLES,
  type SnapshotRole,
} from "./snapshot-shot";
import { snapshotReadBatchAction } from "@/app/actions/snapshot-read";
import { snapshotGradeAction } from "@/app/actions/snapshot-grade";
import { verifySnapshotCitations } from "./snapshot-citations";
import {
  mintSnapshotRowId,
  computeSnapshotTotalScore,
  buildTranscriptBlock,
  upsertSnapshotRow,
  resolveGradeTarget,
  READ_BATCH_SIZE,
  type SnapshotAssessmentRow,
  type SnapshotShotReadReport,
  type SnapshotShotReadStatus,
} from "./snapshot-row";
import { useAssessmentRowStore } from "../assessment-shared/useAssessmentRowStore";
import { snapshotRowCodec } from "./snapshot-row-serialization";
import { RubricInputModal } from "../grading-recording/RubricInputModal";
import SnapshotResultCard from "./SnapshotResultCard";
import SnapshotCaptureBar from "./SnapshotCaptureBar";
import SnapshotShotTray from "./SnapshotShotTray";
import ConfirmArmButtons from "../ui/ConfirmArmButtons";
import controls from "../recording/RecordingControls.module.css";
import panelStyles from "./SnapshotGrading.module.css";

interface ShotReadEntry {
  shotIndex: number;
  role: SnapshotRole;
  transcript: string;
  status: SnapshotShotReadStatus;
  reason?: string;
}

const ROLE_BY_DIGIT: Record<string, SnapshotRole> = {
  "1": "assignment",
  "2": "rubric",
  "3": "post",
  "4": "replies",
  "5": "submission",
  "6": "other",
};

// H1-D: module-scope (not component-scope) so the mount-hydrate effect below
// can list it as a stable dependency-free reference, matching this file's own
// ROLE_BY_DIGIT precedent immediately above.
const INSTRUCTOR_INSTRUCTIONS_KEY = "ta-snap-grading-instructions";

export interface SnapshotGradingPanelProps {
  active: boolean;
}

export default function SnapshotGradingPanel({ active }: SnapshotGradingPanelProps) {
  // Destructured to plain local bindings, never kept as member expressions
  // (capture.previewRef, tray.shots, ...) - this repo's react-hooks/refs
  // lint rule flags ANY property access off a variable once one of its
  // properties is passed to a JSX `ref={...}` attribute, and every other
  // ref-returning hook call site in this repo (DiscussionRepliesPanel.tsx,
  // etc.) already destructures for exactly this reason.
  const {
    sharing,
    shareError,
    previewRef,
    start: startShare,
    stop: stopShare,
    captureFrame,
    encodeFile,
  } = useSnapshotCapture();
  const {
    shots,
    armedRole,
    setArmedRole,
    wireBytes,
    addShot,
    removeShotById,
    setRole,
    setNote,
    moveShot,
    clearPerStudentShots,
  } = useSnapshotShots();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const liveRegionRef = useRef<HTMLParagraphElement | null>(null);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Ruling H1-B: paste is advertised on screen but cannot fire until the
  // panel's own root has been focused at least once - a paste event is
  // dispatched at document.activeElement and bubbles from there, so it never
  // reaches rootRef's "paste" listener (registered below) while focus sits on
  // a control OUTSIDE this subtree (e.g. the sub-tab strip button, which is
  // where focus lands right after switching to this tab). Focusing rootRef
  // exactly on the false->true activation transition - never on every
  // re-render while already active - makes Ctrl+V work the first time,
  // without stealing focus from a control the instructor is mid-interaction
  // with: at the instant this tab becomes active, nothing inside this
  // (previously hidden) panel could have held focus yet.
  useEffect(() => {
    if (active) {
      rootRef.current?.focus();
    }
  }, [active]);

  // WAVE 5: assignment/rubric text (A3a's text path, alongside a shot) -
  // U10-style caution applies here too, deliberately NOT persisted (unlike
  // every other textbox in this app): an unreleased assignment or rubric is
  // at least as sensitive as the rubric text RubricInputModal.tsx already
  // refuses to persist for the same reason.
  const [assignmentText, setAssignmentText] = useState("");
  const [rubricText, setRubricText] = useState("");
  // H1-D: instructor-authored grading guidance (emphasis/tone/focus/feedback
  // format only - it cannot change what counts as meeting a criterion, see
  // snapshot-grade-prompt.ts's own framing block). Unlike assignmentText and
  // rubricText, this field DOES persist across reloads under a ta- key: it is
  // not captured or transcribed material, it is short standing guidance an
  // instructor is likely to reuse across a whole grading session (and across
  // reloads within one), and it carries none of the "unreleased assignment
  // content" sensitivity RubricInputModal.tsx's U10 note is about.
  const [instructorInstructions, setInstructorInstructionsState] = useState("");
  // A localStorage-seeded useState initializer never shows its restored value
  // on an SSR'd surface - it needs a mount effect (see this repo's own
  // persisted-details-open note, LectureScriptPanel.tsx:9-17/46-60). This
  // repo's setState-in-effect idiom (async IIFE + cancelled flag, setState
  // only after an await) so eslint's react-hooks/set-state-in-effect rule
  // passes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        const stored = window.localStorage.getItem(INSTRUCTOR_INSTRUCTIONS_KEY);
        if (stored) setInstructorInstructionsState(stored);
      } catch {
        // localStorage unavailable - fall back to empty, matching every
        // other storage read in this panel.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // Writes imperatively from the change handler, not from a useEffect keyed
  // on the state value - an effect-based write would also fire once on
  // mount, in the SAME commit pass as the read effect above, and would
  // overwrite a just-restored value with the pre-hydration "" before the
  // hydrating re-render ever happens.
  const handleInstructorInstructionsChange = useCallback((value: string) => {
    setInstructorInstructionsState(value);
    try {
      window.localStorage.setItem(INSTRUCTOR_INSTRUCTIONS_KEY, value);
    } catch {
      // storage full/unavailable - keep working in memory for this session
    }
  }, []);
  // A3a: RubricInputModal (paste + PDF/doc extract) is the reviewed-text
  // path, matching GradingRecordingPanel.tsx's own button/modal wiring.
  const [rubricModalOpen, setRubricModalOpen] = useState(false);
  const rubricButtonRef = useRef<HTMLButtonElement>(null);

  // The read pass's own state: one entry per shot, keyed by its 1-based
  // session-stable index (the shots array's own current position).
  const [shotReads, setShotReads] = useState<Map<number, ShotReadEntry>>(new Map());
  const [transcriptText, setTranscriptText] = useState("");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  // F1 (A4d): matches every sibling <prefix>-table key exactly -
  // ta-rec-grade-table, ta-rec-disc-table, ta-rec-msg-table - none carries a
  // middle segment.
  const STORAGE_KEY_TABLE = "ta-snap-table";
  const SNAP_TABLE_REDUCED_MESSAGE =
    "Storage was almost full, so this assessment's evidence citations were not saved (the score and feedback were).";
  const SNAP_TABLE_FULL_MESSAGE = "Storage is full - this assessment could not be saved. It is still shown below.";

  const {
    rawRows: sessionRows,
    rowsRef: sessionRowsRef,
    commitRows: commitSessionRows,
    persistError: sessionPersistError,
  } = useAssessmentRowStore<SnapshotAssessmentRow>(STORAGE_KEY_TABLE, snapshotRowCodec, {
    reduced: SNAP_TABLE_REDUCED_MESSAGE,
    full: SNAP_TABLE_FULL_MESSAGE,
  });

  // F1 (A4d/A4b): tracks rows GRADED BEFORE THE MOST RECENT PER-STUDENT SHOT
  // CLEAR - either because the row was already in storage at mount (U10
  // guarantees zero live shots exist at mount, so a restored row was
  // necessarily graded before whatever shots exist now) or because a later
  // Next-student transition cleared the shots it was graded against
  // (handleNextStudentConfirm below). Either way, the row's shot-index
  // citations may no longer point at the shot they name - not because the
  // shot is gone, but because kept (stable-role) shots shift position once
  // per-student shots are removed from around them, so even a citation
  // naming a KEPT shot can end up pointing at the wrong index. There is
  // deliberately no removal branch: activeRowIdRef starts null on every
  // mount and is set ONLY inside handleGrade's own isNewRow branch when
  // minting a brand-new row id - nothing ever points it at an id already in
  // this set, so no row already in this set can ever become the `existing`
  // target of an in-place update.
  //
  // NOTE (this seat's own scoping): this set tracks rows restored at mount,
  // or graded before the most recent per-student clear - it does not, and
  // cannot, track every event that can invalidate a shot-index citation
  // (deleting or reordering a shot in the tray also does, and neither
  // feeds this set). Widening it to cover those is out of scope for this
  // chunk; see the report.
  const [rowsGradedBeforeLastShotChange, setRowsGradedBeforeLastShotChange] = useState<ReadonlySet<string>>(
    // Reads `sessionRows` (a plain value, already resolved by
    // useAssessmentRowStore's own lazy initializer earlier in this same
    // render), not `sessionRowsRef.current` - the react-hooks/refs lint rule
    // forbids reading a ref's value during render, even from inside another
    // hook's own lazy initializer. Equivalent on mount: both are the same
    // array, freshly deserialized from storage.
    () => new Set(sessionRows.map((r) => r.id))
  );

  const activeRowIdRef = useRef<string | null>(null);
  const [splitNotice, setSplitNotice] = useState<string | null>(null);
  const [nextStudentArmed, setNextStudentArmed] = useState(false);
  // MAJOR-3: ConfirmArmButtons' own Escape handler is a React onKeyDown on
  // its wrapping span, so it only fires once focus is actually inside that
  // span. Arming from the `n` shortcut below happens from a keypress
  // anywhere in the body (Guard 2 already refuses it from inside a field),
  // so without moving focus onto the control here, Escape cannot cancel and
  // Enter cannot confirm after an `n`-armed keypress - only a mouse click
  // could. Idle and armed are the SAME <Button> DOM node (ConfirmArmButtons'
  // own header), so focusing this ref works immediately, before the state
  // update that flips its label even lands.
  const nextStudentButtonRef = useRef<HTMLButtonElement>(null);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  // BLOCKER 1 fix: what the most recent Grade call actually pinned into the
  // prompt's "you MUST return exactly one item for each required area...
  // never omit areas" instruction - see snapshot-grade.ts's own
  // SnapshotGradeActionResult.pinnedRubricAreas doc comment. `null` means no
  // grade has completed yet (nothing to show); an empty array after a grade
  // with rubric text supplied means the parser recognized none of it, so the
  // model was free to choose its own areas - a real and different case from
  // "no rubric text at all", which is why this is tracked separately from
  // `rubricText`.
  const [pinnedRubricAreas, setPinnedRubricAreas] = useState<{ name: string; points: number | null }[] | null>(null);

  // A6c: a single in-flight guard on each of Read/Grade - double-clicking
  // must not produce two calls or two committed results. A reload/unmount
  // mid-call loses that one attempt and nothing else (the shots stay in the
  // tray - A2d).
  const mountedRef = useRef(true);
  const readAbortRef = useRef<AbortController | null>(null);
  const gradeAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      readAbortRef.current?.abort();
      gradeAbortRef.current?.abort();
    };
  }, []);

  // U6: not throttled, deliberately diverging from the recording grader's
  // capture live region - a snap is discrete and user-initiated, so the
  // confirmation must land every time, not at most once per 5s.
  const announce = useCallback((message: string) => {
    if (liveRegionRef.current) liveRegionRef.current.textContent = message;
  }, []);

  // F1 (A4b): the panel's existing keydown effect closes over its dependency
  // array once; a value read directly inside the handler from a variable
  // recomputed every render (like nextStudentCounts) freezes at whatever it
  // was on the render that last re-registered the listener. Mirrors this
  // exact file's own `activeRef` idiom rather than adding
  // `nextStudentCounts` to the keydown effect's own deps, which would tear
  // down and re-add the global listener on every shot add/remove.
  const nextStudentCounts = computeNextStudentCounts(shots);
  const nextStudentCountsRef = useRef(nextStudentCounts);
  useEffect(() => {
    nextStudentCountsRef.current = nextStudentCounts;
  }, [nextStudentCounts]);

  // "Next student" ends this student's grading pass - it is not "clear the
  // shots", and its enable rule must not be written against only one of its
  // seven responsibilities. On confirm it: (1) clears per-student shots, (2)
  // clears shotReads, (3) clears transcriptText, (4) clears splitNotice,
  // (5) resets activeRowIdRef to null so the NEXT successful Grade mints a
  // fresh row instead of updating the last one, (6) clears readError, and
  // (7) clears gradeError. activeRowIdRef is reset
  // NOWHERE else in this file. The control is therefore always enabled, even
  // when there are no per-student shots to clear (clearedTotal === 0):
  // resets (2)-(7) are useful work in exactly that case, and disabling the
  // control there would strand activeRowIdRef pointing at the previous
  // student's row - so the next Grade (which only requires transcript text,
  // not a per-student shot) would find that row via resolveGradeTarget and
  // upsertSnapshotRow would silently overwrite it, destroying a completed,
  // persisted assessment.
  const handleNextStudentConfirm = useCallback(() => {
    // Guard on the QUANTITY that matters - the number of shots this clear
    // actually removes (nextStudentCountsRef.current.clearedTotal), not on
    // the length of sessionRowsRef.current (the session's row list, which is
    // unrelated and only coincidentally zero at the same time the tray is
    // empty on a fresh mount). Reads the ref, not the closed-over
    // `nextStudentCounts` variable, for the same reason the keydown effect
    // above does: this callback's own identity is stable across renders (see
    // its dep array), so a direct reference here would freeze at whatever
    // count was live when this callback was created.
    if (nextStudentCountsRef.current.clearedTotal > 0) {
      // Every row currently in the session list has its shot-index
      // numbering invalidated by this clear, not only rows that cited a
      // per-student shot - see the declaration comment on
      // rowsGradedBeforeLastShotChange above for why kept (stable-role)
      // shots are equally affected once per-student shots are removed from
      // around them.
      setRowsGradedBeforeLastShotChange((prev) => {
        const rowsToFlag = sessionRowsRef.current;
        const next = new Set(prev);
        rowsToFlag.forEach((r) => next.add(r.id));
        return next;
      });
    }
    clearPerStudentShots();
    setShotReads(new Map());
    setTranscriptText("");
    setSplitNotice(null); // a notice naming the previous student must not survive into the next student's pass
    setReadError(null); // a failure from the previous student's Read must not survive into the next student's pass
    setGradeError(null); // a failure from the previous student's Grade must not survive into the next student's pass
    setPinnedRubricAreas(null); // the previous student's pinned-areas readout must not survive into the next student's pass
    activeRowIdRef.current = null; // the NEXT successful Grade mints a fresh row, never updates a finished one
    setNextStudentArmed(false);
    announce("Cleared this student's shots. Assignment and rubric shots are kept.");
  }, [clearPerStudentShots, announce, sessionRowsRef]);

  const [encodeNotice, setEncodeNoticeState] = useState<string | null>(null);

  const addEncodedShot = useCallback(
    (base64: string, source: "capture" | "paste" | "drop") => {
      const budget = checkShotWireBudget(base64);
      if (!budget.ok) {
        setEncodeNoticeState(budget.error ?? "That shot was too large to add.");
        return;
      }
      const shot = addShot(base64, source);
      if (!shot) {
        setEncodeNoticeState(`Already at the ${MAX_SHOTS}-shot limit - delete a shot to add another.`);
        return;
      }
      setEncodeNoticeState(null);
      announce(`Added a ${shot.role} shot, ${source === "capture" ? "captured" : source}.`);
    },
    [addShot, announce]
  );

  const handleSnap = useCallback(() => {
    const base64 = captureFrame();
    if (!base64) {
      setEncodeNoticeState("Could not read a frame from the shared screen right now.");
      return;
    }
    addEncodedShot(base64, "capture");
  }, [captureFrame, addEncodedShot]);

  const handleFiles = useCallback(
    async (files: readonly File[], source: "paste" | "drop") => {
      for (const file of files) {
        // "The encoding decision": every pasted/dropped file is re-encoded
        // through the same canvas as a live snap - a PNG is never passed
        // through untouched, and every byte leaving the client ends up
        // JPEG at the same quality/width cap.
        const base64 = await encodeFile(file);
        if (!base64) {
          setEncodeNoticeState(`Could not read "${file.name}" as an image.`);
          continue;
        }
        addEncodedShot(base64, source);
      }
    },
    [encodeFile, addEncodedShot]
  );

  // A1c: paste attached to the panel's own root element, NEVER document -
  // TextbookPhotoModal.tsx's own header explains why (the listener must be
  // reachable from wherever focus actually is, and a document listener
  // would fire from anywhere in the app while this panel sits hidden).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const handlePaste = (event: ClipboardEvent) => {
      if (!activeRef.current) return;
      // Ruling C: ModalShell does not portal, so the rubric modal's own
      // textarea sits INSIDE this rootRef subtree while open - without this
      // guard, pasting a rubric SCREENSHOT into the open modal would file it
      // as a shot behind the modal instead of into the modal's own text
      // field. MAJOR-3 correction: RubricInputModal has no image-paste
      // handler of any kind (it only accepts .docx/.pdf/.txt/.md via its
      // file input) - so with this guard in place, pasting a rubric
      // screenshot while the modal is open reaches nothing at all and
      // silently does nothing. That is still correct: before this guard
      // existed, the same paste at least became a (behind-the-modal) shot;
      // now it is dropped rather than misfiled. An instructor who wants to
      // paste a rubric screenshot should close this modal first and paste it
      // as a rubric-role shot in the tray instead.
      if (document.querySelector('[aria-modal="true"]')) return;
      const items = event.clipboardData?.items;
      if (!items) return;
      const files = extractPastedImageFiles(Array.from(items), (item) => item.getAsFile());
      if (files.length === 0) return;
      event.preventDefault();
      void handleFiles(files, "paste");
    };
    el.addEventListener("paste", handlePaste);
    return () => el.removeEventListener("paste", handlePaste);
  }, [handleFiles]);

  // U4/X6: THE keyboard binding, gated by all three guards, in order.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Guard 1 (X6): the panel may be mounted but hidden behind another
      // sub-tab - without this, every keypress anywhere in the app would
      // silently snap or re-arm this panel's tray.
      if (!activeRef.current) return;
      // Guard 2 (U4, verbatim from useRecorder.ts:882-884): typing in any
      // field must never be interpreted as a shortcut.
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      // Guard 3 (U4): a modal (e.g. a future rubric modal) open elsewhere in
      // the app is exactly when a stray keystroke is most likely.
      if (document.querySelector('[aria-modal="true"]')) return;

      const key = e.key.toLowerCase();
      if (key === "s") {
        handleSnap();
        return;
      }
      if (key === "n") {
        setNextStudentArmed(true); // arms only - never auto-confirms
        // MAJOR-3: move focus onto the control so the keyboard can then
        // cancel (Escape) or confirm (Enter) it - see nextStudentButtonRef's
        // own declaration comment above for why this is safe to do
        // immediately rather than in an effect keyed off nextStudentArmed.
        nextStudentButtonRef.current?.focus();
        // Reads the ref, not the closed-over `nextStudentCounts` - this
        // effect's own dependency array is unchanged by this branch, so a
        // direct reference here would freeze at whatever count was live on
        // the render that registered this listener.
        announce(describeNextStudentCounts(nextStudentCountsRef.current));
        return;
      }
      const role = ROLE_BY_DIGIT[e.key];
      if (role) {
        setArmedRole(role);
        announce(`Armed ${role}.`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSnap, setArmedRole, announce]);

  // D: THE READ PASS. Calls snapshotReadBatchAction ONCE PER BATCH from this
  // explicit for-await loop - never one action looping internally, and never
  // from a useEffect (A7c forbids copying GradingRecordingPanel.tsx:475-487's
  // auto-drain shape). Bound only to the Read button's onClick below.
  const handleRead = useCallback(async () => {
    if (shots.length === 0) {
      setReadError("Add at least one shot before reading.");
      return;
    }
    readAbortRef.current?.abort();
    const controller = new AbortController();
    readAbortRef.current = controller;
    setReading(true);
    setReadError(null);

    const indexed = shots.map((shot, i) => ({ shot, globalIndex: i + 1 }));
    const nextReads = new Map<number, ShotReadEntry>();

    for (let i = 0; i < indexed.length; i += READ_BATCH_SIZE) {
      if (controller.signal.aborted || !mountedRef.current) return;
      const batch = indexed.slice(i, i + READ_BATCH_SIZE);
      const result = await snapshotReadBatchAction(
        batch.map(({ shot, globalIndex }) => ({ globalIndex, role: shot.role, note: shot.note, base64: shot.base64 })),
        DEFAULT_PROVIDER
      );
      if (controller.signal.aborted || !mountedRef.current) return;

      if ("error" in result) {
        setReadError(result.error);
        for (const { shot, globalIndex } of batch) {
          nextReads.set(globalIndex, { shotIndex: globalIndex, role: shot.role, transcript: "", status: "not-read", reason: result.error });
        }
      } else {
        for (const r of result.results) {
          const matched = batch.find((b) => b.globalIndex === r.shotIndex);
          const role = matched ? matched.shot.role : "other";
          const status: SnapshotShotReadStatus = r.readable ? "read" : r.transcript.trim() ? "partly-read" : "not-read";
          nextReads.set(r.shotIndex, { shotIndex: r.shotIndex, role, transcript: r.transcript, status, reason: r.unreadableReason });
        }
      }
      if (mountedRef.current) setShotReads(new Map(nextReads));
    }

    if (!mountedRef.current) return;
    setReading(false);
    setTranscriptText(buildTranscriptBlock(Array.from(nextReads.values())));
    // H1-A: Read is optional, not a required first step - Grade already
    // works directly from the tray. This is a status update on what Read
    // produced, not an instruction to review it before grading.
    announce("Finished reading the shots. You can review or edit the transcription below, or grade now.");
  }, [shots, announce]);

  // D: THE GRADE PASS. One call, guarded the same way (A6c).
  const handleGrade = useCallback(async () => {
    if (shots.length === 0 && !transcriptText.trim()) {
      // H1-A: this only ever fires when there is truly nothing at all (no
      // shots AND no transcript) - Read is not required before Grade, so the
      // message must not imply it is.
      setGradeError("There is nothing to grade yet - add at least one shot to the tray.");
      return;
    }
    gradeAbortRef.current?.abort();
    const controller = new AbortController();
    gradeAbortRef.current = controller;
    setGrading(true);
    setGradeError(null);

    const shotsForGrade = shots.map((shot, i) => ({ globalIndex: i + 1, role: shot.role, base64: shot.base64 }));

    const result = await snapshotGradeAction(
      {
        assignmentText,
        rubricText,
        transcriptBlock: transcriptText,
        shots: shotsForGrade,
        provider: DEFAULT_PROVIDER,
      },
      instructorInstructions
    );

    if (controller.signal.aborted || !mountedRef.current) return;
    setGrading(false);

    if ("error" in result) {
      setGradeError(result.error);
      return;
    }

    setPinnedRubricAreas(result.pinnedRubricAreas);
    // MAJOR-3 fix: this is the only channel that reveals a rubric area was
    // dropped from grading, and it renders asynchronously after Grade
    // completes - a screen-reader user checking the page at that moment
    // hears nothing unless this panel's own announce() helper is used, the
    // same as every other state change in this file.
    if (result.pinnedRubricAreas.length > 0) {
      announce(
        `Pinned rubric areas: ${result.pinnedRubricAreas.map((a) => a.name).join(", ")}. Other rubric areas, if any, were not graded.`
      );
    } else if (rubricText.trim()) {
      announce("No rubric areas could be parsed from the rubric text - the model chose its own areas.");
    }

    const transcriptsByShotIndex = new Map<number, string>();
    shotReads.forEach((entry, idx) => transcriptsByShotIndex.set(idx, entry.transcript));
    // The DEDICATED corpus a `source: "pasted"` citation verifies against -
    // never consulted for a "shot" or "unknown" citation (RULING A).
    const pastedTextCorpus = `${rubricText}\n\n${assignmentText}`;
    const verified = verifySnapshotCitations(
      result.answer.rubricResults,
      transcriptsByShotIndex,
      transcriptText,
      pastedTextCorpus
    );

    const suppliedRoles = new Set(shots.map((shot) => shot.role));
    const hasRubricText = rubricText.trim().length > 0;
    const hasAssignmentText = assignmentText.trim().length > 0;
    const missingRoles = result.answer.missingRoles
      .filter((r): r is SnapshotRole => (SNAPSHOT_ROLES as readonly string[]).includes(r))
      .filter((r) => {
        if (r === "rubric") return !suppliedRoles.has("rubric") && !hasRubricText;
        if (r === "assignment") return !suppliedRoles.has("assignment") && !hasAssignmentText;
        return !suppliedRoles.has(r);
      });

    const shotReports: SnapshotShotReadReport[] = shots.map((shot, i) => {
      const idx = i + 1;
      const entry = shotReads.get(idx);
      return { shotIndex: idx, role: shot.role, status: entry ? entry.status : "not-read", reason: entry?.reason };
    });

    const totalScore = computeSnapshotTotalScore(result.answer.rubricResults);

    const { base, isNewRow, supersededEditedRow } = resolveGradeTarget(
      sessionRowsRef.current,
      activeRowIdRef.current,
      () => mintSnapshotRowId(Date.now())
    );
    if (isNewRow) activeRowIdRef.current = base.id;

    const scored = applyAssessmentResult(base, {
      state: "ready",
      totalScore,
      strengths: "",
      improvements: result.answer.improvements,
      overallComment: result.answer.overallComment,
    });
    const merged: SnapshotAssessmentRow = {
      ...scored,
      shotReports,
      rubricAreas: verified,
      missingRoles,
      instructionLikeContent: result.answer.instructionLikeContent,
      instructionLikeContentQuote: result.answer.instructionLikeContentQuote,
      imageFallbackNote: result.imageFallbackNote,
      evidenceDropped: false, // a fresh grade always carries full evidence in memory
    };
    commitSessionRows(upsertSnapshotRow(sessionRowsRef.current, merged));
    // No `rowsGradedBeforeLastShotChange` update needed here: `merged.id` is
    // never already a member of that set, because a row once added to it can
    // never again be `resolveGradeTarget`'s `existing` (activeRowIdRef never
    // points at an id already in that set).

    if (supersededEditedRow) {
      const name = supersededEditedRow.studentName || "this student";
      setSplitNotice(
        `Kept the earlier edited feedback for ${name} as its own entry - this new grade was saved alongside it, not over it.`
      );
      announce("Saved as a new entry next to the earlier edited one, so your edits were not overwritten.");
    } else {
      setSplitNotice(null);
    }
  }, [
    shots,
    transcriptText,
    assignmentText,
    rubricText,
    instructorInstructions,
    shotReads,
    sessionRowsRef,
    commitSessionRows,
    announce,
  ]);

  const handleEditRowField = useCallback(
    (id: string, field: AssessmentFeedbackField, value: string) => {
      commitSessionRows(
        sessionRowsRef.current.map((r) => (r.id === id ? editAssessmentField(r, field, value) : r))
      );
    },
    [commitSessionRows, sessionRowsRef]
  );

  const handleEditStudentName = useCallback(
    (id: string, name: string) => {
      commitSessionRows(sessionRowsRef.current.map((r) => (r.id === id ? { ...r, studentName: name } : r)));
    },
    [commitSessionRows, sessionRowsRef]
  );

  const grouped = groupShotsByRole(shots);
  const roleCounts = Object.fromEntries(Object.entries(grouped).map(([role, shots]) => [role, shots.length])) as Record<SnapshotRole, number>;

  return (
    <div
      ref={rootRef}
      className={panelStyles.panelRoot}
      tabIndex={-1}
      onDragOver={(e) => {
        if (isFileDragTypes(e.dataTransfer.types)) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!isFileDragTypes(e.dataTransfer.types)) return;
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
        if (files.length > 0) void handleFiles(files, "drop");
      }}
    >
      <p className={styles.fieldHint}>
        Snap a screenshot of the assignment, rubric, post, replies, or submission - or paste/drop one -
        and manage the tray below. Grade directly from the tray whenever you are ready - Read first
        only if you want to review or edit a transcription before grading.
      </p>

      <p ref={liveRegionRef} role="status" aria-live="polite" className={panelStyles.visuallyHidden} />

      <video
        ref={previewRef}
        muted
        playsInline
        aria-hidden="true"
        className={`${controls.previewVideo}${sharing ? "" : ` ${controls.previewVideoHidden}`}`}
      />

      <SnapshotCaptureBar
        armedRole={armedRole}
        onArmedRoleChange={setArmedRole}
        roleCounts={roleCounts}
        sharing={sharing}
        onStartShare={() => void startShare()}
        onStopShare={stopShare}
        onSnap={handleSnap}
        shotCount={shots.length}
        wireBytes={wireBytes}
        shareError={shareError}
        encodeNotice={encodeNotice}
      />

      <SnapshotShotTray
        shots={shots}
        onRemove={removeShotById}
        onSetRole={setRole}
        onSetNote={setNote}
        onMove={moveShot}
      />

      <p id="snap-next-student-consequence" className={styles.fieldHint}>
        {describeNextStudentCounts(nextStudentCounts)}
      </p>
      <ConfirmArmButtons
        armed={nextStudentArmed}
        idleLabel="Next student"
        confirmLabel="Confirm - clear this student's shots"
        tone="warning"
        onArm={() => setNextStudentArmed(true)}
        onConfirm={handleNextStudentConfirm}
        onCancel={() => setNextStudentArmed(false)}
        consequenceId="snap-next-student-consequence"
        buttonRef={nextStudentButtonRef}
      />

      <p className={styles.fieldHint}>
        A rubric or assignment you can paste as text is more reliable than a photograph of it (A3a) - the shot is a
        fallback, not the preferred path.
      </p>
      <TextField
        label="Assignment instructions (optional - pasted text preferred over a shot)"
        value={assignmentText}
        onChange={(e) => setAssignmentText(e.target.value)}
        multiline
        minRows={2}
        fullWidth
        size="small"
        slotProps={{ htmlInput: { "aria-label": "Assignment instructions text" } }}
      />
      {/* MAJOR-1 fix: the button used to read "Edit rubric" once rubric text
          existed, but RubricInputModal has no initial-text prop (its own
          `useState("")`), so "Edit" would open an EMPTY textarea rather than
          the text already captured - a false promise. "Replace rubric" is
          honest about what actually happens. The hint sentence restores the
          preference this whole feature exists to state (A3a), and the status
          line mirrors GradingRecordingPanel.tsx's own confirmation of what
          was captured, which this button's own copy used to promise but
          never rendered. */}
      <Button variant="outlined" size="small" ref={rubricButtonRef} onClick={() => setRubricModalOpen(true)}>
        {rubricText.trim() ? "Replace rubric" : "Add rubric"}
      </Button>
      <p className={styles.fieldHint}>
        Rubric (optional - pasted text preferred over a shot).
      </p>
      {rubricText.trim() && (
        <p className={styles.fieldHint}>{`Rubric set (${rubricText.trim().length} characters).`}</p>
      )}

      <p className={styles.fieldHint}>
        Instructions for grading (optional, instructor-authored - kept separate from the rubric and
        assignment above). This can direct emphasis, tone, focus, and feedback format; it cannot change
        what counts as meeting a rubric criterion, which the rubric alone still decides. Saved on this
        device and restored on reload.
      </p>
      <TextField
        label="Instructions for grading (optional)"
        value={instructorInstructions}
        onChange={(e) => handleInstructorInstructionsChange(e.target.value)}
        multiline
        minRows={2}
        fullWidth
        size="small"
        slotProps={{ htmlInput: { "aria-label": "Instructor-authored grading instructions" } }}
      />

      <p className={styles.fieldHint}>
        Reading and grading upload shots to Google&apos;s Gemini API (generativelanguage.googleapis.com) - the only two
        moments anything leaves this machine. Nothing is sent until you press Read or Grade.
      </p>

      <div className={styles.ghActions}>
        <Button variant="outlined" onClick={() => void handleRead()} disabled={reading || shots.length === 0}>
          {reading ? "Reading..." : "Read shots"}
        </Button>
        <Button variant="contained" onClick={() => void handleGrade()} disabled={grading || (!transcriptText.trim() && shots.length === 0)}>
          {grading ? "Grading..." : "Grade"}
        </Button>
      </div>

      {pinnedRubricAreas !== null && (
        // BLOCKER 1: the only channel that reveals what extractRubricCriteria
        // actually parsed out of rubricText - a prose rubric with mixed
        // formatting (e.g. "Correctness - 10 points." next to "Participation
        // (10 pts):") can parse PARTIALLY, and the grade prompt then pins the
        // model to grade ONLY the recognized areas and instructs it to omit
        // every other area, silently dropping real rubric areas from the
        // total. This line is the instructor's only way to see that.
        //
        // MAJOR-1(b) fix: `pinnedRubricAreas` is ALSO `[]` when no rubric
        // text was ever supplied - the normal, expected case for the
        // rubric-as-a-shot path (A3a). Branch on whether rubric TEXT exists,
        // not just on the parsed-areas length, so an instructor who never
        // typed rubric text is never told their rubric "failed to parse".
        //
        // MAJOR-3 fix: a dropped rubric area changes the score, so the
        // non-empty case is a warning notice (this codebase's own
        // controls.notice/noticeWarning shape, matching RubricInputModal's
        // partial-extraction notice) with role="status"/aria-live, not a
        // silent fieldHint indistinguishable from the Gemini-privacy
        // boilerplate above it. The no-rubric-text case is genuinely just
        // information, so it stays a hint.
        pinnedRubricAreas.length > 0 ? (
          <p className={`${controls.notice} ${controls.noticeWarning}`} role="status" aria-live="polite">
            {`Pinned rubric areas: ${pinnedRubricAreas
              .map((a) => (a.points != null ? `${a.name} (out of ${a.points})` : a.name))
              .join(", ")}. The model was required to grade exactly these areas and no others - if your rubric has more areas than this, they were not parsed and were NOT graded.`}
          </p>
        ) : rubricText.trim() ? (
          <p className={`${controls.notice} ${controls.noticeWarning}`} role="status" aria-live="polite">
            No rubric areas could be parsed from the rubric text - the model chose its own areas.
          </p>
        ) : (
          <p className={styles.fieldHint}>No rubric text was supplied - the model chose its own areas.</p>
        )
      )}

      {readError && <p role="alert">{readError}</p>}

      {shotReads.size > 0 && (
        <TextField
          label="Transcription (editable before grading - A1f)"
          value={transcriptText}
          onChange={(e) => setTranscriptText(e.target.value)}
          multiline
          minRows={4}
          fullWidth
          size="small"
          slotProps={{ htmlInput: { "aria-label": "Editable transcription of the shots" } }}
        />
      )}

      {gradeError && <p role="alert">{gradeError}</p>}

      {sessionPersistError && <p role="alert">{sessionPersistError}</p>}
      {splitNotice && <p role="status">{splitNotice}</p>}
      {sessionRows.length > 0 && (
        <div>
          <p className={styles.fieldHint}>
            Completed assessments ({sessionRows.length}) - some may be from an earlier session, restored on reload.
            Reloading clears the shots; completed assessments are kept.
          </p>
          {[...sessionRows].reverse().map((sessionRow) => (
            <SnapshotResultCard
              key={sessionRow.id}
              row={sessionRow}
              onEditField={handleEditRowField}
              onEditStudentName={handleEditStudentName}
              onCopyError={setGradeError}
              citationsUnavailable={rowsGradedBeforeLastShotChange.has(sessionRow.id)}
            />
          ))}
        </div>
      )}

      {rubricModalOpen && (
        <RubricInputModal
          onSubmit={(text) => {
            setRubricText(text);
            // MAJOR-1(a) fix: the pinned-areas readout below is a stale
            // answer about the PREVIOUS rubric text once a new one is
            // submitted - clear it here the same way the Next-student path
            // already does, so the instructor never sees a parse result
            // that no longer describes what is in the box.
            setPinnedRubricAreas(null);
            setRubricModalOpen(false);
          }}
          onClose={() => setRubricModalOpen(false)}
          restoreFocusRef={rubricButtonRef}
        />
      )}
    </div>
  );
}
