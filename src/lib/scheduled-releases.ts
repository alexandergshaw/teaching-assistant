// Scheduled publishing from Modules: the durable queue of individual publish
// targets waiting to go live.
// docs/scheduled-publishing-from-modules-acceptance-criteria.md, "Post-design
// corrections" section, F2 and the storage half of F5.
//
// This file is the durable half ONLY - no UI, no cron wiring, no Canvas
// calls. It owns: the row shape, the state machine, the pure decisions about
// which rows are due and which claims have gone stale, and thin Supabase
// wrappers around those decisions. A later chunk wires an actual cron route
// handler around listDueScheduledReleases/claimScheduledRelease/
// markScheduledRelease{Done,Failed} and does the Canvas writes (including
// F4's "unpublish anything already published, immediately at commit time").
//
// ONE ROW PER TARGET (supabase/migrations/20261008000000_scheduled_releases
// .sql explains why at length: workflow_schedules' claim ADVANCES OR DISABLES
// the row, wrong for a one-shot release; N targets in one jsonb blob makes a
// partial crash unrepresentable; becoming a workflow inherits the
// isHeadlessSafeWorkflow gate, which silently skips). Every pure function
// below therefore operates on ONE row and never reasons about siblings - that
// is deliberate, not an oversight: it is what makes "3 of 10 published, the
// other 7 are still independently due" true after a crash.
//
// THE TARGET REFERENCE IS GENERIC: (kind, id), covering both a module and a
// module item. F9's first unknown - whether an item published inside an
// unpublished module is actually visible to students - decides whether
// releases ever need to target modules, items, or both, and it is unresolved
// as of this file. Do not narrow ReleaseTargetKind to a single case before
// that question is answered.
//
// PURE FUNCTIONS TAKE `now` AS A PARAMETER throughout, so tests pin exact
// boundaries instead of racing the real clock (mirrors classifyCronHeartbeat
// in cron-heartbeat.ts and computeNextRunAt in workflow-schedules.ts).
//
// THE STATE MACHINE: pending -> claimed -> done | failed, with a stale claim
// looping claimed -> pending (once) or claimed -> failed (once exhausted).
// See the migration header for the full rationale of each transition; the
// short version is that this follows workflow-schedules.ts's claim/stale-
// sweep SHAPE (a value-based compare-and-set, a cutoff-based stale query, a
// capped recovery-attempts counter) without reusing its claim semantics,
// which are wrong for a one-shot row (F2).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

// ---------------------------------------------------------------------------
// Types

export type ReleaseTargetKind = "module" | "module_item";

/** A generic reference to the thing being released - see the file header for
 * why this is a (kind, id) pair rather than two separate id columns. */
export interface ReleaseTargetRef {
  kind: ReleaseTargetKind;
  /** Canvas's own id for the module or module item. */
  id: number;
}

export type ReleaseStatus = "pending" | "claimed" | "done" | "failed";

const VALID_STATUSES = new Set<ReleaseStatus>(["pending", "claimed", "done", "failed"]);

export interface ScheduledRelease {
  id: string;
  userId: string;
  /** Not a course_hub foreign key - resolveCourse (canvas-core.ts) needs only
   * a URL plus an optional acronym, so this table does too (F2). */
  courseUrl: string;
  /** Institution acronym snapshot, passed to resolveCourse's second argument
   * alongside courseUrl; null when the course was resolved by URL-host
   * matching alone. */
  courseAcronym: string | null;
  target: ReleaseTargetRef;
  /** Absolute UTC instant to release at (ISO 8601), computed in the browser
   * (AC4) and stored as-is; nothing in this file re-derives it. */
  releaseAt: string;
  status: ReleaseStatus;
  /** Set while status === "claimed"; null otherwise, including after a stale
   * sweep re-arms the row back to "pending". */
  claimedAt: string | null;
  /** How many times the stale sweep has already re-armed this row; capped at
   * MAX_RECOVERY_ATTEMPTS so a target whose runner keeps dying becomes
   * visibly "failed" instead of retrying forever. */
  recoveryAttempts: number;
  /** Most recent failure detail (a refused Canvas write, or a stale-claim
   * recovery note), or null. Left in place after a terminal "failed" row so a
   * future UI has something to show for AC8; cleared on a successful "done". */
  lastError: string | null;
  /** Set only when status becomes "done". */
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants

/** How long a row may sit at status "claimed" before the stale sweep treats
 * it as abandoned (a claim whose runner - a cron tick or a browser tab - never
 * reported back). Same shape and same value as workflow-schedules.ts's
 * STALE_CLAIM_MS: comfortably above the 60-second maxDuration cap every
 * runner in this repo is bound by, so a genuinely in-flight release is never
 * swept mid-flight, while a dead one is recovered within one polling window. */
export const STALE_CLAIM_MS = 15 * 60_000;

/** Cap on stale-claim retries per row: the sweep re-arms an interrupted claim
 * exactly once, then leaves it "failed" - visibly, per AC8 - rather than
 * retrying a target that keeps failing to confirm forever. */
export const MAX_RECOVERY_ATTEMPTS = 1;

/** Cap on rows claimed per tick. A release is one Canvas write (plus, per F4,
 * possibly one unpublish-first write) - much cheaper than a full workflow
 * run, so this batch is larger than listDueWorkflowSchedules' 5, but is still
 * bounded so the release phase cannot alone exhaust the cron route's 60-second
 * budget before the route's other work (F2: releases run FIRST, under their
 * own sub-budget) gets a turn. */
export const RELEASE_DUE_BATCH_LIMIT = 20;

// ---------------------------------------------------------------------------
// Pure decisions - no clock, no I/O. `now` is always a parameter.

/** Whether a row is due: pending, and its release_at has arrived. A row due
 * at EXACTLY `now` is due (`<=`, not `<`) - a release scheduled for the
 * instant the cron tick happens to run at must not wait for the next tick. */
export function isReleaseDue(row: { status: ReleaseStatus; releaseAt: string }, now: Date): boolean {
  if (row.status !== "pending") return false;
  const dueAt = Date.parse(row.releaseAt);
  if (Number.isNaN(dueAt)) return false;
  return dueAt <= now.getTime();
}

/**
 * Due rows, soonest first, capped to `limit`. Operates only on each row's own
 * status/releaseAt - never on any other row in the array - which is the
 * property that makes a partial run's untouched rows independently due on
 * the very next call, no matter what happened to their siblings.
 */
export function selectDueScheduledReleases<T extends { status: ReleaseStatus; releaseAt: string }>(
  rows: T[],
  now: Date,
  limit: number = RELEASE_DUE_BATCH_LIMIT
): T[] {
  return rows
    .filter((row) => isReleaseDue(row, now))
    .sort((a, b) => Date.parse(a.releaseAt) - Date.parse(b.releaseAt))
    .slice(0, limit);
}

/** Whether a claimed row has gone stale. Strictly greater-than `staleMs`
 * (mirrors recoverStaleWorkflowSchedule's `.lt("last_run_at", cutoff)`, i.e.
 * a claim exactly `staleMs` old is NOT yet stale - it still has the rest of
 * that instant to report back). */
export function isClaimStale(
  row: { status: ReleaseStatus; claimedAt: string | null },
  now: Date,
  staleMs: number = STALE_CLAIM_MS
): boolean {
  if (row.status !== "claimed" || !row.claimedAt) return false;
  const claimedAt = Date.parse(row.claimedAt);
  if (Number.isNaN(claimedAt)) return false;
  return now.getTime() - claimedAt > staleMs;
}

const INTERRUPTED_REASON =
  "did not finish - the release was interrupted before it could confirm success or failure on Canvas";

/**
 * Detail string + whether a stale-claimed row should be re-armed to
 * "pending", for a row found stuck at "claimed" past STALE_CLAIM_MS. Pure so
 * the attempts-gating (retry once, then stop) is directly testable, mirroring
 * decideStaleScheduleRecovery in workflow-schedules.ts.
 */
export function decideReleaseRecovery(recoveryAttempts: number): { detail: string; retry: boolean } {
  if (recoveryAttempts < MAX_RECOVERY_ATTEMPTS) {
    return {
      detail: `${INTERRUPTED_REASON}; it was recovered and will retry on the next tick.`,
      retry: true,
    };
  }
  return {
    detail: `${INTERRUPTED_REASON}; it was already retried once, so no further retry was scheduled. The target may still be unpublished on Canvas.`,
    retry: false,
  };
}

/** True for a Postgres unique-violation error (SQLSTATE 23505) - the shape a
 * concurrent insert against this table's partial unique index produces. */
export function isUniqueViolationError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

// ---------------------------------------------------------------------------
// Row mapping. Explicitly typed rather than a bare cast of the select result:
// a typed Supabase select against a table the generated Database type does
// not know collapses to `never`, and every field then silently reads as
// `any`. Same shape as mapCronHeartbeat (cron-heartbeat.ts) and mapSchedule
// (workflow-schedules.ts).

function mapTargetKind(raw: unknown): ReleaseTargetKind {
  // The migration's CHECK constraint is the real guarantee; this is
  // belt-and-braces defense for a row read before a future migration might
  // add a third kind, matching mapDaysOfWeek's defensive-default idiom.
  return raw === "module" ? "module" : "module_item";
}

function mapStatus(raw: unknown): ReleaseStatus {
  return typeof raw === "string" && VALID_STATUSES.has(raw as ReleaseStatus) ? (raw as ReleaseStatus) : "pending";
}

function optionalString(raw: unknown): string | null {
  return raw === null || raw === undefined ? null : String(raw);
}

function mapScheduledRelease(row: Record<string, unknown>): ScheduledRelease {
  return {
    id: String(row.id ?? ""),
    userId: String(row.user_id ?? ""),
    courseUrl: String(row.course_url ?? ""),
    courseAcronym: optionalString(row.course_acronym),
    target: { kind: mapTargetKind(row.target_kind), id: Number(row.target_id ?? 0) },
    releaseAt: String(row.release_at ?? ""),
    status: mapStatus(row.status),
    claimedAt: optionalString(row.claimed_at),
    recoveryAttempts: Number(row.recovery_attempts ?? 0),
    lastError: optionalString(row.last_error),
    completedAt: optionalString(row.completed_at),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function table(supabase: SupabaseClient<Database>): any {
  // The generated Database type does not know this table (see mapCronHeartbeat
  // in cron-heartbeat.ts for the full explanation of why a typed .from() call
  // would collapse to `never`). The `any` cast is confined to this one
  // function; every caller gets the explicitly-typed ScheduledRelease shape
  // back through mapScheduledRelease.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("scheduled_releases");
}

// ---------------------------------------------------------------------------
// Thin Supabase wrappers - each one is a direct expression of a pure decision
// above, with no independent logic of its own.

export interface ScheduleReleaseInput {
  courseUrl: string;
  courseAcronym: string | null;
  target: ReleaseTargetRef;
  /** Absolute UTC instant (ISO 8601), computed in the browser - see AC4. */
  releaseAt: string;
}

/**
 * Write-ahead insert of one target's pending release row. Per AC5, a target
 * that already has a pending row is RESCHEDULED (its release_at is updated in
 * place) rather than duplicated - update-then-insert, not upsert, because
 * PostgREST's upsert has no way to supply a partial index's own WHERE
 * predicate as the ON CONFLICT arbiter, so it cannot target
 * scheduled_releases_pending_target_idx directly. The bounded retry loop
 * handles the race where two schedule calls for the same target both miss
 * the update and both attempt to insert: the loser's insert hits the unique
 * index (23505), and it re-reads/updates the winner's row instead of
 * surfacing a spurious failure for what the instructor experiences as a
 * single reschedule action.
 */
export async function scheduleRelease(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: ScheduleReleaseInput
): Promise<ScheduledRelease> {
  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const nowIso = new Date().toISOString();
    const { data: updated, error: updateError } = await table(supabase)
      .update({
        release_at: input.releaseAt,
        course_acronym: input.courseAcronym,
        updated_at: nowIso,
      })
      .eq("user_id", userId)
      .eq("course_url", input.courseUrl)
      .eq("target_kind", input.target.kind)
      .eq("target_id", input.target.id)
      .eq("status", "pending")
      .select("*");
    if (updateError) throw new Error(updateError.message);
    if (Array.isArray(updated) && updated.length > 0) {
      return mapScheduledRelease(updated[0] as Record<string, unknown>);
    }

    const { data: inserted, error: insertError } = await table(supabase)
      .insert({
        user_id: userId,
        course_url: input.courseUrl,
        course_acronym: input.courseAcronym,
        target_kind: input.target.kind,
        target_id: input.target.id,
        release_at: input.releaseAt,
        status: "pending",
      })
      .select("*")
      .single();
    if (!insertError) {
      return mapScheduledRelease(inserted as Record<string, unknown>);
    }
    if (!isUniqueViolationError(insertError)) {
      throw new Error(insertError.message);
    }
    // Lost the race to a concurrent scheduler for the same target - loop
    // around and update its row instead.
  }
  throw new Error("Could not schedule the release: too many concurrent writers for the same target.");
}

/** Due, pending releases across ALL users, soonest first, capped to a batch.
 * Server-only (the cron route): not scoped to a single signed-in user, so the
 * caller must pass a service-role client (RLS would otherwise hide every
 * other user's rows), mirroring listDueUnattendedWorkflowSchedules. */
export async function listDueScheduledReleases(
  supabase: SupabaseClient<Database>,
  now: Date,
  limit: number = RELEASE_DUE_BATCH_LIMIT
): Promise<ScheduledRelease[]> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("status", "pending")
    .lte("release_at", now.toISOString())
    .order("release_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(mapScheduledRelease);
}

/**
 * Atomically claim a due row before acting on it: the update is conditioned
 * on status still being "pending" AND release_at still holding its read
 * value, so a second concurrent claimant (another tick, or an open tab)
 * matches zero rows and returns false rather than double-processing the same
 * target. Unlike claimWorkflowSchedule, this never advances the row to a
 * future occurrence - a one-shot release has none (F2).
 */
export async function claimScheduledRelease(
  supabase: SupabaseClient<Database>,
  release: Pick<ScheduledRelease, "id" | "releaseAt">,
  now: Date
): Promise<boolean> {
  const { data, error } = await table(supabase)
    .update({
      status: "claimed",
      claimed_at: now.toISOString(),
      last_error: null,
      updated_at: now.toISOString(),
    })
    .eq("id", release.id)
    .eq("status", "pending")
    .eq("release_at", release.releaseAt)
    .select("id");
  if (error) throw new Error(error.message);
  return Array.isArray(data) && data.length > 0;
}

/** Mark a claimed row done: terminal success. CAS'd on status still being
 * "claimed" so a row already recovered by a concurrent stale sweep (and thus
 * back to "pending" or "failed") cannot be clobbered into "done" out from
 * under that sweep. */
export async function markScheduledReleaseDone(
  supabase: SupabaseClient<Database>,
  id: string,
  now: Date
): Promise<void> {
  const { error } = await table(supabase)
    .update({
      status: "done",
      completed_at: now.toISOString(),
      last_error: null,
      updated_at: now.toISOString(),
    })
    .eq("id", id)
    .eq("status", "claimed");
  if (error) throw new Error(error.message);
}

/** Mark a claimed row failed: terminal, but VISIBLE (AC8) - never silently
 * dropped. `detail` is capped at 500 chars, matching every other detail
 * column in this codebase (recordCronHeartbeat, updateScheduleRunOutcome). */
export async function markScheduledReleaseFailed(
  supabase: SupabaseClient<Database>,
  id: string,
  now: Date,
  detail: string
): Promise<void> {
  const { error } = await table(supabase)
    .update({
      status: "failed",
      last_error: detail.slice(0, 500),
      updated_at: now.toISOString(),
    })
    .eq("id", id)
    .eq("status", "claimed");
  if (error) throw new Error(error.message);
}

/** Rows stuck at status "claimed" for longer than STALE_CLAIM_MS - claimed
 * but never reported back. Server-only, not scoped to a single user, mirroring
 * listStaleClaimedWorkflowSchedules. */
export async function listStaleClaimedScheduledReleases(
  supabase: SupabaseClient<Database>,
  now: Date,
  limit: number = RELEASE_DUE_BATCH_LIMIT
): Promise<ScheduledRelease[]> {
  const cutoff = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
  const { data, error } = await table(supabase)
    .select("*")
    .eq("status", "claimed")
    .lt("claimed_at", cutoff)
    .order("claimed_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(mapScheduledRelease);
}

/**
 * Recover one stale-claimed row: stamp it with an honest interrupted-claim
 * detail, and either re-arm it to "pending" (recovery_attempts + 1, the first
 * sweep) or leave it "failed" (recovery_attempts already at the cap).
 * CAS'd on status still being "claimed" so a row that already completed
 * concurrently is left alone. Caller wraps this per-row so one failure cannot
 * abort the sweep, mirroring recoverStaleWorkflowSchedule.
 */
export async function recoverStaleScheduledRelease(
  supabase: SupabaseClient<Database>,
  release: Pick<ScheduledRelease, "id" | "recoveryAttempts">,
  now: Date
): Promise<{ detail: string; retried: boolean }> {
  const { detail, retry } = decideReleaseRecovery(release.recoveryAttempts);
  const patch: Record<string, unknown> = {
    last_error: detail.slice(0, 500),
    updated_at: now.toISOString(),
  };
  if (retry) {
    patch.status = "pending";
    patch.claimed_at = null;
    patch.recovery_attempts = release.recoveryAttempts + 1;
  } else {
    patch.status = "failed";
  }
  const { error } = await table(supabase)
    .update(patch)
    .eq("id", release.id)
    .eq("status", "claimed");
  if (error) throw new Error(error.message);
  return { detail, retried: retry };
}
