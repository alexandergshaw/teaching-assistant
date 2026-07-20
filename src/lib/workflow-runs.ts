// Workflow run log persistence. One row per completed run, written by every
// execution path (manual in-app, schedule, event trigger, webhook). Its only
// consumer is the 'workflow-completed' event source (workflow chaining), which
// looks up the latest run of a source workflow. Server-safe (no "use client").

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

export type TriggerSource = "manual" | "schedule" | "trigger" | "webhook";

function table(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("workflow_runs");
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
    status: "ok" | "error";
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

/** The most recent run of a workflow for a user, or null if it has never run.
 * Feeds decideWorkflowCompleted via TriggerEvalContext.latestRun. */
export async function latestWorkflowRun(
  supabase: SupabaseClient<Database>,
  userId: string,
  workflowId: string
): Promise<{ createdAt: string; status: string } | null> {
  const { data, error } = await table(supabase)
    .select("created_at, status")
    .eq("user_id", userId)
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ created_at: string; status: string }>;
  return rows.length ? { createdAt: rows[0].created_at, status: rows[0].status } : null;
}

/** All runs of a workflow strictly newer than `sinceIso`, oldest first
 * (bounded). Feeds decideWorkflowCompleted so a success is not masked by a
 * later error in the same poll interval. */
export async function runsSinceForWorkflow(
  supabase: SupabaseClient<Database>,
  userId: string,
  workflowId: string,
  sinceIso: string
): Promise<Array<{ createdAt: string; status: string }>> {
  const { data, error } = await table(supabase)
    .select("created_at, status")
    .eq("user_id", userId)
    .eq("workflow_id", workflowId)
    .gt("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ created_at: string; status: string }>).map((r) => ({
    createdAt: r.created_at,
    status: r.status,
  }));
}

/** The most recent run of any workflow for a user (excluding a given workflow
 * to prevent self-triggering), or null if no runs exist. Used for "any workflow"
 * triggers. */
export async function latestRunAnyWorkflow(
  supabase: SupabaseClient<Database>,
  userId: string,
  excludeWorkflowId: string
): Promise<{ createdAt: string; status: string; workflowName: string } | null> {
  const { data, error } = await table(supabase)
    .select("created_at, status, workflow_name")
    .eq("user_id", userId)
    .neq("workflow_id", excludeWorkflowId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{ created_at: string; status: string; workflow_name: string }>;
  return rows.length ? { createdAt: rows[0].created_at, status: rows[0].status, workflowName: rows[0].workflow_name } : null;
}

/** All runs of ANY workflow strictly newer than `sinceIso`, excluding the
 * given workflow, oldest first (bounded). Used when a trigger watches for any
 * workflow completion and needs to exclude its own workflow to prevent loops. */
export async function runsSinceAnyWorkflow(
  supabase: SupabaseClient<Database>,
  userId: string,
  sinceIso: string,
  excludeWorkflowId: string
): Promise<Array<{ createdAt: string; status: string; workflowName: string }>> {
  const { data, error } = await table(supabase)
    .select("created_at, status, workflow_name")
    .eq("user_id", userId)
    .gt("created_at", sinceIso)
    .neq("workflow_id", excludeWorkflowId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ created_at: string; status: string; workflow_name: string }>).map((r) => ({
    createdAt: r.created_at,
    status: r.status,
    workflowName: r.workflow_name,
  }));
}
