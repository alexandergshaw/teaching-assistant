"use client";

// PPT-TEMPLATE-UPLOAD-PLACE wave 2: the lean shared ".pptx template" slot
// (scope fork A1). Deliberately NOT a management UI - upload, pick, clear.
// The uploaded file is the TEMPLATE the generated deck is written into, never
// a content source (it never reaches the sources/extract path). The selection
// is owned by the caller through the shared selection hook
// (useSelectedDeckTemplateFileId, fork C1) and arrives as props.

import { useEffect, useRef, useState } from "react";
import { Button } from "@mui/material";
import {
  listDeckTemplateFilesAction,
  uploadDeckTemplateFileAction,
  type DeckTemplateFileMeta,
} from "@/app/actions/deck-template-files";
import { checkFileWireBudget } from "@/lib/upload-budget";
import { keepTemplateIdIfPresent } from "./panel-logic";

const PPTX_ACCEPT =
  ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation";

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export default function DeckTemplatePicker({
  selectedId,
  onSelectId,
}: {
  selectedId: string;
  onSelectId: (id: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [templates, setTemplates] = useState<DeckTemplateFileMeta[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline async IIFE + cancelled flag: setState only after the await.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await listDeckTemplateFilesAction();
        if (cancelled) return;
        if ("error" in result) {
          setError(result.error);
        } else {
          setTemplates(result.templates);
          setLoaded(true);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load uploaded templates.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // A stored id absent from the user-scoped list is cleared once it has loaded.
  useEffect(() => {
    const kept = keepTemplateIdIfPresent(
      selectedId,
      templates.map((t) => t.id),
      loaded
    );
    if (kept !== selectedId) onSelectId(kept);
  }, [selectedId, templates, loaded, onSelectId]);

  async function handleFile(file: File) {
    setError(null);
    // Client pre-check: refuse an oversize file before reading it, with a
    // worded message instead of the opaque platform rejection.
    const budget = checkFileWireBudget(file.size, "That template");
    if (!budget.ok) {
      setError(budget.error ?? "That template is too large to upload.");
      return;
    }
    setBusy(true);
    try {
      const base64 = await readFileAsBase64(file);
      const result = await uploadDeckTemplateFileAction(file.name.replace(/\.pptx$/i, ""), file.name, base64);
      if ("error" in result) {
        setError(result.error);
      } else {
        setTemplates((prev) => [result.template, ...prev.filter((t) => t.id !== result.template.id)]);
        onSelectId(result.template.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that template.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <strong>PowerPoint template (.pptx)</strong>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
        Optional. Upload an existing .pptx to use as the template: the generated deck is written into its
        slides and design. This is the template, not source material. The template needs at least as many
        slides as the deck.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
        <input
          ref={fileInputRef}
          type="file"
          accept={PPTX_ACCEPT}
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
        <Button
          variant="outlined"
          size="small"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          sx={{ textTransform: "none" }}
        >
          {busy ? "Uploading..." : "Upload .pptx template"}
        </Button>
        {templates.length > 0 && (
          <select
            aria-label="Choose an uploaded template"
            value={selectedId}
            onChange={(e) => onSelectId(e.target.value)}
          >
            <option value="">Use the deck&apos;s own design</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {selectedId && (
          <Button variant="text" size="small" onClick={() => onSelectId("")} sx={{ textTransform: "none" }}>
            Use the deck&apos;s own design instead
          </Button>
        )}
      </div>
      {error && (
        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "var(--danger-surface)",
            borderRadius: "var(--radius-xs)",
            fontSize: "var(--font-size-sm)",
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
