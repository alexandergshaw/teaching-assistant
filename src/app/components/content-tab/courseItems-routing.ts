// Pure write-routing rules for CourseItemsView (Assignments/Quizzes tabs,
// docs/assignments-quizzes-tabs-acceptance-criteria.md, D1/D2). Extracted out
// of CourseItemsView.tsx (finding 6) so this repo's test runner - vitest here
// is node-env and never renders a component (AGENTS.md's ac-sonnet-opus-loop
// memory) - can actually exercise the rule by calling it, rather than
// regex-matching source text as courseItemsView.wiring.test.ts must for
// everything that stays inside the .tsx. Pulled out the same way
// course-copy-purge.ts was pulled out of CourseCopyModal.tsx for the
// identical reason: a rule this consequential needs real unit tests, not
// just a wiring guard proving the call sites exist.
//
// The one rule that matters: a New Quiz row (`isNewQuiz: true`) exists ONLY
// as an Assignment underneath, no matter which tab displays it - src/lib/
// canvas-modules/bulk.ts's own comment already says so: "a New Quiz must be
// addressed as an assignment, never as a quiz." Every write in
// CourseItemsView - publish/unpublish, due dates, points, description,
// delete - must route through this, never through the view's own `kind`
// prop directly.
//
// BUG FIX UPDATE (live report 2026-08-22, see bulk.ts's own header): the
// Assignments tab used to never contain a New Quiz, a classic quiz's shadow
// assignment, or a graded discussion's shadow assignment (all three were
// excluded from listBulkItems("Assignment") entirely) - that assumption is
// now false, on purpose: bulk.ts returns every assignment-shaped row there,
// each labelled for what it really is. This does not change what
// `effectiveKindOf` computes: a classic-quiz-shadow or graded-discussion-
// shadow row only ever reaches this function with `kind === "Assignment"`
// (bulk.ts never sets those two flags on a Quiz-tab row), and its own `id`
// already IS the assignment id Canvas needs for the write - so it always
// resolves to "Assignment" regardless, which is the same resource Canvas's
// own Assignments page would act on. A New Quiz row can now appear under
// EITHER tab's `kind`; this function is what keeps a Quiz-tab New Quiz
// routed to "Assignment" while an Assignment-tab New Quiz (trivially) stays
// "Assignment" too - never special-cased per call site.

import type { BulkItem } from "@/lib/canvas-modules";

export type EffectiveKind = "Assignment" | "Quiz";

/** Structural subset `effectiveKindOf` actually reads - callers may pass a
 *  full `BulkItem` or any object carrying just this one field. */
export type NewQuizFlagged = Pick<BulkItem, "isNewQuiz">;

/** Every flag that together describes a row's REAL Canvas kind, independent
 *  of which tab lists it (bulk.ts's own header) - the single shared shape so
 *  a consumer (courseItems-modules.ts's module lookup, CourseItemsView.tsx's
 *  labels) reads the same fields `effectiveKindOf` itself is defined against,
 *  rather than each inventing its own ad hoc pick of BulkItem and risking one
 *  drifting from another. */
export type RealKindFlagged = Pick<
  BulkItem,
  | "isNewQuiz"
  | "isClassicQuizShadow"
  | "isGradedDiscussionShadow"
  | "shadowQuizId"
  | "shadowDiscussionTopicId"
>;

/** The Canvas kind a given row must actually be addressed as for any write -
 *  never the view's own `kind` prop directly. A classic-quiz-shadow or
 *  graded-discussion-shadow row (isClassicQuizShadow/isGradedDiscussionShadow)
 *  never changes this: both flags are only ever set on an Assignment-tab row
 *  (bulk.ts), where this already collapses to `kind` unchanged - deleting or
 *  updating it via the assignment id is exactly what Canvas's own Assignments
 *  page does. Only a New Quiz row (`isNewQuiz`) can ever disagree with its
 *  own tab's `kind`, and only when shown in the Quizzes tab. */
export function effectiveKindOf(item: NewQuizFlagged, kind: EffectiveKind): EffectiveKind {
  return item.isNewQuiz ? "Assignment" : kind;
}

/** Splits a selected-id set into the two Canvas requests it actually needs,
 *  by looking up each id's effective kind (see `effectiveKindOf` above), so a
 *  mixed Classic/New Quiz selection in the Quizzes tab becomes the two
 *  requests Canvas actually needs instead of one request routed by the tab's
 *  own `kind`. An id with no matching entry in `itemsById` (a row that no
 *  longer exists) is silently dropped rather than guessed at - the caller's
 *  own selection pruning (`useFlatItemSelection`) is what keeps this from
 *  happening in practice. */
export function groupSelectedByEffectiveKind(
  ids: Iterable<string>,
  itemsById: ReadonlyMap<string, NewQuizFlagged>,
  kind: EffectiveKind
): { Assignment: string[]; Quiz: string[] } {
  const groups: { Assignment: string[]; Quiz: string[] } = { Assignment: [], Quiz: [] };
  for (const id of ids) {
    const item = itemsById.get(id);
    if (!item) continue;
    groups[effectiveKindOf(item, kind)].push(id);
  }
  return groups;
}
