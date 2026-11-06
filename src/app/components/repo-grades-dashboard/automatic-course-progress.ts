import type { AutomaticRepoGradeRun } from "@/lib/repo-grades-dashboard/automatic-status";
import type { CourseStartupProgress } from "./startup-progress";

export function automaticCourseProgress(course: AutomaticRepoGradeRun["courses"][number]): CourseStartupProgress {
  const states = new Map<CourseStartupProgress["states"][number]["state"], number>();
  for (const { state, count } of course.counts) states.set(state, (states.get(state) ?? 0) + count);
  if (course.state === "partial" || states.size === 0) {
    const state = course.state === "scanned" ? "no-work" : course.state;
    // Course discovery markers carry no grading targets.
    if (!states.has(state)) states.set(state, 0);
  }
  return {
    courseId: course.courseId,
    label: course.label,
    states: [...states].map(([state, count]) => ({ state, count })),
    repositories: course.repositories ?? undefined,
  };
}
