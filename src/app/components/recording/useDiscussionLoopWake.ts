"use client";

// Discussion reply capture - the wake-ticker mechanism's latches and
// resolvers, split out of useDiscussionReplies.ts (set C3) purely to stay
// under recording-split.structure.test.ts's 1000-line ceiling on
// src/app/components/recording/ (non-recursive) - see that file's own
// header for the full account of what stayed and why.
//
// Owns the mounted/loop-running latch (`loopsActiveRef`, doubling as AC43's
// isRunningRef and AC50's mountedRef), the generation counter
// (`loopEpochRef`) and start latch (`loopsStartedRef`) NEW-1 needs to keep a
// React StrictMode-orphaned pair of loop instances from running forever
// alongside a freshly-started pair, and the wake-resolver mechanism BL1
// introduced (`waitForWake`/`flushWakeResolvers`) so both consumer loops can
// idle on a Worker-backed ticker instead of a chained `setTimeout` (which
// Chromium throttles to ~1/s, then ~1/min, once this tab is hidden - exactly
// this feature's whole useful life, since the user is looking at their LMS
// in another window).
//
// This hook creates `wakeTickerRef` but never the ticker itself - starting
// and pausing/resuming the actual ticker is useDiscussionLoopStarter.ts's
// job, since that needs `runExtractionLoop`/`runDraftLoop` as inputs and
// those are declared in useDiscussionReplies.ts AFTER this hook must already
// have handed back `waitForWake` (both loops close over it). Splitting the
// wake mechanism this way - latches/resolvers here, starting/stopping there
// - is what lets useDiscussionReplies.ts call this hook early (before the
// two loops exist) and the starter hook late (after they do), with no
// circular dependency between the two.
//
// NEW-1 (BLOCKER, fixed originally in useDiscussionReplies.ts, unchanged by
// this move): the wake-ticker cleanup effect below is the ONE place that
// tears the wake mechanism down, and it undoes everything the loop-start
// effect (useDiscussionLoopStarter.ts) latches - that symmetry is the actual
// fix. Before that original fix, nothing ever reset `loopsStartedRef`, so on
// any first mount where the loop-start condition already held (the ordinary
// returning-user case: a persisted table with rows, or `ta-rec-view`
// restored to "discussions"), React StrictMode's simulated destroy-then-
// create ran this cleanup (stopping and nulling the ticker) and then the
// loop-start effect's setup again - which returned early on the still-
// latched ref and never recreated the ticker. Both consumer loops then
// suspended on a `waitForWake()` promise nothing could ever resolve again:
// frames piled up to MAX_PENDING_FRAMES and nothing was ever extracted or
// drafted, for the whole `next dev` session, with every gate green.
//
// Resetting `loopsStartedRef.current = false` here lets the loop-start
// effect's next run actually restart things - but a reset guard alone is NOT
// sufficient, because `loopsActiveRef` (this hook's OTHER "am I still
// mounted" ref) flips false-then-true-again fully SYNCHRONOUSLY across
// StrictMode's cleanup-then-remount (no microtask yields occur in between:
// React runs every effect's cleanup, then every effect's setup, all inside
// one synchronous pass). By the time a loop suspended in this cleanup's
// `flushWakeResolvers()` call actually resumes (a microtask, scheduled only
// after that whole synchronous pass finishes), the OLD loop's own `while
// (loopsActiveRef.current)` check would see `true` again - set by the
// remount, not by anything telling it "you are the stale instance" - and it
// would keep running side by side with the NEW pair the remount just
// started, doing the same work twice for the rest of the session.
// `loopEpochRef` is what actually distinguishes them: the loop-start effect
// bumps it every time it really starts a pair of loops, each loop instance
// captures the value it saw at its own start, and its `while` condition
// re-checks that captured value on every wake - so the orphaned pass-1
// instance's stale epoch stops matching the moment the pass-2 instance
// bumps it, and pass-1 exits cleanly instead of running forever alongside
// pass-2.
//
// A REAL unmount (production, or the user navigating away) does not hit
// this ambiguity: `loopsActiveRef` is already false by the time this cleanup
// runs (the mount-latch effect's own cleanup, declared earlier below and
// therefore cleaned up AFTER this one, on the same real unmount) and there
// is no remount to bump the epoch back up, so the woken loop's very first
// re-check of `loopsActiveRef.current` is `false` and it exits for good -
// unchanged from AC48-AC51's existing guarantee. This ordering - the mount-
// latch effect declared BEFORE the wake-ticker cleanup effect, both inside
// THIS hook - is exactly what the comment above depends on; it must not be
// reordered.

import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { FrameTicker } from "@/lib/frame-ticker";

export interface UseDiscussionLoopWakeReturn {
  loopsActiveRef: MutableRefObject<boolean>;
  loopEpochRef: MutableRefObject<number>;
  loopsStartedRef: MutableRefObject<boolean>;
  wakeTickerRef: MutableRefObject<FrameTicker | null>;
  waitForWake: () => Promise<void>;
  flushWakeResolvers: () => void;
}

export function useDiscussionLoopWake(): UseDiscussionLoopWakeReturn {
  // --- Mounted / loop-running latch. Doubles as AC43's isRunningRef and
  // AC50's mountedRef. Declared first - see this file's header for why its
  // relative order against the wake-ticker cleanup effect below matters. ---
  const loopsActiveRef = useRef(true);
  useEffect(() => {
    loopsActiveRef.current = true;
    return () => {
      loopsActiveRef.current = false;
    };
  }, []);

  const wakeResolversRef = useRef<Set<() => void>>(new Set());
  const wakeTickerRef = useRef<FrameTicker | null>(null);
  const loopsStartedRef = useRef(false);
  const loopEpochRef = useRef(0);

  const waitForWake = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      wakeResolversRef.current.add(resolve);
    });
  }, []);

  const flushWakeResolvers = useCallback(() => {
    const resolvers = wakeResolversRef.current;
    wakeResolversRef.current = new Set();
    resolvers.forEach((resolve) => resolve());
  }, []);

  useEffect(() => {
    return () => {
      loopsStartedRef.current = false;
      wakeTickerRef.current?.stop();
      wakeTickerRef.current = null;
      flushWakeResolvers();
    };
  }, [flushWakeResolvers]);

  return { loopsActiveRef, loopEpochRef, loopsStartedRef, wakeTickerRef, waitForWake, flushWakeResolvers };
}
