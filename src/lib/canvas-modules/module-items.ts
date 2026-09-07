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
  const ctx = await resolveCourse(courseUrl, code);
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
 * Whether a module item's type can take the "open in a new tab" flag. Canvas
 * honours `new_tab` for ExternalUrl and ExternalTool items only - and, per
 * the controller source, applies it with NO content-type guard server-side:
 * a write against any other type is accepted, stored, and 200-OK'd rather
 * than rejected. This predicate is therefore the ONLY guard that will ever
 * exist for this; every caller that offers or sends a new-tab write must
 * check it first rather than relying on Canvas to reject an ineligible item.
 *
 * Tests the API's own `type` spelling ("ExternalTool") - not Canvas's
 * internal DB column `content_type` ("ContextExternalTool"), which never
 * appears in this app's responses.
 */
export function canSetNewTab(item: { type: string }): boolean {
  return item.type === "ExternalUrl" || item.type === "ExternalTool";
}

/**
 * Update a module item's title, indent, publish state, position, and/or
 * "open in a new tab" flag. Setting position reorders within the module.
 * Pass targetModuleId to move it to another module.
 *
 * `newTab` is sent as `module_item[new_tab]` ONLY when present, exactly like
 * every other optional field here, as the literal string "true"/"false" -
 * never an empty value, since Canvas's `value_to_boolean` treats an absent
 * param as "leave alone" but treats "false" (a non-empty string) as a real,
 * applied value.
 *
 * Deliberately NEVER sends `module_item[external_url]`. Canvas assigns the
 * url only when that param is PRESENT, so omitting it is safe - but that
 * guard is Ruby truthiness, where `""` is truthy. Appending
 * `externalUrl ?? ""` "defensively" would set the url to empty string on
 * every item whose `externalUrl` this app holds as null (every ExternalTool
 * item, and any row mapped before this field existed) - mass link erasure
 * across a course. This function has no `externalUrl` field for that exact
 * reason; do not add one to resend it.
 */
export async function updateModuleItem(
  courseUrl: string,
  moduleId: number,
  itemId: number,
  fields: {
    title?: string;
    indent?: number;
    published?: boolean;
    position?: number;
    targetModuleId?: number;
    newTab?: boolean;
  },
  code?: string
): Promise<void> {
  const ctx = await resolveCourse(courseUrl, code);
  const params = new URLSearchParams();
  if (typeof fields.title === "string") params.append("module_item[title]", fields.title.trim());
  if (typeof fields.indent === "number") params.append("module_item[indent]", String(fields.indent));
  if (typeof fields.published === "boolean") params.append("module_item[published]", String(fields.published));
  if (typeof fields.position === "number") params.append("module_item[position]", String(fields.position));
  if (typeof fields.targetModuleId === "number") {
    params.append("module_item[module_id]", String(fields.targetModuleId));
  }
  if (typeof fields.newTab === "boolean") params.append("module_item[new_tab]", String(fields.newTab));
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
  const ctx = await resolveCourse(courseUrl, code);
  await writeJson<RawModuleItem>(
    `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}/modules/${moduleId}/items/${itemId}`,
    "DELETE",
    ctx
  );
}
