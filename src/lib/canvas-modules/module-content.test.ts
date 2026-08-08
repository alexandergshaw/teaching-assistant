// TDD suite for the CONTENT-GATHERING layer
// (docs/weekly-announcement-module-content-acceptance-criteria.md AC1 items
// 2, 3, 5).
//
// Written BEFORE the implementation exists. @/lib/canvas-modules is left
// UNMOCKED and only globalThis.fetch is stubbed, so the REAL transport runs and
// the assertions are about the actual HTTP shape - which is the whole point:
// AC1 item 5's cost model is what keeps a whole term's gathering inside the
// 60-second Vercel cap, and no amount of module-level mocking can prove it.
//
// canvas.mccneb.edu is the hardcoded host for the "MCC" institution code in
// src/lib/canvas-core.ts, matching src/lib/canvas/announcements.test.ts and
// canvas-inbox.weekly-announcement-schedule.sequential-fetch.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchModuleContentForWeeks } from "./module-content";

const COURSE_URL = "https://canvas.mccneb.edu/courses/123";

const MODULES = [
  { id: 11, name: "Start Here", position: 1, published: true, items_count: 1 },
  { id: 12, name: "Module 01: Intro", position: 2, published: true, items_count: 2 },
  { id: 13, name: "Module 02: Loops", position: 3, published: true, items_count: 3 },
];

const MODULE_13_ITEMS = [
  {
    id: 501,
    title: "Loops, in theory",
    type: "Page",
    position: 1,
    indent: 0,
    published: true,
    page_url: "loops-in-theory",
    html_url: `${COURSE_URL}/modules/items/501`,
  },
  {
    id: 502,
    title: "Lab 2",
    type: "Assignment",
    position: 2,
    indent: 0,
    published: true,
    content_id: 901,
    html_url: `${COURSE_URL}/modules/items/502`,
    content_details: { points_possible: 20, due_at: "2026-02-06T18:00:00Z" },
  },
  {
    id: 503,
    title: "loops-cheatsheet.pdf",
    type: "File",
    position: 3,
    indent: 0,
    published: true,
    content_id: 902,
    html_url: `${COURSE_URL}/modules/items/503`,
  },
];

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    headers: { get: () => null },
  } as unknown as Response;
}

let requested: string[] = [];

function stubCanvas() {
  requested = [];
  const fetchMock = vi.fn(async (url: string | URL) => {
    const href = String(url);
    requested.push(href);

    if (href.includes("/modules?")) return jsonResponse(MODULES);
    if (href.includes("/modules/13/items")) return jsonResponse(MODULE_13_ITEMS);
    if (href.includes("/items")) return jsonResponse([]);
    if (href.includes("/pages/loops-in-theory")) {
      return jsonResponse({
        page_id: 1,
        url: "loops-in-theory",
        title: "Loops, in theory",
        body: "<p>A loop repeats work.</p><p>Use <strong>for</strong> when the count is known.</p>",
        published: true,
      });
    }
    if (href.includes("/assignments?")) {
      return jsonResponse([{ id: 901, name: "Lab 2", description: "<p>Write three loops.</p>" }]);
    }
    if (href.includes("/quizzes?")) return jsonResponse([]);
    if (href.includes("/discussion_topics?")) return jsonResponse([]);
    return jsonResponse([]);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const countMatching = (pattern: RegExp) => requested.filter((u) => pattern.test(u)).length;

beforeEach(() => {
  vi.stubEnv("MCC_CANVAS_API_TOKEN", "test-token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("fetchModuleContentForWeeks: the request shape (AC1 item 5)", () => {
  it("lists modules ONCE and fetches items only for the modules it actually needs", async () => {
    stubCanvas();

    await fetchModuleContentForWeeks(COURSE_URL, [2], 15, "MCC");

    expect(countMatching(/\/modules\?/)).toBe(1);
    // Week 2 resolves to "Module 02: Loops" (id 13) BY NAME - not the third
    // entry by position, and certainly not every module in the course.
    expect(countMatching(/\/modules\/13\/items/)).toBe(1);
    expect(countMatching(/\/modules\/11\/items/)).toBe(0);
    expect(countMatching(/\/modules\/12\/items/)).toBe(0);
  });

  it("pulls each content type as ONE bulk list, never one description fetch per item", async () => {
    stubCanvas();

    await fetchModuleContentForWeeks(COURSE_URL, [1, 2], 15, "MCC");

    expect(countMatching(/\/assignments\?/)).toBe(1);
    expect(countMatching(/\/quizzes\?/)).toBe(1);
    expect(countMatching(/\/discussion_topics\?/)).toBe(1);
    // The per-item route the client-side precedent uses - explicitly not taken.
    expect(countMatching(/\/assignments\/901/)).toBe(0);
  });

  it("never downloads or previews a File item", async () => {
    stubCanvas();

    await fetchModuleContentForWeeks(COURSE_URL, [2], 15, "MCC");

    expect(countMatching(/\/files\//)).toBe(0);
  });

  it("asks Canvas for nothing at all when no weeks are requested", async () => {
    const fetchMock = stubCanvas();

    const out = await fetchModuleContentForWeeks(COURSE_URL, [], 15, "MCC");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.size).toBe(0);
  });
});

describe("fetchModuleContentForWeeks: what it returns (AC1 items 2/3)", () => {
  it("converts page HTML to text before it can ever reach the model", async () => {
    stubCanvas();

    const out = await fetchModuleContentForWeeks(COURSE_URL, [2], 15, "MCC");
    const week2 = out.get(2)!;

    expect(week2.materials).toContain("A loop repeats work.");
    expect(week2.materials).toContain("Use for when the count is known.");
    expect(week2.materials).not.toContain("<p>");
    expect(week2.materials).not.toContain("<strong>");
  });

  it("joins each item to its bulk-fetched description and reports the module it used", async () => {
    stubCanvas();

    const week2 = (await fetchModuleContentForWeeks(COURSE_URL, [2], 15, "MCC")).get(2)!;

    expect(week2.moduleName).toBe("Module 02: Loops");
    expect(week2.matchedBy).toBe("name");
    expect(week2.materials).toContain("Assignment: Lab 2");
    expect(week2.materials).toContain("Write three loops.");
    expect(week2.materials).toContain("File: loops-cheatsheet.pdf");
  });

  it("reports a week with no module of its own instead of guessing one", async () => {
    stubCanvas();

    const out = await fetchModuleContentForWeeks(COURSE_URL, [7], 15, "MCC");
    const week7 = out.get(7)!;

    expect(week7.matchedBy).toBe("none");
    expect(week7.moduleName).toBeNull();
    expect(week7.materials).toBe("");
  });

  it("reports a module that exists but has nothing readable in it", async () => {
    stubCanvas();

    const week1 = (await fetchModuleContentForWeeks(COURSE_URL, [1], 15, "MCC")).get(1)!;

    expect(week1.moduleName).toBe("Module 01: Intro");
    expect(week1.materials).toBe("");
  });
});
