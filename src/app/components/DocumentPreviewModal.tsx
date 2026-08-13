"use client";

// The shared preview/edit window for every generated document - syllabus,
// rubric, schedule, handout, test, activity, and anything else a workflow
// produces. Callers hand it text and (optionally) a save handler; it provides
// a read view, a direct edit view, and a box for asking the model to rewrite
// the document with typed instructions.
//
// It is deliberately text-only. Every generator in the app builds a plain,
// markdown-ish string that buildDocxFromPlainText later renders, so text is
// the one representation they all share - and the one the model can revise.

import { useState, type RefObject } from "react";
import { Button, TextField, CircularProgress } from "@mui/material";
import { reviseDocumentAction } from "@/app/actions";
import { getStoredProvider } from "@/lib/llm-provider";
import styles from "../page.module.css";
import { ModalShell } from "./ui/ModalShell";

export interface DocumentPreviewModalProps {
  /** File or document name, shown in the header. */
  name: string;
  /** A short description of what this document is, shown under the name. */
  meta?: string;
  /** The document's current text. */
  text: string;
  /**
   * Persist edited text. Omit for a read-only document (the editor and the
   * revision box are still available, but changes are session-only and the
   * modal says so).
   */
  onSave?: (text: string) => Promise<void>;
  /** Offer a download of the current text as a .txt file. */
  downloadFileName?: string;
  onClose: () => void;
  /** The opener to return focus to on close, forwarded to ModalShell. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** Ordered fallbacks tried after `restoreFocusRef`. */
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
}

export default function DocumentPreviewModal({
  name,
  meta,
  text,
  onSave,
  downloadFileName,
  onClose,
  restoreFocusRef,
  fallbackFocusRefs,
}: DocumentPreviewModalProps) {
  const [draft, setDraft] = useState(text);
  const [editing, setEditing] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState<"revise" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const dirty = draft !== text;

  const handleRevise = async () => {
    setBusy("revise");
    setError(null);
    setNote(null);
    const result = await reviseDocumentAction(draft, instructions, getStoredProvider());
    setBusy(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setDraft(result.text);
    setInstructions("");
    // Land the user on the edited text so the rewrite is reviewable before it
    // is saved - a revision is never persisted on its own.
    setEditing(true);
    setNote("Revised. Review it, then save.");
  };

  const handleSave = async () => {
    if (!onSave) return;
    setBusy("save");
    setError(null);
    setNote(null);
    try {
      await onSave(draft);
      setNote("Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the document.");
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([draft], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFileName || `${name || "document"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <ModalShell
      label={`Preview of ${name}`}
      onDismiss={onClose}
      restoreFocusRef={restoreFocusRef}
      fallbackFocusRefs={fallbackFocusRefs}
    >
        <div className={styles.previewHeader}>
          <div>
            <h3>{name}</h3>
            <p className={styles.previewMeta}>
              {meta || "Document"}
              {dirty ? " - unsaved changes" : ""}
            </p>
          </div>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", padding: "0 1rem", flexWrap: "wrap" }}>
          <Button size="small" variant="text" onClick={() => setEditing((v) => !v)} sx={{ textTransform: "none" }}>
            {editing ? "Preview" : "Edit"}
          </Button>
          {onSave && (
            <Button
              size="small"
              variant="contained"
              disabled={!dirty || busy !== null}
              onClick={handleSave}
              sx={{ textTransform: "none" }}
            >
              {busy === "save" ? "Saving..." : "Save"}
            </Button>
          )}
          <Button size="small" variant="text" onClick={handleDownload} sx={{ textTransform: "none" }}>
            Download
          </Button>
          {dirty && (
            <Button
              size="small"
              variant="text"
              disabled={busy !== null}
              onClick={() => {
                setDraft(text);
                setNote(null);
                setError(null);
              }}
              sx={{ textTransform: "none" }}
            >
              Revert
            </Button>
          )}
        </div>

        <div className={styles.previewContent} style={{ overflow: "auto" }}>
          {editing ? (
            <TextField
              multiline
              fullWidth
              minRows={18}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              slotProps={{ input: { style: { fontFamily: "var(--font-mono, monospace)", fontSize: "0.85rem" } } }}
            />
          ) : draft.trim() === "" ? (
            <p className={styles.previewMeta}>This document has no text to preview.</p>
          ) : (
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontSize: "0.9rem" }}>
              {draft}
            </pre>
          )}
        </div>

        <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid var(--border-soft)" }}>
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            label="Ask for changes"
            placeholder="e.g. shorten the overview, add a late-work policy, make the tone more formal"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            disabled={busy !== null}
          />
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem" }}>
            <Button
              size="small"
              variant="contained"
              disabled={busy !== null || instructions.trim() === ""}
              onClick={handleRevise}
              sx={{ textTransform: "none" }}
            >
              Regenerate with these instructions
            </Button>
            {busy === "revise" && <CircularProgress size={18} />}
            {!onSave && (
              <span className={styles.previewMeta}>
                This document cannot be saved from here - download the result instead.
              </span>
            )}
          </div>
          {error && (
            <p className={styles.previewMeta} style={{ color: "var(--danger)", marginTop: "0.5rem" }}>
              {error}
            </p>
          )}
          {note && !error && (
            <p className={styles.previewMeta} style={{ marginTop: "0.5rem" }}>
              {note}
            </p>
          )}
        </div>
    </ModalShell>
  );
}
