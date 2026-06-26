"use client";

import { useEffect, useState } from "react";
import { getPdfMetaAction, savePdfAccessibilityAction } from "../actions";
import { titleFromFileName } from "@/lib/doc-headings";
import type { Issue } from "@/lib/accessibility/types";

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
}: {
  courseUrl: string;
  acronym?: string;
  fileId: number;
  title: string;
  progress?: { index: number; total: number };
  onSkip?: () => void;
  onClose: (result?: { issues: Issue[] }) => void;
}) {
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
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      role="dialog"
      aria-modal="true"
      aria-label="Fix PDF accessibility"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(560px, 96vw)", maxHeight: "90vh", background: "#fff", borderRadius: 12, display: "flex", flexDirection: "column", boxShadow: "0 18px 50px rgba(15,23,42,0.3)" }}
      >
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--field-border, #e2e8f0)" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748b", display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>PDF accessibility · {title}</span>
            {progress && <span style={{ color: "var(--accent, #2563eb)" }}>{progress.index} of {progress.total}</span>}
          </div>
          <div style={{ fontSize: "0.85rem", color: "#475569", marginTop: 4 }}>
            Set the document language and title, then save back to Canvas.
          </div>
        </div>

        <div style={{ padding: "14px 18px", overflowY: "auto" }}>
          {stage === "loading" ? (
            <p style={{ color: "#64748b" }}>Loading PDF…</p>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#334155", marginBottom: 4 }}>
                  Document language
                </label>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--field-border, #cbd5e1)", borderRadius: 8, fontSize: "0.9rem", background: "#fff", color: "#334155" }}
                >
                  {langOptions.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "#334155", marginBottom: 4 }}>
                  Document title
                </label>
                <input
                  type="text"
                  value={docTitle}
                  placeholder="A short, descriptive title…"
                  onChange={(e) => setDocTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && stage === "ready") void save();
                  }}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--field-border, #cbd5e1)", borderRadius: 8, fontSize: "0.9rem" }}
                />
              </div>

              <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: 14 }}>
                Tagging the PDF for structure and headings can&apos;t be done here — it needs Acrobat&apos;s
                tagging tools, or fixing the source Word file and re-exporting as a tagged PDF.
              </p>
              {error && <p style={{ color: "#dc2626", fontSize: "0.85rem", marginTop: 8 }}>{error}</p>}
            </>
          )}
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--field-border, #e2e8f0)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={() => onClose()}
            style={{ border: "1px solid var(--field-border, #cbd5e1)", background: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: "0.85rem", cursor: "pointer", color: "#334155" }}
          >
            Cancel
          </button>
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              style={{ border: "1px solid var(--field-border, #cbd5e1)", background: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: "0.85rem", cursor: "pointer", color: "#334155" }}
            >
              Skip
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={stage !== "ready"}
            style={{ border: "none", background: "#2563eb", color: "#fff", borderRadius: 8, padding: "7px 16px", fontSize: "0.85rem", fontWeight: 600, cursor: stage === "ready" ? "pointer" : "default", opacity: stage === "ready" ? 1 : 0.6 }}
          >
            {stage === "saving" ? "Saving…" : "Save to Canvas"}
          </button>
        </div>
      </div>
    </div>
  );
}
