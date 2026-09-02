import { describe, it, expect, vi, beforeEach } from "vitest";

// Split out of discussion-replies.test.ts (FIX 1, file-size-ceiling review):
// that file's own draftDiscussionRepliesAction describe block, moved here
// verbatim. Only the mocks this action's tests actually exercise are
// declared - requireOwner, "./shared" (getWritingStyleBlock, which this
// action does call), a partially-mocked "@/lib/llm" (callLlm is a
// controllable vi.fn(), while describeLlmFailure/describeEmptyLlmText come
// through as the REAL implementations via importActual, since the
// "preserves the REAL reason..." / "empty response" tests below assert on
// their actual formatting), and a partially-mocked
// "@/lib/discussion-reply-prompt" (buildReplyDraftingPrompt wrapped in
// vi.fn(actual.buildReplyDraftingPrompt) so its call arguments can be
// inspected, everything else - the coercion helpers, constants - real).
// discussion-replies.ts also imports "./learning-resource-links" at module
// scope (it is one file backing all three actions), but
// draftDiscussionRepliesAction itself never calls into it, so that loads as
// its real implementation here - the same approach this repo's
// discussion-replies-bulk-redaction.test.ts already uses for its own
// (different) subset of mocks. Per this repo's "no cross-test-file imports"
// rule, nothing is imported from a sibling *.test.ts file; the small shared
// fixtures (OWNER, posts) are duplicated rather than shared.

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("./shared", () => ({
  getWritingStyleBlock: vi.fn(),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

// docs/reply-composition-controls-acceptance-criteria.md JOB3: partially
// mocked the same way "@/lib/llm" is above - every real export (the prompt
// builders, the constants, the coercion-relevant Set/array exports) comes
// through as the REAL implementation via importActual, and only
// `buildReplyDraftingPrompt` is wrapped in `vi.fn(actual.buildReplyDraftingPrompt)`
// so its call arguments can be inspected directly. This lets the tests below
// assert exactly what `composition` reaches the prompt builder as, without
// depending on that builder's own prompt-text wording (owned by the sibling
// half of this group and still in flux) or re-implementing its coercion.
vi.mock("@/lib/discussion-reply-prompt", async () => {
  const actual = await vi.importActual<typeof import("@/lib/discussion-reply-prompt")>("@/lib/discussion-reply-prompt");
  return {
    ...actual,
    buildReplyDraftingPrompt: vi.fn(actual.buildReplyDraftingPrompt),
  };
});

import { requireOwner } from "@/lib/supabase/auth";
import { getWritingStyleBlock } from "./shared";
import { callLlm } from "@/lib/llm";
import {
  DRAFT_BATCH_SIZE,
  DEFAULT_REPLY_COMPOSITION,
  buildReplyDraftingPrompt,
  type ReplyCompositionSettings,
} from "@/lib/discussion-reply-prompt";
import { draftDiscussionRepliesAction } from "./discussion-replies";

const OWNER = { id: "owner-1", email: "owner@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER as never);
  vi.mocked(getWritingStyleBlock).mockResolvedValue("");
});

describe("draftDiscussionRepliesAction", () => {
  const posts = [
    { id: "row-a", author: "Priya", text: "Post one." },
    { id: "row-b", author: "Marcus", text: "Post two." },
    { id: "row-c", author: "Devon", text: "Post three." },
  ];

  it("requires ownership - a rejected requireOwner is caught and returned as { error }, never thrown", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized. Sign in with an approved account."));
    await expect(draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini")).resolves.toEqual({
      error: "Not authorized. Sign in with an approved account.",
    });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses zero posts without calling the model", async () => {
    const result = await draftDiscussionRepliesAction([], "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
    expect(result).toEqual({ error: "No posts to reply to." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses a batch over DRAFT_BATCH_SIZE without calling the model", async () => {
    const tooMany = Array.from({ length: DRAFT_BATCH_SIZE + 1 }, (_, i) => ({ id: `r${i}`, author: `A${i}`, text: `T${i}` }));
    const result = await draftDiscussionRepliesAction(tooMany, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
    expect(result).toEqual({ error: "Too many posts in one batch." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("uses maxOutputTokens 4096 and temperature 0.7", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify(posts.map((_, i) => ({ post: i + 1, reply: `Reply ${i + 1}` }))),
    } as never);
    await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
    const callArgs = vi.mocked(callLlm).mock.calls[0][0];
    expect(callArgs.generationConfig?.maxOutputTokens).toBe(4096);
    expect(callArgs.generationConfig?.temperature).toBe(0.7);
  });

  it("fetches the writing style block for the owner and lets a failure inside it not fail the draft", async () => {
    vi.mocked(getWritingStyleBlock).mockResolvedValueOnce("");
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify(posts.map((_, i) => ({ post: i + 1, reply: `Reply ${i + 1}` }))),
    } as never);
    const result = await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
    expect(getWritingStyleBlock).toHaveBeenCalledWith("owner-1");
    expect("error" in result).toBe(false);
  });

  it("preserves the REAL reason on a failed call - a 429 and a 400 must read differently", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 429, body: "Rate limit exceeded" } as never);
    const result429 = await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");

    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 400, body: "Bad request" } as never);
    const result400 = await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");

    expect("error" in result429 && "error" in result400).toBe(true);
    if ("error" in result429 && "error" in result400) {
      expect(result429.error).not.toBe(result400.error);
      expect(result429.error).toContain("429");
      expect(result400.error).toContain("400");
    }
  });

  it("returns a distinct error for a successful-but-empty response", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "  ", status: 200, body: "" } as never);
    const result = await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("empty response");
  });

  it("returns a distinct error when the response cannot be parsed at all", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "complete garbage", status: 200, body: "" } as never);
    const result = await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("Could not read the drafted replies");
  });

  it("maps positional post numbers back to the caller's own row ids", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify([
        { post: 1, reply: "Reply to Priya." },
        { post: 2, reply: "Reply to Marcus." },
        { post: 3, reply: "Reply to Devon." },
      ]),
    } as never);
    const result = await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
    expect(result).toEqual({
      replies: [
        { id: "row-a", reply: "Reply to Priya." },
        { id: "row-b", reply: "Reply to Marcus." },
        { id: "row-c", reply: "Reply to Devon." },
      ],
    });
  });

  it("handles out-of-order and scrambled post numbers by mapping each to the correct row id", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify([
        { post: 3, reply: "Reply to Devon." },
        { post: 1, reply: "Reply to Priya." },
        { post: 2, reply: "Reply to Marcus." },
      ]),
    } as never);
    const result = await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
    expect("replies" in result).toBe(true);
    if ("replies" in result) {
      const byId = new Map(result.replies.map((r) => [r.id, r.reply]));
      expect(byId.get("row-a")).toBe("Reply to Priya.");
      expect(byId.get("row-b")).toBe("Reply to Marcus.");
      expect(byId.get("row-c")).toBe("Reply to Devon.");
    }
  });

  it("marks exactly the skipped post missing rather than failing the whole batch", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify([
        { post: 1, reply: "Reply to Priya." },
        { post: 3, reply: "Reply to Devon." },
        // post 2 (Marcus) is missing from the model's response entirely.
      ]),
    } as never);
    const result = await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
    expect("replies" in result).toBe(true);
    if ("replies" in result) {
      const ids = result.replies.map((r) => r.id);
      expect(ids).toContain("row-a");
      expect(ids).toContain("row-c");
      expect(ids).not.toContain("row-b");
      expect(result.replies).toHaveLength(2);
    }
  });

  it("falls back to positional order when the array is the right length but NO element carries a usable post index", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: "",
      // Same length as posts.length (3), but "post" is missing/invalid on every element.
      text: JSON.stringify([
        { reply: "Reply to Priya." },
        { reply: "Reply to Marcus." },
        { reply: "Reply to Devon." },
      ]),
    } as never);
    const result = await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
    expect(result).toEqual({
      replies: [
        { id: "row-a", reply: "Reply to Priya." },
        { id: "row-b", reply: "Reply to Marcus." },
        { id: "row-c", reply: "Reply to Devon." },
      ],
    });
  });

  it("does NOT fall back positionally when the array length differs from posts.length and nothing carries a usable index", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify([{ reply: "Only one reply, no post index." }]),
    } as never);
    const result = await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
    expect(result).toEqual({ replies: [] });
  });

  it("F2: keeps only the FIRST occurrence of a repeated positional index, so the mapping stays one-to-one", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify([
        { post: 2, reply: "First reply for post 2." },
        { post: 2, reply: "Duplicate reply for post 2, should be dropped." },
        { post: 1, reply: "Reply to Priya." },
      ]),
    } as never);
    const result = await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
    expect("replies" in result).toBe(true);
    if ("replies" in result) {
      // Exactly one reply per id - never two entries for row-b (post 2).
      const ids = result.replies.map((r) => r.id);
      expect(ids.filter((id) => id === "row-b")).toHaveLength(1);
      const byId = new Map(result.replies.map((r) => [r.id, r.reply]));
      expect(byId.get("row-b")).toBe("First reply for post 2.");
      expect(byId.get("row-a")).toBe("Reply to Priya.");
      // row-c (post 3) never appeared at all - missing, not duplicated.
      expect(ids).not.toContain("row-c");
      expect(result.replies).toHaveLength(2);
    }
  });

  it("ignores an out-of-range post index (0 or > posts.length)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify([
        { post: 0, reply: "Invalid low." },
        { post: 99, reply: "Invalid high." },
        { post: 1, reply: "Valid." },
      ]),
    } as never);
    const result = await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
    expect(result).toEqual({ replies: [{ id: "row-a", reply: "Valid." }] });
  });

  // docs/discussion-thread-structure-acceptance-criteria.md T6: this action
  // does no gating itself (that already happened in resolveDraftParent,
  // owned by the sibling half of this group) - it only has to thread
  // whatever `parent` it is handed through into the prompt sent on the wire.
  it("T6: threads a post's `parent` through into the actual prompt sent to the model", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify(posts.map((_, i) => ({ post: i + 1, reply: `Reply ${i + 1}` }))),
    } as never);

    const postsWithParent = [
      { ...posts[0], parent: { author: "Marcus", text: "The original thread-starting post." } },
      posts[1],
      posts[2],
    ];
    await draftDiscussionRepliesAction(postsWithParent, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");

    const callArgs = vi.mocked(callLlm).mock.calls[0][0];
    const promptPart = callArgs.contents[0].parts[0] as { text: string };
    expect(promptPart.text).toContain("CONTEXT ONLY - DO NOT REPLY TO THIS");
    expect(promptPart.text).toContain("The original thread-starting post.");
  });

  it("sends no CONTEXT ONLY block when no post in the batch carries a parent", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify(posts.map((_, i) => ({ post: i + 1, reply: `Reply ${i + 1}` }))),
    } as never);
    await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
    const callArgs = vi.mocked(callLlm).mock.calls[0][0];
    const promptPart = callArgs.contents[0].parts[0] as { text: string };
    expect(promptPart.text).not.toContain("CONTEXT ONLY");
  });

  // docs/reply-composition-controls-acceptance-criteria.md JOB3: `composition`
  // must reach buildReplyDraftingPrompt, and it must be coerced at the server
  // boundary first - never trusted as-is, since it arrives from the client
  // over the Server Action wire. `buildReplyDraftingPrompt` is spied (see the
  // `vi.mock("@/lib/discussion-reply-prompt", ...)` block at the top of this
  // file) so these tests inspect the EXACT argument the action hands it,
  // rather than depending on that builder's own prompt wording.
  describe("composition threading and server-boundary coercion", () => {
    function mockOk() {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify(posts.map((_, i) => ({ post: i + 1, reply: `Reply ${i + 1}` }))),
      } as never);
    }

    it("passes an already-valid composition through to buildReplyDraftingPrompt unchanged", async () => {
      mockOk();
      const composition: ReplyCompositionSettings = {
        ingredients: ["insight", "resources"],
        addressByName: false,
        formality: "formal",
      };
      await draftDiscussionRepliesAction(posts, "students", "", composition, "gemini");
      expect(buildReplyDraftingPrompt).toHaveBeenCalledTimes(1);
      const call = vi.mocked(buildReplyDraftingPrompt).mock.calls[0];
      // posts, audience, courseName, styleBlock, composition - the 5th
      // positional argument is what this test is actually pinning.
      expect(call[4]).toEqual(composition);
    });

    it("passes DEFAULT_REPLY_COMPOSITION through unchanged (the common, un-customised case)", async () => {
      mockOk();
      await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
      const call = vi.mocked(buildReplyDraftingPrompt).mock.calls[0];
      expect(call[4]).toEqual(DEFAULT_REPLY_COMPOSITION);
    });

    it("threads `greetingName` through to buildReplyDraftingPrompt's posts argument unchanged", async () => {
      mockOk();
      const postsWithGreeting = [{ ...posts[0], greetingName: "Priya" }, posts[1], posts[2]];
      await draftDiscussionRepliesAction(postsWithGreeting, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
      const call = vi.mocked(buildReplyDraftingPrompt).mock.calls[0];
      expect(call[0][0]).toEqual({ id: "row-a", author: "Priya", text: "Post one.", greetingName: "Priya" });
    });

    it("a non-array `ingredients` field coerces to the default set rather than reaching the prompt builder", async () => {
      mockOk();
      const bogus = { ingredients: "compliment", addressByName: true, formality: "balanced" } as unknown as ReplyCompositionSettings;
      const result = await draftDiscussionRepliesAction(posts, "students", "", bogus, "gemini");
      expect("error" in result).toBe(false);
      const call = vi.mocked(buildReplyDraftingPrompt).mock.calls[0];
      expect(call[4]).toEqual(DEFAULT_REPLY_COMPOSITION);
    });

    it("an ingredient string outside the enum is dropped, not the whole selection reset to default", async () => {
      mockOk();
      const bogus = {
        ingredients: ["compliment", "not-a-real-ingredient"],
        addressByName: true,
        formality: "balanced",
      } as unknown as ReplyCompositionSettings;
      await draftDiscussionRepliesAction(posts, "students", "", bogus, "gemini");
      const call = vi.mocked(buildReplyDraftingPrompt).mock.calls[0];
      expect((call[4] as ReplyCompositionSettings).ingredients).toEqual(["compliment"]);
    });

    it("a duplicate ingredient collapses to one entry", async () => {
      mockOk();
      const bogus = {
        ingredients: ["compliment", "compliment"],
        addressByName: true,
        formality: "balanced",
      } as unknown as ReplyCompositionSettings;
      await draftDiscussionRepliesAction(posts, "students", "", bogus, "gemini");
      const call = vi.mocked(buildReplyDraftingPrompt).mock.calls[0];
      expect((call[4] as ReplyCompositionSettings).ingredients).toEqual(["compliment"]);
    });

    it("an unrecognised formality falls back to the default rather than reaching the prompt builder", async () => {
      mockOk();
      const bogus = {
        ingredients: [],
        addressByName: true,
        formality: "extremely-formal",
      } as unknown as ReplyCompositionSettings;
      await draftDiscussionRepliesAction(posts, "students", "", bogus, "gemini");
      const call = vi.mocked(buildReplyDraftingPrompt).mock.calls[0];
      expect((call[4] as ReplyCompositionSettings).formality).toBe(DEFAULT_REPLY_COMPOSITION.formality);
    });

    it("never throws on a wildly malformed composition (null, a bare string, a number) - always resolves", async () => {
      for (const bogus of [null, "not an object at all", 42, undefined] as unknown as ReplyCompositionSettings[]) {
        mockOk();
        // If coerceCompositionAtBoundary ever threw instead of falling back,
        // this `await` would reject and fail the test - no separate
        // "does not throw" assertion is needed on top of that.
        const result = await draftDiscussionRepliesAction(posts, "students", "", bogus, "gemini");
        expect("error" in result).toBe(false);
      }
    });
  });

  // "Activate this recording from the Knowledge base" - `knowledgeContext` is
  // a NEW TRAILING argument, after `provider` (never inserted earlier -
  // every existing call above in this describe block uses the old 5-argument
  // shape and must keep working unchanged). Coerced at this Server Action
  // wire the same way `composition` is (coerceKnowledgeContextAtBoundary
  // mirrors coerceCompositionAtBoundary's own rationale) before reaching
  // buildReplyDraftingPrompt - inspected the same way, via the spied
  // buildReplyDraftingPrompt's own call arguments.
  describe("knowledgeContext threading and server-boundary coercion (docs owner ask: activate recording from the Knowledge base)", () => {
    function mockOk() {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify(posts.map((_, i) => ({ post: i + 1, reply: `Reply ${i + 1}` }))),
      } as never);
    }

    it("threads a real knowledgeContext through to buildReplyDraftingPrompt's 6th (trailing) argument, unchanged", async () => {
      mockOk();
      const text = "Reference context below, from knowledge base pages the instructor explicitly selected...\n\nSelected page: Grading Rubric\nLate work loses 10% per day.";
      await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini", text);
      expect(buildReplyDraftingPrompt).toHaveBeenCalledTimes(1);
      const call = vi.mocked(buildReplyDraftingPrompt).mock.calls[0];
      // posts(0), audience(1), courseName(2), styleBlock(3), composition(4),
      // knowledgeContext(5) - the 6th positional argument is what this test
      // pins, exactly the way the composition tests above pin call[4].
      expect(call[5]).toBe(text);
      // And it actually reached the real prompt sent to the model - the
      // anti-injection framing survived through this action's own coercion
      // step, not just into the mocked builder's recorded arguments.
      const callArgs = vi.mocked(callLlm).mock.calls[0][0];
      const promptPart = callArgs.contents[0].parts[0] as { text: string };
      expect(promptPart.text).toContain("Late work loses 10% per day.");
    });

    it("omitting knowledgeContext passes undefined to buildReplyDraftingPrompt (the 5-argument, pre-feature call shape)", async () => {
      mockOk();
      await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
      const call = vi.mocked(buildReplyDraftingPrompt).mock.calls[0];
      expect(call[5]).toBeUndefined();
    });

    it("a whitespace-only knowledgeContext coerces to undefined rather than reaching the prompt builder as a blank section", async () => {
      mockOk();
      await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini", "   \n  ");
      const call = vi.mocked(buildReplyDraftingPrompt).mock.calls[0];
      expect(call[5]).toBeUndefined();
    });

    it("a non-string knowledgeContext (arrived malformed over the wire) coerces to undefined rather than throwing", async () => {
      mockOk();
      const bogus = 42 as unknown as string;
      const result = await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini", bogus);
      expect("error" in result).toBe(false);
      const call = vi.mocked(buildReplyDraftingPrompt).mock.calls[0];
      expect(call[5]).toBeUndefined();
    });

    it("caps an over-long knowledgeContext at the server boundary, truncating (never dropping) and marking it VISIBLY inside the prompt text", async () => {
      mockOk();
      // Well above buildKnowledgeContextBlock's own 10,000-character default
      // (the real producer's ceiling), and above this action's own
      // defense-in-depth cap.
      const overLong = "x".repeat(25000);
      await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini", overLong);
      const call = vi.mocked(buildReplyDraftingPrompt).mock.calls[0];
      const received = call[5] as string;
      expect(received).toBeDefined();
      expect(received.length).toBeLessThan(overLong.length);
      // Truncated, not silently dropped to nothing.
      expect(received.length).toBeGreaterThan(0);
      // The truncation is visible INSIDE the text itself - never a silent cut.
      expect(received).toContain("truncated");
    });

    it("does NOT touch a knowledgeContext already comfortably under the cap", async () => {
      mockOk();
      const short = "Selected page: Policy\nA short policy.";
      await draftDiscussionRepliesAction(posts, "students", "", DEFAULT_REPLY_COMPOSITION, "gemini", short);
      const call = vi.mocked(buildReplyDraftingPrompt).mock.calls[0];
      expect(call[5]).toBe(short);
    });
  });

  // docs/reply-resource-concepts-acceptance-criteria.md RC1/RC2/RC2b/RC2c:
  // the model's optional per-reply "concepts" array is parsed
  // (parseReplyConcepts), then any term that redacts to no letters under
  // that post's OWN author is dropped, before the result is threaded onto
  // the reply - `concepts` is emitted only when non-empty (absent stays
  // absent, mirroring `postedAt` - see the two verbatim `toEqual` assertions
  // at :253/:294 above, which are left untouched by this group precisely
  // because they pin that absent-stays-absent shape).
  describe("concepts (docs/reply-resource-concepts-acceptance-criteria.md RC1/RC2/RC2b/RC2c)", () => {
    it("a reply with concepts round-trips them onto the returned reply", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify([
          { post: 1, reply: "Reply to Priya.", concepts: ["utilitarianism", "moral luck"] },
        ]),
      } as never);
      const result = await draftDiscussionRepliesAction([posts[0]], "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
      expect(result).toEqual({
        replies: [{ id: "row-a", reply: "Reply to Priya.", concepts: ["utilitarianism", "moral luck"] }],
      });
    });

    it("RC2c: a term equal to the post's own author name is dropped", async () => {
      const post = { id: "row-x", author: "Isaac Newton", text: "A post about gravity." };
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify([{ post: 1, reply: "A reply.", concepts: ["Isaac Newton", "gravity"] }]),
      } as never);
      const result = await draftDiscussionRepliesAction([post], "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
      expect(result).toEqual({ replies: [{ id: "row-x", reply: "A reply.", concepts: ["gravity"] }] });
    });

    it("RC2c: a term containing only the author's name plus punctuation is dropped (no letters survive redaction)", async () => {
      const post = { id: "row-x", author: "Isaac Newton", text: "A post about gravity." };
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify([{ post: 1, reply: "A reply.", concepts: ["Isaac Newton.", "orbital mechanics"] }]),
      } as never);
      const result = await draftDiscussionRepliesAction([post], "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
      expect(result).toEqual({ replies: [{ id: "row-x", reply: "A reply.", concepts: ["orbital mechanics"] }] });
    });

    it("RC2c: a mangled-but-lettered term is KEPT exactly as the model wrote it - redaction happens at search time, not here", async () => {
      const post = { id: "row-x", author: "Isaac Newton", text: "A post about physics." };
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify([{ post: 1, reply: "A reply.", concepts: ["Newton's laws"] }]),
      } as never);
      const result = await draftDiscussionRepliesAction([post], "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
      // "Newton's laws" redacts to "'s laws" (still has letters), so this
      // term survives the RC2c filter - but is stored UNREDACTED, as the
      // model actually wrote it. The full-redaction pass over a SURVIVING
      // term happens later, at search time (resourceQueryForRow, group B),
      // never here.
      expect(result).toEqual({ replies: [{ id: "row-x", reply: "A reply.", concepts: ["Newton's laws"] }] });
    });

    it("RC2/RC2c worked example: the cap applies AFTER the author-name drop, not before - [\"Isaac Newton\", \"a\", \"b\", \"c\"] yields [\"a\", \"b\", \"c\"]", async () => {
      const post = { id: "row-x", author: "Isaac Newton", text: "A post about gravity." };
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify([{ post: 1, reply: "A reply.", concepts: ["Isaac Newton", "a", "b", "c"] }]),
      } as never);
      const result = await draftDiscussionRepliesAction([post], "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
      // If the cap were applied BEFORE the author-name drop (inside
      // parseReplyConcepts's own default cap of 3), "c" would already be
      // gone and this would come back ["a", "b"] instead.
      expect(result).toEqual({ replies: [{ id: "row-x", reply: "A reply.", concepts: ["a", "b", "c"] }] });
    });

    it("emits no concepts key when every term is dropped (author-only concepts)", async () => {
      const post = { id: "row-x", author: "Isaac Newton", text: "A post about gravity." };
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify([{ post: 1, reply: "A reply.", concepts: ["Isaac Newton"] }]),
      } as never);
      const result = await draftDiscussionRepliesAction([post], "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
      expect(result).toEqual({ replies: [{ id: "row-x", reply: "A reply." }] });
      if ("replies" in result) {
        expect("concepts" in result.replies[0]).toBe(false);
      }
    });

    it("no concepts field at all from the model leaves the reply exactly as before (absent stays absent)", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify([{ post: 1, reply: "A reply with no concepts." }]),
      } as never);
      const result = await draftDiscussionRepliesAction([posts[0]], "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
      expect(result).toEqual({ replies: [{ id: "row-a", reply: "A reply with no concepts." }] });
    });

    it("also applies through the positional fallback path (no usable post index, right-length array)", async () => {
      const post = { id: "row-x", author: "Isaac Newton", text: "A post about gravity." };
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify([{ reply: "A reply.", concepts: ["Isaac Newton", "gravity"] }]),
      } as never);
      const result = await draftDiscussionRepliesAction([post], "students", "", DEFAULT_REPLY_COMPOSITION, "gemini");
      expect(result).toEqual({ replies: [{ id: "row-x", reply: "A reply.", concepts: ["gravity"] }] });
    });
  });
});
