import { currentCourseWeek, courseProgressStatus } from "@/lib/week-numbering";
import { csvToSchedule } from "@/lib/workflows/types";

export interface WeekTopicSource {
  topic: string;
  summary: string;
  source: "live" | "export" | "schedule" | "topics";
}

/**
 * Map Canvas modules to the shape expected by resolveWeekTopic.
 * Extracts name -> title, position, id, and first 6 item titles.
 * Returns the mapped modules or an empty array if input is empty/invalid.
 */
export function mapLiveModulesForTopic(
  canvasModules: Array<{ id: number; name: string; position: number; items: Array<{ title: string }> }>
): Array<{ id: number; title: string; position: number; items: Array<{ title: string }> }> {
  return canvasModules.map((mod) => ({
    id: mod.id,
    title: mod.name,
    position: mod.position,
    items: (mod.items || []).slice(0, 6).map((item) => ({ title: item.title || "" })),
  }));
}

/**
 * Resolve a week's topic using a four-tier fallback: live LMS modules first,
 * then LMS export modules, then schedule CSV, then topics list. Returns the
 * resolved topic/summary and source, or a skip with a diagnostic message
 * naming what each source offered.
 */
export function resolveWeekTopic(input: {
  liveModules?: Array<{ id?: number; title: string; position: number; items: Array<{ title: string }> }> | null;
  modules: Array<{ title: string; position: number; items: Array<{ title: string }> }> | null;
  csvData: string | null;
  topics: string | null;
  week: number;
}): WeekTopicSource | { skip: string } {
  const { liveModules, modules, csvData, topics, week } = input;

  // Priority 1: LIVE MODULES - find module matching /(?:week|module)\s*(\d+)/i with captured number === week
  let liveMatchedEmptyRemainder = false;
  if (liveModules) {
    for (const mod of liveModules) {
      const m = mod.title.match(/(?:week|module)\s*(\d+)/i);
      if (m) {
        const moduleNum = Number(m[1]);
        if (moduleNum === week) {
          // Found matching module - strip prefix and separator
          const remainder = mod.title.slice(m.index! + m[0].length).replace(/^[:|\s\-]+/, "").trim();
          if (remainder) {
            // Non-empty remainder - resolve it
            const summary = mod.items.slice(0, 6).map((item) => item.title).join("; ");
            return { topic: remainder, summary, source: "live" };
          }
          // Empty remainder - fall through to export
          liveMatchedEmptyRemainder = true;
          break;
        }
      }
    }
  }

  // Priority 2: EXPORT MODULES - find module matching /(?:week|module)\s*(\d+)/i with captured number === week
  let matchedEmptyRemainder = false;
  if (modules) {
    for (const mod of modules) {
      const m = mod.title.match(/(?:week|module)\s*(\d+)/i);
      if (m) {
        const moduleNum = Number(m[1]);
        if (moduleNum === week) {
          // Found matching module - strip prefix and separator
          const remainder = mod.title.slice(m.index! + m[0].length).replace(/^[:|\s\-]+/, "").trim();
          if (remainder) {
            // Non-empty remainder - resolve it
            const summary = mod.items.slice(0, 6).map((item) => item.title).join("; ");
            return { topic: remainder, summary, source: "export" };
          }
          // Empty remainder - fall through to CSV
          matchedEmptyRemainder = true;
          break;
        }
      }
    }
  }

  // Priority 3: SCHEDULE CSV - find row with week === input.week and non-empty topic
  const schedule = csvToSchedule(csvData ?? "");
  const csvRow = schedule.find((row) => row.week === week);
  if (csvRow && csvRow.topic.trim()) {
    return { topic: csvRow.topic.trim(), summary: csvRow.summary ?? "", source: "schedule" };
  }
  // Priority 4: TOPICS LIST - split on newlines, get line[week-1] if non-empty
  if (topics) {
    const lines = topics.split("\n");
    if (week - 1 < lines.length) {
      const line = lines[week - 1].trim();
      if (line) {
        return { topic: line, summary: "", source: "topics" };
      }
    }
  }

  // Priority 5: All sources exhausted - build diagnostic message
  const fragments: string[] = [];

  // Live modules fragment (only if liveModules were provided)
  if (liveModules) {
    if (liveMatchedEmptyRemainder) {
      fragments.push(`module ${week}'s live title has no topic text`);
    } else {
      const foundNumbers = liveModules
        .map((mod) => {
          const m = mod.title.match(/(?:week|module)\s*(\d+)/i);
          return m ? Number(m[1]) : null;
        })
        .filter((n): n is number => n !== null);
      if (foundNumbers.length === 0) {
        fragments.push("live LMS has modules none numbered");
      } else {
        const minNum = Math.min(...foundNumbers);
        const maxNum = Math.max(...foundNumbers);
        fragments.push(`live LMS has modules ${minNum}-${maxNum}`);
      }
    }
  }

  // Export module fragment
  if (!modules) {
    fragments.push("no LMS export on the tile");
  } else {
    if (matchedEmptyRemainder) {
      fragments.push(`module ${week}'s title has no topic text`);
    } else {
      const foundNumbers = modules
        .map((mod) => {
          const m = mod.title.match(/(?:week|module)\s*(\d+)/i);
          return m ? Number(m[1]) : null;
        })
        .filter((n): n is number => n !== null);
      if (foundNumbers.length === 0) {
        fragments.push("LMS export has modules none numbered");
      } else {
        const minNum = Math.min(...foundNumbers);
        const maxNum = Math.max(...foundNumbers);
        fragments.push(`LMS export has modules ${minNum}-${maxNum}`);
      }
    }
  }

  // CSV fragment
  if (schedule.length === 0) {
    fragments.push("no schedule CSV");
  } else {
    const maxWeek = Math.max(...schedule.map((row) => row.week));
    if (maxWeek < week) {
      fragments.push(`the schedule CSV covers weeks 1-${maxWeek}`);
    } else {
      fragments.push(`week ${week}'s schedule row has no topic`);
    }
  }

  // Topics fragment
  if (!topics) {
    fragments.push("no topics list");
  } else {
    const lines = topics.split("\n");
    if (week - 1 >= lines.length || !lines[week - 1].trim()) {
      fragments.push(`the topics list has ${lines.length} line(s)`);
    }
  }

  const diagnostic = `week ${week} not found - ${fragments.join(", ")}`;
  return { skip: diagnostic };
}

/**
 * Determine the week to draft for the next-week-lectures workflow.
 * - If the course hasn't started and will start within the next 7 days, return week 1.
 * - If the course is in progress, return the next week (rawWeek + 1) if it's within bounds.
 * - Otherwise return a skip reason.
 * - rawWeek (when supplied) overrides the computed start-date week. startDate may be null if rawWeek is provided.
 */
export function nextLectureWeek(input: {
  startDate: string | null;
  weeks: number | null;
  nowMs: number;
  rawWeek?: number | null;
}): { week: number } | { skip: string } {
  const { startDate, weeks, nowMs, rawWeek: suppliedRawWeek } = input;

  // Determine the raw week: use supplied value if provided, else compute from startDate
  let rawWeek: number | null;
  if (suppliedRawWeek !== undefined) {
    rawWeek = suppliedRawWeek;
  } else {
    // Branch 1: No start date
    if (!startDate) {
      return { skip: "no start date" };
    }

    // Get the raw week
    rawWeek = currentCourseWeek(startDate, nowMs);

    // If currentCourseWeek returns null, the date is invalid
    if (rawWeek === null) {
      return { skip: "no start date" };
    }
  }

  // If rawWeek is null at this point, no start date was provided and none was supplied
  if (rawWeek === null) {
    return { skip: "no start date" };
  }

  // Get the status
  const status = courseProgressStatus(rawWeek, weeks);

  // Branch 6: Complete
  if (status === "complete") {
    return { skip: "course is complete" };
  }

  // Branches 2 & 3: Not-started
  if (status === "not-started") {
    // rawWeek === 0: course hasn't started yet
    // If no startDate is available, can't check the 7-day window
    if (!startDate) {
      return { skip: "starts later than next week" };
    }
    // Check if the start date is within the next 7 days
    const start = Date.parse(startDate);
    const msUntilStart = start - nowMs;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000; // 604_800_000 ms

    if (msUntilStart > 0 && msUntilStart <= sevenDaysMs) {
      // Branch 2: Starts within next 7 days
      return { week: 1 };
    } else {
      // Branch 3: Starts later than next week
      return { skip: "starts later than next week" };
    }
  }

  // Branches 4 & 5: In-progress
  const next = rawWeek + 1;
  if (weeks && next > weeks) {
    // Branch 5: Final week is underway
    return { skip: "final week is underway" };
  }

  // Branch 4: Next week within bounds
  return { week: next };
}
