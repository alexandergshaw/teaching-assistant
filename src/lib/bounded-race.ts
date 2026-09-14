/** A generic, never-throwing race between a promise and a timeout bound.
 *
 *  This is deliberately domain-free: it knows nothing about exemplars,
 *  announcements, courses, or any other caller-specific concept. It exists
 *  so any call site that needs "wait for this, but not forever" can share
 *  one tested implementation instead of hand-rolling the timer bookkeeping
 *  each time.
 */

export type BoundedOutcome<T> =
  | { readonly kind: "settled"; readonly value: T }
  | { readonly kind: "timedout" }
  | { readonly kind: "failed"; readonly error: unknown };

/**
 * Races `work` against a `timeoutMs` bound. Never throws: a rejection from
 * `work` resolves as `{ kind: "failed", error }` and our own bound expiring
 * resolves as `{ kind: "timedout" }`.
 *
 * The bound is a plain `setTimeout`, not `AbortSignal.timeout`. That is not
 * a style choice - `vi.useFakeTimers()` patches `setTimeout` but does not
 * patch `AbortSignal.timeout`, so a bound built on the latter cannot be
 * driven synchronously in this repo's tests and would need real wall-clock
 * waits to exercise.
 *
 * Losing the race does not cancel `work`. `Promise.race` has no way to stop
 * the loser from running - it can only stop the caller from waiting on it.
 * `work` keeps executing (and, if it rejects later, that rejection is
 * simply unobserved by this function).
 */
export async function raceWithTimeout<T>(
  work: Promise<T>,
  timeoutMs: number
): Promise<BoundedOutcome<T>> {
  // `timedOut` is what distinguishes "our timer fired" from "`work`
  // settling on its own" once both are racing as plain promises - deciding
  // from `timedOut` rather than from the shape of whatever `work` produced
  // is what keeps this correct no matter what `work` happens to resolve or
  // reject with (a caller's own value or error could easily look like a
  // timeout outcome).
  let timedOut = false;

  let timer: ReturnType<typeof setTimeout>;
  const timeoutOutcome = new Promise<BoundedOutcome<T>>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve({ kind: "timedout" });
    }, timeoutMs);
  });

  // `work` is converted to a never-rejecting outcome up front. If this
  // conversion were skipped and `work` later rejected after the timeout had
  // already won the race, that rejection would reach Promise.race as an
  // unhandled member and surface as an unhandled rejection - converting
  // here means losing the race is always just "not resolved", never "still
  // pending and about to explode".
  const workOutcome = work.then(
    (value): BoundedOutcome<T> => ({ kind: "settled", value }),
    (error: unknown): BoundedOutcome<T> => ({ kind: "failed", error })
  );

  try {
    const result = await Promise.race([workOutcome, timeoutOutcome]);
    // `timedOut` wins ties deterministically: if our timer fired, that is
    // the outcome to report even if `workOutcome` also happened to settle
    // in the same tick.
    return timedOut ? { kind: "timedout" } : result;
  } finally {
    // Runs no matter which side of the race won. Clearing unconditionally
    // here, before this function's returned promise can be awaited by the
    // caller, is what guarantees no live timer handle survives a settled
    // race - the exact leak `withDeadline` does not guard against.
    clearTimeout(timer!);
  }
}
