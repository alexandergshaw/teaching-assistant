"use server";

// Server actions for the "Tasks" tab: a course x task-checklist matrix. Thin
// owner-scoped wrappers over src/lib/supabase/course-tasks.ts - all
// persistence (and the read-merge-write status map merge) lives there so it
// stays unit-testable without a live Supabase session; this file only adds
// the auth gate and the friendly-error input validation that produce a
// clean {error} instead of a raw Supabase failure.

import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  listCourseTasks,
  setCourseTaskCells,
  listCourseTaskDefs,
  upsertCourseTaskDef,
  upsertCourseTaskDefs,
  deleteCourseTaskDef,
  type CourseTaskRecord,
  type CourseTaskDef,
} from "@/lib/supabase/course-tasks";

/** List every course's task-status record for the signed-in owner. */
export async function listCourseTasksAction(): Promise<{ records: CourseTaskRecord[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const records = await listCourseTasks(supabase, user.id);
    return { records };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list course tasks." };
  }
}

/**
 * Apply a patch of cell changes to one course's status map. A key present
 * with a non-null value is set; a key present with a null value is deleted;
 * every other key is left alone - see mergeStatusMap's docstring.
 */
export async function setCourseTaskCellsAction(
  courseId: string,
  patch: Record<string, unknown | null>
): Promise<{ record: CourseTaskRecord } | { error: string }> {
  try {
    if (!courseId || !courseId.trim()) {
      return { error: "A course is required." };
    }

    const user = await requireOwner();
    const supabase = createServiceClient();
    const record = await setCourseTaskCells(supabase, user.id, courseId, patch);
    return { record };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the task update." };
  }
}

/** List every task-definition override the signed-in owner has recorded. */
export async function listCourseTaskDefsAction(): Promise<{ defs: CourseTaskDef[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const defs = await listCourseTaskDefs(supabase, user.id);
    return { defs };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list task definitions." };
  }
}

/** Create or replace one task-definition override (rename, retirement, reorder, or custom task). */
export async function saveCourseTaskDefAction(
  def: CourseTaskDef
): Promise<{ def: CourseTaskDef } | { error: string }> {
  try {
    if (!def || !def.taskId || !def.taskId.trim()) {
      return { error: "A task id is required." };
    }

    const user = await requireOwner();
    const supabase = createServiceClient();
    const saved = await upsertCourseTaskDef(supabase, user.id, def);
    return { def: saved };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the task definition." };
  }
}

/**
 * Bulk-save several task-definition overrides in ONE upsert
 * (tasks-column-reorder AC2 items 6/8): a drag-drop column reorder, a
 * keyboard Shift+Arrow move, a column-menu move command, and the Manage
 * Tasks dialog's own move buttons all funnel through this single write path
 * instead of one sequential round trip per task.
 */
export async function saveCourseTaskDefsAction(
  defs: CourseTaskDef[]
): Promise<{ defs: CourseTaskDef[] } | { error: string }> {
  try {
    if (!Array.isArray(defs) || defs.length === 0) {
      return { error: "At least one task definition is required." };
    }
    for (const def of defs) {
      if (!def || !def.taskId || !def.taskId.trim()) {
        return { error: "A task id is required." };
      }
    }

    const user = await requireOwner();
    const supabase = createServiceClient();
    const saved = await upsertCourseTaskDefs(supabase, user.id, defs);
    return { defs: saved };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the task definitions." };
  }
}

/** Forget the owner's override for one task id (falls back to the built-in definition). */
export async function deleteCourseTaskDefAction(taskId: string): Promise<{ ok: true } | { error: string }> {
  try {
    if (!taskId || !taskId.trim()) {
      return { error: "A task id is required." };
    }

    const user = await requireOwner();
    const supabase = createServiceClient();
    await deleteCourseTaskDef(supabase, user.id, taskId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the task definition." };
  }
}
