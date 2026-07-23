// Client-side persistence for scheduled workflow runs; the browser talks to
// Supabase directly (owner-scoped RLS). Workflows execute in-browser, so
// schedules fire while the app is open: a page-level watcher claims due rows
// and hands them to the Workflows tab to auto-run.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";
import type { WorkflowRunStatus } from "./workflow-run-status";

export type ScheduleRepeat = "none" | "interval" | "daily" | "weekly";

const VALID_RUN_STATUSES = new Set<string>(["started", "ok", "error", "skipped"]);

// The shortest interval the app offers: unattended runs are polled about every
// 15 minutes (the GitHub Action cadence), so a finer interval would not
// actually fire more often. Enforced in the UI and treated as the floor here.
export const MIN_INTERVAL_MINUTES = 15;

/** Checkpoint for an in-flight fan-out (institution or course; unattended runs only).
 * Lets a truncated fan-out resume on the next cron tick without re-running (and
 * re-posting for) entities already completed this occurrence. */
export interface FanoutProgress {
  runToken: string;
  occurrenceRunAt: string;
  resumeNextRunAt: string | null;
  doneInstitutions: string[];
  /** Tile ids completed for a course fan-out (additive to the Json blob - old
   * blobs without it parse fine). */
  doneCourses?: string[];
  attempts: number;
  /** True once any entity errored this occurrence (across ticks), so a
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
    doneCourses: Array.isArray(o.doneCourses)
      ? o.doneCourses.filter((x): x is string => typeof x === "string")
      : undefined,
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
  /** Status of the last run: "started", "ok", "error", or "skipped", or null
   * if never run. */
  lastRunStatus: WorkflowRunStatus | null;
  /** Human-readable detail of the last run outcome, or null if never run. */
  lastRunDetail: string | null;
  /** How many times the stale-claim sweep has already re-armed this
   * occurrence after an interrupted run; capped at 1 so a run that keeps
   * getting abandoned does not retry forever (see recoverStaleWorkflowSchedule). */
  recoveryAttempts: number;
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

/**
 * Human-readable cadence label for a schedule: "daily", "weekly (Monday)",
 * "every 2 hr", "every 30 min", or "once".
 */
export function describeScheduleCadence(s: WorkflowSchedule): string {
  if (s.repeat === "daily") return "daily";
  if (s.repeat === "weekly") {
    if (s.nextRunAt) {
      const wd = new Date(s.nextRunAt).toLocaleDateString(undefined, { weekday: "long" });
      return `weekly (${wd})`;
    }
    return "weekly";
  }
  if (s.repeat === "interval" && s.intervalMinutes) {
    return s.intervalMinutes % 60 === 0
      ? `every ${s.intervalMinutes / 60} hr`
      : `every ${s.intervalMinutes} min`;
  }
  return "once";
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
    lastRunStatus: (row.last_run_status && VALID_RUN_STATUSES.has(row.last_run_status) ? row.last_run_status : null) as WorkflowRunStatus | null,
    lastRunDetail: row.last_run_detail ?? null,
    recoveryAttempts: typeof row.recovery_attempts === "number" ? row.recovery_attempts : 0,
  };
}

function table(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("workflow_schedules");
}

/** Grace window past which the in-app watcher may claim an overdue unattended
 * schedule anyway - a backstop for when the server cron lags or is paused
 * (GitHub Action schedules are best-effort; this repo has seen ~hourly
 * delivery and a total registration failure before). Otherwise unattended
 * schedules belong to the server cron, not the browser tab. */
export const WATCHER_UNATTENDED_GRACE_MS = 45 * 60_000;

/**
 * Whether the in-app watcher (polling every ~60s while a tab is open) should
 * claim this due schedule, or leave it for the server cron. Pure so both
 * branches are directly testable:
 * - Attended schedules: always claimable (today's behavior, unchanged).
 * - Unattended schedules: only claimable once overdue by more than
 *   `graceMs` past their next_run_at - otherwise the server cron owns it.
 */
export function shouldWatcherClaim(
  schedule: Pick<WorkflowSchedule, "unattended" | "nextRunAt">,
  now: Date,
  graceMs: number = WATCHER_UNATTENDED_GRACE_MS
): boolean {
  if (!schedule.unattended) return true;
  const dueAt = new Date(schedule.nextRunAt).getTime();
  if (Number.isNaN(dueAt)) return true;
  return now.getTime() - dueAt > graceMs;
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
  fields: {
    enabled?: boolean;
    nextRunAt?: string;
    repeat?: ScheduleRepeat;
    intervalMinutes?: number | null;
    unattended?: boolean;
    courseId?: string | null;
    institution?: string | null;
    fieldValues?: Record<string, unknown>;
  }
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.enabled !== undefined) patch.enabled = fields.enabled;
  if (fields.nextRunAt !== undefined) patch.next_run_at = fields.nextRunAt;
  if (fields.repeat !== undefined) patch.repeat = fields.repeat;
  if (fields.intervalMinutes !== undefined) patch.interval_minutes = fields.intervalMinutes;
  if (fields.unattended !== undefined) patch.unattended = fields.unattended;
  if (fields.courseId !== undefined) patch.course_id = fields.courseId;
  if (fields.institution !== undefined) patch.institution = fields.institution;
  if (fields.fieldValues !== undefined) patch.field_values = fields.fieldValues;
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
    last_run_status: "started",
    last_run_detail: null,
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
      last_run_status: "started",
      last_run_detail: null,
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

/** How long a schedule may sit at last_run_status "started" before the cron
 * sweep treats it as abandoned (a claimed occurrence whose runner - browser
 * tab or server process - never reported back). Comfortably above the
 * watcher's 60s poll and the fan-out lease (FANOUT_LEASE_MS) so a genuinely
 * in-flight run is never swept mid-flight. */
export const STALE_CLAIM_MS = 15 * 60_000;

/** Cap on stale-claim retries per occurrence: the sweep re-arms an
 * interrupted run exactly once, so a schedule whose runner keeps dying can
 * never loop forever. */
export const MAX_RECOVERY_ATTEMPTS = 1;

const INTERRUPTED_REASON =
  "did not finish - the run was interrupted (a browser tab running it was closed, or the process stopped)";

/**
 * Detail string + whether the occurrence should be made due again, for a
 * schedule found stuck at last_run_status "started" past STALE_CLAIM_MS. Pure
 * so the attempts-gating (retry once, then stop) is directly testable.
 */
export function decideStaleScheduleRecovery(recoveryAttempts: number): { detail: string; retry: boolean } {
  if (recoveryAttempts < MAX_RECOVERY_ATTEMPTS) {
    return {
      detail: `${INTERRUPTED_REASON}; the occurrence was recovered and will retry on the next tick.`,
      retry: true,
    };
  }
  return {
    detail: `${INTERRUPTED_REASON}; it was already retried once, so no further retry was scheduled.`,
    retry: false,
  };
}

/**
 * Schedules stuck at last_run_status "started" for longer than STALE_CLAIM_MS
 * (claimed but never reported back), enabled or not, capped like the other
 * cron queries. Server-only: not scoped to a single user, mirroring
 * listDueUnattendedWorkflowSchedules.
 */
export async function listStaleClaimedWorkflowSchedules(
  supabase: SupabaseClient<Database>,
  now: Date,
  limit = 5
): Promise<WorkflowSchedule[]> {
  const cutoff = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
  const { data, error } = await table(supabase)
    .select("*")
    .eq("last_run_status", "started")
    .lt("last_run_at", cutoff)
    .order("last_run_at", { ascending: true })
    .limit(limit);
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as ScheduleRow[]).map(mapSchedule);
}

/**
 * Recover one stale-claimed schedule: stamp it honestly as an interrupted
 * error, and either re-arm the occurrence (next_run_at = now, incrementing
 * recovery_attempts - the first stale sweep) or leave next_run_at alone when
 * it has already been retried, PRESERVING recovery_attempts so the guard
 * against retry loops holds. Only a successful run resets the counter to 0
 * (updateScheduleRunOutcome). Caller wraps this per-row so one failure
 * cannot abort the sweep.
 */
export async function recoverStaleWorkflowSchedule(
  supabase: SupabaseClient<Database>,
  schedule: WorkflowSchedule,
  now: Date
): Promise<{ detail: string; retried: boolean }> {
  const { detail, retry } = decideStaleScheduleRecovery(schedule.recoveryAttempts);
  const patch: Record<string, unknown> = {
    last_run_status: "error",
    last_run_detail: detail.slice(0, 500),
    updated_at: now.toISOString(),
    recovery_attempts: retry ? schedule.recoveryAttempts + 1 : schedule.recoveryAttempts,
  };
  if (retry) {
    patch.next_run_at = now.toISOString();
  }
  const { error } = await table(supabase)
    .update(patch)
    .eq("user_id", schedule.userId)
    .eq("id", schedule.id)
    .eq("last_run_status", "started");
  if (error) {
    throw new Error(error.message);
  }
  return { detail, retried: retry };
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
