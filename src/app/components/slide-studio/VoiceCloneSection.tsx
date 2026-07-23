"use client";

import React from "react";
import { Button, TextField } from "@mui/material";
import styles from "@/app/page.module.css";
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

  return (
    <details className={styles.adaptDisclosure} style={{ marginTop: 16 }}>
      <summary>My voice clone</summary>
      <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
        {cloneVoiceId ? (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            Using your cloned voice (id <span className={styles.ghMeta}>{cloneVoiceId}</span>) for audio generation.{" "}
            <button type="button" className={styles.linkButton} onClick={() => { setCloneVoiceId(""); clearVoiceId(); }}>Stop using it</button>
          </p>
        ) : (
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            Or upload existing audio files:
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
  );
}
