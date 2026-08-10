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

/** Canvas's own throttling documentation writes the status as "429 Forbidden
 * (Rate Limit Exceeded)" - a quirk of their docs, since 429's real reason
 * phrase is "Too Many Requests" and "Forbidden" belongs to 403 - and
 * third-party reports describe a bare 403 for the same condition. Both are
 * treated as throttle signals rather than picking one, which is the behavior
 * the announcements callers have shipped with. */
export function isCanvasThrottleStatus(status: number): boolean {
  return status === 429 || status === 403;
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
 * A genuinely forbidden token returns a real 403 on every item, which is
 * indistinguishable from a throttle at the transport layer, so each item
 * would pay the full 3500ms backoff before failing: 50 selected items = 175s,
 * well past this deployment's 60-second Vercel Hobby function cap. That turns
 * a fast, clean, correctly-reported failure into a timeout - strictly worse
 * than having no retry at all.
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
  const sleep = options.sleep ?? defaultSleep;

  let response = await attempt();
  let tries = 1;
  while (isCanvasThrottleStatus(response.status) && tries < maxAttempts) {
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
