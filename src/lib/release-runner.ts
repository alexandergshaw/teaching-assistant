// Scheduled publishing from Modules: the runner half of F2 (docs/scheduled-
// publishing-from-modules-acceptance-criteria.md, "Post-design corrections").
//
// src/lib/scheduled-releases.ts is the durable layer - the row shape, the
// state machine, and thin Supabase wrappers around
// listDueScheduledReleases/claimScheduledRelease/markScheduledRelease{Done,
// Failed}. This file is what actually RUNS a due release once the cron route
// has fetched it: the pure decisions (which targets fit the release phase's
// sub-budget, when to stop starting new ones, how a per-target failure is
// classified, what a run summary says) and the per-target Canvas write.
//
// F2 IS EXPLICIT: "Run releases FIRST in the existing cron route, under their
// own sub-budget", or a long workflow run eats the 60-second maxDuration cap
// and releases silently miss their window. The sub-budget here is carved from
// the FRONT of the tick's existing budget (releaseSubBudgetDeadlineMs is
// capped at the caller's overallDeadlineMs), not a second budget stacked on
// top of it - see that function's own comment. The route places this phase
// ahead of the stale-schedule sweep and the workflow loop, and leaves the
// workflow loop's own deadline (runDeadlineMs in route.ts) untouched, so
// whatever wall-clock time the release phase actually consumed is
// automatically subtracted from what the workflow loop has left, with no
// separate bookkeeping required.
//
// PURE FUNCTIONS TAKE `now` AS A PARAMETER, mirroring scheduled-releases.ts,
// so tests pin exact boundaries with no clock. The one exception is
// runDueReleases's `clock` dependency: it is a function, not a bare `now`
// value, because the loop reads it once per target attempted (a real run's
// clock genuinely advances between targets) - tests inject a fake clock that
// returns a fixed or scripted sequence of instants instead of racing
// setTimeout/real time.

import { listModules, updateModule, updateModuleItem } from "@/lib/canvas-modules";
import type { ReleaseTargetRef, ScheduledRelease } from "@/lib/scheduled-releases";

// ---------------------------------------------------------------------------
// F10 follow-up (REGRESSION entry 339's own "the follow-up this creates"
// section, closed by docs/scheduled-publishing-from-modules-acceptance-
// criteria.md's F10): module_id is now known at SCHEDULE time for every
// module_item target, so the commit path (src/app/actions/scheduled-
// releases.ts) stores it on the row and this file no longer needs to ask
// Canvas which module owns an item.
//
// `ScheduledRelease` itself (scheduled-releases.ts) is owned by a different
// slice of this feature and is not part of this file's edit set, so this is
// a STRUCTURAL widening rather than a change to that type: any object that
// already satisfies `ScheduledRelease` also satisfies `ReleaseWithModuleId`
// (the extra field is optional), so every existing caller keeps compiling
// unchanged, and the moment scheduled-releases.ts's own row type grows a real
// `moduleId` field, callers here pick it up with no further change.
export type ReleaseWithModuleId = ScheduledRelease & {
  /** The item's owning module id, when the row was written by the F10-aware
   * commit path. Undefined/null for a row written before that column existed
   * (or, in principle, for a module target - which never needs it). */
  moduleId?: number | null;
};

// ---------------------------------------------------------------------------
// Constants

/**
 * How much of the tick's existing budget the release phase gets, carved from
 * the front (see releaseSubBudgetDeadlineMs). A release is one Canvas write -
 * an item target no longer costs a second, read-only listModules call to
 * resolve its owning module, since F10 made module_id known at schedule time
 * (see publishReleaseTarget's own doc comment for the fallback that still
 * exists for pre-F10 rows) - much cheaper than a full workflow run, so this
 * is deliberately a small slice of the ~50s the route already reserves ahead
 * of the 60s maxDuration cap - the workflow loop must still get the great
 * majority of that window.
 */
export const RELEASE_SUB_BUDGET_MS = 15_000;

// ---------------------------------------------------------------------------
// Pure decisions - no clock, no I/O. `now` is always a parameter.

/**
 * The release phase's own deadline: the front `subBudgetMs` slice of the
 * tick's existing window, never later than `overallDeadlineMs` itself.
 *
 * THIS IS THE MECHANISM THAT SATISFIES F2's ordering requirement WITHOUT
 * DOUBLE-BUDGETING. The naive mistake is giving releases their own fresh
 * `now + 50_000` deadline the same way the workflow loop's runDeadlineMs is
 * computed - that adds a second independent budget on top of the existing
 * one, and a tick that spends both in full would run 100s against a 60s cap.
 * Instead this returns `min(now + subBudgetMs, overallDeadlineMs)`: capped by
 * the SAME end-of-window instant the workflow loop already uses, so the
 * release phase can never push the tick's total budget past what it already
 * was. The workflow loop's own deadline (route.ts's runDeadlineMs) is then
 * left completely unrecomputed after the release phase finishes - it is the
 * same absolute instant it always was - so however long the release phase
 * actually took is automatically subtracted from what the workflow loop has
 * left, with no separate "remaining budget" arithmetic required anywhere.
 */
export function releaseSubBudgetDeadlineMs(
  now: Date,
  overallDeadlineMs: number,
  subBudgetMs: number = RELEASE_SUB_BUDGET_MS
): number {
  return Math.min(now.getTime() + subBudgetMs, overallDeadlineMs);
}

/**
 * Whether the release phase may start (claim, then publish) the next due
 * target. `<=`, matching isReleaseDue's own boundary convention in
 * scheduled-releases.ts: a target whose start check lands EXACTLY on the
 * deadline still gets to start (it has the rest of that instant), and only
 * the first one to land strictly past it is deferred.
 *
 * A target this returns false for is left completely untouched - never
 * claimed - so it remains "pending" in the database and is independently due
 * again on the very next tick, exactly as selectDueScheduledReleases and the
 * partial-run-independence property in scheduled-releases.ts already
 * guarantee for a crash. Running out of sub-budget and crashing mid-flight
 * are, from a due target's point of view, the same case: nothing about it
 * changed, so it is still due.
 */
export function canStartRelease(now: Date, deadlineMs: number): boolean {
  return now.getTime() <= deadlineMs;
}

/**
 * Total conversion of a caught value to a bounded detail string for a failed
 * release's row (markScheduledReleaseFailed already caps at 500 chars, but a
 * bad String() coercion - a thrown Symbol, or an object with a broken
 * prototype - must never itself throw and mask the real failure). Mirrors
 * safeErrorToString in the cron route.
 */
export function classifyReleaseFailure(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "Unknown error (could not be converted to a string).";
  }
}

export type ReleaseRunStatus = "released" | "skipped" | "failed";

export interface ReleaseRunResult {
  releaseId: string;
  target: ReleaseTargetRef;
  status: ReleaseRunStatus;
  /** Present for "skipped" (why the claim was not won) and "failed" (the
   * classified error). Absent for "released". */
  detail?: string;
}

export interface ReleaseRunSummary {
  /** How many due targets were handed to this run. */
  due: number;
  /** due - notStarted: how many the sub-budget allowed a claim attempt on. */
  attempted: number;
  released: number;
  failed: number;
  /** Claim lost to a concurrent runner (another tick, or an open tab) - the
   * row was already moving; not this run's to report as failed. */
  skipped: number;
  /** Ran out of sub-budget before a claim was even attempted. Never touched,
   * so still "pending" - due again next tick. See canStartRelease. */
  notStarted: number;
}

/**
 * Tally a finished run's results plus how many targets the sub-budget never
 * reached, into the counts the route's JSON response and log line report.
 * Pure so the counting itself - not just the loop that produces the results -
 * is directly testable.
 */
export function summarizeReleaseResults(results: ReleaseRunResult[], notStarted: number, due: number): ReleaseRunSummary {
  let released = 0;
  let failed = 0;
  let skipped = 0;
  for (const result of results) {
    if (result.status === "released") released++;
    else if (result.status === "failed") failed++;
    else skipped++;
  }
  return { due, attempted: results.length, released, failed, skipped, notStarted };
}

// ---------------------------------------------------------------------------
// Per-target execution - the one Canvas write (plus, for an item target, one
// read to resolve its owning module).

/**
 * Publish one release target on Canvas. A module target publishes directly
 * by id (module[published]=true). A module_item target additionally needs
 * the id of the module that CONTAINS it: Canvas exposes no "update this
 * module item" endpoint keyed on the item's id alone, only
 * PUT /courses/:course_id/modules/:module_id/items/:id.
 *
 * F10 CLOSED THE FOLLOW-UP REGRESSION ENTRY 339 RECORDED: module_id is now
 * known at SCHEDULE time for every module_item target (the commit path
 * stores it on the row), so `moduleId` is used DIRECTLY here - no Canvas read
 * at all - whenever the caller has it. THE listModules LOOKUP BELOW IS A
 * FALLBACK ONLY, kept for a row written before the module_id column existed
 * (entry 338/339's rows, or any row a future bug writes without it), and it
 * must never run on the normal path - see release-runner.test.ts's
 * "the normal path makes no module-listing call" test, which is the one that
 * actually proves this (a test that only checks the happy publish result
 * would not notice the extra read coming back).
 *
 * Throws (does not swallow) on any failure - a Canvas write refusal, or the
 * target no longer existing - so the caller's per-target try/catch is what
 * turns this into a "failed" row rather than an unhandled rejection.
 */
export async function publishReleaseTarget(
  courseUrl: string,
  courseAcronym: string | null,
  target: ReleaseTargetRef,
  moduleId?: number | null
): Promise<void> {
  const code = courseAcronym ?? undefined;
  if (target.kind === "module") {
    await updateModule(courseUrl, target.id, { published: true }, code);
    return;
  }
  if (typeof moduleId === "number") {
    await updateModuleItem(courseUrl, moduleId, target.id, { published: true }, code);
    return;
  }
  // FALLBACK for a pre-F10 row with no module_id - never taken on the normal
  // path (see this function's own doc comment above).
  const modules = await listModules(courseUrl, code);
  const owningModule = modules.find((m) => m.items.some((item) => item.id === target.id));
  if (!owningModule) {
    throw new Error(
      `Module item ${target.id} was not found in any module for this course - it may have been moved or deleted since the release was scheduled.`
    );
  }
  await updateModuleItem(courseUrl, owningModule.id, target.id, { published: true }, code);
}

// ---------------------------------------------------------------------------
// The run loop. Impure (it awaits injected I/O), but every decision it makes
// - whether to start the next target, how to classify a failure, what the
// summary says - defers to the pure functions above, so the loop itself is a
// thin, mechanical driver. The route supplies real Supabase/Canvas-backed
// deps; tests supply fakes and never touch the network or the database.

export interface ReleaseRunnerDeps {
  /** claimScheduledRelease, bound to a supabase client. Exactly one caller
   * wins the CAS; a losing caller resolves false, never throws. */
  claim: (release: Pick<ScheduledRelease, "id" | "releaseAt">, now: Date) => Promise<boolean>;
  /** markScheduledReleaseDone, bound to a supabase client. */
  markDone: (id: string, now: Date) => Promise<void>;
  /** markScheduledReleaseFailed, bound to a supabase client. */
  markFailed: (id: string, now: Date, detail: string) => Promise<void>;
  /** Defaults to publishReleaseTarget (a real Canvas write), passing
   * `release.moduleId` through so the normal path never triggers that
   * function's own listModules fallback. Overridable so tests exercise the
   * loop's decisions without touching the network. */
  publish?: (release: ReleaseWithModuleId) => Promise<void>;
  /** Defaults to `() => new Date()`. Read once per target attempted, so
   * tests can pin an exact, possibly-scripted sequence of instants instead
   * of faking global timers. */
  clock?: () => Date;
}

export interface RunDueReleasesParams extends ReleaseRunnerDeps {
  /** Already fetched via listDueScheduledReleases (soonest release_at
   * first) - this function does not re-derive "due", only what to do with
   * an already-due list under a budget. */
  due: ReleaseWithModuleId[];
  /** From releaseSubBudgetDeadlineMs. */
  deadlineMs: number;
}

export interface RunDueReleasesResult {
  results: ReleaseRunResult[];
  summary: ReleaseRunSummary;
}

/**
 * Run as many of `due`'s targets as the sub-budget allows, in order (soonest
 * release_at first, per listDueScheduledReleases - this function never
 * reorders them).
 *
 * PER-TARGET FAILURE ISOLATION IS THE WHOLE POINT (entry 338, "ONE ROW PER
 * TARGET"): each target gets its own try/catch, so a Canvas refusal or a
 * transient network error on one target can never abort the loop - the
 * remaining targets are attempted exactly as if the failed one had never
 * existed. A target this function never reaches (sub-budget exhausted) is
 * left completely untouched: not claimed, so still "pending" and
 * independently due on the next tick - the same guarantee
 * selectDueScheduledReleases already gives a mid-run crash, extended here to
 * a mid-run budget cutoff.
 */
export async function runDueReleases(params: RunDueReleasesParams): Promise<RunDueReleasesResult> {
  const clock = params.clock ?? (() => new Date());
  const publish =
    params.publish ??
    ((release: ReleaseWithModuleId) =>
      publishReleaseTarget(release.courseUrl, release.courseAcronym, release.target, release.moduleId ?? null));

  const results: ReleaseRunResult[] = [];
  let notStarted = 0;

  for (const release of params.due) {
    if (!canStartRelease(clock(), params.deadlineMs)) {
      // Ran out of sub-budget. Every remaining target (this one included) is
      // left untouched, in order - see this function's own comment.
      notStarted = params.due.length - results.length;
      break;
    }

    try {
      const claimed = await params.claim({ id: release.id, releaseAt: release.releaseAt }, clock());
      if (!claimed) {
        // Lost the CAS to a concurrent runner - that caller owns this
        // target's outcome now, not this one.
        results.push({ releaseId: release.id, target: release.target, status: "skipped", detail: "already claimed" });
        continue;
      }
    } catch (err) {
      // The claim call itself threw (a DB error) - the row was never
      // confirmed claimed, so do not attempt to mark it failed (that CAS is
      // conditioned on status = "claimed" and would simply no-op). Record
      // the outcome and move on; per this function's contract, one target's
      // failure never aborts the loop.
      results.push({ releaseId: release.id, target: release.target, status: "failed", detail: classifyReleaseFailure(err) });
      continue;
    }

    try {
      await publish(release);
      await params.markDone(release.id, clock());
      results.push({ releaseId: release.id, target: release.target, status: "released" });
    } catch (err) {
      const detail = classifyReleaseFailure(err);
      try {
        await params.markFailed(release.id, clock(), detail);
      } catch {
        // Best-effort stamp of the failure detail; the target is still
        // reported "failed" below either way, matching the route's own
        // updateScheduleRunOutcome(...).catch(() => {}) idiom for the
        // equivalent workflow-schedule case.
      }
      results.push({ releaseId: release.id, target: release.target, status: "failed", detail });
    }
  }

  return { results, summary: summarizeReleaseResults(results, notStarted, params.due.length) };
}
