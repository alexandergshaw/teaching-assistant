"use client";

// The persistent, unmistakable recording indicator (U3). The user explicitly
// decided this feature ships with a PERSISTENT VISIBLE indicator while active
// and NO consent-acknowledgement gate - it must stay obvious, without
// scrolling, for as long as the room is being transcribed.

import { Button } from "@mui/material";
import styles from "../../page.module.css";
import type { TranscriptionPath } from "./types";

function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

const PATH_LABELS: Record<TranscriptionPath, string> = {
  "web-speech": "Web Speech (live)",
  segmented: "Audio-segment fallback (~15s clips)",
  none: "Not transcribing",
};

interface LiveStatusBarProps {
  courseName: string;
  moduleName: string;
  elapsedSeconds: number;
  activePath: TranscriptionPath;
  pendingAnswerCount: number;
  ending: boolean;
  onStop: () => void;
  recentWarning: string | null;
}

export default function LiveStatusBar({
  courseName,
  moduleName,
  elapsedSeconds,
  activePath,
  pendingAnswerCount,
  ending,
  onStop,
  recentWarning,
}: LiveStatusBarProps) {
  return (
    <div
      className={styles.adaptPanel}
      style={{
        border: "1px solid var(--danger-border)",
        background: "var(--danger-surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden className={styles.liveRecordingDot} />
          <span style={{ fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.02em" }}>
            RECORDING &amp; TRANSCRIBING LIVE
          </span>
        </div>
        <span className={styles.ghMetaMono} style={{ fontSize: "1.3rem", fontWeight: 700, color: "var(--text-primary)" }}>
          {formatElapsed(elapsedSeconds)}
        </span>
        <span className={styles.ghMeta}>
          {courseName}
          {moduleName ? ` - ${moduleName}` : ""}
        </span>
        <span className={styles.ghMeta}>{PATH_LABELS[activePath]}</span>
        {pendingAnswerCount > 0 && <span className={styles.ghMeta}>Answering {pendingAnswerCount} question{pendingAnswerCount === 1 ? "" : "s"}...</span>}
      </div>

      {recentWarning && (
        <p className={styles.fieldHint} style={{ margin: 0, color: "var(--warning-ink)" }}>
          {recentWarning}
        </p>
      )}

      <div className={styles.ghActions}>
        <Button variant="contained" color="error" onClick={onStop} disabled={ending}>
          {ending ? "Ending session..." : "End class"}
        </Button>
      </div>
    </div>
  );
}
