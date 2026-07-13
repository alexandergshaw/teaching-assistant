// Client-side persistence for scheduled workflow runs; the browser talks to
// Supabase directly (owner-scoped RLS). Workflows execute in-browser, so
// schedules fire while the app is open: a page-level watcher claims due rows
// and hands them to the Workflows tab to auto-run.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";

export type ScheduleRepeat = "none" | "daily" | "weekly";

export interface WorkflowSchedule {
  id: string;
  workflowId: string;
  workflowName: string;
  /** Snapshot of the run form's values at scheduling time (uploads excluded). */
  fieldValues: Record<string, string>;
  /** ISO timestamp of the next firing. */
  nextRunAt: string;
  repeat: ScheduleRepeat;
  enabled: boolean;
  courseId: string | null;
  institution: string | null;
  lastRunAt: string | null;
}

/**
 * The occurrence after `fromIso` for a repeating schedule, skipped forward past
 * `now` so a pile of missed occurrences collapses into the single next future
 * one. Uses local calendar arithmetic (setDate) so the wall-clock time is
 * preserved across DST changes. Returns null for one-shot schedules.
 */
export function computeNextRunAt(fromIso: string, repeat: ScheduleRepeat, now: Date): string | null {
  if (repeat !== "daily" && repeat !== "weekly") return null;
  const stepDays = repeat === "daily" ? 1 : 7;
  const next = new Date(fromIso);
  if (Number.isNaN(next.getTime())) return null;
  do {
    next.setDate(next.getDate() + stepDays);
  } while (next.getTime() <= now.getTime());
  return next.toISOString();
}

/**
 * Whether a disabled schedule can be re-armed, and the adjusted next
 * occurrence when its stored time has already passed (so re-enabling never
 * fires immediately). One-shot schedules in the past cannot re-arm.
 */
export function reenableSchedule(schedule: WorkflowSchedule): { ok: boolean; nextRunAt?: string } {
  const now = new Date();
  if (new Date(schedule.nextRunAt).getTime() > now.getTime()) {
    return { ok: true };
  }
  if (schedule.repeat === "none") {
    return { ok: false };
  }
  return { ok: true, nextRunAt: computeNextRunAt(schedule.nextRunAt, schedule.repeat, now) ?? undefined };
}

type ScheduleRow = Database["public"]["Tables"]["workflow_schedules"]["Row"];

function mapSchedule(row: ScheduleRow): WorkflowSchedule {
  const values: Record<string, string> = {};
  if (row.field_values && typeof row.field_values === "object" && !Array.isArray(row.field_values)) {
    for (const [k, v] of Object.entries(row.field_values as Record<string, unknown>)) {
      if (typeof v === "string") values[k] = v;
    }
  }
  const repeat = row.repeat === "daily" || row.repeat === "weekly" ? row.repeat : "none";
  return {
    id: row.id,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    fieldValues: values,
    nextRunAt: row.next_run_at,
    repeat,
    enabled: row.enabled,
    courseId: row.course_id,
    institution: row.institution,
    lastRunAt: row.last_run_at,
  };
}

function table(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("workflow_schedules");
}

/** All of the owner's schedules, soonest next run first. */
export async function listWorkflowSchedules(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<WorkflowSchedule[]> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("user_id", userId)
    .order("next_run_at", { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as ScheduleRow[]).map(mapSchedule);
}

export async function createWorkflowSchedule(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    workflowId: string;
    workflowName: string;
    fieldValues: Record<string, string>;
    nextRunAt: string;
    repeat: ScheduleRepeat;
    courseId?: string | null;
    institution?: string | null;
  }
): Promise<WorkflowSchedule> {
  const { data, error } = await table(supabase)
    .insert({
      user_id: userId,
      workflow_id: input.workflowId,
      workflow_name: input.workflowName,
      field_values: input.fieldValues as unknown as Json,
      next_run_at: input.nextRunAt,
      repeat: input.repeat,
      course_id: input.courseId ?? null,
      institution: input.institution ?? null,
    })
    .select("*")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return mapSchedule(data as ScheduleRow);
}

export async function updateWorkflowSchedule(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  fields: { enabled?: boolean; nextRunAt?: string; repeat?: ScheduleRepeat }
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.enabled !== undefined) patch.enabled = fields.enabled;
  if (fields.nextRunAt !== undefined) patch.next_run_at = fields.nextRunAt;
  if (fields.repeat !== undefined) patch.repeat = fields.repeat;
  const { error } = await table(supabase).update(patch).eq("user_id", userId).eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteWorkflowSchedule(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<void> {
  const { error } = await table(supabase).delete().eq("user_id", userId).eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

/** The owner's due, enabled schedules (next_run_at in the past), soonest first. */
export async function listDueWorkflowSchedules(
  supabase: SupabaseClient<Database>,
  userId: string,
  now: Date
): Promise<WorkflowSchedule[]> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("user_id", userId)
    .eq("enabled", true)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(5);
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as ScheduleRow[]).map(mapSchedule);
}

/**
 * Atomically claim a due schedule before running it: advance repeating
 * schedules to their next future occurrence and disable one-shots. The update
 * is conditioned on next_run_at still holding its read value, so a second tab
 * ticking at the same moment loses the claim and skips the run.
 */
export async function claimWorkflowSchedule(
  supabase: SupabaseClient<Database>,
  userId: string,
  schedule: WorkflowSchedule,
  now: Date
): Promise<boolean> {
  const next = computeNextRunAt(schedule.nextRunAt, schedule.repeat, now);
  const patch: Record<string, unknown> = {
    last_run_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  if (next) {
    patch.next_run_at = next;
  } else {
    patch.enabled = false;
  }
  const { data, error } = await table(supabase)
    .update(patch)
    .eq("user_id", userId)
    .eq("id", schedule.id)
    .eq("next_run_at", schedule.nextRunAt)
    .eq("enabled", true)
    .select("id");
  if (error) {
    throw new Error(error.message);
  }
  return Array.isArray(data) && data.length > 0;
}
