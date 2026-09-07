// listDiscussionTopicBriefs takes baseUrl/token/institution/courseId
// directly (auto-zero.ts's own shape), so this file needs no
// getEffectiveIdentity/getLmsCredentialSecret mocking - only canvasFetch,
// mocked AT THE MODULE BOUNDARY the way every other migrated Canvas reader's
// test does (grading-queue.test.ts, inbox.test.ts), since canvasGet goes
// through real node:https underneath a global.fetch stub would not
// intercept.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../canvas-fetch", () => ({ canvasFetch: vi.fn() }));

import { listDiscussionTopicBriefs } from "./discussion-topics";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";
import { CANVAS_PAGINATION_PAGE_CAP } from "../canvas-remote-url";
import type { CanvasInstitution } from "../canvas-core";

const mockCanvasFetch = vi.mocked(canvasFetch);

const institution: CanvasInstitution = { code: "MCC", name: "Metropolitan Community College", host: "canvas.mccneb.edu" };
const baseUrl = "https://canvas.mccneb.edu";
const token = "test-token";
const courseId = "123";

function okResult(body: unknown, status = 200, headers: Record<string, string> = {}): CanvasFetchResult {
  return { ok: true, status, headers, body: Buffer.from(JSON.stringify(body)) };
}

beforeEach(() => {
  mockCanvasFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("listDiscussionTopicBriefs", () => {
  it("threads the bearer token and builds the expected URL - every topic, not only_announcements", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult([{ id: 1, title: "Week 1", is_announcement: false }]));

    await listDiscussionTopicBriefs(baseUrl, token, institution, courseId);

    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    const [url, , credential] = mockCanvasFetch.mock.calls[0];
    expect(String(url)).toBe("https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics?per_page=100");
    expect(String(url)).not.toContain("only_announcements");
    expect(credential).toEqual({ token: "test-token" });
  });

  it("maps title, postedAt, isAnnouncement, subentryCount, and locked", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([
        {
          id: 5,
          title: "  Midterm discussion  ",
          posted_at: "2026-09-01T00:00:00Z",
          is_announcement: false,
          discussion_subentry_count: 12,
          locked: true,
        },
      ])
    );

    const result = await listDiscussionTopicBriefs(baseUrl, token, institution, courseId);

    expect(result).toEqual([
      {
        id: 5,
        title: "Midterm discussion",
        postedAt: "2026-09-01T00:00:00Z",
        isAnnouncement: false,
        subentryCount: 12,
        locked: true,
      },
    ]);
  });

  it("reports an announcement topic (is_announcement true) correctly", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([{ id: 6, title: "Welcome", is_announcement: true, discussion_subentry_count: 0 }])
    );

    const result = await listDiscussionTopicBriefs(baseUrl, token, institution, courseId);
    expect(result[0].isAnnouncement).toBe(true);
    // Zero is a real, distinct fact from "unknown" - must survive as 0, not
    // be coerced to null by a falsiness check.
    expect(result[0].subentryCount).toBe(0);
  });

  it("subentryCount absent from the response is reported as null, never coerced to 0", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult([{ id: 7, title: "No count field" }]));

    const result = await listDiscussionTopicBriefs(baseUrl, token, institution, courseId);
    expect(result[0].subentryCount).toBeNull();
  });

  it("falls back to (untitled) for a missing or blank title", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult([{ id: 8, title: "   " }, { id: 9 }]));

    const result = await listDiscussionTopicBriefs(baseUrl, token, institution, courseId);
    expect(result.map((t) => t.title)).toEqual(["(untitled)", "(untitled)"]);
  });

  it("drops a topic with no numeric id", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult([{ title: "No id" }, { id: 10, title: "Has id" }]));

    const result = await listDiscussionTopicBriefs(baseUrl, token, institution, courseId);
    expect(result.map((t) => t.id)).toEqual([10]);
  });

  it("a non-OK status throws the established canvasError shape", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 401));
    await expect(listDiscussionTopicBriefs(baseUrl, token, institution, courseId)).rejects.toThrow(
      /Canvas rejected the request/
    );
  });

  it("an unreachable canvasFetch result propagates as a throw, with no retry", async () => {
    mockCanvasFetch.mockResolvedValueOnce({ ok: false, kind: "unreachable" });

    await expect(listDiscussionTopicBriefs(baseUrl, token, institution, courseId)).rejects.toThrow(
      "Canvas did not respond."
    );
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("refuses a cross-origin rel=next before the second request is dispatched", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult([{ id: 1, title: "Page one" }], 200, {
        link: '<https://attacker.example/api/v1/courses/123/discussion_topics?page=2>; rel="next"',
      })
    );

    await expect(listDiscussionTopicBriefs(baseUrl, token, institution, courseId)).rejects.toThrow();
    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
  });

  it("resolves a relative rel=next against the base and dials the resolved url", async () => {
    mockCanvasFetch
      .mockResolvedValueOnce(
        okResult([{ id: 1, title: "Page one" }], 200, {
          link: '</api/v1/courses/123/discussion_topics?page=2>; rel="next"',
        })
      )
      .mockResolvedValueOnce(okResult([{ id: 2, title: "Page two" }], 200, {}));

    const result = await listDiscussionTopicBriefs(baseUrl, token, institution, courseId);

    expect(result.map((t) => t.id)).toEqual([1, 2]);
    const [secondUrl] = mockCanvasFetch.mock.calls[1];
    expect(String(secondUrl)).toBe("https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics?page=2");
  });

  it("refuses to follow an unbounded chain of next links past CANVAS_PAGINATION_PAGE_CAP - copied verbatim from auto-zero.ts's own loop shape, which throws rather than silently stopping", async () => {
    mockCanvasFetch.mockImplementation(async () =>
      okResult([{ id: 1, title: "Loop" }], 200, {
        link: '<https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics?page=loop>; rel="next"',
      })
    );

    await expect(listDiscussionTopicBriefs(baseUrl, token, institution, courseId)).rejects.toThrow(
      /exceeded 20 pages/
    );
    // Exactly CAP fetches happened before the throw fired on the next
    // iteration - a sabotaged cap hangs this test instead of failing it,
    // hence the explicit timeout rather than vitest's default.
    expect(mockCanvasFetch).toHaveBeenCalledTimes(CANVAS_PAGINATION_PAGE_CAP);
  }, 10000);
});
