"use client";

// State for the teleprompter rehearsal surface (docs/teleprompter-mode-
// acceptance-criteria.md, chunk 3f). This hook is thin, UNTESTED glue by
// design (see that doc's finding 6 and its own "Limits" section): it wires
// four already-built, independently-tested leaves - useCameraPreview
// (recording/useCameraPreview.ts, T4/T7), useDevices (recording/useDevices.ts,
// T5/T6), useLiveTranscription (live-class/useLiveTranscription.ts, the T9
// input) and the three pure modules under src/lib/teleprompter/ (T8-T11) -
// into one object TeleprompterPanel.tsx renders from. It contains no camera,
// microphone, canvas or Web Speech logic of its own; every actual decision
// (pace verdict, filler count, scroll position, sinkId outcome) is computed
// by a pure function this hook only calls.
//
// T2/X3: this hook never constructs a MediaRecorder, never calls
// captureStream(), and never sends `script` anywhere - it is read once (for
// its word count, via the SAME countWords a live transcript is measured
// with) and otherwise only handed back to the caller unchanged for display.
//
// T3: `exitTeleprompter` below is the EXPLICIT teardown this hook exposes,
// naming and calling the preview hook's own stop() directly (not just
// relying on unmount) - see its own comment for why both matter.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCameraPreview, type UseCameraPreviewReturn } from "../../recording/useCameraPreview";
import { useDevices } from "../../recording/useDevices";
import type { Device } from "../../recording/types";
import { useLiveTranscription } from "../../live-class/useLiveTranscription";
import type { TranscriptionPath } from "../../live-class/types";
import {
  countWords,
  fillerAvailability,
  speakingRate,
  type FillerAvailability,
  type SpeakingRate,
  type SpeechSample,
} from "@/lib/teleprompter/speech-feedback";
import { expectedDurationMs, resolveScrollSpeed } from "@/lib/teleprompter/scroll";
import {
  describeApplyResult,
  resolveSinkId,
  supportsSinkId,
  type AudioOutputResult,
} from "@/lib/teleprompter/audio-output";

// PERSISTENCE (ta- prefixed, read-on-init / write-on-change - the idiom
// useLmsSyllabusButtons.ts already uses at its own lines ~45-54/~109-122).
// BG_KEY deliberately reuses the Recording tab's OWN key
// (useBackgroundEffect.ts's literal "ta-rec-bg" string) rather than minting a
// second one: that hook already reads it once at mount (its own lazy
// useState initializer) but never WRITES a change back - this hook adds only
// the write-on-change half, so the two surfaces share one background
// preference instead of drifting into two.
const CAMERA_KEY = "ta-teleprompter-camera";
const MIC_KEY = "ta-teleprompter-mic";
const SPEAKER_KEY = "ta-teleprompter-speaker";
const SCROLL_KEY = "ta-teleprompter-scroll-speed";
const BG_KEY = "ta-rec-bg";

function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}
function writeStored(key: string, value: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, value);
}

export interface UseTeleprompterSessionReturn {
  // Devices (T5) - straight from useDevices, plus this hook's own
  // persisted selections.
  devices: { cameras: Device[]; mics: Device[]; speakers: Device[] };
  deviceError: string | null;
  requestDeviceAccess: () => void;
  cameraId: string;
  setCameraId: (v: string) => void;
  micId: string;
  setMicId: (v: string) => void;
  /** Always a real, currently-offered value (resolveSinkId's own contract) -
   * never a stale id that would leave a select with nothing selected (T6). */
  speakerId: string;
  setSpeakerId: (v: string) => void;
  /** Per-browser capability, not stream-dependent - drives whether the
   * speaker control renders at all (T6: absent with a reason, never inert). */
  sinkSupported: boolean;
  audioOutputResult: AudioOutputResult | null;

  // Camera preview (T4/T7) - re-exported from useCameraPreview unchanged.
  videoRef: UseCameraPreviewReturn["videoRef"];
  canvasRef: UseCameraPreviewReturn["canvasRef"];
  hasStream: boolean;
  cameraError: string | null;
  bgMode: "none" | "blur" | "image";
  setBgMode: (mode: "none" | "blur" | "image") => void;
  bgStatus: "idle" | "loading" | "ready" | "failed";
  micLevel: number;

  // The reading session (T12) - elapsed timer, transcription and auto-scroll
  // all run only between startReading()/stopReading(), never from camera
  // preview merely being mounted.
  running: boolean;
  startReading: () => void;
  stopReading: () => void;
  elapsedMs: number;
  expectedDurationMs: number;
  totalWords: number;

  // Auto-scroll speed (persisted) - the pure position math itself
  // (autoScrollTop/isManualScroll) lives in src/lib/teleprompter/scroll.ts
  // and is called directly by TeleprompterPanel, which owns the scrollable
  // DOM node this hook has no access to.
  scrollSpeed: number;
  setScrollSpeed: (v: number) => void;

  // Feedback (T8-T11).
  supportsWebSpeech: boolean;
  activePath: TranscriptionPath;
  paceReading: SpeakingRate;
  fillers: FillerAvailability;
  transcriptionError: string | null;

  /** T3's EXPLICIT teardown - stops transcription and calls the preview
   * hook's own stop(), then the caller (TeleprompterPanel) invokes its own
   * onExit prop to unmount. Named, and behaving, exactly like T3 requires:
   * "leaving MUST tear down every stream (call the preview hook's stop)". */
  exitTeleprompter: () => void;
}

export function useTeleprompterSession(script: string): UseTeleprompterSessionReturn {
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const { devices, requestAccess } = useDevices({ setError: setDeviceError });

  const [cameraId, setCameraId] = useState<string>(() => readStored(CAMERA_KEY) ?? "");
  const [micId, setMicId] = useState<string>(() => readStored(MIC_KEY) ?? "");
  const [speakerIdRaw, setSpeakerIdRaw] = useState<string>(() => readStored(SPEAKER_KEY) ?? "");
  const [scrollSpeed, setScrollSpeedState] = useState<number>(() => resolveScrollSpeed(readStored(SCROLL_KEY)));

  useEffect(() => writeStored(CAMERA_KEY, cameraId), [cameraId]);
  useEffect(() => writeStored(MIC_KEY, micId), [micId]);
  useEffect(() => writeStored(SPEAKER_KEY, speakerIdRaw), [speakerIdRaw]);
  useEffect(() => writeStored(SCROLL_KEY, String(scrollSpeed)), [scrollSpeed]);

  const setScrollSpeed = useCallback((v: number) => setScrollSpeedState(resolveScrollSpeed(v)), []);
  // T6: resolved against the CURRENT device list every render (never stored
  // resolved), so a device that vanished between sessions falls back to the
  // system default instead of leaving the select showing nothing selected.
  const speakerId = resolveSinkId(devices.speakers, speakerIdRaw);

  const camera = useCameraPreview(cameraId, micId);

  // T7/T3: entering teleprompter mode is the explicit action (the modal's
  // own entry control) - once inside, the preview starts immediately with no
  // second click. useCameraPreview's OWN unmount effect
  // (useCameraPreview.ts:323-327) already tears the stream down when this
  // hook's owning component unmounts; exitTeleprompter below additionally
  // calls stop() explicitly, per T3's literal requirement.
  useEffect(() => {
    void camera.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => writeStored(BG_KEY, camera.bgMode), [camera.bgMode]);

  // T6: `setSinkId` is a capability of the BROWSER (defined on
  // HTMLMediaElement.prototype when supported), not of any particular
  // element instance - so this is checked once, against a throwaway element,
  // rather than by reading camera.videoRef.current during render (which
  // React disallows: refs may only be read from an effect, a callback, or an
  // event handler, never synchronously while rendering).
  const [sinkSupported] = useState(() => supportsSinkId(typeof document !== "undefined" ? document.createElement("video") : null));
  const [appliedSink, setAppliedSink] = useState<AudioOutputResult | null>(null);

  useEffect(() => {
    if (!sinkSupported) return;
    const el = camera.videoRef.current;
    if (!el || !el.setSinkId) return;
    let cancelled = false;
    (async () => {
      try {
        await el.setSinkId!(speakerId);
        if (!cancelled) setAppliedSink(describeApplyResult("applied", speakerId));
      } catch (err) {
        if (!cancelled) setAppliedSink(describeApplyResult({ failed: err }, speakerId));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [speakerId, sinkSupported, camera.videoRef, camera.hasStream]);

  const audioOutputResult: AudioOutputResult | null = sinkSupported
    ? appliedSink
    : describeApplyResult("unsupported", speakerId);

  // Reading session (T12). `sessionStartMs` is plain STATE, deliberately not
  // a ref: React disallows reading a ref's `.current` during render (a real
  // compile-time/lint error, not a style preference), and this value is read
  // directly in the render body below to build useLiveTranscription's own
  // options object - state is the correct tool for exactly that, since only
  // an event handler (startReading) ever changes it, never a hot per-frame
  // path that would need a ref's no-re-render property.
  const [running, setRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [sessionStartMs, setSessionStartMs] = useState(0);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsedMs(Date.now() - sessionStartMs), 200);
    return () => clearInterval(id);
  }, [running, sessionStartMs]);

  // T9: this hook is the "thin, untested glue" the acceptance-criteria doc
  // describes - it feeds useLiveTranscription's own already-deduped `entries`
  // (interim results already folded via mergeInterim INSIDE that hook - see
  // its own applyUtterance) into the two pure feedback functions below,
  // without re-implementing any folding itself.
  const transcription = useLiveTranscription({
    micId,
    noiseSuppression: true,
    echoCancellation: true,
    autoGain: true,
    transcriptionOverride: "auto",
    hintTerms: "",
    sessionStartMs,
    onFinalUtterance: () => {},
    onError: (message) => setTranscriptionError(message),
    onFatalError: (message) => {
      setTranscriptionError(message);
      setRunning(false);
    },
  });

  const startReading = useCallback(() => {
    if (running) return;
    setSessionStartMs(Date.now());
    setElapsedMs(0);
    setTranscriptionError(null);
    setRunning(true);
    transcription.start().catch((err) => {
      setTranscriptionError(err instanceof Error ? err.message : "Could not start live transcription.");
    });
  }, [running, transcription]);

  const stopReading = useCallback(() => {
    setRunning(false);
    transcription.stop();
  }, [transcription]);

  const exitTeleprompter = useCallback(() => {
    setRunning(false);
    transcription.stop();
    camera.stop();
  }, [transcription, camera]);

  // T8: totalWords reuses countWords - the SAME word-counting function a
  // live transcript is measured with (speech-feedback.ts), so the script's
  // own word count and a spoken utterance's word count never disagree about
  // what counts as a word.
  const totalWords = useMemo(() => countWords(script), [script]);
  const expected = expectedDurationMs(totalWords, scrollSpeed);

  const finalSamples: SpeechSample[] = useMemo(
    () => transcription.entries.filter((e) => e.final).map((e) => ({ text: e.text, atMs: e.atMs })),
    [transcription.entries]
  );
  const paceReading: SpeakingRate = speakingRate(finalSamples, elapsedMs);

  // T11: filler detection is gated on the Web Speech path being ACTIVE right
  // now, not merely on this browser SUPPORTING it (finding 2) - the
  // segmented fallback's server prompt strips disfluencies, so a filler
  // count computed from its text would be silently wrong, not merely absent.
  const fillerText = useMemo(() => finalSamples.map((s) => s.text).join(" "), [finalSamples]);
  const fillers: FillerAvailability = fillerAvailability(fillerText, transcription.activePath === "web-speech");

  return {
    devices,
    deviceError,
    requestDeviceAccess: () => void requestAccess(),
    cameraId,
    setCameraId,
    micId,
    setMicId,
    speakerId,
    setSpeakerId: setSpeakerIdRaw,
    sinkSupported,
    audioOutputResult,
    videoRef: camera.videoRef,
    canvasRef: camera.canvasRef,
    hasStream: camera.hasStream,
    cameraError: camera.error,
    bgMode: camera.bgMode,
    setBgMode: camera.setBgMode,
    bgStatus: camera.bgStatus,
    micLevel: camera.level,
    running,
    startReading,
    stopReading,
    elapsedMs,
    expectedDurationMs: expected,
    totalWords,
    scrollSpeed,
    setScrollSpeed,
    supportsWebSpeech: transcription.supportsWebSpeech,
    activePath: transcription.activePath,
    paceReading,
    fillers,
    transcriptionError,
    exitTeleprompter,
  };
}
