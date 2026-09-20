"use client";

// Snapshot grading, WAVE 4 - the capture bar (U2 of the UX pass). The
// armed-role SegmentedToggle sits LEFT of Snap in the same row, and Snap's
// own label carries the role ("Snap rubric") - a bare "Snap" would make a
// mis-armed shot invisible at the exact moment it is taken, which is the
// mistake A2 already predicts.

import Button from "@mui/material/Button";
import { formatMB } from "@/lib/upload-budget";
import SegmentedToggle from "../ui/SegmentedToggle";
import { SNAPSHOT_ROLES, SNAPSHOT_ROLE_LABELS, MAX_SHOTS, type SnapshotRole } from "./snapshot-shot";
import type { RubricCaptureNotice } from "./useSnapshotRubricCapture";
import controls from "../recording/RecordingControls.module.css";
import bar from "./SnapshotGrading.module.css";

export interface SnapshotCaptureBarProps {
  armedRole: SnapshotRole;
  onArmedRoleChange: (role: SnapshotRole) => void;
  roleCounts: Record<SnapshotRole, number>;
  sharing: boolean;
  onStartShare: () => void;
  onStopShare: () => void;
  onSnap: () => void;
  shotCount: number;
  wireBytes: number;
  shareError: string | null;
  encodeNotice: string | null;
  /** N14 WAVE 2: the Alt+R chord's busy/failure notice, rendered here rather
   *  than inlined in the panel (a line-budget win found in the reuse survey,
   *  n14-architecture.md section 8) - same pattern as encodeNotice above. */
  rubricCaptureNotice: RubricCaptureNotice;
}

export default function SnapshotCaptureBar({
  armedRole,
  onArmedRoleChange,
  roleCounts,
  sharing,
  onStartShare,
  onStopShare,
  onSnap,
  shotCount,
  wireBytes,
  shareError,
  encodeNotice,
  rubricCaptureNotice,
}: SnapshotCaptureBarProps) {
  const atCapacity = shotCount >= MAX_SHOTS;
  const options = SNAPSHOT_ROLES.map((role) => ({
    value: role,
    label: SNAPSHOT_ROLE_LABELS[role],
    count: roleCounts[role],
  }));

  return (
    <div className={bar.captureBar}>
      <p className={bar.disclosure}>
        Nothing here leaves this device until you press Read or Grade, or press Alt+R while sharing a screen -
        those are the only three actions that send anything to Google&apos;s Gemini API, except that while
        auto-grade is armed, a landed submission shot can trigger the same Grade upload automatically. Reloading
        clears the shots in the tray, but completed assessments are kept and shown again after a reload.
      </p>

      {shareError && (
        <p role="alert" className={`${controls.notice} ${controls.noticeDanger}`}>
          {shareError}
        </p>
      )}
      {encodeNotice && (
        <p role="status" aria-live="polite" className={`${controls.notice} ${controls.noticeWarning}`}>
          {encodeNotice}
        </p>
      )}
      {rubricCaptureNotice && (
        <p
          role={rubricCaptureNotice.kind === "failure" ? "alert" : "status"}
          aria-live="polite"
          className={`${controls.notice} ${rubricCaptureNotice.kind === "failure" ? controls.noticeDanger : controls.noticeWarning}`}
        >
          {rubricCaptureNotice.message}
        </p>
      )}

      <div className={bar.captureRow}>
        <SegmentedToggle
          label="Role to arm"
          showLabel
          options={options}
          value={armedRole}
          onChange={onArmedRoleChange}
        />
        <Button
          size="small"
          variant="contained"
          disabled={!sharing || atCapacity}
          onClick={onSnap}
          sx={{ textTransform: "none" }}
        >
          {`Snap ${SNAPSHOT_ROLE_LABELS[armedRole].toLowerCase()}`}
        </Button>
        {!sharing ? (
          <Button size="small" variant="outlined" onClick={onStartShare} sx={{ textTransform: "none" }}>
            Share a window
          </Button>
        ) : (
          <Button size="small" variant="outlined" onClick={onStopShare} sx={{ textTransform: "none" }}>
            Stop sharing
          </Button>
        )}
      </div>

      {/* N14 WAVE 1/2 (Ruling N14-16): rewritten, not appended to - the old
          wording applied its "no modifier" qualifier to the whole list, which
          would read false the instant a chord existed. The bare keys keep
          their own qualifier; each chord gets its own, separate one. Alt+S
          was considered and struck (n14-architecture.md section 0) - bare
          "s" stays the only snap binding. */}
      <p className={bar.keyHint}>
        Keyboard: S to snap (while auto-grade is armed, a snap can also start an automatic Grade
        upload), N for next student, 1-6 to arm a role (Assignment, Rubric, Post, Replies, Submission,
        Other) - none of these take Ctrl, Alt, or Cmd/Win. Alt+G also arms Next Student (Space
        confirms) - Alt alone, not Ctrl+Alt (AltGr) or Cmd/Win. Alt+R captures the shared screen,
        transcribes it, and opens it for review before it can become the rubric -
        also Alt alone, not Ctrl+Alt (AltGr) or Cmd/Win.
      </p>

      <p aria-live="polite" role="status" className={bar.wireFigure}>
        {`${shotCount} of ${MAX_SHOTS} shots - ${formatMB(wireBytes)} on the wire so far.`}
        {atCapacity ? " At the shot limit - delete a shot to add another." : ""}
      </p>
    </div>
  );
}
