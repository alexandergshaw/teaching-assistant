"use client";

// Group C's surface (AC16b): a PANE, not a modal - no role="dialog", no
// styles.previewBackdrop, no Escape-to-close. Shown by the caller via
// display:none toggling on `take !== null`, same as every other view in
// RecordingTab's always-mounted stack. Reached only from a take's row
// ("Talk through this", AC15 - the button itself belongs to Agent E) and
// left again with the "Back to takes" control below.

import { useEffect, useRef } from "react";
import { Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import styles from "../../page.module.css";
import { fmt } from "./types";
import type { Take } from "./types";
import type { UseWalkthroughReturn } from "./useWalkthrough";

export interface WalkthroughPanelProps {
  take: Take | null;
  onClose: () => void;
  walkthrough: UseWalkthroughReturn;
}

function stageStatusText(
  stage: UseWalkthroughReturn["stage"],
  savedTakeName: string | null
): string {
  switch (stage) {
    case "loading": return "Loading the recording…";
    case "ready": return "Ready - press Start walkthrough to begin.";
    case "recording": return "Recording.";
    case "paused": return "Paused.";
    case "finishing": return "Finishing…";
    case "done": return savedTakeName ? `Saved as ${savedTakeName}.` : "Saved.";
    case "error": return "Could not start the walkthrough.";
    default: return "";
  }
}

export default function WalkthroughPanel({
  take,
  onClose,
  walkthrough,
}: WalkthroughPanelProps) {
  const {
    stage,
    canvasRef,
    mode,
    setMode,
    keepSourceAudio,
    setKeepSourceAudio,
    progressPct,
    elapsedSec,
    sourceDurationSec,
    errorText,
    notice,
    savedTakeName,
    bubbleDescription,
    start,
    pause,
    resume,
    stopAndKeep,
  } = walkthrough;

  const headingRef = useRef<HTMLHeadingElement>(null);

  // AC28/modal-focus-restoration parity: focus moves to this pane's own
  // heading whenever a new take is opened. Restoring focus back to the row
  // that opened it on close is the caller's job (it owns the keyed button
  // ref map across every take row) - not something this pane can do itself.
  const takeId = take?.id;
  useEffect(() => {
    if (takeId) {
      headingRef.current?.focus();
    }
  }, [takeId]);

  if (!take) return null;

  const controlsLocked = stage !== "ready";
  const canLeave = stage !== "recording" && stage !== "paused" && stage !== "finishing";
  const busy = stage === "loading" || stage === "finishing";

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 ref={headingRef} tabIndex={-1} className={styles.adaptPanelTitle}>
          {`Talk through ${take.name}`}
        </h2>
        <p className={styles.adaptPanelSubtitle}>
          Plays {take.name} back while recording your camera and microphone (or microphone alone) over it.
        </p>
      </div>

      {notice && <p className={styles.fieldHint}>{notice}</p>}
      {errorText && <p role="alert" className={styles.error}>{errorText}</p>}

      {/* AC28/AC3b: any focusable control on this dark #0f172a stage would need
          --focus-ring-color: var(--focus-ring-on-navy) (the default ring fails
          contrast here). Satisfied by construction today - this box holds only
          the canvas, nothing focusable - not by that CSS variable. If a later
          change adds a button/select/link inside this box, it needs that reset. */}
      <div
        style={{
          position: "relative",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          // A video letterbox is not a themed surface - fixed dark-neutral
          // (the brand navy) regardless of theme, per the aesthetics pass's
          // capture-stage rule, rather than the raw #0f172a this carried
          // before.
          background: "var(--navy)",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            maxHeight: "48vh",
            display: "block",
            background: "var(--navy)",
          }}
        />
      </div>

      {bubbleDescription && (
        <p className={styles.fieldHint} style={{ margin: 0 }}>{bubbleDescription}</p>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <div role="status" aria-live="polite" style={{ fontWeight: 600, color: "var(--text-primary)" }}>
          {stageStatusText(stage, savedTakeName)}
        </div>
        <span className={styles.ghMetaMono} aria-hidden="true">
          {fmt(elapsedSec)} / {fmt(Math.round(sourceDurationSec))}
        </span>
      </div>

      <div
        title="Walkthrough progress"
        style={{
          height: 8,
          background: "color-mix(in srgb, var(--field-border) 40%, transparent)",
          borderRadius: "var(--radius-pill)",
          overflow: "hidden",
        }}
      >
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
          style={{
            width: `${progressPct}%`,
            height: "100%",
            background: "var(--success)",
            borderRadius: "var(--radius-pill)",
            transition: "width 0.05s ease",
          }}
        />
      </div>

      <div className={styles.adaptFieldGrid2}>
        <TextField
          select
          label="Capture"
          value={mode}
          disabled={controlsLocked}
          onChange={(e) => setMode(e.target.value === "audio" ? "audio" : "video")}
          size="small"
        >
          <MenuItem value="video">Camera and microphone</MenuItem>
          <MenuItem value="audio">Microphone only</MenuItem>
        </TextField>
        <div>
          <FormControlLabel
            control={
              <Checkbox
                checked={keepSourceAudio}
                disabled={controlsLocked}
                onChange={(e) => setKeepSourceAudio(e.target.checked)}
              />
            }
            label="Keep the original recording's audio"
          />
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            Off by default - the original usually already has your voice in it.
          </p>
        </div>
      </div>

      <div className={styles.ghActions}>
        {stage === "ready" && (
          <Button variant="contained" onClick={start}>
            Start walkthrough
          </Button>
        )}
        {stage === "recording" && (
          <>
            <Button variant="outlined" onClick={pause}>
              Pause
            </Button>
            <Button variant="contained" color="error" onClick={stopAndKeep}>
              Stop and keep
            </Button>
          </>
        )}
        {stage === "paused" && (
          <>
            <Button variant="contained" onClick={resume}>
              Resume
            </Button>
            <Button variant="contained" color="error" onClick={stopAndKeep}>
              Stop and keep
            </Button>
          </>
        )}
        {(stage === "loading" || stage === "finishing") && (
          <Button variant="contained" disabled>
            {stage === "loading" ? "Loading…" : "Finishing…"}
          </Button>
        )}
        <Button
          variant="text"
          onClick={onClose}
          disabled={!canLeave}
          title={canLeave ? undefined : "Stop and keep the walkthrough before leaving this pane."}
        >
          Back to takes
        </Button>
      </div>
      {!canLeave && (
        <p className={styles.fieldHint} style={{ margin: 0 }}>
          {busy
            ? "Back to takes is unavailable while the walkthrough finishes saving."
            : "Stop and keep to finish the walkthrough before going back to takes."}
        </p>
      )}
    </div>
  );
}
