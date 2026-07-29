// Pure logic for the Automations hub's manual "Run now" control (both
// schedules and triggers). Kept separate from the Route Handler that wires
// this to Supabase/server-runner (src/app/api/automations/run-now/route.ts)
// so eligibility, run-input assembly, and outcome-to-message mapping are all
// unit-testable without a live database or the step registry.
//
// This module is plain (no "use client", no server-only imports) so it can
// be imported from both the Route Handler and the client component that
// renders the button.

import { joinStepErrorDetail, type StepErrorDetailInput } from "./workflows/run-detail";

export type ManualRunKind = "schedule" | "trigger";

/** Minimal shape both a WorkflowSchedule and a WorkflowTrigger satisfy - the
 * subset this module actually reads. Typing against this (rather than the
 * union of the two full domain types) keeps this module from needing to know
 * which kind it was handed. */
export interface ManualRunSource {
  id: string;
  workflowId: string;
  workflowName: string;
  fieldValues: Record<string, string>;
  disabledSteps: number[];
  courseId: string | null;
  institution: string | null;
}

export interface ManualRunInput {
  fieldValues: Record<string, string>;
  disabledTopIndices: Set<number>;
  institution: string | null;
  courseId: string | null;
}

/**
 * Assemble runWorkflowUnattended's inputs from a schedule/trigger's OWN
 * stored snapshot (AC2) - never a blank run, and never anything the caller
 * supplied ad hoc. A copy is returned (never the source's own objects), so a
 * caller mutating the result can never corrupt the stored row it came from.
 */
export function assembleManualRunInput(source: ManualRunSource): ManualRunInput {
  return {
    fieldValues: { ...source.fieldValues },
    disabledTopIndices: new Set(source.disabledSteps),
    institution: source.institution,
    courseId: source.courseId,
  };
}

export interface ManualRunEligibility {
  eligible: boolean;
  /** Human-readable reason to show (as a disabled button's tooltip) when
   * `eligible` is false; null when eligible. */
  reason: string | null;
}

/**
 * Whether the "Run now" control should be enabled, and the reason to show
 * when it is not (AC6). Mirrors the SAME headless-safety re-check the
 * unattended runner itself enforces (isHeadlessSafeWorkflow) - a workflow
 * that fails that check refuses to run unattended no matter how it is
 * invoked, so the button is disabled with an honest reason up front instead
 * of inviting a click that can only ever fail with an opaque server error.
 */
export function manualRunEligibility(opts: {
  workflowExists: boolean;
  isHeadlessSafe: boolean;
}): ManualRunEligibility {
  if (!opts.workflowExists) {
    return { eligible: false, reason: "The workflow this automation runs no longer exists." };
  }
  if (!opts.isHeadlessSafe) {
    return {
      eligible: false,
      reason: "This workflow needs interaction it cannot get unattended, so it cannot be run this way.",
    };
  }
  return { eligible: true, reason: null };
}

/** The subset of WorkflowRunSummary (src/lib/workflows/server-runner.ts)
 * describeManualRunOutcome actually reads - kept structural so this stays a
 * leaf module with no dependency on the runner. */
export interface ManualRunOutcomeInput {
  ok: boolean;
  steps: StepErrorDetailInput[];
  fanout?: { truncated: boolean };
}

export interface ManualRunOutcomeMessage {
  ok: boolean;
  status: "ok" | "error" | "skipped";
  message: string;
}

/**
 * Map a finished run's outcome to the short status + message the row's
 * inline feedback shows (AC5): never reports success for a run that errored,
 * and a fan-out that ran out of its time budget mid-way (manual "Run now"
 * does not implement the cron route's multi-tick checkpoint/resume - a
 * fan-out automation run manually does as much as fits in one call and
 * reports what happened) is reported as an honest partial skip, never a
 * false success.
 */
export function describeManualRunOutcome(outcome: ManualRunOutcomeInput): ManualRunOutcomeMessage {
  if (outcome.fanout?.truncated) {
    return {
      ok: false,
      status: "skipped",
      message: "Stopped partway through the time budget - not every institution or course was reached. Run it again to retry, or wait for the schedule's own cadence to finish the rest.",
    };
  }
  if (outcome.ok) {
    return { ok: true, status: "ok", message: "Ran successfully." };
  }
  const detail = joinStepErrorDetail(outcome.steps);
  return { ok: false, status: "error", message: detail || "The run failed." };
}
