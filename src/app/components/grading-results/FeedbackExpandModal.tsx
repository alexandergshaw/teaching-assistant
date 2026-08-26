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
import { FEEDBACK_FIELD_META, type FeedbackField, type RowEdit } from "./gradingResultsHelpers";

export interface FeedbackExpandModalProps {
  student: string;
  field: FeedbackField;
  edit: RowEdit;
  onChange: (field: FeedbackField, value: string) => void;
  onClose: () => void;
}

export function FeedbackExpandModal({ student, field, edit, onChange, onClose }: FeedbackExpandModalProps) {
  const meta = FEEDBACK_FIELD_META[field];
  return (
    <ModalShell label={`${meta.descriptorCapitalized} for ${student}`} onDismiss={onClose}>
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
        aria-label={`${meta.descriptorCapitalized} for ${student} (expanded)`}
        fullWidth
        size="small"
        minRows={12}
      />
    </ModalShell>
  );
}

export default FeedbackExpandModal;
