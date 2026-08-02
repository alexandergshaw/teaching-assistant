// Pure structural-to-schedule normalizer: turns an ORDERED module list (the
// shape both a parsed course cartridge - src/lib/cartridge-import.ts's
// CartridgeModule[] - and a live Canvas course's modules -
// src/lib/canvas-modules/types.ts's CanvasModule[] - already have in
// common, a name plus ordered items) into the SAME ScheduleWeekPlan[] shape
// every other schedule producer in this app emits (see
// src/lib/workflows/registry/steps.planning.ts's schedule-from-repo /
// generate-schedule).
//
// Deliberately pure: no I/O, no Date.now(), no randomness, no LLM call - the
// course-schedule-from-source step
// (src/lib/workflows/registry/steps.course-schedule-from-source.ts) is the
// only caller, and it is the ONE place both the "course cartridge" and
// "existing LMS course" sources route their (differently-typed, but
// structurally identical once narrowed down) module lists through - see
// that step's own header comment for why those two sources share this one
// function instead of two parallel implementations that would silently
// drift apart over time.
//
// There is no reliable signal in a bare module/item title list for which
// item (if any) is "the assignment" or "the test" for a week - that
// classification is what the LLM-driven producers (generateSchedulePlanAction,
// generateSchedulePlanFromRepoAction) do from a full course description or a
// repository's actual assignment folders, not something a title string alone
// supports. So every produced week's assignmentTitle/assignmentSlug/testName
// stay null here; the no-code pipeline downstream already treats an
// assignment-less week as "generate one from the topic," which is the
// correct behavior for a structural import that carries no other signal.

import type { ScheduleWeekPlan } from "@/app/actions-types";

/** One item inside a module, as far as this normalizer cares - just its
 * title. A cartridge item also carries a `type` (content_type) and a live
 * Canvas item carries an id/position/publish-state/etc.; none of that is
 * meaningful for placing the item in a schedule, so both callers narrow
 * their richer item shape down to this before calling in. */
export interface CourseStructureItem {
  title: string;
}

/** One module (an ordered unit of course content) with its ordered items -
 * the shape both a course cartridge's modules and a live LMS course's
 * modules narrow down to before reaching this normalizer. */
export interface CourseStructureModule {
  title: string;
  items: CourseStructureItem[];
}

// A cleaned module, after trimming/defaulting the title and dropping blank
// item titles - kept as its own small shape so buildWeek below never has to
// re-check for blankness.
interface CleanedModule {
  title: string;
  items: string[];
}

const REVIEW_WEEK_TOPIC = "Review";
const REVIEW_WEEK_SUMMARY =
  "No module content maps to this week - a review or catch-up week.";
const UNTITLED_MODULE = "Untitled module";

function buildWeek(week: number, bucketModules: CleanedModule[]): ScheduleWeekPlan {
  if (bucketModules.length === 0) {
    // Fewer modules than the requested week count: an empty bucket becomes a
    // clearly-labeled placeholder rather than a week with a blank topic, so
    // the produced schedule never silently implies content that isn't there.
    return {
      week,
      topic: REVIEW_WEEK_TOPIC,
      summary: REVIEW_WEEK_SUMMARY,
      assignmentTitle: null,
      assignmentSlug: null,
      testName: null,
    };
  }

  // More modules than the requested week count lands more than one module in
  // the same bucket - join their titles/items rather than dropping any of
  // them, since "never invent, never drop source content" is the same rule
  // the LLM-driven producers' own balancing policy follows (see
  // CHAPTER_ALIGNMENT_POLICY in src/app/actions/course-planning.ts).
  const topic = bucketModules.map((m) => m.title).join("; ");
  const allItems = bucketModules.flatMap((m) => m.items);
  const summary =
    allItems.length > 0
      ? `Covers: ${allItems.join(", ")}`
      : "No items listed for this module.";

  return {
    week,
    topic,
    summary,
    assignmentTitle: null,
    assignmentSlug: null,
    testName: null,
  };
}

/**
 * Map an ordered module list onto `targetWeeks` weeks - or one week per
 * module when `targetWeeks` is null or not a positive integer, the same
 * "leave blank to match the source" convention schedule-from-repo's own
 * weeks input already uses.
 *
 * Modules are bucketed across the target week count with the standard
 * "spread N items across W buckets as evenly as possible" index formula
 * (bucket index = floor(i * W / N)). This one formula is what handles BOTH
 * directions without two separate code paths:
 *   - fewer modules than weeks: some buckets land empty (their week becomes
 *     a Review placeholder), and the real modules spread out evenly across
 *     the term rather than all bunching at the start;
 *   - more modules than weeks: multiple modules land in the same bucket and
 *     share one week (their titles/items are joined, never dropped).
 *
 * An item with a blank (whitespace-only) title is dropped - it carries no
 * information a schedule can use. A module with a blank title falls back to
 * "Untitled module" rather than producing a week with an empty topic string.
 * Zero modules always produces an empty schedule, regardless of
 * `targetWeeks` - there is nothing to place, so there is nothing to pad.
 */
export function courseStructureToSchedule(
  modules: CourseStructureModule[],
  targetWeeks: number | null
): ScheduleWeekPlan[] {
  const cleaned: CleanedModule[] = modules.map((m) => ({
    title: m.title.trim() || UNTITLED_MODULE,
    items: m.items.map((i) => i.title.trim()).filter((t) => t.length > 0),
  }));

  if (cleaned.length === 0) return [];

  const weeks =
    targetWeeks !== null && Number.isInteger(targetWeeks) && targetWeeks > 0
      ? targetWeeks
      : cleaned.length;

  const buckets: CleanedModule[][] = Array.from({ length: weeks }, () => []);
  cleaned.forEach((m, i) => {
    const bucketIndex = Math.min(weeks - 1, Math.floor((i * weeks) / cleaned.length));
    buckets[bucketIndex].push(m);
  });

  return buckets.map((bucketModules, i) => buildWeek(i + 1, bucketModules));
}
