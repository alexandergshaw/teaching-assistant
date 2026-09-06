// TDD suite for the page write layer's post-design correction
// (docs/llm-command-interface-acceptance-criteria.md section 10, errata G5).
//
// @/lib/canvas-modules is left UNMOCKED and only globalThis.fetch is
// stubbed, so resolveCourse runs for real - the "stub fetch, let
// resolveCourse run for real" idiom this repo uses for Canvas write helpers
// (see module-content.test.ts's own header comment).
//
// canvas.mccneb.edu is the hardcoded host for the "MCC" institution code in
// src/lib/canvas-core.ts.
//
// No pages.test.ts existed before this change (checked via Glob before
// writing this file).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// resolveCourse (via resolveInstitutionByCode) now delegates credential
// resolution to canvas-credentials.ts, which resolves the calling identity
// server-side before ever reading an env var (E-ARCH4). Mocking the identity
// to role: "owner" (E-ARCH6's uniform convention across every one of this
// repo's 22 Canvas test files) keeps the env-var branch this suite's
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

import { updatePage, codeFileToPageHtml } from "./pages";

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";

interface Recorded {
  url: string;
  method: string;
  body: string | undefined;
}

let recorded: Recorded[] = [];

function stubCanvas(responseBody: unknown) {
  recorded = [];
  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    recorded.push({ url: String(url), method: init?.method ?? "GET", body: init?.body as string | undefined });
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("updatePage: G5 - addressing", () => {
  it("addresses by slug when no pageId is given (existing one-shot-edit callers unchanged)", async () => {
    const fetchMock = stubCanvas({ page_id: 501, url: "week-3-notes", title: "Week 3 Notes", body: "<p>hi</p>", published: true });

    await updatePage(COURSE_URL, "week-3-notes", { title: "Week 3 Notes" }, "MCC");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recorded[0].url).toBe("https://canvas.mccneb.edu/api/v1/courses/123/pages/week-3-notes");
    expect(recorded[0].method).toBe("PUT");
  });

  it("addresses by page_id:<id> when opts.pageId is given, ignoring the (possibly stale) slug in the URL", async () => {
    const fetchMock = stubCanvas({ page_id: 501, url: "week-3-notes-2", title: "Week 3 Notes (renamed)", body: "<p>hi</p>", published: true });

    await updatePage(
      COURSE_URL,
      "week-3-notes", // deliberately the OLD/stale slug
      { title: "Week 3 Notes (renamed)" },
      "MCC",
      { pageId: 501 }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(recorded[0].url).toBe("https://canvas.mccneb.edu/api/v1/courses/123/pages/page_id:501");
    // The stale slug must never appear in the URL when pageId is given.
    expect(recorded[0].url).not.toContain("week-3-notes/");
    expect(recorded[0].url.endsWith("week-3-notes")).toBe(false);
  });

  it("still sends wiki_page[title] from the fields argument even when addressing by id (id only changes the URL, not the body)", async () => {
    stubCanvas({ page_id: 501, url: "week-3-notes-2", title: "Week 3 Notes (renamed)", body: "<p>hi</p>", published: true });

    await updatePage(COURSE_URL, "week-3-notes", { title: "Week 3 Notes (renamed)" }, "MCC", { pageId: 501 });

    const params = new URLSearchParams(recorded[0].body);
    expect(params.get("wiki_page[title]")).toBe("Week 3 Notes (renamed)");
  });

  it("a retry after a title change, addressed by id, hits the SAME URL both times (no duplicate-page shape)", async () => {
    const fetchMock = stubCanvas({ page_id: 501, url: "week-3-notes-2", title: "Week 3 Notes (renamed)", body: "<p>hi</p>", published: true });

    await updatePage(COURSE_URL, "week-3-notes", { title: "Week 3 Notes (renamed)" }, "MCC", { pageId: 501 });
    await updatePage(COURSE_URL, "week-3-notes", { title: "Week 3 Notes (renamed)" }, "MCC", { pageId: 501 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(recorded[0].url).toBe(recorded[1].url);
    expect(recorded[0].url).toBe("https://canvas.mccneb.edu/api/v1/courses/123/pages/page_id:501");
  });

  it("returns the mapped saved page either way", async () => {
    stubCanvas({ page_id: 501, url: "week-3-notes-2", title: "Week 3 Notes (renamed)", body: "<p>hi</p>", published: true });

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
