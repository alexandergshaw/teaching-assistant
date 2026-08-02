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

// The exact literal prefix both runners throw when a step is skipped only
// because a step it binds to failed or was disabled (useWorkflowRun.ts's
// attended loop and server-runner.ts's unattended one - identical wording,
// see either file's "source === step" binding resolution). It is never
// independently produced by a step's own run() body, so matching on it
// reliably tells a downstream CASCADE of one failure apart from a ROOT
// failure. See joinStepErrorDetail's doc comment for why that distinction
// is made here (AC3 of the defect-1 write-up, real run 556b49f0: one root
// cause - a single "Failed to fetch" - cascaded into 47 "Skipped - depends
// on..." entries that buried it inside the run's Detail line, repeated once
// per course in the fan-out).
const CASCADE_SKIP_PREFIX = "Skipped - depends on step ";

function isCascadeMessage(entry: string): boolean {
  // entry is "step N type: message" - only the message half is checked, so
  // a step TYPE that happened to be named e.g. "skipped-thing" never
  // false-positives.
  const sep = entry.indexOf(": ");
  const message = sep >= 0 ? entry.slice(sep + 2) : entry;
  return message.startsWith(CASCADE_SKIP_PREFIX);
}

/**
 * Joins a run's errored/needs-interaction step outcomes into one "; "
 * separated detail string, collapsing IDENTICAL "step N type: message"
 * entries into a single entry with a "(xN)" count - ordering preserved by
 * first appearance - then fits the result within maxChars WITHOUT cutting an
 * entry in the middle. A dropped tail is summarized as "(+N more)" instead of
 * being sliced off mid-word.
 *
 * Root failures (the dedup pass above, minus any "Skipped - depends on
 * step..." cascade entry) are listed FIRST, each still deduped/counted as
 * before. Every cascade entry - however many distinct downstream steps it
 * touched - collapses into a single trailing "N steps skipped as a result"
 * count instead of being listed one by one: a wall of "Skipped - depends on
 * step 2..."/"...step 13..."/"...step 17..." entries (each textually
 * distinct, so the dedup pass alone never collapses them together) is noise
 * once the root cause is already named - AC3 asks for the summary to LEAD
 * with the root failure(s), not bury it under that wall. This never changes
 * which steps get marked failed/skipped (the cascade mechanism itself, in
 * useWorkflowRun.ts/server-runner.ts, is untouched) - only how the
 * already-computed list is rendered here.
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

  const rootMsgs = order.filter((msg) => !isCascadeMessage(msg));
  const cascadeMsgs = order.filter((msg) => isCascadeMessage(msg));
  const cascadeStepCount = cascadeMsgs.reduce((sum, msg) => sum + counts.get(msg)!, 0);

  const entries = rootMsgs.map((msg) => {
    const n = counts.get(msg)!;
    return n > 1 ? `${msg} (x${n})` : msg;
  });
  if (cascadeStepCount > 0) {
    entries.push(`${cascadeStepCount} step${cascadeStepCount === 1 ? "" : "s"} skipped as a result`);
  }

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
