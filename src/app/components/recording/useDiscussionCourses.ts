"use client";

// Discussion reply capture - the lazy course list (AC30, AC30a, AC37, AC46),
// split out of useDiscussionReplies.ts (set C3) purely to stay under
// recording-split.structure.test.ts's 1000-line ceiling on
// src/app/components/recording/ (non-recursive) - see that file's own
// header for the full account of what stayed and why.
//
// Gated on `active`, latched so it fires at most once for the hook's whole
// lifetime even though the panel is never unmounted on a tab switch.
// Deliberately NOT filtered on a Canvas URL (AC30) - this feature never
// posts anywhere. `hasActivatedRef` is returned (not kept private) because
// useDiscussionReplies.ts's own loop-start effect reads it too - AC37's
// exception that lets drafting resume on a panel that has been opened at
// least once, even with no capture running and no persisted rows.
//
// LATCH CLASS: every "already did this once" ref in these hooks must either
// be reset in the cleanup of the SAME effect that sets it, or be resilient
// to a cancelled run - never a plain `if (ref.current) return; ref.current =
// true;` with no way back. This effect used to set `hasActivatedRef.current
// = true` synchronously before the fetch even started, so a run that was
// cancelled before it settled (React StrictMode's simulated
// mount/cleanup/remount; a returning user who lands on this view on first
// render) still permanently latched "activated" - the remount's guard then
// bailed out before ever starting a real fetch, leaving `coursesLoading`
// stuck `true` and `courses` stuck `null` for the session. A cancelled fetch
// must not count as having happened: the latch is set only once the fetch
// actually SETTLES (resolved or errored) while its own run is still the live
// one, inside the `finally` below - never on entry.

import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { listCourseHubAction } from "@/app/actions/course-hub-core";

export interface UseDiscussionCoursesReturn {
  courses: Array<{ id: string; name: string }> | null;
  coursesLoading: boolean;
  coursesError: string | null;
  /** S8/AC37: true once this panel's course fetch has settled at least once
   *  (or the panel has otherwise been activated) - the ONE latch
   *  useDiscussionReplies.ts's loop-start effect also reads, to decide
   *  whether it may start the two idle consumer loops on a panel with no
   *  capture running and no persisted rows yet. */
  hasActivatedRef: MutableRefObject<boolean>;
}

export function useDiscussionCourses(active: boolean): UseDiscussionCoursesReturn {
  const [courses, setCourses] = useState<Array<{ id: string; name: string }> | null>(null);
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
          setCourses(result.courses.map((c) => ({ id: c.id, name: c.name })));
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

  return { courses, coursesLoading, coursesError, hasActivatedRef };
}
