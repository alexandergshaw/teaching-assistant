"use client";

// The Grading fieldset inside the recording grader's Setup region, extracted
// from GradingRecordingPanel.tsx (1000-line ceiling) with wave 2 of the UX
// overhaul (docs/grading-recording-ux-overhaul-scope.md, Move B, FORK 2 =
// inline + retained upload). Pasting or editing the rubric happens right here,
// with no modal round-trip; the RubricInputModal is kept for the file-UPLOAD
// path only ("Upload a file"). State lives in useGradingRubric; this is
// presentational. The modal itself is mounted by the panel, OUTSIDE the
// collapsible Setup <details>: a modal opened by the Knowledge-base launch
// event while Setup is collapsed must still be visible.
import { useId, type RefObject } from "react";
import Button from "@mui/material/Button";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import sharedStyles from "./GradingTable.module.css";
import type { GradingRubricState } from "./useGradingRubric";

export default function GradingRubricField({
  rubric,
  uploadButtonRef,
}: {
  rubric: GradingRubricState;
  uploadButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const textareaId = useId();
  const { rubricText, editRubric, setModalOpen, origin } = rubric;

  return (
    <fieldset className={controls.section}>
      <legend className={controls.sectionLegend}>Grading</legend>
      <div className={styles.field}>
        <label htmlFor={textareaId}>Rubric</label>
        <textarea
          id={textareaId}
          value={rubricText}
          onChange={(event) => editRubric(event.target.value)}
          rows={5}
          placeholder="Paste or type the grading rubric here. It is remembered for this course."
          className={sharedStyles.rubricTextarea}
        />
      </div>
      <div className={styles.ghActions}>
        <Button variant="outlined" size="small" ref={uploadButtonRef} onClick={() => setModalOpen(true)}>
          Upload a file
        </Button>
      </div>
      <p className={styles.fieldHint}>
        {rubricText.trim()
          ? `Rubric set (${rubricText.trim().length} characters).`
          : "No rubric yet - you can capture submissions first and add one when you are ready to grade."}
      </p>
      {origin && <p className={styles.fieldHint}>{origin}</p>}
    </fieldset>
  );
}
