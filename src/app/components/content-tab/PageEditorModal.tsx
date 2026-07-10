"use client";

import { useEffect, useState } from "react";
import { getPageAction, revisePageWithAiAction, createPageAction, updatePageAction, deletePageAction } from "../../actions";
import type { LlmProvider } from "@/lib/llm";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import styles from "../../page.module.css";
import { previewDoc } from "./utils";
import { HtmlEditor } from "./HtmlEditor";

// ── Page editor modal ─────────────────────────────────────────────────────────

export function PageEditorModal({
  courseUrl,
  acronym,
  provider,
  pageUrl,
  onClose,
  onSaved,
}: {
  courseUrl: string;
  acronym?: string;
  provider: LlmProvider;
  /** Existing page slug to edit, or null to create a new page. */
  pageUrl: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = pageUrl === null;
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [aiInstr, setAiInstr] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [bodyBeforeAi, setBodyBeforeAi] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load the existing page's HTML body (await-first so no synchronous setState).
  useEffect(() => {
    if (pageUrl === null) return;
    let cancelled = false;
    (async () => {
      const result = await getPageAction(courseUrl, pageUrl, acronym);
      if (cancelled) return;
      if ("error" in result) {
        setLoadError(result.error);
        setLoading(false);
        return;
      }
      setTitle(result.page.title);
      setBody(result.page.body);
      setPublished(result.page.published);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [pageUrl, courseUrl, acronym]);

  const handleRevise = async () => {
    if (!aiInstr.trim()) return;
    setAiBusy(true);
    setNote(null);
    const result = await revisePageWithAiAction(body, aiInstr.trim(), provider);
    setAiBusy(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    setBodyBeforeAi(body);
    setBody(result.html);
    setNote({ kind: "success", text: "Applied the AI revision. Review the preview, then Save." });
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setNote({ kind: "error", text: "Give the page a title first." });
      return;
    }
    setSaving(true);
    setNote(null);
    const result = isNew
      ? await createPageAction(courseUrl, { title: title.trim(), body, published }, acronym)
      : await updatePageAction(courseUrl, pageUrl, { title: title.trim(), body, published }, acronym);
    setSaving(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    // Re-scan this page's accessibility so its badge updates immediately.
    if (pageUrl) window.dispatchEvent(new CustomEvent("ta-content-saved", { detail: { type: "page", id: pageUrl } }));
    onSaved();
    onClose();
  };

  const handleDelete = async () => {
    if (pageUrl === null) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setNote(null);
    const result = await deletePageAction(courseUrl, pageUrl, acronym);
    setDeleting(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    onSaved();
    onClose();
  };

  const busy = saving || deleting || aiBusy;

  return (
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={styles.previewModal}
        style={{ width: "min(1100px, 95vw)", maxWidth: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <h3>{isNew ? "New page" : "Edit page"}</h3>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>

        {loading ? (
          <div className={styles.loadingState} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <div>
              <p className={styles.loadingTitle}>Loading page…</p>
            </div>
          </div>
        ) : loadError ? (
          <p className={styles.error}>{loadError}</p>
        ) : (
          <>
            <div className={styles.field}>
              <TextField
                id="content-page-title"
                type="text"
                size="small"
                fullWidth
                placeholder="Page title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                label="Title"
              />
            </div>

            <div className={styles.field}>
              <TextField
                id="content-page-ai"
                type="text"
                size="small"
                fullWidth
                placeholder="e.g. fix typos, add a section on submission steps, update the due date to Friday"
                value={aiInstr}
                onChange={(e) => setAiInstr(e.target.value)}
                label="Revise with AI (optional)"
              />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                <Button
                  type="button"
                  variant="outlined"
                  size="small"
                  onClick={handleRevise}
                  disabled={aiBusy || !aiInstr.trim()}
                >
                  {aiBusy ? "Revising…" : "Revise with AI"}
                </Button>
                {bodyBeforeAi !== null && (
                  <Button
                    type="button"
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setBody(bodyBeforeAi);
                      setBodyBeforeAi(null);
                      setNote(null);
                    }}
                  >
                    Undo AI change
                  </Button>
                )}
              </div>
              <p className={styles.fieldHint}>
                The revision only edits the draft below — nothing is saved to Canvas until you click Save.
              </p>
            </div>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div className={styles.field} style={{ flex: "1 1 360px", minWidth: 280 }}>
                <label>Page body</label>
                <HtmlEditor value={body} onChange={setBody} minHeight={260} ariaLabel="Page body" />
              </div>
              <div className={styles.field} style={{ flex: "1 1 360px", minWidth: 280 }}>
                <label>Live preview</label>
                <iframe
                  title="Page preview"
                  sandbox=""
                  srcDoc={previewDoc(body)}
                  style={{
                    width: "100%",
                    minHeight: 360,
                    border: "1px solid var(--field-border)",
                    borderRadius: 8,
                    background: "var(--field-background)",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px solid var(--field-border)",
              }}
            >
              <FormControlLabel
                control={<Checkbox checked={published} onChange={(e) => setPublished(e.target.checked)} size="small" />}
                label="Published (visible to students)"
              />
              <Button
                type="button"
                variant="contained"
                size="small"
                onClick={handleSave}
                disabled={busy || !title.trim()}
              >
                {saving ? "Saving…" : isNew ? "Create page" : "Save to Canvas"}
              </Button>
              {!isNew && (
                <Button
                  type="button"
                  variant="outlined"
                  size="small"
                  onClick={handleDelete}
                  disabled={busy}
                  sx={{ color: "var(--danger)", borderColor: "var(--danger-border)" }}
                >
                  {deleting ? "Deleting…" : confirmDelete ? "Confirm delete" : "Delete page"}
                </Button>
              )}
            </div>

            {note && (
              <p className={note.kind === "error" ? styles.error : styles.fieldHint} style={{ marginTop: 10 }}>
                {note.text}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
