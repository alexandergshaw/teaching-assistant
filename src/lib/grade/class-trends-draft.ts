import { containsForbiddenCompletenessPhrase } from "./class-trends";
import type { AreaTrend, ClassTrendsReport } from "./class-trends";
import type { ClassTrendsInsightObservation } from "./class-trends-insight";

/**
 * Layer C of backlog N9/N10/N11: a pure, synchronous composer that turns
 * layer A's counted trends and layer B's (optional) inferred observations
 * into one COPYABLE - never postable - draft message addressed to students.
 *
 * There is no model call in this module. Layer A's AreaTrend.summary and
 * layer B's ClassTrendsInsightObservation are already fully-formed, typed
 * material; this module's only job is composing already-computed facts into
 * a student-facing template, never generating new claims. That is why this
 * function is synchronous, takes no route, needs no requireUser() call, and
 * cannot time out or fail from a network perspective - it does no I/O.
 */

export const DEFAULT_CLASS_TRENDS_DRAFT_FLOOR = 5;

/** parsePositiveInt is not exported from gemini.ts (verified:
 * `grep -n "export function parsePositiveInt"` returns nothing) - duplicated
 * here rather than exporting a function from a model-provider config file
 * for one caller in a different feature area, at this repo's own documented
 * precedent (escapeForCopyTitle duplicating markdown.ts's unexported
 * escapeHtml, useAnnouncementDraftSlots.ts:74-76). */
function parsePositiveInt(value: string | undefined, fallback: number, min = 1): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
}

/** This is read from a CLIENT component - layer C runs entirely in the
 * browser, no route or server action of its own - and Next inlines only
 * NEXT_PUBLIC_-prefixed variables (account-admin-rules.ts:14-25,
 * inbox-panel.tsx:42's NEXT_PUBLIC_GOOGLE_CALENDAR_EMBED_SRC precedent). A
 * bare `process.env.CLASS_TRENDS_DRAFT_FLOOR` here would resolve to
 * `undefined` in every production build while a node-env unit test that sets
 * it passes - a silent-green shape this repo has hit before. Unlike
 * account-admin-rules.ts's OWNER_EMAILS (which stays non-public because it
 * gates access), this value is a plain numeric threshold with no student
 * data or credential behind it, so making it public costs nothing: the
 * draft itself already discloses strictly more ("based on the N submissions
 * graded so far") to the same audience that could read this constant out of
 * the shipped bundle. Whether the floor should remain a runtime-adjustable
 * knob at all - since it is now necessarily public if it exists client-side
 * - is an open owner decision (see the DEFAULT_CLASS_TRENDS_DRAFT_FLOOR /
 * GRADE_MAX_SUBMISSIONS collision noted below); this getter does not resolve
 * it. Changing this value on a deployed app requires a rebuild/redeploy
 * (NEXT_PUBLIC_ variables are inlined at build time), unlike
 * GRADE_MAX_SUBMISSIONS which is read server-side at runtime - a real
 * asymmetry between the two knobs, not a config change of equal cost either
 * way. DO NOT change the default below without an owner decision - it is
 * left at 5 deliberately, matching gemini.ts's DEFAULT_MAX_SUBMISSIONS
 * today, and whether that collision should be resolved (and how) is not
 * this module's call. */
export function getClassTrendsDraftFloor(): number {
  return parsePositiveInt(process.env.NEXT_PUBLIC_CLASS_TRENDS_DRAFT_FLOOR, DEFAULT_CLASS_TRENDS_DRAFT_FLOOR);
}

export type ClassTrendsDraftResult =
  | { status: "ok"; markdown: string }
  /** The draft composed with NO body clauses at all - no area cleared the
   * coverage bar, and no inferred observation survived - so the only content
   * would be the coverage-disclosure opening line plus a content-free
   * closer. There is nothing here worth putting a Copy button next to: a
   * copy control beside a message with no information in it still implies
   * there is something worth sending. This is an EXPLICIT state, not an
   * empty-string special case a caller could miss - the panel must render
   * the explanation and withhold the copy control entirely for this status. */
  | { status: "empty" }
  | { status: "below-floor"; floor: number; totalResults: number }
  | { status: "rejected"; reason: string };

/** A clause may only characterise an area when EVERY graded result in the
 * run carried that area - i.e. `resultsWithArea === report.totalResults`,
 * not merely `>= floor`. Reasoning: the draft's one and only stated
 * denominator is the unconditional opening line's `report.totalResults`
 * ("based on the N submissions graded so far"). If a clause could render for
 * an area covered by fewer results than that (even if it clears the floor),
 * the draft would state a set larger than the set the clause is actually
 * backed by - true today only by the config accident that
 * GRADE_MAX_SUBMISSIONS and the floor are both 5 (gemini.ts:25 vs this
 * file's DEFAULT_CLASS_TRENDS_DRAFT_FLOOR). Raise GRADE_MAX_SUBMISSIONS and
 * a draft reading "based on the 30 submissions graded so far" could carry a
 * clause backed by only 5 of those 30 with nothing disclosing the gap. Tying
 * every rendered clause's basis to the SAME field the opening line states
 * closes that regardless of how the two knobs are configured. DO NOT
 * "simplify" this back to a floor comparison - see the header comment on
 * the collision this guards against. */
function areaFullyCovered(area: AreaTrend, report: ClassTrendsReport): boolean {
  return area.resultsWithArea === report.totalResults;
}

/** The ONLY function in this module allowed to turn an AreaTrend into draft
 * text - and the only function that CAN: its parameter is AreaTrend, an
 * object, so `renderCountedClause(observation.reading)` (a bare string) is a
 * compile error. Reads exactly two fields - `displayArea` and `direction` -
 * and NEVER `.summary`, `resultsWithArea`, `totalResults`, or
 * `unscoredCount`: no number of any kind is interpolated here, so there is
 * no coverage qualifier to restate (the opening line states it once,
 * globally) and no scoring-band jargon written for the instructor who did
 * the marking. Only "high" and "low" directions produce a clause at all -
 * "mixed"/"no-scale"/"insufficient-data" carry no classified pattern and are
 * omitted, never presented as a finding. */
function renderCountedClause(area: AreaTrend): string | null {
  switch (area.direction) {
    case "high":
      return `Something that's going well: ${area.displayArea}.`;
    case "low":
      return `An area that could use more attention: ${area.displayArea}.`;
    default:
      return null;
  }
}

/** BEST-EFFORT, NOT A CLOSURE. A short, non-exhaustive phrase list catching
 * the most literal singular constructions ("one submission", "a
 * submission", "a single submission", "this submission") in a candidate
 * observation. ClassTrendsInsightObservation carries no count field to
 * filter on instead, so this is defense-in-depth only - a model can route
 * around it with equivalent free prose. Real closure needs either a
 * submission-count field added to ClassTrendsInsightObservation (a layer B
 * change, out of this item's scope) or a natural-language classifier. */
function isLikelySingularSubmissionClaim(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(one|a|a single|this)\s+submission\b/.test(lower);
}

/** The ONLY function in this module allowed to turn a
 * ClassTrendsInsightObservation into draft text, and the marker prefix is a
 * fixed string literal this function owns - never something the model's
 * concept/reading text could satisfy the role of, edit, or omit. A caller
 * cannot get inferred text into the draft any other way, because this is
 * the only function that reads .concept/.reading at all. Returns null
 * (dropped, not rejected) when the best-effort singular-phrase check fires. */
function renderInferredClause(observation: ClassTrendsInsightObservation): string | null {
  if (isLikelySingularSubmissionClaim(observation.reading) || isLikelySingularSubmissionClaim(observation.concept)) {
    return null;
  }
  return `One pattern I noticed (my own reading, not a count): ${observation.concept} - ${observation.reading}`;
}

export function composeClassTrendsDraft(
  report: ClassTrendsReport,
  observations: readonly ClassTrendsInsightObservation[],
  assignmentName: string,
  floor: number = getClassTrendsDraftFloor()
): ClassTrendsDraftResult {
  if (report.totalResults < floor) {
    return { status: "below-floor", floor, totalResults: report.totalResults };
  }

  // assignmentName is instructor-typed and unfiltered by any earlier layer -
  // checked up front, with a reason that names the actionable fix, rather
  // than only at the end where the copy could not distinguish this case from
  // a real template bug.
  if (containsForbiddenCompletenessPhrase(assignmentName)) {
    return {
      status: "rejected",
      reason: `The assignment name contains wording this feature won't repeat to students automatically. Rename the assignment, or write the message yourself using the trends above.`,
    };
  }

  // The coverage-disclosure sentence is UNCONDITIONAL - the one and only
  // place report.totalResults is interpolated into this draft.
  const opening = `A note on ${assignmentName || "this assignment"}, based on the ${report.totalResults} submissions graded so far:`;

  // displayArea is ALSO model-authored (rubric area names come from the
  // instructor's own rubric text) and ALSO unfiltered by layer A. A rubric
  // area named e.g. "Understanding of the class material" must not take
  // down the whole draft - it is dropped, the same "omit rather than fail"
  // shape used for below-floor/direction filtering, not escalated to a
  // rejection.
  const countedClauses = report.areas
    .filter((area: AreaTrend) => areaFullyCovered(area, report))
    .map(renderCountedClause)
    .filter((clause): clause is string => clause !== null && !containsForbiddenCompletenessPhrase(clause));

  const inferredClauses = observations
    .map(renderInferredClause)
    .filter((clause): clause is string => clause !== null);

  const bodyLines = [...countedClauses, ...inferredClauses];

  // No area cleared the coverage bar, no direction was "high"/"low", and no
  // inferred observation survived: there is nothing to draft. See
  // ClassTrendsDraftResult's "empty" variant doc comment for why this is a
  // distinct status rather than a markdown string with an empty-sounding
  // closer next to a Copy button.
  if (bodyLines.length === 0) {
    return { status: "empty" };
  }

  const closing = "Thanks for your continued effort on this.";
  const markdown = [opening, ...bodyLines, closing].join("\n\n");

  // Last-resort defense in depth against a future template edit that
  // introduces a forbidden phrase in connective tissue - assignmentName and
  // displayArea are both already checked before this point, so this should
  // not fire in ordinary operation.
  if (containsForbiddenCompletenessPhrase(markdown)) {
    return {
      status: "rejected",
      reason: "This draft could not be prepared automatically - something in the trends above contains wording this feature won't repeat to students. Write the message yourself using the trends above.",
    };
  }

  return { status: "ok", markdown };
}
