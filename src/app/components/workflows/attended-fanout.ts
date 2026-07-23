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
import { scopeForInstitution, scopeForCourse } from "@/lib/workflows/fanout";
import type { WorkflowScope } from "@/lib/workflows/types";

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

/**
 * Build the fan-out entity list for a composed (institution "*" + course
 * multiplicity) run: one entity per resolved course tile, carrying the
 * tile's own institution (see fanout.ts's design note - a composed fan-out
 * collapses to a single course-dimension fan-out with institution derived
 * per tile, not a nested institution x course product). Pure - no I/O - so
 * the composed-entity shape is unit-testable without a DOM environment.
 */
export function buildComposedFanoutEntities(
  courses: Array<{ id: string; name: string; institution: string | null }>
): Array<{ institution: string | null; courseId: string; courseName: string }> {
  return courses.map((course) => ({
    institution: course.institution,
    courseId: course.id,
    courseName: course.name,
  }));
}

/**
 * Pin a composed fan-out group's scope to one course tile's own id AND
 * institution: scopeForInstitution(scopeForCourse(scope, tile.id), tile's
 * institution ?? ""). An institution-less tile pins to "" (unset) rather
 * than leaving the original "*" in place, so its scoped institution inputs
 * resolve as unset - same as a single run on such a tile.
 */
export function pinComposedGroupScope(
  scope: WorkflowScope,
  courseId: string,
  institution: string | null
): WorkflowScope {
  return scopeForInstitution(scopeForCourse(scope, courseId), institution ?? "");
}
