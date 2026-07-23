import { useCallback, useEffect, useRef, useState } from "react";
import { resolveVoiceId } from "@/lib/voice-id";
import { synthesizeNarrationAction, voiceConfiguredAction } from "@/app/actions";
import type { EditableCaption } from "../utils/captions";

export function useVoiceOverlay(
  captions: EditableCaption[] | null,
  cueAudio: Record<number, { url: string; base64: string; mimeType: string }>,
  setCueAudio: (value: Record<number, { url: string; base64: string; mimeType: string }> | ((prev: Record<number, { url: string; base64: string; mimeType: string }>) => Record<number, { url: string; base64: string; mimeType: string }>)) => void,
  videoRef: React.RefObject<HTMLVideoElement | null>
) {
  const [voiceReady, setVoiceReady] = useState(false);
  const [voBusy, setVoBusy] = useState<null | "one" | "all">(null);
  const [voError, setVoError] = useState<string | null>(null);
  const [voMode, setVoMode] = useState<"original" | "voiceover" | "mix" | "none">(() => {
    if (typeof window === "undefined") return "original";
    const saved = localStorage.getItem("ta-cap-voiceover-mode");
    return saved === "original" || saved === "voiceover" || saved === "mix" || saved === "none" ? saved : "original";
  });
  const [previewing, setPreviewing] = useState(false);

  const previewCtxRef = useRef<AudioContext | null>(null);
  const previewBuffersRef = useRef<Record<number, AudioBuffer>>({});
  const previewNodesRef = useRef<Record<number, AudioBufferSourceNode>>({});
  const previewWasMutedRef = useRef(false);
  const cueAudioRef = useRef(cueAudio);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-cap-voiceover-mode", voMode);
  }, [voMode]);

  useEffect(() => {
    cueAudioRef.current = cueAudio;
  }, [cueAudio]);

  useEffect(() => {
    (async () => {
      const r = await voiceConfiguredAction();
      setVoiceReady(r.configured);
    })();
  }, []);

  const stopPreviewNodes = useCallback(() => {
    for (const node of Object.values(previewNodesRef.current)) {
      try {
        node.stop();
      } catch {}
    }
    previewNodesRef.current = {};
  }, []);

  const endPreview = useCallback(() => {
    setPreviewing(false);
    stopPreviewNodes();
    const ctx = previewCtxRef.current;
    if (ctx && ctx.state !== "closed") {
      try {
        ctx.close();
      } catch {}
    }
    previewCtxRef.current = null;
    const v = videoRef.current;
    if (v) v.muted = previewWasMutedRef.current;
  }, [stopPreviewNodes, videoRef]);

  useEffect(() => {
    if (!previewing) return;
    const v = videoRef.current;
    if (!v) return;
    const tick = () => {
      const t = v.currentTime;
      if (!captions) return;
      captions.forEach((c, i) => {
        const buffer = previewBuffersRef.current[i];
        if (!buffer) return;
        const inWindow = t >= c.start && t < c.end + 0.25;
        const ctx = previewCtxRef.current;
        if (!ctx) return;
        if (inWindow && !previewNodesRef.current[i]) {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          const offset = Math.max(0, t - c.start);
          source.start(0, offset);
          previewNodesRef.current[i] = source;
          source.onended = () => {
            delete previewNodesRef.current[i];
          };
        } else if (!inWindow && previewNodesRef.current[i]) {
          try {
            previewNodesRef.current[i].stop();
          } catch {}
          delete previewNodesRef.current[i];
        }
      });
    };
    const onPause = () => {
      stopPreviewNodes();
    };
    const onSeeking = () => {
      stopPreviewNodes();
    };
    const onEnded = () => {
      endPreview();
    };
    v.addEventListener("timeupdate", tick);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeking", onSeeking);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("timeupdate", tick);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeking", onSeeking);
      v.removeEventListener("ended", onEnded);
      stopPreviewNodes();
    };
  }, [previewing, captions, endPreview, stopPreviewNodes, videoRef]);

  const handleGenerateVoiceForCue = useCallback(
    async (i: number) => {
      if (!captions || !voiceReady) return;
      const c = captions[i];
      if (!c) return;
      setVoError(null);
      setVoBusy("one");
      try {
        const voiceId = await resolveVoiceId();
        const r = await synthesizeNarrationAction(c.text, voiceId ?? undefined);
        if ("error" in r) {
          setVoError(r.error);
          setVoBusy(null);
          return;
        }
        const bytes = Uint8Array.from(atob(r.base64), (ch) => ch.charCodeAt(0));
        const blob = new Blob([bytes], { type: r.mimeType });
        const url = URL.createObjectURL(blob);
        setCueAudio((prev) => {
          if (prev[i]) URL.revokeObjectURL(prev[i].url);
          return { ...prev, [i]: { url, base64: r.base64, mimeType: r.mimeType } };
        });
      } catch (err) {
        setVoError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setVoBusy(null);
      }
    },
    [captions, voiceReady, setCueAudio]
  );

  const handleGenerateAllVoices = useCallback(async () => {
    if (!captions || !voiceReady) return;
    setVoError(null);
    setVoBusy("all");
    const voiceId = await resolveVoiceId();
    const next = { ...cueAudio };
    for (let i = 0; i < captions.length; i++) {
      if (next[i]) continue;
      setVoError(null);
      const c = captions[i];
      try {
        const r = await synthesizeNarrationAction(c.text, voiceId ?? undefined);
        if ("error" in r) {
          setVoError(`Cue ${i + 1}: ${r.error}`);
          break;
        }
        const bytes = Uint8Array.from(atob(r.base64), (ch) => ch.charCodeAt(0));
        const blob = new Blob([bytes], { type: r.mimeType });
        next[i] = { url: URL.createObjectURL(blob), base64: r.base64, mimeType: r.mimeType };
        setCueAudio({ ...next });
      } catch (err) {
        setVoError(err instanceof Error ? err.message : "An error occurred");
        break;
      }
    }
    setVoBusy(null);
  }, [captions, voiceReady, cueAudio, setCueAudio]);

  const startPreview = useCallback(() => {
    const v = videoRef.current;
    if (!v || !captions || captions.length === 0) return;
    previewWasMutedRef.current = v.muted;
    v.muted = voMode === "voiceover" || voMode === "none";
    stopPreviewNodes();
    previewBuffersRef.current = {};
    previewNodesRef.current = {};
    if (voMode === "voiceover" || voMode === "mix") {
      const ctx = new AudioContext();
      previewCtxRef.current = ctx;
      void ctx.resume();
      for (const [idxStr, entry] of Object.entries(cueAudio)) {
        void (async () => {
          try {
            const bytes = Uint8Array.from(atob(entry.base64), (ch) => ch.charCodeAt(0));
            const buffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
            previewBuffersRef.current[Number(idxStr)] = buffer;
          } catch {}
        })();
      }
    }
    setPreviewing(true);
    v.currentTime = 0;
    void v.play();
  }, [captions, cueAudio, voMode, stopPreviewNodes, videoRef]);

  return {
    voiceReady,
    voBusy,
    voError,
    setVoError,
    voMode,
    setVoMode,
    previewing,
    setPreviewing,
    previewCtxRef,
    previewBuffersRef,
    previewNodesRef,
    previewWasMutedRef,
    cueAudioRef,
    stopPreviewNodes,
    endPreview,
    handleGenerateVoiceForCue,
    handleGenerateAllVoices,
    startPreview,
  };
}
