const TERMINAL_TASK_STATES = new Set(["completed", "idle", "failed", "timed_out", "cancelled"]);

/** Lifecycle may permit a fresh attempt without establishing continuation eligibility. */
export function copilotTaskState(state: string | undefined): { running: boolean; canFollowup: boolean } {
  return { running: state !== undefined && !TERMINAL_TASK_STATES.has(state), canFollowup: state === "completed" || state === "idle" };
}
