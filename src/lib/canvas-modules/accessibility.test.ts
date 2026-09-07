// TDD suite for the transport migration of getLinkValidation and
// startLinkValidation - the only two call sites in accessibility.ts that
// used to dial the platform `fetch` directly with a hand-built Authorization
// header. Every other export in this file already reads through
// fetch-helpers.ts (safeFetchAll/writeJson/fetchJson/mapWithConcurrency),
// which is unaffected by this change and already covered by
// fetch-helpers.canvas-fetch.test.ts.
//
// Both now dial Canvas through canvasGet/canvasRequest
// (src/lib/canvas-fetch-response.ts), which themselves go through
// canvasFetch (src/lib/canvas-fetch.ts, real DNS resolution + connection
// pinning). Mocked at the canvasFetch module boundary, same as
// fetch-helpers.canvas-fetch.test.ts, so canvasGet/canvasRequest's own
// result-to-Response/throw mapping still runs for real - only the actual
// network dial is faked.
//
// resolveCourse (via resolveInstitutionByCode) now delegates credential
// resolution to canvas-credentials.ts, which resolves the calling identity
// server-side before ever reading an env var (E-ARCH4). Mocking the identity
// to role: "owner" (E-ARCH6's uniform convention across every one of this
// repo's Canvas test files) keeps the env-var branch this suite's
// vi.stubEnv calls rely on reachable, without a real Supabase call - the
// stored-credential branch is mocked to "no row" (null) so it falls through
// to that owner env branch instead of attempting a real DB read.
vi.mock("../supabase/effective-identity", () => ({
  getEffectiveIdentity: vi.fn().mockResolvedValue({
    id: "owner-1",
    email: "owner@example.edu",
    role: "owner",
    status: "active",
  }),
}));
vi.mock("../lms-credentials", () => ({
  getLmsCredentialSecret: vi.fn().mockResolvedValue(null),
  recordLmsCredentialFailure: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../canvas-fetch", () => ({ canvasFetch: vi.fn() }));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getLinkValidation, startLinkValidation } from "./accessibility";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";

const mockCanvasFetch = vi.mocked(canvasFetch);

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";
const ENDPOINT = "https://canvas.mccneb.edu/api/v1/courses/123/link_validation";

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body - the shape
 * canvasGet/canvasRequest's underlying canvasFetch returns for a completed
 * exchange. */
function okResult(body: unknown, status = 200): CanvasFetchResult {
  return { ok: true, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}

const UNREACHABLE: CanvasFetchResult = { ok: false, kind: "unreachable" };

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
  mockCanvasFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getLinkValidation - migrated to canvasGet (the shared adapter), never platform fetch", () => {
  it("GETs the link_validation endpoint with the resolved bearer credential, not a caller-built header", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ workflow_state: "completed", results: { issues: [] } }));

    await getLinkValidation(COURSE_URL, "MCC");

    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url, init, credential] = mockCanvasFetch.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(Object.keys(init.headers ?? {})).not.toContain("Authorization");
    expect(credential).toEqual({ token: "test-token" });
  });

  it("maps workflow_state and flattens invalid_links across every issue entry", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult({
        workflow_state: "completed",
        results: {
          issues: [
            {
              type: "assignment",
              name: "Essay 1",
              content_url: "https://canvas.mccneb.edu/courses/123/assignments/42",
              invalid_links: [{ url: "https://dead.example.com", reason: "unresponsive_link", link_text: "here" }],
            },
          ],
        },
      })
    );

    const result = await getLinkValidation(COURSE_URL, "MCC");

    expect(result.state).toBe("completed");
    expect(result.links).toEqual([
      {
        itemType: "assignment",
        itemId: "42",
        itemTitle: "Essay 1",
        url: "https://dead.example.com",
        reason: "unresponsive_link",
        linkText: "here",
      },
    ]);
  });

  it("returns state 'none' and no links on a non-ok status, unchanged from before the migration", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 404));

    const result = await getLinkValidation(COURSE_URL, "MCC");

    expect(result).toEqual({ state: "none", links: [] });
  });

  it("propagates a thrown error when Canvas is unreachable, exactly as a rejected fetch always did", async () => {
    mockCanvasFetch.mockResolvedValueOnce(UNREACHABLE);

    await expect(getLinkValidation(COURSE_URL, "MCC")).rejects.toThrow("Canvas did not respond.");
  });
});

describe("startLinkValidation - migrated to canvasRequest (the shared adapter), never platform fetch", () => {
  it("POSTs the link_validation endpoint with no body, via the resolved credential", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}));

    await startLinkValidation(COURSE_URL, "MCC");

    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url, init, credential] = mockCanvasFetch.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init.method).toBe("POST");
    expect(Object.keys(init.headers ?? {})).not.toContain("Authorization");
    expect(credential).toEqual({ token: "test-token" });
  });

  it("throws canvasError's mapped message on a non-ok status, unchanged from before the migration", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 401));

    await expect(startLinkValidation(COURSE_URL, "MCC")).rejects.toThrow(
      "Canvas rejected the request: the API token is missing, invalid, or lacks access to this course (MCC_CANVAS_API_TOKEN)."
    );
  });

  it("throws a fixed literal - never anything derived from the underlying failure - when Canvas is unreachable", async () => {
    mockCanvasFetch.mockResolvedValueOnce(UNREACHABLE);

    await expect(startLinkValidation(COURSE_URL, "MCC")).rejects.toThrow("Canvas did not respond.");
  });

  it("throws canvasFetch's own composed reason - never a raw provider string - when the host is not allowed", async () => {
    mockCanvasFetch.mockResolvedValueOnce({
      ok: false,
      kind: "host-not-allowed",
      reason: "That host redirected to a different host. The stored credential is only ever sent to the host you registered.",
    });

    await expect(startLinkValidation(COURSE_URL, "MCC")).rejects.toThrow(
      "Canvas request refused: That host redirected to a different host. The stored credential is only ever sent to the host you registered."
    );
  });
});
