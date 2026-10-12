"use server";

// LIVE-LMS-STUDENT-MESSAGING W3: the READ side of the Success Tracking view.
// Two owner-only actions the client shell drives progressively: list the
// institution's active courses, then pull ONE course's enrollments per call so
// no request approaches the 60s Vercel cap and one failed course does not
// blank the table. Read-only: there is NO send path here (that is W4).
//
// A "use server" file exports only async functions, so the result types live in
// @/lib/live-messaging/enrollment-aggregator and are imported by the client.

import { requireAppOwner } from "@/lib/supabase/auth";
import { resolveInstitutionByCode } from "@/lib/canvas-core";
import {
  aggregateEnrollments,
  type AggregateResult,
  type EnrollmentReaders,
  type LiveCourse,
} from "@/lib/live-messaging/enrollment-aggregator";
import { buildLiveEnrollmentReaders } from "@/lib/live-messaging/enrollment-readers";

const COURSE_ID = /^\d{1,20}$/;

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// The HOST the course list was dialed against, so a misconfigured base URL is
// distinguishable from an outage. HOST ONLY: a path can carry ids and a query
// can carry credentials (same rationale as describeAttemptedCanvasHost in
// canvas-inbox.ts). Runs on an error path, so it never throws.
async function attemptedCanvasHost(code: string): Promise<string | undefined> {
  try {
    const { baseUrl } = await resolveInstitutionByCode(code);
    return new URL(baseUrl).host;
  } catch {
    return undefined;
  }
}

/** The institution's active courses (id, name, term) for the progressive load. */
export async function listLiveCoursesAction(
  institution: string
): Promise<{ courses: LiveCourse[] } | { error: string }> {
  await requireAppOwner();
  try {
    const code = institution.trim();
    if (!code) return { error: "Choose an institution first." };
    const courses = await buildLiveEnrollmentReaders().listCourses(code);
    return { courses };
  } catch (err) {
    const base = messageOf(err, "Could not list courses.");
    const host = await attemptedCanvasHost(institution.trim());
    return { error: host ? `${base} (dialed ${host})` : base };
  }
}

/** One course's enrollment rows (never throws for a reader failure). */
export async function loadCourseEnrollmentsAction(
  institution: string,
  course: LiveCourse
): Promise<AggregateResult | { error: string }> {
  await requireAppOwner();
  try {
    const code = institution.trim();
    if (!code) return { error: "Choose an institution first." };
    if (!COURSE_ID.test(course.id)) return { error: "Invalid course id." };
    const real = buildLiveEnrollmentReaders();
    // Pin the course list to the one requested so aggregateEnrollments runs
    // its per-course partition for exactly this course.
    const readers: EnrollmentReaders = {
      ...real,
      listCourses: async () => [
        { id: course.id, name: String(course.name), termName: course.termName ? String(course.termName) : null },
      ],
    };
    return await aggregateEnrollments(readers, code);
  } catch (err) {
    return { error: messageOf(err, "Could not load the course.") };
  }
}
