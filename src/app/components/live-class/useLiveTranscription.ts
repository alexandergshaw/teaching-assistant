"use client";

// Live-class transcription: two paths, selected via selectTranscriptionPath
// (auto, or a manual override from settings).
//
// Path A - Web Speech (C3): Chrome's built-in continuous recognizer. Low
// latency, no upload, but Chrome ends a continuous session after roughly 60s
// of silence and fires `onend` with no warning - this hook restarts it while
// the session is active, guarded against a restart storm by the pure
// decideRestartOnEnd state machine in live-class-logic.ts.
//
// Path B - segmented audio fallback (C1/C2): Gemini does not accept
// audio/webm, so every ~15s (cadence driven by startFrameTicker - C4, so a
// hidden tab does not stretch the cadence) this hook STOPS the current
// MediaRecorder and immediately STARTS A FRESH ONE on the same underlying
// stream, because a WebM/Opus timeslice fragment after the first carries no
// header and is not independently decodable. Each finished segment blob is
// decoded (AudioContext.decodeAudioData), downsampled to LIVE_SAMPLE_RATE
// mono, re-encoded as WAV, and sent to transcribeLiveAudioAction.
//
// C5: transcript updates are batched, never applied at audio-frame rate. A
// final Web Speech result (or a finished segment) is applied to state right
// away - those are infrequent - but interim Web Speech results (which can
// fire many times a second while a phrase is still being recognized) are
// only flushed into React state a few times a second via a throttling timer.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  selectTranscriptionPath,
  INITIAL_RESTART_GUARD_STATE,
  recordRecognitionStart,
  decideRestartOnEnd,
  type RestartGuardState,
  type TranscriptionPath,
} from "./live-class-logic";
import type { LiveTranscriptEntry, TranscriptionOverride } from "./types";
import type { Utterance } from "@/lib/live-class/questions";
import { mergeInterim } from "@/lib/live-class/questions";
import { downsampleToMono, encodeWav, base64FromArrayBuffer, LIVE_SAMPLE_RATE } from "@/lib/live-class/wav";
import { transcribeLiveAudioAction } from "@/app/actions/live-class";
import { startFrameTicker } from "@/lib/frame-ticker";
import { waitForSettle, type SettleResult } from "./settle";

const SEGMENT_CADENCE_SECONDS = 15;
const INTERIM_FLUSH_MS = 300; // a few updates per second, never at audio-frame rate

// ---------------------------------------------------------------------------
// Minimal ambient typing for the Web Speech API - TypeScript's DOM lib does
// not ship it, and no other file in this codebase uses it yet.
// ---------------------------------------------------------------------------

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  const ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as SpeechRecognitionCtor | undefined;
  return ctor ?? null;
}

function detectCapabilities(): { hasWebSpeech: boolean; hasSegmentedSupport: boolean } {
  if (typeof window === "undefined") return { hasWebSpeech: false, hasSegmentedSupport: false };
  const w = window as unknown as Record<string, unknown>;
  const hasWebSpeech = getSpeechRecognitionCtor() !== null;
  const hasAudioContextCtor = Boolean(w.AudioContext || w.webkitAudioContext);
  const hasSegmentedSupport =
    typeof window.MediaRecorder !== "undefined" && hasAudioContextCtor && Boolean(navigator.mediaDevices?.getUserMedia);
  return { hasWebSpeech, hasSegmentedSupport };
}

function pickAudioMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

export interface UseLiveTranscriptionOptions {
  micId: string;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGain: boolean;
  transcriptionOverride: TranscriptionOverride;
  /** Domain vocabulary from the pre-warmed session context (U6) - passed to
   * transcribeLiveAudioAction so technical terms transcribe correctly. */
  hintTerms: string;
  /** Date.now() at session start; every entry's atMs is relative to this. */
  sessionStartMs: number;
  onFinalUtterance: (entry: LiveTranscriptEntry) => void;
  /** A recoverable problem (one failed segment, one recognizer hiccup) - the session keeps going (U10). */
  onError: (message: string) => void;
  /** The mic stream itself was lost - this ends the whole session (U9/U10). */
  onFatalError: (message: string) => void;
}

export interface UseLiveTranscriptionReturn {
  supportsWebSpeech: boolean;
  supportsSegmented: boolean;
  activePath: TranscriptionPath;
  entries: LiveTranscriptEntry[];
  start: () => Promise<void>;
  stop: () => void;
  /** Wait (bounded by timeoutMs) for any in-flight segment transcription to
   * land before the caller runs the final autosave/docx build - only the
   * segmented path ever has anything in flight here (Web Speech's results
   * arrive synchronously, no server round trip). */
  settle: (timeoutMs: number) => Promise<SettleResult>;
}

// Errors are reported exclusively through the onError/onFatalError callbacks
// (the caller owns whatever error state it wants to display - U10) - this
// hook does not keep its own parallel copy of "the last error".
export function useLiveTranscription(options: UseLiveTranscriptionOptions): UseLiveTranscriptionReturn {
  const optionsRef = useRef(options);
  // Refs may not be written during render (only in an effect or a callback) -
  // mirror the latest options in, so every async callback below always reads
  // the current settings/callbacks without needing them in its deps array.
  useEffect(() => {
    optionsRef.current = options;
  });

  const [capabilities] = useState(detectCapabilities);
  const [activePath, setActivePath] = useState<TranscriptionPath>("none");
  const [entries, setEntries] = useState<LiveTranscriptEntry[]>([]);

  // True while the session is meant to be running - distinguishes a
  // deliberate stop() from an unexpected onend that should trigger a restart.
  const activeRef = useRef(false);

  // Web Speech state
  const recognizerRef = useRef<SpeechRecognitionLike | null>(null);
  const guardStateRef = useRef<RestartGuardState>(INITIAL_RESTART_GUARD_STATE);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionGenerationRef = useRef(0);
  // startWebSpeechSession restarts itself (from its own onend handler) - it
  // cannot call itself by name from inside its own useCallback body, so the
  // recursive call goes through this ref instead, kept in sync by the effect
  // right after the function is defined below.
  const startWebSpeechSessionRef = useRef<() => void>(() => {});

  // Segmented-audio state
  const streamRef = useRef<MediaStream | null>(null);
  const segmentRecorderRef = useRef<MediaRecorder | null>(null);
  const segmentTickerRef = useRef<{ stop: () => void } | null>(null);
  const decodeAudioCtxRef = useRef<AudioContext | null>(null);
  // How many processSegmentBlob calls (decode -> transcribe -> upload) are
  // currently in flight - read by settle() below so stop() can wait for them
  // to land before the final autosave/docx build runs, instead of silently
  // dropping whatever segment was still being transcribed when the
  // instructor pressed Stop.
  const pendingSegmentCountRef = useRef(0);

  // Transcript batching (C5)
  const utterancesRef = useRef<Utterance[]>([]);
  const interimDirtyRef = useRef(false);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flushEntries = useCallback(() => {
    setEntries(utterancesRef.current.map((u) => ({ id: u.id, text: u.text, atMs: u.atMs, final: u.final })));
  }, []);

  const applyUtterance = useCallback(
    (utterance: Utterance) => {
      const existing = utterancesRef.current.find((u) => u.id === utterance.id);
      const wasFinal = existing?.final ?? false;
      utterancesRef.current = mergeInterim(utterancesRef.current, utterance);

      if (utterance.final && !wasFinal) {
        flushEntries();
        optionsRef.current.onFinalUtterance({
          id: utterance.id,
          text: utterance.text,
          atMs: utterance.atMs,
          final: true,
        });
      } else {
        // Interim churn - mark dirty for the throttled flush rather than
        // setState synchronously (C5).
        interimDirtyRef.current = true;
      }
    },
    [flushEntries]
  );

  useEffect(() => {
    flushTimerRef.current = setInterval(() => {
      if (interimDirtyRef.current) {
        interimDirtyRef.current = false;
        flushEntries();
      }
    }, INTERIM_FLUSH_MS);
    return () => {
      if (flushTimerRef.current !== null) clearInterval(flushTimerRef.current);
    };
  }, [flushEntries]);

  // -------------------------------------------------------------------------
  // Web Speech path (C3)
  // -------------------------------------------------------------------------

  const startWebSpeechSession = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const generation = sessionGenerationRef.current;
    const recognizer = new Ctor();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";

    recognizer.onresult = (event) => {
      const startMs = optionsRef.current.sessionStartMs;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alt = result[0];
        if (!alt) continue;
        applyUtterance({
          id: `speech-${generation}-${i}`,
          text: alt.transcript,
          atMs: Date.now() - startMs,
          final: result.isFinal,
        });
      }
    };

    recognizer.onerror = (event) => {
      // "no-speech" is normal (nobody has spoken in a while) - not a failure (C3).
      if (event.error === "no-speech") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        // Recoverable, not fatal (U10): Web Speech never hands us a
        // MediaStream of our own, so this is not "a lost mic stream" - the
        // instructor can switch to the segmented fallback in settings and
        // restart while the rest of the session keeps running.
        optionsRef.current.onError("Microphone access for live transcription was denied or revoked.");
        return;
      }
      optionsRef.current.onError(`Speech recognition error: ${event.error}`);
    };

    recognizer.onend = () => {
      if (!activeRef.current) return; // a deliberate stop() - nothing to restart
      const decision = decideRestartOnEnd(guardStateRef.current, Date.now());
      guardStateRef.current = decision.nextState;

      if (decision.action === "give-up") {
        optionsRef.current.onError(
          "Speech recognition kept failing to stay connected and was stopped. Switch to the audio-segment fallback in Live Class settings."
        );
        return;
      }

      restartTimerRef.current = setTimeout(() => {
        if (!activeRef.current) return;
        sessionGenerationRef.current += 1;
        // Recurses through the ref (see startWebSpeechSessionRef's comment
        // above) - it records the new start time itself, below.
        startWebSpeechSessionRef.current();
      }, decision.delayMs);
    };

    guardStateRef.current = recordRecognitionStart(guardStateRef.current, Date.now());
    recognizerRef.current = recognizer;
    try {
      recognizer.start();
    } catch {
      // Starting a recognizer that is already starting throws - onend will
      // still fire and drive the restart guard.
    }
  }, [applyUtterance]);

  useEffect(() => {
    startWebSpeechSessionRef.current = startWebSpeechSession;
  }, [startWebSpeechSession]);

  const stopWebSpeech = useCallback(() => {
    if (restartTimerRef.current !== null) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    const recognizer = recognizerRef.current;
    recognizerRef.current = null;
    if (recognizer) {
      recognizer.onend = null;
      recognizer.onerror = null;
      recognizer.onresult = null;
      try {
        recognizer.stop();
      } catch {
        // already stopped
      }
    }
  }, []);

  // -------------------------------------------------------------------------
  // Segmented-audio fallback (C1/C2)
  // -------------------------------------------------------------------------

  const processSegmentBlob = useCallback(async (blob: Blob, atMs: number) => {
    pendingSegmentCountRef.current += 1;
    try {
      const arrayBuffer = await blob.arrayBuffer();
      if (arrayBuffer.byteLength === 0) return; // nothing recorded this segment
      if (!decodeAudioCtxRef.current) {
        const w = window as unknown as Record<string, unknown>;
        const Ctor = (window.AudioContext ?? (w.webkitAudioContext as typeof AudioContext)) as
          | typeof AudioContext
          | undefined;
        if (!Ctor) throw new Error("AudioContext is not supported in this browser.");
        decodeAudioCtxRef.current = new Ctor();
      }
      const decoded = await decodeAudioCtxRef.current.decodeAudioData(arrayBuffer);
      const channels: Float32Array[] = [];
      for (let ch = 0; ch < decoded.numberOfChannels; ch++) channels.push(decoded.getChannelData(ch));
      const mono = downsampleToMono(channels, decoded.sampleRate, LIVE_SAMPLE_RATE);
      if (mono.length === 0) return;
      const wavBuffer = encodeWav(mono, LIVE_SAMPLE_RATE);
      const base64 = base64FromArrayBuffer(wavBuffer);

      const result = await transcribeLiveAudioAction(base64, { hintTerms: optionsRef.current.hintTerms });
      if ("error" in result) {
        optionsRef.current.onError(result.error);
        return;
      }
      if (result.text.trim()) {
        applyUtterance({ id: `segment-${atMs}-${crypto.randomUUID()}`, text: result.text, atMs, final: true });
      }
    } catch (err) {
      optionsRef.current.onError(
        err instanceof Error ? `Could not transcribe a segment: ${err.message}` : "Could not transcribe a segment."
      );
    } finally {
      // Decremented last, after applyUtterance has already run above (on the
      // success path) - so by the time this hits zero, any segment that
      // finished is guaranteed to have already been folded into the
      // transcript, which is exactly what settle() below relies on.
      pendingSegmentCountRef.current -= 1;
    }
  }, [applyUtterance]);

  const startNewSegmentRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickAudioMimeType();
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const segmentStartMs = Date.now() - optionsRef.current.sessionStartMs;
    recorder.ondataavailable = (evt) => {
      if (evt.data.size > 0) chunks.push(evt.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      void processSegmentBlob(blob, segmentStartMs);
    };
    // Deliberately no timeslice argument (C1): a fresh MediaRecorder per
    // segment, stopped and restarted by the ticker below, so every blob is
    // self-contained with its own header rather than a headerless fragment.
    recorder.start();
    segmentRecorderRef.current = recorder;
  }, [processSegmentBlob]);

  const startSegmentedSession = useCallback(async () => {
    const opts = optionsRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(opts.micId ? { deviceId: { exact: opts.micId } } : {}),
        noiseSuppression: opts.noiseSuppression,
        echoCancellation: opts.echoCancellation,
        autoGainControl: opts.autoGain,
      },
    });
    streamRef.current = stream;
    stream.getAudioTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (activeRef.current) optionsRef.current.onFatalError("The microphone stream ended unexpectedly.");
      });
    });

    startNewSegmentRecorder();

    // Rotate to a fresh MediaRecorder every ~15s (C4: a worker-backed ticker
    // so a hidden tab cannot stretch this cadence out).
    segmentTickerRef.current = startFrameTicker(1 / SEGMENT_CADENCE_SECONDS, () => {
      const old = segmentRecorderRef.current;
      segmentRecorderRef.current = null;
      if (old && old.state !== "inactive") old.stop();
      startNewSegmentRecorder();
    });
  }, [startNewSegmentRecorder]);

  const stopSegmented = useCallback(() => {
    segmentTickerRef.current?.stop();
    segmentTickerRef.current = null;
    const recorder = segmentRecorderRef.current;
    segmentRecorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      // Drop the handler so the final partial segment is not transcribed
      // after the session has already ended.
      recorder.onstop = null;
      recorder.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (decodeAudioCtxRef.current && decodeAudioCtxRef.current.state !== "closed") {
      void decodeAudioCtxRef.current.close();
      decodeAudioCtxRef.current = null;
    }
  }, []);

  // -------------------------------------------------------------------------
  // Public start/stop
  // -------------------------------------------------------------------------

  // Throws on a start-time failure ("this browser supports neither path", a
  // getUserMedia rejection) rather than routing it through onFatalError - the
  // caller (which just created a session row) awaits this directly and
  // decides how to unwind, instead of racing an async onFatalError-triggered
  // teardown against its own in-flight "session started" state update.
  // onFatalError is reserved for a genuine mid-session fault (a lost mic
  // stream - see the segmented path's track "ended" listener above).
  const start = useCallback(async () => {
    utterancesRef.current = [];
    setEntries([]);
    guardStateRef.current = INITIAL_RESTART_GUARD_STATE;
    sessionGenerationRef.current = 0;
    pendingSegmentCountRef.current = 0;

    const path = selectTranscriptionPath(capabilities, optionsRef.current.transcriptionOverride);
    if (path === "none") {
      setActivePath("none");
      throw new Error(
        "This browser supports neither live transcription path (Web Speech or MediaRecorder+AudioContext). Try Chrome or Edge."
      );
    }

    activeRef.current = true;
    setActivePath(path);

    if (path === "web-speech") {
      startWebSpeechSession();
    } else {
      try {
        await startSegmentedSession();
      } catch (err) {
        activeRef.current = false;
        setActivePath("none");
        throw new Error(err instanceof Error ? `Could not start the microphone: ${err.message}` : "Could not start the microphone.");
      }
    }
  }, [capabilities, startSegmentedSession, startWebSpeechSession]);

  const stop = useCallback(() => {
    activeRef.current = false;
    stopWebSpeech();
    stopSegmented();
    setActivePath("none");
  }, [stopWebSpeech, stopSegmented]);

  const settle = useCallback((timeoutMs: number) => waitForSettle(() => pendingSegmentCountRef.current, timeoutMs), []);

  // Unmount-only cleanup, mirroring the Recording tab's pattern. stopWebSpeech
  // and stopSegmented are each a useCallback with an empty deps array (always
  // the same function identity), so listing them here is equivalent to an
  // empty deps array in practice - this effect still only ever runs its
  // cleanup once, on unmount - without needing an exhaustive-deps disable.
  useEffect(() => {
    return () => {
      activeRef.current = false;
      stopWebSpeech();
      stopSegmented();
    };
  }, [stopWebSpeech, stopSegmented]);

  return {
    supportsWebSpeech: capabilities.hasWebSpeech,
    supportsSegmented: capabilities.hasSegmentedSupport,
    activePath,
    entries,
    start,
    stop,
    settle,
  };
}
