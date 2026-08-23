import type { BulkItem, BulkKind } from "@/lib/canvas-modules";

/**
 * Turn a "Quiz" listBulkItems result into the delete calls that actually
 * address the right Canvas resource, for CourseCopyModal's purgeDestination.
 *
 * A New Quiz is LTI-backed and has no quiz id of its own - listBulkItems
 * reports it under kind "Quiz" (flagged isNewQuiz), keyed by its ASSIGNMENT
 * id, because that is the only id it has (src/lib/canvas-modules/bulk.ts).
 * Deleting it through the quiz endpoint would issue
 * DELETE /quizzes/{assignmentId}: the wrong resource, and depending on what
 * that id collides with in the destination course it either fails or
 * deletes something unrelated. Classic quizzes still delete through the
 * quiz path; New Quiz rows must go through the assignment path instead,
 * since a New Quiz IS an assignment. Kept as a pure function (rather than
 * inline in the component) so this routing is unit-testable - the component
 * itself is a .tsx client component and this repo's vitest config only
 * collects src/**\/*.test.ts under a node environment, so it is never
 * rendered in tests.
 */
export function planQuizPurgeDeletes(
  items: Array<Pick<BulkItem, "id" | "isNewQuiz">>
): Array<{ kind: BulkKind; ids: string[] }> {
  const classicIds = items.filter((i) => !i.isNewQuiz).map((i) => i.id);
  const newQuizIds = items.filter((i) => i.isNewQuiz).map((i) => i.id);
  const plan: Array<{ kind: BulkKind; ids: string[] }> = [];
  if (classicIds.length > 0) plan.push({ kind: "Quiz", ids: classicIds });
  if (newQuizIds.length > 0) plan.push({ kind: "Assignment", ids: newQuizIds });
  return plan;
}

/**
 * Compute the delete calls for the "Assignments" and "Quizzes" purge
 * checkboxes TOGETHER (CourseCopyModal.purgeDestination), rather than as two
 * independent loop iterations over PURGE_TYPES.
 *
 * Why they cannot be planned independently: a New Quiz is a single Canvas
 * Assignment object (it has no Quiz object at all - new-quiz.ts) that
 * listBulkItemsAction only ever returns under ONE of the two kinds - never
 * under "Assignment" (excluded per C3, docs/assignments-quizzes-tabs-acceptance-criteria.md),
 * always under "Quiz" (flagged isNewQuiz, keyed by its assignment id). Once
 * that C3 exclusion shipped, planning the two purge types separately (ticking
 * "Assignments" -> delete listBulkItemsAction("Assignment").items, ticking
 * "Quizzes" -> planQuizPurgeDeletes(listBulkItemsAction("Quiz").items))
 * silently regressed: a user who ticked ONLY "Assignments" stopped purging
 * New Quizzes at all, because they are no longer in that list - they simply
 * survive in the destination course and re-import as duplicates.
 *
 * The fix keeps the more-correct pre-split meaning of "Assignments": a New
 * Quiz IS a Canvas Assignment (being hidden from the Assignments TAB is a UI
 * labelling choice - D1 - not a change to what it fundamentally is), so
 * ticking "Assignments" alone purges it, exactly as ticking it did before the
 * tab split existed. Ticking "Quizzes" alone still purges it too (routed to
 * the Assignment delete endpoint, same as planQuizPurgeDeletes always did -
 * a New Quiz has no quiz id to delete through the quiz endpoint). Ticking
 * BOTH purges each New Quiz exactly ONCE: the two "New Quiz -> Assignment
 * endpoint" ids are merged into a single Assignment delete call rather than
 * two separate ones, so a second DELETE against an already-deleted id never
 * happens and never surfaces as a spurious failure in the results summary.
 *
 * DELIBERATE SEMANTICS, PINNED BY TEST (REGRESSION.md check 8): ticking
 * "Assignments" alone must NEVER delete a Classic quiz or a graded
 * discussion.
 *
 * BUG FIX UPDATE (live report 2026-08-22): listBulkItems("Assignment") used
 * to enforce this by EXCLUDING classic-quiz and graded-discussion shadow
 * rows from its own output (bulk.ts's old isClassicQuizShadow /
 * isDiscussionShadow filter) - so `opts.assignmentItems` could never contain
 * one, and this function did not need to look. That exclusion was itself the
 * bug this fix addresses (it also hid those rows from the Assignments TAB,
 * not just from this purge plan - see bulk.ts's own header), so
 * `opts.assignmentItems` may now legitimately contain both flagged rows. The
 * "Assignments alone never deletes a quiz/discussion" decision has NOT
 * changed - it is now enforced explicitly, right here, by filtering both
 * flags out before any id from `assignmentItems` is ever added to the
 * assignment delete set, rather than relying on the listing to have already
 * left them out. The correct way to delete the underlying quiz/discussion
 * object is still through its OWN kind - "Quizzes" (this function, kind
 * "Quiz", /quizzes endpoint, using the quiz's own id from `quizItems`, never
 * the shadow assignment id) or "Discussions" (CourseCopyModal.tsx's own
 * kindMap loop, kind "Discussion", /discussion_topics endpoint, outside this
 * file's scope entirely) - never via the shadow assignment id, no matter
 * which checkbox combination is ticked. A user who ticks only "Assignments"
 * gets exactly what that checkbox says: real Assignment objects (ordinary
 * assignments plus New Quizzes, because a New Quiz IS an Assignment object,
 * per above) and nothing else.
 *
 * FINDING 2 FIX: `opts.assignmentItems` now ALSO legitimately contains New
 * Quiz rows (flagged `isNewQuiz`) for the same reason it contains the two
 * shadow flags - bulk.ts's Assignment listing no longer excludes anything
 * assignment-shaped. A New Quiz id therefore now arrives from BOTH
 * `assignmentItems` (its native home, since it IS a real Assignment object)
 * AND `quizItems` (Canvas's own Quizzes page also lists it). Without also
 * filtering `isNewQuiz` out of `realAssignmentItems` below, ticking either
 * "Assignments" alone or both checkboxes together double-added the same New
 * Quiz id: once straight from `assignmentItems`, and a second time from the
 * `quizItems`-derived merge a few lines down (the "else if" branch below, or
 * the `purgeQuizzes` branch's own merge) - producing a plan like
 * `["901","902","901"]` and issuing a second, redundant
 * `DELETE /assignments/901` that 404s (right id, wrong count: proven by
 * course-copy-purge.test.ts's own fixture, which used to be stale - see that
 * file's header for how it was corrected to actually catch this). New Quiz
 * ids are sourced from `quizItems` ONLY (via `planQuizPurgeDeletes` when
 * `purgeQuizzes` is ticked, or the explicit `quizItems.filter(isNewQuiz)`
 * fallback below when it is not) - `realAssignmentItems` excludes them so
 * each New Quiz id is added to the merged Assignment delete set exactly once,
 * from exactly one source, no matter which checkbox combination is ticked.
 */
export function planAssignmentPurgeDeletes(opts: {
  purgeAssignments: boolean;
  purgeQuizzes: boolean;
  /** listBulkItemsAction(destUrl, "Assignment", ...).items - now includes
   *  New Quizzes, classic-quiz shadow rows and graded-discussion shadow rows
   *  too (bulk.ts's bug fix), each flagged; this function filters all three
   *  back out of its own real-assignment set itself (see this function's own
   *  header) rather than relying on the listing to have excluded them - a New
   *  Quiz id is re-added afterward, but only ever from `quizItems`, never
   *  from here, so it is never counted twice. */
  assignmentItems: Array<Pick<BulkItem, "id" | "isClassicQuizShadow" | "isGradedDiscussionShadow" | "isNewQuiz">>;
  /** listBulkItemsAction(destUrl, "Quiz", ...).items - Classic quizzes plus New Quizzes, the latter flagged isNewQuiz. */
  quizItems: Array<Pick<BulkItem, "id" | "isNewQuiz">>;
}): Array<{ kind: BulkKind; ids: string[] }> {
  const plan: Array<{ kind: BulkKind; ids: string[] }> = [];
  // A real, ORDINARY Assignment object only - a classic quiz's or graded
  // discussion's shadow row must never reach the assignment delete set
  // regardless of which checkbox combination is ticked (see this function's
  // own header), and a New Quiz id must never reach it FROM HERE either: it
  // is re-added below, sourced only from `quizItems`, so including it here
  // too would double it (finding 2 - the exact bug this filter now prevents).
  const realAssignmentItems = opts.assignmentItems.filter(
    (i) => !i.isClassicQuizShadow && !i.isGradedDiscussionShadow && !i.isNewQuiz
  );
  const assignmentIds: string[] = opts.purgeAssignments ? realAssignmentItems.map((i) => i.id) : [];

  if (opts.purgeQuizzes) {
    // Reuse the already-tested Classic/New split rather than re-deriving it.
    for (const step of planQuizPurgeDeletes(opts.quizItems)) {
      if (step.kind === "Assignment") {
        // New Quizzes: merge into the single Assignment delete call below,
        // rather than issuing their own separate Assignment delete call -
        // that merge is what keeps a New Quiz from being targeted twice when
        // both checkboxes are ticked.
        assignmentIds.push(...step.ids);
      } else {
        plan.push(step);
      }
    }
  } else if (opts.purgeAssignments) {
    // "Quizzes" was not ticked, but "Assignments" was: New Quizzes are still
    // Canvas Assignment objects and must not silently survive (the
    // regression this function fixes).
    assignmentIds.push(...opts.quizItems.filter((i) => i.isNewQuiz).map((i) => i.id));
  }

  if (assignmentIds.length > 0) plan.push({ kind: "Assignment", ids: assignmentIds });
  return plan;
}
