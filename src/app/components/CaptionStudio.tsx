"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, TextField, FormControlLabel, Checkbox, MenuItem } from "@mui/material";
import { describeScreenRecordingAction, voiceConfiguredAction, synthesizeNarrationAction, type ScreenCaption } from "../actions";
import { getStoredProvider } from "@/lib/llm-provider";
import { listBackupVideos, readBackupFile, type BackupVideo, type DirHandle } from "@/lib/backup-dir";
import { activeCaptionAt, wrapCaptionLines, captionLayout, ensureFiniteDuration, captionBlockBaselineY, vttLineSetting, type CaptionPosition } from "@/lib/caption-burn";
import { saveRecordingFile, extForMime, listRecordingFiles, downloadRecordingFile, renameRecordingFile, type RecordingFile } from "@/lib/recording-files";
import { startFrameTicker } from "@/lib/frame-ticker";
import { useSupabase } from "@/context/SupabaseProvider";
import type { Take } from "./RecordingTab";
import styles from "../page.module.css";

type EditableCaption = ScreenCaption & { position?: CaptionPosition };

// Context the Recording page already knows (script + title cards), persisted
// in localStorage - harvested so captions understand what the video is about.
function gatherRecordingContext(): { text: string; summary: string; cardSeconds: number } {
  if (typeof window === "undefined") return { text: "", summary: "", cardSeconds: 0 };
  const get = (k: string) => (localStorage.getItem(k) ?? "").trim();
  const topic = get("ta-rec-script-topic");
  const objectives = get("ta-rec-script-objectives");
  const script = get("ta-rec-script");
  const cardTitle = get("ta-rec-card-title");
  const cardSubtitle = get("ta-rec-card-subtitle");
  const cardClosing = get("ta-rec-card-closing");
  const cardsOn = localStorage.getItem("ta-rec-cards") === "1";
  const cardSecs = Number(localStorage.getItem("ta-rec-card-secs") ?? "3");
  const sections: string[] = [];
  const found: string[] = [];
  if (topic) {
    sections.push(`Lecture topic: ${topic}`);
    found.push(`topic "${topic.slice(0, 40)}"`);
  }
  if (objectives) {
    sections.push(`Objectives: ${objectives}`);
    found.push("objectives");
  }
  if (cardTitle || cardSubtitle) {
    sections.push(`Video title card: ${[cardTitle, cardSubtitle].filter(Boolean).join(" - ")}`);
    found.push("title card");
  }
  if (cardClosing) {
    sections.push(`Closing card: ${cardClosing}`);
    found.push("closing card");
  }
  if (cardsOn) {
    sections.push(`Video structure: the recording begins with a title card shown for about ${cardSecs} seconds before the lecture content starts, and ends with a closing card of the same length. Caption timestamps must account for this - the first content caption should start after the title card.`);
    found.push(`title/closing cards (${cardSecs}s)`);
  }
  if (script) {
    const words = script.split(/\s+/).filter(Boolean).length;
    sections.push(`Lecture script the author wrote for this material (may describe what the video shows):\n${script.slice(0, 1500)}${script.length > 1500 ? "..." : ""}`);
    found.push(`lecture script (${words} words)`);
  }
  return { text: sections.join("\n\n"), summary: found.join(", "), cardSeconds: cardsOn ? cardSecs : 0 };
}

export default function CaptionStudio({ takes = [], backupDir = null }: { takes?: Take[]; backupDir?: DirHandle | null }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [context, setContext] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-cap-context") ?? "";
  });
  const [usePageContext, setUsePageContext] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("ta-cap-use-page") !== "0";
  });
  const [pageContextSummary] = useState(() => gatherRecordingContext().summary);
  const [busy, setBusy] = useState<"idle" | "sampling" | "describing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<EditableCaption[] | null>(null);
  const [folderVideos, setFolderVideos] = useState<BackupVideo[] | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [libraryVideos, setLibraryVideos] = useState<RecordingFile[] | null>(null);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [burning, setBurning] = useState(false);
  const [burnProgress, setBurnProgress] = useState(0);
  const [burnError, setBurnError] = useState<string | null>(null);
  const [burned, setBurned] = useState<{ url: string; name: string; mimeType: string } | null>(null);
  const [burnedRow, setBurnedRow] = useState<RecordingFile | null>(null);
  const [burnSave, setBurnSave] = useState<"idle" | "saving" | "done" | "failed">("idle");
  const [renameNote, setRenameNote] = useState<string | null>(null);
  const [shiftSecs, setShiftSecs] = useState<string>(() => {
    if (typeof window === "undefined") return "0";
    return localStorage.getItem("ta-cap-shift-secs") ?? "0";
  });
  const [voiceReady, setVoiceReady] = useState(false);
  const [cueAudio, setCueAudio] = useState<Record<number, { url: string; base64: string; mimeType: string }>>({});
  const [voBusy, setVoBusy] = useState<null | "one" | "all">(null);
  const [voError, setVoError] = useState<string | null>(null);
  const [voMode, setVoMode] = useState<"original" | "voiceover" | "mix" | "none">(() => {
    if (typeof window === "undefined") return "original";
    const saved = localStorage.getItem("ta-cap-voiceover-mode");
    return saved === "original" || saved === "voiceover" || saved === "mix" || saved === "none" ? saved : "original";
  });
  const [previewing, setPreviewing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const burnAbortRef = useRef<(() => void) | null>(null);
  const burnedUrlRef = useRef<string | null>(null);
  const videoUrlRef = useRef<string | null>(null);
  const cueAudioRef = useRef(cueAudio);
  const previewAudioRef = useRef<Record<number, HTMLAudioElement>>({});
  const previewWasMutedRef = useRef(false);

  const { supabase, user } = useSupabase();

  const fmtTime = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const fmtTimeMs = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ds = Math.round((sec % 1) * 10);
    return `${m}:${String(s).padStart(2, "0")}.${ds}`;
  };

  const stopCueAudio = useCallback(() => {
    for (const a of Object.values(previewAudioRef.current)) {
      try {
        a.pause();
        a.currentTime = 0;
      } catch {}
    }
  }, []);

  const endPreview = useCallback(() => {
    setPreviewing(false);
    stopCueAudio();
    const v = videoRef.current;
    if (v) v.muted = previewWasMutedRef.current;
  }, [stopCueAudio]);

  const adoptVideo = useCallback((blob: Blob, name: string) => {
    if (previewing) endPreview();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(blob);
    setVideoUrl(url);
    setFileName(name);
    setCaptions(null);
    setError(null);
    setImportError(null);
  }, [videoUrl, previewing, endPreview]);

  const vttTime = (sec: number): string => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-cap-context", context);
  }, [context]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-cap-use-page", usePageContext ? "1" : "0");
  }, [usePageContext]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-cap-shift-secs", shiftSecs);
  }, [shiftSecs]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-cap-voiceover-mode", voMode);
  }, [voMode]);

  useEffect(() => {
    cueAudioRef.current = cueAudio;
  }, [cueAudio]);

  useEffect(() => {
    if (!previewing) return;
    const v = videoRef.current;
    if (!v) return;
    const tick = () => {
      const t = v.currentTime;
      if (!captions) return;
      captions.forEach((c, i) => {
        const a = previewAudioRef.current[i];
        if (!a) return;
        const inWindow = t >= c.start && t < c.end + 0.25;
        if (inWindow && a.paused && !a.ended) {
          const offset = t - c.start;
          if (offset > 0.15 && Math.abs(a.currentTime - offset) > 0.3) {
            try {
              a.currentTime = offset;
            } catch {}
          }
          void a.play().catch(() => {});
        } else if (!inWindow && !a.paused) {
          a.pause();
        }
      });
    };
    const onPause = () => {
      stopCueAudio();
    };
    const onSeeking = () => {
      stopCueAudio();
      for (const a of Object.values(previewAudioRef.current)) {
        try {
          a.currentTime = 0;
        } catch {}
      }
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
      stopCueAudio();
    };
  }, [previewing, captions, endPreview, stopCueAudio]);

  useEffect(() => {
    (async () => {
      const r = await voiceConfiguredAction();
      setVoiceReady(r.configured);
    })();
  }, []);

  useEffect(() => {
    videoUrlRef.current = videoUrl;
  }, [videoUrl]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    adoptVideo(file, file.name);
  }, [adoptVideo]);

  const handleImportTake = async (take: Take) => {
    setImportingKey("take:" + take.id);
    try {
      const blob = await (await fetch(take.url)).blob();
      const ext = take.mimeType.includes("mp4") ? "mp4" : "webm";
      adoptVideo(blob, take.name + "." + ext);
    } catch {
      setImportError("Could not load that take.");
    } finally {
      setImportingKey(null);
    }
  };

  const handleBrowseFolder = async () => {
    if (!backupDir) return;
    setFolderBusy(true);
    setImportError(null);
    try {
      setFolderVideos(await listBackupVideos(backupDir));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not read the backup folder.");
    } finally {
      setFolderBusy(false);
    }
  };

  const handleImportFolderVideo = async (name: string) => {
    if (!backupDir) return;
    setImportingKey("file:" + name);
    try {
      const file = await readBackupFile(backupDir, name);
      adoptVideo(file, file.name);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setImportingKey(null);
    }
  };

  const loadLibrary = useCallback(async () => {
    if (!supabase || !user) return;
    setLibraryBusy(true);
    setImportError(null);
    try {
      const files = await listRecordingFiles(supabase, user.id);
      setLibraryVideos(files);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not load library.");
    } finally {
      setLibraryBusy(false);
    }
  }, [supabase, user]);

  useEffect(() => {
    if (user && supabase && libraryVideos === null && !libraryBusy) {
      let cancelled = false;
      (async () => {
        setLibraryBusy(true);
        setImportError(null);
        try {
          const files = await listRecordingFiles(supabase, user.id);
          if (!cancelled) {
            setLibraryVideos(files);
          }
        } catch (err) {
          if (!cancelled) {
            setImportError(err instanceof Error ? err.message : "Could not load library.");
          }
        } finally {
          if (!cancelled) {
            setLibraryBusy(false);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [user, supabase, libraryVideos, libraryBusy]);

  const handleImportLibraryVideo = async (file: RecordingFile) => {
    setImportingKey("lib:" + file.id);
    try {
      const blob = await downloadRecordingFile(supabase, file);
      adoptVideo(blob, file.name + "." + extForMime(file.mimeType));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not load that video.");
    } finally {
      setImportingKey(null);
    }
  };

  const extractFrames = useCallback(async (): Promise<{ frames: Array<{ timeSec: number; base64: string }>; dur: number }> => {
    if (!videoUrl) throw new Error("No video URL");
    return new Promise((resolve, reject) => {
      const v = document.createElement("video");
      v.src = videoUrl;
      v.muted = true;
      v.preload = "auto";

      const handleLoadedMetadata = () => {
        v.removeEventListener("loadedmetadata", handleLoadedMetadata);
        (async () => {
          try {
            const dur = await ensureFiniteDuration(v);
            const step = Math.max(5, dur / 24);
            const canvas = document.createElement("canvas");
            canvas.width = 640;
            canvas.height = Math.round(640 * (v.videoHeight / v.videoWidth)) || 360;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Could not get canvas context");

            const frames: Array<{ timeSec: number; base64: string }> = [];
            for (let t = 0; t < dur; t += step) {
              v.currentTime = Math.min(t, Math.max(0, dur - 0.1));
              await new Promise<void>((res) => {
                v.onseeked = () => {
                  res();
                };
              });
              ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
              const b64 = canvas.toDataURL("image/jpeg", 0.6).split(",")[1];
              frames.push({ timeSec: t, base64: b64 });
            }
            resolve({ frames, dur });
          } catch (err) {
            reject(err);
          }
        })();
      };

      v.addEventListener("loadedmetadata", handleLoadedMetadata);
    });
  }, [videoUrl]);

  const handleGenerate = useCallback(async () => {
    if (!videoUrl) return;
    try {
      setError(null);
      setBusy("sampling");
      const { frames, dur } = await extractFrames();
      setBusy("describing");
      const page = usePageContext ? gatherRecordingContext().text : "";
      const combined = [context.trim(), page].filter(Boolean).join("\n\n");
      const r = await describeScreenRecordingAction(frames, dur, combined, getStoredProvider());
      setBusy("idle");
      if ("error" in r) {
        setError(r.error);
        return;
      }
      for (const url of Object.values(cueAudio)) {
        URL.revokeObjectURL(url.url);
      }
      setCueAudio({});
      setCaptions(r.captions);
    } catch (err) {
      setBusy("idle");
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  }, [videoUrl, context, usePageContext, extractFrames, cueAudio]);

  const buildVttContent = useCallback((): string => {
    if (!captions) return "";
    const lines = ["WEBVTT", ""];
    for (let i = 0; i < captions.length; i++) {
      const c = captions[i];
      lines.push(`${i + 1}`);
      const positionSetting = vttLineSetting(c.position);
      lines.push(`${vttTime(c.start)} --> ${vttTime(c.end)}${positionSetting}`);
      lines.push(c.text);
      lines.push("");
    }
    return lines.join("\n");
  }, [captions]);

  const handleDownloadVtt = useCallback(() => {
    if (!captions) return;
    const vtt = buildVttContent();
    const blob = new Blob([vtt], { type: "text/vtt" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileName.replace(/\.[^/.]+$/, "")}.vtt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }, [captions, fileName, buildVttContent]);

  const handleCopyCaptions = useCallback(() => {
    if (!captions) return;
    const text = captions.map((c) => `${fmtTime(c.start)}-${fmtTime(c.end)} ${c.text}`).join("\n");
    navigator.clipboard.writeText(text);
  }, [captions]);

  const updateCue = useCallback((i: number, patch: Partial<EditableCaption>) => {
    setCaptions((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const updated = { ...next[i], ...patch };
      updated.start = Math.max(0, updated.start);
      updated.end = Math.max(updated.start + 0.1, updated.end);
      next[i] = updated;
      return next;
    });
  }, []);

  const sortCaptions = useCallback(() => {
    setCaptions((prev) => {
      if (!prev) return prev;
      return [...prev].sort((a, b) => a.start - b.start);
    });
  }, []);

  const handleUpdateCaption = useCallback((i: number, text: string) => {
    updateCue(i, { text });
    if (cueAudio[i]) {
      URL.revokeObjectURL(cueAudio[i].url);
      setCueAudio((prev) => {
        const next = { ...prev };
        delete next[i];
        return next;
      });
    }
  }, [updateCue, cueAudio]);

  const handleRemoveCaption = useCallback((i: number) => {
    for (const url of Object.values(cueAudio)) {
      URL.revokeObjectURL(url.url);
    }
    setCueAudio({});
    setCaptions((prev) => {
      if (!prev) return prev;
      return prev.filter((_, idx) => idx !== i);
    });
  }, [cueAudio]);

  const handleAddCaptionAtPlayhead = useCallback(() => {
    const t = Math.round((videoRef.current?.currentTime ?? 0) * 10) / 10;
    setCaptions((prev) => {
      const next = prev ? [...prev] : [];
      next.push({ start: t, end: t + 2, text: "New caption", position: "bottom" });
      return next.sort((a, b) => a.start - b.start);
    });
  }, []);

  const handleGenerateVoiceForCue = useCallback(async (i: number) => {
    if (!captions || !voiceReady) return;
    const c = captions[i];
    if (!c) return;
    setVoError(null);
    setVoBusy("one");
    try {
      const r = await synthesizeNarrationAction(c.text, localStorage.getItem("ta-voice-id") || undefined);
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
  }, [captions, voiceReady]);

  const handleGenerateAllVoices = useCallback(async () => {
    if (!captions || !voiceReady) return;
    setVoError(null);
    setVoBusy("all");
    const next = { ...cueAudio };
    for (let i = 0; i < captions.length; i++) {
      if (next[i]) continue;
      setVoError(null);
      const c = captions[i];
      try {
        const r = await synthesizeNarrationAction(c.text, localStorage.getItem("ta-voice-id") || undefined);
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
  }, [captions, voiceReady, cueAudio]);

  const handleShiftAllCaptions = useCallback((delta: number) => {
    setCaptions((prev) => {
      if (!prev) return prev;
      return prev.map((c) => {
        const start = Math.max(0, +(c.start + delta).toFixed(1));
        const end = Math.max(start + 0.1, +(c.end + delta).toFixed(1));
        return { ...c, start, end };
      });
    });
    sortCaptions();
  }, [sortCaptions]);

  const startPreview = useCallback(() => {
    const v = videoRef.current;
    if (!v || !captions || captions.length === 0) return;
    previewWasMutedRef.current = v.muted;
    v.muted = voMode === "voiceover" || voMode === "none";
    stopCueAudio();
    previewAudioRef.current = {};
    if (voMode === "voiceover" || voMode === "mix") {
      for (const [idxStr, entry] of Object.entries(cueAudio)) {
        const a = new Audio(entry.url);
        a.preload = "auto";
        previewAudioRef.current[Number(idxStr)] = a;
      }
    }
    setPreviewing(true);
    v.currentTime = 0;
    void v.play();
  }, [captions, cueAudio, voMode, stopCueAudio]);

  const handleBurnCaptions = useCallback(async () => {
    if (previewing) endPreview();
    if (!videoUrl || !captions || captions.length === 0 || burning) return;

    if ((voMode === "voiceover" || voMode === "mix") && Object.keys(cueAudio).length === 0) {
      setBurnError("Generate voices for your captions first (or set Export audio to Original).");
      return;
    }

    setBurnError(null);
    if (burned) {
      if (burned.url) URL.revokeObjectURL(burned.url);
      setBurned(null);
    }
    setBurning(true);
    setBurnProgress(0);
    setBurnSave("idle");
    setBurnedRow(null);

    let audioContext: AudioContext | null = null;
    let cancelled = false;
    let ticker: { stop: () => void } | null = null;
    const voiceNodes: Array<AudioBufferSourceNode> = [];

    try {
      const v = document.createElement("video");
      v.src = videoUrl;
      v.playsInline = true;
      v.preload = "auto";

      await new Promise<void>((resolve) => {
        if (v.readyState >= 1) {
          resolve();
        } else {
          v.addEventListener("loadedmetadata", () => resolve(), { once: true });
        }
      });

      const dur = await ensureFiniteDuration(v);

      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth || 1280;
      canvas.height = v.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");

      // Mode "none" strips all audio: no AudioContext, no element source, no
      // destination - the recorder stream carries only the canvas video track.
      let audioTracks: MediaStreamTrack[] = [];
      let voiceDest: MediaStreamAudioDestinationNode | null = null;
      const decodedVoices: Array<{ buffer: AudioBuffer; startSec: number }> = [];
      if (voMode !== "none") {
        try {
          audioContext = new AudioContext();
          if ((voMode === "voiceover" || voMode === "mix") && Object.keys(cueAudio).length > 0) {
            for (const [indexStr, entry] of Object.entries(cueAudio)) {
              try {
                const idx = Number(indexStr);
                const cue = captions[idx];
                if (!cue) continue;
                const bytes = Uint8Array.from(atob(entry.base64), (ch) => ch.charCodeAt(0));
                const buffer = await audioContext.decodeAudioData(bytes.buffer.slice(0));
                decodedVoices.push({ buffer, startSec: cue.start });
              } catch {
                // Skip failures
              }
            }
          }
          const src = audioContext.createMediaElementSource(v);
          const dest = audioContext.createMediaStreamDestination();
          voiceDest = dest;
          if (voMode === "original" || voMode === "mix") {
            src.connect(dest);
          }
          audioTracks = dest.stream.getAudioTracks();
        } catch {
          audioTracks = [];
        }
      } else {
        // Without a media element source to detach the element's output,
        // mute it so the export stays silent for the user.
        v.muted = true;
      }

      const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...audioTracks]);

      const mimeTypes = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
      let selectedMime = "video/webm";
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMime = mime;
          break;
        }
      }

      const recorder = new MediaRecorder(stream, { mimeType: selectedMime });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        if (cancelled) {
          return;
        }

        const blob = new Blob(chunks, { type: selectedMime });
        const outUrl = URL.createObjectURL(blob);
        const base = fileName.replace(/\.[^/.]+$/, "") || "video";
        const outName = `${base}-captioned`;

        setBurned({ url: outUrl, name: outName, mimeType: blob.type || "video/webm" });
        burnedUrlRef.current = outUrl;
        setBurning(false);
        setBurnProgress(100);

        if (user) {
          setBurnSave("saving");
          saveRecordingFile(supabase, user.id, blob, {
            name: outName,
            kind: "captioned",
            mimeType: blob.type || "video/webm",
            durationSec: dur,
          })
            .then((result) => {
              setBurnedRow(result);
              setBurnSave("done");
            })
            .catch((err) => {
              console.error("Save failed:", err);
              setBurnSave("failed");
            });
        }
      };

      recorder.start(1000);

      let lastReportedProgress = 0;

      const drawLoop = () => {
        if (cancelled || v.ended) {
          ticker?.stop();
          v.pause();
          recorder.stop();
          burnAbortRef.current = null;
          if (audioContext && audioContext.state !== "closed") {
            try {
              audioContext.close();
            } catch {
              // Double-close guard
            }
          }
          return;
        }

        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

        const cue = activeCaptionAt(captions, v.currentTime);
        if (cue) {
          const layout = captionLayout(canvas.width, canvas.height);
          ctx.font = `600 ${layout.fontPx}px system-ui, sans-serif`;
          const lines = wrapCaptionLines(cue.text, layout.maxTextWidth, (s) => ctx.measureText(s).width);
          let baselineY = captionBlockBaselineY(canvas.height, layout, lines.length, cue.position);

          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            const textWidth = ctx.measureText(line).width;
            const boxW = textWidth + layout.padX * 2;
            const boxH = layout.lineHeight;
            const boxX = (canvas.width - boxW) / 2;
            const boxY = baselineY - boxH / 2 - layout.lineHeight / 2;
            const lineY = boxY + boxH / 2;

            if (ctx.roundRect) {
              ctx.beginPath();
              ctx.roundRect(boxX, boxY, boxW, boxH, 8);
              ctx.fillStyle = "rgba(15,23,42,0.78)";
              ctx.fill();
            } else {
              ctx.fillStyle = "rgba(15,23,42,0.78)";
              ctx.fillRect(boxX, boxY, boxW, boxH);
            }

            ctx.fillStyle = "#f8fafc";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(line, canvas.width / 2, lineY);

            baselineY -= layout.lineHeight;
          }
        }

        const newProgress = Math.min(100, Math.round((v.currentTime / dur) * 100));
        if (newProgress !== lastReportedProgress) {
          lastReportedProgress = newProgress;
          setBurnProgress(newProgress);
        }
      };

      burnAbortRef.current = () => {
        cancelled = true;
        ticker?.stop();
        v.pause();
        v.removeAttribute("src");
        if (recorder.state !== "inactive") recorder.stop();
        for (const node of voiceNodes) {
          try {
            node.stop();
          } catch {
            // Guard
          }
        }
        if (audioContext && audioContext.state !== "closed") {
          try {
            audioContext.close();
          } catch {
            // Double-close guard
          }
        }
        setBurning(false);
        burnAbortRef.current = null;
      };

      v.currentTime = 0;
      await v.play();
      if (audioContext && decodedVoices.length > 0) {
        for (const { buffer, startSec } of decodedVoices) {
          const node = audioContext.createBufferSource();
          node.buffer = buffer;
          if (voiceDest) {
            node.connect(voiceDest);
            node.start(audioContext.currentTime + startSec);
            voiceNodes.push(node);
          }
        }
      }
      ticker = startFrameTicker(30, drawLoop);
    } catch (err) {
      const abort = burnAbortRef.current;
      if (abort) {
        // Abort pauses the video, stops the recorder (cancelled, so onstop
        // produces no result), closes the AudioContext, and nulls the ref.
        abort();
      } else {
        if (audioContext && audioContext.state !== "closed") {
          try {
            audioContext.close();
          } catch {
            // Guard
          }
        }
        for (const node of voiceNodes) {
          try {
            node.stop();
          } catch {
            // Guard
          }
        }
        burnAbortRef.current = null;
      }
      setBurnError(err instanceof Error ? err.message : "An error occurred");
      setBurning(false);
    }
  }, [videoUrl, captions, burning, burned, fileName, user, supabase, voMode, cueAudio, previewing, endPreview]);

  useEffect(() => {
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      if (burnedUrlRef.current) URL.revokeObjectURL(burnedUrlRef.current);
      for (const entry of Object.values(cueAudioRef.current)) {
        URL.revokeObjectURL(entry.url);
      }
      stopCueAudio();
      burnAbortRef.current?.();
    };
  }, [stopCueAudio]);

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>Caption a screen recording</h2>
        <p className={styles.adaptPanelSubtitle}>
          Upload a screen recording and let AI write timed captions describing what happens. Edit them, then download as .vtt subtitles.
        </p>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div>
        <Button variant="outlined" size="small" onClick={() => fileInputRef.current?.click()}>
          Choose video
        </Button>
        <input ref={fileInputRef} type="file" accept="video/*" style={{ display: "none" }} onChange={handleFileChange} />
        {fileName && (
          <TextField
            size="small"
            label="Video name"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            style={{ marginLeft: 12, width: 200 }}
          />
        )}
      </div>

      {importError && <p className={styles.error}>{importError}</p>}

      {(takes.length > 0 || backupDir || user) && (
        <div className={styles.field}>
          <p className={styles.fieldHint} style={{ margin: 0 }}>Or import a saved video:</p>

          {user && (
            <div>
              <p className={styles.fieldHint} style={{ margin: 0, fontWeight: 600 }}>From the Files tab</p>
              {libraryBusy && !libraryVideos && (
                <p className={styles.fieldHint} style={{ margin: 0 }}>Loading your library...</p>
              )}
              {libraryVideos && libraryVideos.length === 0 && (
                <p className={styles.fieldHint} style={{ margin: 0 }}>No saved videos yet - record one on the Recording tab or upload on the Files tab.</p>
              )}
              <Button variant="text" size="small" disabled={libraryBusy} onClick={() => void loadLibrary()}>
                {libraryBusy ? "Loading..." : "Refresh"}
              </Button>
              {libraryVideos && libraryVideos.map((v) => (
                <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0" }}>
                  <span className={styles.ghMeta} style={{ flex: 1, minWidth: 0 }}>
                    {v.name} - {v.kind === "recording" ? "Recording" : v.kind === "narrated" ? "Narrated" : "Captioned"}
                    {v.durationSec && ` - ${fmtTime(v.durationSec)}`}
                    {" "}
                    - {(v.sizeBytes / 1048576).toFixed(1)} MB
                  </span>
                  <Button variant="outlined" size="small" disabled={importingKey !== null} onClick={() => void handleImportLibraryVideo(v)}>
                    {importingKey === "lib:" + v.id ? "Importing..." : "Import"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {takes.length > 0 && takes.map((take) => (
            <div key={take.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0" }}>
              <span className={styles.ghMeta} style={{ flex: 1, minWidth: 0 }}>
                {take.name} - {fmtTime(take.durationSec)} - {(take.sizeBytes / 1048576).toFixed(1)} MB
              </span>
              <Button variant="outlined" size="small" disabled={importingKey !== null} onClick={() => void handleImportTake(take)}>
                {importingKey === "take:" + take.id ? "Importing..." : "Import"}
              </Button>
            </div>
          ))}
          {takes.length === 0 && <p className={styles.fieldHint} style={{ margin: 0 }}>No takes recorded this session.</p>}

          {backupDir && (
            <div>
              <Button variant="text" size="small" disabled={folderBusy} onClick={() => void handleBrowseFolder()}>
                {folderBusy ? "Reading folder..." : folderVideos ? "Refresh backup folder" : "Browse backup folder (" + backupDir.name + ")"}
              </Button>
              {folderVideos && folderVideos.length === 0 && <p className={styles.fieldHint} style={{ margin: 0 }}>No videos found in the backup folder.</p>}
              {folderVideos && folderVideos.map((v) => (
                <div key={v.name} style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0" }}>
                  <span className={styles.ghMeta} style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {v.name} - {(v.sizeBytes / 1048576).toFixed(1)} MB - {new Date(v.lastModified).toLocaleString()}
                  </span>
                  <Button variant="outlined" size="small" disabled={importingKey !== null} onClick={() => void handleImportFolderVideo(v.name)}>
                    {importingKey === "file:" + v.name ? "Importing..." : "Import"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={styles.field}>
        <TextField
          label="Context (optional)"
          placeholder="e.g. Demonstrating how to submit an assignment in Canvas"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !(!videoUrl || busy !== "idle")) {
              e.preventDefault();
              void handleGenerate();
            }
          }}
          size="small"
          fullWidth
        />
        <FormControlLabel
          control={<Checkbox size="small" checked={usePageContext} onChange={(e) => setUsePageContext(e.target.checked)} />}
          label={<span style={{ fontSize: "0.85rem" }}>Use context from this Recording page</span>}
        />
        {usePageContext && (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {pageContextSummary ? `Found: ${pageContextSummary}.` : "No page context found yet - set a lecture script or title cards on the Record view and it will be used automatically."}
          </p>
        )}
      </div>

      {videoUrl && (
        <div style={{ position: "relative", maxWidth: "100%", display: "inline-block" }}>
          <video
            key={videoUrl}
            ref={videoRef}
            controls
            playsInline
            preload="auto"
            src={videoUrl}
            style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 12, background: "#0f172a", display: "block" }}
            onError={() => setError("The browser could not decode this video. Try re-importing it, or convert it to MP4/WebM.")}
            onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
            onSeeked={(e) => setPlayhead(e.currentTarget.currentTime)}
          />
          {captions && (
            (() => {
              const activeCue = captions.find((c) => c.start <= playhead && playhead < c.end) ?? null;
              if (!activeCue) return null;
              const positionStyle = activeCue.position === "middle"
                ? { top: "50%", transform: "translateY(-50%)" }
                : activeCue.position === "top"
                  ? { top: "6%" }
                  : { bottom: "6%" };
              return (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    pointerEvents: "none",
                    display: "flex",
                    justifyContent: "center",
                    ...positionStyle,
                  }}
                >
                  <span
                    style={{
                      background: "rgba(15,23,42,0.78)",
                      color: "#f8fafc",
                      padding: "4px 10px",
                      borderRadius: 8,
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      maxWidth: "88%",
                      textAlign: "center",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {activeCue.text}
                  </span>
                </div>
              );
            })()
          )}
        </div>
      )}

      <Button
        variant="contained"
        size="small"
        disabled={!videoUrl || busy !== "idle"}
        onClick={handleGenerate}
      >
        {busy === "sampling"
          ? "Reading video..."
          : busy === "describing"
            ? "Writing captions..."
            : captions
              ? "Regenerate captions"
              : "Generate captions"}
      </Button>

      {captions && (
        <div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
            <TextField
              type="number"
              size="small"
              label="Shift all (s)"
              value={shiftSecs}
              onChange={(e) => setShiftSecs(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !(!captions || captions.length === 0 || Number(shiftSecs) === 0 || isNaN(Number(shiftSecs)))) {
                  e.preventDefault();
                  handleShiftAllCaptions(Number(shiftSecs));
                }
              }}
              style={{ width: 120 }}
            />
            <Button
              variant="outlined"
              size="small"
              disabled={!captions || captions.length === 0 || Number(shiftSecs) === 0 || isNaN(Number(shiftSecs))}
              onClick={() => handleShiftAllCaptions(Number(shiftSecs))}
            >
              Shift all
            </Button>
            {gatherRecordingContext().cardSeconds > 0 && (
              <>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => handleShiftAllCaptions(gatherRecordingContext().cardSeconds)}
                >
                  Shift all +{gatherRecordingContext().cardSeconds}s (title card)
                </Button>
                <p className={styles.fieldHint} style={{ margin: 0, flex: 1, minWidth: 200 }}>
                  This video was recorded with a title card - if captions look early, shift them right by the card length.
                </p>
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <Button
              variant="outlined"
              size="small"
              disabled={!voiceReady || voBusy !== null || !captions || captions.length === 0}
              onClick={() => void handleGenerateAllVoices()}
            >
              {voBusy === "all" ? `Voicing cue...` : "Generate all voices"}
            </Button>
            <TextField
              select
              size="small"
              label="Export audio"
              value={voMode}
              onChange={(e) => setVoMode(e.target.value as "original" | "voiceover" | "mix" | "none")}
              style={{ minWidth: 170 }}
            >
              <MenuItem value="original">Original audio</MenuItem>
              <MenuItem value="voiceover">AI voiceover only</MenuItem>
              <MenuItem value="mix">Original + voiceover</MenuItem>
              <MenuItem value="none">No audio (strip)</MenuItem>
            </TextField>
            {!voiceReady && (
              <p className={styles.fieldHint} style={{ margin: 0 }}>
                AI voice is not configured (set ELEVENLABS_API_KEY, and clone your voice on the Narrate a deck tab).
              </p>
            )}
          </div>

          {voError && <p className={styles.error}>{voError}</p>}

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            {captions.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 0", flexWrap: "wrap" }}>
                <span className={styles.ghMetaMono} style={{ flexShrink: 0, minWidth: 50 }}>
                  {fmtTimeMs(c.start)}-{fmtTimeMs(c.end)}
                </span>

                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <TextField
                    size="small"
                    label="Start s"
                    type="number"
                    value={Number(c.start.toFixed(1))}
                    onChange={(e) => updateCue(i, { start: parseFloat(e.target.value) || 0 })}
                    onBlur={() => sortCaptions()}
                    style={{ width: 90 }}
                  />
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => updateCue(i, { start: Math.max(0, c.start - 0.5) })}
                    title="Nudge start earlier"
                  >
                    -0.5
                  </Button>
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => updateCue(i, { start: c.start + 0.5 })}
                    title="Nudge start later"
                  >
                    +0.5
                  </Button>
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => {
                      const t = Math.round((videoRef.current?.currentTime ?? 0) * 10) / 10;
                      updateCue(i, { start: t });
                    }}
                  >
                    Set start
                  </Button>
                </div>

                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <TextField
                    size="small"
                    label="End s"
                    type="number"
                    value={Number(c.end.toFixed(1))}
                    onChange={(e) => updateCue(i, { end: parseFloat(e.target.value) || c.start + 0.1 })}
                    onBlur={() => sortCaptions()}
                    style={{ width: 90 }}
                  />
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => updateCue(i, { end: Math.max(c.start + 0.1, c.end - 0.5) })}
                    title="Nudge end earlier"
                  >
                    -0.5
                  </Button>
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => updateCue(i, { end: c.end + 0.5 })}
                    title="Nudge end later"
                  >
                    +0.5
                  </Button>
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => {
                      const t = Math.round((videoRef.current?.currentTime ?? 0) * 10) / 10;
                      updateCue(i, { end: Math.max(c.start + 0.1, t) });
                    }}
                  >
                    Set end
                  </Button>
                </div>

                <Button
                  variant="text"
                  size="small"
                  onClick={() => {
                    const v = videoRef.current;
                    if (v) v.currentTime = c.start;
                  }}
                >
                  Jump
                </Button>

                <TextField
                  select
                  size="small"
                  label="Position"
                  value={c.position ?? "bottom"}
                  onChange={(e) => updateCue(i, { position: e.target.value as CaptionPosition })}
                  style={{ minWidth: 100 }}
                >
                  <MenuItem value="bottom">Bottom</MenuItem>
                  <MenuItem value="middle">Middle</MenuItem>
                  <MenuItem value="top">Top</MenuItem>
                </TextField>

                <TextField
                  size="small"
                  fullWidth
                  value={c.text}
                  onChange={(e) => handleUpdateCaption(i, e.target.value)}
                  style={{ minWidth: 200, flex: 1 }}
                />

                <Button
                  variant="text"
                  size="small"
                  disabled={!voiceReady || voBusy !== null}
                  onClick={() => void handleGenerateVoiceForCue(i)}
                >
                  Voice
                </Button>

                {cueAudio[i] && (
                  <audio
                    controls
                    src={cueAudio[i].url}
                    style={{ height: 28, maxWidth: 200 }}
                  />
                )}

                <Button
                  variant="text"
                  size="small"
                  color="error"
                  onClick={() => handleRemoveCaption(i)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>

          <Button variant="outlined" size="small" onClick={handleAddCaptionAtPlayhead} style={{ marginTop: 12 }}>
            Add caption at playhead
          </Button>

          <div className={styles.ghActions} style={{ marginTop: 16, display: "flex", gap: 12 }}>
            <Button variant="contained" size="small" onClick={handleDownloadVtt}>
              Download .vtt
            </Button>
            <Button variant="text" size="small" onClick={handleCopyCaptions}>
              Copy captions
            </Button>
          </div>

          <div className={styles.ghActions} style={{ marginTop: 12, alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <TextField
              select
              size="small"
              label="Export audio"
              value={voMode}
              onChange={(e) => setVoMode(e.target.value as "original" | "voiceover" | "mix" | "none")}
              style={{ minWidth: 170 }}
            >
              <MenuItem value="original">Original audio</MenuItem>
              <MenuItem value="voiceover">AI voiceover only</MenuItem>
              <MenuItem value="mix">Original + voiceover</MenuItem>
              <MenuItem value="none">No audio (strip)</MenuItem>
            </TextField>
            <Button variant="contained" size="small" disabled={!videoUrl || !captions || captions.length === 0 || burning} onClick={() => (previewing ? endPreview() : startPreview())}>
              {previewing ? "Stop preview" : "Preview"}
            </Button>
            {previewing && <span className={styles.fieldHint} style={{ margin: 0 }}>Previewing with {voMode === "original" ? "the original audio" : voMode === "voiceover" ? "AI voiceover only" : voMode === "mix" ? "original audio plus voiceover" : "no audio"}.</span>}
            {previewing && (voMode === "voiceover" || voMode === "mix") && Object.keys(cueAudio).length === 0 && (
              <span className={styles.fieldHint} style={{ margin: 0, color: "var(--warning, #b45309)" }}>No generated voices yet - captions will be silent. Use Voice / Generate all voices.</span>
            )}
            <Button variant="outlined" size="small" disabled={burning} onClick={() => void handleBurnCaptions()}>
              {burning ? `Exporting... ${burnProgress}%` : "Export video with captions"}
            </Button>
            {burning && (
              <Button variant="text" size="small" color="error" onClick={() => burnAbortRef.current?.()}>
                Cancel
              </Button>
            )}
            {burning && (
              <span className={styles.fieldHint} style={{ margin: 0 }}>
                The video plays through once (silently) while the captions are rendered in.
              </span>
            )}
          </div>

          {burnError && <p className={styles.error}>{burnError}</p>}

          {burned && (
            <div className={styles.field} style={{ marginTop: 12 }}>
              <video
                key={burned.url}
                controls
                playsInline
                src={burned.url}
                style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 12, background: "#0f172a" }}
              />
              {burnedRow && (
                <div style={{ marginTop: 8 }}>
                  <TextField
                    size="small"
                    label="Name"
                    value={burned.name}
                    onChange={(e) => {
                      setBurned({ ...burned, name: e.target.value });
                      setRenameNote(null);
                    }}
                    onBlur={async (e) => {
                      const newName = e.currentTarget.value.trim();
                      if (newName && newName !== burned.name) {
                        try {
                          await renameRecordingFile(supabase, burnedRow.id, newName);
                          setRenameNote("Renamed in library.");
                          setBurned({ ...burned, name: newName });
                        } catch (err) {
                          setRenameNote(err instanceof Error ? err.message : "Rename failed");
                        }
                      }
                    }}
                    style={{ marginRight: 8 }}
                  />
                  {renameNote && (
                    <p className={styles.fieldHint} style={{ margin: 0, marginTop: 4 }}>
                      {renameNote}
                    </p>
                  )}
                </div>
              )}
              <div className={styles.ghActions} style={{ marginTop: 8 }}>
                <Button
                  variant="contained"
                  size="small"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = burned.url;
                    a.download = `${burned.name}.${extForMime(burned.mimeType)}`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                  }}
                >
                  Download captioned video
                </Button>
                {burnSave === "saving" && (
                  <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Saving to library...</span>
                )}
                {burnSave === "done" && (
                  <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>In library - see the Files tab</span>
                )}
                {burnSave === "failed" && (
                  <span className={`${styles.ghBadge} ${styles.ghBadgeDanger}`}>Library save failed</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <p className={styles.fieldHint}>
        The .vtt file loads into Canvas Studio, YouTube, and most players; exporting burns the captions into the video itself.
      </p>
    </div>
  );
}
