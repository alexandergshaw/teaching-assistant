// E-ARCH6/E6: resolveInstitutionByCode now reads a per-user credential store
// before ever touching the env vars this file stubs. Following this wave's
// one convention (grades.test.ts, inbox.test.ts, and this file's other
// siblings): mock getEffectiveIdentity to an "owner" identity and
// getLmsCredentialSecret to "no stored row", so resolveCanvasCredential falls
// through to the SAME owner-env branch this file already exercises with
// process.env.TEST_CANVAS_URL/TEST_CANVAS_API_TOKEN - byte-identical
// behavior, no second mocking convention invented.
//
// Wave 6 group 2: every bearer-carrying fetch in listings.ts/
// submission-detail.ts now goes through canvasGet (canvas-fetch-response.ts),
// which calls canvasFetch (canvas-fetch.ts) - real node:https with a real DNS
// lookup, which a global.fetch stub does not intercept. So this file mocks
// canvasFetch AT THE MODULE BOUNDARY (`vi.mock("./canvas-fetch", ...)`),
// the same boundary src/lib/canvas/announcements.test.ts already established
// for its own migration. Every assertion that used to check
// `Authorization: Bearer <token>` on a global.fetch call now checks the
// credential threaded to canvasFetch's third argument instead - that header
// is attached INSIDE canvasFetch, below this mock boundary - the fact
// asserted is unchanged, only where it is observed moved.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("./supabase/effective-identity", () => ({
  getEffectiveIdentity: vi.fn().mockResolvedValue({
    id: "test-owner",
    email: "owner@example.edu",
    role: "owner",
    status: "active",
  }),
}));
vi.mock("./lms-credentials", () => ({
  getLmsCredentialSecret: vi.fn().mockResolvedValue(null),
  recordLmsCredentialFailure: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./canvas-fetch", () => ({ canvasFetch: vi.fn() }));

import { listAssignments, listStudents, fetchSubmissionDetail } from "./canvas";
import { canvasFetch, type CanvasFetchResult } from "./canvas-fetch";

const mockCanvasFetch = vi.mocked(canvasFetch);

// Institution code for testing
const TEST_CODE = "TEST";
const TEST_BASE_URL = "https://test.instructure.com";
const TEST_TOKEN = "test-token-12345";

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body - every call
 * these tests exercise reads its response this way. */
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

describe("listAssignments", () => {
  it("parses a two-item page into {id, name, pointsPossible} and sorts by name", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([
        {
          id: 2,
          name: "Zebra Project",
          points_possible: 100,
        },
        {
          id: 1,
          name: "Alpha Quiz",
          points_possible: 50,
        },
      ])
    );

    const result = await listAssignments(TEST_CODE, "123");

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: "1",
      name: "Alpha Quiz",
      pointsPossible: 50,
    });
    expect(result[1]).toEqual({
      id: "2",
      name: "Zebra Project",
      pointsPossible: 100,
    });

    // Was: expect(mockFetch).toHaveBeenCalledWith(url, { headers: { Authorization: `Bearer ${TEST_TOKEN}` } }).
    // canvasFetch attaches the bearer itself from its third argument - the
    // credential - never from a caller-supplied header, so the same fact
    // (this request carried the test token) is now observed there instead.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url, init, credential] = mockCanvasFetch.mock.calls[0];
    expect(String(url)).toContain(`/api/v1/courses/123/assignments?per_page=100`);
    expect(init).toEqual({});
    expect(credential).toEqual({ token: TEST_TOKEN });
  });

  it("handles null pointsPossible", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([
        {
          id: 5,
          name: "No Points",
          points_possible: null,
        },
      ])
    );

    const result = await listAssignments(TEST_CODE, "123");

    expect(result).toHaveLength(1);
    expect(result[0].pointsPossible).toBeNull();
  });
});

describe("listStudents", () => {
  it("parses users into {id, name} and prefers sortable_name", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([
        {
          id: 101,
          sortable_name: "Adams, Alice",
          name: "Alice Adams",
        },
        {
          id: 102,
          name: "Bob Smith",
        },
        {
          id: 103,
          sortable_name: "Charlie Davis",
        },
      ])
    );

    const result = await listStudents(TEST_CODE, "123");

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({
      id: "101",
      name: "Adams, Alice",
    });
    expect(result[1]).toEqual({
      id: "102",
      name: "Bob Smith",
    });
    expect(result[2]).toEqual({
      id: "103",
      name: "Charlie Davis",
    });

    // Was: expect(mockFetch).toHaveBeenCalledWith(url, { headers: { Authorization: `Bearer ${TEST_TOKEN}` } }).
    // Same relocation as listAssignments above: the bearer is now observed on
    // canvasFetch's credential argument, not a header on the call itself.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url, init, credential] = mockCanvasFetch.mock.calls[0];
    expect(String(url)).toContain(`/api/v1/courses/123/users?enrollment_type[]=student&per_page=100`);
    expect(init).toEqual({});
    expect(credential).toEqual({ token: TEST_TOKEN });
  });

  it("sorts students by name", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([
        {
          id: 1,
          name: "Zoe",
        },
        {
          id: 2,
          name: "Alice",
        },
      ])
    );

    const result = await listStudents(TEST_CODE, "123");

    expect(result[0].name).toBe("Alice");
    expect(result[1].name).toBe("Zoe");
  });
});

describe("fetchSubmissionDetail", () => {
  it("parses body via htmlToText, score/grade/workflowState, and builds canvasUrl + speedGraderUrl", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult({
        id: 50,
        name: "Midterm Exam",
        points_possible: 100,
      })
    );

    mockCanvasFetch.mockResolvedValueOnce(
      okResult({
        user_id: 123,
        workflow_state: "graded",
        body: "<p>My solution.</p><p>Final answer: 42</p>",
        attachments: [],
        score: 85.5,
        grade: "B+",
        submitted_at: "2026-02-15T10:30:00Z",
        user: {
          sortable_name: "Smith, Bob",
          name: "Bob Smith",
        },
      })
    );

    const result = await fetchSubmissionDetail(TEST_CODE, "999", "50", 123);

    expect(result.student).toBe("Smith, Bob");
    expect(result.assignmentName).toBe("Midterm Exam");
    expect(result.courseId).toBe("999");
    expect(result.assignmentId).toBe("50");
    expect(result.userId).toBe(123);
    expect(result.text).toBe("My solution.\nFinal answer: 42");
    expect(result.files).toHaveLength(0);
    expect(result.workflowState).toBe("graded");
    expect(result.score).toBe(85.5);
    expect(result.grade).toBe("B+");
    expect(result.submittedAt).toBe("2026-02-15T10:30:00Z");
    expect(result.pointsPossible).toBe(100);
    expect(result.canvasUrl).toContain(`${TEST_BASE_URL}/courses/999/assignments/50`);
    expect(result.speedGraderUrl).toContain(
      `${TEST_BASE_URL}/courses/999/gradebook/speed_grader?assignment_id=50&student_id=123`
    );

    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
    // Both the assignment read and the submission read carried the test
    // token via canvasFetch's credential argument (was: an Authorization
    // header asserted on each global.fetch call).
    for (const call of mockCanvasFetch.mock.calls) {
      expect(call[2]).toEqual({ token: TEST_TOKEN });
    }
  });

  it("handles missing user info and uses userId fallback", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult({
        id: 10,
        name: "Quiz 1",
        points_possible: 25,
      })
    );

    mockCanvasFetch.mockResolvedValueOnce(
      okResult({
        user_id: 456,
        workflow_state: "submitted",
        body: null,
        attachments: [],
        score: null,
        grade: null,
        submitted_at: "2026-02-16T14:00:00Z",
        user: {},
      })
    );

    const result = await fetchSubmissionDetail(TEST_CODE, "888", "10", 456);

    expect(result.student).toBe("User 456");
    expect(result.text).toBe("");
    expect(result.score).toBeNull();
    expect(result.grade).toBeNull();
  });

  it("sets workflowState to unsubmitted when missing", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult({
        id: 20,
        name: "Assignment",
        points_possible: 50,
      })
    );

    mockCanvasFetch.mockResolvedValueOnce(
      okResult({
        user_id: 789,
        body: null,
        attachments: [],
        score: null,
        grade: null,
        submitted_at: null,
        user: { name: "Test User" },
      })
    );

    const result = await fetchSubmissionDetail(TEST_CODE, "777", "20", 789);

    expect(result.workflowState).toBe("unsubmitted");
    expect(result.submittedAt).toBeNull();
  });
});
