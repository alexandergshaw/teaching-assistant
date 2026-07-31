// Shared step-logging helpers used by BOTH workflow runners: the unattended
// server runner (server-runner.ts, invoked by the cron schedule route, the
// trigger runner, the webhook token route, and the GitHub push webhook
// route) and the attended in-browser runner (useWorkflowRun.ts). Centralized
// here so a schedule run and a manual run of the SAME workflow produce
// comparable per-step logs - see src/lib/workflow-runs.ts for the underlying
// startWorkflowRun / finishWorkflowRun / recordRunStep API this wraps (that
// file owns the persistence; this one only shapes what each runner passes
// into it).
//
// Kept dependency-light (workflow-runs.ts + registry-helpers.ts types only,
// no "use client", no DOM/window access) so it is safe to import unchanged
// from a Route Handler, a server-only lib module, or a "use client" hook.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  startWorkflowRun,
  recordRunStep,
  type TriggerSource,
  type WorkflowRunStepStatus,
} from "@/lib/workflow-runs";
import type { StepRunSummary } from "@/lib/workflows/registry-helpers";
import { redactRunInputs } from "@/lib/workflows/run-input-redaction";

// U7-AC2: a step can gracefully degrade internally (RCA19 - some of its own
// units of work failed, but the step itself did not throw, so dependents
// still get its real outputs) while server-runner.ts's outcome for it stays
// `status: "done", error: null` - identical to a step where nothing failed
// at all. The result: a run can read "Status: ok, Error count: 0" while a
// step's own body shows most of its work failed (the exact defect a real
// run - 2f4aea3c - exposed: 15 of 16 weekly announcements failed while the
// step reported DONE and the run reported Error count: 0).
//
// PARTIAL_FAILURE_OUTPUT_KEY is a convention, not a new field on
// StepRunResult/StepDefinition (registry-helpers.ts) or WorkflowRunStepStatus
// (workflow-runs.ts) - StepRunResult.outputs is already an untyped
// `Record<string, unknown>` bag specifically so a step can attach a value
// like this one without changing either of those shared types. A step that
// wants to report "I completed, but N of my units of work failed" sets this
// key on its own `outputs` alongside its REAL, declared outputs; no step
// declares a StepOutputSpec for this key, so the workflow builder never
// offers it as a bindable output - it exists purely for server-runner.ts (via
// readPartialFailureDetail below) to read into the step's LOGGED `error`
// field while leaving `status: "done"` exactly as RCA19 requires. See
// buildRunLogText's isPartialFailureStep (workflow-run-log-text.ts) for how
// that becomes visible in the rendered log without changing cascade
// behavior at all.
export const PARTIAL_FAILURE_OUTPUT_KEY = "__partialFailureDetail";

/** Reads PARTIAL_FAILURE_OUTPUT_KEY off a step's raw outputs bag. Defensive:
 * a missing key, a non-string value (e.g. from a hand-rolled test double or
 * a step that never adopted this convention), or an all-whitespace string
 * all read as "no partial failure" (null) rather than throwing or leaking a
 * blank error line into the log. */
export function readPartialFailureDetail(outputs: Record<string, unknown> | null | undefined): string | null {
  const value = outputs?.[PARTIAL_FAILURE_OUTPUT_KEY];
  return typeof value === "string" && value.trim() ? value : null;
}

/** Caps how many onProgress messages a single step's log row can accumulate.
 * A chatty step (one that reports progress per item across hundreds of
 * items) must never let one row's `progress` array - and therefore the
 * eventual downloadable log - grow unboundedly. Once hit, later messages for
 * that step are silently dropped; the step's own summary/error still
 * reflects its true outcome. */
export const MAX_PROGRESS_MESSAGES_PER_STEP = 200;

/** A per-step progress collector: create a fresh one before running each
 * step, pass `.onProgress` to stepDef.run (in the attended runner, called
 * alongside - not instead of - the existing single-string UI display),
 * then read `.messages` once the step finishes, on either success or
 * failure (messages collected before a mid-step throw are still kept). */
export function createProgressCollector(): { messages: string[]; onProgress: (text: string) => void } {
  const messages: string[] = [];
  return {
    messages,
    onProgress: (text: string) => {
      if (messages.length < MAX_PROGRESS_MESSAGES_PER_STEP) messages.push(text);
    },
  };
}

/** Render a step's structured StepRunSummary down to the short string
 * recordRunStep's `summary` column stores. Mirrors server-runner.ts's
 * buildRunReportMarkdown "empty summaries carry no content" rule: an empty
 * text/list summary logs no summary line at all rather than a blank one. */
export function summaryToLogText(summary: StepRunSummary | null | undefined): string | null {
  if (!summary) return null;
  switch (summary.kind) {
    case "text":
      return summary.text.trim() || null;
    case "list":
      // One item per line (a "- " bullet each, matching the log's Progress
      // section convention), NOT comma-joined: a batch step's list summary
      // routinely holds one entry per repo/course/student, and a
      // comma-joined paragraph of six-plus items reads as an unscannable
      // run-on line in the downloadable log (buildRunLogText renders
      // whatever newlines are already in this string, indenting each one -
      // see workflow-run-log-text.ts's indentLines).
      return summary.items.length > 0
        ? `${summary.label}:\n${summary.items.map((item) => `- ${item}`).join("\n")}`
        : null;
    case "link":
      return summary.label || summary.url ? `${summary.label}: ${summary.url}` : null;
    case "schedule":
      return summary.courseTitle ? `Schedule generated for ${summary.courseTitle}` : "Schedule generated";
    default:
      return null;
  }
}

/** startWorkflowRun (unlike finishWorkflowRun / recordRunStep) throws on a
 * write failure - see workflow-runs.ts - so every one of the five run call
 * sites must guard it. Centralized here so none of them repeat the same
 * try/catch. A failure to write the start row is swallowed (console.error
 * only): a logging outage must degrade to a missing log, never a failed
 * workflow run. */
export async function safeStartWorkflowRun(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: {
    id: string;
    workflowId: string;
    workflowName: string;
    triggerSource: TriggerSource;
    triggerRef?: string;
    /** The run's RAW runtime field values (an attended run's form `values`
     * merged with its `uploadFiles`, or a schedule/trigger's stored
     * `field_values` snapshot) - redacted and capped HERE, at the one
     * chokepoint both runners already share for logging, before
     * startWorkflowRun ever writes anything (AC2/AC3). `unknown` values
     * (not just strings) so an attended run's File[] upload fields can be
     * passed straight through - redactRunInputs reduces those to
     * name/type/size, never raw content. Absent/undefined when the caller
     * has no field values to report (e.g. a skip path that never resolved
     * any). */
    fieldValues?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await startWorkflowRun(supabase, userId, { ...input, fieldValues: redactRunInputs(input.fieldValues) });
  } catch (err) {
    console.error("safeStartWorkflowRun: failed to write run-start row:", err);
  }
}

/** Context a running step needs to log itself: which client/user/run row.
 * Undefined (rather than a null client) when logging is unavailable for this
 * run (e.g. the attended runner with no signed-in user) - callers treat an
 * undefined RunLogContext as "logging is off", never as an error. */
export interface RunLogContext {
  supabase: SupabaseClient<Database>;
  userId: string;
  runId: string;
}

/** One step's terminal outcome, in the minimal shape logStepOutcome needs -
 * satisfied by both server-runner.ts's StepRunOutcome and the attended
 * runner's own per-step call sites. */
export interface LoggableStepOutcome {
  index: number;
  type: string;
  status: WorkflowRunStepStatus;
  error: string | null;
  summary: StepRunSummary | null;
  institution?: string;
  courseId?: string;
  /** The course tile's human name, when this outcome ran for one - see
   * WorkflowRunStep.courseName's doc comment in workflow-runs.ts for why
   * this is captured here rather than left for the log formatter to guess. */
  courseName?: string;
}

/** Insert one step's log row, as the run proceeds (never batched at the
 * end, so a run killed mid-flight still keeps the steps it already
 * completed). recordRunStep itself never throws (see workflow-runs.ts); this
 * wrapper adds a defensive try/catch anyway so a bug in OUR call (building
 * the row from a step outcome) can never surface as a rejected promise into
 * a runner's step loop. A no-op when `runLog` is undefined (logging
 * unavailable for this run).
 *
 * `rawInputs` - the step's RAW resolvedInputs (exactly what was passed to
 * stepDef.run, unredacted) - is threaded as its own positional parameter
 * rather than a field on `outcome`, deliberately mirroring how `progress`
 * already works here: neither belongs on StepRunOutcome, the aggregate
 * object that flows on through groups/WorkflowRunSummary/report-building/
 * route responses (see server-runner.ts). Keeping raw inputs OUT of that
 * long-lived object means redaction has exactly one door to walk through -
 * this function, called by both runners - rather than depending on every
 * future reader of StepRunOutcome to remember never to serialize it
 * unredacted. redactRunInputs is called HERE, unconditionally, before
 * recordRunStep ever sees the value (AC2). */
export async function logStepOutcome(
  runLog: RunLogContext | undefined,
  outcome: LoggableStepOutcome,
  timing: { startedAt: string; finishedAt: string },
  progress: string[],
  rawInputs?: Record<string, unknown> | null
): Promise<void> {
  if (!runLog) return;
  try {
    await recordRunStep(runLog.supabase, runLog.userId, {
      runId: runLog.runId,
      stepIndex: outcome.index,
      stepType: outcome.type,
      status: outcome.status,
      error: outcome.error,
      summary: summaryToLogText(outcome.summary),
      progress,
      startedAt: timing.startedAt,
      finishedAt: timing.finishedAt,
      institution: outcome.institution,
      courseId: outcome.courseId,
      courseName: outcome.courseName,
      inputs: redactRunInputs(rawInputs),
    });
  } catch (err) {
    console.error("logStepOutcome: failed to write step row:", err);
  }
}
