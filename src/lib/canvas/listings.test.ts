// listings.ts had no test file of its own before this wave. Following the
// convention src/lib/canvas/announcements.test.ts established for the same
// migration: mock getEffectiveIdentity to an "owner" identity and
// getLmsCredentialSecret to "no stored row" (keeps resolveInstitutionByCode's
// env-var branch alive via TEST_CANVAS_URL/TEST_CANVAS_API_TOKEN), and mock
// canvasFetch AT THE MODULE BOUNDARY - every bearer-carrying fetch in
// listings.ts goes through canvasGet (canvas-fetch-response.ts), which calls
// canvasFetch (canvas-fetch.ts), real node:https with a real DNS lookup that
// a global.fetch stub would not intercept.
//
// Every test below is written to be able to FAIL: each property asserted was
// sabotaged in the implementation, the matching test was confirmed to go
// red, and the sabotage was then reverted. See this wave's report for the
// exact sabotage and the exact failure each one produced.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../supabase/effective-identity", () => ({
  getEffectiveIdentity: vi.fn().mockResolvedValue({
    id: "test-owner",
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

import {
  listCourseRoster,
  listStudentGradeSummaries,
  listAssignmentTextSubmissions,
  listAssignments,
  listStudents,
} from "./listings";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";
import { CANVAS_PAGINATION_PAGE_CAP } from "../canvas-remote-url";

const mockCanvasFetch = vi.mocked(canvasFetch);

const TEST_CODE = "TEST";
const TEST_BASE_URL = "https://test.instructure.com";
const TEST_TOKEN = "test-token-12345";

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body. */
function okResult(body: unknown, status = 200, headers: Record<string, string> = {}): CanvasFetchResult {
  return { ok: true, status, headers, body: Buffer.from(JSON.stringify(body)) };
}

beforeEach(() => {
  process.env.TEST_CANVAS_URL = TEST_BASE_URL;
  process.env.TEST_CANVAS_API_TOKEN = TEST_TOKEN;
  mockCanvasFetch.mockReset();
});

afterEach(() => {
  delete process.env.TEST_CANVAS_URL;
  delete process.env.TEST_CANVAS_API_TOKEN;
});

describe("bearer threading", () => {
  it("threads the resolved token to canvasFetch's credential argument, not a caller-built header", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([{ id: 1, name: "Alice", sortable_name: "Adams, Alice", login_id: "aadams" }])
    );

    const result = await listCourseRoster(TEST_CODE, "123");

    expect(result).toHaveLength(1);
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url, init, credential] = mockCanvasFetch.mock.calls[0];
    expect(String(url)).toContain("/api/v1/courses/123/users?enrollment_type[]=student&per_page=100");
    // canvasGet(url, token) calls canvasRequest(url, {}, token), which calls
    // canvasFetch(url, {}, { token }) - no Authorization header is ever built
    // by this file; canvasFetch attaches the bearer itself from this third
    // argument.
    expect(init).toEqual({});
    expect(credential).toEqual({ token: TEST_TOKEN });
  });
});

describe("non-OK status", () => {
  it("still throws the same canvasError shape callers already handle", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 500));

    await expect(listStudentGradeSummaries(TEST_CODE, "123")).rejects.toThrow(
      /Canvas request failed \(HTTP 500\)/
    );
  });
});

describe("unreachable result", () => {
  it("propagates as a throw and is not retried", async () => {
    mockCanvasFetch.mockResolvedValueOnce({ ok: false, kind: "unreachable" });

    await expect(listAssignmentTextSubmissions(TEST_CODE, "123", "456")).rejects.toThrow(
      /Canvas did not respond/
    );
    // Not retried: exactly one call, matching how a rejected bare fetch
    // always propagated once and was never retried by this file.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });
});

describe("pagination cap", () => {
  it(
    "stops at CANVAS_PAGINATION_PAGE_CAP pages rather than following an endless same-origin next-link chain",
    async () => {
      mockCanvasFetch.mockImplementation(async () =>
        okResult(
          [{ id: 1, name: "Endless", points_possible: 10 }],
          200,
          {
            link: `<${TEST_BASE_URL}/api/v1/courses/123/assignments?per_page=100&page=loop>; rel="next"`,
          }
        )
      );

      const result = await listAssignments(TEST_CODE, "123");

      // The loop in listings.ts stops silently at the cap (returns what it
      // has), rather than throwing - that is this file's existing behavior,
      // unchanged by the canvasFetch migration. The property under test is
      // that it STOPS at all: an unbounded chain that never sets a Link
      // header without "next" would otherwise run forever.
      expect(mockCanvasFetch).toHaveBeenCalledTimes(CANVAS_PAGINATION_PAGE_CAP);
      expect(result.length).toBeGreaterThan(0);
    },
    10000
  );
});

describe("relative next-link resolution", () => {
  it("resolves a relative Link header against the base and dials the RESOLVED url, not the raw candidate", async () => {
    mockCanvasFetch
      .mockResolvedValueOnce(
        okResult(
          [{ id: 1, sortable_name: "Adams, Alice", name: "Alice Adams" }],
          200,
          // Deliberately relative - no scheme or host, matching a
          // technically-legal (if unusual) Link header shape.
          { link: "</api/v1/courses/123/users?enrollment_type[]=student&per_page=100&page=2>; rel=\"next\"" }
        )
      )
      .mockResolvedValueOnce(okResult([{ id: 2, name: "Bob Smith" }], 200, {}));

    const result = await listStudents(TEST_CODE, "123");

    expect(result.map((s) => s.id).sort()).toEqual(["1", "2"]);
    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
    const [secondUrl] = mockCanvasFetch.mock.calls[1];
    expect(String(secondUrl)).toBe(
      `${TEST_BASE_URL}/api/v1/courses/123/users?enrollment_type[]=student&per_page=100&page=2`
    );
  });
});
