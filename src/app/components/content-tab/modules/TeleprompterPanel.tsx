"use client";

// The teleprompter rehearsal surface (docs/teleprompter-mode-acceptance-
// criteria.md, chunk 3f) - mounted by GeneratedPreviewModal.tsx ONLY while
// teleprompter mode is open (X1/X2: no portal, its own file, rendered inside
// the modal that already renders at ModulesView's root). All state lives in
// useTeleprompterSession; this file is UI only - the four already-built
// pieces it wires together (camera preview, device pickers, speech feedback,
// auto-scroll) are read, not reimplemented.
//
// T2: this file never constructs a MediaRecorder and never calls
// captureStream() - the banner below states plainly that nothing is
// recorded, and every device stream this component starts is torn down the
// moment it is left (T3), via useTeleprompterSession's exitTeleprompter.
//
// X3: `script` is only ever displayed here (a plain <pre>), never sent
// anywhere - no TTS, no avatar, no Canvas post.
//
// Every value below is destructured out of useTeleprompterSession's return
// object AT THE CALL SITE (mirroring ModalShell.tsx's own
// `const { containerRef } = useModalDismiss(...)`), rather than read as
// `session.foo` throughout the JSX - `eslint react-hooks/refs` cannot prove a
// later property access on a hook's return value is safe to read during
// render when that object also carries ref fields (videoRef/canvasRef), and
// flags the whole thing; destructuring once, here, is the pattern this
// repo's own shared modal hook already uses for exactly that reason.
import { useEffect, useRef, useState } from "react";
import { Button, MenuItem, TextField } from "@mui/material";
import styles from "../../../page.module.css";
import { useTeleprompterSession } from "./useTeleprompterSession";
import { fmt } from "../../recording/types";
import { DEFAULT_SINK_ID } from "@/lib/teleprompter/audio-output";
import { autoScrollTop, isManualScroll, SCROLL_SPEED_MULTIPLIERS } from "@/lib/teleprompter/scroll";

export interface TeleprompterPanelProps {
  /** The version's text on screen elsewhere in the modal - displayed only,
   * never edited or sent anywhere from this component (X3). */
  script: string;
  /** Leaving teleprompter mode - called AFTER this component's own
   * exitTeleprompter() has already torn down every stream (T3), so the
   * caller only needs to stop rendering this component. */
  onExit: () => void;
}

export function TeleprompterPanel({ script, onExit }: TeleprompterPanelProps) {
  const {
    devices,
    deviceError,
    requestDeviceAccess,
    cameraId,
    setCameraId,
    micId,
    setMicId,
    speakerId,
    setSpeakerId,
    sinkSupported,
    audioOutputResult,
    videoRef,
    canvasRef,
    cameraError,
    bgMode,
    setBgMode,
    bgStatus,
    running,
    startReading,
    stopReading,
    elapsedMs,
    expectedDurationMs,
    totalWords,
    scrollSpeed,
    setScrollSpeed,
    paceReading,
    fillers,
    transcriptionError,
    exitTeleprompter,
  } = useTeleprompterSession(script);

  // Auto-scroll (owns the scrollable DOM node useTeleprompterSession has no
  // access to; the POSITION MATH itself is the pure autoScrollTop/
  // isManualScroll from src/lib/teleprompter/scroll.ts, called directly).
  const scrollElRef = useRef<HTMLDivElement | null>(null);
  const lastAutoTopRef = useRef(0);
  const [manualOverride, setManualOverride] = useState(false);

  useEffect(() => {
    if (!running || manualOverride) return;
    const el = scrollElRef.current;
    if (!el) return;
    const scrollableDistance = el.scrollHeight - el.clientHeight;
    const top = autoScrollTop({ elapsedMs, totalWords, scrollableDistance, speedMultiplier: scrollSpeed });
    el.scrollTop = top;
    lastAutoTopRef.current = top;
  }, [elapsedMs, running, manualOverride, totalWords, scrollSpeed]);

  const handleScroll = () => {
    if (!running || manualOverride) return;
    const el = scrollElRef.current;
    if (!el) return;
    if (isManualScroll(el.scrollTop, lastAutoTopRef.current)) setManualOverride(true);
  };

  // T3: the explicit "leave" control - tears down every stream via the
  // session hook's own exitTeleprompter (which calls the preview hook's
  // stop()) BEFORE telling the caller to stop rendering this component.
  const handleExit = () => {
    exitTeleprompter();
    onExit();
  };

  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const expectedSeconds = Math.floor(expectedDurationMs / 1000);
  const runningLong = running && expectedDurationMs > 0 && elapsedMs > expectedDurationMs;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {/* T2: plainly states nothing is being recorded, so an instructor is
          never unsure. */}
      <p className={styles.previewMeta} style={{ margin: 0, fontWeight: 600 }}>
        Rehearsal only - nothing here is recorded, saved, or sent anywhere. Camera and microphone stop the moment you
        leave teleprompter mode.
      </p>

      <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
        {/* Camera preview column (T7: the canvas painted from
            useCameraPreview's own frame loop is what is mounted here - not
            the raw <video>, which stays off-screen and only feeds the
            canvas). */}
        <div style={{ flex: "1 1 320px", minWidth: 280 }}>
          <video ref={videoRef} muted playsInline autoPlay style={{ display: "none" }} />
          <canvas
            ref={canvasRef}
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--field-border)",
              background: "#000",
              display: "block",
            }}
          />
          {cameraError && (
            <p className={styles.fieldHint} style={{ color: "var(--warning-ink)" }}>
              {cameraError}
            </p>
          )}
          {/* T7: the background model loads from a CDN and can fail - surfaced, not hidden. */}
          {bgStatus === "loading" && <p className={styles.fieldHint}>Loading background blur model…</p>}
          {bgStatus === "failed" && (
            <p className={styles.fieldHint} style={{ color: "var(--warning-ink)" }}>
              Background blur could not load (the model failed to download). The preview shows the raw camera image
              instead.
            </p>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
            <TextField
              select
              size="small"
              label="Camera"
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="">System default</MenuItem>
              {devices.cameras.map((c) => (
                <MenuItem key={c.deviceId} value={c.deviceId}>
                  {c.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Microphone"
              value={micId}
              onChange={(e) => setMicId(e.target.value)}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="">System default</MenuItem>
              <MenuItem value="off">No microphone (mute)</MenuItem>
              {devices.mics.map((m) => (
                <MenuItem key={m.deviceId} value={m.deviceId}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
            {/* T6: absent, with a reason, when this browser cannot direct
                audio to a chosen output device - never a select that
                silently does nothing. */}
            {sinkSupported ? (
              <TextField
                select
                size="small"
                label="Speaker"
                value={speakerId}
                onChange={(e) => setSpeakerId(e.target.value)}
                sx={{ minWidth: 150 }}
              >
                <MenuItem value={DEFAULT_SINK_ID}>System default</MenuItem>
                {devices.speakers
                  .filter((d) => d.deviceId !== DEFAULT_SINK_ID)
                  .map((d) => (
                    <MenuItem key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </MenuItem>
                  ))}
              </TextField>
            ) : (
              <p className={styles.fieldHint} style={{ alignSelf: "center", margin: 0 }}>
                {audioOutputResult?.reason ?? "This browser cannot direct audio to a chosen output device."}
              </p>
            )}
            <TextField
              select
              size="small"
              label="Background"
              value={bgMode === "image" ? "none" : bgMode}
              onChange={(e) => setBgMode(e.target.value as "none" | "blur")}
              disabled={bgStatus === "failed"}
              sx={{ minWidth: 110 }}
            >
              <MenuItem value="none">None</MenuItem>
              <MenuItem value="blur">Blur</MenuItem>
            </TextField>
          </div>

          {(devices.cameras.length === 0 || devices.mics.length === 0) && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-2)", flexWrap: "wrap" }}>
              <span className={styles.fieldHint}>Cameras and microphones appear here after the browser grants access.</span>
              <Button variant="outlined" size="small" onClick={requestDeviceAccess}>
                Grant access
              </Button>
            </div>
          )}
          {deviceError && (
            <p className={styles.fieldHint} style={{ color: "var(--warning-ink)" }}>
              {deviceError}
            </p>
          )}
          {audioOutputResult?.status === "failed" && (
            <p className={styles.fieldHint} style={{ color: "var(--warning-ink)" }}>
              {audioOutputResult.reason}
            </p>
          )}
        </div>

        {/* Script + feedback column. */}
        <div style={{ flex: "2 1 420px", minWidth: 320, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {/* T12: elapsed-since-start, formatted with the existing tested
                fmt() - never a second time-formatting implementation - and
                the expected duration alongside it so running long is visible
                before the end of the script. */}
            <span
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "var(--font-size-lg)",
                color: runningLong ? "var(--warning-ink)" : undefined,
              }}
            >
              {fmt(elapsedSeconds)} elapsed{expectedSeconds > 0 ? ` / ${fmt(expectedSeconds)} expected` : ""}
            </span>
            <TextField
              select
              size="small"
              label="Scroll speed"
              value={scrollSpeed}
              onChange={(e) => setScrollSpeed(Number(e.target.value))}
              sx={{ minWidth: 100 }}
            >
              {SCROLL_SPEED_MULTIPLIERS.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}x
                </MenuItem>
              ))}
            </TextField>
            {!running ? (
              <Button size="small" variant="contained" onClick={startReading}>
                Start
              </Button>
            ) : (
              <Button size="small" variant="outlined" onClick={stopReading}>
                Stop
              </Button>
            )}
            {/* T3: the explicit control - always present, always reachable,
                reversible with a single click. */}
            <Button size="small" variant="text" onClick={handleExit} sx={{ marginLeft: "auto" }}>
              Exit teleprompter
            </Button>
          </div>

          {manualOverride && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <span className={styles.fieldHint}>Auto-scroll paused - you scrolled manually.</span>
              <Button size="small" variant="text" onClick={() => setManualOverride(false)}>
                Resume auto-scroll
              </Button>
            </div>
          )}

          <div
            ref={scrollElRef}
            onScroll={handleScroll}
            style={{
              maxHeight: 360,
              overflowY: "auto",
              border: "1px solid var(--field-border)",
              borderRadius: "var(--radius-sm)",
              padding: "var(--space-4)",
            }}
          >
            {script.trim() === "" ? (
              <p className={styles.previewMeta}>This version has no text.</p>
            ) : (
              <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontSize: "var(--font-size-lg)", lineHeight: 1.6 }}>
                {script}
              </pre>
            )}
          </div>

          <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap" }}>
            <div>
              <strong style={{ fontSize: "var(--font-size-sm)" }}>Pace</strong>
              {/* T10: an explicit "not enough data" state - never a wild
                  number computed from one or two words. */}
              <p className={styles.fieldHint} style={{ margin: 0 }}>
                {paceReading.status === "insufficient-data"
                  ? "Not enough speech yet to measure pace."
                  : `${Math.round(paceReading.wpm)} wpm - ${
                      paceReading.verdict === "on-pace"
                        ? "on pace"
                        : paceReading.verdict === "slow"
                          ? "slower than target"
                          : "faster than target"
                    }`}
              </p>
            </div>
            <div>
              <strong style={{ fontSize: "var(--font-size-sm)" }}>Filler words</strong>
              {/* T11: an explicit unsupported state - never a zero that
                  looks like a measurement. */}
              <p className={styles.fieldHint} style={{ margin: 0 }}>
                {fillers.available ? `${fillers.counts.total} detected this session` : fillers.reason}
              </p>
            </div>
          </div>

          {transcriptionError && (
            <p className={styles.fieldHint} style={{ color: "var(--warning-ink)" }}>
              {transcriptionError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
