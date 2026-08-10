import { describe, it, expect } from "vitest";
import {
  isCanvasThrottleStatus,
  isCanvasRateLimitStatus,
  canvasThrottleDelayMs,
  maxThrottleSleepMs,
  createThrottleBudget,
  fetchWithThrottleRetry,
  CANVAS_THROTTLE_MAX_ATTEMPTS,
  CANVAS_THROTTLE_BASE_DELAY_MS,
  CANVAS_BULK_THROTTLE_BUDGET_MS,
} from "./canvas-throttle";

/** A fake `attempt` that hands back the given statuses in order, repeating the
 * last one forever, and counts how many times it was called. */
function attempts(...statuses: number[]) {
  let calls = 0;
  const attempt = async (): Promise<Response> => {
    const status = statuses[Math.min(calls, statuses.length - 1)];
    calls += 1;
    return new Response(JSON.stringify({ n: calls }), { status });
  };
  return { attempt, callCount: () => calls };
}

/** Records every sleep instead of performing it, so the backoff SCHEDULE is
 * asserted directly rather than inferred from elapsed wall-clock time. */
function recordingSleep() {
  const slept: number[] = [];
  return { slept, sleep: async (ms: number) => void slept.push(ms) };
}

describe("isCanvasThrottleStatus", () => {
  it("treats both 429 and 403 as throttle signals", () => {
    expect(isCanvasThrottleStatus(429)).toBe(true);
    expect(isCanvasThrottleStatus(403)).toBe(true);
  });

  it("treats nothing else as a throttle - a 404 or 500 must fail fast, not retry", () => {
    for (const status of [200, 201, 400, 401, 404, 422, 500, 502, 503]) {
      expect(isCanvasThrottleStatus(status)).toBe(false);
    }
  });
});

describe("isCanvasRateLimitStatus", () => {
  it("accepts 429 and REJECTS 403 - the difference from isCanvasThrottleStatus", () => {
    expect(isCanvasRateLimitStatus(429)).toBe(true);
    expect(isCanvasRateLimitStatus(403)).toBe(false);
  });

  it("is otherwise identical - nothing else retries", () => {
    for (const status of [200, 201, 400, 401, 404, 422, 500, 502, 503]) {
      expect(isCanvasRateLimitStatus(status)).toBe(false);
    }
  });

  it("differs from isCanvasThrottleStatus on 403 and ONLY on 403", () => {
    // Pins that the two predicates have exactly one point of disagreement, so
    // a future edit to either cannot silently widen the gap.
    const disagreements = [];
    for (let status = 100; status < 600; status += 1) {
      if (isCanvasThrottleStatus(status) !== isCanvasRateLimitStatus(status)) disagreements.push(status);
    }
    expect(disagreements).toEqual([403]);
  });
});

describe("the backoff schedule", () => {
  it("doubles from the base delay", () => {
    expect(canvasThrottleDelayMs(1)).toBe(500);
    expect(canvasThrottleDelayMs(2)).toBe(1000);
    expect(canvasThrottleDelayMs(3)).toBe(2000);
  });

  it("worst case for one fully-retried call is 3500ms at the defaults", () => {
    expect(maxThrottleSleepMs()).toBe(3500);
    expect(maxThrottleSleepMs(CANVAS_THROTTLE_MAX_ATTEMPTS, CANVAS_THROTTLE_BASE_DELAY_MS)).toBe(3500);
  });

  it("the bulk budget is sized against that worst case, not picked independently of it", () => {
    // The budget is only meaningful relative to what one call can spend.
    // Asserting the RELATIONSHIP means changing either constant alone fails
    // here instead of silently drifting.
    const fullRetriesAffordable = Math.floor(CANVAS_BULK_THROTTLE_BUDGET_MS / maxThrottleSleepMs());
    expect(fullRetriesAffordable).toBeGreaterThanOrEqual(5);
    // And the whole allowance must stay well inside the 60s function cap,
    // leaving room for the actual HTTP round trips.
    expect(CANVAS_BULK_THROTTLE_BUDGET_MS).toBeLessThanOrEqual(30_000);
  });
});

describe("fetchWithThrottleRetry without a budget", () => {
  it("does not retry, and does not sleep, on a successful response", async () => {
    const { attempt, callCount } = attempts(200);
    const { slept, sleep } = recordingSleep();

    const response = await fetchWithThrottleRetry(attempt, { sleep });

    expect(response.status).toBe(200);
    expect(callCount()).toBe(1);
    expect(slept).toEqual([]);
  });

  it("does not retry a non-throttle failure - a 404 fails on its first response", async () => {
    const { attempt, callCount } = attempts(404);
    const { slept, sleep } = recordingSleep();

    const response = await fetchWithThrottleRetry(attempt, { sleep });

    expect(response.status).toBe(404);
    expect(callCount()).toBe(1);
    expect(slept).toEqual([]);
  });

  it("retries a persistent 429 to the attempt cap, sleeping 500/1000/2000", async () => {
    const { attempt, callCount } = attempts(429);
    const { slept, sleep } = recordingSleep();

    const response = await fetchWithThrottleRetry(attempt, { sleep });

    expect(callCount()).toBe(CANVAS_THROTTLE_MAX_ATTEMPTS);
    expect(slept).toEqual([500, 1000, 2000]);
    expect(response.status).toBe(429);
  });

  it("retries a persistent 403 the same way - the documented Canvas quirk", async () => {
    const { attempt, callCount } = attempts(403);
    const { slept, sleep } = recordingSleep();

    await fetchWithThrottleRetry(attempt, { sleep });

    expect(callCount()).toBe(CANVAS_THROTTLE_MAX_ATTEMPTS);
    expect(slept).toEqual([500, 1000, 2000]);
  });

  it("stops as soon as a retry succeeds, returning the successful response", async () => {
    const { attempt, callCount } = attempts(429, 429, 200);
    const { slept, sleep } = recordingSleep();

    const response = await fetchWithThrottleRetry(attempt, { sleep });

    expect(response.status).toBe(200);
    expect(callCount()).toBe(3);
    expect(slept).toEqual([500, 1000]);
  });

  it("returns the LAST response rather than throwing, leaving the verdict to the caller", async () => {
    const { attempt } = attempts(429);
    const { sleep } = recordingSleep();

    await expect(fetchWithThrottleRetry(attempt, { sleep })).resolves.toBeInstanceOf(Response);
  });
});

describe("the retryOn predicate", () => {
  it("defaults to isCanvasThrottleStatus, so an unconfigured caller still retries 403", async () => {
    const { attempt, callCount } = attempts(403);
    const { sleep } = recordingSleep();

    await fetchWithThrottleRetry(attempt, { sleep });

    expect(callCount()).toBe(CANVAS_THROTTLE_MAX_ATTEMPTS);
  });

  it("with isCanvasRateLimitStatus, a 403 fails on its first response and never sleeps", async () => {
    // This is writeJson's configuration: a genuinely forbidden write reports
    // immediately instead of spending 3.5s on a backoff that cannot help.
    const { attempt, callCount } = attempts(403);
    const { slept, sleep } = recordingSleep();

    const response = await fetchWithThrottleRetry(attempt, { retryOn: isCanvasRateLimitStatus, sleep });

    expect(callCount()).toBe(1);
    expect(slept).toEqual([]);
    expect(response.status).toBe(403);
  });

  it("with isCanvasRateLimitStatus, a 429 still retries on the full schedule", async () => {
    const { attempt, callCount } = attempts(429);
    const { slept, sleep } = recordingSleep();

    await fetchWithThrottleRetry(attempt, { retryOn: isCanvasRateLimitStatus, sleep });

    expect(callCount()).toBe(CANVAS_THROTTLE_MAX_ATTEMPTS);
    expect(slept).toEqual([500, 1000, 2000]);
  });
});

describe("a shared ThrottleBudget across a bulk loop", () => {
  it("drains across successive calls rather than resetting per call", async () => {
    const budget = createThrottleBudget(3500);
    const { slept, sleep } = recordingSleep();

    // First call spends the whole allowance on a full retry schedule.
    await fetchWithThrottleRetry(attempts(429).attempt, { budget, sleep });
    expect(slept).toEqual([500, 1000, 2000]);
    expect(budget.remainingMs).toBe(0);

    // Second call gets nothing, so it fails at its first response.
    const second = attempts(429);
    await fetchWithThrottleRetry(second.attempt, { budget, sleep });
    expect(second.callCount()).toBe(1);
    expect(slept).toEqual([500, 1000, 2000]);
  });

  it("stops rather than sleeping a partial amount when the next delay does not fit", async () => {
    // 1200ms affords the 500 and the 1000... no: 500 fits, leaving 700, which
    // is less than the 1000 the second retry needs. It must stop there, not
    // sleep 700.
    const budget = createThrottleBudget(1200);
    const { slept, sleep } = recordingSleep();
    const { attempt, callCount } = attempts(429);

    await fetchWithThrottleRetry(attempt, { budget, sleep });

    expect(slept).toEqual([500]);
    expect(budget.remainingMs).toBe(700);
    expect(callCount()).toBe(2);
  });

  it("an exhausted budget makes every later write fail fast with ZERO sleep", async () => {
    const budget = createThrottleBudget(0);
    const { slept, sleep } = recordingSleep();
    const { attempt, callCount } = attempts(429);

    await fetchWithThrottleRetry(attempt, { budget, sleep });

    expect(callCount()).toBe(1);
    expect(slept).toEqual([]);
  });

  it("bounds a 50-item loop under a sustained throttle - the 60s-cap regression this exists to prevent", async () => {
    // Without a shared budget this is 50 x 3500ms = 175s of sleep inside ONE
    // server invocation, past the 60s Vercel Hobby cap: a timeout instead of
    // a clean per-item failure report. Counting total sleep across the whole
    // simulated loop is the assertion that actually proves the bound.
    // 429 specifically, because that is what writeJson retries.
    const budget = createThrottleBudget();
    const { slept, sleep } = recordingSleep();
    let totalAttempts = 0;

    for (let i = 0; i < 50; i += 1) {
      const { attempt, callCount } = attempts(429);
      await fetchWithThrottleRetry(attempt, { budget, sleep });
      totalAttempts += callCount();
    }

    const totalSleptMs = slept.reduce((sum, ms) => sum + ms, 0);
    expect(totalSleptMs).toBeLessThanOrEqual(CANVAS_BULK_THROTTLE_BUDGET_MS);
    expect(totalSleptMs).toBeLessThan(30_000);
    // Every one of the 50 items still ran and still got its own verdict - the
    // budget bounds the WAITING, it never skips work.
    expect(totalAttempts).toBeGreaterThanOrEqual(50);
  });

  it("successful writes never draw the budget down", async () => {
    const budget = createThrottleBudget(3500);
    const { sleep } = recordingSleep();

    for (let i = 0; i < 20; i += 1) {
      await fetchWithThrottleRetry(attempts(200).attempt, { budget, sleep });
    }

    expect(budget.remainingMs).toBe(3500);
  });

  it("a budget large enough is indistinguishable from no budget at all", async () => {
    const withBudget = recordingSleep();
    const without = recordingSleep();

    await fetchWithThrottleRetry(attempts(429).attempt, { budget: createThrottleBudget(1_000_000), sleep: withBudget.sleep });
    await fetchWithThrottleRetry(attempts(429).attempt, { sleep: without.sleep });

    expect(withBudget.slept).toEqual(without.slept);
  });
});
