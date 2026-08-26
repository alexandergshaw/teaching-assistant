// Repo Grades view - U12 (docs/repo-grades-ux-overhaul-acceptance-criteria.md,
// items 48-52). The instructor's report, verbatim: "the grader applied
// inconsistent totals to each of the assignments. i don't need totals. i need
// percentages with clearly viewable and copyable comments."
//
// The LIKELY cause (src/app/actions/github-repos.ts:680) is that a blank
// rubric field makes `generateRubric` run once PER repo, fed that repo's own
// content, so every student is graded against a rubric that invents its own
// point total. That is the cause whenever the rubric field was left blank;
// an instructor who supplied an explicit rubric can still see differing
// totals across separately-graded folders (each folder's own explicit
// rubric can legitimately use a different point total), so this module must
// not assert the generated-per-repo cause as fact - only name it as the
// thing to check. This module does not fix the generated-rubric case
// (tracked separately as U12.50 - it changes gradeRepoAction, which is out
// of scope for a display module).
// It fixes the half Section 1 puts in scope: a percentage is comparable
// across repos and across runs no matter what denominator a generated rubric
// happened to pick.
//
// Pure, no I/O, no React - every decision pinned by
// repoGradeScoreDisplay.test.ts, which is this module's actual specification.
//
// `totalScore` (src/lib/grade/types.ts:29) is a STRING shaped
// "earned/possible" (e.g. "18/20"), never a number - so every function here
// takes that raw string and either parses it or passes it through unchanged.
// Losing a score the instructor can see, because this module could not parse
// it, is worse than showing the raw string - so every formatter here falls
// back to the original text on a parse failure rather than blanking it.

/** One score parsed into its earned/possible pair. */
export interface ScoreFraction {
  earned: number;
  possible: number;
}

// Matches "earned/possible" with optional surrounding whitespace and optional
// whitespace around the slash - e.g. "40/40", "81.25/100", "  35 / 40 ".
// Deliberately anchored (^...$) against the TRIMMED string so a value with
// trailing garbage after a valid-looking fraction (e.g. "40/40 something")
// does not silently parse as "40/40".
const SCORE_FRACTION_PATTERN = /^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/;

/**
 * Reads a `totalScore`-shaped string into its earned/possible numbers, or
 * null when it cannot be read cleanly. A zero denominator returns null too
 * (nothing may ever divide by it) rather than an earned/0 pair that would
 * later produce Infinity or NaN in scorePercentValue.
 */
export function parseScoreFraction(raw: string): ScoreFraction | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(SCORE_FRACTION_PATTERN);
  if (!match) return null;
  const earned = Number(match[1]);
  const possible = Number(match[2]);
  if (!Number.isFinite(earned) || !Number.isFinite(possible) || possible === 0) return null;
  return { earned, possible };
}

/**
 * The number the instructor actually wants: `earned / possible * 100`,
 * normalizing away whatever denominator a generated rubric happened to
 * invent. Null when the score cannot be read - callers decide what to show
 * in that case (formatScorePercent below shows the raw text unchanged).
 */
export function scorePercentValue(raw: string): number | null {
  const fraction = parseScoreFraction(raw);
  if (!fraction) return null;
  return (fraction.earned / fraction.possible) * 100;
}

/** Strips trailing zeros from a fixed-precision decimal string without
 * touching significant digits - "87.50" -> "87.5", "100.00" -> "100",
 * "81.25" unchanged. Never touches the integer part. */
function trimTrailingZeros(fixed: string): string {
  return fixed.replace(/\.?0+$/, "");
}

/**
 * What a cell/log/summary actually shows (U12.48): a percentage, rounded to
 * at most two decimal places with no trailing zeros, and NEVER the
 * denominator - that is the whole point of the change. A score this module
 * cannot parse passes through completely unchanged (including "" for an
 * untouched cell) rather than being blanked, matching this module's header
 * note: losing a visible score to a parser failure is worse than showing the
 * raw string.
 */
export function formatScorePercent(raw: string): string {
  const percent = scorePercentValue(raw);
  if (percent === null) return raw;
  return `${trimTrailingZeros(percent.toFixed(2))}%`;
}

/** What summarizeScoreSpread reports about one run/log's worth of scores. */
export interface ScoreSpreadSummary {
  /** How many distinct denominators appeared among the readable scores.
   * Unreadable/blank scores are ignored entirely - they are not "a scale". */
  distinctDenominators: number;
  /** True once more than one distinct denominator appeared - i.e. these
   * scores did not all come from rubrics sharing one point total. */
  inconsistentScales: boolean;
  /** A sentence naming the cause, in words the instructor can act on -
   * "" when the scales agreed (nothing to explain) or there was nothing to
   * measure. */
  detail: string;
}

/**
 * U12.49: surfaces what the instructor previously had to export a log and
 * read by eye to notice - that a set of scores were graded against
 * differently-scaled rubrics. Ignores anything parseScoreFraction cannot
 * read (a bare "pass", an empty cell) rather than counting it as its own
 * scale, so a handful of ungraded cells sitting alongside a consistent run
 * cannot manufacture a false positive.
 *
 * Regression note: this function only compares the scores it is HANDED - it
 * does not know which folder or run each one came from. A caller that feeds
 * it every "grade-succeeded" score in a whole course log will flag any course
 * that has graded two different assignments, since different assignments
 * legitimately carry different point totals. Callers must scope the input to
 * scores that are actually meant to be comparable - e.g. one folder's worth
 * - rather than the whole log. See RepoGradesLogPanel.tsx's per-folder
 * grouping.
 */
export function summarizeScoreSpread(scores: readonly string[]): ScoreSpreadSummary {
  const denominators = new Set<number>();
  for (const raw of scores) {
    const fraction = parseScoreFraction(raw);
    if (fraction) denominators.add(fraction.possible);
  }
  const distinctDenominators = denominators.size;
  const inconsistentScales = distinctDenominators > 1;
  const detail = inconsistentScales
    ? `These scores came from ${distinctDenominators} different point totals. The likely cause: the rubric field was left blank, so a rubric was generated per repo from that repo's own content instead of one shared rubric - check the rubric field for this folder. Percentages are shown instead of totals so they stay comparable.`
    : "";
  return { distinctDenominators, inconsistentScales, detail };
}
