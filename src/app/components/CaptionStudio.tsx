"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, TextField, FormControlLabel, Checkbox } from "@mui/material";
import { describeScreenRecordingAction, type ScreenCaption } from "../actions";
import { getStoredProvider } from "@/lib/llm-provider";
import { listBackupVideos, readBackupFile, type BackupVideo, type DirHandle } from "@/lib/backup-dir";
import { activeCaptionAt, wrapCaptionLines, captionLayout, ensureFiniteDuration } from "@/lib/caption-burn";
import { saveRecordingFile, extForMime } from "@/lib/recording-files";
import { useSupabase } from "@/context/SupabaseProvider";
import type { Take } from "./RecordingTab";
import styles from "../page.module.css";

// Context the Recording page already knows (script + title cards), persisted
// in localStorage - harvested so captions understand what the video is about.
function gatherRecordingContext(): { text: string; summary: string } {
  if (typeof window === "undefined") return { text: "", summary: "" };
  const get = (k: string) => (localStorage.getItem(k) ?? "").trim();
  const topic = get("ta-rec-script-topic");
  const objectives = get("ta-rec-script-objectives");
  const script = get("ta-rec-script");
  const cardTitle = get("ta-rec-card-title");
  const cardSubtitle = get("ta-rec-card-subtitle");
  const cardClosing = get("ta-rec-card-closing");
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
  if (script) {
    const words = script.split(/\s+/).filter(Boolean).length;
    sections.push(`Lecture script the author wrote for this material (may describe what the video shows):\n${script.slice(0, 1500)}${script.length > 1500 ? "..." : ""}`);
    found.push(`lecture script (${words} words)`);
  }
  return { text: sections.join("\n\n"), summary: found.join(", ") };
}

export default function CaptionStudio({ takes = [], backupDir = null }: { takes?: Take[]; backupDir?: DirHandle | null }) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [context, setContext] = useState("");
  const [usePageContext, setUsePageContext] = useState(true);
  const [pageContextSummary, setPageContextSummary] = useState("");
  const [busy, setBusy] = useState<"idle" | "sampling" | "describing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<ScreenCaption[] | null>(null);
  const [vttUrl, setVttUrl] = useState<string | null>(null);
  const [folderVideos, setFolderVideos] = useState<BackupVideo[] | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [burning, setBurning] = useState(false);
  const [burnProgress, setBurnProgress] = useState(0);
  const [burnError, setBurnError] = useState<string | null>(null);
  const [burned, setBurned] = useState<{ url: string; name: string; mimeType: string } | null>(null);
  const [burnSave, setBurnSave] = useState<"idle" | "saving" | "done" | "failed">("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const prevVttUrlRef = useRef<string | null>(null);
  const burnAbortRef = useRef<(() => void) | null>(null);
  const burnedUrlRef = useRef<string | null>(null);
  const videoUrlRef = useRef<string | null>(null);

  const { supabase, user } = useSupabase();

  const fmtTime = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const adoptVideo = useCallback((blob: Blob, name: string) => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const url = URL.createObjectURL(blob);
    setVideoUrl(url);
    setFileName(name);
    setCaptions(null);
    setError(null);
    setImportError(null);
  }, [videoUrl]);

  const vttTime = (sec: number): string => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
  };

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setPageContextSummary(gatherRecordingContext().summary);
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
      setCaptions(r.captions);
    } catch (err) {
      setBusy("idle");
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  }, [videoUrl, context, usePageContext, extractFrames]);

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

  const handleBurnCaptions = useCallback(async () => {
    if (!videoUrl || !captions || captions.length === 0 || burning) return;

    setBurnError(null);
    if (burned) {
      if (burned.url) URL.revokeObjectURL(burned.url);
      setBurned(null);
    }
    setBurning(true);
    setBurnProgress(0);
    setBurnSave("idle");

    let audioContext: AudioContext | null = null;
    let cancelled = false;

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

      let audioTracks: MediaStreamTrack[] = [];
      try {
        audioContext = new AudioContext();
        const src = audioContext.createMediaElementSource(v);
        const dest = audioContext.createMediaStreamDestination();
        src.connect(dest);
        audioTracks = dest.stream.getAudioTracks();
      } catch {
        audioTracks = [];
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
            .then(() => setBurnSave("done"))
            .catch((err) => {
              console.error("Save failed:", err);
              setBurnSave("failed");
            });
        }
      };

      recorder.start(1000);

      let rafId: number | null = null;
      let lastReportedProgress = 0;

      const drawLoop = () => {
        if (cancelled || v.ended) {
          if (rafId !== null) cancelAnimationFrame(rafId);
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

          let baselineY = canvas.height - layout.bottomMargin - layout.padY;

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

        rafId = requestAnimationFrame(drawLoop);
      };

      burnAbortRef.current = () => {
        cancelled = true;
        if (rafId !== null) cancelAnimationFrame(rafId);
        v.pause();
        v.removeAttribute("src");
        if (recorder.state !== "inactive") recorder.stop();
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
      drawLoop();
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
        burnAbortRef.current = null;
      }
      setBurnError(err instanceof Error ? err.message : "An error occurred");
      setBurning(false);
    }
  }, [videoUrl, captions, burning, burned, fileName, user, supabase]);

  useEffect(() => {
    return () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
      if (prevVttUrlRef.current) URL.revokeObjectURL(prevVttUrlRef.current);
      if (burnedUrlRef.current) URL.revokeObjectURL(burnedUrlRef.current);
      burnAbortRef.current?.();
    };
  }, []);

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

      {importError && <p className={styles.error}>{importError}</p>}

      {(takes.length > 0 || backupDir) && (
        <div className={styles.field}>
          <p className={styles.fieldHint} style={{ margin: 0 }}>Or import a video you have already saved:</p>

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
        <video
          key={videoUrl}
          ref={videoRef}
          controls
          playsInline
          preload="auto"
          src={videoUrl}
          style={{ maxWidth: "100%", maxHeight: 320, borderRadius: 12, background: "#0f172a" }}
          onError={() => setError("The browser could not decode this video. Try re-importing it, or convert it to MP4/WebM.")}
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

          <div className={styles.ghActions} style={{ marginTop: 12, alignItems: "center", flexWrap: "wrap", gap: 12 }}>
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
              <div className={styles.ghActions}>
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
