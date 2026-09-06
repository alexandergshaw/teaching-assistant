// Group B wiring: writeJson - the funnel EVERY Canvas write in the app goes
// through - now retries a throttled response, and honours a shared budget when
// its context carries one.
//
// The helper's own schedule is covered by canvas-throttle.test.ts. These tests
// exist because a correct helper proves nothing about whether writeJson
// actually calls it, and because the thing most likely to break a caller is
// not the retry but a changed error shape on the still-failing path.
//
// Group E wave 4b pilot: writeJson now dials Canvas through canvasFetch
// (src/lib/canvas-fetch.ts) instead of the bare platform `fetch`, so this
// file mocks canvasFetch at the module boundary instead of `global.fetch`.
// canvasFetch never REJECTS - a network-layer failure comes back as the value
// `{ ok: false, kind: "unreachable" }` - so the old "rejected fetch" test
// below is expressed as canvasFetch resolving with that value instead.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../canvas-fetch", () => ({ canvasFetch: vi.fn() }));

import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";
import { writeJson, type CourseContext } from "./fetch-helpers";
import { createThrottleBudget } from "../canvas-throttle";

const mockCanvasFetch = vi.mocked(canvasFetch);

const CTX: CourseContext = {
  courseId: "123",
  institution: { code: "MCC", name: "Metropolitan Community College", host: "canvas.mccneb.edu" },
  token: "test-token",
  baseUrl: "https://canvas.mccneb.edu",
};

const URL_UNDER_TEST = "https://canvas.mccneb.edu/api/v1/courses/123/modules";

function okResult(body: unknown, status = 200): CanvasFetchResult {
  return { ok: true, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}

const UNREACHABLE: CanvasFetchResult = { ok: false, kind: "unreachable" };

beforeEach(() => {
  mockCanvasFetch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("writeJson retry", () => {
  it("issues exactly one request when the write succeeds", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ id: 7 }));

    await expect(writeJson(URL_UNDER_TEST, "POST", CTX)).resolves.toEqual({ id: 7 });
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("retries a throttled write and returns the eventual success", async () => {
    vi.useFakeTimers();
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 429)).mockResolvedValueOnce(okResult({ id: 7 }));

    const pending = writeJson(URL_UNDER_TEST, "POST", CTX);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toEqual({ id: 7 });
    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a non-throttle failure - a 404 still fails on the first response", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 404));

    await expect(writeJson(URL_UNDER_TEST, "PUT", CTX)).rejects.toThrow(
      "Canvas could not find that resource. Check the URL and that the token's account can see it."
    );
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry an unreachable host - a mid-flight failure may already have been applied", async () => {
    mockCanvasFetch.mockResolvedValueOnce(UNREACHABLE);

    await expect(writeJson(URL_UNDER_TEST, "POST", CTX)).rejects.toThrow("Canvas did not respond.");
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a 403 - a forbidden write fails at once, not after 3.5s of backoff", async () => {
    // writeJson passes isCanvasRateLimitStatus (429 only), unlike the
    // announcements callers' 429-or-403 default. A 403 here is far more often
    // a token that genuinely lacks access than a throttle, and the user is
    // waiting on this write. No fake timers are needed precisely because no
    // sleep should happen - if one did, this test would hang rather than pass.
    mockCanvasFetch.mockResolvedValue(okResult({}, 403));

    await expect(writeJson(URL_UNDER_TEST, "POST", CTX)).rejects.toThrow(
      "Canvas rejected the request: the API token is missing, invalid, or lacks access to this course (MCC_CANVAS_API_TOKEN)."
    );
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("throws the SAME canvasError as before on a still-failing final 429", async () => {
    // The message is pinned verbatim because every writeJson caller's error
    // handling reads it (bulkUpdate/bulkDelete/setDueDates all surface
    // err.message into their per-item failure rows). Adding retry must not
    // change what the user finally sees.
    const budget = createThrottleBudget(0); // no sleeping, so no fake timers needed
    mockCanvasFetch.mockResolvedValue(okResult({}, 429));

    await expect(writeJson(URL_UNDER_TEST, "POST", { ...CTX, throttleBudget: budget })).rejects.toThrow(
      "Canvas request failed (HTTP 429)."
    );
  });

  it("sends the form body and content-type on EVERY attempt, not just the first", async () => {
    vi.useFakeTimers();
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 429)).mockResolvedValueOnce(okResult({ id: 1 }));
    const params = new URLSearchParams({ "module[name]": "Module 01" });

    const pending = writeJson(URL_UNDER_TEST, "POST", CTX, params);
    await vi.advanceTimersByTimeAsync(1000);
    await pending;

    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
    for (const call of mockCanvasFetch.mock.calls) {
      const [, init] = call;
      expect(init.body).toBe("module%5Bname%5D=Module+01");
      expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded");
    }
  });
});

describe("writeJson with a shared budget", () => {
  it("an exhausted budget makes the write fail at its first response, with no waiting", async () => {
    mockCanvasFetch.mockResolvedValue(okResult({}, 429));

    await expect(
      writeJson(URL_UNDER_TEST, "POST", { ...CTX, throttleBudget: createThrottleBudget(0) })
    ).rejects.toThrow("Canvas request failed (HTTP 429).");
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("a bulk loop sharing ONE budget stops retrying once it is spent, but still attempts every item", async () => {
    // 429, not 403: under the 429-only predicate a sustained real throttle is
    // now the scenario the shared budget exists to bound.
    vi.useFakeTimers();
    mockCanvasFetch.mockResolvedValue(okResult({}, 429));
    const budget = createThrottleBudget(3500);
    const ctx = { ...CTX, throttleBudget: budget };

    // Mirrors bulkUpdate's shape: ctx built once, N writes, per-item failures
    // collected rather than aborting the loop.
    const failures: string[] = [];
    const loop = (async () => {
      for (let i = 0; i < 10; i += 1) {
        try {
          await writeJson(URL_UNDER_TEST, "PUT", ctx);
        } catch (err) {
          failures.push(err instanceof Error ? err.message : "unknown");
        }
      }
    })();
    await vi.advanceTimersByTimeAsync(60_000);
    await loop;

    expect(budget.remainingMs).toBe(0);
    expect(failures).toHaveLength(10);
    // Item 1 burned the whole allowance across 4 attempts; items 2-10 each
    // took exactly one. Without the shared budget this would be 10 x 4 = 40.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(13);
  });

  it("without a budget, each write retries independently - the single-write default is unchanged", async () => {
    vi.useFakeTimers();
    mockCanvasFetch.mockResolvedValue(okResult({}, 429));

    const loop = (async () => {
      for (let i = 0; i < 3; i += 1) {
        await writeJson(URL_UNDER_TEST, "PUT", CTX).catch(() => undefined);
      }
    })();
    await vi.advanceTimersByTimeAsync(60_000);
    await loop;

    expect(mockCanvasFetch).toHaveBeenCalledTimes(12);
  });
});
