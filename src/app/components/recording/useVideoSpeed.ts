"use client";

// The "Change speed" view's render/save state machine: rate selection
// (persisted), probing the picked source's duration for the AC11 cost line,
// and driving renderSpeedAdjustedVideo() through to a saved Files-tab row.
//
// Source PICKING itself is NOT owned here - the panel composes
// useVideoImport() (session take / backup folder / library file) directly,
// the same way CaptionStudio.tsx does, and hands this hook only the
// resulting { videoUrl, fileName }. That keeps this hook focused on the one
// piece of the feature that is genuinely new: the speed change itself.
//
// See docs/video-speed-adjust-acceptance-criteria.md for the full contract -
// this file implements Group C (AC9-AC17) of that document.

import { useCallback, useEffect, useRef, useState } from "react";
import { useSupabase } from "@/context/SupabaseProvider";
import { saveRecordingFile } from "@/lib/recording-files";
import { awaitVideoMetadata, ensureFiniteDuration } from "@/lib/caption-burn";
import {
  isSpeedRate,
  formatSpeedLabel,
  speedAdjustedName,
  speedAdjustedDurationSec,
  renderSpeedAdjustedVideo,
  type SpeedRate,
  type SpeedProgress,
} from "@/lib/video-speed";
import { fmt } from "./types";

// Unlike the walkthrough pane's in-memory subject, a picked video survives a
// reload, so this control's own key (below) is a real, canary-tracked
// persisted key - it lives inside the recording-split canary's scan (this
// file is directly under recording/, not a subdirectory) and is added to
// that hand-maintained list in the same commit as this file.
export const SPEED_RATE_STORAGE_KEY = "ta-rec-speed-rate";
export const DEFAULT_SPEED_RATE: SpeedRate = 1.5;

// ---------------------------------------------------------------------------
// Pure helpers - pinned by AC3/AC11/AC13/AC17's exact copy, and the only part
// of this feature a node-env test can actually reach (see the Limits section
// of the acceptance criteria: no MediaRecorder, no canvas, no AudioContext,
// no HTMLVideoElement, and no component is ever rendered by this suite).
// ---------------------------------------------------------------------------

export function readPersistedSpeedRate(raw: string | null): SpeedRate {
  const n = Number(raw);
  return isSpeedRate(n) ? n : DEFAULT_SPEED_RATE;
}

/** AC11: the wall-clock-cost line, shown before the user commits. Until a
 *  source is picked (or its duration could not be determined), the generic
 *  slow-down warning is shown instead of a fabricated number. */
export function formatCostLine(sourceDurationSec: number | null, rate: number): string {
  const outputSec = speedAdjustedDurationSec(sourceDurationSec, rate);
  if (outputSec === null) {
    return "Re-encoding plays the video through in real time, so a slower copy takes longer to make than the original is long.";
  }
  const mmss = fmt(Math.round(outputSec));
  return `Re-encoding plays the video through in real time - about ${mmss} at ${formatSpeedLabel(rate)} - and the copy will be ${mmss} long.`;
}

/** AC17: the visible progress line. */
export function formatProgressLine(rate: number, pct: number, remainingWallSec: number): string {
  return `Re-encoding at ${formatSpeedLabel(rate)} - ${pct}% - about ${fmt(Math.round(remainingWallSec))} left`;
}

/** AC12: the progressbar's aria-valuetext - same facts, spoken form. */
export function formatProgressAriaValueText(rate: number, pct: number, remainingWallSec: number): string {
  return `Re-encoding at ${formatSpeedLabel(rate)}, ${pct} percent, about ${fmt(Math.round(remainingWallSec))} left`;
}

/** AC12: the role="status" region announces stage changes and roughly every
 *  25 percent - NOT every tick, which floods a screen reader. `pct` is
 *  monotonic (SpeedProgress's own contract), so comparing which 25-point
 *  bucket each value falls in is enough to catch every quarter boundary
 *  exactly once, including the final 100. */
export function crossedAnnounceThreshold(prevPct: number, pct: number): boolean {
  return Math.floor(pct / 25) > Math.floor(prevPct / 25);
}

export type SpeedStage = "idle" | "reading" | "rendering" | "saving";

/** AC12's role="status" copy for each stage transition. Idle has no
 *  transition string of its own - callers set the terminal outcome text
 *  ("Saved.", "Cancelled.", "Failed.") directly at the point they know it. */
export function stageStatusMessage(stage: Exclude<SpeedStage, "idle">): string {
  switch (stage) {
    case "reading":
      return "Reading the video.";
    case "rendering":
      return "Re-encoding started.";
    case "saving":
      return "Re-encoding finished. Saving to the Files tab.";
  }
}

export function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "unknown error";
}

/** AC13's stage-distinguishable failure copy, pinned verbatim. */
export function stageFailureMessage(stage: "reading" | "rendering" | "saving", reason: string): string {
  if (stage === "reading") return `Could not read that video - ${reason}. Nothing was saved.`;
  if (stage === "rendering") return `Could not re-encode this video - ${reason}. Nothing was saved.`;
  return `The video was made but could not be saved to the Files tab - ${reason}. Try saving again.`;
}

export const NOT_SIGNED_IN_MESSAGE = "Sign in to save to the Files tab.";
export const CANCELLED_MESSAGE = "Cancelled - nothing was saved.";
export const NO_SOURCE_MESSAGE = "Pick a video first.";
export const PITCH_FALLBACK_MESSAGE =
  "This browser could not hold the pitch steady, so voices will sound higher or lower.";
export const KEEP_OPEN_WARNING =
  "Keep this tab open - the re-encode runs in this browser and stops if you close the page.";

/** AC14: names the next step in the chain rather than stopping at "Saved." */
export function successMessage(name: string): string {
  return `Saved "${name}" to the Files tab. To caption it, open Caption a video and press Refresh under "From the Files tab".`;
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export interface UseVideoSpeedOptions {
  videoUrl: string | null;
  fileName: string;
}

interface PendingSave {
  blob: Blob;
  name: string;
  durationSec: number;
  rateForOrigin: SpeedRate;
}

export interface UseVideoSpeedReturn {
  rate: SpeedRate;
  setRate: (rate: SpeedRate) => void;
  sourceDurationSec: number | null;
  costLine: string;
  stage: SpeedStage;
  busy: boolean;
  progress: SpeedProgress | null;
  progressLine: string | null;
  progressAriaValueText: string | null;
  statusMessage: string;
  errorText: string | null;
  cancelledText: string | null;
  pitchWarning: boolean;
  successText: string | null;
  blockedReason: string | null;
  canRetrySave: boolean;
  start: () => void;
  cancel: () => void;
  retrySave: () => void;
}

export function useVideoSpeed({ videoUrl, fileName }: UseVideoSpeedOptions): UseVideoSpeedReturn {
  const { supabase, user } = useSupabase();

  const [rate, setRate] = useState<SpeedRate>(() =>
    readPersistedSpeedRate(typeof window === "undefined" ? null : localStorage.getItem(SPEED_RATE_STORAGE_KEY))
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(SPEED_RATE_STORAGE_KEY, String(rate));
  }, [rate]);

  // AC11: probed fresh whenever the picked source changes, from a throwaway
  // element - never the visible preview, which must keep playing wherever
  // the user left it. Mirrors RecordingTab's own buildTakeFromLibraryFile.
  const [sourceDurationSec, setSourceDurationSec] = useState<number | null>(null);
  useEffect(() => {
    // react-hooks/set-state-in-effect: every setState below is reached only
    // after an awaited microtask, inside the async IIFE, per this repo's
    // established idiom (see StagePanel.tsx's countdown/recState effects) -
    // never synchronously from the effect body itself.
    let cancelled = false;
    const probe = document.createElement("video");
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      setSourceDurationSec(null);
      if (!videoUrl) return;
      try {
        probe.preload = "metadata";
        probe.muted = true;
        probe.src = videoUrl;
        await awaitVideoMetadata(probe);
        const dur = await ensureFiniteDuration(probe);
        if (!cancelled) setSourceDurationSec(dur);
      } catch {
        // Best effort - the cost line falls back to the generic warning.
        if (!cancelled) setSourceDurationSec(null);
      }
    })();
    return () => {
      cancelled = true;
      // Stop the probe from loading/seeking a long file in the background
      // once it is abandoned (videoUrl changed before it finished). Do NOT
      // revoke videoUrl itself here - it belongs to useVideoImport, not to
      // this effect.
      probe.removeAttribute("src");
    };
  }, [videoUrl]);

  const [stage, setStage] = useState<SpeedStage>("idle");
  const [progress, setProgress] = useState<SpeedProgress | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [cancelledText, setCancelledText] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  const [pitchWarning, setPitchWarning] = useState(false);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastAnnouncedPctRef = useRef(0);

  // Unmount-only: abort an in-flight render so it does not keep running
  // (and keep trying to setState) after this pane's owner tears down.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const runSave = useCallback(
    async (blob: Blob, name: string, durationSec: number, rateForOrigin: SpeedRate) => {
      if (!supabase || !user) {
        setPendingSave({ blob, name, durationSec, rateForOrigin });
        setErrorText(NOT_SIGNED_IN_MESSAGE);
        setStatusMessage("Failed.");
        setStage("idle");
        return;
      }
      setStage("saving");
      setStatusMessage(stageStatusMessage("saving"));
      try {
        const saved = await saveRecordingFile(supabase, user.id, blob, {
          name,
          kind: "recording",
          mimeType: blob.type || "video/webm",
          durationSec,
          origin: `speed-${formatSpeedLabel(rateForOrigin)}`,
        });
        setPendingSave(null);
        setSuccessText(successMessage(saved.name));
        setStatusMessage("Saved.");
        setStage("idle");
      } catch (err) {
        setPendingSave({ blob, name, durationSec, rateForOrigin });
        setErrorText(stageFailureMessage("saving", describeError(err)));
        setStatusMessage("Failed.");
        setStage("idle");
      }
    },
    [supabase, user]
  );

  // AC12: only one render may run at a time.
  const start = useCallback(() => {
    if (stage !== "idle" || !videoUrl) return;
    if (!supabase || !user) {
      setErrorText(NOT_SIGNED_IN_MESSAGE);
      return;
    }

    setErrorText(null);
    setCancelledText(null);
    setSuccessText(null);
    setPitchWarning(false);
    setPendingSave(null);
    setProgress(null);
    lastAnnouncedPctRef.current = 0;

    const rateAtStart = rate;
    const nameAtStart = fileName;
    const urlAtStart = videoUrl;

    void (async () => {
      setStage("reading");
      setStatusMessage(stageStatusMessage("reading"));
      let blob: Blob;
      try {
        blob = await (await fetch(urlAtStart)).blob();
      } catch (err) {
        setErrorText(stageFailureMessage("reading", describeError(err)));
        setStatusMessage("Failed.");
        setStage("idle");
        return;
      }

      setStage("rendering");
      setStatusMessage(stageStatusMessage("rendering"));
      const controller = new AbortController();
      abortControllerRef.current = controller;
      try {
        const result = await renderSpeedAdjustedVideo(blob, rateAtStart, {
          signal: controller.signal,
          onProgress: (p) => {
            setProgress(p);
            if (crossedAnnounceThreshold(lastAnnouncedPctRef.current, p.pct)) {
              lastAnnouncedPctRef.current = p.pct;
              setStatusMessage(formatProgressAriaValueText(rateAtStart, p.pct, p.remainingWallSec));
            }
          },
        });
        abortControllerRef.current = null;
        setPitchWarning(!result.pitchPreserved);
        const name = speedAdjustedName(nameAtStart, rateAtStart);
        await runSave(result.blob, name, result.outputDurationSec, rateAtStart);
      } catch (err) {
        abortControllerRef.current = null;
        if (err instanceof DOMException && err.name === "AbortError") {
          // AC1d/AC12: a cancellation, never an error state.
          setCancelledText(CANCELLED_MESSAGE);
          setStatusMessage("Cancelled.");
          setStage("idle");
          return;
        }
        setErrorText(stageFailureMessage("rendering", describeError(err)));
        setStatusMessage("Failed.");
        setStage("idle");
      }
    })();
  }, [stage, videoUrl, supabase, user, rate, fileName, runSave]);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const retrySave = useCallback(() => {
    if (!pendingSave) return;
    setErrorText(null);
    void runSave(pendingSave.blob, pendingSave.name, pendingSave.durationSec, pendingSave.rateForOrigin);
  }, [pendingSave, runSave]);

  return {
    rate,
    setRate,
    sourceDurationSec,
    costLine: formatCostLine(sourceDurationSec, rate),
    stage,
    busy: stage !== "idle",
    progress,
    progressLine: progress ? formatProgressLine(rate, progress.pct, progress.remainingWallSec) : null,
    progressAriaValueText: progress ? formatProgressAriaValueText(rate, progress.pct, progress.remainingWallSec) : null,
    statusMessage,
    errorText,
    cancelledText,
    pitchWarning,
    successText,
    blockedReason: !videoUrl ? NO_SOURCE_MESSAGE : null,
    canRetrySave: pendingSave !== null,
    start,
    cancel,
    retrySave,
  };
}
