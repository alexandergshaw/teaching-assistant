// Auto-scroll position for the teleprompter, as a pure function of elapsed
// time (docs/teleprompter-mode-acceptance-criteria.md, chunk 3f).
//
// NOTHING IN THIS REPO SCROLLS TEXT ON A TIMER TODAY - the existing
// teleprompter (StagePanel.tsx) is a fixed-height overflow box the instructor
// scrolls with the wheel. So this is new logic, and it is deliberately pure:
// vitest here is node-env with no jsdom, so a scroll implementation living
// inside the component could not be tested at all. The component's job is
// reduced to reading a number from here and assigning it to `scrollTop`.
//
// THE MODEL: the script was WRITTEN to a words-per-minute target
// (LECTURE_SCRIPT_WORDS_PER_MINUTE - see lecture-script-bounds.ts, and
// speech-feedback.ts which measures against the same constant). So the
// fraction of the script that "should" have been delivered by time T is just
// the fraction of its words that a speaker at that pace would have reached.
// Mapping that fraction onto the scrollable distance keeps the paper moving
// at the pace the words were sized for, and means the pace meter and the
// scroll speed can never disagree about what "on pace" means.
//
// WHY NOT A PIXELS-PER-SECOND SPEED SETTING: that is the usual teleprompter
// control, and it forces the instructor to hand-tune a number that has no
// relationship to their script. Deriving from the word count means a 5-minute
// script and a 30-minute script both finish scrolling at their own end, with
// no tuning at all. A speed MULTIPLIER is still offered on top (some people
// read faster than the target), which is one intelligible knob instead of an
// arbitrary one.

import { LECTURE_SCRIPT_WORDS_PER_MINUTE } from "@/lib/lecture-script-bounds";

/** Multipliers the speed control offers, as a factor on the target pace.
 * 1 means "exactly the pace the script was written for". */
export const SCROLL_SPEED_MULTIPLIERS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5];

export const DEFAULT_SCROLL_SPEED_MULTIPLIER = 1;

/** Clamp an arbitrary stored/incoming multiplier to one this control offers,
 * mirroring resolveScriptMinutes' membership-not-range rule
 * (src/lib/lms-generation/script-length.ts) - a value the UI never offered
 * would leave the select rendering with nothing selected. */
export function resolveScrollSpeed(raw: unknown): number {
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SCROLL_SPEED_MULTIPLIER;
  return SCROLL_SPEED_MULTIPLIERS.includes(value) ? value : DEFAULT_SCROLL_SPEED_MULTIPLIER;
}

export interface ScrollPositionInput {
  /** Milliseconds since the instructor started reading. */
  elapsedMs: number;
  /** Words in the whole script - the caller counts them once, not per frame. */
  totalWords: number;
  /** `scrollHeight - clientHeight` of the scrolling element: the total
   * distance there is to travel. Zero when the script fits without
   * scrolling. */
  scrollableDistance: number;
  /** Factor on the target pace - see SCROLL_SPEED_MULTIPLIERS. */
  speedMultiplier?: number;
}

/**
 * How far through the script a speaker at the target pace would be, as a
 * fraction in [0, 1]. Exposed separately from the pixel position because a
 * progress indicator wants the fraction, not a scroll offset.
 *
 * Guards every degenerate input rather than trusting the caller: a
 * zero/negative word count (an empty script), a negative elapsed time (a
 * clock adjustment), and a non-finite multiplier all resolve to a sane
 * fraction instead of NaN, because the return value is assigned straight to a
 * DOM property where NaN would silently do nothing at best.
 */
export function scriptProgressFraction(input: ScrollPositionInput): number {
  const { elapsedMs, totalWords } = input;
  const multiplier = resolveScrollSpeed(input.speedMultiplier ?? DEFAULT_SCROLL_SPEED_MULTIPLIER);

  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  if (!Number.isFinite(totalWords) || totalWords <= 0) return 0;

  const wordsPerMs = (LECTURE_SCRIPT_WORDS_PER_MINUTE * multiplier) / 60_000;
  const wordsDelivered = elapsedMs * wordsPerMs;
  const fraction = wordsDelivered / totalWords;

  if (!Number.isFinite(fraction)) return 0;
  return Math.min(1, Math.max(0, fraction));
}

/**
 * The `scrollTop` the teleprompter should be at. Always an integer - a
 * fractional scrollTop is rounded by the browser anyway, and rounding here
 * keeps the value stable frame to frame instead of jittering.
 */
export function autoScrollTop(input: ScrollPositionInput): number {
  const { scrollableDistance } = input;
  if (!Number.isFinite(scrollableDistance) || scrollableDistance <= 0) return 0;
  return Math.round(scriptProgressFraction(input) * scrollableDistance);
}

/**
 * How long a script takes to deliver at the chosen pace, in milliseconds -
 * what the panel shows as "expected" next to the elapsed timer, so the
 * instructor can see they are running long BEFORE they reach the end.
 */
export function expectedDurationMs(totalWords: number, speedMultiplier?: number): number {
  const multiplier = resolveScrollSpeed(speedMultiplier ?? DEFAULT_SCROLL_SPEED_MULTIPLIER);
  if (!Number.isFinite(totalWords) || totalWords <= 0) return 0;
  return Math.round((totalWords / (LECTURE_SCRIPT_WORDS_PER_MINUTE * multiplier)) * 60_000);
}

/**
 * Whether the instructor has taken manual control by scrolling themselves.
 *
 * WHY THIS EXISTS: auto-scroll fighting a human is the single most irritating
 * teleprompter failure - they scroll back to re-read a line, and the next
 * frame yanks them forward again. The panel compares where auto-scroll last
 * put the element against where it actually is now; a difference beyond a
 * small tolerance means a human moved it, and auto-scroll should yield until
 * they explicitly resume.
 *
 * The tolerance exists because browsers round and because smooth-scrolling
 * can leave the element a pixel or two off what was assigned - without it,
 * auto-scroll would immediately detect its OWN write as human input and
 * disable itself.
 */
export const MANUAL_SCROLL_TOLERANCE_PX = 4;

export function isManualScroll(actualTop: number, lastAutoTop: number): boolean {
  if (!Number.isFinite(actualTop) || !Number.isFinite(lastAutoTop)) return false;
  return Math.abs(actualTop - lastAutoTop) > MANUAL_SCROLL_TOLERANCE_PX;
}
