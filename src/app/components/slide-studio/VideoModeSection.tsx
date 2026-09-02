"use client";

import React from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import styles from "@/app/page.module.css";
import controls from "../recording/RecordingControls.module.css";
import { variantFor } from "../ui/buttonVariant";
import { removeSegmentAudio } from "./videoModeAudioFold";
import type { UseVideoModeReturn } from "./useVideoMode";

interface VideoModeSectionProps extends Omit<UseVideoModeReturn, "voiceReady" | "supabase" | "user"> {
  voiceReady: boolean;
}

export function VideoModeSection({
  vidUrl,
  vidName,
  segments,
  segAudio,
  genBusyV,
  genErrorV,
  voBusyV,
  applyBusy,
  applyPct,
  applyError,
  result,
  resultSave,
  applyMode,
  resultName,
  videoContext,
  handleVideoFileSelect,
  handleBrowseLibrary,
  handleGenerateNarration,
  handleSegmentChange,
  handleSynthesizeOne,
  handleGenerateAllVoices,
  handleApplyNarration,
  setSegAudio,
  setApplyMode,
  setResultName,
  setVideoContext,
  voiceReady,
}: VideoModeSectionProps) {
  // CC1: Choose video is the primary until a video is loaded. Generate
  // narration is the primary until segments exist; once they do, Apply
  // narration to video takes over.
  const hasVideo = Boolean(vidUrl);
  const hasSegments = Boolean(segments);

  return (
    <>
      {applyError && (
        <p className={`${controls.notice} ${controls.noticeDanger}`} role="alert">
          {applyError}
        </p>
      )}
      {genErrorV && (
        <p className={`${controls.notice} ${controls.noticeDanger}`} role="alert">
          {genErrorV}
        </p>
      )}

      <div className={controls.stack}>
        <div className={styles.ghActions}>
          <Button
            variant={variantFor(!hasVideo)}
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
        <div className={controls.stack}>
          <video controls playsInline src={vidUrl} className={controls.playerVideo} />
        </div>
      )}

      <div className={controls.stack}>
        <TextField
          label="Context (optional)"
          value={videoContext}
          onChange={(e) => setVideoContext(e.target.value)}
          size="small"
          fullWidth
          multiline
          minRows={2}
        />
      </div>
      <div className={styles.ghActions}>
        <Button
          variant={variantFor(!hasSegments)}
          size="small"
          disabled={!vidUrl || genBusyV}
          loading={genBusyV}
          loadingPosition="start"
          onClick={() => void handleGenerateNarration()}
        >
          {genBusyV ? "Generating narration…" : "Generate narration"}
        </Button>
      </div>

      {segments && (
        <>
          <div className={controls.stack}>
            {segments.map((seg, i) => (
              <div key={i} className={controls.itemCard}>
                <div className={styles.adaptRow}>
                  <TextField
                    label="Start (s)"
                    type="number"
                    value={seg.start}
                    onChange={(e) => handleSegmentChange(i, "start", parseFloat(e.target.value) || 0)}
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                    className={controls.fieldSm}
                  />
                  <TextField
                    label="End (s)"
                    type="number"
                    value={seg.end}
                    onChange={(e) => handleSegmentChange(i, "end", parseFloat(e.target.value) || 0)}
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                    className={controls.fieldSm}
                  />
                </div>
                <TextField
                  size="small"
                  fullWidth
                  multiline
                  minRows={2}
                  value={seg.text}
                  onChange={(e) => handleSegmentChange(i, "text", e.target.value)}
                  slotProps={{ htmlInput: { "aria-label": `Narration for segment ${i + 1}` } }}
                />
                {segAudio[i] && (
                  <audio controls src={segAudio[i].url} className={controls.playerAudio} />
                )}
                <div className={styles.ghActions}>
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
                        const removed = segAudio[i];
                        setSegAudio(removeSegmentAudio(segAudio, i));
                        if (removed) URL.revokeObjectURL(removed.url);
                      }}
                    >
                      Remove audio
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <Button
            variant="outlined"
            size="small"
            disabled={voBusyV !== null || !segments.some((s) => s.text.trim())}
            loading={voBusyV === "all"}
            loadingPosition="start"
            onClick={() => void handleGenerateAllVoices()}
          >
            {voBusyV === "all" ? "Generating voices…" : "Generate all voices"}
          </Button>
          {!voiceReady && (
            <p className={styles.fieldHint}>
              Requires ELEVENLABS_API_KEY.
            </p>
          )}
        </>
      )}

      {segments && (
        <>
          <div className={styles.adaptRow}>
            <TextField
              select
              label="Audio mode"
              value={applyMode}
              onChange={(e) => setApplyMode(e.target.value as "replace" | "mix")}
              size="small"
              className={controls.fieldMd}
            >
              <MenuItem value="replace">Replace original audio</MenuItem>
              <MenuItem value="mix">Mix with original audio</MenuItem>
            </TextField>
          </div>
          <div className={styles.ghActions}>
            <Button
              variant={variantFor(hasSegments)}
              size="small"
              disabled={!segments || !Object.keys(segAudio).length || applyBusy}
              loading={applyBusy}
              loadingPosition="start"
              onClick={() => void handleApplyNarration()}
            >
              {applyBusy ? `Applying… ${applyPct}%` : "Apply narration to video"}
            </Button>
          </div>
        </>
      )}

      {result && (
        <div className={controls.stack}>
          <video controls src={result.url} className={controls.playerVideo} />
          <div className={styles.adaptRow}>
            <TextField
              label="Video name"
              size="small"
              value={resultName}
              onChange={(e) => setResultName(e.target.value)}
              className={controls.fieldGrow}
            />
          </div>
          <div className={styles.ghActions}>
            <Button
              component="a"
              href={result.url}
              download={`${(resultName.trim() || "narrated-video")}.webm`}
              variant="outlined"
              size="small"
            >
              Download video
            </Button>
            <span className={styles.ghMeta}>
              {resultSave === "saving" && "Saving to library…"}
              {resultSave === "done" && "In library - see the Files tab"}
              {resultSave === "failed" && "Library save failed"}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
