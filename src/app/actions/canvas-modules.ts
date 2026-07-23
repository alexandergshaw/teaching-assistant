"use server";

import { getCourseName } from "@/lib/canvas";
import { listModules, createModule, updateModule, deleteModule, createModuleItem, updateModuleItem, deleteModuleItem, listAssignmentGroups, createAssignment, uploadFileToModule, listPages, type CanvasModule, type CanvasPageSummary, type NewModuleItem, type NewAssignment } from "@/lib/canvas-modules";
import { requireOwner } from "@/lib/supabase/auth";

// ── Course Content (modules & pages) ─────────────────────────────────────────
//
// Owner-gated wrappers over the Canvas Modules/Pages API. Reads power the Course
// Content tab; writes mutate live course content, so the UI keeps every write
// explicit (staged locally, saved on an explicit click) and these actions simply
// pass the author's confirmed changes through.

/** Load a course's name, modules (with items), and wiki page list in one call. */
export async function listCourseContentAction(
  courseUrl: string,
  acronym?: string
): Promise<{ courseName: string; modules: CanvasModule[]; pages: CanvasPageSummary[] } | { error: string }> {
  try {
    await requireOwner();
    const [courseName, modules, pages] = await Promise.all([
      getCourseName(courseUrl, acronym),
      listModules(courseUrl, acronym),
      listPages(courseUrl, acronym),
    ]);
    return { courseName, modules, pages };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load course content." };
  }
}

/**
 * Upload a generated syllabus (.docx, base64) into a course and add it to a
 * module at `position` (1-based; omit for the end).
 */
export async function placeSyllabusInModuleAction(
  base64: string,
  courseUrl: string,
  moduleId: number,
  fileName: string,
  position?: number,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    await uploadFileToModule(courseUrl, base64, fileName, DOCX, moduleId, position, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the syllabus to Canvas." };
  }
}

/** Create a new (empty) module. */
export async function createModuleAction(
  courseUrl: string,
  name: string,
  position?: number,
  acronym?: string
): Promise<{ module: CanvasModule } | { error: string }> {
  try {
    await requireOwner();
    return { module: await createModule(courseUrl, name, position, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the module." };
  }
}

/** Update a module's name / publish state / position. */
export async function updateModuleAction(
  courseUrl: string,
  moduleId: number,
  fields: { name?: string; published?: boolean; position?: number },
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await updateModule(courseUrl, moduleId, fields, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the module." };
  }
}

/** Delete a module. */
export async function deleteModuleAction(
  courseUrl: string,
  moduleId: number,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await deleteModule(courseUrl, moduleId, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the module." };
  }
}

/** Add an item to a module. */
export async function createModuleItemAction(
  courseUrl: string,
  moduleId: number,
  item: NewModuleItem,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await createModuleItem(courseUrl, moduleId, item, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not add the item." };
  }
}

/** Create a Canvas assignment and optionally add it to a module. */
export async function createCourseAssignmentAction(
  courseUrl: string,
  fields: NewAssignment,
  moduleId: number | null,
  acronym?: string
): Promise<{ id: number; name: string; htmlUrl: string; addedToModule: boolean } | { error: string }> {
  try {
    await requireOwner();
    const created = await createAssignment(courseUrl, fields, acronym);
    let addedToModule = false;
    if (moduleId !== null) {
      await createModuleItem(courseUrl, moduleId, { type: "Assignment", contentId: created.id, title: created.name }, acronym);
      addedToModule = true;
    }
    return { ...created, addedToModule };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the assignment." };
  }
}

/** List the course's assignment groups for the assignment editor. */
export async function listAssignmentGroupsAction(
  courseUrl: string,
  acronym?: string
): Promise<{ groups: Array<{ id: number; name: string }> } | { error: string }> {
  try {
    await requireOwner();
    return { groups: await listAssignmentGroups(courseUrl, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load assignment groups." };
  }
}

/** Update a module item's title / indent / publish state / position / module. */
export async function updateModuleItemAction(
  courseUrl: string,
  moduleId: number,
  itemId: number,
  fields: { title?: string; indent?: number; published?: boolean; position?: number; targetModuleId?: number },
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await updateModuleItem(courseUrl, moduleId, itemId, fields, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the item." };
  }
}

/** Remove an item from a module. */
export async function deleteModuleItemAction(
  courseUrl: string,
  moduleId: number,
  itemId: number,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await deleteModuleItem(courseUrl, moduleId, itemId, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not remove the item." };
  }
}
