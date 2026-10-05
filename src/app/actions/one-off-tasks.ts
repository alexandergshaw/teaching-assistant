"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/auth";
import {
  createOneOffTask,
  deleteOneOffTask,
  listOneOffTasks,
  updateOneOffTask,
} from "@/lib/supabase/one-off-tasks";
import {
  validateTaskTitle,
  type NewTaskInput,
  type OneOffTask,
  type TaskPatch,
} from "@/app/components/one-off-tasks/one-off-task-model";

// Every task row is scoped to the signed-in user (user_id on each query), the
// same boundary the table's RLS policies state. Failures return { error }.

export async function listOneOffTasksAction(): Promise<
  { tasks: OneOffTask[] } | { error: string }
> {
  try {
    const user = await requireUser();
    const tasks = await listOneOffTasks(createServiceClient(), user.id);
    return { tasks };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load tasks." };
  }
}

export async function addOneOffTaskAction(
  input: NewTaskInput
): Promise<{ task: OneOffTask } | { error: string }> {
  try {
    const user = await requireUser();
    const checked = validateTaskTitle(input.title);
    if (!checked.ok) return { error: `Invalid title: ${checked.reason}.` };
    const task = await createOneOffTask(createServiceClient(), user.id, {
      title: checked.title,
      college: input.college,
      notes: input.notes,
      dueDate: input.dueDate,
    });
    return { task };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add task." };
  }
}

export async function updateOneOffTaskAction(
  id: string,
  patch: TaskPatch
): Promise<{ task: OneOffTask } | { error: string }> {
  try {
    const user = await requireUser();
    let title = patch.title;
    if (title !== undefined) {
      const checked = validateTaskTitle(title);
      if (!checked.ok) return { error: `Invalid title: ${checked.reason}.` };
      title = checked.title;
    }
    const task = await updateOneOffTask(createServiceClient(), user.id, id, {
      title,
      college: patch.college,
      done: patch.done,
      notes: patch.notes,
      dueDate: patch.dueDate,
    });
    return { task };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update task." };
  }
}

export async function deleteOneOffTaskAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireUser();
    await deleteOneOffTask(createServiceClient(), user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete task." };
  }
}
