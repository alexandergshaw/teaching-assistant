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
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span aria-hidden className={styles.liveRecordingDot} />
          {/* Reported exception to the weight rule (700 only for h1/h2 and
              the tracked-uppercase label idiom): this is the persistent,
              unmistakable recording indicator (U3) - the file's own header
              comment records that the user explicitly required it stay
              obvious without scrolling, with no consent gate softening it.
              It is tracked-uppercase but is a live status alarm, not a panel
              title/table header/section label, so AM5's micro-label spec
              (2xs / text-secondary) does not fit either - shrinking and
              muting it to that idiom would directly undercut the one
              requirement this control exists to satisfy. Kept at weight 700
              rather than silently weakened. */}
          <span style={{ fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.02em" }}>
            RECORDING &amp; TRANSCRIBING LIVE
          </span>
        </div>
        {/* Elapsed-time readout in tabular figures so the digits do not
            jitter; fontWeight 600 (not 700 - reserved for h1/h2 and the
            label idiom, and this is neither). */}
        <span
          className={styles.ghMetaMono}
          style={{ fontSize: "var(--font-size-2xl)", fontWeight: 600, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}
        >
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
