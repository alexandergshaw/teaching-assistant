"use client";

import { useEffect, useRef, useState } from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import styles from "../../page.module.css";
import { fmt } from "./types";
import type { Take } from "./types";
import type { UseAnnotationsReturn } from "./useAnnotations";
import { SCREEN_AUDIO_NOT_GRANTED_NOTICE } from "./useRecorder";

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
  // AC14: mounts the composited pipeline canvas here so the screen-source
  // preview shows the bubble (and everything else the pipeline burns in)
  // before recording starts, not only in the recorded file.
  attachPipelineCanvas: (host: HTMLElement | null) => void;
  // AC5: the three-state system-audio message (Agent A computes the string;
  // this file only renders it), null when there is nothing to say.
  screenAudioNotice: string | null;
  // FIX 3 (AC1b): non-null when the mix's AudioContext never reached
  // "running" after resume() - the take may carry no audio at all, with no
  // other error anywhere. useRecorder.ts computes the string; this file only
  // renders it, same pattern as screenAudioNotice.
  audioMixNotice: string | null;
  onShareAgain: () => void;
  // AC28 item 8: a text equivalent for the bubble preview, since AC14's value
  // is entirely visual.
  pipEnabled: boolean;
  bubbleShape: "circle" | "rounded";
  bubbleSize: "sm" | "md" | "lg";
  pipCorner: "br" | "bl" | "tr" | "tl";
  // AC15c: the most recently finished take, so its actions can appear inline
  // on the stage instead of sending the user to scroll the takes list. Null
  // when there are no takes yet. The caller (RecordingTab) is responsible for
  // this always being the NEWEST take - this component just renders whatever
  // it is handed.
  latestTake: Take | null;
  // Same handlers a take row calls (TakesPanel) - lifted to RecordingTab so
  // both call sites share one open path rather than duplicating it.
  onTalkThrough: (take: Take, sourceEl: HTMLElement) => void;
  onDraftAnnouncement: (take: Take, sourceEl: HTMLElement) => void;
  // AC15b: non-null while a long-running per-take pipeline (walkthrough,
  // audio extraction, or an announcement draft) is running on ANY take - the
  // recorder and the transcription queue are singletons, so these two
  // actions are unavailable everywhere while either runs. Carries the reason,
  // per this repo's disabled-control precedent (GeneratedPostSection AC 12b):
  // a blocked control states why rather than just greying out.
  latestTakeBusyReason: string | null;
}

// S2 fix: AC5's pinned "offered, none granted" string used to be re-declared
// here as a local literal, with the `Share again` action gated on an
// equality check against it while the producing copy lived in
// useRecorder.ts - a one-character copy edit in either file would silently
// desync the two and remove the recovery action with every gate green.
// Importing useRecorder's own SCREEN_AUDIO_NOT_GRANTED_NOTICE (exported
// exactly for this) removes the duplicate.

const BUBBLE_SHAPE_LABEL: Record<"circle" | "rounded", string> = {
  circle: "circle",
  rounded: "rounded square",
};

const BUBBLE_SIZE_LABEL: Record<"sm" | "md" | "lg", string> = {
  sm: "small",
  md: "medium",
  lg: "large",
};

const BUBBLE_CORNER_LABEL: Record<"br" | "bl" | "tr" | "tl", string> = {
  br: "bottom right",
  bl: "bottom left",
  tr: "top right",
  tl: "top left",
};

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
  attachPipelineCanvas,
  screenAudioNotice,
  audioMixNotice,
  onShareAgain,
  pipEnabled,
  bubbleShape,
  bubbleSize,
  pipCorner,
  latestTake,
  onTalkThrough,
  onDraftAnnouncement,
  latestTakeBusyReason,
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

  // S8/AC28 item 2: recording state was announced nowhere - REC/PAUSED is a
  // bare span.navBadge with no live region, so a screen-reader user gets no
  // signal that recording started, paused, auto-stopped, or that the screen
  // share ended and finished the take (AC6). This tracks recState/countdown
  // transitions purely from props already available here and renders a
  // single visually-hidden role="status" aria-live="polite" node - kept apart
  // from the visible REC/PAUSED badge and the elapsed timer (which stays
  // aria-hidden below), so the per-second counter never floods the region.
  const [stageAnnouncement, setStageAnnouncement] = useState("");
  const prevRecStateRef = useRef(recState);
  const prevCountdownRef = useRef<number | null>(countdown);
  // AC6/AC29: "Screen sharing ended - the take was finished and saved." is
  // reachable only when the browser's own "Stop sharing" bar ends the share
  // mid-recording. useRecorder.ts already reacts to that event internally
  // (out of this file's reach), so this listens for the same underlying
  // MediaStreamTrack "ended" event independently, purely to distinguish that
  // case from an ordinary Stop click for the announcement below.
  const screenShareEndedRef = useRef(false);

  useEffect(() => {
    if (source !== "screen" || !hasStream) return;
    const stream = videoRef.current?.srcObject as MediaStream | null | undefined;
    const track = stream?.getVideoTracks?.()[0];
    if (!track) return;
    const onEnded = () => {
      screenShareEndedRef.current = true;
    };
    track.addEventListener("ended", onEnded);
    return () => track.removeEventListener("ended", onEnded);
  }, [source, hasStream, videoRef]);

  // react-hooks/set-state-in-effect: this repo's established idiom for a
  // setState that must be reached from an effect (never synchronously from
  // the effect body itself) is an inline async IIFE deferred past a
  // microtask, guarded by a `cancelled` flag - see useTakeAnnouncement.ts's
  // auto-start effect for the precedent this mirrors.
  useEffect(() => {
    if (countdown === null || countdown === prevCountdownRef.current) {
      prevCountdownRef.current = countdown;
      return;
    }
    prevCountdownRef.current = countdown;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setStageAnnouncement(`Starting in ${countdown}.`);
    })();
    return () => {
      cancelled = true;
    };
  }, [countdown]);

  useEffect(() => {
    const prev = prevRecStateRef.current;
    prevRecStateRef.current = recState;
    if (prev === recState) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (recState === "recording") {
        setStageAnnouncement("Recording");
      } else if (recState === "paused") {
        setStageAnnouncement("Paused");
      } else if (recState === "idle" && (prev === "recording" || prev === "paused")) {
        if (screenShareEndedRef.current) {
          screenShareEndedRef.current = false;
          setStageAnnouncement("Screen sharing ended - the take was finished and saved.");
        } else if (latestTake) {
          setStageAnnouncement(`Recording stopped - saved as ${latestTake.name}.`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recState, latestTake]);

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
      {/* AC15c/focus-ring-acceptance-criteria AC3b: this box paints its dark
          fill as an INLINE style, which a CSS sweep structurally cannot see.
          It used to hold no focusable control (a comment on the walkthrough
          stage's equivalent box notes exactly that "by construction" case),
          but the AC15c banner below adds two Buttons here, so the on-navy
          ring reset below is no longer optional the way it once was. Set once
          on this container rather than per button - custom properties
          inherit. */}
      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#0f172a", "--focus-ring-color": "var(--focus-ring-on-navy)" } as React.CSSProperties}>
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={
            source === "screen"
              ? {
                  // AC14: the composited pipeline canvas is shown instead for
                  // the screen source, but this element stays mounted and
                  // decoding - it is still the pipeline's draw source
                  // (useCanvasPipeline reads videoRef). Never display:none:
                  // that stops the browser from decoding frames into it, and
                  // the canvas would draw a frozen or blank frame with no
                  // error, ruining the recording silently.
                  position: "absolute",
                  width: 1,
                  height: 1,
                  opacity: 0,
                  pointerEvents: "none",
                }
              : {
                  display: source === "audio" ? "none" : "block",
                  width: "100%",
                  maxHeight: "48vh",
                  objectFit: "contain",
                  background: "#0f172a",
                  transform: source === "camera" && mirror ? "scaleX(-1)" : undefined,
                }
          }
        />
        {/* AC14: the composited canvas host. Same box (width/maxHeight/
            objectFit) as the video it replaces, only for the screen source,
            so the annotation overlay's inset:0 mapping - which reads its own
            bounding rect, not the video's - keeps pointing at the same pixels
            either way.
            S10: shown only while a stream is actually live. Nothing here
            clears the canvas's pixels on stop, so leaving it visible after
            "Stop preview" left the last composited frame frozen on the page.
            The placeholder box below covers the same case before the first
            preview starts, when this host has no canvas child yet and would
            otherwise collapse to zero height (a black box used to sit there
            before AC14 showed the canvas instead of the raw video). Ref
            callback identity is unaffected - this only toggles a CSS
            display, the div itself stays mounted throughout. */}
        <div
          ref={(el) => attachPipelineCanvas(el)}
          style={{ display: source === "screen" && hasStream ? "block" : "none", width: "100%", minHeight: 200, background: "#0f172a" }}
        />
        {source === "screen" && !hasStream && (
          <div style={{ width: "100%", minHeight: 200, background: "#0f172a" }} />
        )}
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
        {/* AC15c: the most recently finished take's actions, inline on the
            stage instead of sending the user to scroll the takes list. Only
            while idle (recording/paused/finishing/countdown occupy this same
            corner with their own overlays, and are mutually exclusive with
            this one since a take is only added once recState is back to
            "idle"), and only when a take exists at all. */}
        {latestTake && recState === "idle" && !finishing && countdown === null && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: 8,
              padding: "10px 16px",
              background: "rgba(15,23,42,0.72)",
            }}
          >
            {/* FIX 6: this used to be its own role="status" aria-live="polite"
                region ("Take 3 saved -"), firing at the exact same moment the
                visually-hidden region below announces "Recording stopped -
                saved as Take 3." (the recState effect's "idle" branch) - a
                screen reader heard the same event twice. That hidden region
                already covers every recState transition; this one is plain
                visible text now, not a second live region. (Former S9 note:
                the wrapper still covers only the text node, not the two
                buttons, since a re-render of the buttons would no longer be
                announced either way - keeping the split avoids re-litigating
                that scope if a live region is ever reintroduced here.) */}
            <span style={{ color: "#f8fafc", fontWeight: 600, fontSize: "0.95rem" }}>
              {`${latestTake.name} saved -`}
            </span>
            {latestTakeBusyReason ? (
              <span style={{ color: "#f8fafc", fontSize: "0.85rem" }}>{latestTakeBusyReason}</span>
            ) : (
              <>
                {!latestTake.mimeType.startsWith("audio/") && (
                  <Button
                    variant="text"
                    size="small"
                    sx={{ color: "#f8fafc" }}
                    onClick={(e) => onTalkThrough(latestTake, e.currentTarget)}
                  >
                    Talk through this
                  </Button>
                )}
                <Button
                  variant="text"
                  size="small"
                  sx={{ color: "#f8fafc" }}
                  onClick={(e) => onDraftAnnouncement(latestTake, e.currentTarget)}
                >
                  Draft announcement
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {source === "screen" && pipEnabled && (
        <p className={styles.fieldHint} style={{ margin: "6px 0 0" }}>
          {`Bubble: ${BUBBLE_SHAPE_LABEL[bubbleShape]}, ${BUBBLE_SIZE_LABEL[bubbleSize]}, ${BUBBLE_CORNER_LABEL[pipCorner]}. The preview shows exactly what is recorded.`}
        </p>
      )}

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

      {/* S8/AC28 item 2: visually hidden - the visible state is the REC/
          PAUSED badge and elapsed timer below, which stay aria-hidden/plain
          text so this is the only copy a screen reader hears, and only on a
          state transition rather than every second. */}
      <span
        role="status"
        aria-live="polite"
        style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
      >
        {stageAnnouncement}
      </span>

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {recState !== "idle" && (
            <>
              <span className={styles.navBadge} aria-hidden="true">{recState === "recording" ? "REC" : "PAUSED"}</span>
              <span className={styles.ghMetaMono} aria-hidden="true" style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>
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
        {source === "screen" && screenAudioNotice && (
          <span className={styles.ghMeta} style={{ color: "var(--warning)" }}>
            {screenAudioNotice}
            {/* F2/N7: "Share again" re-runs getDisplayMedia via startPreview,
                whose first act is stopEverything() - reachable here whenever
                the notice matched, including mid-recording, where it silently
                finishes and saves the take instead of the one-click re-share
                AC5 promises. Hidden while a take is in progress; the notice
                text itself still explains the situation. */}
            {screenAudioNotice === SCREEN_AUDIO_NOT_GRANTED_NOTICE && recState === "idle" && (
              <Button variant="text" size="small" onClick={onShareAgain} sx={{ ml: 1 }}>
                Share again
              </Button>
            )}
          </span>
        )}
        {/* FIX 3 (AC1b): the mix's AudioContext never reached "running" after
            resume() - the take being recorded (or just recorded) may carry no
            audio at all, silently. Rendered as its own status, not folded
            into screenAudioNotice, since the two conditions are independent
            and can both be true at once. */}
        {audioMixNotice && (
          <span role="status" aria-live="polite" className={styles.ghMeta} style={{ color: "var(--warning)" }}>
            {audioMixNotice}
          </span>
        )}
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
