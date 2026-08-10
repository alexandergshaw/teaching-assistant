// Group B wiring: writeJson - the funnel EVERY Canvas write in the app goes
// through - now retries a throttled response, and honours a shared budget when
// its context carries one.
//
// The helper's own schedule is covered by canvas-throttle.test.ts. These tests
// exist because a correct helper proves nothing about whether writeJson
// actually calls it, and because the thing most likely to break a caller is
// not the retry but a changed error shape on the still-failing path.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeJson, type CourseContext } from "./fetch-helpers";
import { createThrottleBudget } from "../canvas-throttle";

global.fetch = vi.fn();
const mockFetch = fetch as ReturnType<typeof vi.fn>;

const CTX: CourseContext = {
  courseId: "123",
  institution: { code: "MCC", name: "Metropolitan Community College", host: "canvas.mccneb.edu" },
  token: "test-token",
  baseUrl: "https://canvas.mccneb.edu",
};

const URL_UNDER_TEST = "https://canvas.mccneb.edu/api/v1/courses/123/modules";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("writeJson retry", () => {
  it("issues exactly one request when the write succeeds", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 7 }));

    await expect(writeJson(URL_UNDER_TEST, "POST", CTX)).resolves.toEqual({ id: 7 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries a throttled write and returns the eventual success", async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 429)).mockResolvedValueOnce(jsonResponse({ id: 7 }));

    const pending = writeJson(URL_UNDER_TEST, "POST", CTX);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toEqual({ id: 7 });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a non-throttle failure - a 404 still fails on the first response", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 404));

    await expect(writeJson(URL_UNDER_TEST, "PUT", CTX)).rejects.toThrow(
      "Canvas could not find that resource. Check the URL and that the token's account can see it."
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a rejected fetch - a mid-flight failure may already have been applied", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(writeJson(URL_UNDER_TEST, "POST", CTX)).rejects.toThrow("fetch failed");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a 403 - a forbidden write fails at once, not after 3.5s of backoff", async () => {
    // writeJson passes isCanvasRateLimitStatus (429 only), unlike the
    // announcements callers' 429-or-403 default. A 403 here is far more often
    // a token that genuinely lacks access than a throttle, and the user is
    // waiting on this write. No fake timers are needed precisely because no
    // sleep should happen - if one did, this test would hang rather than pass.
    mockFetch.mockResolvedValue(jsonResponse({}, 403));

    await expect(writeJson(URL_UNDER_TEST, "POST", CTX)).rejects.toThrow(
      "Canvas rejected the request: the API token is missing, invalid, or lacks access to this course (MCC_CANVAS_API_TOKEN)."
    );
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws the SAME canvasError as before on a still-failing final 429", async () => {
    // The message is pinned verbatim because every writeJson caller's error
    // handling reads it (bulkUpdate/bulkDelete/setDueDates all surface
    // err.message into their per-item failure rows). Adding retry must not
    // change what the user finally sees.
    const budget = createThrottleBudget(0); // no sleeping, so no fake timers needed
    mockFetch.mockResolvedValue(jsonResponse({}, 429));

    await expect(writeJson(URL_UNDER_TEST, "POST", { ...CTX, throttleBudget: budget })).rejects.toThrow(
      "Canvas request failed (HTTP 429)."
    );
  });

  it("sends the form body and content-type on EVERY attempt, not just the first", async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 429)).mockResolvedValueOnce(jsonResponse({ id: 1 }));
    const params = new URLSearchParams({ "module[name]": "Module 01" });

    const pending = writeJson(URL_UNDER_TEST, "POST", CTX, params);
    await vi.advanceTimersByTimeAsync(1000);
    await pending;

    expect(mockFetch).toHaveBeenCalledTimes(2);
    for (const call of mockFetch.mock.calls) {
      const init = call[1] as RequestInit;
      expect(init.body).toBe("module%5Bname%5D=Module+01");
      expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/x-www-form-urlencoded");
    }
  });
});

describe("writeJson with a shared budget", () => {
  it("an exhausted budget makes the write fail at its first response, with no waiting", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 429));

    await expect(
      writeJson(URL_UNDER_TEST, "POST", { ...CTX, throttleBudget: createThrottleBudget(0) })
    ).rejects.toThrow("Canvas request failed (HTTP 429).");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("a bulk loop sharing ONE budget stops retrying once it is spent, but still attempts every item", async () => {
    // 429, not 403: under the 429-only predicate a sustained real throttle is
    // now the scenario the shared budget exists to bound.
    vi.useFakeTimers();
    mockFetch.mockResolvedValue(jsonResponse({}, 429));
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
    expect(mockFetch).toHaveBeenCalledTimes(13);
  });

  it("without a budget, each write retries independently - the single-write default is unchanged", async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValue(jsonResponse({}, 429));

    const loop = (async () => {
      for (let i = 0; i < 3; i += 1) {
        await writeJson(URL_UNDER_TEST, "PUT", CTX).catch(() => undefined);
      }
    })();
    await vi.advanceTimersByTimeAsync(60_000);
    await loop;

    expect(mockFetch).toHaveBeenCalledTimes(12);
  });
});
