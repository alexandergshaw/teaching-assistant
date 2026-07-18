import { currentCourseWeek, courseProgressStatus } from "@/lib/week-numbering";

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
