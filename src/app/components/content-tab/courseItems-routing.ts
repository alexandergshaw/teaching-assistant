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
// as an Assignment underneath, even when it is displayed in the Quizzes tab -
// src/lib/canvas-modules/bulk.ts's own comment already says so: "a New Quiz
// must be addressed as an assignment, never as a quiz." Every write in
// CourseItemsView - publish/unpublish, due dates, points, description,
// delete - must route through this, never through the view's own `kind`
// prop directly.

import type { BulkItem } from "@/lib/canvas-modules";

export type EffectiveKind = "Assignment" | "Quiz";

/** Structural subset `effectiveKindOf` actually reads - callers may pass a
 *  full `BulkItem` or any object carrying just this one field. */
export type NewQuizFlagged = Pick<BulkItem, "isNewQuiz">;

/** The Canvas kind a given row must actually be addressed as for any write -
 *  never the view's own `kind` prop directly. The Assignments tab never
 *  contains a New Quiz row (C3), so this collapses to `kind` unchanged
 *  there; only the Quizzes tab can ever disagree with its own `kind`. */
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
