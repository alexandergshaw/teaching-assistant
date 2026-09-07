// TDD suite for the page write layer's post-design correction
// (docs/llm-command-interface-acceptance-criteria.md section 10, errata G5).
//
// canvas.mccneb.edu is the hardcoded host for the "MCC" institution code in
// src/lib/canvas-core.ts.
//
// resolveCourse (via resolveInstitutionByCode) now delegates credential
// resolution to canvas-credentials.ts, which resolves the calling identity
// server-side before ever reading an env var (E-ARCH4). Mocking the identity
// to role: "owner" (E-ARCH6's uniform convention across every one of this
// repo's Canvas test files) keeps the env-var branch this suite's
// vi.stubEnv calls rely on reachable, without a real Supabase call - the
// stored-credential branch is mocked to "no row" (null) so it falls through
// to that owner env branch instead of attempting a real DB read.
vi.mock("../supabase/effective-identity", () => ({
  getEffectiveIdentity: vi.fn().mockResolvedValue({
    id: "owner-1",
    email: "owner@example.edu",
    role: "owner",
    status: "active",
  }),
}));
vi.mock("../lms-credentials", () => ({
  getLmsCredentialSecret: vi.fn().mockResolvedValue(null),
  recordLmsCredentialFailure: vi.fn().mockResolvedValue(undefined),
}));

// fetch-helpers.ts's writeJson now dials Canvas through canvasFetch
// (src/lib/canvas-fetch.ts, real DNS resolution + connection pinning), not
// the platform fetch - stubbing globalThis.fetch (this file's previous
// approach) no longer intercepts anything updatePage does, which is why every
// test below used to hang until timeout.
//
// Mocked at the fetch-helpers boundary (writeJson itself) rather than at
// canvasFetch: this suite is entirely about the URL updatePage addresses
// (slug vs page_id:<id> - errata G5) and the params it sends, neither of
// which lives inside fetch-helpers.ts, and no test here exercises pagination
// or a 429 retry (both already covered by fetch-helpers.canvas-fetch.test.ts
// / fetch-helpers.throttle.test.ts).
vi.mock("./fetch-helpers", () => ({ writeJson: vi.fn() }));

// getPage, unlike updatePage, never went through fetch-helpers.ts - it
// dialled the platform `fetch` directly. It now dials Canvas through
// canvasGet (src/lib/canvas-fetch-response.ts), which itself goes through
// canvasFetch - mocked at that module boundary, same as
// fetch-helpers.canvas-fetch.test.ts, so canvasGet's own
// result-to-Response/throw mapping still runs for real.
vi.mock("../canvas-fetch", () => ({ canvasFetch: vi.fn() }));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { updatePage, getPage, codeFileToPageHtml } from "./pages";
import { writeJson } from "./fetch-helpers";
import { canvasFetch, type CanvasFetchResult } from "../canvas-fetch";

const mockWriteJson = vi.mocked(writeJson);
const mockCanvasFetch = vi.mocked(canvasFetch);

/** Builds an `ok: true` CanvasFetchResult carrying a JSON body - the shape
 * canvasGet's underlying canvasFetch returns for a completed exchange. */
function okResult(body: unknown, status = 200): CanvasFetchResult {
  return { ok: true, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";

function writeJsonCall(index = 0): [string, string, unknown, URLSearchParams | undefined] {
  return mockWriteJson.mock.calls[index] as unknown as [string, string, unknown, URLSearchParams | undefined];
}

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
  mockWriteJson.mockReset();
  mockCanvasFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getPage - migrated to canvasGet (the shared adapter), never platform fetch", () => {
  it("fetches the page by slug and maps its body/publish state", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult({
        page_id: 501,
        url: "week-3-notes",
        title: "Week 3 Notes",
        body: "<p>hi</p>",
        published: true,
        updated_at: "2026-08-24T00:00:00Z",
      })
    );

    const result = await getPage(COURSE_URL, "week-3-notes", "MCC");

    expect(mockCanvasFetch).toHaveBeenCalledTimes(1);
    expect(mockCanvasFetch.mock.calls[0][0]).toBe(
      "https://canvas.mccneb.edu/api/v1/courses/123/pages/week-3-notes"
    );
    // The credential is passed to canvasFetch itself, never as a
    // caller-built Authorization header.
    expect(mockCanvasFetch.mock.calls[0][2]).toEqual({ token: "test-token" });
    expect(result).toEqual({
      pageId: 501,
      url: "week-3-notes",
      title: "Week 3 Notes",
      body: "<p>hi</p>",
      published: true,
      updatedAt: "2026-08-24T00:00:00Z",
    });
  });

  it("URL-encodes the slug when addressing the page", async () => {
    mockCanvasFetch.mockResolvedValueOnce(
      okResult({ page_id: 1, url: "a page", title: "A Page", body: "", published: false })
    );

    await getPage(COURSE_URL, "a page", "MCC");

    expect(mockCanvasFetch.mock.calls[0][0]).toBe("https://canvas.mccneb.edu/api/v1/courses/123/pages/a%20page");
  });

  it("throws canvasError's mapped message on a non-ok status, unchanged from before the migration", async () => {
    mockCanvasFetch.mockResolvedValueOnce(okResult({}, 404));

    await expect(getPage(COURSE_URL, "missing-page", "MCC")).rejects.toThrow(
      "Canvas could not find that resource. Check the URL and that the token's account can see it."
    );
  });

  it("throws a fixed literal - never anything derived from the underlying failure - when Canvas is unreachable", async () => {
    mockCanvasFetch.mockResolvedValueOnce({ ok: false, kind: "unreachable" });

    await expect(getPage(COURSE_URL, "week-3-notes", "MCC")).rejects.toThrow("Canvas did not respond.");
  });
});

describe("updatePage: G5 - addressing", () => {
  it("addresses by slug when no pageId is given (existing one-shot-edit callers unchanged)", async () => {
    mockWriteJson.mockResolvedValueOnce({
      page_id: 501,
      url: "week-3-notes",
      title: "Week 3 Notes",
      body: "<p>hi</p>",
      published: true,
    });

    await updatePage(COURSE_URL, "week-3-notes", { title: "Week 3 Notes" }, "MCC");

    expect(mockWriteJson).toHaveBeenCalledTimes(1);
    const [url, method] = writeJsonCall();
    expect(url).toBe("https://canvas.mccneb.edu/api/v1/courses/123/pages/week-3-notes");
    expect(method).toBe("PUT");
  });

  it("addresses by page_id:<id> when opts.pageId is given, ignoring the (possibly stale) slug in the URL", async () => {
    mockWriteJson.mockResolvedValueOnce({
      page_id: 501,
      url: "week-3-notes-2",
      title: "Week 3 Notes (renamed)",
      body: "<p>hi</p>",
      published: true,
    });

    await updatePage(
      COURSE_URL,
      "week-3-notes", // deliberately the OLD/stale slug
      { title: "Week 3 Notes (renamed)" },
      "MCC",
      { pageId: 501 }
    );

    expect(mockWriteJson).toHaveBeenCalledTimes(1);
    const [url] = writeJsonCall();
    expect(url).toBe("https://canvas.mccneb.edu/api/v1/courses/123/pages/page_id:501");
    // The stale slug must never appear in the URL when pageId is given.
    expect(url).not.toContain("week-3-notes/");
    expect(url.endsWith("week-3-notes")).toBe(false);
  });

  it("still sends wiki_page[title] from the fields argument even when addressing by id (id only changes the URL, not the body)", async () => {
    mockWriteJson.mockResolvedValueOnce({
      page_id: 501,
      url: "week-3-notes-2",
      title: "Week 3 Notes (renamed)",
      body: "<p>hi</p>",
      published: true,
    });

    await updatePage(COURSE_URL, "week-3-notes", { title: "Week 3 Notes (renamed)" }, "MCC", { pageId: 501 });

    const [, , , params] = writeJsonCall();
    expect(params?.get("wiki_page[title]")).toBe("Week 3 Notes (renamed)");
  });

  it("a retry after a title change, addressed by id, hits the SAME URL both times (no duplicate-page shape)", async () => {
    mockWriteJson.mockResolvedValue({
      page_id: 501,
      url: "week-3-notes-2",
      title: "Week 3 Notes (renamed)",
      body: "<p>hi</p>",
      published: true,
    });

    await updatePage(COURSE_URL, "week-3-notes", { title: "Week 3 Notes (renamed)" }, "MCC", { pageId: 501 });
    await updatePage(COURSE_URL, "week-3-notes", { title: "Week 3 Notes (renamed)" }, "MCC", { pageId: 501 });

    expect(mockWriteJson).toHaveBeenCalledTimes(2);
    const [firstUrl] = writeJsonCall(0);
    const [secondUrl] = writeJsonCall(1);
    expect(firstUrl).toBe(secondUrl);
    expect(firstUrl).toBe("https://canvas.mccneb.edu/api/v1/courses/123/pages/page_id:501");
  });

  it("returns the mapped saved page either way", async () => {
    mockWriteJson.mockResolvedValueOnce({
      page_id: 501,
      url: "week-3-notes-2",
      title: "Week 3 Notes (renamed)",
      body: "<p>hi</p>",
      published: true,
    });

    const result = await updatePage(COURSE_URL, "week-3-notes", { title: "Week 3 Notes (renamed)" }, "MCC", { pageId: 501 });

    expect(result).toEqual({
      pageId: 501,
      url: "week-3-notes-2",
      title: "Week 3 Notes (renamed)",
      body: "<p>hi</p>",
      published: true,
      updatedAt: null,
    });
  });
});

// Untouched pure-leaf helper, exercised here only to confirm the file still
// exports it correctly after the header/import changes above.
describe("codeFileToPageHtml (unchanged, sanity check)", () => {
  it("escapes HTML-special characters in both the path and the content", () => {
    const html = codeFileToPageHtml('a<b>&"\'.py', 'print("<hi>")');
    expect(html).toContain("&lt;b&gt;&amp;&quot;&#39;");
    expect(html).toContain("print(&quot;&lt;hi&gt;&quot;)");
  });
});
