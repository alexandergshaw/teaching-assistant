import { currentCourseWeek, courseProgressStatus } from "@/lib/week-numbering";
import { csvToSchedule } from "@/lib/workflows/types";

export interface WeekTopicSource {
  topic: string;
  summary: string;
  source: "export" | "schedule" | "topics";
}

/**
 * Resolve a week's topic using a three-tier fallback: LMS export modules first,
 * then schedule CSV, then topics list. Returns the resolved topic/summary and
 * source, or a skip with a diagnostic message naming what each source offered.
 */
export function resolveWeekTopic(input: {
  modules: Array<{ title: string; position: number; items: Array<{ title: string }> }> | null;
  csvData: string | null;
  topics: string | null;
  week: number;
}): WeekTopicSource | { skip: string } {
  const { modules, csvData, topics, week } = input;

  // Priority 1: EXPORT MODULES - find module matching /(?:week|module)\s*(\d+)/i with captured number === week
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

  // Priority 2: SCHEDULE CSV - find row with week === input.week and non-empty topic
  const schedule = csvToSchedule(csvData ?? "");
  const csvRow = schedule.find((row) => row.week === week);
  if (csvRow && csvRow.topic.trim()) {
    return { topic: csvRow.topic.trim(), summary: csvRow.summary ?? "", source: "schedule" };
  }
  // Priority 3: TOPICS LIST - split on newlines, get line[week-1] if non-empty
  if (topics) {
    const lines = topics.split("\n");
    if (week - 1 < lines.length) {
      const line = lines[week - 1].trim();
      if (line) {
        return { topic: line, summary: "", source: "topics" };
      }
    }
  }

  // Priority 4: All sources exhausted - build diagnostic message
  const fragments: string[] = [];

  // Module fragment
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
 */
export function nextLectureWeek(input: {
  startDate: string | null;
  weeks: number | null;
  nowMs: number;
}): { week: number } | { skip: string } {
  const { startDate, weeks, nowMs } = input;

  // Branch 1: No start date
  if (!startDate) {
    return { skip: "no start date" };
  }

  // Get the raw week
  const rawWeek = currentCourseWeek(startDate, nowMs);

  // If currentCourseWeek returns null, the date is invalid
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
