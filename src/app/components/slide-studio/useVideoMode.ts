"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateVideoNarrationAction, synthesizeNarrationAction } from "@/app/actions";
import { extractVideoFrames, renderNarratedVideo, type NarrationClip } from "@/lib/narrate-video";
import { getStoredProvider } from "@/lib/llm-provider";
import { useSupabase } from "@/context/SupabaseProvider";
import { listRecordingFiles, downloadRecordingFile, saveRecordingFile } from "@/lib/recording-files";
import type { Database } from "@/lib/supabase/types";
import type { SupabaseClient, User } from "@supabase/supabase-js";

interface NarrationSegment {
  start: number;
  end: number;
  text: string;
}

export interface UseVideoModeReturn {
  vidUrl: string | null;
  setVidUrl: (u: string | null) => void;
  vidName: string;
  setVidName: (n: string) => void;
  vidBlob: Blob | null;
  setVidBlob: (b: Blob | null) => void;
  segments: NarrationSegment[] | null;
  setSegments: (s: NarrationSegment[] | null) => void;
  segAudio: Record<number, { url: string; base64: string; mimeType: string }>;
  setSegAudio: (a: Record<number, { url: string; base64: string; mimeType: string }>) => void;
  genBusyV: boolean;
  setGenBusyV: (b: boolean) => void;
  genErrorV: string | null;
  setGenErrorV: (e: string | null) => void;
  voBusyV: null | "one" | "all";
  setVoBusyV: (s: null | "one" | "all") => void;
  applyBusy: boolean;
  setApplyBusy: (b: boolean) => void;
  applyPct: number;
  setApplyPct: (p: number) => void;
  applyError: string | null;
  setApplyError: (e: string | null) => void;
  result: { url: string; blob: Blob } | null;
  setResult: (r: { url: string; blob: Blob } | null) => void;
  resultSave: "idle" | "saving" | "done" | "failed";
  setResultSave: (s: "idle" | "saving" | "done" | "failed") => void;
  videoContext: string;
  setVideoContext: (c: string) => void;
  applyMode: "replace" | "mix";
  setApplyMode: (m: "replace" | "mix") => void;
  resultName: string;
  setResultName: (n: string) => void;
  vidUrlRef: React.MutableRefObject<string | null>;
  resultUrlRef: React.MutableRefObject<string | null>;
  segAudioRef: React.MutableRefObject<Record<number, { url: string; base64: string; mimeType: string }>>;
  voiceReady: boolean;
  supabase: SupabaseClient<Database> | null;
  user: User | null;
  adoptVideo: (blob: Blob, name: string) => void;
  handleVideoFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleBrowseLibrary: () => Promise<void>;
  handleGenerateNarration: () => Promise<void>;
  handleSegmentChange: (index: number, field: "start" | "end" | "text", value: string | number) => void;
  handleSynthesizeOne: (index: number, text: string) => Promise<void>;
  handleGenerateAllVoices: () => Promise<void>;
  handleApplyNarration: () => Promise<void>;
}

export function useVideoMode(voiceReady: boolean): UseVideoModeReturn {
  const { supabase, user } = useSupabase();

  const [vidUrl, setVidUrl] = useState<string | null>(null);
  const [vidName, setVidName] = useState("");
  const [vidBlob, setVidBlob] = useState<Blob | null>(null);
  const [segments, setSegments] = useState<NarrationSegment[] | null>(null);
  const [segAudio, setSegAudio] = useState<Record<number, { url: string; base64: string; mimeType: string }>>({});
  const [genBusyV, setGenBusyV] = useState(false);
  const [genErrorV, setGenErrorV] = useState<string | null>(null);
  const [voBusyV, setVoBusyV] = useState<null | "one" | "all">(null);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applyPct, setApplyPct] = useState(0);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string; blob: Blob } | null>(null);
  const [resultSave, setResultSave] = useState<"idle" | "saving" | "done" | "failed">("idle");
  const [videoContext, setVideoContext] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-slides-video-context") ?? "";
  });
  const [applyMode, setApplyMode] = useState<"replace" | "mix">(() => {
    if (typeof window === "undefined") return "replace";
    const saved = localStorage.getItem("ta-slides-video-mode");
    return saved === "replace" || saved === "mix" ? saved : "replace";
  });
  const [resultName, setResultName] = useState<string>(() => {
    if (typeof window === "undefined") return "narrated-video";
    return localStorage.getItem("ta-slides-video-name") ?? "narrated-video";
  });

  const vidUrlRef = useRef<string | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const segAudioRef = useRef(segAudio);

  useEffect(() => {
    vidUrlRef.current = vidUrl;
  }, [vidUrl]);

  useEffect(() => {
    resultUrlRef.current = result?.url ?? null;
  }, [result]);

  useEffect(() => {
    segAudioRef.current = segAudio;
  }, [segAudio]);

  useEffect(() => {
    return () => {
      if (vidUrlRef.current) {
        URL.revokeObjectURL(vidUrlRef.current);
      }
      if (resultUrlRef.current) {
        URL.revokeObjectURL(resultUrlRef.current);
      }
      for (const audio of Object.values(segAudioRef.current)) {
        URL.revokeObjectURL(audio.url);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-slides-video-context", videoContext);
  }, [videoContext]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-slides-video-mode", applyMode);
  }, [applyMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-slides-video-name", resultName);
  }, [resultName]);

  const adoptVideo = useCallback(
    (blob: Blob, name: string) => {
      if (vidUrl) URL.revokeObjectURL(vidUrl);
      const url = URL.createObjectURL(blob);
      setVidUrl(url);
      setVidName(name);
      setVidBlob(blob);
      setSegments(null);
      setSegAudio({});
      setApplyError(null);
      setResult(null);
    },
    [vidUrl]
  );

  const handleVideoFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        const blob = new Blob([await f.arrayBuffer()], { type: f.type });
        adoptVideo(blob, f.name);
      } catch (err) {
        setApplyError(err instanceof Error ? err.message : "Could not read the video file.");
      }
      e.target.value = "";
    },
    [adoptVideo]
  );

  const handleBrowseLibrary = useCallback(async () => {
    if (!supabase || !user) return;
    try {
      const files = await listRecordingFiles(supabase, user.id);
      const videoFiles = files.filter((f) => f.mimeType.includes("video"));
      if (!videoFiles.length) {
        setApplyError("No videos in library.");
        return;
      }
      for (const file of videoFiles) {
        const blob = await downloadRecordingFile(supabase, file);
        adoptVideo(blob, file.name);
        break;
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Could not browse library.");
    }
  }, [supabase, user, adoptVideo]);

  const handleGenerateNarration = useCallback(async () => {
    if (!vidUrl) return;
    setGenBusyV(true);
    setGenErrorV(null);
    try {
      const { frames, durationSec } = await extractVideoFrames(vidUrl);
      const r = await generateVideoNarrationAction(frames, durationSec, videoContext, getStoredProvider());
      if ("error" in r) {
        setGenErrorV(r.error);
        return;
      }
      setSegments(r.segments);
      setSegAudio({});
    } catch (err) {
      setGenErrorV(err instanceof Error ? err.message : "Failed to generate narration.");
    } finally {
      setGenBusyV(false);
    }
  }, [vidUrl, videoContext]);

  const handleSegmentChange = useCallback(
    (index: number, field: "start" | "end" | "text", value: string | number) => {
      setSegments((prev) => {
        if (!prev) return null;
        const updated = [...prev];
        if (field === "start" || field === "end") {
          updated[index] = { ...updated[index], [field]: Math.max(0, value as number) };
        } else {
          updated[index] = { ...updated[index], text: value as string };
          const next = { ...segAudio };
          delete next[index];
          setSegAudio(next);
          if (segAudio[index]) {
            URL.revokeObjectURL(segAudio[index].url);
          }
        }
        return updated;
      });
    },
    [segAudio]
  );

  const handleSynthesizeOne = useCallback(
    async (index: number, text: string) => {
      if (!text.trim()) return;
      setVoBusyV("one");
      try {
        const { resolveVoiceId } = await import("@/lib/voice-id");
        const voiceId = await resolveVoiceId();
        const r = await synthesizeNarrationAction(text, voiceId ?? undefined);
        if ("error" in r) {
          throw new Error(r.error);
        }
        const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
        const newAudio = { ...segAudio };
        if (newAudio[index]) {
          URL.revokeObjectURL(newAudio[index].url);
        }
        newAudio[index] = {
          url: URL.createObjectURL(new Blob([bytes], { type: r.mimeType })),
          base64: r.base64,
          mimeType: r.mimeType,
        };
        setSegAudio(newAudio);
      } catch (err) {
        setApplyError(err instanceof Error ? err.message : "Failed to synthesize audio.");
      } finally {
        setVoBusyV(null);
      }
    },
    [segAudio]
  );

  const handleGenerateAllVoices = useCallback(async () => {
    if (!segments) return;
    setVoBusyV("all");
    try {
      const { resolveVoiceId } = await import("@/lib/voice-id");
      const voiceId = await resolveVoiceId();
      const newAudio = { ...segAudio };
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!seg.text.trim()) continue;
        if (newAudio[i]) continue;
        const r = await synthesizeNarrationAction(seg.text, voiceId ?? undefined);
        if ("error" in r) continue;
        const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
        newAudio[i] = {
          url: URL.createObjectURL(new Blob([bytes], { type: r.mimeType })),
          base64: r.base64,
          mimeType: r.mimeType,
        };
      }
      setSegAudio(newAudio);
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Failed to generate voices.");
    } finally {
      setVoBusyV(null);
    }
  }, [segments, segAudio]);

  const handleApplyNarration = useCallback(async () => {
    if (!vidBlob || !segments) return;
    setApplyBusy(true);
    setApplyPct(0);
    setApplyError(null);
    try {
      const clips: NarrationClip[] = segments
        .map((s, i) => {
          const audio = segAudio[i];
          return audio ? { startSec: s.start, base64: audio.base64, mimeType: audio.mimeType } : null;
        })
        .filter((c): c is NarrationClip => c !== null);

      if (!clips.length) {
        setApplyError("No narration audio to apply.");
        setApplyBusy(false);
        return;
      }

      const out = await renderNarratedVideo(vidBlob, clips, applyMode, (pct) => setApplyPct(pct));
      if (result?.url) URL.revokeObjectURL(result.url);
      setResult({ url: URL.createObjectURL(out), blob: out });

      if (user && supabase) {
        setResultSave("saving");
        try {
          await saveRecordingFile(supabase, user.id, out, {
            name: resultName.trim() || "narrated-video",
            kind: "narrated",
            mimeType: out.type || "video/webm",
            durationSec: null,
          });
          setResultSave("done");
        } catch (err) {
          console.error("Failed to save to library:", err);
          setResultSave("failed");
        }
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Failed to apply narration.");
    } finally {
      setApplyBusy(false);
    }
  }, [vidBlob, segments, segAudio, applyMode, user, supabase, result, resultName]);

  return {
    vidUrl,
    setVidUrl,
    vidName,
    setVidName,
    vidBlob,
    setVidBlob,
    segments,
    setSegments,
    segAudio,
    setSegAudio,
    genBusyV,
    setGenBusyV,
    genErrorV,
    setGenErrorV,
    voBusyV,
    setVoBusyV,
    applyBusy,
    setApplyBusy,
    applyPct,
    setApplyPct,
    applyError,
    setApplyError,
    result,
    setResult,
    resultSave,
    setResultSave,
    videoContext,
    setVideoContext,
    applyMode,
    setApplyMode,
    resultName,
    setResultName,
    vidUrlRef,
    resultUrlRef,
    segAudioRef,
    voiceReady,
    supabase,
    user,
    adoptVideo,
    handleVideoFileSelect,
    handleBrowseLibrary,
    handleGenerateNarration,
    handleSegmentChange,
    handleSynthesizeOne,
    handleGenerateAllVoices,
    handleApplyNarration,
  };
}
