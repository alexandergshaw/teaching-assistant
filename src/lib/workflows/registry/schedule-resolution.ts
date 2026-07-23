// Pure helper: resolves a usable, topic-bearing schedule for the repoless
// lecture-zip step (steps.content-lectures.ts). Schedule-type workflow
// inputs are ordinarily bound to a prior step's "schedule" output and arrive
// as an already-parsed array (see presets/course-setup.ts and
// server-runner.ts's "step" binding path, which passes the producing step's
// output through unchanged) - but a literal/runtime binding stores its value
// as a string, so a JSON-encoded schedule is tolerated too. Never assumes
// which shape is provided; both are handled, and neither is required.
import { type ScheduleWeekPlan } from "@/app/actions";
import { csvToSchedule } from "@/lib/workflows/types";

function withTopicOnly(weeks: ScheduleWeekPlan[]): ScheduleWeekPlan[] {
  return weeks.filter((w) => w.topic && w.topic.trim());
}

export interface ScheduleResolution {
  /** The resolved, topic-bearing schedule (possibly empty if every tier came up dry). */
  schedule: ScheduleWeekPlan[];
  /** Which tier won, for the run summary - null when no tier produced a schedule. */
  note: string | null;
  /** One entry per tier attempted, describing what was found there - for error messages. */
  tried: string[];
}

// Ladder: bound schedule value -> tile's schedule CSV -> tile's topics lines.
// Each tier is filtered to weeks with a non-empty trimmed topic (mirroring
// generateLectureMaterialsFromScheduleAction's own
// schedule.filter(w => w.topic && w.topic.trim()) check in course-planning.ts)
// so the action is never reached with a schedule that has zero topic-bearing
// weeks.
export function resolveRepolessSchedule(
  boundValue: unknown,
  tile: { csvData?: string | null; topics?: string | null }
): ScheduleResolution {
  const tried: string[] = [];

  let boundWeeks: ScheduleWeekPlan[] = [];
  if (typeof boundValue === "string") {
    const trimmed = boundValue.trim();
    if (trimmed) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          boundWeeks = parsed as ScheduleWeekPlan[];
        }
      } catch {
        // Malformed JSON - tolerate and fall through to the next tier.
      }
    }
  } else if (Array.isArray(boundValue)) {
    boundWeeks = boundValue as ScheduleWeekPlan[];
  }
  const boundTopicWeeks = withTopicOnly(boundWeeks);
  tried.push(
    boundWeeks.length > 0
      ? `bound schedule input (${boundTopicWeeks.length} of ${boundWeeks.length} week(s) have a topic)`
      : "bound schedule input (none provided)"
  );
  if (boundTopicWeeks.length > 0) {
    return { schedule: boundTopicWeeks, note: "schedule from the bound input", tried };
  }

  const csvWeeks = csvToSchedule(tile.csvData ?? "");
  const csvTopicWeeks = withTopicOnly(csvWeeks);
  tried.push(
    csvWeeks.length > 0
      ? `the tile's schedule CSV (${csvTopicWeeks.length} of ${csvWeeks.length} week(s) have a topic)`
      : "the tile's schedule CSV (none set)"
  );
  if (csvTopicWeeks.length > 0) {
    return { schedule: csvTopicWeeks, note: "schedule from the tile's schedule CSV", tried };
  }

  const topicsLines = (tile.topics ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  tried.push(
    topicsLines.length > 0
      ? `the tile's topics field (${topicsLines.length} line(s))`
      : "the tile's topics field (blank)"
  );
  if (topicsLines.length > 0) {
    const synthesized: ScheduleWeekPlan[] = topicsLines.map((line, i) => ({
      week: i + 1,
      topic: line,
      summary: "",
      assignmentTitle: null,
      assignmentSlug: null,
      testName: null,
    }));
    return {
      schedule: synthesized,
      note: `schedule derived from the tile's topics (${synthesized.length} weeks)`,
      tried,
    };
  }

  return { schedule: [], note: null, tried };
}
