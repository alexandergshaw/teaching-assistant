/**
 * Canvas submission detail retrieval for individual students.
 */

import { canvasError, htmlToText, resolveInstitutionByCode } from "../canvas-core";
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

interface CanvasAssignmentDetailItem {
  id?: number;
  name?: string;
  points_possible?: number | null;
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
