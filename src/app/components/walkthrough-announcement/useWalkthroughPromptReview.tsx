"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { takeDisplayedRequest } from "./prompt-review-queue";
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, TextField } from "@mui/material";

type Request = { prompt: string; resolve: (value: string | null) => void };

/** Reviews are queued because multiple draft slots can be generated together. */
export function useWalkthroughPromptReview(scopeKey: string) {
  const scope = useRef(scopeKey);
  const queue = useRef<Request[]>([]);
  const [current, setCurrent] = useState<Request | null>(null);
  const [edited, setEdited] = useState("");
  const active = useRef(true);
  useLayoutEffect(() => {
    scope.current = scopeKey;
    const pending = queue.current.splice(0);
    pending.forEach(item => item.resolve(null));
    queueMicrotask(() => { if (queue.current.length === 0) { setCurrent(null); setEdited(""); } });
  }, [scopeKey]);
  useEffect(() => {
    active.current = true;
    const pendingQueue = queue.current;
    return () => { active.current = false; pendingQueue.splice(0).forEach(item => item.resolve(null)); };
  }, []);
  const review = useCallback((prompt: string, requestedScope: string): Promise<string | null> => {
    if (!active.current || requestedScope !== scope.current) return Promise.resolve(null);
    return new Promise(resolve => {
      const request = { prompt, resolve };
      queue.current.push(request);
      if (queue.current.length === 1) { setCurrent(request); setEdited(prompt); }
    });
  }, []);
  const finish = useCallback((displayed: Request | null, value: string | null) => {
    const item = takeDisplayedRequest(queue.current, displayed);
    if (!item) return;
    item.resolve(value);
    const next = queue.current[0] ?? null;
    setCurrent(next);
    setEdited(next?.prompt ?? "");
  }, []);
  const dialog = <Dialog open={current !== null} onClose={() => finish(current, null)} fullWidth maxWidth="lg" aria-labelledby="walkthrough-prompt-title">
    <DialogTitle id="walkthrough-prompt-title">Review announcement prompt</DialogTitle>
    <DialogContent>
      <DialogContentText>This is the complete text sent to the selected AI provider for this announcement. Edit it before generating. Each announcement has its own prompt.</DialogContentText>
      <TextField autoFocus fullWidth multiline minRows={14} maxRows={24} margin="normal" label="Prompt sent to the AI" value={edited} onChange={event => setEdited(event.target.value)} slotProps={{ htmlInput: { maxLength: 160000 } }} />
    </DialogContent>
    <DialogActions><Button onClick={() => finish(current, null)}>Cancel draft</Button><Button variant="contained" disabled={!edited.trim() || edited.length > 160000} onClick={() => finish(current, edited)}>Generate announcement</Button></DialogActions>
  </Dialog>;
  return { review, dialog };
}
