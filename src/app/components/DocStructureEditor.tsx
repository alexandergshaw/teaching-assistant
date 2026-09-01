"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import { getOfficeFileStructureAction, saveOfficeFileStructureAction } from "../actions";
import { suggestHeadingLevels, titleFromFileName } from "@/lib/doc-headings";
import type { OfficeParagraph, RunSpan } from "@/lib/office-edit";
import { useModalDismiss } from "./ui/useModalDismiss";

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
  restoreFocusRef,
  fallbackFocusRefs,
}: {
  courseUrl: string;
  acronym?: string;
  fileId: number;
  title: string;
  progress?: { index: number; total: number };
  onSkip?: () => void;
  onClose: (resolved?: string[]) => void;
  /** The opener to return focus to on close, forwarded to useModalDismiss. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** Ordered fallbacks tried after `restoreFocusRef`. */
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
}) {
  // Dismissal reuses the backdrop's own close handler (decision 6); `open` is
  // unconditionally true because this overlay only ever renders via
  // `{cond && <DocStructureEditor />}`, so it is never mounted while closed.
  const { containerRef } = useModalDismiss<HTMLDivElement>({
    open: true,
    onDismiss: () => onClose(),
    restoreFocusRef,
    fallbackFocusRefs,
  });

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
          width: "min(680px, 96vw)",
          maxHeight: "90vh",
          background: "var(--field-background)",
          borderRadius: "var(--radius-md)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "var(--shadow-lg)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Fix document structure"
        tabIndex={-1}
        ref={containerRef}
      >
        <div style={{ padding: "var(--space-3) var(--space-5)", borderBottom: "1px solid var(--field-border)" }}>
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
            <span>Document structure · {title}</span>
            {progress && <span style={{ color: "var(--accent)" }}>{progress.index} of {progress.total}</span>}
          </div>
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", marginTop: "var(--space-1)" }}>
            Give the file a title and mark its section headings, then save back to Canvas.
          </div>
        </div>

        <div style={{ padding: "var(--space-3) var(--space-5)", overflowY: "auto" }}>
          {stage === "loading" ? (
            <p role="status" aria-live="polite" style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span
                aria-hidden="true"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "var(--radius-round)",
                  border: "2px solid color-mix(in srgb, var(--accent) 20%, transparent)",
                  borderTopColor: "var(--accent-ink)",
                  display: "inline-block",
                  animation: "ta-spin 0.8s linear infinite",
                }}
              />
              Loading document…
            </p>
          ) : (
            <>
              <div style={{ marginBottom: "var(--space-4)" }}>
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
                      }) as any as React.KeyboardEventHandler<HTMLInputElement>,
                    },
                  }}
                  error={!titleTrimmed}
                  sx={{ "& .MuiOutlinedInput-root": { fontSize: "var(--font-size-md)" } }}
                />
              </div>

              {paragraphs.length > 0 && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
                    <FormControlLabel
                      control={<Checkbox checked={allSelected} onChange={toggleSelectAll} size="small" aria-label="Select all lines" />}
                      label="Headings"
                      sx={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={applySuggestion}
                    >
                      Suggest headings
                    </Button>
                  </div>

                  {selected.size > 0 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-2)",
                        flexWrap: "wrap",
                        padding: "var(--space-2)",
                        background: "var(--surface-muted)",
                        borderRadius: "var(--radius-sm)",
                        marginBottom: "var(--space-1)",
                      }}
                    >
                      <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--text-secondary)" }}>
                        {selected.size} selected — set to
                      </span>
                      {LEVELS.map((l) => (
                        <Button
                          key={l.value}
                          variant="outlined"
                          size="small"
                          onClick={() => applyToSelected(l.value)}
                          sx={{ fontSize: "var(--font-size-xs)" }}
                        >
                          {l.label}
                        </Button>
                      ))}
                      <Button
                        variant="text"
                        size="small"
                        onClick={() => setSelected(new Set())}
                        sx={{ marginLeft: "auto", fontSize: "var(--font-size-xs)" }}
                      >
                        Clear
                      </Button>
                    </div>
                  )}

                  <div style={{ border: "1px solid var(--field-border)", borderRadius: "var(--radius-sm)" }}>
                    {paragraphs.map((p, i) => {
                      const lvl = levelOf(p);
                      const isHeading = /^Heading[1-9]$/.test(lvl);
                      const isSelected = selected.has(p.id);
                      return (
                        <div
                          key={p.id}
                          style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", padding: "var(--space-1) var(--space-2)", borderTop: i === 0 ? "none" : "1px solid var(--border-soft)", background: isSelected ? "var(--accent-surface)" : undefined }}
                        >
                          <Checkbox
                            checked={isSelected}
                            onChange={() => toggleSelected(p.id)}
                            slotProps={{ input: { "aria-label": `Select "${p.text.slice(0, 40)}"` } }}
                            size="small"
                            sx={{ flexShrink: 0 }}
                          />
                          <span
                            title={p.text}
                            style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-md)", color: isHeading ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: isHeading ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            {p.text}
                          </span>
                          <TextField
                            select
                            value={lvl}
                            onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setLevels((prev) => ({ ...prev, [p.id]: e.target.value }))}
                            size="small"
                            slotProps={{ input: { "aria-label": `Style for "${p.text.slice(0, 40)}"` } }}
                            sx={{ flexShrink: 0, minWidth: 140 }}
                          >
                            {LEVELS.map((l) => (
                              <MenuItem key={l.value} value={l.value}>
                                {l.label}
                              </MenuItem>
                            ))}
                          </TextField>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {error && <p style={{ color: "var(--danger)", fontSize: "var(--font-size-md)", marginTop: "var(--space-2)" }}>{error}</p>}
            </>
          )}
        </div>

        <div style={{ padding: "var(--space-3) var(--space-4)", borderTop: "1px solid var(--field-border)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ fontSize: "var(--font-size-sm)", color: headingCount > 0 ? "var(--success)" : "var(--warning)" }}>
            {headingCount > 0 ? `${headingCount} heading${headingCount === 1 ? "" : "s"} marked` : "No headings marked yet"}
          </span>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
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
              {stage === "saving" ? "Saving…" : "Save to Canvas"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
