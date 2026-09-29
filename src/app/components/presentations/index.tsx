"use client";

// Presentations > Slide Deck Creation panel (PRES-1 wave 3). Thin: state and
// wiring live here, extracted pure logic lives in panel-logic.ts, rendering
// for one artifact lives in ArtifactCard.tsx, the deck preview lives in
// SlideDeckPreview.tsx, and the context/source inputs live in
// SourcesEditor.tsx.

import { useCallback, useState } from "react";
import { Button, Checkbox, FormControlLabel } from "@mui/material";
import TabHeader from "../TabHeader";
import type {
  ArtifactSelection,
  ContentArtifactKind,
  PresentationContext,
  PresentationSource,
  ProducedArtifact,
} from "@/lib/presentations/types";
import {
  KIND_LABELS,
  buildGenerateRequestBody,
  buildRegenerateRequestBody,
  reduceGenerateResponse,
  selectedKinds,
  DEFAULT_ARTIFACT_SELECTION,
  PRES_CONTEXT_TEXT_KEY,
  PRES_SOURCES_KEY,
  PRES_SELECTION_KEY,
} from "./panel-logic";
import { usePersistedJSON } from "./hooks";
import SourcesEditor from "./SourcesEditor";
import ArtifactCard, { type ArtifactCardState } from "./ArtifactCard";

const GENERATE_URL = "/api/presentations/generate";

type ArtifactStates = Partial<Record<ContentArtifactKind, ArtifactCardState>>;

export default function PresentationsTab() {
  const [contextText, setContextText] = usePersistedJSON<string>(PRES_CONTEXT_TEXT_KEY, "");
  const [sources, setSources] = usePersistedJSON<PresentationSource[]>(PRES_SOURCES_KEY, []);
  const [selection, setSelection] = usePersistedJSON<ArtifactSelection>(
    PRES_SELECTION_KEY,
    DEFAULT_ARTIFACT_SELECTION
  );
  const [artifactStates, setArtifactStates] = useState<ArtifactStates>({});
  const [generating, setGenerating] = useState(false);

  const context: PresentationContext = { text: contextText, sources };

  const toggleSelection = useCallback(
    (key: keyof ArtifactSelection) => {
      setSelection({ ...selection, [key]: !selection[key] });
    },
    [selection, setSelection]
  );

  const fetchKind = useCallback(
    async (kind: ContentArtifactKind) => {
      setArtifactStates((prev) => ({ ...prev, [kind]: { phase: "loading" } }));
      try {
        const res = await fetch(GENERATE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildGenerateRequestBody(context, selection, kind)),
        });
        const body = await res.json().catch(() => undefined);
        const outcome = reduceGenerateResponse(res.status, body);
        setArtifactStates((prev) => ({ ...prev, [kind]: outcome }));
      } catch {
        setArtifactStates((prev) => ({
          ...prev,
          [kind]: {
            phase: "error",
            message: "Could not reach the server. Check your connection and try again.",
            retryable: true,
          },
        }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [context, selection]
  );

  const regenerateKind = useCallback(
    async (kind: ContentArtifactKind, priorArtifact: ProducedArtifact) => {
      setArtifactStates((prev) => ({ ...prev, [kind]: { phase: "loading" } }));
      try {
        const res = await fetch(GENERATE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildRegenerateRequestBody({
              kind,
              priorContext: context,
              priorCritique: priorArtifact.critique,
              priorContent: priorArtifact.content,
              withReview: selection.review,
            })
          ),
        });
        const body = await res.json().catch(() => undefined);
        const outcome = reduceGenerateResponse(res.status, body);
        setArtifactStates((prev) => ({ ...prev, [kind]: outcome }));
      } catch {
        setArtifactStates((prev) => ({
          ...prev,
          [kind]: {
            phase: "error",
            message: "Could not reach the server. Check your connection and try again.",
            retryable: true,
          },
        }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [context, selection.review]
  );

  async function handleGenerate() {
    const kinds = selectedKinds(selection);
    if (kinds.length === 0) return;
    setGenerating(true);
    await Promise.allSettled(kinds.map((kind) => fetchKind(kind)));
    setGenerating(false);
  }

  function handleRegenerateClick(kind: ContentArtifactKind) {
    const state = artifactStates[kind];
    if (state && state.phase === "ok") {
      void regenerateKind(kind, state.artifact);
    } else {
      // No prior successful artifact to regenerate from (e.g. retrying after
      // an error) - fall back to a fresh generate for this kind.
      void fetchKind(kind);
    }
  }

  const kinds = selectedKinds(selection);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
      <TabHeader
        eyebrow="Presentations"
        title="Slide Deck Creation"
        subtitle="Paste lecture context, choose what to generate, and review each artifact in place."
      />

      <SourcesEditor
        text={contextText}
        onTextChange={setContextText}
        sources={sources}
        onSourcesChange={setSources}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <strong>Generate</strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)" }}>
          {(["outline", "activities", "deck"] as ContentArtifactKind[]).map((kind) => (
            <FormControlLabel
              key={kind}
              control={
                <Checkbox
                  checked={selection[kind]}
                  onChange={() => toggleSelection(kind)}
                />
              }
              label={KIND_LABELS[kind]}
            />
          ))}
          <FormControlLabel
            control={<Checkbox checked={selection.review} onChange={() => toggleSelection("review")} />}
            label="Include AI critique for each artifact"
          />
        </div>
        <div>
          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={generating || kinds.length === 0}
            sx={{ textTransform: "none" }}
          >
            {generating ? "Generating..." : "Generate"}
          </Button>
        </div>
      </div>

      {kinds.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {kinds.map((kind) => (
            <ArtifactCard
              key={kind}
              kind={kind}
              state={artifactStates[kind] ?? { phase: "idle" }}
              onRegenerate={() => handleRegenerateClick(kind)}
              regenerating={artifactStates[kind]?.phase === "loading"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
