"use client";

import { useEffect, useRef } from "react";
import type { AvatarLikeness } from "@/lib/avatar-likeness";
import { AVATAR_SCRIPT_STAGES, type AvatarMimeChoice, type AvatarFrameRateAssessment } from "./avatar-script";
// The purpose catalogue (values, labels, and the guidance text that actually
// steers the generated script) is owned by src/lib/avatar-video-purpose.ts -
// imported here rather than re-declared so the dropdown can never drift from
// what generateAvatarScriptAction's brief composer actually understands.
import type { AvatarVideoPurpose } from "@/lib/avatar-video-purpose";
import { useAvatarConfig } from "./useAvatarConfig";
import {
  useAvatarCapture,
  type AvatarCaptureState,
  type AvatarSaveState,
  type SavedSample,
} from "./useAvatarCapture";
import { useAvatarTraining } from "./useAvatarTraining";
import { useAvatarScript, type AvatarCourseOption } from "./useAvatarScript";
import { useAvatarVideo } from "./useAvatarVideo";

// Re-exported for anything importing these type names from this module -
// this file used to declare them directly, before the hook split moved
// their owning state into useAvatarCapture.ts / useAvatarScript.ts. The
// public surface of THIS module (what it exports) is unchanged; only where
// the types are declared moved.
export type { AvatarCaptureState, AvatarSaveState } from "./useAvatarCapture";
export type { AvatarCourseOption } from "./useAvatarScript";

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

/**
 * Composition root for Avatar Studio. The hook itself used to hold every
 * concern directly; a 1000-line project cap forced a split into a family of
 * useAvatar*.ts hooks (config/device selection, capture + save, training,
 * script generation, video generation), each called unconditionally here
 * and composed into the one UseAvatarStudioReturn contract AvatarStudioPanel
 * actually consumes. Values a later concern needs from an earlier one
 * (savedSample/likenessName -> training; script/prompt/defaultReadyLikeness
 * -> video) are threaded through explicitly as arguments below, never via
 * context or a module-level singleton.
 */
export function useAvatarStudio(): UseAvatarStudioReturn {
  const config = useAvatarConfig();
  const capture = useAvatarCapture(config.cameraId, config.micId);
  const training = useAvatarTraining(capture.savedSample, capture.likenessName);
  const script = useAvatarScript();
  const video = useAvatarVideo(script.script, script.prompt, training.defaultReadyLikeness);

  // ---- unmount cleanup ----------------------------------------------------
  const { stopRecorderAndTracks, reviewUrl } = capture;
  const stopEverythingRef = useRef<() => void>(() => {});
  useEffect(() => {
    stopEverythingRef.current = () => {
      stopRecorderAndTracks();
      if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    };
  }, [stopRecorderAndTracks, reviewUrl]);

  return {
    configured: config.configured,

    cameraId: config.cameraId,
    setCameraId: config.setCameraId,
    micId: config.micId,
    setMicId: config.setMicId,

    videoRef: capture.videoRef,
    captureState: capture.captureState,
    captureError: capture.captureError,
    stageIndex: capture.stageIndex,
    stage: capture.stage,
    isLastStage: capture.isLastStage,
    stageElapsed: capture.stageElapsed,
    takeElapsed: capture.takeElapsed,
    takeBytes: capture.takeBytes,
    mimeChoice: capture.mimeChoice,
    frameRateAssessment: capture.frameRateAssessment,
    capturePreviewStarting: capture.capturePreviewStarting,
    resolutionWarning: capture.resolutionWarning,
    reviewUrl: capture.reviewUrl,
    reviewDurationSec: capture.reviewDurationSec,
    reviewSizeBytes: capture.reviewSizeBytes,
    meetsMinDuration: capture.meetsMinDuration,
    withinSizeCap: capture.withinSizeCap,
    startCapturePreview: capture.startCapturePreview,
    startCaptureRecording: capture.startCaptureRecording,
    advanceStage: capture.advanceStage,
    cancelRecording: capture.cancelRecording,
    discardTake: capture.discardTake,

    likenessName: capture.likenessName,
    setLikenessName: capture.setLikenessName,
    saveState: capture.saveState,
    saveError: capture.saveError,
    savedSample: capture.savedSample,
    saveTake: capture.saveTake,

    consentChecked: training.consentChecked,
    setConsentChecked: training.setConsentChecked,
    trainBusy: training.trainBusy,
    trainError: training.trainError,
    startTraining: training.startTraining,

    likenesses: training.likenesses,
    likenessesError: training.likenessesError,
    likenessesLoaded: training.likenessesLoaded,
    activeTraining: training.activeTraining,
    defaultReadyLikeness: training.defaultReadyLikeness,
    refreshLikenesses: training.refreshLikenesses,
    setDefaultLikeness: training.setDefaultLikeness,
    deleteLikeness: training.deleteLikeness,

    courseId: script.courseId,
    setCourseId: script.setCourseId,
    courses: script.courses,
    coursesError: script.coursesError,
    purpose: script.purpose,
    setPurpose: script.setPurpose,

    prompt: script.prompt,
    setPrompt: script.setPrompt,
    script: script.script,
    setScript: script.setScript,
    scriptBusy: script.scriptBusy,
    scriptError: script.scriptError,
    generateScript: script.generateScript,
    videoStatus: video.videoStatus,
    videoBusy: video.videoBusy,
    videoError: video.videoError,
    videoFileId: video.videoFileId,
    startVideo: video.startVideo,

    stopEverythingRef,
  };
}
