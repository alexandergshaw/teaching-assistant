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

//
// E-ARCH6/E6: resolveInstitutionByCode/resolveDefaultInstitution now read a
// per-user credential store before ever touching the env vars this file
// stubs. Following this wave's one convention (grades.test.ts and this
// file's siblings): mock getEffectiveIdentity to an "owner" identity and
// getLmsCredentialSecret to "no stored row", so resolveCanvasCredential falls
// through to the SAME owner-env branch these tests already exercise with
// vi.stubEnv - byte-identical URLs, no second mocking convention invented.
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

import { listConversations, getConversation } from "./inbox";
import { getEffectiveIdentity } from "../supabase/effective-identity";

const mockGetEffectiveIdentity = vi.mocked(getEffectiveIdentity);

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

// SEC10 (docs/lms-credentials-acceptance-criteria.md): selfIdCache used to be
// keyed on baseUrl alone, so two different users' credentials against the
// SAME Canvas host would share one cache entry - the second caller's thread
// would render the FIRST caller's Canvas identity as "me". The fix keys the
// cache on `${identity.id}:${baseUrl}` instead (see inbox.ts's own comment on
// selfIdCache). This suite proves both directions: two different identities
// never share an entry, and one identity's own entry still hits the cache
// (this is a re-key, not a cache deletion).
describe("getConversation - SEC10: the self-id cache cannot leak across credentials", () => {
  beforeEach(() => {
    vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function identity(id: string) {
    return { id, email: `${id}@example.edu`, role: "owner" as const, status: "active" as const };
  }

  function fetchImplFor(selfId: number) {
    return async (url: string | URL | Request) => {
      const s = String(url);
      if (s.includes("/users/self")) {
        return fakeResponse({ ok: true, body: { id: selfId } });
      }
      return fakeResponse({
        ok: true,
        body: { id: 1, subject: "Thread", participants: [], messages: [] },
      });
    };
  }

  it("two different identities against the SAME base URL each resolve their OWN self id - never a shared cache entry (the SABOTAGE direction)", async () => {
    const fetchMock = vi.mocked(fetch);

    mockGetEffectiveIdentity.mockResolvedValue(identity("user-a"));
    fetchMock.mockImplementation(fetchImplFor(111));
    const resultA = await getConversation(1);
    expect(resultA.selfId).toBe(111);

    // SABOTAGE-CHECK ANCHOR: with the pre-fix baseUrl-only key, this second
    // identity would hit user-a's cached entry and never call /users/self
    // again, so resultB.selfId would come back 111 instead of 222. Verified
    // by temporarily re-keying on ctx.baseUrl alone and confirming this
    // assertion fails with `expected 111 to be 222` - reverted after
    // confirming the failure.
    mockGetEffectiveIdentity.mockResolvedValue(identity("user-b"));
    fetchMock.mockClear();
    fetchMock.mockImplementation(fetchImplFor(222));
    const resultB = await getConversation(1);
    expect(resultB.selfId).toBe(222);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/users/self"))).toBe(true);
  });

  it("the SAME identity's self id is still served from cache on a second call (this is a re-key, not a cache deletion)", async () => {
    const fetchMock = vi.mocked(fetch);

    mockGetEffectiveIdentity.mockResolvedValue(identity("user-a"));
    fetchMock.mockImplementation(fetchImplFor(111));
    const first = await getConversation(1);
    expect(first.selfId).toBe(111);

    // Same identity, same base URL, second call: /users/self must NOT be
    // fetched again - the cache still functions within one identity.
    fetchMock.mockClear();
    fetchMock.mockImplementation(async (url: string | URL | Request) => {
      const s = String(url);
      if (s.includes("/users/self")) {
        throw new Error("must not be called - user-a's self id should already be cached");
      }
      return fakeResponse({
        ok: true,
        body: { id: 1, subject: "Thread", participants: [], messages: [] },
      });
    });

    const second = await getConversation(1);
    expect(second.selfId).toBe(111);
  });
});
