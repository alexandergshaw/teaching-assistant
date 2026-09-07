// listCourseSubmissionGrid takes baseUrl/token/institution/courseId directly
// (auto-zero.ts's own shape) rather than resolving credentials itself, so
// this file needs no getEffectiveIdentity/getLmsCredentialSecret mocking -
// only canvasFetch, mocked AT THE MODULE BOUNDARY the way every other
// migrated Canvas reader's test does (see grading-queue.test.ts,
// inbox.test.ts), since canvasGet goes through real node:https underneath a
// global.fetch stub would not intercept.
//
// docs/course-student-intelligence-acceptance-criteria.md D4: the bulk
// `students/submissions` endpoint has never run against a real Canvas
// instance, so the fallback to the per-assignment endpoint on a non-OK FIRST
// response is this file's most load-bearing property, not an afterthought -
// see the describe block below dedicated to it.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../canvas-fetch", () => ({ canvasFetch: vi.fn() }));

import { listCourseSubmissionGrid } from "./submissions-grid";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";
import { CANVAS_PAGINATION_PAGE_CAP } from "../canvas-remote-url";
import type { CanvasInstitution } from "../canvas-core";

const mockCanvasFetch = vi.mocked(canvasFetch);

const institution: CanvasInstitution = { code: "MCC", name: "Metropolitan Community College", host: "canvas.mccneb.edu" };
const baseUrl = "https://canvas.mccneb.edu";
const token = "test-token";
const courseId = "123";

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body - the exact
 * idiom every other migrated reader's test in this directory uses. */
function okResult(body: unknown, status = 200, headers: Record<string, string> = {}): CanvasFetchResult {
  return { ok: true, status, headers, body: Buffer.from(JSON.stringify(body)) };
}

beforeEach(() => {
  mockCanvasFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("listCourseSubmissionGrid - bulk path", () => {
  it("threads the bearer token to the bulk students/submissions endpoint", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([{ user_id: 1, assignment_id: 10, score: 9, workflow_state: "graded" }])
    );

    const result = await listCourseSubmissionGrid(baseUrl, token, institution, courseId, []);

    expect(result.source).toBe("bulk");
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url, , credential] = mockCanvasFetch.mock.calls[0];
    expect(String(url)).toBe(
      "https://canvas.mccneb.edu/api/v1/courses/123/students/submissions?student_ids[]=all&per_page=100"
    );
    expect(credential).toEqual({ token: "test-token" });
  });

  it("threads late, missing, and excused verbatim - never re-derived", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([
        {
          user_id: 1,
          assignment_id: 10,
          score: null,
          workflow_state: "unsubmitted",
          submitted_at: null,
          late: true,
          missing: true,
          excused: false,
        },
        {
          user_id: 2,
          assignment_id: 10,
          score: 8,
          workflow_state: "graded",
          submitted_at: "2026-09-01T00:00:00Z",
          late: false,
          missing: false,
          excused: true,
        },
      ])
    );

    const result = await listCourseSubmissionGrid(baseUrl, token, institution, courseId, []);

    expect(result.rows).toEqual([
      {
        userId: 1,
        assignmentId: "10",
        score: null,
        workflowState: "unsubmitted",
        submittedAt: null,
        excused: false,
        late: true,
        missing: true,
        dueAt: null,
        dueAtPresent: false,
      },
      {
        userId: 2,
        assignmentId: "10",
        score: 8,
        workflowState: "graded",
        submittedAt: "2026-09-01T00:00:00Z",
        excused: true,
        late: false,
        missing: false,
        dueAt: null,
        dueAtPresent: false,
      },
    ]);
  });

  // The three-state cached_due_date handling copied from auto-zero.ts:
  // present-and-a-string, present-and-null, and ABSENT are three different
  // facts and must not collapse into one.
  describe("cached_due_date three-state handling", () => {
    it("a string means this student's own effective deadline", async () => {
      mockCanvasFetch.mockResolvedValueOnce(
        okResult([{ user_id: 1, assignment_id: 10, cached_due_date: "2026-09-10T00:00:00Z" }])
      );
      const result = await listCourseSubmissionGrid(baseUrl, token, institution, courseId, []);
      expect(result.rows[0].dueAt).toBe("2026-09-10T00:00:00Z");
      expect(result.rows[0].dueAtPresent).toBe(true);
    });

    it("an explicit null means no deadline for this student - not the same as absent", async () => {
      mockCanvasFetch.mockResolvedValueOnce(
        okResult([{ user_id: 1, assignment_id: 10, cached_due_date: null }])
      );
      const result = await listCourseSubmissionGrid(baseUrl, token, institution, courseId, []);
      expect(result.rows[0].dueAt).toBeNull();
      expect(result.rows[0].dueAtPresent).toBe(true);
    });

    it("the field entirely absent means Canvas said nothing - dueAtPresent is false", async () => {
      mockCanvasFetch.mockResolvedValueOnce(okResult([{ user_id: 1, assignment_id: 10 }]));
      const result = await listCourseSubmissionGrid(baseUrl, token, institution, courseId, []);
      expect(result.rows[0].dueAt).toBeNull();
      expect(result.rows[0].dueAtPresent).toBe(false);
    });
  });

  it("drops a row with no numeric user_id", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([{ assignment_id: 10, score: 5 }, { user_id: 2, assignment_id: 10 }])
    );
    const result = await listCourseSubmissionGrid(baseUrl, token, institution, courseId, []);
    expect(result.rows.map((r) => r.userId)).toEqual([2]);
  });

  it("a non-OK status on a page AFTER the first throws the established canvasError shape, never a fallback", async () => {
    mockCanvasFetch
      .mockResolvedValueOnce(
        okResult([{ user_id: 1, assignment_id: 10 }], 200, {
          link: '<https://canvas.mccneb.edu/api/v1/courses/123/students/submissions?page=2>; rel="next"',
        })
      )
      .mockResolvedValueOnce(okResult({}, 500));

    await expect(listCourseSubmissionGrid(baseUrl, token, institution, courseId, [])).rejects.toThrow(
      /Canvas request failed/
    );
    // Only the two bulk-endpoint pages were attempted - no fallback fetch.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
  });

  it("an unreachable canvasFetch result propagates as a throw, with no retry and no fallback attempted", async () => {
    mockCanvasFetch.mockResolvedValueOnce({ ok: false, kind: "unreachable" });

    await expect(listCourseSubmissionGrid(baseUrl, token, institution, courseId, [])).rejects.toThrow(
      "Canvas did not respond."
    );
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("refuses a cross-origin rel=next before the second request is dispatched", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([{ user_id: 1, assignment_id: 10 }], 200, {
        link: '<https://attacker.example/api/v1/courses/123/students/submissions?page=2>; rel="next"',
      })
    );

    await expect(listCourseSubmissionGrid(baseUrl, token, institution, courseId, [])).rejects.toThrow();
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("resolves a relative rel=next against the base and dials the resolved url", async () => {
    mockCanvasFetch
      .mockResolvedValueOnce(
        okResult([{ user_id: 1, assignment_id: 10 }], 200, {
          link: '</api/v1/courses/123/students/submissions?page=2>; rel="next"',
        })
      )
      .mockResolvedValueOnce(okResult([{ user_id: 2, assignment_id: 10 }], 200, {}));

    const result = await listCourseSubmissionGrid(baseUrl, token, institution, courseId, []);

    expect(result.rows.map((r) => r.userId)).toEqual([1, 2]);
    const [secondUrl] = mockCanvasFetch.mock.calls[1];
    expect(String(secondUrl)).toBe(
      "https://canvas.mccneb.edu/api/v1/courses/123/students/submissions?page=2"
    );
  });

  it("refuses to follow an unbounded chain of next links past CANVAS_PAGINATION_PAGE_CAP - copied verbatim from auto-zero.ts's own loop shape, which throws rather than silently stopping", async () => {
    mockCanvasFetch.mockImplementation(async () =>
      okResult([{ user_id: 1, assignment_id: 10 }], 200, {
        link: '<https://canvas.mccneb.edu/api/v1/courses/123/students/submissions?page=loop>; rel="next"',
      })
    );

    await expect(
      listCourseSubmissionGrid(baseUrl, token, institution, courseId, [])
    ).rejects.toThrow(/exceeded 20 pages/);
    // Exactly CAP fetches happened before the throw fired on the next
    // iteration - a sabotaged cap (e.g. deleting the throw) would hang this
    // test instead of failing it, because an unbounded chain of already-
    // resolved promises never yields to the timer phase - hence the explicit
    // timeout below rather than relying on vitest's default.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(CANVAS_PAGINATION_PAGE_CAP);
  }, 10000);
});

describe("listCourseSubmissionGrid - per-assignment fallback (D4)", () => {
  it("falls back to the per-assignment endpoint on a non-OK FIRST response, and says so via source", async () => {
    mockCanvasFetch
      .mockResolvedValueOnce(okResult({}, 403)) // bulk endpoint rejected
      .mockResolvedValueOnce(okResult([{ user_id: 1, assignment_id: 10, score: 5, late: true }]))
      .mockResolvedValueOnce(okResult([{ user_id: 2, assignment_id: 20, missing: true }]));

    const result = await listCourseSubmissionGrid(baseUrl, token, institution, courseId, ["10", "20"]);

    expect(result.source).toBe("per-assignment-fallback");
    expect(mockCanvasFetch).toHaveBeenCalledTimes(3);
    const urls = mockCanvasFetch.mock.calls.slice(1).map(([u]) => String(u));
    expect(urls.sort()).toEqual(
      [
        "https://canvas.mccneb.edu/api/v1/courses/123/assignments/10/submissions?per_page=100",
        "https://canvas.mccneb.edu/api/v1/courses/123/assignments/20/submissions?per_page=100",
      ].sort()
    );
    expect(result.rows.find((r) => r.userId === 1)?.assignmentId).toBe("10");
    expect(result.rows.find((r) => r.userId === 1)?.late).toBe(true);
    expect(result.rows.find((r) => r.userId === 2)?.assignmentId).toBe("20");
    expect(result.rows.find((r) => r.userId === 2)?.missing).toBe(true);
  });

  it("the fallback path also refuses a cross-origin rel=next, per assignment", async () => {
    mockCanvasFetch
      .mockResolvedValueOnce(okResult({}, 404))
      .mockResolvedValueOnce(
        okResult([{ user_id: 1, assignment_id: 10 }], 200, {
          link: '<https://attacker.example/x>; rel="next"',
        })
      );

    await expect(
      listCourseSubmissionGrid(baseUrl, token, institution, courseId, ["10"])
    ).rejects.toThrow();
    // Bulk call, one fallback call, refused before a third request.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
  });

  it("an empty assignmentIds list produces an empty fallback grid rather than throwing", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 501));

    const result = await listCourseSubmissionGrid(baseUrl, token, institution, courseId, []);

    expect(result.source).toBe("per-assignment-fallback");
    expect(result.rows).toEqual([]);
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });
});
