"use client";

import { useEffect, useRef, useState } from "react";
import {
  getOfficeEditableAction,
  listMovableFilesAction,
  appendOfficeParagraphAction,
  rewriteOfficeParagraphAction,
  saveOfficeEditsAction,
} from "../../actions";
import { useLlmProvider } from "@/lib/llm-provider";
import type { RunSpan } from "@/lib/office-edit";
import { spansEqual, spansToPlainText } from "../RichTextEditor";
import { RichTextSectionEditor } from "../RichTextSectionEditor";
import Button from "@mui/material/Button";
import styles from "../../page.module.css";

// ── Office file editor (.docx / .pptx, in place) ──────────────────────────────

export function OfficeEditorModal({
  courseUrl,
  acronym,
  fileId,
  fileName,
  onClose,
  onSaved,
}: {
  courseUrl: string;
  acronym?: string;
  fileId: number;
  fileName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // One editable paragraph. `originalSpans` is null for paragraphs the user added.
  type OfficeSection = {
    key: string;
    sourceId: string;
    slide?: number;
    spans: RunSpan[];
    originalSpans: RunSpan[] | null;
    /** docx paragraph style id ("Heading1", "" for body). */
    style: string;
    originalStyle: string;
  };

  const [provider] = useLlmProvider();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState(fileName);
  const [isDocx, setIsDocx] = useState(false);
  const [sections, setSections] = useState<OfficeSection[]>([]);
  const [initialIds, setInitialIds] = useState<string[]>([]);
  const sectionSeq = useRef(0);
  const [regenKey, setRegenKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [movingSection, setMovingSection] = useState<OfficeSection | null>(null);
  const [moveFiles, setMoveFiles] = useState<Array<{ id: number; title: string }> | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getOfficeEditableAction(courseUrl, fileId, acronym);
      if (cancelled) return;
      if ("error" in result) {
        setLoadError(result.error);
        setLoading(false);
        return;
      }
      setName(result.name);
      setIsDocx(result.kind === "docx");
      const seeded: OfficeSection[] = result.paragraphs.map((p) => {
        const spans = p.runs.length > 0 ? p.runs : [{ text: p.text }];
        return { key: p.id, sourceId: p.id, slide: p.slide, spans, originalSpans: spans, style: p.style, originalStyle: p.style };
      });
      setInitialIds(seeded.map((s) => s.sourceId));
      setSections(seeded);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, fileId, acronym]);

  const sectionChanged = (s: OfficeSection) =>
    !s.originalSpans || !spansEqual(s.spans, s.originalSpans) || s.style !== s.originalStyle;
  const presentIds = new Set(sections.map((s) => s.sourceId));
  const deletedCount = initialIds.filter((id) => !presentIds.has(id)).length;
  const changedCount = sections.filter(sectionChanged).length + deletedCount;

  const updateSpans = (key: string, spans: RunSpan[]) =>
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, spans } : s)));

  const updateStyle = (key: string, style: string) =>
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, style } : s)));

  // Add a blank paragraph right after `key`, cloning that paragraph's style anchor.
  const addAfter = (key: string) =>
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.key === key);
      if (idx === -1) return prev;
      const fresh: OfficeSection = {
        key: `new-${sectionSeq.current++}`,
        sourceId: prev[idx].sourceId,
        slide: prev[idx].slide,
        spans: [{ text: "" }],
        originalSpans: null,
        style: prev[idx].style,
        originalStyle: prev[idx].style,
      };
      return [...prev.slice(0, idx + 1), fresh, ...prev.slice(idx + 1)];
    });

  const removeSection = (key: string) => setSections((prev) => prev.filter((s) => s.key !== key));

  // Load the course's other .docx files when the move picker opens (await-first
  // so the effect body performs no synchronous setState; the list is reset in the
  // button handler that opens the picker).
  useEffect(() => {
    if (!movingSection) return;
    let cancelled = false;
    (async () => {
      const r = await listMovableFilesAction(courseUrl, acronym);
      if (cancelled) return;
      if ("error" in r) {
        setMoveError(r.error);
        return;
      }
      setMoveFiles(r.files.filter((f) => f.id !== fileId));
    })();
    return () => {
      cancelled = true;
    };
  }, [movingSection, courseUrl, acronym, fileId]);

  const moveTo = async (targetId: number) => {
    if (!movingSection) return;
    setMoveBusy(true);
    setMoveError(null);
    const r = await appendOfficeParagraphAction(courseUrl, targetId, movingSection.spans, movingSection.style, acronym);
    setMoveBusy(false);
    if ("error" in r) {
      setMoveError(r.error);
      return;
    }
    const key = movingSection.key;
    setMovingSection(null);
    removeSection(key);
    setNote({ kind: "success", text: "Section moved. Save this file to remove it from here." });
  };

  // Rewrite one paragraph with AI, using the whole document as context.
  const regenerate = async (section: OfficeSection) => {
    setRegenKey(section.key);
    setNote(null);
    try {
      const documentText = sections.map((s) => spansToPlainText(s.spans)).join("\n");
      const result = await rewriteOfficeParagraphAction(documentText, spansToPlainText(section.spans), provider);
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      updateSpans(section.key, [{ text: result.text }]);
    } finally {
      setRegenKey(null);
    }
  };

  const handleSave = async () => {
    if (changedCount === 0) {
      setNote({ kind: "error", text: "No changes to save." });
      return;
    }
    setSaving(true);
    setNote(null);
    const payload = sections.map((s) => ({ sourceId: s.sourceId, spans: s.spans, style: s.style }));
    const result = await saveOfficeEditsAction(courseUrl, fileId, payload, acronym);
    setSaving(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <>
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={styles.previewModal}
        style={{ width: "min(860px, 95vw)", maxWidth: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <h3>Edit {name}</h3>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>

        {loading ? (
          <div className={styles.loadingState} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <div>
              <p className={styles.loadingTitle}>Loading…</p>
            </div>
          </div>
        ) : loadError ? (
          <p className={styles.error}>{loadError}</p>
        ) : initialIds.length === 0 ? (
          <p className={styles.emptyState}>No editable text was found in this file.</p>
        ) : (
          <>
            <p className={styles.fieldHint} style={{ marginTop: 0 }}>
              Edit the text below — select text and use the toolbar to bold, italicize, underline, or
              resize it{isDocx ? ", and set each paragraph's style (Body, Heading 1, 2…)" : ""}. Use the
              side buttons to rewrite a paragraph with AI, add one below, or delete it. Images and layout
              are kept; saving overwrites the file in Canvas.
            </p>
            <RichTextSectionEditor
              maxHeight="52vh"
              onChange={updateSpans}
              sections={sections.map((s, i) => ({
                key: s.key,
                spans: s.spans,
                changed: sectionChanged(s),
                ariaLabel: `Paragraph ${i + 1}`,
                style: isDocx ? { value: s.style, onChange: (v) => updateStyle(s.key, v) } : undefined,
                heading:
                  s.slide != null && (i === 0 || sections[i - 1].slide !== s.slide)
                    ? `Slide ${s.slide}`
                    : undefined,
                actions: [
                  {
                    key: "ai",
                    label: regenKey === s.key ? "…" : "AI",
                    title: "Rewrite this paragraph with AI",
                    tone: "accent",
                    onClick: () => regenerate(s),
                    disabled: regenKey !== null,
                    style: { opacity: regenKey !== null && regenKey !== s.key ? 0.5 : 1 },
                  },
                  { key: "add", label: "+", title: "Add a paragraph below", onClick: () => addAfter(s.key) },
                  { key: "move", label: "→", title: "Move this paragraph to another file", onClick: () => { setMoveFiles(null); setMoveError(null); setMovingSection(s); } },
                  { key: "del", label: "×", title: "Delete this paragraph", tone: "danger", onClick: () => removeSection(s.key) },
                ],
              }))}
            />
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <Button
                type="button"
                variant="contained"
                size="small"
                onClick={handleSave}
                disabled={saving || changedCount === 0}
              >
                {saving
                  ? "Saving…"
                  : changedCount > 0
                    ? `Save ${changedCount} change${changedCount === 1 ? "" : "s"} to Canvas`
                    : "Save to Canvas"}
              </Button>
            </div>
            {note && <p className={note.kind === "error" ? styles.error : styles.fieldHint}>{note.text}</p>}
          </>
        )}
      </div>
    </div>

    {movingSection && (
      <div
        onClick={() => setMovingSection(null)}
        style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        role="dialog"
        aria-modal="true"
        aria-label="Move section to another file"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ width: "min(440px, 96vw)", maxHeight: "80vh", background: "#fff", borderRadius: 12, display: "flex", flexDirection: "column", boxShadow: "0 18px 50px rgba(15,23,42,0.3)" }}
        >
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--field-border)" }}>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>Move section to another file</div>
            <div style={{ fontSize: "0.85rem", color: "#475569", marginTop: 2 }}>
              Appends &ldquo;{spansToPlainText(movingSection.spans).slice(0, 60) || "(empty)"}&rdquo; to the end of the chosen Word file.
            </div>
          </div>
          <div style={{ padding: "10px 12px", overflowY: "auto" }}>
            {!moveFiles ? (
              <p style={{ color: "#64748b" }}>Loading files…</p>
            ) : moveFiles.length === 0 ? (
              <p style={{ color: "#64748b" }}>No other Word (.docx) files in this course.</p>
            ) : (
              moveFiles.map((f) => (
                <Button
                  key={f.id}
                  type="button"
                  variant="outlined"
                  size="small"
                  disabled={moveBusy}
                  onClick={() => moveTo(f.id)}
                  sx={{ display: "block", width: "100%", textAlign: "left", marginBottom: 1 }}
                >
                  {f.title}
                </Button>
              ))
            )}
            {moveError && <p className={styles.error} style={{ marginTop: 8 }}>{moveError}</p>}
          </div>
          <div style={{ padding: "10px 18px", borderTop: "1px solid var(--field-border)", display: "flex", justifyContent: "flex-end" }}>
            <Button
              type="button"
              variant="outlined"
              size="small"
              onClick={() => setMovingSection(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
