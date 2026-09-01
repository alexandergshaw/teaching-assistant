// Pure helpers for DiscussionResourceSettings.tsx, kept in a plain .ts file
// specifically so they have a test surface at all - vitest in this repo is
// node-env and collects only src/**/*.test.ts, never .test.tsx (mirrors
// discussion-reply-controls.ts's own header, the identical pattern for the
// sibling composition controls).

import { RESOURCE_KIND_LABELS, type ResourceKind } from "@/lib/resource-kind";

/**
 * The "Eligible resource kinds" control's renderValue, required for the
 * same reason `ingredientsRenderValue` (discussion-reply-controls.ts) is:
 * MUI's default multi-select renderValue prints raw selected values
 * (enum ids, never labels), and zero selected renders visually identically
 * to a control that failed to load. Zero selected is a real, legal state
 * here (it means "search no resource kinds at all" - see
 * discussion-persisted-controls.ts's own coerceResourceKinds) and must read
 * as a real phrase, never a blank box.
 */
export function resourceKindsRenderValue(selected: readonly ResourceKind[]): string {
  if (selected.length === 0) return "None - resources turned off";
  return selected.map((k) => RESOURCE_KIND_LABELS[k]).join(", ");
}

/**
 * Parses a video-length minutes text field's raw input into either a
 * positive whole-minute count or `undefined` ("no preference set"). Blank,
 * zero, negative, fractional-rounds-down-but-still-positive, and
 * unparseable text all funnel through here rather than each call site
 * reimplementing its own parse - mirrors
 * discussion-persisted-controls.ts's `coerceVideoLengthMinutes`, which
 * covers the READ side of the same value; this is the INPUT side (a change
 * event's raw string), kept separate because a text field's live typing
 * state (e.g. a trailing "-" while typing "-5") should not be forced through
 * the same code path as a cold localStorage read.
 */
export function parseVideoLengthMinutesInput(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
}

/**
 * FIX 3 (review pass): true exactly when both bounds are set AND inverted
 * ("between 20 and 5 minutes"). Equal bounds (min === max, "exactly N
 * minutes") are NOT inverted - only min strictly greater than max is a
 * mistake worth flagging. Either bound absent is never inverted - a
 * single-bound preference ("at least 10 minutes") has no ordering to
 * violate.
 *
 * DECISION (documented here since it drives what DiscussionResourceSettings.tsx
 * does with the result): the control SHOWS this as a message rather than
 * silently swapping the two numbers or rejecting the keystroke outright.
 * Silently swapping was considered and rejected - it would quietly turn
 * "min 20, max 5" into "min 5, max 20" with no visible sign anything
 * happened, which hides the instructor's mistake from them instead of
 * surfacing it; the whole point of catching this is that they typed
 * something in the wrong field or transposed two numbers, and silently
 * fixing it for them means they never learn that. Rejecting the keystroke
 * (clamping or refusing to commit the second number) was also rejected -
 * the two fields are edited independently and typing the max BEFORE
 * lowering an already-large min is a completely ordinary sequence while
 * mid-edit, so blocking on every intermediate inverted state would fight the
 * instructor over a value they have not finished entering yet. A visible,
 * non-blocking message satisfies both: it never guesses on the instructor's
 * behalf, and it never stops them from typing. The value stays exactly what
 * they typed, in both fields; `videoLengthPreferenceSentence` (this
 * feature's own sentence builder) independently drops an inverted pair
 * before anything reaches the model, so a saved-but-still-inverted pair
 * cannot leak into a request while the instructor has not yet corrected it.
 */
export function videoLengthRangeIsInverted(min: number | undefined, max: number | undefined): boolean {
  return min !== undefined && max !== undefined && min > max;
}
