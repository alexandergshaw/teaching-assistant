"use server";

// Server actions for per-institution, per-task instruction text (the Tasks
// tab's "how this school wants this task done" standing guidance) -
// docs/task-institution-instructions-acceptance-criteria.md. Thin
// owner-scoped wrappers over src/lib/supabase/task-institution-instructions.ts
// - all persistence, casing normalization, the blank-institution refusal,
// and the clear-to-blank-deletes rule live there so they stay unit-testable
// without a live Supabase session; this file only adds the auth gate and
// the friendly-error input validation that produce a clean {error} instead
// of a raw Supabase failure. Mirrors src/app/actions/course-tasks.ts.

import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  listTaskInstructions,
  upsertTaskInstruction,
  deleteTaskInstruction,
} from "@/lib/supabase/task-institution-instructions";
import type { TaskInstruction } from "@/lib/task-institution-instructions";

/** List every instruction the signed-in owner has recorded, across every
 * institution and task - loaded once per Tasks tab mount. */
export async function listTaskInstructionsAction(): Promise<
  { instructions: TaskInstruction[] } | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const instructions = await listTaskInstructions(supabase, user.id);
    return { instructions };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list task instructions." };
  }
}

/**
 * Create, replace, or (if `body` is blank) delete one instruction for
 * (institution, task). The scope is institution-wide, not per-course -
 * every course at that institution shows the saved value in that task's
 * column (AC1's stated assumption A1) - so callers must make this scope
 * unmistakable at the point of edit (AC5 item 19); this action itself does
 * not (and cannot) know which UI surface is calling it.
 */
export async function saveTaskInstructionAction(
  institution: string,
  taskId: string,
  body: string
): Promise<{ instruction: TaskInstruction | null } | { error: string }> {
  try {
    if (!institution || !institution.trim()) {
      return { error: "An institution is required." };
    }
    if (!taskId || !taskId.trim()) {
      return { error: "A task id is required." };
    }

    const user = await requireOwner();
    const supabase = createServiceClient();
    const instruction = await upsertTaskInstruction(supabase, user.id, institution, taskId, body);
    return { instruction };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the task instruction." };
  }
}

/** Delete the owner's instruction for one (institution, task) pair outright. */
export async function deleteTaskInstructionAction(
  institution: string,
  taskId: string
): Promise<{ ok: true } | { error: string }> {
  try {
    if (!institution || !institution.trim()) {
      return { error: "An institution is required." };
    }
    if (!taskId || !taskId.trim()) {
      return { error: "A task id is required." };
    }

    const user = await requireOwner();
    const supabase = createServiceClient();
    await deleteTaskInstruction(supabase, user.id, institution, taskId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the task instruction." };
  }
}
