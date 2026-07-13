// Client-side persistence for scheduled workflow runs; the browser talks to
// Supabase directly (owner-scoped RLS). Workflows execute in-browser, so
// schedules fire while the app is open: a page-level watcher claims due rows
// and hands them to the Workflows tab to auto-run.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";

export type ScheduleRepeat = "none" | "daily" | "weekly";

export interface WorkflowSchedule {
  id: string;
  /** Owning user; only populated by row-mapping (mapSchedule) - needed by the
   * cron route, which reads schedules across ALL users and has no single
   * `userId` of its own to scope a query by. */
  userId: string;
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
  /** Opt-in: run this schedule server-side (Vercel Cron) even when the app is
   * closed. Only ever true for a workflow that was headless-safe at the time
   * the schedule was created - see isHeadlessSafeWorkflow. */
  unattended: boolean;
  /** LLM provider snapshot at scheduling time (ta-llm-provider); null for
   * schedules created before this column existed, or for app-open schedules
   * that never needed one. The unattended runner defaults this to "gemini". */
  provider: string | null;
  /** Top-level disabled-step-index snapshot (ta-workflow-disabled-<id>) at
   * scheduling time; only meaningful for unattended runs, which have no live
   * localStorage to re-read the user's current toggles from. */
  disabledSteps: number[];
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

// Exported (not just used internally) so the row-shape handling - string-only
// field_values, repeat coercion, disabled_steps filtering - is unit-testable
// without a live Supabase client, mirroring parseDisabledSteps in
// workflows/types.ts.
export function mapSchedule(row: ScheduleRow): WorkflowSchedule {
  const values: Record<string, string> = {};
  if (row.field_values && typeof row.field_values === "object" && !Array.isArray(row.field_values)) {
    for (const [k, v] of Object.entries(row.field_values as Record<string, unknown>)) {
      if (typeof v === "string") values[k] = v;
    }
  }
  const repeat = row.repeat === "daily" || row.repeat === "weekly" ? row.repeat : "none";
  const disabledSteps = Array.isArray(row.disabled_steps)
    ? row.disabled_steps.filter((n): n is number => typeof n === "number")
    : [];
  return {
    id: row.id,
    userId: row.user_id,
    workflowId: row.workflow_id,
    workflowName: row.workflow_name,
    fieldValues: values,
    nextRunAt: row.next_run_at,
    repeat,
    enabled: row.enabled,
    courseId: row.course_id,
    institution: row.institution,
    lastRunAt: row.last_run_at,
    unattended: row.unattended,
    provider: row.provider,
    disabledSteps,
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
    /** Opt-in for server-side (Vercel Cron) execution; defaults to false so
     * every existing call site keeps creating app-open-only schedules. */
    unattended?: boolean;
    provider?: string | null;
    disabledSteps?: number[];
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
      unattended: input.unattended ?? false,
      provider: input.provider ?? null,
      disabled_steps: (input.disabledSteps ?? []) as unknown as Json,
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
 * Due, enabled, unattended schedules across ALL users, soonest first, capped
 * to a small batch. Server-only (the Vercel Cron route): unlike
 * listDueWorkflowSchedules above, this is not scoped to a single signed-in
 * user - the caller must pass a service-role client (RLS would otherwise
 * hide every other user's rows).
 */
export async function listDueUnattendedWorkflowSchedules(
  supabase: SupabaseClient<Database>,
  now: Date,
  limit = 5
): Promise<WorkflowSchedule[]> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("enabled", true)
    .eq("unattended", true)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(limit);
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
