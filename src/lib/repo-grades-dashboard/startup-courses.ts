import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

const MAX_COURSES = 1_000;
const QUERY_TIMEOUT_MS = 10_000;
const COURSE_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

type StartupCourse = {
  accountId: string;
  courseId: string;
  organization: string | null;
  displayName?: string;
};

const unavailable = { status: "unknown", reason: "storage-unavailable" } as const;
type StartupCourseInventory = { status: "complete"; courses: StartupCourse[] } | typeof unavailable;

/** Read one bounded snapshot for an authorized owner. A partial response
 * cannot establish coverage, even when it contains no rows. */
export async function readRepoGradeStartupCourses(ownerId: string): Promise<StartupCourseInventory> {
  try {
    const { data, error, count } = await createServiceClient().from("course_hub")
      .select("id, user_id, name, github_org", { count: "exact" })
      .eq("user_id", ownerId).order("id", { ascending: true }).limit(MAX_COURSES)
      .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS)).retry(false);
    // The exact count also detects a Data API cap lower than MAX_COURSES.
    if (error || !Array.isArray(data) || count !== data.length || data.length > MAX_COURSES) return unavailable;

    const ids = new Set<string>();
    const courses: StartupCourse[] = [];
    for (const row of data) {
      if (!row || row.user_id !== ownerId || typeof row.id !== "string" || !COURSE_ID.test(row.id)
        || (row.name !== null && typeof row.name !== "string")
        || (row.github_org !== null && typeof row.github_org !== "string")) return unavailable;
      const courseId = row.id.toLowerCase();
      if (ids.has(courseId)) return unavailable;
      ids.add(courseId);
      const course: StartupCourse = { accountId: ownerId, courseId, organization: row.github_org };
      // The database allows legacy courses without names.
      if (row.name !== null) course.displayName = row.name;
      courses.push(course);
    }
    return { status: "complete", courses };
  } catch {
    return unavailable;
  }
}
