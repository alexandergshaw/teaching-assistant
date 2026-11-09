"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { fillDeckTemplateFileAction } from "@/app/actions/deck-template-files";

type Preview = { token: string; paragraphs: { slide: number; text: string }[] };
type Deck = { presentationTitle: string; slides: { title: string; bullets: string[] }[] };

/** One explicit decision, bound by the server to the source and deck snapshot. */
export function useTemplateFillReview() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const pending = useRef<((accepted: boolean) => void) | null>(null);
  const generation = useRef(0);
  useLayoutEffect(() => () => { generation.current++; pending.current?.(false); pending.current = null; }, []);
  const settle = (accepted: boolean) => { const resolve = pending.current; pending.current = null; setPreview(null); resolve?.(accepted); };
  async function fill(id: string, deck: Deck, isCurrent: () => boolean = () => true) {
    const ticket = generation.current;
    const current = () => ticket === generation.current && isCurrent();
    const snapshot = { presentationTitle: deck.presentationTitle, slides: deck.slides.map((slide) => ({ title: slide.title, bullets: [...slide.bullets] })) };
    const first = await fillDeckTemplateFileAction(id, snapshot);
    if (!("preview" in first) || !first.preview) return current() ? first : { error: "The deck or template changed. Review it again." };
    if (!current() || pending.current) return { error: "The deck or template changed. Review it again." };
    const accepted = await new Promise<boolean>((resolve) => { pending.current = resolve; setPreview(first.preview!); });
    if (!accepted) return { error: "Template fill canceled. No file was changed." };
    if (!current()) return { error: "The deck or template changed. Review it again." };
    const result = await fillDeckTemplateFileAction(id, snapshot, first.preview.token);
    return current() ? result : { error: "The deck or template changed. Review it again." };
  }
  const dialog = <Dialog open={preview !== null} onClose={() => settle(false)} aria-labelledby="template-fill-review-title" fullWidth maxWidth="md">
    <DialogTitle id="template-fill-review-title">Review text to clear</DialogTitle>
    <DialogContent><Alert severity="warning">These editable paragraphs will be cleared in the generated copy. They may include footers or attribution. Images, graphics, notes and other content are not inspected or cleared.</Alert>
      {preview?.paragraphs.map((paragraph, index) => <Typography key={index} sx={{ whiteSpace: "pre-wrap", mt: 1 }}>Slide {paragraph.slide}: {paragraph.text || "(empty)"}</Typography>)}
    </DialogContent><DialogActions><Button onClick={() => settle(false)}>Cancel</Button><Button variant="contained" onClick={() => settle(true)}>Clear listed text and continue</Button></DialogActions>
  </Dialog>;
  return { fill, dialog };
}
