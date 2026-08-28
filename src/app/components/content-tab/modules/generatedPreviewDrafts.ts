// Pure reseed/dirty logic for GeneratedPreviewModal's local drafts of a
// generated artifact's two editable fields - body text, and now (docs/
// announcement-preview-edit-before-post-acceptance-criteria.md, AC B6-B8a)
// the subject/title. Extracted for the same reason confirmArming.ts (this
// directory) was extracted: vitest here is node-env and renders no
// component, so a predicate left inside the .tsx can only ever be pinned by
// a source-text grep - too weak for a bug this specific (AC F21).
//
// THE BUG THIS FILE EXISTS TO PREVENT (REGRESSION entry 312 check 7, reached
// through a door that entry did not have): AC B7 permits saving with ONLY
// the subject changed, which produces two versions with IDENTICAL text and
// DIFFERENT titles. If the reseed trigger compared body text alone,
// switching between those two versions would not reseed, and the subject
// field would keep showing the OTHER version's title - a stale draft,
// silently, exactly the failure entry 312 check 7 was written to close, now
// reachable through the version picker instead of only through Save.
//
// So both fields are tested TOGETHER, in the SAME predicate (AC 8a): the
// caller must reset both drafts (plus any pending-action state, e.g. a armed
// discard panel) from ONE `if` block gated on this predicate - never two
// independent `if`s, which would leave a frame where the subject and the
// body came from different versions. That failure mode is AC 6's ("one
// save, one version") failure reached through the picker instead of Save.

/** One field pair - the shape both the seeded baseline and the live draft
 * share, so the two predicates below can compare like-for-like without the
 * caller re-deriving field names at each call site. */
export interface DraftFieldPair {
  text: string;
  title: string;
}

/**
 * True the moment EITHER field of `current` has drifted from `seeded` -
 * the render-time reseed trigger (AC 8a). An unconditional OR across both
 * fields, never gated on whether the subject field happens to be offered:
 * the reseed exists to keep the DRAFT synced with whichever version is
 * selected, and a kind that does not offer subject editing still has a
 * `title` that can legitimately differ between versions (e.g. a
 * module-derived label regenerated under a different module choice) -
 * reseeding on that change is harmless (nothing renders an editable field
 * for it to clobber) and simpler than threading an `offersTitle` flag
 * through a function whose only job is "did the baseline move".
 */
export function draftsNeedReseed(current: DraftFieldPair, seeded: DraftFieldPair): boolean {
  return current.text !== seeded.text || current.title !== seeded.title;
}

/**
 * True when the instructor has changed something in `draft` that has not
 * been saved yet, compared against the currently SAVED pair (`current`).
 * `title` is consulted only when `offersTitle` is true - matching exactly
 * which field the modal actually renders as editable. A kind that does not
 * offer the subject field never shows an editable title control, so its
 * `draft.title` is never diverged from `current.title` by the instructor;
 * comparing it unconditionally would cost nothing today, but would silently
 * start mattering the moment two versions' titles differ for a reason that
 * has nothing to do with an edit (see `draftsNeedReseed`'s own doc comment)
 * - `dirty` must mean "there is something to save", not "something differs".
 */
export function draftsDirty(draft: DraftFieldPair, current: DraftFieldPair, offersTitle: boolean): boolean {
  return draft.text !== current.text || (offersTitle && draft.title !== current.title);
}
