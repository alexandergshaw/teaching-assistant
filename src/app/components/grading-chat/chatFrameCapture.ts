// GRADING-CHAT record-a-submission (docs/grading-chat-record-submission-scope.md,
// fork C: frames as images). The instructor shares a screen, frames are sampled
// as JPEGs, and each frame becomes an image File that the composer adds to the
// composite parts tray - so "Grade submission (N)" merges them into ONE row via
// the already-shipped composite path. No new submission kind, no new part type.
//
// Client-safe: imports only react and snapshot-shot's published encode
// constants (snapshot-shot itself imports only the dependency-free
// upload-budget). The capture hook is owner-walk (getDisplayMedia and canvas do
// not exist under vitest); frameToImageFile is the pure, tested leaf.
import { useCallback, useEffect, useRef, useState } from "react";
import { recordGradingDiagnosticEntry } from "@/app/components/grading/gradingDiagnosticLog";
import { MAX_SHOTS, SNAP_JPEG_QUALITY, resolveSnapTargetWidth } from "../snapshot-grading/snapshot-shot";

/** Frame cap. Equals the server's per-composite part cap (12, the
 *  MAX_COMPOSITE_PARTS constant in the intake server action, which cannot be
 *  imported from a server-action module); MAX_SHOTS is the published 12. */
export const MAX_RECORDING_FRAMES = MAX_SHOTS;

/** Milliseconds between sampled frames while recording. */
export const FRAME_SAMPLE_INTERVAL_MS = 3000;

/** Pure: a raw (no "data:" prefix) JPEG base64 string -> an image File.
 *  The .jpg name is load-bearing: the server classifies uploads by extension. */
export function frameToImageFile(base64: string, index: number): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], `screen-recording-${index}.jpg`, { type: "image/jpeg" });
}

/** Fixed, student-free error classes for the single-snap diagnostic. The raw
 *  error text is never recorded (it can carry window titles). */
export type SnapFailureClass = "no frame" | "capture failed";

/** PURE. Map a raw getDisplayMedia / grab error to one fixed class. */
export function classifySnapFailure(err: unknown): SnapFailureClass {
  if (err instanceof Error && err.message === "no frame") return "no frame";
  return "capture failed";
}

/** Record one screenshot-snap outcome. No student data: `error` is always a
 *  SnapFailureClass string. */
export function recordSnapDiagnostic(startedAtMs: number, failure: SnapFailureClass | null): void {
  recordGradingDiagnosticEntry({
    at: new Date().toISOString(),
    operation: "capture_screenshot",
    outcome: failure ? "failure" : "success",
    durationMs: Math.max(0, Math.round(performance.now() - startedAtMs)),
    error: failure ?? undefined,
  });
}

/** Max wait for the shared window's first decodable frame. */
export const SNAP_READY_TIMEOUT_MS = 4000;

/** Draw the video's current frame to a (reused) canvas and return raw JPEG
 *  base64, or null when the video is not ready or has no 2d context. */
function encodeVideoFrame(video: HTMLVideoElement, canvasRef: { current: HTMLCanvasElement | null }): string | null {
  if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
  const width = resolveSnapTargetWidth(video.videoWidth);
  const height = Math.round(video.videoHeight * (width / video.videoWidth));
  const canvas = canvasRef.current ?? document.createElement("canvas");
  canvasRef.current = canvas;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", SNAP_JPEG_QUALITY).split(",")[1] || null;
}

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : "";
}

export interface ChatScreenFrameCapture {
  readonly recording: boolean;
  readonly frameCount: number;
  readonly error: string | null;
  /** Begin sharing and sampling. `maxFrames` is the room left in the tray. */
  readonly start: (maxFrames: number) => Promise<void>;
  /** Stop; the frames captured so far are delivered to onFrames as Files. */
  readonly stop: () => void;
  /** One immediate screenshot: pick a window, wait for the first decodable
   *  frame, deliver ONE image File through onFrames, release the share. */
  readonly snapOnce: () => Promise<void>;
  readonly snapping: boolean;
}

export function useChatScreenFrameCapture(onFrames: (files: File[]) => void): ChatScreenFrameCapture {
  const [recording, setRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [snapping, setSnapping] = useState(false);
  const snapBusyRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const framesRef = useRef<string[]>([]);
  const capRef = useRef(MAX_RECORDING_FRAMES);
  const onFramesRef = useRef(onFrames);
  const mountedRef = useRef(true);
  const finishRef = useRef<(deliver: boolean) => void>(() => {});

  useEffect(() => {
    onFramesRef.current = onFrames;
  });

  const grab = useCallback((): void => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    if (framesRef.current.length >= capRef.current) return;
    const base64 = encodeVideoFrame(video, canvasRef);
    if (!base64) return;
    framesRef.current.push(base64);
    if (mountedRef.current) setFrameCount(framesRef.current.length);
    // Hitting the cap ends the recording rather than silently dropping frames.
    if (framesRef.current.length >= capRef.current) finishRef.current(true);
  }, []);

  const finish = useCallback(
    (deliver: boolean): void => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      if (deliver && videoRef.current && streamRef.current) grab();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      videoRef.current = null;
      const frames = framesRef.current;
      framesRef.current = [];
      if (mountedRef.current) {
        setRecording(false);
        setFrameCount(0);
      }
      if (deliver && frames.length > 0) {
        onFramesRef.current(frames.map((base64, i) => frameToImageFile(base64, i + 1)));
      }
    },
    [grab]
  );

  useEffect(() => {
    finishRef.current = finish;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      finishRef.current(false);
    };
  }, []);

  const start = useCallback(
    async (maxFrames: number): Promise<void> => {
      if (streamRef.current) return;
      setError(null);
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "window" }, audio: false });
      } catch (err) {
        // A cancelled picker is not a failure.
        if (errorName(err) === "NotAllowedError") return;
        setError(err instanceof Error ? err.message : "Could not start the screen share.");
        return;
      }
      streamRef.current = stream;
      capRef.current = Math.max(1, Math.min(MAX_RECORDING_FRAMES, maxFrames));
      framesRef.current = [];
      stream.getVideoTracks()[0]?.addEventListener("ended", () => finishRef.current(true), { once: true });
      // A detached sampling video, never attached to the DOM.
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      videoRef.current = video;
      void video.play().catch(() => {});
      timerRef.current = setInterval(grab, FRAME_SAMPLE_INTERVAL_MS);
      setRecording(true);
      setFrameCount(0);
    },
    [grab]
  );

  const stop = useCallback((): void => finish(true), [finish]);

  const snapOnce = useCallback(async (): Promise<void> => {
    if (streamRef.current || snapBusyRef.current) return;
    snapBusyRef.current = true;
    setError(null);
    setSnapping(true);
    const startedAt = performance.now();
    let stream: MediaStream | null = null;
    try {
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "window" }, audio: false });
      } catch (err) {
        // A cancelled picker is not a failure and records nothing.
        if (errorName(err) === "NotAllowedError") return;
        throw err;
      }
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      void video.play().catch(() => {});
      // Readiness gate: a frame can only be encoded once readyState >= 2.
      const deadline = performance.now() + SNAP_READY_TIMEOUT_MS;
      while ((video.readyState < 2 || !video.videoWidth || !video.videoHeight) && performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const base64 = encodeVideoFrame(video, canvasRef);
      if (!base64) throw new Error("no frame");
      onFramesRef.current([frameToImageFile(base64, 1)]);
      recordSnapDiagnostic(startedAt, null);
    } catch (err) {
      recordSnapDiagnostic(startedAt, classifySnapFailure(err));
      if (mountedRef.current) setError("Could not capture a screenshot. Try again.");
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      snapBusyRef.current = false;
      if (mountedRef.current) setSnapping(false);
    }
  }, []);

  return { recording, frameCount, error, start, stop, snapOnce, snapping };
}
