// Cron heartbeat - the "did the scheduler fire at all" fact.
// docs/scheduled-publishing-from-modules-acceptance-criteria.md F5/F9(2).
// Server-safe (no "use client"); the classification half is pure and is what
// the UI actually renders.
//
// The hole this closes: with an empty due list /api/cron/run-schedules writes
// nothing at all, so a dead cron and a quiet one look identical from the app.
// `last_run_status` cannot help - it is per-schedule state written only by a
// tick that ran, so it can never describe the tick that never happened. The
// route now upserts ONE row on EVERY tick, before it knows whether it has any
// work, and the app compares that timestamp against now.
//
// Ships alone, ahead of the rest of scheduled publishing, deliberately (F9
// ranks "does the Actions cron fire reliably for this repo?" as the second
// highest-risk unknown in that feature and calls this increment the
// experiment that answers it with real data). This repository is PUBLIC, so
// GitHub's 60-day auto-disable of scheduled workflows on inactive repos
// applies (F3) - a quiet summer stops the tick, and until now nothing would
// have noticed.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

/** The tick this heartbeat describes. Rows are keyed by tick name AND CALLER
 * (see heartbeatIdForSource) rather than by tick name alone, and that is a
 * correctness requirement, not filing tidiness: `vercel.json` registers this
 * SAME route on its own cron, and on the Hobby plan Vercel silently throttles
 * sub-daily crons to roughly once a day. Sharing one row would let that daily
 * Vercel tick stamp `last_tick_at` and render "the scheduler last ran 3
 * minutes ago" while the 15-minute GitHub Actions cron - the one whose
 * cadence every threshold below is derived from - is completely dead. That is
 * precisely the reassuring-while-broken state this feature exists to expose,
 * so the two callers get two rows and the app watches the one it means. */
export const RUN_SCHEDULES_HEARTBEAT_ID = "run-schedules";

/** The caller whose cadence CRON_TICK_INTERVAL_MINUTES describes, and the one
 * the app's status surface asks about. `.github/workflows/unattended-runs.yml`
 * sends exactly this string. */
export const GITHUB_ACTIONS_SOURCE = "github-actions";

/** One row per (tick, caller). The source is normalised into an id-safe slug
 * so an unrecognised or hostile `?source=` value can only ever create its own
 * harmless row - it can never collide with, or overwrite, the row the status
 * surface reads. An empty/blank source becomes "unknown" rather than
 * producing a trailing-colon id. */
export function heartbeatIdForSource(source: string): string {
  const slug = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${RUN_SCHEDULES_HEARTBEAT_ID}:${slug || "unknown"}`;
}

/** The cron's real cadence: `.github/workflows/unattended-runs.yml` fires at
 * 4, 19, 34 and 49 minutes past the hour - every 15 minutes, on deliberately
 * offset minutes (on-the-interval crons are load-shed by GitHub). Everything
 * downstream derives its thresholds from THIS number rather than hardcoding
 * minutes, so changing the workflow's cron changes the staleness thresholds
 * with it. */
export const CRON_TICK_INTERVAL_MINUTES = 15;

export interface CronHeartbeat {
  id: string;
  lastTickAt: string;
  lastTickSource: string;
  schedulesProcessed: number;
  triggersProcessed: number;
  durationMs: number | null;
  lastError: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function heartbeatTable(supabase: SupabaseClient<Database>): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("cron_heartbeat");
}

/** Explicitly-typed row mapper rather than a bare cast of the select result -
 * a typed Supabase select against a table the generated Database type does
 * not know collapses to `never`, and every field then silently reads as
 * `any`. Same shape as mapRecordingFile. */
function mapCronHeartbeat(row: Record<string, unknown>): CronHeartbeat {
  return {
    id: String(row.id ?? ""),
    lastTickAt: String(row.last_tick_at ?? ""),
    lastTickSource: String(row.last_tick_source ?? "unknown"),
    schedulesProcessed: Number(row.schedules_processed ?? 0),
    triggersProcessed: Number(row.triggers_processed ?? 0),
    durationMs: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
    lastError: row.last_error === null || row.last_error === undefined ? null : String(row.last_error),
  };
}

export interface RecordCronHeartbeatInput {
  id?: string;
  tickAt: Date;
  source: string;
  schedulesProcessed: number;
  triggersProcessed: number;
  durationMs: number | null;
  lastError: string | null;
}

/**
 * Upserts the tick's heartbeat. BEST-EFFORT BY CONTRACT: it returns whether
 * the write landed and never throws, because the alternative - a heartbeat
 * failure aborting the tick - would let a monitoring feature break the thing
 * it monitors. A false return is worth logging at the call site and nothing
 * more; the next tick 15 minutes later overwrites the row anyway.
 */
export async function recordCronHeartbeat(
  supabase: SupabaseClient<Database>,
  input: RecordCronHeartbeatInput
): Promise<boolean> {
  try {
    const { error } = await heartbeatTable(supabase).upsert(
      {
        id: input.id ?? heartbeatIdForSource(input.source),
        last_tick_at: input.tickAt.toISOString(),
        last_tick_source: input.source,
        schedules_processed: input.schedulesProcessed,
        triggers_processed: input.triggersProcessed,
        duration_ms: input.durationMs,
        // Capped like every other detail column in this codebase
        // (updateScheduleRunOutcome uses the same 500), so one enormous stack
        // trace cannot make the row itself unwritable.
        last_error: input.lastError === null ? null : input.lastError.slice(0, 500),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) {
      console.error("Failed to write the cron heartbeat:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to write the cron heartbeat:", err);
    return false;
  }
}

/** Reads one tick's heartbeat, or null when it has never fired (or when the
 * read itself fails - both mean "we cannot show a last-fired time", and the
 * classifier below reports that as `never` rather than as healthy). */
export async function readCronHeartbeat(
  supabase: SupabaseClient<Database>,
  id: string = heartbeatIdForSource(GITHUB_ACTIONS_SOURCE)
): Promise<CronHeartbeat | null> {
  try {
    const { data, error } = await heartbeatTable(supabase).select("*").eq("id", id).maybeSingle();
    if (error || !data) return null;
    return mapCronHeartbeat(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Classification - pure, no clock, no I/O. `nowMs` is a parameter so a test
// pins exact boundaries instead of asserting around the real time.

/** `failing` is the state a heartbeat-only design would miss entirely: the
 * tick IS firing, on time, and throwing every time. The row records that
 * (`last_error`), and reading only `last_tick_at` would render "the scheduler
 * ran less than a minute ago" over a scheduler that has not completed a run
 * in days. H1 item 3 calls the crashed tick "exactly the tick whose record
 * matters"; a state that reports it is what makes that true in the UI rather
 * than only in the table. */
export type CronHeartbeatState = "never" | "healthy" | "failing" | "late" | "stalled";

export interface CronHeartbeatStatus {
  state: CronHeartbeatState;
  /** Whole minutes since the last tick, or null when there has never been one. */
  minutesSince: number | null;
  /** One sentence, ready to render. */
  message: string;
}

/** Two consecutive missed ticks plus a five-minute allowance for GitHub's own
 * scheduling lag (its scheduled runs are best-effort and routinely lag several
 * minutes under load - the workflow file says so). Below this, silence is
 * indistinguishable from ordinary jitter and must NOT be reported as a
 * problem: a monitor that cries wolf every other afternoon gets ignored
 * exactly when it is right. */
export const CRON_LATE_AFTER_MINUTES = CRON_TICK_INTERVAL_MINUTES * 2 + 5;

/** Eight missed ticks (two hours). Past here the explanation is no longer
 * lag: the schedule was auto-disabled (F3's 60-day rule on a public repo),
 * the secret rotated, or the deployment is down. Separated from `late`
 * because the two want different words from the reader - "check back" versus
 * "go look at the Actions tab". */
export const CRON_STALLED_AFTER_MINUTES = CRON_TICK_INTERVAL_MINUTES * 8;

function formatGap(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** The facts the classification reads. Deliberately a structural subset of
 * CronHeartbeat rather than that type itself, so a test can build one inline
 * without inventing a duration, a source and two counts it does not care
 * about - and so it is obvious that the classification depends on exactly
 * these two fields and nothing else. */
export interface CronHeartbeatFacts {
  lastTickAt: string;
  lastError: string | null;
}

/**
 * Turns a heartbeat (or its absence) into what the UI should say. A
 * timestamp in the FUTURE - clock skew between the runner and the browser -
 * is treated as zero minutes ago and reported healthy rather than producing a
 * negative gap; skew is not evidence of a dead scheduler.
 *
 * ORDER OF PRECEDENCE, and the reason for it: not-firing outranks
 * firing-badly. A stalled or late scheduler is reported as stalled or late
 * even when its last completed tick also errored, because "it stopped
 * running" is the bigger fact and its stale error would otherwise crowd out
 * the newer, worse news. Only a tick that is arriving ON TIME and failing
 * reports `failing`.
 */
export function classifyCronHeartbeat(heartbeat: CronHeartbeatFacts | null, nowMs: number): CronHeartbeatStatus {
  const lastTickAt = heartbeat?.lastTickAt ?? null;
  if (!lastTickAt) {
    return {
      state: "never",
      minutesSince: null,
      message: "The scheduler has not reported a run yet. If this persists, check that the scheduled GitHub Action is enabled and that CRON_SECRET matches.",
    };
  }
  const tickMs = Date.parse(lastTickAt);
  if (Number.isNaN(tickMs)) {
    return {
      state: "never",
      minutesSince: null,
      message: "The scheduler's last run time could not be read.",
    };
  }
  const minutesSince = Math.max(0, Math.floor((nowMs - tickMs) / 60_000));
  if (minutesSince >= CRON_STALLED_AFTER_MINUTES) {
    return {
      state: "stalled",
      minutesSince,
      message: `The scheduler last ran ${formatGap(minutesSince)} ago and is expected every ${CRON_TICK_INTERVAL_MINUTES} minutes. Scheduled runs are not firing - check the repository's Actions tab (GitHub disables scheduled workflows after 60 days without repository activity).`,
    };
  }
  if (minutesSince >= CRON_LATE_AFTER_MINUTES) {
    return {
      state: "late",
      minutesSince,
      // Item 16 wants a concrete next step on a warning. For `late` that step
      // is genuinely "wait once, then look" - GitHub's scheduled runs are
      // best-effort and lag under load - so it says which interval was missed
      // and where to look if the next one is missed too, rather than sending
      // the reader to the Actions tab over ordinary jitter.
      message: `The scheduler last ran ${formatGap(minutesSince)} ago, longer than the ${CRON_TICK_INTERVAL_MINUTES}-minute interval. It may just be lagging; if the next interval passes with no run, check the repository's Actions tab.`,
    };
  }
  // On time, but the last tick reported a top-level failure. The gap is
  // healthy and the scheduler is emphatically not: without this branch a cron
  // firing punctually and throwing every single time renders as "ran less
  // than a minute ago", forever.
  if (heartbeat?.lastError) {
    return {
      state: "failing",
      minutesSince,
      message: `The scheduler is running on time but its last run failed: ${heartbeat.lastError}`,
    };
  }
  return {
    state: "healthy",
    minutesSince,
    message: minutesSince === 0 ? "The scheduler ran less than a minute ago." : `The scheduler last ran ${formatGap(minutesSince)} ago.`,
  };
}
