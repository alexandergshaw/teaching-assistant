import { describe, it, expect, vi, beforeEach } from "vitest";

// Split out of discussion-replies.test.ts (FIX 1, file-size-ceiling review):
// that file's own gatherReplyResourcesAction describe block, moved here
// verbatim. Only the mocks this action's tests actually exercise are
// declared - requireOwner and findResourceLinksForConceptsAction
// (gatherReplyResourcesAction reuses that action wholesale rather than
// calling an LLM itself, so callLlm is never invoked from this path and does
// not need mocking). discussion-replies.ts also imports "./shared" and
// "@/lib/discussion-reply-prompt" at module scope (it is one file backing
// all three actions), but gatherReplyResourcesAction itself never calls into
// either, so those load as their real implementations here - the same
// approach this repo's discussion-replies-bulk-redaction.test.ts already
// uses for its own (near-identical) subset of mocks. Per this repo's "no
// cross-test-file imports" rule, nothing is imported from a sibling
// *.test.ts file; the small shared fixtures (OWNER, mockLinksOnce) are
// duplicated rather than shared.

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

// gatherReplyResourcesAction reuses findResourceLinksForConceptsAction
// wholesale rather than calling an LLM itself - mock the reused action, not
// callLlm, for that action's own tests below.
vi.mock("./learning-resource-links", () => ({
  findResourceLinksForConceptsAction: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { findResourceLinksForConceptsAction } from "./learning-resource-links";
import { RESOURCE_BATCH_SIZE } from "@/lib/discussion-reply-prompt";
import { RESOURCE_KINDS } from "@/lib/resource-kind";
import { gatherReplyResourcesAction } from "./discussion-replies";

const OWNER = { id: "owner-1", email: "owner@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER as never);
});

describe("gatherReplyResourcesAction", () => {
  // Y5/Y8: `perConcept` is now a REQUIRED field on `FindResourceLinksSuccess`
  // - gatherReplyResourcesAction's own Y8 code reads `result.perConcept`
  // unconditionally, so every mock below must carry one or it crashes at
  // runtime (`for...of undefined`), not merely fail a type check. Built from
  // the ACTUAL concepts argument the call received (mockImplementationOnce,
  // not a static mockResolvedValueOnce) so it stays realistic: one entry per
  // concept actually queried, `sources: 0` when `degraded` (mirrors reality -
  // a degraded run means no concept had a source), `candidates`/`kept`
  // derived from how many of `links` carry that concept.
  function mockLinksOnce(links: Array<Record<string, unknown>>, degraded = false) {
    vi.mocked(findResourceLinksForConceptsAction).mockImplementationOnce(async (concepts) => {
      const perConcept = (concepts as readonly string[]).map((concept) => {
        const forConcept = links.filter((l) => l.concept === concept).length;
        return {
          concept,
          sources: degraded ? 0 : 1,
          resolvedSources: degraded ? 0 : 1,
          candidates: forConcept,
          droppedPlaceholder: 0,
          droppedUncorroborated: 0,
          droppedDuplicate: 0,
          droppedUnreachable: 0,
          kept: forConcept,
          retried: false,
        };
      });
      return {
        links,
        degraded,
        droppedUncorroborated: 0,
        droppedPlaceholder: 0,
        droppedUnreachable: 0,
        notes: [],
        perConcept,
      } as never;
    });
  }

  /** Y8: the "no entry" outcome every empty-concept post (or one whose
   *  concept the reused action never returned a `perConcept` entry for) gets
   *  - a frozen literal so a change to `resourceSearchOutcomeFor`'s "no
   *  entry" branch is pinned exactly, not merely "some object". */
  const NO_ENTRY_OUTCOME = {
    kind: "unknown",
    text: "No links came back for these terms.",
    counts: {
      sources: 0,
      resolvedSources: 0,
      candidates: 0,
      droppedPlaceholder: 0,
      droppedUncorroborated: 0,
      droppedDuplicate: 0,
      droppedUnreachable: 0,
      kept: 0,
      retried: false,
    },
  };

  it("requires ownership - a rejected requireOwner is caught and returned as { error }, never thrown", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized. Sign in with an approved account."));
    await expect(gatherReplyResourcesAction([{ id: "p1", text: "Recursion" }], "", "gemini")).resolves.toEqual({
      error: "Not authorized. Sign in with an approved account.",
    });
    expect(findResourceLinksForConceptsAction).not.toHaveBeenCalled();
  });

  it("refuses a batch over RESOURCE_BATCH_SIZE without calling the reused action", async () => {
    const tooMany = Array.from({ length: RESOURCE_BATCH_SIZE + 1 }, (_, i) => ({ id: `p${i}`, text: `Post ${i}` }));
    const result = await gatherReplyResourcesAction(tooMany, "", "gemini");
    expect(result).toEqual({ error: "Too many posts in one batch." });
    expect(findResourceLinksForConceptsAction).not.toHaveBeenCalled();
  });

  it("R4e: short-circuits for the embedded provider without calling the reused action - degraded, empty resources for every id", async () => {
    const result = await gatherReplyResourcesAction(
      [
        { id: "p1", text: "Recursion" },
        { id: "p2", text: "Sorting" },
      ],
      "",
      "embedded"
    );
    expect(result).toEqual({
      resources: [
        { id: "p1", resources: [] },
        { id: "p2", resources: [] },
      ],
      degraded: true,
    });
    expect(findResourceLinksForConceptsAction).not.toHaveBeenCalled();
  });

  it("returns an entry for every id with no call at all when every post's concept is empty - fixer pass (finding 2): no outcome at all, nothing was ever searched", async () => {
    const result = await gatherReplyResourcesAction(
      [
        { id: "p1", text: "   " },
        { id: "p2", text: "" },
      ],
      "",
      "gemini"
    );
    expect(result).toEqual({
      resources: [
        { id: "p1", resources: [] },
        { id: "p2", resources: [] },
      ],
      degraded: false,
    });
    expect("resources" in result).toBe(true);
    if ("resources" in result) {
      expect("outcome" in result.resources[0]).toBe(false);
      expect("outcome" in result.resources[1]).toBe(false);
    }
    expect(findResourceLinksForConceptsAction).not.toHaveBeenCalled();
  });

  it("fixer pass (finding 2): an empty-concept post gets no outcome while a sibling post with a real concept still gets one", async () => {
    vi.mocked(findResourceLinksForConceptsAction).mockResolvedValueOnce({
      links: [],
      degraded: false,
      droppedUncorroborated: 0,
      droppedPlaceholder: 0,
      droppedUnreachable: 0,
      notes: [],
      perConcept: [
        {
          concept: "Photosynthesis",
          sources: 0,
          resolvedSources: 0,
          candidates: 0,
          droppedPlaceholder: 0,
          droppedUncorroborated: 0,
          droppedDuplicate: 0,
          droppedUnreachable: 0,
          kept: 0,
          retried: false,
        },
      ],
    } as never);

    const result = await gatherReplyResourcesAction(
      [
        { id: "p1", text: "   " }, // empty concept - dropped before the call
        { id: "p2", text: "Photosynthesis" },
      ],
      "",
      "gemini"
    );

    expect("resources" in result).toBe(true);
    if ("resources" in result) {
      const p1 = result.resources.find((r) => r.id === "p1")!;
      const p2 = result.resources.find((r) => r.id === "p2")!;
      expect(p1).toEqual({ id: "p1", resources: [] });
      expect("outcome" in p1).toBe(false);
      expect(p2.outcome?.kind).toBe("no-sources");
    }
  });

  it("fixer pass (finding 2): a REAL concept with no matching perConcept entry (dropped past MAX_CONCEPTS_PER_RUN) still gets the 'no entry' outcome - only an empty-concept post skips it", async () => {
    vi.mocked(findResourceLinksForConceptsAction).mockResolvedValueOnce({
      links: [],
      degraded: false,
      droppedUncorroborated: 0,
      droppedPlaceholder: 0,
      droppedUnreachable: 0,
      notes: [],
      perConcept: [], // the concept never made it into perConcept at all
    } as never);

    const result = await gatherReplyResourcesAction([{ id: "p1", text: "Some real concept" }], "", "gemini");
    expect("resources" in result).toBe(true);
    if ("resources" in result) {
      expect(result.resources[0]).toEqual({ id: "p1", resources: [], outcome: NO_ENTRY_OUTCOME });
    }
  });

  it("R4b: keys results back by CONCEPT STRING, not array index - a dropped empty-concept entry must not shift the mapping", async () => {
    mockLinksOnce([{ concept: "Binary search trees", title: "BST guide", url: "https://a.example/bst", kind: "doc", whatYouGet: "" }]);

    const result = await gatherReplyResourcesAction(
      [
        { id: "p1", text: "   " }, // empty concept - dropped before the call
        { id: "p2", text: "Binary search trees" },
      ],
      "",
      "gemini"
    );

    expect("resources" in result).toBe(true);
    if ("resources" in result) {
      const byId = new Map(result.resources.map((r) => [r.id, r.resources]));
      expect(byId.get("p1")).toEqual([]);
      expect(byId.get("p2")).toEqual([{ title: "BST guide", url: "https://a.example/bst", kind: "doc" }]);
    }

    // The reused action must only ever receive the ONE non-empty concept -
    // the empty entry was dropped, not passed through as "".
    expect(findResourceLinksForConceptsAction).toHaveBeenCalledWith(
      ["Binary search trees"],
      "",
      "gemini",
      undefined,
      expect.objectContaining({ kinds: RESOURCE_KINDS })
    );
  });

  it("R4b: two posts whose concept text is identical receive the SAME links, not different ones", async () => {
    mockLinksOnce([
      { concept: "Recursion basics", title: "Video A", url: "https://a.example/a", kind: "video", whatYouGet: "" },
      { concept: "Recursion basics", title: "Doc B", url: "https://b.example/b", kind: "doc", whatYouGet: "" },
    ]);

    const result = await gatherReplyResourcesAction(
      [
        { id: "p1", text: "Recursion basics" },
        { id: "p2", text: "Recursion basics" },
      ],
      "",
      "gemini"
    );

    expect("resources" in result).toBe(true);
    if ("resources" in result) {
      const byId = new Map(result.resources.map((r) => [r.id, r.resources]));
      const p1 = byId.get("p1");
      const p2 = byId.get("p2");
      expect(p1).toEqual(p2);
      expect(p1?.map((r) => r.title).sort()).toEqual(["Doc B", "Video A"]);
    }

    // Y8: the duplicate concept string is deduped to ONE entry before the
    // call - the search pair fires once for "Recursion basics", not twice.
    expect(findResourceLinksForConceptsAction).toHaveBeenCalledWith(
      ["Recursion basics"],
      "",
      "gemini",
      undefined,
      expect.any(Object)
    );
  });

  it("R4f: caps at 3 links per post even when the reused action returns more for that concept", async () => {
    mockLinksOnce([
      { concept: "Sorting algorithms", title: "T1", url: "https://x/1", kind: "doc", whatYouGet: "" },
      { concept: "Sorting algorithms", title: "T2", url: "https://x/2", kind: "doc", whatYouGet: "" },
      { concept: "Sorting algorithms", title: "T3", url: "https://x/3", kind: "doc", whatYouGet: "" },
      { concept: "Sorting algorithms", title: "T4", url: "https://x/4", kind: "doc", whatYouGet: "" },
      { concept: "Sorting algorithms", title: "T5", url: "https://x/5", kind: "doc", whatYouGet: "" },
    ]);

    const result = await gatherReplyResourcesAction([{ id: "p1", text: "Sorting algorithms" }], "", "gemini");

    expect("resources" in result).toBe(true);
    if ("resources" in result) {
      expect(result.resources[0].resources).toHaveLength(3);
      expect(result.resources[0].resources.map((r) => r.title)).toEqual(["T1", "T2", "T3"]);
    }
  });

  it("carries an entry for an id that yielded nothing (searched, found none) alongside one that got links", async () => {
    mockLinksOnce([{ concept: "Photosynthesis", title: "Overview", url: "https://a/1", kind: "doc", whatYouGet: "" }]);

    const result = await gatherReplyResourcesAction(
      [
        { id: "p1", text: "Photosynthesis" },
        { id: "p2", text: "Mitosis" },
      ],
      "",
      "gemini"
    );

    expect("resources" in result).toBe(true);
    if ("resources" in result) {
      const byId = new Map(result.resources.map((r) => [r.id, r.resources]));
      expect(byId.get("p1")).toHaveLength(1);
      expect(byId.get("p2")).toEqual([]);
    }
  });

  it("carries whatYouGet through as the resource's optional note, omitted (not empty-string) when blank", async () => {
    mockLinksOnce([
      { concept: "Something", title: "T1", url: "https://x/1", kind: "doc", whatYouGet: "Explains the whole thing simply." },
      { concept: "Something", title: "T2", url: "https://x/2", kind: "video", whatYouGet: "" },
    ]);
    const result = await gatherReplyResourcesAction([{ id: "p1", text: "Something" }], "", "gemini");
    expect("resources" in result).toBe(true);
    if ("resources" in result) {
      expect(result.resources[0].resources[0].note).toBe("Explains the whole thing simply.");
      expect(result.resources[0].resources[1].note).toBeUndefined();
    }
  });

  it("propagates the reused action's error verbatim, with no generic message layered on top", async () => {
    vi.mocked(findResourceLinksForConceptsAction).mockResolvedValueOnce({
      error: "Provide at least one concept to search for learning resources.",
    } as never);
    const result = await gatherReplyResourcesAction([{ id: "p1", text: "Something" }], "", "gemini");
    expect(result).toEqual({ error: "Provide at least one concept to search for learning resources." });
  });

  it("forwards degraded: true from the reused action - Y8: the empty post gets the no-sources outcome", async () => {
    mockLinksOnce([], true);
    const result = await gatherReplyResourcesAction([{ id: "p1", text: "Something" }], "", "gemini");
    expect("resources" in result).toBe(true);
    if ("resources" in result) {
      expect(result.degraded).toBe(true);
      expect(result.resources).toEqual([
        {
          id: "p1",
          resources: [],
          outcome: {
            kind: "no-sources",
            text: "No web pages came back this time. Search for resources again - it usually works.",
            counts: {
              sources: 0,
              resolvedSources: 0,
              candidates: 0,
              droppedPlaceholder: 0,
              droppedUncorroborated: 0,
              droppedDuplicate: 0,
              droppedUnreachable: 0,
              kept: 0,
              retried: false,
            },
          },
        },
      ]);
    }
  });

  it("F2/BLOCKER 3: the bulk path redacts the author's name out of the post BODY (a self-introduction), not just off an author field never folded into the concept", async () => {
    // `posts[].author` is a real field now (discussion-reply-redact.ts) -
    // see discussion-replies-bulk-redaction.test.ts for the fuller suite,
    // split out to respect this file's own 1105-line ratchet ceiling.
    mockLinksOnce([]);
    const posts = [
      { id: "p1", text: "Hi everyone, I'm Maria Alvarez and today's topic really got me thinking.", author: "Maria Alvarez" },
    ];
    await gatherReplyResourcesAction(posts, "", "gemini");
    expect(findResourceLinksForConceptsAction).toHaveBeenCalledTimes(1);
    const concepts = vi.mocked(findResourceLinksForConceptsAction).mock.calls[0][0];
    expect(concepts.some((c) => /\bmaria\b/i.test(c))).toBe(false);
    expect(concepts.some((c) => /\balvarez\b/i.test(c))).toBe(false);
  });

  it("passes courseName through as the reused action's courseKind argument, and a five-kind resource profile derived from RESOURCE_KINDS", async () => {
    mockLinksOnce([]);
    await gatherReplyResourcesAction([{ id: "p1", text: "Something" }], "Intro to CS", "gemini");
    expect(findResourceLinksForConceptsAction).toHaveBeenCalledWith(
      ["Something"],
      "Intro to CS",
      "gemini",
      undefined,
      { kinds: RESOURCE_KINDS, resourceTypeSentence: expect.any(String) }
    );
  });

  // -------------------------------------------------------------------
  // Resource-controls feature: eligible kinds (survey answer: the search
  // pipeline never learns a video's duration, so the kinds setting is what
  // actually gets enforced - see the two blocks below for how).
  // -------------------------------------------------------------------

  describe("eligible resource kinds", () => {
    it("an explicit empty kinds array searches nothing - no call at all, mirroring the embedded-provider/empty-concept short circuits", async () => {
      const result = await gatherReplyResourcesAction([{ id: "p1", text: "Recursion" }], "", "gemini", []);
      expect(result).toEqual({ resources: [{ id: "p1", resources: [] }], degraded: false });
      expect(findResourceLinksForConceptsAction).not.toHaveBeenCalled();
    });

    it("a narrowed kinds array reaches the reused action's own profile.kinds argument, filtered to RESOURCE_KINDS order", async () => {
      mockLinksOnce([]);
      await gatherReplyResourcesAction([{ id: "p1", text: "Something" }], "", "gemini", ["video", "doc"]);
      expect(findResourceLinksForConceptsAction).toHaveBeenCalledWith(
        ["Something"],
        "",
        "gemini",
        undefined,
        expect.objectContaining({ kinds: ["doc", "video"] })
      );
    });

    it("SEARCH-side narrowing alone is not enough - a link whose kind the model returned outside the allowed set is dropped from the result (RESULT-side hard filter)", async () => {
      // Simulates a model that ignored the narrowed request and returned a
      // "video" item even though only "doc" was asked for - proves
      // deselecting a kind changes what comes back regardless of model
      // compliance, not merely when the model happens to obey the prompt.
      mockLinksOnce([
        { concept: "Something", title: "A doc", url: "https://a.example/doc", kind: "doc", whatYouGet: "" },
        { concept: "Something", title: "A video anyway", url: "https://a.example/video", kind: "video", whatYouGet: "" },
      ]);
      const result = await gatherReplyResourcesAction([{ id: "p1", text: "Something" }], "", "gemini", ["doc"]);
      expect("resources" in result).toBe(true);
      if ("resources" in result) {
        expect(result.resources[0].resources).toEqual([{ title: "A doc", url: "https://a.example/doc", kind: "doc" }]);
      }
    });

    it("omitting resourceKinds entirely behaves exactly as before this setting existed - the full five-kind default, no filtering", async () => {
      mockLinksOnce([{ concept: "Something", title: "A paper", url: "https://a.example/paper", kind: "paper", whatYouGet: "" }]);
      const result = await gatherReplyResourcesAction([{ id: "p1", text: "Something" }], "", "gemini");
      expect("resources" in result).toBe(true);
      if ("resources" in result) {
        expect(result.resources[0].resources).toEqual([{ title: "A paper", url: "https://a.example/paper", kind: "paper" }]);
      }
    });
  });

  // -------------------------------------------------------------------
  // Resource-controls feature: preferred video length. SURVEY FINDING
  // (stated honestly, not faked): nothing in this pipeline ever learns a
  // candidate's actual video duration, so this setting can only ever reach
  // the model as a stated preference, never an enforced filter.
  // `videoLengthPreferenceSentence` itself (src/lib/video-length-preference.ts,
  // a plain leaf - a "use server" module may export only async functions,
  // src/lib/use-server-exports.test.ts) has its own dedicated test file
  // pinning the sentence content; these tests cover only the CALL BOUNDARY -
  // that the sentence actually lands in extraGuidance, and only there.
  // -------------------------------------------------------------------

  describe("videoLengthPreference reaching the call boundary", () => {
    it("a set preference lands in profile.extraGuidance, matching a frozen literal - not videoLengthPreferenceSentence() on both sides of the assertion", async () => {
      // TAUTOLOGY FIX: the previous version of this test computed BOTH the
      // actual and expected values by calling videoLengthPreferenceSentence
      // itself - a regression that made that function always return
      // undefined would make both sides undefined too, and the test would
      // still pass. Pinned against a frozen literal instead, so a real
      // regression is actually caught.
      mockLinksOnce([]);
      await gatherReplyResourcesAction([{ id: "p1", text: "Something" }], "", "gemini", undefined, { minMinutes: 3, maxMinutes: 12 });
      const call = vi.mocked(findResourceLinksForConceptsAction).mock.calls[0];
      const profile = call[4] as { extraGuidance?: string };
      expect(profile.extraGuidance).toBe(
        "If you suggest a video, prefer one that runs between 3 and 12 minutes, when a suitable option exists for this concept - this is a preference from the instructor, not a hard requirement, since a video's exact length cannot be confirmed from these search results."
      );
    });

    it("no preference set leaves profile with no extraGuidance key at all - byte-identical to before this setting existed", async () => {
      mockLinksOnce([]);
      await gatherReplyResourcesAction([{ id: "p1", text: "Something" }], "", "gemini");
      const call = vi.mocked(findResourceLinksForConceptsAction).mock.calls[0];
      const profile = call[4] as { extraGuidance?: string };
      expect(profile.extraGuidance).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------
  // docs/reply-resource-search-yield-acceptance-criteria.md Y8: the action
  // explains an empty result. Each test below drives `perConcept` directly
  // (not through `mockLinksOnce`'s auto-derivation) so every count is exact
  // and every sentence is pinned as the literal contract text.
  // -------------------------------------------------------------------

  describe("Y8: resourceSearchOutcome", () => {
    function mockOutcomeOnce(links: Array<Record<string, unknown>>, perConcept: Array<Record<string, unknown>>, degraded = false) {
      vi.mocked(findResourceLinksForConceptsAction).mockResolvedValueOnce({
        links,
        degraded,
        droppedUncorroborated: 0,
        droppedPlaceholder: 0,
        droppedUnreachable: 0,
        notes: [],
        perConcept,
      } as never);
    }

    it("a post with links has NO outcome key at all", async () => {
      mockLinksOnce([{ concept: "Something", title: "T1", url: "https://x/1", kind: "doc", whatYouGet: "" }]);
      const result = await gatherReplyResourcesAction([{ id: "p1", text: "Something" }], "", "gemini");
      expect("resources" in result).toBe(true);
      if ("resources" in result) {
        expect(result.resources[0]).toEqual({
          id: "p1",
          resources: [{ title: "T1", url: "https://x/1", kind: "doc" }],
        });
        expect("outcome" in result.resources[0]).toBe(false);
      }
    });

    it("kind 'no-sources': sources === 0", async () => {
      mockOutcomeOnce(
        [],
        [
          {
            concept: "Photosynthesis",
            sources: 0,
            resolvedSources: 0,
            candidates: 0,
            droppedPlaceholder: 0,
            droppedUncorroborated: 0,
            droppedDuplicate: 0,
            droppedUnreachable: 0,
            kept: 0,
            retried: false,
          },
        ]
      );
      const result = await gatherReplyResourcesAction([{ id: "p1", text: "Photosynthesis" }], "", "gemini");
      expect("resources" in result).toBe(true);
      if ("resources" in result) {
        expect(result.resources[0].outcome?.kind).toBe("no-sources");
        expect(result.resources[0].outcome?.text).toBe(
          "No web pages came back this time. Search for resources again - it usually works."
        );
      }
    });

    it("kind 'no-candidates': sources > 0, candidates === 0", async () => {
      mockOutcomeOnce(
        [],
        [
          {
            concept: "Mitosis",
            sources: 2,
            resolvedSources: 2,
            candidates: 0,
            droppedPlaceholder: 0,
            droppedUncorroborated: 0,
            droppedDuplicate: 0,
            droppedUnreachable: 0,
            kept: 0,
            retried: false,
          },
        ]
      );
      const result = await gatherReplyResourcesAction([{ id: "p1", text: "Mitosis" }], "", "gemini");
      expect("resources" in result).toBe(true);
      if ("resources" in result) {
        expect(result.resources[0].outcome?.kind).toBe("no-candidates");
        expect(result.resources[0].outcome?.text).toBe(
          "Pages were searched, but none matched these terms. Editing the reply changes the terms."
        );
      }
    });

    it("kind 'all-dropped', droppedUnreachable >= droppedUncorroborated: names the candidate count and says the pages did not open", async () => {
      mockOutcomeOnce(
        [],
        [
          {
            concept: "Osmosis",
            sources: 2,
            resolvedSources: 2,
            candidates: 3,
            droppedPlaceholder: 0,
            droppedUncorroborated: 1,
            droppedDuplicate: 0,
            droppedUnreachable: 2,
            kept: 0,
            retried: false,
          },
        ]
      );
      const result = await gatherReplyResourcesAction([{ id: "p1", text: "Osmosis" }], "", "gemini");
      expect("resources" in result).toBe(true);
      if ("resources" in result) {
        expect(result.resources[0].outcome?.kind).toBe("all-dropped");
        expect(result.resources[0].outcome?.text).toBe("Found 3 links, but the pages did not open. Search for resources again.");
      }
    });

    it("kind 'all-dropped', otherwise: names the candidate count and says none traced back to a real site", async () => {
      mockOutcomeOnce(
        [],
        [
          {
            concept: "Diffusion",
            sources: 2,
            resolvedSources: 2,
            candidates: 3,
            droppedPlaceholder: 0,
            droppedUncorroborated: 2,
            droppedDuplicate: 0,
            droppedUnreachable: 1,
            kept: 0,
            retried: false,
          },
        ]
      );
      const result = await gatherReplyResourcesAction([{ id: "p1", text: "Diffusion" }], "", "gemini");
      expect("resources" in result).toBe(true);
      if ("resources" in result) {
        expect(result.resources[0].outcome?.kind).toBe("all-dropped");
        expect(result.resources[0].outcome?.text).toBe(
          "Found 3 links, but none traced back to a real site. Editing the reply changes the terms."
        );
      }
    });

    it("fixer pass (finding 1): all-dropped with EVERY candidate a placeholder (droppedUnreachable and droppedUncorroborated both 0) says 'real site', not 'did not open'", async () => {
      mockOutcomeOnce(
        [],
        [
          {
            concept: "Placeholder-only concept",
            sources: 2,
            resolvedSources: 2,
            candidates: 3,
            droppedPlaceholder: 3,
            droppedUncorroborated: 0,
            droppedDuplicate: 0,
            droppedUnreachable: 0,
            kept: 0,
            retried: false,
          },
        ]
      );
      const result = await gatherReplyResourcesAction([{ id: "p1", text: "Placeholder-only concept" }], "", "gemini");
      expect("resources" in result).toBe(true);
      if ("resources" in result) {
        expect(result.resources[0].outcome?.kind).toBe("all-dropped");
        // 0 >= 0 used to be true (the bug), sending this down the "did not
        // open" branch even though nothing was ever fetched. Nothing was
        // ever fetched OR corroborated here - it must read as "none traced
        // back to a real site".
        expect(result.resources[0].outcome?.text).toBe(
          "Found 3 links, but none traced back to a real site. Editing the reply changes the terms."
        );
      }
    });

    it("kind 'unknown', kept > 0: this action's own eligible-kinds filter dropped every kept link for this post - names Eligible resource kinds", async () => {
      mockOutcomeOnce(
        [{ concept: "Sorting", title: "A video", url: "https://x/1", kind: "video", whatYouGet: "" }],
        [
          {
            concept: "Sorting",
            sources: 2,
            resolvedSources: 2,
            candidates: 1,
            droppedPlaceholder: 0,
            droppedUncorroborated: 0,
            droppedDuplicate: 0,
            droppedUnreachable: 0,
            kept: 1,
            retried: false,
          },
        ]
      );
      // Only "doc" is eligible - the model's one kept link is a "video",
      // dropped by gatherReplyResourcesAction's own result-side filter, even
      // though Group A's own pipeline kept it (kept: 1).
      const result = await gatherReplyResourcesAction([{ id: "p1", text: "Sorting" }], "", "gemini", ["doc"]);
      expect("resources" in result).toBe(true);
      if ("resources" in result) {
        expect(result.resources[0].resources).toEqual([]);
        expect(result.resources[0].outcome?.kind).toBe("unknown");
        expect(result.resources[0].outcome?.text).toBe(
          "Links were found, but not in the resource kinds you picked in Eligible resource kinds."
        );
      }
    });

    it("kind 'unknown', kept === 0 (no matching perConcept entry): stays the generic sentence, not the eligible-kinds one", async () => {
      mockOutcomeOnce([], []); // the concept never made it into perConcept at all
      const result = await gatherReplyResourcesAction([{ id: "p1", text: "Some real concept" }], "", "gemini");
      expect("resources" in result).toBe(true);
      if ("resources" in result) {
        expect(result.resources[0].outcome?.kind).toBe("unknown");
        expect(result.resources[0].outcome?.text).toBe("No links came back for these terms.");
      }
    });

    it("kind 'failed': text is 'The search failed: {reason}', reason the first sentence of `failed`", async () => {
      mockOutcomeOnce(
        [],
        [
          {
            concept: "Entropy",
            sources: 0,
            resolvedSources: 0,
            candidates: 0,
            droppedPlaceholder: 0,
            droppedUncorroborated: 0,
            droppedDuplicate: 0,
            droppedUnreachable: 0,
            kept: 0,
            retried: false,
            failed: "Network timeout while fetching the search page. Second sentence that must not appear.",
          },
        ]
      );
      const result = await gatherReplyResourcesAction([{ id: "p1", text: "Entropy" }], "", "gemini");
      expect("resources" in result).toBe(true);
      if ("resources" in result) {
        expect(result.resources[0].outcome?.kind).toBe("failed");
        expect(result.resources[0].outcome?.text).toBe("The search failed: Network timeout while fetching the search page.");
        expect(result.resources[0].outcome?.text).not.toContain("Second sentence");
      }
    });

    it("kind 'failed': a reason with no sentence break over 60 characters is clamped to 60 characters", async () => {
      const longReason = "A".repeat(70) + ". trailing detail that must never appear";
      mockOutcomeOnce(
        [],
        [
          {
            concept: "Entropy",
            sources: 0,
            resolvedSources: 0,
            candidates: 0,
            droppedPlaceholder: 0,
            droppedUncorroborated: 0,
            droppedDuplicate: 0,
            droppedUnreachable: 0,
            kept: 0,
            retried: false,
            failed: longReason,
          },
        ]
      );
      const result = await gatherReplyResourcesAction([{ id: "p1", text: "Entropy" }], "", "gemini");
      expect("resources" in result).toBe(true);
      if ("resources" in result) {
        expect(result.resources[0].outcome?.text).toBe(`The search failed: ${"A".repeat(60)}`);
        expect(result.resources[0].outcome?.text.length).toBeLessThan(90);
      }
    });

    it("duplicate concepts are sent once (dedupe) and both posts get the SAME outcome", async () => {
      mockOutcomeOnce(
        [],
        [
          {
            concept: "Gravity",
            sources: 0,
            resolvedSources: 0,
            candidates: 0,
            droppedPlaceholder: 0,
            droppedUncorroborated: 0,
            droppedDuplicate: 0,
            droppedUnreachable: 0,
            kept: 0,
            retried: false,
          },
        ]
      );
      const result = await gatherReplyResourcesAction(
        [
          { id: "p1", text: "Gravity" },
          { id: "p2", text: "Gravity" },
        ],
        "",
        "gemini"
      );
      expect(findResourceLinksForConceptsAction).toHaveBeenCalledWith(["Gravity"], "", "gemini", undefined, expect.any(Object));
      expect("resources" in result).toBe(true);
      if ("resources" in result) {
        const byId = new Map(result.resources.map((r) => [r.id, r.outcome]));
        expect(byId.get("p1")).toEqual(byId.get("p2"));
        expect(byId.get("p1")?.kind).toBe("no-sources");
      }
    });
  });
});
