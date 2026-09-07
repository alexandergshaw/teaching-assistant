// Tests for the canvasFetch(...) -> Response/throw adapter
// (canvasGet/canvasRequest/canvasFetchResultToResponse), extracted from
// src/lib/canvas-modules/fetch-helpers.ts (Group E wave 4b) so every Canvas
// module migrating onto canvasFetch shares one mapping. canvasFetch itself is
// mocked at the module boundary - not the socket - because this suite's job
// is to prove the ADAPTER (result -> Response, result -> thrown Error) is
// correct, not to re-verify canvasFetch's own DNS/redirect/SSRF behavior,
// which canvas-fetch.test.ts already owns in full. This mirrors
// fetch-helpers.canvas-fetch.test.ts's own stated boundary rationale for the
// same reason.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./canvas-fetch", () => ({ canvasFetch: vi.fn() }));

import { canvasFetch, type CanvasFetchResult } from "./canvas-fetch";
import { canvasFetchResultToResponse, canvasGet, canvasRequest } from "./canvas-fetch-response";

const mockCanvasFetch = vi.mocked(canvasFetch);

const URL_UNDER_TEST = "https://canvas.mccneb.edu/api/v1/courses/123/modules";

beforeEach(() => {
  mockCanvasFetch.mockReset();
});

describe("canvasFetchResultToResponse", () => {
  it("maps a completed exchange to a real Response, preserving status, headers, and a readable JSON body", async () => {
    const result: CanvasFetchResult = {
      ok: true,
      status: 200,
      headers: { link: '<https://canvas.mccneb.edu/x?page=2>; rel="next"' },
      body: Buffer.from(JSON.stringify([{ id: 1 }])),
    };

    const response = canvasFetchResultToResponse(result);

    expect(response).toBeInstanceOf(Response);
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(response.headers.get("link")).toBe('<https://canvas.mccneb.edu/x?page=2>; rel="next"');
    await expect(response.json()).resolves.toEqual([{ id: 1 }]);
  });

  it("maps ANY completed exchange status - including a non-2xx one - to ok:true's Response, never collapsing it to a boolean itself", () => {
    const result: CanvasFetchResult = { ok: true, status: 404, headers: {}, body: Buffer.from("{}") };

    const response = canvasFetchResultToResponse(result);

    expect(response.ok).toBe(false); // Response's own .ok, derived from status - not this adapter deciding success/failure
    expect(response.status).toBe(404);
  });

  it("nulls the body for a status the Fetch spec forbids from carrying one (204), rather than letting the Response constructor throw", () => {
    const result: CanvasFetchResult = { ok: true, status: 204, headers: {}, body: Buffer.alloc(0) };

    const response = canvasFetchResultToResponse(result);

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  it("appends a repeated header rather than overwriting it, matching a real multi-value response header", () => {
    const result: CanvasFetchResult = {
      ok: true,
      status: 200,
      headers: { "x-test": ["a", "b"] },
      body: Buffer.from("{}"),
    };

    const response = canvasFetchResultToResponse(result);

    // Headers.get() joins repeated values with ", " per the Fetch spec - a
    // single "b" here would mean the second value overwrote the first.
    expect(response.headers.get("x-test")).toBe("a, b");
  });

  it("throws a canvasFetch-composed message for host-not-allowed, never retried and never a raw provider string", () => {
    const result: CanvasFetchResult = {
      ok: false,
      kind: "host-not-allowed",
      reason: "That host resolved to a private or reserved address and cannot be used.",
    };

    expect(() => canvasFetchResultToResponse(result)).toThrow(
      "Canvas request refused: That host resolved to a private or reserved address and cannot be used."
    );
  });

  it("throws a fixed literal for unreachable - nothing derived from the underlying network failure to leak", () => {
    const result: CanvasFetchResult = { ok: false, kind: "unreachable" };

    expect(() => canvasFetchResultToResponse(result)).toThrow("Canvas did not respond.");
  });
});

describe("canvasRequest / canvasGet", () => {
  it("canvasRequest calls canvasFetch with the credential wrapped from the plain token, never a caller-built Authorization header", async () => {
    mockCanvasFetch.mockResolvedValueOnce({ ok: true, status: 200, headers: {}, body: Buffer.from("{}") });

    await canvasRequest(URL_UNDER_TEST, { method: "POST", body: "a=1" }, "test-token");

    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url, init, credential] = mockCanvasFetch.mock.calls[0];
    expect(url).toBe(URL_UNDER_TEST);
    expect(init).toEqual({ method: "POST", body: "a=1" });
    expect(credential).toEqual({ token: "test-token" });
  });

  it("canvasGet is canvasRequest with no method/headers/body - the common bearer-carrying GET", async () => {
    mockCanvasFetch.mockResolvedValueOnce({ ok: true, status: 200, headers: {}, body: Buffer.from('{"id":1}') });

    const response = await canvasGet(URL_UNDER_TEST, "test-token");

    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    expect(mockCanvasFetch).toHaveBeenCalledWith(URL_UNDER_TEST, {}, { token: "test-token" });
    await expect(response.json()).resolves.toEqual({ id: 1 });
  });

  it("propagates a host-not-allowed or unreachable outcome as a throw, exactly once - never retried inside the adapter itself", async () => {
    mockCanvasFetch.mockResolvedValueOnce({ ok: false, kind: "unreachable" });

    await expect(canvasGet(URL_UNDER_TEST, "test-token")).rejects.toThrow("Canvas did not respond.");
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });
});
