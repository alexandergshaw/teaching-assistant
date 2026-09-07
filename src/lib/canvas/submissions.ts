/**
 * Canvas assignment submission fetching and packaging.
 */

import JSZip from "jszip";
import { canvasError, htmlToText, parseNextLink, type CanvasInstitution } from "../canvas-core";
import { assertCanvasSuppliedUrlIsSameOrigin, CANVAS_PAGINATION_PAGE_CAP } from "../canvas-remote-url";
import { canvasGet } from "../canvas-fetch-response";
import type { CanvasStudentWork } from "./discussions";

// ============================================================================
// The canvasFetch adapter migration - see src/lib/canvas-fetch-response.ts's
// own doc comment for the full failure-mapping reasoning (both bearer-carrying
// fetches below now go through canvasGet, which pins the dialled connection
// to a resolved-and-classified address (SEC1) and never follows a redirect
// blind (SEC2)). TIMEOUT is left unspecified on both calls, per
// canvas-modules/fetch-helpers.ts's own "LEFT UNSPECIFIED, ON PURPOSE"
// rationale - this file has no deadline/attended flag to plumb through
// either, so both calls fall through to canvasFetch's own DEFAULT_TIMEOUT_MS.
//
// THE ATTACHMENT-URL SPLIT DOES NOT APPLY HERE THE WAY IT DOES IN
// announcements.ts's exportCourseCartridge. That function makes TWO fetches
// for one attachment URL - an unauthenticated attempt (assertCanvasSuppliedUrlIsPublic,
// may leave the Canvas origin, stays on bare fetch because it carries no
// bearer) and, only if that fails, a bearer-carrying retry
// (assertCanvasSuppliedUrlIsSameOrigin, migrated to canvasGet). This file's
// attachment download below is a DIFFERENT shape: a single fetch, already
// guarded by assertCanvasSuppliedUrlIsSameOrigin, that always carries the
// bearer token - there is no preceding unauthenticated attempt to preserve on
// bare fetch. A same-origin-locked call that carries a bearer is exactly the
// kind of call this migration moves onto canvasGet (that is the "bearer
// retry" half of the split, not the "free download" half), so it migrates
// like every other call in this file rather than staying behind.
// ============================================================================

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
  // Canvas returns these as standard submission fields regardless of the
  // include[] params requested - populated for "online_url" (and similar
  // link-based) submissions, e.g. a student pasting a GitHub repo link.
  url?: string | null;
  submission_type?: string | null;
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

  let pagesFetched = 0;
  while (next && pagesFetched < CANVAS_PAGINATION_PAGE_CAP) {
    const response = await canvasGet(next, token);
    if (!response.ok) {
      throw canvasError(response.status, institution);
    }
    pagesFetched++;
    const page = (await response.json()) as CanvasSubmission[];
    submissions.push(...page);
    // E-CRIT1. Capped but NOT origin-checked until now - the eleventh such
    // follow found in this codebase, and the one that slipped through a
    // file-level sweep because this file mentions the guard four times
    // already, all of them for ATTACHMENT urls rather than for this loop.
    // That near-miss is why the structural test beside this file counts call
    // sites rather than files.
    //
    // Dial the guard's RETURN value, never the input: a relative Link header
    // resolves against baseUrl inside the guard, so the two can differ.
    const rawNext = parseNextLink(response.headers.get("link"));
    next = rawNext ? assertCanvasSuppliedUrlIsSameOrigin(rawNext, baseUrl) : null;
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

    // A link-based submission ("online_url", plus similar LTI-launch types)
    // carries no body/attachments but does carry `url`. "on_paper"/"none"
    // never represent real content even if Canvas echoes a stray url, so they
    // are excluded rather than trusting url presence alone.
    const rawUrl = typeof submission.url === "string" ? submission.url.trim() : "";
    const submissionType = typeof submission.submission_type === "string" ? submission.submission_type : null;
    const submittedUrl =
      rawUrl && submissionType !== "on_paper" && submissionType !== "none" ? rawUrl : null;

    const files: CanvasStudentWork["files"] = [];
    for (const attachment of submission.attachments ?? []) {
      if (!attachment.url) continue;
      if (typeof attachment.size === "number" && attachment.size > MAX_ATTACHMENT_BYTES) {
        continue;
      }
      try {
        // E-CRIT1: attachment.url is Canvas-supplied, so it is checked and
        // then dialled by the guard's RETURNED string, never the raw
        // candidate (see src/lib/canvas-remote-url.ts). A cross-origin or
        // malformed attachment URL throws here and is caught below, skipping
        // just that attachment rather than the whole fetch.
        const safeAttachmentUrl = assertCanvasSuppliedUrlIsSameOrigin(attachment.url, baseUrl);
        const fileRes = await canvasGet(safeAttachmentUrl, token);
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

    if (!text && files.length === 0 && !submittedUrl) {
      continue;
    }

    students.push({ student, userId, text, files, contributionCount: 1, submissionUrl: submittedUrl });
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
