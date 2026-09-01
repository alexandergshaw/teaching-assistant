"use client";

// Discussion reply capture - starting (and pausing/resuming) the two consumer
// loops' shared wake ticker, split out of useDiscussionReplies.ts (set C3)
// purely to stay under recording-split.structure.test.ts's 1000-line ceiling
// on src/app/components/recording/ (non-recursive) - see that file's own
// header for the full account of what stayed and why.
//
// Takes `runExtractionLoop`/`runDraftLoop` (declared in
// useDiscussionReplies.ts, which owns the extraction loop and the dispatch
// wiring per the split's own rule of leaving that in place) as plain
// callback deps - this hook never calls them itself outside the effects
// below, and never reaches into what they close over. Called AFTER those two
// callbacks exist in useDiscussionReplies.ts, and AFTER useDiscussionLoopWake
// (this file's sibling split) has already handed back the latches/resolvers
// both loops themselves also close over - see that file's own header for why
// the wake mechanism is split into two hooks instead of one.
//
// S8/AC37: start both loops (and the wake ticker that drives their idle
// waits) at most ONCE, for the hook's whole mount-to-unmount lifetime -
// never restarted, so this does not reopen AC43's "no effect keyed on
// `rows`" rule. But AC37 requires "the panel does no work at all when it has
// never been opened and no persisted table exists", and a `[]`-deps effect
// starts unconditionally on first mount of every page load, since this panel
// is kept mounted at all times (AC3). So START is gated on whichever of
// these becomes true FIRST: a capture is running, a persisted table already
// has rows (AC37's own exception - drafting must still be able to resume for
// it), or the panel has ever been activated (`hasActivatedRef`, set by
// useDiscussionCourses.ts's own course-loading effect). This is deliberately
// NOT gated on `active` itself (AC46 must hold: `active` reaches only the
// lazy course fetch) as the loops' own condition - but NEW-3: `active` still
// belongs in this effect's deps below, because flipping `active` true is
// what makes the course-loading effect start fetching at all, and a
// first-ever capture on a panel that had never previously been activated
// would otherwise depend entirely on `capturing` flipping - which cannot
// happen before the loops (and therefore `capture.start()`'s own downstream
// effects) exist to begin with. `active` itself is read nowhere in the body
// below; it is a trigger, not a condition. Do not remove it as "unused" -
// see AC46 in the acceptance criteria for the full account of why this is
// one active-reaching site, not the only one.
//
// `coursesLoading` is ALSO in this effect's deps, and it is the one that
// actually observes `hasActivatedRef.current`'s freshly-set value now. Since
// useDiscussionCourses.ts's own latch-class fix, `hasActivatedRef.current`
// no longer flips synchronously in the same commit `active` becomes true -
// it flips later, asynchronously, inside that hook's own `finally`, once the
// fetch actually settles. That `finally` also flips `coursesLoading` false
// in the same synchronous stretch, so it is the dependency that carries the
// ref's new value into a re-run of THIS effect; without it, a panel opened
// with zero persisted rows and no capture running would never see
// `hasActivatedRef.current` become true through any dependency change, and
// the idle loops (and AC37's exception for them) would never start until
// the user did something else that happened to touch `capturing` or
// `rawRowsLength`.
//
// S5 fix: this gate reads `rawRowsLength` (rowsApi.rawRows.length at the
// call site, never the filtered `rows.length`) - a returning user with a
// persisted filter matching nothing must not have loop start silently fall
// through to `hasActivatedRef`/`capturing` (F0-2 forbids the filter changing
// anything but what is visible).
//
// NEW-2: whether either loop has anything to wake up FOR, right now
// (`hasWork`). Computed in render (not derived only inside an effect) so
// both effects below can read the exact same, already-current value - the
// loop-start effect needs it to decide whether the ticker it is about to
// create should be immediately paused again, and the ticker pause/resume
// effect needs it to react to every later change. Deliberately does NOT
// include `rawRowsLength > 0` - having a persisted table sitting there is
// why the loops were STARTED at all (so Retry/redraft can resume against
// it), but it says nothing about whether either loop has anything to do
// RIGHT NOW. Once started, the wake ticker used to run for the rest of the
// page's life - a dedicated Worker posting to the main thread roughly 3.3
// times a second, forever, on a panel that is never unmounted (AC3), even
// with no capture running, an empty pending-frame queue and an empty draft
// queue. The second effect below pauses and resumes the SAME ticker the
// first effect created, tied to `hasWork` - it never creates the FIRST
// ticker (that stays the first effect's job, so NEW-1's symmetric start/stop
// ownership is untouched) and never needs its own cleanup: the wake-ticker
// cleanup effect in useDiscussionLoopWake.ts is the sole final backstop on
// unmount, and `wakeTickerRef.current = null` after every stop here makes a
// second, redundant stop from that backstop a safe no-op.

import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { startFrameTicker, type FrameTicker } from "@/lib/frame-ticker";
import { shouldTickerRun } from "./discussion-capture";
import { LOOP_IDLE_POLL_MS } from "./discussion-draft-loop";

export interface UseDiscussionLoopStarterArgs {
  active: boolean;
  coursesLoading: boolean;
  capturing: boolean;
  pendingFrames: number;
  extracting: boolean;
  drafting: boolean;
  draftQueueSize: number;
  rawRowsLength: number;
  hasActivatedRef: MutableRefObject<boolean>;
  loopsStartedRef: MutableRefObject<boolean>;
  loopEpochRef: MutableRefObject<number>;
  wakeTickerRef: MutableRefObject<FrameTicker | null>;
  flushWakeResolvers: () => void;
  runExtractionLoop: (epoch: number) => Promise<void>;
  runDraftLoop: (epoch: number) => Promise<void>;
}

export function useDiscussionLoopStarter(args: UseDiscussionLoopStarterArgs): void {
  const {
    active,
    coursesLoading,
    capturing,
    pendingFrames,
    extracting,
    drafting,
    draftQueueSize,
    rawRowsLength,
    hasActivatedRef,
    loopsStartedRef,
    loopEpochRef,
    wakeTickerRef,
    flushWakeResolvers,
    runExtractionLoop,
    runDraftLoop,
  } = args;

  const hasWork = shouldTickerRun({ capturing, pendingFrames, extracting, drafting, draftQueueSize });

  useEffect(() => {
    if (loopsStartedRef.current) return;
    if (!(capturing || rawRowsLength > 0 || hasActivatedRef.current)) return;
    loopsStartedRef.current = true;
    // NEW-1: bump the epoch BEFORE starting the loops, and capture the
    // resulting value locally to hand to both - see useDiscussionLoopWake.ts
    // for what this guards against.
    const epoch = ++loopEpochRef.current;
    wakeTickerRef.current = startFrameTicker(1000 / LOOP_IDLE_POLL_MS, flushWakeResolvers);
    void runExtractionLoop(epoch);
    void runDraftLoop(epoch);
    // NEW-2: `hasWork` above was computed in THIS SAME render, so it is
    // exactly as current as any other value this effect closes over. A
    // resumed session (persisted rows, nothing actually drafting or
    // capturing yet) starts the loops but has nothing for them to wake up
    // for - stop the ticker immediately rather than waiting for some LATER
    // change to `hasWork` that may not come for a while, or ever, before the
    // user does anything. The effect right below keeps this in sync for
    // every subsequent change.
    if (!hasWork) {
      wakeTickerRef.current.stop();
      wakeTickerRef.current = null;
    }
  }, [
    active,
    coursesLoading,
    capturing,
    rawRowsLength,
    flushWakeResolvers,
    runExtractionLoop,
    runDraftLoop,
    hasWork,
    hasActivatedRef,
    loopEpochRef,
    loopsStartedRef,
    wakeTickerRef,
  ]);

  useEffect(() => {
    if (!loopsStartedRef.current) return;
    if (hasWork) {
      if (!wakeTickerRef.current) {
        wakeTickerRef.current = startFrameTicker(1000 / LOOP_IDLE_POLL_MS, flushWakeResolvers);
      }
    } else if (wakeTickerRef.current) {
      wakeTickerRef.current.stop();
      wakeTickerRef.current = null;
    }
  }, [hasWork, flushWakeResolvers, loopsStartedRef, wakeTickerRef]);
}
