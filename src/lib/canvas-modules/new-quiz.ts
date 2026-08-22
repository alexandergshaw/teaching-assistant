/**
 * New Quiz classifier (D1, docs/assignments-quizzes-tabs-acceptance-criteria.md
 * Contract 1 / AC section C).
 *
 * Canvas has two quiz systems that both surface through course content:
 *
 *   - Classic Quizzes are served from `/courses/:id/quizzes` (a `Quiz`
 *     object). When graded, Canvas ALSO creates a shadow Assignment for the
 *     quiz so it appears in the gradebook; that shadow assignment reports
 *     `quiz_id` and `submission_types: ["online_quiz"]`. Per the Canvas API
 *     docs (see below), `quiz_id` is documented as "(Optional) id of the
 *     associated quiz (applies only when submission_types is
 *     ['online_quiz'])" - i.e. its presence identifies a CLASSIC quiz's
 *     shadow assignment, not a New Quiz.
 *
 *   - New Quizzes are an LTI tool ("Quizzes 2" / "quiz-lti"). A New Quiz has
 *     NO `Quiz` object at all - it exists ONLY as an Assignment, with
 *     `submission_types: ["external_tool"]`.
 *
 * EVIDENCE FOR THE RULE (fetched directly from the live Canvas API docs on
 * 2026-08-22, https://canvas.instructure.com/doc/api/assignments.html - this
 * repo had zero prior references to any of these fields, per the acceptance
 * criteria's own grep, so nothing here could be checked against existing
 * code and the live docs are the only source of truth):
 *
 *   - `is_quiz_assignment`: documented VERBATIM as "Boolean indicating
 *     whether this is a quiz lti assignment." Despite the field's name
 *     reading like a generic "is this a quiz" flag, Canvas's own description
 *     specifically says "quiz LTI assignment" - i.e. this field means New
 *     Quiz, not "any quiz." This is the closest thing to a direct New Quiz
 *     flag the API exposes, and the AC's guess at this field name is
 *     confirmed correct by the docs.
 *   - `submission_types` containing `"external_tool"` is a second,
 *     confirming signal: New Quizzes use that submission type, as does any
 *     other LTI-backed assignment. The AC explicitly warns this signal is
 *     NECESSARY but NOT SUFFICIENT alone (an ordinary external-tool
 *     assignment that is not a quiz also reports this) - so it is used here
 *     only in combination with `is_quiz_assignment`, never by itself.
 *   - `quiz_id` being present is treated as a DISQUALIFYING signal: per the
 *     docs quoted above, a populated `quiz_id` means this assignment is a
 *     classic quiz's shadow record (already listed by the Quiz endpoint), so
 *     flagging it as a New Quiz too would double-count the same underlying
 *     quiz in two tabs (AC C5).
 *
 * CONSERVATISM (the AC's explicit priority: mislabelling an ordinary
 * assignment as a quiz is worse than leaving a genuine New Quiz unlabelled).
 * All three checks must agree - any signal absent, undefined, or ambiguous
 * makes this return false:
 *   - `isQuizAssignment` must be EXACTLY `true` (not merely truthy/present).
 *   - `submissionTypes` must be a real array that includes `"external_tool"`.
 *   - `quizId` must be absent (`undefined`) or `null` - anything else (a
 *     classic quiz's shadow assignment) fails the check.
 *
 * If Canvas ever stops sending `is_quiz_assignment` for a given
 * installation/version, this correctly falls back to "not a New Quiz"
 * rather than guessing from `submission_types` alone - exactly the
 * conservative behavior the AC requires.
 */

/** Structural subset of a raw Canvas assignment this rule reads. */
export interface NewQuizSignals {
  submissionTypes?: readonly string[];
  isQuizAssignment?: boolean;
  quizId?: number | null;
}

/** Whether a raw assignment row is a New Quiz. CONSERVATIVE: returns false
 *  whenever the signals are absent or ambiguous - mislabelling an ordinary
 *  assignment as a quiz is worse than leaving a New Quiz unlabelled. */
export function isNewQuizAssignment(signals: NewQuizSignals): boolean {
  if (signals.isQuizAssignment !== true) return false;
  if (!Array.isArray(signals.submissionTypes)) return false;
  if (!signals.submissionTypes.includes("external_tool")) return false;
  if (signals.quizId !== undefined && signals.quizId !== null) return false;
  return true;
}
