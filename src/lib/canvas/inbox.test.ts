// No test previously existed for src/lib/canvas/inbox.ts (per M15's own
// requirement: "pin that listConversations without options builds today's
// exact URL"). Follows announcements.test.ts's own idiom: globalThis.fetch
// stubbed directly so the real resolveDefaultInstitution/resolveInstitutionByCode
// / canvasError run - closer to the real request shape these functions
// actually build - rather than mocking canvas-core.
//
// docs/message-replies-acceptance-criteria.md M15: `listConversations(code?,
// opts?: { courseId?: string; scope?: "unread" | "archived"; perPage?: number })`
// appends `filter[]=course_<id>` and `scope=` (the grading-queue.ts:174 idiom)
// and follows parseNextLink (grading-queue.ts:161-174) for at most 5 pages of
// 100 when opts are given; with no opts, the URL and behaviour are BYTE-
// IDENTICAL to today - a literal oracle of today's URL, pinned before AND
// after the M15 widening (the "before" half is this file's very first test).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listConversations } from "./inbox";

function fakeResponse(opts: { ok: boolean; status?: number; body?: unknown; linkHeader?: string | null }): Response {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    json: async () => opts.body ?? [],
    headers: { get: (name: string) => (name.toLowerCase() === "link" ? opts.linkHeader ?? null : null) },
  } as unknown as Response;
}

describe("listConversations", () => {
  beforeEach(() => {
    vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe("with no opts - must stay byte-identical to today (M15's own requirement)", () => {
    it("builds today's EXACT URL, institution-wide, per_page=50, page 1 only, no course filter - a literal oracle", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(
        fakeResponse({
          ok: true,
          body: [{ id: 1, subject: "Hello", participants: [{ name: "Priya" }] }],
          // Even a Link header present must not trigger a second request -
          // the no-opts branch is exactly one request, unconditionally.
          linkHeader: '<https://canvas.mccneb.edu/api/v1/conversations?page=2>; rel="next"',
        })
      );

      await listConversations();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toBe("https://canvas.mccneb.edu/api/v1/conversations?per_page=50");
    });

    it("still builds the identical URL when an acronym is supplied, with opts omitted", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(fakeResponse({ ok: true, body: [] }));

      await listConversations("MCC");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toBe("https://canvas.mccneb.edu/api/v1/conversations?per_page=50");
    });

    it("maps a conversation list item the same way as before", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(
        fakeResponse({
          ok: true,
          body: [
            {
              id: 7,
              subject: "  Grades  ",
              last_message: "  See you then  ",
              participants: [{ name: "Priya Patel" }, { id: 12 }],
              message_count: 3,
              workflow_state: "read",
              last_message_at: "2026-09-01T00:00:00Z",
            },
            { subject: "No id, dropped" },
          ],
        })
      );

      const result = await listConversations();
      expect(result).toEqual([
        {
          id: 7,
          subject: "Grades",
          lastMessage: "See you then",
          participants: ["Priya Patel", "User 12"],
          messageCount: 3,
          workflowState: "read",
          lastMessageAt: "2026-09-01T00:00:00Z",
        },
      ]);
    });

    it("throws canvasError on a non-ok response", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(fakeResponse({ ok: false, status: 401 }));
      await expect(listConversations()).rejects.toThrow();
    });
  });

  describe("with opts - the M15 widening", () => {
    it("appends filter[]=course_<id> and scope=, defaulting per_page to 100", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(fakeResponse({ ok: true, body: [] }));

      await listConversations(undefined, { courseId: "456", scope: "archived" });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0];
      const parsed = new URL(String(url));
      expect(parsed.origin + parsed.pathname).toBe("https://canvas.mccneb.edu/api/v1/conversations");
      expect(parsed.searchParams.get("per_page")).toBe("100");
      expect(parsed.searchParams.getAll("filter[]")).toEqual(["course_456"]);
      expect(parsed.searchParams.get("scope")).toBe("archived");
    });

    it("honors an explicit perPage override", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(fakeResponse({ ok: true, body: [] }));

      await listConversations(undefined, { perPage: 25 });

      const [url] = fetchMock.mock.calls[0];
      expect(new URL(String(url)).searchParams.get("per_page")).toBe("25");
    });

    it("omits filter[] and scope when neither courseId nor scope is given", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(fakeResponse({ ok: true, body: [] }));

      await listConversations(undefined, {});

      const [url] = fetchMock.mock.calls[0];
      const parsed = new URL(String(url));
      expect(parsed.searchParams.has("filter[]")).toBe(false);
      expect(parsed.searchParams.has("scope")).toBe(false);
    });

    it("follows parseNextLink pagination across pages, stopping when rel=next is absent", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(
          fakeResponse({
            ok: true,
            body: [{ id: 1, subject: "Page one" }],
            linkHeader: '<https://canvas.mccneb.edu/api/v1/conversations?page=2>; rel="next"',
          })
        )
        .mockResolvedValueOnce(
          fakeResponse({
            ok: true,
            body: [{ id: 2, subject: "Page two" }],
            linkHeader: null,
          })
        );

      const result = await listConversations(undefined, { courseId: "456" });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.map((c) => c.id)).toEqual([1, 2]);
      // Second request goes to the opaque next-link URL verbatim.
      const [secondUrl] = fetchMock.mock.calls[1];
      expect(String(secondUrl)).toBe("https://canvas.mccneb.edu/api/v1/conversations?page=2");
    });

    it("stops at 5 pages even when every response still carries a next link", async () => {
      const fetchMock = vi.mocked(fetch);
      for (let page = 1; page <= 10; page++) {
        fetchMock.mockResolvedValueOnce(
          fakeResponse({
            ok: true,
            body: [{ id: page, subject: `Page ${page}` }],
            linkHeader: `<https://canvas.mccneb.edu/api/v1/conversations?page=${page + 1}>; rel="next"`,
          })
        );
      }

      const result = await listConversations(undefined, { courseId: "456" });

      expect(fetchMock).toHaveBeenCalledTimes(5);
      expect(result.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
    });

    it("throws canvasError on a non-ok response mid-pagination", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(
          fakeResponse({
            ok: true,
            body: [{ id: 1, subject: "Page one" }],
            linkHeader: '<https://canvas.mccneb.edu/api/v1/conversations?page=2>; rel="next"',
          })
        )
        .mockResolvedValueOnce(fakeResponse({ ok: false, status: 500 }));

      await expect(listConversations(undefined, { courseId: "456" })).rejects.toThrow();
    });
  });
});
