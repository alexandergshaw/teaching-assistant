// A13-1 (docs/backlog.yml, id A13): the guard that stops a grading run's
// internal error text or raw, unparsed model output from reaching a STUDENT
// as Canvas feedback. Plain leaf, no imports outside this directory's own
// types - no "use server", no lib/canvas, no lib/gemini, no lib/llm - so
// every payload builder (client or server) can import it with no risk of
// dragging a server-only or model-calling module into a client bundle. See
// classTrendsDraft.not-postable.test.ts for the sibling capability-boundary
// pattern this module is deliberately compatible with, even though nothing
// here enforces that boundary itself.
//
// WHY A PREDICATE, NOT A FIELD ON GradeResult (A13's ruling 1). Two reasons,
// and the FIRST one is not "the allowlists would silently drop it" - they
// would not. src/lib/grade-result-allowlist-coverage.test.ts pins
// GradeResult's exact key set at compile time (a keyof-based Exclude) plus a
// runtime half that round-trips a sentinel through all three persistence
// allowlists, so a field added and then missed in an allowlist goes RED, not
// quiet. Saying otherwise here would tell the next agent that an existing
// guard does not work, so: the real reasons are (1) COST AND BLAST RADIUS -
// a field makes this live, student-facing fix wait on tsc and vitest going
// green across ALL_GRADE_RESULT_FIELDS, sentinelResult() and three
// allowlists, none of which a leak needs; and (2) the not-attempted SEAM
// being authored against this same type turns an ungraded row into a union
// member that DROPS userId and blanks these fields, so a boolean added here
// would be DELETED by that wave, not widened by it. A pure function over
// fields that already exist survives the seam untouched - the seam's own
// contract asks for exactly this shape and swaps only the body.
//
// N13a LANDED (docs/backlog.yml note "SEAM DISPOSAL AND SIX RULINGS"): the
// union now exists (GradeResult.ungraded, src/lib/grade/types.ts) and this
// predicate was NOT deleted or replaced by it. The two compose rather than
// compete: this predicate was the right shape for a live, student-facing fix
// under time pressure (no allowlist/tsc/vitest dependency), and `ungraded`
// is the right shape for the durable discriminator (persisted, type-closed
// against carrying a Canvas identity). checkRowPostability still covers the
// two doors the type cannot reach on its own - the repo-grades postings,
// which key off the roster's canvasUserId rather than GradeResult.userId
// (see repoGradesPosting.ts) - and every ungraded row is refused by BOTH
// mechanisms today (an ungraded row's totalScore/areas are always blank, so
// clause (a)/(b) hold; an unedited submission leaves clauses (c)/(d) intact
// too). Do not delete this predicate when reading the field - it is not
// redundant.
//
// THE FOUR CLAUSES (A13's ruling 2) are ALL required before a row is refused
// - this is deliberately narrower than "the producer failed," because two
// real, reachable cases must NOT be refused:
//   - a DELIBERATE comment-only post (an instructor blanks the score to post
//     a comment alone - real today, see GradingResults.tsx's payload
//     builders, which omit the grade whenever parseEarnedPoints("") returns
//     "" and still post the comment); guarded against by requiring the
//     SUBMITTED score to also be blank (clause c) and the SUBMITTED comment
//     to be UNCHANGED from the producer's own overallComment (clause d) - an
//     instructor who authored a real comment never matches clause d.
//   - a RESCUED row (an instructor typed a real score, and/or a real
//     comment, over a failed or unparsed producer row) - guarded against by
//     requiring the SUBMITTED score to be blank (clause c). Typing any real
//     score is treated as sufficient evidence of human review; this
//     predicate does not additionally require the comment to have changed
//     once the score has (that would silently refuse an instructor who kept
//     the AI's comment on purpose after fixing the score).
// A row this predicate refuses is refused SILENTLY nowhere - it returns a
// reason string precisely so no caller can drop the outcome on the floor
// (A13's ruling 2 forbids a silent refusal exactly as much as a silent
// post).
//
// ONE ACCEPTED RESIDUAL FALSE POSITIVE (recorded, not hidden, per A13): an
// instructor who keeps the AI's comment text verbatim and clears the score
// to post nothing but that comment is refused here (clauses a/b/c/d all
// hold), and recovers by editing one character of the comment.

import type { GradeResult, RubricAreaResult } from "./types";

/** The producer's own, untouched output for one row - whatever a grading
 * engine (the LLM path in parsing.ts, the embedded engine, or a catch-branch
 * failure in engine.ts) actually produced, before any human looked at it.
 * A `Pick` off GradeResult rather than a hand-typed shape so a future
 * GradeResult rename is a compile error here too, not a silent drift. */
export type PostabilityProducer = Pick<GradeResult, "totalScore" | "rubricAreas" | "overallComment">;

export interface PostabilityCheckInput {
  producer: PostabilityProducer;
  /** The score actually about to be sent (already resolved to whatever
   * string a caller would put in Canvas's `posted_grade` field, or the raw
   * edited/typed value pre-parse - either way, "" means nothing numeric is
   * going out for this row). */
  submittedScore: string;
  /** The comment text actually about to be sent as `comment[text_comment]`. */
  submittedComment: string;
}

export type PostabilityCheckResult =
  | { postable: true }
  | { postable: false; reason: string };

function everyRubricAreaScoreBlank(rubricAreas: RubricAreaResult[]): boolean {
  return rubricAreas.every((area) => area.score.trim() === "");
}

/**
 * Refuses a row only when ALL FOUR clauses hold - see this module's header
 * comment for why each one is required and what it protects. Returns a
 * REASON on refusal, never a bare boolean, so a caller can surface why a row
 * was refused instead of dropping it silently.
 */
export function checkRowPostability(input: PostabilityCheckInput): PostabilityCheckResult {
  const { producer, submittedScore, submittedComment } = input;

  const producerScoreBlank = producer.totalScore.trim() === "";
  const producerAreasBlank = everyRubricAreaScoreBlank(producer.rubricAreas);
  const submittedScoreBlank = submittedScore.trim() === "";
  const commentUntouchedFromProducer = submittedComment === producer.overallComment;

  const isUntouchedByAHuman =
    producerScoreBlank && producerAreasBlank && submittedScoreBlank && commentUntouchedFromProducer;

  if (!isUntouchedByAHuman) {
    return { postable: true };
  }

  return {
    postable: false,
    reason:
      "This row has no score from the grader and its comment has not been edited - it looks like a " +
      "failed or unparsed grading result, not a reviewed grade. Type a score or edit the comment before " +
      "posting it to the student.",
  };
}
