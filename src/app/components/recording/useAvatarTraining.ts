"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AvatarLikeness } from "@/lib/avatar-likeness";
import {
  listAvatarLikenessesAction,
  startAvatarTrainingAction,
  refreshAvatarLikenessAction,
  setDefaultAvatarLikenessAction,
  deleteAvatarLikenessAction,
} from "@/app/actions";
import { AVATAR_CONSENT_ACKNOWLEDGEMENT } from "./avatar-script";
import type { SavedSample } from "./useAvatarCapture";

// The DB row (read on mount via listAvatarLikenessesAction) is the source of
// truth for training status - training runs 3-4 hours and nothing here may
// be relied on to survive a closed tab. This interval only refreshes the UI
// while the app happens to be open; it is deliberately slow (minutes, not
// seconds) because the Tavus FAQ says training_progress can legitimately sit
// at one value for a while, and a fast poll would just be noise.
const LIKENESS_POLL_MS = 3 * 60 * 1000;

export interface UseAvatarTrainingReturn {
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
}

/**
 * Consent + training kickoff, plus the trained-likeness list and its
 * lifecycle (F1, F3 UI, F7) - split out of useAvatarStudio.ts. `savedSample`
 * and `likenessName` are produced by useAvatarCapture.ts and threaded in
 * explicitly rather than read from context or a module singleton.
 */
export function useAvatarTraining(
  savedSample: SavedSample | null,
  likenessName: string
): UseAvatarTrainingReturn {
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

  return {
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
  };
}
