// Typed mapper and table access for one_off_tasks. Mirrors problems.ts: the
// functions take an explicit client + userId, every query is scoped with
// .eq("user_id", userId), and a cast-through-any table() helper works around
// typed selects collapsing to never. Rows are mapped explicitly.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import type {
  OneOffTask,
  NewTaskInput,
  TaskPatch,
} from "@/app/components/one-off-tasks/one-off-task-model";

type OneOffTaskRow = Database["public"]["Tables"]["one_off_tasks"]["Row"];

export function mapOneOffTask(row: OneOffTaskRow): OneOffTask {
  return {
    id: row.id,
    title: row.title,
    college: row.college,
    done: row.done,
    notes: row.notes ?? "",
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function taskTable(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("one_off_tasks");
}

export async function listOneOffTasks(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<OneOffTask[]> {
  const { data, error } = await taskTable(supabase)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as OneOffTaskRow[]).map(mapOneOffTask);
}

export async function createOneOffTask(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: NewTaskInput
): Promise<OneOffTask> {
  const { data, error } = await taskTable(supabase)
    .insert({
      user_id: userId,
      title: input.title,
      college: input.college,
      notes: input.notes ?? "",
      due_date: input.dueDate ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapOneOffTask(data as OneOffTaskRow);
}

export async function updateOneOffTask(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  patch: TaskPatch
): Promise<OneOffTask> {
  const updateObj: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) updateObj.title = patch.title;
  if (patch.college !== undefined) updateObj.college = patch.college;
  if (patch.done !== undefined) updateObj.done = patch.done;
  if (patch.notes !== undefined) updateObj.notes = patch.notes;
  if (patch.dueDate !== undefined) updateObj.due_date = patch.dueDate;

  const { data, error } = await taskTable(supabase)
    .update(updateObj)
    .eq("user_id", userId)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapOneOffTask(data as OneOffTaskRow);
}

export async function deleteOneOffTask(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<void> {
  const { error } = await taskTable(supabase)
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}
