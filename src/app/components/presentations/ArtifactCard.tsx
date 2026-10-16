"use client";

// Renders one selected artifact kind's generation state: idle, loading, a
// produced artifact (content + optional critique + Regenerate), or an error
// (PRES-1 wave 3).

import { useState } from "react";
import { Button, CircularProgress } from "@mui/material";
import type { ContentArtifactKind, ProducedArtifact } from "@/lib/presentations/types";
import { fillDeckTemplateFileAction } from "@/app/actions/deck-template-files";
import {
  KIND_LABELS,
  base64ToArrayBuffer,
  chooseDeckDownloadPlan,
  deckDownloadFilename,
} from "./panel-logic";
import SlideDeckPreview from "./SlideDeckPreview";
import styles from "./presentations.module.css";

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
  templateFileId = "",
}: {
  kind: ContentArtifactKind;
  state: ArtifactCardState;
  onRegenerate: () => void;
  regenerating: boolean;
  templateFileId?: string;
}) {
  const phaseClass = {
    idle: styles.artifactIdle,
    loading: styles.artifactLoading,
    ok: styles.artifactOk,
    error: styles.artifactErrorState,
  }[state.phase];

  return (
    <article className={`${styles.artifactCard} ${phaseClass}`} aria-busy={state.phase === "loading"}>
      <div className={styles.artifactHeading}>
        <h3 className={styles.artifactTitle}>{KIND_LABELS[kind]}</h3>
        {state.phase === "loading" && <CircularProgress size={18} aria-label={`Generating ${KIND_LABELS[kind]}`} />}
      </div>

      {state.phase === "idle" && (
        <p style={{ color: "var(--text-secondary)", margin: 0 }}>Not generated yet.</p>
      )}

      {state.phase === "error" && (
        <div className={styles.artifactError} role="alert">
          <p className={styles.artifactMessage}>{state.message}</p>
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
          templateFileId={templateFileId}
        />
      )}
    </article>
  );
}

function ArtifactContent({
  artifact,
  reviewSkipped,
  onRegenerate,
  regenerating,
  templateFileId,
}: {
  artifact: ProducedArtifact;
  reviewSkipped: boolean;
  onRegenerate: () => void;
  regenerating: boolean;
  templateFileId: string;
}) {
  return (
    <div className={styles.artifactContent}>
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
        <DeckArtifact deck={artifact.content} templateFileId={templateFileId} />
      )}

      {artifact.critique && (
        <div className={styles.critiqueCard}>
          <div className={styles.critiqueLabel}>Critique</div>
          <p style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>{artifact.critique.text}</p>
        </div>
      )}

      {!artifact.critique && reviewSkipped && (
        <div className={styles.reviewNotice} role="status">
          <p style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>
            AI critique unavailable - generation ran out of time. Regenerate to retry.
          </p>
        </div>
      )}

      <div className={styles.artifactActions}>
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

function DeckArtifact({
  deck,
  templateFileId,
}: {
  deck: import("@/lib/presentations/types").DeckContent;
  templateFileId: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      let buffer: ArrayBuffer;
      if (chooseDeckDownloadPlan(templateFileId) === "template") {
        // A deck with more slides than the template is REFUSED by the fill
        // action with a worded fit-report; surface it, never drop slides.
        const result = await fillDeckTemplateFileAction(templateFileId, {
          presentationTitle: deck.presentationTitle,
          slides: deck.slides,
        });
        if ("error" in result) {
          setDownloadError(result.error);
          return;
        }
        buffer = base64ToArrayBuffer(result.base64);
      } else {
        const { serializeDeckToPptx } = await import("@/lib/presentations/deck-file");
        buffer = await serializeDeckToPptx(deck);
      }
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
    <div className={styles.deckArtifact}>
      <div className={styles.deckArtifactHeading}>
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
      {downloadError && <p className={styles.downloadError} role="alert">{downloadError}</p>}
      <SlideDeckPreview slides={deck.slides} />
    </div>
  );
}
