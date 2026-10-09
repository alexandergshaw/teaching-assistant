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

import { useState } from "react";
import { Alert, Button, Card, CardActionArea, CardContent, TextField, Typography } from "@mui/material";
import SlideDeckPreview from "../SlideDeckPreview";
import { usePersistedJSON } from "../hooks";
import type { PipelineState } from "@/lib/presentations/pipeline";
import type { PptxSlide } from "@/lib/pptx";
import { applyRegenDecision, buildPipelineRequest, extractRegenCandidate } from "./panel-logic";

const PIPELINE_URL = "/api/presentations/pipeline";
const REGEN_SLIDE_INDEX_KEY = "ta-pres-regen-slide-index";
const REGEN_INSTRUCTION_KEY = "ta-pres-regen-instruction";

const MAX_PREVIEW_BULLETS = 2;

type SetPipelineState = (value: PipelineState | ((prev: PipelineState) => PipelineState)) => void;

interface SlideRegenViewProps {
  pipelineState: PipelineState;
  setPipelineState: SetPipelineState;
  contextText: string;
  onBack: () => void;
}

export default function SlideRegenView({ pipelineState, setPipelineState, contextText, onBack }: SlideRegenViewProps) {
  const slides = pipelineState.deck.artifact?.slides ?? [];
  const [storedIndex, setSelectedIndex] = usePersistedJSON<number>(REGEN_SLIDE_INDEX_KEY, 0);
  const [instruction, setInstruction] = usePersistedJSON<string>(REGEN_INSTRUCTION_KEY, "");
  const [candidate, setCandidate] = useState<PptxSlide | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The persisted index can outlive the deck it pointed into; clamp for use.
  const selectedIndex = slides.length === 0 ? 0 : Math.min(Math.max(Number(storedIndex) || 0, 0), slides.length - 1);
  const current = slides[selectedIndex] ?? null;

  function selectSlide(index: number) {
    setSelectedIndex(index);
    setCandidate(null);
    setError(null);
  }

  async function handleGenerate() {
    if (pipelineState.deck.status !== "done" || instruction.trim() === "") return;
    setBusy(true);
    setError(null);
    setCandidate(null);
    try {
      const request = buildPipelineRequest("regen-slide", pipelineState, contextText, {
        slideIndex: selectedIndex,
        instruction,
      });
      const res = await fetch(PIPELINE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const body: unknown = await res.json().catch(() => undefined);
      const next = extractRegenCandidate(res.status, body);
      if (next) {
        setCandidate(next);
      } else {
        setError("The slide could not be regenerated. Your deck was not changed.");
      }
    } catch {
      setError("The slide could not be regenerated. Your deck was not changed.");
    } finally {
      setBusy(false);
    }
  }

  function handleAccept() {
    if (!candidate) return;
    setPipelineState((prev) => applyRegenDecision(prev, candidate, selectedIndex, "accept"));
    setCandidate(null);
    setInstruction("");
  }

  function handleDiscard() {
    if (!candidate) return;
    setPipelineState((prev) => applyRegenDecision(prev, candidate, selectedIndex, "discard"));
    setCandidate(null);
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
        <Button variant="outlined" onClick={onBack} sx={{ textTransform: "none", flexShrink: 0 }}>
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
