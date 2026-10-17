"use client";

// Presentations > Slide Deck Pipeline > "Regenerate a slide" full-screen mode
// (PRESENTATIONS-PIPELINE reading B). A thumbnail grid of the deck's slides to
// pick from, an instruction box, and a before/after preview of the regenerated
// CANDIDATE. The committed deck is not touched until the instructor accepts:
// both Accept and Discard route through the pure `applyRegenDecision` reducer
// (panel-logic.ts), and the fetched candidate is held in local, non-persisted
// state.
//
// Thumbnails are STRUCTURAL (number, title, short body preview) - there is no
// slide rasterizer in this stack. The laid-out slide is only visible in the
// downloaded .pptx. OWNER-VERIFICATION: nothing renders under vitest; the
// grid, the before/after pair and the reload behaviour are owner-walks.

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, CardActionArea, CardContent, TextField, Typography } from "@mui/material";
import SlideDeckPreview from "../SlideDeckPreview";
import { usePersistedJSON } from "../hooks";
import type { PipelineState } from "@/lib/presentations/pipeline";
import type { PptxSlide } from "@/lib/pptx";
import { applyRegenDecision, buildPipelineRequest, countDeckDependents, extractRegenCandidate } from "./panel-logic";
import { recordPipelineDiagnostic } from "./pipeline-objectives";

const PIPELINE_URL = "/api/presentations/pipeline";
const REGEN_SLIDE_INDEX_KEY = "ta-pres-regen-slide-index";
const REGEN_INSTRUCTION_KEY = "ta-pres-regen-instruction";

const MAX_PREVIEW_BULLETS = 2;

type SetPipelineState = (value: PipelineState | ((prev: PipelineState) => PipelineState)) => void;

interface SlideRegenViewProps {
  pipelineState: PipelineState;
  setPipelineState: SetPipelineState;
  contextText: string;
  appliedObjectives: string[];
  onBack: () => void;
}

export default function SlideRegenView({ pipelineState, setPipelineState, contextText, appliedObjectives, onBack }: SlideRegenViewProps) {
  const slides = pipelineState.deck.artifact?.slides ?? [];
  const [storedIndex, setSelectedIndex] = usePersistedJSON<number>(REGEN_SLIDE_INDEX_KEY, 0);
  const [instruction, setInstruction] = usePersistedJSON<string>(REGEN_INSTRUCTION_KEY, "");
  const [candidate, setCandidate] = useState<PptxSlide | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestState = useRef(pipelineState);
  useEffect(() => { latestState.current = pipelineState; }, [pipelineState]);
  const requestId = useRef(0);
  const candidateBase = useRef<PptxSlide | null>(null);

  // The persisted index can outlive the deck it pointed into; clamp for use.
  const selectedIndex = slides.length === 0 ? 0 : Math.min(Math.max(Number(storedIndex) || 0, 0), slides.length - 1);
  const current = slides[selectedIndex] ?? null;

  function selectSlide(index: number) {
    requestId.current += 1;
    setSelectedIndex(index);
    setCandidate(null);
    setError(null);
  }

  async function handleGenerate() {
    if (pipelineState.deck.status !== "done" || instruction.trim() === "") return;
    setBusy(true);
    setError(null);
    setCandidate(null);
    candidateBase.current = null;
    const currentRequest = ++requestId.current;
    const startingSlide = current;
    const started = Date.now();
    try {
      const request = buildPipelineRequest("regen-slide", pipelineState, contextText, {
        slideIndex: selectedIndex,
        instruction,
        objectives: appliedObjectives,
      });
      const res = await fetch(PIPELINE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const body: unknown = await res.json().catch(() => undefined);
      const next = extractRegenCandidate(res.status, body);
      const currentDeck = latestState.current.deck.artifact;
      const stillCurrent = currentRequest === requestId.current && currentDeck?.slides[selectedIndex] === startingSlide;
      if (next && stillCurrent) {
        setCandidate(next);
        candidateBase.current = startingSlide;
        recordPipelineDiagnostic("pipeline_slide_regeneration", "success", Date.now() - started, 1);
      } else {
        setError("The slide could not be regenerated. Your deck was not changed.");
        recordPipelineDiagnostic("pipeline_slide_regeneration", "failure", Date.now() - started, 0, 0, stillCurrent ? "MODEL_RESPONSE" : "STALE");
      }
    } catch {
      setError("The slide could not be regenerated. Your deck was not changed.");
      recordPipelineDiagnostic("pipeline_slide_regeneration", "failure", Date.now() - started, 0, 0, "NETWORK");
    } finally {
      setBusy(false);
    }
  }

  function handleAccept() {
    if (!candidate) return;
    const expected = candidateBase.current;
    if (!expected || pipelineState.deck.artifact?.slides[selectedIndex] !== expected) {
      setError("This candidate is out of date because the slide changed. Generate it again.");
      setCandidate(null);
      candidateBase.current = null;
      recordPipelineDiagnostic("pipeline_slide_candidate_accept", "failure", 0, 0, 0, "STALE");
      return;
    }
    setPipelineState((prev) => applyRegenDecision(prev, candidate, selectedIndex, "accept", expected));
    recordPipelineDiagnostic("pipeline_slide_candidate_accept", "success", 0, 1, countDeckDependents(pipelineState));
    setCandidate(null);
    candidateBase.current = null;
    setInstruction("");
  }

  function handleDiscard() {
    if (!candidate) return;
    setPipelineState((prev) => applyRegenDecision(prev, candidate, selectedIndex, "discard"));
    recordPipelineDiagnostic("pipeline_slide_candidate_discard", "success", 0, 1);
    setCandidate(null);
    candidateBase.current = null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)" }}>
        <div>
          <Typography variant="h6">Regenerate a slide</Typography>
          <Typography variant="body2" color="text.secondary">
            Pick a slide, say what should change, and compare the result with the current slide before keeping it.
            Every other slide is left as it is.
          </Typography>
        </div>
        <Button variant="outlined" onClick={() => { requestId.current += 1; onBack(); }} sx={{ textTransform: "none", flexShrink: 0 }}>
          Back to pipeline
        </Button>
      </div>

      {slides.length === 0 ? (
        <Alert severity="info">Generate the deck first, then come back to regenerate a slide.</Alert>
      ) : (
        <>
          <Typography variant="caption" color="text.secondary">
            These previews show each slide&apos;s text and structure, not its final layout. Download the .pptx to see
            the laid-out slide.
          </Typography>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: "var(--space-3)",
            }}
          >
            {slides.map((slide, idx) => (
              <Card
                key={idx}
                variant="outlined"
                sx={idx === selectedIndex ? { borderColor: "primary.main", borderWidth: 2 } : undefined}
              >
                <CardActionArea onClick={() => selectSlide(idx)} aria-pressed={idx === selectedIndex} disabled={busy}>
                  <CardContent>
                    <Typography variant="caption" color="text.secondary">
                      Slide {idx + 1}
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      {slide.title}
                    </Typography>
                    {slide.bullets.slice(0, MAX_PREVIEW_BULLETS).map((bullet, i) => (
                      <Typography key={i} variant="body2" color="text.secondary" noWrap>
                        {bullet}
                      </Typography>
                    ))}
                    {slide.bullets.length > MAX_PREVIEW_BULLETS && (
                      <Typography variant="caption" color="text.secondary">
                        +{slide.bullets.length - MAX_PREVIEW_BULLETS} more
                      </Typography>
                    )}
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </div>

          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
            <TextField
              label={`What should change on slide ${selectedIndex + 1}?`}
              size="small"
              fullWidth
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={busy}
            />
            <Button
              variant="contained"
              onClick={handleGenerate}
              disabled={busy || instruction.trim() === ""}
              sx={{ textTransform: "none", flexShrink: 0 }}
            >
              {busy ? "Generating..." : "Generate candidate"}
            </Button>
          </div>

          {error && <Alert severity="error">{error}</Alert>}

          {candidate && current && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "var(--space-4)",
                }}
              >
                <div>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Current
                  </Typography>
                  <SlideDeckPreview slides={[current]} startNumber={selectedIndex + 1} />
                </div>
                <div>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Regenerated candidate
                  </Typography>
                  <SlideDeckPreview slides={[candidate]} startNumber={selectedIndex + 1} />
                </div>
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <Button variant="contained" onClick={handleAccept} sx={{ textTransform: "none" }}>
                  Accept
                </Button>
                <Button variant="outlined" onClick={handleDiscard} sx={{ textTransform: "none" }}>
                  Discard
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
