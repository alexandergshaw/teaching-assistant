// Pure functions for normalizing folder-derived week numbers to match course schedules.
// File/module numbering is 1-based and aligned with the schedule (weeks 1..N).
// Zero-based folder sets (week-00, week-01, ...) are shifted up by one; 1-based sets
// keep their numbers exactly, including sparse sets (gaps are preserved — a missing
// folder is a legitimate no-deliverable week). Folders without digits fall back to
// their position in the list, affecting only themselves. No IO — safe on client or
// server.
//
// Also home to the Ask AI schedule-question matcher: the closed-list question
// strings, the marker string stamped on every computed answer, and
// daysUntilTermEnd. They live in this pure module rather than in
// src/app/actions/llm-content.ts because that file is a "use server" action
// module - a "use server" file may only export async functions, so a string
// array or a plain marker constant cannot be exported from it.

import { composeModuleTitle } from "./module-title";

/**
 * Map assignment folder slugs to their normalized week numbers.
 * - Parse the FIRST digit run of each slug.
 * - shift = 1 when at least one slug has digits AND the minimum parsed value across
 *   digit-bearing slugs is 0; otherwise shift = 0.
 * - week(slug) = parsed !== null ? parsed + shift : index + 1 (positional fallback
 *   applies per-slug, only to digit-less slugs).
 * - Zero-based sets shift up by one with gaps preserved (week-00, week-02 -> 1, 3);
 *   1-based sets are identity; duplicate numbers share the same week.
 */
export function assignWeekNumbers(folderSlugs: string[]): Map<string, number> {
  const result = new Map<string, number>();

  // Extract the first digit run from each slug.
  const parsed: Array<{ slug: string; digits: number | null }> = folderSlugs.map(
    (slug) => {
      const match = slug.match(/\d+/);
      return { slug, digits: match ? parseInt(match[0], 10) : null };
    }
  );

  // Shift zero-based sets up by one; leave 1-based sets untouched.
  const digitValues = parsed
    .filter((p) => p.digits !== null)
    .map((p) => p.digits!);
  const shift = digitValues.length > 0 && Math.min(...digitValues) === 0 ? 1 : 0;

  parsed.forEach(({ slug, digits }, index) => {
    result.set(slug, digits !== null ? digits + shift : index + 1);
  });

  return result;
}

/**
 * Renumber the "week NN" token in a label to match a target week, but ONLY when the
 * change is exactly the zero-based +1 shift (week === tokenValue + 1). Any other
 * relationship — including an already-matching token or an unrelated ordinal like
 * "Project 2" — returns the label unchanged. The replacement preserves the token's
 * zero-padded width.
 * Examples: renumberWeekLabel("Week 00 Assignment", 1) => "Week 01 Assignment";
 * renumberWeekLabel("Week 0: Git Basics", 1) => "Week 1: Git Basics";
 * renumberWeekLabel("Project 2", 3) => unchanged; renumberWeekLabel("Exam 1", 2) => unchanged;
 * renumberWeekLabel("2024 Week 00", 2024) => unchanged;
 * renumberWeekLabel("Week 03 B", 3) => unchanged.
 */
export function renumberWeekLabel(label: string, week: number): string {
  const match = label.match(/\b(week[\s_-]*)(\d+)/i);
  if (!match) return label;

  const token = match[2];
  const tokenValue = parseInt(token, 10);
  if (week !== tokenValue + 1) return label;

  const padded = String(week).padStart(token.length, "0");
  const start = match.index! + match[1].length;
  return label.slice(0, start) + padded + label.slice(start + token.length);
}

/**
 * The 1-based elapsed course week that `now` falls in, given the course start
 * date. Weeks are 7-day spans from the start: week 1 is days 0-6, week 2 is
 * days 7-13, and so on. Returns the RAW elapsed week (it can exceed the course
 * length - the caller decides whether that means "complete"), or 0 before the
 * start date, or null when the start date is missing/invalid. `now` is passed
 * in (epoch ms) so the function stays pure and testable.
 */
export function currentCourseWeek(
  startDateIso: string | null | undefined,
  now: number
): number | null {
  if (!startDateIso) return null;
  const start = Date.parse(startDateIso);
  if (Number.isNaN(start)) return null;
  const diffDays = Math.floor((now - start) / 86_400_000);
  if (diffDays < 0) return 0;
  return Math.floor(diffDays / 7) + 1;
}

export type CourseProgressStatus = "not-started" | "in-progress" | "complete";

/** Classify where a course is from its RAW elapsed week (0 = not started) and
 * total week count: past the last week -> "complete", within it -> "in-progress". */
export function courseProgressStatus(
  rawWeek: number,
  totalWeeks: number | null | undefined
): CourseProgressStatus {
  if (rawWeek <= 0) return "not-started";
  if (typeof totalWeeks === "number" && totalWeeks > 0 && rawWeek > totalWeeks) {
    return "complete";
  }
  return "in-progress";
}

/**
 * Days remaining until the course's end date, or a negative count once it has
 * passed. Uses the SAME Date.parse/epoch-ms/Math.floor convention as
 * currentCourseWeek above (never a calendar-string comparison, never a
 * timezone-sensitive Date-object subtraction). Returns null when the end
 * date is missing/invalid. `now` is passed in (epoch ms) so the function
 * stays pure and testable - it never reads a clock itself.
 */
export function daysUntilTermEnd(
  endDateIso: string | null | undefined,
  now: number
): number | null {
  if (!endDateIso) return null;
  const end = Date.parse(endDateIso);
  if (Number.isNaN(end)) return null;
  return Math.floor((end - now) / 86_400_000);
}

/**
 * The closed list of schedule-arithmetic questions AskAiModal answers from a
 * computed value with no model call (see askAboutCourseAction in
 * src/app/actions/llm-content.ts). Exact-match only, deliberately: a
 * substring or fuzzy match would let a near-miss question ("what week should
 * I move the midterm to") collide with a real match. Each entry is already
 * lowercase, trimmed, with no trailing punctuation - normalizeAskAiQuestion
 * puts an incoming question into this same shape before comparing.
 */
export const ASK_AI_CURRENT_WEEK_QUESTIONS: readonly string[] = [
  "what week are we in",
  "what week is it",
  "what week is this",
  "what week of the course are we in",
];

export const ASK_AI_TERM_END_QUESTIONS: readonly string[] = [
  "how many days until the term ends",
  "how many days until the course ends",
  "how many days are left in the term",
  "how many days are left in the course",
  "how many weeks are left",
  "how many weeks are left in the course",
  "how many weeks are left in the term",
  "when does the term end",
  "when does the course end",
  "is the course over",
  "has the course ended",
  "has the term ended",
];

/** The full closed list, both shapes combined - exported so a UI call site
 * can be checked for membership (see AskAiModal.tsx's suggestion chips)
 * without either list drifting silently out of sync with the other. */
export const ASK_AI_CLOSED_LIST_QUESTIONS: readonly string[] = [
  ...ASK_AI_CURRENT_WEEK_QUESTIONS,
  ...ASK_AI_TERM_END_QUESTIONS,
];

export type AskAiQuestionShape = "current-week" | "term-end";

/** Trim whitespace, lowercase, and strip at most one trailing ?/./! before
 * comparing a question against the closed list above. */
export function normalizeAskAiQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/[?.!]$/, "");
}

/** Classifies a question by exact match (after normalizing) against the
 * closed list above, or null when it does not match either shape. */
export function matchAskAiQuestionShape(question: string): AskAiQuestionShape | null {
  const normalized = normalizeAskAiQuestion(question);
  if (ASK_AI_CURRENT_WEEK_QUESTIONS.includes(normalized)) return "current-week";
  if (ASK_AI_TERM_END_QUESTIONS.includes(normalized)) return "term-end";
  return null;
}

/** Shown alongside every deterministic schedule-arithmetic answer so the
 * instructor knows it came from the course's own recorded dates, not from
 * the model's reading of them, and therefore cannot be wrong the way the
 * model's other answers in the same modal can be. Production and test share
 * this exact literal - see askAboutCourseAction and its test. */
export const SCHEDULE_ANSWER_MARKER =
  "This answer was computed directly from this course's own recorded dates - not read or guessed by a model - so it cannot be wrong the way the model's other answers here can be.";

export interface CartridgeModulePlan {
  week: number;
  title: string;
  assignmentTitle: string;
  assignmentSlug: string | null;
}

/**
 * Parse the first /(?:week|module)[\s_-]*(\d+)/i match from a label.
 * Returns the captured week/module number, or null if no match.
 * Handles zero-padded numbers (e.g., "Week 06" -> 6), spaces/underscores/dashes
 * as separators, and case-insensitive keywords.
 */
export function parseWeekToken(label: string): number | null {
  const match = label.match(/(?:week|module)[\s_-]*(\d+)/i);
  if (!match || !match[1]) return null;
  return Number(match[1]);
}

/**
 * Find the module whose title's week token matches the given week number.
 * Returns the first matching module (position order), or null if no match found.
 * Uses parseWeekToken to extract week numbers from module titles.
 */
export function findModuleForWeek(
  modules: Array<{ title?: string | null; name?: string | null; position?: number; id?: number }>,
  week: number
): (typeof modules)[number] | null {
  if (week <= 0) return null;
  for (const mod of modules) {
    const title = mod.title ?? mod.name ?? "";
    if (parseWeekToken(title) === week) {
      return mod;
    }
  }
  return null;
}

/**
 * Determine the current week based on assignment due dates.
 * - Ignores entries with no parseable week token or missing/unparseable dueAt.
 * - Per week, keeps the LATEST due date (a module stays current until its last deadline passes).
 * - Current week = the SMALLEST week whose latest due date is >= nowMs (inclusive).
 * - When every deadline has passed: { week: maxWeek + 1, pastLastDeadline: true }.
 * - No usable entries: null.
 */
export function currentWeekFromDeadlines(
  entries: Array<{ name: string; dueAt: string | null }>,
  nowMs: number
): { week: number; pastLastDeadline: boolean } | null {
  // Extract parseable week tokens and due dates
  const weekMap = new Map<number, number>(); // week -> latest dueAt timestamp

  for (const entry of entries) {
    const week = parseWeekToken(entry.name);
    if (week === null || week <= 0) continue;

    const dueAtMs = entry.dueAt ? Date.parse(entry.dueAt) : NaN;
    if (Number.isNaN(dueAtMs)) continue;

    // Keep the latest due date for each week
    const existing = weekMap.get(week);
    if (existing === undefined || dueAtMs > existing) {
      weekMap.set(week, dueAtMs);
    }
  }

  // If no usable entries, return null
  if (weekMap.size === 0) return null;

  // Find the smallest week whose latest due date is >= nowMs
  const sortedWeeks = Array.from(weekMap.keys()).sort((a, b) => a - b);
  for (const week of sortedWeeks) {
    const dueAtMs = weekMap.get(week)!;
    if (dueAtMs >= nowMs) {
      return { week, pastLastDeadline: false };
    }
  }

  // All deadlines have passed - return past-the-end value
  const maxWeek = Math.max(...sortedWeeks);
  return { week: maxWeek + 1, pastLastDeadline: true };
}

/**
 * Generate module plans for a Common Cartridge export.
 * - Modules cover the union of (schedule week values that are integers >= 1) and
 *   (fileWeeks values that are integers >= 1).
 * - For each week, build a plan from the matching schedule entry (if any).
 * - title: composeModuleTitle(topic, week) — "Module NN", plus ": " + topic when
 *   there is real subject text left after stripping any redundant leading
 *   "Module NN"/"Week NN" label the topic already carries (see module-title.ts).
 *   This is what keeps re-ingesting a previously generated cartridge as a
 *   schedule source from stacking another "Module NN: " prefix onto a title
 *   that already has one.
 * - assignmentTitle: entry's assignmentTitle (trimmed) if non-empty, else "Week " + zero-padded week + " Deliverable".
 * - assignmentSlug: entry's assignmentSlug (trimmed), or null when absent/empty after trim.
 * - Every plan has a non-empty assignmentTitle, ensuring each module ships an assignment.
 */
export function planCartridgeModules(
  schedule: Array<{ week: number; topic: string; assignmentTitle: string | null; assignmentSlug: string | null }>,
  fileWeeks: number[]
): CartridgeModulePlan[] {
  // Collect all module weeks that are integers >= 1.
  const moduleWeeks = new Set<number>();
  for (const entry of schedule) {
    if (Number.isInteger(entry.week) && entry.week >= 1) {
      moduleWeeks.add(entry.week);
    }
  }
  for (const week of fileWeeks) {
    if (Number.isInteger(week) && week >= 1) {
      moduleWeeks.add(week);
    }
  }

  const sortedWeeks = Array.from(moduleWeeks).sort((a, b) => a - b);

  return sortedWeeks.map((week) => {
    const entry = schedule.find((e) => e.week === week);
    const topic = entry?.topic?.trim() ?? "";
    const title = composeModuleTitle(topic, week);

    const assignmentTitleFromEntry = entry?.assignmentTitle?.trim() ?? "";
    const assignmentTitle = assignmentTitleFromEntry
      ? assignmentTitleFromEntry
      : `Week ${String(week).padStart(2, "0")} Deliverable`;

    const trimmedSlug = entry?.assignmentSlug?.trim();
    const assignmentSlug = trimmedSlug ? trimmedSlug : null;

    return {
      week,
      title,
      assignmentTitle,
      assignmentSlug,
    };
  });
}
