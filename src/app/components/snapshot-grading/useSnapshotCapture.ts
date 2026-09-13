"use client";

// Snapshot grading, WAVE 4 (docs/snapshot-grading-acceptance-criteria.md).
// Owns the ONE live share and everything with a device lifetime: the
// getDisplayMedia stream, the detached sampling video (X7), the DOM preview
// video, the track "ended" listener (A6), one idempotent teardown (A6a), and
// the canvas encode both a live snap (captureFrame) and a pasted/dropped
// file (encodeFile) go through. It knows nothing about the tray, roles, or
// localStorage - that is useSnapshotShots.ts.
//
// X2/A7b: getDisplayMedia called DIRECTLY, exactly as
// useDiscussionCapture.ts:387 does - NOT requestScreenShareStream
// (screen-source.ts), whose SCREEN_SHARE_CONSTRAINTS pin
// displaySurface:"monitor" and request system audio, neither of which a
// screenshot tool has any business asking for. `{ video: { displaySurface:
// "window" }, audio: false }` hints the browser's picker toward a window
// rather than the whole screen - the privacy cost of an incidental capture
// of the instructor's mail or another student's name (A7b) is real and there
// is no redaction capability anywhere in this repo to fix it after the fact.
//
// A6/A6a: teardown replicates useDiscussionCapture.ts:307-364 SELECTIVELY -
// the tearingDownRef re-entrancy guard, stream.getTracks().forEach(t =>
// t.stop()), the preview video's pause()+srcObject=null, and the
// mountedRef/teardownRef indirection that lets the unmount effect keep empty
// deps while still calling the latest closure. Deliberately NOT copied: the
// MediaRecorder half (nothing is recorded here) and the frame ticker (there
// is no ticker - a Snap is one synchronous draw, not a sampled stream).
// Teardown stops the stream and NOTHING ELSE - it never touches the tray,
// which lives entirely in the sibling hook.

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveSnapTargetWidth, SNAP_JPEG_QUALITY } from "./snapshot-shot";

export interface UseSnapshotCaptureReturn {
  sharing: boolean;
  shareError: string | null;
  previewRef: React.RefObject<HTMLVideoElement | null>;
  start: () => Promise<void>;
  stop: () => void;
  /** X7: draws the current frame from the DETACHED sampling video, never the
   *  DOM preview - a hidden preview subtree stops compositing in Chrome and
   *  would yield a stale or blank frame. Returns JPEG base64 (no "data:"
   *  prefix) at the encoding decision's quality/width cap, or null when
   *  there is no live, ready video to snap from. */
  captureFrame: () => string | null;
  /** A1c / "the encoding decision": re-encodes a pasted or dropped image
   *  file through the SAME canvas, so every byte leaving the client for
   *  every shot - captured, pasted, or dropped - is JPEG at the same
   *  quality/width cap. Never passes a PNG through untouched. Returns null
   *  when the file cannot be decoded as an image. */
  encodeFile: (file: File) => Promise<string | null>;
}

function errorName(err: unknown): string {
  if (err instanceof Error) return err.name;
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

export function useSnapshotCapture(): UseSnapshotCaptureReturn {
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const previewRef = useRef<HTMLVideoElement | null>(null);

  const mountedRef = useRef(false);
  const tearingDownRef = useRef(false);
  const teardownRef = useRef<() => void>(() => {});

  const streamRef = useRef<MediaStream | null>(null);
  const samplingVideoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // A6/A6a: one idempotent teardown. The stream dying (Stop button, the
  // browser's own "ended" event, or unmount) stops the stream and NOTHING
  // ELSE - the tray (a separate hook's state) is never touched here.
  const teardown = useCallback(() => {
    if (tearingDownRef.current) return;
    tearingDownRef.current = true;
    try {
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (samplingVideoRef.current) {
        samplingVideoRef.current.pause();
        samplingVideoRef.current.srcObject = null;
        samplingVideoRef.current = null;
      }
      if (previewRef.current) {
        previewRef.current.pause();
        previewRef.current.srcObject = null;
      }
      if (mountedRef.current) setSharing(false);
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
    };
  }, []);

  const start = useCallback(async () => {
    setShareError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "window" },
        audio: false,
      });
    } catch (err) {
      // A5 (mirrors AC5 of the recording grader): a cancelled picker is not
      // a failure - return to idle with no error banner.
      if (errorName(err) === "NotAllowedError") return;
      setShareError(err instanceof Error ? err.message : "Could not start the screen share.");
      return;
    }

    streamRef.current = stream;

    const track = stream.getVideoTracks()[0];
    if (track) {
      track.addEventListener("ended", () => teardownRef.current(), { once: true });
    }

    // X7: a DETACHED sampling video, never attached to the DOM - the proven
    // idiom (useDiscussionCapture.ts, usePipWebcam.ts).
    const samplingVideo = document.createElement("video");
    samplingVideo.muted = true;
    samplingVideo.playsInline = true;
    samplingVideo.srcObject = stream;
    samplingVideoRef.current = samplingVideo;
    void samplingVideo.play().catch(() => {});

    // A second, separate <video> for the visible preview - decoration only;
    // if it stalls while the panel is hidden, nothing captured is lost.
    if (previewRef.current) {
      previewRef.current.srcObject = stream;
      void previewRef.current.play().catch(() => {});
    }

    if (mountedRef.current) setSharing(true);
  }, []);

  const stop = useCallback(() => {
    teardownRef.current();
  }, []);

  function ensureCanvas(width: number, height: number): CanvasRenderingContext2D | null {
    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvasRef.current = canvas;
      ctxRef.current = canvas.getContext("2d");
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return ctxRef.current;
  }

  const captureFrame = useCallback((): string | null => {
    const video = samplingVideoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;

    const targetWidth = resolveSnapTargetWidth(video.videoWidth);
    const targetHeight = Math.round(video.videoHeight * (targetWidth / video.videoWidth));
    const ctx = ensureCanvas(targetWidth, targetHeight);
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    const dataUrl = ctx.canvas.toDataURL("image/jpeg", SNAP_JPEG_QUALITY);
    return dataUrl.split(",")[1] ?? null;
  }, []);

  const encodeFile = useCallback(async (file: File): Promise<string | null> => {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return null;
    }
    try {
      const targetWidth = resolveSnapTargetWidth(bitmap.width);
      const targetHeight = Math.round(bitmap.height * (targetWidth / bitmap.width));
      const ctx = ensureCanvas(targetWidth, targetHeight);
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      const dataUrl = ctx.canvas.toDataURL("image/jpeg", SNAP_JPEG_QUALITY);
      return dataUrl.split(",")[1] ?? null;
    } finally {
      bitmap.close();
    }
  }, []);

  return { sharing, shareError, previewRef, start, stop, captureFrame, encodeFile };
}
