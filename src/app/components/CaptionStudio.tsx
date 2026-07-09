"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, TextField } from "@mui/material";
import { describeScreenRecordingAction, type ScreenCaption } from "../actions";
import { getStoredProvider } from "@/lib/llm-provider";
import styles from "../page.module.css";

export default function CaptionStudio() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState<"idle" | "sampling" | "describing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<ScreenCaption[] | null>(null);
  const [vttUrl, setVttUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevVttUrlRef = useRef<string | null>(null);

  const fmtTime = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const vttTime = (sec: number): string => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  };

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setFileName(file.name);
    setCaptions(null);
    setError(null);
  }, [videoUrl]);

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
            const dur = v.duration;
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
      const r = await describeScreenRecordingAction(frames, dur, context, getStoredProvider());
      setBusy("idle");
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setCaptions(r.captions);
    } catch (err) {
      setBusy("idle");
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  }, [videoUrl, context, extractFrames]);

  const buildVttContent = useCallback((): string => {
    if (!captions) return "";
    const lines = ["WEBVTT", ""];
    for (let i = 0; i < captions.length; i++) {
      const c = captions[i];
      lines.push(`${i + 1}`);
      lines.push(`${vttTime(c.start)} --> ${vttTime(c.end)}`);
      lines.push(c.text);
      lines.push("");
    }
    return lines.join("\n");
  }, [captions]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (captions) {
      const vtt = buildVttContent();
      const blob = new Blob([vtt], { type: "text/vtt" });
      if (prevVttUrlRef.current) URL.revokeObjectURL(prevVttUrlRef.current);
      const newUrl = URL.createObjectURL(blob);
      prevVttUrlRef.current = newUrl;
      setVttUrl(newUrl);
    } else if (prevVttUrlRef.current) {
      URL.revokeObjectURL(prevVttUrlRef.current);
      prevVttUrlRef.current = null;
      setVttUrl(null);
    }
  }, [captions, buildVttContent]);

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

  const handleUpdateCaption = useCallback((i: number, text: string) => {
    setCaptions((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[i] = { ...next[i], text };
      return next;
    });
  }, []);

  const handleRemoveCaption = useCallback((i: number) => {
    setCaptions((prev) => {
      if (!prev) return prev;
      return prev.filter((_, idx) => idx !== i);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (prevVttUrlRef.current) URL.revokeObjectURL(prevVttUrlRef.current);
    };
  }, [videoUrl]);

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
        {fileName && <span className={styles.ghMeta} style={{ marginLeft: 12 }}>{fileName}</span>}
      </div>

      <div className={styles.field}>
        <TextField
          label="Context (optional)"
          placeholder="e.g. Demonstrating how to submit an assignment in Canvas"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          size="small"
          fullWidth
        />
      </div>

      {videoUrl && (
        <video
          ref={videoRef}
          controls
          src={videoUrl}
          style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 12, background: "#0f172a" }}
        >
          {vttUrl && (
            <track kind="subtitles" src={vttUrl} srcLang="en" label="AI captions" default />
          )}
        </video>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
            {captions.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
                <span className={styles.ghMetaMono} style={{ flexShrink: 0 }}>
                  {fmtTime(c.start)}-{fmtTime(c.end)}
                </span>
                <TextField
                  size="small"
                  fullWidth
                  value={c.text}
                  onChange={(e) => handleUpdateCaption(i, e.target.value)}
                />
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

          <div className={styles.ghActions} style={{ marginTop: 16, display: "flex", gap: 12 }}>
            <Button variant="contained" size="small" onClick={handleDownloadVtt}>
              Download .vtt
            </Button>
            <Button variant="text" size="small" onClick={handleCopyCaptions}>
              Copy captions
            </Button>
          </div>
        </div>
      )}

      <p className={styles.fieldHint}>
        Burning captions into the video and adding voice narration is coming next; for now the .vtt file loads into Canvas Studio, YouTube, and most players.
      </p>
    </div>
  );
}
