/**
 * Canvas assignment submission fetching and packaging.
 */

import JSZip from "jszip";
import { canvasError, htmlToText, parseNextLink, type CanvasInstitution } from "../canvas-core";
import type { CanvasStudentWork } from "./discussions";

// Skip attachments larger than this to bound memory/latency.
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

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

export async function fetchAssignment(
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
