/**
 * Rubric construction for the APPLIED (no-code) course path of the Embedded
 * Deterministic Engine - split out of rubric.ts, which retains the CODING
 * path plus generateEmbeddedRubricText and buildRubricFromInstructions as
 * the single public entry point; that entry point delegates to this module
 * when kind === "applied". See rubric.ts's own header for the overall
 * precedence rule (supplied rubric vs. generated) this module is a branch of.
 */

import type { CheckType, RubricCheck } from "./types";
import { dedupe, nextId } from "./rubric";

/**
 * Y1-AC4: an applied-course rubric may hold one more criterion than the
 * coding grader's cap - the assignment's own Requirements and Deliverables
 * sections routinely yield 4-5 genuinely distinct qualities (dependency
 * logic, arithmetic, the critical path itself, convergence, applied-to-own-
 * project), and forcing that down to 4 would mean dropping one for no reason
 * other than matching a cap that exists for a different generator. Never
 * used for the coding path or for real grading (buildEmbeddedRubric) - both
 * keep MAX_CRITERIA unchanged.
 */
export const MAX_CRITERIA_APPLIED = 5;

// ── Applied (no-code) course criteria - Y1 ──────────────────────────────────
//
// The OFFLINE CODING grader (extractCodeSymbolChecks, extractKeywordChecks,
// in rubric.ts) extracts arbitrary identifiers and single words from free
// text and asks whether they are "defined"/"mentioned" - correct for a
// coding assignment, where "define a function named X" is a real
// requirement. Run on an APPLIED (no-code) course's assignment text it
// produced literal nonsense that shipped on all 16 assignments of a real
// course: "Defines to (25%): Define to in your code.", "Mentions Google
// (25%)" (graded on the word "Google").
//
// This section is a wholly separate generation path for the applied case: it
// never calls extractCodeSymbolChecks or extractKeywordChecks at all, so the
// coding path (all five call sites of generateEmbeddedRubricText) is provably
// unaffected - see buildRubricFromInstructions's `kind` branch in rubric.ts,
// whose "coding" arm is byte-for-byte the pre-existing code.

/**
 * Y1-AC3: a rubric criterion whose entire subject reduces to a stopword or a
 * bare common word ("to", "each", "them", "but", "four", "where") is not a
 * criterion - it is grammatical scaffolding a naive word-extractor mistook
 * for content. This is checked mechanically over generated output (not just
 * documented as a rule), and used to filter every candidate criterion below
 * before it can become one.
 */
const DEGENERATE_SUBJECT_WORDS = new Set([
  // pronouns
  "it", "its", "this", "that", "these", "those", "them", "he", "she", "they", "we", "you", "i",
  // conjunctions / prepositions
  "but", "and", "or", "nor", "for", "so", "yet", "to", "of", "in", "on", "at", "by",
  "with", "from", "into", "as", "than", "then",
  // articles
  "a", "an", "the",
  // number words
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  // other bare common words seen in the actual defect
  "each", "every", "where", "when", "also", "very", "just", "only", "not", "is", "are", "be",
]);

export function isDegenerateCriterion(subject: string): boolean {
  const words = subject
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  // Degenerate when every word in the subject is a stopword/bare common
  // word - i.e. there is no substantive word anywhere in it. A single real
  // word ("Analysis") is fine; a single bare word ("to") is not.
  return words.every((w) => DEGENERATE_SUBJECT_WORDS.has(w));
}

/**
 * Y1-AC2: the hard invariant, checked over generated text rather than only
 * asked for in a prompt - a prompt-level instruction has repeatedly proven
 * insufficient in this codebase (see enforceNoCodeForApplied in
 * slide-prompt.ts, added for the exact same reason on the slide-deck path).
 */
const FORBIDDEN_CODE_PATTERNS: RegExp[] = [/\bcode\b/i, /in your code/i, /the submitted code/i];

function containsForbiddenCodeLanguage(text: string): boolean {
  return FORBIDDEN_CODE_PATTERNS.some((re) => re.test(text));
}

/**
 * Throws if `text` mentions "code" in any of the ways this defect actually
 * shipped ("in your code", "the submitted code", or the bare word "code").
 * Candidate criteria are already filtered to exclude this (see
 * extractDeliverableQualityChecks) - reaching this function with a violation
 * means that filtering has a bug, not that the model misbehaved, so this
 * fails loudly rather than silently shipping the defect again.
 */
export function assertNoCodeLanguage(text: string): void {
  if (containsForbiddenCodeLanguage(text)) {
    throw new Error(
      'A rubric generated for an applied (no-code) course must never mention "code" - this is a hard invariant (Y1-AC2), not a prompt-level rule. Generated text: ' +
        text.slice(0, 200)
    );
  }
}

/** Parse "## Heading" markdown sections into a heading(lowercased) -> body map. */
function parseMarkdownSections(text: string): Map<string, string> {
  const sections = new Map<string, string>();
  let currentHeading: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (currentHeading !== null) sections.set(currentHeading, buffer.join("\n"));
  };
  for (const line of text.split(/\r?\n/)) {
    const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      currentHeading = heading[1].trim().toLowerCase();
      buffer = [];
    } else if (currentHeading !== null) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

/** The body of the first section whose heading matches `pattern`, or "". */
function findSectionBody(sections: Map<string, string>, pattern: RegExp): string {
  for (const [heading, body] of sections) {
    if (pattern.test(heading)) return body;
  }
  return "";
}

/** Lines starting with "- " (the bullet convention this app's own generated
 *  assignment documents use for Requirements/Deliverables/Instructions). */
function extractBullets(sectionText: string): string[] {
  const bullets: string[] = [];
  for (const raw of sectionText.split(/\r?\n/)) {
    const match = /^-\s+(.+)$/.exec(raw.trim());
    if (match) bullets.push(match[1].trim());
  }
  return bullets;
}

/** A compact heading for a criterion: the bullet's first clause (up to a
 *  comma/semicolon), capped to 8 words. The full bullet is never lost - it is
 *  quoted in full in the requirement phrase immediately after this label. */
function shortLabel(bullet: string): string {
  const firstClause = bullet.split(/[,;]/)[0].trim();
  const words = firstClause.split(/\s+/).filter(Boolean);
  const short = words.length > 8 ? `${words.slice(0, 8).join(" ")}...` : firstClause;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/**
 * Integer weights summing to exactly 100, strictly decreasing so earlier
 * criteria (Requirements - the core, objectively gradable qualities of the
 * work) outweigh later ones (Deliverables - format/completeness/application
 * to the student's own project). Y1-AC4: this replaces the flat equal split
 * ("four criteria at 25% including one for the word 'to' is not a weighting
 * scheme") with weights that actually reflect importance.
 */
function importanceWeights(count: number): number[] {
  if (count <= 0) return [];
  const shares = Array.from({ length: count }, (_, i) => count - i + 1);
  const shareTotal = shares.reduce((a, b) => a + b, 0);
  const weights = shares.map((s) => Math.round((s / shareTotal) * 100));
  const drift = 100 - weights.reduce((a, b) => a + b, 0);
  weights[weights.length - 1] += drift;
  return weights;
}

/**
 * Y1-AC1: build rubric criteria that describe a QUALITY OF THE DELIVERABLE,
 * not the presence of a word - read straight from the assignment's own
 * "Requirements" and "Deliverables" sections, which
 * generateAssignmentInstructionsForAssignment (src/app/actions/shared.ts)
 * already writes as well-formed, concrete statements of what the work must
 * do. Requirements bullets (the core correctness of the work) fill slots
 * first; at most one Deliverables bullet (format/submission completeness,
 * "applied to your own project") takes the last slot. No model call - purely
 * rule-based, matching this file's existing deterministic-generation
 * philosophy.
 */
export function extractDeliverableQualityChecks(text: string): RubricCheck[] {
  const sections = parseMarkdownSections(text);
  const clean = (bullets: string[]): string[] =>
    dedupe(
      bullets
        .map((b) => b.replace(/[.:;]+$/g, "").trim())
        .filter((b) => b.length > 0 && !isDegenerateCriterion(b) && !containsForbiddenCodeLanguage(b)),
      (b) => b.toLowerCase()
    );

  const reqBullets = clean(extractBullets(findSectionBody(sections, /requirement/i)));
  const delBullets = clean(extractBullets(findSectionBody(sections, /deliverable/i)));

  const reqSlots = delBullets.length > 0 ? MAX_CRITERIA_APPLIED - 1 : MAX_CRITERIA_APPLIED;
  const chosenReq = reqBullets.slice(0, Math.max(0, reqSlots));
  const chosenDel = delBullets.slice(0, Math.max(0, MAX_CRITERIA_APPLIED - chosenReq.length));
  const chosen = [...chosenReq, ...chosenDel];

  const weights = importanceWeights(chosen.length);
  return chosen.map((bullet, i) => ({
    id: nextId("dq"),
    criterion: shortLabel(bullet),
    checkType: "deliverable_quality" as CheckType,
    target: bullet,
    points: weights[i],
  }));
}

/**
 * Y1-AC4: percentages proportional to each check's own `points` (set
 * non-flat by importanceWeights for applied criteria), rounded with any
 * drift corrected on the last check so they always sum to exactly 100 -
 * "four criteria at a flat 25% including one for the word 'to' is not a
 * weighting scheme."
 */
export function weightedPercentages(checks: RubricCheck[]): number[] {
  const total = checks.reduce((sum, c) => sum + c.points, 0) || checks.length;
  const raw = checks.map((c) => Math.round((c.points / total) * 100));
  const drift = 100 - raw.reduce((a, b) => a + b, 0);
  if (raw.length > 0) raw[raw.length - 1] += drift;
  return raw;
}
