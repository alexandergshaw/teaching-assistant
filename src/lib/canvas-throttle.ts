// Bounded exponential-backoff retry for Canvas HTTP calls, plus the budget
// that keeps a bulk loop's worst case inside this deployment's function cap.
//
// This logic previously lived as a private function in
// src/lib/canvas/announcements.ts, used by exactly three callers in that one
// file, while every Canvas WRITE in the app (writeJson,
// src/lib/canvas-modules/fetch-helpers.ts - about 40 call sites across 11
// modules) had no retry at all. It is here, unchanged in its retry semantics,
// so both can share it.
//
// Pure and injectable: `sleep` is a parameter with a real default, so tests
// exercise the backoff without actually waiting for it, and nothing in this
// file reads the clock or the network.

// Two predicates, because the right answer genuinely differs by call site.
//
// The ambiguity is real: Canvas's own throttling documentation writes the
// status as "429 Forbidden (Rate Limit Exceeded)" - a quirk of their docs,
// since 429's real reason phrase is "Too Many Requests" and "Forbidden"
// belongs to 403 - and third-party reports describe a bare 403 for the same
// condition. But a 403 is ALSO how Canvas reports a token that genuinely
// lacks access, and nothing in the response distinguishes the two. So
// treating 403 as a throttle buys absorbing an ambiguous throttle at the cost
// of delaying every genuine permissions failure by the full backoff.
//
// That trade is worth it for a scheduled announcement, which is unattended
// and retried rarely. It is not worth it for a write the user is waiting on:
// a broken token should say so at once, not after 3.5 seconds, and should not
// multiply that delay across a bulk run.

/** 429 or 403. The behavior the announcements callers have shipped with, and
 * still the default. */
export function isCanvasThrottleStatus(status: number): boolean {
  return status === 429 || status === 403;
}

/** 429 only - the unambiguous throttle. Used by `writeJson`, so a genuinely
 * forbidden write fails immediately and honestly instead of spending the
 * backoff on a 403 that was never going to succeed. The cost of this choice
 * is that a throttle Canvas chose to report as 403 is no longer absorbed; it
 * surfaces as a per-item failure, which is exactly what it did before any
 * retry existed. */
export function isCanvasRateLimitStatus(status: number): boolean {
  return status === 429;
}

/** Total attempts including the first, so 4 means the initial request plus up
 * to 3 retries. */
export const CANVAS_THROTTLE_MAX_ATTEMPTS = 4;

/** Canvas documents no `Retry-After` header and publishes no numeric quota,
 * so the backoff is defensive by default (a small fixed base, doubling,
 * capped attempts) rather than tuned to a published number. */
export const CANVAS_THROTTLE_BASE_DELAY_MS = 500;

/** The delay before retry number `tries` (1-based: the wait after the first
 * failure is `tries === 1`). */
export function canvasThrottleDelayMs(tries: number, baseDelayMs: number = CANVAS_THROTTLE_BASE_DELAY_MS): number {
  return baseDelayMs * 2 ** (tries - 1);
}

/** Worst-case total sleep ONE fully-retried call can spend: 500 + 1000 + 2000
 * = 3500ms at the defaults. Exported because the budget below is only
 * meaningful relative to this number, and a test asserts the relationship
 * rather than trusting two hand-computed constants to stay in step. */
export function maxThrottleSleepMs(
  maxAttempts: number = CANVAS_THROTTLE_MAX_ATTEMPTS,
  baseDelayMs: number = CANVAS_THROTTLE_BASE_DELAY_MS
): number {
  let total = 0;
  for (let tries = 1; tries < maxAttempts; tries += 1) total += canvasThrottleDelayMs(tries, baseDelayMs);
  return total;
}

/**
 * A sleep allowance shared by every write in one bulk operation.
 *
 * WHY THIS EXISTS, and why per-call retry alone would be a regression:
 *
 * Retry is safe where a loop runs CLIENT-side, one server action per item
 * (BulkCreateModulesModal.tsx:78-92, steps.lms-modules.ts:90) - each item is
 * its own function invocation, so the worst case is one call's 3500ms.
 *
 * It is NOT safe where a loop runs INSIDE one server call: bulkUpdate and
 * bulkDelete (canvas-modules/bulk.ts), bulkAssociateRubric (rubrics.ts), and
 * setDueDates (due-dates.ts) all iterate N items within a single invocation.
 * A SUSTAINED throttle - the case retry exists for, and the one where Canvas
 * keeps answering 429 because the quota is genuinely spent rather than
 * momentarily tight - hits every item in the loop. Each would pay the full
 * 3500ms backoff before failing: 50 selected items = 175s, well past this
 * deployment's 60-second Vercel Hobby function cap. That turns a clean,
 * correctly-reported set of per-item failures into a timeout that reports
 * nothing at all - strictly worse than having no retry.
 *
 * Note this bound is needed precisely BECAUSE writeJson retries only 429
 * (isCanvasRateLimitStatus). Restricting the predicate removed the
 * forbidden-token case from this scenario, but it did nothing about a real
 * throttle, which is the more likely way a long bulk run goes wrong.
 *
 * A shared budget bounds the whole loop instead of each call. Once it is
 * spent, later writes stop sleeping entirely and fail at their first
 * response, so the loop still completes and still reports per-item failures.
 * Successful writes never touch it - only actual retries draw it down.
 */
export interface ThrottleBudget {
  /** Milliseconds of sleep still available across every call sharing this
   * budget. Mutated in place as retries consume it. */
  remainingMs: number;
}

/** 20 seconds: enough for roughly five fully-retried writes at the defaults,
 * which comfortably absorbs a transient throttle affecting the first few
 * items of a bulk run, while leaving the other 40 seconds of the 60-second
 * function cap for the actual HTTP round trips. Sized against
 * maxThrottleSleepMs rather than picked independently of it. */
export const CANVAS_BULK_THROTTLE_BUDGET_MS = 20_000;

export function createThrottleBudget(totalMs: number = CANVAS_BULK_THROTTLE_BUDGET_MS): ThrottleBudget {
  return { remainingMs: Math.max(0, totalMs) };
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ThrottleRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** When present, caps total sleep across every call sharing it. Absent
   * (the default) means per-call retry only, which is what every single-write
   * caller wants and what the announcements callers already had. */
  budget?: ThrottleBudget | null;
  /** Which response statuses count as retryable. Defaults to
   * `isCanvasThrottleStatus` (429 or 403), which is what the announcements
   * callers rely on; `writeJson` passes `isCanvasRateLimitStatus` (429 only).
   * See the note on the two predicates above for why this is a per-call-site
   * decision rather than one global answer. */
  retryOn?: (status: number) => boolean;
  /** Injected so tests can assert the backoff schedule without waiting. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Issues `attempt`, retrying while Canvas answers with a throttle status and
 * attempts remain.
 *
 * Returns the LAST response either way - the caller decides what a
 * still-failing final attempt means. It never throws on a bad status and
 * never inspects the body, so it composes with callers that have their own
 * error mapping (writeJson's canvasError, the announcements callers' own
 * checks) without changing what any of them report.
 *
 * Only responses are retried, never thrown network errors: a 429/403 is
 * returned by Canvas BEFORE the write is applied, so repeating the request
 * cannot duplicate a create, whereas a request that failed mid-flight might
 * have been applied and is deliberately left alone.
 */
export async function fetchWithThrottleRetry(
  attempt: () => Promise<Response>,
  options: ThrottleRetryOptions = {}
): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? CANVAS_THROTTLE_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? CANVAS_THROTTLE_BASE_DELAY_MS;
  const budget = options.budget ?? null;
  const retryOn = options.retryOn ?? isCanvasThrottleStatus;
  const sleep = options.sleep ?? defaultSleep;

  let response = await attempt();
  let tries = 1;
  while (retryOn(response.status) && tries < maxAttempts) {
    const delayMs = canvasThrottleDelayMs(tries, baseDelayMs);
    if (budget) {
      // Stop rather than sleeping a partial amount: a truncated backoff is
      // unlikely to outlast a throttle that already survived the full
      // schedule, and "spent" is far easier to reason about than "spent, but
      // the last one got a fraction of its wait".
      if (budget.remainingMs < delayMs) break;
      budget.remainingMs -= delayMs;
    }
    await sleep(delayMs);
    response = await attempt();
    tries += 1;
  }
  return response;
}
