// Drafted Grades - B2 (ux-audit-grading.md): "Post" used to arm on a bare
// `draft.id`, which stayed armed forever - changing the search box, the
// course filter, or the sort order (any of which can change what a
// "Confirm post" click would actually send, and whether the rows it covers
// are even the ones on screen) never disarmed it, and the confirm label
// named no count, no course, and no undo warning. This module is the pure
// decision behind the fix: an armed state is a SIGNATURE of what would be
// posted and what is currently on screen, not a boolean a caller has to
// remember to reset.
//
// `isConfirmArmed` is reused VERBATIM from
// content-tab/modules/confirmArming.ts (re-exported below, not
// reimplemented) - that half fits this use unchanged: true only when the
// current signature matches the one the arm was set for.
//
// The SIGNATURE itself deliberately follows
// content-tab/modules/postConfirmArming.ts's ORDERED-array precedent
// (`JSON.stringify` of an ordered tuple), NOT confirmArming.ts's own
// `selectionSignature`. `selectionSignature` SORTS its inputs and joins them
// with a space - correct for an order-independent SET of opaque ids, and
// wrong here for the exact reason postConfirmArming.ts's own header comment
// already documents: these fields are not interchangeable (a typed search
// string could collide with a sort-order value after sorting, and a
// space-joined field containing a space could bleed across a field
// boundary), so this needs an ordered, delimiter-safe signature instead.
import { isConfirmArmed } from "../content-tab/modules/confirmArming";

export { isConfirmArmed };

export interface DraftPostArmFields {
  draftId: string;
  /** The draft's own grade count at arm time - included so retyping a score
   * (which does not change this count) does not itself disarm, but the
   * count is still part of the signature so a hand-edit that legitimately
   * changes the payload some other way is never silently trusted. */
  gradeCount: number;
  sort: string;
  search: string;
  courseFilter: string;
}

/**
 * An ordered, delimiter-safe signature of "what is on screen and what would
 * post" at arm time. Any change to any field - including the search box,
 * the course filter, or the sort order, none of which the pre-fix `confirmPost
 * !== draft.id` check ever looked at - produces a different signature and so
 * disarms by construction, with nothing for a caller to remember to reset.
 */
export function draftPostArmSignature(fields: DraftPostArmFields): string {
  return JSON.stringify([fields.draftId, fields.gradeCount, fields.sort, fields.search, fields.courseFilter]);
}
