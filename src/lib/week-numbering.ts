// Pure functions for normalizing folder-derived week numbers to match course schedules.
// File/module numbering is 1-based and aligned with the schedule (weeks 1..N).
// Zero-based folder sets (week-00, week-01, ...) are shifted up by one; 1-based sets
// keep their numbers exactly, including sparse sets (gaps are preserved — a missing
// folder is a legitimate no-deliverable week). Folders without digits fall back to
// their position in the list, affecting only themselves. No IO — safe on client or
// server.

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

export interface CartridgeModulePlan {
  week: number;
  title: string;
  assignmentTitle: string;
  assignmentSlug: string | null;
}

/**
 * Generate module plans for a Common Cartridge export.
 * - Modules cover the union of (schedule week values that are integers >= 1) and
 *   (fileWeeks values that are integers >= 1).
 * - For each week, build a plan from the matching schedule entry (if any).
 * - title: "Module " + zero-padded week, optionally plus ": " + topic (if entry exists and topic non-empty).
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
    const title = `Module ${String(week).padStart(2, "0")}${topic ? `: ${topic}` : ""}`;

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
