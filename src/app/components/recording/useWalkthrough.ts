"use client";

// Group C (screen-recording-and-walkthrough-acceptance-criteria.md AC15-AC20):
// talk over a finished take, capturing camera+mic or mic-only narration and
// re-compositing through the SAME bubble draw helper Group B ships, so the
// bubble looks identical in the live stage and in a walkthrough. This does
// NOT reuse useCanvasPipeline (that pipeline drags in card refs, background
// effects and an overlay canvas that make no sense here) and does NOT call
// mixAudioTracks (its input is MediaStreamTrack[]; the source take's audio
// lives in an HTMLMediaElement). One AudioContext, one destination, the mic
// always connected, the source element connected only when the "keep the
// original audio" option is on - and that destination is never wired to
// ac.destination, so nothing this hook does can reach the speakers.

import { useCallback, useEffect, useRef, useState } from "react";
import { awaitVideoMetadata, ensureFiniteDuration } from "@/lib/caption-burn";
import { startFrameTicker, type FrameTicker } from "@/lib/frame-ticker";
import { drawWebcamBubble } from "./bubble-draw";
import { BUBBLE_SIZE_FRACTIONS } from "./bubble-geometry";
import type { Take } from "./types";

export type WalkthroughMode = "video" | "audio";
export type WalkthroughStage =
  | "idle"
  | "loading"
  | "ready"
  | "recording"
  | "paused"
  | "finishing"
  | "done"
  | "error";

type CanvasWithCapture = HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream };

const MIME_CANDIDATES = ["video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];

function pickMimeType(): string {
  for (const candidate of MIME_CANDIDATES) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return "";
}

// A text equivalent for the bubble preview (AC28's rule 8) - composed here,
// inside the draw loop, rather than read from the shape/size/corner refs at
// render time: refs are not render-safe, and the loop already ticks whenever
// those settings change live.
function shapeLabel(shape: "circle" | "rounded"): string {
  return shape === "rounded" ? "rounded square" : "circle";
}
function sizeLabel(size: "sm" | "md" | "lg"): string {
  return size === "sm" ? "small" : size === "lg" ? "large" : "medium";
}
function cornerLabel(corner: "br" | "bl" | "tr" | "tl"): string {
  switch (corner) {
    case "br": return "bottom right";
    case "tr": return "top right";
    case "tl": return "top left";
    default: return "bottom left";
  }
}
const AUDIO_ONLY_DESCRIPTION = "Microphone only - no camera bubble is recorded.";

export interface UseWalkthroughOptions {
  // The take currently open in the walkthrough surface, or null when it is
  // closed. A new id starts a fresh session; null tears the current one down.
  take: Take | null;
  pipVideoRef: React.RefObject<HTMLVideoElement | null>;
  bubbleShapeRef: React.RefObject<"circle" | "rounded">;
  bubbleSizeRef: React.RefObject<"sm" | "md" | "lg">;
  pipCornerRef: React.RefObject<"br" | "bl" | "tr" | "tl">;
  setBubbleWanted: (wanted: boolean) => void;
  addRecordedTake: (take: Take, blob: Blob) => void;
  micId: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGain: boolean;
  // Whether the record-preview stage currently holds a stream (useRecorder's
  // hasStream). If it does, entering the walkthrough stops it first - two
  // consumers of one webcam is a hard device conflict on Windows.
  recordPreviewActive: boolean;
  stopRecordPreview: () => Promise<void>;
}

export interface UseWalkthroughReturn {
  stage: WalkthroughStage;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  mode: WalkthroughMode;
  setMode: (mode: WalkthroughMode) => void;
  keepSourceAudio: boolean;
  setKeepSourceAudio: (value: boolean) => void;
  progressPct: number;
  elapsedSec: number;
  sourceDurationSec: number;
  errorText: string | null;
  notice: string | null;
  savedTakeName: string | null;
  bubbleDescription: string | null;
  start: () => void;
  pause: () => void;
  resume: () => void;
  stopAndKeep: () => void;
}

export function useWalkthrough({
  take,
  pipVideoRef,
  bubbleShapeRef,
  bubbleSizeRef,
  pipCornerRef,
  setBubbleWanted,
  addRecordedTake,
  micId,
  noiseSuppression,
  echoCancellation,
  autoGain,
  recordPreviewActive,
  stopRecordPreview,
}: UseWalkthroughOptions): UseWalkthroughReturn {
  const [mode, setMode] = useState<WalkthroughMode>(() => {
    if (typeof window === "undefined") return "video";
    return localStorage.getItem("ta-rec-walk-mode") === "audio" ? "audio" : "video";
  });
  const [keepSourceAudio, setKeepSourceAudio] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ta-rec-walk-keep-source-audio") === "1";
  });

  const [stage, setStage] = useState<WalkthroughStage>("idle");
  const [progressPct, setProgressPct] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [sourceDurationSec, setSourceDurationSec] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedTakeName, setSavedTakeName] = useState<string | null>(null);
  const [bubbleDescription, setBubbleDescription] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const durationRef = useRef(0);
  // The NARRATED span, not the source's total length. "Stop and keep" can
  // end a walkthrough before the source finishes playing, and the produced
  // take's file only contains audio/video up to that point - so durationSec
  // must reflect how far playback actually got, not durationRef's full
  // source length (durationRef exists only to dodge the MediaRecorder-webm
  // Infinity problem, per ensureFiniteDuration). Updated every draw tick and
  // once more at stop, since v.currentTime only moves forward while playing
  // (no seek control here), so it is already the furthest position reached.
  // This value feeds planTranscriptChunks in the announcement flow - an
  // inflated durationSec plans chunks over audio that does not exist. Do
  // not "simplify" this back to durationRef.current.
  const narratedPositionRef = useRef(0);
  const tickerRef = useRef<FrameTicker | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const elementSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  // S4: set right before an in-progress rec.stop() whose result must NOT
  // become a saved take - a failed v.play() in start() below. Uses the same
  // shape as torndownRef: onstop checks it first and, when set, clears it and
  // returns without building or saving anything, instead of handing a
  // near-empty blob to addRecordedTake and reporting success next to the
  // error.
  const discardNextRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef("");
  const sourceTakeRef = useRef<Take | null>(null);
  const stageRef = useRef<WalkthroughStage>("idle");
  const modeRef = useRef<WalkthroughMode>(mode);
  const keepSourceAudioRef = useRef(keepSourceAudio);
  const torndownRef = useRef(true);

  // Props that must be read fresh at setup time for whichever take just
  // opened, but must NOT restart an in-progress session merely because a
  // sibling setting changed elsewhere in the tab - mirrored into refs
  // exactly like useTakes.ts's supabaseRef/userRef and
  // useRecordingSettings.ts's sourceRef do, so the setup effect below can
  // depend on nothing but the take's own id.
  const micIdRef = useRef(micId);
  const noiseSuppressionRef = useRef(noiseSuppression);
  const echoCancellationRef = useRef(echoCancellation);
  const autoGainRef = useRef(autoGain);
  const recordPreviewActiveRef = useRef(recordPreviewActive);
  const stopRecordPreviewRef = useRef(stopRecordPreview);
  const setBubbleWantedRef = useRef(setBubbleWanted);
  const addRecordedTakeRef = useRef(addRecordedTake);

  useEffect(() => { stageRef.current = stage; }, [stage]);
  useEffect(() => { micIdRef.current = micId; }, [micId]);
  useEffect(() => { noiseSuppressionRef.current = noiseSuppression; }, [noiseSuppression]);
  useEffect(() => { echoCancellationRef.current = echoCancellation; }, [echoCancellation]);
  useEffect(() => { autoGainRef.current = autoGain; }, [autoGain]);
  useEffect(() => { recordPreviewActiveRef.current = recordPreviewActive; }, [recordPreviewActive]);
  useEffect(() => { stopRecordPreviewRef.current = stopRecordPreview; }, [stopRecordPreview]);
  useEffect(() => { setBubbleWantedRef.current = setBubbleWanted; }, [setBubbleWanted]);
  useEffect(() => { addRecordedTakeRef.current = addRecordedTake; }, [addRecordedTake]);

  // The capture-mode select is only meaningful before recording starts (the
  // UI disables it once stage moves past "ready"); while it is live, flip
  // the shared webcam bubble on or off to match, so the ready-state preview
  // shows exactly what will be recorded.
  useEffect(() => {
    modeRef.current = mode;
    if (stageRef.current === "ready") {
      setBubbleWantedRef.current(mode === "video");
    }
  }, [mode]);

  // The "keep the original audio" checkbox may be changed any number of
  // times before recording starts. createMediaElementSource may only be
  // called ONCE per element per context, so the node is created lazily on
  // its first "on" transition and left alive afterwards - only its
  // connection to the mix destination toggles, which the Web Audio API
  // allows freely.
  useEffect(() => {
    keepSourceAudioRef.current = keepSourceAudio;
    const ac = audioContextRef.current;
    const dest = destRef.current;
    const v = videoElRef.current;
    if (!ac || !dest || !v || stageRef.current !== "ready") return;

    if (keepSourceAudio) {
      if (!elementSourceRef.current) {
        // F1/N5: mute BEFORE the call, unmute only after it succeeds.
        // createMediaElementSource throws on a second call for the same
        // element/context, which this toggle-driven effect can reach. If it
        // throws with v.muted already false, the element is unmuted and NOT
        // routed into the graph - an unattached <video> still plays to the
        // speakers, so the source take plays out loud and the mic re-captures
        // it, which is exactly the feedback path AC19b withdrew the
        // headphones warning on the grounds that it is impossible.
        v.muted = true;
        try {
          elementSourceRef.current = ac.createMediaElementSource(v);
          v.muted = false;
        } catch {
          // Nothing to connect - narration still records without the source
          // track, and v stays muted so it cannot reach the speakers.
        }
      }
      if (elementSourceRef.current) {
        try {
          elementSourceRef.current.connect(dest);
        } catch {
          // Already connected.
        }
      }
    } else if (elementSourceRef.current) {
      try {
        elementSourceRef.current.disconnect();
      } catch {
        // Already disconnected.
      }
    }
  }, [keepSourceAudio]);

  const releaseCaptureResources = useCallback(() => {
    tickerRef.current?.stop();
    tickerRef.current = null;
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    setBubbleWantedRef.current(false);
    const ac = audioContextRef.current;
    audioContextRef.current = null;
    destRef.current = null;
    elementSourceRef.current = null;
    if (ac) {
      void ac.close().catch(() => {
        // Already closed.
      });
    }
  }, []);

  const teardown = useCallback(() => {
    if (torndownRef.current) return;
    torndownRef.current = true;
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        // Already stopped.
      }
    }
    recRef.current = null;
    chunksRef.current = [];
    releaseCaptureResources();
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (videoElRef.current) {
      videoElRef.current.removeAttribute("src");
      videoElRef.current = null;
    }
    sourceTakeRef.current = null;
  }, [releaseCaptureResources]);

  const finishRecording = useCallback(() => {
    if (stageRef.current !== "recording" && stageRef.current !== "paused") return;
    tickerRef.current?.stop();
    tickerRef.current = null;
    const v = videoElRef.current;
    if (v && Number.isFinite(v.currentTime)) {
      narratedPositionRef.current = Math.max(narratedPositionRef.current, v.currentTime);
    }
    v?.pause();
    setStage("finishing");
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") {
      try {
        rec.stop();
      } catch {
        setStage("ready");
      }
    } else {
      setStage("ready");
    }
  }, []);

  // Wave 0's Take already carries sourceTakeId/sourceTakeName; this is the
  // only place that reads take.url/blob for the walkthrough and the only
  // place that calls addRecordedTake for it.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!take) {
        teardown();
        if (!cancelled) setStage("idle");
        return;
      }

      torndownRef.current = false;
      sourceTakeRef.current = take;
      narratedPositionRef.current = 0;
      setStage("loading");
      setErrorText(null);
      setNotice(null);
      setProgressPct(0);
      setElapsedSec(0);
      setSourceDurationSec(0);
      setSavedTakeName(null);
      setBubbleDescription(null);

      try {
        if (recordPreviewActiveRef.current) {
          await stopRecordPreviewRef.current();
          if (!cancelled) setNotice("Stopped the record preview so the walkthrough can use the camera.");
        }

        const response = await fetch(take.url);
        const blob = await response.blob();
        if (cancelled) return;

        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;

        const v = document.createElement("video");
        v.playsInline = true;
        v.preload = "auto";
        v.muted = true;
        v.src = url;
        videoElRef.current = v;

        await awaitVideoMetadata(v);
        if (cancelled) return;
        const dur = await ensureFiniteDuration(v);
        if (cancelled) return;
        durationRef.current = dur;
        setSourceDurationSec(dur);

        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = v.videoWidth || 1280;
          canvas.height = v.videoHeight || 720;
        }

        if (micIdRef.current === "off") {
          throw new Error("Pick a microphone - a walkthrough needs one.");
        }
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(micIdRef.current ? { deviceId: { exact: micIdRef.current } } : {}),
            noiseSuppression: noiseSuppressionRef.current,
            echoCancellation: echoCancellationRef.current,
            autoGainControl: autoGainRef.current,
          },
        });
        if (cancelled) {
          micStream.getTracks().forEach((t) => t.stop());
          return;
        }
        micStreamRef.current = micStream;

        const AudioContextCtor = (window.AudioContext ||
          (window as unknown as Record<string, unknown>).webkitAudioContext) as typeof AudioContext;
        const ac = new AudioContextCtor();
        audioContextRef.current = ac;
        void ac.resume().catch(() => {
          // Best effort - a suspended context is picked up by the next user gesture.
        });
        const dest = ac.createMediaStreamDestination();
        destRef.current = dest;
        const micSource = ac.createMediaStreamSource(micStream);
        micSource.connect(dest);

        if (keepSourceAudioRef.current) {
          // F1/N5: same ordering as the keepSourceAudio toggle effect above -
          // mute before the call that can throw, unmute only once it has
          // succeeded and the element is actually routed into the graph.
          v.muted = true;
          try {
            elementSourceRef.current = ac.createMediaElementSource(v);
            elementSourceRef.current.connect(dest);
            v.muted = false;
          } catch {
            // Best effort - narration still records without the source
            // track, and v stays muted so it cannot reach the speakers.
          }
        }

        setBubbleWantedRef.current(modeRef.current === "video");

        if (!canvas) throw new Error("Could not create the walkthrough canvas.");
        const canvasStream = (canvas as CanvasWithCapture).captureStream(30);
        const mimeType = pickMimeType();
        mimeTypeRef.current = mimeType;
        const recStream = new MediaStream([...canvasStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
        const rec = new MediaRecorder(recStream, { mimeType });
        chunksRef.current = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          if (torndownRef.current) return;
          if (discardNextRef.current) {
            discardNextRef.current = false;
            chunksRef.current = [];
            return;
          }
          const outBlob = new Blob(chunksRef.current, { type: rec.mimeType || mimeTypeRef.current || "video/webm" });
          chunksRef.current = [];
          const outUrl = URL.createObjectURL(outBlob);
          const sourceTake = sourceTakeRef.current;
          const name = sourceTake ? `${sourceTake.name} - walkthrough` : "Walkthrough";
          // Measured, not the source's total length - see narratedPositionRef's
          // comment. Falls back to the (already-validated finite, positive)
          // source duration only if the measured span is somehow unusable, so
          // Take.durationSec is never Infinity or NaN.
          const measured = narratedPositionRef.current;
          const durationSec = Number.isFinite(measured) && measured > 0 ? Math.round(measured) : durationRef.current;
          const newTake: Take = {
            id: crypto.randomUUID(),
            name,
            url: outUrl,
            mimeType: outBlob.type || mimeTypeRef.current || "video/webm",
            sizeBytes: outBlob.size,
            durationSec,
            createdAt: Date.now(),
            sourceTakeId: sourceTake?.id,
            sourceTakeName: sourceTake?.name,
          };
          addRecordedTakeRef.current(newTake, outBlob);
          releaseCaptureResources();
          setSavedTakeName(newTake.name);
          setStage("done");
        };
        recRef.current = rec;

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not create a canvas context.");

        let lastPct = -1;
        let lastElapsed = -1;
        let lastDescription = "";
        const draw = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);

          if (modeRef.current === "video") {
            const pipV = pipVideoRef.current;
            if (pipV && pipV.readyState >= 2) {
              const sizeKey = bubbleSizeRef.current ?? "md";
              const shape = bubbleShapeRef.current ?? "circle";
              const corner = pipCornerRef.current ?? "bl";
              drawWebcamBubble(ctx, pipV, canvas.width, canvas.height, {
                shape,
                corner,
                sizeFraction: BUBBLE_SIZE_FRACTIONS[sizeKey] ?? BUBBLE_SIZE_FRACTIONS.md,
                mirror: true,
              });
              const desc = `Bubble: ${shapeLabel(shape)}, ${sizeLabel(sizeKey)}, ${cornerLabel(corner)}. The preview shows exactly what is recorded.`;
              if (desc !== lastDescription) {
                lastDescription = desc;
                setBubbleDescription(desc);
              }
            }
          } else if (lastDescription !== AUDIO_ONLY_DESCRIPTION) {
            lastDescription = AUDIO_ONLY_DESCRIPTION;
            setBubbleDescription(AUDIO_ONLY_DESCRIPTION);
          }

          if (Number.isFinite(v.currentTime)) {
            narratedPositionRef.current = Math.max(narratedPositionRef.current, v.currentTime);
          }

          const total = durationRef.current;
          if (total > 0) {
            const pct = Math.min(100, Math.round((v.currentTime / total) * 100));
            if (pct !== lastPct) {
              lastPct = pct;
              setProgressPct(pct);
            }
          }
          const elapsedNow = Math.floor(v.currentTime);
          if (elapsedNow !== lastElapsed) {
            lastElapsed = elapsedNow;
            setElapsedSec(elapsedNow);
          }
          if (v.ended) {
            finishRecording();
          }
        };
        tickerRef.current?.stop();
        tickerRef.current = startFrameTicker(30, draw);

        if (!cancelled) setStage("ready");
      } catch (err) {
        if (!cancelled) {
          setErrorText(err instanceof Error ? err.message : "Could not start the walkthrough.");
          setStage("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
    // Deliberately keyed on the take's id alone - a new id is a new session;
    // every other input is read through the refs mirrored above so a
    // sibling setting change never restarts a session in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [take?.id]);

  const start = useCallback(() => {
    if (stageRef.current !== "ready") return;
    const v = videoElRef.current;
    const rec = recRef.current;
    if (!v || !rec) return;
    chunksRef.current = [];
    try {
      rec.start(1000);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : "Could not start recording.");
      return;
    }
    void v.play().catch((err) => {
      // S4: rec.start(1000) has already run by the time play() can reject.
      // Without the discard flag, rec.stop()'s onstop fires with
      // torndownRef.current === false, so a near-empty blob would be handed
      // to addRecordedTake and saved - a failure indistinguishable from a
      // success. discardNextRef makes onstop a no-op instead, and the stage
      // lands on "error" rather than the "recording"/"done" this branch would
      // otherwise race into.
      setErrorText(err instanceof Error ? `Could not play the recording: ${err.message}` : "Could not play the recording.");
      discardNextRef.current = true;
      try {
        rec.stop();
      } catch {
        // Already stopped.
      }
      // FIX 7: the draw ticker was left running here - a 30fps compositor
      // kept drawing the paused source frame (plus the live bubble) until
      // teardown(), even though the take being discarded will never be
      // saved. Stop it in the same place the recorder is stopped.
      tickerRef.current?.stop();
      tickerRef.current = null;
      setStage("error");
    });
    setStage("recording");
  }, []);

  const pause = useCallback(() => {
    if (stageRef.current !== "recording") return;
    videoElRef.current?.pause();
    try {
      recRef.current?.pause();
    } catch {
      // Already paused.
    }
    setStage("paused");
  }, []);

  const resume = useCallback(() => {
    if (stageRef.current !== "paused") return;
    try {
      recRef.current?.resume();
    } catch {
      // Already recording.
    }
    void videoElRef.current?.play().catch(() => {
      // Best effort.
    });
    setStage("recording");
  }, []);

  const stopAndKeep = useCallback(() => {
    finishRecording();
  }, [finishRecording]);

  return {
    stage,
    canvasRef,
    mode,
    setMode,
    keepSourceAudio,
    setKeepSourceAudio,
    progressPct,
    elapsedSec,
    sourceDurationSec,
    errorText,
    notice,
    savedTakeName,
    bubbleDescription,
    start,
    pause,
    resume,
    stopAndKeep,
  };
}
