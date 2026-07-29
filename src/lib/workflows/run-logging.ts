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
  input: { id: string; workflowId: string; workflowName: string; triggerSource: TriggerSource; triggerRef?: string }
): Promise<void> {
  try {
    await startWorkflowRun(supabase, userId, input);
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
 * unavailable for this run). */
export async function logStepOutcome(
  runLog: RunLogContext | undefined,
  outcome: LoggableStepOutcome,
  timing: { startedAt: string; finishedAt: string },
  progress: string[]
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
    });
  } catch (err) {
    console.error("logStepOutcome: failed to write step row:", err);
  }
}
