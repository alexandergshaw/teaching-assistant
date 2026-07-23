/**
 * Canvas grade posting: submitting grades, comments, and rubric assessments back to Canvas.
 */

import { parseCanvasUrl } from "../canvas-url";
import { canvasError, resolveInstitution } from "../canvas-core";
import { fetchAssignmentObject, normalizeCriterionName, earnedPoints } from "./metadata";

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
