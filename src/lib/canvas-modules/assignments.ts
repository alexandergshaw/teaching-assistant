import { resolveCourse, textToHtml } from "../canvas-core";
import { writeJson } from "./fetch-helpers";
import type { NewAssignment } from "./types";

/** Create an assignment in the course. Returns its id, name, and URL. */
export async function createAssignment(
  courseUrl: string,
  a: NewAssignment,
  code?: string
): Promise<{ id: number; name: string; htmlUrl: string }> {
  if (!a.name.trim()) throw new Error("An assignment needs a name.");
  const ctx = resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  params.append("assignment[name]", a.name.trim());
  if (a.description.trim()) params.append("assignment[description]", textToHtml(a.description.trim()));
  if (a.pointsPossible !== null && Number.isFinite(a.pointsPossible)) params.append("assignment[points_possible]", String(a.pointsPossible));
  if (a.dueAt.trim()) params.append("assignment[due_at]", new Date(a.dueAt).toISOString());
  params.append("assignment[submission_types][]", a.submissionType || "online_text_entry");
  params.append("assignment[published]", a.published ? "true" : "false");
  if (a.unlockAt?.trim()) params.append("assignment[unlock_at]", new Date(a.unlockAt).toISOString());
  if (a.lockAt?.trim()) params.append("assignment[lock_at]", new Date(a.lockAt).toISOString());
  if (a.gradingType?.trim()) params.append("assignment[grading_type]", a.gradingType);
  if (typeof a.allowedAttempts === "number" && a.allowedAttempts !== 0) params.append("assignment[allowed_attempts]", String(a.allowedAttempts));
  if (a.allowedExtensions?.trim()) {
    for (const ext of a.allowedExtensions.split(",").map((x) => x.trim().replace(/^\./, "")).filter(Boolean)) {
      params.append("assignment[allowed_extensions][]", ext);
    }
  }
  if (a.peerReviews) params.append("assignment[peer_reviews]", "true");
  if (a.omitFromFinalGrade) params.append("assignment[omit_from_final_grade]", "true");
  if (typeof a.assignmentGroupId === "number") params.append("assignment[assignment_group_id]", String(a.assignmentGroupId));
  const raw = await writeJson<{ id?: number; name?: string; html_url?: string }>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/assignments`,
    "POST",
    ctx,
    params
  );
  if (!raw.id) throw new Error("Canvas did not return an assignment id.");
  return {
    id: raw.id,
    name: raw.name ?? a.name,
    htmlUrl: raw.html_url ?? "",
  };
}
