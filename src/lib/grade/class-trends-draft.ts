import { containsForbiddenCompletenessPhrase, isSubsetTrend } from "./class-trends";
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
  | { status: "rejected"; reason: string };

/** A clause may only characterise an area when EVERY graded result in the
 * run carried that area - i.e. `resultsWithArea === report.totalResults`,
 * not merely `>=` some lesser bound. Reasoning: the draft's one and only
 * stated denominator is the unconditional opening line's
 * `report.totalResults` ("based on the N submissions graded so far"). If a
 * clause could render for an area covered by fewer results than that, the
 * draft would state a set larger than the set the clause is actually
 * backed by.
 *
 * THE CONDITION THIS WARNED ABOUT HAS ARRIVED - re-measured 2026-09-20.
 * This paragraph used to say the hazard was absent "only by the config
 * accident that GRADE_MAX_SUBMISSIONS and the floor are both 5
 * (gemini.ts:25)", and framed the divergence as hypothetical: "Raise
 * GRADE_MAX_SUBMISSIONS and a draft reading 'based on the 30 submissions
 * graded so far' could carry a clause backed by only 5 of those 30."
 * It was raised. The cap is now DEFAULT_MAX_SUBMISSIONS = 40 at
 * gemini.ts:32 - wrong in this comment on both the value and the line -
 * and there is no longer a class-trends-draft floor to compare it against at
 * all (DEFAULT_CLASS_TRENDS_DRAFT_FLOOR removed per backlog N13a, owner
 * decision: straight removal, no replacement bound). A floor comparison and
 * the strict rule below would have given DIFFERENT answers on an ordinary
 * run while both existed; that is now moot, but the underlying reason for
 * `===` is not - it never depended on the floor.
 *
 * The code was already right: `===` never depended on the accident. What
 * changed is that the instruction below stopped being defensive and became
 * load-bearing, at the moment its own justification started reading as a
 * hypothetical. That is why the facts are corrected here rather than left.
 *
 * Tying every rendered clause's basis to the SAME field the opening line
 * states closes the gap regardless of the cap's value. DO NOT "simplify"
 * this back to a `>=` comparison against some other bound - the opening
 * line's denominator is `report.totalResults`, and any weaker comparison
 * reopens the gap this rule closes. */
function areaFullyCovered(area: AreaTrend, report: Omit<ClassTrendsReport, "instructorAttribution">): boolean {
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

/** N13b Wave 2 (AC-6/AC-7): the ONLY function in this module allowed to turn
 * an AreaTrend's `missedSubset` into draft text - and, structurally, the only
 * one that can: `missedSubset` carries no student identity at all (numbers
 * only), so there is no name for this function to read even if it tried.
 * States its OWN denominator (`missedSubset.denominator`), never
 * `report.totalResults` - the two can legitimately differ (AC-7), and
 * restating the wrong one would pair a student-basis numerator with a
 * submission-basis denominator. Deliberately NOT filtered through
 * `areaFullyCovered` (the opposite gate from the high/low clauses above,
 * AC-6): a subset can be real and worth surfacing even when fewer than every
 * graded result carries the area. */
function renderSubsetClause(area: AreaTrend): string | null {
  if (!isSubsetTrend(area) || area.missedSubset === null) {
    return null;
  }
  const { studentCount, denominator } = area.missedSubset;
  return `Worth a closer look: ${area.displayArea} - ${studentCount} of ${denominator} students missed points on this area.`;
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

/** N13b Wave 1 (security R5): true if `text` contains any of `identifiers`
 * as a case-insensitive SUBSTRING - never field equality (a name is free
 * text embedded in a larger string, not a whole field on its own), and
 * never for a blank/whitespace-only identifier (which would match every
 * string and silently reject every clean draft). Both sides are lowercased
 * so a model re-casing an echoed identifier still gets caught. */
function carriesKnownIdentifier(text: string, identifiers: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return identifiers.some((identifier) => {
    const trimmed = identifier.trim().toLowerCase();
    return trimmed.length > 0 && lower.includes(trimmed);
  });
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

/** N13b Wave 2 (ORCHESTRATOR RULING 2026-09-29, promoting R-T2/AC-8 part (b)
 * into a requirement): `composeClassTrendsDraft`'s first parameter is
 * `ClassTrendsReport` with `instructorAttribution` OMITTED, so a read of that
 * field anywhere in this module - the class-addressed render domain - is a
 * COMPILE ERROR, not merely a discipline this module happens to follow. The
 * subset clause this module renders is computed from `AreaTrend.missedSubset`
 * (numbers only, see `renderSubsetClause`), so nothing this module needs ever
 * lived on the omitted field. The sole non-test caller
 * (ClassTrendsDraftPanel.tsx) passes a full `ClassTrendsReport`, which is
 * assignable to this narrower view by structural subtyping - no caller change
 * required. */
export function composeClassTrendsDraft(
  report: Omit<ClassTrendsReport, "instructorAttribution">,
  observations: readonly ClassTrendsInsightObservation[],
  assignmentName: string
): ClassTrendsDraftResult {
  // N13b Wave 1 (security R5): the run's own identifier strings
  // (report.student values, plus any gradedRepo owner segment), scanned
  // against - never interpolated into - this draft's free text. Read
  // defensively (`?? []`) so a persisted/older report missing the field at
  // runtime fails safe (scans against an empty set) rather than throwing.
  const knownIdentifiers = report.knownIdentifiers ?? [];

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

  // The opening line is UNCONDITIONAL (it is always the first line of an
  // "ok" draft), so a name reaching it cannot be dropped the way a body
  // clause can - the whole draft is rejected instead.
  if (carriesKnownIdentifier(assignmentName, knownIdentifiers)) {
    return {
      status: "rejected",
      reason: `The assignment name appears to contain a name from this run. Rename the assignment, or write the message yourself using the trends above.`,
    };
  }

  // The coverage-disclosure sentence is UNCONDITIONAL - the one and only
  // place report.totalResults is interpolated into this draft.
  const opening = `A note on ${assignmentName || "this assignment"}, based on the ${report.totalResults} submissions graded so far:`;

  // displayArea is ALSO model-authored (rubric area names come from the
  // instructor's own rubric text) and ALSO unfiltered by layer A. A rubric
  // area named e.g. "Understanding of the class material" must not take
  // down the whole draft - it is dropped, the same "omit rather than fail"
  // shape used for direction filtering, not escalated to a rejection.
  const countedClauses = report.areas
    .filter((area: AreaTrend) => areaFullyCovered(area, report))
    .map(renderCountedClause)
    .filter(
      (clause): clause is string =>
        clause !== null &&
        !containsForbiddenCompletenessPhrase(clause) &&
        !carriesKnownIdentifier(clause, knownIdentifiers)
    );

  // N13b Wave 2 (AC-6): deliberately NOT filtered through areaFullyCovered -
  // the subset can be real and worth surfacing even under partial coverage.
  // Passed through the SAME phrase/identifier filters as every other clause,
  // even though renderSubsetClause never reads a name - defense in depth, and
  // consistent treatment for every clause this module emits.
  const subsetClauses = report.areas
    .filter((area: AreaTrend) => isSubsetTrend(area))
    .map(renderSubsetClause)
    .filter(
      (clause): clause is string =>
        clause !== null &&
        !containsForbiddenCompletenessPhrase(clause) &&
        !carriesKnownIdentifier(clause, knownIdentifiers)
    );

  const inferredClauses = observations
    .map(renderInferredClause)
    .filter((clause): clause is string => clause !== null && !carriesKnownIdentifier(clause, knownIdentifiers));

  const bodyLines = [...countedClauses, ...subsetClauses, ...inferredClauses];

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

  // Last-resort defense in depth against a future clause that reaches the
  // markdown without going through the per-clause filters above - the whole
  // assembled draft is scanned one final time against the run's own
  // identifiers before it is ever returned as "ok".
  if (carriesKnownIdentifier(markdown, knownIdentifiers)) {
    return {
      status: "rejected",
      reason: "This draft could not be prepared automatically - something in the trends above appears to name someone from this run. Write the message yourself using the trends above.",
    };
  }

  return { status: "ok", markdown };
}
