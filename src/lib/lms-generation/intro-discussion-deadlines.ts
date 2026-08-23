// Pure leaf: computes the two Canvas checkpoint deadlines for the
// introduce-yourself discussion
// (docs/intro-discussion-from-modules-acceptance-criteria.md, AC8/AC9,
// amended by section 5b). No @/app/actions, no Supabase, no Date.now(), no
// randomness - every date comes from the course's own start date and the
// target module's own name, both passed in by the caller.
//
// dueDateForWeek (assignment-due-rule.ts) is the ONLY date arithmetic used
// here. Under its Monday-anchored week convention, "thu" is Monday+3 and
// "sun" is Monday+6 of the SAME week, which is exactly "the thursday before
// the sunday of that week" - see that module's own doc comment. Nothing in
// this file re-derives that arithmetic (no setDate, no manual day offsets).

import { dueDateForWeek, WEEKDAYS, WEEKDAY_LABELS, type AssignmentDueRule } from "@/lib/assignment-due-rule";
import { parseCourseDate } from "@/lib/course-calendar-dates";
import { extractModuleNumber } from "@/lib/workflows/module-value";

/** 11:59pm Thursday - the initial post. */
export const INITIAL_POST_RULE: AssignmentDueRule = { day: "thu", time: "23:59" };
/** 11:59pm Sunday of the SAME week - the two replies. */
export const REPLIES_RULE: AssignmentDueRule = { day: "sun", time: "23:59" };

/** How many replies the prompt asks for, and (on the checkpoints path) what
 * Canvas is told to require. */
export const REQUIRED_REPLY_COUNT = 2;

/** Total points for the graded discussion. */
export const INTRO_DISCUSSION_POINTS = 20;
/** Split across the two Canvas checkpoints (see graded-discussion.ts).
 * Must sum to INTRO_DISCUSSION_POINTS. */
export const INITIAL_POST_POINTS = 10;
export const REPLIES_POINTS = 10;

/**
 * Split `pointsPossible` across the two Canvas checkpoints in the RATIO
 * INITIAL_POST_POINTS:REPLIES_POINTS expresses (10:10, i.e. 1:1 today) -
 * never as those two constants sent verbatim. NewGradedDiscussion
 * (src/lib/canvas-modules/graded-discussion.ts) carries the resulting
 * `initialPostPoints`/`repliesPoints` as PLAIN FIELDS the caller computes and
 * passes in, rather than a ratio the write layer re-derives itself - see that
 * type's own doc comment for why deriving both from one place here is what
 * keeps the checkpoints path and the classic path (which sends
 * `pointsPossible` whole, as its one assignment's total) from silently
 * disagreeing the moment INTRO_DISCUSSION_POINTS changes.
 *
 * The two halves always sum EXACTLY to `pointsPossible`, with no rounding
 * loss: the initial-post share is rounded to the nearest whole point, and the
 * reply-checkpoint share is whatever is LEFT OVER, never computed
 * independently. An odd total's leftover half-point therefore always lands on
 * the initial-post checkpoint (`Math.round` rounds .5 up) - AC13b's lateness
 * verdict is anchored to the initial post, so if the two checkpoints must
 * ever differ by a single point, giving it to the one Canvas's own grading
 * treats as primary is the safer bias, not an arbitrary one.
 */
export function splitCheckpointPoints(pointsPossible: number): { initialPostPoints: number; repliesPoints: number } {
  const ratioTotal = INITIAL_POST_POINTS + REPLIES_POINTS;
  const initialPostPoints = Math.round((pointsPossible * INITIAL_POST_POINTS) / ratioTotal);
  const repliesPoints = pointsPossible - initialPostPoints;
  return { initialPostPoints, repliesPoints };
}

export interface IntroDiscussionDeadlines {
  /** The week number the deadlines were computed for. */
  week: number;
  /** Local Date, Thursday 23:59 of `week`. */
  initialPostAt: Date;
  /** Local Date, Sunday 23:59 of the SAME `week`. Always strictly after
   * `initialPostAt`. */
  repliesDueAt: Date;
}

/** Null when the course has no usable start date, or when `moduleName`
 * carries no derivable week/module number. Null is a real answer, never a
 * thrown error and never a silently-wrong date: the caller posts the
 * discussion with NO dates and says so in the outcome note
 * (see describeMissingDeadlines below). */
export function planIntroDiscussionDeadlines(args: {
  startDate: string | null | undefined;
  moduleName: string;
}): IntroDiscussionDeadlines | null {
  const start = parseCourseDate(args.startDate);
  if (!start) return null;

  const week = extractModuleNumber(args.moduleName);
  if (week === null) return null;

  return {
    week,
    initialPostAt: dueDateForWeek(start, week, INITIAL_POST_RULE),
    repliesDueAt: dueDateForWeek(start, week, REPLIES_RULE),
  };
}

/** Why planIntroDiscussionDeadlines returned null, as a caller-renderable
 * sentence. Null when deadlines WERE computed. The two distinct causes - a
 * missing/malformed start date, and a module name with no derivable week
 * number - produce two DIFFERENT strings, so the reason survives instead of
 * collapsing into one generic message. */
export function describeMissingDeadlines(args: {
  startDate: string | null | undefined;
  moduleName: string;
}): string | null {
  const start = parseCourseDate(args.startDate);
  if (!start) {
    return "This course has no start date, so no due or lock dates were set on the discussion.";
  }

  const week = extractModuleNumber(args.moduleName);
  if (week === null) {
    return `The module name "${args.moduleName}" carries no week number, so no due or lock dates were set on the discussion.`;
  }

  return null;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "Thursday, September 10, 2026 at 11:59 PM". Deterministic and
 * locale-free: built from WEEKDAY_LABELS (assignment-due-rule.ts) and the
 * explicit MONTH_NAMES array above - never toLocaleDateString. */
export function formatDeadlineForPrompt(d: Date): string {
  const weekdayLabel = WEEKDAY_LABELS[WEEKDAYS[d.getDay()]];
  const monthLabel = MONTH_NAMES[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();

  const hour24 = d.getHours();
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12raw = hour24 % 12;
  const hour12 = hour12raw === 0 ? 12 : hour12raw;
  const minute = String(d.getMinutes()).padStart(2, "0");

  return `${weekdayLabel}, ${monthLabel} ${day}, ${year} at ${hour12}:${minute} ${period}`;
}

export const NO_DATE_INITIAL_POST_TEXT = "11:59pm Thursday of this module's week";
export const NO_DATE_REPLIES_TEXT = "11:59pm Sunday of this module's week";
