import { resolveCourse } from "../canvas-core";
import { fetchAll, writeJson } from "./fetch-helpers";
import { mapModuleItem } from "./mappers";
import type { CanvasModule } from "./types";
import type { RawModule, RawModuleItem } from "./raw-types";

/**
 * List a course's modules, each with its ordered items. Items are fetched per
 * module (rather than via include[]=items) so modules with many items are never
 * silently truncated. Modules and items come back sorted by Canvas position.
 */
export async function listModules(
  courseUrl: string,
  code?: string
): Promise<CanvasModule[]> {
  const ctx = resolveCourse(courseUrl, code);
  const rawModules = await fetchAll<RawModule>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules?per_page=100`,
    ctx
  );

  const modules = await Promise.all(
    rawModules
      .filter((m) => typeof m.id === "number")
      .map(async (m) => {
        const moduleId = m.id!;
        const rawItems = await fetchAll<RawModuleItem>(
          `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules/${moduleId}/items?per_page=100&include[]=content_details`,
          ctx
        );
        const items = rawItems
          .map((item) => mapModuleItem(item, moduleId))
          .sort((a, b) => a.position - b.position);
        return {
          id: moduleId,
          name: (m.name ?? "").trim() || "(untitled module)",
          position: typeof m.position === "number" ? m.position : 0,
          published: m.published ?? false,
          itemsCount: typeof m.items_count === "number" ? m.items_count : items.length,
          items,
        } satisfies CanvasModule;
      })
  );

  return modules.sort((a, b) => a.position - b.position);
}

/** Create a new (empty) module. Optionally place it at a 1-based position. */
export async function createModule(
  courseUrl: string,
  name: string,
  position?: number,
  code?: string
): Promise<CanvasModule> {
  if (!name.trim()) throw new Error("A module needs a name.");
  const ctx = resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  params.append("module[name]", name.trim());
  if (typeof position === "number") params.append("module[position]", String(position));
  const raw = await writeJson<RawModule>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules`,
    "POST",
    ctx,
    params
  );
  return {
    id: raw.id ?? 0,
    name: (raw.name ?? name).trim(),
    position: typeof raw.position === "number" ? raw.position : (position ?? 0),
    published: raw.published ?? false,
    itemsCount: typeof raw.items_count === "number" ? raw.items_count : 0,
    items: [],
  };
}

/**
 * Update a module's name, publish state, and/or position. Setting position
 * reorders the module list (Canvas shifts the others to make room).
 */
export async function updateModule(
  courseUrl: string,
  moduleId: number,
  fields: { name?: string; published?: boolean; position?: number },
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  if (typeof fields.name === "string") params.append("module[name]", fields.name.trim());
  if (typeof fields.published === "boolean") params.append("module[published]", String(fields.published));
  if (typeof fields.position === "number") params.append("module[position]", String(fields.position));
  if ([...params.keys()].length === 0) return;
  await writeJson<RawModule>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules/${moduleId}`,
    "PUT",
    ctx,
    params
  );
}

/** Delete a module (its items are removed from the module, not deleted). */
export async function deleteModule(
  courseUrl: string,
  moduleId: number,
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  await writeJson<RawModule>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules/${moduleId}`,
    "DELETE",
    ctx
  );
}
