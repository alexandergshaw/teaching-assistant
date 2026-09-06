import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Contract tests for E4's probe seam (docs/lms-credentials-acceptance-
 * criteria.md E4, E-REL2). `canvas-fetch.ts` and `lms-credential-probe-
 * outcome.ts` each carry their own full test suites already - these tests
 * only prove the SEAM between them: the URL this module builds, the timeout
 * and no-retry bound it applies, and the Buffer-to-text decode before
 * classification.
 */

vi.mock("./canvas-fetch", () => ({
  canvasFetch: vi.fn(),
}));

import { probeLmsCredential, LMS_CREDENTIAL_PROBE_TIMEOUT_MS } from "./lms-credential-probe";
import { canvasFetch } from "./canvas-fetch";

const canvasFetchMock = vi.mocked(canvasFetch);

const CREDENTIAL = { baseUrl: "https://canvas.example.edu", token: "1~abc123" };

beforeEach(() => {
  canvasFetchMock.mockReset();
});

describe("probeLmsCredential - the request it builds", () => {
  it("dials exactly /api/v1/users/self on the given base URL", async () => {
    canvasFetchMock.mockResolvedValueOnce({ ok: true, status: 200, headers: {}, body: Buffer.from("{}") });
    await probeLmsCredential(CREDENTIAL);
    expect(canvasFetchMock).toHaveBeenCalledWith(
      "https://canvas.example.edu/api/v1/users/self",
      expect.objectContaining({ timeoutMs: LMS_CREDENTIAL_PROBE_TIMEOUT_MS }),
      { token: "1~abc123" }
    );
  });

  it("uses the 10-second E-REL2 bound", () => {
    expect(LMS_CREDENTIAL_PROBE_TIMEOUT_MS).toBe(10_000);
  });

  it("calls canvasFetch exactly once per probe - no retry of its own", async () => {
    canvasFetchMock.mockResolvedValueOnce({ ok: false, kind: "unreachable" });
    await probeLmsCredential(CREDENTIAL);
    expect(canvasFetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("probeLmsCredential - classifying the response", () => {
  it("maps a valid Canvas self-record on 200 to verified", async () => {
    canvasFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {},
      body: Buffer.from(JSON.stringify({ id: 42, name: "Ada Lovelace" })),
    });
    const outcome = await probeLmsCredential(CREDENTIAL);
    expect(outcome).toEqual({ kind: "verified", canvasUserId: "42", canvasUserName: "Ada Lovelace" });
  });

  it("maps 401 to rejected", async () => {
    canvasFetchMock.mockResolvedValueOnce({ ok: true, status: 401, headers: {}, body: Buffer.from("") });
    expect(await probeLmsCredential(CREDENTIAL)).toEqual({ kind: "rejected" });
  });

  it("maps 403 to rejected", async () => {
    canvasFetchMock.mockResolvedValueOnce({ ok: true, status: 403, headers: {}, body: Buffer.from("") });
    expect(await probeLmsCredential(CREDENTIAL)).toEqual({ kind: "rejected" });
  });

  it("maps a 200 with an HTML body (a marketing site, E-UX3) to not-canvas", async () => {
    canvasFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {},
      body: Buffer.from("<html><body>Welcome</body></html>"),
    });
    expect(await probeLmsCredential(CREDENTIAL)).toEqual({ kind: "not-canvas" });
  });

  it("maps an unrelated 200 JSON shape to not-canvas", async () => {
    canvasFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: {},
      body: Buffer.from(JSON.stringify({ hello: "world" })),
    });
    expect(await probeLmsCredential(CREDENTIAL)).toEqual({ kind: "not-canvas" });
  });

  it("maps a 500 to not-canvas, never a hopeful guess", async () => {
    canvasFetchMock.mockResolvedValueOnce({ ok: true, status: 500, headers: {}, body: Buffer.from("") });
    expect(await probeLmsCredential(CREDENTIAL)).toEqual({ kind: "not-canvas" });
  });

  it("passes through canvasFetch's host-not-allowed refusal, reason verbatim", async () => {
    canvasFetchMock.mockResolvedValueOnce({
      ok: false,
      kind: "host-not-allowed",
      reason: "That host resolved to a private or reserved address and cannot be used.",
    });
    expect(await probeLmsCredential(CREDENTIAL)).toEqual({
      kind: "host-not-allowed",
      reason: "That host resolved to a private or reserved address and cannot be used.",
    });
  });

  it("passes through canvasFetch's unreachable outcome", async () => {
    canvasFetchMock.mockResolvedValueOnce({ ok: false, kind: "unreachable" });
    expect(await probeLmsCredential(CREDENTIAL)).toEqual({ kind: "unreachable" });
  });
});
