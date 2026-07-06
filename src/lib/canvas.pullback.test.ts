import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { listAssignments, listStudents, fetchSubmissionDetail } from "./canvas";

// Mock fetch for all tests in this suite
global.fetch = vi.fn();

const mockFetch = fetch as ReturnType<typeof vi.fn>;

// Institution code for testing
const TEST_CODE = "TEST";
const TEST_BASE_URL = "https://test.instructure.com";
const TEST_TOKEN = "test-token-12345";

beforeEach(() => {
  process.env.TEST_CANVAS_URL = TEST_BASE_URL;
  process.env.TEST_CANVAS_API_TOKEN = TEST_TOKEN;
  mockFetch.mockClear();
});

afterEach(() => {
  delete process.env.TEST_CANVAS_URL;
  delete process.env.TEST_CANVAS_API_TOKEN;
});

describe("listAssignments", () => {
  it("parses a two-item page into {id, name, pointsPossible} and sorts by name", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
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
        ]),
        {
          headers: { "content-type": "application/json" },
        }
      )
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

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v1/courses/123/assignments?per_page=100`),
      expect.objectContaining({
        headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      })
    );
  });

  it("handles null pointsPossible", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 5,
            name: "No Points",
            points_possible: null,
          },
        ]),
        {
          headers: { "content-type": "application/json" },
        }
      )
    );

    const result = await listAssignments(TEST_CODE, "123");

    expect(result).toHaveLength(1);
    expect(result[0].pointsPossible).toBeNull();
  });
});

describe("listStudents", () => {
  it("parses users into {id, name} and prefers sortable_name", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
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
        ]),
        {
          headers: { "content-type": "application/json" },
        }
      )
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

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/api/v1/courses/123/users?enrollment_type[]=student&per_page=100`),
      expect.objectContaining({
        headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      })
    );
  });

  it("sorts students by name", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 1,
            name: "Zoe",
          },
          {
            id: 2,
            name: "Alice",
          },
        ]),
        {
          headers: { "content-type": "application/json" },
        }
      )
    );

    const result = await listStudents(TEST_CODE, "123");

    expect(result[0].name).toBe("Alice");
    expect(result[1].name).toBe("Zoe");
  });
});

describe("fetchSubmissionDetail", () => {
  it("parses body via htmlToText, score/grade/workflowState, and builds canvasUrl + speedGraderUrl", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 50,
          name: "Midterm Exam",
          points_possible: 100,
        }),
        {
          headers: { "content-type": "application/json" },
        }
      )
    );

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
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
        }),
        {
          headers: { "content-type": "application/json" },
        }
      )
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

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("handles missing user info and uses userId fallback", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 10,
          name: "Quiz 1",
          points_possible: 25,
        }),
        {
          headers: { "content-type": "application/json" },
        }
      )
    );

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          user_id: 456,
          workflow_state: "submitted",
          body: null,
          attachments: [],
          score: null,
          grade: null,
          submitted_at: "2026-02-16T14:00:00Z",
          user: {},
        }),
        {
          headers: { "content-type": "application/json" },
        }
      )
    );

    const result = await fetchSubmissionDetail(TEST_CODE, "888", "10", 456);

    expect(result.student).toBe("User 456");
    expect(result.text).toBe("");
    expect(result.score).toBeNull();
    expect(result.grade).toBeNull();
  });

  it("sets workflowState to unsubmitted when missing", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 20,
          name: "Assignment",
          points_possible: 50,
        }),
        {
          headers: { "content-type": "application/json" },
        }
      )
    );

    mockFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          user_id: 789,
          body: null,
          attachments: [],
          score: null,
          grade: null,
          submitted_at: null,
          user: { name: "Test User" },
        }),
        {
          headers: { "content-type": "application/json" },
        }
      )
    );

    const result = await fetchSubmissionDetail(TEST_CODE, "777", "20", 789);

    expect(result.workflowState).toBe("unsubmitted");
    expect(result.submittedAt).toBeNull();
  });
});
