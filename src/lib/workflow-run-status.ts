// Shared status types and update functions for unattended workflow run observability.
// Server-safe (no "use client").

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { redactEmbeddedSecrets } from "./workflows/run-input-redaction";

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
  // SCRUB BEFORE STORING, and scrub before the slice - this column is a
  // SECOND durable path for the same raw error text the run log carries,
  // written here and rendered straight to the operator in the Automate
  // panel (AutomationRow.tsx). The run-log chokepoint (logStepOutcome)
  // does not cover it: this is a different write path with its own
  // caller, so a token embedded in an upstream error message would reach
  // a user's screen and persist in the row. Order matters - slicing
  // first could cut a secret in half and leave a fragment the pattern no
  // longer recognises.
  const capped = redactEmbeddedSecrets(detail).slice(0, 500);
  const patch: Record<string, unknown> = { last_run_status: status, last_run_detail: capped };
  // A successful completion clears any pending stale-claim recovery count, so
  // a later interrupted run gets its one retry again.
  if (status === "ok") patch.recovery_attempts = 0;
  const { error } = await scheduleTable(supabase)
    .update(patch)
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
  // SCRUB BEFORE STORING, and scrub before the slice - this column is a
  // SECOND durable path for the same raw error text the run log carries,
  // written here and rendered straight to the operator in the Automate
  // panel (AutomationRow.tsx). The run-log chokepoint (logStepOutcome)
  // does not cover it: this is a different write path with its own
  // caller, so a token embedded in an upstream error message would reach
  // a user's screen and persist in the row. Order matters - slicing
  // first could cut a secret in half and leave a fragment the pattern no
  // longer recognises.
  const capped = redactEmbeddedSecrets(detail).slice(0, 500);
  const patch: Record<string, unknown> = { last_run_status: status, last_run_detail: capped };
  if (status === "ok") patch.recovery_attempts = 0;
  const { error } = await triggerTable(supabase)
    .update(patch)
    .eq("user_id", userId)
    .eq("id", triggerId);
  if (error) {
    console.error("Failed to update trigger run status:", error);
  }
}
