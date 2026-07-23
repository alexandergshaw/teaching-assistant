"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractPptxSlidesAction, generateSlideNarrationAction, voiceConfiguredAction, synthesizeNarrationAction, avatarConfiguredAction, generateAvatarVideoAction, getAvatarVideoStatusAction, type SlideNarration } from "@/app/actions";
import { getStoredProvider } from "@/lib/llm-provider";

export interface UseDeckModeReturn {
  mode: "deck" | "video";
  setMode: (m: "deck" | "video") => void;
  fileName: string;
  setFileName: (f: string) => void;
  slides: Array<{ slide: number; title: string; text: string }> | null;
  setSlides: (s: Array<{ slide: number; title: string; text: string }> | null) => void;
  narrations: SlideNarration[] | null;
  setNarrations: (n: SlideNarration[] | null) => void;
  outputMode: "audio" | "av";
  setOutputMode: (m: "audio" | "av") => void;
  busy: "idle" | "extracting" | "narrating";
  setBusy: (b: "idle" | "extracting" | "narrating") => void;
  error: string | null;
  setError: (e: string | null) => void;
  voiceReady: boolean;
  setVoiceReady: (v: boolean) => void;
  genBusy: boolean;
  setGenBusy: (b: boolean) => void;
  genProgress: string | null;
  setGenProgress: (p: string | null) => void;
  audioBySlide: Record<number, string>;
  setAudioBySlide: (a: Record<number, string>) => void;
  genError: string | null;
  setGenError: (e: string | null) => void;
  avatarReady: boolean;
  setAvatarReady: (v: boolean) => void;
  avatarBusy: boolean;
  setAvatarBusy: (b: boolean) => void;
  avatarStatus: string | null;
  setAvatarStatus: (s: string | null) => void;
  avatarUrl: string | null;
  setAvatarUrl: (u: string | null) => void;
  avatarError: string | null;
  setAvatarError: (e: string | null) => void;
  stitchBusy: boolean;
  setStitchBusy: (b: boolean) => void;
  stitchProgress: string | null;
  setStitchProgress: (p: string | null) => void;
  stitchError: string | null;
  setStitchError: (e: string | null) => void;
  stitchUrl: string | null;
  setStitchUrl: (u: string | null) => void;
  stitchName: string;
  setStitchName: (n: string) => void;
  avatarPollRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  stitchCancelRef: React.MutableRefObject<boolean>;
  audioBySlideRef: React.MutableRefObject<Record<number, string>>;
  stitchUrlRef: React.MutableRefObject<string | null>;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleOutputModeChange: (mode: "audio" | "av") => void;
  handleDraftNarration: () => Promise<void>;
  handleNarrationChange: (index: number, text: string) => void;
  handlePreviewVoice: (text: string) => void;
  handleCopyAll: () => Promise<void>;
  handleGenerateAudio: () => Promise<void>;
  handleGenerateAvatar: () => Promise<void>;
  handleStitch: () => Promise<void>;
}

export function useDeckMode(): UseDeckModeReturn {

  const [mode, setMode] = useState<"deck" | "video">(() => {
    if (typeof window === "undefined") return "deck";
    const saved = localStorage.getItem("ta-slides-mode");
    return saved === "deck" || saved === "video" ? saved : "deck";
  });

  const [fileName, setFileName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-slides-file-name") ?? "";
  });
  const [slides, setSlides] = useState<Array<{ slide: number; title: string; text: string }> | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = localStorage.getItem("ta-slides-slides");
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  });
  const [narrations, setNarrations] = useState<SlideNarration[] | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = localStorage.getItem("ta-slides-narrations");
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  });
  const [outputMode, setOutputMode] = useState<"audio" | "av">(() => {
    if (typeof window === "undefined") return "audio";
    return (localStorage.getItem("ta-slides-output") as "audio" | "av") || "audio";
  });
  const [busy, setBusy] = useState<"idle" | "extracting" | "narrating">("idle");
  const [error, setError] = useState<string | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [genProgress, setGenProgress] = useState<string | null>(null);
  const [audioBySlide, setAudioBySlide] = useState<Record<number, string>>({});
  const [genError, setGenError] = useState<string | null>(null);
  const [avatarReady, setAvatarReady] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [stitchBusy, setStitchBusy] = useState(false);
  const [stitchProgress, setStitchProgress] = useState<string | null>(null);
  const [stitchError, setStitchError] = useState<string | null>(null);
  const [stitchUrl, setStitchUrl] = useState<string | null>(null);
  const [stitchName, setStitchName] = useState<string>(() => {
    if (typeof window === "undefined") return "narrated-deck";
    return localStorage.getItem("ta-slides-stitch-name") ?? "narrated-deck";
  });

  const avatarPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stitchCancelRef = useRef(false);
  const audioBySlideRef = useRef(audioBySlide);
  const stitchUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await voiceConfiguredAction();
      if (!cancelled) setVoiceReady(r.configured);
      const a = await avatarConfiguredAction();
      if (!cancelled) setAvatarReady(a.configured);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const audioBySlideRefEffect = useRef(audioBySlide);
  useEffect(() => {
    audioBySlideRefEffect.current = audioBySlide;
  }, [audioBySlide]);
  useEffect(() => {
    return () => {
      for (const url of Object.values(audioBySlideRefEffect.current)) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (avatarPollRef.current) clearInterval(avatarPollRef.current);
    };
  }, []);

  useEffect(() => {
    stitchUrlRef.current = stitchUrl;
  }, [stitchUrl]);

  useEffect(() => {
    return () => {
      stitchCancelRef.current = true;
      if (stitchUrlRef.current) {
        URL.revokeObjectURL(stitchUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-slides-mode", mode);
  }, [mode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-slides-file-name", fileName);
  }, [fileName]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-slides-stitch-name", stitchName);
  }, [stitchName]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (slides === null) {
      localStorage.removeItem("ta-slides-slides");
    } else {
      localStorage.setItem("ta-slides-slides", JSON.stringify(slides));
    }
  }, [slides]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (narrations === null) {
      localStorage.removeItem("ta-slides-narrations");
    } else {
      localStorage.setItem("ta-slides-narrations", JSON.stringify(narrations));
    }
  }, [narrations]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-slides-output", outputMode);
  }, [outputMode]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    setFileName(f.name);
    setBusy("extracting");
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const data = evt.target?.result as string | undefined;
        if (!data) {
          setError("Failed to read file.");
          setBusy("idle");
          return;
        }
        const base64 = data.split(",")[1] || data;
        const result = await extractPptxSlidesAction(base64);
        if ("error" in result) {
          setError(result.error);
          setSlides(null);
          setNarrations(null);
        } else {
          setSlides(result.slides);
          setNarrations(null);
        }
        setBusy("idle");
      };
      reader.readAsDataURL(f);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process file.");
      setBusy("idle");
    }
    e.target.value = "";
  }, []);

  const handleOutputModeChange = useCallback((mode: "audio" | "av") => {
    setOutputMode(mode);
    if (typeof window !== "undefined") {
      localStorage.setItem("ta-slides-output", mode);
    }
  }, []);

  const handleDraftNarration = useCallback(async () => {
    if (!slides) return;
    setBusy("narrating");
    setError(null);
    const result = await generateSlideNarrationAction(slides, getStoredProvider());
    if ("error" in result) {
      setError(result.error);
      setNarrations(null);
    } else {
      setNarrations(result.narrations);
    }
    setBusy("idle");
  }, [slides]);

  const handleNarrationChange = useCallback((index: number, text: string) => {
    setNarrations((prev) => {
      if (!prev) return null;
      const updated = [...prev];
      updated[index] = { ...updated[index], narration: text };
      return updated;
    });
  }, []);

  const handlePreviewVoice = useCallback((text: string) => {
    if (!text.trim()) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(u);
  }, []);

  const handleCopyAll = useCallback(async () => {
    if (!narrations) return;
    const fullScript = narrations.map((n) => `Slide ${n.slide}: ${n.narration}`).join("\n\n");
    await navigator.clipboard.writeText(fullScript);
  }, [narrations]);

  const handleGenerateAudio = useCallback(async () => {
    if (!narrations) return;
    setGenBusy(true);
    setGenError(null);
    const { resolveVoiceId } = await import("@/lib/voice-id");
    const voiceId = await resolveVoiceId();
    const next: Record<number, string> = { ...audioBySlide };
    for (const n of narrations) {
      if (!n.narration.trim()) continue;
      setGenProgress(`Synthesizing slide ${n.slide}...`);
      const r = await synthesizeNarrationAction(n.narration, voiceId ?? undefined);
      if ("error" in r) {
        setGenError(`Slide ${n.slide}: ${r.error}`);
        break;
      }
      const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
      if (next[n.slide]) URL.revokeObjectURL(next[n.slide]);
      next[n.slide] = URL.createObjectURL(new Blob([bytes], { type: r.mimeType }));
      setAudioBySlide({ ...next });
    }
    setGenProgress(null);
    setGenBusy(false);
  }, [narrations, audioBySlide]);

  const handleGenerateAvatar = useCallback(async () => {
    if (!narrations) return;
    const script = narrations.map((n) => n.narration.trim()).filter(Boolean).join("\n\n");
    setAvatarBusy(true);
    setAvatarError(null);
    setAvatarUrl(null);
    setAvatarStatus("Starting render...");
    const r = await generateAvatarVideoAction(script);
    if ("error" in r) {
      setAvatarError(r.error);
      setAvatarBusy(false);
      setAvatarStatus(null);
      return;
    }
    setAvatarStatus("Rendering... this can take a few minutes.");
    avatarPollRef.current = setInterval(async () => {
      const s = await getAvatarVideoStatusAction(r.videoId);
      if ("error" in s) {
        if (avatarPollRef.current) clearInterval(avatarPollRef.current);
        avatarPollRef.current = null;
        setAvatarError(s.error);
        setAvatarBusy(false);
        setAvatarStatus(null);
        return;
      }
      if (s.status === "completed" && s.videoUrl) {
        if (avatarPollRef.current) clearInterval(avatarPollRef.current);
        avatarPollRef.current = null;
        setAvatarUrl(s.videoUrl);
        setAvatarBusy(false);
        setAvatarStatus(null);
      } else setAvatarStatus(`Rendering (${s.status})...`);
    }, 5000);
  }, [narrations]);

  const handleStitch = useCallback(async () => {
    if (!narrations) return;
    const { drawSlideCard } = await import("./utils");
    setStitchBusy(true);
    setStitchError(null);
    setStitchProgress("Preparing...");
    stitchCancelRef.current = false;
    if (stitchUrlRef.current) {
      URL.revokeObjectURL(stitchUrlRef.current);
      setStitchUrl(null);
    }
    const audioCtx = new AudioContext();
    try {
      const buffers = new Map<number, AudioBuffer>();
      for (const n of narrations) {
        const url = audioBySlide[n.slide];
        if (!url) continue;
        setStitchProgress(`Decoding audio ${n.slide}...`);
        const ab = await (await fetch(url)).arrayBuffer();
        buffers.set(n.slide, await audioCtx.decodeAudioData(ab));
      }
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) throw new Error("Canvas not supported.");
      const dest = audioCtx.createMediaStreamDestination();
      const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
      const recStream = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(recStream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      recorder.start(1000);
      let currentSlide = narrations[0];
      let rafId = 0;
      const paint = () => {
        drawSlideCard(ctx2d, canvas.width, canvas.height, currentSlide);
        rafId = requestAnimationFrame(paint);
      };
      paint();
      for (const n of narrations) {
        if (stitchCancelRef.current) break;
        currentSlide = n;
        setStitchProgress(`Recording slide ${n.slide} of ${narrations.length}...`);
        const buf = buffers.get(n.slide);
        if (buf) {
          await new Promise<void>((resolve) => {
            const srcNode = audioCtx.createBufferSource();
            srcNode.buffer = buf;
            srcNode.connect(dest);
            srcNode.onended = () => resolve();
            srcNode.start();
          });
        } else {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      cancelAnimationFrame(rafId);
      recorder.stop();
      await stopped;
      canvasStream.getTracks().forEach((t) => t.stop());
      if (!stitchCancelRef.current) {
        const blob = new Blob(chunks, { type: mimeType });
        setStitchUrl(URL.createObjectURL(blob));
      }
    } catch (err) {
      setStitchError(err instanceof Error ? err.message : "Could not stitch the video.");
    } finally {
      void audioCtx.close();
      setStitchProgress(null);
      setStitchBusy(false);
    }
  }, [narrations, audioBySlide]);

  return {
    mode,
    setMode,
    fileName,
    setFileName,
    slides,
    setSlides,
    narrations,
    setNarrations,
    outputMode,
    setOutputMode,
    busy,
    setBusy,
    error,
    setError,
    voiceReady,
    setVoiceReady,
    genBusy,
    setGenBusy,
    genProgress,
    setGenProgress,
    audioBySlide,
    setAudioBySlide,
    genError,
    setGenError,
    avatarReady,
    setAvatarReady,
    avatarBusy,
    setAvatarBusy,
    avatarStatus,
    setAvatarStatus,
    avatarUrl,
    setAvatarUrl,
    avatarError,
    setAvatarError,
    stitchBusy,
    setStitchBusy,
    stitchProgress,
    setStitchProgress,
    stitchError,
    setStitchError,
    stitchUrl,
    setStitchUrl,
    stitchName,
    setStitchName,
    avatarPollRef,
    stitchCancelRef,
    audioBySlideRef,
    stitchUrlRef,
    handleFileSelect,
    handleOutputModeChange,
    handleDraftNarration,
    handleNarrationChange,
    handlePreviewVoice,
    handleCopyAll,
    handleGenerateAudio,
    handleGenerateAvatar,
    handleStitch,
  };
}
