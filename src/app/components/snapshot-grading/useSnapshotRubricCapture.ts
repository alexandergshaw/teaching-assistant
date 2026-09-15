"use client";

// Snapshot grading, N14 WAVE 2 (scratchpad/n14-architecture.md sections 2-3,
// ledger Rulings N14-9/N14-10/N14-11/N14-15/N14-18). The Alt+R rubric-capture
// flow end to end: capture a frame, transcribe it via a dedicated OCR action,
// hold it for review (never entering the tray - Criterion 3 point 2), and
// commit it into the rubric field through the ONE producer both this hook
// and the rubric-replace modal call (Ruling N14-10).
//
// A7c (this directory's own rule): no useEffect anywhere in this file. The
// OCR call is reachable ONLY through captureAndTranscribe, itself only ever
// invoked from the keyboard hook's Alt+R branch - never auto-fired.
//
// Mirrors useSnapshotGrade.ts's own shape: a hook taking the panel's
// setters/refs/callbacks as constructor parameters, returning handlers that
// close over them.

import { useCallback, useRef, useState, type MutableRefObject } from "react";
import { checkWireBudget } from "@/lib/upload-budget";
import { DEFAULT_PROVIDER } from "@/lib/llm";
import { snapshotTranscribeRubricAction } from "@/app/actions/snapshot-transcribe-rubric";
import { nextParseRequestId, isStaleParseResult } from "./snapshot-row";

export interface UseSnapshotRubricCaptureParams {
  sharing: boolean;
  /** Returns JPEG base64 (no "data:" prefix), or null with nothing to
   *  capture - the same function handleSnap already calls. */
  captureFrame: () => string | null;
  /** Gates review-open at OCR-return time (n14-architecture.md section 3a):
   *  the review must never open while the panel is inactive, closing a
   *  strictly easier path to the pre-existing "stale modal blocks every
   *  shortcut" defect than the one that already exists via rubricModalOpen. */
  activeRef: MutableRefObject<boolean>;
  mountedRef: MutableRefObject<boolean>;
  announce: (message: string) => void;
  setRubricText: (value: string) => void;
  setPinnedRubricAreas: (value: { name: string; points: number | null }[] | null) => void;
  seedConfirmedAreas: (text: string) => Promise<void>;
}

export type RubricCaptureNotice = { kind: "busy" | "failure"; message: string } | null;

export interface RubricCaptureReviewState {
  /** A plain data: URI - not an object URL (n14-architecture.md section 3):
   *  this single, transient frame has no revocation lifetime pressure the
   *  tray's long-lived thumbnails do, so there is nothing to revoke. Never
   *  persisted (matches rubricText/assignmentText's own U10 exception). */
  base64: string;
  transcript: string;
}

export interface UseSnapshotRubricCaptureReturn {
  notice: RubricCaptureNotice;
  review: RubricCaptureReviewState | null;
  captureAndTranscribe: () => void;
  /** Commits `text` - the transcript as the instructor left it after
   *  reviewing/editing, not necessarily the raw OCR output - through the one
   *  producer, and closes the review. */
  confirmReview: (text: string) => void;
  cancelReview: () => void;
  /** The one producer (Ruling N14-10) - also passed to the rubric-replace
   *  modal's own onSubmit, so setRubricText/setPinnedRubricAreas/
   *  seedConfirmedAreas each have exactly one call site in this directory,
   *  and it is here. */
  applyReviewedRubricText: (text: string) => void;
}

export function useSnapshotRubricCapture({
  sharing,
  captureFrame,
  activeRef,
  mountedRef,
  announce,
  setRubricText,
  setPinnedRubricAreas,
  seedConfirmedAreas,
}: UseSnapshotRubricCaptureParams): UseSnapshotRubricCaptureReturn {
  const [notice, setNotice] = useState<RubricCaptureNotice>(null);
  const [review, setReview] = useState<RubricCaptureReviewState | null>(null);
  // A second, independent staleness ref - never the panel's own
  // parseRequestIdRef, which guards a different producer (Criterion 3
  // point 7). Reuses nextParseRequestId/isStaleParseResult verbatim
  // (snapshot-row.ts), which are already generic over a plain
  // {current: number} shape.
  const ocrRequestIdRef = useRef(0);

  // Ruling N14-10: the ONE producer. Both this hook's own confirmReview and
  // the rubric-replace modal's onSubmit call this - nothing else in this
  // directory may call setRubricText.
  const applyReviewedRubricText = useCallback(
    (text: string) => {
      setRubricText(text);
      setPinnedRubricAreas(null);
      void seedConfirmedAreas(text);
    },
    [setRubricText, setPinnedRubricAreas, seedConfirmedAreas]
  );

  const captureAndTranscribe = useCallback(() => {
    if (!sharing) {
      setNotice({ kind: "failure", message: "Could not read a frame from the shared screen right now." });
      return;
    }
    const base64 = captureFrame();
    if (!base64) {
      setNotice({ kind: "failure", message: "Could not read a frame from the shared screen right now." });
      return;
    }
    const budget = checkWireBudget(base64.length, "This screen capture");
    if (!budget.ok) {
      setNotice({ kind: "failure", message: budget.error ?? "This screen capture was too large to transcribe." });
      return;
    }

    const requestId = nextParseRequestId(ocrRequestIdRef);
    setNotice({
      kind: "busy",
      message: "Transcribing the captured rubric with Google's Gemini API - it will open for review when ready.",
    });

    void (async () => {
      const result = await snapshotTranscribeRubricAction(base64, DEFAULT_PROVIDER);
      if (
        !mountedRef.current ||
        isStaleParseResult(requestId, ocrRequestIdRef.current) ||
        !activeRef.current
      ) {
        return;
      }
      if ("error" in result) {
        setNotice({ kind: "failure", message: result.error });
        return;
      }
      setNotice(null);
      setReview({ base64, transcript: result.text });
      announce("The captured rubric is ready for review.");
    })();
  }, [sharing, captureFrame, mountedRef, activeRef, announce]);

  const confirmReview = useCallback(
    (text: string) => {
      applyReviewedRubricText(text);
      setReview(null);
    },
    [applyReviewedRubricText]
  );

  const cancelReview = useCallback(() => {
    setReview(null);
  }, []);

  return { notice, review, captureAndTranscribe, confirmReview, cancelReview, applyReviewedRubricText };
}
