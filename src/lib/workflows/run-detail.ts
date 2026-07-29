// Shared helper for turning a workflow run's step outcomes into the readable
// last_run_detail string both unattended entry points persist - the webhook
// trigger route (src/app/api/triggers/[token]/route.ts) and the cron
// schedule runner (src/app/api/cron/run-schedules/route.ts). A course or
// institution fan-out re-runs the SAME step index once per item within a
// single run, so without dedupe a failing step in an 11-item run produced the
// same one or two sentences repeated eleven times - useless for telling
// which items actually failed, or how many. Extracted into one place because
// both routes built this join separately before, which meant a fix (like
// this one) had to be made twice.

/** The subset of StepRunOutcome (src/lib/workflows/server-runner.ts) this
 * helper needs - kept structural rather than importing that type so this
 * stays a leaf module with no dependency on the runner. */
export interface StepErrorDetailInput {
  index: number;
  type: string;
  status: string;
  error?: string | null;
}

// Matches the column's own defensive cap in workflow-run-status.ts
// (updateScheduleRunOutcome / updateTriggerRunOutcome both do
// detail.slice(0, 500)). Producing output that already respects this bound,
// on a whole-entry boundary, is what keeps that blind slice from ever firing
// mid-word - workflow_runs.detail (the downloadable log) always keeps the
// untruncated text regardless.
export const RUN_DETAIL_MAX_CHARS = 500;

/**
 * Joins a run's errored/needs-interaction step outcomes into one "; "
 * separated detail string, collapsing IDENTICAL "step N type: message"
 * entries into a single entry with a "(xN)" count - ordering preserved by
 * first appearance - then fits the result within maxChars WITHOUT cutting an
 * entry in the middle. A dropped tail is summarized as "(+N more)" instead of
 * being sliced off mid-word.
 */
export function joinStepErrorDetail(
  steps: StepErrorDetailInput[],
  maxChars: number = RUN_DETAIL_MAX_CHARS
): string {
  const failing = steps.filter((s) => s.status === "error" || s.status === "needs-interaction");
  if (failing.length === 0) return "";

  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const s of failing) {
    const msg = `step ${s.index + 1} ${s.type}: ${s.error ?? s.status}`;
    const next = (counts.get(msg) ?? 0) + 1;
    counts.set(msg, next);
    if (next === 1) order.push(msg);
  }
  const entries = order.map((msg) => {
    const n = counts.get(msg)!;
    return n > 1 ? `${msg} (x${n})` : msg;
  });

  let out = "";
  let included = 0;
  // Room for a trailing "; (+NN more)" suffix so adding it never itself pushes
  // the string past maxChars.
  const reserve = 24;
  for (const entry of entries) {
    const candidate = out ? `${out}; ${entry}` : entry;
    // Always keep at least the first entry, even if it alone exceeds the
    // budget - readability over a hard cutoff mid-sentence.
    if (out !== "" && candidate.length > maxChars - reserve) break;
    out = candidate;
    included++;
  }
  const omitted = entries.length - included;
  if (omitted > 0) out += `; (+${omitted} more)`;
  return out;
}
