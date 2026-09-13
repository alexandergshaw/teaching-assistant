"use client";

// Snapshot grading, WAVE 4 (docs/snapshot-grading-acceptance-criteria.md).
// A REACHABLE panel: arm a role, snap the shared screen (or paste/drop an
// image), and manage a tray of shots. Grading is the NEXT wave - this panel
// calls no server action and mounts no prompt/result surface. A0-2's
// no-write-back ceiling is trivially true here: there is nothing to grade
// yet, so there is nothing that could be posted.
//
// A6d/X7: kept mounted, display:none'd by RecordingTab when another sub-tab
// is active (the `active` prop below) - a live MediaStream keeps running
// behind a hidden panel exactly like every sibling capture surface's does.
// This panel does nothing special about that itself (no pause-on-hide): the
// stream stays live so the instructor can switch tabs mid-session without
// losing their share, matching A6d's "make it deliberate" instruction by
// deliberately choosing to keep it running, the same choice every sibling
// panel already makes.

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "../../page.module.css";
import { extractPastedImageFiles, isFileDragTypes } from "@/lib/chat/attachments";
import { useSnapshotCapture } from "./useSnapshotCapture";
import { useSnapshotShots } from "./useSnapshotShots";
import { checkShotWireBudget, groupShotsByRole, MAX_SHOTS, type SnapshotRole } from "./snapshot-shot";
import SnapshotCaptureBar from "./SnapshotCaptureBar";
import SnapshotShotTray from "./SnapshotShotTray";
import controls from "../recording/RecordingControls.module.css";
import panelStyles from "./SnapshotGrading.module.css";

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
    </div>
  );
}
