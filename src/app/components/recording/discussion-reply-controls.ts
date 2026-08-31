// Pure helpers for DiscussionReplyControls.tsx, kept in a plain .ts file
// specifically so they have a test surface at all - vitest in this repo is
// node-env and collects only src/**/*.test.ts, never .test.tsx, so nothing
// declared inline inside the component itself is ever exercised by a test.
// docs/reply-composition-controls-acceptance-criteria.md C2c-i (the
// "Each reply should include" renderValue) and C4c (the formality
// index<->stop mapping and its aria value text).

import {
  REPLY_FORMALITY_LABELS,
  REPLY_FORMALITY_STOPS,
  REPLY_INGREDIENT_LABELS,
  type ReplyFormality,
  type ReplyIngredient,
} from "@/lib/discussion-reply-prompt";

/**
 * C2c-i: the "Each reply should include" control's renderValue, required in
 * BOTH directions - MUI's default Select renderValue prints the raw
 * selected values joined by a comma once more than one item is picked (an
 * enum id, never a label), and a multi-select with ZERO items selected
 * renders visually identically to one that failed to load. Zero selected is
 * a legal, meaningful state (C2c: "a plain, well-judged reply") and must
 * read as a real phrase, never a blank box.
 */
export function ingredientsRenderValue(selected: readonly ReplyIngredient[]): string {
  if (selected.length === 0) return "Nothing in particular";
  return selected.map((id) => REPLY_INGREDIENT_LABELS[id]).join(", ");
}

/**
 * C4: the Slider's own value is the numeric index (0..2) into
 * REPLY_FORMALITY_STOPS; the persisted/prompt-facing value is the named
 * stop. Both directions are pure and exported so neither has to be
 * reconstructed inline in the component. An index or stop this repo never
 * produced (a corrupted localStorage read that reached here anyway) falls
 * back to "balanced" - the same default DEFAULT_REPLY_COMPOSITION already
 * uses - rather than throwing or producing `undefined`.
 */
export function formalityIndexFromStop(stop: ReplyFormality): number {
  const index = REPLY_FORMALITY_STOPS.indexOf(stop);
  return index === -1 ? REPLY_FORMALITY_STOPS.indexOf("balanced") : index;
}

export function formalityStopFromIndex(index: number): ReplyFormality {
  return REPLY_FORMALITY_STOPS[index] ?? "balanced";
}

/**
 * C4c: `getAriaValueText` is required on the Slider - without it a screen
 * reader announces "1 of 0 to 2", which conveys nothing about what the
 * value actually means. This speaks the stop's own visible name instead.
 */
export function formalityAriaValueText(index: number): string {
  return REPLY_FORMALITY_LABELS[formalityStopFromIndex(index)];
}
