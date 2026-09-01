"use client";

import React from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import styles from "@/app/page.module.css";
import { VOICE_SAMPLE_SCRIPT } from "./constants";
import type { UseVoiceCloningReturn } from "./useVoiceCloning";

interface VoiceRecordingSectionProps {
  voiceCloning: UseVoiceCloningReturn;
  voiceReady: boolean;
}

export function VoiceRecordingSection({
  voiceCloning,
  voiceReady,
}: VoiceRecordingSectionProps) {
  const {
    sampleRecState,
    sampleUrl,
    sampleBlob,
    sampleElapsed,
    sampleMics,
    sampleMicId,
    sampleSaved,
    cloneName,
    cloneBusy,
    cloneError,
    cloneNote,
    setSampleMicId,
    handleStartRecording,
    handleStopRecording,
    handleDiscardSample,
    handleCreateCloneFromSample,
    setCloneName,
  } = voiceCloning;

  return (
    <details className={styles.adaptDisclosure} style={{ marginTop: "var(--space-4)" }}>
      <summary>Record a voice sample</summary>
      <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div>
            <h4 style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, margin: "0 0 var(--space-2) 0" }}>1. Read</h4>
            <p className={styles.fieldHint} style={{ margin: "0 0 var(--space-2) 0" }}>Quiet room, mic at a constant distance, natural teaching pace - about 90 seconds.</p>
            <div
              style={{
                padding: "var(--space-3) var(--space-4)",
                borderRadius: "var(--radius-md)",
                backgroundColor: "color-mix(in srgb, var(--field-border) 18%, transparent)",
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
                fontSize: "var(--font-size-lg)",
                marginBottom: "var(--space-2)",
              }}
            >
              {VOICE_SAMPLE_SCRIPT}
            </div>
            <Button
              variant="text"
              size="small"
              onClick={() => {
                navigator.clipboard.writeText(VOICE_SAMPLE_SCRIPT);
              }}
            >
              Copy text
            </Button>
          </div>

          <div>
            <h4 style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, margin: "0 0 var(--space-2) 0" }}>2. Record</h4>
            <div style={{ marginBottom: "var(--space-2)" }}>
              <TextField
                select
                label="Microphone"
                value={sampleMicId}
                onChange={(e) => setSampleMicId(e.target.value)}
                size="small"
                sx={{ minWidth: 220 }}
                disabled={sampleRecState === "recording"}
              >
                <MenuItem value="">Default microphone</MenuItem>
                {sampleMics.map((mic) => (
                  <MenuItem key={mic.deviceId} value={mic.deviceId}>
                    {mic.label}
                  </MenuItem>
                ))}
                {sampleMicId && !sampleMics.some((d) => d.deviceId === sampleMicId) && (
                  <MenuItem value={sampleMicId}>Previous microphone (reconnect or reselect)</MenuItem>
                )}
              </TextField>
            </div>
            {sampleRecState === "idle" ? (
              <Button
                variant="contained"
                size="small"
                onClick={() => void handleStartRecording()}
                disabled={!voiceReady}
              >
                Start recording
              </Button>
            ) : (
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", marginBottom: "var(--space-2)" }}>
                <div style={{ display: "flex", gap: "var(--space-1)", alignItems: "center" }}>
                  <span className={styles.navBadge}>REC</span>
                  <span className={styles.ghMeta}>
                    {Math.floor(sampleElapsed / 60)}:{String(sampleElapsed % 60).padStart(2, "0")}
                  </span>
                </div>
                <Button variant="outlined" size="small" onClick={handleStopRecording}>
                  Stop recording
                </Button>
              </div>
            )}
            {sampleUrl && (
              <>
                <audio controls src={sampleUrl} style={{ width: "100%", marginBottom: "var(--space-2)" }} />
                <Button variant="text" size="small" onClick={handleDiscardSample}>
                  Discard
                </Button>
                {sampleSaved === "done" && <span className={styles.ghMeta}>Saved to the Files tab</span>}
                {sampleSaved === "failed" && <span className={styles.ghMeta}>Library save failed</span>}
              </>
            )}
          </div>

          {sampleBlob && (
            <div>
              <h4 style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, margin: "0 0 var(--space-2) 0" }}>3. Create the clone</h4>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", marginBottom: "var(--space-2)" }}>
                <TextField
                  size="small"
                  label="Voice name"
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  sx={{ flex: "1 1 180px" }}
                  disabled={cloneBusy || !voiceReady}
                />
                <Button
                  variant="contained"
                  size="small"
                  disabled={!sampleBlob || cloneBusy || !cloneName.trim() || !voiceReady}
                  onClick={() => void handleCreateCloneFromSample()}
                >
                  {cloneBusy ? "Creating…" : "Create voice clone"}
                </Button>
              </div>
              {!voiceReady && <p className={styles.fieldHint} style={{ margin: 0 }}>Requires ELEVENLABS_API_KEY.</p>}
              {cloneError && <p className={styles.error}>{cloneError}</p>}
              {cloneNote && <p className={styles.fieldHint}>{cloneNote}</p>}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
