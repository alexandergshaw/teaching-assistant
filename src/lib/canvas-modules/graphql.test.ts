// TDD suite for the minimal Canvas GraphQL client
// (docs/intro-discussion-from-modules-acceptance-criteria.md AC11b).
//
// The load-bearing behaviour under test: a top-level GraphQL `errors` array
// must survive as DATA on the returned result, never collapsed into a thrown
// Error string - graded-discussion.ts's availability detection (AC14g)
// branches on the exact error message, and a caller forced to re-parse a
// joined error string cannot do that reliably.
import { describe, it, expect, vi, afterEach } from "vitest";
import { canvasGraphql } from "./graphql";

const CTX = {
  baseUrl: "https://canvas.mccneb.edu",
  token: "test-token",
  institution: { code: "MCC", name: "Metropolitan Community College", host: "canvas.mccneb.edu" },
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("canvasGraphql: request shape", () => {
  it("POSTs to <baseUrl>/api/graphql with the bearer token and a JSON query/variables body", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse(200, { data: { ok: true } }));
    vi.stubGlobal("fetch", fetchMock);

    await canvasGraphql(CTX, "query Foo { foo }", { a: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    if (!init) throw new Error("fetch was called with no init.");
    expect(url).toBe("https://canvas.mccneb.edu/api/graphql");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ query: "query Foo { foo }", variables: { a: 1 } });
  });
});

describe("canvasGraphql: top-level errors survive as data (AC11b/AC14g)", () => {
  it("returns a top-level errors array to the caller instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, { errors: [{ message: "discussion_checkpoints feature flag must be enabled" }] })
      )
    );

    // Sabotage check: if this ever throws instead of returning, the test
    // itself fails here (an unhandled rejection), proving the assertion
    // below is actually exercising the "return, don't throw" behaviour.
    const result = await canvasGraphql(CTX, "mutation M { m }", {});

    expect(result.errors).toEqual([{ message: "discussion_checkpoints feature flag must be enabled" }]);
    expect(result.data).toBeNull();
  });

  it("returns data alongside an empty errors array on a clean success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { data: { foo: "bar" } })));

    const result = await canvasGraphql<{ foo: string }>(CTX, "query Q { foo }", {});

    expect(result.data).toEqual({ foo: "bar" });
    expect(result.errors).toEqual([]);
  });
});

describe("canvasGraphql: transport failure", () => {
  it("throws on a non-2xx HTTP response (a real transport failure, not a GraphQL-protocol error)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401, { error: "unauthorized" })));

    await expect(canvasGraphql(CTX, "query Q { foo }", {})).rejects.toThrow();
  });
});

describe("canvasGraphql: throttle retry (M4 - routed through fetchWithThrottleRetry like every other Canvas write)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries a 429 and returns the eventual success, matching writeJson's convention", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, {}))
      .mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = canvasGraphql(CTX, "mutation M { m }", {});
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toEqual({ data: { ok: true }, errors: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a 403 - isCanvasRateLimitStatus is 429-only, same predicate writeJson uses", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(403, { error: "forbidden" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(canvasGraphql(CTX, "query Q { foo }", {})).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
