// course-intel: WHICH of the four LMS states this answer was built in, and
// the one sentence the instructor reads because of it.
//
// docs/course-student-intelligence-acceptance-criteria.md D20a lists four "no
// LMS" states and D20e decides the shape: ONE code path that degrades
// automatically, never two modes the instructor picks (that would ask them to
// already know the thing they are asking this tool to tell them), and never
// silent detection either (the same question produces a materially weaker
// answer with no other visible difference).
//
// THE PRECEDENT THIS COPIES, deliberately and in full: the content tab's
// live-then-export fallback. `tryExportFallbackForFailedLiveRead`
// (src/app/components/content-tab/content-load-recovery.ts) degrades on ANY
// live failure, and `describeExportFallbackAfterLiveFailure`
// (src/lib/course-picker-availability.ts) renders a permanent, non-dismissible
// note that CARRIES THE UNDERLYING REASON verbatim rather than swallowing it
// behind a vague "using the export". Three things are copied from it: the
// automatic degrade, the permanence, and the refusal to hide the cause. One
// thing is NOT: that note is a single string with the mode baked in, and this
// feature needs the state to travel as DATA, because the route has to persist
// and reason about it and the browser has to render it.
//
// WHY THE THREE UNAVAILABLE STATES ARE KEPT APART. They already fail
// differently - D20a verified that - and telling an instructor to connect
// Canvas when they already have and it is merely down is its own small
// wrongness, the kind that makes a tool feel broken. Collapsing them costs
// nothing to do and cannot be undone by better wording later, because by then
// the distinguishing information is gone.
//
// WHAT IS NOT UNPICKED HERE. `no-credential` deliberately does not
// distinguish "no such institution", "half-configured" and "you never
// connected". That indistinguishability is a SECURITY property of
// canvas-credentials.ts's resolver - any signed-in caller could otherwise read
// the owner's environment back one bit at a time - and this module must not
// unpick it to produce a friendlier message. It compares against that one
// message BY IDENTITY, and the message arrives as a PARAMETER rather than an
// import for a bundling reason: canvas-credentials.ts is server-only (it
// resolves an ambient identity), and this leaf is imported by the browser so
// it can render the same sentence the server chose.
//
// PURE LEAF: no clock, no network, no React, no node builtins. Only the TYPES
// from ./types, which has zero imports of its own.

import type { LmsConnection, LmsUnavailableReason } from "./types";

/** The live case, as a value, so a caller never hand-writes the object. */
export const LIVE_LMS_CONNECTION: LmsConnection = Object.freeze({ state: "live" });

/**
 * The lead sentence for each unavailable state.
 *
 * EACH ONE NAMES ITS OWN STATE AND THE CONSEQUENCE, which is D20e's actual
 * requirement: "Canvas is not connected for this course, so this answer uses
 * only the work you recorded here" is actionable; "offline mode" is not. The
 * consequence half is repeated in all three rather than factored out, because
 * a reader sees exactly one of these and a sentence that only makes sense
 * beside its siblings is not a sentence.
 *
 * NOT AN ALERT, and the copy is written for that: this is a fact about the
 * answer, not a problem with it. An export-only course is a NORMAL kind of
 * course here (D20a), so nothing below apologises or implies a fault.
 */
const UNAVAILABLE_LEAD: Readonly<Record<LmsUnavailableReason, string>> = Object.freeze({
  "no-credential":
    "Canvas is not connected for this course, so this answer is built only from the work you recorded in this browser - not from an LMS gradebook.",
  "no-lms-course":
    "This course has no Canvas course link, so there is no LMS to read. This answer is built only from the work you recorded in this browser.",
  unreachable:
    "Canvas is connected for this course but could not be read just now, so this answer is built only from the work you recorded in this browser.",
});

/**
 * The permanent line rendered above every answer that is not live.
 *
 * Returns "" for a live answer, and the caller renders nothing - the line
 * exists to mark the DIFFERENCE, and printing "this came from Canvas" on every
 * normal answer would train an instructor to stop reading the place the real
 * warning appears.
 */
export function describeLmsConnection(connection: LmsConnection): string {
  if (connection.state === "live") return "";
  const lead = UNAVAILABLE_LEAD[connection.reason];
  const detail = connection.detail.trim();
  return detail ? `${lead} ${detail}` : lead;
}

/**
 * A course that has no Canvas link at all.
 *
 * FIRST-CLASS AND NORMAL, not a broken course (D20a): export-only courses
 * exist here, carry roster, student repos, materials and syllabus data, and
 * resolve by row id with no Canvas dependency. `detail` names WHICH half is
 * absent, because an instructor who set one and not the other should not have
 * to guess which.
 */
export function lmsCourseNotLinked(detail: string): LmsConnection {
  return { state: "unavailable", reason: "no-lms-course", detail: detail.trim() };
}

export interface ClassifyLmsFailureArgs {
  /** Whatever was thrown while resolving credentials or reading the LMS. */
  readonly error: unknown;
  /**
   * `CANVAS_CREDENTIAL_REQUIRED_MESSAGE`, passed in by the server so this leaf
   * stays free of the server-only module that owns it. Compared BY IDENTITY -
   * the caller imports the constant, this module never spells it - so the two
   * cannot drift apart the way a copied literal would. Mirrors
   * course-picker-availability.test.ts, which imports the same constant rather
   * than pasting its text.
   */
  readonly credentialRequiredMessage: string;
  /**
   * The already-scrubbed error text for the `unreachable` case.
   *
   * Scrubbed by the CALLER (the route's own `describeError`, which runs
   * `redactSensitiveText`), because an upstream error body can echo the
   * request that produced it and this app sends an API key as a query
   * parameter. The precedent note carries its underlying reason verbatim; this
   * one carries it redacted, which is the same promise under a stricter rule.
   */
  readonly scrubbedDetail: string;
}

/**
 * Turn a live-path failure into the state it actually was.
 *
 * DEGRADES ON ANY FAILURE, exactly like the precedent: there is no error this
 * returns "live" for, and no error it refuses to classify. An unrecognised
 * failure is `unreachable`, which is the honest reading - something went wrong
 * reaching an LMS that is configured as far as we can tell - and never
 * `no-credential`, which would tell an instructor to go and connect an account
 * they have already connected.
 */
export function classifyLmsFailure(args: ClassifyLmsFailureArgs): LmsConnection {
  const message = args.error instanceof Error ? args.error.message : "";
  if (message === args.credentialRequiredMessage) {
    return { state: "unavailable", reason: "no-credential", detail: args.credentialRequiredMessage };
  }
  const detail = args.scrubbedDetail.trim();
  return {
    state: "unavailable",
    reason: "unreachable",
    detail: detail ? `Underlying error: ${detail}` : "",
  };
}

/**
 * Is this answer built from recorded work rather than an LMS?
 *
 * A named predicate rather than `connection.state !== "live"` repeated at each
 * call site: the route, the response body and the view all have to agree about
 * it, and a fourth caller reading the union directly is how they would stop
 * agreeing.
 */
export function isOfflineConnection(connection: LmsConnection): boolean {
  return connection.state === "unavailable";
}
