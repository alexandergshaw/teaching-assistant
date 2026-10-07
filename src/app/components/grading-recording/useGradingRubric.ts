"use client";

// The recording grader's rubric state, moved out of GradingRecordingPanel.tsx
// (1000-line ceiling) with the wave 2 inline-rubric change. Holds the text, the
// upload modal's open flag, the restore-origin label, and the restore effect
// (A39 wave 3b, path F, plus the per-course default - see
// grading-rubric-memory.ts for the resolution order).
import { useCallback, useEffect, useRef, useState } from "react";
import { isRubricFieldUntouched, persistRubric, restoreRubric } from "./grading-rubric-memory";

export interface GradingRubricState {
  rubricText: string;
  /** Typed or pasted into the inline field: applied and saved immediately. */
  editRubric: (text: string) => void;
  /** Confirmed in the upload modal: applied, saved, and the modal closes. */
  applyUploadedRubric: (text: string) => void;
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  /** Where a restored rubric came from; null once the instructor edits it. */
  origin: string | null;
}

export function useGradingRubric(courseName: string, assessmentId: string): GradingRubricState {
  const [rubricText, setRubricText] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [origin, setOrigin] = useState<string | null>(null);
  // The last value a restore (or a confirmed modal submit) wrote, so a later
  // restore never overwrites text the instructor has since edited themselves.
  const lastRestoredRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = restoreRubric(courseName, assessmentId);
      if (!restored) return;
      if (!isRubricFieldUntouched(rubricText, lastRestoredRef.current)) return;
      // react-hooks/set-state-in-effect: every setState below follows an await.
      await Promise.resolve();
      if (cancelled) return;
      if (restored.rubric !== rubricText) setRubricText(restored.rubric);
      lastRestoredRef.current = restored.rubric;
      setOrigin(restored.origin);
    })();
    return () => {
      cancelled = true;
    };
    // Re-run only when the course or assessment changes, not on every
    // keystroke (rubricText is read at effect time on purpose).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseName, assessmentId]);

  const editRubric = useCallback(
    (text: string) => {
      setRubricText(text);
      setOrigin(null);
      persistRubric(courseName, assessmentId, text);
    },
    [courseName, assessmentId]
  );

  const applyUploadedRubric = useCallback(
    (text: string) => {
      setRubricText(text);
      setModalOpen(false);
      setOrigin(null);
      lastRestoredRef.current = text;
      persistRubric(courseName, assessmentId, text);
    },
    [courseName, assessmentId]
  );

  return { rubricText, editRubric, applyUploadedRubric, modalOpen, setModalOpen, origin };
}
