/**
 * Progressive-load combiner (LIVE-LMS-STUDENT-MESSAGING W3). The shell lists an
 * institution's courses once, then pulls each course's enrollments in its own
 * request (so no single request approaches the 60s cap and one failed course
 * does not blank the table). This folds the per-course results, in course
 * order, into the table's rows and per-course statuses. Pure; type-only imports
 * so the client bundle never pulls Canvas server code.
 */

import type { AggregateResult, CourseStatus, EnrollmentRow, LiveCourse } from "./enrollment-aggregator";

export interface CombinedLoad {
  readonly rows: EnrollmentRow[];
  readonly statuses: CourseStatus[];
  /** Courses with no result yet. */
  readonly pending: number;
  /** Courses whose load failed outright. */
  readonly failed: number;
  /** Courses that loaded but with a degraded column (grades/missing/sections). */
  readonly partial: number;
}

/** A synthetic failed result for a course whose request itself threw. */
export function failedCourseResult(course: LiveCourse, error: string): AggregateResult {
  return {
    rows: [],
    courses: [{ courseId: course.id, course: course.name, kind: "failed", error }],
    listError: null,
  };
}

export function combineCourseResults(
  listed: readonly LiveCourse[],
  results: Readonly<Record<string, AggregateResult | undefined>>
): CombinedLoad {
  const rows: EnrollmentRow[] = [];
  const statuses: CourseStatus[] = [];
  let pending = 0;
  for (const course of listed) {
    const result = results[course.id];
    if (!result) {
      pending += 1;
      continue;
    }
    rows.push(...result.rows);
    statuses.push(...result.courses);
  }
  return {
    rows,
    statuses,
    pending,
    failed: statuses.filter((s) => s.kind === "failed").length,
    partial: statuses.filter((s) => s.kind === "partial").length,
  };
}
