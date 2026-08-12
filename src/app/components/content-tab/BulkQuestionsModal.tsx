"use client";

import type React from "react";
import styles from "../../page.module.css";
import type { EditableQuestion } from "./types";
import { DraftQuizQuestions } from "./DraftQuizQuestions";
import Button from "@mui/material/Button";
import { ModalShell } from "../ui/ModalShell";

export function BulkQuestionsModal({
  questions,
  setQuestions,
  onClose,
}: {
  questions: EditableQuestion[];
  setQuestions: React.Dispatch<React.SetStateAction<EditableQuestion[]>>;
  onClose: () => void;
}) {
  return (
    // width/maxWidth restore this modal's pre-ModalShell size (760px, capped
    // at 95vw) instead of the shell's 980px default - see git history on
    // this file for the inline style this replaces.
    <ModalShell
      label="Questions for new quizzes"
      onDismiss={onClose}
      contentStyle={{ width: "min(760px, 95vw)", maxWidth: "none" }}
    >
        <div className={styles.previewHeader}>
          <h3>Questions for new quizzes</h3>
          <Button variant="outlined" size="small" className={styles.previewCloseButton} onClick={onClose}>
            Done
          </Button>
        </div>
        <p className={styles.fieldHint} style={{ marginTop: 0 }}>
          These questions are written into every quiz created by &quot;Add to each&quot;. They are not saved
          until you run Add.
        </p>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          <DraftQuizQuestions questions={questions} setQuestions={setQuestions} />
        </div>
    </ModalShell>
  );
}

// ── Rubric builder ────────────────────────────────────────────────────────────

