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
import DeckTemplatePicker from "./DeckTemplatePicker";
import { useSelectedDeckTemplateFileId } from "../ppt-design/hooks";
import ArtifactCard, { type ArtifactCardState } from "./ArtifactCard";
import styles from "./presentations.module.css";

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
  // Shared with the PowerPoint Design tab: one selected template everywhere.
  const [templateFileId, setTemplateFileId] = useSelectedDeckTemplateFileId();

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
    <div className={styles.panel}>
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

      <DeckTemplatePicker selectedId={templateFileId} onSelectId={setTemplateFileId} />

      <section className={`${styles.section} ${styles.outputsSection}`} aria-labelledby="presentation-outputs-title">
        <div className={styles.sectionHeading}>
          <span className={styles.stepNumber} aria-hidden="true">03</span>
          <div>
            <h2 id="presentation-outputs-title" className={styles.sectionTitle}>Choose deliverables</h2>
            <p className={styles.sectionDescription}>Select the materials to prepare for this presentation.</p>
          </div>
        </div>
        <div className={styles.choices}>
          {(["outline", "activities", "deck"] as ContentArtifactKind[]).map((kind) => (
            <FormControlLabel
              key={kind}
              className={`${styles.choice} ${selection[kind] ? styles.choiceSelected : ""}`}
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
            className={`${styles.choice} ${styles.reviewChoice} ${selection.review ? styles.choiceSelected : ""}`}
            control={<Checkbox checked={selection.review} onChange={() => toggleSelection("review")} />}
            label="Include AI critique for each artifact"
          />
        </div>
        <div className={styles.generateRow}>
          <p className={styles.generateHint}>
            {generating
              ? "Your selected materials are being prepared."
              : kinds.length === 0
                ? "Choose at least one deliverable to enable generation."
                : `${kinds.length} ${kinds.length === 1 ? "deliverable" : "deliverables"} selected.`}
          </p>
          <Button
            className={styles.generateButton}
            variant="contained"
            onClick={handleGenerate}
            disabled={generating || kinds.length === 0}
            sx={{ textTransform: "none" }}
          >
            {generating ? "Generating..." : "Generate"}
          </Button>
        </div>
      </section>

      {kinds.length > 0 && (
        <section className={styles.resultsSection} aria-labelledby="presentation-results-title">
          <div className={styles.sectionHeading}>
            <span className={styles.stepNumber} aria-hidden="true">04</span>
            <div>
              <h2 id="presentation-results-title" className={styles.sectionTitle}>Review your materials</h2>
              <p className={styles.sectionDescription}>Each result can be retried or regenerated with your context.</p>
            </div>
          </div>
          <div className={styles.resultsList}>
            {kinds.map((kind) => (
              <ArtifactCard
                key={kind}
                kind={kind}
                state={artifactStates[kind] ?? { phase: "idle" }}
                onRegenerate={() => handleRegenerateClick(kind)}
                regenerating={artifactStates[kind]?.phase === "loading"}
                templateFileId={templateFileId}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
