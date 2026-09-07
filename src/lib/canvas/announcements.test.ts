// Entry 235 check 9 of docs/REGRESSION.md records that NO existing test
// exercised src/lib/canvas/announcements.ts before this feature. Covers the
// items docs/weekly-announcement-scheduling-acceptance-criteria.md's own
// "Tests still owed" section names as the cheapest high-value gap: the
// endpoint (item 15), the explicit page size (item 16), the sort contract
// (item 17), and the pagination opt-in (item 13 - exactly ONE request when
// the flag is absent). Also covers the three new resilient/reschedule/
// read-back functions this feature adds (AC6, AC7).
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
//
// Group E wave 4b: every bearer-carrying fetch in announcements.ts now goes
// through canvasGet/canvasRequest (src/lib/canvas-fetch-response.ts), which
// call canvasFetch (src/lib/canvas-fetch.ts) - real node:https with a real
// DNS lookup, which a global.fetch stub does not intercept. So this file
// mocks canvasFetch AT THE MODULE BOUNDARY (`vi.mock("../canvas-fetch", ...)`)
// for every test that exercises one of those calls - the same boundary
// src/lib/canvas-modules/fetch-helpers.canvas-fetch.test.ts already
// established for fetch-helpers.ts's own migration. globalThis.fetch is
// STILL stubbed, and still matters: exportCourseCartridge's unauthenticated
// "free download" attempt (see that function's own doc comment on the
// attachment split) carries no bearer token and deliberately stays on the
// platform's bare fetch, so its tests mock BOTH boundaries - canvasFetch for
// the export-create/status-poll/authenticated-retry calls, and global.fetch
// for the one call that never carries a credential.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../supabase/effective-identity", () => ({
  getEffectiveIdentity: vi.fn(),
}));
vi.mock("../lms-credentials", () => ({
  getLmsCredentialSecret: vi.fn(),
  recordLmsCredentialFailure: vi.fn(),
}));
vi.mock("../canvas-fetch", () => ({ canvasFetch: vi.fn() }));

import {
  listAnnouncements,
  createAnnouncement,
  createAnnouncementFromMarkdown,
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
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";

const mockGetEffectiveIdentity = vi.mocked(getEffectiveIdentity);
const mockGetLmsCredentialSecret = vi.mocked(getLmsCredentialSecret);
const mockRecordLmsCredentialFailure = vi.mocked(recordLmsCredentialFailure);
const mockCanvasFetch = vi.mocked(canvasFetch);

const OWNER_IDENTITY = { id: "owner-1", email: "owner@example.edu", role: "owner" as const, status: "active" as const };

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body - every
 * migrated bearer-carrying call in announcements.ts except the export-
 * cartridge download reads its response this way. */
function okResult(body: unknown, status = 200, headers: Record<string, string> = {}): CanvasFetchResult {
  return { ok: true, status, headers, body: Buffer.from(JSON.stringify(body)) };
}

/** Builds an `ok: true` CanvasFetchResult carrying raw bytes, not JSON - the
 * export-cartridge download's authenticated retry calls `.arrayBuffer()`,
 * never `.json()`. */
function okBytesResult(text: string, status = 200, headers: Record<string, string> = {}): CanvasFetchResult {
  return { ok: true, status, headers, body: Buffer.from(text) };
}

/** Builds a bare-`fetch` Response - used ONLY for exportCourseCartridge's
 * unauthenticated "free download" attempt, the one call in this file that
 * deliberately stays on the platform's fetch instead of canvasFetch (see
 * announcements.ts's own doc comment on the attachment split: this call
 * carries no bearer token, so canvasFetch's DNS-pinning/redirect protections
 * exist to protect a credential this call never sends). */
function fakeFetchResponse(opts: { ok: boolean; status?: number; arrayBufferText?: string }): Response {
  return {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 500),
    arrayBuffer: async () => new TextEncoder().encode(opts.arrayBufferText ?? "").buffer,
  } as unknown as Response;
}

describe("Canvas announcements transport", () => {
  beforeEach(() => {
    vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn());
    mockCanvasFetch.mockReset();
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
      mockCanvasFetch.mockResolvedValue(
        okResult(
          [{ id: 1, title: "A", posted_at: "2026-01-05T00:00:00Z" }],
          200,
          { link: '<https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics?page=2>; rel="next"' }
        )
      );

      await listAnnouncements(COURSE_URL, "MCC");

      expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
      const [url] = mockCanvasFetch.mock.calls[0];
      expect(String(url)).toBe(
        "https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics?only_announcements=true&per_page=50"
      );
    });

    it("follows Link-header pagination across pages when allPages is true, stopping when rel=next is absent", async () => {
      mockCanvasFetch
        .mockResolvedValueOnce(
          okResult(
            [{ id: 1, title: "Page one item" }],
            200,
            { link: '<https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics?page=2>; rel="next"' }
          )
        )
        .mockResolvedValueOnce(okResult([{ id: 2, title: "Page two item" }], 200, {}));

      const result = await listAnnouncements(COURSE_URL, "MCC", { allPages: true });

      expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
      expect(String(mockCanvasFetch.mock.calls[1][0])).toBe(
        "https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics?page=2"
      );
      expect(result.map((a) => a.id).sort()).toEqual([1, 2]);
    });

    it("refuses to follow a Link-header rel=next that points at a DIFFERENT host, and never sends the bearer token there (E-CRIT1 exfiltration case)", async () => {
      mockCanvasFetch.mockResolvedValueOnce(
        okResult([{ id: 1, title: "Page one item" }], 200, { link: '<https://collector.evil/steal>; rel="next"' })
      );

      await expect(listAnnouncements(COURSE_URL, "MCC", { allPages: true })).rejects.toThrow(
        /Refusing to follow a Canvas-supplied URL/
      );

      // Only the first, legitimate request happened - the hostile "next"
      // link was never dialed at all, so the bearer token was never sent to
      // collector.evil in any form (neither the retry-with-bearer shape nor
      // any other).
      expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
      for (const call of mockCanvasFetch.mock.calls) {
        expect(String(call[0])).not.toContain("collector.evil");
      }
    });

    it("stops after CANVAS_PAGINATION_PAGE_CAP pages rather than following an unbounded chain of same-origin next links (E-REL2)", async () => {
      mockCanvasFetch.mockImplementation(async () =>
        okResult(
          [{ id: 1, title: "Item" }],
          200,
          { link: '<https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics?page=loop>; rel="next"' }
        )
      );

      await expect(listAnnouncements(COURSE_URL, "MCC", { allPages: true })).rejects.toThrow(
        new RegExp(`exceeded ${CANVAS_PAGINATION_PAGE_CAP} pages`)
      );
      expect(mockCanvasFetch).toHaveBeenCalledTimes(CANVAS_PAGINATION_PAGE_CAP);
    });

    it("preserves the sort contract: scheduled items first by soonest delayedPostAt, then posted items by newest postedAt (entry 235 check 3)", async () => {
      mockCanvasFetch.mockResolvedValue(
        okResult([
          { id: 1, title: "Posted older", posted_at: "2026-01-01T00:00:00Z" },
          { id: 2, title: "Scheduled later", delayed_post_at: "2026-02-01T00:00:00Z" },
          { id: 3, title: "Posted newer", posted_at: "2026-01-10T00:00:00Z" },
          { id: 4, title: "Scheduled sooner", delayed_post_at: "2026-01-20T00:00:00Z" },
        ])
      );

      const result = await listAnnouncements(COURSE_URL, "MCC");
      expect(result.map((a) => a.id)).toEqual([4, 2, 3, 1]);
    });
  });

  describe("createScheduledAnnouncementResilient", () => {
    it("posts is_announcement=true and delayed_post_at, returning the created id", async () => {
      mockCanvasFetch.mockResolvedValue(okResult({ id: 555 }));

      const result = await createScheduledAnnouncementResilient(
        COURSE_URL,
        "Week 1",
        "Hello",
        "2026-01-05T08:00:00.000Z",
        "MCC"
      );

      expect(result).toEqual({ id: 555 });
      const [url, init, credential] = mockCanvasFetch.mock.calls[0];
      expect(String(url)).toBe("https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics");
      expect(init.method).toBe("POST");
      const body = String(init.body);
      expect(body).toContain("is_announcement=true");
      expect(body).toContain(encodeURIComponent("2026-01-05T08:00:00.000Z"));
      // canvasFetch attaches the bearer itself from the credential argument -
      // canvasRequest never builds an Authorization header of its own.
      expect(credential).toEqual({ token: "test-token" });
      expect(Object.keys(init.headers ?? {})).not.toContain("Authorization");
    });

    it("retries on 429/403 with bounded backoff and eventually succeeds (AC7)", async () => {
      vi.useFakeTimers();
      mockCanvasFetch
        .mockResolvedValueOnce(okResult({}, 429))
        .mockResolvedValueOnce(okResult({}, 403))
        .mockResolvedValueOnce(okResult({ id: 777 }));

      const promise = createScheduledAnnouncementResilient(COURSE_URL, "Week 1", "Hi", "2026-01-05T08:00:00.000Z", "MCC");
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual({ id: 777 });
      expect(mockCanvasFetch).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
    });

    it("stops after a bounded number of attempts and throws a clear error", async () => {
      vi.useFakeTimers();
      mockCanvasFetch.mockResolvedValue(okResult({}, 429));

      const promise = createScheduledAnnouncementResilient(COURSE_URL, "Week 1", "Hi", "2026-01-05T08:00:00.000Z", "MCC");
      const expectation = expect(promise).rejects.toThrow(/HTTP 429/);
      await vi.runAllTimersAsync();
      await expectation;
      // Bounded: not an unbounded retry loop.
      expect(mockCanvasFetch.mock.calls.length).toBeLessThanOrEqual(4);
      vi.useRealTimers();
    });
  });

  describe("updateAnnouncementSchedule", () => {
    it("PUTs delayed_post_at only, to the topic-specific URL", async () => {
      mockCanvasFetch.mockResolvedValue(okResult({}));

      await updateAnnouncementSchedule(COURSE_URL, 42, "2026-01-12T08:00:00.000Z", "MCC");

      const [url, init] = mockCanvasFetch.mock.calls[0];
      expect(String(url)).toBe("https://canvas.mccneb.edu/api/v1/courses/123/discussion_topics/42");
      expect(init.method).toBe("PUT");
      expect(String(init.body)).toBe(`delayed_post_at=${encodeURIComponent("2026-01-12T08:00:00.000Z")}`);
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
      mockCanvasFetch.mockResolvedValue(okResult({ id: 1, title: "T" }));

      await createAnnouncement(COURSE_URL, "T", "Hello there", "MCC");

      const [, init] = mockCanvasFetch.mock.calls[0];
      // Parsed via URLSearchParams rather than a raw string/encodeURIComponent
      // comparison - form-urlencoded space handling ("+") differs from
      // encodeURIComponent's ("%20"), so a raw-string comparison would be
      // testing the wrong encoding, not the actual posted value.
      const sent = new URLSearchParams(String(init.body));
      expect(sent.get("message")).toBe("<p>Hello there</p>");
    });

    it("with an image argument, the posted message HTML includes the <img> with its alt text", async () => {
      mockCanvasFetch.mockResolvedValue(okResult({ id: 1, title: "T" }));

      await createAnnouncement(COURSE_URL, "T", "Hello there", "MCC", null, {
        url: "https://canvas.mccneb.edu/files/9/download",
        altText: "An illustration",
      });

      const [, init] = mockCanvasFetch.mock.calls[0];
      const sent = new URLSearchParams(String(init.body));
      expect(sent.get("message")).toBe(
        '<p>Hello there</p><p><img src="https://canvas.mccneb.edu/files/9/download" alt="An illustration"></p>'
      );
    });

    it("the returned CanvasAnnouncement's plain-text `message` field never contains the image markup (Canvas's own HTML-to-text strips the <img> tag)", async () => {
      // Simulate Canvas echoing back the posted HTML (including the <img>) as
      // `topic.message`, exactly as the real API does.
      mockCanvasFetch.mockResolvedValue(
        okResult({
          id: 1,
          title: "T",
          message: '<p>Hello there</p><p><img src="https://canvas.mccneb.edu/files/9/download" alt="An illustration"></p>',
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

  // docs/announcement-from-walkthrough-acceptance-criteria.md, decision P1:
  // the exemplar-driven walkthrough drafter emits Markdown, and posting it
  // through the plain-text path (createAnnouncement/textToHtml) would
  // publish literal "##"/"-" characters to every student. These tests pin
  // that createAnnouncementFromMarkdown takes the OTHER path
  // (markdownToHtml) and that createAnnouncement above is completely
  // untouched by this addition.
  describe("createAnnouncementFromMarkdown (P1: markdownToHtml, never textToHtml)", () => {
    it("renders a Markdown heading and list as real HTML elements, not escaped literal characters", async () => {
      mockCanvasFetch.mockResolvedValue(okResult({ id: 1, title: "T" }));

      await createAnnouncementFromMarkdown(COURSE_URL, "T", "## Due this week\n- Homework 3\n- Quiz 2", "MCC");

      const [, init] = mockCanvasFetch.mock.calls[0];
      const sent = new URLSearchParams(String(init.body));
      const message = sent.get("message") ?? "";
      expect(message).toBe("<h2>Due this week</h2>\n<ul><li>Homework 3</li><li>Quiz 2</li></ul>");
      // Sabotage check: a regression back to textToHtml would escape the
      // markdown characters and wrap the whole thing in one <p>, never
      // produce a real <h2>/<ul>.
      expect(message).not.toContain("##");
      expect(message).not.toMatch(/^<p>/);
    });

    it("with an image argument, appends the same <img> shape buildAnnouncementBodyHtml uses", async () => {
      mockCanvasFetch.mockResolvedValue(okResult({ id: 1, title: "T" }));

      await createAnnouncementFromMarkdown(COURSE_URL, "T", "Plain paragraph.", "MCC", null, {
        url: "https://canvas.mccneb.edu/files/9/download",
        altText: "An illustration",
      });

      const [, init] = mockCanvasFetch.mock.calls[0];
      const sent = new URLSearchParams(String(init.body));
      expect(sent.get("message")).toBe(
        '<p>Plain paragraph.</p><p><img src="https://canvas.mccneb.edu/files/9/download" alt="An illustration"></p>'
      );
    });

    it("rejects a blank title/body before ever calling Canvas, same validation as createAnnouncement", async () => {
      await expect(createAnnouncementFromMarkdown(COURSE_URL, "", "Body", "MCC")).rejects.toThrow(
        "An announcement needs a title."
      );
      await expect(createAnnouncementFromMarkdown(COURSE_URL, "Title", "   ", "MCC")).rejects.toThrow(
        "An announcement needs a message."
      );
      expect(mockCanvasFetch).not.toHaveBeenCalled();
    });

    it("does not change createAnnouncement's own plain-text behavior (sabotage check: the two functions stay independent)", async () => {
      mockCanvasFetch.mockResolvedValue(okResult({ id: 1, title: "T" }));

      await createAnnouncement(COURSE_URL, "T", "## Not markdown here, just text", "MCC");

      const [, init] = mockCanvasFetch.mock.calls[0];
      const sent = new URLSearchParams(String(init.body));
      // createAnnouncement must still HTML-escape and wrap in <p> - a
      // regression that routed it through markdownToHtml too would turn
      // this literal "##" into a real heading.
      expect(sent.get("message")).toBe("<p>## Not markdown here, just text</p>");
    });
  });

  describe("getAnnouncementById", () => {
    it("returns null on 404 instead of throwing", async () => {
      mockCanvasFetch.mockResolvedValue(okResult({}, 404));

      const result = await getAnnouncementById(COURSE_URL, 99, "MCC");
      expect(result).toBeNull();
    });

    it("returns the mapped announcement on success", async () => {
      mockCanvasFetch.mockResolvedValue(
        okResult({ id: 88, title: "Week 3", delayed_post_at: "2026-01-19T08:00:00Z" })
      );

      const result = await getAnnouncementById(COURSE_URL, 88, "MCC");
      expect(result).toMatchObject({ id: 88, title: "Week 3", delayedPostAt: "2026-01-19T08:00:00Z" });
    });
  });

  describe("exportCourseCartridge - the fetch-then-retry-with-bearer primitive (E-CRIT1/SEC3)", () => {
    it("downloads a same-origin export attachment, retrying with the bearer token only against the SAME resolved URL the unauthenticated attempt used", async () => {
      const fetchMock = vi.mocked(fetch);
      const attachmentUrl = "https://canvas.mccneb.edu/files/1/download";
      mockCanvasFetch
        .mockResolvedValueOnce(okResult({ id: "exp-1" }))
        .mockResolvedValueOnce(
          okResult({
            workflow_state: "exported",
            attachment: { url: attachmentUrl, filename: "course.imscc" },
          })
        )
        .mockResolvedValueOnce(okBytesResult("cartridge-bytes"));
      fetchMock.mockResolvedValueOnce(fakeFetchResponse({ ok: false, status: 404 }));

      const result = await exportCourseCartridge(COURSE_URL, "MCC");

      expect(result.fileName).toBe("course.imscc");
      expect(result.base64).toBe(Buffer.from("cartridge-bytes").toString("base64"));

      // The unauthenticated free download - the one call in this function
      // that stays on the platform's bare fetch - dials the resolved
      // attachment URL directly, with no init argument at all (no headers of
      // any kind, so certainly no Authorization).
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toBe(attachmentUrl);
      expect(fetchMock.mock.calls[0][1]).toBeUndefined();

      // The authenticated retry - the third canvasFetch call, after export
      // creation and status polling - dials the SAME resolved URL the free
      // download used, via the credential argument (canvasFetch attaches the
      // bearer itself), never a manually-built Authorization header.
      expect(mockCanvasFetch).toHaveBeenCalledTimes(3);
      const [retryUrl, retryInit, retryCredential] = mockCanvasFetch.mock.calls[2];
      expect(retryUrl).toBe(attachmentUrl);
      expect(retryInit).toEqual({});
      expect(retryCredential).toEqual({ token: "test-token" });
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
      mockCanvasFetch
        .mockResolvedValueOnce(okResult({ id: "exp-1" }))
        .mockResolvedValueOnce(
          okResult({
            workflow_state: "exported",
            attachment: { url: "https://collector.evil/steal", filename: "course.imscc" },
          })
        );
      // The free download is attempted and fails, which is what would
      // otherwise trigger the retry-with-bearer.
      fetchMock.mockResolvedValueOnce(fakeFetchResponse({ ok: false, status: 500 }));

      await expect(exportCourseCartridge(COURSE_URL, "MCC")).rejects.toThrow(
        /Refusing to follow a Canvas-supplied URL/
      );

      // The hostile host WAS dialled once, unauthenticated (bare fetch, no
      // init argument at all - so certainly no Authorization header). The
      // bearer-carrying retry never happened: assertCanvasSuppliedUrlIsSameOrigin
      // throws before canvasGet/canvasFetch is ever called with this URL.
      const hostileCalls = fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes("collector.evil")
      );
      expect(hostileCalls).toHaveLength(1);
      expect(hostileCalls[0][1]).toBeUndefined();

      expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
      for (const call of mockCanvasFetch.mock.calls) {
        expect(String(call[0])).not.toContain("collector.evil");
      }
    });

    it("downloads an export served from a SEPARATE storage host, which real Canvas does", async () => {
      // The regression the split exists to prevent. Requiring same-origin on
      // the free download would turn this legitimate case into a hard
      // failure, and it is the common case for content exports.
      const fetchMock = vi.mocked(fetch);
      mockCanvasFetch
        .mockResolvedValueOnce(okResult({ id: "exp-1" }))
        .mockResolvedValueOnce(
          okResult({
            workflow_state: "exported",
            attachment: {
              url: "https://instructure-uploads.s3.amazonaws.com/exports/course.imscc",
              filename: "course.imscc",
            },
          })
        );
      // The download itself returns bytes, not JSON, so it needs a real
      // arrayBuffer - fakeFetchResponse only models that shape.
      fetchMock.mockResolvedValueOnce(fakeFetchResponse({ ok: true, status: 200, arrayBufferText: "cartridge-bytes" }));

      const result = await exportCourseCartridge(COURSE_URL, "MCC");
      expect(result.fileName).toBe("course.imscc");

      const storageCalls = fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes("s3.amazonaws.com")
      );
      expect(storageCalls).toHaveLength(1);
      expect(storageCalls[0][1]).toBeUndefined();

      // The free download already succeeded, so no bearer-carrying retry
      // through canvasFetch was ever needed - only export creation and
      // status polling.
      expect(mockCanvasFetch).toHaveBeenCalledTimes(2);
    });
  });
});
