import { describe, it, expect, vi, beforeEach } from "vitest";

// Sibling to learning-resource-links.test.ts, covering ONLY the new
// behaviour from docs/reply-resource-search-yield-acceptance-criteria.md
// (Y1/Y1a/Y2/Y3/Y5) - split into its own file because the main test file was
// already 655 lines before this feature and these additions would have
// pushed it past the repo's 1000-line cap (AGENTS.md / the module-cache-lint
// precedent: split before adding, not after). Same mocking shape as the main
// file (see that file's own header comment for why each mock exists) -
// vitest test files do not share module-level state, so the setup below is
// duplicated rather than imported (see AGENTS.md's "no cross-test-file
// imports" lesson - importing a helper from another *.test.ts re-runs its
// describe blocks).
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

vi.mock("@/lib/url-reachability", () => ({
  checkUrlsReachable: vi.fn(),
}));

import { callLlm } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { checkUrlsReachable } from "@/lib/url-reachability";
import { createGroundingResolver } from "@/lib/grounding-sources";
import { findResourceLinksForConceptsAction } from "./learning-resource-links";

const groundedResponse = (prose: string, sources?: Array<{ title: string; uri: string; domain?: string }>) => ({
  ok: true as const,
  text: prose,
  ...(sources ? { sources } : {}),
});

interface ItemFixture {
  title: string;
  url?: string;
  kind?: string;
  whatYouGet?: string;
  source?: number | string;
}

const structureResponse = (items: ItemFixture[]) => ({
  ok: true as const,
  text: JSON.stringify({
    items: items.map((i) => ({
      title: i.title,
      url: i.url ?? "",
      kind: i.kind ?? "doc",
      whatYouGet: i.whatYouGet ?? "a useful thing",
      ...(i.source !== undefined ? { source: i.source } : {}),
    })),
  }),
});

function mockAllReachable() {
  vi.mocked(checkUrlsReachable).mockImplementation(async (urls: readonly string[]) =>
    urls.map((url) => ({ url, alive: true, status: 200, reason: "ok" as const }))
  );
}

// The exact byte-for-byte research prompt findResourceLinksForConceptsAction
// has always sent for concept "recursion" / courseKind "Computer Science"
// with the default resource profile - a literal oracle (AGENTS.md: a test
// must be able to fail), not a re-derivation of the production template.
// Shared by both tests below that need it, so a wording regression is caught
// in one place instead of two copies silently drifting apart.
const FROZEN_FIRST_RESEARCH_PROMPT = `You are an expert educator finding learning resources for a Computer Science course for a student studying one concept.

CONCEPT: recursion

Search the web first, then report up to 4 real resources for a student learning this concept: official documentation, video tutorials, and written tutorials, appropriate to the course level.

For each resource you find, write a short paragraph in plain prose giving: the resource's title, whether it is official documentation, a video tutorial, or a written tutorial, the exact URL of the page you visited to find it, and one sentence on what a student gets from it.

If a web search turns up nothing relevant for this concept, say so plainly instead of inventing a resource.`;

describe("findResourceLinksForConceptsAction - Y1/Y2/Y3/Y5 (docs/reply-resource-search-yield-acceptance-criteria.md)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
    mockAllReachable();
  });

  describe("Section 4 / test 5(e): nothing changes for sources with no domain, not on the redirect host", () => {
    it("produces byte-identical first-attempt prompts and the same links as before Y1/Y2", async () => {
      vi.mocked(callLlm)
        .mockResolvedValueOnce(
          groundedResponse("prose", [{ title: "real-source.test", uri: "https://real-source.test/page" }])
        )
        .mockResolvedValueOnce(
          structureResponse([
            { title: "Great tutorial", url: "https://real-source.test/tutorial", kind: "video", whatYouGet: "a worked example" },
          ])
        );

      const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini");
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      const calls = vi.mocked(callLlm).mock.calls;
      expect(calls).toHaveLength(2);

      const groundedPrompt = calls[0][0].contents[0].parts[0];
      const groundedText = "text" in groundedPrompt ? groundedPrompt.text : "";
      expect(groundedText).toBe(FROZEN_FIRST_RESEARCH_PROMPT);

      const structurePrompt = calls[1][0].contents[0].parts[0];
      const structureText = "text" in structurePrompt ? structurePrompt.text : "";
      expect(structureText).toBe(
        `Convert the following research notes into structured JSON. Use only information present in the notes below - do not add, invent, look up, or infer anything that isn't already stated there.

RESEARCH NOTES:
prose

Return ONLY valid JSON in this exact shape:
{"items":[{"title":"...","url":"...","kind":"doc|video|tutorial","whatYouGet":"..."}]}

"kind" must be exactly one of "doc", "video", or "tutorial". No markdown fences, no commentary. If the notes contain no items, return {"items":[]}.`
      );

      expect(result.links).toEqual([
        { concept: "recursion", title: "Great tutorial", url: "https://real-source.test/tutorial", kind: "video", whatYouGet: "a worked example" },
      ]);
    });
  });

  describe("Y3 / test 5(c): retry when the model did not search", () => {
    it("a first attempt with items but NO sources triggers exactly one retry whose prompt starts with the Y3 line; the first prompt is the frozen existing one", async () => {
      vi.mocked(callLlm)
        .mockResolvedValueOnce(groundedResponse("prose with no grounding"))
        .mockResolvedValueOnce(
          structureResponse([{ title: "unverifiable item", url: "https://some-real-site.test/page", kind: "doc" }])
        )
        .mockResolvedValueOnce(
          groundedResponse("prose on retry", [{ title: "real-source.test", uri: "https://real-source.test/page" }])
        )
        .mockResolvedValueOnce(structureResponse([{ title: "Recovered", url: "https://real-source.test/ok", kind: "doc" }]));

      const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini");
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      const calls = vi.mocked(callLlm).mock.calls;
      expect(calls).toHaveLength(4);

      const firstPrompt = calls[0][0].contents[0].parts[0];
      const firstText = "text" in firstPrompt ? firstPrompt.text : "";
      expect(firstText).toBe(FROZEN_FIRST_RESEARCH_PROMPT);

      const retryPrompt = calls[2][0].contents[0].parts[0];
      const retryText = "text" in retryPrompt ? retryPrompt.text : "";
      expect(retryText).toBe(`Use the Google Search tool for this request. Do not answer from memory.\n\n${FROZEN_FIRST_RESEARCH_PROMPT}`);

      expect(result.links.map((l) => l.url)).toEqual(["https://real-source.test/ok"]);
      expect(result.degraded).toBe(false);
    });
  });

  describe("Y1a / test 5(f): web.domain corroborates a candidate independent of title", () => {
    it("web.domain alone corroborates a candidate on that host, even with no domain-shaped title", async () => {
      vi.mocked(callLlm)
        .mockResolvedValueOnce(
          groundedResponse("prose", [
            { title: "A great resource on this topic", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/xyz", domain: "trusted-docs.test" },
          ])
        )
        .mockResolvedValueOnce(structureResponse([{ title: "Docs", url: "https://trusted-docs.test/guide", kind: "doc" }]));

      // Redirect-host source: a non-3xx fetch keeps the resolver a no-op, so
      // this pins Y1a's title-independent domain corroboration, not Y1's own
      // resolution (that is Y2's own describe block below).
      const fetchImpl = vi.fn().mockResolvedValue({ status: 403, headers: { get: () => null } });
      const resolver = createGroundingResolver({ fetchImpl });

      const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini", { resolver });
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      expect(result.links).toHaveLength(1);
      expect(result.links[0].url).toBe("https://trusted-docs.test/guide");
      expect(result.droppedUncorroborated).toBe(0);
    });
  });

  describe("Y2 / test 5(a)(b): the structuring call gets the visited (resolved) pages", () => {
    it("(a) resolves redirect-host sources before structuring, and a source-indexed item takes the resolved url whose host is in no title", async () => {
      const resolvedUrl = "https://real-publisher.test/deep/page";
      const fetchImpl = vi.fn(async () => ({
        status: 302,
        headers: { get: (name: string) => (name.toLowerCase() === "location" ? resolvedUrl : null) },
      }));
      const resolver = createGroundingResolver({ fetchImpl });

      vi.mocked(callLlm)
        .mockResolvedValueOnce(
          groundedResponse("prose mentioning the resource", [
            { title: "some vague title with words", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redir1" },
          ])
        )
        .mockResolvedValueOnce(
          structureResponse([{ title: "Found via search", url: "should-be-overwritten", kind: "doc", whatYouGet: "help", source: 0 }])
        );

      const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini", { resolver });
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(result.links).toHaveLength(1);
      expect(result.links[0].url).toBe(resolvedUrl);

      const structureCall = vi.mocked(callLlm).mock.calls[1][0];
      const structurePrompt = structureCall.contents[0].parts[0];
      const structureText = "text" in structurePrompt ? structurePrompt.text : "";
      expect(structureText).toContain(resolvedUrl);
      expect(structureText).not.toContain("vertexaisearch.cloud.google.com");
    });

    it("(b) an item's source index selects the resolved url only when it is a valid in-range integer", async () => {
      const resolvedA = "https://publisher-a.test/page-a";
      const resolvedB = "https://publisher-b.test/page-b";
      const fetchImpl = vi.fn(async (url: string) => {
        const location = url.includes("redirA") ? resolvedA : resolvedB;
        return { status: 302, headers: { get: (name: string) => (name.toLowerCase() === "location" ? location : null) } };
      });
      const resolver = createGroundingResolver({ fetchImpl });

      vi.mocked(callLlm)
        .mockResolvedValueOnce(
          groundedResponse("prose", [
            { title: "vague title one", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redirA" },
            { title: "vague title two", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redirB" },
          ])
        )
        .mockResolvedValueOnce(
          structureResponse([
            { title: "Indexed item", url: "https://model-own-url.test/x", kind: "doc", source: 0 },
            { title: "Out of range item", url: "https://publisher-b.test/model-url", kind: "doc", source: 99 },
            { title: "String index item", url: "https://publisher-b.test/model-url-2", kind: "doc", source: "0" },
          ])
        );

      const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini", { resolver });
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      const byTitle = new Map(result.links.map((l) => [l.title, l.url]));
      expect(byTitle.get("Indexed item")).toBe(resolvedA);
      expect(byTitle.get("Out of range item")).toBe("https://publisher-b.test/model-url");
      expect(byTitle.get("String index item")).toBe("https://publisher-b.test/model-url-2");
    });
  });

  describe("Y5 / test 5(d): per-concept accounting (perConcept arithmetic)", () => {
    it("perConcept arithmetic holds and sums equal the top-level counts", async () => {
      const attemptCounts: Record<string, number> = {};

      vi.mocked(callLlm).mockImplementation(async (req) => {
        const promptText = "text" in req.contents[0].parts[0] ? req.contents[0].parts[0].text : "";

        if (req.webSearch) {
          // Only the grounded call carries "CONCEPT: <name>" - the structuring
          // call's prompt is concept-agnostic (see below).
          if (promptText.includes("CONCEPT: alpha")) throw new Error("alpha transport failure");
          if (promptText.includes("CONCEPT: beta")) {
            attemptCounts["beta-grounded"] = (attemptCounts["beta-grounded"] ?? 0) + 1;
            return attemptCounts["beta-grounded"] === 1
              ? groundedResponse("prose with no grounding")
              : groundedResponse("prose", [{ title: "beta-source.test", uri: "https://beta-source.test/page" }]);
          }
          throw new Error(`unexpected grounded prompt: ${promptText}`);
        }

        // Alpha's pipeline throws at the grounded stage on BOTH its attempts
        // and never reaches its own structuring call, so every structuring
        // call this test sees belongs to beta.
        attemptCounts["beta-structure"] = (attemptCounts["beta-structure"] ?? 0) + 1;
        return attemptCounts["beta-structure"] === 1
          ? structureResponse([{ title: "sourceless item", url: "https://beta-source.test/first-attempt", kind: "doc" }])
          : structureResponse([
              { title: "placeholder item", url: "https://example.com/x", kind: "doc" },
              { title: "kept item", url: "https://beta-source.test/kept", kind: "doc" },
              { title: "dead item", url: "https://beta-source.test/dead", kind: "doc" },
            ]);
      });

      vi.mocked(checkUrlsReachable).mockImplementation(async (urls: readonly string[]) =>
        urls.map((url) => ({
          url,
          alive: url !== "https://beta-source.test/dead",
          status: url === "https://beta-source.test/dead" ? 404 : 200,
          reason: (url === "https://beta-source.test/dead" ? "client-error" : "ok") as "client-error" | "ok",
        }))
      );

      const result = await findResourceLinksForConceptsAction(["alpha", "beta"], "Computer Science", "gemini");
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      expect(result.perConcept).toHaveLength(2);
      const [alphaOutcome, betaOutcome] = result.perConcept;

      expect(alphaOutcome.concept).toBe("alpha");
      expect(alphaOutcome.failed).toBeTruthy();
      expect(alphaOutcome).toMatchObject({
        sources: 0,
        resolvedSources: 0,
        candidates: 0,
        droppedPlaceholder: 0,
        droppedUncorroborated: 0,
        droppedDuplicate: 0,
        droppedUnreachable: 0,
        kept: 0,
        retried: false,
      });

      expect(betaOutcome.concept).toBe("beta");
      expect(betaOutcome.failed).toBeUndefined();
      expect(betaOutcome.retried).toBe(true);
      expect(betaOutcome.sources).toBe(1);
      expect(betaOutcome.candidates).toBe(3);
      expect(betaOutcome.droppedPlaceholder).toBe(1);
      expect(betaOutcome.droppedUncorroborated).toBe(0);
      expect(betaOutcome.droppedDuplicate).toBe(0);
      expect(betaOutcome.droppedUnreachable).toBe(1);
      expect(betaOutcome.kept).toBe(1);

      // Arithmetic invariants (Y5), independent of the concrete numbers above.
      for (const outcome of result.perConcept) {
        if (outcome.failed) {
          expect(outcome.sources).toBe(0);
          expect(outcome.resolvedSources).toBe(0);
          expect(outcome.candidates).toBe(0);
          expect(outcome.droppedPlaceholder).toBe(0);
          expect(outcome.droppedUncorroborated).toBe(0);
          expect(outcome.droppedDuplicate).toBe(0);
          expect(outcome.droppedUnreachable).toBe(0);
          expect(outcome.kept).toBe(0);
          continue;
        }
        const nonPlaceholder = outcome.candidates - outcome.droppedPlaceholder;
        const survivors = nonPlaceholder - outcome.droppedUncorroborated;
        expect(outcome.droppedDuplicate + outcome.droppedUnreachable + outcome.kept).toBe(survivors);
      }

      // droppedDuplicate has no top-level counterpart (see
      // FindResourceLinksSuccess.perConcept's own doc comment) - only these
      // three fields are summed against the top-level result.
      const sum = (key: "droppedPlaceholder" | "droppedUncorroborated" | "droppedUnreachable" | "kept") =>
        result.perConcept.reduce((acc, o) => acc + o[key], 0);
      expect(result.droppedPlaceholder).toBe(sum("droppedPlaceholder"));
      expect(result.droppedUncorroborated).toBe(sum("droppedUncorroborated"));
      expect(result.droppedUnreachable).toBe(sum("droppedUnreachable"));
      expect(sum("kept")).toBe(result.links.length);
      expect("droppedDuplicate" in result).toBe(false);
    });
  });

  describe("Fixer finding C: MAX_SOURCES_TO_RESOLVE bounds a concept's redirect-resolution fetches", () => {
    it("only the first 10 redirect-host sources reach the resolver - the rest pass through with zero fetches", async () => {
      const resolvedUrl = "https://real-publisher.test/deep/page";
      const fetchImpl = vi.fn().mockResolvedValue({
        status: 302,
        headers: { get: (name: string) => (name.toLowerCase() === "location" ? resolvedUrl : null) },
      });
      const resolver = createGroundingResolver({ fetchImpl });

      // 15 redirect-host sources from one grounded call - only the first 10
      // may ever reach the resolver's fetch, regardless of how many the
      // model's search happened to return.
      const sources = Array.from({ length: 15 }, (_, i) => ({
        title: `source ${i}`,
        uri: `https://vertexaisearch.cloud.google.com/grounding-api-redirect/redir${i}`,
      }));

      vi.mocked(callLlm)
        .mockResolvedValueOnce(groundedResponse("prose", sources))
        .mockResolvedValueOnce(structureResponse([{ title: "Found via search", url: resolvedUrl, kind: "doc" }]));

      const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini", { resolver });
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      expect(fetchImpl).toHaveBeenCalledTimes(10);
      expect(result.perConcept[0].sources).toBe(15);
    });
  });

  describe("Fixer finding D: an oversized visited-source uri never reaches the structuring prompt or a selectable index", () => {
    it("a 3 KB resolved uri is excluded from the structuring prompt and cannot be selected via \"source\"", async () => {
      const hugeUri = "https://oversized.test/" + "a".repeat(3000);
      const fetchImpl = vi.fn().mockResolvedValue({
        status: 302,
        headers: { get: (name: string) => (name.toLowerCase() === "location" ? hugeUri : null) },
      });
      const resolver = createGroundingResolver({ fetchImpl });

      vi.mocked(callLlm)
        .mockResolvedValueOnce(
          groundedResponse("prose mentioning the resource", [
            { title: "vague title", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/redir1" },
          ])
        )
        .mockResolvedValueOnce(
          // The model (incorrectly) still tries to cite the dropped entry by
          // index 0 - since the bounded list is empty, this is out of range
          // and its own url is left untouched.
          structureResponse([{ title: "Item", url: "https://model-own-url.test/x", kind: "doc", source: 0 }])
        );

      const result = await findResourceLinksForConceptsAction(["recursion"], "Computer Science", "gemini", { resolver });
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      const structureCall = vi.mocked(callLlm).mock.calls[1][0];
      const structurePrompt = structureCall.contents[0].parts[0];
      const structureText = "text" in structurePrompt ? structurePrompt.text : "";
      expect(structureText).not.toContain(hugeUri);

      // The model's own url survives untouched - the oversized uri was never
      // a selectable index, so it can never end up as a returned link either.
      expect(JSON.stringify(result)).not.toContain(hugeUri);
    });
  });
});
