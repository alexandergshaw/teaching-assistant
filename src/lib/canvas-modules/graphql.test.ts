// TDD suite for the minimal Canvas GraphQL client
// (docs/intro-discussion-from-modules-acceptance-criteria.md AC11b).
//
// The load-bearing behaviour under test: a top-level GraphQL `errors` array
// must survive as DATA on the returned result, never collapsed into a thrown
// Error string - graded-discussion.ts's availability detection (AC14g)
// branches on the exact error message, and a caller forced to re-parse a
// joined error string cannot do that reliably.
//
// canvasGraphql now dials <baseUrl>/api/graphql through canvasRequest
// (src/lib/canvas-fetch-response.ts), which itself goes through canvasFetch
// (src/lib/canvas-fetch.ts, real DNS resolution + connection pinning)
// instead of the platform fetch - stubbing globalThis.fetch (this file's
// previous approach) no longer intercepts anything canvasGraphql does.
// Mocked at the canvasFetch module boundary, same as
// fetch-helpers.canvas-fetch.test.ts, so canvasRequest's own
// result-to-Response/throw mapping still runs for real - only the actual
// network dial is faked.
vi.mock("../canvas-fetch", () => ({ canvasFetch: vi.fn() }));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { canvasGraphql } from "./graphql";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";

const mockCanvasFetch = vi.mocked(canvasFetch);

const CTX = {
  baseUrl: "https://canvas.mccneb.edu",
  token: "test-token",
  institution: { code: "MCC", name: "Metropolitan Community College", host: "canvas.mccneb.edu" },
};

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body - the shape
 * canvasRequest's underlying canvasFetch returns for a completed exchange. */
function okResult(body: unknown, status = 200): CanvasFetchResult {
  return { ok: true, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}

beforeEach(() => {
  mockCanvasFetch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("canvasGraphql: request shape", () => {
  it("POSTs to <baseUrl>/api/graphql with the bearer token (via canvasFetch's credential, not a caller header) and a JSON query/variables body", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ data: { ok: true } }));

    await canvasGraphql(CTX, "query Foo { foo }", { a: 1 });

    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url, init, credential] = mockCanvasFetch.mock.calls[0];
    expect(url).toBe("https://canvas.mccneb.edu/api/graphql");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    // The credential is passed to canvasFetch itself, never as a
    // caller-built Authorization header - canvasFetch owns attaching the
    // bearer, and drops a caller-supplied Authorization rather than trusting
    // two sources of truth to agree.
    expect(Object.keys(init.headers ?? {})).not.toContain("Authorization");
    expect(credential).toEqual({ token: "test-token" });
    expect(JSON.parse(init.body as string)).toEqual({ query: "query Foo { foo }", variables: { a: 1 } });
  });
});

describe("canvasGraphql: top-level errors survive as data (AC11b/AC14g)", () => {
  it("returns a top-level errors array to the caller instead of throwing", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult({ errors: [{ message: "discussion_checkpoints feature flag must be enabled" }] })
    );

    // Sabotage check: if this ever throws instead of returning, the test
    // itself fails here (an unhandled rejection), proving the assertion
    // below is actually exercising the "return, don't throw" behaviour.
    const result = await canvasGraphql(CTX, "mutation M { m }", {});

    expect(result.errors).toEqual([{ message: "discussion_checkpoints feature flag must be enabled" }]);
    expect(result.data).toBeNull();
  });

  it("returns data alongside an empty errors array on a clean success", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ data: { foo: "bar" } }));

    const result = await canvasGraphql<{ foo: string }>(CTX, "query Q { foo }", {});

    expect(result.data).toEqual({ foo: "bar" });
    expect(result.errors).toEqual([]);
  });
});

describe("canvasGraphql: transport failure", () => {
  it("throws on a non-2xx HTTP response (a real transport failure, not a GraphQL-protocol error)", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ error: "unauthorized" }, 401));

    await expect(canvasGraphql(CTX, "query Q { foo }", {})).rejects.toThrow();
  });

  it("throws a fixed literal - never anything derived from the underlying failure - when Canvas is unreachable", async () => {
    mockCanvasFetch.mockResolvedValueOnce({ ok: false, kind: "unreachable" });

    await expect(canvasGraphql(CTX, "query Q { foo }", {})).rejects.toThrow("Canvas did not respond.");
  });

  it("throws canvasFetch's own composed reason - never a raw provider string - when the host is not allowed", async () => {
    mockCanvasFetch.mockResolvedValueOnce({
      ok: false,
      kind: "host-not-allowed",
      reason: "That host resolved to a private or reserved address and cannot be used.",
    });

    await expect(canvasGraphql(CTX, "query Q { foo }", {})).rejects.toThrow(
      "Canvas request refused: That host resolved to a private or reserved address and cannot be used."
    );
  });
});

describe("canvasGraphql: throttle retry (M4 - routed through fetchWithThrottleRetry like every other Canvas write)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries a 429 and returns the eventual success, matching writeJson's convention", async () => {
    vi.useFakeTimers();
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 429)).mockResolvedValueOnce(okResult({ data: { ok: true } }));

    const pending = canvasGraphql(CTX, "mutation M { m }", {});
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toEqual({ data: { ok: true }, errors: [] });
    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a 403 - isCanvasRateLimitStatus is 429-only, same predicate writeJson uses", async () => {
    mockCanvasFetch.mockResolvedValue(okResult({ error: "forbidden" }, 403));

    await expect(canvasGraphql(CTX, "query Q { foo }", {})).rejects.toThrow();
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });
});
