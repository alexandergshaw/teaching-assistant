"use client";

import React from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import styles from "@/app/page.module.css";
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
  setApplyMode,
  setResultName,
  setVideoContext,
  voiceReady,
}: VideoModeSectionProps) {
  return (
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
              disabled={!segments || !Object.keys(segAudio).length || applyBusy}
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
              download={`${(resultName.trim() || "narrated-video")}.webm`}
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
  );
}
