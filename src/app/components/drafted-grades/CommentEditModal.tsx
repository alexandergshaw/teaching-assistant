"use client";

import { useState } from "react";
import { Button } from "@mui/material";
import styles from "../../page.module.css";
import { updateGradingDraftPayloadAction } from "../../actions";
import type { GradingDraftPayload } from "@/lib/grading-drafts";
import { replaceAreaComment } from "@/lib/grading-draft-edit";

export type CommentEditModalProps = {
  studentName: string;
  areaName: string;
  draftSummary: string;
  initialComment: string;
  payload: GradingDraftPayload;
  runIndex: number;
  resultIndex: number;
  draftId: string;
  onSave: (newPayload: GradingDraftPayload) => void;
  onClose: () => void;
};

export default function CommentEditModal({
  studentName,
  areaName,
  draftSummary,
  initialComment,
  payload,
  runIndex,
  resultIndex,
  draftId,
  onSave,
  onClose,
}: CommentEditModalProps) {
  const [comment, setComment] = useState(initialComment);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);

  const isDirty = comment !== initialComment;

  const handleClose = () => {
    if (isDirty && !discardConfirm) {
      setDiscardConfirm(true);
      return;
    }
    setDiscardConfirm(false);
    onClose();
  };

  const handleBackdropClick = handleClose;

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const newPayload = replaceAreaComment(payload, runIndex, resultIndex, areaName, comment);
      const result = await updateGradingDraftPayloadAction(draftId, newPayload);

      if ("error" in result) {
        setError(result.error);
        setSaving(false);
        return;
      }

      onSave(newPayload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  };

  return (
    <div className={styles.previewBackdrop} onClick={handleBackdropClick}>
      <section
        className={styles.previewModal}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit comment for ${studentName} - ${areaName}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <div>
            <p className={styles.previewMeta}>Student: {studentName}</p>
            <h3>{areaName}</h3>
            <p className={styles.previewMeta}>{draftSummary}</p>
          </div>
          <button type="button" className={styles.previewCloseButton} onClick={handleClose}>
            Close
          </button>
        </div>

        <div style={{ padding: "16px", borderBottom: "1px solid var(--field-border)" }}>
          <p className={styles.previewMeta}>Preview</p>
          <pre
            className={styles.previewContent}
            style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}
          >
            {initialComment}
          </pre>
        </div>

        <div style={{ padding: "16px" }}>
          <label htmlFor="comment-edit" className={styles.previewMeta}>
            Edit
          </label>
          <textarea
            id="comment-edit"
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              setDiscardConfirm(false);
            }}
            style={{
              width: "100%",
              minHeight: "120px",
              padding: "8px",
              border: "1px solid var(--field-border)",
              borderRadius: "4px",
              fontFamily: "inherit",
              fontSize: "14px",
              resize: "vertical",
            }}
            disabled={saving}
          />
        </div>

        {error && (
          <div style={{ padding: "16px", borderTop: "1px solid var(--field-border)", backgroundColor: "var(--error-bg)" }}>
            <p style={{ margin: 0, color: "var(--error-color)", fontSize: "14px" }}>
              {error}
            </p>
          </div>
        )}

        {discardConfirm && (
          <div style={{ padding: "16px", borderTop: "1px solid var(--field-border)", backgroundColor: "var(--warning-bg)" }}>
            <p style={{ margin: "0 0 8px 0", fontSize: "14px" }}>Discard changes?</p>
            <div style={{ display: "flex", gap: "8px" }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setDiscardConfirm(false)}
                disabled={saving}
              >
                Keep editing
              </Button>
              <Button
                size="small"
                variant="text"
                onClick={onClose}
                disabled={saving}
              >
                Discard
              </Button>
            </div>
          </div>
        )}

        <div style={{ padding: "16px", display: "flex", gap: "8px", justifyContent: "flex-end", borderTop: "1px solid var(--field-border)" }}>
          <Button
            variant="outlined"
            size="small"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleSave}
            disabled={saving || !isDirty}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </section>
    </div>
  );
}
