import { describe, it, expect, afterEach, vi } from "vitest";
import { research, findCaseStudies, findPracticeProblems } from "./index";
import { CASE_STUDIES } from "./case-studies";
import { PRACTICE_PROBLEMS } from "./practice-problems";

// ── Fetch stubs ──────────────────────────────────────────────────────────────

function jsonResponse(data: unknown): Response {
  return { ok: true, json: async () => data } as unknown as Response;
}

/** Stub fetch so Wikipedia and Stack Exchange return canned payloads. */
function stubExternalSources() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("en.wikipedia.org/w/api.php")) {
        return jsonResponse({ query: { search: [{ title: "Integer overflow" }] } });
      }
      if (url.includes("en.wikipedia.org/api/rest_v1/page/summary/")) {
        return jsonResponse({
          type: "standard",
          title: "Integer overflow",
          extract: "In computer programming, an integer overflow occurs when an arithmetic operation exceeds the range of the type.",
          content_urls: { desktop: { page: "https://en.wikipedia.org/wiki/Integer_overflow" } },
        });
      }
      if (url.includes("api.stackexchange.com")) {
        return jsonResponse({
          items: [
            { item_type: "answer", body: "an answer body", question_id: 1, score: 10 },
            {
              item_type: "question",
              title: "How do I detect integer overflow?",
              excerpt: "I&#39;m adding two ints &hellip;",
              question_id: 199333,
              score: 500,
            },
          ],
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    })
  );
}

/** Stub fetch so every external call fails. */
function stubExternalFailure() {
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("network down");
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── External-first research() ────────────────────────────────────────────────

describe("research (external-first)", () => {
  it("returns external results first, with sources and links", async () => {
    stubExternalSources();
    const results = await research("integer overflow", { limit: 4 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source).toMatch(/^(wikipedia|stackexchange)$/);
    const wiki = results.find((r) => r.source === "wikipedia");
    expect(wiki).toMatchObject({
      kind: "case_study",
      title: "Integer overflow",
      url: "https://en.wikipedia.org/wiki/Integer_overflow",
    });
    const stack = results.find((r) => r.source === "stackexchange");
    expect(stack).toMatchObject({
      kind: "practice_problem",
      title: "How do I detect integer overflow?",
      url: "https://stackoverflow.com/q/199333",
    });
    // Entities decoded in excerpts.
    expect(stack?.summary).toContain("I'm adding two ints");
  });

  it("fills remaining slots with curated entries after external results", async () => {
    stubExternalSources();
    const results = await research("integer overflow data types", { limit: 6 });
    const sources = results.map((r) => r.source);
    expect(sources).toContain("curated");
    // External results come before curated ones.
    expect(sources.indexOf("curated")).toBeGreaterThan(sources.lastIndexOf("wikipedia"));
    const curated = results.find((r) => r.source === "curated");
    expect(curated?.entry).toBeDefined();
  });

  it("falls back to the curated base when external sources fail", async () => {
    stubExternalFailure();
    const results = await research("integer overflow and data types", { limit: 3 });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.source === "curated")).toBe(true);
    expect(results.map((r) => r.id)).toContain("gangnam-style-counter");
  });

  it("respects the kind filter across sources", async () => {
    stubExternalSources();
    const problems = await research("integer overflow", { kind: "practice_problem", limit: 5 });
    expect(problems.every((r) => r.kind === "practice_problem")).toBe(true);
    const studies = await research("integer overflow", { kind: "case_study", limit: 5 });
    expect(studies.every((r) => r.kind === "case_study")).toBe(true);
  });

  it("returns an empty list for empty input even when sources are up", async () => {
    stubExternalFailure();
    expect(await research("")).toEqual([]);
  });
});

// ── Curated sync lookups (used by the embedded engine; never touch the network) ──

describe("curated lookups", () => {
  it("findCaseStudies and findPracticeProblems never call fetch", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const studies = findCaseStudies("integer overflow and data types", 2);
    const problems = findPracticeProblems("loops and iteration", 2);
    expect(studies.length).toBeGreaterThan(0);
    expect(problems.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns topically relevant entries and nothing for off-topic queries", () => {
    expect(findCaseStudies("integer overflow", 2).map((r) => r.id)).toContain("gangnam-style-counter");
    expect(findPracticeProblems("loops", 1)[0].topics.join(" ")).toContain("loops");
    expect(findCaseStudies("medieval poetry appreciation", 2)).toEqual([]);
  });
});

// ── Knowledge base integrity ─────────────────────────────────────────────────

describe("knowledge base integrity", () => {
  it("every case study has a year, organization, two summary bullets, and a lesson", () => {
    for (const entry of CASE_STUDIES) {
      expect(entry.kind).toBe("case_study");
      expect(entry.year).toBeGreaterThan(1960);
      expect(entry.organization.length).toBeGreaterThan(0);
      expect(entry.summary.length).toBe(2);
      expect(entry.lesson.length).toBeGreaterThan(10);
      expect(entry.topics.length).toBeGreaterThan(0);
    }
  });

  it("every practice problem has a prompt, example, and distinct solution", () => {
    for (const entry of PRACTICE_PROBLEMS) {
      expect(entry.kind).toBe("practice_problem");
      expect(entry.prompt.length).toBeGreaterThan(20);
      expect(entry.exampleCode.length).toBeGreaterThan(10);
      expect(entry.solutionCode.length).toBeGreaterThan(10);
      // The example must not give away the solution.
      expect(entry.exampleCode).not.toBe(entry.solutionCode);
      expect(entry.language.length).toBeGreaterThan(0);
    }
  });

  it("ids are unique across the whole knowledge base", () => {
    const ids = [...CASE_STUDIES, ...PRACTICE_PROBLEMS].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
