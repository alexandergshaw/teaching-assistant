import { resolveCourse } from "../canvas-core";
import { writeJson } from "./fetch-helpers";
import { mapModuleItem } from "./mappers";
import type { CanvasModuleItem, NewModuleItem } from "./types";
import type { RawModuleItem } from "./raw-types";

/** Add an item to a module. */
export async function createModuleItem(
  courseUrl: string,
  moduleId: number,
  item: NewModuleItem,
  code?: string
): Promise<CanvasModuleItem> {
  if (!item.type.trim()) throw new Error("A module item needs a type.");
  const ctx = resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  params.append("module_item[type]", item.type);
  if (item.title?.trim()) params.append("module_item[title]", item.title.trim());
  if (item.pageUrl) params.append("module_item[page_url]", item.pageUrl);
  if (typeof item.contentId === "number") params.append("module_item[content_id]", String(item.contentId));
  if (item.externalUrl) params.append("module_item[external_url]", item.externalUrl);
  if (typeof item.position === "number") params.append("module_item[position]", String(item.position));
  if (typeof item.indent === "number") params.append("module_item[indent]", String(item.indent));
  const raw = await writeJson<RawModuleItem>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules/${moduleId}/items`,
    "POST",
    ctx,
    params
  );
  return mapModuleItem(raw, moduleId);
}

/**
 * Update a module item's title, indent, publish state, and/or position. Setting
 * position reorders within the module. Pass targetModuleId to move it to another
 * module.
 */
export async function updateModuleItem(
  courseUrl: string,
  moduleId: number,
  itemId: number,
  fields: { title?: string; indent?: number; published?: boolean; position?: number; targetModuleId?: number },
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  if (typeof fields.title === "string") params.append("module_item[title]", fields.title.trim());
  if (typeof fields.indent === "number") params.append("module_item[indent]", String(fields.indent));
  if (typeof fields.published === "boolean") params.append("module_item[published]", String(fields.published));
  if (typeof fields.position === "number") params.append("module_item[position]", String(fields.position));
  if (typeof fields.targetModuleId === "number") {
    params.append("module_item[module_id]", String(fields.targetModuleId));
  }
  if ([...params.keys()].length === 0) return;
  await writeJson<RawModuleItem>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules/${moduleId}/items/${itemId}`,
    "PUT",
    ctx,
    params
  );
}

/** Remove an item from a module. */
export async function deleteModuleItem(
  courseUrl: string,
  moduleId: number,
  itemId: number,
  code?: string
): Promise<void> {
  const ctx = resolveCourse(courseUrl, code);
  await writeJson<RawModuleItem>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules/${moduleId}/items/${itemId}`,
    "DELETE",
    ctx
  );
}
