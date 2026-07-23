import { resolveCourse } from "../canvas-core";
import { safeFetchAll } from "./fetch-helpers";
import type { CanvasAddableContent } from "./types";
import type { RawAssignment, RawDiscussionTopic, RawFile, RawQuiz } from "./raw-types";

/**
 * List the assignments, quizzes, discussions, and files a module item can point
 * at, so the picker can offer them by name. Pages are listed separately
 * (listPages) because module items reference them by slug, not content id. Each
 * list is best-effort: a type the course/token can't read comes back empty
 * rather than failing the whole call.
 */
export async function listAddableContent(
  courseUrl: string,
  code?: string
): Promise<CanvasAddableContent> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  const [assignments, quizzes, discussions, files] = await Promise.all([
    safeFetchAll<RawAssignment>(`${base}/assignments?per_page=100`, ctx),
    safeFetchAll<RawQuiz>(`${base}/quizzes?per_page=100`, ctx),
    safeFetchAll<RawDiscussionTopic>(`${base}/discussion_topics?per_page=100`, ctx),
    safeFetchAll<RawFile>(`${base}/files?per_page=100`, ctx),
  ]);
  return {
    assignments: assignments
      .filter((a) => typeof a.id === "number")
      .map((a) => ({ id: a.id!, title: (a.name ?? "").trim() || `Assignment ${a.id}` })),
    quizzes: quizzes
      .filter((q) => typeof q.id === "number")
      .map((q) => ({ id: q.id!, title: (q.title ?? "").trim() || `Quiz ${q.id}` })),
    discussions: discussions
      .filter((d) => typeof d.id === "number" && !d.is_announcement)
      .map((d) => ({ id: d.id!, title: (d.title ?? "").trim() || `Discussion ${d.id}` })),
    files: files
      .filter((f) => typeof f.id === "number")
      .map((f) => ({ id: f.id!, title: (f.display_name ?? f.filename ?? "").trim() || `File ${f.id}` })),
  };
}

/** The course's assignment groups (for the editor's group picker). */
export async function listAssignmentGroups(courseUrl: string, code?: string): Promise<Array<{ id: number; name: string }>> {
  const ctx = resolveCourse(courseUrl, code);
  const raw = await safeFetchAll<{ id?: number; name?: string }>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/assignment_groups?per_page=100`,
    ctx
  );
  return raw
    .filter((g) => typeof g.id === "number")
    .map((g) => ({
      id: g.id!,
      name: (g.name ?? "").trim() || `Group ${g.id}`,
    }));
}
