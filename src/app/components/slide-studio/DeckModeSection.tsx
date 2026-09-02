"use client";

import React from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import styles from "@/app/page.module.css";
import controls from "../recording/RecordingControls.module.css";
import { variantFor } from "../ui/buttonVariant";
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
  // CC1: Choose PowerPoint is the primary until a deck is loaded; Draft
  // narration is the primary once a deck exists but has no script yet; once
  // one does, Generate audio / Generate audio + video takes over as the
  // primary and Draft narration steps down to a secondary re-draft action.
  const hasDeck = Boolean(slides);
  const hasScript = Boolean(narrations);

  return (
    <>
      {error && (
        <p className={`${controls.notice} ${controls.noticeDanger}`} role="alert">
          {error}
        </p>
      )}

      <div className={controls.stack}>
        <div className={styles.ghActions}>
          <Button
            variant={variantFor(!hasDeck)}
            size="small"
            onClick={() => document.getElementById("pptx-input")?.click()}
          >
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
          <div className={styles.adaptRow}>
            <TextField
              select
              label="Output"
              value={outputMode}
              onChange={(e) => handleOutputModeChange(e.target.value as "audio" | "av")}
              size="small"
              className={controls.fieldMd}
            >
              <MenuItem value="audio">Audio (my voice)</MenuItem>
              <MenuItem value="av">Audio + video (avatar)</MenuItem>
            </TextField>
          </div>
          <div className={styles.ghActions}>
            <Button
              variant={variantFor(hasDeck && !hasScript)}
              size="small"
              onClick={handleDraftNarration}
              disabled={busy !== "idle"}
              loading={busy === "narrating"}
              loadingPosition="start"
            >
              {busy === "narrating" ? "Writing narration…" : "Draft narration"}
            </Button>
          </div>

          {narrations && (
            <>
              <div className={controls.stack}>
                {narrations.map((n, i) => (
                  <div key={i} className={controls.itemCard}>
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
                      slotProps={{ htmlInput: { "aria-label": `Narration for slide ${n.slide}` } }}
                    />
                    {audioBySlide[n.slide] && (
                      <audio controls src={audioBySlide[n.slide]} className={controls.playerAudio} />
                    )}
                    <div className={styles.ghActions}>
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
                  variant={variantFor(hasScript)}
                  size="small"
                  disabled={outputMode === "av" ? !avatarReady || avatarBusy || !narrations : !voiceReady || genBusy || !narrations}
                  loading={outputMode === "av" ? avatarBusy : genBusy}
                  loadingPosition="start"
                  onClick={() => void (outputMode === "av" ? handleGenerateAvatar() : handleGenerateAudio())}
                >
                  {outputMode === "av" ? (avatarBusy ? avatarStatus ?? "Rendering…" : "Generate audio + video") : (genBusy ? genProgress ?? "Generating…" : "Generate audio")}
                </Button>
                <Button variant="text" size="small" onClick={handleCopyAll}>
                  Copy full script
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={stitchBusy || !narrations || !narrations.some((n) => audioBySlide[n.slide])}
                  loading={stitchBusy}
                  loadingPosition="start"
                  onClick={() => void handleStitch()}
                >
                  {stitchBusy ? stitchProgress ?? "Stitching…" : "Stitch deck video"}
                </Button>
              </div>
              {outputMode === "av" && !avatarReady && (
                <p className={styles.fieldHint}>Avatar video is not configured.</p>
              )}
              {outputMode !== "av" && !voiceReady && (
                <p className={styles.fieldHint}>Pick a voice first.</p>
              )}
              {stitchError && (
                <p className={`${controls.notice} ${controls.noticeDanger}`} role="alert">
                  {stitchError}
                </p>
              )}
              {narrations && !narrations.some((n) => audioBySlide[n.slide]) && (
                <p className={styles.fieldHint}>
                  Generate audio first - stitching combines the slide cards with your narration audio into one video.
                </p>
              )}
              {genError && (
                <p className={`${controls.notice} ${controls.noticeDanger}`} role="alert">
                  {genError}
                </p>
              )}
              {avatarError && (
                <p className={`${controls.notice} ${controls.noticeDanger}`} role="alert">
                  {avatarError}
                </p>
              )}
              <p className={styles.fieldHint}>
                Audio is generated through the app via the ElevenLabs API (set ELEVENLABS_API_KEY, and ELEVENLABS_VOICE_ID once your voice clone exists - until then a stock voice is used). Avatar video needs HEYGEN_API_KEY and HEYGEN_AVATAR_ID (plus HEYGEN_VOICE_ID for your cloned voice). Browser previews use the built-in system voice.
              </p>
              {stitchUrl && (
                <div className={controls.stack}>
                  <video controls src={stitchUrl} className={controls.playerVideo} />
                  <div className={styles.adaptRow}>
                    <TextField
                      label="Video name"
                      size="small"
                      value={stitchName}
                      onChange={(e) => setStitchName(e.target.value)}
                      className={controls.fieldGrow}
                    />
                  </div>
                  <div className={styles.ghActions}>
                    <Button
                      component="a"
                      href={stitchUrl}
                      download={`${(stitchName.trim() || "narrated-deck")}.webm`}
                      variant="outlined"
                      size="small"
                    >
                      Download video
                    </Button>
                    <span className={styles.ghMeta}>Slides without generated audio get a 3-second silent card.</span>
                  </div>
                </div>
              )}
              {avatarUrl && (
                <div className={controls.stack}>
                  <video controls src={avatarUrl} className={controls.playerVideo} />
                  <div className={styles.ghActions}>
                    <Button
                      component="a"
                      href={avatarUrl}
                      target="_blank"
                      rel="noreferrer"
                      variant="outlined"
                      size="small"
                    >
                      Open video
                    </Button>
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
