// Thin, timer-driven wrapper around the pure decideSettle decision
// (live-class-logic.ts): polls `getPendingCount` until it hits zero or
// `timeoutMs` elapses, and never blocks longer than that bound. Kept
// separate from live-class-logic.ts because it genuinely needs a real clock
// and real timers - live-class-logic.ts's whole point is to stay free of
// both so its decisions are deterministic and unit-testable without a
// browser.
//
// Shared by useLiveTranscription.ts (waits for an in-flight segment
// transcription) and useLiveAnswers.ts (waits for an in-flight answer) so a
// class-ending instructor's final autosave and end-of-class docx are built
// from settled state rather than silently missing whatever was still in
// flight the moment they pressed Stop.

import { decideSettle } from "./live-class-logic";

const DEFAULT_POLL_INTERVAL_MS = 150;

export interface SettleResult {
  /** True when the bound was reached with work still outstanding - the
   * caller must surface this, never drop it silently. */
  timedOut: boolean;
}

/**
 * Wait for `getPendingCount()` to reach zero, polling every
 * `pollIntervalMs`, but never longer than `timeoutMs` total - a hung request
 * must never block the instructor from ending class indefinitely.
 */
export async function waitForSettle(
  getPendingCount: () => number,
  timeoutMs: number,
  pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS
): Promise<SettleResult> {
  const startedAt = Date.now();
  for (;;) {
    const decision = decideSettle(getPendingCount(), Date.now() - startedAt, timeoutMs);
    if (decision === "proceed") return { timedOut: false };
    if (decision === "proceed-with-warning") return { timedOut: true };
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
