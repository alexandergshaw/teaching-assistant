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
 * discussion. Before listBulkItems("Assignment") excluded their shadow
 * assignment rows (bulk.ts's isClassicQuizShadow / isDiscussionShadow, fixing
 * Finding 1), it silently did: the shadow rows were IN that list, so ticking
 * only "Assignments" issued DELETE /assignments/{shadowId} against them,
 * which Canvas cascades into deleting the quiz/discussion itself. That was
 * an accident of Canvas's data model (a graded quiz/discussion's shadow
 * assignment) leaking into what "an assignment" means to a user, not a
 * decision anyone made. This app already exposes separate purge checkboxes
 * for "Quizzes" (this function, kind "Quiz", /quizzes endpoint) and
 * "Discussions" (CourseCopyModal.tsx's own kindMap loop, kind "Discussion",
 * /discussion_topics endpoint, outside this file's scope entirely) - so a
 * user who ticks only "Assignments" now gets exactly what that checkbox
 * says: real Assignment objects (ordinary assignments plus New Quizzes,
 * because a New Quiz IS an Assignment object, per above) and nothing else.
 * A Classic quiz is deleted only when "Quizzes" is ticked; a graded
 * discussion is deleted only when "Discussions" is ticked. This function
 * enforces the "Assignments does not touch Quiz-kind" half by construction
 * (it only ever pushes a "Quiz" plan entry when opts.purgeQuizzes is true);
 * the discussion half is enforced upstream, by listBulkItems never handing a
 * discussion's shadow row to this function (or to anything else) as an
 * assignment id in the first place.
 */
export function planAssignmentPurgeDeletes(opts: {
  purgeAssignments: boolean;
  purgeQuizzes: boolean;
  /** listBulkItemsAction(destUrl, "Assignment", ...).items - never includes New Quizzes (C3). */
  assignmentItems: Array<Pick<BulkItem, "id">>;
  /** listBulkItemsAction(destUrl, "Quiz", ...).items - Classic quizzes plus New Quizzes, the latter flagged isNewQuiz. */
  quizItems: Array<Pick<BulkItem, "id" | "isNewQuiz">>;
}): Array<{ kind: BulkKind; ids: string[] }> {
  const plan: Array<{ kind: BulkKind; ids: string[] }> = [];
  const assignmentIds: string[] = opts.purgeAssignments ? opts.assignmentItems.map((i) => i.id) : [];

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
