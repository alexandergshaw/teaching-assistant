import { resolveCourse } from "../canvas-core";
import { fetchAll, writeJson } from "./fetch-helpers";
import type { BulkItem, BulkKind } from "./types";
import type { RawPage, RawBulkAssignment, RawBulkQuiz, RawBulkDiscussion } from "./raw-types";

/** List items of one kind with the fields the bulk editor shows and edits. */
export async function listBulkItems(
  courseUrl: string,
  kind: BulkKind,
  code?: string
): Promise<BulkItem[]> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;

  if (kind === "Page") {
    const raw = await fetchAll<RawPage>(`${base}/pages?per_page=100&sort=title`, ctx);
    return raw
      .filter((p) => typeof p.url === "string" && p.url.length > 0)
      .map((p) => ({
        id: p.url!,
        title: (p.title ?? "").trim() || "(untitled)",
        published: p.published ?? false,
        dueAt: null,
        pointsPossible: null,
      }));
  }
  if (kind === "Assignment") {
    const raw = await fetchAll<RawBulkAssignment>(`${base}/assignments?per_page=100`, ctx);
    return raw
      .filter((a) => typeof a.id === "number")
      .map((a) => ({
        id: String(a.id),
        title: (a.name ?? "").trim() || `Assignment ${a.id}`,
        published: a.published ?? false,
        dueAt: a.due_at ?? null,
        pointsPossible: typeof a.points_possible === "number" ? a.points_possible : null,
      }));
  }
  if (kind === "Quiz") {
    const raw = await fetchAll<RawBulkQuiz>(`${base}/quizzes?per_page=100`, ctx);
    return raw
      .filter((q) => typeof q.id === "number")
      .map((q) => ({
        id: String(q.id),
        title: (q.title ?? "").trim() || `Quiz ${q.id}`,
        published: q.published ?? false,
        dueAt: q.due_at ?? null,
        pointsPossible: typeof q.points_possible === "number" ? q.points_possible : null,
      }));
  }
  const raw = await fetchAll<RawBulkDiscussion>(`${base}/discussion_topics?per_page=100`, ctx);
  return raw
    .filter((d) => typeof d.id === "number" && !d.is_announcement)
    .map((d) => ({
      id: String(d.id),
      title: (d.title ?? "").trim() || `Discussion ${d.id}`,
      published: d.published ?? false,
      dueAt: d.assignment?.due_at ?? null,
      pointsPossible:
        typeof d.assignment?.points_possible === "number" ? d.assignment.points_possible : null,
    }));
}

type BulkResult = { updated: number; failures: Array<{ id: string; error: string }> };

function bulkUpdateRequest(
  base: string,
  kind: BulkKind,
  id: string,
  fields: { published?: boolean; pointsPossible?: number; submissionType?: string }
): { url: string; params: URLSearchParams } {
  const params = new URLSearchParams();
  if (kind === "Assignment") {
    if (fields.published !== undefined) params.append("assignment[published]", String(fields.published));
    if (fields.pointsPossible !== undefined) {
      params.append("assignment[points_possible]", String(fields.pointsPossible));
    }
    if (fields.submissionType !== undefined) params.append("assignment[submission_types][]", fields.submissionType);
    return { url: `${base}/assignments/${id}`, params };
  }
  if (kind === "Quiz") {
    if (fields.published !== undefined) params.append("quiz[published]", String(fields.published));
    if (fields.pointsPossible !== undefined) {
      params.append("quiz[points_possible]", String(fields.pointsPossible));
    }
    return { url: `${base}/quizzes/${id}`, params };
  }
  if (kind === "Discussion") {
    if (fields.published !== undefined) params.append("published", String(fields.published));
    return { url: `${base}/discussion_topics/${id}`, params };
  }
  if (fields.published !== undefined) params.append("wiki_page[published]", String(fields.published));
  return { url: `${base}/pages/${encodeURIComponent(id)}`, params };
}

/** Apply published and/or points-possible changes to many items of one kind. */
export async function bulkUpdate(
  courseUrl: string,
  kind: BulkKind,
  ids: string[],
  fields: { published?: boolean; pointsPossible?: number; submissionType?: string },
  code?: string
): Promise<BulkResult> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  let updated = 0;
  const failures: Array<{ id: string; error: string }> = [];
  for (const id of ids) {
    try {
      const { url, params } = bulkUpdateRequest(base, kind, id, fields);
      if ([...params.keys()].length === 0) continue;
      await writeJson(url, "PUT", ctx, params);
      updated += 1;
    } catch (err) {
      failures.push({ id, error: err instanceof Error ? err.message : "Update failed." });
    }
  }
  return { updated, failures };
}

/** Delete many items of one kind. */
export async function bulkDelete(
  courseUrl: string,
  kind: BulkKind,
  ids: string[],
  code?: string
): Promise<BulkResult> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  const path =
    kind === "Assignment"
      ? "assignments"
      : kind === "Quiz"
        ? "quizzes"
        : kind === "Discussion"
          ? "discussion_topics"
          : "pages";
  let updated = 0;
  const failures: Array<{ id: string; error: string }> = [];
  for (const id of ids) {
    try {
      const ref = kind === "Page" ? encodeURIComponent(id) : id;
      await writeJson(`${base}/${path}/${ref}`, "DELETE", ctx);
      updated += 1;
    } catch (err) {
      failures.push({ id, error: err instanceof Error ? err.message : "Delete failed." });
    }
  }
  return { updated, failures };
}
