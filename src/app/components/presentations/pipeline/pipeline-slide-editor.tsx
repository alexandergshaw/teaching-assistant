"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, CardActionArea, CardContent, TextField, Typography } from "@mui/material";
import type { PipelineState } from "@/lib/presentations/pipeline";
import type { PptxSlide } from "@/lib/pptx";
import { editPipelineSlide, isCurrentSlideDraft } from "./panel-logic";

type SetState = (value: PipelineState | ((previous: PipelineState) => PipelineState)) => void;

export function PipelineSlideEditor({ state, setState, templateSelected, disabled = false, onSaved }: {
  state: PipelineState; setState: SetState; templateSelected: boolean; disabled?: boolean; onSaved: (invalidated: number) => void;
}) {
  const slides = state.deck.artifact?.slides ?? [];
  const deck = state.deck.artifact;
  const firstSlide = slides[0];
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState(() => firstSlide ? { title: firstSlide.title, bulletsText: firstSlide.bullets.join("\n"), notes: firstSlide.notes ?? "" } : { title: "", bulletsText: "", notes: "" });
  const [error, setError] = useState("");
  const slide = slides[index];
  const sourceDeck = useRef(deck);
  const sourceSlide = useRef<PptxSlide | undefined>(slide);

  useEffect(() => {
    if (sourceDeck.current === deck) return;
    sourceDeck.current = deck;
    const next = deck?.slides[0];
    sourceSlide.current = next;
    setIndex(0);
    setDraft(next ? { title: next.title, bulletsText: next.bullets.join("\n"), notes: next.notes ?? "" } : { title: "", bulletsText: "", notes: "" });
    setError("");
  }, [deck]);

  function selectSlide(slideIndex: number) {
    setIndex(slideIndex);
    const next = slides[slideIndex];
    sourceDeck.current = deck;
    sourceSlide.current = next;
    setDraft(next ? { title: next.title, bulletsText: next.bullets.join("\n"), notes: next.notes ?? "" } : { title: "", bulletsText: "", notes: "" });
    setError("");
  }

  function save() {
    if (!isCurrentSlideDraft(sourceDeck.current, sourceSlide.current, deck, slide)) {
      setError("The deck changed while this slide was being edited. Review the current slide before saving.");
      return;
    }
    const result = editPipelineSlide(state, index, { ...draft, notes: templateSelected ? slide?.notes ?? "" : draft.notes });
    if (result.error) { setError(result.error); return; }
    if (result.changed) { setState(result.state); onSaved(result.invalidated); }
  }

  return <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
    <Typography variant="subtitle2">Edit an individual slide</Typography>
    {slides.length === 0 ? <Alert severity="info">Generate a deck before editing slides.</Alert> : <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "var(--space-2)" }}>
        {slides.map((item, slideIndex) => <Card key={slideIndex} variant="outlined"><CardActionArea onClick={() => selectSlide(slideIndex)} aria-pressed={index === slideIndex} disabled={disabled}><CardContent><Typography variant="caption">Slide {slideIndex + 1}</Typography><Typography variant="body2">{item.title}</Typography></CardContent></CardActionArea></Card>)}
      </div>
      {slide && <>
        <TextField label="Slide title" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} slotProps={{ htmlInput: { maxLength: 60 } }} disabled={disabled} />
        <TextField label="Bullets, one per line" multiline minRows={4} value={draft.bulletsText} onChange={(event) => setDraft((current) => ({ ...current, bulletsText: event.target.value }))} disabled={disabled} />
        <TextField label="Speaker notes" multiline minRows={4} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} disabled={templateSelected || disabled} slotProps={{ htmlInput: { maxLength: 6000 } }} />
        {templateSelected && <Alert severity="info">Speaker-note editing is disabled while a template is selected. Template downloads preserve the template&apos;s existing notes.</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        <div style={{ display: "flex", gap: "var(--space-2)" }}><Button variant="contained" onClick={save} disabled={disabled}>Save slide</Button><Button variant="outlined" onClick={() => { setDraft({ title: slide.title, bulletsText: slide.bullets.join("\n"), notes: slide.notes ?? "" }); setError(""); }}>Cancel</Button></div>
      </>}
    </>}
  </div>;
}
