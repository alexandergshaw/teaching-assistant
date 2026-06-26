"use client";

import { useEffect, useMemo, useState } from "react";
import { getOfficeFileStructureAction, saveOfficeFileStructureAction } from "../actions";
import { suggestHeadingLevels, titleFromFileName } from "@/lib/doc-headings";
import type { OfficeParagraph, RunSpan } from "@/lib/office-edit";

// Heading-style ids Word uses; "" is body text.
const LEVELS: Array<{ value: string; label: string }> = [
  { value: "", label: "Body" },
  { value: "Heading1", label: "Heading 1" },
  { value: "Heading2", label: "Heading 2" },
  { value: "Heading3", label: "Heading 3" },
];

/**
 * Fixes a docx file's structural accessibility flags: sets a document title
 * (WCAG 2.4.2) and lets the user mark paragraphs as headings (WCAG 1.3.1), then
 * writes both back to Canvas. Opened from the Accessibility Center for a docx
 * "missing title" / "no headings" issue. `onClose` reports which rule ids were
 * resolved so the center can clear just those issues.
 */
export default function DocStructureEditor({
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
  onClose: (resolved?: string[]) => void;
}) {
  const [stage, setStage] = useState<"loading" | "ready" | "saving">("loading");
  const [error, setError] = useState<string | null>(null);
  const [paragraphs, setParagraphs] = useState<OfficeParagraph[]>([]);
  const [originalTitle, setOriginalTitle] = useState("");
  const [docTitle, setDocTitle] = useState("");
  // Chosen heading style per paragraph id (defaults to the paragraph's own style).
  const [levels, setLevels] = useState<Record<string, string>>({});
  // Paragraph ids ticked for a bulk style change.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getOfficeFileStructureAction(courseUrl, fileId, acronym);
      if (cancelled) return;
      if ("error" in r) {
        setError(r.error);
        setStage("ready");
        return;
      }
      setParagraphs(r.paragraphs);
      setOriginalTitle(r.title);
      setDocTitle(r.title || titleFromFileName(r.name));
      const seeded: Record<string, string> = Object.fromEntries(r.paragraphs.map((p) => [p.id, p.style]));
      // If the document has no headings yet (the flag being fixed), prefill the
      // dropdowns with suggested headings so the fix is ready to save on open.
      if (!r.paragraphs.some((p) => /^Heading[1-9]$/.test(p.style))) {
        Object.assign(seeded, suggestHeadingLevels(r.paragraphs));
      }
      setLevels(seeded);
      setStage("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, fileId, acronym]);

  const levelOf = (p: OfficeParagraph) => levels[p.id] ?? p.style;
  const stylesChanged = useMemo(
    () => paragraphs.some((p) => (levels[p.id] ?? p.style) !== p.style),
    [paragraphs, levels]
  );
  const headingCount = useMemo(
    () => paragraphs.filter((p) => /^Heading[1-9]$/.test(levels[p.id] ?? p.style)).length,
    [paragraphs, levels]
  );
  const titleTrimmed = docTitle.trim();
  const titleChanged = titleTrimmed !== originalTitle.trim();

  const applySuggestion = () => setLevels((prev) => ({ ...prev, ...suggestHeadingLevels(paragraphs) }));

  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = paragraphs.length > 0 && paragraphs.every((p) => selected.has(p.id));
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(paragraphs.map((p) => p.id)));
  // Set every ticked paragraph to one style at once (Body / Heading 1-3).
  const applyToSelected = (style: string) =>
    setLevels((prev) => {
      const next = { ...prev };
      for (const id of selected) next[id] = style;
      return next;
    });

  const save = async () => {
    setStage("saving");
    setError(null);
    const sections = stylesChanged
      ? paragraphs.map<{ sourceId: string; spans: RunSpan[]; style?: string }>((p) => ({
          sourceId: p.id,
          spans: p.runs.length > 0 ? p.runs : [{ text: p.text }],
          style: levelOf(p),
        }))
      : [];
    const titleToSave = titleChanged && titleTrimmed ? titleTrimmed : null;

    if (sections.length === 0 && titleToSave == null) {
      onClose();
      return;
    }
    const result = await saveOfficeFileStructureAction(courseUrl, fileId, titleToSave, sections, acronym);
    if ("error" in result) {
      setError(result.error);
      setStage("ready");
      return;
    }
    const resolved: string[] = [];
    if (titleTrimmed) resolved.push("doc-no-title");
    if (headingCount > 0) resolved.push("doc-no-structure");
    onClose(resolved);
  };

  return (
    <div
      onClick={() => onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      role="dialog"
      aria-modal="true"
      aria-label="Fix document structure"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(680px, 96vw)", maxHeight: "90vh", background: "#fff", borderRadius: 12, display: "flex", flexDirection: "column", boxShadow: "0 18px 50px rgba(15,23,42,0.3)" }}
      >
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--field-border, #e2e8f0)" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748b", display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>Document structure · {title}</span>
            {progress && <span style={{ color: "var(--accent, #2563eb)" }}>{progress.index} of {progress.total}</span>}
          </div>
          <div style={{ fontSize: "0.85rem", color: "#475569", marginTop: 4 }}>
            Give the file a title and mark its section headings, then save back to Canvas.
          </div>
        </div>

        <div style={{ padding: "14px 18px", overflowY: "auto" }}>
          {stage === "loading" ? (
            <p style={{ color: "#64748b" }}>Loading document…</p>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
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
                  style={{ width: "100%", padding: "8px 10px", border: `1px solid ${titleTrimmed ? "var(--field-border, #cbd5e1)" : "#d97706"}`, borderRadius: 8, fontSize: "0.9rem" }}
                />
              </div>

              {paragraphs.length > 0 && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.82rem", fontWeight: 600, color: "#334155", cursor: "pointer" }}>
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Select all lines" />
                      Headings
                    </label>
                    <button
                      type="button"
                      onClick={applySuggestion}
                      style={{ border: "1px solid var(--accent, #2563eb)", background: "#fff", color: "var(--accent, #2563eb)", borderRadius: 8, padding: "5px 11px", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer" }}
                    >
                      Suggest headings
                    </button>
                  </div>

                  {selected.size > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "8px 10px", background: "#f1f5f9", borderRadius: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "#334155" }}>
                        {selected.size} selected — set to
                      </span>
                      {LEVELS.map((l) => (
                        <button
                          key={l.value}
                          type="button"
                          onClick={() => applyToSelected(l.value)}
                          style={{ border: "1px solid var(--field-border, #cbd5e1)", background: "#fff", color: "#334155", borderRadius: 6, padding: "4px 10px", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer" }}
                        >
                          {l.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSelected(new Set())}
                        style={{ marginLeft: "auto", border: "none", background: "none", color: "var(--accent, #2563eb)", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer" }}
                      >
                        Clear
                      </button>
                    </div>
                  )}

                  <div style={{ border: "1px solid var(--field-border, #e2e8f0)", borderRadius: 8 }}>
                    {paragraphs.map((p, i) => {
                      const lvl = levelOf(p);
                      const isHeading = /^Heading[1-9]$/.test(lvl);
                      const isSelected = selected.has(p.id);
                      return (
                        <div
                          key={p.id}
                          style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 10px", borderTop: i === 0 ? "none" : "1px solid #f1f5f9", background: isSelected ? "#eff6ff" : undefined }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelected(p.id)}
                            aria-label={`Select "${p.text.slice(0, 40)}"`}
                            style={{ flexShrink: 0 }}
                          />
                          <span
                            title={p.text}
                            style={{ flex: 1, minWidth: 0, fontSize: "0.85rem", color: isHeading ? "#0f172a" : "#475569", fontWeight: isHeading ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            {p.text}
                          </span>
                          <select
                            value={lvl}
                            onChange={(e) => setLevels((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            aria-label={`Style for "${p.text.slice(0, 40)}"`}
                            style={{ flexShrink: 0, padding: "4px 8px", border: "1px solid var(--field-border, #cbd5e1)", borderRadius: 6, fontSize: "0.8rem", background: "#fff", color: "#334155" }}
                          >
                            {LEVELS.map((l) => (
                              <option key={l.value} value={l.value}>
                                {l.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {error && <p style={{ color: "#dc2626", fontSize: "0.85rem", marginTop: 10 }}>{error}</p>}
            </>
          )}
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--field-border, #e2e8f0)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "0.8rem", color: headingCount > 0 ? "#16a34a" : "#d97706" }}>
            {headingCount > 0 ? `${headingCount} heading${headingCount === 1 ? "" : "s"} marked` : "No headings marked yet"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
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
    </div>
  );
}
