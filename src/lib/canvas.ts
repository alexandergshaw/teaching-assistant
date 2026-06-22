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
import { parseCanvasUrl, parseCanvasCourseId, type ParsedCanvasUrl } from "./canvas-url";

/**
 * Registered Canvas institutions, keyed by hostname. The URL's host selects the
 * institution; its credentials come from per-institution env vars:
 *   <CODE>_CANVAS_API_TOKEN  (required) — instructor access token
 *   <CODE>_CANVAS_URL        (optional) — base URL override (defaults to https://<host>)
 * To add a school: add an entry here and set its env vars. No other code changes.
 */
interface CanvasInstitution {
  code: string;
  name: string;
  host: string;
}

const CANVAS_INSTITUTIONS: CanvasInstitution[] = [
  { code: "MCC", name: "Metropolitan Community College", host: "canvas.mccneb.edu" },
];

// Skip attachments larger than this to bound memory/latency.
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

/** Match a Canvas URL to a registered institution by its hostname. */
function institutionForUrl(url: string): CanvasInstitution | null {
  let host: string;
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
  return CANVAS_INSTITUTIONS.find((inst) => inst.host.toLowerCase() === host) ?? null;
}

function institutionBaseUrl(inst: CanvasInstitution): string {
  return (process.env[`${inst.code}_CANVAS_URL`] ?? `https://${inst.host}`).replace(/\/+$/, "");
}

function institutionToken(inst: CanvasInstitution): string | undefined {
  return process.env[`${inst.code}_CANVAS_API_TOKEN`] || undefined;
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
}

// Minimal HTML-to-text for Canvas message/body bodies (stored as HTML).
function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Wrap a plain-text body in minimal, escaped HTML so line breaks survive when
// Canvas stores and renders it (announcement/message bodies are HTML fields).
function textToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

interface CanvasViewEntry {
  id?: number;
  user_id?: number;
  message?: string | null;
  deleted?: boolean;
  replies?: CanvasViewEntry[];
}

interface CanvasViewResponse {
  participants?: Array<{ id?: number; display_name?: string }>;
  view?: CanvasViewEntry[];
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
}

function canvasError(status: number, inst: CanvasInstitution): Error {
  switch (status) {
    case 401:
    case 403:
      return new Error(
        `Canvas rejected the request: the API token is missing, invalid, or lacks access to this course (${inst.code}_CANVAS_API_TOKEN).`
      );
    case 404:
      return new Error(
        "Canvas could not find that discussion or assignment. Check the URL and that the token's account can see it."
      );
    default:
      return new Error(`Canvas request failed (HTTP ${status}).`);
  }
}

/** Resolve the institution + credentials for a URL, or throw a clear error. */
function resolveInstitution(url: string): {
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
} {
  const institution = institutionForUrl(url);
  if (!institution) {
    const supported = CANVAS_INSTITUTIONS.map((inst) => inst.host).join(", ");
    throw new Error(
      `That Canvas host is not configured. Supported institutions: ${supported || "none"}.`
    );
  }
  const token = institutionToken(institution);
  if (!token) {
    throw new Error(
      `Canvas API token is not configured for ${institution.name}. Set ${institution.code}_CANVAS_API_TOKEN in the environment.`
    );
  }
  return { institution, token, baseUrl: institutionBaseUrl(institution) };
}

/**
 * Resolve credentials for institution-wide calls that have no course URL to key
 * off (e.g. the Inbox, which is account-wide). Picks the first registered
 * institution that has a token configured. With a single institution this is
 * unambiguous; if more are added, a chooser can select among them.
 */
function resolveDefaultInstitution(): {
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
} {
  for (const institution of CANVAS_INSTITUTIONS) {
    const token = institutionToken(institution);
    if (token) {
      return { institution, token, baseUrl: institutionBaseUrl(institution) };
    }
  }
  throw new Error(
    "No Canvas API token is configured. Set <CODE>_CANVAS_API_TOKEN for a registered institution."
  );
}

/**
 * Resolve Canvas credentials for an institution acronym (MCC, MPCC, ...) used by
 * the Live Feed, which has no course URL to key off. Everything is env-driven:
 *   <CODE>_CANVAS_URL        (required) — base URL, e.g. https://canvas.mccneb.edu
 *   <CODE>_CANVAS_API_TOKEN  (required) — instructor token
 * The host is derived from the base URL only for error/display purposes.
 */
function resolveInstitutionByCode(code: string): {
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
} {
  const upper = code.trim().toUpperCase();
  if (!upper) {
    throw new Error("An institution acronym is required.");
  }
  const baseRaw = process.env[`${upper}_CANVAS_URL`];
  const token = process.env[`${upper}_CANVAS_API_TOKEN`] || undefined;
  if (!baseRaw) {
    throw new Error(
      `Canvas base URL is not configured for ${upper}. Set ${upper}_CANVAS_URL in the environment.`
    );
  }
  if (!token) {
    throw new Error(
      `Canvas API token is not configured for ${upper}. Set ${upper}_CANVAS_API_TOKEN in the environment.`
    );
  }
  let host = "";
  try {
    host = new URL(baseRaw).host.toLowerCase();
  } catch {
    // Base URL is malformed; keep host blank — the fetch below will surface it.
  }
  return {
    institution: { code: upper, name: upper, host },
    token,
    baseUrl: baseRaw.replace(/\/+$/, ""),
  };
}

/** Follow the RFC-5988 Link header to the next page, if any. */
function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Fetch a Canvas discussion or assignment (auto-detected from the URL) and
 * return one work item per student. The host selects the institution/token.
 */
export async function fetchCanvasWork(
  url: string
): Promise<{ kind: "discussion" | "assignment"; students: CanvasStudentWork[] }> {
  const parsed = parseCanvasUrl(url);
  if (!parsed) {
    throw new Error(
      "Could not read a discussion or assignment from that URL. Expected .../courses/123/discussion_topics/456 or .../courses/123/assignments/456."
    );
  }

  const { institution, token, baseUrl } = resolveInstitution(url);

  const students =
    parsed.kind === "discussion"
      ? await fetchDiscussion(baseUrl, token, institution, parsed.courseId, parsed.id)
      : await fetchAssignment(baseUrl, token, institution, parsed.courseId, parsed.id);

  return { kind: parsed.kind, students };
}

async function fetchDiscussion(
  baseUrl: string,
  token: string,
  institution: CanvasInstitution,
  courseId: string,
  topicId: string
): Promise<CanvasStudentWork[]> {
  const endpoint = `${baseUrl}/api/v1/courses/${courseId}/discussion_topics/${topicId}/view`;
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }

  const data = (await response.json()) as CanvasViewResponse;

  const names = new Map<number, string>();
  for (const participant of data.participants ?? []) {
    if (typeof participant.id === "number") {
      names.set(participant.id, participant.display_name?.trim() || `User ${participant.id}`);
    }
  }

  const byUser = new Map<number, string[]>();
  const walk = (entries: CanvasViewEntry[] | undefined, depth: number) => {
    for (const entry of entries ?? []) {
      if (!entry.deleted && typeof entry.user_id === "number" && entry.message) {
        const text = htmlToText(entry.message);
        if (text) {
          const label = depth === 0 ? "Post" : "Reply";
          const bucket = byUser.get(entry.user_id) ?? [];
          bucket.push(`${label}: ${text}`);
          byUser.set(entry.user_id, bucket);
        }
      }
      if (entry.replies?.length) {
        walk(entry.replies, depth + 1);
      }
    }
  };
  walk(data.view, 0);

  const students: CanvasStudentWork[] = [];
  for (const [userId, texts] of byUser) {
    students.push({
      student: names.get(userId) ?? `User ${userId}`,
      userId,
      text: texts.join("\n\n---\n\n"),
      files: [],
      contributionCount: texts.length,
    });
  }
  students.sort((a, b) => a.student.localeCompare(b.student));
  return students;
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
  htmlUrl: string;
  canvasUrl: string;
  description: string;
  rubricText: string;
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
}

async function listActiveTeacherCourses(ctx: {
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
}): Promise<Array<{ id: string; name: string }>> {
  const { institution, token, baseUrl } = ctx;
  let next: string | null = `${baseUrl}/api/v1/courses?enrollment_type=teacher&enrollment_state=active&per_page=100`;
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
 * Build the grading queue for an institution acronym: assignments and graded
 * discussions with needs_grading_count > 0 across its active teacher courses.
 * Description and rubric come straight from the assignment list response, so the
 * scan costs one courses call plus one assignments call per course.
 */
export async function listGradingQueue(code: string): Promise<CanvasQueueItem[]> {
  const ctx = resolveInstitutionByCode(code);
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
          htmlUrl: assignment.html_url ?? canvasUrl,
          canvasUrl,
          description: assignment.description ? htmlToText(assignment.description) : "",
          rubricText: formatRubric(assignment.rubric),
        });
      }
      next = parseNextLink(response.headers.get("link"));
    }
  }

  // The assignments list often omits the full description (and a graded
  // discussion's prompt lives on its topic, not the assignment), so pull each
  // row's description + rubric from the same show endpoints the single-URL flow
  // uses. Failures keep whatever the list gave.
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
        // Keep the list-derived fallback values.
      }
    })
  );

  items.sort(
    (a, b) => a.courseName.localeCompare(b.courseName) || a.title.localeCompare(b.title)
  );
  return items;
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
  author: string;
  htmlUrl: string;
}

interface CanvasDiscussionTopicListItem {
  id?: number;
  title?: string;
  message?: string | null;
  posted_at?: string | null;
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
    author: topic.author?.display_name?.trim() || topic.user_name?.trim() || "",
    htmlUrl: topic.html_url ?? "",
  };
}

/** Resolve a course URL to its id + credentials, or throw a clear error. */
function resolveCourse(courseUrl: string): {
  courseId: string;
  institution: CanvasInstitution;
  token: string;
  baseUrl: string;
} {
  const courseId = parseCanvasCourseId(courseUrl);
  if (!courseId) {
    throw new Error(
      "Could not read a course from that URL. Expected a link like .../courses/123."
    );
  }
  return { courseId, ...resolveInstitution(courseUrl) };
}

/** Fetch the course's display name for a heading. */
export async function getCourseName(courseUrl: string): Promise<string> {
  const { courseId, institution, token, baseUrl } = resolveCourse(courseUrl);
  const response = await fetch(`${baseUrl}/api/v1/courses/${courseId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const course = (await response.json()) as { name?: string; course_code?: string };
  return course.name?.trim() || course.course_code?.trim() || `Course ${courseId}`;
}

/** List a course's recent announcements (newest first), one page of 50. */
export async function listAnnouncements(courseUrl: string): Promise<CanvasAnnouncement[]> {
  const { courseId, institution, token, baseUrl } = resolveCourse(courseUrl);
  const response = await fetch(
    `${baseUrl}/api/v1/courses/${courseId}/discussion_topics?only_announcements=true&per_page=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const topics = (await response.json()) as CanvasDiscussionTopicListItem[];
  return topics
    .filter((t) => typeof t.id === "number")
    .map((t) => toAnnouncement(t))
    .sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));
}

/** Post a new announcement to the course. Returns the created announcement. */
export async function createAnnouncement(
  courseUrl: string,
  title: string,
  message: string
): Promise<CanvasAnnouncement> {
  if (!title.trim()) throw new Error("An announcement needs a title.");
  if (!message.trim()) throw new Error("An announcement needs a message.");
  const { courseId, institution, token, baseUrl } = resolveCourse(courseUrl);

  const params = new URLSearchParams();
  params.append("title", title.trim());
  params.append("message", textToHtml(message.trim()));
  params.append("is_announcement", "true");

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
  author: string;
  body: string;
  createdAt: string | null;
}

export interface CanvasConversationDetail {
  id: number;
  subject: string;
  participants: string[];
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
export async function listConversations(): Promise<CanvasConversationSummary[]> {
  const { institution, token, baseUrl } = resolveDefaultInstitution();
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
export async function getConversation(id: number): Promise<CanvasConversationDetail> {
  const { institution, token, baseUrl } = resolveDefaultInstitution();
  const response = await fetch(`${baseUrl}/api/v1/conversations/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw canvasError(response.status, institution);
  }
  const data = (await response.json()) as CanvasConversationDetailResponse;

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
    messages,
  };
}

/** Reply to a conversation. Canvas sends the reply to all participants. */
export async function replyToConversation(id: number, body: string): Promise<void> {
  if (!body.trim()) throw new Error("A reply needs a message.");
  const { institution, token, baseUrl } = resolveDefaultInstitution();

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
