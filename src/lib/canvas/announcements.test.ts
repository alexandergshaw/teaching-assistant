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
//
// resolveCourse now delegates to resolveCanvasCredential
// (src/lib/canvas-credentials.ts), which resolves the CALLING USER's own
// identity via getEffectiveIdentity() before ever looking at env vars - see
// docs/lms-credentials-acceptance-criteria.md E-ARCH6. Per that section's own
// instruction to every wave touching one of the 22 existing Canvas test
// files: mock the identity/credential-store boundary to `role: "owner"` with
// no stored row, which keeps the ENV branch alive (vi.stubEnv below still
// governs the resolved credential) and every assertion in this file testing
// what it always tested.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../supabase/effective-identity", () => ({
  getEffectiveIdentity: vi.fn(),
}));
vi.mock("../lms-credentials", () => ({
  getLmsCredentialSecret: vi.fn(),
  recordLmsCredentialFailure: vi.fn(),
}));

import {
  listAnnouncements,
  createAnnouncement,
  createScheduledAnnouncementResilient,
  updateAnnouncementSchedule,
  getAnnouncementById,
  buildAnnouncementBodyHtml,
  exportCourseCartridge,
} from "./announcements";
import { courseFileDownloadUrl } from "../canvas-url";
import { buildAnnouncementImageAltText } from "../take-announcement";
import { getEffectiveIdentity } from "../supabase/effective-identity";
import { getLmsCredentialSecret, recordLmsCredentialFailure } from "../lms-credentials";
import { CANVAS_PAGINATION_PAGE_CAP } from "../canvas-remote-url";

const mockGetEffectiveIdentity = vi.mocked(getEffectiveIdentity);
const mockGetLmsCredentialSecret = vi.mocked(getLmsCredentialSecret);
const mockRecordLmsCredentialFailure = vi.mocked(recordLmsCredentialFailure);

const OWNER_IDENTITY = { id: "owner-1", email: "owner@example.edu", role: "owner" as const, status: "active" as const };

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
    mockGetEffectiveIdentity.mockResolvedValue(OWNER_IDENTITY);
    mockGetLmsCredentialSecret.mockResolvedValue(null);
    mockRecordLmsCredentialFailure.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
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

    it("refuses to follow a Link-header rel=next that points at a DIFFERENT host, and never sends the bearer token there (E-CRIT1 exfiltration case)", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(
        fakeResponse({
          ok: true,
          body: [{ id: 1, title: "Page one item" }],
          linkHeader: '<https://collector.evil/steal>; rel="next"',
        })
      );

      await expect(listAnnouncements(COURSE_URL, "MCC", { allPages: true })).rejects.toThrow(
        /Refusing to follow a Canvas-supplied URL/
      );

      // Only the first, legitimate request happened - the hostile "next"
      // link was never dialed at all, so the bearer token was never sent to
      // collector.evil in any form (neither the retry-with-bearer shape nor
      // any other).
      expect(fetchMock).toHaveBeenCalledTimes(1);
      for (const call of fetchMock.mock.calls) {
        expect(String(call[0])).not.toContain("collector.evil");
      }
    });

    it("stops after CANVAS_PAGINATION_PAGE_CAP pages rather than following an unbounded chain of same-origin next links (E-REL2)", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockImplementation(async () =>
        fakeResponse({
          ok: true,
          body: [{ id: 1, title: "Item" }],
          linkHeader: '<https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics?page=loop>; rel="next"',
        })
      );

      await expect(listAnnouncements(COURSE_URL, "MCC", { allPages: true })).rejects.toThrow(
        new RegExp(`exceeded ${CANVAS_PAGINATION_PAGE_CAP} pages`)
      );
      expect(fetchMock).toHaveBeenCalledTimes(CANVAS_PAGINATION_PAGE_CAP);
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

  describe("buildAnnouncementBodyHtml (the companion-image wave)", () => {
    it("with no image, is byte-identical to plain textToHtml - the pre-image behavior every existing caller still gets", () => {
      expect(buildAnnouncementBodyHtml("Hello\n\nSecond paragraph")).toBe(
        "<p>Hello</p><p>Second paragraph</p>"
      );
    });

    it("with an image, appends an <img> with the given src and alt after the text, never before or inside it", () => {
      const html = buildAnnouncementBodyHtml("Hello there", {
        url: "https://canvas.mccneb.edu/files/9/download",
        altText: "Illustration accompanying the announcement: Hello there",
      });
      expect(html).toBe(
        '<p>Hello there</p><p><img src="https://canvas.mccneb.edu/files/9/download" alt="Illustration accompanying the announcement: Hello there"></p>'
      );
    });

    it("escapes both the url and alt text attributes (no raw quote/angle-bracket break-out)", () => {
      const html = buildAnnouncementBodyHtml("Hi", {
        url: 'https://example.com/x?a=1&b=2"><script>',
        altText: 'A "quoted" & <tagged> description',
      });
      expect(html).toContain('src="https://example.com/x?a=1&amp;b=2&quot;&gt;&lt;script&gt;"');
      expect(html).toContain('alt="A &quot;quoted&quot; &amp; &lt;tagged&gt; description"');
      expect(html).not.toContain("<script>");
    });

    it("end-to-end with a hostile subject: the real course-scoped src (courseFileDownloadUrl) plus a real derived alt text (buildAnnouncementImageAltText) containing a quote and an angle bracket still escape safely (frozen literal)", () => {
      const courseUrl = "https://canvas.mccneb.edu/courses/123";
      const src = courseFileDownloadUrl(courseUrl, 999)!;
      const altText = buildAnnouncementImageAltText('Week 3: "Midterm" <Review>');

      const html = buildAnnouncementBodyHtml("Hello there", { url: src, altText });

      expect(html).toBe(
        '<p>Hello there</p><p><img src="https://canvas.mccneb.edu/courses/123/files/999/download" alt="Illustration accompanying the announcement: Week 3: &quot;Midterm&quot; &lt;Review&gt;"></p>'
      );
      // Sabotage check: the raw hostile characters must never survive
      // unescaped - a naive implementation that forgot to escape the alt
      // text would let the angle bracket break out of the attribute.
      expect(html).not.toContain('<Review>');
      expect(html).not.toContain('"Midterm"');
    });

    it("sabotage check: this test would fail if the alt attribute were ever dropped or left empty", () => {
      const sabotagedHtml = '<p>Hello there</p><p><img src="https://canvas.mccneb.edu/files/9/download" alt=""></p>';
      const realHtml = buildAnnouncementBodyHtml("Hello there", {
        url: "https://canvas.mccneb.edu/files/9/download",
        altText: "Illustration accompanying the announcement: Hello there",
      });
      expect(realHtml).not.toBe(sabotagedHtml);
      expect(realHtml).not.toMatch(/alt=""/);
    });
  });

  describe("createAnnouncement - optional image argument", () => {
    it("with no image argument, posts message=textToHtml(message) exactly as before (byte-identical to the pre-image request body)", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(fakeResponse({ ok: true, body: { id: 1, title: "T" } }));

      await createAnnouncement(COURSE_URL, "T", "Hello there", "MCC");

      const [, init] = fetchMock.mock.calls[0];
      // Parsed via URLSearchParams rather than a raw string/encodeURIComponent
      // comparison - form-urlencoded space handling ("+") differs from
      // encodeURIComponent's ("%20"), so a raw-string comparison would be
      // testing the wrong encoding, not the actual posted value.
      const sent = new URLSearchParams(String(init?.body));
      expect(sent.get("message")).toBe("<p>Hello there</p>");
    });

    it("with an image argument, the posted message HTML includes the <img> with its alt text", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValue(fakeResponse({ ok: true, body: { id: 1, title: "T" } }));

      await createAnnouncement(COURSE_URL, "T", "Hello there", "MCC", null, {
        url: "https://canvas.mccneb.edu/files/9/download",
        altText: "An illustration",
      });

      const [, init] = fetchMock.mock.calls[0];
      const sent = new URLSearchParams(String(init?.body));
      expect(sent.get("message")).toBe(
        '<p>Hello there</p><p><img src="https://canvas.mccneb.edu/files/9/download" alt="An illustration"></p>'
      );
    });

    it("the returned CanvasAnnouncement's plain-text `message` field never contains the image markup (Canvas's own HTML-to-text strips the <img> tag)", async () => {
      const fetchMock = vi.mocked(fetch);
      // Simulate Canvas echoing back the posted HTML (including the <img>) as
      // `topic.message`, exactly as the real API does.
      fetchMock.mockResolvedValue(
        fakeResponse({
          ok: true,
          body: {
            id: 1,
            title: "T",
            message: '<p>Hello there</p><p><img src="https://canvas.mccneb.edu/files/9/download" alt="An illustration"></p>',
          },
        })
      );

      const result = await createAnnouncement(COURSE_URL, "T", "Hello there", "MCC", null, {
        url: "https://canvas.mccneb.edu/files/9/download",
        altText: "An illustration",
      });

      expect(result.message).toBe("Hello there");
      expect(result.message.toLowerCase()).not.toContain("img");
      expect(result.message).not.toContain("<");
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

  describe("exportCourseCartridge - the fetch-then-retry-with-bearer primitive (E-CRIT1/SEC3)", () => {
    it("downloads a same-origin export attachment, retrying with the bearer token only against the SAME resolved URL the unauthenticated attempt used", async () => {
      const fetchMock = vi.mocked(fetch);
      const attachmentUrl = "https://canvas.mccneb.edu/files/1/download";
      fetchMock
        .mockResolvedValueOnce(fakeResponse({ ok: true, body: { id: "exp-1" } }))
        .mockResolvedValueOnce(
          fakeResponse({
            ok: true,
            body: {
              workflow_state: "exported",
              attachment: { url: attachmentUrl, filename: "course.imscc" },
            },
          })
        )
        .mockResolvedValueOnce({ ok: false, status: 404 } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          arrayBuffer: async () => new TextEncoder().encode("cartridge-bytes").buffer,
        } as unknown as Response);

      const result = await exportCourseCartridge(COURSE_URL, "MCC");

      expect(result.fileName).toBe("course.imscc");
      expect(result.base64).toBe(Buffer.from("cartridge-bytes").toString("base64"));
      expect(fetchMock).toHaveBeenCalledTimes(4);
      // Both the unauthenticated first attempt and the authenticated retry
      // dial the SAME resolved URL - the guard's return value, not a second,
      // independently-computed string.
      expect(String(fetchMock.mock.calls[2][0])).toBe(attachmentUrl);
      expect(String(fetchMock.mock.calls[3][0])).toBe(attachmentUrl);
      // The first attempt carried no Authorization header at all.
      expect(fetchMock.mock.calls[2][1]).toBeUndefined();
      const retryInit = fetchMock.mock.calls[3][1];
      expect((retryInit?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    });

    it("never sends the bearer token to a DIFFERENT host, even though the free download may go there (exfiltration case)", async () => {
      // THE PROPERTY IS ABOUT THE TOKEN, NOT ABOUT THE ORIGIN.
      //
      // An earlier version of this guard required same-origin for BOTH
      // fetches, which would have broken real Canvas: a content-export
      // attachment is routinely served from a separate storage host. So the
      // unauthenticated download is allowed to leave the Canvas origin (it
      // carries no credential), and only the retry - the one that attaches
      // the bearer - is origin-locked. A cross-host attachment that fails
      // free therefore fails the whole operation instead of being retried
      // with the token, which is the outcome worth having.
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(fakeResponse({ ok: true, body: { id: "exp-1" } }))
        .mockResolvedValueOnce(
          fakeResponse({
            ok: true,
            body: {
              workflow_state: "exported",
              attachment: { url: "https://collector.evil/steal", filename: "course.imscc" },
            },
          })
        )
        // The free download is attempted and fails, which is what would
        // otherwise trigger the retry-with-bearer.
        .mockResolvedValueOnce(fakeResponse({ ok: false, body: {} }));

      await expect(exportCourseCartridge(COURSE_URL, "MCC")).rejects.toThrow(
        /Refusing to follow a Canvas-supplied URL/
      );

      // The hostile host WAS dialled once, unauthenticated - and that call
      // must carry no Authorization header. The retry never happened.
      const hostileCalls = fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes("collector.evil")
      );
      expect(hostileCalls).toHaveLength(1);
      for (const call of hostileCalls) {
        const headers = (call[1]?.headers ?? {}) as Record<string, string>;
        expect(
          headers.Authorization,
          "the bearer token was sent to a host outside the Canvas origin"
        ).toBeUndefined();
      }
    });

    it("downloads an export served from a SEPARATE storage host, which real Canvas does", async () => {
      // The regression the split exists to prevent. Requiring same-origin on
      // the free download would turn this legitimate case into a hard
      // failure, and it is the common case for content exports.
      const fetchMock = vi.mocked(fetch);
      fetchMock
        .mockResolvedValueOnce(fakeResponse({ ok: true, body: { id: "exp-1" } }))
        .mockResolvedValueOnce(
          fakeResponse({
            ok: true,
            body: {
              workflow_state: "exported",
              attachment: {
                url: "https://instructure-uploads.s3.amazonaws.com/exports/course.imscc",
                filename: "course.imscc",
              },
            },
          })
        )
        // The download itself returns bytes, not JSON, so it needs a real
        // arrayBuffer - fakeResponse only models the JSON endpoints.
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          arrayBuffer: async () => new TextEncoder().encode("cartridge-bytes").buffer,
          headers: { get: () => null },
        } as unknown as Response);

      const result = await exportCourseCartridge(COURSE_URL, "MCC");
      expect(result.fileName).toBe("course.imscc");

      const storageCalls = fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes("s3.amazonaws.com")
      );
      expect(storageCalls).toHaveLength(1);
      const headers = (storageCalls[0][1]?.headers ?? {}) as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    });
  });
});
