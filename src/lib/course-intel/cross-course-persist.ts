// course-intel: persisting a cross-course answer to history, lifted out of
// the route handler for the same reason ./offline-answer and
// ./cross-course-answer already were - src/app/api/course-intel/ask/route.ts
// sits at this repo's 1000-line ceiling, and behaviour that only exists
// inside a Next route handler cannot be tested for the promise it makes.
//
// WHY THIS DOES NOT LIVE IN ./cross-course-answer, WHERE IT ARGUABLY BELONGS.
// That file (and ./cross-course.ts, ./cross-course-prompt.ts and ./types.ts)
// was out of scope for the change that added this module - a concurrent
// agent owned all four, and crossCourseAskResponse there still hardcodes
// `entryId: null, persistError: null` with a comment claiming a cross-course
// answer is "never persisted." That comment is now stale: this module is
// meant to be called with crossCourseAskResponse's OWN result, immediately
// after, to correct exactly those two fields before the response reaches the
// browser. The cleaner shape - an injected `persist` callback on
// CrossCourseAnswerArgs/CrossCourseAskArgs, mirroring
// OfflineAskArgs.persist in ./offline-answer.ts, so the answer builder sets
// entryId/persistError itself instead of a caller patching them in
// afterward - is the edit that file still owes; seaming it in from outside
// is what this module does until that lands.
//
// THE COVERED-COURSE SET PERSISTED IS THE FULL REQUEST SCOPE, not only the
// courses a live read actually reached. Acceptance-criteria decision D24e
// requires a cross-course answer to state which courses it covered, in
// which mode, and which it could not reach - ALWAYS, not only on failure -
// and that is exactly what the response's own `courses` field already lists
// for every course in scope, success or failure alike. So `courseIds` here
// is the same list crossCourseAskResponse was given to build that field,
// never a subset re-derived from which reads happened to succeed.
//
// answerMarkdown and citedStudents are read back out of the ALREADY-BUILT
// response body rather than off a typed return, because that is the only
// thing on offer here (see above). Trusting their shape with a narrow cast
// is a missing type, not a missing check: both fields are produced entirely
// server-side inside buildCrossCourseAnswer, never from client input.

import type { AppendCourseIntelAnswerInput } from "./history";

/** What `persist` needs to build one history row - the question and
 *  assembledAt are the caller's own values, unchanged from the request that
 *  produced this answer; answerMarkdown and citedStudents come from the
 *  response body itself (see this module's header for why). */
export interface CrossCoursePersistInput {
  readonly courseIds: readonly string[];
  readonly question: string;
  readonly answerMarkdown: string;
  readonly citedStudents: AppendCourseIntelAnswerInput["citedStudents"];
  readonly assembledAt: string;
}

export interface PersistCrossCourseAnswerArgs {
  /** crossCourseAskResponse's own result, unmodified. */
  readonly status: number;
  readonly body: Record<string, unknown>;
  /** Every course this request was scoped to - see this module's header for
   *  why this is the full scope, not only the courses actually reached. */
  readonly courseIds: readonly string[];
  /** The instructor's own words, never the model-facing rewrite - persisted
   *  to history exactly like the single-course and offline paths' own. */
  readonly question: string;
  readonly assembledAt: string;
  /** Appends the history row and returns its id. Throws on failure - the
   *  route owns the client and any deadline, and a throw here is caught
   *  below and reported as `persistError` rather than failing the whole
   *  response; the answer already built is real and must still reach the
   *  instructor (D17). */
  readonly persist: (input: CrossCoursePersistInput) => Promise<string>;
  readonly describeError: (err: unknown) => string;
  readonly logError: (message: string, detail: string) => void;
}

export interface PersistCrossCourseAnswerResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/** The minimal shape this module reads out of an already-built cross-course
 *  response body - see this module's header for why a narrow cast, rather
 *  than a typed return, is how those two fields arrive here. */
interface CrossCourseResponseBodyForPersist {
  readonly status?: unknown;
  readonly answerMarkdown?: unknown;
  readonly citedStudents?: unknown;
}

/**
 * Persist a cross-course answer to history, and return the response body
 * with `entryId` / `persistError` corrected to reflect whether that
 * succeeded.
 *
 * A NO-OP on any non-success result: `crossCourseAskResponse` already sets
 * `entryId: null, persistError: null` on its own error body, and there is no
 * answer there to persist in the first place - only a successful answer is
 * ever saved (D17: a failed or partial attempt can never masquerade as a
 * stored answer).
 */
export async function persistCrossCourseAnswer(
  args: PersistCrossCourseAnswerArgs
): Promise<PersistCrossCourseAnswerResult> {
  const responseBody = args.body as CrossCourseResponseBodyForPersist;
  if (args.status !== 200 || responseBody.status !== "ok") {
    return { status: args.status, body: args.body };
  }

  let entryId: string | null = null;
  let persistError: string | null = null;
  try {
    entryId = await args.persist({
      courseIds: args.courseIds,
      question: args.question,
      answerMarkdown: typeof responseBody.answerMarkdown === "string" ? responseBody.answerMarkdown : "",
      citedStudents: Array.isArray(responseBody.citedStudents)
        ? (responseBody.citedStudents as AppendCourseIntelAnswerInput["citedStudents"])
        : [],
      assembledAt: args.assembledAt,
    });
  } catch (err) {
    // Non-fatal, and stated rather than swallowed - mirrors the
    // single-course and offline paths' own persist failure handling (D17):
    // the answer on screen is real, but the instructor must know it is not
    // in the history they can come back to.
    persistError = args.describeError(err);
    args.logError("[course-intel] could not persist the cross-course answer:", persistError);
  }

  return { status: args.status, body: { ...args.body, entryId, persistError } };
}
