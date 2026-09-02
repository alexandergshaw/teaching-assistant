"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import styles from "@/app/page.module.css";
import controls from "../recording/RecordingControls.module.css";
import ConfirmArmButtons from "../ui/ConfirmArmButtons";
import { VOICE_SAMPLE_SCRIPT } from "./constants";
import { writeClipboardText } from "../ui/clipboard";
import { visuallyHidden } from "../ui/visuallyHidden";
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

  // CC5: Discard sample is a destructive, standalone control (not mid-
  // sentence), so it adopts the shared arm/confirm component rather than the
  // in-sentence .linkButton spelling VoiceCloneSection uses.
  const [discardArmed, setDiscardArmed] = useState(false);
  const discardConsequenceId = "voice-sample-discard-consequence";

  // CC14: writeClipboardText throws under the same guard every clipboard
  // call in this app already treats as failure (no navigator.clipboard, or a
  // non-secure origin). Success is announced for assistive tech the same way
  // the click itself is silent for sighted users; failure gets a visible
  // .fieldHint line so the instructor is not left guessing why nothing
  // happened. The reset timer is held in a ref and cleared on unmount so it
  // never fires a setState after the component is gone.
  const [sampleCopied, setSampleCopied] = useState(false);
  const [sampleCopyFailed, setSampleCopyFailed] = useState(false);
  const sampleCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (sampleCopyTimerRef.current) clearTimeout(sampleCopyTimerRef.current);
    };
  }, []);
  const handleCopySampleText = () => {
    void (async () => {
      try {
        await writeClipboardText(VOICE_SAMPLE_SCRIPT);
        setSampleCopied(true);
        setSampleCopyFailed(false);
        if (sampleCopyTimerRef.current) clearTimeout(sampleCopyTimerRef.current);
        sampleCopyTimerRef.current = setTimeout(() => setSampleCopied(false), 1500);
      } catch {
        setSampleCopyFailed(true);
      }
    })();
  };

  return (
    <details className={styles.adaptDisclosure}>
      <summary>Record a voice sample</summary>
      <div className={styles.adaptDisclosureBody}>
        <fieldset className={controls.section}>
          <legend className={controls.sectionLegend}>Read</legend>
          <p className={styles.fieldHint}>Quiet room, mic at a constant distance, natural teaching pace - about 90 seconds.</p>
          <div
            style={{
              padding: "var(--space-3) var(--space-4)",
              borderRadius: "var(--radius-md)",
              backgroundColor: "color-mix(in srgb, var(--field-border) 18%, transparent)",
              whiteSpace: "pre-wrap",
              lineHeight: 1.6,
              fontSize: "var(--font-size-lg)",
            }}
          >
            {VOICE_SAMPLE_SCRIPT}
          </div>
          <Button variant="text" size="small" onClick={handleCopySampleText}>
            Copy text
          </Button>
          {sampleCopied && (
            <span role="status" style={visuallyHidden}>
              Copied the sample text
            </span>
          )}
          {sampleCopyFailed && (
            <p className={styles.fieldHint}>
              Could not copy - select the text and copy it by hand.
            </p>
          )}
        </fieldset>

        <fieldset className={controls.section}>
          <legend className={controls.sectionLegend}>Record</legend>
          <TextField
            select
            label="Microphone"
            value={sampleMicId}
            onChange={(e) => setSampleMicId(e.target.value)}
            size="small"
            className={controls.fieldMd}
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
          {sampleRecState === "idle" ? (
            <Button
              variant="outlined"
              size="small"
              onClick={() => void handleStartRecording()}
              disabled={!voiceReady}
            >
              Start recording
            </Button>
          ) : (
            <div className={styles.ghActions}>
              <span className={controls.recIndicator}>Recording</span>
              <span className={styles.ghMeta}>
                {Math.floor(sampleElapsed / 60)}:{String(sampleElapsed % 60).padStart(2, "0")}
              </span>
              <Button variant="outlined" size="small" onClick={handleStopRecording}>
                Stop recording
              </Button>
            </div>
          )}
          {sampleUrl && (
            <>
              <audio controls src={sampleUrl} className={controls.playerAudio} />
              <ConfirmArmButtons
                armed={discardArmed}
                idleLabel="Discard sample"
                confirmLabel="Confirm discard"
                tone="danger"
                idleVariant="text"
                onArm={() => setDiscardArmed(true)}
                onConfirm={() => {
                  handleDiscardSample();
                  setDiscardArmed(false);
                }}
                onCancel={() => setDiscardArmed(false)}
                consequenceId={discardConsequenceId}
              />
              {discardArmed && (
                <p id={discardConsequenceId} role="status" aria-live="polite" className={controls.consequence}>
                  This deletes the recorded sample - you will need to record it again.
                </p>
              )}
              {sampleSaved === "done" && <span className={styles.ghMeta}>Saved to the Files tab</span>}
              {sampleSaved === "failed" && <span className={styles.ghMeta}>Library save failed</span>}
            </>
          )}
        </fieldset>

        {sampleBlob && (
          <fieldset className={controls.section}>
            <legend className={controls.sectionLegend}>Create the clone</legend>
            {/* Field and button are split into their own rows (CC3: a row
                holds fields OR buttons, never both; this isn't one of the
                three named fieldRowButton sites). */}
            <div className={styles.adaptRow}>
              <TextField
                size="small"
                label="Voice name"
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                className={controls.fieldGrow}
                disabled={cloneBusy || !voiceReady}
              />
            </div>
            <div className={styles.ghActions}>
              <Button
                variant="outlined"
                size="small"
                disabled={!sampleBlob || cloneBusy || !cloneName.trim() || !voiceReady}
                loading={cloneBusy}
                loadingPosition="start"
                onClick={() => void handleCreateCloneFromSample()}
              >
                {cloneBusy ? "Creating…" : "Create voice clone"}
              </Button>
            </div>
            {!voiceReady && <p className={styles.fieldHint}>Requires ELEVENLABS_API_KEY.</p>}
            {cloneError && (
              <p className={`${controls.notice} ${controls.noticeDanger}`} role="alert">
                {cloneError}
              </p>
            )}
            {cloneNote && <p className={styles.fieldHint}>{cloneNote}</p>}
          </fieldset>
        )}
      </div>
    </details>
  );
}
