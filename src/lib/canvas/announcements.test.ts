// Entry 235 check 9 of docs/REGRESSION.md records that NO existing test
// exercised src/lib/canvas/announcements.ts before this feature. Covers the
// items docs/weekly-announcement-scheduling-acceptance-criteria.md's own
// "Tests still owed" section names as the cheapest high-value gap: the
// endpoint (item 15), the explicit page size (item 16), the sort contract
// (item 17), and the pagination opt-in (item 13 - exactly ONE request when
// the flag is absent). Also covers the three new resilient/reschedule/
// read-back functions this feature adds (AC6, AC7).
//
// globalThis.fetch is stubbed directly rather than mocking canvas-core, so
// the real resolveCourse/canvasError/textToHtml/htmlToText run - closer to
// the real request shape these functions actually build.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  listAnnouncements,
  createScheduledAnnouncementResilient,
  updateAnnouncementSchedule,
  getAnnouncementById,
} from "./announcements";

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";

function fakeResponse(opts: {
  ok: boolean;
  status?: number;
  body?: unknown;
  linkHeader?: string | null;
}): Response {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    json: async () => opts.body ?? [],
    headers: { get: (name: string) => (name.toLowerCase() === "link" ? opts.linkHeader ?? null : null) },
  } as unknown as Response;
}

describe("Canvas announcements transport", () => {
  beforeEach(() => {
    vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("listAnnouncements", () => {
    it("keeps the current endpoint, an explicit per_page=50, and issues exactly one request when allPages is absent - even when a Link header IS present (AC4 items 13, 15, 16)", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(
        fakeResponse({
          ok: true,
          body: [{ id: 1, title: "A", posted_at: "2026-01-05T00:00:00Z" }],
          linkHeader: '<https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics?page=2>; rel="next"',
        })
      );

      await listAnnouncements(COURSE_URL, "MCC");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toBe(
        "https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics?only_announcements=true&per_page=50"
      );
    });

    it("follows Link-header pagination across pages when allPages is true, stopping when rel=next is absent", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(
          fakeResponse({
            ok: true,
            body: [{ id: 1, title: "Page one item" }],
            linkHeader: '<https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics?page=2>; rel="next"',
          })
        )
        .mockResolvedValueOnce(
          fakeResponse({ ok: true, body: [{ id: 2, title: "Page two item" }], linkHeader: null })
        );

      const result = await listAnnouncements(COURSE_URL, "MCC", { allPages: true });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe(
        "https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics?page=2"
      );
      expect(result.map((a) => a.id).sort()).toEqual([1, 2]);
    });

    it("preserves the sort contract: scheduled items first by soonest delayedPostAt, then posted items by newest postedAt (entry 235 check 3)", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(
        fakeResponse({
          ok: true,
          body: [
            { id: 1, title: "Posted older", posted_at: "2026-01-01T00:00:00Z" },
            { id: 2, title: "Scheduled later", delayed_post_at: "2026-02-01T00:00:00Z" },
            { id: 3, title: "Posted newer", posted_at: "2026-01-10T00:00:00Z" },
            { id: 4, title: "Scheduled sooner", delayed_post_at: "2026-01-20T00:00:00Z" },
          ],
        })
      );

      const result = await listAnnouncements(COURSE_URL, "MCC");
      expect(result.map((a) => a.id)).toEqual([4, 2, 3, 1]);
    });
  });

  describe("createScheduledAnnouncementResilient", () => {
    it("posts is_announcement=true and delayed_post_at, returning the created id", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(fakeResponse({ ok: true, body: { id: 555 } }));

      const result = await createScheduledAnnouncementResilient(
        COURSE_URL,
        "Week 1",
        "Hello",
        "2026-01-05T08:00:00.000Z",
        "MCC"
      );

      expect(result).toEqual({ id: 555 });
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toBe("https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics");
      expect(init?.method).toBe("POST");
      const body = String(init?.body);
      expect(body).toContain("is_announcement=true");
      expect(body).toContain(encodeURIComponent("2026-01-05T08:00:00.000Z"));
    });

    it("retries on 429/403 with bounded backoff and eventually succeeds (AC7)", async () => {
      vi.useFakeTimers();
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(fakeResponse({ ok: false, status: 429 }))
        .mockResolvedValueOnce(fakeResponse({ ok: false, status: 403 }))
        .mockResolvedValueOnce(fakeResponse({ ok: true, body: { id: 777 } }));

      const promise = createScheduledAnnouncementResilient(COURSE_URL, "Week 1", "Hi", "2026-01-05T08:00:00.000Z", "MCC");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual({ id: 777 });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
    });

    it("stops after a bounded number of attempts and throws a clear error", async () => {
      vi.useFakeTimers();
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(fakeResponse({ ok: false, status: 429 }));

      const promise = createScheduledAnnouncementResilient(COURSE_URL, "Week 1", "Hi", "2026-01-05T08:00:00.000Z", "MCC");
      const expectation = expect(promise).rejects.toThrow(/HTTP 429/);
      await vi.runAllTimersAsync();
      await expectation;
      // Bounded: not an unbounded retry loop.
      expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
      vi.useRealTimers();
    });
  });

  describe("updateAnnouncementSchedule", () => {
    it("PUTs delayed_post_at only, to the topic-specific URL", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(fakeResponse({ ok: true, body: {} }));

      await updateAnnouncementSchedule(COURSE_URL, 42, "2026-01-12T08:00:00.000Z", "MCC");

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toBe("https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics/42");
      expect(init?.method).toBe("PUT");
      expect(String(init?.body)).toBe(`delayed_post_at=${encodeURIComponent("2026-01-12T08:00:00.000Z")}`);
    });
  });

  describe("getAnnouncementById", () => {
    it("returns null on 404 instead of throwing", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(fakeResponse({ ok: false, status: 404 }));

      const result = await getAnnouncementById(COURSE_URL, 99, "MCC");
      expect(result).toBeNull();
    });

    it("returns the mapped announcement on success", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(
        fakeResponse({ ok: true, body: { id: 88, title: "Week 3", delayed_post_at: "2026-01-19T08:00:00Z" } })
      );

      const result = await getAnnouncementById(COURSE_URL, 88, "MCC");
      expect(result).toMatchObject({ id: 88, title: "Week 3", delayedPostAt: "2026-01-19T08:00:00Z" });
    });
  });
});
