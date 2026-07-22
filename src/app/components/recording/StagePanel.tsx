"use client";

import { Button, TextField, MenuItem } from "@mui/material";
import styles from "../../page.module.css";
import { fmt } from "./types";
import type { UseAnnotationsReturn } from "./useAnnotations";

interface StagePanelProps {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  source: "camera" | "screen" | "audio";
  mirror: boolean;
  hasStream: boolean;
  hasAudio: boolean;
  script: string;
  prompterOn: boolean;
  prompterSize: "sm" | "md" | "lg";
  annotations: UseAnnotationsReturn;
  recState: "idle" | "recording" | "paused";
  elapsed: number;
  bytes: number;
  muted: boolean;
  level: number;
  countdown: number | null;
  finishing: boolean;
  toggleMute: () => void;
  beginRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  startPreview: () => Promise<void>;
  stopEverything: () => Promise<void>;
  cardNotice: { kind: "title" | "closing"; secondsLeft: number } | null;
  autoStopMin: "0" | "5" | "10" | "15" | "30";
  userPickedRef: React.MutableRefObject<boolean>;
}

export default function StagePanel({
  videoRef,
  source,
  mirror,
  hasStream,
  hasAudio,
  script,
  prompterOn,
  prompterSize,
  annotations,
  recState,
  elapsed,
  bytes,
  muted,
  level,
  countdown,
  finishing,
  toggleMute,
  beginRecording,
  pauseRecording,
  resumeRecording,
  stopRecording,
  startPreview,
  stopEverything,
  cardNotice,
  autoStopMin,
  userPickedRef,
}: StagePanelProps) {
  const {
    overlayCanvasRef,
    tool,
    setTool,
    penColor,
    setPenColor,
    penSize,
    setPenSize,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleUndo,
    handleClear,
  } = annotations;

  return (
    <div className={styles.adaptPanel}>
      <div className={styles.adaptPanelHeader}>
        <h2 className={styles.adaptPanelTitle}>Stage</h2>
      </div>
      {prompterOn && script && (
        <div
          style={{
            maxHeight: 180,
            overflowY: "auto",
            padding: "14px 18px",
            marginBottom: 10,
            borderRadius: 12,
            background: "#0f172a",
            color: "#f8fafc",
            fontSize: prompterSize === "sm" ? "1.05rem" : prompterSize === "md" ? "1.4rem" : "1.9rem",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {script}
        </div>
      )}
      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#0f172a" }}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            display: source === "audio" ? "none" : "block",
            width: "100%",
            maxHeight: "48vh",
            objectFit: "contain",
            background: "#0f172a",
            transform: source === "camera" && mirror ? "scaleX(-1)" : undefined,
          }}
        />
        {source === "audio" && hasStream && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "200px",
            maxHeight: "48vh",
            background: "#0f172a",
            padding: "20px",
            textAlign: "center",
          }}>
            <div>
              <div style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "8px", color: "#f8fafc" }}>Audio-only recording</div>
              <div className={styles.ghMeta}>The microphone level meter below shows your signal.</div>
            </div>
          </div>
        )}
        <canvas
          ref={overlayCanvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            cursor: tool === "off" ? "default" : "crosshair",
            pointerEvents: tool === "off" ? "none" : "auto",
            touchAction: "none",
            display: source === "audio" ? "none" : "auto",
          }}
        />
        {countdown !== null && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.45)", pointerEvents: "none" }}>
            <span style={{ fontSize: "6rem", fontWeight: 800, color: "#fff", textShadow: "0 4px 24px rgba(0,0,0,0.5)" }}>{countdown}</span>
          </div>
        )}
        {cardNotice && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "10px 16px", background: "rgba(15,23,42,0.72)", pointerEvents: "none" }}>
            <span style={{ color: "#f8fafc", fontWeight: 600, fontSize: "0.95rem" }}>
              {cardNotice.kind === "title"
                ? `Title card is recording - your video starts in ${cardNotice.secondsLeft}...`
                : `Adding the closing card (${cardNotice.secondsLeft}s)...`}
            </span>
          </div>
        )}
      </div>

      {hasStream && tool !== "off" && (
        <div className={styles.ghActions} style={{ marginBottom: 16 }}>
          <Button
            variant={tool === "pen" ? "contained" : "outlined"}
            size="small"
            onClick={() => setTool("pen")}
          >
            Draw
          </Button>
          <Button
            variant={tool === "highlighter" ? "contained" : "outlined"}
            size="small"
            onClick={() => setTool("highlighter")}
          >
            Highlight
          </Button>
          <Button
            variant={tool === "eraser" ? "contained" : "outlined"}
            size="small"
            onClick={() => setTool("eraser")}
          >
            Erase
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={() => setTool("off")}
          >
            Done
          </Button>
          <input
            type="color"
            value={penColor}
            onChange={(e) => setPenColor(e.target.value)}
            style={{
              width: 32,
              height: 28,
              border: "none",
              background: "transparent",
              cursor: "pointer",
            }}
            aria-label="Annotation color"
          />
          <TextField
            select
            value={penSize}
            onChange={(e) => setPenSize(Number(e.target.value))}
            size="small"
            sx={{ minWidth: 90 }}
          >
            <MenuItem value={2}>Thin</MenuItem>
            <MenuItem value={4}>Medium</MenuItem>
            <MenuItem value={8}>Thick</MenuItem>
          </TextField>
          <Button
            variant="text"
            size="small"
            onClick={handleUndo}
          >
            Undo
          </Button>
          <Button
            variant="text"
            size="small"
            onClick={handleClear}
          >
            Clear
          </Button>
        </div>
      )}

      {hasStream && tool === "off" && (
        <div className={styles.ghActions} style={{ marginBottom: 16 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setTool("pen")}
          >
            Draw
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setTool("highlighter")}
          >
            Highlight
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setTool("eraser")}
          >
            Erase
          </Button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {recState !== "idle" && (
            <>
              <span className={styles.navBadge}>{recState === "recording" ? "REC" : "PAUSED"}</span>
              <span className={styles.ghMetaMono} style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>
                {fmt(elapsed)}
              </span>
              {autoStopMin !== "0" && <span className={styles.ghMeta}>/ {autoStopMin} min</span>}
              <span className={styles.ghMeta}>
                {(bytes / 1048576).toFixed(1)} MB
              </span>
            </>
          )}
          <span className={styles.ghMeta}>Shortcuts: R record - P pause - M mute</span>
        </div>

        {hasStream && hasAudio && (
          <Button variant={muted ? "contained" : "outlined"} size="small" color={muted ? "error" : "primary"} onClick={toggleMute}>
            {muted ? "Unmute" : "Mute"}
          </Button>
        )}
        <span className={styles.ghMeta}>Mic level</span>
        <div
          title="Live microphone input level"
          style={{
            height: 8,
            background: "color-mix(in srgb, var(--field-border) 40%, transparent)",
            borderRadius: 999,
            width: 180,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${Math.round(level * 100)}%`,
              height: "100%",
              background: "var(--success)",
              borderRadius: 999,
              transition: "width 0.05s ease",
            }}
          />
        </div>
        {hasStream && !hasAudio && (
          <span className={styles.ghMeta} style={{ color: "var(--warning)" }}>No mic on this stream</span>
        )}
        {!hasStream && <span className={styles.ghMeta}>Start the preview to test your mic</span>}
      </div>

      <div className={styles.ghActions}>
        {!hasStream ? (
          <Button variant="contained" onClick={() => { userPickedRef.current = true; void startPreview(); }}>
            Start preview
          </Button>
        ) : recState === "idle" ? (
          <>
            <Button variant="contained" onClick={beginRecording} disabled={countdown !== null}>
              Record
            </Button>
            <Button variant="text" onClick={stopEverything}>
              Stop preview
            </Button>
          </>
        ) : recState === "recording" ? (
          <>
            <Button variant="outlined" onClick={pauseRecording} disabled={finishing}>
              Pause
            </Button>
            <Button variant="contained" color="error" onClick={stopRecording} disabled={finishing}>
              {finishing ? "Finishing..." : "Stop"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="contained" onClick={resumeRecording} disabled={finishing}>
              Resume
            </Button>
            <Button variant="contained" color="error" onClick={stopRecording} disabled={finishing}>
              {finishing ? "Finishing..." : "Stop"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
