"use client";

import { useCallback, useState } from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import { extractPptxSlidesAction, generateSlideNarrationAction, type SlideNarration } from "../actions";
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
                    <Button
                      variant="text"
                      size="small"
                      onClick={() => handlePreviewVoice(n.narration)}
                      style={{ marginTop: 6 }}
                    >
                      Preview
                    </Button>
                  </div>
                ))}
              </div>

              <div className={styles.ghActions}>
                <Button
                  variant="contained"
                  size="small"
                  disabled
                  title="Requires the in-house voice sidecar"
                >
                  {outputMode === "av" ? "Generate audio + video" : "Generate audio"}
                </Button>
                <Button variant="text" size="small" onClick={handleCopyAll}>
                  Copy full script
                </Button>
              </div>
              <p className={styles.fieldHint}>
                Generation uses your in-house voice (and avatar) models on a self-hosted GPU service. That service is not configured yet - set VOICE_SIDECAR_URL once it is running. Voice previews above use the browser&apos;s built-in voice as a placeholder. Nothing is ever sent to external voice or avatar providers.
              </p>
            </>
          )}
        </>
      )}

      {busy === "extracting" && <p className={styles.ghMeta}>Reading deck...</p>}
    </div>
  );
}
