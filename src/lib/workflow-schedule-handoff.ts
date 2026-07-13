// In-memory bridge between the page-level schedule watcher and the Workflows
// tab: claimed due schedules queue here, and the tab (once mounted and idle)
// dequeues them into its existing auto-run handoff. Module state is enough
// because both sides live in the same SPA session. A claimed run is consumed
// within seconds of enqueueing; closing the tab inside that window loses that
// occurrence (repeating schedules fire again at their next time).

export interface ScheduledRun {
  scheduleId: string;
  workflowId: string;
  workflowName: string;
  fieldValues: Record<string, string>;
}

const queue: ScheduledRun[] = [];

/** Fired whenever a run is enqueued so a mounted Workflows tab can react. */
export const SCHEDULED_RUN_EVENT = "ta-workflow-scheduled-run";

export function enqueueScheduledRun(run: ScheduledRun): void {
  queue.push(run);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SCHEDULED_RUN_EVENT));
  }
}

/** The oldest queued run without removing it, or null when idle. */
export function peekScheduledRun(): ScheduledRun | null {
  return queue[0] ?? null;
}

/** Remove and return the oldest queued run, or null when idle. */
export function takeScheduledRun(): ScheduledRun | null {
  return queue.shift() ?? null;
}

export function hasScheduledRun(): boolean {
  return queue.length > 0;
}
