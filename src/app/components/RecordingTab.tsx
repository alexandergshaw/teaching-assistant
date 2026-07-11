"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, TextField, MenuItem, FormControlLabel, Checkbox } from "@mui/material";
import type { ImageSegmenter as ImageSegmenterT } from "@mediapipe/tasks-vision";
import TabHeader from "./TabHeader";
import CaptionStudio from "./CaptionStudio";
import SlideStudio from "./SlideStudio";
import styles from "../page.module.css";
import { generateLectureScriptAction } from "../actions";
import { getStoredProvider } from "@/lib/llm-provider";
import { backupSupported, clearBackupDir, loadBackupDir, pickBackupDir, writeToBackupDir } from "@/lib/backup-dir";
import type { DirHandle } from "@/lib/backup-dir";
import { useSupabase } from "@/context/SupabaseProvider";
import { saveRecordingFile } from "@/lib/recording-files";
import { startFrameTicker, type FrameTicker } from "@/lib/frame-ticker";
import { extractAudioOnly } from "@/lib/strip-audio";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

interface Device {
  deviceId: string;
  label: string;
}

export interface Take {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  createdAt: number;
  backup?: "pending" | "done" | "failed";
  dbSave?: "pending" | "done" | "failed";
}

interface Stroke {
  tool: "pen" | "highlighter" | "eraser";
  color: string;
  size: number;
  points: Array<{ x: number; y: number }>;
}

type RecState = "idle" | "recording" | "paused";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function RecordingTab({ active = true }: { active?: boolean }) {
  const { supabase, user } = useSupabase();

  const [recView, setRecView] = useState<"record" | "captions" | "slides">(() => {
    if (typeof window === "undefined") return "record";
    const v = localStorage.getItem("ta-rec-view");
    return v === "captions" || v === "slides" ? v : "record";
  });

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-rec-view", recView);
  }, [recView]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const levelRef = useRef(0);
  const elapsedRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Config the current stream was opened with (see the restart effect).
  const appliedCfgRef = useRef("");
  // True once the user explicitly picked a device/source or started a preview,
  // so changing a select (re)starts the stream - but nothing auto-starts on
  // mount from persisted choices.
  const userPickedRef = useRef(false);

  // Canvas pipeline and annotation refs
  const pipelineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const pipelineTickerRef = useRef<FrameTicker | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef(false);

  const [devices, setDevices] = useState<{ cameras: Device[]; mics: Device[] }>({
    cameras: [],
    mics: [],
  });

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
  const [muted, setMuted] = useState(false);
  const [recState, setRecState] = useState<RecState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [takes, setTakes] = useState<Take[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [hasStream, setHasStream] = useState(false);
  // Whether the live stream carries an audio track (drives the meter hint).
  const [hasAudio, setHasAudio] = useState(true);

  // Rename drafts state for takes (in-memory only)
  const [takeNameDrafts, setTakeNameDrafts] = useState<Record<string, string>>({});

  // Feature 2: Card notice (title/closing countdown)
  const [cardNotice, setCardNotice] = useState<{ kind: "title" | "closing"; secondsLeft: number } | null>(null);
  const cardNoticeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Annotation state
  const [tool, setTool] = useState<"off" | "pen" | "highlighter" | "eraser">("off");
  const [penColor, setPenColor] = useState<string>(() => {
    if (typeof window === "undefined") return "#ef4444";
    return localStorage.getItem("ta-rec-pen-color") ?? "#ef4444";
  });
  const [penSize, setPenSize] = useState<number>(() => {
    if (typeof window === "undefined") return 4;
    const saved = localStorage.getItem("ta-rec-pen-size");
    const n = saved ? Number(saved) : NaN;
    return isNaN(n) ? 4 : n;
  });

  // Background effect state
  const [bgMode, setBgMode] = useState<"none" | "blur" | "image">(() => {
    if (typeof window === "undefined") return "none";
    const saved = localStorage.getItem("ta-rec-bg");
    return saved === "blur" || saved === "image" ? saved : "none";
  });
  const [bgStatus, setBgStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const segmenterRef = useRef<ImageSegmenterT | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const bgFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const personCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const bgModeRef = useRef<"none" | "blur" | "image">("none");
  const bgStatusRef = useRef<"idle" | "loading" | "ready" | "failed">("idle");
  const applyBackgroundEffectTemp = useRef<HTMLCanvasElement | null>(null);

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

  // Countdown before recording
  const [countdown, setCountdown] = useState<number | null>(null);
  const [useCountdown, setUseCountdown] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("ta-rec-use-countdown") !== "0";
  });
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs for mirroring state into function reads
  const autoStopMinRef = useRef<"0" | "5" | "10" | "15" | "30">("0");
  const stopRecordingRef = useRef<() => void>(() => {});
  const backupDirRef = useRef<DirHandle | null>(null);
  const cardPhaseRef = useRef<"title" | "closing" | null>(null);
  const cardTitleRef = useRef<string>("");
  const cardSubtitleRef = useRef<string>("");
  const cardClosingRef = useRef<string>("");
  const cardSecondsRef = useRef<"2" | "3" | "5">("3");
  const cardBgRef = useRef<string>("#0f172a");
  const cardTextRef = useRef<string>("#f8fafc");
  const usedPipelineRef = useRef(false);
  const supabaseRef = useRef<SupabaseClient<Database> | null>(null);
  const userRef = useRef<User | null>(null);

  // Feature 1: Auto-stop timer
  const [autoStopMin, setAutoStopMin] = useState<"0" | "5" | "10" | "15" | "30">(() => {
    if (typeof window === "undefined") return "0";
    const saved = localStorage.getItem("ta-rec-autostop");
    return saved === "5" || saved === "10" || saved === "15" || saved === "30" ? (saved as "5" | "10" | "15" | "30") : "0";
  });

  // Feature 2: Backup folder
  const [backupDir, setBackupDir] = useState<DirHandle | null>(null);

  // Feature 3: Title & closing cards
  const [cardsOn, setCardsOn] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ta-rec-cards") === "1";
  });

  const [cardTitle, setCardTitle] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-rec-card-title") ?? "";
  });

  const [cardSubtitle, setCardSubtitle] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-rec-card-subtitle") ?? "";
  });

  const [cardClosing, setCardClosing] = useState<string>(() => {
    if (typeof window === "undefined") return "Thanks for watching.";
    return localStorage.getItem("ta-rec-card-closing") ?? "Thanks for watching.";
  });

  const [cardSeconds, setCardSeconds] = useState<"2" | "3" | "5">(() => {
    if (typeof window === "undefined") return "3";
    const saved = localStorage.getItem("ta-rec-card-secs");
    return saved === "2" || saved === "5" ? (saved as "2" | "5") : "3";
  });

  const [cardBg, setCardBg] = useState<string>(() => {
    if (typeof window === "undefined") return "#0f172a";
    return localStorage.getItem("ta-rec-card-bg") ?? "#0f172a";
  });

  const [cardText, setCardText] = useState<string>(() => {
    if (typeof window === "undefined") return "#f8fafc";
    return localStorage.getItem("ta-rec-card-text") ?? "#f8fafc";
  });

  const [finishing, setFinishing] = useState(false);

  // Audio extraction state
  const [extractingAudioId, setExtractingAudioId] = useState<string | null>(null);

  // Lecture script generation and teleprompter
  const [scriptTopic, setScriptTopic] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-rec-script-topic") ?? "";
  });

  const [scriptObjectives, setScriptObjectives] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-rec-script-objectives") ?? "";
  });

  const [scriptMinutes, setScriptMinutes] = useState<"2" | "5" | "10" | "15">(() => {
    if (typeof window === "undefined") return "5";
    const saved = localStorage.getItem("ta-rec-script-minutes");
    return saved === "2" || saved === "10" || saved === "15" ? saved : "5";
  });

  const [script, setScript] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-rec-script") ?? "";
  });

  const [scriptBusy, setScriptBusy] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [prompterOn, setPrompterOn] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ta-rec-prompter") === "1";
  });
  const [prompterSize, setPrompterSize] = useState<"sm" | "md" | "lg">(() => {
    if (typeof window === "undefined") return "md";
    const saved = localStorage.getItem("ta-rec-prompter-size");
    return (saved === "sm" || saved === "lg") ? saved : "md";
  });

  // Persist auto-stop timer state to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-autostop", autoStopMin);
  }, [autoStopMin]);

  // Persist card state to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-cards", cardsOn ? "1" : "0");
    localStorage.setItem("ta-rec-card-title", cardTitle);
    localStorage.setItem("ta-rec-card-subtitle", cardSubtitle);
    localStorage.setItem("ta-rec-card-closing", cardClosing);
    localStorage.setItem("ta-rec-card-secs", cardSeconds);
    localStorage.setItem("ta-rec-card-bg", cardBg);
    localStorage.setItem("ta-rec-card-text", cardText);
  }, [cardsOn, cardTitle, cardSubtitle, cardClosing, cardSeconds, cardBg, cardText]);

  // Persist lecture script state to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-script-topic", scriptTopic);
    localStorage.setItem("ta-rec-script-objectives", scriptObjectives);
    localStorage.setItem("ta-rec-script-minutes", scriptMinutes);
    localStorage.setItem("ta-rec-script", script);
  }, [scriptTopic, scriptObjectives, scriptMinutes, script]);

  // Persist form control states to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-source", source);
    localStorage.setItem("ta-rec-noise", noiseSuppression ? "1" : "0");
    localStorage.setItem("ta-rec-echo", echoCancellation ? "1" : "0");
    localStorage.setItem("ta-rec-gain", autoGain ? "1" : "0");
    localStorage.setItem("ta-rec-use-countdown", useCountdown ? "1" : "0");
    localStorage.setItem("ta-rec-bg", bgMode);
    localStorage.setItem("ta-rec-pip", pipEnabled ? "1" : "0");
    localStorage.setItem("ta-rec-pip-corner", pipCorner);
    localStorage.setItem("ta-rec-pen-color", penColor);
    localStorage.setItem("ta-rec-pen-size", String(penSize));
    localStorage.setItem("ta-rec-prompter", prompterOn ? "1" : "0");
    localStorage.setItem("ta-rec-prompter-size", prompterSize);
  }, [source, noiseSuppression, echoCancellation, autoGain, useCountdown, bgMode, pipEnabled, pipCorner, penColor, penSize, prompterOn, prompterSize]);

  // Mirror source state into ref
  const sourceRef = useRef<"camera" | "screen" | "audio">("camera");

  // Mirror muted state into ref
  const mutedRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // Helper to enable/disable mic capture
  const setMicCaptureEnabled = (enabled: boolean) => {
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = enabled; });
  };

  const redrawOverlay = useCallback(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of strokesRef.current) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (stroke.tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = stroke.size * 4;
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else if (stroke.tool === "pen") {
        ctx.globalCompositeOperation = "source-over";
        ctx.lineWidth = stroke.size;
        ctx.strokeStyle = stroke.color;
      } else if (stroke.tool === "highlighter") {
        ctx.globalCompositeOperation = "source-over";
        ctx.lineWidth = stroke.size * 4;
        ctx.strokeStyle = stroke.color;
        ctx.globalAlpha = 0.35;
      }

      if (stroke.points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.stroke();
      }

      ctx.restore();
    }
  }, []);

  // Lazy load MediaPipe background segmentation model
  useEffect(() => {
    if (bgMode === "none" || segmenterRef.current || bgStatus === "loading" || bgStatus === "failed") return;
    let cancelled = false;
    setBgStatus("loading");
    (async () => {
      try {
        const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
        const fileset = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
        );
        const seg = await ImageSegmenter.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
        if (cancelled) { seg.close(); return; }
        segmenterRef.current = seg;
        setBgStatus("ready");
      } catch (err) {
        console.error("Background model failed to load:", err);
        if (!cancelled) { setBgStatus("failed"); setBgMode("none"); }
      }
    })();
    return () => { cancelled = true; };
  }, [bgMode, bgStatus]);

  // Apply background effect to video frame; returns canvas or video to use as pipeline source
  const applyBackgroundEffect = useCallback((video: HTMLVideoElement, w: number, h: number): CanvasImageSource => {
    if (source !== "camera" || bgModeRef.current === "none" || bgStatusRef.current !== "ready" || !segmenterRef.current) return video;
    try {
      const result = segmenterRef.current.segmentForVideo(video, performance.now());
      const mask = result.confidenceMasks?.[0];
      if (!mask) { result.close?.(); return video; }
      if (!bgFrameCanvasRef.current) bgFrameCanvasRef.current = document.createElement("canvas");
      if (!personCanvasRef.current) personCanvasRef.current = document.createElement("canvas");
      const frame = bgFrameCanvasRef.current, person = personCanvasRef.current;
      if (frame.width !== w) { frame.width = w; frame.height = h; }
      if (person.width !== w) { person.width = w; person.height = h; }
      const fctx = frame.getContext("2d")!;
      const pctx = person.getContext("2d")!;
      // person cutout: alpha from confidence mask
      const conf = mask.getAsFloat32Array();
      const mw = mask.width, mh = mask.height;
      const imgData = pctx.createImageData(mw, mh);
      for (let i = 0; i < conf.length; i++) imgData.data[i * 4 + 3] = Math.round(conf[i] * 255);
      // draw alpha mask at mask resolution onto person canvas scaled to w x h
      if (!applyBackgroundEffectTemp.current) applyBackgroundEffectTemp.current = document.createElement("canvas");
      const tmp = applyBackgroundEffectTemp.current;
      if (tmp.width !== mw) { tmp.width = mw; tmp.height = mh; }
      tmp.getContext("2d")!.putImageData(imgData, 0, 0);
      pctx.clearRect(0, 0, w, h);
      pctx.drawImage(tmp, 0, 0, w, h);
      pctx.globalCompositeOperation = "source-in";
      pctx.drawImage(video, 0, 0, w, h);
      pctx.globalCompositeOperation = "source-over";
      // background layer
      fctx.clearRect(0, 0, w, h);
      if (bgModeRef.current === "image" && bgImageRef.current) {
        // cover-fit the image
        const img = bgImageRef.current;
        const scale = Math.max(w / img.width, h / img.height);
        const dw = img.width * scale, dh = img.height * scale;
        fctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      } else {
        fctx.filter = "blur(16px)";
        fctx.drawImage(video, 0, 0, w, h);
        fctx.filter = "none";
      }
      fctx.drawImage(person, 0, 0, w, h);
      (mask as unknown as { close?: () => void }).close?.();
      result.close?.();
      return frame;
    } catch (err) {
      console.error("Background effect frame failed:", err);
      return video;
    }
  }, [source]);

  const sizeCanvases = useCallback((w: number, h: number) => {
    if (pipelineCanvasRef.current) {
      pipelineCanvasRef.current.width = w;
      pipelineCanvasRef.current.height = h;
    }
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = w;
      overlayCanvasRef.current.height = h;
    }
    strokesRef.current = [];
    redrawOverlay();
  }, [redrawOverlay]);

  const initPipelineCanvas = useCallback(() => {
    if (!pipelineCanvasRef.current) {
      pipelineCanvasRef.current = document.createElement("canvas");
    }
  }, []);

  const overlayPoint = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = overlayCanvasRef.current!;
    const r = c.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * c.width;
    const y = ((e.clientY - r.top) / r.height) * c.height;
    // The overlay canvas is not CSS-mirrored, so pointer coords map 1:1 even
    // when the video preview is mirrored (the pipeline mirrors the video too).
    return { x, y };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === "off") return;
    const c = overlayCanvasRef.current!;
    c.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const point = overlayPoint(e);
    strokesRef.current.push({
      tool: tool as "pen" | "highlighter" | "eraser",
      color: penColor,
      size: penSize,
      points: [point],
    });
    redrawOverlay();
  }, [tool, penColor, penSize, overlayPoint, redrawOverlay]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const lastStroke = strokesRef.current[strokesRef.current.length - 1];
    if (lastStroke) {
      lastStroke.points.push(overlayPoint(e));
      redrawOverlay();
    }
  }, [overlayPoint, redrawOverlay]);

  const handlePointerUp = useCallback(() => {
    drawingRef.current = false;
  }, []);

  const handleUndo = useCallback(() => {
    strokesRef.current.pop();
    redrawOverlay();
  }, [redrawOverlay]);

  const handleClear = useCallback(() => {
    strokesRef.current = [];
    redrawOverlay();
  }, [redrawOverlay]);

  const loadDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setError("This browser exposes no media devices here. Camera and microphone need a secure context - use HTTPS or http://localhost, not a LAN IP address.");
        return;
      }
      const deviceList = await navigator.mediaDevices.enumerateDevices();
      // Before the first permission grant, browsers return devices with EMPTY
      // deviceIds - useless (and identical) select options. Filter them out;
      // the list is re-enumerated with real ids after getUserMedia succeeds.
      const videoDevices = deviceList.filter((d) => d.kind === "videoinput" && d.deviceId);
      const audioDevices = deviceList.filter((d) => d.kind === "audioinput" && d.deviceId);

      const cameras = videoDevices.map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${i + 1}`,
      }));

      const mics = audioDevices.map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${i + 1}`,
      }));

      setDevices({ cameras, mics });
    } catch (err) {
      console.error("Failed to enumerate devices:", err);
      setError(err instanceof Error ? `Could not list devices: ${err.message}` : "Could not list devices.");
    }
  };

  useEffect(() => {
    let cancelled = false;

    const initDevices = async () => {
      if (cancelled) return;
      if (typeof window !== "undefined" && !window.isSecureContext) {
        setError("Camera and microphone are disabled on insecure pages. Open the app over HTTPS or at http://localhost - browsers block media devices on plain-HTTP addresses (e.g. a LAN IP).");
        return;
      }
      if (!navigator.mediaDevices) {
        setError("This browser does not expose camera/microphone APIs on this page (no navigator.mediaDevices). Use HTTPS or localhost in a modern browser.");
        return;
      }
      await loadDevices();
    };

    initDevices();

    const handleDeviceChange = () => {
      if (!cancelled) loadDevices();
    };

    navigator.mediaDevices?.addEventListener("devicechange", handleDeviceChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener("devicechange", handleDeviceChange);
    };
  }, []);

  // Mirror bgMode and bgStatus into refs to avoid restarting pipeline
  useEffect(() => {
    bgModeRef.current = bgMode;
  }, [bgMode]);

  useEffect(() => {
    bgStatusRef.current = bgStatus;
  }, [bgStatus]);

  // Mirror source, pipEnabled, and pipCorner into refs
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    pipEnabledRef.current = pipEnabled;
  }, [pipEnabled]);

  useEffect(() => {
    pipCornerRef.current = pipCorner;
  }, [pipCorner]);

  // Mirror Feature 1: auto-stop timer ref
  useEffect(() => {
    autoStopMinRef.current = autoStopMin;
  }, [autoStopMin]);

  // Mirror Feature 2: backup dir ref
  useEffect(() => {
    backupDirRef.current = backupDir;
  }, [backupDir]);

  // Mirror Feature 3: card refs
  useEffect(() => {
    cardTitleRef.current = cardTitle;
    cardSubtitleRef.current = cardSubtitle;
    cardClosingRef.current = cardClosing;
    cardSecondsRef.current = cardSeconds;
    cardBgRef.current = cardBg;
    cardTextRef.current = cardText;
  }, [cardTitle, cardSubtitle, cardClosing, cardSeconds, cardBg, cardText]);

  // Mirror supabase and user into refs for recorder.onstop
  useEffect(() => {
    supabaseRef.current = supabase;
  }, [supabase]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Load backup directory from IndexedDB on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const h = await loadBackupDir();
      if (!cancelled) setBackupDir(h);
    })();
    return () => { cancelled = true; };
  }, []);

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
  }, [pipEnabled, source, hasStream, cameraId]);

  // Ask for camera+mic permission once (falling back to mic-only), purely to
  // unlock device names/ids in the pickers; the probe stream is stopped at once.
  const requestAccess = async () => {
    try {
      setError(null);
      let probe: MediaStream;
      try {
        probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } catch {
        probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      probe.getTracks().forEach((t) => t.stop());
      await loadDevices();
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError"
          ? "Access was blocked. Click the camera icon in the address bar (or the browser's site settings) and allow camera and microphone, then try again."
          : name === "NotFoundError"
            ? "The operating system reports no camera or microphone. Check that devices are connected and not disabled in OS privacy settings."
            : name === "NotReadableError"
              ? "A camera or microphone is in use by another application. Close it and try again."
              : "Could not get camera/microphone access. Use HTTPS or localhost and check the browser's site permissions."
      );
    }
  };

  const startPipeline = useCallback(() => {
    const canvas = pipelineCanvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Feature 3: Draw title or closing card instead of normal content
      if (cardPhaseRef.current) {
        ctx.fillStyle = cardBgRef.current;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = cardTextRef.current;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (cardPhaseRef.current === "title") {
          ctx.font = `700 ${Math.round(canvas.height * 0.08)}px system-ui, sans-serif`;
          ctx.fillText(cardTitleRef.current || "Lecture", canvas.width / 2, canvas.height * 0.45);
          if (cardSubtitleRef.current) {
            ctx.font = `400 ${Math.round(canvas.height * 0.045)}px system-ui, sans-serif`;
            ctx.globalAlpha = 0.8;
            ctx.fillText(cardSubtitleRef.current, canvas.width / 2, canvas.height * 0.58);
            ctx.globalAlpha = 1;
          }
        } else if (cardPhaseRef.current === "closing") {
          ctx.font = `700 ${Math.round(canvas.height * 0.08)}px system-ui, sans-serif`;
          ctx.fillText(cardClosingRef.current, canvas.width / 2, canvas.height * 0.5);
        }
        return;
      }
      const src = applyBackgroundEffect(video, canvas.width, canvas.height);
      if (source === "camera" && mirror) {
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      } else {
        ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
      }

      // Picture-in-Picture bubble
      const pipV = pipVideoRef.current;
      if (pipEnabledRef.current && pipV && pipV.readyState >= 2 && sourceRef.current === "screen") {
        const bw = Math.round(canvas.width * 0.22);
        const bh = Math.round(bw * (pipV.videoHeight / Math.max(1, pipV.videoWidth))) || Math.round(bw * 0.75);
        const m = Math.round(canvas.width * 0.02);

        let x = 0, y = 0;
        const corner = pipCornerRef.current;
        if (corner === "br") {
          x = canvas.width - bw - m;
          y = canvas.height - bh - m;
        } else if (corner === "bl") {
          x = m;
          y = canvas.height - bh - m;
        } else if (corner === "tr") {
          x = canvas.width - bw - m;
          y = m;
        } else if (corner === "tl") {
          x = m;
          y = m;
        }

        ctx.save();
        ctx.beginPath();
        const ctxWithRoundRect = ctx as CanvasRenderingContext2D & {
          roundRect?: (x: number, y: number, w: number, h: number, r: number) => void;
        };
        if (ctxWithRoundRect.roundRect) {
          ctxWithRoundRect.roundRect(x, y, bw, bh, 16);
        } else {
          // Fallback for older browsers
          ctx.rect(x, y, bw, bh);
        }
        ctx.clip();
        ctx.drawImage(pipV, x, y, bw, bh);
        ctx.restore();

        // Subtle white border
        ctx.save();
        ctx.beginPath();
        if (ctxWithRoundRect.roundRect) {
          ctxWithRoundRect.roundRect(x, y, bw, bh, 16);
        } else {
          ctx.rect(x, y, bw, bh);
        }
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.stroke();
        ctx.restore();
      }

      const overlay = overlayCanvasRef.current;
      if (overlay) {
        ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);
      }
    };
    pipelineTickerRef.current?.stop();
    pipelineTickerRef.current = startFrameTicker(30, draw);
  }, [source, mirror, applyBackgroundEffect]);

  const stopPipeline = useCallback(() => {
    pipelineTickerRef.current?.stop();
    pipelineTickerRef.current = null;
  }, []);

  const stopMeter = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  };

  const startMeter = useCallback((stream: MediaStream) => {
    stopMeter();
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      const audioCtx =
        typeof window !== "undefined" && window.AudioContext
          ? new window.AudioContext()
          : typeof window !== "undefined" && (window as unknown as Record<string, unknown>).webkitAudioContext
            ? new ((window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext)()
            : null;

      if (!audioCtx) {
        console.warn("AudioContext not supported");
        return;
      }

      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += (data[i] - 128) * (data[i] - 128);
        const rms = Math.sqrt(sum / data.length) / 128;
        // Raw RMS of speech is tiny; amplify so normal talking visibly moves
        // the bar. Quantize and only set state on change - updating at 60fps
        // re-rendered the whole tab every frame, which broke the device
        // dropdowns (MUI menus re-render out from under the click).
        const q = Math.round(Math.min(rms * 4, 1) * 20) / 20;
        if (q !== levelRef.current) {
          levelRef.current = q;
          setLevel(q);
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      console.error("Failed to start level meter:", err);
    }
  }, []);

  const stopEverything = useCallback(async () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject !== null) {
      videoRef.current.srcObject = null;
    }
    if (pipStreamRef.current) {
      pipStreamRef.current.getTracks().forEach((t) => t.stop());
      pipStreamRef.current = null;
    }
    if (pipVideoRef.current) {
      pipVideoRef.current.srcObject = null;
    }
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    // Feature 3: Reset card state
    cardPhaseRef.current = null;
    if (cardNoticeTimerRef.current) {
      clearInterval(cardNoticeTimerRef.current);
      cardNoticeTimerRef.current = null;
    }
    setCardNotice(null);
    setFinishing(false);
    setCountdown(null);
    stopMeter();
    stopPipeline();
    setRecState("idle");
    setHasStream(false);
  }, [stopPipeline]);

  const startPreview = useCallback(async () => {
    try {
      setError(null);
      await stopEverything();

      let stream: MediaStream;

      if (source === "camera") {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: cameraId ? { exact: cameraId } : undefined,
            width: { ideal: resolution === "1080" ? 1920 : 1280 },
            height: { ideal: resolution === "1080" ? 1080 : 720 },
          },
          audio: micId === "off" ? false : {
            ...(micId ? { deviceId: { exact: micId } } : {}),
            noiseSuppression,
            echoCancellation,
            autoGainControl: autoGain,
          },
        });
      } else if (source === "screen") {
        const displayMediaDevices = navigator.mediaDevices as unknown as {
          getDisplayMedia: (constraints: { video: unknown; audio: unknown }) => Promise<MediaStream>;
        };
        stream = await displayMediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        if (micId && micId !== "off") {
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({
              audio: { deviceId: { exact: micId } },
            });
            const audioTrack = audioStream.getAudioTracks()[0];
            if (audioTrack) {
              stream.addTrack(audioTrack);
            }
          } catch (err) {
            console.warn("Could not add selected mic to screen share:", err);
          }
        }
      } else {
        if (micId === "off") {
          setError("Pick a microphone - audio-only recording needs one.");
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(micId && micId !== "off" ? { deviceId: { exact: micId } } : {}),
            noiseSuppression,
            echoCancellation,
            autoGainControl: autoGain,
          },
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      // Remember which config this stream was opened with, so the restart
      // effect only reacts to real device/resolution/source changes.
      appliedCfgRef.current = `${source}|${cameraId}|${micId}|${resolution}|${noiseSuppression}|${echoCancellation}|${autoGain}`;
      setHasAudio(stream.getAudioTracks().length > 0);
      setMuted(false);

      // Initialize canvas pipeline (audio-only doesn't need canvas sizing)
      if (source !== "audio") {
        initPipelineCanvas();
        const vt = stream.getVideoTracks()[0];
        const st = vt?.getSettings?.();
        const w = st?.width ?? 1280;
        const h = st?.height ?? 720;
        sizeCanvases(w, h);
      }

      setHasStream(true);

      await loadDevices();
      startMeter(stream);

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener("ended", () => {
          void stopEverything();
        });
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message.includes("Permission denied")
            ? "Permission denied. Please enable camera/screen and microphone access in your browser settings (HTTPS required)."
            : `Failed to start preview: ${err.message}`
          : "Failed to start preview. Please check permissions and HTTPS.";
      setError(message);
      await stopEverything();
    }
  }, [cameraId, micId, resolution, source, noiseSuppression, echoCancellation, autoGain, stopEverything, startMeter, initPipelineCanvas, sizeCanvases]);

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

  // (Re)start the preview whenever the user picks a device, source, or
  // resolution - including the first pick, so selecting a camera takes effect
  // immediately. Never fires from persisted choices on mount, and never
  // interrupts an active recording.
  useEffect(() => {
    const cfg = `${source}|${cameraId}|${micId}|${resolution}|${noiseSuppression}|${echoCancellation}|${autoGain}`;
    if (userPickedRef.current && recState === "idle" && appliedCfgRef.current !== cfg) {
      void startPreview();
    }
  }, [cameraId, micId, resolution, source, noiseSuppression, echoCancellation, autoGain, recState, startPreview]);

  useEffect(() => {
    if (recState !== "recording") {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
      // Feature 1: Auto-stop timer
      const limit = Number(autoStopMinRef.current) * 60;
      if (limit > 0 && elapsedRef.current >= limit) {
        stopRecordingRef.current?.();
      }
    }, 1000);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [recState]);

  // Mute/unmute the live mic without stopping the stream or recording.
  const toggleMute = () => {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMuted(next);
  };

  const pickMimeType = (): string => {
    const types = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "";
  };

  const pickAudioMimeType = (): string => {
    const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "";
  };

  const beginRecording = () => {
    // Feature 3: Guard against starting while finishing
    if (finishing) return;
    if (!useCountdown) {
      void startRecording();
      return;
    }
    setCountdown(3);
    countdownTimerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c === null) return null;
        if (c <= 1) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          void startRecording();
          return null;
        }
        return c - 1;
      });
    }, 1000);
  };

  const startRecording = async () => {
    if (!streamRef.current) return;
    try {
      setError(null);
      chunksRef.current = [];
      setBytes(0);
      elapsedRef.current = 0;
      setElapsed(0);

      let mimeType: string;
      let recStream: MediaStream = streamRef.current;
      let usedPipeline = false;

      if (source === "audio") {
        // Audio-only: skip pipeline, use audio mime
        mimeType = pickAudioMimeType();
      } else {
        // Video recording with optional pipeline
        mimeType = pickMimeType();
        const canvas = pipelineCanvasRef.current;
        if (canvas && typeof (canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream === "function") {
          startPipeline();
          usedPipeline = true;
          usedPipelineRef.current = true;
          const canvasStream = (canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream?.(30);
          if (canvasStream) {
            recStream = new MediaStream([...canvasStream.getVideoTracks(), ...streamRef.current.getAudioTracks()]);
          }
        }
      }

      const recorder = new MediaRecorder(
        recStream,
        mimeType ? { mimeType } : undefined
      );

      let recordedBytes = 0;

      recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) {
          chunksRef.current.push(evt.data);
          recordedBytes += evt.data.size;
          setBytes(recordedBytes);
        }
      };

      recorder.onstop = () => {
        stopPipeline();
        const actualMimeType = recorder.mimeType || mimeType || (source === "audio" ? "audio/webm" : "video/webm");
        const blob = new Blob(chunksRef.current, { type: actualMimeType });
        const url = URL.createObjectURL(blob);
        const takeId = crypto.randomUUID();
        const newTake: Take = {
          id: takeId,
          name: `Take ${takes.length + 1}`,
          url,
          mimeType: actualMimeType,
          sizeBytes: blob.size,
          durationSec: elapsedRef.current,
          createdAt: Date.now(),
        };

        setTakes((prev) => [...prev, newTake]);
        void saveTakeToLibrary(newTake, blob);
      };

      recorderRef.current = recorder;
      stopRecordingRef.current = () => {
        if (recorder.state !== "inactive") recorder.stop();
        setRecState("idle");
      };
      recorder.start(1000);
      setRecState("recording");
      // Feature 3: Start title card if enabled
      if (usedPipeline && cardsOn) {
        cardPhaseRef.current = "title";
        setMicCaptureEnabled(false);
        const cardDuration = Number(cardSecondsRef.current);
        setCardNotice({ kind: "title", secondsLeft: cardDuration });
        cardNoticeTimerRef.current = setInterval(() => {
          setCardNotice((prev) => {
            if (!prev || prev.kind !== "title") return prev;
            if (prev.secondsLeft <= 1) {
              if (cardNoticeTimerRef.current) {
                clearInterval(cardNoticeTimerRef.current);
                cardNoticeTimerRef.current = null;
              }
              return null;
            }
            return { kind: "title", secondsLeft: prev.secondsLeft - 1 };
          });
        }, 1000);
        window.setTimeout(() => {
          if (cardPhaseRef.current !== "title") return;
          cardPhaseRef.current = null;
          setMicCaptureEnabled(!mutedRef.current);
          setCardNotice(null);
          if (cardNoticeTimerRef.current) {
            clearInterval(cardNoticeTimerRef.current);
            cardNoticeTimerRef.current = null;
          }
        }, cardDuration * 1000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start recording");
    }
  };

  const pauseRecording = () => {
    if (recorderRef.current && recorderRef.current.state === "recording") {
      recorderRef.current.pause();
      setRecState("paused");
    }
  };

  const resumeRecording = () => {
    if (recorderRef.current && recorderRef.current.state === "paused") {
      recorderRef.current.resume();
      setRecState("recording");
    }
  };

  const stopRecording = () => {
    // Feature 3: Handle closing card
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    if (cardsOn && usedPipelineRef.current && cardPhaseRef.current !== "closing") {
      setFinishing(true);
      cardPhaseRef.current = "closing";
      setMicCaptureEnabled(false);
      const cardDuration = Number(cardSecondsRef.current);
      setCardNotice({ kind: "closing", secondsLeft: cardDuration });
      cardNoticeTimerRef.current = setInterval(() => {
        setCardNotice((prev) => {
          if (!prev || prev.kind !== "closing") return prev;
          if (prev.secondsLeft <= 1) {
            if (cardNoticeTimerRef.current) {
              clearInterval(cardNoticeTimerRef.current);
              cardNoticeTimerRef.current = null;
            }
            return null;
          }
          return { kind: "closing", secondsLeft: prev.secondsLeft - 1 };
        });
      }, 1000);
      window.setTimeout(() => {
        cardPhaseRef.current = null;
        setCardNotice(null);
        if (cardNoticeTimerRef.current) {
          clearInterval(cardNoticeTimerRef.current);
          cardNoticeTimerRef.current = null;
        }
        setMicCaptureEnabled(!mutedRef.current);
        setFinishing(false);
        recorderRef.current?.stop();
        setRecState("idle");
      }, cardDuration * 1000);
    } else {
      recorderRef.current.stop();
      setRecState("idle");
    }
  };

  const saveTakeName = (take: Take) => {
    const draft = takeNameDrafts[take.id];
    if (draft === undefined) return;
    const trimmed = draft.trim();
    if (!trimmed || trimmed === take.name) {
      setTakeNameDrafts((prev) => {
        const next = { ...prev };
        delete next[take.id];
        return next;
      });
      return;
    }
    // Renaming a take does not rename the copy already saved to the library (they are separate records).
    setTakes((prev) =>
      prev.map((t) => (t.id === take.id ? { ...t, name: trimmed } : t))
    );
    setTakeNameDrafts((prev) => {
      const next = { ...prev };
      delete next[take.id];
      return next;
    });
  };

  const handleDownload = (take: Take) => {
    let ext: string;
    if (take.mimeType.startsWith("audio/")) {
      ext = take.mimeType.includes("mp4") ? "m4a" : "webm";
    } else {
      ext = take.mimeType.includes("mp4") ? "mp4" : "webm";
    }
    const safeName = take.name.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
    const a = document.createElement("a");
    a.href = take.url;
    a.download = `${safeName}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDelete = (id: string) => {
    setTakes((prev) => {
      const take = prev.find((t) => t.id === id);
      if (take) {
        URL.revokeObjectURL(take.url);
      }
      return prev.filter((t) => t.id !== id);
    });
  };

  const handleGenerateScript = async () => {
    setScriptBusy(true);
    setScriptError(null);
    const r = await generateLectureScriptAction(scriptTopic, scriptObjectives, Number(scriptMinutes), getStoredProvider());
    setScriptBusy(false);
    if ("error" in r) {
      setScriptError(r.error);
      return;
    }
    setScript(r.script);
  };

  const saveTakeToLibrary = async (take: Take, blob: Blob) => {
    // Backup to folder
    if (backupDirRef.current) {
      const newTake = { ...take, backup: "pending" as const };
      setTakes((prev) => prev.map((t) => t.id === take.id ? newTake : t));
      try {
        const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
        const ext = blob.type.includes("mp4") ? (blob.type.startsWith("audio/") ? "m4a" : "mp4") : "webm";
        const safeName = take.name.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
        await writeToBackupDir(backupDirRef.current!, `${safeName}-${stamp}.${ext}`, blob);
        setTakes((prev) => prev.map((t) => t.id === take.id ? { ...t, backup: "done" as const } : t));
      } catch (err) {
        console.error("Backup failed:", err);
        setTakes((prev) => prev.map((t) => t.id === take.id ? { ...t, backup: "failed" as const } : t));
      }
    }

    // Save to Supabase library
    if (userRef.current && supabaseRef.current) {
      const newTake = { ...take, dbSave: "pending" as const };
      setTakes((prev) => prev.map((t) => t.id === take.id ? newTake : t));
      try {
        await saveRecordingFile(supabaseRef.current!, userRef.current!.id, blob, {
          name: take.name,
          kind: "recording",
          mimeType: blob.type,
          durationSec: take.durationSec,
        });
        setTakes((prev) => prev.map((t) => t.id === take.id ? { ...t, dbSave: "done" as const } : t));
      } catch (err) {
        console.error("Save to library failed:", err);
        setTakes((prev) => prev.map((t) => t.id === take.id ? { ...t, dbSave: "failed" as const } : t));
      }
    }
  };

  // Unmount-only cleanup. Latest takes/stopEverything are read through refs so
  // this never re-runs (a deps-based cleanup would kill the stream and revoke
  // take URLs every time a take is added).
  const takesRef = useRef(takes);
  useEffect(() => {
    takesRef.current = takes;
  }, [takes]);
  const stopEverythingRef = useRef(stopEverything);
  useEffect(() => {
    stopEverythingRef.current = stopEverything;
  }, [stopEverything]);
  useEffect(() => {
    return () => {
      void stopEverythingRef.current();
      takesRef.current.forEach((take) => {
        URL.revokeObjectURL(take.url);
      });
      segmenterRef.current?.close();
    };
  }, []);

  // Keyboard shortcuts: R record/stop, P pause/resume, M mute
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!active) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      const k = e.key.toLowerCase();
      if (k === "r") {
        if (recState === "idle" && hasStream) beginRecording();
        else if (recState !== "idle") stopRecording();
      } else if (k === "p") {
        if (recState === "recording") pauseRecording();
        else if (recState === "paused") resumeRecording();
      } else if (k === "m") {
        if (hasStream) toggleMute();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section className={styles.card}>
      <TabHeader
        eyebrow="Recording"
        title="Record from a camera"
        subtitle="Record video from any attached camera or your screen, preview it live, and download the takes."
      />

      <div className={styles.lessonInnerTabs} role="tablist" aria-label="Recording tools">
        {([["record", "Record"], ["captions", "Caption a video"], ["slides", "Narrate a deck"]] as const).map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={recView === key}
            className={`${styles.lessonInnerTab}${recView === key ? ` ${styles.lessonInnerTabActive}` : ""}`}
            onClick={() => setRecView(key)}>
            <span className={styles.tabLabelWrap}>{label}</span>
          </button>
        ))}
      </div>

      <div style={{ display: recView === "record" ? undefined : "none" }}>
        <>
          {error && <p className={styles.error}>{error}</p>}

      <div className={styles.adaptPanel}>
        <div className={styles.adaptPanelHeader}>
          <h2 className={styles.adaptPanelTitle}>Source &amp; devices</h2>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <TextField
            select
            label="Source"
            value={source}
            onChange={(e) => { userPickedRef.current = true; setSource(e.target.value as "camera" | "screen" | "audio"); }}
            size="small"
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="camera">Camera</MenuItem>
            <MenuItem value="screen">Screen</MenuItem>
            <MenuItem value="audio">Audio only (microphone)</MenuItem>
          </TextField>

          <TextField
            select
            label="Camera"
            value={cameraId}
            onChange={(e) => { userPickedRef.current = true; setCameraId(e.target.value); }}
            size="small"
            sx={{ minWidth: 160 }}
            disabled={source !== "camera"}
          >
            {devices.cameras.length === 0 && <MenuItem value="">No cameras found</MenuItem>}
            {devices.cameras.length > 0 &&
              cameraId &&
              !devices.cameras.some((d) => d.deviceId === cameraId) && (
                <MenuItem value={cameraId}>(Disconnected)</MenuItem>
              )}
            {devices.cameras.map((cam) => (
              <MenuItem key={cam.deviceId} value={cam.deviceId}>
                {cam.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Microphone"
            value={micId}
            onChange={(e) => { userPickedRef.current = true; setMicId(e.target.value); }}
            size="small"
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">System default</MenuItem>
            <MenuItem value="off">No microphone (mute)</MenuItem>
            {devices.mics.map((mic) => (
              <MenuItem key={mic.deviceId} value={mic.deviceId}>
                {mic.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Resolution"
            value={resolution}
            onChange={(e) => { userPickedRef.current = true; setResolution(e.target.value as "720" | "1080"); }}
            size="small"
            sx={{ minWidth: 160 }}
            disabled={source !== "camera"}
          >
            <MenuItem value="720">720p</MenuItem>
            <MenuItem value="1080">1080p</MenuItem>
          </TextField>
        </div>
        {devices.cameras.length > 0 && (
          <p className={styles.fieldHint} style={{ margin: "8px 0 0" }}>
            {devices.cameras.length} camera{devices.cameras.length === 1 ? "" : "s"}, {devices.mics.length} mic{devices.mics.length === 1 ? "" : "s"} detected
            {cameraId
              ? ` - using: ${devices.cameras.find((d) => d.deviceId === cameraId)?.label ?? "previous camera (reselect)"}`
              : " - no camera selected yet"}
          </p>
        )}
        {(devices.cameras.length === 0 || devices.mics.length === 0) && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              Cameras and microphones appear here after the browser grants access.
            </p>
            <Button variant="outlined" size="small" onClick={() => void requestAccess()}>
              Grant access
            </Button>
          </div>
        )}

        <details className={styles.adaptDisclosure} style={{ marginTop: 4 }}>
          <summary>Recording options</summary>
          <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={mirror}
                    onChange={(e) => setMirror(e.target.checked)}
                    disabled={source !== "camera"}
                    size="small"
                  />
                }
                label="Mirror preview"
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={noiseSuppression} onChange={(e) => { userPickedRef.current = true; setNoiseSuppression(e.target.checked); }} />}
                label="Noise suppression"
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={echoCancellation} onChange={(e) => { userPickedRef.current = true; setEchoCancellation(e.target.checked); }} />}
                label="Echo cancellation"
              />
              <FormControlLabel
                control={<Checkbox size="small" checked={autoGain} onChange={(e) => { userPickedRef.current = true; setAutoGain(e.target.checked); }} />}
                label="Auto gain"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={useCountdown}
                    onChange={(e) => setUseCountdown(e.target.checked)}
                    size="small"
                  />
                }
                label="3-2-1 countdown"
              />
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <TextField
                select
                size="small"
                label="Auto-stop"
                value={autoStopMin}
                onChange={(e) => setAutoStopMin(e.target.value as "0" | "5" | "10" | "15" | "30")}
                sx={{ minWidth: 110 }}
              >
                <MenuItem value="0">Off</MenuItem>
                <MenuItem value="5">5 min</MenuItem>
                <MenuItem value="10">10 min</MenuItem>
                <MenuItem value="15">15 min</MenuItem>
                <MenuItem value="30">30 min</MenuItem>
              </TextField>
              <TextField
                select
                size="small"
                label="Background"
                value={bgMode}
                onChange={(e) => setBgMode(e.target.value as "none" | "blur" | "image")}
                sx={{ minWidth: 140 }}
                disabled={source !== "camera" || bgStatus === "failed"}
              >
                <MenuItem value="none">None</MenuItem>
                <MenuItem value="blur">Blur</MenuItem>
                <MenuItem value="image">Image</MenuItem>
              </TextField>
              {bgMode === "image" && (
                <Button variant="outlined" size="small" onClick={() => bgFileRef.current?.click()}>
                  Choose image
                </Button>
              )}
              <input
                ref={bgFileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const img = new Image();
                  img.onload = () => { bgImageRef.current = img; };
                  img.src = URL.createObjectURL(f);
                  e.target.value = "";
                }}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={pipEnabled}
                    onChange={(e) => setPipEnabled(e.target.checked)}
                    disabled={source !== "screen"}
                    size="small"
                  />
                }
                label="Webcam bubble"
              />
              {pipEnabled && source === "screen" && (
                <TextField
                  select
                  label="Bubble corner"
                  value={pipCorner}
                  onChange={(e) => setPipCorner(e.target.value as "br" | "bl" | "tr" | "tl")}
                  size="small"
                  sx={{ minWidth: 130 }}
                >
                  <MenuItem value="br">Bottom right</MenuItem>
                  <MenuItem value="bl">Bottom left</MenuItem>
                  <MenuItem value="tr">Top right</MenuItem>
                  <MenuItem value="tl">Top left</MenuItem>
                </TextField>
              )}
            </div>
            {bgStatus === "loading" && <span className={styles.ghMeta}>Loading background model...</span>}
            {bgStatus === "failed" && <span className={styles.ghMeta} style={{ color: "var(--warning)" }}>Background effects unavailable (model failed to load)</span>}
            {bgMode !== "none" && bgStatus === "ready" && <span className={styles.ghMeta}>Effect is applied to the recording; the preview stays raw.</span>}

            <div className={styles.field} style={{ marginTop: 16 }}>
              <label className={styles.adaptPanelSubtitle} style={{ display: "block", marginBottom: 8 }}>Backup</label>
              {!backupSupported() ? (
                <p className={styles.fieldHint}>Automatic backup needs Chrome or Edge (File System Access API). Takes can still be downloaded manually.</p>
              ) : backupDir ? (
                <>
                  <span className={styles.ghMeta}>Backing up to: <strong>{backupDir.name}</strong></span>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={async () => {
                        try {
                          const h = await pickBackupDir();
                          if (h) setBackupDir(h);
                        } catch {
                          // user cancelled
                        }
                      }}
                    >
                      Change
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={async () => {
                        await clearBackupDir();
                        setBackupDir(null);
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={async () => {
                      try {
                        const h = await pickBackupDir();
                        if (h) setBackupDir(h);
                      } catch {
                        // user cancelled
                      }
                    }}
                  >
                    Choose backup folder
                  </Button>
                  <p className={styles.fieldHint} style={{ marginTop: 8 }}>Every finished recording is automatically saved there.</p>
                </>
              )}
            </div>

            <div className={styles.field} style={{ marginTop: 16 }}>
              <FormControlLabel
                control={<Checkbox checked={cardsOn} onChange={(e) => setCardsOn(e.target.checked)} size="small" disabled={source === "audio"} />}
                label="Add title and closing cards"
              />
              {cardsOn && (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                    <TextField
                      label="Title"
                      value={cardTitle}
                      onChange={(e) => setCardTitle(e.target.value)}
                      size="small"
                      sx={{ flex: "1 1 200px" }}
                    />
                    <TextField
                      label="Subtitle"
                      value={cardSubtitle}
                      onChange={(e) => setCardSubtitle(e.target.value)}
                      size="small"
                      sx={{ flex: "1 1 200px" }}
                    />
                    <TextField
                      label="Closing line"
                      value={cardClosing}
                      onChange={(e) => setCardClosing(e.target.value)}
                      size="small"
                      sx={{ flex: "1 1 200px" }}
                    />
                    <TextField
                      select
                      label="Card length"
                      value={cardSeconds}
                      onChange={(e) => setCardSeconds(e.target.value as "2" | "3" | "5")}
                      size="small"
                      sx={{ minWidth: 110 }}
                    >
                      <MenuItem value="2">2 s</MenuItem>
                      <MenuItem value="3">3 s</MenuItem>
                      <MenuItem value="5">5 s</MenuItem>
                    </TextField>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      Background
                      <input
                        type="color"
                        value={cardBg}
                        onChange={(e) => setCardBg(e.target.value)}
                        style={{ width: 32, height: 28, border: "none", background: "transparent", cursor: "pointer" }}
                        aria-label="Card background color"
                      />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                      Text
                      <input
                        type="color"
                        value={cardText}
                        onChange={(e) => setCardText(e.target.value)}
                        style={{ width: 32, height: 28, border: "none", background: "transparent", cursor: "pointer" }}
                        aria-label="Card text color"
                      />
                    </label>
                  </div>
                  <p className={styles.fieldHint} style={{ marginTop: 8 }}>Cards are added around your video: the title card records first (mic muted) and a notice on the preview counts down until your video starts; the closing card is appended after you press Stop.</p>
                </>
              )}
            </div>
          </div>
        </details>
      </div>

      <details className={styles.adaptDisclosure}>
        <summary>Lecture script &amp; teleprompter</summary>
        <div className={`${styles.adaptDisclosureBody} ${styles.field}`}>
          <p className={styles.adaptPanelSubtitle} style={{ marginBottom: 12 }}>Draft a teleprompter-ready script with AI, edit it, then read it while you record.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
            <TextField
              label="Topic"
              value={scriptTopic}
              onChange={(e) => setScriptTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !(scriptBusy || !scriptTopic.trim())) {
                  e.preventDefault();
                  void handleGenerateScript();
                }
              }}
              size="small"
              sx={{ flex: "1 1 260px" }}
            />
            <TextField
              select
              label="Length"
              value={scriptMinutes}
              onChange={(e) => setScriptMinutes(e.target.value as "2" | "5" | "10" | "15")}
              size="small"
              sx={{ minWidth: 110 }}
            >
              <MenuItem value="2">2 min</MenuItem>
              <MenuItem value="5">5 min</MenuItem>
              <MenuItem value="10">10 min</MenuItem>
              <MenuItem value="15">15 min</MenuItem>
            </TextField>
            <Button
              variant="contained"
              size="small"
              disabled={scriptBusy || !scriptTopic.trim()}
              onClick={() => void handleGenerateScript()}
            >
              {scriptBusy ? "Writing..." : script ? "Regenerate" : "Generate script"}
            </Button>
          </div>
          <TextField
            label="Objectives / notes (optional)"
            value={scriptObjectives}
            onChange={(e) => setScriptObjectives(e.target.value)}
            multiline
            minRows={2}
            fullWidth
            size="small"
            sx={{ marginBottom: 12 }}
          />
          {scriptError && <p className={styles.error}>{scriptError}</p>}
          {script && (
            <>
              <TextField
                multiline
                minRows={6}
                fullWidth
                value={script}
                onChange={(e) => setScript(e.target.value)}
                size="small"
                sx={{ marginBottom: 12 }}
              />
              <div className={styles.ghActions} style={{ alignItems: "center", marginBottom: 16 }}>
                <span className={styles.ghMeta}>{script.trim().split(/\s+/).length} words · ~{Math.max(1, Math.round(script.trim().split(/\s+/).length / 140))} min at speaking pace</span>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => void navigator.clipboard.writeText(script)}
                >
                  Copy
                </Button>
                <Button
                  variant={prompterOn ? "contained" : "outlined"}
                  size="small"
                  onClick={() => setPrompterOn((v) => !v)}
                >
                  {prompterOn ? "Hide teleprompter" : "Teleprompter"}
                </Button>
                {prompterOn && (
                  <TextField
                    select
                    size="small"
                    label="Text size"
                    value={prompterSize}
                    onChange={(e) => setPrompterSize(e.target.value as "sm" | "md" | "lg")}
                    sx={{ minWidth: 110 }}
                  >
                    <MenuItem value="sm">Small</MenuItem>
                    <MenuItem value="md">Medium</MenuItem>
                    <MenuItem value="lg">Large</MenuItem>
                  </TextField>
                )}
              </div>
            </>
          )}
        </div>
      </details>

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
        <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#0f172a" }}>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{
              display: source === "audio" ? "none" : "block",
              width: "100%",
              maxHeight: "48vh",
              objectFit: "contain",
              background: "#0f172a",
              transform: source === "camera" && mirror ? "scaleX(-1)" : undefined,
            }}
          />
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
        </div>

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

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {recState !== "idle" && (
              <>
                <span className={styles.navBadge}>{recState === "recording" ? "REC" : "PAUSED"}</span>
                <span className={styles.ghMetaMono} style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>
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

          <div className={styles.ghPanel}>
            <h3 className={styles.adaptPanelTitle}>Takes</h3>
            {takes.length === 0 ? (
              <p className={styles.fieldHint}>No takes yet - record something.</p>
            ) : (
              takes.map((take) => (
                <div key={take.id} className={styles.ghRow}>
                  <div className={styles.ghRowTop}>
                    <div className={styles.ghRowTitle}>
                      <TextField
                        size="small"
                        type="text"
                        className={styles.ccItemName}
                        title={take.name}
                        value={takeNameDrafts[take.id] ?? take.name}
                        onChange={(e) => setTakeNameDrafts((prev) => ({ ...prev, [take.id]: e.target.value }))}
                        onBlur={() => saveTakeName(take)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                      />
                    </div>
                    <div className={styles.ghActions}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => void handleDownload(take)}
                      >
                        Download
                      </Button>
                      {!take.mimeType.startsWith("audio/") && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={async () => {
                            if (extractingAudioId === take.id) return;
                            setExtractingAudioId(take.id);
                            try {
                              const response = await fetch(take.url);
                              const blob = await response.blob();
                              const audioBlob = await extractAudioOnly(blob, (pct) => {
                                if (pct % 10 === 0) {
                                  setExtractingAudioId(`${take.id}|${pct}`);
                                }
                              });
                              const audioUrl = URL.createObjectURL(audioBlob);
                              const audioTake: Take = {
                                id: crypto.randomUUID(),
                                name: `${take.name} (audio)`,
                                url: audioUrl,
                                mimeType: audioBlob.type || "audio/webm",
                                sizeBytes: audioBlob.size,
                                durationSec: take.durationSec,
                                createdAt: Date.now(),
                              };
                              setTakes((prev) => [...prev, audioTake]);
                              void saveTakeToLibrary(audioTake, audioBlob);
                            } catch (err) {
                              console.error("Audio extraction failed:", err);
                              setError(`Audio extraction failed: ${err instanceof Error ? err.message : "unknown error"}`);
                            } finally {
                              setExtractingAudioId(null);
                            }
                          }}
                          disabled={extractingAudioId !== null}
                        >
                          {extractingAudioId?.startsWith(take.id) ? `Audio... ${extractingAudioId.split("|")[1]}%` : "Audio only"}
                        </Button>
                      )}
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={() => void handleDelete(take.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  <div className={styles.ghMeta}>
                    {fmt(take.durationSec)} · {(take.sizeBytes / 1048576).toFixed(1)} MB · {new Date(take.createdAt).toLocaleString()}
                  </div>
                  {take.backup === "done" && <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>Backed up</span>}
                  {take.backup === "failed" && <span className={`${styles.ghBadge} ${styles.ghBadgeDanger}`}>Backup failed</span>}
                  {take.backup === "pending" && <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Backing up...</span>}
                  {take.dbSave === "done" && <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>In library</span>}
                  {take.dbSave === "failed" && <span className={`${styles.ghBadge} ${styles.ghBadgeDanger}`}>Library save failed</span>}
                  {take.dbSave === "pending" && <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>Saving to library...</span>}
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: "pointer", color: "var(--accent-ink)", fontWeight: 600 }}>
                      Play
                    </summary>
                    {take.mimeType.startsWith("audio/") ? (
                      <audio
                        controls
                        src={take.url}
                        style={{
                          width: "100%",
                          marginTop: 8,
                        }}
                      />
                    ) : (
                      <video
                        controls
                        src={take.url}
                        style={{
                          maxWidth: "100%",
                          borderRadius: 8,
                          marginTop: 8,
                          background: "#0f172a",
                        }}
                      />
                    )}
                  </details>
                </div>
              ))
            )}
          </div>
        </>
      </div>

      {/* Inner views stay mounted (hidden with display:none) so navigation never kills a live preview, takes, or an in-progress caption burn. */}
      <div style={{ display: recView === "captions" ? undefined : "none" }}>
        <CaptionStudio takes={takes} backupDir={backupDir} />
      </div>

      <div style={{ display: recView === "slides" ? undefined : "none" }}>
        <SlideStudio />
      </div>
    </section>
  );
}
