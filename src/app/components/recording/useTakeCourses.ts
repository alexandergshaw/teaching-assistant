"use client";
import { useEffect, useState } from "react";
import { useSupabase } from "@/context/SupabaseProvider";
import { listCourseHubAction } from "../../actions";
import type { AnnCourseOption } from "./useTakeAnnouncement";

export async function loadTakeCourses(load: typeof listCourseHubAction, timeoutMs = 15000): Promise<{ courses: AnnCourseOption[] } | { error: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      load(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Loading courses timed out. Try again.")), timeoutMs); }),
    ]);
    if ("error" in result) return { error: result.error };
    return { courses: result.courses.filter((course) => Boolean(course.canvasUrl)).map((course) => ({
      id: course.id, name: course.name, canvasUrl: course.canvasUrl as string, institution: course.institution ?? null,
    })) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not load your courses." };
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

export function useTakeCourses() {
  const { user, loading } = useSupabase();
  const owner = !loading ? user?.id ?? "" : "";
  const [state, setState] = useState<{ owner: string; courses: AnnCourseOption[] | null; error: string | null }>({ owner: "", courses: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!owner) return;
    let cancelled = false;
    void loadTakeCourses(listCourseHubAction).then((result) => {
      if (cancelled) return;
      setState("error" in result ? { owner, courses: null, error: result.error } : { owner, courses: result.courses, error: null });
    });
    return () => { cancelled = true; };
  }, [owner, attempt]);
  return { courses: owner && state.owner === owner ? state.courses : null, coursesError: owner && state.owner === owner ? state.error : null,
    coursesLoading: loading || (!!owner && state.owner !== owner), coursesNeedSignIn: !loading && !owner,
    retryCourses: () => setAttempt((value) => value + 1) };
}
