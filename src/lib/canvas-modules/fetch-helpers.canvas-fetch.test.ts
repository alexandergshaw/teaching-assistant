// Group E wave 4b pilot: fetch-helpers.ts now dials Canvas through
// canvasFetch (src/lib/canvas-fetch.ts) instead of the bare platform `fetch`.
// canvasFetch is mocked here at the MODULE boundary - not the socket - per
// this file's own doc comment on why: this suite's job is to prove
// fetch-helpers.ts's ADAPTER (result -> Response, result -> thrown Error) is
// correct, not to re-verify canvasFetch's own DNS/redirect/SSRF behavior,
// which canvas-fetch.test.ts already owns in full.
//
// Covers: a successful read; a host-not-allowed result; an unreachable
// result; a paginated read that still honours the same-origin guard and the
// page cap; and that a 429 still goes through the existing throttle path.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../canvas-fetch", () => ({ canvasFetch: vi.fn() }));

import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";
import { fetchAll, safeFetchAll, fetchJson, writeJson, type CourseContext } from "./fetch-helpers";
import { CANVAS_PAGINATION_PAGE_CAP } from "../canvas-remote-url";

const mockCanvasFetch = vi.mocked(canvasFetch);

const CTX: CourseContext = {
  courseId: "123",
  institution: { code: "MCC", name: "Metropolitan Community College", host: "canvas.mccneb.edu" },
  token: "test-token",
  baseUrl: "https://canvas.mccneb.edu",
};

const URL_UNDER_TEST = "https://canvas.mccneb.edu/api/v1/courses/123/modules";

/** Builds an `ok: true` CanvasFetchResult from a JS value, JSON-encoded. */
function okResult(body: unknown, status = 200, headers: Record<string, string> = {}): CanvasFetchResult {
  return { ok: true, status, headers, body: Buffer.from(JSON.stringify(body)) };
}

const HOST_NOT_ALLOWED: CanvasFetchResult = {
  ok: false,
  kind: "host-not-allowed",
  reason: "That host resolved to a private or reserved address and cannot be used.",
};

const UNREACHABLE: CanvasFetchResult = { ok: false, kind: "unreachable" };

beforeEach(() => {
  mockCanvasFetch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchJson - the canvasFetch result-to-Response/throw adapter", () => {
  it("returns the parsed body on a successful read", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ id: 7, name: "Module 1" }));

    await expect(fetchJson(URL_UNDER_TEST, CTX)).resolves.toEqual({ id: 7, name: "Module 1" });
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    // The credential is passed to canvasFetch itself, never as a caller-built
    // Authorization header - canvasFetch owns attaching the bearer.
    expect(mockCanvasFetch).toHaveBeenCalledWith(URL_UNDER_TEST, {}, { token: "test-token" });
  });

  it("maps a host-not-allowed result to null, the same as fetchJson's existing catch-all", async () => {
    mockCanvasFetch.mockResolvedValueOnce(HOST_NOT_ALLOWED);

    await expect(fetchJson(URL_UNDER_TEST, CTX)).resolves.toBeNull();
  });

  it("maps an unreachable result to null, the same as fetchJson's existing catch-all", async () => {
    mockCanvasFetch.mockResolvedValueOnce(UNREACHABLE);

    await expect(fetchJson(URL_UNDER_TEST, CTX)).resolves.toBeNull();
  });

  it("returns null for a completed exchange with a non-ok status, unchanged from before", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ error: "nope" }, 404));

    await expect(fetchJson(URL_UNDER_TEST, CTX)).resolves.toBeNull();
  });
});

describe("writeJson - the same adapter, on the write path", () => {
  it("resolves with the parsed body on a successful write", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ id: 7 }));

    await expect(writeJson(URL_UNDER_TEST, "POST", CTX)).resolves.toEqual({ id: 7 });
  });

  it("throws a safe, canvasFetch-composed message for host-not-allowed - never a raw provider string", async () => {
    mockCanvasFetch.mockResolvedValueOnce(HOST_NOT_ALLOWED);

    await expect(writeJson(URL_UNDER_TEST, "POST", CTX)).rejects.toThrow(
      "Canvas request refused: That host resolved to a private or reserved address and cannot be used."
    );
  });

  it("throws a fixed literal for unreachable - nothing derived from the underlying network failure to leak", async () => {
    mockCanvasFetch.mockResolvedValueOnce(UNREACHABLE);

    await expect(writeJson(URL_UNDER_TEST, "POST", CTX)).rejects.toThrow("Canvas did not respond.");
    // Exactly one call: an unreachable/host-not-allowed outcome throws out of
    // `attempt()` before fetchWithThrottleRetry's retryOn(status) ever runs,
    // so neither is ever retried - the same "propagate once" behavior a
    // rejected fetch() had before this migration.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("still retries a 429 through the existing throttle path and returns the eventual success", async () => {
    vi.useFakeTimers();
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 429)).mockResolvedValueOnce(okResult({ id: 7 }, 200));

    const pending = writeJson(URL_UNDER_TEST, "POST", CTX);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(pending).resolves.toEqual({ id: 7 });
    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
  });

  it("still fails at once on a still-failing final 429, with the same canvasError message as before", async () => {
    mockCanvasFetch.mockResolvedValue(okResult({}, 429));

    const { createThrottleBudget } = await import("../canvas-throttle");
    await expect(
      writeJson(URL_UNDER_TEST, "POST", { ...CTX, throttleBudget: createThrottleBudget(0) })
    ).rejects.toThrow("Canvas request failed (HTTP 429).");
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("passes the form body and content-type to canvasFetch on every attempt, never an Authorization header", async () => {
    vi.useFakeTimers();
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 429)).mockResolvedValueOnce(okResult({ id: 1 }));
    const params = new URLSearchParams({ "module[name]": "Module 01" });

    const pending = writeJson(URL_UNDER_TEST, "POST", CTX, params);
    await vi.advanceTimersByTimeAsync(1000);
    await pending;

    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
    for (const call of mockCanvasFetch.mock.calls) {
      const [url, init, credential] = call;
      expect(url).toBe(URL_UNDER_TEST);
      expect(init.method).toBe("POST");
      expect(init.body).toBe("module%5Bname%5D=Module+01");
      expect(init.headers).toEqual({ "Content-Type": "application/x-www-form-urlencoded" });
      expect(Object.keys(init.headers ?? {})).not.toContain("Authorization");
      expect(credential).toEqual({ token: "test-token" });
    }
  });
});

describe("fetchAll pagination - the same-origin guard and page cap survive the migration", () => {
  it("follows a same-origin Link header across pages and dials the GUARD'S resolved string, not the raw header", async () => {
    // A relative Link header - assertCanvasSuppliedUrlIsSameOrigin resolves it
    // against ctx.baseUrl before anything is dialled, and that resolved
    // absolute string is what must reach canvasFetch, never the raw relative
    // candidate.
    const rawNext = "/api/v1/courses/123/modules?page=2";
    const resolvedNext = "https://canvas.mccneb.edu/api/v1/courses/123/modules?page=2";

    mockCanvasFetch
      .mockResolvedValueOnce(okResult([{ id: 1 }], 200, { link: `<${rawNext}>; rel="next"` }))
      .mockResolvedValueOnce(okResult([{ id: 2 }], 200, {}));

    const result = await fetchAll<{ id: number }>(URL_UNDER_TEST, CTX);

    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
    expect(mockCanvasFetch.mock.calls[0][0]).toBe(URL_UNDER_TEST);
    expect(mockCanvasFetch.mock.calls[1][0]).toBe(resolvedNext);
  });

  it("refuses a cross-origin Link header instead of ever dialling it", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([{ id: 1 }], 200, { link: '<https://evil.example.com/api/v1/x>; rel="next"' })
    );

    await expect(fetchAll(URL_UNDER_TEST, CTX)).rejects.toThrow(/different origin/);
    // The guard refuses before a second dial ever happens.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("caps pagination at CANVAS_PAGINATION_PAGE_CAP pages even if the remote host keeps paginating forever", async () => {
    mockCanvasFetch.mockImplementation(async () =>
      okResult([{ id: 1 }], 200, { link: `<${URL_UNDER_TEST}>; rel="next"` })
    );

    await expect(fetchAll(URL_UNDER_TEST, CTX)).rejects.toThrow(
      `Canvas pagination exceeded ${CANVAS_PAGINATION_PAGE_CAP} pages`
    );
    expect(mockCanvasFetch).toHaveBeenCalledTimes(CANVAS_PAGINATION_PAGE_CAP);
  });

  it("safeFetchAll swallows an unreachable page instead of throwing, same as before the migration", async () => {
    mockCanvasFetch.mockResolvedValueOnce(UNREACHABLE);

    await expect(safeFetchAll(URL_UNDER_TEST, CTX)).resolves.toEqual([]);
  });
});
