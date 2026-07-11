"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import { extractPptxSlidesAction, generateSlideNarrationAction, voiceConfiguredAction, synthesizeNarrationAction, createVoiceCloneAction, avatarConfiguredAction, generateAvatarVideoAction, getAvatarVideoStatusAction, generateVideoNarrationAction, type SlideNarration } from "../actions";
import { getStoredProvider } from "@/lib/llm-provider";
import { useSupabase } from "@/context/SupabaseProvider";
import { listRecordingFiles, downloadRecordingFile, saveRecordingFile, extForMime } from "@/lib/recording-files";
import { extractVideoFrames, renderNarratedVideo, type NarrationClip } from "@/lib/narrate-video";
import styles from "../page.module.css";

const VOICE_SAMPLE_SCRIPT = `Hello, and welcome to today's session. This is a sample of my natural speaking voice, recorded so it can be cloned for course narration.

When I teach, I try to keep things simple: one idea at a time, explained clearly, with room to breathe. Some sentences are short. Others stretch a little longer, winding through an example or two before they land, because that is how real explanations sound.

Let's try some variety. How do computers store information? Why does a loop repeat, and when should it stop? Questions like these lift my tone at the end, while statements settle back down.

Here are a few specifics: on March 3rd, 2026, at 9:45 in the morning, exactly 127 students submitted assignment number 6. About 83 percent passed on the first try - a strong result, though not a perfect one.

Now for texture: the quick brown fox jumps over the lazy dog, while five jazzy wizards begin to quickly vex the judge. Think of thirty-three thankful thoughts, and measure the pleasure of a treasured vision.

Finally, a calm close. Thank you for listening carefully. Take a breath, review your notes, and remember: steady practice beats last-minute cramming every single time.`;

type BusyState = "idle" | "extracting" | "narrating";

interface NarrationSegment {
  start: number;
  end: number;
  text: string;
}

function drawSlideCard(ctx: CanvasRenderingContext2D, w: number, h: number, slide: { slide: number; title: string; text: string }) {
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#64748b";
  ctx.font = `500 ${Math.round(h * 0.03)}px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(`Slide ${slide.slide}`, Math.round(w * 0.06), Math.round(h * 0.06));
  ctx.fillStyle = "#f8fafc";
  ctx.font = `700 ${Math.round(h * 0.06)}px system-ui, sans-serif`;
  wrapText(ctx, slide.title, Math.round(w * 0.06), Math.round(h * 0.13), Math.round(w * 0.88), Math.round(h * 0.075), 2);
  ctx.fillStyle = "#cbd5e1";
  ctx.font = `400 ${Math.round(h * 0.038)}px system-ui, sans-serif`;
  const body = slide.text.split("\n").slice(1).join("  ");
  wrapText(ctx, body, Math.round(w * 0.06), Math.round(h * 0.32), Math.round(w * 0.88), Math.round(h * 0.055), 9);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  let line = "";
  let lines = 0;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(lines === maxLines - 1 && words.length ? `${line}...` : line, x, y + lines * lineHeight);
      lines += 1;
      line = word;
      if (lines >= maxLines) return;
    } else {
      line = test;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
}

export default function SlideStudio() {
  const { supabase, user } = useSupabase();

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
  const [busy, setBusy] = useState<BusyState>("idle");
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
  const [cloneVoiceId, setCloneVoiceId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-voice-id") ?? "";
  });
  const [cloneName, setCloneName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-slides-clone-name") ?? "";
  });
  const [cloneBusy, setCloneBusy] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneNote, setCloneNote] = useState<string | null>(null);
  const [sampleRecState, setSampleRecState] = useState<"idle" | "recording">("idle");
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [sampleBlob, setSampleBlob] = useState<Blob | null>(null);
  const [sampleElapsed, setSampleElapsed] = useState(0);
  const sampleRecRef = useRef<MediaRecorder | null>(null);
  const sampleStreamRef = useRef<MediaStream | null>(null);
  const sampleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);
  const avatarPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cloneFileRef = useRef<HTMLInputElement>(null);
  const [stitchBusy, setStitchBusy] = useState(false);
  const [stitchProgress, setStitchProgress] = useState<string | null>(null);
  const [stitchError, setStitchError] = useState<string | null>(null);
  const [stitchUrl, setStitchUrl] = useState<string | null>(null);
  const [stitchName, setStitchName] = useState<string>(() => {
    if (typeof window === "undefined") return "narrated-deck";
    return localStorage.getItem("ta-slides-stitch-name") ?? "narrated-deck";
  });
  const stitchCancelRef = useRef(false);
  const stitchUrlRef = useRef<string | null>(null);

  // Video mode state
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
    cancelledRef.current = false;
    (async () => {
      const r = await voiceConfiguredAction();
      if (!cancelledRef.current) setVoiceReady(r.configured);
      const a = await avatarConfiguredAction();
      if (!cancelledRef.current) setAvatarReady(a.configured);
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  // Unmount-only cleanup via a ref: a deps-based cleanup would revoke every
  // player's URL each time a new slide's audio landed.
  const audioBySlideRef = useRef(audioBySlide);
  useEffect(() => {
    audioBySlideRef.current = audioBySlide;
  }, [audioBySlide]);
  useEffect(() => {
    return () => {
      for (const url of Object.values(audioBySlideRef.current)) {
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
    return () => {
      if (sampleRecRef.current) {
        try {
          sampleRecRef.current.stop();
        } catch {
          // recorder already stopped
        }
      }
      if (sampleStreamRef.current) {
        sampleStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (sampleIntervalRef.current) {
        clearInterval(sampleIntervalRef.current);
      }
      if (sampleUrl) {
        URL.revokeObjectURL(sampleUrl);
      }
    };
  }, [sampleUrl]);

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

  // Track refs for video mode cleanup
  useEffect(() => {
    vidUrlRef.current = vidUrl;
  }, [vidUrl]);

  useEffect(() => {
    resultUrlRef.current = result?.url ?? null;
  }, [result]);

  useEffect(() => {
    segAudioRef.current = segAudio;
  }, [segAudio]);

  // Unmount-only cleanup for video mode URLs
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

  // Persist form state to localStorage
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
    localStorage.setItem("ta-slides-clone-name", cloneName);
  }, [cloneName]);

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
    const next: Record<number, string> = { ...audioBySlide };
    for (const n of narrations) {
      if (!n.narration.trim()) continue;
      setGenProgress(`Synthesizing slide ${n.slide}...`);
      const r = await synthesizeNarrationAction(n.narration, cloneVoiceId || undefined);
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
  }, [narrations, audioBySlide, cloneVoiceId]);

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

  const handleCreateClone = async (fileList: FileList | null) => {
    const picked = Array.from(fileList ?? []);
    if (!picked.length) return;
    if (!cloneName.trim()) { setCloneError("Enter a name for the voice first."); return; }
    setCloneBusy(true); setCloneError(null); setCloneNote(null);
    try {
      const files = await Promise.all(picked.map(async (f) => ({
        base64: await new Promise<string>((resolve, reject) => { const rd = new FileReader(); rd.onload = () => resolve((rd.result as string).split(",")[1] ?? ""); rd.onerror = reject; rd.readAsDataURL(f); }),
        mimeType: f.type || "audio/mpeg",
        fileName: f.name,
      })));
      const r = await createVoiceCloneAction(cloneName, files);
      if ("error" in r) { setCloneError(r.error); return; }
      setCloneVoiceId(r.voiceId);
      if (typeof window !== "undefined") localStorage.setItem("ta-voice-id", r.voiceId);
      setCloneNote(`Voice created. All audio generation now uses "${cloneName.trim()}".`);
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Could not read the audio files.");
    } finally {
      setCloneBusy(false);
    }
  };

  const handleStartRecording = useCallback(async () => {
    setCloneError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
      });
      sampleStreamRef.current = stream;

      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));

      if (!mimeType) {
        setCloneError("Audio recording not supported in this browser.");
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      sampleRecRef.current = recorder;
      setSampleRecState("recording");
      setSampleElapsed(0);

      sampleIntervalRef.current = setInterval(() => {
        setSampleElapsed((prev) => prev + 1);
      }, 1000);

      recorder.onstop = () => {
        if (sampleIntervalRef.current) {
          clearInterval(sampleIntervalRef.current);
          sampleIntervalRef.current = null;
        }
        stream.getTracks().forEach((t) => t.stop());
        sampleStreamRef.current = null;
      };

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          const blob = new Blob([e.data], { type: mimeType });
          setSampleBlob(blob);
          setSampleUrl(URL.createObjectURL(blob));
        }
      };

      recorder.start();
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Could not access microphone.");
      setSampleRecState("idle");
    }
  }, []);

  const handleStopRecording = useCallback(() => {
    if (sampleRecRef.current && sampleRecState === "recording") {
      sampleRecRef.current.stop();
      setSampleRecState("idle");
    }
  }, [sampleRecState]);

  const handleDiscardSample = useCallback(() => {
    if (sampleUrl) {
      URL.revokeObjectURL(sampleUrl);
    }
    setSampleUrl(null);
    setSampleBlob(null);
    setSampleElapsed(0);
  }, [sampleUrl]);

  const handleCreateCloneFromSample = useCallback(async () => {
    if (!sampleBlob || !cloneName.trim()) return;
    if (sampleBlob.size > 6.5 * 1024 * 1024) {
      setCloneError("The sample is too large - keep it under about 90 seconds.");
      return;
    }
    setCloneBusy(true);
    setCloneError(null);
    setCloneNote(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const rd = new FileReader();
        rd.onload = () => {
          const result = rd.result as string;
          resolve(result.split(",")[1] ?? "");
        };
        rd.onerror = reject;
        rd.readAsDataURL(sampleBlob);
      });
      const r = await createVoiceCloneAction(cloneName.trim(), [
        {
          base64,
          mimeType: sampleBlob.type || "audio/webm",
          fileName: "voice-sample.webm",
        },
      ]);
      if ("error" in r) {
        setCloneError(r.error);
        return;
      }
      setCloneVoiceId(r.voiceId);
      if (typeof window !== "undefined") localStorage.setItem("ta-voice-id", r.voiceId);
      setCloneNote(`Voice created. All audio generation now uses "${cloneName.trim()}".`);
      handleDiscardSample();
    } catch (err) {
      setCloneError(err instanceof Error ? err.message : "Could not create voice clone.");
    } finally {
      setCloneBusy(false);
    }
  }, [sampleBlob, cloneName, handleDiscardSample]);

  // Video mode handlers
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
        const r = await synthesizeNarrationAction(text, localStorage.getItem("ta-voice-id") || undefined);
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
      const newAudio = { ...segAudio };
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!seg.text.trim()) continue;
        if (newAudio[i]) continue;
        const r = await synthesizeNarrationAction(seg.text, localStorage.getItem("ta-voice-id") || undefined);
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

  const handleStitch = async () => {
    if (!narrations) return;
    setStitchBusy(true);
    setStitchError(null);
    setStitchProgress("Preparing...");
    stitchCancelRef.current = false;
    if (stitchUrl) {
      URL.revokeObjectURL(stitchUrl);
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
  };

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>Narrate a PowerPoint</h2>
        <p className={styles.adaptPanelSubtitle}>
          Upload a deck, let AI draft what you would say on each slide, then generate audio - or audio and video - of the walkthrough.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <Button
            variant={mode === "deck" ? "contained" : "outlined"}
            size="small"
            onClick={() => setMode("deck")}
          >
            Narrate a deck
          </Button>
          <Button
            variant={mode === "video" ? "contained" : "outlined"}
            size="small"
            onClick={() => setMode("video")}
          >
            Narrate a video
          </Button>
        </div>
      </div>

      {mode === "deck" && (
        <>
          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.field}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Button variant="outlined" size="small" onClick={() => document.getElementById("pptx-input")?.click()}>
                Choose PowerPoint
              </Button>
              {fileName && <span className={styles.ghMeta}>{fileName}</span>}
            </div>
            <input
              id="pptx-input"
              type="file"
              accept=".pptx"
              style={{ display: "none" }}
              onChange={handleFileSelect}
            />
          </div>

      {slides && (
        <>
          <div className={styles.field} style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <TextField
              select
              label="Output"
              value={outputMode}
              onChange={(e) => handleOutputModeChange(e.target.value as "audio" | "av")}
              size="small"
              sx={{ minWidth: 170 }}
            >
              <MenuItem value="audio">Audio (my voice)</MenuItem>
              <MenuItem value="av">Audio + video (avatar)</MenuItem>
            </TextField>
            <Button
              variant="contained"
              size="small"
              onClick={handleDraftNarration}
              disabled={busy !== "idle"}
            >
              {busy === "narrating" ? "Writing narration..." : "Draft narration"}
            </Button>
          </div>

          {narrations && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {narrations.map((n, i) => (
                  <div key={i} style={{ padding: "8px 0", borderTop: "1px solid var(--field-border)" }}>
                    <span className={styles.ghMeta}>
                      <strong>Slide {n.slide}</strong> - {n.title}
                    </span>
                    <TextField
                      size="small"
                      fullWidth
                      multiline
                      minRows={2}
                      value={n.narration}
                      onChange={(e) => handleNarrationChange(i, e.target.value)}
                      style={{ marginTop: 8 }}
                    />
                    {audioBySlide[n.slide] && (
                      <audio
                        controls
                        src={audioBySlide[n.slide]}
                        style={{ width: "100%", height: 36, marginTop: 6 }}
                      />
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      <Button
                        variant="text"
                        size="small"
                        onClick={() => handlePreviewVoice(n.narration)}
                      >
                        Preview
                      </Button>
                      {audioBySlide[n.slide] && (
                        <Button
                          variant="text"
                          size="small"
                          onClick={() => {
                            const a = document.createElement("a");
                            a.href = audioBySlide[n.slide];
                            a.download = `slide-${n.slide}.mp3`;
                            a.click();
                          }}
                        >
                          Download
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.ghActions}>
                <Button
                  variant="contained"
                  size="small"
                  disabled={outputMode === "av" ? !avatarReady || avatarBusy || !narrations : !voiceReady || genBusy || !narrations}
                  onClick={() => void (outputMode === "av" ? handleGenerateAvatar() : handleGenerateAudio())}
                >
                  {outputMode === "av" ? (avatarBusy ? avatarStatus ?? "Rendering..." : "Generate audio + video") : (genBusy ? genProgress ?? "Generating..." : "Generate audio")}
                </Button>
                <Button variant="text" size="small" onClick={handleCopyAll}>
                  Copy full script
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={stitchBusy || !narrations || !narrations.some((n) => audioBySlide[n.slide])}
                  onClick={() => void handleStitch()}
                >
                  {stitchBusy ? stitchProgress ?? "Stitching..." : "Stitch deck video"}
                </Button>
              </div>
              {stitchError && <p className={styles.error}>{stitchError}</p>}
              {narrations && !narrations.some((n) => audioBySlide[n.slide]) && (
                <p className={styles.fieldHint}>
                  Generate audio first - stitching combines the slide cards with your narration audio into one video.
                </p>
              )}
              {genError && <p className={styles.error}>{genError}</p>}
              {avatarError && <p className={styles.error}>{avatarError}</p>}
              <p className={styles.fieldHint}>
                Audio is generated through the app via the ElevenLabs API (set ELEVENLABS_API_KEY, and ELEVENLABS_VOICE_ID once your voice clone exists - until then a stock voice is used). Avatar video needs HEYGEN_API_KEY and HEYGEN_AVATAR_ID (plus HEYGEN_VOICE_ID for your cloned voice). Browser previews use the built-in system voice.
              </p>
              {stitchUrl && (
                <div className={styles.field}>
                  <video
                    controls
                    src={stitchUrl}
                    style={{ width: "100%", maxHeight: 360, borderRadius: 12, background: "#0f172a" }}
                  />
                  <div className={styles.ghActions} style={{ alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                    <TextField
                      label="Video name"
                      size="small"
                      value={stitchName}
                      onChange={(e) => setStitchName(e.target.value)}
                      sx={{ minWidth: 200 }}
                    />
                    <a
                      className={styles.linkButton}
                      href={stitchUrl}
                      download={`${(stitchName.trim() || "narrated-deck")}.webm`}
                    >
                      Download video
                    </a>
                    <span className={styles.ghMeta}>Slides without generated audio get a 3-second silent card.</span>
                  </div>
                </div>
              )}
              {avatarUrl && (
                <div className={styles.field}>
                  <video
                    controls
                    src={avatarUrl}
                    style={{ width: "100%", maxHeight: 360, borderRadius: 12, background: "#0f172a" }}
                  />
                  <div className={styles.ghActions}>
                    <a
                      href={avatarUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.linkButton}
                    >
                      Open / download video
                    </a>
                    <span className={styles.ghMeta}>Link expires after a while - download promptly.</span>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
        </>
      )}

      {mode === "video" && (
        <>
          {applyError && <p className={styles.error}>{applyError}</p>}
          {genErrorV && <p className={styles.error}>{genErrorV}</p>}

          <div className={styles.field} style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => document.getElementById("video-input")?.click()}
              >
                Choose video
              </Button>
              <Button variant="text" size="small" onClick={handleBrowseLibrary}>
                Browse library
              </Button>
              {vidName && <span className={styles.ghMeta}>{vidName}</span>}
            </div>
            <input
              id="video-input"
              type="file"
              accept="video/*"
              style={{ display: "none" }}
              onChange={handleVideoFileSelect}
            />
          </div>

          {vidUrl && (
            <div className={styles.field}>
              <video
                controls
                playsInline
                src={vidUrl}
                style={{ width: "100%", maxHeight: 320, borderRadius: 12, background: "#0f172a" }}
              />
            </div>
          )}

          <div className={styles.field}>
            <TextField
              label="Context (optional)"
              value={videoContext}
              onChange={(e) => setVideoContext(e.target.value)}
              size="small"
              fullWidth
              multiline
              minRows={2}
            />
            <div style={{ marginTop: 8 }}>
              <Button
                variant="contained"
                size="small"
                disabled={!vidUrl || genBusyV}
                onClick={() => void handleGenerateNarration()}
              >
                {genBusyV ? "Generating narration..." : "Generate narration"}
              </Button>
            </div>
          </div>

          {segments && (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {segments.map((seg, i) => (
                  <div key={i} style={{ padding: "12px", border: "1px solid var(--field-border)", borderRadius: 8 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <TextField
                        label="Start (s)"
                        type="number"
                        value={seg.start}
                        onChange={(e) => handleSegmentChange(i, "start", parseFloat(e.target.value) || 0)}
                        size="small"
                        slotProps={{ inputLabel: { shrink: true } }}
                        sx={{ width: 100 }}
                      />
                      <TextField
                        label="End (s)"
                        type="number"
                        value={seg.end}
                        onChange={(e) => handleSegmentChange(i, "end", parseFloat(e.target.value) || 0)}
                        size="small"
                        slotProps={{ inputLabel: { shrink: true } }}
                        sx={{ width: 100 }}
                      />
                    </div>
                    <TextField
                      size="small"
                      fullWidth
                      multiline
                      minRows={2}
                      value={seg.text}
                      onChange={(e) => handleSegmentChange(i, "text", e.target.value)}
                      style={{ marginBottom: 8 }}
                    />
                    {segAudio[i] && (
                      <audio
                        controls
                        src={segAudio[i].url}
                        style={{ width: "100%", height: 36, marginBottom: 8 }}
                      />
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button
                        variant="text"
                        size="small"
                        disabled={voBusyV !== null || !seg.text.trim()}
                        onClick={() => void handleSynthesizeOne(i, seg.text)}
                      >
                        Voice
                      </Button>
                      {segAudio[i] && (
                        <Button
                          variant="text"
                          size="small"
                          onClick={() => {
                            const newAudio = { ...segAudio };
                            if (newAudio[i]) {
                              URL.revokeObjectURL(newAudio[i].url);
                              delete newAudio[i];
                              setSegAudio(newAudio);
                            }
                          }}
                        >
                          Remove audio
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {!voiceReady && (
                <p className={styles.fieldHint}>
                  Requires ELEVENLABS_API_KEY.
                </p>
              )}

              <Button
                variant="outlined"
                size="small"
                disabled={voBusyV !== null || !segments.some((s) => s.text.trim())}
                onClick={() => void handleGenerateAllVoices()}
              >
                {voBusyV === "all" ? "Generating voices..." : "Generate all voices"}
              </Button>
            </>
          )}

          {segments && (
            <div className={styles.field}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
                <TextField
                  select
                  label="Audio mode"
                  value={applyMode}
                  onChange={(e) => setApplyMode(e.target.value as "replace" | "mix")}
                  size="small"
                  sx={{ minWidth: 180 }}
                >
                  <MenuItem value="replace">Replace original audio</MenuItem>
                  <MenuItem value="mix">Mix with original audio</MenuItem>
                </TextField>
                <Button
                  variant="contained"
                  size="small"
                  disabled={!vidBlob || !segments || !Object.keys(segAudio).length || applyBusy}
                  onClick={() => void handleApplyNarration()}
                >
                  {applyBusy ? `Applying... ${applyPct}%` : "Apply narration to video"}
                </Button>
              </div>
            </div>
          )}

          {result && (
            <div className={styles.field}>
              <video
                controls
                src={result.url}
                style={{ width: "100%", maxHeight: 360, borderRadius: 12, background: "#0f172a" }}
              />
              <div className={styles.ghActions} style={{ alignItems: "center", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
                <TextField
                  label="Video name"
                  size="small"
                  value={resultName}
                  onChange={(e) => setResultName(e.target.value)}
                  sx={{ minWidth: 200 }}
                />
                <a
                  className={styles.linkButton}
                  href={result.url}
                  download={`${(resultName.trim() || "narrated-video")}.${extForMime(result.blob.type)}`}
                >
                  Download video
                </a>
                <span className={styles.ghMeta}>
                  {resultSave === "saving" && "Saving to library..."}
                  {resultSave === "done" && "In library - see the Files tab"}
                  {resultSave === "failed" && "Library save failed"}
                </span>
              </div>
            </div>
          )}
        </>
      )}

      <details className={styles.adaptDisclosure} style={{ marginTop: 16 }}>
        <summary>Record a voice sample</summary>
        <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h4 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 8px 0" }}>1. Read</h4>
              <p className={styles.fieldHint} style={{ margin: "0 0 8px 0" }}>Quiet room, mic at a constant distance, natural teaching pace - about 90 seconds.</p>
              <div
                style={{
                  padding: "14px 18px",
                  borderRadius: 12,
                  backgroundColor: "color-mix(in srgb, var(--field-border) 18%, transparent)",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.6,
                  fontSize: "0.95rem",
                  marginBottom: 8,
                }}
              >
                {VOICE_SAMPLE_SCRIPT}
              </div>
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  navigator.clipboard.writeText(VOICE_SAMPLE_SCRIPT);
                }}
              >
                Copy text
              </Button>
            </div>

            <div>
              <h4 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 8px 0" }}>2. Record</h4>
              {sampleRecState === "idle" ? (
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => void handleStartRecording()}
                  disabled={!voiceReady}
                >
                  Start recording
                </Button>
              ) : (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span className={styles.navBadge}>REC</span>
                    <span className={styles.ghMeta}>
                      {Math.floor(sampleElapsed / 60)}:{String(sampleElapsed % 60).padStart(2, "0")}
                    </span>
                  </div>
                  <Button variant="outlined" size="small" onClick={handleStopRecording}>
                    Stop recording
                  </Button>
                </div>
              )}
              {sampleUrl && (
                <>
                  <audio controls src={sampleUrl} style={{ width: "100%", marginBottom: 8 }} />
                  <Button variant="text" size="small" onClick={handleDiscardSample}>
                    Discard
                  </Button>
                </>
              )}
            </div>

            {sampleBlob && (
              <div>
                <h4 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 8px 0" }}>3. Create the clone</h4>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                  <TextField
                    size="small"
                    label="Voice name"
                    value={cloneName}
                    onChange={(e) => setCloneName(e.target.value)}
                    sx={{ flex: "1 1 180px" }}
                    disabled={cloneBusy || !voiceReady}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    disabled={!sampleBlob || cloneBusy || !cloneName.trim() || !voiceReady}
                    onClick={() => void handleCreateCloneFromSample()}
                  >
                    {cloneBusy ? "Creating..." : "Create voice clone"}
                  </Button>
                </div>
                {!voiceReady && <p className={styles.fieldHint} style={{ margin: 0 }}>Requires ELEVENLABS_API_KEY.</p>}
                {cloneError && <p className={styles.error}>{cloneError}</p>}
                {cloneNote && <p className={styles.fieldHint}>{cloneNote}</p>}
              </div>
            )}
          </div>
        </div>
      </details>

      <details className={styles.adaptDisclosure} style={{ marginTop: 16 }}>
        <summary>My voice clone</summary>
        <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
          {cloneVoiceId ? (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              Using your cloned voice (id <span className={styles.ghMeta}>{cloneVoiceId}</span>) for audio generation.{" "}
              <button type="button" className={styles.linkButton} onClick={() => { setCloneVoiceId(""); if (typeof window !== "undefined") localStorage.removeItem("ta-voice-id"); setCloneNote(null); }}>Stop using it</button>
            </p>
          ) : (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              Or upload existing audio files:
            </p>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <TextField size="small" label="Voice name" value={cloneName} onChange={(e) => setCloneName(e.target.value)} sx={{ flex: "1 1 180px" }} disabled={cloneBusy || !voiceReady} />
            <Button variant="outlined" size="small" disabled={cloneBusy || !voiceReady || !cloneName.trim()} onClick={() => cloneFileRef.current?.click()}>
              {cloneBusy ? "Creating..." : "Upload samples & create"}
            </Button>
            <input ref={cloneFileRef} type="file" accept="audio/*,video/webm,video/mp4" multiple style={{ display: "none" }} onChange={(e) => { void handleCreateClone(e.target.files); e.target.value = ""; }} />
          </div>
          {!voiceReady && <p className={styles.fieldHint} style={{ margin: 0 }}>Requires ELEVENLABS_API_KEY.</p>}
          {cloneError && <p className={styles.error}>{cloneError}</p>}
          {cloneNote && <p className={styles.fieldHint}>{cloneNote}</p>}
        </div>
      </details>

      {busy === "extracting" && <p className={styles.ghMeta}>Reading deck...</p>}
    </div>
  );
}
