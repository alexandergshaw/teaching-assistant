// Wave 6 group 3: grading-queue.ts had no test file before this migration.
// This file covers the property this migration itself introduces - every
// bearer-carrying fetch in grading-queue.ts (the needs-grading assignment
// scan used by both listGradingQueue and getNeedsGradingCount, and the two
// calls inside getCourseNotifications) now goes through canvasGet
// (src/lib/canvas-fetch-response.ts), which calls canvasFetch
// (src/lib/canvas-fetch.ts) - real node:https with a real DNS lookup that a
// global.fetch stub would not intercept. So, following the same convention
// grades.test.ts and announcements.test.ts already established, this file
// mocks canvasFetch AT THE MODULE BOUNDARY, never globalThis.fetch.
//
// listActiveTeacherCourses (./listings) is ALSO migrated onto canvasGet (a
// sibling group's own file, not this one), so scanNeedsGrading's per-course
// loop would otherwise be reachable through the same canvasFetch mock - but
// mixing "which course list came back" with "how the assignments scan
// itself behaves" in one mock would make failures harder to attribute. This
// file mocks ./listings directly instead, so each test controls the course
// list and the assignments-scan responses independently.
//
// getCourseNotifications takes no course list at all (it is scoped to one
// already-known courseId), so it needs no such mock - just canvasFetch.
//
// E-ARCH6/E6 (see grades.test.ts, announcements.test.ts for the same note):
// resolveInstitutionByCode reads a per-user credential store before ever
// touching the env vars this file stubs. Mocking getEffectiveIdentity to an
// "owner" identity and getLmsCredentialSecret to "no stored row" keeps the
// env-based resolution path (MCC_CANVAS_API_TOKEN, the hardcoded
// canvas.mccneb.edu host fallback) alive, exactly as grades.test.ts already
// relies on for the same institution code.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
vi.mock("./listings", () => ({ listActiveTeacherCourses: vi.fn() }));

import { getCourseNotifications, getNeedsGradingCount } from "./grading-queue";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";
import { listActiveTeacherCourses } from "./listings";
import { CANVAS_PAGINATION_PAGE_CAP } from "../canvas-remote-url";

const mockCanvasFetch = vi.mocked(canvasFetch);
const mockListCourses = vi.mocked(listActiveTeacherCourses);

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body - every
 * migrated call in this file reads its response this way, whatever the HTTP
 * status: a non-2xx status here is still a COMPLETED exchange (Canvas
 * answered), distinct from the `kind: "unreachable"` case exercised
 * separately below. */
function okResult(body: unknown, status = 200, headers: Record<string, string> = {}): CanvasFetchResult {
  return { ok: true, status, headers, body: Buffer.from(JSON.stringify(body)) };
}

describe("grading-queue canvasFetch transport", () => {
  beforeEach(() => {
    vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
    mockCanvasFetch.mockReset();
    mockListCourses.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe("getCourseNotifications", () => {
    it("threads the bearer token through canvasFetch for both the assignments scan and the conversations lookup", async () => {
      mockCanvasFetch
        .mockResolvedValueOnce(okResult([{ needs_grading_count: 2 }]))
        .mockResolvedValueOnce(okResult([{ id: 1 }, { id: 2 }]));

      const result = await getCourseNotifications("MCC", "123");

      expect(result).toEqual({ needsGrading: 2, unread: 2 });
      expect(mockCanvasFetch).toHaveBeenCalledTimes(2);

      const [assignmentsUrl, , assignmentsCredential] = mockCanvasFetch.mock.calls[0];
      const [conversationsUrl, , conversationsCredential] = mockCanvasFetch.mock.calls[1];
      expect(String(assignmentsUrl)).toBe(
        "https://canvas.mccneb.edu/api/v1/courses/123/assignments?bucket=ungraded&include[]=needs_grading_count&per_page=100"
      );
      expect(String(conversationsUrl)).toBe(
        "https://canvas.mccneb.edu/api/v1/conversations?scope=unread&filter[]=course_123&per_page=100"
      );
      // canvasFetch attaches the bearer itself from the credential argument -
      // canvasGet never builds an Authorization header of its own.
      expect(assignmentsCredential).toEqual({ token: "test-token" });
      expect(conversationsCredential).toEqual({ token: "test-token" });
    });

    it("a non-OK status on the assignments scan throws the same canvasError shape callers already handle", async () => {
      mockCanvasFetch.mockResolvedValueOnce(okResult({}, 401));

      await expect(getCourseNotifications("MCC", "123")).rejects.toThrow(
        /Canvas rejected the request/
      );
    });

    it("an unreachable canvasFetch result propagates as a throw, never a value the caller could inspect or retry", async () => {
      mockCanvasFetch.mockResolvedValueOnce({ ok: false, kind: "unreachable" });

      await expect(getCourseNotifications("MCC", "123")).rejects.toThrow("Canvas did not respond.");
      // Only the one attempt - a network-layer failure is never retried.
      expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    });

    it("a conversations lookup that fails (non-OK) is tolerated - unread stays 0 rather than throwing (existing behavior, unaffected by the migration)", async () => {
      mockCanvasFetch
        .mockResolvedValueOnce(okResult([]))
        .mockResolvedValueOnce(okResult({}, 500));

      const result = await getCourseNotifications("MCC", "123");
      expect(result).toEqual({ needsGrading: 0, unread: 0 });
    });
  });

  describe("getNeedsGradingCount", () => {
    it("threads the bearer token through the per-course assignments scan and sums needs_grading_count across pages", async () => {
      mockListCourses.mockResolvedValue([{ id: "10", name: "Course A" }]);
      mockCanvasFetch
        .mockResolvedValueOnce(
          okResult(
            [{ id: 1, needs_grading_count: 3 }],
            200,
            { link: '<https://canvas.mccneb.edu/api/v1/courses/10/assignments?page=2>; rel="next"' }
          )
        )
        .mockResolvedValueOnce(okResult([{ id: 2, needs_grading_count: 4 }]));

      const count = await getNeedsGradingCount("MCC");

      expect(count).toBe(7);
      expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
      const [, , credential] = mockCanvasFetch.mock.calls[0];
      expect(credential).toEqual({ token: "test-token" });
    });

    // E-CRIT1. Both loops in this file were capped but NOT origin-checked:
    // they dialled whatever the remote host named in its rel="next" header,
    // carrying the bearer token. canvasFetch does not close that on its own -
    // its refusal list covers special-purpose addresses, not an ordinary
    // public host - so these two tests are the only thing standing behind the
    // guard. The same miss was found in canvas/inbox.ts and canvas/listings.ts
    // in the same wave.
    it("refuses a cross-origin rel=next rather than sending the bearer token to it", async () => {
      mockListCourses.mockResolvedValue([{ id: "10", name: "Course A" }]);
      mockCanvasFetch.mockResolvedValueOnce(
        okResult([{ id: 1, needs_grading_count: 1 }], 200, {
          link: '<https://attacker.example/api/v1/courses/10/assignments?page=2>; rel="next"',
        })
      );

      await expect(getNeedsGradingCount("MCC")).rejects.toThrow();

      // The refusal lands BEFORE the second request goes out. Asserting only
      // that it threw would still pass if the token had already been sent and
      // the throw came afterwards, which is the whole failure being guarded.
      expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    });

    it("resolves a RELATIVE rel=next against the base URL and dials the RESOLVED url", async () => {
      mockListCourses.mockResolvedValue([{ id: "10", name: "Course A" }]);
      mockCanvasFetch
        .mockResolvedValueOnce(
          okResult([{ id: 1, needs_grading_count: 2 }], 200, {
            link: '</api/v1/courses/10/assignments?page=2>; rel="next"',
          })
        )
        .mockResolvedValueOnce(okResult([{ id: 2, needs_grading_count: 3 }], 200, {}));

      const total = await getNeedsGradingCount("MCC");

      expect(total).toBe(5);
      // This is why the loop dials the guard's RETURN value and never its
      // input: the guard resolves a relative candidate against the base, so
      // the two differ here, and dialling the raw header would not be a valid
      // request at all.
      const [secondUrl] = mockCanvasFetch.mock.calls[1];
      expect(String(secondUrl)).toBe("https://canvas.mccneb.edu/api/v1/courses/10/assignments?page=2");
    });
    it("stops paginating at CANVAS_PAGINATION_PAGE_CAP rather than following an unbounded chain of next links", async () => {
      mockListCourses.mockResolvedValue([{ id: "10", name: "Course A" }]);
      mockCanvasFetch.mockImplementation(async () =>
        okResult(
          [{ id: 1, needs_grading_count: 1 }],
          200,
          { link: '<https://canvas.mccneb.edu/api/v1/courses/10/assignments?page=loop>; rel="next"' }
        )
      );

      await getNeedsGradingCount("MCC");

      expect(mockCanvasFetch).toHaveBeenCalledTimes(CANVAS_PAGINATION_PAGE_CAP);
    }, 10000);

    it("a non-OK status while scanning a course's assignments throws the same canvasError shape callers already handle", async () => {
      mockListCourses.mockResolvedValue([{ id: "10", name: "Course A" }]);
      mockCanvasFetch.mockResolvedValueOnce(okResult({}, 403));

      await expect(getNeedsGradingCount("MCC")).rejects.toThrow(/Canvas rejected the request/);
    });

    it("an unreachable canvasFetch result during the assignments scan propagates as a throw", async () => {
      mockListCourses.mockResolvedValue([{ id: "10", name: "Course A" }]);
      mockCanvasFetch.mockResolvedValueOnce({ ok: false, kind: "unreachable" });

      await expect(getNeedsGradingCount("MCC")).rejects.toThrow("Canvas did not respond.");
      expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    });
  });
});
