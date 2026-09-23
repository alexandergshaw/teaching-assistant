"use client";

// A39 wave 3a-i (headroom-only extraction, RULING 32/33): the
// assignment/rubric/instructions/action-buttons half of
// SnapshotGradingPanel.tsx's JSX tail, grouped into ONE component for the
// same "fewer, larger" reason as SnapshotCaptureSection.tsx's own header
// explains. No state of its own - every value and callback is the panel's.
// Branch (a) (docs/owner-decisions-2026-09-23.md DECISION 7): no oracle;
// the ceiling gate, this directory's structure-test anchors, and
// `npm run lint` are what remain.

import type { Ref } from "react";
import { TextField, Button, Checkbox, FormControlLabel } from "@mui/material";
import styles from "../../page.module.css";

export interface SnapshotInstructionsSectionProps {
  assignmentText: string;
  onAssignmentTextChange: (value: string) => void;
  rubricText: string;
  onOpenRubricModal: () => void;
  rubricButtonRef: Ref<HTMLButtonElement>;
  instructorInstructions: string;
  onInstructorInstructionsChange: (value: string) => void;
  autoGradeArmed: boolean;
  onAutoGradeArmedChange: (armed: boolean) => void;
  reading: boolean;
  onRead: () => void;
  shotCount: number;
  grading: boolean;
  onGrade: () => void;
  gradeDisabled: boolean;
}

export default function SnapshotInstructionsSection({
  assignmentText,
  onAssignmentTextChange,
  rubricText,
  onOpenRubricModal,
  rubricButtonRef,
  instructorInstructions,
  onInstructorInstructionsChange,
  autoGradeArmed,
  onAutoGradeArmedChange,
  reading,
  onRead,
  shotCount,
  grading,
  onGrade,
  gradeDisabled,
}: SnapshotInstructionsSectionProps) {
  return (
    <>
      <p className={styles.fieldHint}>
        A rubric or assignment you can paste as text is more reliable than a photograph of it (A3a) - the shot is a
        fallback, not the preferred path.
      </p>
      <TextField
        label="Assignment instructions (optional - pasted text preferred over a shot)"
        value={assignmentText}
        onChange={(e) => onAssignmentTextChange(e.target.value)}
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
      <Button variant="outlined" size="small" ref={rubricButtonRef} onClick={onOpenRubricModal}>
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
        onChange={(e) => onInstructorInstructionsChange(e.target.value)}
        multiline
        minRows={2}
        fullWidth
        size="small"
        slotProps={{ htmlInput: { "aria-label": "Instructor-authored grading instructions" } }}
      />

      <p className={styles.fieldHint}>
        Reading, grading, and the Alt+R rubric-capture chord each upload to Google&apos;s Gemini API
        (generativelanguage.googleapis.com) - the only three actions that send anything from this machine. Nothing is
        sent until you press Read or Grade, or press Alt+R while sharing a screen - except that while auto-grade
        below is armed, a landed submission shot triggers the same Grade upload automatically, with no separate
        button press.
      </p>

      <FormControlLabel
        control={
          // SHOULD-FIX 7: no aria-label - it would override the visible label text (MUI 9.0.1's `input` slot is the native input).
          <Checkbox checked={autoGradeArmed} onChange={(e) => onAutoGradeArmedChange(e.target.checked)} />
        }
        label="Auto-grade each submission as it lands (armed - confirms once per page load before the first automatic upload)"
      />

      <div className={styles.ghActions}>
        <Button variant="outlined" onClick={onRead} disabled={reading || shotCount === 0}>
          {reading ? "Reading..." : "Read shots"}
        </Button>
        <Button variant="contained" onClick={onGrade} disabled={gradeDisabled}>
          {grading ? "Grading..." : "Grade"}
        </Button>
      </div>
    </>
  );
}
