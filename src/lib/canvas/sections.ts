/**
 * Canvas sections: which section(s) each active student is enrolled in.
 *
 * LIVE-LMS-STUDENT-MESSAGING W1 (docs/live-lms-student-messaging-scope.md
 * sections 5 and 10, RES-LMS-4). Canvas has no single "section name per
 * student" field, so this reader joins two live reads:
 *   1. /courses/:id/sections            -> section id -> section name
 *   2. /courses/:id/enrollments (active StudentEnrollment) -> user_id +
 *      course_section_id
 *
 * One student can hold enrollments in more than one section of the same
 * course, so the result is one entry per (user, section) pair - the aggregator
 * turns each pair into its own table row, matching the scope's "each row is a
 * (student, course, section) enrollment".
 *
 * Same idioms as ./listings.ts: resolve the credential from the institution
 * code, page with canvasGet, verify every Link "next" same-origin before
 * dialing it, honour CANVAS_PAGINATION_PAGE_CAP, throw canvasError on non-OK.
 * Returns ids and a section name only - no login id, no email.
 */

import { canvasError, parseNextLink, resolveInstitutionByCode } from "../canvas-core";
import { assertCanvasSuppliedUrlIsSameOrigin, CANVAS_PAGINATION_PAGE_CAP } from "../canvas-remote-url";
import { canvasGet } from "../canvas-fetch-response";

/** One student's enrollment in one section of a course. */
export interface CourseSectionAssignment {
  /** Canvas user id, as a string (matches CanvasRosterEntry.id). */
  readonly userId: string;
  readonly sectionId: string;
  /** The section's own name; "" when Canvas listed the enrollment's section id
   * but not a name for it (never invented). */
  readonly sectionName: string;
}

interface CanvasSectionListItem {
  id?: number;
  name?: string | null;
}

interface CanvasSectionEnrollmentItem {
  user_id?: number;
  course_section_id?: number | null;
}

/**
 * Pure join: section id -> name plus raw enrollment rows -> one assignment per
 * distinct (user, section). Enrollments with no user id or no section id are
 * dropped; a section id with no listed name yields sectionName "".
 */
export function joinSectionAssignments(
  sections: ReadonlyArray<CanvasSectionListItem>,
  enrollments: ReadonlyArray<CanvasSectionEnrollmentItem>
): CourseSectionAssignment[] {
  const nameById = new Map<number, string>();
  for (const s of sections) {
    if (typeof s.id === "number") nameById.set(s.id, (s.name ?? "").trim());
  }
  const seen = new Set<string>();
  const out: CourseSectionAssignment[] = [];
  for (const e of enrollments) {
    if (typeof e.user_id !== "number" || typeof e.course_section_id !== "number") continue;
    const key = `${e.user_id}:${e.course_section_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      userId: String(e.user_id),
      sectionId: String(e.course_section_id),
      sectionName: nameById.get(e.course_section_id) ?? "",
    });
  }
  return out;
}

async function fetchAllPages<T>(
  firstUrl: string,
  token: string,
  baseUrl: string,
  onError: (status: number) => Error
): Promise<T[]> {
  let next: string | null = firstUrl;
  const items: T[] = [];
  let pagesFetched = 0;
  while (next && pagesFetched < CANVAS_PAGINATION_PAGE_CAP) {
    const response = await canvasGet(next, token);
    if (!response.ok) {
      throw onError(response.status);
    }
    pagesFetched++;
    const page = (await response.json()) as T[];
    items.push(...page);
    const rawNext = parseNextLink(response.headers.get("link"));
    next = rawNext ? assertCanvasSuppliedUrlIsSameOrigin(rawNext, baseUrl) : null;
  }
  return items;
}

/** List every active student's section enrollment(s) in a course (code-based). */
export async function listCourseSectionAssignments(
  code: string,
  courseId: string
): Promise<CourseSectionAssignment[]> {
  const { institution, token, baseUrl } = await resolveInstitutionByCode(code);
  const onError = (status: number) => canvasError(status, institution);
  const sections = await fetchAllPages<CanvasSectionListItem>(
    `${baseUrl}/api/v1/courses/${courseId}/sections?per_page=100`,
    token,
    baseUrl,
    onError
  );
  const enrollments = await fetchAllPages<CanvasSectionEnrollmentItem>(
    `${baseUrl}/api/v1/courses/${courseId}/enrollments?type[]=StudentEnrollment&state[]=active&per_page=100`,
    token,
    baseUrl,
    onError
  );
  return joinSectionAssignments(sections, enrollments);
}
