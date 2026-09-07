/**
 * Canvas grade posting: submitting grades, comments, and rubric assessments back to Canvas.
 */

import { parseCanvasUrl } from "../canvas-url";
import { canvasError, resolveInstitution } from "../canvas-core";
import { canvasGet, canvasRequest } from "../canvas-fetch-response";
import { fetchAssignmentObject, normalizeCriterionName, earnedPoints } from "./metadata";

// ============================================================================
// The canvasFetch adapter - see src/lib/canvas-fetch-response.ts for the full
// failure-mapping reasoning (the discriminated union canvasFetch returns, and
// why each failure kind is a throw, not a value). Both bearer-carrying fetch
// calls in this file now go through canvasGet/canvasRequest.
//
// TIMEOUT: LEFT UNSPECIFIED, ON PURPOSE. Same rationale as
// src/lib/canvas-modules/fetch-helpers.ts's own "TIMEOUT: LEFT UNSPECIFIED,
// ON PURPOSE" note - neither call below has a deadline or attended/unattended
// flag to plumb through, so both omit timeoutMs and take canvasFetch's own
// DEFAULT_TIMEOUT_MS (15s).
//
// THE GRADE-POST WRITE IS DELIBERATELY NOT WRAPPED IN A CATCH-AND-CONTINUE.
// canvasRequest throws (never returns a value) for both canvasFetch failure
// kinds ("unreachable", "host-not-allowed") specifically because a write that
// failed mid-flight MIGHT HAVE BEEN APPLIED and must never be retried (see
// fetchWithThrottleRetry's own doc comment, and canvas-fetch-response.ts's
// module header). Before this migration, the per-student loop below caught
// EVERY exception from the write (bare fetch's rejected promise included) and
// recorded it into `failures` - a bucket callers treat as retry-eligible
// (a genuine Canvas rejection, e.g. a 404 or 403, is safe to retry, since
// Canvas never applied it). Continuing to catch a canvasRequest throw the
// same way would put an "unknown whether it applied" outcome into that same
// retry-eligible bucket, which is exactly the retryable-value conversion the
// adapter's own doc comment warns against. So the write below lets a
// canvasRequest throw propagate straight out of postCanvasGrades, aborting
// the rest of the batch rather than risking a caller retrying (and
// potentially double-posting) a grade whose fate is unknown. A genuine HTTP
// failure (`!response.ok` - Canvas answered and said no) is unaffected and
// still lands in `failures` exactly as before.
// ============================================================================

interface CanvasDiscussionTopicObject {
  message?: string | null;
  assignment_id?: number | null;
  assignment?: {
    rubric?: Array<{ id?: string; description?: string }>;
  } | null;
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
): Promise<{
  posted: number;
  failures: Array<{ userId: number; error: string }>;
  /** REGRESSION-class fix: a student whose payload produced no params (blank
   * grade AND blank comment, or a rubric-only payload whose criteria all
   * failed to name-match) used to `continue` silently here - not counted in
   * `posted`, not pushed to `failures`. Every caller then treated "absent
   * from failures" as proof of success, so a row could read "Posted to
   * Canvas" for a student whose grade never reached Canvas. This array is
   * the third outcome: a caller MUST check it (alongside `failures`) before
   * marking any userId "posted" - a userId is a genuine success only when it
   * appears in neither `failures` nor `skipped`. */
  skipped: Array<{ userId: number; reason: string }>;
}> {
  const parsed = parseCanvasUrl(url);
  if (!parsed) {
    throw new Error(
      "Could not read a discussion or assignment from that URL. Expected .../courses/123/discussion_topics/456 or .../courses/123/assignments/456."
    );
  }

  const { institution, token, baseUrl } = await resolveInstitution(url);

  let assignmentId = parsed.kind === "assignment" ? parsed.id : "";
  if (parsed.kind === "discussion") {
    const response = await canvasGet(
      `${baseUrl}/api/v1/courses/${parsed.courseId}/discussion_topics/${parsed.id}`,
      token
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
  const skipped: Array<{ userId: number; reason: string }> = [];

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
      // Nothing to post for this student - not a failure (Canvas was never
      // called), but NOT a success either. Recorded so every caller can tell
      // this apart from a genuine post.
      skipped.push({ userId, reason: "No grade or comment to send for this student." });
      continue;
    }

    // Deliberately NOT wrapped in try/catch: see this file's module doc
    // comment ("THE GRADE-POST WRITE IS DELIBERATELY NOT WRAPPED IN A
    // CATCH-AND-CONTINUE"). A canvasRequest throw here (an "unreachable" or
    // "host-not-allowed" adapter failure) propagates straight out of
    // postCanvasGrades rather than being folded into `failures`, so the rest
    // of the batch is never attempted once one write's outcome is unknown. A
    // completed HTTP exchange - Canvas actually answered, even with a
    // rejection - is unaffected and still handled by `!response.ok` below.
    const response = await canvasRequest(
      `${baseUrl}/api/v1/courses/${parsed.courseId}/assignments/${assignmentId}/submissions/${userId}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      },
      token
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
  }

  return { posted, failures, skipped };
}
