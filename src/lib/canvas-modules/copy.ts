import { canvasError, resolveCourse } from "../canvas-core";
import { writeJson } from "./fetch-helpers";
import type { SelectiveNode } from "./types";
import type { RawMigration, RawSelective } from "./raw-types";

/** Content types that can be selected when copying a course (copy[all_<key>]). */
export const COURSE_COPY_TYPES: Array<{ key: string; label: string }> = [
  { key: "context_modules", label: "Modules" },
  { key: "assignments", label: "Assignments" },
  { key: "quizzes", label: "Quizzes" },
  { key: "discussion_topics", label: "Discussions" },
  { key: "wiki_pages", label: "Pages" },
  { key: "announcements", label: "Announcements" },
  { key: "attachments", label: "Files" },
  { key: "rubrics", label: "Rubrics" },
  { key: "syllabus_body", label: "Syllabus" },
];

/**
 * Start a course-copy migration in `destCourseId`, pulling content from
 * `sourceCourseId`. With `selective`, Canvas pauses at "waiting_for_select" so
 * the caller can choose content types before it runs. The institution/token come
 * from the current course's context, so both courses must be on that Canvas.
 */
export async function createCourseCopy(
  contextCourseUrl: string,
  destCourseId: string,
  sourceCourseId: string,
  selective: boolean,
  code?: string
): Promise<{ migrationId: number; state: string }> {
  const ctx = resolveCourse(contextCourseUrl, code);
  const params = new URLSearchParams();
  params.append("migration_type", "course_copy_importer");
  params.append("settings[source_course_id]", sourceCourseId);
  if (selective) params.append("selective_import", "true");
  const data = await writeJson<RawMigration>(
    `${ctx.baseUrl}/api/v1/courses/${destCourseId}/content_migrations`,
    "POST",
    ctx,
    params
  );
  if (typeof data.id !== "number") throw new Error("Canvas did not start the copy.");
  return { migrationId: data.id, state: data.workflow_state ?? "" };
}

/** The current workflow state of a content migration (for polling). */
export async function getMigrationState(
  contextCourseUrl: string,
  destCourseId: string,
  migrationId: number,
  code?: string
): Promise<string> {
  const ctx = resolveCourse(contextCourseUrl, code);
  const response = await fetch(
    `${ctx.baseUrl}/api/v1/courses/${destCourseId}/content_migrations/${migrationId}`,
    { headers: { Authorization: `Bearer ${ctx.token}` } }
  );
  if (!response.ok) throw canvasError(response.status, ctx.institution);
  const data = (await response.json()) as RawMigration;
  return data.workflow_state ?? "";
}

function mapSelective(r: RawSelective): SelectiveNode {
  return {
    property: r.property ?? "",
    title: (r.title ?? "").trim() || (r.type ?? "Item"),
    type: r.type,
    count: typeof r.count === "number" ? r.count : undefined,
    subItems: (r.sub_items ?? []).map(mapSelective),
  };
}

/** Fetch the selectable-content tree for a migration waiting for selection. */
export async function getSelectiveData(
  contextCourseUrl: string,
  destCourseId: string,
  migrationId: number,
  code?: string
): Promise<SelectiveNode[]> {
  const ctx = resolveCourse(contextCourseUrl, code);
  const response = await fetch(
    `${ctx.baseUrl}/api/v1/courses/${destCourseId}/content_migrations/${migrationId}/selective_data`,
    { headers: { Authorization: `Bearer ${ctx.token}` } }
  );
  if (!response.ok) throw canvasError(response.status, ctx.institution);
  const data = (await response.json()) as RawSelective[];
  return (data ?? []).filter((n) => n.property).map(mapSelective);
}

/** Submit a per-item selection (the chosen `property` keys) to a waiting migration. */
export async function submitSelectiveImport(
  contextCourseUrl: string,
  destCourseId: string,
  migrationId: number,
  properties: string[],
  code?: string
): Promise<void> {
  if (properties.length === 0) throw new Error("Select at least one item to copy.");
  const ctx = resolveCourse(contextCourseUrl, code);
  const params = new URLSearchParams();
  for (const p of properties) params.append(p, "1");
  await writeJson(
    `${ctx.baseUrl}/api/v1/courses/${destCourseId}/content_migrations/${migrationId}`,
    "PUT",
    ctx,
    params
  );
}

/** Submit type-level selections to a migration waiting at "waiting_for_select". */
export async function selectCopyTypes(
  contextCourseUrl: string,
  destCourseId: string,
  migrationId: number,
  types: string[],
  code?: string
): Promise<void> {
  if (types.length === 0) throw new Error("Choose at least one content type to copy.");
  const ctx = resolveCourse(contextCourseUrl, code);
  const params = new URLSearchParams();
  for (const t of types) params.append(`copy[all_${t}]`, "1");
  await writeJson(
    `${ctx.baseUrl}/api/v1/courses/${destCourseId}/content_migrations/${migrationId}`,
    "PUT",
    ctx,
    params
  );
}
