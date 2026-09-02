// Pure predicates the module-deck-capture panel renders from - gates,
// refusals and cost estimates, each testable in isolation in a repo where no
// component is ever rendered (vitest here is node-env; see the project's own
// note on that). This file owns none of the state itself - callers (the
// panel, its hooks) hold the actual capture/extraction/generation state and
// pass snapshots of it in on every render or tick.
//
// See docs/module-walkthrough-deck-acceptance-criteria.md, especially AC5,
// AC6, AC10, and section 7 (DE1, DE2, DE3, DE5, DE7, AM-G, AM-K) - section 7
// is MEASURED and overrides sections 5 and 6 wherever they disagree.
//
// This module intentionally does not import anything from a sibling module
// in this new directory (the prompt/action, the reduction leaf, the run log,
// the route) - those belong to other groups building concurrently. It DOES
// import `resolveDeckTemplateSelection` from the existing, already-shipped
// `lib/lms-generation/deck.ts`, specifically so the "no template picked"
// refusal can never drift from the Route Handler's own copy of that rule.
//
// Constraints honoured throughout: no React, no DOM, no `window`, no clock
// reads - every time-based function takes elapsed/observed values as data.

import { resolveDeckTemplateSelection } from "@/lib/lms-generation/deck";

// ---------------------------------------------------------------------------
// 1. AM-G: a monotone dropped-frames accumulator across Start/Stop cycles.
// ---------------------------------------------------------------------------

/**
 * `useDiscussionCapture.start()` zeroes its own `droppedFrames` counter on
 * every capture start (recording/useDiscussionCapture.ts:404-405: `
 * droppedFramesRef.current = 0; setDroppedFrames(droppedFramesRef.current);`).
 * That means a session made of two or more Start/Stop cycles cannot read a
 * monotone session total straight off the hook's live value - each new cycle
 * silently starts counting from zero again.
 *
 * The SHIPPED grading panel gets this wrong today:
 * `grading-recording/GradingRecordingPanel.tsx:464` builds its downloadable
 * run log from the hook's live `droppedFrames` value at download time, so a
 * grading-recording session with two Start/Stop cycles under-reports every
 * frame the FIRST cycle dropped - the log only ever reflects whichever cycle
 * is most recent. That defect is real, pre-existing, and out of scope for
 * this feature (AM-G explicitly defers fixing it to a follow-up); it is
 * recorded here as the reason this module owns its own accumulator rather
 * than reusing the grading panel's pattern.
 *
 * Call once per observation of the hook's live counter, threading the result
 * back in as `runningTotal` on the next call:
 *
 *   sessionTotal = accumulateDroppedFrames(prevLive, nextLive, sessionTotal)
 *
 * A DECREASE (`nextLive < prevLive`) is the only signal that a new capture
 * session started (the hook reset its own counter to 0 in `start()`); the
 * new session's live count is added on top of the running total as-is.
 * Anything else - including no change at all - is a delta on the CURRENT
 * session and is added on top of the running total, never used to replace it.
 */
export function accumulateDroppedFrames(prevLive: number, nextLive: number, runningTotal: number): number {
  return nextLive < prevLive ? runningTotal + nextLive : runningTotal + (nextLive - prevLive);
}

// ---------------------------------------------------------------------------
// 2. AC10: the distinct, fix-naming refusals that gate a deck generation call.
// ---------------------------------------------------------------------------

export interface CanGenerateDeckInput {
  blockCount: number;
  legibleBlockCount: number;
  templateId: string;
  courseId: string;
  capturing: boolean;
  extracting: boolean;
  busy: boolean;
}

export type CanGenerateDeckResult = { ok: true } | { ok: false; reason: string };

/**
 * Whether the panel may call the deck-from-capture route right now, and if
 * not, the ONE reason why - each refusal distinct and naming its own fix, per
 * AC10 and AC8 (this repo's most-caught defect class is distinct failures
 * collapsing into one indistinguishable message).
 *
 * Checked in order, first match wins:
 *   1. `busy` - a deck is already being generated for this capture; a second
 *      click must not fire a second Route Handler call while the first is in
 *      flight (AC10's "generating" state).
 *   2. `capturing || extracting` - frames are still arriving or still being
 *      read; generating now would either race the extraction queue or build
 *      from a partial result.
 *   3. no `courseId` - nothing to save the generated artifact against.
 *   4. no `templateId` - delegates to `resolveDeckTemplateSelection` (the
 *      exact function the Route Handler itself calls) so this refusal can
 *      never drift from the server-side rule it mirrors client-side.
 *   5. `blockCount === 0` - the capture produced no extracted material at
 *      all; nothing exists to ground a deck on.
 *   6. `blockCount > 0 && legibleBlockCount === 0` - material was extracted
 *      but none of it cleared the legibility bar; generating anyway would
 *      mean the model inventing slide content rather than reading it, which
 *      is precisely what decision 1 in the AC forbids.
 *
 * In both of the last two cases the panel must NOT call the route, but must
 * keep the run-log download and the legibility probe reachable, and must not
 * show a spinner - this function's `ok: false` result is what makes that
 * testable without rendering the panel.
 */
export function canGenerateDeck(state: CanGenerateDeckInput): CanGenerateDeckResult {
  if (state.busy) {
    return {
      ok: false,
      reason: "A deck is already being generated for this capture. Wait for it to finish before starting another.",
    };
  }
  if (state.capturing || state.extracting) {
    return {
      ok: false,
      reason: "Stop the capture and let the last frames finish being read first.",
    };
  }
  if (!state.courseId || !state.courseId.trim()) {
    return {
      ok: false,
      reason: "Pick a course - the deck is saved to that course's generated content.",
    };
  }
  const templateResolution = resolveDeckTemplateSelection(state.templateId);
  if (!templateResolution.ok) {
    return { ok: false, reason: templateResolution.reason };
  }
  if (state.blockCount === 0) {
    return {
      ok: false,
      reason:
        "This capture read nothing off the screen. No deck was generated. Download the run log to see what each batch reported, or run the legibility probe and try again.",
    };
  }
  if (state.blockCount > 0 && state.legibleBlockCount === 0) {
    return {
      ok: false,
      reason:
        "Everything captured was too small or blurred to read. A deck built from this would be invented, not read - so none was generated. Increase your display's text size or share a single window rather than a whole 4K screen, then capture again.",
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 3. AC5 / AM-K: an honest, live frames-and-calls cost estimate.
// ---------------------------------------------------------------------------

/**
 * DE1: `startFrameTicker` (lib/frame-ticker.ts:11-12) is a plain 500ms
 * `setInterval`/worker tick, so a keep can only happen ON a tick. After a
 * keep at T, the ticks at T+500 and T+1000 both fail the
 * `FRAME_MIN_KEEP_INTERVAL_MS` gate and T+1500 is the first that passes -
 * the real keep interval is 1500ms, not the 1200ms constant's own value.
 * Ceiling: 40 kept frames/minute, 801 frames for a 20-minute capture (section
 * 5's ~1000-frame figure was 25% too high).
 */
export const MEASURED_KEEP_INTERVAL_MS = 1500;
export const MAX_KEPT_FRAMES_PER_MINUTE = 40;
export const MAX_KEPT_FRAMES_20MIN = 801;
export const TWENTY_MINUTES_MS = 20 * 60 * 1000;

export interface RunCostEstimate {
  framesKept: number;
  callsSoFar: number;
  /**
   * Calls projected for a 20-minute capture, extrapolated from the OBSERVED
   * calls-per-elapsed-ms rate so far - never from a fixed batch-size
   * constant. DE3 measured that assuming a full batch of 6 frames per call
   * overstates savings by 6x: in the pause-on-each-page behaviour the queue
   * never accumulates, so `packFrameBatch` averages 1.0 frame per call (101
   * frames cost 101 calls, not ~17). Deriving this from the batch constant
   * instead of the observed rate is exactly that mistake; this field must
   * never do it.
   */
  projectedCallsFor20Min: number;
  /** AC5/AM-K's required live line: frames and calls only, never tokens or a currency amount. */
  message: string;
}

/**
 * The live "N frames kept, M model calls so far. At this rate a 20-minute
 * capture costs about K calls." line AC5 requires be shown DURING capture,
 * not discovered after. K is extrapolated purely from `callsSoFar /
 * elapsedMs`, observed live - not from `GRADING_EXTRACT_BATCH_SIZE` or any
 * other fixed constant, per DE3's correction (see `projectedCallsFor20Min`
 * doc comment above). Section 5's token/dollar cost is UNMEASURED per AM-K;
 * this function must never compute or display one.
 *
 * No clock read here: `elapsedMs` is supplied by the caller, which is the
 * only thing that makes this deterministically testable.
 */
export function estimateRunCost(elapsedMs: number, framesKept: number, callsSoFar: number): RunCostEstimate {
  const safeElapsedMs = Math.max(elapsedMs, 0);
  const safeFrames = Math.max(framesKept, 0);
  const safeCalls = Math.max(callsSoFar, 0);

  const projectedCallsFor20Min =
    safeElapsedMs > 0 && safeCalls > 0 ? Math.round((safeCalls / safeElapsedMs) * TWENTY_MINUTES_MS) : 0;

  const message =
    `${safeFrames} frame${safeFrames === 1 ? "" : "s"} kept, ${safeCalls} model call${safeCalls === 1 ? "" : "s"} so far. ` +
    `At this rate a 20-minute capture costs about ${projectedCallsFor20Min} call${projectedCallsFor20Min === 1 ? "" : "s"}.`;

  return { framesKept: safeFrames, callsSoFar: safeCalls, projectedCallsFor20Min, message };
}

// ---------------------------------------------------------------------------
// 4. DE7: the third loss channel - content scrolled past between kept frames.
// ---------------------------------------------------------------------------

/**
 * DE7: content that scrolls past BETWEEN kept frames is never photographed by
 * anything - it does not arrive late, is not dropped, and leaves no trace in
 * `droppedFrames`. This is a DIFFERENT loss channel from AC6's backpressure
 * (frames the capture queue explicitly discarded) and must never be reported
 * as backpressure - conflating the two makes the run log lie about which
 * failure mode actually occurred.
 *
 * Maximum safe scroll speed = content viewport height / 1.5s (the measured
 * keep interval, `MEASURED_KEEP_INTERVAL_MS` above) - at 683px/s (1080p),
 * 763px/s (1200p), 1403px/s (2160p) the WHOLE viewport's height must scroll
 * past between two consecutive keeps for anything to go unphotographed, so
 * scrolling any faster than this guarantees a gap. AC8d records a normal skim
 * at 500-800 px/s, so an ordinary skim sits at the edge of the 1080p limit and
 * the top of that range silently loses ~15% of the module.
 */
export const SCROLL_SAFETY_WINDOW_MS = MEASURED_KEEP_INTERVAL_MS;

export interface ScrollSafetyStatus {
  /** The fastest scroll speed, in px/s, that still guarantees no gap for this viewport height. */
  maxSafeScrollSpeedPxPerSec: number;
  /** Echoed back for the caller's convenience; null when the panel has no observed rate yet. */
  observedScrollSpeedPxPerSec: number | null;
  /** True only when an observed rate was supplied AND it exceeds the safe limit. */
  overLimit: boolean;
  /** Always populated: states the speed limit, and additionally warns when the observed rate exceeds it. */
  message: string;
}

/**
 * Returns the safe scroll-speed ceiling for the given content viewport
 * height, and - when the panel has measured an actual scroll rate - whether
 * that rate is currently outrunning the ceiling. Pure and clock-free: the
 * caller supplies both the viewport height and any observed rate as data.
 *
 * Behaves in two modes:
 *   - No `observedScrollSpeedPxPerSec` (or a non-positive one): the panel has
 *     nothing to compare against yet, so the message simply states the
 *     viewport's safe limit, so it can be shown before or during a capture.
 *   - A positive `observedScrollSpeedPxPerSec`: the message additionally
 *     warns, in wording distinct from AC6's backpressure/dropped-frames
 *     language, when the observed rate exceeds the limit.
 */
export function describeScrollSafety(
  contentViewportHeightPx: number,
  observedScrollSpeedPxPerSec?: number | null
): ScrollSafetyStatus {
  const safeHeight = Math.max(contentViewportHeightPx, 0);
  const limit = Math.round(safeHeight / (SCROLL_SAFETY_WINDOW_MS / 1000));
  const observed =
    observedScrollSpeedPxPerSec != null && observedScrollSpeedPxPerSec > 0 ? observedScrollSpeedPxPerSec : null;
  const overLimit = observed !== null && observed > limit;

  const message = overLimit
    ? `Scrolling at about ${Math.round(observed as number)} px/s outpaces this viewport's ${limit} px/s safe scroll speed. ` +
      `Content that passed between kept frames was never photographed - it was not dropped, and it will not appear in the ` +
      `dropped-frames count. Scroll slower, or share a single window instead of a whole screen, to cover the whole module.`
    : `Scroll no faster than about ${limit} px/s on this viewport. Anything that crosses the screen faster than that ` +
      `between two kept frames is skipped entirely - a separate loss from dropped frames, and one the run log cannot see.`;

  return { maxSafeScrollSpeedPxPerSec: limit, observedScrollSpeedPxPerSec: observed, overLimit, message };
}
