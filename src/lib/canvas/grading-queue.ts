/**
 * Canvas grading queue (Live Feed): assignments and graded discussions needing grading.
 */

import { canvasError, parseNextLink, resolveInstitutionByCode, type CanvasInstitution } from "../canvas-core";
import { fetchCanvasMetaWith } from "./metadata";
import { listActiveTeacherCourses } from "./listings";

/** One assignment/discussion needing grading, one row in the Live Feed table. */
export interface CanvasQueueItem {
  institution: string;
  courseId: string;
  courseName: string;
  kind: "assignment" | "discussion";
  /** Resource id used in the URL (assignment id, or discussion topic id). */
  id: string;
  /** Always the assignment id, for posting grades back. */
  assignmentId: string;
  title: string;
  needsGradingCount: number;
  dueAt: string | null;
  pointsPossible: number | null;
  htmlUrl: string;
  canvasUrl: string;
  /** Direct SpeedGrader link for the assignment. */
  speedGraderUrl: string;
  description: string;
  rubricText: string;
}

interface CanvasAssignmentListItem {
  id?: number;
  name?: string;
  description?: string | null;
  html_url?: string;
  needs_grading_count?: number;
  submission_types?: string[];
  rubric?: Array<{ id?: string; description?: string }>;
  discussion_topic?: { id?: number } | null;
  due_at?: string | null;
  points_possible?: number | null;
}

/**
 * Raw needs-grading rows (no description/rubric yet) across an institution's
 * active teacher courses. Shared by the full queue and the badge count so the
 * count doesn't pay for the per-row description/rubric fetches.
 */
async function scanNeedsGrading(ctx: {
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
}): Promise<CanvasQueueItem[]> {
  const { institution, token, baseUrl } = ctx;
  const courses = await listActiveTeacherCourses(ctx);

  const items: CanvasQueueItem[] = [];
  for (const course of courses) {
    let next: string | null = `${baseUrl}/api/v1/courses/${course.id}/assignments?bucket=ungraded&include[]=needs_grading_count&per_page=100`;
    while (next) {
      const response = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        throw canvasError(response.status, institution);
      }
      const page = (await response.json()) as CanvasAssignmentListItem[];
      for (const assignment of page) {
        if (typeof assignment.id !== "number") continue;
        if (!assignment.needs_grading_count || assignment.needs_grading_count <= 0) continue;

        const isDiscussion =
          (assignment.submission_types?.includes("discussion_topic") ?? false) &&
          typeof assignment.discussion_topic?.id === "number";
        const canvasUrl = isDiscussion
          ? `${baseUrl}/courses/${course.id}/discussion_topics/${assignment.discussion_topic!.id}`
          : `${baseUrl}/courses/${course.id}/assignments/${assignment.id}`;

        items.push({
          institution: institution.code,
          courseId: course.id,
          courseName: course.name,
          kind: isDiscussion ? "discussion" : "assignment",
          id: isDiscussion ? String(assignment.discussion_topic!.id) : String(assignment.id),
          assignmentId: String(assignment.id),
          title: assignment.name?.trim() || `Assignment ${assignment.id}`,
          needsGradingCount: assignment.needs_grading_count,
          dueAt: assignment.due_at ?? null,
          pointsPossible: typeof assignment.points_possible === "number" ? assignment.points_possible : null,
          htmlUrl: assignment.html_url ?? canvasUrl,
          canvasUrl,
          speedGraderUrl: `${baseUrl}/courses/${course.id}/gradebook/speed_grader?assignment_id=${assignment.id}`,
          description: "",
          rubricText: "",
        });
      }
      next = parseNextLink(response.headers.get("link"));
    }
  }
  return items;
}

export async function listGradingQueue(code: string): Promise<CanvasQueueItem[]> {
  const ctx = resolveInstitutionByCode(code);
  const items = await scanNeedsGrading(ctx);

  // The assignments list omits the full description (and a graded discussion's
  // prompt lives on its topic, not the assignment), so pull each row's
  // description + rubric from the same show endpoints the single-URL flow uses.
  await Promise.all(
    items.map(async (item) => {
      try {
        const meta = await fetchCanvasMetaWith(ctx, {
          kind: item.kind,
          courseId: item.courseId,
          id: item.id,
        });
        item.description = meta.description;
        item.rubricText = meta.rubricText;
      } catch {
        // Leave description/rubric blank if a single row's meta can't be read.
      }
    })
  );

  items.sort(
    (a, b) => a.courseName.localeCompare(b.courseName) || a.title.localeCompare(b.title)
  );
  return items;
}

/**
 * Total submissions needing grading across active teacher courses (for badges).
 * `exclude` drops assignments the user marked "seen" and courses they stopped
 * watching, so the badge matches what they actually see in the Live Feed.
 */
export async function getNeedsGradingCount(
  code: string,
  exclude?: { courses?: Set<string>; assignments?: Set<string> }
): Promise<number> {
  const ctx = resolveInstitutionByCode(code);
  const items = await scanNeedsGrading(ctx);
  return items.reduce((sum, item) => {
    if (exclude?.courses?.has(item.courseId)) return sum;
    if (exclude?.assignments?.has(item.assignmentId)) return sum;
    return sum + item.needsGradingCount;
  }, 0);
}

/**
 * Per-course notification counts for a course's tile: how many submissions need
 * grading and how many unread inbox conversations are scoped to the course. Two
 * targeted Canvas calls (assignments needs_grading + course-filtered unread
 * conversations), so it stays cheap per course.
 */
export async function getCourseNotifications(
  code: string,
  courseId: string
): Promise<{ needsGrading: number; unread: number }> {
  const { institution, token, baseUrl } = resolveInstitutionByCode(code);

  let needsGrading = 0;
  let next: string | null = `${baseUrl}/api/v1/courses/${courseId}/assignments?bucket=ungraded&include[]=needs_grading_count&per_page=100`;
  while (next) {
    const response = await fetch(next, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw canvasError(response.status, institution);
    const page = (await response.json()) as Array<{ needs_grading_count?: number }>;
    for (const a of page) {
      if (typeof a.needs_grading_count === "number" && a.needs_grading_count > 0) needsGrading += a.needs_grading_count;
    }
    next = parseNextLink(response.headers.get("link"));
  }

  let unread = 0;
  const convRes = await fetch(
    `${baseUrl}/api/v1/conversations?scope=unread&filter[]=course_${courseId}&per_page=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (convRes.ok) {
    const convs = (await convRes.json()) as unknown[];
    if (Array.isArray(convs)) unread = convs.length;
  }

  return { needsGrading, unread };
}
