"use client";

import React from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import styles from "@/app/page.module.css";
import controls from "../recording/RecordingControls.module.css";
import type { UseVoiceCloningReturn } from "./useVoiceCloning";

interface StockVoiceSectionProps {
  voiceCloning: UseVoiceCloningReturn;
  voiceReady: boolean;
}

export function StockVoiceSection({
  voiceCloning,
  voiceReady,
}: StockVoiceSectionProps) {
  const {
    stockVoices,
    stockLoading,
    stockSel,
    cloneBusy,
    cloneError,
    setStockSel,
    handleLoadStockVoices,
    handleUseStockVoice,
  } = voiceCloning;

  return (
    <details className={styles.adaptDisclosure}>
      <summary>Use a ready-made voice</summary>
      <div className={`${styles.adaptDisclosureBody} ${controls.stack}`}>
        <p className={styles.fieldHint}>
          No cloning on your plan? Pick a ready-made ElevenLabs voice - captions, video narration, and deck narration all work with it.
        </p>
        {/* CC1: reordered load -> pick -> use (Browse voices, then Voice, then
            Use this voice). Each is its own row: CC3 forbids mixing a field
            and a button in one row, and this isn't one of the three named
            fieldRowButton sites. */}
        {!stockVoices && (
          <div className={styles.ghActions}>
            <Button
              variant="text"
              size="small"
              disabled={stockLoading || !voiceReady}
              loading={stockLoading}
              loadingPosition="start"
              onClick={() => void handleLoadStockVoices()}
            >
              Browse voices
            </Button>
          </div>
        )}
        <div className={styles.adaptRow}>
          <TextField
            select
            label="Voice"
            value={stockSel}
            onChange={(e) => setStockSel(e.target.value)}
            size="small"
            disabled={stockLoading || !voiceReady}
            className={controls.fieldMd}
          >
            {stockVoices && stockVoices.map((v) => (
              <MenuItem key={v.voiceId} value={v.voiceId}>
                {v.name}
                {v.category ? ` (${v.category})` : ""}
              </MenuItem>
            ))}
          </TextField>
        </div>
        <div className={styles.ghActions}>
          <Button
            variant="outlined"
            size="small"
            disabled={!stockSel || stockLoading || cloneBusy || !voiceReady}
            loading={cloneBusy}
            loadingPosition="start"
            onClick={() => void handleUseStockVoice()}
          >
            Use this voice
          </Button>
        </div>
        {!stockVoices && voiceReady && (
          <p className={styles.fieldHint}>Browse voices first - Use this voice stays off until a voice is loaded.</p>
        )}
        {!voiceReady && <p className={styles.fieldHint}>Requires ELEVENLABS_API_KEY.</p>}
        {cloneError && (
          <p className={`${controls.notice} ${controls.noticeDanger}`} role="alert">
            {cloneError}
          </p>
        )}
      </div>
    </details>
  );
}
