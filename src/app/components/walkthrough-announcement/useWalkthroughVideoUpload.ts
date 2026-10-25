"use client";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { runVideoRead, type VideoReadInput, type VideoReadProgress, type VideoReadResult } from "./walkthrough-video-run";

export function useWalkthroughVideoUpload(scope: string) {
  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<VideoReadProgress | null>(null);
  const [result, setResult] = useState<VideoReadResult | null>(null);
  const [resultScope, setResultScope] = useState(scope);
  const invalidate = useCallback(() => { epoch.current++; controller.current?.abort(); controller.current = null; }, []);
  const cancel = useCallback(() => { invalidate(); setBusy(false); }, [invalidate]);
  const reset = useCallback(() => { cancel(); setResult(null); setProgress(null); }, [cancel]);
  useLayoutEffect(() => {
    invalidate();
    return invalidate;
  }, [scope, invalidate]);
  const start = useCallback(async (input: Omit<VideoReadInput, "signal" | "isCurrent" | "progress">) => {
    cancel();
    const token = epoch.current;
    const active = new AbortController();
    controller.current = active;
    setResultScope(scope);
    setBusy(true); setResult(null); setProgress(null);
    const value = await runVideoRead({ ...input, signal: active.signal, isCurrent: () => token === epoch.current,
      progress: value => { if (token === epoch.current) setProgress(value); } });
    if (token === epoch.current) { setResult(value); setBusy(false); controller.current = null; }
    return token === epoch.current ? value : null;
  }, [cancel, scope]);
  const visibleOnly = useCallback(() => {
    setResult(value => value?.status === "needs-visible-only" && value.blocks.some(batch => batch.length)
      ? { ...value, status: "ready", narration: "", code: "visible-only-fallback" } : value);
  }, []);
  return { busy: resultScope === scope && busy, progress: resultScope === scope ? progress : null,
    result: resultScope === scope ? result : null, start, cancel, reset, visibleOnly };
}
