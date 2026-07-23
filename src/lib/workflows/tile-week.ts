// Current-week resolution for a course tile. Lives in its own module so the
// material-source gatherers (registry-helpers.sources.ts) can auto-pick the
// current week's LMS module without importing registry-helpers.ts, which
// re-exports those same gatherers - importing back would form a module cycle
// that only works while this stays a hoisted function declaration.
// registry-helpers.ts re-exports this so its own import surface is unchanged.

import { listAssignmentDueDatesByUrlAction } from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";
import { currentCourseWeek, currentWeekFromDeadlines } from "@/lib/week-numbering";
// Type-only: erased at compile time, so this does NOT reintroduce the cycle.
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";

// Resolve the current week from deadline data if available, with fallback to start-date arithmetic.
// - If start-date arithmetic says the course has not started (currentCourseWeek returns 0),
//   return the start-date result (deadline data must not mark a future course in-progress).
// - Else if tile.canvasUrl is set: call listAssignmentDueDatesByUrlAction; on success feed
//   currentWeekFromDeadlines, which returns rawWeek with source "deadlines".
// - Any action error, no canvas URL, or null result: fall back to currentCourseWeek with source "start-date".
// - Returns skip only when start date is missing/invalid.
export async function resolveTileCurrentWeek(
  tile: Course,
  helpers: StepRunHelpers
): Promise<{ rawWeek: number; source: "deadlines" | "start-date" } | { skip: string }> {
  // Check start-date arithmetic first
  const startDateWeek = currentCourseWeek(tile.startDate, Date.now());
  if (startDateWeek === null) {
    return { skip: "no start date" };
  }

  // If course hasn't started according to start-date arithmetic, use that result
  if (startDateWeek === 0) {
    return { rawWeek: 0, source: "start-date" };
  }

  // Course has started; try deadline-based approach if canvasUrl is available
  if (tile.canvasUrl) {
    try {
      const result = await listAssignmentDueDatesByUrlAction(
        tile.canvasUrl,
        tile.institution ?? helpers.activeInstitution ?? undefined
      );
      if ("error" in result) {
        // Silent fallback on error
        return { rawWeek: startDateWeek, source: "start-date" };
      }

      const deadlineResult = currentWeekFromDeadlines(result.assignments, Date.now());
      if (deadlineResult !== null) {
        // Success - use deadline-based week (pastLastDeadline flag is ignored here; caller handles it)
        return { rawWeek: deadlineResult.week, source: "deadlines" };
      }

      // No usable deadline entries - fall back to start-date
      return { rawWeek: startDateWeek, source: "start-date" };
    } catch {
      // Silent fallback on exception
      return { rawWeek: startDateWeek, source: "start-date" };
    }
  }

  // No canvasUrl - use start-date result
  return { rawWeek: startDateWeek, source: "start-date" };
}
