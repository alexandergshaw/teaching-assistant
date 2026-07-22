// Shared status types and update functions for unattended workflow run observability.
// Server-safe (no "use client").

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

export type WorkflowRunStatus = "started" | "ok" | "error" | "skipped";

function scheduleTable(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("workflow_schedules");
}

function triggerTable(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("workflow_triggers");
}

/** Update a schedule's run status and detail columns. Best-effort: failures are
 * logged but never break the run they describe. */
export async function updateScheduleRunOutcome(
  supabase: SupabaseClient<Database>,
  userId: string,
  scheduleId: string,
  status: WorkflowRunStatus,
  detail: string
): Promise<void> {
  const capped = detail.slice(0, 500);
  const { error } = await scheduleTable(supabase)
    .update({ last_run_status: status, last_run_detail: capped })
    .eq("user_id", userId)
    .eq("id", scheduleId);
  if (error) {
    console.error("Failed to update schedule run status:", error);
  }
}

/** Update a trigger's run status and detail columns. Best-effort: failures are
 * logged but never break the run they describe. */
export async function updateTriggerRunOutcome(
  supabase: SupabaseClient<Database>,
  userId: string,
  triggerId: string,
  status: WorkflowRunStatus,
  detail: string
): Promise<void> {
  const capped = detail.slice(0, 500);
  const { error } = await triggerTable(supabase)
    .update({ last_run_status: status, last_run_detail: capped })
    .eq("user_id", userId)
    .eq("id", triggerId);
  if (error) {
    console.error("Failed to update trigger run status:", error);
  }
}
