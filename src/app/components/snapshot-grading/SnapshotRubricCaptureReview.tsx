"use client";

// Snapshot grading, N14 WAVE 2 (scratchpad/n14-architecture.md section 4,
// ledger Rulings N14-9/N14-11/N14-14.4/N14-17). The Alt+R review surface -
// built on ModalShell (not RubricInputModal - Ruling N14-9's Close-first
// focus defect and "this app has no OCR" copy are both wrong here and both
// outside this feature's owns), showing the captured image beside the
// editable transcript so a garbled OCR read is never silently trusted
// (Ruling N14-11).
//
// FOCUS ORDER (Ruling N14-14.4/N14-17): Confirm is the FIRST tabbable
// element in this file's JSX, by construction - before the image, before the
// transcript textarea, before Cancel - so ModalShell's own
// focusFirstTabbable (useModalDismiss.ts) lands on it with zero extra code,
// and Space confirms rather than discards. Two markup constraints close the
// gap "first in DOM order" alone leaves (modalFocus.ts's orderTabbables
// filters disabled/hidden elements OUT, and sorts a positive tabIndex ahead
// of natural order, BEFORE DOM order is even consulted):
//   1. Confirm carries no `disabled` or `loading` prop, ever, in this file -
//      Criterion 3 point 5 requires mandatory review "blank rubric or not",
//      so an empty transcript is a valid, reviewable state, never one that
//      should block confirmation.
//   2. No element anywhere in this file carries a positive tabIndex -
//      natural order (0) or non-tabbable (-1) only, matching
//      ModalShell.tsx's own convention.
//
// Non-persistence (n14-architecture.md section 3, minor 2): the transcript
// draft here lives only in this component's own useState, never
// localStorage, matching rubricText/assignmentText's own U10 exception.
// (This file intentionally never writes a literal "ta-snap-" substring.)
//
// Restore focus: the panel's own rootRef, passed in as restoreFocusRef - no
// button opened this review (a chord did), so there is no natural
// event.currentTarget to capture, and returning focus to the panel's own
// (already tabIndex={-1}, focusable) root is strictly better than leaving it
// on <body>.

import { useState, type RefObject } from "react";
import { Button, TextField } from "@mui/material";
import { ModalShell } from "../ui/ModalShell";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";

export interface SnapshotRubricCaptureReviewProps {
  base64: string;
  transcript: string;
  onConfirm: (text: string) => void;
  onCancel: () => void;
  restoreFocusRef: RefObject<HTMLElement | null>;
}

export default function SnapshotRubricCaptureReview({
  base64,
  transcript,
  onConfirm,
  onCancel,
  restoreFocusRef,
}: SnapshotRubricCaptureReviewProps) {
  // Draft, editable before commit - never persisted (see this file's header
  // comment). Seeded once from the OCR result; this component is only ever
  // mounted for the life of one review (the panel renders it conditionally),
  // so there is no later prop change to resync against.
  const [draft, setDraft] = useState(transcript);

  return (
    <ModalShell label="Review captured rubric" onDismiss={onCancel} restoreFocusRef={restoreFocusRef}>
      {/* Confirm is FIRST in DOM order - see this file's header comment. No
          disabled/loading prop, ever (constraint 1 above). */}
      <div className={styles.ghActions}>
        <Button variant="contained" onClick={() => onConfirm(draft)}>
          Confirm - use this transcript as the rubric
        </Button>
        <Button variant="outlined" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <p className={controls.notice}>
        This screen capture was sent to Google&apos;s Gemini API (generativelanguage.googleapis.com) to transcribe
        it. Review the transcript against the image below before confirming - Confirm replaces the current rubric
        text with whatever is in the box.
      </p>

      {/* eslint-disable-next-line @next/next/no-img-element -- a transient data: URI review image, never persisted */}
      <img
        src={`data:image/jpeg;base64,${base64}`}
        alt="The captured rubric screenshot, for comparison against the transcript below"
        style={{ maxWidth: "100%", height: "auto" }}
      />

      <TextField
        label="Transcript (editable before confirming)"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        multiline
        minRows={4}
        fullWidth
        size="small"
        slotProps={{ htmlInput: { "aria-label": "Editable transcript of the captured rubric" } }}
      />
    </ModalShell>
  );
}
