"use client";

import { Button } from "@mui/material";
import styles from "@/app/page.module.css";
import { useDeckMode } from "./useDeckMode";
import { useVideoMode } from "./useVideoMode";
import { useVoiceCloning } from "./useVoiceCloning";
import { DeckModeSection } from "./DeckModeSection";
import { VideoModeSection } from "./VideoModeSection";
import { VoiceRecordingSection } from "./VoiceRecordingSection";
import { VoiceCloneSection } from "./VoiceCloneSection";
import { StockVoiceSection } from "./StockVoiceSection";

export default function SlideStudio() {
  const deckMode = useDeckMode();
  const videoMode = useVideoMode(deckMode.voiceReady);
  const voiceCloning = useVoiceCloning();

  const { mode, setMode, busy } = deckMode;

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>Narrate a PowerPoint</h2>
        <p className={styles.adaptPanelSubtitle}>
          Upload a deck, let AI draft what you would say on each slide, then generate audio - or audio and video - of the walkthrough.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <Button
            variant={mode === "deck" ? "contained" : "outlined"}
            size="small"
            onClick={() => setMode("deck")}
          >
            Narrate a deck
          </Button>
          <Button
            variant={mode === "video" ? "contained" : "outlined"}
            size="small"
            onClick={() => setMode("video")}
          >
            Narrate a video
          </Button>
        </div>
      </div>

      {mode === "deck" && (
        <DeckModeSection {...deckMode} />
      )}

      {mode === "video" && (
        <VideoModeSection {...videoMode} voiceReady={deckMode.voiceReady} />
      )}

      <VoiceRecordingSection voiceCloning={voiceCloning} voiceReady={deckMode.voiceReady} />

      <VoiceCloneSection voiceCloning={voiceCloning} voiceReady={deckMode.voiceReady} />

      <StockVoiceSection voiceCloning={voiceCloning} voiceReady={deckMode.voiceReady} />

      {busy === "extracting" && <p className={styles.ghMeta}>Reading deck...</p>}
    </div>
  );
}
