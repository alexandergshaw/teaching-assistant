"use client";

// The context input for the Presentations panel: free-form text plus zero or
// more named pasted-text sources, building PresentationContext (PRES-1 wave
// 3). Paste-only, in-house - no file upload widget here (that surface is
// owned by the deck-source extraction actions elsewhere in the app, out of
// this wave's scope).

import { Button, IconButton, TextField } from "@mui/material";
import type { PresentationSource } from "@/lib/presentations/types";

export default function SourcesEditor({
  text,
  onTextChange,
  sources,
  onSourcesChange,
}: {
  text: string;
  onTextChange: (value: string) => void;
  sources: PresentationSource[];
  onSourcesChange: (value: PresentationSource[]) => void;
}) {
  function addSource() {
    onSourcesChange([...sources, { name: `Source ${sources.length + 1}`, text: "" }]);
  }

  function updateSource(idx: number, patch: Partial<PresentationSource>) {
    onSourcesChange(sources.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function removeSource(idx: number) {
    onSourcesChange(sources.filter((_, i) => i !== idx));
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
