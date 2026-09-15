import { normalizeAreaName } from "./prompts";
import type { GradingRunEntry } from "./types";

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
}

export interface ClassTrendsReport {
  /** The graded results this report covers - stated once, reused by every
   * area's coverage denominator. */
  totalResults: number;
  areas: AreaTrend[];
  /** Areas whose graded results scored consistently high - first-class,
   * not an afterthought (requirement 5). Same AreaTrend shape as struggles. */
  strengths: AreaTrend[];
  /** Areas whose graded results scored consistently low. */
  struggles: AreaTrend[];
  /** One line per area, ready to display or log; each already carries its
   * own coverage qualification. */
  summaryLines: string[];
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

  const unscoredText =
    trend.unscoredCount > 0
      ? ` ${trend.unscoredCount} of those had an unscored (unparseable) score.`
      : "";

  return `Across the ${trend.totalResults} submissions graded so far, ${coverage}; ${directionText}.${unscoredText}`;
}

interface AreaAccumulator {
  displayArea: string;
  rawScores: string[];
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
export function computeClassTrends(entry: GradingRunEntry): ClassTrendsReport {
  const results = entry.run.results;
  const totalResults = results.length;

  const areaMap = new Map<string, AreaAccumulator>();

  for (const result of results) {
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
        };
        areaMap.set(normalized, accumulator);
      }
      accumulator.rawScores.push(rubricArea.score);
    }
  }

  const areas: AreaTrend[] = [];
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
    };

    areas.push({ ...withoutSummary, summary: buildAreaSummary(withoutSummary) });
  }

  // Deterministic, input-order-independent display order.
  areas.sort((a, b) => a.displayArea.localeCompare(b.displayArea));

  return {
    totalResults,
    areas,
    strengths: areas.filter((trend) => trend.direction === "high"),
    struggles: areas.filter((trend) => trend.direction === "low"),
    summaryLines: areas.map((trend) => trend.summary),
  };
}
