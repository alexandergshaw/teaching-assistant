"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import { extractPptxSlidesAction, generateSlideNarrationAction, voiceConfiguredAction, synthesizeNarrationAction, avatarConfiguredAction, generateAvatarVideoAction, getAvatarVideoStatusAction, type SlideNarration } from "../actions";
import { getStoredProvider } from "@/lib/llm-provider";
import styles from "../page.module.css";

type BusyState = "idle" | "extracting" | "narrating";

export default function SlideStudio() {
  const [fileName, setFileName] = useState<string>("");
  const [slides, setSlides] = useState<Array<{ slide: number; title: string; text: string }> | null>(null);
  const [narrations, setNarrations] = useState<SlideNarration[] | null>(null);
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
  const cancelledRef = useRef(false);
  const avatarPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      const r = await synthesizeNarrationAction(n.narration);
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
              </div>
              {genError && <p className={styles.error}>{genError}</p>}
              {avatarError && <p className={styles.error}>{avatarError}</p>}
              <p className={styles.fieldHint}>
                Audio is generated through the app via the ElevenLabs API (set ELEVENLABS_API_KEY, and ELEVENLABS_VOICE_ID once your voice clone exists - until then a stock voice is used). Avatar video needs HEYGEN_API_KEY and HEYGEN_AVATAR_ID (plus HEYGEN_VOICE_ID for your cloned voice). Browser previews use the built-in system voice.
              </p>
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

      {busy === "extracting" && <p className={styles.ghMeta}>Reading deck...</p>}
    </div>
  );
}
