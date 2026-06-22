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
import { parseCanvasUrl } from "./canvas-url";

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
  description?: string;
  long_description?: string;
  points?: number;
  ratings?: CanvasRubricRating[];
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

  const { institution, token, baseUrl } = resolveInstitution(url);

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
 * Post grades + comments back to Canvas, one PUT per student. Resolves the
 * assignment from the URL (assignment URLs directly; graded discussions via their
 * linked assignment) and continues past individual failures, reporting them.
 */
export async function postCanvasGrades(
  url: string,
  grades: Array<{ userId: number; grade?: string; comment?: string }>
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

  let posted = 0;
  const failures: Array<{ userId: number; error: string }> = [];

  for (const { userId, grade, comment } of grades) {
    const params = new URLSearchParams();
    if (grade && grade.trim()) params.append("submission[posted_grade]", grade.trim());
    if (comment && comment.trim()) params.append("comment[text_comment]", comment.trim());
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
