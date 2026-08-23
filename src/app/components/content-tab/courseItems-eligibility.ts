// Pure eligibility rule for CourseItemsView's Assignment-only bulk writes
// (rubric association, submission-type change - FINDING 1). Extracted into
// its own leaf for the same reason courseItems-routing.ts, courseItems-
// modules.ts and courseItems-filters.ts were: this repo's vitest is node-env
// and never renders a component (AGENTS.md's ac-sonnet-opus-loop memory), so
// a rule this consequential needs to be a plain function a test can call
// directly - never logic left inline in CourseItemsView.tsx, where only
// courseItemsView.wiring.test.ts's source-text matching could ever reach it,
// and a source-text match cannot prove a New Quiz id never reaches a write.
//
// THE BUG THIS FIXES: both writes used to be gated on the TAB
// (`kind === "Assignment"`) and nothing else, then handed the selection
// verbatim (`[...selection.selected]`, no per-row filter). Once the
// Assignments tab started listing New Quizzes, classic-quiz shadow rows, and
// graded-discussion shadow rows too (bulk.ts's own bug fix - Canvas's own
// Assignments page lists them, so this tab must too), a selection that
// happened to include one of those rows sent its id straight into
// PUT /assignments/{id}?assignment[submission_types][]=... or the
// rubric-association endpoint. For a New Quiz specifically, that PUT
// replaces the `external_tool` submission type that IS the New Quiz -
// destroying it, not merely mislabeling it. CourseItemRow.tsx's own tooltip
// already told the user "rubric and submission-type changes do not apply" to
// such a row; the code must actually enforce what the UI already claims,
// rather than silently sending the write anyway.
import type { RealKindFlagged } from "./courseItems-routing";

/**
 * True for a row that is a genuine, ORDINARY Canvas Assignment - never a New
 * Quiz, a classic quiz's shadow assignment record, or a graded discussion's
 * shadow assignment record. Only this kind of row may receive a rubric
 * association or a submission-type change through CourseItemsView's
 * Assignment-only controls; every other kind either has no rubric/submission-
 * type concept of its own (a classic quiz, a discussion) or would have its
 * defining `external_tool` submission type destroyed by the write (a New
 * Quiz).
 */
export function isOrdinaryAssignmentRow(item: RealKindFlagged): boolean {
  return !item.isNewQuiz && !item.isClassicQuizShadow && !item.isGradedDiscussionShadow;
}

/**
 * Splits a selection into the ids actually eligible for an Assignment-only
 * write (rubric association, submission-type change) and how many were left
 * out - so the caller can both send only the eligible ids AND tell the user
 * plainly how many rows were skipped and why (finding 1's own requirement:
 * never silently drop a row without saying so). An id with no matching entry
 * in `itemsById` (a row that no longer exists) counts as skipped too, never
 * guessed at - the same "silently dropped, never guessed" precedent
 * courseItems-routing.ts's own `groupSelectedByEffectiveKind` already sets
 * for its analogous lookup.
 */
export function ordinaryAssignmentSelection(
  ids: Iterable<string>,
  itemsById: ReadonlyMap<string, RealKindFlagged>
): { eligible: string[]; skipped: number } {
  const eligible: string[] = [];
  let skipped = 0;
  for (const id of ids) {
    const item = itemsById.get(id);
    if (item && isOrdinaryAssignmentRow(item)) eligible.push(id);
    else skipped += 1;
  }
  return { eligible, skipped };
}
