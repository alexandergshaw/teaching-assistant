import { containsForbiddenCompletenessPhrase } from "./class-trends";
import type { GradeResult, GradingRunEntry } from "./types";

/**
 * Layer B of backlog N9/N10 (see the architect pass, revision 1, plus
 * revision 4's copy rule which binds this layer too): a model-inferred read
 * of the same graded run layer A (./class-trends.ts) already reports on,
 * surfacing CONCEPT-level insight the rubric's own area names cannot
 * express - "several submissions conflated correlation with causation" is
 * not a fact any RubricAreaResult.area string carries, but it can be a real
 * pattern in the submissions' prose.
 *
 * This file holds only the PURE parts: the anonymising mapper, the prompt
 * builder, and the response parser. No React, no DOM, no network - so every
 * one of them is directly testable. The model call itself lives in the route
 * (src/app/api/class-trends-insight/route.ts), which is a thin shell around
 * these three functions plus auth and a work budget.
 */

// ---------------------------------------------------------------------------
// Anonymisation (requirement 1).
// ---------------------------------------------------------------------------

/**
 * One submission's material, stripped of anything that identifies the
 * student, and labelled only by its position in the anonymised list.
 *
 * WHY THIS EXISTS AS ITS OWN STEP, SEPARATE FROM THE PROMPT BUILDER: this is
 * the no-names rule enforced at INPUT rather than at output. Checking a
 * model's OUTPUT for a leaked name is a losing game - the model could always
 * echo a name it was never supposed to see, and by the time that string
 * exists the leak has already happened in whatever request log or retry
 * captured it. Never handing the name to the model in the first place is
 * strictly stronger and strictly cheaper: there is no name left to leak.
 * GradeResult.student (types.ts:121) sits on every result this module reads,
 * and this function is the one and only place that field is read from a
 * GradeResult before a prompt is built - every other field this module uses
 * flows through here as a copy, never through the original result.
 */
export interface AnonymizedSubmission {
  /** 1-based position in the anonymised list. Never the student's name,
   * Canvas user id, or any other identifying value - only ever a positional
   * label ("Submission 1", "Submission 2", ...) built from this. */
  slot: number;
  /** Per-area score/comment pairs, with the area's display name but with no
   * reference to who submitted it. */
  areas: { area: string; score: string; comment: string }[];
  /** The free-text overall comment, unmodified except for being copied off
   * of a result that is never itself passed further down this module. */
  overallComment: string;
}

/**
 * Strips every GradeResult in a run down to anonymised, slot-labelled
 * material. This is the ONLY function in this module that ever touches
 * GradeResult.student, and it never copies it anywhere - the returned
 * AnonymizedSubmission has no field capable of carrying a name.
 */
export function anonymizeGradeResults(results: readonly GradeResult[]): AnonymizedSubmission[] {
  return results.map((result, index) => ({
    slot: index + 1,
    areas: result.rubricAreas.map((rubricArea) => ({
      area: rubricArea.area,
      score: rubricArea.score,
      comment: rubricArea.comment,
    })),
    overallComment: result.overallComment,
  }));
}

// ---------------------------------------------------------------------------
// The copy rule (requirement 4). Reused, not re-declared - see
// ./class-trends.ts for why these exact phrases and no others.
// ---------------------------------------------------------------------------

export { containsForbiddenCompletenessPhrase };

// ---------------------------------------------------------------------------
// Prompt construction.
// ---------------------------------------------------------------------------

/**
 * The instruction text sent to the model, ahead of the anonymised
 * submissions. Every rule below exists because a check in this session
 * caught a specific false claim a first draft would otherwise have made:
 *
 * - "the submissions graded so far", never "the class"/"all students"/"every
 *   student"/"the cohort" (requirement 4): this run is not a record of one
 *   class's full roster (class-trends.ts's own header explains why there is
 *   no such denominator anywhere in this system), so a concept observation
 *   can only ever be about the graded results actually in hand.
 * - never state a count ("most", "many", "several submissions") unless that
 *   count is handed to this prompt from layer A's own counted numbers
 *   (requirement 5): this layer reads prose, it does not count, so an
 *   unprompted count in a model's answer is invented.
 * - mark every claim as a READING, not a verified fact (requirement 3): this
 *   is the one property that must survive into the parsed output shape too,
 *   because a caller cannot be trusted to add that qualifier on the model's
 *   behalf every time it renders one.
 */
// WHY THE FORBIDDEN PHRASES ARE NEVER SPELLED OUT VERBATIM HERE: this
// instruction text is itself scanned, by this module's own tests, for the
// phrases it forbids - so quoting them directly (e.g. "never say 'the
// class'") would make the instructions themselves trip the very check they
// exist to satisfy. Named instead by what each one falsely claims
// (completeness of the whole roster, rather than the graded results in
// hand), which a reader - human or model - can follow without the prompt
// ever containing the words it is telling the model not to write.
export const CLASS_TRENDS_INSIGHT_INSTRUCTIONS = `You are reading anonymised grading feedback for one assignment's graded submissions.
Identify CONCEPT-level patterns the rubric's own area names cannot express on their own - for example, several submissions confusing two related ideas, or a specific misconception showing up in the written comments.

Rules, all mandatory:
1. Refer only to "the submissions graded so far". Never claim or imply completeness of the whole roster (do not name the roster as a unit, and do not say every member of it was affected) - you were shown only the submissions graded so far, never a whole class roster.
2. Never invent a count. Do not say "most", "many", or a number of submissions unless a count is explicitly given to you in this prompt. If you cannot back a claim with a given count, phrase it without one (e.g. "a pattern in the submissions graded so far" rather than "most submissions").
3. Every claim you make is a READING of the feedback text, not a verified fact - it can be wrong. Do not phrase anything as a certain, counted, or verified finding.
4. Refer to submissions only by their given slot label ("Submission 1", "Submission 2", ...). You were not given any student's name and must not invent one.
5. Return ONLY a JSON object of the exact shape: {"observations": [{"concept": string, "reading": string}]}. Return an empty "observations" array if you see no clear pattern - do not force one.`;

export interface ClassTrendsInsightPromptInput {
  assignmentName: string;
  submissions: readonly AnonymizedSubmission[];
}

/**
 * Renders one anonymised submission as prompt text. Only ever called on the
 * output of anonymizeGradeResults, never on a raw GradeResult - there is no
 * path from a name into this string.
 */
function renderSubmission(submission: AnonymizedSubmission): string {
  const areaLines = submission.areas
    .map((area) => `  - ${area.area}: ${area.score}${area.comment ? ` (${area.comment})` : ""}`)
    .join("\n");
  return [
    `Submission ${submission.slot}:`,
    areaLines || "  (no rubric areas recorded)",
    submission.overallComment ? `  Overall: ${submission.overallComment}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Builds the full request text for the model: the instructions above, plus
 * the anonymised submissions rendered as slot-labelled blocks. The caller
 * (the route) is the one place that hands in a GradingRunEntry; this
 * function accepts only the already-anonymised list, so it cannot regress
 * into taking a name-bearing GradeResult by accident.
 */
export function buildClassTrendsInsightPrompt(input: ClassTrendsInsightPromptInput): string {
  const submissionsBlock = input.submissions.map(renderSubmission).join("\n\n");
  return [
    CLASS_TRENDS_INSIGHT_INSTRUCTIONS,
    "",
    `Assignment: ${input.assignmentName || "(untitled assignment)"}`,
    "",
    submissionsBlock || "(no submissions graded so far)",
  ].join("\n");
}

/** True when there is nothing worth sending to the model at all - an empty
 * run produces no call (see the test list), and the route checks this before
 * spending any of its work budget. */
export function hasSubmissionsToAnalyze(entry: Pick<GradingRunEntry, "run">): boolean {
  return entry.run.results.length > 0;
}

// ---------------------------------------------------------------------------
// Response shape and parsing (requirement 3, structurally, not by styling).
// ---------------------------------------------------------------------------

/**
 * One concept-level observation. `kind: "inferred"` is not decoration - it is
 * the one field that exists so a consumer CANNOT render this next to a
 * layer-A AreaTrend and have the two look the same. Layer A's numbers are
 * counted; this is a model's reading of prose, and it does not become more
 * certain by looking like a counted fact. There is deliberately no second
 * variant of this type: every ClassTrendsInsightObservation this module ever
 * produces is inferred, so the tag cannot be forgotten by a future producer -
 * there is nothing else to set it to.
 */
export interface ClassTrendsInsightObservation {
  kind: "inferred";
  concept: string;
  reading: string;
}

export type ClassTrendsInsightParseResult =
  | { status: "ok"; observations: ClassTrendsInsightObservation[] }
  | { status: "empty" }
  /** The model's JSON was malformed, or every candidate observation carried
   * a forbidden completeness phrase and none survived. Never thrown - a
   * route catches this status and returns worded JSON, per requirement 2's
   * "a route catches and returns JSON" note about withDeadline. */
  | { status: "rejected"; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Parses the model's raw text response into a list of observations.
 *
 * Never throws: malformed JSON, a missing "observations" array, or a
 * non-string field all fall through to a "rejected" result rather than an
 * exception, because a route calling this must be able to turn any outcome
 * into a JSON response without a try/catch of its own.
 *
 * REQUIREMENT 4 IS ENFORCED HERE, NOT TRUSTED FROM THE MODEL: any candidate
 * observation whose concept or reading text contains a forbidden
 * completeness phrase ("the class", "all students", "every student", "the
 * cohort" - see class-trends.ts) is dropped rather than passed through. The
 * instructions ask the model not to write these; this is the check that
 * matters when it does anyway.
 */
export function parseClassTrendsInsightResponse(rawText: string): ClassTrendsInsightParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { status: "rejected", reason: "The model's response was not valid JSON." };
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.observations)) {
    return { status: "rejected", reason: "The model's response did not carry an observations array." };
  }

  const observations: ClassTrendsInsightObservation[] = [];
  for (const candidate of parsed.observations) {
    if (!isRecord(candidate)) continue;
    const concept = typeof candidate.concept === "string" ? candidate.concept.trim() : "";
    const reading = typeof candidate.reading === "string" ? candidate.reading.trim() : "";
    if (!concept || !reading) continue;
    // Requirement 4: the copy rule binds output as well as the prompt's own
    // instructions. A candidate that generalises beyond the graded set is
    // dropped rather than surfaced with the false authority of having passed
    // review.
    if (containsForbiddenCompletenessPhrase(concept) || containsForbiddenCompletenessPhrase(reading)) {
      continue;
    }
    observations.push({ kind: "inferred", concept, reading });
  }

  if (parsed.observations.length > 0 && observations.length === 0) {
    return {
      status: "rejected",
      reason: "Every observation the model returned generalised beyond the submissions graded so far.",
    };
  }

  return observations.length > 0 ? { status: "ok", observations } : { status: "empty" };
}
