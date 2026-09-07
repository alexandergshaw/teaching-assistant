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
//
// Wave 6 group 1: every bearer-carrying fetch in inbox.ts (all 8 of them) now
// goes through canvasGet/canvasRequest (src/lib/canvas-fetch-response.ts),
// which call canvasFetch (src/lib/canvas-fetch.ts) - real node:https with a
// real DNS lookup, which a global.fetch stub does not intercept. So this file
// mocks canvasFetch AT THE MODULE BOUNDARY (`vi.mock("../canvas-fetch", ...)`)
// and every test builds `CanvasFetchResult` shapes instead of `Response`
// shapes - the same idiom announcements.test.ts and
// announcement-image-upload.test.ts already established for their own
// migrations. Every assertion that used to read the request off a
// globalThis.fetch call now reads it off the canvasFetch mock instead - same
// fact (method, url, body, pagination behaviour), same URL and body shape,
// only the mocked boundary moved. There is no bearer-header assertion to
// migrate here (this file never asserted directly on an Authorization
// header) - canvasFetch now attaches the bearer itself from the credential
// (third argument) rather than a caller-built header, which every migrated
// call site's own test below confirms by asserting the credential argument
// and that no caller-supplied Authorization header key is ever present.
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

import { listConversations, getConversation } from "./inbox";
import { getEffectiveIdentity } from "../supabase/effective-identity";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";

const mockGetEffectiveIdentity = vi.mocked(getEffectiveIdentity);
const mockCanvasFetch = vi.mocked(canvasFetch);

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body and, optionally,
 * response headers (lower-cased, IncomingHttpHeaders shape - what canvasFetch
 * itself returns) - every migrated call in inbox.ts reads its response this
 * way via canvasFetchResultToResponse's `.ok`/`.status`/`.json()`/
 * `.headers.get(...)` mapping. */
function okResult(body: unknown, status = 200, headers: Record<string, string> = {}): CanvasFetchResult {
  return { ok: true, status, headers, body: Buffer.from(JSON.stringify(body)) };
}

describe("listConversations", () => {
  beforeEach(() => {
    vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
    mockCanvasFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe("with no opts - must stay byte-identical to today (M15's own requirement)", () => {
    it("builds today's EXACT URL, institution-wide, per_page=50, page 1 only, no course filter - a literal oracle", async () => {
      mockCanvasFetch.mockResolvedValue(
        okResult(
          [{ id: 1, subject: "Hello", participants: [{ name: "Priya" }] }],
          200,
          // Even a Link header present must not trigger a second request -
          // the no-opts branch is exactly one request, unconditionally.
          { link: '<https://canvas.mccneb.edu/api/v1/conversations?page=2>; rel="next"' }
        )
      );

      await listConversations();

      expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
      const [url, init, credential] = mockCanvasFetch.mock.calls[0];
      expect(String(url)).toBe("https://canvas.mccneb.edu/api/v1/conversations?per_page=50");
      // canvasFetch attaches the bearer itself from the credential argument -
      // canvasGet never builds an Authorization header of its own. This is
      // the migrated form of what used to be an implicit assumption (the old
      // bare fetch call built its own `Authorization: Bearer <token>`
      // header) - now made explicit as an assertion on the credential
      // actually threaded through to canvasFetch's third argument.
      expect(credential).toEqual({ token: "test-token" });
      expect(Object.keys(init.headers ?? {})).not.toContain("Authorization");
    });

    it("still builds the identical URL when an acronym is supplied, with opts omitted", async () => {
      mockCanvasFetch.mockResolvedValue(okResult([]));

      await listConversations("MCC");

      expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
      const [url] = mockCanvasFetch.mock.calls[0];
      expect(String(url)).toBe("https://canvas.mccneb.edu/api/v1/conversations?per_page=50");
    });

    it("maps a conversation list item the same way as before", async () => {
      mockCanvasFetch.mockResolvedValue(
        okResult([
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
        ])
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
      mockCanvasFetch.mockResolvedValue(okResult({}, 401));
      await expect(listConversations()).rejects.toThrow();
    });

    it("propagates an unreachable canvasFetch result as a throw, with no retry (the property the canvasFetch migration itself creates)", async () => {
      mockCanvasFetch.mockResolvedValue({ ok: false, kind: "unreachable" });

      await expect(listConversations()).rejects.toThrow("Canvas did not respond.");
      // Exactly one attempt - an unreachable host is never retried (canvasFetch
      // is already time-flattened upstream specifically so a network-layer
      // failure's latency carries no signal; retrying here would defeat that).
      expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("with opts - the M15 widening", () => {
    it("appends filter[]=course_<id> and scope=, defaulting per_page to 100", async () => {
      mockCanvasFetch.mockResolvedValue(okResult([]));

      await listConversations(undefined, { courseId: "456", scope: "archived" });

      expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
      const [url] = mockCanvasFetch.mock.calls[0];
      const parsed = new URL(String(url));
      expect(parsed.origin + parsed.pathname).toBe("https://canvas.mccneb.edu/api/v1/conversations");
      expect(parsed.searchParams.get("per_page")).toBe("100");
      expect(parsed.searchParams.getAll("filter[]")).toEqual(["course_456"]);
      expect(parsed.searchParams.get("scope")).toBe("archived");
    });

    it("honors an explicit perPage override", async () => {
      mockCanvasFetch.mockResolvedValue(okResult([]));

      await listConversations(undefined, { perPage: 25 });

      const [url] = mockCanvasFetch.mock.calls[0];
      expect(new URL(String(url)).searchParams.get("per_page")).toBe("25");
    });

    it("omits filter[] and scope when neither courseId nor scope is given", async () => {
      mockCanvasFetch.mockResolvedValue(okResult([]));

      await listConversations(undefined, {});

      const [url] = mockCanvasFetch.mock.calls[0];
      const parsed = new URL(String(url));
      expect(parsed.searchParams.has("filter[]")).toBe(false);
      expect(parsed.searchParams.has("scope")).toBe(false);
    });

    it("follows parseNextLink pagination across pages, stopping when rel=next is absent", async () => {
      mockCanvasFetch
        .mockResolvedValueOnce(
          okResult([{ id: 1, subject: "Page one" }], 200, {
            link: '<https://canvas.mccneb.edu/api/v1/conversations?page=2>; rel="next"',
          })
        )
        .mockResolvedValueOnce(okResult([{ id: 2, subject: "Page two" }], 200, {}));

      const result = await listConversations(undefined, { courseId: "456" });

      expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
      expect(result.map((c) => c.id)).toEqual([1, 2]);
      // Second request goes to the next-link URL - but only after the
      // same-origin guard has passed it, and it is the guard's RETURN
      // value that is dialled. For an absolute same-origin candidate the
      // guard returns an equivalent href, so this assertion is unchanged
      // from before the guard existed; the two tests below cover the cases
      // where the guard actually changes or refuses the value.
      const [secondUrl] = mockCanvasFetch.mock.calls[1];
      expect(String(secondUrl)).toBe("https://canvas.mccneb.edu/api/v1/conversations?page=2");
    });

    it("stops at 5 pages even when every response still carries a next link", async () => {
      for (let page = 1; page <= 10; page++) {
        mockCanvasFetch.mockResolvedValueOnce(
          okResult([{ id: page, subject: `Page ${page}` }], 200, {
            link: `<https://canvas.mccneb.edu/api/v1/conversations?page=${page + 1}>; rel="next"`,
          })
        );
      }

      const result = await listConversations(undefined, { courseId: "456" });

      expect(mockCanvasFetch).toHaveBeenCalledTimes(5);
      expect(result.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
    });

    // E-CRIT1. These two tests exist because this loop was MISSED when every
    // other parseNextLink follow in the codebase was origin-guarded: it was
    // capped at five pages, but it dialled whatever host the Link header
    // named, carrying this app's bearer token. canvasFetch does not close
    // that on its own - its refusal list covers special-purpose addresses
    // (loopback, private, link-local), not an ordinary public host - so a
    // Canvas instance that had been compromised, or was never the real thing,
    // could have collected the credential by answering page one with a
    // rel="next" pointing anywhere.
    it("refuses a cross-origin rel=next rather than sending the bearer token to it", async () => {
      mockCanvasFetch.mockResolvedValueOnce(
        okResult([{ id: 1, subject: "Page one" }], 200, {
          link: '<https://attacker.example/api/v1/conversations?page=2>; rel="next"',
        })
      );

      await expect(listConversations(undefined, { courseId: "456" })).rejects.toThrow();

      // The refusal happens BEFORE the second request is dispatched - the
      // token never reaches the foreign origin. Asserting the call count is
      // the point of this test; asserting only that it threw would still pass
      // if the request went out and the throw came afterwards.
      expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    });

    it("resolves a RELATIVE rel=next against the base URL and dials the RESOLVED url", async () => {
      mockCanvasFetch
        .mockResolvedValueOnce(
          okResult([{ id: 1, subject: "Page one" }], 200, {
            link: '</api/v1/conversations?page=2>; rel="next"',
          })
        )
        .mockResolvedValueOnce(okResult([{ id: 2, subject: "Page two" }], 200, {}));

      const result = await listConversations(undefined, { courseId: "456" });

      expect(result.map((c) => c.id)).toEqual([1, 2]);
      // This is why the loop must dial the guard's RETURN value and never its
      // input: the guard resolves a relative candidate against the base, so
      // here the two differ. Passing the check and then fetching the raw
      // "/api/v1/conversations?page=2" would not be a valid request at all.
      const [secondUrl] = mockCanvasFetch.mock.calls[1];
      expect(String(secondUrl)).toBe("https://canvas.mccneb.edu/api/v1/conversations?page=2");
    });

    it("throws canvasError on a non-ok response mid-pagination", async () => {
      mockCanvasFetch
        .mockResolvedValueOnce(
          okResult([{ id: 1, subject: "Page one" }], 200, {
            link: '<https://canvas.mccneb.edu/api/v1/conversations?page=2>; rel="next"',
          })
        )
        .mockResolvedValueOnce(okResult({}, 500));

      await expect(listConversations(undefined, { courseId: "456" })).rejects.toThrow();
    });

    it("propagates unreachable mid-pagination as a throw, with no retry and no further pages fetched - the pagination loop still caps on a network-layer failure", async () => {
      mockCanvasFetch
        .mockResolvedValueOnce(
          okResult([{ id: 1, subject: "Page one" }], 200, {
            link: '<https://canvas.mccneb.edu/api/v1/conversations?page=2>; rel="next"',
          })
        )
        .mockResolvedValueOnce({ ok: false, kind: "unreachable" });

      await expect(listConversations(undefined, { courseId: "456" })).rejects.toThrow("Canvas did not respond.");
      // Two attempts total (page one succeeded, page two was unreachable) -
      // never a third, retried attempt at the failed page.
      expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
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
// (this is a re-key, not a cache deletion). Migrated onto the canvasFetch
// mock boundary along with everything else in this file - getSelfId's own
// `/users/self` request is one of the 8 migrated call sites.
describe("getConversation - SEC10: the self-id cache cannot leak across credentials", () => {
  beforeEach(() => {
    vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
    mockCanvasFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  function identity(id: string) {
    return { id, email: `${id}@example.edu`, role: "owner" as const, status: "active" as const };
  }

  function canvasFetchImplFor(selfId: number) {
    return async (url: string | URL): Promise<CanvasFetchResult> => {
      const s = String(url);
      if (s.includes("/users/self")) {
        return okResult({ id: selfId });
      }
      return okResult({ id: 1, subject: "Thread", participants: [], messages: [] });
    };
  }

  it("two different identities against the SAME base URL each resolve their OWN self id - never a shared cache entry (the SABOTAGE direction)", async () => {
    mockGetEffectiveIdentity.mockResolvedValue(identity("user-a"));
    mockCanvasFetch.mockImplementation(canvasFetchImplFor(111));
    const resultA = await getConversation(1);
    expect(resultA.selfId).toBe(111);

    // SABOTAGE-CHECK ANCHOR: with the pre-fix baseUrl-only key, this second
    // identity would hit user-a's cached entry and never call /users/self
    // again, so resultB.selfId would come back 111 instead of 222. Verified
    // by temporarily re-keying on ctx.baseUrl alone and confirming this
    // assertion fails with `expected 111 to be 222` - reverted after
    // confirming the failure.
    mockGetEffectiveIdentity.mockResolvedValue(identity("user-b"));
    mockCanvasFetch.mockClear();
    mockCanvasFetch.mockImplementation(canvasFetchImplFor(222));
    const resultB = await getConversation(1);
    expect(resultB.selfId).toBe(222);
    expect(mockCanvasFetch.mock.calls.some(([u]) => String(u).includes("/users/self"))).toBe(true);
  });

  it("the SAME identity's self id is still served from cache on a second call (this is a re-key, not a cache deletion)", async () => {
    mockGetEffectiveIdentity.mockResolvedValue(identity("user-a"));
    mockCanvasFetch.mockImplementation(canvasFetchImplFor(111));
    const first = await getConversation(1);
    expect(first.selfId).toBe(111);

    // Same identity, same base URL, second call: /users/self must NOT be
    // fetched again - the cache still functions within one identity.
    mockCanvasFetch.mockClear();
    mockCanvasFetch.mockImplementation(async (url: string | URL): Promise<CanvasFetchResult> => {
      const s = String(url);
      if (s.includes("/users/self")) {
        throw new Error("must not be called - user-a's self id should already be cached");
      }
      return okResult({ id: 1, subject: "Thread", participants: [], messages: [] });
    });

    const second = await getConversation(1);
    expect(second.selfId).toBe(111);
  });
});
