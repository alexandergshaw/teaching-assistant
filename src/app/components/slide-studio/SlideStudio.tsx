"use client";

import styles from "@/app/page.module.css";
import controls from "../recording/RecordingControls.module.css";
import SegmentedToggle from "../ui/SegmentedToggle";
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
        <SegmentedToggle
          label="Narration mode"
          options={[
            { value: "deck", label: "Narrate a deck" },
            { value: "video", label: "Narrate a video" },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>

      {busy === "extracting" && (
        <p role="status" aria-live="polite" className={controls.loadingLine}>
          <span className={styles.spinner} aria-hidden="true" />
          Reading deck…
        </p>
      )}

      {mode === "deck" && (
        <DeckModeSection {...deckMode} />
      )}

      {mode === "video" && (
        <VideoModeSection {...videoMode} voiceReady={deckMode.voiceReady} />
      )}

      <VoiceRecordingSection voiceCloning={voiceCloning} voiceReady={deckMode.voiceReady} />

      <VoiceCloneSection voiceCloning={voiceCloning} voiceReady={deckMode.voiceReady} />

      <StockVoiceSection voiceCloning={voiceCloning} voiceReady={deckMode.voiceReady} />
    </div>
  );
}
