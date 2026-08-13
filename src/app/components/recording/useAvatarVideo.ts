"use client";

import { useCallback, useEffect, useState } from "react";
import { startAvatarVideoAction, refreshAvatarVideoAction } from "@/app/actions";
// TAVUS_SCRIPT_MAX_CHARS is the AC4.3 soft cap - it lives in src/lib/tavus.ts
// (a plain module, not a server action) alongside the rest of the Tavus
// contract, so it is imported from there rather than duplicated here; two
// copies of "the" script length cap would be free to drift apart.
import { TAVUS_SCRIPT_MAX_CHARS } from "@/lib/tavus";
import type { AvatarLikeness } from "@/lib/avatar-likeness";

// Video generation is documented as queued/generating/ready/deleted/error
// with no stated duration, but is expected to finish in minutes rather than
// hours, so a shorter interval than the training poll is reasonable here.
const VIDEO_POLL_MS = 8 * 1000;

export interface UseAvatarVideoReturn {
  videoStatus: string | null;
  videoBusy: boolean;
  videoError: string | null;
  videoFileId: string | null;
  startVideo: () => Promise<void>;
}

/**
 * Video generation job (F4): kickoff plus its status poll - split out of
 * useAvatarStudio.ts. `script`, `prompt`, and `defaultReadyLikeness` are
 * produced by useAvatarScript.ts / useAvatarTraining.ts and threaded in
 * explicitly rather than read from context or a module singleton.
 */
export function useAvatarVideo(
  script: string,
  prompt: string,
  defaultReadyLikeness: AvatarLikeness | null
): UseAvatarVideoReturn {
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

  return {
    videoStatus,
    videoBusy,
    videoError,
    videoFileId,
    startVideo,
  };
}
