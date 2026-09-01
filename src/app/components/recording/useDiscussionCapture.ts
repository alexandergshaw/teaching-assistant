"use client";

// C1 of the discussion-reply-capture split (docs/discussion-reply-capture-
// acceptance-criteria.md section 12). Owns everything with a DEVICE lifetime:
// getDisplayMedia, the detached sampling video (AC8b), the DOM preview video,
// the track `ended` listener (AC6), one idempotent teardown() (AC48), the
// Worker-backed ticker (AC8), the offscreen canvases (AC8a, AC9a), the
// signature + threshold + keep-interval gates (AC8d), the pending frame queue
// with backpressure (AC10), takeFrameBatch (AC10a), elapsedSec, stall
// detection (AC8c), and the optional MediaRecorder with its Blob and object
// URL (AC31). It knows nothing about rows, replies, the LLM, or localStorage
// - that is C2 (useReplyRows.ts) and C3 (useDiscussionReplies.ts).

import { useCallback, useEffect, useRef, useState } from "react";
import { startFrameTicker } from "@/lib/frame-ticker";
import type { FrameTicker } from "@/lib/frame-ticker";
import {
  FRAME_SAMPLE_INTERVAL_MS,
  FRAME_MIN_KEEP_INTERVAL_MS,
  FRAME_JPEG_QUALITY,
  SIGNATURE_GRID,
  FRAME_CHANGE_THRESHOLD,
  MAX_PENDING_FRAMES,
  STALL_NOTICE_TICKS,
  EXTRACT_BATCH_WIRE_BUDGET,
  computeFrameSignature,
  framesDifferEnough,
  resolveTargetWidth,
  packFrameBatch,
} from "./discussion-capture";
import type { FrameSignature, CapturedFrame } from "./discussion-capture";

export interface UseDiscussionCaptureReturn {
  capturing: boolean;
  elapsedSec: number;
  pendingFrames: number;
  stalled: boolean;
  /** AC10: session-level count of frames dropped to backpressure. Drives the
   *  stop-time "scrolled past faster than it could be read" notice. Without
   *  this on the interface the loss is invisible, which is the defect AC10
   *  exists to prevent. React state (not a bare ref) - the UI must re-render
   *  when it changes. */
  droppedFrames: number;
  /** AC31: why the optional MediaRecorder failed to start, or null. Capture
   *  continues regardless - but the reason must reach the user, not a
   *  console.warn. Already the fully-formatted AC63 message ("Could not save
   *  the recording: <reason>. The capture is still running."). */
  recordingError: string | null;
  recordingUrl: string | null;
  recordingBytes: number;
  /** AC10b/S5: a single kept frame that alone exceeds
   *  EXTRACT_BATCH_WIRE_BUDGET (even after a half-quality re-encode) was
   *  dropped, and this is why - forwarded into `notices` by the
   *  orchestrator (useDiscussionReplies.ts), same channel and dedupe
   *  discipline as `recordingError`. */
  frameEncodeNotice: string | null;
  previewRef: React.RefObject<HTMLVideoElement | null>;
  start: (opts: { saveVideo: boolean }) => Promise<void>;
  stop: () => void;
  /** Removes and returns up to `max` frames, oldest first, packed to fit
   *  `maxWireBytes` (AC10a). Never returns more than asked for; always
   *  returns at least one frame when the queue is non-empty. Each frame
   *  carries the REAL parameters it was encoded with (CapturedFrame) - not
   *  just `base64` - so a caller that needs to report what actually happened
   *  (LegibilityProbeModal.tsx) never has to re-derive it from a nominal
   *  constant read at a different time than the encode. */
  takeFrameBatch: (max: number, maxWireBytes: number) => CapturedFrame[];
  clearRecording: () => void;
}

// AC31's fallback chain, tested with MediaRecorder.isTypeSupported, falling
// back to no mimeType option when nothing in the list is supported.
const RECORDER_MIME_TYPES = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of RECORDER_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

function errorName(err: unknown): string {
  if (err instanceof Error) return err.name;
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

export function useDiscussionCapture(): UseDiscussionCaptureReturn {
  const [capturing, setCapturing] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [pendingFrames, setPendingFrames] = useState(0);
  const [stalled, setStalled] = useState(false);
  const [droppedFrames, setDroppedFrames] = useState(0);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingBytes, setRecordingBytes] = useState(0);
  const [frameEncodeNotice, setFrameEncodeNotice] = useState<string | null>(null);

  const previewRef = useRef<HTMLVideoElement | null>(null);

  // Lifecycle / mount guards (AC50).
  const mountedRef = useRef(false);
  const tearingDownRef = useRef(false);
  const teardownRef = useRef<() => void>(() => {});

  // Session resources.
  const displayStreamRef = useRef<MediaStream | null>(null);
  const samplingVideoRef = useRef<HTMLVideoElement | null>(null);
  const tickerRef = useRef<FrameTicker | null>(null);
  const startedAtRef = useRef(0);
  const capturingRef = useRef(false);

  // Offscreen canvases (AC8a full-width draw, AC9a dedicated 32x32 signature
  // canvas), created lazily once and reused across sessions.
  const fullCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sigCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Change-detection and keep-interval gates (AC8d). lastSignatureRef holds
  // the signature of the last KEPT frame only - not a rolling per-tick
  // baseline - so framesDifferEnough(null, first) is trivially true and a
  // frame that clears the threshold but not the keep-interval gate leaves
  // the baseline untouched for the next tick to re-check against.
  const lastSignatureRef = useRef<FrameSignature | null>(null);
  const lastKeepAtRef = useRef(0);

  // Stall detection (AC8c / BL6). `trackMutedRef` is the PRIMARY signal -
  // the spec's own channel for "the source temporarily stopped producing
  // frames" (the track's own `muted` property plus the `mute`/`unmute`
  // events, wired in `start()` below). `lastMediaTimeRef`/`currentTime` is
  // kept as a SECONDARY signal: on a MediaStream video, `currentTime`
  // advances "linearly in real time" while the element is merely
  // "potentially playing", so a source that silently stops delivering
  // frames without the track itself reporting muted would never trip a
  // currentTime-only check - a false negative on exactly the scenario this
  // detector exists for.
  const lastMediaTimeRef = useRef(-1);
  const stallTicksRef = useRef(0);
  const trackMutedRef = useRef(false);

  // Pending frame queue + backpressure (AC10). Non-React bookkeeping in a
  // ref, mutated in the tick handler, never inside a setState updater
  // (AC42). droppedFramesRef is the source of truth mutated synchronously in
  // the handler; the `droppedFrames` state above is mirrored from it on
  // every increment purely so the UI re-renders (F4 - a bare ref never does).
  const pendingQueueRef = useRef<CapturedFrame[]>([]);
  const droppedFramesRef = useRef(0);

  // Optional MediaRecorder (AC31, AC48, AC49).
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingUrlRef = useRef<string | null>(null);

  const revokeRecordingUrl = useCallback(() => {
    if (recordingUrlRef.current) {
      URL.revokeObjectURL(recordingUrlRef.current);
      recordingUrlRef.current = null;
    }
  }, []);

  const clearRecording = useCallback(() => {
    revokeRecordingUrl();
    setRecordingUrl(null);
    setRecordingBytes(0);
  }, [revokeRecordingUrl]);

  // AC8, AC8b, AC8c, AC8d, AC9, AC9a, AC10: the ticker callback. Runs off a
  // Worker message, at FRAME_SAMPLE_INTERVAL_MS (500ms - two ticks a second,
  // guaranteeing 300px of overlap against any capture viewport during a
  // normal skim).
  const handleTick = useCallback(() => {
    if (!mountedRef.current) return;

    const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
    setElapsedSec((prev) => (prev === elapsed ? prev : elapsed));

    // AC8b: sample from the DETACHED video, never the DOM preview - a
    // frozen frame there would produce an identical signature and be
    // silently suppressed by change detection.
    const video = samplingVideoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

    // AC8c/BL6: a tick counts toward the stall notice when EITHER the track
    // reports muted (the primary signal) OR currentTime has not advanced
    // since the last tick (the original signal, kept as a secondary
    // backstop - see the refs above for why neither is sufficient alone).
    // Either way, this is a duplicate/no-frame tick: skip the encode
    // entirely (a free win). `lastMediaTimeRef` is always updated to the
    // latest reading first, so the NEXT tick's advance check stays correct
    // once muted clears.
    const mediaTime = video.currentTime;
    const timeAdvanced = mediaTime !== lastMediaTimeRef.current;
    lastMediaTimeRef.current = mediaTime;

    if (trackMutedRef.current || !timeAdvanced) {
      stallTicksRef.current += 1;
      if (stallTicksRef.current === STALL_NOTICE_TICKS) {
        setStalled(true);
      }
      return;
    }
    if (stallTicksRef.current !== 0) {
      stallTicksRef.current = 0;
      setStalled((prev) => (prev ? false : prev));
    }

    // AC9a: the signature comes from a DEDICATED 32x32 canvas, drawn on
    // every real tick - never a getImageData readback on the full-size
    // canvas, which only happens for a frame that clears both keep gates.
    const sigCtx = sigCtxRef.current;
    if (!sigCtx) return;
    sigCtx.drawImage(video, 0, 0, SIGNATURE_GRID, SIGNATURE_GRID);
    const imageData = sigCtx.getImageData(0, 0, SIGNATURE_GRID, SIGNATURE_GRID);
    const signature = computeFrameSignature(imageData.data, SIGNATURE_GRID, SIGNATURE_GRID);

    if (!framesDifferEnough(lastSignatureRef.current, signature, FRAME_CHANGE_THRESHOLD)) {
      return;
    }

    const now = Date.now();
    if (now - lastKeepAtRef.current < FRAME_MIN_KEEP_INTERVAL_MS) {
      // Content changed enough, but the keep interval has not elapsed.
      // Deliberately do NOT update lastSignatureRef here - the next tick
      // re-checks against the same last-kept baseline.
      return;
    }

    // Both gates cleared: this frame is kept. Update the baseline first.
    lastSignatureRef.current = signature;
    lastKeepAtRef.current = now;

    // LP3 FIX: read the source dimensions ONCE, here, at the moment this
    // frame is actually drawn - and carry them (and the target/encode
    // parameters derived from them) on the frame itself. A probe or any
    // other consumer reading these off a live <video> later would be
    // reading CURRENT preview state, not what THIS frame was encoded with -
    // wrong the instant a window resizes or the display changes between
    // capture and read.
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const targetWidth = resolveTargetWidth(sourceWidth);
    const targetHeight = Math.round(sourceHeight * (targetWidth / sourceWidth));

    let canvas = fullCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      fullCanvasRef.current = canvas;
      fullCtxRef.current = canvas.getContext("2d");
    }
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    const fullCtx = fullCtxRef.current;
    if (!fullCtx) return;
    fullCtx.drawImage(video, 0, 0, targetWidth, targetHeight);

    const dataUrl = canvas.toDataURL("image/jpeg", FRAME_JPEG_QUALITY);
    let base64 = dataUrl.split(",")[1] ?? "";
    if (!base64) return;
    // LP3 FIX: the quality this frame actually ends up encoded at -
    // FRAME_JPEG_QUALITY unless the re-encode branch below fires, in which
    // case it becomes FRAME_JPEG_QUALITY / 2. Carried on the frame itself
    // (CapturedFrame.encodedQuality) so a consumer reports THIS frame's real
    // quality, never a nominal constant that is wrong for exactly the
    // over-budget frames the legibility probe exists to diagnose.
    let encodedQuality = FRAME_JPEG_QUALITY;

    // AC10b/S5: a single frame that alone exceeds the per-batch wire budget
    // wedges the queue head - AC10a always sends at least one frame, even
    // an oversized one, so every batch after this one would starve behind
    // it for the rest of the session. Re-encode once at half quality before
    // giving up on it.
    if (base64.length > EXTRACT_BATCH_WIRE_BUDGET) {
      const halfQualityUrl = canvas.toDataURL("image/jpeg", FRAME_JPEG_QUALITY / 2);
      const halfQualityBase64 = halfQualityUrl.split(",")[1] ?? "";
      if (halfQualityBase64 && halfQualityBase64.length <= EXTRACT_BATCH_WIRE_BUDGET) {
        base64 = halfQualityBase64;
        encodedQuality = FRAME_JPEG_QUALITY / 2;
      } else {
        setFrameEncodeNotice(
          "One captured frame was too large to send even after re-encoding it at a lower quality, and was dropped."
        );
        return;
      }
    }

    // AC10: backpressure. If the queue is already full, drop this frame
    // and count it - never throw the newest frame's content away silently.
    if (pendingQueueRef.current.length >= MAX_PENDING_FRAMES) {
      droppedFramesRef.current += 1;
      setDroppedFrames(droppedFramesRef.current);
      return;
    }
    pendingQueueRef.current.push({ base64, sourceWidth, sourceHeight, encodedWidth: targetWidth, encodedHeight: targetHeight, encodedQuality });
    setPendingFrames(pendingQueueRef.current.length);
  }, []);

  // AC48: one idempotent teardown. All three triggers (Stop button, the
  // "ended" event, unmount) call it through teardownRef, never directly, so
  // the unmount effect can have [] deps.
  const teardown = useCallback(() => {
    if (tearingDownRef.current) return;
    tearingDownRef.current = true;
    try {
      tickerRef.current?.stop();
      tickerRef.current = null;

      const stream = displayStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        displayStreamRef.current = null;
      }

      // AC48 (verified 2026-08-31 against the spec): MediaRecorder.stop() on
      // an already-inactive recorder does NOT throw - MDN says otherwise and
      // is incorrect. The `state !== "inactive"` check below is kept anyway
      // as harmless defence, not as crash prevention: it is still the
      // cheapest way to skip a pointless call on the common path (teardown
      // running after the recorder already stopped itself), and costs
      // nothing on the double-call case this guards - a manual Stop after
      // the browser's own sharing bar already fired "ended". track.stop()
      // does not fire "ended", so our own teardown never re-enters through
      // the listener either way.
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      // Safe to drop the ref here: onstop's closure captured the local
      // `recorder` variable from start(), not this ref, so nulling it does
      // not affect the pending onstop callback (AC49 - chunksRef is never
      // touched here either).
      recorderRef.current = null;

      if (samplingVideoRef.current) {
        samplingVideoRef.current.pause();
        samplingVideoRef.current.srcObject = null;
        samplingVideoRef.current = null;
      }
      if (previewRef.current) {
        previewRef.current.pause();
        previewRef.current.srcObject = null;
      }

      lastMediaTimeRef.current = -1;
      stallTicksRef.current = 0;
      trackMutedRef.current = false;

      // Deliberately NOT cleared: pendingQueueRef (AC6/AC51 - the
      // extraction loop outlives capturing===false and drains it to
      // empty) and droppedFramesRef (the session summary reads it after
      // stop).
      if (mountedRef.current) {
        setCapturing(false);
      }
      capturingRef.current = false;
    } finally {
      tearingDownRef.current = false;
    }
  }, []);

  useEffect(() => {
    teardownRef.current = teardown;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      teardownRef.current();
      // AC31: revoked on unmount, but NOT on a plain session stop - the
      // user may still want to download a recording after Stop.
      revokeRecordingUrl();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async (opts: { saveVideo: boolean }) => {
    if (capturingRef.current) return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 5 } },
        audio: false,
      });
    } catch (err) {
      // AC5: a cancelled picker is not a failure - return to idle with no
      // error banner. Any other rejection propagates for the caller to
      // surface as "Could not start the screen capture: <reason>".
      if (errorName(err) === "NotAllowedError") return;
      throw err;
    }

    displayStreamRef.current = stream;

    // Reset per-session bookkeeping.
    pendingQueueRef.current = [];
    setPendingFrames(0);
    droppedFramesRef.current = 0;
    setDroppedFrames(0);
    setRecordingError(null);
    setFrameEncodeNotice(null);
    lastSignatureRef.current = null;
    lastKeepAtRef.current = 0;
    lastMediaTimeRef.current = -1;
    stallTicksRef.current = 0;
    trackMutedRef.current = false;
    setStalled(false);
    startedAtRef.current = Date.now();
    setElapsedSec(0);

    // AC31: a new session revokes any prior recording's object URL,
    // whether or not this session itself saves a video.
    revokeRecordingUrl();
    setRecordingUrl(null);
    setRecordingBytes(0);
    chunksRef.current = [];

    const track = stream.getVideoTracks()[0];
    if (track) {
      track.addEventListener("ended", () => teardownRef.current(), { once: true });
      // BL6/AC8c: `track.muted` + the `mute`/`unmute` events are the spec's
      // own channel for "the source temporarily stopped producing frames" -
      // the PRIMARY stall signal, checked every tick in handleTick above.
      // Seed the ref from the track's current state (it can start muted)
      // rather than assuming false.
      trackMutedRef.current = track.muted;
      track.addEventListener("mute", () => {
        trackMutedRef.current = true;
      });
      track.addEventListener("unmute", () => {
        trackMutedRef.current = false;
      });
    }

    // AC8b: the sampling source is a DETACHED video element, never
    // attached to the DOM. usePipWebcam.ts:129-136 is the proven idiom.
    const samplingVideo = document.createElement("video");
    samplingVideo.muted = true;
    samplingVideo.playsInline = true;
    samplingVideo.srcObject = stream;
    samplingVideoRef.current = samplingVideo;
    void samplingVideo.play().catch(() => {});

    // A second, separate <video> for the visible 200px preview. If it
    // stalls while the tab is hidden, nothing is lost - it is decoration.
    if (previewRef.current) {
      previewRef.current.srcObject = stream;
      void previewRef.current.play().catch(() => {});
    }

    if (!sigCanvasRef.current) {
      const sigCanvas = document.createElement("canvas");
      sigCanvas.width = SIGNATURE_GRID;
      sigCanvas.height = SIGNATURE_GRID;
      sigCanvasRef.current = sigCanvas;
      sigCtxRef.current = sigCanvas.getContext("2d", { willReadFrequently: true });
    }

    if (opts.saveVideo) {
      try {
        const mimeType = pickRecorderMimeType();
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorder.ondataavailable = (evt) => {
          if (evt.data.size > 0) chunksRef.current.push(evt.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "video/webm" });
          const url = URL.createObjectURL(blob);
          if (mountedRef.current) {
            recordingUrlRef.current = url;
            setRecordingUrl(url);
            setRecordingBytes(blob.size);
          } else {
            URL.revokeObjectURL(url);
          }
        };
        recorder.start();
        recorderRef.current = recorder;
      } catch (err) {
        // AC31/F4: the capture is the point and must not die with the
        // optional extra, but the reason must still reach the user rather
        // than vanish into a console.warn - AC63's exact string, fully
        // formatted here so the orchestrator only has to forward it.
        setRecordingError(
          `Could not save the recording: ${err instanceof Error ? err.message : "unknown error"}. The capture is still running.`
        );
        recorderRef.current = null;
      }
    }

    tickerRef.current = startFrameTicker(1000 / FRAME_SAMPLE_INTERVAL_MS, handleTick);

    capturingRef.current = true;
    if (mountedRef.current) setCapturing(true);
  }, [handleTick, revokeRecordingUrl]);

  const stop = useCallback(() => {
    teardownRef.current();
  }, []);

  // BL4: delegates to discussion-capture.ts's tested, pure `packFrameBatch`
  // instead of an inline reimplementation of the same oldest-first/byte-
  // budget packing rule - the two had not diverged in behaviour yet, but kept
  // side by side as separate hand-written copies they inevitably would; one
  // owner for the packing rule is what BL4 asks for. This is the stateful
  // half (removing the packed frames from the live queue); the packing
  // decision itself is the tested pure function.
  const takeFrameBatch = useCallback((max: number, maxWireBytes: number): CapturedFrame[] => {
    const queue = pendingQueueRef.current;
    const batch = packFrameBatch(queue, max, maxWireBytes);
    pendingQueueRef.current = queue.slice(batch.length);
    setPendingFrames(pendingQueueRef.current.length);
    return batch;
  }, []);

  return {
    capturing,
    elapsedSec,
    pendingFrames,
    stalled,
    droppedFrames,
    recordingError,
    recordingUrl,
    recordingBytes,
    frameEncodeNotice,
    previewRef,
    start,
    stop,
    takeFrameBatch,
    clearRecording,
  };
}
