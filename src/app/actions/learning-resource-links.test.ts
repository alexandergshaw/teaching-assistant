import { describe, it, expect, vi, beforeEach } from "vitest";

// findResourceLinksForConceptsAction calls requireOwner() (auth), callLlm()
// (network) and checkUrlsReachable() (network) - all three are mocked so the
// pipeline logic itself (two-call split, corroboration, placeholder/drop
// counting, degraded detection) runs for real without hitting Supabase,
// Gemini, or the open internet. Mirrors current-events.test.ts's own mocking
// shape for the same reasons.
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

// Contract 1 (sibling file set A): src/lib/url-reachability.ts. Mocked here
// with a factory, so this test file does not depend on set A having landed
// yet, and so no test in this file makes a real network request. Default
// mock: every url is alive - tests that care about a drop override this per
// call with mockResolvedValueOnce.
vi.mock("@/lib/url-reachability", () => ({
  checkUrlsReachable: vi.fn(),
}));

import { callLlm } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { checkUrlsReachable } from "@/lib/url-reachability";
import { tokenizeInline } from "@/lib/docx-blocks";
import { RESOURCE_KINDS, type ResourceKind } from "@/lib/resource-kind";
import { findResourceLinksForConceptsAction } from "./learning-resource-links";

// The grounded call (call 1) and the structuring call (call 2) - matches
// current-events.test.ts's groundedResponse/structureResponse helper shape,
// adapted to this feature's item fields (title/url/kind/whatYouGet instead
// of headline/date/angle/whyItMatters/background/url).
const groundedResponse = (prose: string, sources?: Array<{ title: string; uri: string }>) => ({
  ok: true as const,
  text: prose,
  ...(sources ? { sources } : {}),
});

interface ItemFixture {
  title: string;
  url?: string;
  kind?: ResourceKind;
  whatYouGet?: string;
}

const structureResponse = (items: ItemFixture[]) => ({
  ok: true as const,
  text: JSON.stringify({
    items: items.map((i) => ({
      title: i.title,
      url: i.url ?? "",
      kind: i.kind ?? "doc",
      whatYouGet: i.whatYouGet ?? "a useful thing",
    })),
  }),
});

// Every survivor url reported alive by default - a test that needs a
// specific url to fail reachability overrides this with mockResolvedValueOnce.
function mockAllReachable() {
  vi.mocked(checkUrlsReachable).mockImplementation(async (urls: readonly string[]) =>
    urls.map((url) => ({ url, alive: true, status: 200, reason: "ok" as const }))
  );
}

describe("findResourceLinksForConceptsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
    mockAllReachable();
  });

  it("D5: the embedded provider returns an error without calling the LLM or the reachability checker", async () => {
    const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "embedded");
    expect(result).toEqual({
      error: "The embedded engine cannot search the web for learning resources. Switch to an LLM provider to find real links.",
    });
    expect(callLlm).not.toHaveBeenCalled();
    expect(checkUrlsReachable).not.toHaveBeenCalled();
  });

  it("returns an error for an empty concept list without calling the LLM", async () => {
    const result = await findResourceLinksForConceptsAction([], "Computer Science", "gemini");
    expect("error" in result).toBe(true);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("D1t: the grounded call carries webSearch:true with no JSON instruction; the structuring call carries no webSearch and asks for JSON", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce(
        groundedResponse("prose about recursion", [{ title: "python.org", uri: "https://python.org/docs" }])
      )
      .mockResolvedValueOnce(
        structureResponse([{ title: "Recursion docs", url: "https://python.org/recursion", kind: "doc" }])
      );

    const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini");
    expect("error" in result).toBe(false);

    const calls = vi.mocked(callLlm).mock.calls;
    expect(calls).toHaveLength(2);

    const groundedReq = calls[0][0];
    const structureReq = calls[1][0];

    expect(groundedReq.webSearch).toBe(true);
    const groundedPrompt = groundedReq.contents[0].parts[0];
    const groundedText = "text" in groundedPrompt ? groundedPrompt.text : "";
    // Finding 5: a spelling-only assertion (`not.toMatch(/valid JSON/i)`)
    // would still pass a regression that phrased the same instruction
    // differently - e.g. "respond with a list in the form
    // {"items":[...]}" - and that regression is exactly what makes Gemini
    // skip the search and answer from memory (D1). Pin the SHAPE instead: no
    // schema-looking `{"` fragment, and no standalone "JSON" word anywhere in
    // the grounded prompt, not just absent from one specific phrase.
    expect(groundedText).not.toContain('{"');
    expect(groundedText).not.toMatch(/\bJSON\b/i);
    expect(groundedText).not.toMatch(/valid JSON/i);

    expect(structureReq.webSearch).toBeFalsy();
    const structurePrompt = structureReq.contents[0].parts[0];
    expect("text" in structurePrompt && structurePrompt.text).toMatch(/valid JSON/i);
  });

  it("D6: only the first MAX_CONCEPTS_PER_RUN concepts are processed - a 9th concept never reaches callLlm", async () => {
    // 9 concepts, but the documented cap is 6: only 6 grounded+structure
    // pairs (12 calls) should fire, never 9 pairs (18 calls).
    const concepts = Array.from({ length: 9 }, (_, i) => `concept-${i}`);
    vi.mocked(callLlm).mockImplementation(async (req) => {
      if (req.webSearch) {
        return groundedResponse("prose", [{ title: "source.test", uri: "https://source.test/page" }]);
      }
      return structureResponse([{ title: "T", url: "https://source.test/story", kind: "doc" }]);
    });

    const result = await findResourceLinksForConceptsAction(concepts, "Computer Science", "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    // 6 concepts x 2 calls each = 12, never 18 (9 concepts) - proves the clamp
    // actually ran, not just that the output happens to look bounded.
    expect(vi.mocked(callLlm).mock.calls.length).toBe(12);
    const concernedConcepts = new Set(result.links.map((l) => l.concept));
    expect([...concernedConcepts].every((c) => concepts.slice(0, 6).includes(c))).toBe(true);
    expect(concernedConcepts.has("concept-8")).toBe(false);
  });

  it("D2t/B2: a grounded call with no sources across every concept produces degraded:true and no links, with an explicit note", async () => {
    vi.mocked(callLlm)
      // Grounded call succeeds but returns NO groundingMetadata/sources - the
      // model answered from parametric memory instead of actually searching.
      .mockResolvedValueOnce(groundedResponse("prose with no grounding"))
      .mockResolvedValueOnce(
        structureResponse([{ title: "unverifiable item", url: "https://some-real-site.test/page", kind: "doc" }])
      );

    const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.degraded).toBe(true);
    expect(result.links).toEqual([]);
    expect(result.notes.some((n) => /answered without searching/i.test(n))).toBe(true);
    // The reachability checker must never even run when nothing survived
    // corroboration - there is nothing left to fetch.
    expect(checkUrlsReachable).not.toHaveBeenCalled();
  });

  it("D3t/B1: an uncorroborated URL is dropped and never appears in the output, counted in droppedUncorroborated", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce(
        groundedResponse("prose", [{ title: "real-source.test", uri: "https://real-source.test/page" }])
      )
      .mockResolvedValueOnce(
        structureResponse([
          { title: "fabricated item", url: "https://totally-fabricated-domain.test/story", kind: "doc" },
        ])
      );

    const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.links).toEqual([]);
    expect(result.droppedUncorroborated).toBe(1);
    expect(result.droppedPlaceholder).toBe(0);
    expect(JSON.stringify(result)).not.toContain("totally-fabricated-domain.test");
  });

  it("B3: a placeholder URL (example.com) is dropped and counted separately from an uncorroborated URL", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce(
        groundedResponse("prose", [{ title: "real-source.test", uri: "https://real-source.test/page" }])
      )
      .mockResolvedValueOnce(
        structureResponse([{ title: "placeholder item", url: "https://example.com/story", kind: "doc" }])
      );

    const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.links).toEqual([]);
    expect(result.droppedPlaceholder).toBe(1);
    expect(result.droppedUncorroborated).toBe(0);
  });

  it("D4t/D2/B5: a grounding redirect host is never emitted as the link, even for a corroborated concept", async () => {
    vi.mocked(callLlm)
      // Real Gemini grounding shape: source.uri is the opaque redirect,
      // source.title carries the real domain (see verifyItemUrls's own doc
      // comment in current-events-report.ts).
      .mockResolvedValueOnce(
        groundedResponse("prose mentioning python.org", [
          { title: "python.org", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbCdEf123" },
        ])
      )
      .mockResolvedValueOnce(
        structureResponse([
          { title: "Good link", url: "https://www.python.org/3/library/functions.html", kind: "doc" },
          // A candidate that names the redirect host itself as its url -
          // must never survive corroboration (it can never self-corroborate).
          {
            title: "Bad link",
            url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbCdEf123",
            kind: "doc",
          },
        ])
      );

    const result = await findResourceLinksForConceptsAction(["python functions"], "Computer Science", "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.links).toHaveLength(1);
    expect(result.links[0].url).toBe("https://www.python.org/3/library/functions.html");
    expect(JSON.stringify(result)).not.toContain("vertexaisearch.cloud.google.com");
    expect(result.droppedUncorroborated).toBe(1);
  });

  it("B4: an item that fails the reachability check is dropped and counted in droppedUnreachable", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce(
        groundedResponse("prose", [{ title: "real-source.test", uri: "https://real-source.test/page" }])
      )
      .mockResolvedValueOnce(
        structureResponse([{ title: "dead link", url: "https://real-source.test/dead-page", kind: "doc" }])
      );
    vi.mocked(checkUrlsReachable).mockResolvedValueOnce([
      { url: "https://real-source.test/dead-page", alive: false, status: 404, reason: "client-error" },
    ]);

    const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.links).toEqual([]);
    expect(result.droppedUnreachable).toBe(1);
    expect(checkUrlsReachable).toHaveBeenCalledWith(["https://real-source.test/dead-page"]);
  });

  it("happy path: a corroborated, reachable resource survives with concept/title/url/kind/whatYouGet intact", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce(
        groundedResponse("prose", [{ title: "real-source.test", uri: "https://real-source.test/page" }])
      )
      .mockResolvedValueOnce(
        structureResponse([
          {
            title: "Great tutorial",
            url: "https://real-source.test/tutorial",
            kind: "video",
            whatYouGet: "a worked example",
          },
        ])
      );

    const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.degraded).toBe(false);
    expect(result.links).toEqual([
      {
        concept: "recursion",
        title: "Great tutorial",
        url: "https://real-source.test/tutorial",
        kind: "video",
        whatYouGet: "a worked example",
      },
    ]);
    expect(result.droppedUncorroborated).toBe(0);
    expect(result.droppedPlaceholder).toBe(0);
    expect(result.droppedUnreachable).toBe(0);
  });

  describe("Finding 2: render-safe urls", () => {
    // The real bug this guards: markdownLiteToHtml (src/lib/markdown-lite.ts)
    // renders a survivor as `[title](url)` and parses it back out with
    // tokenizeInline's INLINE_LINK_RE (src/lib/docx-blocks.ts), whose
    // markdown-link url capture is `[^\s)]+` - it stops at the FIRST literal
    // ")" or whitespace character. A corroborated, ALIVE url containing a
    // balanced paren or an internal space truncates there, producing a dead
    // link plus stray text. These tests prove the emitted url survives being
    // run through the REAL renderer regex intact - not just that it "looks"
    // encoded.

    it("a url with a balanced paren survives the gates and round-trips through the real renderer regex intact", async () => {
      const parenUrl = "https://en.wikipedia.org/wiki/Critical_path_method_(project)";
      vi.mocked(callLlm)
        .mockResolvedValueOnce(
          groundedResponse("prose about critical path method", [{ title: "en.wikipedia.org", uri: "https://en.wikipedia.org/wiki/x" }])
        )
        .mockResolvedValueOnce(structureResponse([{ title: "CPM article", url: parenUrl, kind: "doc" }]));

      const result = await findResourceLinksForConceptsAction(["critical path method"], "Project Management", "gemini");
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      expect(result.links).toHaveLength(1);
      const emittedUrl = result.links[0].url;

      // The emitted url must not carry a literal "(" or ")" that the
      // renderer's markdown-link branch would treat as a truncation point.
      expect(emittedUrl).not.toMatch(/[()]/);

      const rendered = `[${result.links[0].title}](${emittedUrl})`;
      const tokens = tokenizeInline(rendered);
      expect(tokens).toHaveLength(1);
      const [token] = tokens;
      expect(token.kind).toBe("link");
      if (token.kind !== "link") return;
      // The captured href must be the WHOLE url, never truncated at an
      // internal paren.
      expect(token.url).toBe(emittedUrl);
    });

    it("a url with an internal space survives the gates and round-trips through the real renderer regex intact", async () => {
      const spaceUrl = "https://resource-site.test/path with space/page";
      vi.mocked(callLlm)
        .mockResolvedValueOnce(
          groundedResponse("prose", [{ title: "resource-site.test", uri: "https://resource-site.test/page" }])
        )
        .mockResolvedValueOnce(structureResponse([{ title: "Spaced-path doc", url: spaceUrl, kind: "doc" }]));

      const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini");
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      expect(result.links).toHaveLength(1);
      const emittedUrl = result.links[0].url;

      expect(emittedUrl).not.toMatch(/\s/);

      const rendered = `[${result.links[0].title}](${emittedUrl})`;
      const tokens = tokenizeInline(rendered);
      expect(tokens).toHaveLength(1);
      const [token] = tokens;
      expect(token.kind).toBe("link");
      if (token.kind !== "link") return;
      expect(token.url).toBe(emittedUrl);
    });

    it("does not double-encode a url that is already percent-encoded", async () => {
      const alreadyEncodedUrl = "https://resource-site.test/path%20already%20encoded";
      vi.mocked(callLlm)
        .mockResolvedValueOnce(
          groundedResponse("prose", [{ title: "resource-site.test", uri: "https://resource-site.test/page" }])
        )
        .mockResolvedValueOnce(structureResponse([{ title: "Pre-encoded doc", url: alreadyEncodedUrl, kind: "doc" }]));

      const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini");
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      expect(result.links).toHaveLength(1);
      // "%20" contains no literal "(" ")" or whitespace, so it must pass
      // through byte-for-byte - never becoming "%2520".
      expect(result.links[0].url).toBe(alreadyEncodedUrl);
    });
  });

  describe("Finding 3/4: retry elapsed-time budget", () => {
    it("a concept whose first pair fails (a thrown transport error) retries exactly once", async () => {
      vi.mocked(callLlm)
        // First attempt's grounded call rejects outright.
        .mockRejectedValueOnce(new Error("network blip"))
        // Retry's grounded + structure pair succeeds.
        .mockResolvedValueOnce(
          groundedResponse("prose", [{ title: "real-source.test", uri: "https://real-source.test/page" }])
        )
        .mockResolvedValueOnce(
          structureResponse([{ title: "Recovered link", url: "https://real-source.test/ok", kind: "doc" }])
        );

      const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini");
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      // 1 failed call + a full 2-call retry pair = 3, never more (no second retry).
      expect(vi.mocked(callLlm).mock.calls.length).toBe(3);
      expect(result.links).toEqual([
        {
          concept: "recursion",
          title: "Recovered link",
          url: "https://real-source.test/ok",
          kind: "doc",
          whatYouGet: "a useful thing",
        },
      ]);
    });

    it("a concept whose first pair returns no items retries exactly once", async () => {
      vi.mocked(callLlm)
        // First attempt: grounded call succeeds, structuring returns {"items":[]}.
        .mockResolvedValueOnce(
          groundedResponse("prose with nothing structurable", [
            { title: "real-source.test", uri: "https://real-source.test/page" },
          ])
        )
        .mockResolvedValueOnce(structureResponse([]))
        // Retry: a full pair that succeeds.
        .mockResolvedValueOnce(
          groundedResponse("prose", [{ title: "real-source.test", uri: "https://real-source.test/page" }])
        )
        .mockResolvedValueOnce(
          structureResponse([{ title: "Found on retry", url: "https://real-source.test/retry-ok", kind: "doc" }])
        );

      const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini");
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      // 2 calls for the empty first pair + 2 for the retry pair = 4, never 2
      // (deleting the retry) and never 6 (retrying twice).
      expect(vi.mocked(callLlm).mock.calls.length).toBe(4);
      expect(result.links.map((l) => l.url)).toEqual(["https://real-source.test/retry-ok"]);
    });

    it("a retry does NOT happen once the run's elapsed-time budget is spent, even when the first pair returned nothing", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce(
        groundedResponse("prose with nothing structurable", [
          { title: "real-source.test", uri: "https://real-source.test/page" },
        ])
      ).mockResolvedValueOnce(structureResponse([]));

      // A scripted clock, injected with no real waiting: the FIRST reading is
      // the run's startedAt, the SECOND is the reading taken right after the
      // first attempt completes, already past retryBudgetMs - so
      // hasRetryBudget() must read false and the retry must never fire.
      let call = 0;
      const now = () => {
        const readings = [0, 1000];
        const value = readings[Math.min(call, readings.length - 1)];
        call += 1;
        return value;
      };

      const result = await findResourceLinksForConceptsAction(
        ["recursion"],
        "Computer Science",
        "gemini",
        { now, retryBudgetMs: 500 }
      );
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      // Only the first pair's 2 calls - the retry never fired.
      expect(vi.mocked(callLlm).mock.calls.length).toBe(2);
      expect(result.links).toEqual([]);
      // The note must not claim a retry happened when the budget skipped it.
      expect(result.notes.some((n) => /no candidate resources\.$/.test(n))).toBe(true);
      expect(result.notes.some((n) => /even after one retry/i.test(n))).toBe(false);
    });

    it("a retry does NOT happen once the budget is spent, on the transport-failure path either", async () => {
      vi.mocked(callLlm).mockRejectedValueOnce(new Error("network blip"));

      let call = 0;
      const now = () => {
        const readings = [0, 1000];
        const value = readings[Math.min(call, readings.length - 1)];
        call += 1;
        return value;
      };

      const result = await findResourceLinksForConceptsAction(
        ["recursion"],
        "Computer Science",
        "gemini",
        { now, retryBudgetMs: 500 }
      );
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      // Only the one failed call - no retry pair fired.
      expect(vi.mocked(callLlm).mock.calls.length).toBe(1);
      expect(result.notes.some((n) => /failed: network blip/i.test(n))).toBe(true);
    });
  });

  describe("Finding 7: duplicate urls across concepts are checked once", () => {
    it("two concepts surfacing the SAME url only run the reachability check once for it", async () => {
      const sharedUrl = "https://real-source.test/shared-doc";
      // Two concepts run concurrently (Promise.allSettled), so their grounded
      // and structuring calls interleave on the SAME mocked callLlm - a fixed
      // mockResolvedValueOnce chain would not reliably line up per-concept
      // (see the D6 cap test above, which uses this same keyed-by-webSearch
      // shape for the identical reason). Both concepts independently surface
      // the identical url.
      vi.mocked(callLlm).mockImplementation(async (req) => {
        if (req.webSearch) {
          return groundedResponse("prose", [{ title: "real-source.test", uri: "https://real-source.test/page" }]);
        }
        return structureResponse([{ title: "Shared doc", url: sharedUrl, kind: "doc" }]);
      });

      const result = await findResourceLinksForConceptsAction(
        ["recursion", "iteration"],
        "Computer Science",
        "gemini"
      );
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      // Both concepts' links survive (aliveByUrl is keyed by url regardless
      // of how many concepts share it)...
      expect(result.links).toHaveLength(2);
      expect(result.links.every((l) => l.url === sharedUrl)).toBe(true);
      // ...but the checker itself was asked about the url only ONCE, not
      // once per concept that surfaced it.
      expect(vi.mocked(checkUrlsReachable)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(checkUrlsReachable)).toHaveBeenCalledWith([sharedUrl]);
    });
  });

  describe("R2: resource-profile argument (docs/discussion-reply-resources-acceptance-criteria.md section 1)", () => {
    // These pin the property that matters most for the shipped Learning
    // Resources page: calling this action with no resourceProfile argument -
    // exactly what every existing call site does - must keep constraining
    // both LLM calls to doc/video/tutorial only. If this test cannot be made
    // to fail without changing production behaviour, it isn't proving
    // anything; sabotage run (b) below is what proves it can.
    it("the default call (no resourceProfile argument) constrains both LLM calls to exactly doc, video, tutorial, in that order", async () => {
      vi.mocked(callLlm)
        .mockResolvedValueOnce(
          groundedResponse("prose", [{ title: "real-source.test", uri: "https://real-source.test/page" }])
        )
        .mockResolvedValueOnce(structureResponse([{ title: "T", url: "https://real-source.test/x", kind: "doc" }]));

      const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini");
      expect("error" in result).toBe(false);

      const calls = vi.mocked(callLlm).mock.calls;
      const groundedPrompt = calls[0][0].contents[0].parts[0];
      const groundedText = "text" in groundedPrompt ? groundedPrompt.text : "";
      const structurePrompt = calls[1][0].contents[0].parts[0];
      const structureText = "text" in structurePrompt ? structurePrompt.text : "";

      // The structuring call's kind list is a mechanically generated
      // template (kindSchemaAlternation/kindProseList join a fixed array),
      // not free-form English, so an exact-substring pin is safe here - it
      // cannot be "rephrased" the way natural prose can, and a drift in
      // either the separator or the derivation is exactly what this test
      // must catch.
      expect(structureText).toContain('"kind":"doc|video|tutorial"');
      expect(structureText).toContain('"kind" must be exactly one of "doc", "video", or "tutorial".');
      expect(structureText).not.toMatch(/\bnews\b/i);
      expect(structureText).not.toMatch(/\bpaper\b/i);

      // The prose call's resource-type sentence IS free-form English, so
      // pin the FACT and the ORDERING - which kinds are named, and in what
      // order - rather than its exact spelling (this repo has twice been
      // burned by source-text assertions forcing contorted implementations;
      // see AGENTS.md).
      const docIdx = groundedText.indexOf("documentation");
      const videoIdx = groundedText.indexOf("video");
      const tutorialIdx = groundedText.indexOf("tutorials");
      expect(docIdx).toBeGreaterThan(-1);
      expect(videoIdx).toBeGreaterThan(docIdx);
      expect(tutorialIdx).toBeGreaterThan(videoIdx);
      expect(groundedText).not.toMatch(/\bnews\b/i);
      expect(groundedText).not.toMatch(/\bpaper\b/i);

      // The fourth mention (a few lines below the resource-type sentence,
      // not named by the AC's R2 but the same coercion-versus-prompt drift
      // risk): "whether it is <description>, <description>, or
      // <description>". Built from KIND_DESCRIPTION + the same oxfordJoin
      // helper that builds the structuring call's kind list, so it is a
      // deterministic template for a fixed default `kinds` array - safe to
      // pin exactly, same reasoning as the structuring-call lines above.
      expect(groundedText).toContain(
        "whether it is official documentation, a video tutorial, or a written tutorial,"
      );
      expect(groundedText).not.toMatch(/\ba news article\b/i);
      expect(groundedText).not.toMatch(/\ba paper\b/i);
    });

    it("a widened resourceProfile changes the allowed-kind list on both calls, and a news-kind item survives to the returned link", async () => {
      // Not imported from the production module - resourceProfile is
      // deliberately unexported (a "use server" module's export surface
      // here is kept to ResourceLink/FindResourceLinksSuccess only) - a
      // real caller (e.g. the discussion-reply resources feature) passes a
      // structurally-matching object literal exactly like this one.
      const widenedProfile = {
        kinds: RESOURCE_KINDS, // all five, in RESOURCE_KINDS order - never a hand-typed literal
        resourceTypeSentence:
          "official documentation, video tutorials, written tutorials, news articles, and papers",
      };

      vi.mocked(callLlm)
        .mockResolvedValueOnce(
          groundedResponse("prose", [{ title: "real-source.test", uri: "https://real-source.test/page" }])
        )
        .mockResolvedValueOnce(
          structureResponse([{ title: "Recent coverage", url: "https://real-source.test/news-item", kind: "news" }])
        );

      const result = await findResourceLinksForConceptsAction(
        ["recursion"],
        "Computer Science",
        "gemini",
        undefined,
        widenedProfile
      );
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      const calls = vi.mocked(callLlm).mock.calls;
      const groundedPrompt = calls[0][0].contents[0].parts[0];
      const groundedText = "text" in groundedPrompt ? groundedPrompt.text : "";
      const structurePrompt = calls[1][0].contents[0].parts[0];
      const structureText = "text" in structurePrompt ? structurePrompt.text : "";
      expect(structureText).toContain('"kind":"doc|video|tutorial|news|paper"');
      expect(structureText).toMatch(/\bnews\b/);
      expect(structureText).toMatch(/\bpaper\b/);
      // The fourth mention widens along with the other three - all four
      // trace back to the same `profile.kinds` array, so this is exactly
      // what would catch the fourth line being left on the three-kind
      // wording while the other three widened.
      expect(groundedText).toContain(
        "whether it is official documentation, a video tutorial, a written tutorial, a news article, or a paper,"
      );

      expect(result.links).toHaveLength(1);
      expect(result.links[0].kind).toBe("news");
    });

    it("an unrecognized kind from the model still defaults to doc under a widened profile (shared leaf coercion, not a local copy)", async () => {
      const widenedProfile = { kinds: RESOURCE_KINDS, resourceTypeSentence: "anything at all" };

      vi.mocked(callLlm)
        .mockResolvedValueOnce(
          groundedResponse("prose", [{ title: "real-source.test", uri: "https://real-source.test/page" }])
        )
        .mockResolvedValueOnce(
          structureResponse([
            { title: "Odd kind", url: "https://real-source.test/odd", kind: "podcast" as unknown as ResourceKind },
          ])
        );

      const result = await findResourceLinksForConceptsAction(
        ["recursion"],
        "Computer Science",
        "gemini",
        undefined,
        widenedProfile
      );
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      expect(result.links).toHaveLength(1);
      expect(result.links[0].kind).toBe("doc");
    });
  });
});
