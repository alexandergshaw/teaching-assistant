import { normalizeAreaName } from "./prompts";
import { gradedResults, ungradedResults, type GradedResult, type GradingRunEntry } from "./types";

/**
 * Layer A of backlog N9 (see the architect pass, revision 4): a pure,
 * deterministic read of one already-graded run, so an instructor can see
 * what the submissions they have graded so far had in common per rubric
 * area BEFORE writing anything to the class. No model call, no network, no
 * storage - this module only ever reads the GradingRunEntry it is given.
 *
 * Layer B (model-inferred concept insight) and layer C (a drafted, copyable
 * message) are separate, later items (revision 4, R4.5/R4.6). This file is
 * layer A only, and layer A must stand on its own if B or C need another
 * round.
 */

// WHY: this system does not record "a class's submissions for one
// assignment" as a unit. engine.ts:126 slices to DEFAULT_MAX_SUBMISSIONS (5)
// with no record of what was dropped, Canvas excludes unsubmitted and
// already-graded work before a run ever sees it, and non-submitters land in
// a separate entry. There is no denominator anywhere that means "the class"
// (architect revision 3, disposal D1). Revision 4's fix is to stop claiming
// one: the cohort this module reports on is defined as "the graded results
// in hand" (run.results), and every output string says so explicitly. The
// words below are the ones that would silently promote a partial batch into
// a claim about the whole class, so they are never emitted by this module.
const FORBIDDEN_COMPLETENESS_PHRASES = [
  "the class",
  "all students",
  "every student",
  "the cohort",
] as const;

/** True if `text` contains a phrase that implies completeness this module
 * cannot back up. Used only by this module's own tests to police its own
 * output; kept here so the rule and the check travel together. */
export function containsForbiddenCompletenessPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_COMPLETENESS_PHRASES.some((phrase) => lower.includes(phrase));
}

/**
 * How one rubric area's score string parsed, on the scale of information the
 * string itself carries - never invented.
 *
 * - "percent": the string stated an explicit 0-100 scale itself ("85%", or
 *   "N/M" which is arithmetically a percentage). This is the only kind with
 *   a real denominator, so it is the only kind this module classifies as
 *   high/low against a threshold.
 * - "raw-number": a bare number with no stated denominator ("8", "9.5").
 *   RubricAreaResult.score is documented as "numeric or text score"
 *   (prompts.ts:74) with no fixed scale, so a bare "8" could be out of 10,
 *   out of 100, or anything else. Reported honestly as a number; never
 *   promoted to a percentage by guessing a denominator.
 * - "unscored": anything that is not unambiguously one of the above - blank,
 *   "N/A", "see comments", prose, or a range like "8-10" (a range names two
 *   numbers, not one score, and averaging its endpoints would invent a
 *   value nobody wrote down).
 */
export type ParsedScore =
  | { kind: "percent"; value: number }
  | { kind: "raw-number"; value: number }
  | { kind: "unscored" };

const PERCENT_PATTERN = /^(\d+(?:\.\d+)?)\s*%$/;
const FRACTION_PATTERN = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/;
const BARE_NUMBER_PATTERN = /^(\d+(?:\.\d+)?)$/;

/**
 * Parses one RubricAreaResult.score string. score is a string, not a
 * number (types.ts:33), and this is the one place this module turns it into
 * something arithmetic - everywhere else works from the ParsedScore. A
 * value this cannot place unambiguously on a scale comes back "unscored"
 * rather than being coerced to 0 (which would invent a struggle) or dropped
 * (which would invent agreement) - requirement 4 of this item.
 */
export function parseScoreValue(rawScore: string): ParsedScore {
  const trimmed = rawScore.trim();
  if (trimmed === "") {
    return { kind: "unscored" };
  }

  const percentMatch = trimmed.match(PERCENT_PATTERN);
  if (percentMatch) {
    return { kind: "percent", value: Number(percentMatch[1]) };
  }

  const fractionMatch = trimmed.match(FRACTION_PATTERN);
  if (fractionMatch) {
    const numerator = Number(fractionMatch[1]);
    const denominator = Number(fractionMatch[2]);
    if (denominator > 0) {
      return { kind: "percent", value: (numerator / denominator) * 100 };
    }
    return { kind: "unscored" };
  }

  const bareMatch = trimmed.match(BARE_NUMBER_PATTERN);
  if (bareMatch) {
    return { kind: "raw-number", value: Number(bareMatch[1]) };
  }

  // Blank, "N/A", "see comments", a range like "8-10", or any other prose
  // falls through here. None of those name a single unambiguous score.
  return { kind: "unscored" };
}

// WHY these two numbers: a percent-scale score is the only kind with a real
// denominator (see ParsedScore above), so it is the only kind this module
// will call "consistently high" or "consistently low" against a fixed line.
// The thresholds themselves are a judgment call, not derived from this
// repo's data - recorded here, once, so a reviewer can see and move them
// rather than have them implicit in scattered comparisons.
const HIGH_PERCENT_THRESHOLD = 70;
const LOW_PERCENT_THRESHOLD = 60;

// N13b Wave 2 (option X): the subset-count + instructor-named-list feature.
// Identity per graded result is supplied by the caller through this seam, so
// layer A's counting logic is written once and reused by every surface:
// - "per-result" (the DEFAULT; every Canvas-family surface): one graded
//   result IS one distinct student (the platform invariant AC-1 states). No
//   caller change is required - computeClassTrends(entry) already gets this.
// - "resolved" (repo family, a future roster-identity channel): keyOf maps a
//   result to a roster identity; two results sharing one key collapse to one
//   distinct student.
// - "unavailable" (repo family, today): no reachable identity exists on this
//   surface (see the architect pass, section 5) - the subset is SUPPRESSED
//   (missedSubset stays null, instructorAttribution stays []) rather than
//   silently counting distinct repo labels as distinct students, which would
//   violate AC-1/AC-7. knownIdentifiers (N13b Wave 1) is UNAFFECTED by this
//   value - it is collected from `results` directly, never gated on identity.
export type SubsetIdentity =
  | { kind: "per-result" }
  | {
      kind: "resolved";
      keyOf: (result: GradedResult, index: number) => { key: string; displayName: string } | null;
    }
  | { kind: "unavailable"; reason: string };

/** The absolute distinct-student count (never a fraction of class size) at
 * which an area's subset is flagged for instructor follow-up (AC-2). */
export const SUBSET_MIN_STUDENTS = 3;

export type AreaTrendDirection =
  | "high"
  | "low"
  | "mixed"
  | "no-scale"
  | "insufficient-data";

export interface AreaTrend {
  /** Normalized area key (normalizeAreaName), used for grouping. */
  area: string;
  /** A human-readable label for this area - the first raw area string this
   * module saw for it, before normalization. */
  displayArea: string;
  /** How many of the run's results carried this area at all (requirement 3:
   * per-area coverage, never averaged as though every result carried it). */
  resultsWithArea: number;
  /** Total graded results in the run - the coverage denominator, and the
   * cohort this whole module reports on (revision 4, R4.1). */
  totalResults: number;
  /** Of the results that carried this area, how many had a score this
   * module could parse (percent or raw-number). */
  scoredCount: number;
  /** Of the results that carried this area, how many had an unparseable
   * score (requirement 4) - present, but not counted as agreement OR as a
   * struggle. */
  unscoredCount: number;
  /** Parsed percent-scale values only (see ParsedScore). */
  percentValues: number[];
  /** Parsed raw-number values only - scale unknown, reported as numbers. */
  rawValues: number[];
  averagePercent: number | null;
  averageRaw: number | null;
  direction: AreaTrendDirection;
  /** One sentence, coverage-qualified, with no forbidden completeness
   * phrase and no student name. */
  summary: string;
  /** N13b Wave 2: NUMBERS ONLY - the distinct-student subset that missed any
   * points on this area (AC-1/AC-3/AC-4/AC-5), counted over the SAME
   * identity population as `denominator` (AC-7). `null` when
   * `SubsetIdentity.kind === "unavailable"` (the subset cannot be counted
   * without silently miscounting - see `SubsetIdentity`'s doc comment) - NEVER
   * read by the class-addressed draft composer as a name channel; it carries
   * no student identity at all. */
  missedSubset: { studentCount: number; denominator: number; unknownExcludedCount: number } | null;
}

/** N13b Wave 2: the NAMED per-area list an instructor-only leaf reads.
 * `students` is exactly the set `missedSubset.studentCount` counted for this
 * area (same members, same cardinality - AC-9), never a superset such as the
 * denominator's population. */
export interface AreaAttribution {
  /** Normalized area key, matches AreaTrend.area. */
  area: string;
  displayArea: string;
  students: { displayName: string; deductionLabel: string }[];
}

/** True when an area's distinct-student missed-subset count clears the
 * absolute floor (AC-2) - the ONLY place `>= SUBSET_MIN_STUDENTS` is
 * evaluated, so callers never re-derive the threshold. */
export function isSubsetTrend(area: AreaTrend): boolean {
  return area.missedSubset != null && area.missedSubset.studentCount >= SUBSET_MIN_STUDENTS;
}

export interface ClassTrendsReport {
  /** The graded results this report covers - stated once, reused by every
   * area's coverage denominator. */
  totalResults: number;
  /** N13a section 7: rows this run emitted instead of grading, counted
   * NEVER folded into totalResults or into any area's unscoredCount. This
   * layer only counts; a later, student-facing layer decides whether and
   * how to disclose them. Production rule: the counts of
   * ungradedResults(entry.run.results) by ungraded.kind. */
  ungraded: { notAttempted: number; gradingFailed: number };
  areas: AreaTrend[];
  /** Areas whose graded results scored consistently high - first-class,
   * not an afterthought (requirement 5). Same AreaTrend shape as struggles. */
  strengths: AreaTrend[];
  /** Areas whose graded results scored consistently low. */
  struggles: AreaTrend[];
  /** One line per area, ready to display or log; each already carries its
   * own coverage qualification. */
  summaryLines: string[];
  /** N13b Wave 1 (security R5): the run's OWN identifier strings - every
   * graded result's `.student`, plus the owner/label segment of any
   * `gradedRepo`/`gradedRef` where present. SCAN-ONLY: this array is a
   * denylist for `composeClassTrendsDraft`'s whole-Markdown name filter and
   * must never itself be interpolated into any student-facing or
   * class-addressed output - doing so would make this field a leak channel
   * rather than the guard against one. */
  knownIdentifiers: readonly string[];
  /** N13b Wave 2: the NAMED per-area subset list (AC-9), populated only for
   * areas where `isSubsetTrend` holds and only when the run's identity is not
   * `unavailable`. Read ONLY by the instructor-facing leaf
   * (ClassTrendsStudentListPanel) - the class-addressed draft composer's
   * input type omits this field entirely (see class-trends-draft.ts), so a
   * name read there is a compile error, not merely a discipline. */
  instructorAttribution: AreaAttribution[];
}

/** Extracts the owner/label segment from a "owner/repo" style string (the
 * shape `gradedRepo` is documented to carry - types.ts's `gradedRepo`
 * comment). Returns the whole string when there is no "/" to split on, so a
 * bare label is still collected rather than dropped. */
function ownerSegment(repoLike: string): string {
  const slashIndex = repoLike.indexOf("/");
  return slashIndex === -1 ? repoLike : repoLike.slice(0, slashIndex);
}

/** Collects the run's own identifier strings for the name-filter denylist
 * (N13b Wave 1). Scan-only - see `ClassTrendsReport.knownIdentifiers`. */
function collectKnownIdentifiers(results: readonly GradedResult[]): string[] {
  const identifiers: string[] = [];
  for (const result of results) {
    identifiers.push(result.student);
    if (result.gradedRepo) {
      identifiers.push(ownerSegment(result.gradedRepo));
    }
  }
  return identifiers;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function classifyDirection(percentValues: number[], scoredCount: number): AreaTrendDirection {
  if (scoredCount === 0) {
    return "insufficient-data";
  }
  if (percentValues.length === 0) {
    // Only raw-number (no stated scale) scores were parsed. Requirement 4
    // forbids inventing a denominator to force a high/low call, so this
    // module declines to classify rather than guess one.
    return "no-scale";
  }
  // "Consistently" is read literally: every percent-scale score in this
  // area lands on the same side of the line, not merely the average.
  const allHigh = percentValues.every((value) => value >= HIGH_PERCENT_THRESHOLD);
  if (allHigh) {
    return "high";
  }
  const allLow = percentValues.every((value) => value <= LOW_PERCENT_THRESHOLD);
  if (allLow) {
    return "low";
  }
  return "mixed";
}

function buildAreaSummary(trend: Omit<AreaTrend, "summary">): string {
  const coverage = `${trend.resultsWithArea} of ${trend.totalResults} submissions graded so far covered "${trend.displayArea}"`;

  let directionText: string;
  switch (trend.direction) {
    case "high":
      directionText = `scores were consistently high (all >= ${HIGH_PERCENT_THRESHOLD}%)`;
      break;
    case "low":
      directionText = `scores were consistently low (all <= ${LOW_PERCENT_THRESHOLD}%)`;
      break;
    case "mixed":
      directionText = "scores were mixed";
      break;
    case "no-scale":
      directionText =
        "scores had no stated percentage scale, so no high/low pattern is reported";
      break;
    case "insufficient-data":
    default:
      directionText = "scores could not be parsed, so no pattern is reported";
      break;
  }

  // N13a section 7: with the exclusion above, an ungraded row never
  // contributes a raw score to any area, so unscoredCount here never counts
  // one and "unparseable" stays true of every score it does count. If this
  // module ever starts including ungraded rows in `results`, THIS SENTENCE
  // MUST CHANGE FIRST - it would otherwise describe a not-attempted or
  // grading-failed submission as merely "unparseable".
  const unscoredText =
    trend.unscoredCount > 0
      ? ` ${trend.unscoredCount} of those had an unscored (unparseable) score.`
      : "";

  return `Across the ${trend.totalResults} submissions graded so far, ${coverage}; ${directionText}.${unscoredText}`;
}

interface AreaAccumulator {
  displayArea: string;
  rawScores: string[];
  /** N13b Wave 2: this area's raw score per DISTINCT identity key (see
   * `SubsetIdentity`) - never per result. Two results sharing one key (the
   * `resolved` identity) collapse to one entry here, which is the whole point
   * of the seam: the LAST result processed for a given key "wins" its score
   * for this area, an arbitrary but deterministic tie-break no test depends
   * on (only distinctness of the COUNT is a frozen oracle). Left empty when
   * `identity.kind === "unavailable"` - never populated, never read. */
  subsetByKey: Map<string, { rawScore: string; displayName: string }>;
}

/** N13b Wave 2: resolves one graded result's distinct-student identity for
 * the subset count, per `SubsetIdentity`'s three kinds. Returns null when no
 * identity is available for this result (either the whole run's identity is
 * `unavailable`, or a `resolved` keyOf declined to place this result). */
function identityKeyFor(
  result: GradedResult,
  index: number,
  identity: SubsetIdentity
): { key: string; displayName: string } | null {
  if (identity.kind === "unavailable") {
    return null;
  }
  if (identity.kind === "resolved") {
    return identity.keyOf(result, index);
  }
  // "per-result" (the default): one graded result IS one distinct student
  // (AC-1, the Canvas platform invariant). Keyed by userId when present so a
  // future resolved-identity surface can still be compared 1:1 against this
  // default; falls back to the result's own index, never to `.student` (a
  // free-text label, not a stable identity - INFO-3).
  const key = result.userId != null ? `u:${result.userId}` : `i:${index}`;
  return { key, displayName: result.student };
}

/** N13b Wave 2: describes one distinct student's deduction size for the
 * instructor-facing list (AC-5 - a trivial deduction still counts and reads
 * as trivial, never inflated into a struggle). Never read by the
 * class-addressed draft; this string exists only for the instructor leaf. */
function describeDeduction(percent: number): string {
  const deduction = 100 - percent;
  return deduction <= 5 ? "a trivial deduction" : `${Math.round(deduction)}% off`;
}

/**
 * Computes layer A trends for one graded run: per rubric area (grouped by
 * normalized name - requirement 2), coverage over the graded results in
 * hand (requirement 3), a parsed score breakdown that never coerces or
 * drops the unparseable (requirement 4), and strengths surfaced with the
 * same weight as struggles (requirement 5). Pure: no React, no DOM, no
 * network, no storage, no model call (requirement 8). No floor is applied
 * here (requirement 6) - that belongs to a later, student-facing layer.
 */
export function computeClassTrends(
  entry: GradingRunEntry,
  identity: SubsetIdentity = { kind: "per-result" }
): ClassTrendsReport {
  // N13a section 7 / N13b: this module's cohort is "the graded results in
  // hand", stated in this file's own header above - a not-attempted or
  // grading-failed row is not a graded submission, and counting it here
  // would be a false completeness claim in the exact register
  // FORBIDDEN_COMPLETENESS_PHRASES exists to prevent (class-trends-draft.ts
  // interpolates totalResults into a sentence addressed to students: "based
  // on the N submissions graded so far"). This exclusion is NOT optional:
  // reconciliation in engine.ts only fills every result's rubricAreas when
  // canonical.length > 0; when the rubric parsed no criteria and no result
  // carried a real area, an ungraded row's rubricAreas stays [], so
  // INCLUDING it here would raise totalResults without raising any area's
  // resultsWithArea and silently suppress every counted class-trends clause.
  const results = gradedResults(entry.run.results);
  const totalResults = results.length;
  const ungraded = ungradedResults(entry.run.results);
  const ungradedCounts = {
    notAttempted: ungraded.filter((r) => r.ungraded.kind === "not-attempted").length,
    gradingFailed: ungraded.filter((r) => r.ungraded.kind === "grading-failed").length,
  };

  const areaMap = new Map<string, AreaAccumulator>();

  results.forEach((result, index) => {
    // N13b Wave 2: resolved once per result, never per area - a result's
    // identity does not change across the areas it carries.
    const identityInfo = identityKeyFor(result, index, identity);

    // Dedupe within one result: a single result should never contribute
    // twice to one area's coverage count just because its rubricAreas
    // array happened to list the same area under two spellings that
    // normalize to the same key.
    const seenInThisResult = new Set<string>();
    for (const rubricArea of result.rubricAreas) {
      const normalized = normalizeAreaName(rubricArea.area);
      if (normalized === "" || seenInThisResult.has(normalized)) {
        continue;
      }
      seenInThisResult.add(normalized);

      let accumulator = areaMap.get(normalized);
      if (!accumulator) {
        accumulator = {
          displayArea: rubricArea.area.trim() || normalized,
          rawScores: [],
          subsetByKey: new Map(),
        };
        areaMap.set(normalized, accumulator);
      }
      accumulator.rawScores.push(rubricArea.score);
      if (identityInfo) {
        accumulator.subsetByKey.set(identityInfo.key, {
          rawScore: rubricArea.score,
          displayName: identityInfo.displayName,
        });
      }
    }
  });

  const areas: AreaTrend[] = [];
  // N13b Wave 2: area -> this area's instructor-facing student list, only for
  // areas whose subset clears SUBSET_MIN_STUDENTS (populated below, read back
  // after `areas` is sorted so the two lists agree on order).
  const attributionByArea = new Map<string, { displayName: string; deductionLabel: string }[]>();

  for (const [area, accumulator] of areaMap) {
    const percentValues: number[] = [];
    const rawValues: number[] = [];
    let unscoredCount = 0;

    for (const rawScore of accumulator.rawScores) {
      const parsed = parseScoreValue(rawScore);
      if (parsed.kind === "percent") {
        percentValues.push(parsed.value);
      } else if (parsed.kind === "raw-number") {
        rawValues.push(parsed.value);
      } else {
        unscoredCount += 1;
      }
    }

    const scoredCount = percentValues.length + rawValues.length;
    const direction = classifyDirection(percentValues, scoredCount);

    // N13b Wave 2: the subset count, over the DISTINCT identity population
    // collected above - never over `accumulator.rawScores` (per-result, not
    // per-student). Suppressed entirely under `unavailable` (AC-1/AC-7).
    let missedSubset: AreaTrend["missedSubset"] = null;
    if (identity.kind !== "unavailable") {
      let studentCount = 0;
      let denominator = 0;
      let unknownExcludedCount = 0;
      const missedStudents: { displayName: string; deductionLabel: string }[] = [];

      for (const { rawScore, displayName } of accumulator.subsetByKey.values()) {
        const parsed = parseScoreValue(rawScore);
        if (parsed.kind === "percent") {
          denominator += 1;
          if (parsed.value < 100) {
            studentCount += 1;
            missedStudents.push({ displayName, deductionLabel: describeDeduction(parsed.value) });
          }
        } else {
          // raw-number or unscored: unknown scale, excluded from BOTH terms
          // and disclosed (AC-4) - never counted as not-missed.
          unknownExcludedCount += 1;
        }
      }

      missedSubset = { studentCount, denominator, unknownExcludedCount };
      if (studentCount >= SUBSET_MIN_STUDENTS) {
        attributionByArea.set(
          area,
          missedStudents.slice().sort((a, b) => a.displayName.localeCompare(b.displayName))
        );
      }
    }

    const withoutSummary: Omit<AreaTrend, "summary"> = {
      area,
      displayArea: accumulator.displayArea,
      resultsWithArea: accumulator.rawScores.length,
      totalResults,
      scoredCount,
      unscoredCount,
      percentValues,
      rawValues,
      averagePercent: average(percentValues),
      averageRaw: average(rawValues),
      direction,
      missedSubset,
    };

    areas.push({ ...withoutSummary, summary: buildAreaSummary(withoutSummary) });
  }

  // Deterministic, input-order-independent display order.
  areas.sort((a, b) => a.displayArea.localeCompare(b.displayArea));

  // Built in the SAME sorted order as `areas`, so an instructor reading both
  // lists sees matching order - never a second, independently-ordered pass.
  const instructorAttribution: AreaAttribution[] = areas
    .filter((trend) => attributionByArea.has(trend.area))
    .map((trend) => ({
      area: trend.area,
      displayArea: trend.displayArea,
      students: attributionByArea.get(trend.area)!,
    }));

  return {
    totalResults,
    ungraded: ungradedCounts,
    areas,
    strengths: areas.filter((trend) => trend.direction === "high"),
    struggles: areas.filter((trend) => trend.direction === "low"),
    summaryLines: areas.map((trend) => trend.summary),
    knownIdentifiers: collectKnownIdentifiers(results),
    instructorAttribution,
  };
}
