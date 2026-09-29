"use client";

// Renders one selected artifact kind's generation state: idle, loading, a
// produced artifact (content + optional critique + Regenerate), or an error
// (PRES-1 wave 3).

import { useState } from "react";
import { Button, CircularProgress } from "@mui/material";
import type { ContentArtifactKind, ProducedArtifact } from "@/lib/presentations/types";
import { KIND_LABELS, deckDownloadFilename } from "./panel-logic";
import SlideDeckPreview from "./SlideDeckPreview";

export type ArtifactCardState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ok"; artifact: ProducedArtifact; reviewSkipped: boolean }
  | { phase: "error"; message: string; retryable: boolean };

export default function ArtifactCard({
  kind,
  state,
  onRegenerate,
  regenerating,
}: {
  kind: ContentArtifactKind;
  state: ArtifactCardState;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--card-border, rgba(0,0,0,0.1))",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ margin: 0, fontSize: "var(--font-size-lg)" }}>{KIND_LABELS[kind]}</h4>
        {state.phase === "loading" && <CircularProgress size={18} />}
      </div>

      {state.phase === "idle" && (
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>Not generated yet.</p>
      )}

      {state.phase === "error" && (
        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "var(--danger-surface)",
            borderRadius: "var(--radius-xs)",
            color: "var(--danger)",
          }}
        >
          <p style={{ margin: 0 }}>{state.message}</p>
          {state.retryable && (
            <Button
              variant="outlined"
              size="small"
              onClick={onRegenerate}
              disabled={regenerating}
              sx={{ textTransform: "none", marginTop: "var(--space-2)" }}
            >
              Retry
            </Button>
          )}
        </div>
      )}

      {state.phase === "ok" && (
        <ArtifactContent
          artifact={state.artifact}
          reviewSkipped={state.reviewSkipped}
          onRegenerate={onRegenerate}
          regenerating={regenerating}
        />
      )}
    </div>
  );
}

function ArtifactContent({
  artifact,
  reviewSkipped,
  onRegenerate,
  regenerating,
}: {
  artifact: ProducedArtifact;
  reviewSkipped: boolean;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {artifact.kind === "outline" && (
        <pre
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "inherit",
            fontSize: "var(--font-size-md)",
          }}
        >
          {artifact.content.markdown}
        </pre>
      )}

      {artifact.kind === "activities" && (
        <ul style={{ margin: 0, paddingLeft: "var(--space-6)" }}>
          {artifact.content.ideas.map((idea, i) => (
            <li key={i} style={{ fontSize: "var(--font-size-md)" }}>
              {idea}
            </li>
          ))}
        </ul>
      )}

      {artifact.kind === "deck" && (
        <DeckArtifact deck={artifact.content} />
      )}

      {artifact.critique && (
        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "rgba(0,0,0,0.03)",
            borderRadius: "var(--radius-xs)",
          }}
        >
          <div
            style={{
              fontSize: "var(--font-size-xs)",
              fontWeight: 600,
              marginBottom: "var(--space-1)",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
            }}
          >
            Critique
          </div>
          <p style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>{artifact.critique.text}</p>
        </div>
      )}

      {!artifact.critique && reviewSkipped && (
        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "var(--warning-surface, rgba(0,0,0,0.03))",
            borderRadius: "var(--radius-xs)",
            color: "var(--text-secondary)",
          }}
        >
          <p style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>
            AI critique unavailable - generation ran out of time. Regenerate to retry.
          </p>
        </div>
      )}

      <div>
        <Button
          variant="outlined"
          size="small"
          onClick={onRegenerate}
          disabled={regenerating}
          sx={{ textTransform: "none" }}
        >
          {regenerating ? "Regenerating..." : "Regenerate with context"}
        </Button>
      </div>
    </div>
  );
}

function DeckArtifact({ deck }: { deck: import("@/lib/presentations/types").DeckContent }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const { serializeDeckToPptx } = await import("@/lib/presentations/deck-file");
      const buffer = await serializeDeckToPptx(deck);
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = deckDownloadFilename(deck.presentationTitle);
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Could not build the .pptx file.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong>{deck.presentationTitle}</strong>
        <Button
          variant="contained"
          size="small"
          onClick={handleDownload}
          disabled={downloading}
          sx={{ textTransform: "none" }}
        >
          {downloading ? "Preparing..." : "Download .pptx"}
        </Button>
      </div>
      {downloadError && <p style={{ color: "var(--danger)", margin: 0 }}>{downloadError}</p>}
      <SlideDeckPreview slides={deck.slides} />
    </div>
  );
}
