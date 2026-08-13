"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSupabase } from "@/context/SupabaseProvider";
import { saveRecordingFile } from "@/lib/recording-files";
import type { AvatarLikeness } from "@/lib/avatar-likeness";
// TAVUS_SCRIPT_MAX_CHARS is the AC4.3 soft cap - it lives in src/lib/tavus.ts
// (a plain module, not a server action) alongside the rest of the Tavus
// contract, so it is imported from there rather than duplicated here; two
// copies of "the" script length cap would be free to drift apart.
import { TAVUS_SCRIPT_MAX_CHARS } from "@/lib/tavus";
import {
  avatarStudioConfiguredAction,
  listAvatarLikenessesAction,
  startAvatarTrainingAction,
  refreshAvatarLikenessAction,
  setDefaultAvatarLikenessAction,
  deleteAvatarLikenessAction,
  listAvatarCourseOptionsAction,
  generateAvatarScriptAction,
  startAvatarVideoAction,
  refreshAvatarVideoAction,
} from "@/app/actions";
import {
  AVATAR_SCRIPT_STAGES,
  AVATAR_SAMPLE_MAX_BYTES,
  AVATAR_CONSENT_ACKNOWLEDGEMENT,
  AVATAR_MIN_FRAME_RATE,
  AVATAR_TARGET_FRAME_RATE,
  AVATAR_FRAME_RATE_UNKNOWN_ASSESSMENT,
  avatarScriptTotalSeconds,
  pickAvatarMimeType,
  mergeAvatarFrameRateAssessment,
  describeAvatarResolutionDrop,
  type AvatarMimeChoice,
  type AvatarFrameRateAssessment,
} from "./avatar-script";
import { startFrameRateSampling } from "./frameRateSampler";
// The purpose catalogue (values, labels, and the guidance text that actually
// steers the generated script) is owned by src/lib/avatar-video-purpose.ts -
// imported here rather than re-declared so the dropdown can never drift from
// what generateAvatarScriptAction's brief composer actually understands.
import { AVATAR_VIDEO_PURPOSES, type AvatarVideoPurpose } from "@/lib/avatar-video-purpose";

export interface AvatarCourseOption {
  id: string;
  label: string;
}

// The DB row (read on mount via listAvatarLikenessesAction) is the source of
// truth for training status - training runs 3-4 hours and nothing here may
// be relied on to survive a closed tab. This interval only refreshes the UI
// while the app happens to be open; it is deliberately slow (minutes, not
// seconds) because the Tavus FAQ says training_progress can legitimately sit
// at one value for a while, and a fast poll would just be noise.
const LIKENESS_POLL_MS = 3 * 60 * 1000;

// Video generation is documented as queued/generating/ready/deleted/error
// with no stated duration, but is expected to finish in minutes rather than
// hours, so a shorter interval than the training poll is reasonable here.
const VIDEO_POLL_MS = 8 * 1000;

export type AvatarCaptureState = "idle" | "previewing" | "recording" | "reviewing";
export type AvatarSaveState = "idle" | "saving" | "done" | "failed";

interface SavedSample {
  id: string;
  name: string;
}

function readPersisted(key: string): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(key) ?? "";
}

function describeCaptureError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") {
    return "Access was blocked. Allow camera and microphone for this site in the browser's address-bar settings, then try again.";
  }
  if (name === "NotFoundError") {
    return "No camera or microphone was found. Check that both are connected and not disabled in OS privacy settings.";
  }
  if (name === "NotReadableError") {
    return "The camera or microphone is already in use by another application. Close it and try again.";
  }
  return err instanceof Error ? `Could not start the camera: ${err.message}` : "Could not start the camera and microphone.";
}

export interface UseAvatarStudioReturn {
  // configuration gating (F5)
  configured: boolean | null;

  // device selection (F1) - owned by this hook, independent of the Record
  // view's own camera/mic selection. The device LIST still comes from the
  // single useDevices instance in RecordingTab.tsx; only the SELECTION is
  // separate, and persisted under its own storage keys.
  cameraId: string;
  setCameraId: (value: string) => void;
  micId: string;
  setMicId: (value: string) => void;

  // capture (F1)
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  captureState: AvatarCaptureState;
  captureError: string | null;
  stageIndex: number;
  stage: (typeof AVATAR_SCRIPT_STAGES)[number];
  isLastStage: boolean;
  stageElapsed: number;
  takeElapsed: number;
  takeBytes: number;
  mimeChoice: AvatarMimeChoice | null;
  // AC3/AC4: null while still sampling/nothing requested. See
  // classifyAvatarFrameRate for the ok/warn/block fields, and
  // AvatarFrameRateUnknownAssessment for the terminal "could not verify"
  // outcome (distinct from this being null).
  frameRateAssessment: AvatarFrameRateAssessment | null;
  // Defect 1: true for startCapturePreview's getUserMedia round trip - lets
  // the panel disable "Start camera" so a double-click cannot start two
  // overlapping capture attempts.
  capturePreviewStarting: boolean;
  // "ALSO FIX": non-blocking warning when the camera settled below Tavus's
  // documented resolution minimum - see describeAvatarResolutionDrop.
  resolutionWarning: string | null;
  reviewUrl: string | null;
  reviewDurationSec: number;
  reviewSizeBytes: number;
  meetsMinDuration: boolean;
  withinSizeCap: boolean;
  startCapturePreview: () => Promise<void>;
  startCaptureRecording: () => void;
  advanceStage: () => void;
  cancelRecording: () => void;
  discardTake: () => void;

  // save to library (F1)
  likenessName: string;
  setLikenessName: (value: string) => void;
  saveState: AvatarSaveState;
  saveError: string | null;
  savedSample: SavedSample | null;
  saveTake: () => Promise<void>;

  // consent + training kickoff (F1, F3 UI, F7)
  consentChecked: boolean;
  setConsentChecked: (value: boolean) => void;
  trainBusy: boolean;
  trainError: string | null;
  startTraining: () => Promise<void>;

  // likeness list + lifecycle (F3 UI, F7)
  likenesses: AvatarLikeness[];
  likenessesError: string | null;
  likenessesLoaded: boolean;
  activeTraining: AvatarLikeness | null;
  defaultReadyLikeness: AvatarLikeness | null;
  refreshLikenesses: () => Promise<void>;
  setDefaultLikeness: (id: string) => Promise<void>;
  deleteLikeness: (id: string) => Promise<void>;

  // generation (F4) - course + purpose steering
  courseId: string;
  setCourseId: (value: string) => void;
  courses: AvatarCourseOption[];
  coursesError: string | null;
  purpose: AvatarVideoPurpose | "";
  setPurpose: (value: string) => void;

  // generation (F4)
  prompt: string;
  setPrompt: (value: string) => void;
  script: string;
  setScript: (value: string) => void;
  scriptBusy: boolean;
  scriptError: string | null;
  generateScript: () => Promise<void>;
  videoStatus: string | null;
  videoBusy: boolean;
  videoError: string | null;
  videoFileId: string | null;
  startVideo: () => Promise<void>;

  stopEverythingRef: React.MutableRefObject<() => void>;
}

export function useAvatarStudio(): UseAvatarStudioReturn {
  const { supabase, user } = useSupabase();

  // ---- configuration gating ------------------------------------------------
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await avatarStudioConfiguredAction();
      if (!cancelled) setConfigured(r.configured);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- device selection ------------------------------------------------
  // Deliberately separate state from the Record view's settings.cameraId /
  // settings.micId (and their own persisted keys). That state also feeds
  // useRecorder.ts's live-preview effect, so sharing it here meant picking a
  // device in this view silently started the hidden Record view's camera or
  // microphone too - this hook only ever reads the device LIST from the
  // useDevices instance in RecordingTab.tsx, never its selection.
  const [cameraId, setCameraId] = useState<string>(() => readPersisted("ta-rec-avatar-camera"));
  const [micId, setMicId] = useState<string>(() => readPersisted("ta-rec-avatar-mic"));

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-avatar-camera", cameraId);
  }, [cameraId]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-avatar-mic", micId);
  }, [micId]);

  // ---- capture --------------------------------------------------------------
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordedBytesRef = useRef(0);
  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stageIndexRef = useRef(0);
  const stageElapsedRef = useRef(0);
  const takeElapsedRef = useRef(0);

  const [captureState, setCaptureState] = useState<AvatarCaptureState>("idle");
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [stageElapsed, setStageElapsed] = useState(0);
  const [takeElapsed, setTakeElapsed] = useState(0);
  const [takeBytes, setTakeBytes] = useState(0);
  const [mimeChoice, setMimeChoice] = useState<AvatarMimeChoice | null>(null);
  const [frameRateAssessment, setFrameRateAssessment] = useState<AvatarFrameRateAssessment | null>(null);
  const [resolutionWarning, setResolutionWarning] = useState<string | null>(null);
  // AC3/defect 1: frameRateSampler.ts owns ALL per-measurement state
  // internally now (nothing shared at the hook level) - this just holds
  // whichever cancel function the CURRENTLY active measurement returned.
  const frameRateCleanupRef = useRef<() => void>(() => {});
  // Defect 1: guards startCapturePreview against a re-entrant double-click.
  // captureState cannot do this job - it only flips to "previewing" AFTER
  // the getUserMedia await resolves, so "Start camera" reads as clickable
  // for the whole permission-prompt round trip. Flips synchronously,
  // before any await. The panel also disables the button itself via
  // capturePreviewStarting below - both, not one.
  const startingCapturePreviewRef = useRef(false);
  const [capturePreviewStarting, setCapturePreviewStarting] = useState(false);
  const [reviewBlob, setReviewBlob] = useState<Blob | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [reviewDurationSec, setReviewDurationSec] = useState(0);

  const stage = AVATAR_SCRIPT_STAGES[stageIndex];
  const isLastStage = stageIndex === AVATAR_SCRIPT_STAGES.length - 1;

  // Declared up here (ahead of discardTake, which resets them) rather than
  // down by saveTake, so nothing below references a setter before its state
  // is declared.
  const [likenessName, setLikenessName] = useState<string>(() => readPersisted("ta-rec-avatar-name"));
  const [saveState, setSaveState] = useState<AvatarSaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedSample, setSavedSample] = useState<SavedSample | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-avatar-name", likenessName);
  }, [likenessName]);

  const clearStageTimer = useCallback(() => {
    if (stageTimerRef.current !== null) {
      clearInterval(stageTimerRef.current);
      stageTimerRef.current = null;
    }
  }, []);

  // AC3/defect 1/defect 2/defect 4: drives frameRateSampler.ts (real
  // frames via requestVideoFrameCallback, a getSettings() fallback, a
  // mid-take recheck, and an explicit "could not verify" timeout all live
  // there, each call getting its own private state - see that module) and
  // folds its output into frameRateAssessment. A concrete verdict is
  // combined via mergeAvatarFrameRateAssessment so a later IMPROVEMENT can
  // never erase an earlier bad reading (defect 4), unless the current
  // state is the terminal "unknown" placeholder, which a real verdict
  // always replaces outright. Tied to the STREAM's lifetime, not
  // captureState, so sampling continues across a "previewing" ->
  // "recording" transition - AC5's Save gate, the thing that actually
  // matters for cost, is reached long after both windows close either way.
  const measureFrameRate = useCallback((stream: MediaStream) => {
    const track = stream.getVideoTracks()[0];
    return startFrameRateSampling(videoRef.current, track, {
      onVerdict: (verdict) => {
        setFrameRateAssessment((prev) =>
          prev && prev.status !== "unknown" ? mergeAvatarFrameRateAssessment(prev, verdict) : verdict
        );
      },
      onUnknown: () => {
        setFrameRateAssessment((prev) => prev ?? AVATAR_FRAME_RATE_UNKNOWN_ASSESSMENT);
      },
    });
  }, []);

  const stopRecorderAndTracks = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    frameRateCleanupRef.current();
    frameRateCleanupRef.current = () => {};
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    clearStageTimer();
  }, [clearStageTimer]);

  const startCapturePreview = useCallback(async () => {
    if (startingCapturePreviewRef.current) return; // defect 1 - see the ref's own comment above
    startingCapturePreviewRef.current = true;
    setCapturePreviewStarting(true);
    setCaptureError(null);
    stopRecorderAndTracks();
    setFrameRateAssessment(null);
    setResolutionWarning(null);
    try {
      // AC1.5: 1080p/30fps with audio - Tavus documents both as minimums, and
      // the subject must be audible because the voice is cloned from this
      // footage too. cameraId/micId here are this hook's OWN device
      // selection (see the "device selection" section above) - never the
      // Record view's settings.cameraId/settings.micId.
      const videoConstraintsBase = {
        deviceId: cameraId ? { exact: cameraId } : undefined,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      };
      // Never request audio: false here - this view offers no "no
      // microphone" option at all (a likeness sample requires audio,
      // because the voice is cloned from it), so micId is always either a
      // specific device or "" for the system default. The "off" check is
      // kept only as defence in depth against a stray persisted value.
      const audioConstraints = micId && micId !== "off" ? { deviceId: { exact: micId } } : true;

      // AC2: ask for a floor, not just a hint - `ideal` alone lets a camera
      // silently deliver well under 23fps in dim light while still
      // reporting success. A camera that cannot even ADVERTISE 23fps
      // rejects this call - per spec before any MediaStream is
      // constructed, so nothing leaks from this attempt - and the retry
      // below drops `min` so the user is never left with a dead preview
      // and no camera at all. The measurement below decides whether the
      // resulting footage is actually usable.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            ...videoConstraintsBase,
            frameRate: { min: AVATAR_MIN_FRAME_RATE, ideal: AVATAR_TARGET_FRAME_RATE },
          },
          audio: audioConstraints,
        });
      } catch {
        // Defect 3: retry unconstrained on ANY rejection above, rather
        // than naming a specific error first - there is no reliable
        // cross-engine identity to check (the relevant error type predates
        // being folded into DOMException, and engines have used different
        // names for it), so a predicate here risks missing a real case,
        // rethrowing, and leaving the user with NO camera - and that
        // population is by definition the sub-23fps cameras this feature
        // exists for. Retrying unconstrained reproduces the exact pre-fix
        // behaviour and itself throws a genuine permission/device error if
        // that is the real problem, so nothing is masked.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { ...videoConstraintsBase, frameRate: { ideal: AVATAR_TARGET_FRAME_RATE } },
          audio: audioConstraints,
        });
      }
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCaptureState("previewing");
      frameRateCleanupRef.current = measureFrameRate(stream);
      // "ALSO FIX": a hard frameRate `min` gives the browser fewer degrees
      // of freedom at 1920x1080, and it may satisfy the floor by silently
      // dropping resolution instead - trading a video_fps rejection for a
      // resolution problem after the same wait. Read back what actually
      // negotiated and surface it if short (see describeAvatarResolutionDrop
      // for why this warns rather than adding a second hard constraint).
      const settledHeight = stream.getVideoTracks()[0]?.getSettings().height;
      setResolutionWarning(typeof settledHeight === "number" ? describeAvatarResolutionDrop(settledHeight) : null);
    } catch (err) {
      setCaptureError(describeCaptureError(err));
      setCaptureState("idle");
    } finally {
      startingCapturePreviewRef.current = false;
      setCapturePreviewStarting(false);
    }
  }, [cameraId, micId, stopRecorderAndTracks, measureFrameRate]);

  const startStageTimer = useCallback(() => {
    clearStageTimer();
    stageTimerRef.current = setInterval(() => {
      stageElapsedRef.current += 1;
      takeElapsedRef.current += 1;
      setStageElapsed(stageElapsedRef.current);
      setTakeElapsed(takeElapsedRef.current);
      const current = AVATAR_SCRIPT_STAGES[stageIndexRef.current];
      const onLastStage = stageIndexRef.current === AVATAR_SCRIPT_STAGES.length - 1;
      // AC1.6: the take stops itself once the final stage reaches its
      // target - the user does not have to click anything.
      if (onLastStage && stageElapsedRef.current >= current.targetSeconds) {
        recorderRef.current?.stop();
      }
    }, 1000);
  }, [clearStageTimer]);

  const startCaptureRecording = useCallback(() => {
    if (captureState !== "previewing" || !streamRef.current) return;
    const choice = pickAvatarMimeType((t) =>
      typeof MediaRecorder !== "undefined" ? MediaRecorder.isTypeSupported(t) : false
    );
    if (!choice) {
      setCaptureError("This browser cannot record a usable video format here. Try a recent Chrome or Edge.");
      return;
    }
    // AC1.4: this recorder must always be built from the raw camera stream
    // (streamRef.current below) - never a canvas composite. There is no
    // pipeline canvas anywhere in this view to swap in, unlike
    // useRecorder.ts's startRecording, which does have one and must choose
    // not to use it here. That property is enforced statically by a
    // source-scan test in avatar-script.test.ts, which fails if this file
    // ever references the canvas effects pipeline or feeds MediaRecorder
    // anything other than streamRef.current.
    setMimeChoice(choice);
    setCaptureError(null);
    chunksRef.current = [];
    recordedBytesRef.current = 0;
    setTakeBytes(0);
    stageIndexRef.current = 0;
    stageElapsedRef.current = 0;
    takeElapsedRef.current = 0;
    setStageIndex(0);
    setStageElapsed(0);
    setTakeElapsed(0);

    const recorder = new MediaRecorder(streamRef.current, { mimeType: choice.mimeType });
    recorder.ondataavailable = (evt) => {
      if (evt.data.size > 0) {
        chunksRef.current.push(evt.data);
        recordedBytesRef.current += evt.data.size;
        setTakeBytes(recordedBytesRef.current);
      }
    };
    recorder.onstop = () => {
      const actualMime = recorder.mimeType || choice.mimeType;
      const blob = new Blob(chunksRef.current, { type: actualMime });
      setReviewBlob(blob);
      setReviewUrl(URL.createObjectURL(blob));
      setReviewDurationSec(takeElapsedRef.current);
      clearStageTimer();
      // AC3 cleanup: a take almost always outlasts the sample window (two
      // minutes against three seconds), but this path stops tracks directly
      // rather than through stopRecorderAndTracks, so the in-flight
      // requestVideoFrameCallback registration (if the window somehow has
      // not closed yet) is cancelled here too rather than left dangling on
      // a video element that is about to lose its source.
      frameRateCleanupRef.current();
      frameRateCleanupRef.current = () => {};
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCaptureState("reviewing");
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    setCaptureState("recording");
    startStageTimer();
  }, [captureState, clearStageTimer, startStageTimer]);

  const advanceStage = useCallback(() => {
    // AC1.3: an explicit control, not a timer, moves the take from Speaking
    // to Stillness - the recorder itself is never stopped or restarted here.
    if (stageIndexRef.current >= AVATAR_SCRIPT_STAGES.length - 1) return;
    const next = stageIndexRef.current + 1;
    stageIndexRef.current = next;
    stageElapsedRef.current = 0;
    setStageIndex(next);
    setStageElapsed(0);
  }, []);

  const cancelRecording = useCallback(() => {
    chunksRef.current = [];
    stopRecorderAndTracks();
    setCaptureState("idle");
  }, [stopRecorderAndTracks]);

  const discardTake = useCallback(() => {
    if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    setReviewBlob(null);
    setReviewUrl(null);
    setReviewDurationSec(0);
    setMimeChoice(null);
    setSaveState("idle");
    setSaveError(null);
    setSavedSample(null);
    setCaptureState("idle");
  }, [reviewUrl]);

  const reviewSizeBytes = reviewBlob?.size ?? 0;
  const meetsMinDuration = reviewDurationSec >= avatarScriptTotalSeconds();
  const withinSizeCap = reviewSizeBytes <= AVATAR_SAMPLE_MAX_BYTES;

  // ---- save to library --------------------------------------------------
  const saveTake = useCallback(async () => {
    if (!reviewBlob || !supabase || !user) return;
    if (!meetsMinDuration) {
      const totalTarget = avatarScriptTotalSeconds();
      setSaveError(
        `This take is too short to train from. It needs to run at least ${Math.floor(totalTarget / 60)}:${String(totalTarget % 60).padStart(2, "0")} (the full speaking and stillness stages) - record a new take.`
      );
      setSaveState("failed");
      return;
    }
    if (!withinSizeCap) {
      setSaveError(`This take is larger than the ${Math.round(AVATAR_SAMPLE_MAX_BYTES / (1024 * 1024))} MB limit Tavus allows for training footage - record a shorter take.`);
      setSaveState("failed");
      return;
    }
    // AC5: refuse to save footage this app already knows is below Tavus's
    // frame-rate floor - submitting it would only be discovered as a
    // video_fps training failure after the 3-4 hour round trip. Saving to
    // the library is the earliest point with both the classification (from
    // the capture that just finished) and a natural stop before training
    // ever becomes reachable - there is no saved sample, so the "Train a
    // likeness" panel below never appears.
    if (frameRateAssessment?.status === "block") {
      setSaveError(
        frameRateAssessment.reason ??
          `This take's frame rate was below the ${AVATAR_MIN_FRAME_RATE}fps minimum Tavus requires for training - record a new take in brighter, more even lighting.`
      );
      setSaveState("failed");
      return;
    }
    setSaveState("saving");
    setSaveError(null);
    try {
      const ext = mimeChoice?.mimeType.includes("mp4") ? "mp4" : "webm";
      // "sample" is a recording_files.kind added alongside this feature (see
      // src/lib/recording-files.ts and the widened DB check constraint).
      const file = await saveRecordingFile(supabase, user.id, reviewBlob, {
        name: `Avatar sample ${new Date().toLocaleString()}`,
        kind: "sample",
        mimeType: reviewBlob.type || mimeChoice?.mimeType || "video/webm",
        durationSec: reviewDurationSec,
        fileExt: ext,
        source: "avatar-sample",
      });
      setSavedSample({ id: file.id, name: file.name });
      setSaveState("done");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save the recording to your library.");
      setSaveState("failed");
    }
  }, [reviewBlob, supabase, user, meetsMinDuration, withinSizeCap, mimeChoice, reviewDurationSec, frameRateAssessment]);

  // ---- consent + training kickoff ----------------------------------------
  const [consentChecked, setConsentChecked] = useState(false);
  const [trainBusy, setTrainBusy] = useState(false);
  const [trainError, setTrainError] = useState<string | null>(null);

  // ---- likeness list ------------------------------------------------------
  const [likenesses, setLikenesses] = useState<AvatarLikeness[]>([]);
  const [likenessesError, setLikenessesError] = useState<string | null>(null);
  const [likenessesLoaded, setLikenessesLoaded] = useState(false);

  const refreshLikenesses = useCallback(async () => {
    try {
      const r = await listAvatarLikenessesAction();
      if ("error" in r) {
        setLikenessesError(r.error);
        return;
      }
      setLikenesses(r.likenesses);
      setLikenessesError(null);
    } catch (err) {
      setLikenessesError(err instanceof Error ? err.message : "Could not load your likenesses.");
    } finally {
      setLikenessesLoaded(true);
    }
  }, []);

  // AC3.4: status is read from the DB row on mount, so a user who closes the
  // tab mid-training and comes back hours later sees the true state - never
  // something that lived only in React state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await listAvatarLikenessesAction();
      if (cancelled) return;
      if ("error" in r) {
        setLikenessesError(r.error);
        setLikenessesLoaded(true);
        return;
      }
      setLikenesses(r.likenesses);
      setLikenessesLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeTraining = useMemo(
    () => likenesses.find((l) => l.status === "pending" || l.status === "training") ?? null,
    [likenesses]
  );
  const defaultReadyLikeness = useMemo(
    () => likenesses.find((l) => l.isDefault && l.status === "ready") ?? null,
    [likenesses]
  );

  const startTraining = useCallback(async () => {
    if (!savedSample || !consentChecked || activeTraining) return;
    setTrainBusy(true);
    setTrainError(null);
    try {
      const r = await startAvatarTrainingAction(
        savedSample.id,
        likenessName.trim() || savedSample.name,
        AVATAR_CONSENT_ACKNOWLEDGEMENT
      );
      if ("error" in r) {
        setTrainError(r.error);
        return;
      }
      setConsentChecked(false);
      await refreshLikenesses();
    } catch (err) {
      setTrainError(err instanceof Error ? err.message : "Could not start training.");
    } finally {
      setTrainBusy(false);
    }
  }, [savedSample, consentChecked, activeTraining, likenessName, refreshLikenesses]);

  const setDefaultLikeness = useCallback(
    async (id: string) => {
      const r = await setDefaultAvatarLikenessAction(id);
      if ("error" in r) {
        setLikenessesError(r.error);
        return;
      }
      await refreshLikenesses();
    },
    [refreshLikenesses]
  );

  const deleteLikeness = useCallback(
    async (id: string) => {
      const r = await deleteAvatarLikenessAction(id);
      if ("error" in r) {
        setLikenessesError(r.error);
        return;
      }
      await refreshLikenesses();
    },
    [refreshLikenesses]
  );

  // Poll only the likeness(es) still in flight, on the order of minutes.
  // Stops on its own once nothing is non-terminal, and is cleared on
  // unmount - no orphaned intervals.
  const nonTerminalIds = useMemo(
    () => likenesses.filter((l) => l.status === "pending" || l.status === "training").map((l) => l.id),
    [likenesses]
  );

  useEffect(() => {
    if (nonTerminalIds.length === 0) return;
    let cancelled = false;
    const poll = async () => {
      for (const id of nonTerminalIds) {
        try {
          const r = await refreshAvatarLikenessAction(id);
          if (cancelled) return;
          if (!("error" in r)) {
            setLikenesses((prev) => prev.map((l) => (l.id === r.likeness.id ? r.likeness : l)));
          }
        } catch {
          // A transient poll failure is not surfaced as a hard error - the
          // DB row (re-read on the next mount regardless) stays the source
          // of truth, and the next tick tries again.
        }
      }
    };
    const timer = setInterval(() => {
      void poll();
    }, LIKENESS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [nonTerminalIds]);

  // ---- generation (F4) ---------------------------------------------------
  const [prompt, setPrompt] = useState<string>(() => readPersisted("ta-rec-avatar-prompt"));
  const [script, setScript] = useState<string>(() => readPersisted("ta-rec-avatar-script"));
  const [scriptBusy, setScriptBusy] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-avatar-prompt", prompt);
  }, [prompt]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-avatar-script", script);
  }, [script]);

  // ---- course + purpose (F4 extension) -----------------------------------
  // Both refine the prompt above rather than replacing it, so they persist
  // the same way the prompt itself does. courseIdRaw/purposeRaw are the
  // literal persisted values; courseId/purpose (below) are the sanitized
  // values actually exposed to the panel and sent to the model, so a stale
  // or unrecognised persisted value never reaches either.
  const [courseIdRaw, setCourseIdRaw] = useState<string>(() => readPersisted("ta-rec-avatar-course"));
  const [purposeRaw, setPurposeRaw] = useState<string>(() => readPersisted("ta-rec-avatar-purpose"));

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-avatar-course", courseIdRaw);
  }, [courseIdRaw]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-rec-avatar-purpose", purposeRaw);
  }, [purposeRaw]);

  const [courses, setCourses] = useState<AvatarCourseOption[]>([]);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const [coursesLoaded, setCoursesLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await listAvatarCourseOptionsAction();
      if (cancelled) return;
      if ("error" in r) {
        setCoursesError(r.error);
        setCoursesLoaded(true);
        return;
      }
      setCourses(r.courses);
      setCoursesLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // A persisted course id that no longer matches any loaded course - the
  // course was deleted, or this browser is now signed into a different
  // account than the one that set it - is treated as "no course" here,
  // never rendered as a selected value with no matching option (that is how
  // MUI blanks the control instead of showing the intended default). The
  // sanitized value is withheld as "" until the course list has actually
  // loaded, so the select never flashes a stale id before the real list
  // arrives either.
  const courseId = useMemo(() => {
    if (!coursesLoaded) return "";
    if (courseIdRaw && !courses.some((c) => c.id === courseIdRaw)) return "";
    return courseIdRaw;
  }, [coursesLoaded, courses, courseIdRaw]);

  // Same defensive treatment for purpose: a persisted value that no longer
  // appears in AVATAR_VIDEO_PURPOSES falls back to "no specific purpose"
  // rather than rendering a blanked select.
  const purpose = useMemo<AvatarVideoPurpose | "">(() => {
    if (!purposeRaw) return "";
    const match = AVATAR_VIDEO_PURPOSES.find((p) => p.value === purposeRaw);
    return match ? (match.value as AvatarVideoPurpose) : "";
  }, [purposeRaw]);

  const generateScript = useCallback(async () => {
    if (!prompt.trim()) return;
    setScriptBusy(true);
    setScriptError(null);
    try {
      const r = await generateAvatarScriptAction({
        prompt: prompt.trim(),
        courseId: courseId || null,
        purpose: purpose || null,
      });
      if ("error" in r) {
        setScriptError(r.error);
        return;
      }
      setScript(r.script);
    } catch (err) {
      setScriptError(err instanceof Error ? err.message : "Could not generate a script.");
    } finally {
      setScriptBusy(false);
    }
  }, [prompt, courseId, purpose]);

  const [videoJobId, setVideoJobId] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<string | null>(null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoFileId, setVideoFileId] = useState<string | null>(null);

  const startVideo = useCallback(async () => {
    const trimmedScript = script.trim();
    if (!trimmedScript || !defaultReadyLikeness) return;
    if (trimmedScript.length > TAVUS_SCRIPT_MAX_CHARS) {
      setVideoError(`This app limits generated scripts to ${TAVUS_SCRIPT_MAX_CHARS} characters - shorten the script and try again.`);
      return;
    }
    setVideoBusy(true);
    setVideoError(null);
    setVideoFileId(null);
    setVideoStatus(null);
    try {
      const name = `Avatar video - ${prompt.trim().slice(0, 60) || new Date().toLocaleString()}`;
      const r = await startAvatarVideoAction(trimmedScript, name);
      if ("error" in r) {
        setVideoError(r.error);
        setVideoBusy(false);
        return;
      }
      setVideoJobId(r.jobId);
      setVideoStatus("queued");
    } catch (err) {
      setVideoError(err instanceof Error ? err.message : "Could not start video generation.");
      setVideoBusy(false);
    }
  }, [script, prompt, defaultReadyLikeness]);

  useEffect(() => {
    if (!videoJobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await refreshAvatarVideoAction(videoJobId);
        if (cancelled) return;
        // refreshAvatarVideoAction's real return type carries an OPTIONAL
        // `error` alongside `status`/`fileId` for a couple of edge branches
        // (e.g. a video row with no provider id yet), not just the plain
        // `{ error }` shape - so `r.error` can be `string | undefined` here
        // even after this narrows away the pure-error shape.
        if ("error" in r && r.error) {
          setVideoError(r.error);
          setVideoBusy(false);
          setVideoJobId(null);
          return;
        }
        if (!("status" in r)) {
          setVideoError("Could not check on the avatar video.");
          setVideoBusy(false);
          setVideoJobId(null);
          return;
        }
        setVideoStatus(r.status);
        const normalized = r.status.trim().toLowerCase();
        // The action returns Tavus's raw status string. "ready" is the
        // documented success state for /v2/videos; "completed" is included
        // defensively in case a webhook-shaped value ever surfaces here too
        // (see the GET-vs-webhook mismatch on the training side of this
        // contract). "deleted" and "error" are the documented failure/void
        // terminal states.
        if ((normalized === "ready" || normalized === "completed") && r.fileId) {
          setVideoFileId(r.fileId);
          setVideoBusy(false);
          setVideoJobId(null);
        } else if (normalized === "error" || normalized === "deleted") {
          setVideoError("Video generation did not finish successfully.");
          setVideoBusy(false);
          setVideoJobId(null);
        }
      } catch {
        // transient - the next tick tries again
      }
    };
    void poll();
    const timer = setInterval(() => {
      void poll();
    }, VIDEO_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [videoJobId]);

  // ---- unmount cleanup ----------------------------------------------------
  const stopEverythingRef = useRef<() => void>(() => {});
  useEffect(() => {
    stopEverythingRef.current = () => {
      stopRecorderAndTracks();
      if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    };
  }, [stopRecorderAndTracks, reviewUrl]);

  return {
    configured,

    cameraId,
    setCameraId,
    micId,
    setMicId,

    videoRef,
    captureState,
    captureError,
    stageIndex,
    stage,
    isLastStage,
    stageElapsed,
    takeElapsed,
    takeBytes,
    mimeChoice,
    frameRateAssessment,
    capturePreviewStarting,
    resolutionWarning,
    reviewUrl,
    reviewDurationSec,
    reviewSizeBytes,
    meetsMinDuration,
    withinSizeCap,
    startCapturePreview,
    startCaptureRecording,
    advanceStage,
    cancelRecording,
    discardTake,

    likenessName,
    setLikenessName,
    saveState,
    saveError,
    savedSample,
    saveTake,

    consentChecked,
    setConsentChecked,
    trainBusy,
    trainError,
    startTraining,

    likenesses,
    likenessesError,
    likenessesLoaded,
    activeTraining,
    defaultReadyLikeness,
    refreshLikenesses,
    setDefaultLikeness,
    deleteLikeness,

    courseId,
    setCourseId: setCourseIdRaw,
    courses,
    coursesError,
    purpose,
    setPurpose: setPurposeRaw,

    prompt,
    setPrompt,
    script,
    setScript,
    scriptBusy,
    scriptError,
    generateScript,
    videoStatus,
    videoBusy,
    videoError,
    videoFileId,
    startVideo,

    stopEverythingRef,
  };
}
