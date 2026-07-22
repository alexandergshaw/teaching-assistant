"use client";

import { useState, useEffect, useRef } from "react";

export interface UseRecordingSettingsReturn {
  source: "camera" | "screen" | "audio";
  setSource: React.Dispatch<React.SetStateAction<"camera" | "screen" | "audio">>;
  cameraId: string;
  setCameraId: React.Dispatch<React.SetStateAction<string>>;
  micId: string;
  setMicId: React.Dispatch<React.SetStateAction<string>>;
  resolution: "720" | "1080";
  setResolution: React.Dispatch<React.SetStateAction<"720" | "1080">>;
  mirror: boolean;
  setMirror: React.Dispatch<React.SetStateAction<boolean>>;
  noiseSuppression: boolean;
  setNoiseSuppression: React.Dispatch<React.SetStateAction<boolean>>;
  echoCancellation: boolean;
  setEchoCancellation: React.Dispatch<React.SetStateAction<boolean>>;
  autoGain: boolean;
  setAutoGain: React.Dispatch<React.SetStateAction<boolean>>;
  useCountdown: boolean;
  setUseCountdown: React.Dispatch<React.SetStateAction<boolean>>;
  autoStopMin: "0" | "5" | "10" | "15" | "30";
  setAutoStopMin: React.Dispatch<React.SetStateAction<"0" | "5" | "10" | "15" | "30">>;
  sourceRef: React.MutableRefObject<"camera" | "screen" | "audio">;
  autoStopMinRef: React.MutableRefObject<"0" | "5" | "10" | "15" | "30">;
  userPickedRef: React.MutableRefObject<boolean>;
}

export function useRecordingSettings(): UseRecordingSettingsReturn {
  // True once the user explicitly picked a device/source or started a preview,
  // so changing a select (re)starts the stream - but nothing auto-starts on
  // mount from persisted choices.
  const userPickedRef = useRef(false);

  const [cameraId, setCameraId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-rec-camera") ?? "";
  });

  const [micId, setMicId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-rec-mic") ?? "";
  });

  const [resolution, setResolution] = useState<"720" | "1080">(() => {
    if (typeof window === "undefined") return "720";
    const saved = localStorage.getItem("ta-rec-res");
    return saved === "1080" ? "1080" : "720";
  });

  const [mirror, setMirror] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ta-rec-mirror") === "1";
  });

  const [source, setSource] = useState<"camera" | "screen" | "audio">(() => {
    if (typeof window === "undefined") return "camera";
    const saved = localStorage.getItem("ta-rec-source");
    return saved === "screen" || saved === "camera" || saved === "audio" ? saved : "camera";
  });
  // Zoom/Teams-style audio processing, mapped to native getUserMedia constraints.
  const [noiseSuppression, setNoiseSuppression] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("ta-rec-noise") !== "0";
  });
  const [echoCancellation, setEchoCancellation] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("ta-rec-echo") !== "0";
  });
  const [autoGain, setAutoGain] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("ta-rec-gain") !== "0";
  });

  const [useCountdown, setUseCountdown] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("ta-rec-use-countdown") !== "0";
  });

  // Feature 1: Auto-stop timer
  const [autoStopMin, setAutoStopMin] = useState<"0" | "5" | "10" | "15" | "30">(() => {
    if (typeof window === "undefined") return "0";
    const saved = localStorage.getItem("ta-rec-autostop");
    return saved === "5" || saved === "10" || saved === "15" || saved === "30" ? (saved as "5" | "10" | "15" | "30") : "0";
  });

  // Mirror source state into ref
  const sourceRef = useRef<"camera" | "screen" | "audio">("camera");

  // Refs for mirroring state into function reads
  const autoStopMinRef = useRef<"0" | "5" | "10" | "15" | "30">("0");

  // Persist auto-stop timer state to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-autostop", autoStopMin);
  }, [autoStopMin]);

  // Mirror source, pipEnabled, and pipCorner into refs
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  // Mirror Feature 1: auto-stop timer ref
  useEffect(() => {
    autoStopMinRef.current = autoStopMin;
  }, [autoStopMin]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-camera", cameraId);
  }, [cameraId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-mic", micId);
  }, [micId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-res", resolution);
  }, [resolution]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-mirror", mirror ? "1" : "0");
  }, [mirror]);

  return {
    source,
    setSource,
    cameraId,
    setCameraId,
    micId,
    setMicId,
    resolution,
    setResolution,
    mirror,
    setMirror,
    noiseSuppression,
    setNoiseSuppression,
    echoCancellation,
    setEchoCancellation,
    autoGain,
    setAutoGain,
    useCountdown,
    setUseCountdown,
    autoStopMin,
    setAutoStopMin,
    sourceRef,
    autoStopMinRef,
    userPickedRef,
  };
}
