// Current-events assignment - the pure per-module PLAN, including the one
// deadline computation the AC requires to run in the browser
// (docs/current-events-assignment-from-modules-acceptance-criteria.md,
// section 3b is the final contract; D2 is idempotency, D4 is the deadline
// placement this file exists to satisfy).
//
// THIS FILE CONTAINS THE ONLY `.toISOString()` CALL ON A LOCAL WALL-CLOCK
// DATE IN THIS ENTIRE CHUNK, AND IT RUNS IN THE BROWSER.
//
// Why that placement is load-bearing, not incidental (W1/D4): `dueDateForWeek`
// (src/lib/assignment-due-rule.ts:122) builds its result with `setHours` -
// local wall-clock fields, on purpose, so the same course start date and rule
// produce the same clock time on every machine. `.toISOString()` re-expresses
// that local instant using the CALLING PROCESS's own UTC offset. Vercel's
// serverless functions run in UTC. `createGradable`
// (src/lib/canvas-modules/gradables.ts) appends `assignment[due_at]` to the
// Canvas request VERBATIM, with no re-normalization on the way out. So if a
// server process ever computed this ISO string, an instructor's "11:59 PM"
// rule would reach Canvas as 23:59Z - four to eight hours early for every
// instructor in the Americas - and nothing in tsc, eslint, vitest or next
// build can see that, because every value involved is a syntactically valid
// Date and a syntactically valid ISO string throughout. That exact defect
// shipped once already (docs/REGRESSION.md entry 328). Keeping this
// computation in a client-only leaf module, called only from the browser-side
// hook (wave 2's 2A), is the structural guarantee that it cannot happen again
// for this feature: the number this file returns is always computed on the
// same machine that will display it to the instructor, so its local-to-UTC
// offset is always the instructor's own.
//
// Pure module otherwise: no I/O, no Date.now(), no randomness, no React. The
// course's raw column values and the already-loaded module tree are passed in
// by the caller exactly as fetched/rendered - see CurrentEventsPlanInput.
//
// Copies planBulkModuleCreation's decision shape one level down (module scope
// there, item scope here - see src/lib/bulk-module-plan.ts:122-198) and its
// exact idempotency match rule (case-insensitive, trim-insensitive name
// compare), applied here against Canvas MODULE ITEM titles rather than module
// names, per D2.

import { parseAssignmentDueRule, dueDateForWeek, type AssignmentDueRule } from "./assignment-due-rule";
import { parseCourseDate } from "./course-calendar-dates";
import { extractModuleNumber } from "./workflows/module-value";
import {
  currentEventsAssignmentTitle,
  describeCurrentEventsDeadline,
  type CurrentEventsDeadlineReason,
} from "./current-events-assignment";

/** The exact default `weekDeadline` already applies for callers that pass no
 * rule (assignment-due-rule.ts:8-12) - not a new invention, reused verbatim
 * per AC7. */
const DEFAULT_ASSIGNMENT_DUE_RULE: AssignmentDueRule = { day: "sun", time: "23:59" };

export interface CurrentEventsPlanInput {
  /** The already-loaded module tree, in Canvas order - the same order the
   * Modules view already renders, and the order `entries` below preserves. */
  modules: ReadonlyArray<{ id: number; name: string; items: ReadonlyArray<{ title: string }> }>;
  selectedModuleIds: ReadonlySet<number>;
  /** RAW "YYYY-MM-DD" course column value - never a Date. Parsed here, not by
   * the caller, so this file owns the one parse-then-compute step end to end. */
  startDate: string | null;
  /** RAW "sun|23:59" course column value - never a parsed AssignmentDueRule. */
  assignmentDueRule: string | null;
  /** True when the course row itself could not be loaded - distinct from a
   * loaded row with a blank start date (W2/D1's three-reasons correction). */
  courseRowUnavailable: boolean;
}

export interface CurrentEventsPlanEntry {
  moduleId: number;
  moduleName: string;
  /** currentEventsAssignmentTitle(moduleName) - the Canvas assignment title
   * and, per D2, the idempotency key. */
  title: string;
  /** The module's own item titles, passed through unchanged - grounding data
   * for the generator (AC12), not consumed by this file beyond the
   * idempotency check below. */
  itemTitles: string[];
  /** extractModuleNumber(moduleName), or null when the name carries no week
   * number. Exposed so a caller can label a "no-week-number" outcome without
   * re-deriving it. */
  week: number | null;
  /** Absolute instant, ISO 8601 with a Z offset. Null unless
   * deadlineReason === "ok". */
  dueAtIso: string | null;
  /** describeCurrentEventsDeadline's own output for the same due-date Date
   * this entry's `dueAtIso` is derived from (1A's, never re-spelled here) -
   * "" unless deadlineReason === "ok". Local-getter formatting, never
   * .toISOString() - see that function's own doc comment for why "no date"
   * is empty-string, not a placeholder sentence. */
  deadlineText: string;
  deadlineReason: CurrentEventsDeadlineReason;
  /** "already-present" iff some item in THIS module already has a title that
   * matches `title` case-insensitively and trim-insensitively (D2). Skipped
   * entries are still returned - never dropped - so the caller can report
   * them (AC14/W6). */
  action: "create" | "already-present";
}

export interface CurrentEventsPlan {
  /** In `modules` order (Canvas order) - only selected modules appear. */
  entries: CurrentEventsPlanEntry[];
  createCount: number;
  skipCount: number;
  /** Always null today - no input shape here can fail validation the way
   * planBulkModuleCreation's count/template inputs can. Kept on the return
   * shape for parity with that sibling planner and so a future validation
   * rule has somewhere to report without a breaking contract change. */
  error: string | null;
}

/**
 * Plan one current-events assignment per SELECTED module, in Canvas order.
 *
 * Deadline (AC7, with W2's three-reason correction): computed per module as
 *   week  = extractModuleNumber(module.name)
 *   start = parseCourseDate(startDate)
 *   rule  = parseAssignmentDueRule(assignmentDueRule) ?? { day: "sun", time: "23:59" }
 *   due   = dueDateForWeek(start, week, rule)
 * None of `courseRowUnavailable`, a missing/malformed `startDate`, or a
 * `moduleName` with no week number ABORTS the entry - the assignment is still
 * planned with action "create" (unless the idempotency check below already
 * marks it "already-present"), just with `dueAtIso: null` and a reason that
 * says which of the three causes applied:
 *   courseRowUnavailable        -> "no-course-row"
 *   parseCourseDate(startDate) is null -> "no-course-start-date"
 *   extractModuleNumber(name) is null  -> "no-week-number"
 * Checked in that order because a module with no resolvable course row also
 * has no start date and no independently-meaningful week number to report -
 * "no-course-row" is the more useful, more specific reason in that case.
 *
 * Idempotency (D2): an entry is "already-present" iff some
 * `module.items[i].title.trim().toLowerCase() === title.trim().toLowerCase()`,
 * where `title` is `currentEventsAssignmentTitle(module.name)` (1A's, never
 * re-spelled here). This is byte-for-byte planBulkModuleCreation's own match
 * rule, applied at ITEM scope instead of module scope. The idempotency check
 * runs independently of the deadline computation - a module with no
 * resolvable deadline can still be "already-present", and a module that is
 * "already-present" still gets its deadline fields populated for anyone
 * inspecting the plan, since the deadline computation has no failure mode of
 * its own to skip.
 */
export function planCurrentEventsAssignments(input: CurrentEventsPlanInput): CurrentEventsPlan {
  const start = parseCourseDate(input.startDate);
  const rule = parseAssignmentDueRule(input.assignmentDueRule) ?? DEFAULT_ASSIGNMENT_DUE_RULE;

  const entries: CurrentEventsPlanEntry[] = [];
  let createCount = 0;
  let skipCount = 0;

  for (const mod of input.modules) {
    if (!input.selectedModuleIds.has(mod.id)) continue;

    const title = currentEventsAssignmentTitle(mod.name);
    const week = extractModuleNumber(mod.name);

    let dueAtIso: string | null = null;
    let deadlineText = "";
    let deadlineReason: CurrentEventsDeadlineReason;
    if (input.courseRowUnavailable) {
      deadlineReason = "no-course-row";
    } else if (start === null) {
      deadlineReason = "no-course-start-date";
    } else if (week === null) {
      deadlineReason = "no-week-number";
    } else {
      deadlineReason = "ok";
      const dueDate = dueDateForWeek(start, week, rule);
      dueAtIso = dueDate.toISOString();
      deadlineText = describeCurrentEventsDeadline(dueDate);
    }

    const normalizedTitle = title.trim().toLowerCase();
    const alreadyPresent = mod.items.some((item) => item.title.trim().toLowerCase() === normalizedTitle);

    const itemTitles = mod.items.map((item) => item.title);

    if (alreadyPresent) {
      skipCount += 1;
    } else {
      createCount += 1;
    }

    entries.push({
      moduleId: mod.id,
      moduleName: mod.name,
      title,
      itemTitles,
      week,
      dueAtIso,
      deadlineText,
      deadlineReason,
      action: alreadyPresent ? "already-present" : "create",
    });
  }

  return { entries, createCount, skipCount, error: null };
}
