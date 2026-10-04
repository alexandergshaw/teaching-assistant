"use client";

// Auto-draft on stop (F1), extracted from WalkthroughAnnouncementPanel.tsx
// (SMOOTH-WALKTHROUGH W3, R-AC16) so the panel stays well under its size
// target. Behavior is unchanged except that autoDraftOn is now the persisted
// toggle threaded in from useWalkthroughSetup rather than a hard-coded
// constant.
//
// ONCE PER STOP: the pending ref is armed when capturing falls true -> false
// (the Stop button OR the browser sharing bar) and disarmed the moment the
// draft fires or a new capture starts, so this can neither repeat nor run from
// a remount. shouldAutoDraft requires an empty slot, and the reducer's
// generate-started guard independently refuses to touch a drafted slot: an
// existing draft is never overwritten.

import { useEffect, useRef, type MutableRefObject } from "react";
import type { SavedFormatsState } from "./announcement-draft-slots";
import { shouldAutoDraft } from "./walkthrough-run-decisions";

export interface WalkthroughAutoDraftInput {
  readonly autoDraftOn: boolean;
  readonly capturing: boolean;
  readonly extracting: boolean;
  /** The panel's synchronous in-flight marker for a frame batch (set before
   * the extraction await), read here so a draft cannot fire into the window
   * where neither pendingFrames nor extracting shows a batch in flight. */
  readonly batchInFlightRef: MutableRefObject<boolean>;
  readonly pendingFrames: number;
  readonly hasMaterial: boolean;
  readonly readyToDraftCount: number;
  readonly savedFormatsState: SavedFormatsState;
  readonly generate: () => Promise<void>;
  /** The panel owns the "drafting automatically" notice state (its Start
   * handler clears it), so the setter is injected rather than owned here. */
  readonly setAutoDrafted: (value: boolean) => void;
}

export function useWalkthroughAutoDraft({
  autoDraftOn,
  capturing,
  extracting,
  batchInFlightRef,
  pendingFrames,
  hasMaterial,
  readyToDraftCount,
  savedFormatsState,
  generate,
  setAutoDrafted,
}: WalkthroughAutoDraftInput) {
  const prevCapturingRef = useRef(false);
  const autoDraftPendingRef = useRef(false);
  useEffect(() => {
    if (prevCapturingRef.current && !capturing) autoDraftPendingRef.current = true;
    if (capturing) autoDraftPendingRef.current = false;
    prevCapturingRef.current = capturing;
  }, [capturing]);
  useEffect(() => {
    // Toggled off: a stop that happened while off must not fire later if the
    // toggle is switched back on, so the arm is cleared here.
    if (!autoDraftOn) autoDraftPendingRef.current = false;
    const fire = shouldAutoDraft({
      autoDraftOn: autoDraftOn,
      capturing,
      extracting: extracting || batchInFlightRef.current,
      pendingFrames,
      hasMaterial,
      hasEmptySlot: readyToDraftCount > 0,
      savedFormatsState,
      alreadyDraftedThisStop: !autoDraftPendingRef.current,
    });
    if (!fire) return;
    autoDraftPendingRef.current = false;
    void (async () => {
      await Promise.resolve();
      setAutoDrafted(true);
      await generate();
    })();
  }, [capturing, extracting, pendingFrames, hasMaterial, readyToDraftCount, savedFormatsState, generate, setAutoDrafted, autoDraftOn, batchInFlightRef]);
}
