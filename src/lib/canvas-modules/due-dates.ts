import { canvasError, resolveCourse } from "../canvas-core";
import { writeJson, type CourseContext } from "./fetch-helpers";
import type { DueDateUpdate } from "./types";

/** Set one item's due date, routing by type (Canvas has no single endpoint). */
async function setOneDueDate(
  ctx: CourseContext,
  type: string,
  contentId: number,
  dueAt: string | null
): Promise<void> {
  const value = dueAt ?? "";
  if (type === "Assignment") {
    const params = new URLSearchParams();
    params.append("assignment[due_at]", value);
    await writeJson(`${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/assignments/${contentId}`, "PUT", ctx, params);
    return;
  }
  if (type === "Quiz") {
    const params = new URLSearchParams();
    params.append("quiz[due_at]", value);
    await writeJson(`${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/quizzes/${contentId}`, "PUT", ctx, params);
    return;
  }
  if (type === "Discussion") {
    const response = await fetch(
      `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/discussion_topics/${contentId}`,
      { headers: { Authorization: `Bearer ${ctx.token}` } }
    );
    if (!response.ok) throw canvasError(response.status, ctx.institution);
    const topic = (await response.json()) as { assignment_id?: number | null };
    if (!topic.assignment_id) {
      throw new Error("This discussion is not graded, so it has no due date.");
    }
    const params = new URLSearchParams();
    params.append("assignment[due_at]", value);
    await writeJson(
      `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/assignments/${topic.assignment_id}`,
      "PUT",
      ctx,
      params
    );
    return;
  }
  throw new Error(`Cannot set a due date for a ${type || "non-gradable"} item.`);
}

/**
 * Apply a batch of due-date changes, one request per item. Continues past
 * individual failures and reports them, so one bad item never blocks the rest.
 */
export async function setDueDates(
  courseUrl: string,
  updates: DueDateUpdate[],
  code?: string
): Promise<{ updated: number; failures: Array<{ contentId: number; error: string }> }> {
  const ctx = resolveCourse(courseUrl, code);
  let updated = 0;
  const failures: Array<{ contentId: number; error: string }> = [];
  for (const update of updates) {
    try {
      await setOneDueDate(ctx, update.type, update.contentId, update.dueAt);
      updated += 1;
    } catch (err) {
      failures.push({
        contentId: update.contentId,
        error: err instanceof Error ? err.message : "Could not set the due date.",
      });
    }
  }
  return { updated, failures };
}
