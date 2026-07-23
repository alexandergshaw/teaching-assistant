/**
 * Canvas assignment/discussion metadata: descriptions, rubrics, and points possible.
 */

import { parseCanvasUrl, type ParsedCanvasUrl, extractCanvasFileIds } from "../canvas-url";
import { canvasError, htmlToText, type CanvasInstitution, resolveInstitution } from "../canvas-core";

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

// Normalize a criterion/area name for matching ("Code Style (5 pts)" -> "code style").
export function normalizeCriterionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(\s*\d+(?:\.\d+)?\s*(?:pts?|points?|%)?\s*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Pull earned points out of a score string ("7/10" -> "7", "85%" -> "85").
export function earnedPoints(score: string): string {
  const fraction = score.match(/(-?\d+(?:\.\d+)?)\s*\/\s*-?\d+/);
  if (fraction) return fraction[1];
  const num = score.match(/-?\d+(?:\.\d+)?/);
  return num ? num[0] : "";
}

// Render a Canvas rubric (criteria + point-rating tiers) as plain rubric text.
export function formatRubric(rubric: CanvasRubricCriterion[] | undefined): string {
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

export async function fetchAssignmentObject(
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
): Promise<{ description: string; rubricText: string; linkedFileIds: number[] }> {
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
export async function fetchCanvasMetaWith(
  ctx: { institution: CanvasInstitution; token: string; baseUrl: string },
  parsed: ParsedCanvasUrl
): Promise<{ description: string; rubricText: string; linkedFileIds: number[] }> {
  const { institution, token, baseUrl } = ctx;

  if (parsed.kind === "assignment") {
    const assignment = await fetchAssignmentObject(
      baseUrl,
      token,
      institution,
      parsed.courseId,
      parsed.id
    );
    const descriptionHtml = assignment.description ?? "";
    const linkedFileIds = extractCanvasFileIds(descriptionHtml);
    return {
      description: descriptionHtml ? htmlToText(descriptionHtml) : "",
      rubricText: formatRubric(assignment.rubric),
      linkedFileIds,
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
  const messageHtml = topic.message ?? "";
  const linkedFileIds = extractCanvasFileIds(messageHtml);
  const description = messageHtml ? htmlToText(messageHtml) : "";

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

  return { description, rubricText, linkedFileIds };
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
