"use client";

import React from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import styles from "@/app/page.module.css";
import type { UseDeckModeReturn } from "./useDeckMode";

interface DeckModeSectionProps extends UseDeckModeReturn {
  voiceReady: boolean;
}

export function DeckModeSection({
  fileName,
  slides,
  narrations,
  outputMode,
  busy,
  error,
  voiceReady,
  avatarReady,
  avatarBusy,
  avatarStatus,
  avatarUrl,
  avatarError,
  audioBySlide,
  genBusy,
  genProgress,
  genError,
  stitchBusy,
  stitchProgress,
  stitchError,
  stitchUrl,
  stitchName,
  handleFileSelect,
  handleOutputModeChange,
  handleDraftNarration,
  handleNarrationChange,
  handlePreviewVoice,
  handleCopyAll,
  handleGenerateAudio,
  handleGenerateAvatar,
  handleStitch,
  setStitchName,
}: DeckModeSectionProps) {
  return (
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
  );
}
