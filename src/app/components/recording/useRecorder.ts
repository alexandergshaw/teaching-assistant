"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Take } from "./types";
import type { UseRecordingSettingsReturn } from "./useRecordingSettings";

export interface UseRecorderReturn {
  recState: "idle" | "recording" | "paused";
  elapsed: number;
  bytes: number;
  muted: boolean;
  level: number;
  hasAudio: boolean;
  countdown: number | null;
  finishing: boolean;
  toggleMute: () => void;
  beginRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  startPreview: () => Promise<void>;
  stopEverything: () => Promise<void>;
  stopEverythingRef: React.MutableRefObject<() => Promise<void>>;
}

export function useRecorder({
  active,
  settings,
  setError,
  hasStream,
  setHasStream,
  loadDevices,
  videoRef,
  pipeline,
  cardPhaseRef,
  cardNoticeTimerRef,
  setCardNotice,
  cardsOn,
  cardSecondsRef,
  pipStreamRef,
  pipVideoRef,
  takesLength,
  addRecordedTake,
}: {
  active: boolean;
  settings: UseRecordingSettingsReturn;
  setError: (err: string | null) => void;
  hasStream: boolean;
  setHasStream: (val: boolean) => void;
  loadDevices: () => Promise<void>;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  pipeline: {
    pipelineCanvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
    initPipelineCanvas: () => void;
    sizeCanvases: (w: number, h: number) => void;
    startPipeline: () => void;
    stopPipeline: () => void;
  };
  cardPhaseRef: React.MutableRefObject<"title" | "closing" | null>;
  cardNoticeTimerRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
  setCardNotice: React.Dispatch<React.SetStateAction<{ kind: "title" | "closing"; secondsLeft: number } | null>>;
  cardsOn: boolean;
  cardSecondsRef: React.MutableRefObject<"2" | "3" | "5">;
  pipStreamRef: React.MutableRefObject<MediaStream | null>;
  pipVideoRef: React.MutableRefObject<HTMLVideoElement | null>;
  takesLength: number;
  addRecordedTake: (take: Take, blob: Blob) => void;
}): UseRecorderReturn {
  const { initPipelineCanvas, sizeCanvases, startPipeline, stopPipeline, pipelineCanvasRef } = pipeline;

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

  const stopRecordingRef = useRef<() => void>(() => {});
  const usedPipelineRef = useRef(false);

  const [muted, setMuted] = useState(false);
  const [recState, setRecState] = useState<"idle" | "recording" | "paused">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [level, setLevel] = useState(0);
  const [hasAudio, setHasAudio] = useState(true);

  // Countdown before recording
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [finishing, setFinishing] = useState(false);

  // Mirror muted state into ref
  const mutedRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // Helper to enable/disable mic capture
  const setMicCaptureEnabled = (enabled: boolean) => {
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = enabled; });
  };

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
  }, [stopPipeline, setHasStream, cardPhaseRef, cardNoticeTimerRef, setCardNotice, pipStreamRef, pipVideoRef, videoRef]);

  const startPreview = useCallback(async () => {
    try {
      setError(null);
      await stopEverything();

      let stream: MediaStream;

      if (settings.source === "camera") {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: settings.cameraId ? { exact: settings.cameraId } : undefined,
            width: { ideal: settings.resolution === "1080" ? 1920 : 1280 },
            height: { ideal: settings.resolution === "1080" ? 1080 : 720 },
          },
          audio: settings.micId === "off" ? false : {
            ...(settings.micId ? { deviceId: { exact: settings.micId } } : {}),
            noiseSuppression: settings.noiseSuppression,
            echoCancellation: settings.echoCancellation,
            autoGainControl: settings.autoGain,
          },
        });
      } else if (settings.source === "screen") {
        const displayMediaDevices = navigator.mediaDevices as unknown as {
          getDisplayMedia: (constraints: { video: unknown; audio: unknown }) => Promise<MediaStream>;
        };
        stream = await displayMediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        if (settings.micId && settings.micId !== "off") {
          try {
            const audioStream = await navigator.mediaDevices.getUserMedia({
              audio: { deviceId: { exact: settings.micId } },
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
        if (settings.micId === "off") {
          setError("Pick a microphone - audio-only recording needs one.");
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(settings.micId && settings.micId !== "off" ? { deviceId: { exact: settings.micId } } : {}),
            noiseSuppression: settings.noiseSuppression,
            echoCancellation: settings.echoCancellation,
            autoGainControl: settings.autoGain,
          },
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      // Remember which config this stream was opened with, so the restart
      // effect only reacts to real device/resolution/source changes.
      appliedCfgRef.current = `${settings.source}|${settings.cameraId}|${settings.micId}|${settings.resolution}|${settings.noiseSuppression}|${settings.echoCancellation}|${settings.autoGain}`;
      setHasAudio(stream.getAudioTracks().length > 0);
      setMuted(false);

      // Initialize canvas pipeline (audio-only doesn't need canvas sizing)
      if (settings.source !== "audio") {
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
  }, [settings.cameraId, settings.micId, settings.resolution, settings.source, settings.noiseSuppression, settings.echoCancellation, settings.autoGain, stopEverything, startMeter, initPipelineCanvas, sizeCanvases, setError, setHasStream, loadDevices, videoRef]);

  // (Re)start the preview whenever the user picks a device, source, or
  // resolution - including the first pick, so selecting a camera takes effect
  // immediately. Never fires from persisted choices on mount, and never
  // interrupts an active recording.
  useEffect(() => {
    const cfg = `${settings.source}|${settings.cameraId}|${settings.micId}|${settings.resolution}|${settings.noiseSuppression}|${settings.echoCancellation}|${settings.autoGain}`;
    if (settings.userPickedRef.current && recState === "idle" && appliedCfgRef.current !== cfg) {
      void startPreview();
    }
  }, [settings.cameraId, settings.micId, settings.resolution, settings.source, settings.noiseSuppression, settings.echoCancellation, settings.autoGain, settings.userPickedRef, recState, startPreview]);

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
      const limit = Number(settings.autoStopMinRef.current) * 60;
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
  }, [recState, settings.autoStopMinRef]);

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
    if (!settings.useCountdown) {
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

      if (settings.source === "audio") {
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
        const actualMimeType = recorder.mimeType || mimeType || (settings.source === "audio" ? "audio/webm" : "video/webm");
        const blob = new Blob(chunksRef.current, { type: actualMimeType });
        const url = URL.createObjectURL(blob);
        const takeId = crypto.randomUUID();
        const newTake: Take = {
          id: takeId,
          name: `Take ${takesLength + 1}`,
          url,
          mimeType: actualMimeType,
          sizeBytes: blob.size,
          durationSec: elapsedRef.current,
          createdAt: Date.now(),
        };

        addRecordedTake(newTake, blob);
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

  const stopEverythingRef = useRef(stopEverything);
  useEffect(() => {
    stopEverythingRef.current = stopEverything;
  }, [stopEverything]);

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

  return {
    recState,
    elapsed,
    bytes,
    muted,
    level,
    hasAudio,
    countdown,
    finishing,
    toggleMute,
    beginRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    startPreview,
    stopEverything,
    stopEverythingRef,
  };
}
