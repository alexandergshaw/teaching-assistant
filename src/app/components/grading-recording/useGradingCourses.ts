"use client";

// Grading from a screen recording - the lazy course list, WITH the roster
// text field (docs/grading-via-recording-acceptance-criteria.md R3a:
// "rosters exist client-side (course.roster, studentRepos)"). Mirrors
// useDiscussionCourses.ts's (src/app/components/recording/) shape - same
// lazy-on-activate, latch-only-once-settled discipline, same
// listCourseHubAction() call - but is its OWN, independent file: that hook
// strips every course down to {id, name} and has no reach to `.roster`
// (adding a field to its return shape would be editing a sibling's file, out
// of this task's file lane), and per R4b's own reasoning elsewhere in this
// feature, a second instance of a small, already-simple data hook is cheaper
// than reaching into a file this task does not own.
//
// LATCH CLASS (same discipline as useDiscussionCourses.ts's own comment):
// `hasActivatedRef` is set only once the fetch actually SETTLES, inside the
// `finally` below - never on entry - so a cancelled run (an early unmount, a
// remount) never permanently latches "activated" with nothing loaded.

import { useEffect, useRef, useState } from "react";
import { listCourseHubAction } from "@/app/actions/course-hub-core";

export interface GradingCourseOption {
  id: string;
  name: string;
  /** The course's free-text roster field, or null - fed to
   *  parseRosterNames (grading-course-roster.ts) by the caller. */
  roster: string | null;
}

export interface UseGradingCoursesReturn {
  courses: GradingCourseOption[] | null;
  coursesLoading: boolean;
  coursesError: string | null;
}

export function useGradingCourses(active: boolean): UseGradingCoursesReturn {
  const [courses, setCourses] = useState<GradingCourseOption[] | null>(null);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [coursesError, setCoursesError] = useState<string | null>(null);
  const hasActivatedRef = useRef(false);

  useEffect(() => {
    if (!active || hasActivatedRef.current) return;
    let cancelled = false;
    setCoursesLoading(true);
    (async () => {
      try {
        const result = await listCourseHubAction();
        if (cancelled) return;
        if ("error" in result) {
          setCoursesError(result.error);
          setCourses([]);
        } else {
          setCourses(result.courses.map((c) => ({ id: c.id, name: c.name, roster: c.roster })));
          setCoursesError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setCoursesError(err instanceof Error ? err.message : "Could not load your courses.");
          setCourses([]);
        }
      } finally {
        if (!cancelled) {
          hasActivatedRef.current = true;
          setCoursesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  return { courses, coursesLoading, coursesError };
}
