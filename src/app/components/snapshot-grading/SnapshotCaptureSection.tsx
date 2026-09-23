"use client";

// A39 wave 3a-i (headroom-only extraction, RULING 32/33): the capture/tray
// half of SnapshotGradingPanel.tsx's JSX tail, grouped into ONE component
// rather than several - RULING 33 measured that each extraction boundary
// costs its own call site, and at this file's headroom the call sites are
// the budget, so fewer/larger wins over many/small. This component owns no
// state of its own; every value and callback below is the panel's, passed
// through unchanged. Branch (a) (docs/owner-decisions-2026-09-23.md DECISION
// 7): a `.tsx` leaf with no oracle - nothing renders under vitest here, so
// the only instruments left are the ceiling gate, this directory's
// structure-test anchors, and `npm run lint`.

import type { Ref, RefObject } from "react";
import { Button } from "@mui/material";
import styles from "../../page.module.css";
import panelStyles from "./SnapshotGrading.module.css";
import controls from "../recording/RecordingControls.module.css";
import { visuallyHidden } from "../ui/visuallyHidden";
import SnapshotCaptureBar from "./SnapshotCaptureBar";
import SnapshotShotTray from "./SnapshotShotTray";
import SnapshotRoleSuggestions from "./SnapshotRoleSuggestions";
import ConfirmArmButtons from "../ui/ConfirmArmButtons";
import { describeNextStudentCounts, type NextStudentCounts, type SnapshotRole, type SnapshotShot } from "./snapshot-shot";
import type { PendingRoleSuggestion } from "./snapshot-role-suggestion";
import type { RubricCaptureNotice } from "./useSnapshotRubricCapture";

export interface SnapshotCaptureSectionProps {
  previewRef: RefObject<HTMLVideoElement | null>;
  liveRegionRef: RefObject<HTMLParagraphElement | null>;
  sharing: boolean;
  // RES-N15-4: named to match the panel's own handleFiles/handleZipFile
  // literally, not renamed to a generic "onXChosen" - the structure test
  // that pins this control's wiring greps for those two call names.
  handleFiles: (files: readonly File[], source: "paste" | "drop") => Promise<void>;
  handleZipFile: (file: File) => Promise<void>;
  armedRole: SnapshotRole;
  onArmedRoleChange: (role: SnapshotRole) => void;
  roleCounts: Record<SnapshotRole, number>;
  onStartShare: () => void;
  onStopShare: () => void;
  onSnap: () => void;
  wireBytes: number;
  shareError: string | null;
  encodeNotice: string | null;
  rubricCaptureNotice: RubricCaptureNotice;
  shots: SnapshotShot[];
  onRemoveShot: (id: string) => void;
  onSetShotRole: (id: string, role: SnapshotRole) => void;
  onSetShotNote: (id: string, note: string) => void;
  onMoveShot: (id: string, direction: -1 | 1) => void;
  pendingSuggestions: readonly PendingRoleSuggestion[];
  onAcceptAllSuggestions: () => void;
  nextStudentCounts: NextStudentCounts;
  nextStudentArmed: boolean;
  onArmNextStudent: () => void;
  onConfirmNextStudent: () => void;
  onCancelNextStudent: () => void;
  nextStudentButtonRef: Ref<HTMLButtonElement>;
}

export default function SnapshotCaptureSection({
  previewRef,
  liveRegionRef,
  sharing,
  handleFiles,
  handleZipFile,
  armedRole,
  onArmedRoleChange,
  roleCounts,
  onStartShare,
  onStopShare,
  onSnap,
  wireBytes,
  shareError,
  encodeNotice,
  rubricCaptureNotice,
  shots,
  onRemoveShot,
  onSetShotRole,
  onSetShotNote,
  onMoveShot,
  pendingSuggestions,
  onAcceptAllSuggestions,
  nextStudentCounts,
  nextStudentArmed,
  onArmNextStudent,
  onConfirmNextStudent,
  onCancelNextStudent,
  nextStudentButtonRef,
}: SnapshotCaptureSectionProps) {
  return (
    <>
      <p className={styles.fieldHint}>
        Snap a screenshot of the assignment, rubric, post, replies, or submission - or paste/drop one -
        and manage the tray below. Grade directly from the tray whenever you are ready - Read first
        only if you want to review or edit a transcription before grading.
      </p>

      {/* RES-N15-4 / WCAG 2.2 SC 2.5.7: click-to-browse alternative to the
          drop target on the panel's own root - same handleFiles/handleZipFile
          calls, RubricInputModal.tsx's component="label" + role={undefined} recipe. */}
      <Button component="label" role={undefined} tabIndex={-1} className={controls.uploadLabel}
        variant="outlined" size="small" sx={{ alignSelf: "flex-start", textTransform: "none" }}>
        Choose files
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,.zip,application/zip" multiple style={visuallyHidden}
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            const images = picked.filter((f) => f.type.startsWith("image/"));
            const zips = picked.filter((f) => !f.type.startsWith("image/") && f.name.toLowerCase().endsWith(".zip"));
            if (images.length > 0) void handleFiles(images, "drop");
            for (const zip of zips) void handleZipFile(zip);
            e.target.value = "";
          }}
        />
      </Button>

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
        onArmedRoleChange={onArmedRoleChange}
        roleCounts={roleCounts}
        sharing={sharing}
        onStartShare={onStartShare}
        onStopShare={onStopShare}
        onSnap={onSnap}
        shotCount={shots.length}
        wireBytes={wireBytes}
        shareError={shareError}
        encodeNotice={encodeNotice}
        rubricCaptureNotice={rubricCaptureNotice}
      />

      <SnapshotShotTray
        shots={shots}
        onRemove={onRemoveShot}
        onSetRole={onSetShotRole}
        onSetNote={onSetShotNote}
        onMove={onMoveShot}
      />

      <SnapshotRoleSuggestions suggestions={pendingSuggestions} onAcceptAll={onAcceptAllSuggestions} />

      <p id="snap-next-student-consequence" className={styles.fieldHint}>
        {describeNextStudentCounts(nextStudentCounts)}
      </p>
      <ConfirmArmButtons
        armed={nextStudentArmed}
        idleLabel="Next student"
        confirmLabel="Confirm - clear this student's shots"
        tone="warning"
        onArm={onArmNextStudent}
        onConfirm={onConfirmNextStudent}
        onCancel={onCancelNextStudent}
        consequenceId="snap-next-student-consequence"
        buttonRef={nextStudentButtonRef}
      />
    </>
  );
}
