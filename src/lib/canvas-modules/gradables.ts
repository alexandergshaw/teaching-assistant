import { canvasError, resolveCourse } from "../canvas-core";
import { writeJson } from "./fetch-helpers";
import type { GradableKind, GradableDetail } from "./types";

function descriptionToHtml(text: string): string {
  if (text.trim() === "") return text;
  if (/<\/?[a-z][\s\S]*>/i.test(text)) return text;
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(/\r\n?/g, "\n").replace(/\n/g, "<br>\n");
}

/** Fetch one assignment/quiz/discussion's title + description for editing. */
export async function getGradable(
  courseUrl: string,
  kind: GradableKind,
  contentId: number,
  code?: string
): Promise<GradableDetail> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  const url =
    kind === "Assignment"
      ? `${base}/assignments/${contentId}`
      : kind === "Quiz"
        ? `${base}/quizzes/${contentId}`
        : `${base}/discussion_topics/${contentId}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${ctx.token}` } });
  if (!response.ok) {
    throw canvasError(response.status, ctx.institution);
  }
  const data = (await response.json()) as {
    name?: string;
    title?: string;
    description?: string | null;
    message?: string | null;
    rubric_settings?: { id?: number } | null;
    submission_types?: string[];
  };
  return {
    title: (data.name ?? data.title ?? "").trim(),
    description: (kind === "Discussion" ? data.message : data.description) ?? "",
    rubricId: typeof data.rubric_settings?.id === "number" ? data.rubric_settings.id : undefined,
    submissionTypes: kind === "Assignment" && Array.isArray(data.submission_types) ? data.submission_types : [],
  };
}

/** Update an assignment/quiz/discussion's title, description, and/or points. */
export async function updateGradable(
  courseUrl: string,
  kind: GradableKind,
  contentId: number,
  fields: { title?: string; description?: string; pointsPossible?: number; submissionType?: string },
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  const params = new URLSearchParams();
  const description = fields.description !== undefined ? descriptionToHtml(fields.description) : undefined;
  if (kind === "Assignment") {
    if (fields.title !== undefined) params.append("assignment[name]", fields.title);
    if (description !== undefined) params.append("assignment[description]", description);
    if (fields.pointsPossible !== undefined) params.append("assignment[points_possible]", String(fields.pointsPossible));
    if (fields.submissionType !== undefined) params.append("assignment[submission_types][]", fields.submissionType);
    if ([...params.keys()].length > 0) await writeJson(`${base}/assignments/${contentId}`, "PUT", ctx, params);
    return;
  }
  if (kind === "Quiz") {
    if (fields.title !== undefined) params.append("quiz[title]", fields.title);
    if (description !== undefined) params.append("quiz[description]", description);
    if (fields.pointsPossible !== undefined) params.append("quiz[points_possible]", String(fields.pointsPossible));
    if ([...params.keys()].length > 0) await writeJson(`${base}/quizzes/${contentId}`, "PUT", ctx, params);
    return;
  }
  if (fields.title !== undefined) params.append("title", fields.title);
  if (description !== undefined) params.append("message", description);
  if ([...params.keys()].length > 0) await writeJson(`${base}/discussion_topics/${contentId}`, "PUT", ctx, params);
}

/**
 * Create a new assignment/quiz/discussion (the target of a "change type"). Made
 * unpublished by default. Returns the new content id. Quizzes ignore points
 * (Canvas computes a classic quiz's total from its questions).
 */
export async function createGradable(
  courseUrl: string,
  kind: GradableKind,
  fields: { title: string; description?: string; pointsPossible?: number; dueAt?: string | null; submissionType?: string },
  code?: string
): Promise<{ id: number }> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  const params = new URLSearchParams();
  const due = fields.dueAt ?? "";
  const description = fields.description !== undefined ? descriptionToHtml(fields.description) : undefined;

  if (kind === "Assignment") {
    params.append("assignment[name]", fields.title);
    if (description !== undefined) params.append("assignment[description]", description);
    if (fields.pointsPossible !== undefined) params.append("assignment[points_possible]", String(fields.pointsPossible));
    if (due) params.append("assignment[due_at]", due);
    params.append("assignment[submission_types][]", fields.submissionType || "online_text_entry");
    params.append("assignment[published]", "false");
    const data = await writeJson<{ id?: number }>(`${base}/assignments`, "POST", ctx, params);
    if (typeof data.id !== "number") throw new Error("Canvas did not return the new assignment id.");
    return { id: data.id };
  }
  if (kind === "Quiz") {
    params.append("quiz[title]", fields.title);
    if (description !== undefined) params.append("quiz[description]", description);
    if (due) params.append("quiz[due_at]", due);
    params.append("quiz[quiz_type]", "assignment");
    params.append("quiz[published]", "false");
    const data = await writeJson<{ id?: number }>(`${base}/quizzes`, "POST", ctx, params);
    if (typeof data.id !== "number") throw new Error("Canvas did not return the new quiz id.");
    return { id: data.id };
  }
  params.append("title", fields.title);
  if (description !== undefined) params.append("message", description);
  params.append("published", "false");
  if (fields.pointsPossible !== undefined) params.append("assignment[points_possible]", String(fields.pointsPossible));
  if (due) params.append("assignment[due_at]", due);
  const data = await writeJson<{ id?: number }>(`${base}/discussion_topics`, "POST", ctx, params);
  if (typeof data.id !== "number") throw new Error("Canvas did not return the new discussion id.");
  return { id: data.id };
}
