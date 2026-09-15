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
        Nothing here leaves this device until you press Read or Grade - both send shots to Google&apos;s
        Gemini API. Reloading clears the shots in the tray, but completed assessments are kept and shown
        again after a reload.
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

      <p className={bar.keyHint}>
        Keyboard (no Ctrl, Alt, or Cmd/Win key held): S to snap, N for next student, 1-6 to arm a
        role (Assignment, Rubric, Post, Replies, Submission, Other).
      </p>

      <p aria-live="polite" role="status" className={bar.wireFigure}>
        {`${shotCount} of ${MAX_SHOTS} shots - ${formatMB(wireBytes)} on the wire so far.`}
        {atCapacity ? " At the shot limit - delete a shot to add another." : ""}
      </p>
    </div>
  );
}
