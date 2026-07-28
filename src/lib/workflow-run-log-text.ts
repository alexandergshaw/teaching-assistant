// Pure formatter for the downloadable plain-text workflow run log.
//
// WorkflowRunRecord/WorkflowRunStep are imported type-only from
// workflow-runs.ts, so the import erases at compile time and this module
// carries no runtime dependency on the Supabase client - it is unit-testable
// directly, with no database involved (mirrors the AnswerLink type-only
// import pattern documented in live-class-sessions.ts).
//
// Deterministic by construction: this module never calls Date.now(), new
// Date(), Math.random(), or any other source of ambient state. Every value
// it renders comes from its arguments.

import type { WorkflowRunRecord, WorkflowRunStep } from "./workflow-runs";

function line(label: string, value: string): string {
  return `${label}: ${value}`;
}

function formatDuration(ms: number | null): string {
  return ms === null ? "(unknown)" : `${ms}ms`;
}

function formatTimestamp(value: string | null): string {
  return value ?? "(not recorded)";
}

function formatCount(value: number | null): string {
  return value === null ? "(unknown)" : String(value);
}

function renderStep(step: WorkflowRunStep): string[] {
  const out: string[] = [];
  out.push(`[${step.stepIndex}] ${step.stepType} - ${step.status}`);
  out.push(line("  Duration", formatDuration(step.durationMs)));
  out.push(line("  Started at", formatTimestamp(step.startedAt)));
  out.push(line("  Finished at", formatTimestamp(step.finishedAt)));
  if (step.institution) out.push(line("  Institution", step.institution));
  if (step.courseId) out.push(line("  Course", step.courseId));
  if (step.progress.length > 0) {
    out.push("  Progress:");
    for (const message of step.progress) {
      out.push(`    - ${message}`);
    }
  }
  if (step.error) {
    out.push("  Error:");
    out.push(`    ${step.error}`);
  }
  if (step.summary) {
    out.push("  Summary:");
    out.push(`    ${step.summary}`);
  }
  return out;
}

/** Render the full plain-text run log: a header describing the run, one
 * block per step in index order (as given in `steps` - callers are expected
 * to pass listRunSteps' already-ordered result), and a trailing footer that
 * calls out a run with no finish record (killed by a time cap, crashed, or
 * otherwise interrupted before it could finish). Plain text, no markdown. */
export function buildRunLogText(run: WorkflowRunRecord, steps: WorkflowRunStep[]): string {
  const lines: string[] = [];

  lines.push(`Workflow run log: ${run.workflowName} (${run.workflowId})`);
  lines.push(line("Run id", run.id));
  lines.push(line("Trigger source", run.triggerSource ?? "(unknown)"));
  lines.push(line("Trigger ref", run.triggerRef ?? "(none)"));
  lines.push(line("Status", run.status));
  lines.push(line("Started at", formatTimestamp(run.startedAt)));
  lines.push(line("Finished at", formatTimestamp(run.finishedAt)));
  lines.push(line("Duration", formatDuration(run.durationMs)));
  lines.push(line("Step count", formatCount(run.stepCount)));
  lines.push(line("Error count", formatCount(run.errorCount)));

  if (run.detail) {
    lines.push("");
    lines.push("Detail:");
    lines.push(run.detail);
  }

  lines.push("");
  lines.push(`Steps (${steps.length}):`);
  if (steps.length === 0) {
    lines.push("(no steps recorded)");
  }
  for (const step of steps) {
    lines.push("");
    lines.push(...renderStep(step));
  }

  lines.push("");
  if (!run.finishedAt) {
    lines.push(
      "This run has no finish record: it did not complete (killed by a time limit, a crash, or an interruption)."
    );
  }

  return lines.join("\n");
}
