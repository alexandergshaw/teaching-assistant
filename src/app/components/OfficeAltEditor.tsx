"use client";

import { useEffect, useState } from "react";
import { getOfficeFileImagesAction, saveOfficeImageAltAction, suggestOfficeImageAltAction } from "../actions";
import { getStoredProvider } from "@/lib/llm-provider";
import type { Issue } from "@/lib/accessibility/types";
import type { OfficeImage } from "@/lib/office-edit";

type ImageWithData = OfficeImage & { mimeType?: string; base64?: string };

// Remaining image-alt issues for the file, given the current alt values.
function remainingIssues(images: OfficeImage[], alts: Record<string, string>): Issue[] {
  return images
    .filter((im) => !(alts[im.id] ?? im.alt).trim())
    .map((im) => ({
      ruleId: "office-image-alt",
      severity: "warning" as const,
      message: `Image "${im.name}" has no alt text.`,
      wcag: "1.1.1",
      help: "Add alt text describing the image's content or purpose.",
      locator: { selector: im.id, snippet: im.name },
      fixKind: "edit" as const,
    }));
}

/**
 * Lists a Word/PowerPoint file's images and their alt text, lets the user fill in
 * the missing ones, and writes them back into the file in Canvas. Opened from the
 * Accessibility Center for a "file" issue.
 */
export default function OfficeAltEditor({
  courseUrl,
  acronym,
  fileId,
  title,
  progress,
  onClose,
}: {
  courseUrl: string;
  acronym?: string;
  fileId: number;
  title: string;
  progress?: { index: number; total: number };
  onClose: (result?: { issues: Issue[] }) => void;
}) {
  const [stage, setStage] = useState<"loading" | "ready" | "saving">("loading");
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<ImageWithData[]>([]);
  const [alts, setAlts] = useState<Record<string, string>>({});
  const [suggesting, setSuggesting] = useState<Record<string, boolean>>({});
  const [suggestingAll, setSuggestingAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await getOfficeFileImagesAction(courseUrl, fileId, acronym);
      if (cancelled) return;
      if ("error" in r) {
        setError(r.error);
        setStage("ready");
        return;
      }
      setImages(r.images);
      setAlts(Object.fromEntries(r.images.map((im) => [im.id, im.alt])));
      setStage("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, fileId, acronym]);

  const save = async () => {
    setStage("saving");
    setError(null);
    // Only send images whose alt actually changed.
    const edits: Record<string, string> = {};
    for (const im of images) {
      const next = alts[im.id] ?? "";
      if (next !== im.alt) edits[im.id] = next;
    }
    const result = await saveOfficeImageAltAction(courseUrl, fileId, edits, acronym);
    if ("error" in result) {
      setError(result.error);
      setStage("ready");
      return;
    }
    onClose({ issues: remainingIssues(images, alts) });
  };

  const suggestOne = async (id: string): Promise<void> => {
    setSuggesting((s) => ({ ...s, [id]: true }));
    const r = await suggestOfficeImageAltAction(courseUrl, fileId, id, acronym, getStoredProvider());
    if (!("error" in r)) setAlts((prev) => ({ ...prev, [id]: r.text }));
    setSuggesting((s) => ({ ...s, [id]: false }));
  };

  const suggestAllMissing = async (): Promise<void> => {
    setSuggestingAll(true);
    for (const im of images) {
      if (!(alts[im.id] ?? "").trim()) await suggestOne(im.id);
    }
    setSuggestingAll(false);
  };

  const missingCount = images.filter((im) => !(alts[im.id] ?? "").trim()).length;

  return (
    <div
      onClick={() => onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      role="dialog"
      aria-modal="true"
      aria-label="Edit image alt text"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(640px, 96vw)", maxHeight: "90vh", background: "#fff", borderRadius: 12, display: "flex", flexDirection: "column", boxShadow: "0 18px 50px rgba(15,23,42,0.3)" }}
      >
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--field-border, #e2e8f0)" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#64748b", display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>Image alt text · {title}</span>
            {progress && <span style={{ color: "var(--accent, #2563eb)" }}>{progress.index} of {progress.total}</span>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 4 }}>
            <span style={{ fontSize: "0.85rem", color: "#475569" }}>
              Describe each image for screen-reader users, then save back to Canvas.
            </span>
            {images.length > 0 && missingCount > 0 && (
              <button
                type="button"
                onClick={suggestAllMissing}
                disabled={suggestingAll || stage !== "ready"}
                style={{ flexShrink: 0, border: "1px solid var(--accent, #2563eb)", background: "#fff", color: "var(--accent, #2563eb)", borderRadius: 8, padding: "5px 11px", fontSize: "0.8rem", fontWeight: 600, cursor: suggestingAll ? "default" : "pointer" }}
              >
                {suggestingAll ? "Suggesting…" : "Suggest missing with AI"}
              </button>
            )}
          </div>
        </div>

        <div style={{ padding: "12px 18px", overflowY: "auto" }}>
          {stage === "loading" ? (
            <p style={{ color: "#64748b" }}>Loading images…</p>
          ) : images.length === 0 ? (
            <p style={{ color: "#64748b" }}>No images found in this file.</p>
          ) : (
            images.map((im) => {
              const value = alts[im.id] ?? "";
              const missing = !value.trim();
              return (
                <div key={im.id} style={{ marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
                  {im.base64 ? (
                    // eslint-disable-next-line @next/next/no-img-element -- inline data-URL preview, not a remote image
                    <img
                      src={`data:${im.mimeType ?? "image/png"};base64,${im.base64}`}
                      alt=""
                      style={{ width: 64, height: 64, objectFit: "contain", flexShrink: 0, border: "1px solid var(--field-border, #e2e8f0)", borderRadius: 8, background: "#f8fafc" }}
                    />
                  ) : (
                    <div style={{ width: 64, height: 64, flexShrink: 0, border: "1px solid var(--field-border, #e2e8f0)", borderRadius: 8, background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", color: "#94a3b8", textAlign: "center" }}>
                      no preview
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "#334155", marginBottom: 4 }}>
                    {missing && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: "#d97706" }} />}
                    {im.name}
                  </label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="text"
                      value={value}
                      placeholder="Describe this image…"
                      onChange={(e) => setAlts((prev) => ({ ...prev, [im.id]: e.target.value }))}
                      style={{ flex: 1, padding: "7px 10px", border: `1px solid ${missing ? "#d97706" : "var(--field-border, #cbd5e1)"}`, borderRadius: 8, fontSize: "0.88rem" }}
                    />
                    <button
                      type="button"
                      onClick={() => suggestOne(im.id)}
                      disabled={!!suggesting[im.id] || suggestingAll}
                      title="Suggest alt text with AI"
                      style={{ flexShrink: 0, border: "1px solid var(--field-border, #cbd5e1)", background: "#fff", color: "var(--accent, #2563eb)", borderRadius: 8, padding: "0 12px", fontSize: "0.8rem", fontWeight: 600, cursor: suggesting[im.id] ? "default" : "pointer" }}
                    >
                      {suggesting[im.id] ? "…" : "Suggest"}
                    </button>
                  </div>
                  </div>
                </div>
              );
            })
          )}
          {error && <p style={{ color: "#dc2626", fontSize: "0.85rem", marginTop: 8 }}>{error}</p>}
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--field-border, #e2e8f0)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: "0.8rem", color: missingCount > 0 ? "#d97706" : "#16a34a" }}>
            {missingCount > 0 ? `${missingCount} image${missingCount === 1 ? "" : "s"} still missing alt text` : "All images have alt text"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => onClose()}
              style={{ border: "1px solid var(--field-border, #cbd5e1)", background: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: "0.85rem", cursor: "pointer", color: "#334155" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={stage !== "ready" || images.length === 0}
              style={{ border: "none", background: "#2563eb", color: "#fff", borderRadius: 8, padding: "7px 16px", fontSize: "0.85rem", fontWeight: 600, cursor: stage === "ready" ? "pointer" : "default", opacity: stage === "ready" && images.length > 0 ? 1 : 0.6 }}
            >
              {stage === "saving" ? "Saving…" : "Save to Canvas"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
