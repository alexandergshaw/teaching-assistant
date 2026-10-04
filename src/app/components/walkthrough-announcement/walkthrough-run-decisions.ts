// Pure run-level decisions for "Announcement from a walkthrough" (SMOOTH-
// WALKTHROUGH W1). No React, no DOM, no server action - the panel and the
// setup hook CALL these; each is a plain function so a node-env test can pin
// it directly (no component renders under vitest here).

import type { DraftSlot, SavedFormatsState } from "./announcement-draft-slots";

export interface AutoDraftState {
  readonly autoDraftOn: boolean;
  readonly capturing: boolean;
  readonly extracting: boolean;
  readonly pendingFrames: number;
  readonly hasMaterial: boolean;
  readonly hasEmptySlot: boolean;
  /** The saved-formats state itself, not a bool: only "loading" blocks, the
   * same gate Generate uses (a timed-out or failed list still drafts). */
  readonly savedFormatsState: SavedFormatsState;
  readonly alreadyDraftedThisStop: boolean;
}

/**
 * Whether the panel may start an automatic draft right now. A monotone AND of
 * eight conditions: every one is necessary. `hasEmptySlot` is the first of two
 * cannot-overwrite layers (the reducer's `generate-started` guard is the
 * second): this never returns true when no slot is empty.
 */
export function shouldAutoDraft(s: AutoDraftState): boolean {
  return (
    s.autoDraftOn &&
    !s.capturing &&
    !s.extracting &&
    s.pendingFrames === 0 &&
    s.hasMaterial &&
    s.hasEmptySlot &&
    s.savedFormatsState !== "loading" &&
    !s.alreadyDraftedThisStop
  );
}

/** A run is complete when there is at least one slot and every slot has been
 * posted. The length guard makes the vacuous-true empty list unrepresentable
 * (production never passes []). */
export function isRunComplete(slots: readonly Pick<DraftSlot, "postedTo">[]): boolean {
  return slots.length > 0 && slots.every((s) => s.postedTo !== null);
}

/**
 * The course id to select once the course list has loaded, or null for "change
 * nothing". Never changes a persisted choice: a stored id that is still in the
 * list is returned unchanged, a stale stored id yields null (it is NOT re-homed
 * to the sole course - that would silently change where a publish goes), and
 * only a never-written value (null or "") with exactly one course auto-selects.
 */
export function courseToAutoSelect(courses: readonly { readonly id: string }[], storedId: string | null): string | null {
  if (storedId) return courses.some((c) => c.id === storedId) ? storedId : null;
  return courses.length === 1 ? courses[0].id : null;
}
