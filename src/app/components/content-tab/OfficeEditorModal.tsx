"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
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
import { useModalDismiss } from "../ui/useModalDismiss";
import { ModalShell } from "../ui/ModalShell";
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
  restoreFocusRef,
  fallbackFocusRefs,
}: {
  courseUrl: string;
  acronym?: string;
  fileId: number;
  fileName: string;
  onClose: () => void;
  onSaved: () => void;
  /** The outer dialog's opener, forwarded to the outer ModalShell only - the
   * nested "move section" overlay keeps its own hook call untouched. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** Ordered fallbacks tried after `restoreFocusRef` (see ModalShell's own
   * doc comment). */
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
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

  // Focus restoration (docs/modal-focus-restoration-acceptance-criteria.md,
  // wave R2) for the nested "move section" overlay. Its opener is the "→"
  // action button below, captured synchronously at click time - but
  // `moveTo` (on success) removes the very paragraph that button lives on
  // (`removeSection`) in the same update that closes this overlay, so the
  // opener is reliably disconnected by the time the restore effect's cleanup
  // runs. `outerCloseButtonRef` (attached to the outer dialog's own Close
  // button, in previewHeader below) is the fallback: it is rendered
  // unconditionally whenever the outer dialog is mounted, independent of
  // `sections`, so it survives every paragraph add/remove/move this overlay
  // can trigger.
  const moveSectionTriggerRef = useRef<HTMLElement | null>(null);
  const outerCloseButtonRef = useRef<HTMLElement | null>(null);

  // C4 (docs/modal-dismissal-focus-acceptance-criteria.md): only the nested
  // "move section" overlay adopts here - the outer dialog stays C5. Hooks
  // must be called unconditionally, so this call itself is unconditional,
  // but `open` is NOT hardcoded `true` the way the other four C4 sites use
  // it: those four are standalone components that are only ever MOUNTED
  // while open (`{cond && <Editor />}` in their *parent*), so a hardcoded
  // `true` inside them lives exactly as long as the overlay does. This
  // component is different - OfficeEditorModal itself stays mounted for the
  // whole lifetime of the outer (not-yet-adopted) dialog, independent of
  // `movingSection`, and only the nested overlay is conditionally rendered
  // (`{movingSection && (...)}` below). A hardcoded `true` here would
  // register this modal in the shared stack for as long as OfficeEditorModal
  // is mounted, including every render where no nested overlay is on
  // screen - a phantom stack entry that would make the (still-unadopted,
  // C5) outer dialog non-topmost forever once it too registers. `open` is
  // therefore derived from `movingSection` itself, matching exactly when the
  // overlay is actually on screen.
  const { containerRef: moveSectionContainerRef } = useModalDismiss<HTMLDivElement>({
    open: movingSection !== null,
    onDismiss: () => setMovingSection(null),
    restoreFocusRef: moveSectionTriggerRef,
    fallbackFocusRefs: [outerCloseButtonRef],
  });

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
    <ModalShell
      label={`Edit ${name}`}
      onDismiss={onClose}
      restoreFocusRef={restoreFocusRef}
      fallbackFocusRefs={fallbackFocusRefs}
      contentStyle={{ width: "min(860px, 95vw)", maxWidth: "none" }}
    >
        <div className={styles.previewHeader}>
          <h3>Edit {name}</h3>
          <button
            type="button"
            className={styles.previewCloseButton}
            onClick={onClose}
            ref={(el) => {
              outerCloseButtonRef.current = el;
            }}
          >
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
                  {
                    key: "move",
                    label: "→",
                    title: "Move this paragraph to another file",
                    // Captured synchronously at click time (docs/modal-focus-
                    // restoration-acceptance-criteria.md decision 3).
                    // RichTextSectionAction.onClick is typed `() => void`
                    // (RichTextSectionEditor.tsx is shared with the syllabus
                    // editor, which has no opener to capture, so it declares
                    // no parameter) - the optional parameter here still
                    // receives the real click event at runtime, since MUI's
                    // Button always calls its onClick handler with one.
                    onClick: (event?: React.MouseEvent<HTMLButtonElement>) => {
                      if (event) moveSectionTriggerRef.current = event.currentTarget;
                      setMoveFiles(null);
                      setMoveError(null);
                      setMovingSection(s);
                    },
                  },
                  { key: "del", label: "×", title: "Delete this paragraph", tone: "danger", onClick: () => removeSection(s.key) },
                ],
              }))}
            />
            <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
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
    </ModalShell>

    {movingSection && (
      <div
        onClick={() => setMovingSection(null)}
        style={{ position: "fixed", inset: 0, background: "color-mix(in srgb, var(--navy) 45%, transparent)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-4)" }}
      >
        <div
          ref={moveSectionContainerRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Move section to another file"
          onClick={(e) => e.stopPropagation()}
          style={{ width: "min(440px, 96vw)", maxHeight: "80vh", background: "var(--field-background)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-lg)" }}
        >
          <div style={{ padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--field-border)" }}>
            <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>Move section to another file</div>
            <div style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)", marginTop: "var(--space-1)" }}>
              Appends &ldquo;{spansToPlainText(movingSection.spans).slice(0, 60) || "(empty)"}&rdquo; to the end of the chosen Word file.
            </div>
          </div>
          <div style={{ padding: "var(--space-2) var(--space-3)", overflowY: "auto" }}>
            {!moveFiles ? (
              <p role="status" aria-live="polite" style={{ margin: 0, fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>Loading files…</p>
            ) : moveFiles.length === 0 ? (
              <p style={{ margin: 0, fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>No other Word (.docx) files in this course.</p>
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
            {moveError && <p className={styles.error} style={{ marginTop: "var(--space-2)" }}>{moveError}</p>}
          </div>
          <div style={{ padding: "var(--space-2) var(--space-4)", borderTop: "1px solid var(--field-border)", display: "flex", justifyContent: "flex-end" }}>
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
