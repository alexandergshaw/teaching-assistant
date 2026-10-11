"use client";

// L5 of docs/live-lms-student-messaging-scope.md: the "Messaging (N) Selected
// Students" modal. A chip list of the selected students, a Subject field, a
// Variables row of insertable tokens, a body textarea, PREVIEW and Cancel.
// Preview renders each student's OWN substituted message via renderForStudents
// (L6). THERE IS NO SEND HERE: the send action, the confirm step and the job
// are W4. The draft (subject + body) is owned by the view shell
// (useMessagingDraft), not by this modal, so it survives closing the modal, an
// institution switch and a reload.

import { useRef, useState } from "react";
import type { EnrollmentRow } from "@/lib/live-messaging/enrollment-aggregator";
import type { MessagingDraft } from "@/lib/live-messaging/messaging-draft";
import { insertAtSelection, rowToTokenValues, tokenText } from "@/lib/live-messaging/preview-model";
import {
  TEMPLATE_TOKENS,
  isSendable,
  renderForStudents,
  type RenderedForStudent,
} from "@/lib/live-messaging/template-substitution";
import { ModalShell } from "../ui/ModalShell";
import styles from "./SuccessTracking.module.css";

// Constant, generic accessible name for ModalShell (never built from a name or
// a count).
const MODAL_LABEL = "Message selected students";

export interface MessagingModalProps {
  students: readonly EnrollmentRow[];
  draft: MessagingDraft;
  onDraftChange: (patch: Partial<MessagingDraft>) => void;
  onClose: () => void;
}

interface PreviewEntry {
  row: EnrollmentRow;
  rendered: RenderedForStudent;
}

export default function MessagingModal({ students, draft, onDraftChange, onClose }: MessagingModalProps) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [previews, setPreviews] = useState<PreviewEntry[] | null>(null);

  // Editing the draft invalidates a rendered preview, so it is cleared.
  const edit = (patch: Partial<MessagingDraft>) => {
    setPreviews(null);
    onDraftChange(patch);
  };

  const insertToken = (token: (typeof TEMPLATE_TOKENS)[number]) => {
    const el = bodyRef.current;
    const start = el ? el.selectionStart : draft.body.length;
    const end = el ? el.selectionEnd : draft.body.length;
    const next = insertAtSelection(draft.body, tokenText(token), start, end);
    edit({ body: next.text });
    // Restore the caret after React re-renders the controlled value.
    requestAnimationFrame(() => {
      bodyRef.current?.focus();
      bodyRef.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const runPreview = () => {
    const rendered = renderForStudents(
      draft.subject,
      draft.body,
      students.map((row) => ({ key: row.key, values: rowToTokenValues(row) }))
    );
    const byKey = new Map(students.map((row) => [row.key, row]));
    setPreviews(
      rendered.flatMap((r) => {
        const row = byKey.get(r.key);
        return row ? [{ row, rendered: r }] : [];
      })
    );
  };

  return (
    <ModalShell label={MODAL_LABEL} onDismiss={onClose} contentStyle={{ maxWidth: "720px" }}>
      <div className={styles.modalBody}>
        <h2 className={styles.modalTitle}>
          {`Messaging (${students.length}) Selected Students`}
        </h2>

        <ul className={styles.chipList} aria-label="Selected students">
          {students.map((s) => (
            <li key={s.key} className={styles.chip}>
              {`${s.name} - ${s.course}`}
            </li>
          ))}
        </ul>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Subject</span>
          <input
            type="text"
            className={styles.input}
            value={draft.subject}
            onChange={(e) => edit({ subject: e.target.value })}
          />
        </label>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Variables</span>
          <div className={styles.tokenRow}>
            {TEMPLATE_TOKENS.map((token) => (
              <button key={token} type="button" className={styles.token} onClick={() => insertToken(token)}>
                {tokenText(token)}
              </button>
            ))}
          </div>
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Message</span>
          <textarea
            ref={bodyRef}
            className={styles.textarea}
            value={draft.body}
            onChange={(e) => edit({ body: e.target.value })}
          />
        </label>

        {previews ? (
          <ul className={styles.previewList} aria-label="Message preview">
            {previews.map(({ row, rendered }) => (
              <li key={row.key} className={styles.previewItem}>
                <div className={styles.previewTo}>{`To: ${row.name} (${row.course})`}</div>
                <div className={styles.previewSubject}>{rendered.subject.text}</div>
                <pre className={styles.previewText}>{rendered.body.text}</pre>
                {!isSendable(rendered.subject) || !isSendable(rendered.body) ? (
                  <div className={styles.previewWarn}>
                    This message has a missing or unrecognised variable.
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <div className={styles.modalActions}>
          <button type="button" className={styles.button} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            disabled={students.length === 0}
            onClick={runPreview}
          >
            Preview
          </button>
        </div>
        <p className={styles.hintMuted}>Preview only. Sending is not available yet.</p>
      </div>
    </ModalShell>
  );
}
