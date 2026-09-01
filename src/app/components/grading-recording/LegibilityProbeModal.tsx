"use client";

// REACHABILITY NOTICE - READ BEFORE CHANGING HOW THIS MODAL IS WIRED.
//
// This modal IS reachable: src/app/components/AiChatFab.tsx imports
// LegibilityProbeModal and renders it behind a "Check screen legibility"
// entry in the fab's SpeedDial (grouped with the fab's other modal/window
// actions, not with its navigateToRecordingTool entries - see that file's
// own comment on the entry). The fab is mounted once in layout.tsx, outside
// page.tsx, so this is reachable from anywhere in the app: open the dial,
// click "Check screen legibility". Grep the repo and confirm before trusting
// any comment, including this one, if that ever changes again - this repo
// has been bitten by a stale reachability claim before.
//
// RubricInputModal.tsx next door is DIFFERENT: it stays staged and
// unreachable, on its own terms (see its own header) - do not infer
// anything about its wiring from this file having been wired.
//
// WHAT THIS IS: an instrument, not a feature. It captures a screen, sends a
// small batch of frames to the vision model with a prompt that asks ONLY for
// a verbatim transcription (never grading, never structure extraction, never
// inference - legibility-probe.ts's buildLegibilityProbePrompt), and shows
// the instructor exactly what came back next to the frames themselves. It
// does not grade, does not build a table, and does not persist anything -
// closing this modal (or navigating away) discards the run entirely. That
// mirrors RubricInputModal's own deliberate exception to this repo's usual
// "every new textbox persists" rule: a one-shot measurement has nothing that
// needs to survive a reload, and there is no ta-rec-* key here to canary.
//
// REUSE, NOT NEW MACHINERY (see this file's own reuse survey in the task
// report):
//  - `useDiscussionCapture` (../recording/useDiscussionCapture.ts) - the
//    capture hook itself, imported and used completely unmodified. Its own
//    header says it "knows nothing about rows, replies, the LLM, or
//    localStorage" - exactly the generic capture primitive this probe needs
//    and nothing more.
//  - `EXTRACT_BATCH_WIRE_BUDGET` (../recording/discussion-capture.ts) - the
//    same wire budget the discussion capture loop uses, so this probe's send
//    describes the SAME pipeline a real capture would use, not a probe-only
//    approximation of it. `resolveTargetWidth`/`FRAME_JPEG_QUALITY` are no
//    longer read directly here (LP3 FIX): each frame `takeFrameBatch`
//    returns now carries its OWN real sourceWidth/sourceHeight/encodedWidth/
//    encodedHeight/encodedQuality (CapturedFrame), captured at the moment it
//    was drawn - reporting those, instead of re-deriving nominal numbers from
//    a live <video> read at probe time and a constant that ignores the
//    capture loop's own half-quality re-encode path, is the actual fix for
//    this instrument's defect (see legibility-probe.ts's header).
//  - `useLlmProvider` (@/lib/llm-provider) - the app-wide provider toggle,
//    generic and already reactive to the same control the rest of the app
//    uses.
//  - `checkWireBudget`'s own unit, `sumBase64WireBytes` (@/lib/upload-budget)
//    - the wire-byte total reported in the capture-parameter line is
//    computed with the EXACT function the server enforces the budget with,
//    so the number shown here can never drift from what the server actually
//    checked.
//  - `ModalShell` (../ui/ModalShell) - this app's shared modal idiom, same
//    as RubricInputModal.
import { useCallback, useRef, useState } from "react";
import Button from "@mui/material/Button";
import { useLlmProvider } from "@/lib/llm-provider";
import { formatMB, sumBase64WireBytes } from "@/lib/upload-budget";
import { probeFrameLegibilityAction } from "@/app/actions/legibility-probe";
import { useDiscussionCapture } from "../recording/useDiscussionCapture";
import { EXTRACT_BATCH_WIRE_BUDGET, type CapturedFrame } from "../recording/discussion-capture";
import { ModalShell } from "../ui/ModalShell";
import styles from "../../page.module.css";
import modalStyles from "./LegibilityProbeModal.module.css";
import {
  PROBE_MAX_FRAMES,
  canRunProbe,
  buildLegibilityProbePrompt,
  deriveProbeResultNotice,
  describeCaptureParameters,
  type ProbeCaptureParameters,
  type ProbeResultNotice,
} from "./legibility-probe";
// docs/DEV_LOOP.md's "every feature needs a downloadable log" rule: this
// probe already computes and shows everything worth logging (the transcript,
// the capture-parameters line) - see legibility-probe-log.ts's own header
// for why this file only needs to ACCUMULATE what is already computed, never
// re-derive any of it.
import {
  buildLegibilityProbeRunLog,
  summarizeLegibilityProbeRunLog,
  legibilityProbeLogSummaryLine,
  formatLegibilityProbeLogCsv,
  formatLegibilityProbeLogJson,
  legibilityProbeLogFileName,
  type LegibilityProbeLogRun,
} from "./legibility-probe-log";
import { triggerFileDownload } from "../course-planning/utils";

export interface LegibilityProbeModalProps {
  onClose: () => void;
  restoreFocusRef?: React.RefObject<HTMLElement | null>;
  fallbackFocusRefs?: readonly React.RefObject<HTMLElement | null>[];
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function LegibilityProbeModal({
  onClose,
  restoreFocusRef,
  fallbackFocusRefs,
}: LegibilityProbeModalProps): React.ReactNode {
  const [provider] = useLlmProvider();
  const {
    capturing,
    elapsedSec,
    pendingFrames,
    stalled,
    previewRef,
    start,
    stop,
    takeFrameBatch,
  } = useDiscussionCapture();

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ProbeResultNotice | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [params, setParams] = useState<ProbeCaptureParameters | null>(null);
  const [sentFrames, setSentFrames] = useState<CapturedFrame[]>([]);
  const runCountRef = useRef(0);
  // docs/DEV_LOOP.md's downloadable-log rule: accumulates for the whole
  // modal-open lifetime (every "Run legibility probe" click, not just the
  // most recently displayed one) - see legibility-probe-log.ts's own header.
  // State, not a ref: eslint-plugin-react-hooks forbids reading a ref's
  // `.current` during render, and the summary line/download handler below
  // both need a render-time read - mirrors GradingRecordingPanel.tsx's own
  // identical choice.
  const [probeRuns, setProbeRuns] = useState<LegibilityProbeLogRun[]>([]);

  const handleStartStop = useCallback(() => {
    if (capturing) {
      stop();
    } else {
      setNotice(null);
      setTranscript(null);
      setParams(null);
      setSentFrames([]);
      void start({ saveVideo: false });
    }
  }, [capturing, start, stop]);

  const handleRunProbe = useCallback(async () => {
    if (!canRunProbe(pendingFrames, busy)) return;

    // LP3 FIX: no longer reads the live preview's videoWidth/videoHeight
    // here, and no longer restates FRAME_JPEG_QUALITY unconditionally. Each
    // taken frame already carries the REAL sourceWidth/sourceHeight/
    // encodedWidth/encodedHeight/encodedQuality it was actually drawn and
    // encoded with, captured at that moment inside useDiscussionCapture - so
    // this report can never drift from what was actually sent, including for
    // a frame the capture loop silently re-encoded at half quality to fit
    // the wire budget (AC10b/S5), which is exactly the frame this instrument
    // most needs to describe honestly.
    const frames = takeFrameBatch(PROBE_MAX_FRAMES, EXTRACT_BATCH_WIRE_BUDGET);
    if (frames.length === 0) return;

    // The same value `packFrameBatch` (discussion-capture.ts) used internally
    // to decide how many frames fit the budget, recomputed here on the exact
    // base64 array `takeFrameBatch` returned - a pure function of that fixed
    // input, so it is provably the same number, never a value that could
    // drift from what was actually checked against EXTRACT_BATCH_WIRE_BUDGET.
    const wireBytes = sumBase64WireBytes(frames.map((f) => f.base64));
    const runId = ++runCountRef.current;

    setBusy(true);
    setNotice(null);
    try {
      const prompt = buildLegibilityProbePrompt(frames.length);
      const result = await probeFrameLegibilityAction(frames, prompt, provider);
      if (runId !== runCountRef.current) return; // a newer run superseded this one

      setSentFrames(frames);
      setParams({ frames, wireBytes });
      setTranscript("transcript" in result ? result.transcript : null);
      const resultNotice = deriveProbeResultNotice(result);
      setNotice(resultNotice);
      setProbeRuns((prev) => [
        ...prev,
        {
          at: new Date().toISOString(),
          frameCount: frames.length,
          wireBytes,
          captureParametersLine: describeCaptureParameters({ frames, wireBytes }, formatMB),
          outcome: resultNotice.kind,
          noticeText: resultNotice.text,
          transcript: "transcript" in result ? result.transcript : "",
        },
      ]);
    } finally {
      if (runId === runCountRef.current) setBusy(false);
    }
  }, [pendingFrames, busy, takeFrameBatch, provider]);

  const canRun = canRunProbe(pendingFrames, busy);

  // docs/DEV_LOOP.md's downloadable-log rule: rebuilt on every render (cheap
  // - the ref only grows on a real "Run legibility probe" completion) so the
  // on-screen summary and a download click always agree.
  const currentProbeLog = buildLegibilityProbeRunLog(probeRuns);
  const handleDownloadLog = (format: "csv" | "json") => {
    const now = new Date().toISOString();
    const text =
      format === "csv"
        ? formatLegibilityProbeLogCsv(currentProbeLog)
        : formatLegibilityProbeLogJson(currentProbeLog, { exportedAt: now });
    const filename = legibilityProbeLogFileName(format, now);
    const mimeType = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
    triggerFileDownload(new Blob([text], { type: mimeType }), filename);
  };

  return (
    <ModalShell
      label="Legibility probe"
      onDismiss={onClose}
      restoreFocusRef={restoreFocusRef}
      fallbackFocusRefs={fallbackFocusRefs}
      contentStyle={{ width: "min(780px, 95vw)", maxWidth: "none" }}
    >
      <div className={styles.previewHeader}>
        <div>
          <h3>Legibility probe</h3>
          <p className={styles.previewMeta}>
            Capture a real submission page and see exactly what the model reads back - verbatim, with nothing
            inferred and nothing hidden. This does not grade anything and saves nothing once you close it.
          </p>
        </div>
        <button type="button" className={styles.previewCloseButton} onClick={onClose}>
          Close
        </button>
      </div>

      <div className={styles.previewContent}>
        {/* docs/DEV_LOOP.md: "a downloadable log ... displayed in a
            prominent location". Placed first inside the content area, before
            every capture control - never gated on a run having happened
            (canRun/busy/transcript), since a probe that never returned a
            usable answer is exactly when this needs to be reachable without
            hunting - mirrors GradingRecordingPanel.tsx/
            DiscussionRepliesPanel.tsx's own identical placement. */}
        <div className={styles.fieldHint} style={{ margin: "0 0 var(--space-1)", display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <span>{legibilityProbeLogSummaryLine(summarizeLegibilityProbeRunLog(currentProbeLog))}</span>
          <Button size="small" variant="text" style={{ minWidth: 0 }} onClick={() => handleDownloadLog("csv")}>
            Download run log (CSV)
          </Button>
          <Button size="small" variant="text" style={{ minWidth: 0 }} onClick={() => handleDownloadLog("json")}>
            Download run log (JSON)
          </Button>
        </div>
        <div className={styles.ghActions}>
          <Button variant="contained" size="small" onClick={handleStartStop}>
            {capturing ? "Stop capture" : "Start capture"}
          </Button>
          <Button variant="outlined" size="small" onClick={() => void handleRunProbe()} disabled={!canRun}>
            {busy ? "Reading..." : "Run legibility probe"}
          </Button>
        </div>
        <p className={styles.fieldHint}>
          Start a capture, share the window showing the submission, then click &quot;Run legibility probe&quot;
          once it is on screen. You can also stop from your browser&apos;s sharing bar.
        </p>

        <div className={modalStyles.statusRow} aria-hidden="true">
          {/* Rendered unconditionally, never `{capturing && <video ...>}`, for
              the same reason DiscussionRepliesPanel.tsx does this (see its
              own comment): useDiscussionCapture's start() assigns
              previewRef.current.srcObject synchronously, BEFORE it sets
              capturing true, so a conditionally-mounted element would still
              be null at that moment and the assignment would be silently
              skipped. */}
          <video
            ref={previewRef}
            className={modalStyles.previewVideo}
            style={{ display: capturing ? undefined : "none" }}
            autoPlay
            muted
            playsInline
          />
          {capturing && (
            <div className={modalStyles.statusText}>
              <span>{fmt(elapsedSec)}</span>
              <span>{pendingFrames} frame{pendingFrames === 1 ? "" : "s"} queued</span>
            </div>
          )}
        </div>
        {stalled && (
          <p className={styles.error}>
            Nothing new has been read off the screen for 30 seconds. Keep this app&apos;s tab visible in a second
            window while you scroll.
          </p>
        )}

        {notice && (
          // R1a: an empty transcript is deliberately styled and announced
          // exactly like a hard error (role="alert") - it must never read as
          // the same quiet confirmation a real transcription gets. A
          // near-empty one gets the same danger styling, politely announced,
          // since the call did technically complete.
          <p
            className={notice.kind === "success" ? styles.fieldHint : styles.error}
            role={notice.kind === "success" ? "status" : "alert"}
            aria-live={notice.kind === "success" ? "polite" : "assertive"}
          >
            {notice.text}
          </p>
        )}

        {params && (
          <p className={modalStyles.paramsLine}>{describeCaptureParameters(params, formatMB)}</p>
        )}

        {sentFrames.length > 0 && (
          <div className={modalStyles.thumbGrid}>
            {sentFrames.map((f, i) => (
              // A transient data: URI thumbnail of a just-captured frame,
              // never a network asset Next's image pipeline would help with.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                className={modalStyles.thumb}
                src={`data:image/jpeg;base64,${f.base64}`}
                alt={`Captured frame ${i + 1} of ${sentFrames.length} sent to the model`}
              />
            ))}
          </div>
        )}

        {transcript !== null && (
          <div className={styles.field}>
            <label>What the model read back</label>
            <div className={modalStyles.transcript}>{transcript || "(nothing)"}</div>
          </div>
        )}
      </div>

      <div className={styles.previewFooter}>
        <Button variant="outlined" size="small" onClick={onClose}>
          Close
        </Button>
      </div>
    </ModalShell>
  );
}
