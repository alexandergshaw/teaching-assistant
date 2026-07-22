"use client";

import { useEffect, useRef, useState } from "react";

export interface UsePipWebcamReturn {
  pipEnabled: boolean;
  setPipEnabled: (enabled: boolean) => void;
  pipCorner: "br" | "bl" | "tr" | "tl";
  setPipCorner: (corner: "br" | "bl" | "tr" | "tl") => void;
  pipVideoRef: React.RefObject<HTMLVideoElement | null>;
  pipStreamRef: React.RefObject<MediaStream | null>;
  pipEnabledRef: React.RefObject<boolean>;
  pipCornerRef: React.RefObject<"br" | "bl" | "tr" | "tl">;
}

export function usePipWebcam({
  source,
  hasStream,
  cameraId,
  setError,
}: {
  source: "camera" | "screen" | "audio";
  hasStream: boolean;
  cameraId: string;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}): UsePipWebcamReturn {
  // Picture-in-Picture webcam bubble
  const [pipEnabled, setPipEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ta-rec-pip") === "1";
  });
  const [pipCorner, setPipCorner] = useState<"br" | "bl" | "tr" | "tl">(() => {
    if (typeof window === "undefined") return "br";
    const saved = localStorage.getItem("ta-rec-pip-corner");
    return (saved === "br" || saved === "bl" || saved === "tr" || saved === "tl") ? saved : "br";
  });
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipStreamRef = useRef<MediaStream | null>(null);
  const pipEnabledRef = useRef(false);
  const pipCornerRef = useRef<"br" | "bl" | "tr" | "tl">("br");

  // Mirror refs
  useEffect(() => {
    pipEnabledRef.current = pipEnabled;
  }, [pipEnabled]);

  useEffect(() => {
    pipCornerRef.current = pipCorner;
  }, [pipCorner]);

  // Acquire/release PiP webcam stream
  useEffect(() => {
    const acquirePiP = async () => {
      if (!pipEnabled || source !== "screen" || !hasStream) {
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
  }, [pipEnabled, source, hasStream, cameraId, setError]);

  return {
    pipEnabled,
    setPipEnabled,
    pipCorner,
    setPipCorner,
    pipVideoRef,
    pipStreamRef,
    pipEnabledRef,
    pipCornerRef,
  };
}
