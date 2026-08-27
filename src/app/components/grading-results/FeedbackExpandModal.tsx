"use client";

// The per-box "expand feedback" modal - moved out of GradingResults.tsx
// (originally the `expandedBox &&` IIFE block at :823-856) as its own
// component. Pure MOVE, not a rewrite: same ModalShell, same header layout,
// same multiline TextField, same aria-labels. One modal, parameterized by
// which of the three feedback boxes (`field`) is currently expanded - not
// three separate modal components - matching the pre-move code, which had
// exactly one `expandedBox` state slot and one render block for it.
//
// `edit` is resolved by the CALLER (GradingResults.tsx), not looked up here,
// so this component stays a plain function of its props with no knowledge of
// the `edits` map's shape or fallback rules - the caller already has that
// logic (`edits[student] ?? blankRowEdit()`) for its own other renders.
import TextField from "@mui/material/TextField";
import { ModalShell } from "../ui/ModalShell";
import styles from "../../page.module.css";
import { FEEDBACK_FIELD_META, type FeedbackBoxesEdit, type FeedbackField } from "./gradingResultsHelpers";

export interface FeedbackExpandModalProps {
  student: string;
  field: FeedbackField;
  edit: FeedbackBoxesEdit;
  onChange: (field: FeedbackField, value: string) => void;
  onClose: () => void;
  /** Same as RowFeedbackBoxes.tsx's own `namePrefix` prop - see that file's
   * doc comment. Repo Grades passes the folder column name here so this
   * modal's own label/aria-label stay consistent with the inline boxes'
   * naming even though only one instance of this modal is ever open at a
   * time. */
  namePrefix?: string;
}

export function FeedbackExpandModal({ student, field, edit, onChange, onClose, namePrefix }: FeedbackExpandModalProps) {
  const meta = FEEDBACK_FIELD_META[field];
  const label = namePrefix ? `${namePrefix} ${meta.descriptorLower} for ${student}` : `${meta.descriptorCapitalized} for ${student}`;
  return (
    <ModalShell label={label} onDismiss={onClose}>
      <div className={styles.previewHeader}>
        <div>
          <p className={styles.previewMeta}>Student: {student}</p>
          <h3>{meta.fieldLabel}</h3>
        </div>
        <button type="button" className={styles.previewCloseButton} onClick={onClose}>
          Close
        </button>
      </div>
      <TextField
        multiline
        value={edit[field]}
        onChange={(event) => onChange(field, event.target.value)}
        aria-label={`${label} (expanded)`}
        fullWidth
        size="small"
        minRows={12}
      />
    </ModalShell>
  );
}

export default FeedbackExpandModal;
