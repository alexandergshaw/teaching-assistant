// Pure parser for COURSE_BUILD's "modules" run-form input: a forgiving
// module-selection syntax (individual numbers, comma-separated lists, and
// ranges) that narrows PER-MODULE generation to one, several, or all of a
// course's schedule.
//
// Deliberately pure - no I/O, no Date.now(), no randomness, no workflow
// engine, no course tile - so the step that actually applies this
// (steps.course-build-scope.ts's "select-course-modules") stays a thin
// wrapper, and this file's own tests can exercise every edge case (blank,
// single, list, range, overlap, whitespace, out-of-range, non-numeric)
// without any of that machinery. See course-setup.ts's COURSE_BUILD for how
// the two functions below are wired into the preset.

export interface ParsedModuleSelection {
  // Sorted, de-duplicated module (week) numbers the spec named. Empty when
  // the spec was blank or contained no tokens - callers treat that as "no
  // narrowing" (every module), per the run form's own "blank means ALL"
  // contract; this function itself makes no such decision, it only reports
  // what was actually named.
  numbers: number[];
}

/**
 * Parse a forgiving module-selection spec: blank, a single number ("3"), a
 * comma-separated list ("1,3,5"), a range ("2-4"), or any mix ("1,3-5,8").
 * Whitespace around commas/numbers/dashes is ignored, and overlapping/
 * duplicate numbers collapse into one. Throws - never silently drops or
 * clamps - on a token that is not a positive integer or a well-formed
 * ascending range: a malformed selection generating the WRONG modules is a
 * worse failure mode than an outright, specific error.
 */
export function parseModuleSelection(spec: string): ParsedModuleSelection {
  const trimmed = spec.trim();
  if (!trimmed) return { numbers: [] };

  const tokens = trimmed
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return { numbers: [] };

  const numbers = new Set<number>();

  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end < 1) {
        throw new Error(`Invalid module range "${token}": module numbers start at 1.`);
      }
      if (start > end) {
        throw new Error(`Invalid module range "${token}": ${start} comes after ${end}.`);
      }
      for (let n = start; n <= end; n++) numbers.add(n);
      continue;
    }

    if (!/^\d+$/.test(token)) {
      throw new Error(`"${token}" is not a valid module number or range (expected e.g. "3" or "2-4").`);
    }
    const n = Number(token);
    if (n < 1) {
      throw new Error(`Invalid module number "${token}": module numbers start at 1.`);
    }
    numbers.add(n);
  }

  return { numbers: [...numbers].sort((a, b) => a - b) };
}

/**
 * Narrow `schedule` (any per-module list carrying a `week` number - a plain
 * ScheduleWeekPlan[] in production) to the weeks `selection` named, validated
 * against the schedule actually produced. An empty `selection.numbers`
 * (blank spec) returns `schedule` UNCHANGED - "blank means ALL". A selection
 * naming a module number absent from the schedule THROWS, naming every
 * missing module and the schedule's real range - selecting a module that
 * does not exist is an error, not an empty success.
 */
export function narrowScheduleToSelection<T extends { week: number }>(
  schedule: T[],
  selection: ParsedModuleSelection
): T[] {
  if (selection.numbers.length === 0) return schedule;

  const validWeeks = new Set(schedule.map((w) => w.week));
  const missing = selection.numbers.filter((n) => !validWeeks.has(n));
  if (missing.length > 0) {
    const available = schedule.map((w) => w.week).sort((a, b) => a - b);
    throw new Error(
      `Module${missing.length === 1 ? "" : "s"} ${missing.join(", ")} ${
        missing.length === 1 ? "does" : "do"
      } not exist in this course's schedule (available module${available.length === 1 ? "" : "s"}: ${
        available.length > 0 ? available.join(", ") : "none"
      }).`
    );
  }

  const selected = new Set(selection.numbers);
  return schedule.filter((w) => selected.has(w.week));
}
