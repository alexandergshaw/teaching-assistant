"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Take } from "./types";
import type { UseRecordingSettingsReturn } from "./useRecordingSettings";
import { mixAudioTracks, type MixedAudio } from "./audio-mix";
import { startAudioSidecar, type AudioSidecar } from "./audio-sidecar";
// The level-meter analyser (AudioContext/AnalyserNode/rAF loop) was pulled
// out to src/lib/audio-level-meter.ts to stay under
// recording-split.structure.test.ts's 1000-line ceiling on this directory -
// it has no recording-specific dependency (no Take, no MediaRecorder, no
// recording settings), and useCameraPreview.ts already carried a byte-for-
// byte duplicate of the same logic, so it belongs next to the technique, not
// duplicated per caller. See that file's own header for the full account.
import { startAudioLevelMeter, type AudioLevelMeter } from "@/lib/audio-level-meter";
import {
  SCREEN_AUDIO_NOT_GRANTED_NOTICE,
  browserMayOfferDisplayAudio,
  classifyDisplayAudioGrant,
  requestScreenShareStream,
  acquireScreenShareMicTrack,
} from "./screen-source";

// Re-exported so StagePanel.tsx's existing `import { SCREEN_AUDIO_NOT_GRANTED_NOTICE } from "./useRecorder"`
// keeps resolving - the string itself now lives in screen-source.ts, next to
// the classification logic that produces it, rather than being duplicated.
export { SCREEN_AUDIO_NOT_GRANTED_NOTICE };

// D-1: stopRecording() below has two callers that can race - the auto-stop
// interval and a manual Stop / the "ended" listener (see the comment above
// the call site for the full story). Both funnel through the same
// stopRecordingRef, and while a closing card is counting down the
// elapsed-seconds interval keeps running (recState stays "recording" on
// purpose - the card's own timeout is what flips it to idle), so it keeps
// re-firing the auto-stop check and re-entering stopRecording every second
// until the card finishes.
//
// This is the pure decision the re-entry guard at the top of stopRecording()
// reduces to: given the card phase, is a closing card already in flight? A
// closing card owns finishing the stop itself, via its own window.setTimeout
// - re-entering while it is "closing" (auto-stop firing again, a second
// manual Stop, "ended" firing mid-card) must be a no-op, or the card gets cut
// short by whichever caller re-enters next. Exported (rather than a local
// closure) so this rule - the part most likely to look "redundant" and get
// simplified away - has a test pinning it down.
export function isClosingCardInProgress(cardPhase: "title" | "closing" | null): boolean {
  return cardPhase === "closing";
}

export interface UseRecorderReturn {
  recState: "idle" | "recording" | "paused";
  elapsed: number;
  bytes: number;
  muted: boolean;
  level: number;
  hasAudio: boolean;
  countdown: number | null;
  finishing: boolean;
  // AC5: null when there is nothing to say (checkbox on and system audio is
  // actually in the mix). Set only for a screen source; B renders it beside
  // the stage's existing "no mic" warning.
  screenAudioNotice: string | null;
  // FIX 3 (AC1b): mixAudioTracks resolves `resumedState` to whatever state
  // the AudioContext actually settled in after the resume() attempt this
  // module fires immediately on construction. Null when there is nothing to
  // say (no mix was created, or it reached "running"). Set only once the
  // mix's resume has settled, so a take that finished mixing correctly never
  // shows a stale warning from an earlier attempt.
  audioMixNotice: string | null;
  // AC5's disabled-checkbox branch (SourceDevicesPanel.tsx): undefined means
  // "unknown / not applicable" (no screen preview yet, or a non-screen
  // source) and leaves the checkbox enabled. false means specifically that a
  // screen preview asked for display audio and the browser granted no track
  // at all - never set false just because the checkbox itself is off (that
  // is a different state with a different message, AC5's "checkbox off" row).
  hasDisplayAudioTrack: boolean | undefined;
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
  // Owns the level-meter's live AudioContext/AnalyserNode/rAF handle (see
  // src/lib/audio-level-meter.ts) - replaced wholesale on every startMeter()
  // call, torn down by stopMeter().
  const meterRef = useRef<AudioLevelMeter | null>(null);
  const elapsedRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Config the current stream was opened with (see the restart effect).
  const appliedCfgRef = useRef("");

  const stopRecordingRef = useRef<() => void>(() => {});
  const usedPipelineRef = useRef(false);

  // D1 fix: for a screen source the mic lives ONLY here, never as a second
  // track on the display stream - MediaRecorder encodes only a stream's
  // first audio track. Mixing both into one track (audio-mix.ts) at record
  // time is the real fix; holding the mic separately is what lets mute
  // (AC3) and the level meter (AC3b) operate on the mic alone.
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  // The display stream's own audio track (system audio), if granted. Held
  // separately for the same reason.
  const displayAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  // The live mix for the current recording, closed from both recorder.onstop
  // and stopEverything (AC2).
  const mixedAudioRef = useRef<MixedAudio | null>(null);
  // AC22a's parallel audio-only recorder for the current recording, if any.
  const audioSidecarRef = useRef<AudioSidecar | null>(null);
  // Live mirror of recState for the "ended" listener (AC6), which is
  // attached once per startPreview call and would otherwise close over a
  // stale recState.
  const recStateRef = useRef<"idle" | "recording" | "paused">("idle");
  // B1: set by the "ended" listener when it routes a live take through
  // stopRecordingRef rather than tearing down immediately. stopRecordingRef
  // only stops the MediaRecorder (and, when a closing card is active, waits
  // it out) - it does not release the camera/mic/pipeline the way
  // stopEverything does. recorder.onstop reads and clears this flag, after
  // the take has been built and handed off, to finish that teardown - or
  // the stream, mic and 30fps pipeline all stay live under a dead share.
  const endedTeardownPendingRef = useRef(false);

  const [muted, setMuted] = useState(false);
  const [recState, setRecState] = useState<"idle" | "recording" | "paused">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [bytes, setBytes] = useState(0);
  const [level, setLevel] = useState(0);
  const [hasAudio, setHasAudio] = useState(true);
  const [screenAudioNotice, setScreenAudioNotice] = useState<string | null>(null);
  // FIX 3 (AC1b): surfaces mixAudioTracks' resumedState so a suspended
  // AudioContext - which produces a mixed track carrying no audio, with no
  // error - is not entirely silent to the user. See where it is set, in
  // startRecording, for the reasoning.
  const [audioMixNotice, setAudioMixNotice] = useState<string | null>(null);
  // AC5's disabled-checkbox fact (see UseRecorderReturn's doc comment on the
  // field this backs) - reset to undefined by stopEverything and set only in
  // the screen branch of startPreview, from whether the browser granted a
  // display audio track at all.
  const [hasDisplayAudioTrack, setHasDisplayAudioTrack] = useState<boolean | undefined>(undefined);

  // Countdown before recording
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [finishing, setFinishing] = useState(false);

  // Mirror muted state into ref
  const mutedRef = useRef(false);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    recStateRef.current = recState;
  }, [recState]);

  // AC3: for a screen source the mic lives in micTrackRef, never on
  // streamRef.current (D1) - flipping `enabled` there would mute system
  // audio instead of the mic. Other sources keep their mic on the stream.
  const micTracksForControl = (): MediaStreamTrack[] => {
    if (settings.source === "screen") {
      return micTrackRef.current ? [micTrackRef.current] : [];
    }
    return streamRef.current?.getAudioTracks() ?? [];
  };

  // Helper to enable/disable mic capture
  const setMicCaptureEnabled = (enabled: boolean) => {
    micTracksForControl().forEach((t) => { t.enabled = enabled; });
  };

  const stopMeter = () => {
    meterRef.current?.stop();
    meterRef.current = null;
  };

  const startMeter = useCallback((stream: MediaStream) => {
    stopMeter();
    meterRef.current = startAudioLevelMeter(stream, setLevel);
  }, []);

  const stopEverything = useCallback(async () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    // Held outside streamRef (D1) - torn down explicitly here too, or a
    // screen source's mic/system-audio tracks stay open after preview ends.
    if (micTrackRef.current) {
      micTrackRef.current.stop();
      micTrackRef.current = null;
    }
    if (displayAudioTrackRef.current) {
      displayAudioTrackRef.current.stop();
      displayAudioTrackRef.current = null;
    }
    // AC2: closed here AND in recorder.onstop - close() is idempotent.
    mixedAudioRef.current?.close();
    mixedAudioRef.current = null;
    setScreenAudioNotice(null);
    setHasDisplayAudioTrack(undefined);
    setAudioMixNotice(null);
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
        // AC4: explicit hints live in screen-source.ts's
        // SCREEN_SHARE_CONSTRAINTS. System audio must not go through voice
        // DSP - noise suppression on a shared tab destroys music and speech
        // in the shared content. The mic keeps its own DSP settings,
        // requested separately below.
        stream = await requestScreenShareStream();

        // AC5/AC3: the display audio track is held on its own ref, never
        // left as a second track for MediaRecorder to silently drop (D1),
        // and the "Share system audio" checkbox decides whether it ever
        // reaches the mix at all. classifyDisplayAudioGrant (screen-source.ts)
        // owns the three-state notice logic; this call site only acts on it.
        const displayAudioTrack = stream.getAudioTracks()[0] ?? null;
        // AC5's disabled-checkbox fact: true/false reflects only whether the
        // browser granted a track at all, never the "Share system audio"
        // checkbox's own value - SourceDevicesPanel disables the checkbox
        // (with a reason) exactly when this is false.
        setHasDisplayAudioTrack(displayAudioTrack !== null);
        const grant = classifyDisplayAudioGrant(
          displayAudioTrack !== null,
          settings.shareSystemAudio,
          browserMayOfferDisplayAudio()
        );
        if (displayAudioTrack && grant.keepTrack) {
          displayAudioTrackRef.current = displayAudioTrack;
        } else {
          // Either nothing was granted, or it was granted but the checkbox
          // is off - stop it immediately rather than keep capturing audio
          // nothing will use.
          displayAudioTrack?.stop();
          displayAudioTrackRef.current = null;
        }
        setScreenAudioNotice(grant.notice);

        // D1: the mic is requested separately (acquireScreenShareMicTrack)
        // and held in its own ref - never `stream.addTrack`'d onto the
        // display stream.
        micTrackRef.current = await acquireScreenShareMicTrack(settings.micId, {
          noiseSuppression: settings.noiseSuppression,
          echoCancellation: settings.echoCancellation,
          autoGain: settings.autoGain,
        });
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
      // AC3b: hasAudio and the level meter must follow the mic, not the
      // combined stream - for a screen source `stream` carries system audio
      // (if any), not the mic, so deriving either from `stream` would show
      // system audio's presence/level as if it were the mic's.
      if (settings.source === "screen") {
        setHasAudio(micTrackRef.current !== null);
      } else {
        setHasAudio(stream.getAudioTracks().length > 0);
      }
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
      if (settings.source === "screen") {
        startMeter(new MediaStream(micTrackRef.current ? [micTrackRef.current] : []));
      } else {
        startMeter(stream);
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.addEventListener("ended", () => {
          // AC6: the browser's own "Stop sharing" bar ended the share. If a
          // take is in progress, finish it cleanly through the normal stop
          // path (closing card, then teardown deferred to onstop) instead of
          // tearing everything down immediately, which would race the final
          // chunk and skip the closing card entirely.
          if (recStateRef.current !== "idle") {
            // B1: stopRecordingRef only stops the recorder itself (and,
            // when a closing card is active, waits it out) - it releases
            // nothing else. Flag it so recorder.onstop finishes the real
            // teardown once the take has been built, or the camera, mic
            // and 30fps pipeline all stay live after the share has already
            // ended.
            endedTeardownPendingRef.current = true;
            stopRecordingRef.current();
          } else {
            void stopEverything();
          }
        });
      }

      // AC14: only a screen source shows the composited pipeline canvas as
      // the live preview (camera keeps the raw <video>), so only a screen
      // source needs the pipeline running before a take starts.
      if (settings.source === "screen") {
        startPipeline();
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
  }, [settings.cameraId, settings.micId, settings.resolution, settings.source, settings.noiseSuppression, settings.echoCancellation, settings.autoGain, settings.shareSystemAudio, stopEverything, startMeter, startPipeline, initPipelineCanvas, sizeCanvases, setError, setHasStream, loadDevices, videoRef]);

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

  // AC5/S3: turning "Share system audio" off mid-preview stops that track
  // immediately, without re-running getDisplayMedia (only the explicit
  // "Share again" action does that - see screenAudioNotice). A track that
  // has been stopped cannot be un-stopped, so turning the checkbox back on
  // does not restore audio - "Share again" is the only way back, and the
  // off-then-on state needs its own truthful string rather than the stale
  // "off" one, or a checkbox reading "on" is a lie about what is actually
  // being mixed. Wrapped in an async IIFE (no real await needed - nothing
  // here is actually asynchronous) only to satisfy the lint rule against a
  // setState call reached synchronously from an effect body; the previous
  // `cancelled` flag guarded nothing, since nothing here ever yields before
  // the setState call, so it could never be observed and is removed.
  useEffect(() => {
    if (settings.source !== "screen") return;
    void (async () => {
      if (!settings.shareSystemAudio) {
        const track = displayAudioTrackRef.current;
        if (!track) return;
        track.stop();
        if (displayAudioTrackRef.current === track) displayAudioTrackRef.current = null;
        setScreenAudioNotice("System audio is off - only your microphone is being recorded.");
        return;
      }
      // Checkbox is back on. If a track is already flowing into the mix,
      // startPreview already cleared the notice when it was granted - there
      // is nothing stale to correct.
      if (displayAudioTrackRef.current) return;
      if (hasDisplayAudioTrack === false) {
        // Never granted in the first place - the checkbox being ticked
        // again does not change what the browser actually shared.
        setScreenAudioNotice(
          browserMayOfferDisplayAudio()
            ? SCREEN_AUDIO_NOT_GRANTED_NOTICE
            : "This browser does not share system audio. Your microphone is still being recorded."
        );
      } else if (hasDisplayAudioTrack === true) {
        // Granted once, then stopped by turning the checkbox off - the
        // true state ("granted but stopped and not in the mix") has no
        // other string, and collapsing it into the "off" message would be
        // exactly the lie AC5 exists to prevent.
        setScreenAudioNotice(
          "System audio was granted earlier but was stopped when you turned it off - use Share again to include it."
        );
      }
      // hasDisplayAudioTrack === undefined: no screen preview yet, or a
      // non-screen source - nothing to say.
    })();
  }, [settings.shareSystemAudio, settings.source, hasDisplayAudioTrack]);

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

  // Mute/unmute the live mic without stopping the stream or recording. Mutes
  // the mic only (AC3) - system audio is deliberately left alone.
  const toggleMute = () => {
    const next = !muted;
    micTracksForControl().forEach((t) => {
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

  // The title card (started in startRecording, below) and the closing card
  // (started in stopRecording) each decrement cardNotice.secondsLeft once a
  // second in exactly the same way, stopping only on their own `kind` (so a
  // stray tick from a card that already finished never touches the other
  // card's notice) - this is that identical ticking pulled out once rather
  // than duplicated per card. What happens once the countdown reaches zero
  // (re-enabling the mic, actually stopping the recorder, etc.) differs per
  // card and stays in its own window.setTimeout at each call site; this
  // function only ticks the shared visual countdown.
  const tickCardCountdown = (kind: "title" | "closing") => {
    cardNoticeTimerRef.current = setInterval(() => {
      setCardNotice((prev) => {
        if (!prev || prev.kind !== kind) return prev;
        if (prev.secondsLeft <= 1) {
          if (cardNoticeTimerRef.current) {
            clearInterval(cardNoticeTimerRef.current);
            cardNoticeTimerRef.current = null;
          }
          return null;
        }
        return { kind, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
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
      // FIX 3: cleared per-recording so a stale warning from an earlier take
      // never lingers onto this one.
      setAudioMixNotice(null);

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
            // AC1/AC2 (D1's actual fix): mix rather than stack. A screen
            // source's audio lives in micTrackRef/displayAudioTrackRef,
            // never on streamRef.current itself (see the D1 comment where
            // those refs are declared); every other video source's mic is
            // still the stream's own audio track, and mixing a single track
            // is a free no-op (audio-mix.ts).
            const audioTracks: MediaStreamTrack[] =
              settings.source === "screen"
                ? [micTrackRef.current, displayAudioTrackRef.current].filter(
                    (t): t is MediaStreamTrack => t !== null
                  )
                : streamRef.current.getAudioTracks();
            const mixed = mixAudioTracks(audioTracks);
            mixedAudioRef.current = mixed;
            // Falls back to today's video-only behaviour when there is no
            // audio at all (AC2).
            recStream = mixed
              ? new MediaStream([...canvasStream.getVideoTracks(), mixed.track])
              : new MediaStream(canvasStream.getVideoTracks());
            if (mixed) {
              // AC22a: a second recorder on the mixed track alone, so a
              // transcript/announcement can be produced without replaying
              // the take in real time afterward. Never allowed to affect the
              // video take - startAudioSidecar swallows its own failures.
              audioSidecarRef.current = startAudioSidecar(mixed.track, pickAudioMimeType());
              // FIX 3 (AC1b): mixAudioTracks fires ctx.resume() immediately
              // but the outcome (resumedState) previously had no reader
              // anywhere - a resume refused under Chrome's autoplay policy
              // left the destination track carrying no audio, with nothing
              // on screen to say so, which is D1's silent-audio failure
              // shape reached by a second route. Observed here, once the
              // resume attempt settles; if the context never reached
              // "running" the user is told the take may be silent, the same
              // way the other capture problems (screenAudioNotice) are
              // surfaced. A rejected/refused resume never stays invisible.
              void mixed.resumedState.then((state) => {
                if (state !== "running") {
                  setAudioMixNotice(
                    "This take's audio may be silent - the browser blocked the microphone/system-audio mix from starting automatically. If it plays back with no sound, record it again after clicking or interacting with the page first."
                  );
                }
              });
            }
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
        // AC14 lifecycle edit: the pipeline keeps compositing through the
        // whole screen-source preview - it stops only when the preview
        // itself does, in stopEverything - so only a non-screen source's
        // pipeline (recording-only, as before) stops here.
        if (settings.source !== "screen") {
          stopPipeline();
        }
        const actualMimeType = recorder.mimeType || mimeType || (settings.source === "audio" ? "audio/webm" : "video/webm");
        const blob = new Blob(chunksRef.current, { type: actualMimeType });
        const url = URL.createObjectURL(blob);
        const takeId = crypto.randomUUID();

        void (async () => {
          // AC22a: the sidecar's segments become Take.audioSegments so a
          // transcript/announcement never has to replay the take in real
          // time. A sidecar failure (or none having started) must not block
          // or affect the video take itself.
          let audioSegments: Blob[] | undefined;
          const sidecar = audioSidecarRef.current;
          audioSidecarRef.current = null;
          if (sidecar) {
            try {
              const segments = await sidecar.stop();
              if (segments.length > 0) audioSegments = segments;
            } catch (err) {
              console.error("Audio sidecar failed to stop cleanly:", err);
            }
          }
          // AC2: closed here AND in stopEverything - close() is idempotent.
          mixedAudioRef.current?.close();
          mixedAudioRef.current = null;

          const newTake: Take = {
            id: takeId,
            name: `Take ${takesLength + 1}`,
            url,
            mimeType: actualMimeType,
            sizeBytes: blob.size,
            durationSec: elapsedRef.current,
            createdAt: Date.now(),
            ...(audioSegments ? { audioSegments } : {}),
          };

          addRecordedTake(newTake, blob);

          // B1: the browser's own "Stop sharing" bar ended the share while
          // this take was recording (see the "ended" listener above).
          // stopRecordingRef only stopped the recorder; now that the take
          // is built and handed off, finish the teardown the same way a
          // manual Stop would, or the camera/mic stay open (the OS
          // recording indicator stays lit) and the pipeline keeps
          // compositing a dead video track.
          if (endedTeardownPendingRef.current) {
            endedTeardownPendingRef.current = false;
            void stopEverything();
          }
        })();
      };

      recorderRef.current = recorder;
      // B2: route through the card-aware stopRecording (defined below),
      // not a raw recorder.stop(). AC6's stated purpose is preserving the
      // closing card on an "ended"-triggered stop; the previous raw
      // assignment stopped the recorder immediately and skipped the
      // closing-card branch entirely, which is the half of AC6 this fixes.
      // stopRecording reads recorderRef.current, which was just set above,
      // so it targets this same recorder.
      stopRecordingRef.current = stopRecording;
      recorder.start(1000);
      setRecState("recording");
      // Feature 3: Start title card if enabled
      if (usedPipeline && cardsOn) {
        cardPhaseRef.current = "title";
        setMicCaptureEnabled(false);
        const cardDuration = Number(cardSecondsRef.current);
        setCardNotice({ kind: "title", secondsLeft: cardDuration });
        tickCardCountdown("title");
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
      // AC22a-bis: two independent MediaRecorder instances - left alone the
      // sidecar records straight through the pause and drifts out of sync
      // with the video take.
      audioSidecarRef.current?.pause();
      setRecState("paused");
    }
  };

  const resumeRecording = () => {
    if (recorderRef.current && recorderRef.current.state === "paused") {
      recorderRef.current.resume();
      audioSidecarRef.current?.resume();
      setRecState("recording");
    }
  };

  const stopRecording = () => {
    // Feature 3: Handle closing card
    if (!recorderRef.current || recorderRef.current.state === "inactive") {
      // FIX 5: the "ended" listener (AC6) sets endedTeardownPendingRef before
      // calling stopRecordingRef.current() (this function), expecting
      // recorder.onstop to clear it once the take is built. When the
      // recorder is already inactive this function returns before ever
      // reaching onstop, so nothing clears the flag - stopEverything doesn't
      // either. Left set, it stays true into the NEXT take's onstop handler,
      // which then fires a full, unwanted teardown (camera/mic/pipeline all
      // torn down) the instant that unrelated next take finishes recording.
      endedTeardownPendingRef.current = false;
      return;
    }
    // D-1 fix: stopRecordingRef (which now points here, per the B2 comment
    // below) has two callers - a manual Stop / the "ended" listener, AND the
    // auto-stop interval (~:540). recState is deliberately left "recording"
    // for the whole closing-card countdown (the card's own window.setTimeout
    // below is what flips it to idle), so that interval keeps ticking and
    // keeps re-checking elapsedRef.current >= limit while the card is still
    // showing - calling back in here on every tick until the timeout finally
    // clears cardPhaseRef.current. isClosingCardInProgress (defined above,
    // near the top of this file) is that re-entry rule pulled out on its
    // own: once a card is closing, only the scheduled timeout may finish the
    // stop - any other call here (auto-stop re-firing, a manual Stop pressed
    // twice, "ended" firing mid-card) must be a no-op, or the card gets cut
    // short by whichever caller re-enters next.
    if (isClosingCardInProgress(cardPhaseRef.current)) {
      return;
    }
    if (cardsOn && usedPipelineRef.current) {
      setFinishing(true);
      cardPhaseRef.current = "closing";
      setMicCaptureEnabled(false);
      const cardDuration = Number(cardSecondsRef.current);
      setCardNotice({ kind: "closing", secondsLeft: cardDuration });
      tickCardCountdown("closing");
      window.setTimeout(() => {
        cardPhaseRef.current = null;
        setCardNotice(null);
        if (cardNoticeTimerRef.current) {
          clearInterval(cardNoticeTimerRef.current);
          cardNoticeTimerRef.current = null;
        }
        setMicCaptureEnabled(!mutedRef.current);
        setFinishing(false);
        // Pre-existing race (not new to this fix, only newly reachable from
        // the auto-stop path): the recorder may already be inactive by the
        // time this timeout runs (e.g. a manual Stop taken just under the
        // auto-stop limit). Calling stop() on an inactive recorder throws
        // InvalidStateError, and this runs inside a setTimeout where nothing
        // catches it.
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
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
    screenAudioNotice,
    audioMixNotice,
    hasDisplayAudioTrack,
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
