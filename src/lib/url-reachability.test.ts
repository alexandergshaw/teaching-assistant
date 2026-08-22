// Every outcome here proves the SAME rule: fail-closed (D3, see the module
// header on url-reachability.ts). A test that only checks "200 -> alive" and
// stops there would miss the actual point of this module - that anything
// short of a confirmed 2xx/3xx, no matter the cause, comes back not alive,
// and never by throwing or by silently dropping a result. `fetchImpl` is
// injected in every test so nothing here ever touches the network.
//
// Two deliberately different techniques drive the two kinds of "wait" this
// module has, per the acceptance criteria's instruction not to use real
// timers or real sleeping:
//   - The per-request timeout is real production code (setTimeout + abort),
//     so it is driven with vi.useFakeTimers()/advanceTimersByTimeAsync - the
//     same pattern fetch-helpers.throttle.test.ts already uses for
//     writeJson's retry backoff. Fake timers advance synthetically; no wall
//     time elapses.
//   - The total-budget cutoff has NO timer in it at all - it is a pure
//     `now() - startedAt` comparison - so it is driven by injecting a
//     scripted `now` that returns a controlled sequence of readings. No
//     timers, fake or real, are involved in that path.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  checkUrlsReachable,
  REACHABILITY_TIMEOUT_MS,
  REACHABILITY_MAX_CONCURRENT,
  REACHABILITY_TOTAL_BUDGET_MS,
  type ReachabilityFetch,
} from "./url-reachability";

afterEach(() => {
  vi.useRealTimers();
});

// A `fetchImpl` that resolves to a fixed status immediately (a microtask
// away), for the outcomes that do not need to inspect method or timing.
function fixedStatus(status: number): ReachabilityFetch {
  return vi.fn(async () => ({ status }));
}

describe("checkUrlsReachable - module constants", () => {
  // Pinned because the two sibling file sets (the grounded link finder and
  // the generator revision) are built concurrently against these exact
  // values - a silent change here would desync them without either side's
  // own tests noticing.
  it("exports the documented defaults", () => {
    expect(REACHABILITY_TIMEOUT_MS).toBe(3000);
    expect(REACHABILITY_MAX_CONCURRENT).toBe(6);
    expect(REACHABILITY_TOTAL_BUDGET_MS).toBe(12000);
  });
});

describe("checkUrlsReachable - basic outcomes", () => {
  it("a 200 response is alive", async () => {
    const fetchImpl = fixedStatus(200);
    const [result] = await checkUrlsReachable(["https://example.com/a"], fetchImpl);
    expect(result).toEqual({ url: "https://example.com/a", alive: true, status: 200, reason: "ok" });
  });

  it("a 301 redirect is alive", async () => {
    const fetchImpl = fixedStatus(301);
    const [result] = await checkUrlsReachable(["https://example.com/a"], fetchImpl);
    expect(result.alive).toBe(true);
    expect(result.reason).toBe("ok");
    expect(result.status).toBe(301);
  });

  it("a 302 redirect is alive", async () => {
    const fetchImpl = fixedStatus(302);
    const [result] = await checkUrlsReachable(["https://example.com/a"], fetchImpl);
    expect(result.alive).toBe(true);
    expect(result.reason).toBe("ok");
  });

  it("a 404 is NOT alive (fail-closed)", async () => {
    const fetchImpl = fixedStatus(404);
    const [result] = await checkUrlsReachable(["https://example.com/dead"], fetchImpl);
    expect(result).toEqual({ url: "https://example.com/dead", alive: false, status: 404, reason: "client-error" });
  });

  it("a 500 is NOT alive (fail-closed)", async () => {
    const fetchImpl = fixedStatus(500);
    const [result] = await checkUrlsReachable(["https://example.com/broken"], fetchImpl);
    expect(result).toEqual({ url: "https://example.com/broken", alive: false, status: 500, reason: "server-error" });
  });

  it("a thrown network error is NOT alive, and carries no status", async () => {
    const fetchImpl: ReachabilityFetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const [result] = await checkUrlsReachable(["https://example.com/unreachable"], fetchImpl);
    expect(result.alive).toBe(false);
    expect(result.reason).toBe("network");
    expect(result.status).toBeUndefined();
  });
});

describe("checkUrlsReachable - HEAD-rejected retry", () => {
  it("HEAD 405 then GET 200 -> alive, and both attempts used the right method", async () => {
    const fetchImpl: ReachabilityFetch = vi.fn(async (_url, init) => {
      return init.method === "HEAD" ? { status: 405 } : { status: 200 };
    });

    const [result] = await checkUrlsReachable(["https://example.com/head-blocked"], fetchImpl);

    expect(result).toEqual({ url: "https://example.com/head-blocked", alive: true, status: 200, reason: "ok" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][1].method).toBe("HEAD");
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[1][1].method).toBe("GET");
  });

  it("HEAD 501 then GET 404 -> NOT alive", async () => {
    const fetchImpl: ReachabilityFetch = vi.fn(async (_url, init) => {
      return init.method === "HEAD" ? { status: 501 } : { status: 404 };
    });

    const [result] = await checkUrlsReachable(["https://example.com/not-implemented"], fetchImpl);

    expect(result).toEqual({
      url: "https://example.com/not-implemented",
      alive: false,
      status: 404,
      reason: "client-error",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("a HEAD 403 (not 405/501) is final - no GET retry is attempted", async () => {
    const fetchImpl: ReachabilityFetch = vi.fn(async () => ({ status: 403 }));

    const [result] = await checkUrlsReachable(["https://example.com/forbidden"], fetchImpl);

    expect(result.alive).toBe(false);
    expect(result.reason).toBe("client-error");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("checkUrlsReachable - timeout (fake timers, no real waiting)", () => {
  it("a request that never resolves before the timeout is NOT alive, reason timeout", async () => {
    vi.useFakeTimers();

    // Mirrors real fetch's own contract: aborting the signal is what makes
    // the pending fetch reject. The implementation is expected to attribute
    // this to "timeout" because ITS OWN timer fired, not because it inspected
    // the shape of this particular rejection.
    const fetchImpl: ReachabilityFetch = vi.fn(
      (_url, init) =>
        new Promise<{ status: number }>((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        })
    );

    const pending = checkUrlsReachable(["https://example.com/slow"], fetchImpl, { timeoutMs: 500 });
    await vi.advanceTimersByTimeAsync(500);
    const [result] = await pending;

    expect(result).toEqual({ url: "https://example.com/slow", alive: false, reason: "timeout" });
  });

  it("a request that resolves BEFORE the timeout fires is still alive", async () => {
    vi.useFakeTimers();

    const fetchImpl: ReachabilityFetch = vi.fn(async () => ({ status: 200 }));

    const pending = checkUrlsReachable(["https://example.com/fast"], fetchImpl, { timeoutMs: 500 });
    // Advance well past the timeout window - if the implementation were
    // (incorrectly) racing on wall-clock time rather than resolving as soon
    // as fetchImpl settles, this would prove nothing either way, so the real
    // assertion is that the resolved value is alive despite time having
    // moved past the timeout.
    await vi.advanceTimersByTimeAsync(10_000);
    const [result] = await pending;

    expect(result.alive).toBe(true);
    expect(result.reason).toBe("ok");
  });
});

// Resolving one deferred fetch takes several microtask hops to propagate back
// out to the worker loop calling fetchImpl for the next URL (attemptFetch's
// await, checkOneUrl's await, worker's await, each a separate tick). A fixed
// number of ticks, generous enough to cover that chain, is simpler and more
// robust than counting hops exactly.
async function flushMicrotasks(ticks = 10): Promise<void> {
  for (let i = 0; i < ticks; i += 1) {
    await Promise.resolve();
  }
}

describe("checkUrlsReachable - concurrency cap", () => {
  it("never allows more than maxConcurrent fetch attempts in flight at once", async () => {
    const inFlightCounts: number[] = [];
    let inFlight = 0;
    const resolvers: Array<(value: { status: number }) => void> = [];

    const fetchImpl: ReachabilityFetch = vi.fn(() => {
      inFlight += 1;
      inFlightCounts.push(inFlight);
      return new Promise<{ status: number }>((resolve) => {
        resolvers.push((value) => {
          inFlight -= 1;
          resolve(value);
        });
      });
    });

    const urls = Array.from({ length: 5 }, (_, i) => `https://example.com/${i}`);
    const pending = checkUrlsReachable(urls, fetchImpl, {
      maxConcurrent: 2,
      timeoutMs: 60_000,
      totalBudgetMs: 60_000,
    });

    // Synchronous check, deliberately with no await: the worker pool starts
    // exactly `maxConcurrent` workers, and each one calls fetchImpl (which
    // never resolves on its own here) before yielding, so by the time
    // control returns to this line the first two calls have already
    // happened and neither can have been released yet.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(inFlight).toBe(2);

    // Release them one at a time; a third (and fourth) call should only ever
    // appear after a prior one is released, never before, and in-flight
    // should never exceed 2 at any recorded point.
    resolvers[0]({ status: 200 });
    await flushMicrotasks();
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    resolvers[1]({ status: 200 });
    await flushMicrotasks();
    expect(fetchImpl).toHaveBeenCalledTimes(4);

    resolvers[2]({ status: 200 });
    await flushMicrotasks();
    expect(fetchImpl).toHaveBeenCalledTimes(5);

    resolvers[3]({ status: 200 });
    resolvers[4]({ status: 200 });
    const results = await pending;

    expect(results).toHaveLength(5);
    expect(inFlightCounts.every((count) => count <= 2)).toBe(true);
  });
});

describe("checkUrlsReachable - total budget cutoff", () => {
  it("URLs not reached before the total budget expires come back alive:false, reason:budget - never omitted", async () => {
    // No timers at all here - checkUrlsReachable's budget check is a pure
    // `now() - startedAt` comparison, so a scripted `now` alone is enough to
    // drive it deterministically. maxConcurrent: 1 makes worker scheduling
    // strictly sequential (index 0, then 1, then 2, then 3) so each call
    // below can be attributed to a specific URL with no ambiguity.
    const fetchImpl = fixedStatus(200);
    let call = 0;
    // Reading 0: startedAt. Readings 1-2 (urls 0 and 1): still within
    // budget. Reading 3 (url 2's pre-flight check): past the 100ms budget,
    // so url 2 - and, since remainingBudget() is re-read at the top of every
    // worker iteration, url 3 as well - never reach fetchImpl at all.
    const now = () => {
      const readings = [0, 10, 20, 500];
      const value = readings[Math.min(call, readings.length - 1)];
      call += 1;
      return value;
    };

    const urls = [
      "https://example.com/0",
      "https://example.com/1",
      "https://example.com/2",
      "https://example.com/3",
    ];

    const results = await checkUrlsReachable(urls, fetchImpl, {
      maxConcurrent: 1,
      totalBudgetMs: 100,
      now,
    });

    expect(results).toHaveLength(4);
    expect(results[0]).toEqual({ url: urls[0], alive: true, status: 200, reason: "ok" });
    expect(results[1]).toEqual({ url: urls[1], alive: true, status: 200, reason: "ok" });
    expect(results[2]).toEqual({ url: urls[2], alive: false, reason: "budget" });
    expect(results[3]).toEqual({ url: urls[3], alive: false, reason: "budget" });
    // The budget outcome must never be silent omission - length stays 4.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("an already-exhausted budget marks every URL as budget without calling fetchImpl at all", async () => {
    const fetchImpl = fixedStatus(200);
    // now() returning a fixed reading makes elapsed always 0; totalBudgetMs:0
    // is what actually exhausts the budget (0 - 0 <= 0), before url 0's very
    // first pre-flight check - proving fetchImpl is never reached at all,
    // not merely reached-and-then-cut-off partway through the batch.
    const now = () => 1000;
    const results = await checkUrlsReachable(["https://example.com/a", "https://example.com/b"], fetchImpl, {
      totalBudgetMs: 0,
      now,
    });

    expect(results).toEqual([
      { url: "https://example.com/a", alive: false, reason: "budget" },
      { url: "https://example.com/b", alive: false, reason: "budget" },
    ]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

// Finding 8: defaultFetchImpl (the module-private `(url, init) => fetch(url,
// init)` used when no fetchImpl is supplied) was never exercised by any test
// - every test above always passes its own fetchImpl. Rather than making a
// real network request, this stubs the GLOBAL `fetch` the default wraps, at
// the seam checkUrlsReachable's own default-parameter value reaches for, so
// the module's actual production code path (the one-line wrapper) runs for
// real and is proven to (a) exist as the default and (b) forward to global
// fetch with the same method/redirect/signal shape every injected fetchImpl
// test above already relies on - all without touching the network.
describe("checkUrlsReachable - default fetchImpl (Finding 8)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("with no fetchImpl argument, it calls the global fetch and reports the real result", async () => {
    const fetchStub = vi.fn(async () => ({ status: 200 }) as Response);
    vi.stubGlobal("fetch", fetchStub);

    const [result] = await checkUrlsReachable(["https://example.com/default"]);

    expect(result).toEqual({ url: "https://example.com/default", alive: true, status: 200, reason: "ok" });
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(fetchStub).toHaveBeenCalledWith(
      "https://example.com/default",
      expect.objectContaining({ method: "HEAD", redirect: "follow" })
    );
  });

  it("with no fetchImpl argument, a global fetch that rejects is NOT alive (proves the default path is real, not a stub that always succeeds)", async () => {
    const fetchStub = vi.fn(async () => {
      throw new TypeError("network down");
    });
    vi.stubGlobal("fetch", fetchStub);

    const [result] = await checkUrlsReachable(["https://example.com/default-fail"]);

    expect(result.alive).toBe(false);
    expect(result.reason).toBe("network");
  });
});

describe("checkUrlsReachable - order, length, and empty input", () => {
  it("preserves order and length across a mix of outcomes", async () => {
    const fetchImpl: ReachabilityFetch = vi.fn(async (url: string) => {
      if (url.endsWith("/ok")) return { status: 200 };
      if (url.endsWith("/missing")) return { status: 404 };
      if (url.endsWith("/broken")) return { status: 500 };
      throw new Error("unexpected url in test fixture");
    });

    const urls = [
      "https://example.com/ok",
      "https://example.com/missing",
      "https://example.com/broken",
      "https://example.com/ok",
    ];

    const results = await checkUrlsReachable(urls, fetchImpl);

    expect(results).toHaveLength(4);
    expect(results.map((r) => r.url)).toEqual(urls);
    expect(results.map((r) => r.alive)).toEqual([true, false, false, true]);
  });

  it("an empty input array resolves to an empty result array without calling fetchImpl", async () => {
    const fetchImpl = fixedStatus(200);
    const results = await checkUrlsReachable([], fetchImpl);
    expect(results).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
