"use client";

import React from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import styles from "@/app/page.module.css";
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
    <details className={styles.adaptDisclosure} style={{ marginTop: 16 }}>
      <summary>Use a ready-made voice</summary>
      <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
        <p className={styles.fieldHint}>
          No cloning on your plan? Pick a ready-made ElevenLabs voice - captions, video narration, and deck narration all work with it.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <TextField
            select
            label="Voice"
            value={stockSel}
            onChange={(e) => setStockSel(e.target.value)}
            size="small"
            disabled={stockLoading || !voiceReady}
            sx={{ minWidth: 220 }}
          >
            {stockVoices && stockVoices.map((v) => (
              <MenuItem key={v.voiceId} value={v.voiceId}>
                {v.name}
                {v.category ? ` (${v.category})` : ""}
              </MenuItem>
            ))}
          </TextField>
          <Button
            variant="contained"
            size="small"
            disabled={!stockSel || stockLoading || cloneBusy || !voiceReady}
            onClick={() => void handleUseStockVoice()}
          >
            Use this voice
          </Button>
          {!stockVoices && (
            <Button variant="text" size="small" disabled={stockLoading || !voiceReady} onClick={() => void handleLoadStockVoices()}>
              Browse voices
            </Button>
          )}
        </div>
        {!voiceReady && <p className={styles.fieldHint} style={{ margin: 0 }}>Requires ELEVENLABS_API_KEY.</p>}
        {cloneError && <p className={styles.error}>{cloneError}</p>}
      </div>
    </details>
  );
}
