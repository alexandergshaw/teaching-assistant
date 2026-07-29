// Workflow run log persistence. Written by every execution path (manual
// in-app, schedule, event trigger, webhook). Server-safe (no "use client").
//
// Two layers live here:
//
// 1. The original completion-only write, recordWorkflowRun: a single INSERT
//    called after a run finishes. Its only consumer is the
//    'workflow-completed' event source (workflow chaining), which looks up
//    the latest run of a source workflow. Kept working unchanged - existing
//    callers still use it exactly as before.
//
// 2. A start-then-finish LIFECYCLE (startWorkflowRun / finishWorkflowRun /
//    recordRunStep / listRunSteps / listRecentRuns / getRun), added so a run
//    killed by the platform's execution time cap, a crash, or a closed
//    browser tab still leaves a row behind. Every one of the five places
//    that start a run already mints the run id with crypto.randomUUID()
//    before doing any work, so startWorkflowRun can insert a "running" row
//    immediately using that same id, and finishWorkflowRun later updates
//    that row in place - no new id plumbing needed. Per-step detail
//    (public.workflow_run_steps) is a child table, not a jsonb column: see
//    supabase/migrations/20260909000000_workflow_run_logs.sql for why (a run
//    can have many steps, written incrementally under a time budget, and a
//    run that dies must keep the steps it already wrote).
//
// Every query in this file is scoped with .eq("user_id", userId). Every row
// read back goes through an explicit mapper (mapWorkflowRun /
// mapWorkflowRunStep) that degrades defensively on a malformed row, mirroring
// mapClassSession in live-class-sessions.ts: a malformed progress jsonb value
// becomes [], and an unrecognized status falls back rather than throwing.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

export type TriggerSource = "manual" | "schedule" | "trigger" | "webhook";

export type WorkflowRunStatus = "ok" | "error" | "skipped" | "running";

export type WorkflowRunStepStatus =
  | "done"
  | "error"
  | "disabled"
  | "needs-interaction"
  | "skipped"
  | "running";

/** Domain shape of a workflow_runs row, as read back through mapWorkflowRun. */
export interface WorkflowRunRecord {
  id: string;
  userId: string;
  workflowId: string;
  workflowName: string;
  status: WorkflowRunStatus;
  triggerSource: string | null;
  /** The schedule/trigger id that caused this run, when any. */
  triggerRef: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  stepCount: number | null;
  errorCount: number | null;
  /** Full failure detail - never truncated (unlike
   * workflow_schedules.last_run_detail / workflow_triggers.last_run_detail),
   * since this is the source of the downloadable log. */
  detail: string | null;
}

/** Domain shape of a workflow_run_steps row, as read back through
 * mapWorkflowRunStep. */
export interface WorkflowRunStep {
  id: string;
  runId: string;
  userId: string;
  stepIndex: number;
  stepType: string;
  status: WorkflowRunStepStatus;
  error: string | null;
  summary: string | null;
  /** The ordered onProgress messages emitted while the step ran. */
  progress: string[];
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  institution: string | null;
  courseId: string | null;
  /** The course tile's human name at the moment this step ran, captured
   * where the outcome is logged (see run-logging.ts / server-runner.ts /
   * useWorkflowRun.ts) - never re-derived later, since a course can be
   * renamed or deleted after the run. Null for a non-course step AND for
   * every row written before this field existed; a renderer must fall back
   * to courseId in that case rather than showing nothing. */
  courseName: string | null;
  createdAt: string;
}

function table(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("workflow_runs");
}

function stepsTable(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("workflow_run_steps");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

const VALID_RUN_STATUSES = ["ok", "error", "skipped", "running"] as const;

/** An unrecognized or missing status falls back to "error" rather than
 * throwing - a hand-edited or partially-written row should never crash a
 * read, and treating an unknown state as a failure is the conservative
 * choice (never silently reads as a success). */
function coerceRunStatus(value: unknown): WorkflowRunStatus {
  return typeof value === "string" && (VALID_RUN_STATUSES as readonly string[]).includes(value)
    ? (value as WorkflowRunStatus)
    : "error";
}

const VALID_STEP_STATUSES = [
  "done",
  "error",
  "disabled",
  "needs-interaction",
  "skipped",
  "running",
] as const;

/** Same fallback rule as coerceRunStatus: unrecognized -> "error". */
function coerceStepStatus(value: unknown): WorkflowRunStepStatus {
  return typeof value === "string" && (VALID_STEP_STATUSES as readonly string[]).includes(value)
    ? (value as WorkflowRunStepStatus)
    : "error";
}

/** A malformed or non-array jsonb `progress` value (a string, number,
 * object, null) degrades to [] rather than throwing. Non-string entries
 * within an otherwise-valid array are dropped. */
function coerceProgress(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

/** Explicit row -> domain mapper for workflow_runs, mirroring mapClassSession
 * in live-class-sessions.ts. Takes `unknown` (not a typed Row) so it degrades
 * gracefully on a hand-edited or partially-written row rather than trusting
 * the raw columns. */
export function mapWorkflowRun(row: unknown): WorkflowRunRecord {
  const r = asRecord(row);
  return {
    id: typeof r.id === "string" ? r.id : "",
    userId: typeof r.user_id === "string" ? r.user_id : "",
    workflowId: typeof r.workflow_id === "string" ? r.workflow_id : "",
    workflowName: typeof r.workflow_name === "string" ? r.workflow_name : "",
    status: coerceRunStatus(r.status),
    triggerSource: typeof r.trigger_source === "string" ? r.trigger_source : null,
    triggerRef: typeof r.trigger_ref === "string" ? r.trigger_ref : null,
    createdAt: typeof r.created_at === "string" ? r.created_at : new Date(0).toISOString(),
    startedAt: typeof r.started_at === "string" ? r.started_at : null,
    finishedAt: typeof r.finished_at === "string" ? r.finished_at : null,
    durationMs: typeof r.duration_ms === "number" ? r.duration_ms : null,
    stepCount: typeof r.step_count === "number" ? r.step_count : null,
    errorCount: typeof r.error_count === "number" ? r.error_count : null,
    detail: typeof r.detail === "string" ? r.detail : null,
  };
}

/** Explicit row -> domain mapper for workflow_run_steps. Same defensive
 * discipline as mapWorkflowRun. */
export function mapWorkflowRunStep(row: unknown): WorkflowRunStep {
  const r = asRecord(row);
  return {
    id: typeof r.id === "string" ? r.id : "",
    runId: typeof r.run_id === "string" ? r.run_id : "",
    userId: typeof r.user_id === "string" ? r.user_id : "",
    stepIndex: typeof r.step_index === "number" ? r.step_index : 0,
    stepType: typeof r.step_type === "string" ? r.step_type : "",
    status: coerceStepStatus(r.status),
    error: typeof r.error === "string" ? r.error : null,
    summary: typeof r.summary === "string" ? r.summary : null,
    progress: coerceProgress(r.progress),
    startedAt: typeof r.started_at === "string" ? r.started_at : null,
    finishedAt: typeof r.finished_at === "string" ? r.finished_at : null,
    durationMs: typeof r.duration_ms === "number" ? r.duration_ms : null,
    institution: typeof r.institution === "string" ? r.institution : null,
    courseId: typeof r.course_id === "string" ? r.course_id : null,
    courseName: typeof r.course_name === "string" ? r.course_name : null,
    createdAt: typeof r.created_at === "string" ? r.created_at : new Date(0).toISOString(),
  };
}

/** Append a completion row. Best-effort: chaining is a convenience, so a
 * failure to log must never break the run that produced it - callers wrap this
 * in a try/catch and swallow. */
export async function recordWorkflowRun(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    workflowId: string;
    workflowName: string;
    status: "ok" | "error" | "skipped";
    triggerSource: TriggerSource;
    id?: string;
  }
): Promise<void> {
  const { error } = await table(supabase).insert({
    ...(input.id && { id: input.id }),
    user_id: userId,
    workflow_id: input.workflowId,
    workflow_name: input.workflowName,
    status: input.status,
    trigger_source: input.triggerSource,
  });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Reads for decideWorkflowCompleted (the "workflow-completed" trigger; see
// workflow-triggers/decisions.ts). Run rows are now INSERTED when a run
// STARTS (startWorkflowRun above, status "running") and UPDATED when it
// finishes (finishWorkflowRun above), not inserted once at the very end as
// before. That makes two things true here that were not true before, and
// both are handled in THIS file rather than in the decider -
// decideWorkflowCompleted's job is "did a run complete", so handing it a run
// that has not completed, or a timestamp that does not mean "when it
// completed", is a data-layer bug, not a decision-logic bug:
//
//   1. A "running" row must never be returned. It is not a completion, and
//      with "only on success" off the decider's only exclusion is
//      status !== "skipped" (see decideWorkflowCompleted), so an unfiltered
//      "running" row would qualify and fire the trigger on work that has not
//      finished.
//   2. created_at is now the START time, not the finish time. Ordering or
//      comparing by created_at can both fire early (a row's insert lands
//      before the run actually finishes) and silently lose the real
//      completion (finishWorkflowRun's UPDATE does not change created_at, so
//      a cursor already advanced past the insert never sees the finish - a
//      run that takes longer than one poll interval can be missed entirely).
//      The reported/ordered/compared timestamp must be finished_at, falling
//      back to created_at only for a legacy row written by recordWorkflowRun
//      (a single insert done once, at completion, before this file grew the
//      start-then-finish lifecycle) that has no finished_at at all.
//
// Do not "simplify" the neq("status", "running") filter away, and do not go
// back to ordering/comparing by created_at - both changes look harmless in
// isolation and both reintroduce a trigger that fires on unfinished runs (see
// points 1 and 2 above).
//
// PostgREST can filter and order by a real column but not by a computed
// COALESCE(finished_at, created_at) expression, and adding a generated
// column is a migration (out of scope for this fix). So each helper below
// splits its read into two queries - rows that HAVE a finished_at (filtered
// and ordered by the real finished_at column) and legacy rows that do not
// (filtered and ordered by created_at, their only timestamp) - and merges the
// two bounded results in JS. This is exact, not an approximation: for two
// queries each capped at the same limit N, the true top-N of the union of
// the two result sets is always contained within the top-N of each query
// individually, so merging never drops a row that belongs in the final
// bounded, ordered result - while still never fetching an unbounded table.
// ---------------------------------------------------------------------------

type RunTimeRow = { created_at: string; finished_at: string | null; status: string };
type NamedRunTimeRow = RunTimeRow & { workflow_name: string };

/** The timestamp decideWorkflowCompleted should treat as "when this run
 * completed": finished_at when set, else created_at for a legacy
 * recordWorkflowRun row (see the section comment above). Every read below
 * reports, orders, and filters by this value - never raw created_at. */
function completedAt(row: { created_at: string; finished_at: string | null }): string {
  return row.finished_at ?? row.created_at;
}

/** Defense in depth alongside the query-level neq("status", "running")
 * filter on every read below: even if a "running" row ever reaches this
 * code (a query construction bug, a permissive policy, a hand-run query),
 * it is dropped here too before anything is handed to decideWorkflowCompleted.
 * Two independent layers so removing either one in a future "simplify" pass
 * does not, by itself, let a running row back through - see the section
 * comment above. */
function dropRunning<T extends { status: string }>(rows: T[]): T[] {
  return rows.filter((r) => r.status !== "running");
}

/** Pick the row with the greatest completion time across the two query
 * results ("has finished_at" and "legacy, no finished_at"). See the section
 * comment above for why this two-query split is exact. */
function pickLatestByCompletion<T extends RunTimeRow>(finished: T[], legacy: T[]): T | null {
  const rows = [...finished, ...legacy];
  if (rows.length === 0) return null;
  return rows.reduce((best, r) => (completedAt(r) > completedAt(best) ? r : best));
}

/** Merge the two query results ("has finished_at" and "legacy, no
 * finished_at") into one completion-time-ascending, bounded list. See the
 * section comment above for why this two-query split is exact. */
function mergeSinceByCompletion<T extends RunTimeRow>(finished: T[], legacy: T[], limit: number): T[] {
  return [...finished, ...legacy]
    .sort((a, b) => {
      const ca = completedAt(a);
      const cb = completedAt(b);
      return ca < cb ? -1 : ca > cb ? 1 : 0;
    })
    .slice(0, limit);
}

/** The most recent COMPLETED run of a workflow for a user (a "running" row is
 * never returned; see the section comment above), or null if none has ever
 * finished. Feeds decideWorkflowCompleted via TriggerEvalContext.latestRun. */
export async function latestWorkflowRun(
  supabase: SupabaseClient<Database>,
  userId: string,
  workflowId: string
): Promise<{ createdAt: string; status: string } | null> {
  const [finishedRes, legacyRes] = await Promise.all([
    table(supabase)
      .select("created_at, finished_at, status")
      .eq("user_id", userId)
      .eq("workflow_id", workflowId)
      .neq("status", "running")
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1),
    table(supabase)
      .select("created_at, finished_at, status")
      .eq("user_id", userId)
      .eq("workflow_id", workflowId)
      .neq("status", "running")
      .is("finished_at", null)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (finishedRes.error) throw new Error(finishedRes.error.message);
  if (legacyRes.error) throw new Error(legacyRes.error.message);
  const best = pickLatestByCompletion(
    dropRunning((finishedRes.data ?? []) as RunTimeRow[]),
    dropRunning((legacyRes.data ?? []) as RunTimeRow[])
  );
  return best ? { createdAt: completedAt(best), status: best.status } : null;
}

/** All COMPLETED runs of a workflow whose completion time is strictly newer
 * than `sinceIso`, oldest-completed first (bounded to 100; a "running" row is
 * never returned - see the section comment above). Feeds
 * decideWorkflowCompleted so a success is not masked by a later error in the
 * same poll interval. */
export async function runsSinceForWorkflow(
  supabase: SupabaseClient<Database>,
  userId: string,
  workflowId: string,
  sinceIso: string
): Promise<Array<{ createdAt: string; status: string }>> {
  const [finishedRes, legacyRes] = await Promise.all([
    table(supabase)
      .select("created_at, finished_at, status")
      .eq("user_id", userId)
      .eq("workflow_id", workflowId)
      .neq("status", "running")
      .not("finished_at", "is", null)
      .gt("finished_at", sinceIso)
      .order("finished_at", { ascending: true })
      .limit(100),
    table(supabase)
      .select("created_at, finished_at, status")
      .eq("user_id", userId)
      .eq("workflow_id", workflowId)
      .neq("status", "running")
      .is("finished_at", null)
      .gt("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(100),
  ]);
  if (finishedRes.error) throw new Error(finishedRes.error.message);
  if (legacyRes.error) throw new Error(legacyRes.error.message);
  const rows = mergeSinceByCompletion(
    dropRunning((finishedRes.data ?? []) as RunTimeRow[]),
    dropRunning((legacyRes.data ?? []) as RunTimeRow[]),
    100
  );
  return rows.map((r) => ({ createdAt: completedAt(r), status: r.status }));
}

/** The most recent COMPLETED run of any workflow for a user (excluding a
 * given workflow to prevent self-triggering; a "running" row is never
 * returned - see the section comment above), or null if none has ever
 * finished. Used for "any workflow" triggers. */
export async function latestRunAnyWorkflow(
  supabase: SupabaseClient<Database>,
  userId: string,
  excludeWorkflowId: string
): Promise<{ createdAt: string; status: string; workflowName: string } | null> {
  const [finishedRes, legacyRes] = await Promise.all([
    table(supabase)
      .select("created_at, finished_at, status, workflow_name")
      .eq("user_id", userId)
      .neq("workflow_id", excludeWorkflowId)
      .neq("status", "running")
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1),
    table(supabase)
      .select("created_at, finished_at, status, workflow_name")
      .eq("user_id", userId)
      .neq("workflow_id", excludeWorkflowId)
      .neq("status", "running")
      .is("finished_at", null)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (finishedRes.error) throw new Error(finishedRes.error.message);
  if (legacyRes.error) throw new Error(legacyRes.error.message);
  const best = pickLatestByCompletion(
    dropRunning((finishedRes.data ?? []) as NamedRunTimeRow[]),
    dropRunning((legacyRes.data ?? []) as NamedRunTimeRow[])
  );
  return best ? { createdAt: completedAt(best), status: best.status, workflowName: best.workflow_name } : null;
}

/** All COMPLETED runs of ANY workflow whose completion time is strictly newer
 * than `sinceIso`, excluding the given workflow, oldest-completed first
 * (bounded to 100; a "running" row is never returned - see the section
 * comment above). Used when a trigger watches for any workflow completion and
 * needs to exclude its own workflow to prevent loops. */
export async function runsSinceAnyWorkflow(
  supabase: SupabaseClient<Database>,
  userId: string,
  sinceIso: string,
  excludeWorkflowId: string
): Promise<Array<{ createdAt: string; status: string; workflowName: string }>> {
  const [finishedRes, legacyRes] = await Promise.all([
    table(supabase)
      .select("created_at, finished_at, status, workflow_name")
      .eq("user_id", userId)
      .neq("workflow_id", excludeWorkflowId)
      .neq("status", "running")
      .not("finished_at", "is", null)
      .gt("finished_at", sinceIso)
      .order("finished_at", { ascending: true })
      .limit(100),
    table(supabase)
      .select("created_at, finished_at, status, workflow_name")
      .eq("user_id", userId)
      .neq("workflow_id", excludeWorkflowId)
      .neq("status", "running")
      .is("finished_at", null)
      .gt("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(100),
  ]);
  if (finishedRes.error) throw new Error(finishedRes.error.message);
  if (legacyRes.error) throw new Error(legacyRes.error.message);
  const rows = mergeSinceByCompletion(
    dropRunning((finishedRes.data ?? []) as NamedRunTimeRow[]),
    dropRunning((legacyRes.data ?? []) as NamedRunTimeRow[]),
    100
  );
  return rows.map((r) => ({ createdAt: completedAt(r), status: r.status, workflowName: r.workflow_name }));
}

// ---------------------------------------------------------------------------
// Start-then-finish lifecycle. See this file's header comment and
// supabase/migrations/20260909000000_workflow_run_logs.sql for why this
// exists alongside recordWorkflowRun above.
// ---------------------------------------------------------------------------

/** Insert a "running" row for a run that is just starting, so a run that
 * later dies (platform time cap, crash, closed tab) still leaves a row
 * behind instead of writing nothing at all.
 *
 * Idempotent on `input.id`: uses an upsert with `ignoreDuplicates: true`
 * (same pattern as src/lib/research/glossary.ts), so a retried trigger that
 * calls this twice with the same run id creates exactly one row - the
 * second call is a silent no-op rather than a duplicate or an overwrite of
 * the first call's started_at. */
export async function startWorkflowRun(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    id: string;
    workflowId: string;
    workflowName: string;
    triggerSource: TriggerSource;
    triggerRef?: string;
  }
): Promise<void> {
  const { error } = await table(supabase).upsert(
    {
      id: input.id,
      user_id: userId,
      workflow_id: input.workflowId,
      workflow_name: input.workflowName,
      status: "running",
      trigger_source: input.triggerSource,
      trigger_ref: input.triggerRef ?? null,
      started_at: new Date().toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
  if (error) throw new Error(error.message);
}

/** Finish a run started with startWorkflowRun: sets finished_at (now),
 * computes duration_ms from the row's own started_at, and records the final
 * status/detail/counts. Never throws - a logging failure here must never
 * fail (or appear to fail) the workflow run that already finished; every
 * failure path below is caught and swallowed (best-effort console.error
 * only), matching recordRunStep's rule below. */
export async function finishWorkflowRun(
  supabase: SupabaseClient<Database>,
  userId: string,
  runId: string,
  input: {
    status: "ok" | "error" | "skipped";
    detail?: string;
    stepCount?: number;
    errorCount?: number;
  }
): Promise<void> {
  try {
    const { data } = await table(supabase)
      .select("started_at")
      .eq("user_id", userId)
      .eq("id", runId)
      .maybeSingle();
    const startedAtRaw = asRecord(data).started_at;
    const startedAt = typeof startedAtRaw === "string" ? new Date(startedAtRaw) : null;
    const finishedAt = new Date();
    const durationMs =
      startedAt && !Number.isNaN(startedAt.getTime())
        ? Math.max(0, finishedAt.getTime() - startedAt.getTime())
        : null;

    const { error } = await table(supabase)
      .update({
        status: input.status,
        finished_at: finishedAt.toISOString(),
        duration_ms: durationMs,
        detail: input.detail ?? null,
        step_count: input.stepCount ?? null,
        error_count: input.errorCount ?? null,
      })
      .eq("user_id", userId)
      .eq("id", runId);
    if (error) {
      console.error("finishWorkflowRun: update failed:", error.message);
    }
  } catch (err) {
    console.error("finishWorkflowRun: unexpected error:", err);
  }
}

/** Insert one step row. Never throws: a logging failure must NEVER fail a
 * workflow run - every failure path below is caught and swallowed
 * (best-effort console.error only), never rethrown or left to reject the
 * returned promise. */
export async function recordRunStep(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    runId: string;
    stepIndex: number;
    stepType: string;
    status: WorkflowRunStepStatus;
    error?: string | null;
    summary?: string | null;
    progress?: string[];
    startedAt?: string;
    finishedAt?: string;
    institution?: string;
    courseId?: string;
    courseName?: string;
  }
): Promise<void> {
  try {
    const durationMs =
      input.startedAt && input.finishedAt
        ? Math.max(0, new Date(input.finishedAt).getTime() - new Date(input.startedAt).getTime())
        : null;
    const { error } = await stepsTable(supabase).insert({
      run_id: input.runId,
      user_id: userId,
      step_index: input.stepIndex,
      step_type: input.stepType,
      status: input.status,
      error: input.error ?? null,
      summary: input.summary ?? null,
      progress: input.progress ?? [],
      started_at: input.startedAt ?? null,
      finished_at: input.finishedAt ?? null,
      duration_ms: durationMs,
      institution: input.institution ?? null,
      course_id: input.courseId ?? null,
      course_name: input.courseName ?? null,
    });
    if (error) {
      console.error("recordRunStep: insert failed:", error.message);
    }
  } catch (err) {
    console.error("recordRunStep: unexpected error:", err);
  }
}

/** All steps of a run, oldest (lowest step_index) first. Scoped by both
 * user_id and run_id. */
export async function listRunSteps(
  supabase: SupabaseClient<Database>,
  userId: string,
  runId: string
): Promise<WorkflowRunStep[]> {
  const { data, error } = await stepsTable(supabase)
    .select("*")
    .eq("user_id", userId)
    .eq("run_id", runId)
    .order("step_index", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).map(mapWorkflowRunStep);
}

/** The user's most recent runs, newest first, optionally filtered to one
 * workflow and/or to the schedule/trigger that caused them (triggerRef -
 * see WorkflowRunRecord.triggerRef). Default limit 50. Absent filters
 * behave exactly as before this option was added. */
export async function listRecentRuns(
  supabase: SupabaseClient<Database>,
  userId: string,
  opts?: { workflowId?: string; triggerRef?: string; limit?: number }
): Promise<WorkflowRunRecord[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = table(supabase)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.workflowId) {
    query = query.eq("workflow_id", opts.workflowId);
  }
  if (opts?.triggerRef) {
    query = query.eq("trigger_ref", opts.triggerRef);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown[]).map(mapWorkflowRun);
}

/** Fetch one run by id, scoped to its owner; null if missing or not owned. */
export async function getRun(
  supabase: SupabaseClient<Database>,
  userId: string,
  runId: string
): Promise<WorkflowRunRecord | null> {
  const { data, error } = await table(supabase)
    .select("*")
    .eq("user_id", userId)
    .eq("id", runId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapWorkflowRun(data);
}
