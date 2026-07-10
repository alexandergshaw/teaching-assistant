"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import { extractPptxSlidesAction, generateSlideNarrationAction, voiceConfiguredAction, synthesizeNarrationAction, createVoiceCloneAction, avatarConfiguredAction, generateAvatarVideoAction, getAvatarVideoStatusAction, type SlideNarration } from "../actions";
import { getStoredProvider } from "@/lib/llm-provider";
import styles from "../page.module.css";

type BusyState = "idle" | "extracting" | "narrating";

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
  const cancelledRef = useRef(false);
  const avatarPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cloneFileRef = useRef<HTMLInputElement>(null);
  const [stitchBusy, setStitchBusy] = useState(false);
  const [stitchProgress, setStitchProgress] = useState<string | null>(null);
  const [stitchError, setStitchError] = useState<string | null>(null);
  const [stitchUrl, setStitchUrl] = useState<string | null>(null);
  const stitchCancelRef = useRef(false);
  const stitchUrlRef = useRef<string | null>(null);

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

  // Persist form state to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-slides-file-name", fileName);
  }, [fileName]);

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
      </div>

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
                  <div className={styles.ghActions}>
                    <a
                      className={styles.linkButton}
                      href={stitchUrl}
                      download={`${(fileName || "deck").replace(/\.pptx$/i, "")}-narrated.webm`}
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

      <details className={styles.adaptDisclosure} style={{ marginTop: 4 }}>
        <summary>My voice clone</summary>
        <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
          {cloneVoiceId ? (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              Using your cloned voice (id <span className={styles.ghMeta}>{cloneVoiceId}</span>) for audio generation.{" "}
              <button type="button" className={styles.linkButton} onClick={() => { setCloneVoiceId(""); if (typeof window !== "undefined") localStorage.removeItem("ta-voice-id"); setCloneNote(null); }}>Stop using it</button>
            </p>
          ) : (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              Record one to three minutes of clean speech (the recorder above works - download a take), then create your clone. Audio generation switches to your voice automatically.
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
