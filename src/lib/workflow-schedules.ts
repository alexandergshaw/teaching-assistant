// Client-side persistence for scheduled workflow runs; the browser talks to
// Supabase directly (owner-scoped RLS). Workflows execute in-browser, so
// schedules fire while the app is open: a page-level watcher claims due rows
// and hands them to the Workflows tab to auto-run.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";

export type ScheduleRepeat = "none" | "interval" | "daily" | "weekly";

// The shortest interval the app offers: unattended runs are polled about every
// 15 minutes (the GitHub Action cadence), so a finer interval would not
// actually fire more often. Enforced in the UI and treated as the floor here.
export const MIN_INTERVAL_MINUTES = 15;

/** Checkpoint for an in-flight institution fan-out (unattended runs only). Lets a
 * truncated fan-out resume on the next cron tick without re-running (and re-posting
 * for) institutions already completed this occurrence. */
export interface FanoutProgress {
  runToken: string;
  occurrenceRunAt: string;
  resumeNextRunAt: string | null;
  doneInstitutions: string[];
  attempts: number;
  /** True once any institution errored this occurrence (across ticks), so a
   * completed fan-out is not reported ok just because the final batch succeeded. */
  anyError: boolean;
}

export function parseFanoutProgress(raw: unknown): FanoutProgress | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.runToken !== "string" || !o.runToken) return null;
  return {
    runToken: o.runToken,
    occurrenceRunAt: typeof o.occurrenceRunAt === "string" ? o.occurrenceRunAt : "",
    resumeNextRunAt: typeof o.resumeNextRunAt === "string" ? o.resumeNextRunAt : null,
    doneInstitutions: Array.isArray(o.doneInstitutions)
      ? o.doneInstitutions.filter((x): x is string => typeof x === "string")
      : [],
    attempts: typeof o.attempts === "number" ? o.attempts : 0,
    anyError: typeof o.anyError === "boolean" ? o.anyError : false,
  };
}

/** Lease window a fan-out claim holds the schedule out of the due-queue. Must
 * exceed maxDuration (60s) so an in-flight run is never double-claimed. */
export const FANOUT_LEASE_MS = 120_000;
/** Cap on resume ticks per occurrence so a fan-out that can never make forward
 * progress cannot pin a schedule forever. */
export const FANOUT_MAX_ATTEMPTS = 50;

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
  /** Minutes between runs when repeat === "interval"; null for none/daily/weekly. */
  intervalMinutes: number | null;
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
  /** In-flight institution fan-out checkpoint; null unless a prior unattended
   * tick truncated a fan-out and left institutions to resume. */
  fanoutProgress: FanoutProgress | null;
}

/**
 * The occurrence after `fromIso` for a repeating schedule, skipped forward past
 * `now` so a pile of missed occurrences collapses into the single next future
 * one. Uses local calendar arithmetic (setDate) so the wall-clock time is
 * preserved across DST changes. Returns null for one-shot schedules.
 */
export function computeNextRunAt(
  fromIso: string,
  repeat: ScheduleRepeat,
  now: Date,
  intervalMinutes: number | null = null
): string | null {
  const next = new Date(fromIso);
  if (Number.isNaN(next.getTime())) return null;
  if (repeat === "interval") {
    // Fixed-minute steps (no calendar arithmetic): a sub-day cadence has no
    // DST wall-clock to preserve, so plain time addition is correct here.
    const step = intervalMinutes && intervalMinutes > 0 ? intervalMinutes : 0;
    if (step <= 0) return null;
    do {
      next.setTime(next.getTime() + step * 60_000);
    } while (next.getTime() <= now.getTime());
    return next.toISOString();
  }
  if (repeat !== "daily" && repeat !== "weekly") return null;
  const stepDays = repeat === "daily" ? 1 : 7;
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
  return {
    ok: true,
    nextRunAt: computeNextRunAt(schedule.nextRunAt, schedule.repeat, now, schedule.intervalMinutes) ?? undefined,
  };
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
  const repeat =
    row.repeat === "daily" || row.repeat === "weekly" || row.repeat === "interval" ? row.repeat : "none";
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
    intervalMinutes: typeof row.interval_minutes === "number" ? row.interval_minutes : null,
    unattended: row.unattended,
    provider: row.provider,
    disabledSteps,
    fanoutProgress: parseFanoutProgress(row.fanout_progress),
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
    intervalMinutes?: number | null;
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
      interval_minutes: input.intervalMinutes ?? null,
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
  const next = computeNextRunAt(schedule.nextRunAt, schedule.repeat, now, schedule.intervalMinutes);
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

type FanoutClaim =
  | { kind: "run"; progress: FanoutProgress }
  | { kind: "abandon"; progress: FanoutProgress };

/** Claim a due fan-out schedule for an unattended run, LEASING it out of the
 * due-queue (next_run_at = now + FANOUT_LEASE_MS) instead of advancing to the
 * next occurrence. Resumes a prior checkpoint (skipping done institutions), runs
 * fresh for a new occurrence, or abandons a wedged one. Returns null if the CAS
 * claim was lost to a concurrent tick. */
export async function claimFanoutSchedule(
  supabase: SupabaseClient<Database>,
  userId: string,
  schedule: WorkflowSchedule,
  now: Date
): Promise<FanoutClaim | null> {
  const prior = schedule.fanoutProgress;
  const rolledOver =
    !!prior && prior.resumeNextRunAt !== null &&
    new Date(prior.resumeNextRunAt).getTime() <= now.getTime();
  const exhausted = !!prior && prior.attempts >= FANOUT_MAX_ATTEMPTS;

  if (prior && exhausted && !rolledOver) {
    const patch: Record<string, unknown> = { fanout_progress: null, updated_at: now.toISOString() };
    if (prior.resumeNextRunAt) patch.next_run_at = prior.resumeNextRunAt;
    else patch.enabled = false;
    const { data, error } = await table(supabase)
      .update(patch)
      .eq("user_id", userId).eq("id", schedule.id)
      .eq("next_run_at", schedule.nextRunAt).eq("enabled", true)
      .select("id");
    if (error) throw new Error(error.message);
    if (!Array.isArray(data) || data.length === 0) return null;
    return { kind: "abandon", progress: prior };
  }

  const resume = prior && !rolledOver ? prior : null;
  const progress: FanoutProgress = resume
    ? { ...resume, attempts: resume.attempts + 1 }
    : {
        runToken:
          typeof globalThis.crypto?.randomUUID === "function"
            ? globalThis.crypto.randomUUID()
            : `${now.getTime()}-${now.getMilliseconds()}`,
        occurrenceRunAt: schedule.nextRunAt,
        resumeNextRunAt: computeNextRunAt(schedule.nextRunAt, schedule.repeat, now, schedule.intervalMinutes),
        doneInstitutions: [],
        attempts: 1,
        anyError: false,
      };

  const leaseIso = new Date(now.getTime() + FANOUT_LEASE_MS).toISOString();
  const { data, error } = await table(supabase)
    .update({
      next_run_at: leaseIso,
      last_run_at: now.toISOString(),
      updated_at: now.toISOString(),
      fanout_progress: progress as unknown as Json,
      enabled: true,
    })
    .eq("user_id", userId).eq("id", schedule.id)
    .eq("next_run_at", schedule.nextRunAt).eq("enabled", true)
    .select("id");
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || data.length === 0) return null;
  return { kind: "run", progress };
}

/** Persist progress (done institutions + anyError) mid-fan-out. CAS on runToken
 * so a stale tick cannot corrupt a newer occurrence. Returns false when the CAS
 * lost (caller no longer owns the occurrence and must stop). */
export async function checkpointFanoutInstitution(
  supabase: SupabaseClient<Database>,
  userId: string,
  scheduleId: string,
  progress: FanoutProgress,
  now: Date
): Promise<boolean> {
  const { data, error } = await table(supabase)
    .update({ fanout_progress: progress as unknown as Json, updated_at: now.toISOString() })
    .eq("user_id", userId).eq("id", scheduleId)
    .eq("fanout_progress->>runToken", progress.runToken)
    .select("id");
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

/** Truncated fan-out: make the schedule immediately due again so the next tick
 * resumes the remainder, keeping the checkpoint. */
export async function deferFanoutResume(
  supabase: SupabaseClient<Database>,
  userId: string,
  scheduleId: string,
  runToken: string,
  now: Date
): Promise<void> {
  const { error } = await table(supabase)
    .update({ next_run_at: now.toISOString(), updated_at: now.toISOString() })
    .eq("user_id", userId).eq("id", scheduleId)
    .eq("fanout_progress->>runToken", runToken);
  if (error) throw new Error(error.message);
}

/** Completed fan-out: clear the checkpoint and restore the real schedule -
 * advance a repeating schedule to its frozen next occurrence, or disable a
 * one-shot. CAS on runToken so a concurrent tick cannot double-finish. */
export async function finishFanoutSchedule(
  supabase: SupabaseClient<Database>,
  userId: string,
  scheduleId: string,
  progress: FanoutProgress,
  now: Date
): Promise<void> {
  const patch: Record<string, unknown> = { fanout_progress: null, updated_at: now.toISOString() };
  if (progress.resumeNextRunAt) patch.next_run_at = progress.resumeNextRunAt;
  else patch.enabled = false;
  const { error } = await table(supabase)
    .update(patch)
    .eq("user_id", userId).eq("id", scheduleId)
    .eq("fanout_progress->>runToken", progress.runToken);
  if (error) throw new Error(error.message);
}
