"use client";

import React, { useRef, useState } from "react";
import { Button, TextField } from "@mui/material";
import styles from "@/app/page.module.css";
import controls from "../recording/RecordingControls.module.css";
import { clearVoiceId } from "@/lib/voice-id";
import type { UseVoiceCloningReturn } from "./useVoiceCloning";

interface VoiceCloneSectionProps {
  voiceCloning: UseVoiceCloningReturn;
  voiceReady: boolean;
}

export function VoiceCloneSection({
  voiceCloning,
  voiceReady,
}: VoiceCloneSectionProps) {
  const {
    cloneVoiceId,
    cloneName,
    cloneBusy,
    cloneError,
    cloneNote,
    cloneFileRef,
    setCloneVoiceId,
    setCloneName,
    handleCreateClone,
  } = voiceCloning;

  // CC5: "Stop using it" is a destructive-ish overwrite (drops the active
  // clone), but it lives mid-sentence, and R5 forbids a MUI button there -
  // so it stays a .linkButton arm/confirm pair rather than adopting
  // ConfirmArmButtons (which renders MUI Buttons).
  const [stopArmed, setStopArmed] = useState(false);
  const stopButtonRef = useRef<HTMLButtonElement>(null);
  const stopConsequenceId = "voice-clone-stop-consequence";

  const cancelStop = () => {
    setStopArmed(false);
    stopButtonRef.current?.focus();
  };

  const confirmStop = () => {
    setCloneVoiceId("");
    clearVoiceId();
    setStopArmed(false);
  };

  return (
    <details className={styles.adaptDisclosure}>
      <summary>My voice clone</summary>
      <div className={`${styles.adaptDisclosureBody} ${controls.stack}`}>
        {cloneVoiceId ? (
          <p className={styles.fieldHint}>
            Using your cloned voice (id <span className={styles.ghMeta}>{cloneVoiceId}</span>) for audio generation.{" "}
            {stopArmed ? (
              <>
                <button
                  type="button"
                  className={styles.linkButton}
                  aria-describedby={stopConsequenceId}
                  onClick={confirmStop}
                >
                  Confirm stop using it
                </button>{" "}
                <button type="button" className={styles.linkButton} onClick={cancelStop}>
                  Cancel
                </button>
              </>
            ) : (
              <button ref={stopButtonRef} type="button" className={styles.linkButton} onClick={() => setStopArmed(true)}>
                Stop using it
              </button>
            )}
          </p>
        ) : (
          <p className={styles.fieldHint}>
            Or upload existing audio files:
          </p>
        )}
        {stopArmed && (
          <p id={stopConsequenceId} role="status" aria-live="polite" className={controls.consequence}>
            This stops using your cloned voice for new audio - you can pick it again later.
          </p>
        )}
        {/* Field and button are split into their own rows (CC3: a row holds
            fields OR buttons, never both; this isn't one of the three named
            fieldRowButton sites). */}
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
            disabled={cloneBusy || !voiceReady || !cloneName.trim()}
            loading={cloneBusy}
            loadingPosition="start"
            onClick={() => cloneFileRef.current?.click()}
          >
            {cloneBusy ? "Creating…" : "Upload samples and create"}
          </Button>
          <input ref={cloneFileRef} type="file" accept="audio/*,video/webm,video/mp4" multiple style={{ display: "none" }} onChange={(e) => { void handleCreateClone(e.target.files); e.target.value = ""; }} />
        </div>
        {!voiceReady && <p className={styles.fieldHint}>Requires ELEVENLABS_API_KEY.</p>}
        {cloneError && (
          <p className={`${controls.notice} ${controls.noticeDanger}`} role="alert">
            {cloneError}
          </p>
        )}
        {cloneNote && <p className={styles.fieldHint}>{cloneNote}</p>}
      </div>
    </details>
  );
}
