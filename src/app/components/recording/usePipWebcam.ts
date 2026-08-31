"use client";

import { useEffect, useRef, useState } from "react";

export interface UsePipWebcamReturn {
  pipEnabled: boolean;
  setPipEnabled: (enabled: boolean) => void;
  pipCorner: "br" | "bl" | "tr" | "tl";
  setPipCorner: (corner: "br" | "bl" | "tr" | "tl") => void;
  bubbleShape: "circle" | "rounded";
  setBubbleShape: (shape: "circle" | "rounded") => void;
  bubbleSize: "sm" | "md" | "lg";
  setBubbleSize: (size: "sm" | "md" | "lg") => void;
  pipVideoRef: React.RefObject<HTMLVideoElement | null>;
  pipStreamRef: React.RefObject<MediaStream | null>;
  pipEnabledRef: React.RefObject<boolean>;
  pipCornerRef: React.RefObject<"br" | "bl" | "tr" | "tl">;
  bubbleShapeRef: React.RefObject<"circle" | "rounded">;
  bubbleSizeRef: React.RefObject<"sm" | "md" | "lg">;
}

export function usePipWebcam({
  active,
  forceOn,
  cameraId,
  setError,
}: {
  // Whether the surface this bubble belongs to is currently live (e.g. the
  // screen preview is running). Replaces the old `source !== "screen"` gate -
  // the caller now decides what "active" means (trap 17: the walkthrough
  // needs the bubble over a source that is never "screen").
  active: boolean;
  // Forces the bubble stream on regardless of the `pipEnabled` checkbox.
  forceOn: boolean;
  cameraId: string;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}): UsePipWebcamReturn {
  // Picture-in-Picture webcam bubble
  const [pipEnabled, setPipEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ta-rec-pip") === "1";
  });

  // AC8: the corner default changes to "bl". A plain default change would
  // reach nobody - RecordingTab's persist effect writes the corner key on
  // every run, so every pre-feature user already has "br" stored explicitly.
  // The one-time migration is keyed off the new bubble-shape key being
  // absent, which by definition is true for every pre-feature user and false
  // for every post-feature one (it gets written once the persist effect
  // runs). While absent, the migration overrides whatever corner was stored -
  // or unset - to "bl". Once the shape key has been written, this branch
  // never runs again, so a user who changes the corner afterwards keeps
  // their choice.
  const [pipCorner, setPipCorner] = useState<"br" | "bl" | "tr" | "tl">(() => {
    if (typeof window === "undefined") return "bl";
    const migrationPending = localStorage.getItem("ta-rec-pip-shape") === null;
    if (migrationPending) return "bl";
    const saved = localStorage.getItem("ta-rec-pip-corner");
    return (saved === "br" || saved === "bl" || saved === "tr" || saved === "tl") ? saved : "bl";
  });

  // AC7: bubble shape, default circle.
  const [bubbleShape, setBubbleShape] = useState<"circle" | "rounded">(() => {
    if (typeof window === "undefined") return "circle";
    const saved = localStorage.getItem("ta-rec-pip-shape");
    return saved === "rounded" ? "rounded" : "circle";
  });

  // AC11: bubble size, default "md" (0.22 of canvas width - today's value).
  const [bubbleSize, setBubbleSize] = useState<"sm" | "md" | "lg">(() => {
    if (typeof window === "undefined") return "md";
    const saved = localStorage.getItem("ta-rec-pip-size");
    return (saved === "sm" || saved === "md" || saved === "lg") ? saved : "md";
  });

  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipStreamRef = useRef<MediaStream | null>(null);
  // Redefined (was: mirrors the checkbox). Now means "the bubble stream is
  // live and should be drawn" - the draw-time gate that used to be a third,
  // separate `sourceRef.current === "screen"` check in useCanvasPipeline now
  // lives entirely here.
  const pipEnabledRef = useRef(false);
  const pipCornerRef = useRef<"br" | "bl" | "tr" | "tl">("bl");
  const bubbleShapeRef = useRef<"circle" | "rounded">("circle");
  const bubbleSizeRef = useRef<"sm" | "md" | "lg">("md");

  const isLive = forceOn || (pipEnabled && active);

  // Mirror state into refs
  useEffect(() => {
    pipEnabledRef.current = isLive;
  }, [isLive]);

  useEffect(() => {
    pipCornerRef.current = pipCorner;
  }, [pipCorner]);

  useEffect(() => {
    bubbleShapeRef.current = bubbleShape;
  }, [bubbleShape]);

  useEffect(() => {
    bubbleSizeRef.current = bubbleSize;
  }, [bubbleSize]);

  // Acquire/release the PiP webcam stream
  useEffect(() => {
    const acquirePiP = async () => {
      if (!isLive) {
        // Release PiP stream if conditions not met
        if (pipStreamRef.current) {
          pipStreamRef.current.getTracks().forEach((t) => t.stop());
          pipStreamRef.current = null;
        }
        if (pipVideoRef.current) {
          pipVideoRef.current.srcObject = null;
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: cameraId ? { deviceId: { exact: cameraId } } : true,
        });

        pipStreamRef.current = stream;

        // Create video element if needed
        if (!pipVideoRef.current) {
          pipVideoRef.current = document.createElement("video");
          pipVideoRef.current.muted = true;
          pipVideoRef.current.playsInline = true;
        }

        pipVideoRef.current.srcObject = stream;
        void pipVideoRef.current.play();
      } catch (err) {
        console.warn("Could not acquire PiP webcam stream:", err);
        setError(`Could not start the webcam bubble: ${err instanceof Error ? err.message : "unknown error"}`);
      }
    };

    void acquirePiP();

    return () => {
      if (pipStreamRef.current) {
        pipStreamRef.current.getTracks().forEach((t) => t.stop());
        pipStreamRef.current = null;
      }
    };
  }, [isLive, cameraId, setError]);

  return {
    pipEnabled,
    setPipEnabled,
    pipCorner,
    setPipCorner,
    bubbleShape,
    setBubbleShape,
    bubbleSize,
    setBubbleSize,
    pipVideoRef,
    pipStreamRef,
    pipEnabledRef,
    pipCornerRef,
    bubbleShapeRef,
    bubbleSizeRef,
  };
}
