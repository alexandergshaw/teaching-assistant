import { describe, it, expect, vi } from "vitest";
import {
  createGroundingResolver,
  isGroundingRedirectHost,
  GROUNDING_REDIRECT_HOST,
  type GroundingFetch,
} from "./grounding-sources";

const REDIRECT_URI = (id: string) => `https://${GROUNDING_REDIRECT_HOST}/grounding-api-redirect/${id}`;

function headersOf(location: string | null): { get(name: string): string | null } {
  return { get: (name: string) => (name.toLowerCase() === "location" ? location : null) };
}

function fixedFetch(status: number, location: string | null): GroundingFetch {
  return vi.fn(async () => ({ status, headers: headersOf(location) }));
}

describe("isGroundingRedirectHost", () => {
  it("matches the exact redirect host", () => {
    expect(isGroundingRedirectHost("vertexaisearch.cloud.google.com")).toBe(true);
  });

  it("matches a subdomain of the redirect host", () => {
    expect(isGroundingRedirectHost("foo.vertexaisearch.cloud.google.com")).toBe(true);
  });

  it("does not match an unrelated host, even one containing the redirect host as a substring", () => {
    expect(isGroundingRedirectHost("real-publisher.test")).toBe(false);
    expect(isGroundingRedirectHost("notvertexaisearch.cloud.google.com")).toBe(false);
  });
});

describe("createGroundingResolver", () => {
  it("resolves a redirect-host source to an ABSOLUTE Location", async () => {
    const fetchImpl = fixedFetch(302, "https://real-publisher.test/deep/page");
    const resolver = createGroundingResolver({ fetchImpl });

    const [result] = await resolver.resolve([{ title: "T", uri: REDIRECT_URI("a") }]);

    expect(result.uri).toBe("https://real-publisher.test/deep/page");
    expect(result.title).toBe("T");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("resolves a redirect-host source to a RELATIVE (protocol-relative) Location, against the request url", async () => {
    // A path-only relative reference ("/deep/page") resolved against a
    // vertexaisearch.cloud.google.com request url stays on that SAME host by
    // definition - not a useful case to pin here, since it would (correctly)
    // be excluded as still-the-redirect-host. A network-path reference
    // ("//host/path", still relative - no scheme) is what a redirect to a
    // DIFFERENT host looks like when written relatively.
    const fetchImpl = fixedFetch(302, "//real-publisher.test/deep/page");
    const resolver = createGroundingResolver({ fetchImpl });

    const [result] = await resolver.resolve([{ title: "T", uri: REDIRECT_URI("a") }]);

    expect(result.uri).toBe("https://real-publisher.test/deep/page");
  });

  it("passes a non-redirect source through untouched with no fetch", async () => {
    const fetchImpl = vi.fn(async () => ({ status: 302, headers: headersOf("https://x.test/y") }));
    const resolver = createGroundingResolver({ fetchImpl });

    const source = { title: "Direct", uri: "https://real-publisher.test/page" };
    const [result] = await resolver.resolve([source]);

    expect(result).toEqual(source);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keeps a source unchanged when the fetch throws", async () => {
    const fetchImpl: GroundingFetch = vi.fn(async () => {
      throw new Error("network blip");
    });
    const resolver = createGroundingResolver({ fetchImpl });

    const [result] = await resolver.resolve([{ title: "T", uri: REDIRECT_URI("a") }]);

    expect(result.uri).toBe(REDIRECT_URI("a"));
  });

  it("keeps a source unchanged on a timeout (our own timer, not fetchImpl's rejection reason)", async () => {
    const fetchImpl: GroundingFetch = vi.fn((_url, init) => {
      return new Promise<{ status: number; headers: { get(name: string): string | null } }>((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    const resolver = createGroundingResolver({ fetchImpl, timeoutMs: 5 });

    const [result] = await resolver.resolve([{ title: "T", uri: REDIRECT_URI("a") }]);

    expect(result.uri).toBe(REDIRECT_URI("a"));
  });

  it("keeps a source unchanged on a non-3xx status (the vendor-assumption fallback)", async () => {
    const fetchImpl = fixedFetch(200, null);
    const resolver = createGroundingResolver({ fetchImpl });

    const [result] = await resolver.resolve([{ title: "T", uri: REDIRECT_URI("a") }]);

    expect(result.uri).toBe(REDIRECT_URI("a"));
  });

  it("keeps a source unchanged when the 3xx response has no Location header", async () => {
    const fetchImpl = fixedFetch(302, null);
    const resolver = createGroundingResolver({ fetchImpl });

    const [result] = await resolver.resolve([{ title: "T", uri: REDIRECT_URI("a") }]);

    expect(result.uri).toBe(REDIRECT_URI("a"));
  });

  it("keeps a source unchanged when the Location is not http(s)", async () => {
    const fetchImpl = fixedFetch(302, "javascript:alert(1)");
    const resolver = createGroundingResolver({ fetchImpl });

    const [result] = await resolver.resolve([{ title: "T", uri: REDIRECT_URI("a") }]);

    expect(result.uri).toBe(REDIRECT_URI("a"));
  });

  it("keeps a source unchanged when the Location is on the redirect host itself", async () => {
    const fetchImpl = fixedFetch(302, REDIRECT_URI("b"));
    const resolver = createGroundingResolver({ fetchImpl });

    const [result] = await resolver.resolve([{ title: "T", uri: REDIRECT_URI("a") }]);

    expect(result.uri).toBe(REDIRECT_URI("a"));
  });

  it("keeps a source unchanged when the Location is on news.google.com", async () => {
    const fetchImpl = fixedFetch(302, "https://news.google.com/articles/xyz");
    const resolver = createGroundingResolver({ fetchImpl });

    const [result] = await resolver.resolve([{ title: "T", uri: REDIRECT_URI("a") }]);

    expect(result.uri).toBe(REDIRECT_URI("a"));
  });

  it("the shared cache resolves a repeated URI with exactly one fetch, across two resolve() calls", async () => {
    const fetchImpl = fixedFetch(302, "https://real-publisher.test/page");
    const resolver = createGroundingResolver({ fetchImpl });

    const source = { title: "T", uri: REDIRECT_URI("shared") };
    const [firstBatch, secondBatch] = await Promise.all([
      resolver.resolve([source]),
      resolver.resolve([source]),
    ]);

    expect(firstBatch[0].uri).toBe("https://real-publisher.test/page");
    expect(secondBatch[0].uri).toBe("https://real-publisher.test/page");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // A LATER resolve() call for the same uri, after the first has already
    // settled, also costs no new fetch - the resolved outcome is free for
    // the next concept.
    const [thirdBatch] = await resolver.resolve([source]);
    expect(thirdBatch.uri).toBe("https://real-publisher.test/page");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("the total budget (injected clock) leaves later sources unchanged", async () => {
    const fetchImpl = fixedFetch(302, "https://real-publisher.test/page");
    // First now() call is the resolver's startedAt; every call thereafter
    // reports a time already past the 100ms budget, so remainingBudget() is
    // negative for every fetchResolution call after the resolver is created.
    let calls = 0;
    const now = () => {
      calls += 1;
      return calls === 1 ? 0 : 1000;
    };
    const resolver = createGroundingResolver({ fetchImpl, now, totalBudgetMs: 100 });

    const [result] = await resolver.resolve([{ title: "T", uri: REDIRECT_URI("a") }]);

    expect(result.uri).toBe(REDIRECT_URI("a"));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("the pool never exceeds maxConcurrent in flight, even across two concurrent resolve() calls", async () => {
    let active = 0;
    let peak = 0;
    const releasers: Array<() => void> = [];

    const fetchImpl: GroundingFetch = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => releasers.push(resolve));
      active -= 1;
      return { status: 302, headers: headersOf("https://real-publisher.test/page") };
    });

    const resolver = createGroundingResolver({ fetchImpl, maxConcurrent: 2 });

    // 5 distinct redirect-host sources, split across two concurrent
    // resolve() calls (simulating two concepts researched at once) - if the
    // pool were re-created per call, up to 4 (2 x maxConcurrent) could be in
    // flight at once instead of 2 TOTAL.
    const batchA = [REDIRECT_URI("1"), REDIRECT_URI("2"), REDIRECT_URI("3")].map((uri) => ({ title: "T", uri }));
    const batchB = [REDIRECT_URI("4"), REDIRECT_URI("5")].map((uri) => ({ title: "T", uri }));

    const resultsPromise = Promise.all([resolver.resolve(batchA), resolver.resolve(batchB)]);

    // Let every task that CAN start actually start before releasing any.
    await new Promise((r) => setTimeout(r, 20));
    expect(active).toBeLessThanOrEqual(2);
    expect(peak).toBeLessThanOrEqual(2);

    while (releasers.length > 0) {
      releasers.shift()!();
      await new Promise((r) => setTimeout(r, 5));
    }

    await resultsPromise;
    expect(peak).toBeLessThanOrEqual(2);
    // The bound must actually be REACHED, not merely never exceeded - a
    // limiter that (bug) serialized everything (active never above 1) would
    // still pass a bare `toBeLessThanOrEqual(2)`. Five sources across two
    // concurrent resolve() calls with maxConcurrent 2 guarantees the pool
    // fills to capacity.
    expect(peak).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  describe("circuit breaker", () => {
    it("stops fetching after 4 CONSECUTIVE non-3xx/failed fetches, passing every later source through unchanged with zero further fetches", async () => {
      // Sequential (maxConcurrent: 1) so "consecutive" is unambiguous: source
      // 0-3 each get a fast 429 (non-3xx), tripping the breaker; sources 4-9
      // must then see NO fetch attempt at all - a fast failure storm must
      // never turn into one fetch per source.
      const fetchImpl = fixedFetch(429, null);
      const resolver = createGroundingResolver({ fetchImpl, maxConcurrent: 1 });

      const sources = Array.from({ length: 10 }, (_, i) => ({ title: "T", uri: REDIRECT_URI(String(i)) }));
      const results = await resolver.resolve(sources);

      expect(results.every((r, i) => r.uri === sources[i].uri)).toBe(true);
      expect(fetchImpl).toHaveBeenCalledTimes(4);
    });

    it("a single successful (3xx) response resets the consecutive-failure counter", async () => {
      let call = 0;
      const fetchImpl = vi.fn(async () => {
        call += 1;
        // Fail, fail, fail, SUCCEED, fail, fail, fail - never 4 in a row, so
        // the breaker must never trip: every one of the 7 fetches happens.
        const succeeds = call === 4;
        return succeeds
          ? { status: 302, headers: headersOf("https://real-publisher.test/page") }
          : { status: 500, headers: headersOf(null) };
      });
      const resolver = createGroundingResolver({ fetchImpl, maxConcurrent: 1 });

      const sources = Array.from({ length: 7 }, (_, i) => ({ title: "T", uri: REDIRECT_URI(String(i)) }));
      await resolver.resolve(sources);

      expect(fetchImpl).toHaveBeenCalledTimes(7);
    });

    it("a thrown fetch counts toward the consecutive-failure limit exactly like a non-3xx status", async () => {
      let call = 0;
      const fetchImpl: GroundingFetch = vi.fn(async () => {
        call += 1;
        if (call <= 2) throw new Error("network blip");
        return { status: 500, headers: headersOf(null) };
      });
      const resolver = createGroundingResolver({ fetchImpl, maxConcurrent: 1 });

      const sources = Array.from({ length: 10 }, (_, i) => ({ title: "T", uri: REDIRECT_URI(String(i)) }));
      await resolver.resolve(sources);

      // 2 thrown + 2 more non-3xx = 4 consecutive failures, then the breaker
      // trips - never a fetch for sources 4-9.
      expect(fetchImpl).toHaveBeenCalledTimes(4);
    });
  });
});
