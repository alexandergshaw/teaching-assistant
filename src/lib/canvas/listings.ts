/**
 * Canvas listings: courses, assignments, students, rosters for pickers and displays.
 */

import { canvasError, parseNextLink, resolveInstitutionByCode, type CanvasInstitution } from "../canvas-core";

/** One assignment in a course, for the pull-back picker. */
export interface CanvasAssignmentBrief {
  id: string;
  name: string;
  pointsPossible: number | null;
}

/** One enrolled student, for the pull-back picker. */
export interface CanvasPerson {
  id: string;
  name: string;
}

/** A course the token user teaches, for the announcements course picker. */
export interface CanvasCourse {
  id: string;
  name: string;
}

interface CanvasCourseListItem {
  id?: number;
  name?: string;
}

interface CanvasAssignmentListItemBrief {
  id?: number;
  name?: string;
  points_possible?: number | null;
}

interface CanvasUserListItem {
  id?: number;
  name?: string;
  sortable_name?: string;
  login_id?: string;
}

interface CanvasCourseWithTermListItem {
  id?: number;
  name?: string;
  course_code?: string | null;
  start_at?: string | null;
  term?: { id?: number; name?: string; start_at?: string | null } | null;
}

type CanvasCourseCtx = {
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
};

/**
 * Page through /api/v1/courses for the given query string, mapping each course
 * to { id, name }. Shared by the narrow Live Feed scan and the broad picker list
 * so the pagination/mapping lives in one place.
 */
async function fetchCoursesForQuery(
  ctx: CanvasCourseCtx,
  query: string
): Promise<Array<{ id: string; name: string }>> {
  const { institution, token, baseUrl } = ctx;
  let next: string | null = `${baseUrl}/api/v1/courses?${query}`;
  const courses: Array<{ id: string; name: string }> = [];
  while (next) {
    const response = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw canvasError(response.status, institution);
    }
    const page = (await response.json()) as CanvasCourseListItem[];
    for (const course of page) {
      if (typeof course.id === "number") {
        courses.push({ id: String(course.id), name: course.name?.trim() || `Course ${course.id}` });
      }
    }
    next = parseNextLink(response.headers.get("link"));
  }
  return courses;
}

/**
 * Currently-active teacher courses only. Used by the Live Feed needs-grading
 * scan, which should not fan out over unpublished or concluded courses.
 */
export async function listActiveTeacherCourses(
  ctx: CanvasCourseCtx
): Promise<Array<{ id: string; name: string }>> {
  return fetchCoursesForQuery(ctx, "enrollment_type=teacher&enrollment_state=active&per_page=100");
}

/**
 * Every teacher course that is not deleted (unpublished, published, or
 * concluded), sorted by name. Backs the pull-back and announcements course
 * pickers so an instructor sees all their courses, not just active published
 * ones. state[] uses raw brackets, matching the existing include[] usage.
 */
async function listTeacherCoursesForPicker(
  ctx: CanvasCourseCtx
): Promise<Array<{ id: string; name: string }>> {
  const courses = await fetchCoursesForQuery(
    ctx,
    "enrollment_type=teacher&state[]=unpublished&state[]=available&state[]=completed&per_page=100"
  );
  courses.sort((a, b) => a.name.localeCompare(b.name));
  return courses;
}

/** List the courses the token user teaches, for the course pickers. */
export async function listCourses(code: string): Promise<CanvasCourse[]> {
  return listTeacherCoursesForPicker(resolveInstitutionByCode(code));
}

/** List teacher courses with term information, optionally filtering by term name. */
export async function listCoursesByTerm(
  code: string,
  term: string
): Promise<
  Array<{
    id: string;
    name: string;
    courseCode: string | null;
    termName: string | null;
    startAt: string | null;
  }>
> {
  const ctx = resolveInstitutionByCode(code);
  const { institution, token, baseUrl } = ctx;
  let next: string | null = `${baseUrl}/api/v1/courses?enrollment_type=teacher&include[]=term&per_page=100`;
  const courses: Array<{
    id: string;
    name: string;
    courseCode: string | null;
    termName: string | null;
    startAt: string | null;
  }> = [];

  while (next) {
    const response = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw canvasError(response.status, institution);
    }
    const page = (await response.json()) as CanvasCourseWithTermListItem[];
    for (const course of page) {
      if (typeof course.id === "number") {
        const termName = course.term?.name ?? null;
        const shouldInclude =
          !term.trim() || (termName && termName.toLowerCase().includes(term.toLowerCase()));

        if (shouldInclude) {
          courses.push({
            id: String(course.id),
            name: course.name?.trim() || `Course ${course.id}`,
            courseCode: course.course_code ?? null,
            termName,
            startAt: course.start_at ?? course.term?.start_at ?? null,
          });
        }
      }
    }
    next = parseNextLink(response.headers.get("link"));
  }
  return courses;
}

/** List assignments in a course for the pull-back picker. */
export async function listAssignments(code: string, courseId: string): Promise<CanvasAssignmentBrief[]> {
  const { institution, token, baseUrl } = resolveInstitutionByCode(code);
  let next: string | null = `${baseUrl}/api/v1/courses/${courseId}/assignments?per_page=100`;
  const assignments: CanvasAssignmentBrief[] = [];

  while (next) {
    const response = await fetch(next, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw canvasError(response.status, institution);
    }
    const page = (await response.json()) as CanvasAssignmentListItemBrief[];
    for (const item of page) {
      if (typeof item.id === "number") {
        assignments.push({
          id: String(item.id),
          name: item.name?.trim() || `Assignment ${item.id}`,
          pointsPossible: typeof item.points_possible === "number" ? item.points_possible : null,
        });
      }
    }
    next = parseNextLink(response.headers.get("link"));
  }

  assignments.sort((a, b) => a.name.localeCompare(b.name));
  return assignments;
}

/** List students enrolled in a course for the pull-back picker. */
export async function listStudents(code: string, courseId: string): Promise<CanvasPerson[]> {
  const { institution, token, baseUrl } = resolveInstitutionByCode(code);
  let next: string | null = `${baseUrl}/api/v1/courses/${courseId}/users?enrollment_type[]=student&per_page=100`;
  const students: CanvasPerson[] = [];

  while (next) {
    const response = await fetch(next, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw canvasError(response.status, institution);
    }
    const page = (await response.json()) as CanvasUserListItem[];
    for (const user of page) {
      if (typeof user.id === "number") {
        students.push({
          id: String(user.id),
          name: (user.sortable_name || user.name || `User ${user.id}`).trim(),
        });
      }
    }
    next = parseNextLink(response.headers.get("link"));
  }

  students.sort((a, b) => a.name.localeCompare(b.name));
  return students;
}

/** One roster entry with the name forms needed by the repo-generation picker. */
export interface CanvasRosterEntry {
  id: string;
  name: string;
  sortableName: string;
  loginId: string;
}

/** List a course's students with display name, sortable name, and login id. */
export async function listCourseRoster(code: string, courseId: string): Promise<CanvasRosterEntry[]> {
  const { institution, token, baseUrl } = resolveInstitutionByCode(code);
  let next: string | null = `${baseUrl}/api/v1/courses/${courseId}/users?enrollment_type[]=student&per_page=100`;
  const entries: CanvasRosterEntry[] = [];

  while (next) {
    const response = await fetch(next, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw canvasError(response.status, institution);
    }
    const page = (await response.json()) as CanvasUserListItem[];
    for (const user of page) {
      if (typeof user.id === "number") {
        entries.push({
          id: String(user.id),
          name: (user.name ?? "").trim(),
          sortableName: (user.sortable_name ?? "").trim(),
          loginId: (user.login_id ?? "").trim(),
        });
      }
    }
    next = parseNextLink(response.headers.get("link"));
  }

  entries.sort((a, b) => a.sortableName.localeCompare(b.sortableName) || a.name.localeCompare(b.name));
  return entries;
}

/** List students' current and final scores for a course. */
export async function listStudentGradeSummaries(
  code: string,
  courseId: string
): Promise<Array<{ userId: string; name: string; currentScore: number | null; finalScore: number | null }>> {
  const { institution, token, baseUrl } = resolveInstitutionByCode(code);
  let next: string | null = `${baseUrl}/api/v1/courses/${courseId}/enrollments?type[]=StudentEnrollment&state[]=active&per_page=100`;
  const summaries: Array<{ userId: string; name: string; currentScore: number | null; finalScore: number | null }> = [];

  while (next) {
    const response = await fetch(next, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw canvasError(response.status, institution);
    }
    const page = (await response.json()) as Array<{
      user_id?: number;
      user?: { name?: string; sortable_name?: string };
      grades?: { current_score?: number | null; final_score?: number | null };
    }>;
    for (const row of page) {
      if (typeof row.user_id === "number") {
        summaries.push({
          userId: String(row.user_id),
          name: row.user?.name ?? row.user?.sortable_name ?? "Student",
          currentScore: row.grades?.current_score ?? null,
          finalScore: row.grades?.final_score ?? null,
        });
      }
    }
    next = parseNextLink(response.headers.get("link"));
  }

  return summaries;
}

/** A student's text submission from an assignment. */
export interface CanvasTextSubmission {
  userId: number;
  name: string;
  submittedText: string;
}

interface CanvasSubmission {
  user_id?: number;
  workflow_state?: string;
  body?: string | null;
  user?: { name?: string; sortable_name?: string };
  submitted_at?: string | null;
}

/** List a course's students' text submissions for an assignment (code-based). */
export async function listAssignmentTextSubmissions(
  code: string,
  courseId: string,
  assignmentId: string
): Promise<CanvasTextSubmission[]> {
  const { institution, token, baseUrl } = resolveInstitutionByCode(code);
  let next: string | null = `${baseUrl}/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions?per_page=100&include[]=user`;
  const submissions: CanvasSubmission[] = [];

  while (next) {
    const response = await fetch(next, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw canvasError(response.status, institution);
    }
    const page = (await response.json()) as CanvasSubmission[];
    submissions.push(...page);
    next = parseNextLink(response.headers.get("link"));
  }

  const results: CanvasTextSubmission[] = [];
  for (const submission of submissions) {
    const userId = submission.user_id;
    if (typeof userId !== "number") {
      continue;
    }

    const name =
      submission.user?.name?.trim() ||
      submission.user?.sortable_name?.trim() ||
      `User ${userId}`;

    const submittedText = submission.body ? htmlToText(submission.body).trim() : "";

    results.push({ userId, name, submittedText });
  }

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

// Import htmlToText at end to avoid circular dependencies
import { htmlToText } from "../canvas-core";

/** List assignment due dates for a course (code-based). */
export async function listCourseAssignmentDueDates(
  code: string,
  courseId: string
): Promise<Array<{ assignmentId: string; name: string; dueAt: string | null }>> {
  const { baseUrl, token, institution } = resolveInstitutionByCode(code);
  const { listAssignmentBriefsWithDue } = await import("./auto-zero");
  const briefs = await listAssignmentBriefsWithDue(baseUrl, token, institution, courseId);
  return briefs
    .filter((b) => b.published !== false && b.dueAt)
    .map((b) => ({ assignmentId: b.assignmentId, name: b.name, dueAt: b.dueAt }));
}
