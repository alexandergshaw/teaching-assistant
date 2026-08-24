import { canvasError, resolveCourse } from "../canvas-core";
import { writeJson } from "./fetch-helpers";
import type { GradableKind, GradableDetail } from "./types";

// Exported (DEFECT 9 fix, docs/llm-command-interface-acceptance-criteria.md
// section 10 G13): command-apply-outcome.ts's plainTextToPageHtml used to
// restate this same conversion byte-for-byte as an independent, private
// copy, because this function was not exported and a "use server" file may
// export only async functions (so it could not live there either). Nothing
// enforced the two copies staying identical, and G13 requires the proposal
// preview to show the EXACT bytes that will be sent - a drift here would
// have made that preview a lie about a live Canvas write while every gate
// stayed green. plainTextToPageHtml now delegates to this export instead of
// re-implementing it.
export function descriptionToHtml(text: string): string {
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

/**
 * Update an assignment/quiz/discussion's title, description, and/or points.
 * Returns Canvas's own parsed response for whichever branch actually wrote
 * (undefined when no field was supplied and no write was made), so a caller
 * can read back what actually landed instead of trusting the sent value
 * (errata G4, docs/llm-command-interface-acceptance-criteria.md section 10) -
 * this is purely additive: every existing caller already discards the
 * resolved value, so `await updateGradable(...)` still compiles unchanged.
 */
export async function updateGradable(
  courseUrl: string,
  kind: GradableKind,
  contentId: number,
  fields: { title?: string; description?: string; pointsPossible?: number; submissionType?: string },
  code?: string
): Promise<Record<string, unknown> | undefined> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  const params = new URLSearchParams();
  const description = fields.description !== undefined ? descriptionToHtml(fields.description) : undefined;
  if (kind === "Assignment") {
    if (fields.title !== undefined) params.append("assignment[name]", fields.title);
    if (description !== undefined) params.append("assignment[description]", description);
    if (fields.pointsPossible !== undefined) params.append("assignment[points_possible]", String(fields.pointsPossible));
    if (fields.submissionType !== undefined) params.append("assignment[submission_types][]", fields.submissionType);
    if ([...params.keys()].length === 0) return undefined;
    return await writeJson<Record<string, unknown>>(`${base}/assignments/${contentId}`, "PUT", ctx, params);
  }
  if (kind === "Quiz") {
    if (fields.title !== undefined) params.append("quiz[title]", fields.title);
    if (description !== undefined) params.append("quiz[description]", description);
    if (fields.pointsPossible !== undefined) params.append("quiz[points_possible]", String(fields.pointsPossible));
    if ([...params.keys()].length === 0) return undefined;
    // G6: quizzes_api_controller.rb documents quiz[notify_of_update] as
    // "Defaults to true". Assignments, pages, and discussions are all silent
    // on a description-only PUT - their notification policies require
    // points_possible to change, or this same parameter, which this app
    // never sends on THOSE branches. Quizzes are the one exception, so this
    // must be sent explicitly here or a bulk rewrite of N quizzes emails
    // "the quiz has changed" to the whole roster N times - the only Canvas
    // write in this file that reaches anyone outside the instructor's own
    // browser. Do NOT "tidy" this onto the assignment or discussion branches
    // above/below: they have no such default, so adding it there would be a
    // no-op at best and a false signal to a future reader at worst.
    params.append("quiz[notify_of_update]", "false");
    return await writeJson<Record<string, unknown>>(`${base}/quizzes/${contentId}`, "PUT", ctx, params);
  }
  if (fields.title !== undefined) params.append("title", fields.title);
  if (description !== undefined) params.append("message", description);
  if ([...params.keys()].length === 0) return undefined;
  return await writeJson<Record<string, unknown>>(`${base}/discussion_topics/${contentId}`, "PUT", ctx, params);
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
