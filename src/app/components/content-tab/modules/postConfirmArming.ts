// The two-step "Post to Canvas" confirm for a kind whose post goes live to
// students immediately (kindPostsImmediately, @/lib/lms-generation/kinds) -
// AC 9-14 of docs/announcement-preview-edit-before-post-acceptance-
// criteria.md. Only "announcements" declares this today; every other
// "save-and-post" kind creates an unpublished object and keeps its existing
// single-click post.
//
// Reuses confirmArming.ts's MODEL (this directory) - arm against a signature
// of what would be posted, rather than a boolean flag reset by a
// `useEffect`. That file's whole argument applies here unchanged: an effect
// that clears a stale arm is easy to forget to add, or to leave stale, the
// moment a new way to change what would be posted shows up; this repo's
// eslint also rejects setState reached synchronously from an effect, so the
// boolean-plus-effect shape is not merely worse, it is unavailable.
//
// `isConfirmArmed` is reused from confirmArming.ts VERBATIM (re-exported
// below, not reimplemented) - that half fits this use unchanged. Its
// `selectionSignature` is deliberately NOT reused: that function SORTS its
// inputs and joins them with a single space, which is correct for an
// order-independent SET of opaque ids and wrong here. Sorting would scramble
// which value belongs to which field (kindId, artifactId, moduleChoice and
// newModuleName are not interchangeable), and a space-joined field
// containing a space (a typed "New module name") could collide across a
// field boundary with a neighbouring field - the exact failure an arm
// signature exists to prevent, reached through the signature itself instead
// of around it.
//
// THE SIGNATURE DELIBERATELY EXCLUDES THE SUBJECT AND BODY TEXT (AC 12a-sig).
// `generated_artifacts` is append-only for content (see the AC doc's own
// "Data-path facts" section): a given `artifactId` names an immutable
// (title, text) pair forever, so signing the text too would be redundant -
// and the redundancy is not harmless, because it invites a reader to think
// the arm TRACKS THE DRAFT on screen, which is exactly the confusion AC 11
// exists to prevent (the confirm panel reads the SAVED version via
// `selectedArtifact`, never the live draft). What actually covers an unsaved
// text edit is not the signature but `mayPostCommit` below: committing is
// refused outright while the editor is dirty (AC 12b), independent of
// whether the arm signature itself is still valid.

import { isConfirmArmed } from "./confirmArming";

export { isConfirmArmed };

export interface PostArmFields {
  kindId: string;
  /** AC 12c: keyed on the artifact's `id`, not only its `version` number -
   * `version` is scoped to (course, kind) and `selectVersion` carries only
   * the number, whereas a successful `saveEdit` replaces `preview` wholesale
   * (useLmsGeneration.ts), so keying on `id` stays collision-proof across
   * that replacement. */
  artifactId: string;
  /** Included even for a kind with no module target (announcements, whose
   * caller always passes ""), so a FUTURE kind that both needs a module
   * target and posts immediately does not inherit a stale-arm bug from a
   * signature nobody taught to look at these two fields. */
  moduleChoice: string;
  newModuleName: string;
}

/**
 * An ordered, delimiter-safe signature of what a post would target - never
 * its content (see this file's header comment on why text is excluded).
 * `JSON.stringify` of an ORDERED array is sufficient and obviously
 * injective: it escapes every character (`"`, `,`, `[`, `]`) a plain
 * delimiter-join would let a field's own content collide on, and it never
 * reorders its input the way `selectionSignature` deliberately does for its
 * own, different, order-independent use case.
 */
export function postArmSignature(fields: PostArmFields): string {
  return JSON.stringify([fields.kindId, fields.artifactId, fields.moduleChoice, fields.newModuleName]);
}

/**
 * Whether a click that WOULD commit the post (i.e. the button is showing
 * "Confirm post" and this is the second, arming-consuming click) may
 * actually go through - combines the three independent reasons a post can
 * be blocked so the caller has one call to make instead of three separate
 * checks it could get out of sync:
 *  - `postUnavailableReason` (AC3/AC4, pre-existing): an export selection
 *    has no live Canvas connection to write to at all.
 *  - `dirty` (AC 12b): the confirm panel shows the SAVED version, never the
 *    draft (AC 11) - committing while an edit sits unsaved on screen would
 *    silently send stale text, so it is refused outright rather than posting
 *    behind the instructor's back. This must hold after a FAILED save too,
 *    where the draft legitimately survives.
 *  - `armed`: the caller's own `isConfirmArmed` result. A click that is not
 *    yet armed should ARM rather than commit; only a click that already
 *    satisfies all three may result in an actual Canvas write. Folding this
 *    in here - rather than leaving the caller to `&&` it in separately -
 *    is what makes "does this click write anything" a single, testable
 *    question instead of three facts a reader has to recombine correctly by
 *    hand at every call site.
 */
export function mayPostCommit(postUnavailableReason: string | null | undefined, dirty: boolean, armed: boolean): boolean {
  return !postUnavailableReason && !dirty && armed;
}
