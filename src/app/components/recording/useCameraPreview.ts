"use client";

// T2: this hook exists ONLY to drive a live camera+mic preview for the
// teleprompter rehearsal surface (see
// docs/teleprompter-mode-acceptance-criteria.md, T2/T4/T7). It must NEVER
// record: there is no MediaRecorder anywhere in this file, canvasRef below
// is never fed into captureStream() for a take, nothing here uploads or
// writes to Supabase, and no file is ever produced. The camera and mic
// streams exist solely to paint the on-screen preview canvas (T7) and to
// drive a mic-level meter, and are torn down by stop().
//
// T4: this is a NEW, separate hook - NOT an extraction out of useRecorder.ts.
// The acceptance-criteria doc's T4 explains why that extraction plan was
// abandoned before implementation: six getUserMedia call sites already exist
// in this codebase (useRecorder, useDevices's permission probe, usePipWebcam,
// useAvatarCapture, useLiveTranscription, useVoiceCloning), so "one preview
// path" is a new invariant a refactor would impose, not the status quo being
// protected; useAvatarCapture.ts is the direct precedent, and it went this
// same separate-hook way rather than sharing useRecorder's preview path; and
// useRecorder.ts is 601 lines underpinning the entire Recording tab, which
// has zero behavioural tests, so refactoring it to serve this feature would
// be unguarded risk for no reader-visible benefit. useRecorder.ts,
// StagePanel.tsx and SourceDevicesPanel.tsx are not touched by this file.
//
// T7: useRecorder's preview shows the RAW stream in a <video> - the
// background-effect canvas built by useCanvasPipeline.ts only ever gets
// painted once a recording's MediaRecorder starts consuming it via
// canvas.captureStream(30), so blur is invisible until a take is already
// underway. This hook instead drives canvasRef's frame loop itself, with
// startFrameTicker (the same mechanism useCanvasPipeline.ts uses) calling
// useBackgroundEffect's applyBackgroundEffect every tick - with no recorder
// anywhere nearby - so the instructor sees the blurred image live, in
// rehearsal, which is what was actually asked for.

import { useCallback, useEffect, useRef, useState } from "react";
import { startFrameTicker } from "@/lib/frame-ticker";
import type { FrameTicker } from "@/lib/frame-ticker";
import { startAudioLevelMeter } from "@/lib/audio-level-meter";
import type { AudioLevelMeter } from "@/lib/audio-level-meter";
import { useBackgroundEffect } from "./useBackgroundEffect";

// Reused verbatim from useDevices.ts (useDevices.ts:25,58 - see the
// acceptance-criteria doc's finding 3 and T5) so an instructor sees the SAME
// wording here as in the Recording tab's device pickers, rather than a
// second, subtly different message invented for this hook.
const SECURE_CONTEXT_ERROR =
  "Camera and microphone are disabled on insecure pages. Open the app over HTTPS or at http://localhost - browsers block media devices on plain-HTTP addresses (e.g. a LAN IP).";
const NO_MEDIA_DEVICES_ERROR =
  "This browser does not expose camera/microphone APIs on this page (no navigator.mediaDevices). Use HTTPS or localhost in a modern browser.";

// Pure, so directly testable in the node-env vitest suite with no browser
// API involved - see the acceptance-criteria doc's "Limits" section on why
// almost nothing else in this file can be. Kept as a standalone export
// rather than inlined into start() for exactly that reason; no test file is
// added by this change, but a future one could import these three directly.
export function buildCameraPreviewConfigSignature(cameraId: string, micId: string): string {
  return `${cameraId}|${micId}`;
}

export function buildCameraPreviewConstraints(cameraId: string, micId: string): MediaStreamConstraints {
  return {
    video: {
      deviceId: cameraId ? { exact: cameraId } : undefined,
    },
    audio: micId === "off" ? false : micId ? { deviceId: { exact: micId } } : true,
  };
}

// Reuses useDevices.ts's requestAccess() wording (useDevices.ts:94-105) for
// the permission-failure cases, since that is this hook's closest sibling
// for "the user just tried to open the camera and it failed".
export function describeCameraPreviewError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") {
    return "Access was blocked. Click the camera icon in the address bar (or the browser's site settings) and allow camera and microphone, then try again.";
  }
  if (name === "NotFoundError") {
    return "The operating system reports no camera or microphone. Check that devices are connected and not disabled in OS privacy settings.";
  }
  if (name === "NotReadableError") {
    return "A camera or microphone is in use by another application. Close it and try again.";
  }
  return err instanceof Error
    ? `Could not start the camera preview: ${err.message}`
    : "Could not get camera/microphone access. Use HTTPS or localhost and check the browser's site permissions.";
}

export interface UseCameraPreviewReturn {
  // Caller renders a <video ref={videoRef} muted playsInline autoPlay /> -
  // it is only the raw decode source the preview canvas is painted from
  // every frame; it does not itself need to be visible. canvasRef below is
  // what the instructor actually sees (T7).
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  // Caller mounts this canvas in the DOM. Painted every frame from
  // videoRef via applyBackgroundEffect, so blur (when bgMode === "blur") is
  // visible here even though nothing is being recorded (T7).
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  hasStream: boolean;
  error: string | null;
  bgMode: "none" | "blur" | "image";
  setBgMode: (mode: "none" | "blur" | "image") => void;
  // MediaPipe's segmenter model loads from a CDN and can fail - surfaced
  // here rather than swallowed, per T7.
  bgStatus: "idle" | "loading" | "ready" | "failed";
  // Mic level meter, 0..1. Literally the same rms-quantized implementation
  // useRecorder drives its level bar with - both call startAudioLevelMeter
  // (src/lib/audio-level-meter.ts) rather than each keeping a copy.
  level: number;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Camera+mic PREVIEW ONLY for the teleprompter rehearsal surface - see the
 * header comment above for the T2/T4/T7 boundaries this hook exists inside.
 * `cameraId`/`micId` are this hook's OWN device selection, threaded in
 * explicitly by the caller (mirroring useAvatarCapture(cameraId, micId)),
 * never read from context or a module singleton. The stream is re-opened
 * whenever either changes while a preview is already running.
 */
export function useCameraPreview(cameraId: string, micId: string): UseCameraPreviewReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // One handle, not four refs. The AudioContext/AnalyserNode/rAF id and the
  // last-reported level all now live inside startAudioLevelMeter
  // (src/lib/audio-level-meter.ts); this hook only holds the stop handle.
  const meterRef = useRef<AudioLevelMeter | null>(null);

  const tickerRef = useRef<FrameTicker | null>(null);

  // Config the current stream was opened with - mirrors useRecorder.ts's
  // appliedCfgRef (useRecorder.ts:81,272,314), so the re-open effect below
  // only reacts to a real device change, not to every render.
  const appliedCfgRef = useRef("");
  const startingRef = useRef(false);

  const [hasStream, setHasStream] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);

  const { bgMode, setBgMode, bgStatus, applyBackgroundEffect } = useBackgroundEffect({ source: "camera" });

  const stopMeter = useCallback(() => {
    meterRef.current?.stop();
    meterRef.current = null;
  }, []);

  // Was a byte-for-byte copy of useRecorder.ts's meter, down to the comment
  // above pointing at that file's line numbers. Both now call the one shared
  // implementation. The amplify-quantize-dedupe arithmetic did not change -
  // only who owns the AudioContext, the AnalyserNode and the rAF handle. The
  // "only report an actual change" dedupe that kept a 60fps meter from
  // re-rendering the whole tab every frame lives inside the shared module
  // now, which is why this hook no longer needs a level ref of its own.
  const startMeter = useCallback(
    (stream: MediaStream) => {
      stopMeter();
      meterRef.current = startAudioLevelMeter(stream, setLevel, "camera preview level meter");
    },
    [stopMeter]
  );

  const stopTicker = useCallback(() => {
    tickerRef.current?.stop();
    tickerRef.current = null;
  }, []);

  const startTicker = useCallback(() => {
    stopTicker();
    tickerRef.current = startFrameTicker(30, () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video || video.readyState < 2) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // T7: this loop is the entire structural fix described in the header
      // comment - it runs unconditionally once start() succeeds, with no
      // recorder and no captureStream() anywhere nearby.
      const src = applyBackgroundEffect(video, canvas.width, canvas.height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    });
  }, [applyBackgroundEffect, stopTicker]);

  const stop = useCallback(() => {
    // Teardown order copied EXACTLY from useRecorder.ts's stopEverything
    // (useRecorder.ts:171-206): stop tracks, null the stream ref, null the
    // video element's srcObject, cancel the level-meter rAF, close the
    // AudioContext. A leaked camera light - a track still running after the
    // instructor believes they have left the preview - is the failure users
    // notice most, and this order is the part that is easy to get subtly
    // wrong, so it is not reinvented here.
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject !== null) {
      videoRef.current.srcObject = null;
    }
    stopMeter(); // cancels the level-meter rAF and closes the AudioContext
    // Not part of useRecorder's stopEverything (this hook's frame loop has
    // no equivalent there), but occupies the same slot in the sequence as
    // that function's own stopPipeline() call - stopped after the stream
    // and meter, before any state reset.
    stopTicker();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasStream(false);
  }, [stopMeter, stopTicker]);

  const start = useCallback(async () => {
    // Guards against a re-entrant double-click the way
    // useAvatarCapture.ts's startCapturePreview does (its "defect 1" guard) -
    // startingRef flips synchronously, before any await, since hasStream
    // only flips true after the getUserMedia round trip resolves.
    if (startingRef.current) return;
    startingRef.current = true;
    setError(null);
    stop();
    try {
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setError(SECURE_CONTEXT_ERROR);
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(NO_MEDIA_DEVICES_ERROR);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia(buildCameraPreviewConstraints(cameraId, micId));
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      appliedCfgRef.current = buildCameraPreviewConfigSignature(cameraId, micId);

      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack?.getSettings?.();
      const w = settings?.width ?? 1280;
      const h = settings?.height ?? 720;
      if (canvasRef.current) {
        canvasRef.current.width = w;
        canvasRef.current.height = h;
      }

      setHasStream(true);
      startMeter(stream);
      startTicker();

      videoTrack?.addEventListener("ended", () => {
        stop();
      });
    } catch (err) {
      setError(describeCameraPreviewError(err));
      stop();
    } finally {
      startingRef.current = false;
    }
  }, [cameraId, micId, stop, startMeter, startTicker]);

  // Re-open the stream when the selected camera or mic changes while a
  // preview is already running - mirrors useRecorder.ts's restart effect
  // (useRecorder.ts:313-318). Never fires before the caller has explicitly
  // called start() once (T3: entering preview is explicit), since
  // appliedCfgRef starts empty and hasStream starts false.
  useEffect(() => {
    if (!hasStream) return;
    const cfg = buildCameraPreviewConfigSignature(cameraId, micId);
    if (appliedCfgRef.current !== cfg) {
      void start();
    }
  }, [cameraId, micId, hasStream, start]);

  // Unmount cleanup. stop()'s own dependencies (stopMeter, stopTicker) never
  // change identity across renders, so stop() itself is stable and this
  // cleanup fires only on true unmount, not on every re-render - the same
  // guarantee useRecorder.ts/useAvatarStudio.ts get from routing through a
  // stopEverythingRef, without needing a second ref here since there is no
  // composition root yet for this hook to hand one to.
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    videoRef,
    canvasRef,
    hasStream,
    error,
    bgMode,
    setBgMode,
    bgStatus,
    level,
    start,
    stop,
  };
}
