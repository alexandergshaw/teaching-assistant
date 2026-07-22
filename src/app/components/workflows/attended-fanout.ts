// Pure helpers for the attended (in-browser) course fan-out orchestration
// used by useWorkflowRun.ts's handleRun loop. Extracted so the "Stop after
// this course" cancel transition and the course-outcome summary/detail text
// are unit-testable: vitest.config.ts runs tests under a plain "node"
// environment (no DOM), so anything living inside the "use client" hook
// itself (React state, refs) cannot be exercised directly - these functions
// take/return plain data instead.
//
// Type-only import: erased at compile time, so importing this module never
// pulls registry.ts's client-only step catalog into a test run.
import type { StepRunSummary } from "@/lib/workflows/registry";

export type CourseFanoutStatus = "ok" | "failed" | "skipped";

export interface CourseOutcome {
  courseId: string;
  courseName: string;
  status: CourseFanoutStatus;
}

export interface RunStepState {
  status: "pending" | "running" | "done" | "error" | "disabled" | "skipped";
  progress: string | null;
  summary: StepRunSummary | null;
  error: string | null;
}

export interface RunStateGroup {
  institution: string | null;
  courseId?: string;
  courseName?: string;
  courseStatus?: CourseFanoutStatus;
  steps: RunStepState[];
}

/**
 * The "Stop after this course" cancel transition. Called BETWEEN courses
 * (never mid-course - the caller only invokes this once the current course's
 * step loop has already finished): every group from `fromIndex` onward is
 * marked skipped, and any of its steps still "pending" (i.e. never started)
 * becomes "skipped" too, so the UI does not keep showing them as pending once
 * the run ends. Pure - returns new arrays/objects, mutates nothing.
 */
export function applyStopAfterCourse(
  groups: RunStateGroup[],
  fromIndex: number
): { groups: RunStateGroup[]; skipped: CourseOutcome[] } {
  const skipped: CourseOutcome[] = [];
  const nextGroups = groups.map((g, i) => {
    if (i < fromIndex) return g;
    skipped.push({ courseId: g.courseId ?? "", courseName: g.courseName ?? "", status: "skipped" });
    return {
      ...g,
      courseStatus: "skipped" as const,
      steps: g.steps.map((s) => (s.status === "pending" ? { ...s, status: "skipped" as const } : s)),
    };
  });
  return { groups: nextGroups, skipped };
}

/**
 * The first-class results-block summary line shown in the Run UI once a
 * course fan-out finishes, e.g. "Generated 5 of 7 courses' runs; 2 failed; 1
 * skipped" (the skipped clause appears only when at least one course was
 * skipped, e.g. via "Stop after this course").
 */
export function buildCourseFanoutSummary(outcomes: CourseOutcome[]): string {
  const ok = outcomes.filter((c) => c.status === "ok").length;
  const failed = outcomes.filter((c) => c.status === "failed").length;
  const skipped = outcomes.filter((c) => c.status === "skipped").length;
  return `Generated ${ok} of ${outcomes.length} courses' runs; ${failed} failed${skipped > 0 ? `; ${skipped} skipped` : ""}`;
}

/**
 * The compact course-count detail persisted in the once-per-run schedule/
 * trigger last-run write-back, e.g. "5/7 courses ok; 2 failed" (distinct
 * wording from buildCourseFanoutSummary above, which is the user-facing
 * results-block line).
 */
export function buildCourseFanoutDetail(outcomes: CourseOutcome[]): string {
  const ok = outcomes.filter((c) => c.status === "ok").length;
  const failed = outcomes.filter((c) => c.status === "failed").length;
  const skipped = outcomes.filter((c) => c.status === "skipped").length;
  return `${ok}/${outcomes.length} courses ok; ${failed} failed${skipped > 0 ? `; ${skipped} skipped` : ""}`;
}

/**
 * Counts how many groups in a course fanout run have courseStatus === "ok".
 * Used to display the course progress numerator.
 */
export function countOkCourses(groups: RunStateGroup[]): number {
  return groups.filter((grp) => grp.courseStatus === "ok").length;
}
