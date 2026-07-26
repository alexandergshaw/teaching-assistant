/**
 * Pure derivation of test-week numbers for a course. Course.tests is only a
 * COUNT (settled by the user - no per-test date is stored anywhere), so
 * whichever weeks the tests fall on must be derived fresh, every time, from
 * `weeks` and `tests` alone.
 *
 * Spacing follows the same per-position formula scaffoldCourseSchedule
 * (src/lib/embedded/schedule.ts) already uses to place its "Test N" rows
 * (`Math.round((t * weeks) / tests)` for t = 1..tests, clamped to 1..weeks) -
 * that formula is embedded directly in scaffoldCourseSchedule's row/prose
 * generation loop rather than exposed as a reusable, dateless week-number
 * function, so this module reimplements it standalone rather than diverging
 * from the existing convention. No Date-of-now, no randomness.
 */

/** Week numbers (1-based) on which tests fall, spaced evenly across a term
 * of `weeks` weeks. Returns [] when either input is missing, non-positive,
 * or non-finite. */
export function deriveTestWeeks(weeks: number, tests: number): number[] {
  if (!Number.isFinite(weeks) || !Number.isFinite(tests)) return [];
  if (weeks <= 0 || tests <= 0) return [];

  const totalWeeks = Math.floor(weeks);
  const totalTests = Math.floor(tests);
  if (totalWeeks <= 0 || totalTests <= 0) return [];

  // At least one test per week: every week has a test, never a week outside
  // the term and never a duplicate.
  if (totalTests >= totalWeeks) {
    return Array.from({ length: totalWeeks }, (_, i) => i + 1);
  }

  const result: number[] = [];
  for (let i = 0; i < totalTests; i += 1) {
    const pos = Math.round(((i + 1) * totalWeeks) / totalTests);
    const clamped = Math.min(totalWeeks, Math.max(1, pos));
    // The formula is non-decreasing in i, so a shared rounded position can
    // only ever repeat the immediately preceding value - comparing against
    // the last pushed entry is sufficient to de-duplicate while preserving
    // order (and keeping the result strictly increasing).
    if (result[result.length - 1] !== clamped) {
      result.push(clamped);
    }
  }
  return result;
}
