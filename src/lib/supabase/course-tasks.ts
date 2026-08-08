// Persistence for the "Tasks" tab: a course x task-checklist matrix.
//
// Two tables, mirrored by two families of functions here:
//   - course_tasks: one row per (user, course) holding a `statuses` jsonb
//     blob that maps a task id to whatever cell-shape the client uses
//     (status, note, doneAt, ...).
//   - course_task_defs: one row per (user, task_id) recording a user's
//     customization of the built-in task catalog (rename, retirement,
//     reorder, or a wholly custom task).
//
// This module is deliberately shape-agnostic about cell contents: the stored
// status map is treated as Record<string, unknown> everywhere. Validation
// and coercion of individual cell contents happen at READ time in the
// client (see src/lib/course-tasks.ts, written independently of this file).
// mergeStatusMap below is a dumb key-level merge, not a shape-aware one -
// that is what lets two concurrent edits to different cells of the same
// course avoid clobbering each other.
//
// Pattern B: every function takes an injected SupabaseClient<Database> as
// its first argument, and this module never imports "@/lib/supabase/server"
// or "next/headers" - see src/lib/knowledge-base.ts (roughly lines 351-575)
// for the in-repo reference this mirrors, including the exported row-mapper
// convention ("so the row -> page mapping is unit-testable without a live
// Supabase client").

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./types";

export interface CourseTaskRecord {
  courseId: string;
  statuses: Record<string, unknown>;
  updatedAt: string;
}

export interface CourseTaskDef {
  taskId: string;
  view: string;
  group: string;
  label: string | null;
  cadence: string | null;
  position: number | null;
  retired: boolean;
  custom: boolean;
}

/** Coerce an arbitrary jsonb value into a plain status-map object. A
 * non-object, null, or array value (whatever a corrupt or unexpected row
 * might contain) is treated as an empty map rather than thrown on. */
function coerceStatusMap(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

/**
 * Merge a patch into a status map. PURE and total:
 *   - a key present in the patch with a non-null value SETS that key;
 *   - a key present in the patch with a null value DELETES that key;
 *   - a key present in the patch with an `undefined` value is IGNORED (left
 *     untouched) - this mirrors JSON.stringify's own handling of undefined
 *     object properties (they vanish rather than serializing as `null`), so
 *     a patch that reached this function over the wire could never actually
 *     carry an explicit `undefined` in the first place. Only `null` deletes.
 *   - every other key already in `current` is left alone.
 * Neither argument is mutated; the returned object is always a new one.
 */
export function mergeStatusMap(
  current: unknown,
  patch: Record<string, unknown | null>
): Record<string, unknown> {
  const next = coerceStatusMap(current);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  return next;
}

// Exported so the row -> record mapping is unit-testable without a live
// Supabase client (mirrors mapInstitutionPage in src/lib/knowledge-base.ts).
export function mapCourseTaskRow(
  row: Database["public"]["Tables"]["course_tasks"]["Row"]
): CourseTaskRecord {
  return {
    courseId: row.course_id,
    statuses: coerceStatusMap(row.statuses),
    updatedAt: row.updated_at,
  };
}

export function mapCourseTaskDefRow(
  row: Database["public"]["Tables"]["course_task_defs"]["Row"]
): CourseTaskDef {
  return {
    taskId: row.task_id,
    view: row.view_id,
    group: row.group_id,
    label: row.label,
    cadence: row.cadence,
    position: row.sort_position,
    retired: row.retired,
    custom: row.custom,
  };
}

/** List every course's task-status record for this user. */
export async function listCourseTasks(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<CourseTaskRecord[]> {
  const { data: rows, error } = await supabase.from("course_tasks").select("*").eq("user_id", userId);

  if (error) throw new Error(error.message);
  return (rows || []).map(mapCourseTaskRow);
}

/**
 * Read-merge-write a patch of cells into one course's status map. This runs
 * server-side on purpose: the client never sends a whole map, only the
 * cells it actually changed, so two simultaneous edits to different cells
 * of the same course never clobber each other (see mergeStatusMap).
 */
export async function setCourseTaskCells(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string,
  patch: Record<string, unknown | null>
): Promise<CourseTaskRecord> {
  const { data: existing, error: readError } = await supabase
    .from("course_tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (readError) throw new Error(readError.message);

  const statuses = mergeStatusMap(existing?.statuses, patch);
  const now = new Date().toISOString();

  const upsertRow: Database["public"]["Tables"]["course_tasks"]["Insert"] = {
    user_id: userId,
    course_id: courseId,
    statuses: statuses as unknown as Json,
    updated_at: now,
  };

  const { data: row, error } = await supabase
    .from("course_tasks")
    .upsert(upsertRow, { onConflict: "user_id,course_id" })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapCourseTaskRow(row);
}

/** List every task-definition override this user has recorded. */
export async function listCourseTaskDefs(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<CourseTaskDef[]> {
  const { data: rows, error } = await supabase.from("course_task_defs").select("*").eq("user_id", userId);

  if (error) throw new Error(error.message);
  return (rows || []).map(mapCourseTaskDefRow);
}

/** Create or replace one task-definition override, keyed on (user_id, task_id). */
export async function upsertCourseTaskDef(
  supabase: SupabaseClient<Database>,
  userId: string,
  def: CourseTaskDef
): Promise<CourseTaskDef> {
  const upsertRow: Database["public"]["Tables"]["course_task_defs"]["Insert"] = {
    user_id: userId,
    task_id: def.taskId,
    view_id: def.view,
    group_id: def.group,
    label: def.label,
    cadence: def.cadence,
    sort_position: def.position,
    retired: def.retired,
    custom: def.custom,
    updated_at: new Date().toISOString(),
  };

  const { data: row, error } = await supabase
    .from("course_task_defs")
    .upsert(upsertRow, { onConflict: "user_id,task_id" })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapCourseTaskDefRow(row);
}

/**
 * Create or replace SEVERAL task-definition overrides in ONE upsert
 * (docs/tasks-column-reorder-acceptance-criteria.md AC2 item 6): a group
 * reorder renumbers every task in the group, and writing one row per task
 * (the pattern ManageTasksDialog.tsx's old sequential moveTask used) is
 * neither fast nor atomic - a failure partway would leave the group
 * half-renumbered. Every row must still be a FULL CourseTaskDef: this table
 * writes every column on conflict and view_id/group_id are NOT NULL
 * (supabase/migrations/20260924000000_course_tasks.sql), so a caller must
 * merge a bare {taskId, position} onto the task's existing definition
 * BEFORE calling this - see baseTaskCatalogOverride in
 * src/lib/course-tasks-view.ts, which every caller of this function goes
 * through. A no-op on an empty array (no round trip for nothing to write). */
export async function upsertCourseTaskDefs(
  supabase: SupabaseClient<Database>,
  userId: string,
  defs: CourseTaskDef[]
): Promise<CourseTaskDef[]> {
  if (defs.length === 0) return [];
  const now = new Date().toISOString();
  const upsertRows: Database["public"]["Tables"]["course_task_defs"]["Insert"][] = defs.map((def) => ({
    user_id: userId,
    task_id: def.taskId,
    view_id: def.view,
    group_id: def.group,
    label: def.label,
    cadence: def.cadence,
    sort_position: def.position,
    retired: def.retired,
    custom: def.custom,
    updated_at: now,
  }));

  const { data: rows, error } = await supabase
    .from("course_task_defs")
    .upsert(upsertRows, { onConflict: "user_id,task_id" })
    .select();

  if (error) throw new Error(error.message);
  return (rows || []).map(mapCourseTaskDefRow);
}

/** Forget a user's override for one task id (falls back to the built-in definition). */
export async function deleteCourseTaskDef(
  supabase: SupabaseClient<Database>,
  userId: string,
  taskId: string
): Promise<void> {
  const { error } = await supabase
    .from("course_task_defs")
    .delete()
    .eq("user_id", userId)
    .eq("task_id", taskId);

  if (error) throw new Error(error.message);
}
