"use client";

import { useState, type RefObject } from "react";
import { Button } from "@mui/material";
import styles from "../../page.module.css";
import { updateGradingDraftPayloadAction } from "../../actions";
import type { GradingDraftPayload } from "@/lib/grading-drafts";
import { replaceAreaComment } from "@/lib/grading-draft-edit";
import { ModalShell } from "../ui/ModalShell";

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
  /** The opener to return focus to on close, forwarded to ModalShell. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** Ordered fallbacks tried after `restoreFocusRef`. */
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
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
  restoreFocusRef,
  fallbackFocusRefs,
}: CommentEditModalProps) {
  const [comment, setComment] = useState(initialComment);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [discardConfirm, setDiscardConfirm] = useState(false);

  const isDirty = comment !== initialComment;

  // Every dismissal route funnels through here - the header Close button, the
  // Cancel button, Escape and the backdrop click (ModalShell's onDismiss).
  // That is why the `saving` guard lives in the HANDLER and not only as a
  // `disabled` attribute: `disabled` can stop a button, but nothing about it
  // reaches Escape or a backdrop click, and both of those arrive here too.
  // Decision 6 in docs/modal-dismissal-focus-acceptance-criteria.md says it
  // outright - the handler is the policy, and the hook never decides.
  //
  // Without the guard, closing mid-save was reachable: Save requires isDirty,
  // so a save in flight always implies isDirty, which means two dismissals
  // during the save were enough - the first armed `discardConfirm`, and the
  // second found `isDirty && !discardConfirm` false and fell straight through
  // to onClose(). The in-flight promise then either applied an edit the
  // instructor believed they had discarded, or reported a FAILURE to a modal
  // that no longer existed, where React drops the setState silently and the
  // save appears to have succeeded. This predates the shared Escape mechanism
  // (Close, Save, Close was always enough with a mouse); adopting the shell
  // added a keyboard route to it.
  //
  // Refusing outright, rather than making the control merely inert, is this
  // file's own existing policy: the textarea, Cancel, Keep editing, Discard
  // and Save are all already `disabled={saving}`. The header Close was the one
  // control that never encoded it.
  const handleClose = () => {
    if (saving) return;
    if (isDirty && !discardConfirm) {
      setDiscardConfirm(true);
      return;
    }
    setDiscardConfirm(false);
    onClose();
  };

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
    <ModalShell
      label={`Edit comment for ${studentName} - ${areaName}`}
      onDismiss={handleClose}
      restoreFocusRef={restoreFocusRef}
      fallbackFocusRefs={fallbackFocusRefs}
    >
        <div className={styles.previewHeader}>
          <div>
            <p className={styles.previewMeta}>Student: {studentName}</p>
            <h3>{areaName}</h3>
            <p className={styles.previewMeta}>{draftSummary}</p>
          </div>
          {/* handleClose already refuses while saving; this makes the control
              LOOK the way it behaves, and matches the textarea, Cancel, Keep
              editing, Discard and Save, which were all already disabled here. */}
          <button type="button" className={styles.previewCloseButton} onClick={handleClose} disabled={saving}>
            Close
          </button>
        </div>

        <div style={{ padding: "var(--space-4)", borderBottom: "1px solid var(--border-soft)" }}>
          <p className={styles.previewMeta}>Preview</p>
          <pre
            className={styles.previewContent}
            style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}
          >
            {initialComment}
          </pre>
        </div>

        <div style={{ padding: "var(--space-4)" }}>
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
              padding: "var(--space-2)",
              border: "1px solid var(--field-border)",
              borderRadius: "var(--radius-xs)",
              fontFamily: "inherit",
              fontSize: "var(--font-size-md)",
              resize: "vertical",
            }}
            disabled={saving}
          />
        </div>

        {error && (
          <div style={{ padding: "var(--space-4)", borderTop: "1px solid var(--danger-border)", backgroundColor: "var(--danger-surface)" }}>
            <p style={{ margin: 0, color: "var(--danger)", fontSize: "var(--font-size-md)" }}>
              {error}
            </p>
          </div>
        )}

        {discardConfirm && (
          <div style={{ padding: "var(--space-4)", borderTop: "1px solid var(--warning-border)", backgroundColor: "var(--warning-surface)" }}>
            <p style={{ margin: "0 0 var(--space-2) 0", fontSize: "var(--font-size-md)" }}>Discard changes?</p>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
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

        <div style={{ padding: "var(--space-4)", display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", borderTop: "1px solid var(--border-soft)" }}>
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
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
    </ModalShell>
  );
}
