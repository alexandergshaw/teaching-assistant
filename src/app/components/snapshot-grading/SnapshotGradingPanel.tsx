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
import { checkShotWireBudget, groupShotsByRole, MAX_SHOTS, SNAPSHOT_ROLES, type SnapshotRole } from "./snapshot-shot";
import { snapshotReadBatchAction } from "@/app/actions/snapshot-read";
import { snapshotGradeAction } from "@/app/actions/snapshot-grade";
import { verifySnapshotCitations } from "./snapshot-citations";
import {
  createEmptySnapshotRow,
  mintSnapshotRowId,
  computeSnapshotTotalScore,
  buildTranscriptBlock,
  READ_BATCH_SIZE,
  type SnapshotAssessmentRow,
  type SnapshotShotReadReport,
  type SnapshotShotReadStatus,
} from "./snapshot-row";
import SnapshotResultCard from "./SnapshotResultCard";
import SnapshotCaptureBar from "./SnapshotCaptureBar";
import SnapshotShotTray from "./SnapshotShotTray";
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
  } = useSnapshotShots();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const liveRegionRef = useRef<HTMLParagraphElement | null>(null);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // WAVE 5: assignment/rubric text (A3a's text path, alongside a shot) -
  // U10-style caution applies here too, deliberately NOT persisted (unlike
  // every other textbox in this app): an unreleased assignment or rubric is
  // at least as sensitive as the rubric text RubricInputModal.tsx already
  // refuses to persist for the same reason.
  const [assignmentText, setAssignmentText] = useState("");
  const [rubricText, setRubricText] = useState("");

  // The read pass's own state: one entry per shot, keyed by its 1-based
  // session-stable index (the shots array's own current position).
  const [shotReads, setShotReads] = useState<Map<number, ShotReadEntry>>(new Map());
  const [transcriptText, setTranscriptText] = useState("");
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const [row, setRow] = useState<SnapshotAssessmentRow | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);

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
    announce("Finished reading the shots. Review the transcription below before grading.");
  }, [shots, announce]);

  // D: THE GRADE PASS. One call, guarded the same way (A6c).
  const handleGrade = useCallback(async () => {
    if (shots.length === 0 && !transcriptText.trim()) {
      setGradeError("There is nothing to grade yet - add shots and read them first.");
      return;
    }
    gradeAbortRef.current?.abort();
    const controller = new AbortController();
    gradeAbortRef.current = controller;
    setGrading(true);
    setGradeError(null);

    const shotsForGrade = shots.map((shot, i) => ({ globalIndex: i + 1, role: shot.role, base64: shot.base64 }));

    const result = await snapshotGradeAction({
      assignmentText,
      rubricText,
      criteria: [],
      transcriptBlock: transcriptText,
      shots: shotsForGrade,
      provider: DEFAULT_PROVIDER,
    });

    if (controller.signal.aborted || !mountedRef.current) return;
    setGrading(false);

    if ("error" in result) {
      setGradeError(result.error);
      return;
    }

    const transcriptsByShotIndex = new Map<number, string>();
    shotReads.forEach((entry, idx) => transcriptsByShotIndex.set(idx, entry.transcript));
    const verified = verifySnapshotCitations(result.answer.rubricResults, transcriptsByShotIndex, transcriptText);

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

    setRow((prev) => {
      const base = prev ?? createEmptySnapshotRow(mintSnapshotRowId(Date.now()), "");
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
      };
      return merged;
    });
  }, [shots, transcriptText, assignmentText, rubricText, shotReads]);

  const handleEditRowField = useCallback((id: string, field: AssessmentFeedbackField, value: string) => {
    setRow((prev) => (prev && prev.id === id ? editAssessmentField(prev, field, value) : prev));
  }, []);

  const handleEditStudentName = useCallback((id: string, name: string) => {
    setRow((prev) => (prev && prev.id === id ? { ...prev, studentName: name } : prev));
  }, []);

  const grouped = groupShotsByRole(shots);
  const roleCounts = Object.fromEntries(Object.entries(grouped).map(([role, shots]) => [role, shots.length])) as Record<SnapshotRole, number>;

  return (
    <div
      ref={rootRef}
      className={panelStyles.panelRoot}
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
        and manage the tray below. Grading is a later step.
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
      <TextField
        label="Rubric (optional - pasted text preferred over a shot)"
        value={rubricText}
        onChange={(e) => setRubricText(e.target.value)}
        multiline
        minRows={2}
        fullWidth
        size="small"
        slotProps={{ htmlInput: { "aria-label": "Rubric text" } }}
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

      {row && (
        <SnapshotResultCard
          row={row}
          onEditField={handleEditRowField}
          onEditStudentName={handleEditStudentName}
          onCopyError={setGradeError}
        />
      )}
    </div>
  );
}
