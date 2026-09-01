"use client";

import { useEffect, useState, type RefObject } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { getPdfMetaAction, savePdfAccessibilityAction } from "../actions";
import { titleFromFileName } from "@/lib/doc-headings";
import type { Issue } from "@/lib/accessibility/types";
import { useModalDismiss } from "./ui/useModalDismiss";
import styles from "../page.module.css";

// A short list of common course languages (BCP-47 tags). The user picks one so
// we never guess a language for them.
const LANGUAGES: Array<{ value: string; label: string }> = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "zh", label: "Chinese" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
  { value: "ja", label: "Japanese" },
];

/**
 * Fixes the PDF accessibility properties that can be set without a structure
 * tree: the document language (WCAG 3.1.1) and a display title (2.4.2). Tagging
 * and headings are intentionally out of scope (they need real authoring), so the
 * editor is upfront about that. Opened from the Accessibility Center for a PDF
 * "no language" / "no title" issue.
 */
export default function PdfFixEditor({
  courseUrl,
  acronym,
  fileId,
  title,
  progress,
  onSkip,
  onClose,
  restoreFocusRef,
  fallbackFocusRefs,
}: {
  courseUrl: string;
  acronym?: string;
  fileId: number;
  title: string;
  progress?: { index: number; total: number };
  onSkip?: () => void;
  onClose: (result?: { issues: Issue[] }) => void;
  /** The opener to return focus to on close, captured at click time. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** Fallback restore candidates, tried in order if the opener is gone. */
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
}) {
  // Dismissal reuses the backdrop's own close handler (decision 6); `open` is
  // unconditionally true because this overlay only ever renders via
  // `{cond && <PdfFixEditor />}`, so it is never mounted while closed.
  const { containerRef } = useModalDismiss<HTMLDivElement>({
    open: true,
    onDismiss: () => onClose(),
    restoreFocusRef,
    fallbackFocusRefs,
  });

  const [stage, setStage] = useState<"loading" | "ready" | "saving">("loading");
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState("en-US");
  const [docTitle, setDocTitle] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getPdfMetaAction(courseUrl, fileId, acronym);
      if (cancelled) return;
      if ("error" in r) {
        setError(r.error);
        setStage("ready");
        return;
      }
      if (r.lang) setLang(r.lang);
      setDocTitle(r.title || titleFromFileName(title));
      setStage("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, fileId, acronym, title]);

  const save = async () => {
    setStage("saving");
    setError(null);
    const result = await savePdfAccessibilityAction(courseUrl, fileId, lang, docTitle.trim(), acronym);
    if ("error" in result) {
      setError(result.error);
      setStage("ready");
      return;
    }
    onClose({ issues: result.issues });
  };

  // If the chosen language isn't one of the presets, show it as an extra option.
  const langOptions = LANGUAGES.some((l) => l.value === lang) ? LANGUAGES : [{ value: lang, label: lang }, ...LANGUAGES];

  return (
    <div
      onClick={() => onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "color-mix(in srgb, var(--text-primary) 45%, transparent)",
        zIndex: 10001,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-4)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 96vw)",
          maxHeight: "90vh",
          background: "var(--field-background)",
          borderRadius: "var(--radius-md)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Fix PDF accessibility"
        tabIndex={-1}
        ref={containerRef}
      >
        <div style={{ padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--border-soft)" }}>
          <div
            style={{
              fontSize: "var(--font-size-2xs)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--text-secondary)",
              display: "flex",
              justifyContent: "space-between",
              gap: "var(--space-2)",
            }}
          >
            <span>PDF accessibility · {title}</span>
            {progress && <span style={{ color: "var(--accent)" }}>{progress.index} of {progress.total}</span>}
          </div>
          <div style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)", marginTop: "var(--space-1)" }}>
            Set the document language and title, then save back to Canvas.
          </div>
        </div>

        <div style={{ padding: "var(--space-3) var(--space-4)", overflowY: "auto" }}>
          {stage === "loading" ? (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--text-secondary)", fontSize: "var(--font-size-md)" }}>
              <span className={styles.spinner} aria-hidden="true" />
              Loading PDF…
            </div>
          ) : (
            <>
              <div style={{ marginBottom: "var(--space-4)" }}>
                <TextField
                  fullWidth
                  select
                  size="small"
                  label="Document language"
                  value={lang}
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLang(e.target.value)}
                  sx={{ "& .MuiOutlinedInput-root": { fontSize: "var(--font-size-md)" } }}
                >
                  {langOptions.map((l) => (
                    <MenuItem key={l.value} value={l.value}>
                      {l.label}
                    </MenuItem>
                  ))}
                </TextField>
              </div>

              <div>
                <TextField
                  fullWidth
                  size="small"
                  label="Document title"
                  value={docTitle}
                  placeholder="A short, descriptive title…"
                  onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDocTitle(e.target.value)}
                  slotProps={{
                    input: {
                      onKeyDown: ((e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Enter" && stage === "ready") void save();
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      }) as any,
                    },
                  }}
                  sx={{ "& .MuiOutlinedInput-root": { fontSize: "var(--font-size-md)" } }}
                />
              </div>

              <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: "var(--space-3)" }}>
                Tagging the PDF for structure and headings can&apos;t be done here — it needs Acrobat&apos;s
                tagging tools, or fixing the source Word file and re-exporting as a tagged PDF.
              </p>
              {error && (
                <p style={{ color: "var(--danger)", fontSize: "var(--font-size-md)", marginTop: "var(--space-2)" }}>
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        <div
          style={{
            padding: "var(--space-3) var(--space-4)",
            borderTop: "1px solid var(--border-soft)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "var(--space-2)",
          }}
        >
          <Button
            variant="outlined"
            size="small"
            onClick={() => onClose()}
          >
            Cancel
          </Button>
          {onSkip && (
            <Button
              variant="outlined"
              size="small"
              onClick={onSkip}
            >
              Skip
            </Button>
          )}
          <Button
            variant="contained"
            size="small"
            onClick={save}
            disabled={stage !== "ready"}
          >
            {stage === "saving" ? "Saving..." : "Save to Canvas"}
          </Button>
        </div>
      </div>
    </div>
  );
}
