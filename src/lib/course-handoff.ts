// A one-shot payload handed from a course in the Courses hub to another tab, so
// that tab can open with the course's fields prefilled. Written to localStorage
// by CoursesTab and consumed (once) by the target tab on mount.

export type CourseHandoffTarget = "syllabus" | "version-control";

export interface CourseHandoff {
  target: CourseHandoffTarget;
  name?: string;
  courseCode?: string;
  term?: string;
  canvasUrl?: string;
  institution?: string;
  githubOrg?: string;
  /** Primary repository ("owner/name"). */
  repo?: string;
  branch?: string;
  textbook?: string;
}

const KEY = "ta-course-handoff";

/** Stash a handoff for the target tab to pick up. */
export function setCourseHandoff(handoff: CourseHandoff): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(handoff));
}

/**
 * Read and clear the pending handoff if it targets `target`. Returns null when
 * there is none (or it is for a different tab, which is left untouched).
 */
export function takeCourseHandoff(target: CourseHandoffTarget): CourseHandoff | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const handoff = JSON.parse(raw) as CourseHandoff;
    if (handoff.target !== target) return null;
    localStorage.removeItem(KEY);
    return handoff;
  } catch {
    localStorage.removeItem(KEY);
    return null;
  }
}
