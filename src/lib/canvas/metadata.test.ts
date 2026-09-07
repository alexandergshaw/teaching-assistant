// metadata.ts had NO test file before this migration wave. This file covers
// the canvasFetch migration (Group E) for all four bearer-carrying fetches in
// metadata.ts: fetchAssignmentObject, and the discussion-topic reads inside
// fetchCanvasMetaWith / fetchAssignmentPointsPossible / getSpeedGraderUrl.
//
// canvasGet (src/lib/canvas-fetch-response.ts) calls canvasFetch
// (src/lib/canvas-fetch.ts) - real node:https with a real DNS lookup, which a
// global.fetch stub does not intercept. So every test mocks canvasFetch AT
// THE MODULE BOUNDARY (`vi.mock("../canvas-fetch", ...)`), the same boundary
// src/lib/canvas/announcements.test.ts and
// src/lib/canvas-modules/fetch-helpers.canvas-fetch.test.ts already
// established.
//
// fetchAssignmentObject and fetchCanvasMetaWith take their institution/token/
// baseUrl directly as parameters - no identity/credential-store resolution
// runs for those, so they need no identity mock. fetchCanvasMeta,
// fetchAssignmentPointsPossible, and getSpeedGraderUrl instead take a raw URL
// and call resolveInstitution (canvas-core.ts), which now resolves the
// CALLING USER's own identity via getEffectiveIdentity() before ever falling
// back to env vars (docs/lms-credentials-acceptance-criteria.md E-ARCH6). Per
// that section's own instruction to every wave touching a Canvas test file:
// mock the identity/credential-store boundary to `role: "owner"` with no
// stored row, which keeps the ENV branch alive (vi.stubEnv still governs the
// resolved credential) and lets these three functions resolve
// MCC_CANVAS_API_TOKEN against MCC's hardcoded host
// (canvas-credentials.ts's HARDCODED_INSTITUTION_HOSTS) exactly as production
// does. Convention copied from src/lib/canvas.pullback.test.ts - no second
// mocking convention invented.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../supabase/effective-identity", () => ({
  getEffectiveIdentity: vi.fn(),
}));
vi.mock("../lms-credentials", () => ({
  getLmsCredentialSecret: vi.fn(),
  recordLmsCredentialFailure: vi.fn(),
}));
vi.mock("../canvas-fetch", () => ({ canvasFetch: vi.fn() }));

import {
  fetchAssignmentObject,
  fetchCanvasMetaWith,
  fetchAssignmentPointsPossible,
  getSpeedGraderUrl,
} from "./metadata";
import type { CanvasInstitution } from "../canvas-core";
import { getEffectiveIdentity } from "../supabase/effective-identity";
import { getLmsCredentialSecret, recordLmsCredentialFailure } from "../lms-credentials";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";

const mockGetEffectiveIdentity = vi.mocked(getEffectiveIdentity);
const mockGetLmsCredentialSecret = vi.mocked(getLmsCredentialSecret);
const mockRecordLmsCredentialFailure = vi.mocked(recordLmsCredentialFailure);
const mockCanvasFetch = vi.mocked(canvasFetch);

const OWNER_IDENTITY = { id: "owner-1", email: "owner@example.edu", role: "owner" as const, status: "active" as const };

const INSTITUTION: CanvasInstitution = { code: "TEST", name: "Test School", host: "test.instructure.com" };
const BASE_URL = "https://test.instructure.com";
const TOKEN = "test-token";

// URL-entrypoint tests resolve credentials through resolveInstitution, which
// only recognizes registered institutions (canvas-core.ts's
// CANVAS_INSTITUTIONS) - MCC (canvas.mccneb.edu) is the only one, so those
// tests use that host.
const MCC_ASSIGNMENT_URL = "https://canvas.mccneb.edu/courses/1/assignments/2";
const MCC_DISCUSSION_URL = "https://canvas.mccneb.edu/courses/1/discussion_topics/5";

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body - every call
 * in metadata.ts reads its response this way (none of them read raw bytes). */
function okResult(body: unknown, status = 200, headers: Record<string, string> = {}): CanvasFetchResult {
  return { ok: true, status, headers, body: Buffer.from(JSON.stringify(body)) };
}

beforeEach(() => {
  mockCanvasFetch.mockReset();
  mockGetEffectiveIdentity.mockResolvedValue(OWNER_IDENTITY);
  mockGetLmsCredentialSecret.mockResolvedValue(null);
  mockRecordLmsCredentialFailure.mockResolvedValue(undefined);
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "owner-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("fetchAssignmentObject - canvasFetch transport", () => {
  it("threads the bearer through canvasFetch's credential argument, never as a manually built Authorization header", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ description: "<p>Do the thing.</p>", points_possible: 10 }));

    const result = await fetchAssignmentObject(BASE_URL, TOKEN, INSTITUTION, "1", "2");

    expect(result.points_possible).toBe(10);
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url, init, credential] = mockCanvasFetch.mock.calls[0];
    expect(String(url)).toBe("https://test.instructure.com/api/v1/courses/1/assignments/2");
    expect(credential).toEqual({ token: TOKEN });
    expect(Object.keys(init.headers ?? {})).not.toContain("Authorization");
  });

  it("a non-OK status produces the same canvasError callers already handle", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 401));

    await expect(fetchAssignmentObject(BASE_URL, TOKEN, INSTITUTION, "1", "2")).rejects.toThrow(
      /Canvas rejected the request/
    );
  });

  it("an unreachable result propagates as a throw and is not retried", async () => {
    mockCanvasFetch.mockResolvedValueOnce({ ok: false, kind: "unreachable" });

    await expect(fetchAssignmentObject(BASE_URL, TOKEN, INSTITUTION, "1", "2")).rejects.toThrow(
      "Canvas did not respond."
    );
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("a host-not-allowed result propagates as a throw naming the classifier's own reason", async () => {
    mockCanvasFetch.mockResolvedValueOnce({
      ok: false,
      kind: "host-not-allowed",
      reason: "That host resolved to a private or reserved address and cannot be used.",
    });

    await expect(fetchAssignmentObject(BASE_URL, TOKEN, INSTITUTION, "1", "2")).rejects.toThrow(
      /private or reserved address/
    );
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });
});

describe("fetchCanvasMetaWith - assignment and discussion paths", () => {
  it("assignment path: reads description and rubric via canvasGet, converting HTML to text", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult({
        description: "<p>Write an essay.</p>",
        rubric: [{ description: "Clarity", points: 5 }],
      })
    );

    const result = await fetchCanvasMetaWith(
      { institution: INSTITUTION, token: TOKEN, baseUrl: BASE_URL },
      { kind: "assignment", courseId: "1", id: "2" }
    );

    expect(result.description).toBe("Write an essay.");
    expect(result.rubricText).toContain("Clarity (5 pts)");
    const [url] = mockCanvasFetch.mock.calls[0];
    expect(String(url)).toBe("https://test.instructure.com/api/v1/courses/1/assignments/2");
  });

  it("discussion path: threads the bearer through canvasGet for the topic fetch", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ message: "<p>Discuss.</p>" }));

    const result = await fetchCanvasMetaWith(
      { institution: INSTITUTION, token: TOKEN, baseUrl: BASE_URL },
      { kind: "discussion", courseId: "1", id: "5" }
    );

    expect(result.description).toBe("Discuss.");
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url, init, credential] = mockCanvasFetch.mock.calls[0];
    expect(String(url)).toBe("https://test.instructure.com/api/v1/courses/1/discussion_topics/5");
    expect(credential).toEqual({ token: TOKEN });
    expect(Object.keys(init.headers ?? {})).not.toContain("Authorization");
  });

  it("discussion path: falls back to the linked assignment's rubric (a second migrated canvasGet call) when the topic itself carries none", async () => {
    mockCanvasFetch
      .mockResolvedValueOnce(okResult({ message: "<p>Discuss.</p>", assignment_id: 77 }))
      .mockResolvedValueOnce(okResult({ rubric: [{ description: "Depth", points: 3 }] }));

    const result = await fetchCanvasMetaWith(
      { institution: INSTITUTION, token: TOKEN, baseUrl: BASE_URL },
      { kind: "discussion", courseId: "1", id: "5" }
    );

    expect(result.rubricText).toContain("Depth (3 pts)");
    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
    expect(String(mockCanvasFetch.mock.calls[1][0])).toBe(
      "https://test.instructure.com/api/v1/courses/1/assignments/77"
    );
  });

  it("discussion path: an unreachable linked-assignment fetch is swallowed (rubric is best-effort), not propagated", async () => {
    mockCanvasFetch
      .mockResolvedValueOnce(okResult({ message: "<p>Discuss.</p>", assignment_id: 77 }))
      .mockResolvedValueOnce({ ok: false, kind: "unreachable" });

    const result = await fetchCanvasMetaWith(
      { institution: INSTITUTION, token: TOKEN, baseUrl: BASE_URL },
      { kind: "discussion", courseId: "1", id: "5" }
    );

    expect(result.rubricText).toBe("");
    expect(result.description).toBe("Discuss.");
  });
});

describe("fetchAssignmentPointsPossible - URL entrypoint (identity-resolved credential)", () => {
  it("resolves the owner's env-configured MCC credential and reads points_possible off the assignment", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ points_possible: 42 }));

    const result = await fetchAssignmentPointsPossible(MCC_ASSIGNMENT_URL);

    expect(result).toBe(42);
    const [url, , credential] = mockCanvasFetch.mock.calls[0];
    expect(String(url)).toBe("https://canvas.mccneb.edu/api/v1/courses/1/assignments/2");
    expect(credential).toEqual({ token: "owner-token" });
  });

  it("a discussion URL follows the linked assignment through a second migrated canvasGet call", async () => {
    mockCanvasFetch
      .mockResolvedValueOnce(okResult({ assignment_id: 9 }))
      .mockResolvedValueOnce(okResult({ points_possible: 15 }));

    const result = await fetchAssignmentPointsPossible(MCC_DISCUSSION_URL);

    expect(result).toBe(15);
    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
  });

  it("an unreachable canvasFetch result is caught by this function's own best-effort try/catch and returns null, not a throw", async () => {
    mockCanvasFetch.mockResolvedValueOnce({ ok: false, kind: "unreachable" });

    const result = await fetchAssignmentPointsPossible(MCC_ASSIGNMENT_URL);

    expect(result).toBeNull();
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });
});

describe("getSpeedGraderUrl - URL entrypoint (identity-resolved credential)", () => {
  it("builds the SpeedGrader URL directly for an assignment URL with no extra fetch", async () => {
    const result = await getSpeedGraderUrl(MCC_ASSIGNMENT_URL);

    expect(result).toBe("https://canvas.mccneb.edu/courses/1/gradebook/speed_grader?assignment_id=2");
    expect(mockCanvasFetch).not.toHaveBeenCalled();
  });

  it("resolves a discussion URL's linked assignment via canvasGet before building the URL", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({ assignment_id: 9 }));

    const result = await getSpeedGraderUrl(MCC_DISCUSSION_URL);

    expect(result).toBe("https://canvas.mccneb.edu/courses/1/gradebook/speed_grader?assignment_id=9");
    const [url, , credential] = mockCanvasFetch.mock.calls[0];
    expect(String(url)).toBe("https://canvas.mccneb.edu/api/v1/courses/1/discussion_topics/5");
    expect(credential).toEqual({ token: "owner-token" });
  });

  it("an unreachable canvasFetch result is caught and returns null, not a throw", async () => {
    mockCanvasFetch.mockResolvedValueOnce({ ok: false, kind: "unreachable" });

    const result = await getSpeedGraderUrl(MCC_DISCUSSION_URL);

    expect(result).toBeNull();
  });
});
