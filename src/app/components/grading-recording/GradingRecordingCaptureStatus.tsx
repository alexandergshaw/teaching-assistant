"use client";

// Extracted from GradingRecordingPanel.tsx (wave 3a-ii, docs/a39-waves.md
// section 8.1) once that panel was pressing on file-size-ceiling.structure.
// test.ts's 1000-line ceiling - RULING 32/33's precedent, the same move
// wave 3a-i already made on the sibling SnapshotGradingPanel.tsx (branch
// (a): a `.tsx` component with no oracle of its own, since nothing renders
// under this repo's vitest - node-env, collects only src/**/*.test.ts). No
// hook moved with it - every value below is already-derived state or a ref
// the panel owns; this leaf only renders it. Grouped as ONE component
// (RULING 33's counter-instinctive constraint: each extraction boundary
// costs its own call site, so a few larger leaves beat many small ones)
// covering the run's post-capture hint, the status row (timer, submission
// count, extracting/catching-up lines, the aria-hidden preview video), the
// throttled live region for assistive tech, the stalled notice and the
// merged-readings line - the whole "what is the capture doing right now"
// block that sits between the run row and the grading table.

import type { RefObject } from "react";
import { visuallyHidden } from "../ui/visuallyHidden";
import controls from "../recording/RecordingControls.module.css";
import styles from "../../page.module.css";

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface GradingRecordingCaptureStatusProps {
  capturing: boolean;
  extracting: boolean;
  pendingFrames: number;
  elapsedSec: number;
  totalCount: number;
  canGrade: boolean;
  stalled: boolean;
  totalReadingsCount: number;
  throttledLiveSentence: string;
  previewRef: RefObject<HTMLVideoElement | null>;
}

export default function GradingRecordingCaptureStatus({
  capturing,
  extracting,
  pendingFrames,
  elapsedSec,
  totalCount,
  canGrade,
  stalled,
  totalReadingsCount,
  throttledLiveSentence,
  previewRef,
}: GradingRecordingCaptureStatusProps) {
  return (
    <>
      {!capturing && totalCount > 0 && !canGrade && (
        <p className={styles.fieldHint}>Add a rubric to grade.</p>
      )}
      <p className={styles.fieldHint}>You can also stop from your browser&apos;s sharing bar.</p>

      {/* CC12: only the <video> stays aria-hidden - the status column (timer,
          submission count, extracting/catching-up lines) now renders in the
          open, and a throttled, visually hidden live region announces the
          same facts for assistive tech. */}
      <div className={controls.statusRow}>
        {/* Rendered unconditionally, never `{capturing && <video ...>}` - same
            reasoning as DiscussionRepliesPanel.tsx/LegibilityProbeModal.tsx's
            own identical comment: useDiscussionCapture's start() assigns
            previewRef.current.srcObject synchronously, BEFORE it sets
            capturing true, so a conditionally-mounted element would still be
            null at that exact moment. */}
        <video
          ref={previewRef}
          className={`${controls.previewVideo} ${capturing ? "" : controls.previewVideoHidden}`}
          aria-hidden="true"
          autoPlay
          muted
          playsInline
        />
        {capturing && (
          <div className={controls.statusText}>
            <span>{fmt(elapsedSec)}</span>
            <span>
              {totalCount === 0
                ? "Capturing - 0 submissions so far."
                : `${totalCount} submission${totalCount === 1 ? "" : "s"} found`}
            </span>
            {extracting && <span>Reading the screen…</span>}
            {pendingFrames > 0 && <span>Catching up - scroll a little slower.</span>}
          </div>
        )}
      </div>
      <span role="status" aria-live="polite" style={visuallyHidden}>
        {throttledLiveSentence}
      </span>
      {stalled && (
        <p className={`${controls.notice} ${controls.noticeWarning}`} role="status">
          Nothing new has been read off the screen for 30 seconds. Keep this app&apos;s tab visible in a second window while you scroll.
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
          {totalReadingsCount} reading{totalReadingsCount === 1 ? "" : "s"} merged into {totalCount}{" "}
          submission{totalCount === 1 ? "" : "s"} so far.
        </p>
      )}
    </>
  );
}
