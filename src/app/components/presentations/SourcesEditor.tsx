"use client";

// The context input for the Presentations panel: free-form text, zero or
// more named pasted-text sources, and drag-and-drop (or click-to-browse)
// file intake, building PresentationContext (PRES-1 wave 3 + file-intake
// increment). File extraction reuses extractDeckSourceFileAction verbatim
// (src/app/actions/deck-source.ts, A43-S) - no second extractor is written
// here; this component only reads the dropped File into base64 (same idiom
// as src/app/components/ppt-design/index.tsx's readFileAsBase64) and hands
// the result to the pure mapper in panel-logic.ts.

import { useRef, useState } from "react";
import { Button, IconButton, TextField, Typography } from "@mui/material";
import type { PresentationSource } from "@/lib/presentations/types";
import { extractDeckSourceFileAction } from "@/app/actions/deck-source";
import { appendExtractedSourceNamed } from "./panel-logic";

interface PendingUpload {
  id: string;
  name: string;
  phase: "extracting" | "error";
  message?: string;
}

// onSourcesChange accepts a functional updater (prev => next), same shape as
// React's setState, so a value can be composed against the LATEST committed
// sources rather than a snapshot captured before this call started. This is
// what makes overlapping drops (a second file dropped while an earlier one is
// still extracting) race-safe: each append reads the array the other append
// just produced instead of both reading the same stale base and one
// overwriting the other's result. See handleFiles below.
type SourcesUpdater = PresentationSource[] | ((prev: PresentationSource[]) => PresentationSource[]);

export default function SourcesEditor({
  text,
  onTextChange,
  sources,
  onSourcesChange,
}: {
  text: string;
  onTextChange: (value: string) => void;
  sources: PresentationSource[];
  onSourcesChange: (value: SourcesUpdater) => void;
}) {
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function addSource() {
    onSourcesChange([...sources, { name: `Source ${sources.length + 1}`, text: "" }]);
  }

  function updateSource(idx: number, patch: Partial<PresentationSource>) {
    onSourcesChange(sources.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function removeSource(idx: number) {
    onSourcesChange(sources.filter((_, i) => i !== idx));
  }

  // Same base64-reading idiom as ppt-design/index.tsx's readFileAsBase64:
  // server actions take a base64 payload, not raw bytes, so the FileReader
  // dance happens client-side and only the payload (after the comma) is
  // sent on.
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

  // Files within ONE call are still handled one at a time (not Promise.all),
  // but names are no longer deduped against a snapshot taken once up front:
  // each successful extraction appends via a functional updater, so
  // uniqueSourceName runs inside that updater against whatever is the
  // LATEST committed `sources` at the moment it actually applies. That is
  // what makes this safe across overlapping calls to handleFiles too (e.g.
  // a second drop landing while an earlier drop's extraction is still in
  // flight): neither call snapshots `sources` up front any more, so there is
  // no stale base for two completions to race on, and no drop can silently
  // overwrite another's result.
  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);

    for (const file of files) {
      const id = `${file.name}-${Date.now()}-${Math.random()}`;
      setUploads((prev) => [...prev, { id, name: file.name, phase: "extracting" }]);

      try {
        const base64 = await readFileAsBase64(file);
        const result = await extractDeckSourceFileAction(file.name, base64);

        if ("error" in result) {
          setUploads((prev) =>
            prev.map((u) => (u.id === id ? { ...u, phase: "error", message: result.error } : u))
          );
        } else {
          onSourcesChange((prev) => appendExtractedSourceNamed(prev, file.name, result.materials));
          setUploads((prev) => prev.filter((u) => u.id !== id));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not read that file.";
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, phase: "error", message } : u)));
      }
    }
  }

  function dismissUpload(id: string) {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <TextField
        label="Context"
        placeholder="Describe the lecture/module this presentation covers"
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        fullWidth
        multiline
        rows={4}
      />

      <div
        role="button"
        tabIndex={0}
        aria-label="Drop files here to add them as sources, or press Enter to browse for files"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            void handleFiles(e.dataTransfer.files);
          }
        }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--space-1)",
          padding: "var(--space-4)",
          border: "1px dashed var(--card-border, rgba(0,0,0,0.25))",
          borderRadius: "var(--radius-xs)",
          textAlign: "center",
          cursor: "pointer",
        }}
      >
        <Typography variant="body2">Drag and drop files here, or click to browse</Typography>
        <Typography variant="caption" color="text.secondary">
          Any file type - text is extracted automatically and added as a source
        </Typography>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              void handleFiles(e.target.files);
            }
            e.target.value = "";
          }}
        />
      </div>

      {uploads.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          {uploads.map((u) => (
            <div
              key={u.id}
              style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}
            >
              {u.phase === "extracting" ? (
                <Typography variant="body2">{u.name}: extracting...</Typography>
              ) : (
                <>
                  <Typography variant="body2" color="error">
                    {u.name}: {u.message ?? "Could not extract that file."}
                  </Typography>
                  <IconButton
                    aria-label={`Dismiss error for ${u.name}`}
                    onClick={() => dismissUpload(u.id)}
                    size="small"
                  >
                    <span aria-hidden="true">&times;</span>
                  </IconButton>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        {sources.map((source, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              padding: "var(--space-3)",
              border: "1px solid var(--card-border, rgba(0,0,0,0.1))",
              borderRadius: "var(--radius-xs)",
            }}
          >
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
              <TextField
                label="Source name"
                value={source.name}
                onChange={(e) => updateSource(idx, { name: e.target.value })}
                size="small"
                fullWidth
              />
              <IconButton
                aria-label={`Remove source ${source.name}`}
                onClick={() => removeSource(idx)}
                size="small"
              >
                <span aria-hidden="true">&times;</span>
              </IconButton>
            </div>
            <TextField
              label="Pasted text"
              value={source.text}
              onChange={(e) => updateSource(idx, { text: e.target.value })}
              fullWidth
              multiline
              rows={3}
              size="small"
            />
          </div>
        ))}
        <Button variant="outlined" size="small" onClick={addSource} sx={{ textTransform: "none", alignSelf: "start" }}>
          Add pasted source
        </Button>
      </div>
    </div>
  );
}
