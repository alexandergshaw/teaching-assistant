// Module-pattern-transpose - the one place a TEMPLATE module item's own due
// date gets turned into a TARGET module's due date, for the "carry this
// module's pattern to other modules" feature
// (docs/carry-module-pattern-forward-acceptance-criteria.md - section 5 is
// the FINAL CONTRACT; D5, D5b and D13 are what this file exists to satisfy).
//
// THIS FILE MUST RUN ONLY IN THE BROWSER, AND THE DANGER IS DECOMPOSITION,
// NOT COMPOSITION (D5). A template item's `dueAt` arrives as a UTC instant
// (an ISO string with a Z offset). Turning that instant back into "which
// weekday, what time of day" requires LOCAL getters (`getDay`, `getHours`,
// `getMinutes`) - the same getters a human reads off their own clock, never
// `getUTCDay(`, `getUTCHours(` or `getUTCMinutes(`. Measured directly against
// the real value `dueDateForWeek` produces for a Thursday 23:59 rule, week 3
// of a term starting 2026-01-12 (America/Chicago, winter, UTC-6): the
// instant is `2026-01-30T05:59:00.000Z`; LOCAL getters read `getDay() === 4`
// (Thursday) and `23:59`; UTC getters on that SAME Date object read
// `getUTCDay() === 5` (Friday) and `05:59`. THE WEEKDAY FLIPS. A server-side
// decomposition of an Americas instructor's "Thursday 11:59 PM" would read it
// as Friday 5:59 AM and recompose every carried item, in every target
// module, onto a Friday morning - entry 328's shipped defect in mirror
// image: that was a UTC COMPOSITION bug (a LOCAL `setHours` result
// re-expressed through `.toISOString()` on a server whose own offset is
// UTC), this would be a UTC DECOMPOSITION bug (an instant read back apart
// with `.getUTCDay(`/`.getUTCHours(` instead of `.getDay(`/`.getHours(`).
// Both are invisible to tsc, eslint, vitest and next build, because every
// intermediate value stays a syntactically valid Date and a syntactically
// valid ISO string throughout. Keeping this computation in a client-only
// leaf, called only from the browser, is the structural guarantee: the
// instant is always decomposed on the same machine that will display it to
// the instructor, so the local-to-UTC offset used to decompose it is always
// that instructor's own. See module-pattern-transpose.test.ts's guard, which
// scans this file's own CODE (comments stripped first) for `.getUTC*(` calls
// and fails loudly if one appears - the same shape entry 330 check 4
// established, with canaries carried in both directions.
//
// DST IS SAFE BECAUSE OF AN ORDERING THIS FILE MUST NOT DISTURB (D5b).
// `dueDateForWeek` (assignment-due-rule.ts:122-143) builds the target instant
// with three `setDate` calls first (:128, :132, :136) and `setHours` LAST
// (:141), so the wall-clock time is stamped AFTER the JS Date engine has
// re-resolved which UTC offset applies on that calendar day. Measured across
// the 2026-03-08 boundary (America/Chicago, term starting 2026-01-12): week
// 8's Thursday-23:59 due date is `2026-03-06T05:59:00.000Z` (CST, UTC-6) and
// week 9's is `2026-03-13T04:59:00.000Z` (CDT, UTC-5) - both read back as
// local `thu 23:59`. The tempting shortcut - adding
// `n * 7 * 24 * 60 * 60 * 1000` milliseconds to a base instant instead of
// calling `dueDateForWeek` again - lands on `Fri 00:59` across that same
// boundary, off by a day AND an hour, because a week is not always exactly
// 604800000ms of wall-clock time once a DST transition sits inside it. This
// file therefore REUSES `dueDateForWeek` for every recomposition rather than
// reimplementing any of its date arithmetic; do not replace it with
// millisecond offsets. See the test file's DST suite, which pins both
// instants above and a second test proving the millisecond shortcut would
// actually differ.
//
// NULL IS THE COMMON CASE, NOT AN ERROR (D13). Most module items are Pages or
// ungraded and carry no `dueAt` at all - blocking those would refuse most of
// a real course. So this module has two inputs and one three-way output: an
// item WITH a `dueAt` is decomposed and recomposed against the target week
// ("transposed-from-item"); an item withOUT one falls back to the course's
// own configured due-date rule for the target week, exactly as chunk B's
// current-events plan already does with no decomposition needed
// ("course-due-rule"); and when neither the item's own date nor the course's
// rule can be resolved against the target week (no course start date, or the
// target module carries no extractable week number), the item still carries
// with no due date at all ("no-due-date"). The three outcomes are a
// discriminated field on the result, never inferred by a caller from
// `dueAtIso === null` alone, because "course-due-rule" also needs to be
// distinguishable from "transposed-from-item" for the plan's own per-item
// reporting.
//
// Pure otherwise: no I/O, no Date.now(), no randomness, no React. Reuses
// `dueDateForWeek`, `parseCourseDate` and `parseAssignmentDueRule` verbatim.
// `targetWeek` arrives PRE-RESOLVED (see `ModulePatternDueDateInput` below) -
// the caller derives it with `extractModuleNumber(targetModule.name)`
// (src/lib/workflows/module-value.ts) before calling in, so this file adds
// no sixth module-number extractor of its own
// (docs/carry-module-pattern-forward-acceptance-criteria.md's D1 already
// counts five and forbids a sixth).

import { parseAssignmentDueRule, dueDateForWeek, WEEKDAYS, type AssignmentDueRule, type Weekday } from "./assignment-due-rule";
import { parseCourseDate } from "./course-calendar-dates";

/** Same default `weekDeadline` already applies for callers passing no rule
 * (assignment-due-rule.ts:8-12) - reused verbatim, matching
 * current-events-assignment-plan.ts's own constant of the same value. */
const DEFAULT_ASSIGNMENT_DUE_RULE: AssignmentDueRule = { day: "sun", time: "23:59" };

/** The three outcomes D13 requires to be distinguishable by the caller - see
 * this file's header. Not a boolean success/failure: "course-due-rule" is a
 * normal, common success, just one that used the course's rule instead of
 * the template item's own date. */
export type ModulePatternDueDateOutcome = "transposed-from-item" | "course-due-rule" | "no-due-date";

export interface ModulePatternDueDateInput {
  /** The TEMPLATE item's own `dueAt`, exactly as Canvas returned it (a UTC
   * ISO instant), or null when the item carries no due date - null is the
   * COMMON case (D13), never treated as an error. */
  sourceDueAtIso: string | null;
  /** RAW "YYYY-MM-DD" course column value - never a Date. Parsed here, not by
   * the caller, matching current-events-assignment-plan.ts's ownership of the
   * one parse-then-compute step end to end. */
  startDate: string | null;
  /** RAW "sun|23:59" course column value - never a parsed AssignmentDueRule. */
  assignmentDueRule: string | null;
  /** `extractModuleNumber(targetModule.name)`, already resolved by the
   * caller - this leaf has no opinion about which field of a module a caller
   * reads the number from, and does not re-derive it. */
  targetWeek: number | null;
}

export interface ModulePatternDueDateResult {
  /** Absolute instant, ISO 8601 with a Z offset. Null iff outcome is
   * "no-due-date". */
  dueAtIso: string | null;
  outcome: ModulePatternDueDateOutcome;
}

/**
 * Decompose a UTC instant into the (weekday, time-of-day) pair
 * `dueDateForWeek` needs to recompose it against a different week - using
 * LOCAL getters, never UTC ones (see this file's header for why). Returns
 * null when `dueAtIso` does not parse to a valid Date - never throws, so a
 * malformed upstream value falls back to the course due-date rule rather
 * than aborting the whole item.
 */
function decomposeLocalDueDate(dueAtIso: string): AssignmentDueRule | null {
  const date = new Date(dueAtIso);
  if (Number.isNaN(date.getTime())) return null;

  const day: Weekday = WEEKDAYS[date.getDay()];
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return { day, time };
}

/**
 * Move one template item's due date onto a TARGET module's week (AC4, D5,
 * D5b, D13).
 *
 * Two inputs, one three-way output, checked in this order:
 *  1. If `startDate` does not parse, or `targetWeek` is null, the target
 *     week has no resolvable Monday to anchor against at all - neither the
 *     item's own date nor the course's rule can be recomposed, so the result
 *     is `{ dueAtIso: null, outcome: "no-due-date" }` regardless of whether
 *     the source item had a due date.
 *  2. Otherwise, if `sourceDueAtIso` decomposes to a valid (weekday,
 *     time-of-day) pair (using LOCAL getters - see header), that pair is
 *     recomposed against the target week with `dueDateForWeek`, and the
 *     outcome is `"transposed-from-item"`.
 *  3. Otherwise (no source due date, or one that failed to parse), the
 *     course's own `assignmentDueRule` is applied for the target week
 *     instead - `parseAssignmentDueRule(assignmentDueRule) ??
 *     DEFAULT_ASSIGNMENT_DUE_RULE`, exactly the fallback chunk B's
 *     `planCurrentEventsAssignments` already uses - and the outcome is
 *     `"course-due-rule"`.
 *
 * Pure: no Date.now(), no randomness, no I/O. `dueDateForWeek` is reused
 * verbatim in both outcome 2 and outcome 3 - never reimplemented - so DST
 * safety (D5b) applies identically to both.
 */
export function transposeModuleItemDueDate(input: ModulePatternDueDateInput): ModulePatternDueDateResult {
  const start = parseCourseDate(input.startDate);

  if (start === null || input.targetWeek === null) {
    return { dueAtIso: null, outcome: "no-due-date" };
  }

  const decomposed = input.sourceDueAtIso !== null ? decomposeLocalDueDate(input.sourceDueAtIso) : null;

  if (decomposed !== null) {
    const due = dueDateForWeek(start, input.targetWeek, decomposed);
    return { dueAtIso: due.toISOString(), outcome: "transposed-from-item" };
  }

  const rule = parseAssignmentDueRule(input.assignmentDueRule) ?? DEFAULT_ASSIGNMENT_DUE_RULE;
  const due = dueDateForWeek(start, input.targetWeek, rule);
  return { dueAtIso: due.toISOString(), outcome: "course-due-rule" };
}
