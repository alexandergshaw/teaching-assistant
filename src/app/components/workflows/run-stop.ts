// Pure helpers for B4 of the workflows/lecture UX audit: every run needs a
// reachable stop, and a half-finished run must never look like a completed
// one. This module owns the two decisions that make that true - what the
// confirm says before the click, and what gets written into the run's own
// persisted record (workflow_runs, via finishWorkflowRun) afterward - kept
// pure so both are unit-testable without a DOM (vitest.config.ts is node-env
// only) and without a live Supabase client.
//
// Distinct from the existing "Stop after this course"
// (stopAfterCurrentCourse in useWorkflowRun.ts): that control only ever
// existed for a course fan-out, waits for the CURRENT COURSE to finish
// first, and is a no-op everywhere else - so a single-course run writing to
// the wrong course had no reachable stop at all. "Abort run" (this module)
// is available for every run, attended checks between STEPS (not just
// between courses), and never interrupts a step already in flight - the
// engine cannot preempt an in-progress `await def.run(...)`, only decline to
// start the next one.

/** The confirm shown before an "Abort run" click actually takes effect -
 * states plainly what happens to work already done (never undone) and what
 * happens to work not yet started (skipped, not silently dropped), so
 * clicking through it is an informed choice rather than a guess. */
export function buildAbortRunConfirmMessage(): string {
  return (
    "Stop this run? Steps already finished are NOT undone. The step " +
    "currently running (if any) will finish; every step after it will be " +
    "skipped, not started. This run's record will show it was stopped, " +
    "not completed."
  );
}

/** The Detail-line prefix a stopped run gets, LEADING any genuine step
 * errors it also produced - e.g. "Stopped by user after 3 of 7 steps".
 * Mirrors joinStepErrorDetail's own "lead with the root cause" discipline
 * (run-detail.ts): a reader of the run record sees "this was stopped"
 * first, never buried under unrelated error noise. `completedSteps` counts
 * steps that actually ran (through logStep) before the stop took effect;
 * `totalSteps` is every step the run PLANNED to execute across its whole
 * fan-out (steps per group times the number of groups), so "3 of 7" always
 * reads as "less than everything", never as a false completion. */
export function describeStoppedRunDetail(completedSteps: number, totalSteps: number): string {
  const clampedCompleted = Math.max(0, Math.min(completedSteps, totalSteps));
  return `Stopped by user after ${clampedCompleted} of ${totalSteps} step${totalSteps === 1 ? "" : "s"}`;
}

/** The run-level status finishWorkflowRun should persist once a run has been
 * stopped mid-way: NEVER "ok" - a half-finished run stopped by the user must
 * not read as a clean success just because none of the steps that DID run
 * happened to error. workflow_runs has no dedicated "stopped" status value
 * (WorkflowRunStatus is "ok" | "error" | "skipped" | "running" -
 * src/lib/workflow-runs.ts), so this reuses "error" (the closest of the
 * three finishWorkflowRun actually accepts to "did not complete cleanly")
 * and relies on describeStoppedRunDetail's own text, always prefixed ahead
 * of it, to say WHY - never leaving a stopped run indistinguishable from a
 * genuine step failure by its detail text alone. */
export function stoppedRunStatus(): "error" {
  return "error";
}
