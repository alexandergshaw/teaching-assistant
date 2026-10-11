// Same mocking convention as listings.test.ts: owner identity, no stored
// credential row (env-var branch via TEST_CANVAS_*), canvasFetch mocked at the
// module boundary (never fetch).
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

import { joinSectionAssignments, listCourseSectionAssignments } from "./sections";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";

const mockCanvasFetch = vi.mocked(canvasFetch);

const TEST_CODE = "TEST";
const TEST_BASE_URL = "https://test.instructure.com";
const TEST_TOKEN = "test-token-12345";

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

describe("joinSectionAssignments", () => {
  it("maps course_section_id to the section name per user", () => {
    const out = joinSectionAssignments(
      [
        { id: 100, name: " Sec A " },
        { id: 101, name: "Sec B" },
      ],
      [
        { user_id: 1, course_section_id: 100 },
        { user_id: 2, course_section_id: 101 },
      ]
    );
    expect(out).toEqual([
      { userId: "1", sectionId: "100", sectionName: "Sec A" },
      { userId: "2", sectionId: "101", sectionName: "Sec B" },
    ]);
  });

  it("keeps two sections for one user, dedupes a repeated pair, drops unusable rows", () => {
    const out = joinSectionAssignments(
      [
        { id: 100, name: "A" },
        { id: 101, name: "B" },
      ],
      [
        { user_id: 1, course_section_id: 100 },
        { user_id: 1, course_section_id: 101 },
        { user_id: 1, course_section_id: 100 },
        { course_section_id: 100 },
        { user_id: 3, course_section_id: null },
      ]
    );
    expect(out.map((o) => `${o.userId}:${o.sectionId}`)).toEqual(["1:100", "1:101"]);
  });

  it("yields an empty name, not an invented one, for an unlisted section id", () => {
    expect(joinSectionAssignments([], [{ user_id: 1, course_section_id: 999 }])).toEqual([
      { userId: "1", sectionId: "999", sectionName: "" },
    ]);
  });
});

describe("listCourseSectionAssignments", () => {
  it("reads /sections and active student enrollments with the bearer and joins them", async () => {
    mockCanvasFetch
      .mockResolvedValueOnce(okResult([{ id: 100, name: "Sec A" }]))
      .mockResolvedValueOnce(okResult([{ user_id: 7, course_section_id: 100 }]));

    const result = await listCourseSectionAssignments(TEST_CODE, "55");

    expect(result).toEqual([{ userId: "7", sectionId: "100", sectionName: "Sec A" }]);
    expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
    const [url1, , cred1] = mockCanvasFetch.mock.calls[0];
    const [url2, , cred2] = mockCanvasFetch.mock.calls[1];
    expect(String(url1)).toContain("/api/v1/courses/55/sections?per_page=100");
    expect(String(url2)).toContain("/api/v1/courses/55/enrollments?type[]=StudentEnrollment&state[]=active&per_page=100");
    expect(cred1).toEqual({ token: TEST_TOKEN });
    expect(cred2).toEqual({ token: TEST_TOKEN });
  });

  it("throws the shared canvasError shape on a non-OK status", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 500));
    await expect(listCourseSectionAssignments(TEST_CODE, "55")).rejects.toThrow(/Canvas request failed \(HTTP 500\)/);
  });
});
