/**
 * Client for the Canvas LMS REST API.
 *
 * Canvas has no UI export for discussion boards or assignment submissions, but
 * its API exposes both. We pull every student's work — discussion posts/replies,
 * or an assignment's text body plus uploaded files — so it can be fed into the
 * existing grading pipeline. The kind is detected from the URL.
 *
 * Server-only: reads the instructor API token from the environment and never
 * exposes it to the client.
 */

import JSZip from "jszip";
import { parseCanvasUrl, type ParsedCanvasUrl } from "./canvas-url";
import {
  canvasError,
  htmlToText,
  parseNextLink,
  resolveCourse,
  resolveInstitution,
  resolveInstitutionByCode,
  resolveDefaultInstitution,
  textToHtml,
  type CanvasInstitution,
} from "./canvas-core";
import { isZeroableAssignment } from "./grade-zeros";

// Skip attachments larger than this to bound memory/latency.
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/** A single post or reply by a student in a discussion thread. */
export interface DiscussionPost {
  text: string;
  /** ISO timestamp, when Canvas provides it. */
  createdAt: string | null;
  /** True for a nested reply, false for a top-level (initial) post. */
  isReply: boolean;
  /** The user id of the entry this one replied to (null for top-level posts). */
  parentUserId: number | null;
}

/** A student's structured activity in one discussion thread. */
export interface DiscussionActivity {
  initialPosts: DiscussionPost[];
  replies: DiscussionPost[];
}

/** One student's work pulled from Canvas, ready to feed into grading. */
export interface CanvasStudentWork {
  student: string;
  userId: number;
  /** Text content: discussion posts/replies, or an assignment's text body. */
  text: string;
  /** Uploaded files (assignment submissions). Empty for discussions. */
  files: Array<{ name: string; base64: string; mimeType: string }>;
  /** Posts/replies for discussions; 1 for an assignment submission. */
  contributionCount: number;
  /** Structured thread activity, present only for the discussion source. */
  discussion?: DiscussionActivity;
}

/** A non-submitter for an assignment (missing submission past due date). */
export interface CanvasNonSubmitter {
  userId: number;
  name: string;
}

/** Result of listing non-submitters for an assignment. */
export interface CanvasMissingResult {
  assignmentId: string;
  assignmentName: string;
  pointsPossible: number | null;
  dueAt: string | null;
  nonSubmitters: CanvasNonSubmitter[];
  eligible: boolean;
  ineligibleReason?: string;
}

/** Assignment with due date, for filtering past-due assignments. */
export interface CanvasAssignmentWithDue {
  assignmentId: string;
  name: string;
  dueAt: string | null;
  pointsPossible: number | null;
  submissionTypes: string[] | null;
  gradingType: string | null;
  published: boolean | null;
  omitFromFinalGrade: boolean | null;
}

interface CanvasViewEntry {
  id?: number;
  user_id?: number;
  message?: string | null;
  deleted?: boolean;
  created_at?: string | null;
  replies?: CanvasViewEntry[];
}

interface CanvasViewResponse {
  participants?: Array<{ id?: number; display_name?: string }>;
  view?: CanvasViewEntry[];
}

/**
 * Walk a discussion `/view` response into per-user structured activity (initial
 * posts vs replies, timestamps, and who each reply targeted) plus participant
 * names. Pure (no network) so it can be unit-tested with synthetic threads.
 */
export function extractDiscussionActivity(data: CanvasViewResponse): {
  names: Map<number, string>;
  byUser: Map<number, DiscussionActivity>;
} {
  const names = new Map<number, string>();
  for (const participant of data.participants ?? []) {
    if (typeof participant.id === "number") {
      names.set(participant.id, participant.display_name?.trim() || `User ${participant.id}`);
    }
  }

  const byUser = new Map<number, DiscussionActivity>();
  const walk = (entries: CanvasViewEntry[] | undefined, depth: number, parentUserId: number | null) => {
    for (const entry of entries ?? []) {
      if (!entry.deleted && typeof entry.user_id === "number" && entry.message) {
        const text = htmlToText(entry.message);
        if (text) {
          const isReply = depth > 0;
          const post: DiscussionPost = {
            text,
            createdAt: entry.created_at ?? null,
            isReply,
            parentUserId: isReply ? parentUserId : null,
          };
          const activity = byUser.get(entry.user_id) ?? { initialPosts: [], replies: [] };
          if (isReply) activity.replies.push(post);
          else activity.initialPosts.push(post);
          byUser.set(entry.user_id, activity);
        }
      }
      if (entry.replies?.length) {
        walk(entry.replies, depth + 1, entry.user_id ?? parentUserId);
      }
    }
  };
  walk(data.view, 0, null);

  return { names, byUser };
}

interface CanvasAttachment {
  id?: number;
  filename?: string;
  display_name?: string;
  url?: string;
  "content-type"?: string;
  size?: number;
}

interface CanvasSubmission {
  user_id?: number;
  workflow_state?: string;
  body?: string | null;
  attachments?: CanvasAttachment[];
  user?: { name?: string; sortable_name?: string };
  submitted_at?: string | null;
  score?: number | null;
  cached_due_date?: string | null;
  excused?: boolean;
}

/**
 * Fetch a Canvas discussion or assignment (auto-detected from the URL) and
 * return one work item per student. The host selects the institution/token.
 */
export async function fetchCanvasWork(
  url: string
): Promise<{ kind: "discussion" | "assignment"; students: CanvasStudentWork[]; dueAt: string | null }> {
  const parsed = parseCanvasUrl(url);
  if (!parsed) {
    throw new Error(
      "Could not read a discussion or assignment from that URL. Expected .../courses/123/discussion_topics/456 or .../courses/123/assignments/456."
    );
  }

  const { institution, token, baseUrl } = resolveInstitution(url);

  if (parsed.kind === "discussion") {
    const { students, dueAt } = await fetchDiscussion(baseUrl, token, institution, parsed.courseId, parsed.id);
    return { kind: parsed.kind, students, dueAt };
  }

  const students = await fetchAssignment(baseUrl, token, institution, parsed.courseId, parsed.id);
  return { kind: parsed.kind, students, dueAt: null };
}

/** The discussion topic's due date (graded discussions carry it on the linked
 *  assignment; ungraded ones fall back to lock_at). Best-effort; null on failure. */
async function fetchDiscussionDueAt(
  baseUrl: string,
  token: string,
  courseId: string,
  topicId: string
): Promise<string | null> {
  try {
    const response = await fetch(`${baseUrl}/api/v1/courses/${courseId}/discussion_topics/${topicId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const topic = (await response.json()) as {
      assignment?: { due_at?: string | null } | null;
      lock_at?: string | null;
      todo_date?: string | null;
    };
    return topic.assignment?.due_at ?? topic.lock_at ?? topic.todo_date ?? null;
  } catch {
    return null;
  }
}

async function fetchDiscussion(
  baseUrl: string,
  token: string,
  institution: CanvasInstitution,
  courseId: string,
  topicId: string
): Promise<{ students: CanvasStudentWork[]; dueAt: string | null }> {
  const endpoint = `${baseUrl}/api/v1/courses/${courseId}/discussion_topics/${topicId}/view`;
  const [response, dueAt] = await Promise.all([
    fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } }),
    fetchDiscussionDueAt(baseUrl, token, courseId, topicId),
  ]);
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }

  const data = (await response.json()) as CanvasViewResponse;
  const { names, byUser } = extractDiscussionActivity(data);

  const students: CanvasStudentWork[] = [];
  for (const [userId, activity] of byUser) {
    const ordered = [...activity.initialPosts, ...activity.replies];
    const text = ordered
      .map((post) => `${post.isReply ? "Reply" : "Post"}: ${post.text}`)
      .join("\n\n---\n\n");
    students.push({
      student: names.get(userId) ?? `User ${userId}`,
      userId,
      text,
      files: [],
      contributionCount: activity.initialPosts.length + activity.replies.length,
      discussion: activity,
    });
  }
  students.sort((a, b) => a.student.localeCompare(b.student));
  return { students, dueAt };
}

async function fetchAssignment(
  baseUrl: string,
  token: string,
  institution: CanvasInstitution,
  courseId: string,
  assignmentId: string
): Promise<CanvasStudentWork[]> {
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

  const students: CanvasStudentWork[] = [];
  for (const submission of submissions) {
    if (!submission || submission.workflow_state === "unsubmitted") {
      continue;
    }

    // Only grade submissions that haven't been graded yet. A submission Canvas
    // already marks "graded" is skipped so a grading run never re-grades work
    // that is already done (a resubmission flips the state back to "submitted",
    // so it correctly returns to the queue).
    if (submission.workflow_state === "graded") {
      continue;
    }

    const userId = typeof submission.user_id === "number" ? submission.user_id : -1;
    const student =
      submission.user?.sortable_name?.trim() ||
      submission.user?.name?.trim() ||
      (userId >= 0 ? `User ${userId}` : "Unknown student");
    const text = submission.body ? htmlToText(submission.body) : "";

    const files: CanvasStudentWork["files"] = [];
    for (const attachment of submission.attachments ?? []) {
      if (!attachment.url) continue;
      if (typeof attachment.size === "number" && attachment.size > MAX_ATTACHMENT_BYTES) {
        continue;
      }
      try {
        const fileRes = await fetch(attachment.url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!fileRes.ok) continue;
        const buffer = await fileRes.arrayBuffer();
        if (buffer.byteLength > MAX_ATTACHMENT_BYTES) continue;
        files.push({
          name: attachment.filename || attachment.display_name || `attachment-${attachment.id ?? files.length}`,
          base64: Buffer.from(buffer).toString("base64"),
          mimeType: attachment["content-type"] || "application/octet-stream",
        });
      } catch {
        // Skip an attachment that cannot be downloaded rather than failing.
      }
    }

    if (!text && files.length === 0) {
      continue;
    }

    students.push({ student, userId, text, files, contributionCount: 1 });
  }

  students.sort((a, b) => a.student.localeCompare(b.student));
  return students;
}

interface CanvasRubricRating {
  description?: string;
  long_description?: string;
  points?: number;
}

interface CanvasRubricCriterion {
  id?: string;
  description?: string;
  long_description?: string;
  points?: number;
  ratings?: CanvasRubricRating[];
}

// Normalize a criterion/area name for matching ("Code Style (5 pts)" -> "code style").
function normalizeCriterionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(\s*\d+(?:\.\d+)?\s*(?:pts?|points?|%)?\s*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Pull earned points out of a score string ("7/10" -> "7", "85%" -> "85").
function earnedPoints(score: string): string {
  const fraction = score.match(/(-?\d+(?:\.\d+)?)\s*\/\s*-?\d+/);
  if (fraction) return fraction[1];
  const num = score.match(/-?\d+(?:\.\d+)?/);
  return num ? num[0] : "";
}

interface CanvasAssignmentObject {
  description?: string | null;
  rubric?: CanvasRubricCriterion[];
  points_possible?: number | null;
}

interface CanvasDiscussionTopicObject {
  message?: string | null;
  assignment_id?: number | null;
  assignment?: CanvasAssignmentObject | null;
}

// Render a Canvas rubric (criteria + point-rating tiers) as plain rubric text.
function formatRubric(rubric: CanvasRubricCriterion[] | undefined): string {
  if (!rubric || rubric.length === 0) return "";
  const lines: string[] = [];
  for (const criterion of rubric) {
    const name = (criterion.description ?? "Criterion").trim();
    const points = typeof criterion.points === "number" ? ` (${criterion.points} pts)` : "";
    const detail = (criterion.long_description ?? "").trim();
    lines.push(`${name}${points}: ${detail || name}`);
    for (const rating of criterion.ratings ?? []) {
      const ratingName = (rating.description ?? "").trim();
      const ratingPoints = typeof rating.points === "number" ? ` (${rating.points} pts)` : "";
      const ratingDetail = (rating.long_description ?? "").trim();
      if (ratingName || ratingDetail) {
        lines.push(`  ${ratingName}${ratingPoints}: ${ratingDetail || ratingName}`);
      }
    }
  }
  return lines.join("\n");
}

async function fetchAssignmentObject(
  baseUrl: string,
  token: string,
  institution: CanvasInstitution,
  courseId: string,
  assignmentId: string
): Promise<CanvasAssignmentObject> {
  const response = await fetch(
    `${baseUrl}/api/v1/courses/${courseId}/assignments/${assignmentId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  return (await response.json()) as CanvasAssignmentObject;
}

/**
 * Fetch the assignment/discussion description and any attached rubric for a URL,
 * so the grading form can prefill the instructions and rubric. The rubric text
 * is descriptive (criteria + point tiers); it suits the AI grader but generally
 * not the deterministic engine (which needs check-based rules).
 */
export async function fetchCanvasMeta(
  url: string
): Promise<{ description: string; rubricText: string }> {
  const parsed = parseCanvasUrl(url);
  if (!parsed) {
    throw new Error(
      "Could not read a discussion or assignment from that URL. Expected .../courses/123/discussion_topics/456 or .../courses/123/assignments/456."
    );
  }
  return fetchCanvasMetaWith(resolveInstitution(url), parsed);
}

/**
 * Core of fetchCanvasMeta against an already-resolved institution context, so
 * both the URL-host path (single assignment) and the acronym path (Live Feed)
 * pull the description + rubric from the same authoritative show endpoints.
 */
async function fetchCanvasMetaWith(
  ctx: { institution: CanvasInstitution; token: string; baseUrl: string },
  parsed: ParsedCanvasUrl
): Promise<{ description: string; rubricText: string }> {
  const { institution, token, baseUrl } = ctx;

  if (parsed.kind === "assignment") {
    const assignment = await fetchAssignmentObject(
      baseUrl,
      token,
      institution,
      parsed.courseId,
      parsed.id
    );
    return {
      description: assignment.description ? htmlToText(assignment.description) : "",
      rubricText: formatRubric(assignment.rubric),
    };
  }

  // Discussion: the topic message is the description; a graded discussion links
  // to an assignment that may carry the rubric.
  const response = await fetch(
    `${baseUrl}/api/v1/courses/${parsed.courseId}/discussion_topics/${parsed.id}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const topic = (await response.json()) as CanvasDiscussionTopicObject;
  const description = topic.message ? htmlToText(topic.message) : "";

  let rubricText = formatRubric(topic.assignment?.rubric);
  if (!rubricText && topic.assignment_id) {
    try {
      const assignment = await fetchAssignmentObject(
        baseUrl,
        token,
        institution,
        parsed.courseId,
        String(topic.assignment_id)
      );
      rubricText = formatRubric(assignment.rubric);
    } catch {
      // Rubric is optional; ignore if the linked assignment can't be read.
    }
  }

  return { description, rubricText };
}

/**
 * Fetch the assignment's points_possible for a Canvas URL (resolving a graded
 * discussion to its linked assignment). Returns null when unknown or the item is
 * not points-graded. Used to anchor auto-grade totals to the scale Canvas shows,
 * so the tool never grades out of a different total than the gradebook.
 */
export async function fetchAssignmentPointsPossible(url: string): Promise<number | null> {
  const parsed = parseCanvasUrl(url);
  if (!parsed) return null;

  const { institution, token, baseUrl } = resolveInstitution(url);

  try {
    let assignmentId = parsed.kind === "assignment" ? parsed.id : "";

    if (parsed.kind === "discussion") {
      const response = await fetch(
        `${baseUrl}/api/v1/courses/${parsed.courseId}/discussion_topics/${parsed.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) return null;
      const topic = (await response.json()) as CanvasDiscussionTopicObject;
      if (typeof topic.assignment?.points_possible === "number") {
        return topic.assignment.points_possible;
      }
      if (!topic.assignment_id) return null;
      assignmentId = String(topic.assignment_id);
    }

    const assignment = await fetchAssignmentObject(
      baseUrl,
      token,
      institution,
      parsed.courseId,
      assignmentId
    );
    return typeof assignment.points_possible === "number" ? assignment.points_possible : null;
  } catch {
    // Points are best-effort; fall back to the rubric-derived total when unknown.
    return null;
  }
}

/**
 * Build the SpeedGrader URL for a Canvas assignment/discussion URL, without a
 * student id. Resolves a graded discussion to its linked assignment. Returns
 * null when the URL is not gradable or has no linked assignment. Append
 * `&student_id=<userId>` to deep-link to one student's submission.
 */
export async function getSpeedGraderUrl(url: string): Promise<string | null> {
  const parsed = parseCanvasUrl(url);
  if (!parsed) return null;

  let ctx: { institution: CanvasInstitution; token: string; baseUrl: string };
  try {
    ctx = resolveInstitution(url);
  } catch {
    return null;
  }
  const { token, baseUrl } = ctx;

  let assignmentId = parsed.kind === "assignment" ? parsed.id : "";
  if (parsed.kind === "discussion") {
    try {
      const response = await fetch(
        `${baseUrl}/api/v1/courses/${parsed.courseId}/discussion_topics/${parsed.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) return null;
      const topic = (await response.json()) as CanvasDiscussionTopicObject;
      if (!topic.assignment_id) return null;
      assignmentId = String(topic.assignment_id);
    } catch {
      return null;
    }
  }
  if (!assignmentId) return null;

  return `${baseUrl}/courses/${parsed.courseId}/gradebook/speed_grader?assignment_id=${assignmentId}`;
}

// ── Grading queue (Live Feed) ───────────────────────────────────────────────
//
// Across an institution's active teacher courses, surface every assignment and
// graded discussion that currently has submissions needing grading, with the
// description and rubric needed for the Live Feed table. Credentials come from
// the acronym's env vars (resolveInstitutionByCode); the canonical canvasUrl is
// built so the existing single-URL grading pipeline can grade it unchanged.

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

/** A single pulled-back submission (any workflow state, including graded). */
export interface CanvasSubmissionDetail {
  student: string;
  assignmentName: string;
  courseId: string;
  assignmentId: string;
  userId: number;
  /** Submission text body (HTML converted to text), if any. */
  text: string;
  /** Uploaded files with base64 content, same shape as CanvasStudentWork["files"]. */
  files: CanvasStudentWork["files"];
  /** Canvas workflow_state: "unsubmitted" | "submitted" | "graded" | etc. */
  workflowState: string;
  /** Current score, or null when ungraded. */
  score: number | null;
  /** Current letter/points grade string, or null. */
  grade: string | null;
  submittedAt: string | null;
  pointsPossible: number | null;
  /** Canonical assignment URL (baseUrl/courses/.../assignments/...) for grading + posting. */
  canvasUrl: string;
  /** SpeedGrader deep link to this student's submission. */
  speedGraderUrl: string;
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

interface CanvasAssignmentListItem {
  id?: number;
  name?: string;
  description?: string | null;
  html_url?: string;
  needs_grading_count?: number;
  submission_types?: string[];
  rubric?: CanvasRubricCriterion[];
  discussion_topic?: { id?: number } | null;
  due_at?: string | null;
  points_possible?: number | null;
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
async function listActiveTeacherCourses(
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

interface CanvasCourseWithTermListItem {
  id?: number;
  name?: string;
  course_code?: string | null;
  start_at?: string | null;
  term?: { id?: number; name?: string; start_at?: string | null } | null;
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

interface CanvasAssignmentListItemBrief {
  id?: number;
  name?: string;
  points_possible?: number | null;
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

interface CanvasUserListItem {
  id?: number;
  name?: string;
  sortable_name?: string;
  login_id?: string;
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

/** List assignment due dates for a course (code-based). */
export async function listCourseAssignmentDueDates(
  code: string,
  courseId: string
): Promise<Array<{ assignmentId: string; name: string; dueAt: string | null }>> {
  const { baseUrl, token, institution } = resolveInstitutionByCode(code);
  const briefs = await listAssignmentBriefsWithDue(baseUrl, token, institution, courseId);
  return briefs
    .filter((b) => b.published !== false && b.dueAt)
    .map((b) => ({ assignmentId: b.assignmentId, name: b.name, dueAt: b.dueAt }));
}

interface CanvasAssignmentDetailItem {
  id?: number;
  name?: string;
  points_possible?: number | null;
}

interface CanvasSubmissionItem {
  user_id?: number;
  workflow_state?: string;
  body?: string | null;
  attachments?: CanvasAttachment[];
  score?: number | null;
  grade?: string | null;
  submitted_at?: string | null;
  user?: { name?: string; sortable_name?: string };
}

/** Fetch a single student's submission for an assignment. */
export async function fetchSubmissionDetail(
  code: string,
  courseId: string,
  assignmentId: string,
  userId: number
): Promise<CanvasSubmissionDetail> {
  const { institution, token, baseUrl } = resolveInstitutionByCode(code);

  const assignmentResponse = await fetch(
    `${baseUrl}/api/v1/courses/${courseId}/assignments/${assignmentId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!assignmentResponse.ok) {
    throw canvasError(assignmentResponse.status, institution);
  }
  const assignment = (await assignmentResponse.json()) as CanvasAssignmentDetailItem;

  const submissionResponse = await fetch(
    `${baseUrl}/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${userId}?include[]=user`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!submissionResponse.ok) {
    throw canvasError(submissionResponse.status, institution);
  }
  const submission = (await submissionResponse.json()) as CanvasSubmissionItem;

  const text = submission.body ? htmlToText(submission.body) : "";

  const files: CanvasStudentWork["files"] = [];
  for (const attachment of submission.attachments ?? []) {
    if (!attachment.url) continue;
    if (typeof attachment.size === "number" && attachment.size > MAX_ATTACHMENT_BYTES) {
      continue;
    }
    try {
      const fileRes = await fetch(attachment.url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!fileRes.ok) continue;
      const buffer = await fileRes.arrayBuffer();
      if (buffer.byteLength > MAX_ATTACHMENT_BYTES) continue;
      files.push({
        name: attachment.filename || attachment.display_name || `attachment-${attachment.id ?? files.length}`,
        base64: Buffer.from(buffer).toString("base64"),
        mimeType: attachment["content-type"] || "application/octet-stream",
      });
    } catch {
      // Skip an attachment that cannot be downloaded rather than failing.
    }
  }

  const studentName =
    submission.user?.sortable_name?.trim() ||
    submission.user?.name?.trim() ||
    `User ${userId}`;

  return {
    student: studentName,
    assignmentName: assignment.name?.trim() || `Assignment ${assignmentId}`,
    courseId,
    assignmentId,
    userId,
    text,
    files,
    workflowState: submission.workflow_state ?? "unsubmitted",
    score: typeof submission.score === "number" ? submission.score : null,
    grade: submission.grade ?? null,
    submittedAt: submission.submitted_at ?? null,
    pointsPossible: typeof assignment.points_possible === "number" ? assignment.points_possible : null,
    canvasUrl: `${baseUrl}/courses/${courseId}/assignments/${assignmentId}`,
    speedGraderUrl: `${baseUrl}/courses/${courseId}/gradebook/speed_grader?assignment_id=${assignmentId}&student_id=${userId}`,
  };
}

/**
 * Build the grading queue for an institution acronym: assignments and graded
 * discussions with needs_grading_count > 0 across its active teacher courses.
 * Description and rubric come straight from the assignment list response, so the
 * scan costs one courses call plus one assignments call per course.
 */
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

/** Unread Canvas inbox conversation count for an institution (for badges). */
export async function getUnreadCount(code: string): Promise<number> {
  const { institution, token, baseUrl } = resolveInbox(code);
  const response = await fetch(`${baseUrl}/api/v1/conversations/unread_count`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const data = (await response.json()) as { unread_count?: string | number };
  const raw = typeof data.unread_count === "string" ? Number.parseInt(data.unread_count, 10) : data.unread_count;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}

/**
 * Post grades + comments back to Canvas, one PUT per student. Resolves the
 * assignment from the URL (assignment URLs directly; graded discussions via their
 * linked assignment) and continues past individual failures, reporting them.
 */
export async function postCanvasGrades(
  url: string,
  grades: Array<{
    userId: number;
    grade?: string;
    comment?: string;
    rubricAreas?: Array<{ area: string; score: string; comment: string }>;
  }>
): Promise<{ posted: number; failures: Array<{ userId: number; error: string }> }> {
  const parsed = parseCanvasUrl(url);
  if (!parsed) {
    throw new Error(
      "Could not read a discussion or assignment from that URL. Expected .../courses/123/discussion_topics/456 or .../courses/123/assignments/456."
    );
  }

  const { institution, token, baseUrl } = resolveInstitution(url);

  let assignmentId = parsed.kind === "assignment" ? parsed.id : "";
  if (parsed.kind === "discussion") {
    const response = await fetch(
      `${baseUrl}/api/v1/courses/${parsed.courseId}/discussion_topics/${parsed.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) {
      throw canvasError(response.status, institution);
    }
    const topic = (await response.json()) as CanvasDiscussionTopicObject;
    if (!topic.assignment_id) {
      throw new Error(
        "That discussion is not graded (no linked assignment), so grades cannot be posted to Canvas."
      );
    }
    assignmentId = String(topic.assignment_id);
  }

  // If the assignment has an attached rubric, build a normalized name -> criterion
  // id map so per-criterion scores can populate the SpeedGrader rubric.
  const criterionByName = new Map<string, string>();
  try {
    const assignment = await fetchAssignmentObject(
      baseUrl,
      token,
      institution,
      parsed.courseId,
      assignmentId
    );
    for (const criterion of assignment.rubric ?? []) {
      if (criterion.id && criterion.description) {
        criterionByName.set(normalizeCriterionName(criterion.description), criterion.id);
      }
    }
  } catch {
    // No rubric / can't read it: fall back to overall grade + comment only.
  }

  let posted = 0;
  const failures: Array<{ userId: number; error: string }> = [];

  for (const { userId, grade, comment, rubricAreas } of grades) {
    const params = new URLSearchParams();
    if (grade && grade.trim()) params.append("submission[posted_grade]", grade.trim());
    if (comment && comment.trim()) params.append("comment[text_comment]", comment.trim());

    if (criterionByName.size > 0) {
      for (const area of rubricAreas ?? []) {
        const criterionId = criterionByName.get(normalizeCriterionName(area.area));
        if (!criterionId) continue;
        const points = earnedPoints(area.score);
        if (points) params.append(`rubric_assessment[${criterionId}][points]`, points);
        if (area.comment.trim()) {
          params.append(`rubric_assessment[${criterionId}][comments]`, area.comment.trim());
        }
      }
    }

    if ([...params.keys()].length === 0) {
      continue; // nothing to post for this student
    }

    try {
      const response = await fetch(
        `${baseUrl}/api/v1/courses/${parsed.courseId}/assignments/${assignmentId}/submissions/${userId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        }
      );
      if (!response.ok) {
        const error =
          response.status === 404
            ? "No submission found for this student in Canvas (HTTP 404)."
            : response.status === 401 || response.status === 403
              ? `Not authorized to post this grade (check ${institution.code}_CANVAS_API_TOKEN's grading access).`
              : `Canvas rejected the grade (HTTP ${response.status}).`;
        failures.push({ userId, error });
        continue;
      }
      posted += 1;
    } catch (err) {
      failures.push({
        userId,
        error: err instanceof Error ? err.message : "Request failed.",
      });
    }
  }

  return { posted, failures };
}

/**
 * Pack Canvas work into a base64 zip that mirrors a Canvas "Download
 * Submissions" archive: flat files named `<lastfirst>_<userId>_<seq>_<name>`,
 * grouped by the leading student prefix. This lets the deterministic grading
 * service ingest Canvas-fetched posts/assignments the same way it ingests a real
 * Canvas zip.
 */
export async function canvasWorkToZipBase64(
  students: CanvasStudentWork[]
): Promise<string> {
  const zip = new JSZip();

  for (const work of students) {
    const sanitized = work.student.toLowerCase().replace(/[^a-z0-9]/g, "") || "student";
    const prefix = `${sanitized}_${work.userId}`;
    let seq = 0;

    if (work.text) {
      zip.file(`${prefix}_${seq}_post.txt`, work.text);
      seq += 1;
    }

    for (const file of work.files) {
      zip.file(`${prefix}_${seq}_${file.name}`, Buffer.from(file.base64, "base64"));
      seq += 1;
    }
  }

  return zip.generateAsync({ type: "base64" });
}

// ── Announcements ───────────────────────────────────────────────────────────
//
// Canvas announcements are discussion topics flagged is_announcement. The host
// selects the institution/token (same as grading); the URL only needs to carry
// the course (a bare .../courses/123 link is enough).

/** One announcement, ready for the UI. The message is plain text. */
export interface CanvasAnnouncement {
  id: number;
  title: string;
  message: string;
  postedAt: string | null;
  // When set and in the future, the announcement is scheduled: students cannot
  // see it until this time (Canvas delayed_post_at). Null for immediate posts.
  delayedPostAt: string | null;
  author: string;
  htmlUrl: string;
}

interface CanvasDiscussionTopicListItem {
  id?: number;
  title?: string;
  message?: string | null;
  posted_at?: string | null;
  delayed_post_at?: string | null;
  html_url?: string;
  author?: { display_name?: string } | null;
  user_name?: string;
}

function toAnnouncement(
  topic: CanvasDiscussionTopicListItem,
  fallback?: { title?: string; message?: string }
): CanvasAnnouncement {
  return {
    id: topic.id ?? 0,
    title: (topic.title ?? fallback?.title ?? "(untitled)").trim() || "(untitled)",
    message: topic.message
      ? htmlToText(topic.message)
      : (fallback?.message ?? "").trim(),
    postedAt: topic.posted_at ?? null,
    delayedPostAt: topic.delayed_post_at ?? null,
    author: topic.author?.display_name?.trim() || topic.user_name?.trim() || "",
    htmlUrl: topic.html_url ?? "",
  };
}

/** Fetch the course's display name for a heading. */
export async function getCourseName(courseUrl: string, code?: string): Promise<string> {
  const { courseId, institution, token, baseUrl } = resolveCourse(courseUrl, code);
  const response = await fetch(`${baseUrl}/api/v1/courses/${courseId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const course = (await response.json()) as { name?: string; course_code?: string };
  return course.name?.trim() || course.course_code?.trim() || `Course ${courseId}`;
}

/** Fetch course metadata: name, start date (ISO), and syllabus body (HTML). */
export async function getCourseInfo(
  courseUrl: string,
  code?: string
): Promise<{ name: string; startAt: string | null; syllabusBody: string }> {
  const { courseId, institution, token, baseUrl } = resolveCourse(courseUrl, code);
  const response = await fetch(`${baseUrl}/api/v1/courses/${courseId}?include[]=syllabus_body`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const data = (await response.json()) as { name?: string; start_at?: string | null; syllabus_body?: string | null };
  return {
    name: data.name ?? "",
    startAt: data.start_at ?? null,
    syllabusBody: data.syllabus_body ?? "",
  };
}

/**
 * Export a course as an IMS Common Cartridge (.imscc).
 * Returns the cartridge filename and base64-encoded content.
 * Polls the export status up to 3 minutes before timing out.
 */
export async function exportCourseCartridge(
  courseUrl: string,
  code?: string
): Promise<{ fileName: string; base64: string }> {
  const { courseId, institution, token, baseUrl } = resolveCourse(courseUrl, code);

  const exportResponse = await fetch(
    `${baseUrl}/api/v1/courses/${courseId}/content_exports?export_type=common_cartridge&skip_notifications=true`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!exportResponse.ok) {
    throw canvasError(exportResponse.status, institution);
  }

  const exportData = (await exportResponse.json()) as { id?: string };
  if (!exportData.id) {
    throw new Error("The LMS did not return an export ID.");
  }

  let attachment: { url?: string; filename?: string } | null = null;
  const maxAttempts = 36;
  const pollIntervalMs = 5000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const statusResponse = await fetch(
      `${baseUrl}/api/v1/courses/${courseId}/content_exports/${exportData.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!statusResponse.ok) {
      throw canvasError(statusResponse.status, institution);
    }

    const status = (await statusResponse.json()) as {
      workflow_state?: string;
      attachment?: { url?: string; filename?: string } | null;
    };
    if (status.workflow_state === "exported") {
      attachment = status.attachment ?? null;
      break;
    }
    if (status.workflow_state === "failed") {
      throw new Error("The LMS reported the export failed.");
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  if (!attachment?.url) {
    throw new Error("Timed out waiting for the LMS export (try again in a minute).");
  }

  let attachmentResponse = await fetch(attachment.url);
  if (!attachmentResponse.ok) {
    attachmentResponse = await fetch(attachment.url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!attachmentResponse.ok) {
      throw new Error("Could not download the export from the LMS.");
    }
  }

  const arrayBuffer = await attachmentResponse.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return {
    fileName: attachment.filename ?? "export.imscc",
    base64,
  };
}

/** List a course's recent announcements (newest first), one page of 50. */
export async function listAnnouncements(
  courseUrl: string,
  code?: string
): Promise<CanvasAnnouncement[]> {
  const { courseId, institution, token, baseUrl } = resolveCourse(courseUrl, code);
  const response = await fetch(
    `${baseUrl}/api/v1/courses/${courseId}/discussion_topics?only_announcements=true&per_page=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const topics = (await response.json()) as CanvasDiscussionTopicListItem[];
  const announcements = topics
    .filter((t) => typeof t.id === "number")
    .map((t) => toAnnouncement(t));

  // Sort: upcoming scheduled recaps must surface at the top of the panel.
  // Scheduled items (no postedAt, delayedPostAt set) sort first by soonest delayedPostAt.
  // Posted items (has postedAt) sort second by newest postedAt.
  announcements.sort((a, b) => {
    const aIsScheduled = !a.postedAt && a.delayedPostAt;
    const bIsScheduled = !b.postedAt && b.delayedPostAt;

    // Both scheduled: sort by delayedPostAt ascending (soonest first)
    if (aIsScheduled && bIsScheduled) {
      return (a.delayedPostAt ?? "").localeCompare(b.delayedPostAt ?? "");
    }
    // Only a is scheduled: a comes first
    if (aIsScheduled) return -1;
    // Only b is scheduled: b comes first
    if (bIsScheduled) return 1;
    // Both posted: sort by postedAt descending (newest first)
    return (b.postedAt ?? "").localeCompare(a.postedAt ?? "");
  });

  return announcements;
}

/**
 * Post a new announcement to the course. When `delayedPostAt` is set to a future
 * time, Canvas schedules it: students cannot see it until then. Returns the
 * created announcement.
 */
export async function createAnnouncement(
  courseUrl: string,
  title: string,
  message: string,
  code?: string,
  delayedPostAt?: string | null
): Promise<CanvasAnnouncement> {
  if (!title.trim()) throw new Error("An announcement needs a title.");
  if (!message.trim()) throw new Error("An announcement needs a message.");
  const { courseId, institution, token, baseUrl } = resolveCourse(courseUrl, code);

  const params = new URLSearchParams();
  params.append("title", title.trim());
  params.append("message", textToHtml(message.trim()));
  params.append("is_announcement", "true");
  if (delayedPostAt && delayedPostAt.trim()) {
    const when = new Date(delayedPostAt.trim());
    if (Number.isNaN(when.getTime())) {
      throw new Error("Could not read the scheduled visibility time.");
    }
    // Canvas hides the announcement from students until this time (ISO 8601).
    params.append("delayed_post_at", when.toISOString());
  }

  const response = await fetch(
    `${baseUrl}/api/v1/courses/${courseId}/discussion_topics`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const topic = (await response.json()) as CanvasDiscussionTopicListItem;
  return toAnnouncement(topic, { title, message });
}

// ── Inbox (Conversations) ───────────────────────────────────────────────────
//
// The Inbox is account-wide, not per-course, so these use the default
// institution's token. Conversation bodies are plain text (not HTML), so they
// pass through untouched apart from trimming.

export interface CanvasConversationSummary {
  id: number;
  subject: string;
  lastMessage: string;
  participants: string[];
  messageCount: number;
  workflowState: string;
  lastMessageAt: string | null;
}

export interface CanvasConversationMessage {
  id: number;
  authorId: number | null;
  author: string;
  body: string;
  createdAt: string | null;
}

export interface CanvasConversationDetail {
  id: number;
  subject: string;
  participants: string[];
  /** The signed-in user's Canvas id, so the UI can align their messages. */
  selfId: number | null;
  messages: CanvasConversationMessage[];
}

interface CanvasParticipant {
  id?: number;
  name?: string;
  full_name?: string;
}

interface CanvasConversationListItem {
  id?: number;
  subject?: string | null;
  workflow_state?: string;
  last_message?: string | null;
  last_message_at?: string | null;
  message_count?: number;
  participants?: CanvasParticipant[];
}

interface CanvasConversationDetailResponse {
  id?: number;
  subject?: string | null;
  participants?: CanvasParticipant[];
  messages?: Array<{
    id?: number;
    author_id?: number;
    created_at?: string | null;
    body?: string | null;
  }>;
}

function participantName(p: CanvasParticipant): string {
  return (p.name ?? p.full_name ?? (typeof p.id === "number" ? `User ${p.id}` : "")).trim();
}

/** List the account Inbox conversations (one page of 50, newest first). */
/** Inbox is account-wide; an acronym selects that school's token, else default. */
function resolveInbox(code?: string): {
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
} {
  return code ? resolveInstitutionByCode(code) : resolveDefaultInstitution();
}

// The signed-in user's Canvas id, cached per institution base URL (it never
// changes for a token), so the inbox thread can tell "me" from the student.
const selfIdCache = new Map<string, number>();
async function getSelfId(ctx: { token: string; baseUrl: string }): Promise<number | null> {
  const cached = selfIdCache.get(ctx.baseUrl);
  if (typeof cached === "number") return cached;
  try {
    const response = await fetch(`${ctx.baseUrl}/api/v1/users/self`, {
      headers: { Authorization: `Bearer ${ctx.token}` },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { id?: number };
    if (typeof data.id === "number") {
      selfIdCache.set(ctx.baseUrl, data.id);
      return data.id;
    }
  } catch {
    // Alignment is a nicety; fall back to null if self can't be read.
  }
  return null;
}

export async function listConversations(code?: string): Promise<CanvasConversationSummary[]> {
  const { institution, token, baseUrl } = resolveInbox(code);
  const response = await fetch(`${baseUrl}/api/v1/conversations?per_page=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const items = (await response.json()) as CanvasConversationListItem[];
  return items
    .filter((c) => typeof c.id === "number")
    .map((c) => ({
      id: c.id!,
      subject: (c.subject ?? "").trim() || "(no subject)",
      lastMessage: (c.last_message ?? "").trim(),
      participants: (c.participants ?? []).map(participantName).filter(Boolean),
      messageCount: typeof c.message_count === "number" ? c.message_count : 0,
      workflowState: c.workflow_state ?? "",
      lastMessageAt: c.last_message_at ?? null,
    }));
}

/** Fetch one conversation's full thread, oldest message first. */
export async function getConversation(
  id: number,
  code?: string
): Promise<CanvasConversationDetail> {
  const { institution, token, baseUrl } = resolveInbox(code);
  const response = await fetch(`${baseUrl}/api/v1/conversations/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const [data, selfId] = await Promise.all([
    response.json() as Promise<CanvasConversationDetailResponse>,
    getSelfId({ token, baseUrl }),
  ]);

  const names = new Map<number, string>();
  for (const p of data.participants ?? []) {
    if (typeof p.id === "number") {
      names.set(p.id, participantName(p) || `User ${p.id}`);
    }
  }

  const messages = (data.messages ?? [])
    .filter((m) => typeof m.id === "number")
    .map((m) => ({
      id: m.id!,
      authorId: typeof m.author_id === "number" ? m.author_id : null,
      author:
        typeof m.author_id === "number"
          ? names.get(m.author_id) ?? `User ${m.author_id}`
          : "",
      body: (m.body ?? "").trim(),
      createdAt: m.created_at ?? null,
    }))
    // Canvas returns newest-first; reverse so the thread reads top-to-bottom.
    .reverse();

  return {
    id: data.id ?? id,
    subject: (data.subject ?? "").trim() || "(no subject)",
    participants: [...names.values()],
    selfId,
    messages,
  };
}

/** Reply to a conversation. Canvas sends the reply to all participants. */
export async function replyToConversation(
  id: number,
  body: string,
  code?: string
): Promise<void> {
  if (!body.trim()) throw new Error("A reply needs a message.");
  const { institution, token, baseUrl } = resolveInbox(code);

  const params = new URLSearchParams();
  params.append("body", body.trim());

  const response = await fetch(
    `${baseUrl}/api/v1/conversations/${id}/add_message`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
}

/** Mark a conversation read/unread or archive it. */
export async function setConversationWorkflowState(
  id: number,
  state: "read" | "unread" | "archived",
  code?: string
): Promise<void> {
  const { institution, token, baseUrl } = resolveInbox(code);
  const params = new URLSearchParams();
  params.append("conversation[workflow_state]", state);

  const response = await fetch(`${baseUrl}/api/v1/conversations/${id}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
}

/** Create a new conversation (direct message) to one student in a course. */
export async function createConversation(
  courseUrl: string,
  recipientUserId: string,
  body: string,
  subject?: string
): Promise<void> {
  if (!body.trim()) throw new Error("A message needs a body.");
  const { institution, token, baseUrl } = resolveInstitution(courseUrl);

  const courseIdMatch = courseUrl.match(/\/courses\/(\d+)/);
  if (!courseIdMatch) {
    throw new Error("Could not read a course from that URL. Expected a link like .../courses/123.");
  }
  const courseId = courseIdMatch[1];

  const params = new URLSearchParams();
  params.append("recipients[]", recipientUserId);
  params.append("body", body.trim());
  if (subject && subject.trim()) {
    params.append("subject", subject.trim());
  }
  params.append("context_code", `course_${courseId}`);
  params.append("force_new", "1");

  const response = await fetch(`${baseUrl}/api/v1/conversations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
}

/**
 * List students who have not submitted an assignment by its deadline.
 * Filters based on workflow_state, submission timestamp, score, and due date.
 */
export async function listAssignmentNonSubmitters(
  baseUrl: string,
  token: string,
  institution: CanvasInstitution,
  courseId: string,
  assignmentId: string,
  nowIso: string
): Promise<CanvasMissingResult> {
  // Get assignment metadata
  const assignmentResponse = await fetch(
    `${baseUrl}/api/v1/courses/${courseId}/assignments/${assignmentId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!assignmentResponse.ok) {
    throw canvasError(assignmentResponse.status, institution);
  }
  const assignment = (await assignmentResponse.json()) as {
    id?: string;
    name?: string;
    due_at?: string | null;
    points_possible?: number | null;
    submission_types?: string[];
    grading_type?: string;
    published?: boolean;
    omit_from_final_grade?: boolean;
  };

  // Check if this assignment is eligible for auto-zeroing
  const eligible = isZeroableAssignment({
    submissionTypes: assignment.submission_types,
    gradingType: assignment.grading_type,
    published: assignment.published,
    omitFromFinalGrade: assignment.omit_from_final_grade,
  });

  if (!eligible) {
    let ineligibleReason = "cannot be auto-zeroed";
    if (assignment.published === false) {
      ineligibleReason = "is not published";
    } else if (assignment.grading_type === "not_graded") {
      ineligibleReason = "is not graded";
    } else if (assignment.omit_from_final_grade === true) {
      ineligibleReason = "is omitted from the final grade";
    } else {
      ineligibleReason = "does not take online submissions";
    }

    return {
      assignmentId: String(assignment.id ?? assignmentId),
      assignmentName: assignment.name ?? "Assignment",
      pointsPossible: assignment.points_possible ?? null,
      dueAt: assignment.due_at ?? null,
      nonSubmitters: [],
      eligible: false,
      ineligibleReason,
    };
  }

  // Page the submissions
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

  const nonSubmitters: CanvasNonSubmitter[] = [];
  const now = new Date(nowIso).getTime();

  for (const row of submissions) {
    if (!row) continue;

    // Never zero excused students
    if (row.excused === true) continue;

    // Correctness-critical filtering
    if (row.workflow_state !== "unsubmitted") continue;
    if (row.submitted_at) continue;
    if (row.score !== null && row.score !== undefined) continue;
    if (typeof row.user_id !== "number") continue;

    // cached_due_date is the student's effective due date (overrides applied):
    // a string = their deadline, null = no deadline for them (do NOT zero),
    // absent = fall back to the assignment's base due date.
    const due = Object.prototype.hasOwnProperty.call(row, "cached_due_date")
      ? row.cached_due_date
      : assignment.due_at ?? null;
    if (!due) continue;
    if (new Date(due).getTime() >= now) continue;

    // Keep this non-submitter
    nonSubmitters.push({
      userId: row.user_id,
      name: row.user?.sortable_name?.trim() || row.user?.name?.trim() || `User ${row.user_id}`,
    });
  }

  nonSubmitters.sort((a, b) => a.name.localeCompare(b.name));

  return {
    assignmentId: String(assignment.id ?? assignmentId),
    assignmentName: assignment.name ?? "Assignment",
    pointsPossible: assignment.points_possible ?? null,
    dueAt: assignment.due_at ?? null,
    nonSubmitters,
    eligible: true,
  };
}

/**
 * List all assignments in a course with their basic metadata.
 * Used to identify which assignments are past their due date.
 */
export async function listAssignmentBriefsWithDue(
  baseUrl: string,
  token: string,
  institution: CanvasInstitution,
  courseId: string
): Promise<CanvasAssignmentWithDue[]> {
  let next: string | null = `${baseUrl}/api/v1/courses/${courseId}/assignments?per_page=100`;
  const assignments: CanvasAssignmentWithDue[] = [];

  while (next) {
    const response = await fetch(next, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw canvasError(response.status, institution);
    }
    const page = (await response.json()) as Array<{
      id?: string;
      name?: string;
      due_at?: string | null;
      points_possible?: number | null;
      submission_types?: string[];
      grading_type?: string;
      published?: boolean;
      omit_from_final_grade?: boolean;
    }>;

    for (const item of page) {
      if (item.id) {
        assignments.push({
          assignmentId: String(item.id),
          name: item.name ?? "Assignment",
          dueAt: item.due_at ?? null,
          pointsPossible: item.points_possible ?? null,
          submissionTypes: item.submission_types ?? null,
          gradingType: item.grading_type ?? null,
          published: item.published ?? null,
          omitFromFinalGrade: item.omit_from_final_grade ?? null,
        });
      }
    }

    next = parseNextLink(response.headers.get("link"));
  }

  return assignments;
}
