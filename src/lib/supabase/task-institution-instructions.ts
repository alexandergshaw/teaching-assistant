// Persistence for per-institution, per-task instruction text (the Tasks
// tab's "how this school wants this task done" standing guidance) - see
// supabase/migrations/20261001000000_course_task_instructions.sql for the
// table this reads and writes, and
// docs/task-institution-instructions-acceptance-criteria.md for the AC.
//
// Pattern B: every function takes an injected SupabaseClient<Database> as
// its first argument, and this module never imports "@/lib/supabase/server"
// or "next/headers" - mirrors src/lib/supabase/course-tasks.ts, which mirrors
// src/lib/knowledge-base.ts's own storage functions, including the exported
// row-mapper convention (so the row -> record mapping is unit-testable
// without a live Supabase client).
//
// The casing normalization is NOT reinvented here: taskInstructionKey (the
// single function that owns the institution-casing comparison, see
// src/lib/task-institution-instructions.ts's header comment for the defect
// it prevents) is imported and applied to every institution value BEFORE it
// touches a query or a write, so a row is always stored - and always looked
// up - under its normalized identity.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import {
  taskInstructionKey,
  TASK_INSTRUCTION_MAX_LENGTH,
  type TaskInstruction,
} from "@/lib/task-institution-instructions";

// Exported so the row -> record mapping is unit-testable without a live
// Supabase client (mirrors mapCourseTaskRow in src/lib/supabase/course-tasks.ts
// and mapInstitutionPage in src/lib/knowledge-base.ts). `body` is trimmed
// again on the way out - defense in depth alongside the write-time trim
// below, since a row could in principle have been written by something
// other than upsertTaskInstruction (a manual DB edit, a future migration
// backfill) - a missing, blank, or whitespace-only body all read back as ""
// (AC3 item 13).
export function mapTaskInstructionRow(
  row: Database["public"]["Tables"]["course_task_instructions"]["Row"]
): TaskInstruction {
  return {
    institution: row.institution,
    taskId: row.task_id,
    body: (row.body ?? "").trim(),
  };
}

/** List every instruction row this user has recorded, across every
 * institution and task - loaded once per Tasks tab mount (AC3 item 12),
 * never per row or per cell. Callers build a lookup map from this via
 * buildTaskInstructionMap (src/lib/task-institution-instructions.ts). */
export async function listTaskInstructions(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<TaskInstruction[]> {
  const { data: rows, error } = await supabase
    .from("course_task_instructions")
    .select("*")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return (rows || []).map(mapTaskInstructionRow);
}

/**
 * Create, replace, or delete one instruction, keyed on
 * (user_id, institution, task_id) after `institution` is normalized through
 * taskInstructionKey.
 *
 * Two refusal rules live HERE, in the storage layer, so no caller (server
 * action, future UI) can bypass either one by going around this function:
 *
 * - AC2 item 8: a blank/whitespace-only institution is never a lookup key
 *   and never produces a stored row. taskInstructionKey("") === "" is the
 *   refusal signal; this function returns null without touching the
 *   database rather than writing a row under "".
 * - AC5 item 25: clearing an instruction to blank DELETES its row rather
 *   than storing an empty string, mirroring how an empty TaskCell is
 *   deleted rather than stored (applyTaskCell, src/lib/course-tasks.ts:
 *   297-305). A caller that wants to clear an instruction calls this same
 *   function with body "" (or whitespace) - it does not need its own
 *   delete path for the common "clear the field" case, though
 *   deleteTaskInstruction below still exists for a caller that already
 *   knows it wants an unconditional delete (e.g. removing every
 *   instruction for a retired task).
 *
 * The body is trimmed and capped at TASK_INSTRUCTION_MAX_LENGTH on write
 * (AC5 item 24 - enforced here, not only by a UI input's maxLength).
 *
 * Returns the saved TaskInstruction, or null when nothing was written (the
 * blank-institution refusal, or a delete-via-blank-body).
 */
export async function upsertTaskInstruction(
  supabase: SupabaseClient<Database>,
  userId: string,
  institution: string | null | undefined,
  taskId: string,
  body: string | null | undefined
): Promise<TaskInstruction | null> {
  const institutionKey = taskInstructionKey(institution);
  if (institutionKey === "") return null;

  const trimmedBody = (body ?? "").trim();
  if (trimmedBody === "") {
    await deleteTaskInstruction(supabase, userId, institutionKey, taskId);
    return null;
  }

  const cappedBody = trimmedBody.slice(0, TASK_INSTRUCTION_MAX_LENGTH);

  const upsertRow: Database["public"]["Tables"]["course_task_instructions"]["Insert"] = {
    user_id: userId,
    institution: institutionKey,
    task_id: taskId,
    body: cappedBody,
    updated_at: new Date().toISOString(),
  };

  const { data: row, error } = await supabase
    .from("course_task_instructions")
    .upsert(upsertRow, { onConflict: "user_id,institution,task_id" })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapTaskInstructionRow(row);
}

/** Delete one instruction row outright, normalizing `institution` first so a
 * caller passing an un-normalized value (e.g. straight from a course's own
 * institution field) still hits the right row. A no-op (not an error) when
 * `institution` normalizes to "" - nothing could ever have been stored under
 * a blank institution (AC2 item 8), so there is nothing to delete. */
export async function deleteTaskInstruction(
  supabase: SupabaseClient<Database>,
  userId: string,
  institution: string | null | undefined,
  taskId: string
): Promise<void> {
  const institutionKey = taskInstructionKey(institution);
  if (institutionKey === "") return;

  const { error } = await supabase
    .from("course_task_instructions")
    .delete()
    .eq("user_id", userId)
    .eq("institution", institutionKey)
    .eq("task_id", taskId);

  if (error) throw new Error(error.message);
}
