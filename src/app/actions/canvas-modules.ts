"use server";

import { getCourseName } from "@/lib/canvas";
import { listModules, createModule, updateModule, deleteModule, createModuleItem, updateModuleItem, deleteModuleItem, listAssignmentGroups, createAssignment, uploadFileToModule, listPages, type CanvasModule, type CanvasModuleItem, type CanvasPageSummary, type NewModuleItem, type NewAssignment } from "@/lib/canvas-modules";
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
 * module at `position` (1-based; omit for the end). `item` is the created
 * module item (its htmlUrl is what the LMS-tab "Generate syllabus" button
 * links to, AC B2-8); optional rather than required so existing callers/mocks
 * that only ever asserted `{ok: true}` (steps.course-setup.materials.test.ts)
 * keep type-checking unchanged.
 */
export async function placeSyllabusInModuleAction(
  base64: string,
  courseUrl: string,
  moduleId: number,
  fileName: string,
  position?: number,
  acronym?: string
): Promise<{ ok: true; item?: CanvasModuleItem } | { error: string }> {
  try {
    await requireOwner();
    const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const item = await uploadFileToModule(courseUrl, base64, fileName, DOCX, moduleId, position, acronym);
    return { ok: true, item };
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

/**
 * Create a Canvas assignment and optionally add it to a module.
 *
 * C5 fix (docs/REGRESSION.md, chunk D step-10): create and link are now two
 * separate try/catch scopes, not one. Previously a link failure AFTER a
 * successful create threw up to this function's own outer catch, which
 * discarded the newly-created assignment's id and returned a bare
 * `{ error }` - indistinguishable from "nothing was created". Canvas HAD
 * accepted the assignment; only the module link failed. Every caller that
 * matches its idempotency check against module ITEM titles (this repo's
 * carry-module-pattern.ts among them) could never see that orphan on a
 * re-run and created a second copy of the same assignment, forever - Canvas
 * has no undo for that duplicate. The fix: a link failure is now reported as
 * `addedToModule: false` plus a `linkError` message, WITH the created
 * assignment's real `id`/`name`/`htmlUrl` intact, so a caller that wants to
 * (carry-module-pattern.ts does) can surface it as an "orphaned" outcome a
 * human can find in Canvas - the same doctrine this repo already applies to
 * every other create-then-link seam (moduleContentActions.ts's
 * ModuleContentResult). Deliberately NOT auto-deleted on a link failure -
 * same reasoning as every other orphan in this app (entry 258 check 11):
 * a rollback delete is a second, unattended destructive write stacked on the
 * first failure, can itself fail, and throws away real content with no
 * chance for a human to reconsider.
 *
 * `addedToModule` keeps its original `boolean` type, so every existing
 * caller keeps COMPILING unchanged - but `linkError` on an otherwise
 * success-shaped return is new, and step-11's own regression pass found
 * this was NOT behaviourally inert: five pre-existing callers tested only
 * `"error" in result` and so started reporting success on an orphaned
 * assignment the moment this function stopped folding a link failure into
 * `{ error }`. Every one of those five (useAddModuleItem.ts,
 * lms-generation-writers.ts's LIVE_CANVAS_WRITERS.createAssignment ->
 * commit-execute.ts, steps.assignments-creation.ts,
 * steps.lms-integrations.ts, steps.course-setup.materials.ts) was fixed in
 * the same round to check `linkError`/`addedToModule` and surface the
 * orphan's id rather than reporting a bare success - see each file's own
 * comment at its call site. `useNewAssignmentForm.ts` was the only caller
 * that already read `addedToModule` at all, but even it only varied its
 * SUCCESS wording on it and still reported `kind: "success"` regardless -
 * it was fixed too (assignmentCreateOutcome.ts's shared helper, used by it
 * and useAddModuleItem.ts, is now the one place this invariant lives for
 * both UI callers).
 *
 * C3 fix: `moduleItemPlacement` threads `position`/`indent` into the same
 * module-item link call `createModuleItemAction`'s own callers already rely
 * on (module-items.ts's `createModuleItem` only sends the Canvas
 * `module_item[position]`/`module_item[indent]` params when
 * `typeof x === "number"`), so an absent placement behaves exactly as before
 * - Canvas appends to the end of the module with no indent. This is a new
 * optional 5th parameter, appended after `acronym`, so no existing caller's
 * call site needs to change.
 */
export async function createCourseAssignmentAction(
  courseUrl: string,
  fields: NewAssignment,
  moduleId: number | null,
  acronym?: string,
  moduleItemPlacement?: { position?: number; indent?: number }
): Promise<
  | { id: number; name: string; htmlUrl: string; addedToModule: boolean; linkError?: string }
  | { error: string }
> {
  try {
    await requireOwner();
    const created = await createAssignment(courseUrl, fields, acronym);
    let addedToModule = false;
    let linkError: string | undefined;
    if (moduleId !== null) {
      try {
        await createModuleItem(
          courseUrl,
          moduleId,
          {
            type: "Assignment",
            contentId: created.id,
            title: created.name,
            position: moduleItemPlacement?.position,
            indent: moduleItemPlacement?.indent,
          },
          acronym
        );
        addedToModule = true;
      } catch (err) {
        // The assignment above already exists in Canvas - only the module
        // link failed. Report it WITH the id rather than letting this
        // propagate to the outer catch, which would discard it (see this
        // function's own header comment).
        linkError = err instanceof Error ? err.message : "Could not add the assignment to the module.";
      }
    }
    return linkError !== undefined ? { ...created, addedToModule, linkError } : { ...created, addedToModule };
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
