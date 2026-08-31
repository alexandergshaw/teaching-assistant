import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors the mocking idiom in media.budget.test.ts (mock only the modules
// this file's action actually calls) and chat-style.test.ts (requireOwner /
// getWritingStyleBlock mocked as bare vi.fn()s). "@/lib/llm" is partially
// mocked - callLlm is a vi.fn() the tests control per-case, while
// describeLlmFailure/describeEmptyLlmText come through as the REAL
// implementations (importActual) so a test asserting "the reason survives"
// is checking the real formatting, not a stub that trivially echoes input.

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

// gatherReplyResourcesAction reuses findResourceLinksForConceptsAction
// wholesale rather than calling an LLM itself - mock the reused action, not
// callLlm, for that action's own tests below.
vi.mock("./learning-resource-links", () => ({
  findResourceLinksForConceptsAction: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { getWritingStyleBlock } from "./shared";
import { callLlm } from "@/lib/llm";
import { findResourceLinksForConceptsAction } from "./learning-resource-links";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";
import { EXTRACT_BATCH_SIZE, DRAFT_BATCH_SIZE, RESOURCE_BATCH_SIZE } from "@/lib/discussion-reply-prompt";
import { RESOURCE_KINDS } from "@/lib/resource-kind";
import { extractDiscussionPostsAction, draftDiscussionRepliesAction, gatherReplyResourcesAction } from "./discussion-replies";
// FIX 1 (thread-structure review pass): the deserialization gate's own
// three-member set, imported here ONLY to pin extraction's live gate against
// it - see the "matches VALID_THREAD_POSITIONS" describe block below for why
// this is a behavioural comparison rather than a direct import of both
// arrays. discussion-thread.ts is a zero-import leaf (no production imports
// of its own), so importing it here creates no cycle - it is a one-way edge
// from this test file into a leaf module, mirroring the same "read a plain
// export into a test" pattern discussion-thread.test.ts already uses for
// `authorsMatch`.
import { VALID_THREAD_POSITIONS } from "@/app/components/recording/discussion-thread";

const OWNER = { id: "owner-1", email: "owner@example.com" };

function base64OfWireBytes(wireBytes: number): string {
  return "A".repeat(wireBytes);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER as never);
  vi.mocked(getWritingStyleBlock).mockResolvedValue("");
});

describe("extractDiscussionPostsAction", () => {
  it("requires ownership - a rejected requireOwner is caught and returned as { error }, never thrown", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized. Sign in with an approved account."));

    await expect(extractDiscussionPostsAction([{ base64: "abc" }], "", "gemini")).resolves.toEqual({
      error: "Not authorized. Sign in with an approved account.",
    });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses zero frames without calling the model", async () => {
    const result = await extractDiscussionPostsAction([], "", "gemini");
    expect(result).toEqual({ error: "No frames were captured from the screen." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses a batch over EXTRACT_BATCH_SIZE without calling the model", async () => {
    const frames = Array.from({ length: EXTRACT_BATCH_SIZE + 1 }, () => ({ base64: "x" }));
    const result = await extractDiscussionPostsAction(frames, "", "gemini");
    expect(result).toEqual({ error: "Too many frames in one batch." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("accepts exactly EXTRACT_BATCH_SIZE frames (the boundary is inclusive)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "[]", status: 200, body: "" } as never);
    const frames = Array.from({ length: EXTRACT_BATCH_SIZE }, () => ({ base64: "x" }));
    const result = await extractDiscussionPostsAction(frames, "", "gemini");
    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ posts: [] });
  });

  it("refuses an over-wire-budget batch BEFORE calling the model", async () => {
    const frames = [{ base64: base64OfWireBytes(UPLOAD_WIRE_BUDGET_BYTES + 1_000) }];
    const result = await extractDiscussionPostsAction(frames, "", "gemini");
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("too large to upload in one request");
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("uses maxOutputTokens 8192 (AC4b-i - 4096 silently drops the tail of a dense batch)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "[]", status: 200, body: "" } as never);
    await extractDiscussionPostsAction([{ base64: "x" }], "", "gemini");
    const callArgs = vi.mocked(callLlm).mock.calls[0][0];
    expect(callArgs.generationConfig?.maxOutputTokens).toBe(8192);
    expect(callArgs.generationConfig?.temperature).toBe(0.1);
  });

  it("preserves the REAL reason on a failed call - a 429 and a 400 must read differently", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 429, body: "Rate limit exceeded" } as never);
    const result429 = await extractDiscussionPostsAction([{ base64: "x" }], "", "gemini");

    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 400, body: "Bad request: invalid image" } as never);
    const result400 = await extractDiscussionPostsAction([{ base64: "x" }], "", "gemini");

    expect("error" in result429 && "error" in result400).toBe(true);
    if ("error" in result429 && "error" in result400) {
      expect(result429.error).not.toBe(result400.error);
      expect(result429.error).toContain("429");
      expect(result400.error).toContain("400");
      expect(result429.error).toContain("Rate limit exceeded");
      expect(result400.error).toContain("Bad request: invalid image");
    }
  });

  it("returns a distinct error for a successful-but-empty response", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "", status: 200, body: "", finishReason: "MAX_TOKENS" } as never);
    const result = await extractDiscussionPostsAction([{ base64: "x" }], "", "gemini");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("empty response");
      expect(result.error).toContain("MAX_TOKENS");
    }
  });

  it("returns a distinct error when the response cannot be parsed at all", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "not json and no brackets at all", status: 200, body: "" } as never);
    const result = await extractDiscussionPostsAction([{ base64: "x" }], "", "gemini");
    expect(result).toEqual({ error: "Could not read any posts from that part of the screen." });
  });

  it("returns SUCCESS with an empty array when parsing succeeds but nothing passes the author/text filter", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "[]", status: 200, body: "" } as never);
    const result = await extractDiscussionPostsAction([{ base64: "x" }], "", "gemini");
    expect(result).toEqual({ posts: [] });
  });

  it("drops entries missing author or text, and keeps well-formed ones with postedAt carried through", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify([
        { author: "Priya", text: "A real post.", postedAt: "Mar 12 at 9:04 PM" },
        { author: "", text: "No author." },
        { author: "Someone", text: "   " },
        { text: "Missing author key entirely." },
      ]),
    } as never);
    const result = await extractDiscussionPostsAction([{ base64: "x" }], "", "gemini");
    expect(result).toEqual({
      posts: [{ author: "Priya", text: "A real post.", postedAt: "Mar 12 at 9:04 PM" }],
    });
  });

  it("truncates an over-long post to MAX_POST_CHARS with a visible marker", async () => {
    const longText = "x".repeat(5000);
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify([{ author: "Priya", text: longText }]),
    } as never);
    const result = await extractDiscussionPostsAction([{ base64: "x" }], "", "gemini");
    expect("posts" in result).toBe(true);
    if ("posts" in result) {
      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].text.length).toBeLessThanOrEqual(4003);
      expect(result.posts[0].text.endsWith("...")).toBe(true);
    }
  });

  it("does not append the truncation marker to a post under the limit", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify([{ author: "Priya", text: "A short post." }]),
    } as never);
    const result = await extractDiscussionPostsAction([{ base64: "x" }], "", "gemini");
    if ("posts" in result) {
      expect(result.posts[0].text).toBe("A short post.");
    }
  });

  // docs/discussion-thread-structure-acceptance-criteria.md T2b/T3.
  describe("threadPosition / replyingToAuthor coercion (T2b/T3)", () => {
    // FIX 1 (thread-structure review pass): this repo has TWO live runtime
    // gates on the same nominal three-member position set - this file's own
    // (unexported) THREAD_POSITIONS array, which decides what
    // extractDiscussionPostsAction lets through, and discussion-thread.ts's
    // exported VALID_THREAD_POSITIONS Set, which decides what
    // deserializeReplyTable accepts back off disk. Nothing previously pinned
    // them equal, so a later group could add a fourth position to THIS
    // file's array, forget the Set, and get: extraction accepts it, the row
    // renders, and the next reload silently coerces it back to `undefined`.
    //
    // The implementer assigned this fix owns discussion-replies.test.ts (this
    // file) but explicitly NOT discussion-replies.ts - THREAD_POSITIONS
    // cannot be exported for a direct side-by-side import without touching a
    // file outside that file set, so the two tests below prove the same claim
    // BEHAVIOURALLY, through extractDiscussionPostsAction's own public
    // surface, rather than importing both arrays into one comparison:
    //
    //  - the test immediately below now loops over VALID_THREAD_POSITIONS
    //    itself (imported from discussion-thread.ts), not a re-typed local
    //    literal - every member of the DESERIALIZATION gate must also survive
    //    the EXTRACTION gate unchanged. This is the "VALID_THREAD_POSITIONS
    //    subset-of THREAD_POSITIONS" half, and it is now genuinely coupled:
    //    if VALID_THREAD_POSITIONS ever gained a member this file's own
    //    THREAD_POSITIONS array does not recognise, this loop would start
    //    asserting `undefined` against that member and fail.
    //  - the frozen-oracle test right after it pins VALID_THREAD_POSITIONS's
    //    own membership to a literal, so the test still fails if the leaf's
    //    Set drifted on its own.
    //  - "sabotage target (c)" below probes the OTHER half - a value NOT in
    //    VALID_THREAD_POSITIONS ("nested") must also be rejected by THIS
    //    file's gate. That half is necessarily a finite probe rather than a
    //    proof: THREAD_POSITIONS' private members cannot be enumerated from
    //    outside the module, so this only catches a future regression that
    //    happens to reuse one of the probed values. "nested" is not a random
    //    choice - it is the literal example the acceptance-criteria doc uses
    //    for the fourth-position failure mode this fix defends against.
    //
    // A direct two-array comparison would need THREAD_POSITIONS exported from
    // discussion-replies.ts - and that is NOT a follow-up to pick up later, it
    // is illegal: that file is "use server", where every export must be an
    // async function. A plain const export there is a build error that only
    // `next build` catches, and this repo's pre-push gate deliberately stops
    // before the env-dependent prerender tail, so it would land unnoticed.
    // The behavioural check below is therefore the strongest available form,
    // not a compromise waiting to be upgraded. If an exhaustive equality is
    // ever wanted, move the shared list into a plain leaf module that both
    // sides import - never widen this file's exports.
    it("carries a recognised threadPosition through unchanged, for each member of VALID_THREAD_POSITIONS (FIX 1: the deserialization gate)", async () => {
      for (const value of Array.from(VALID_THREAD_POSITIONS)) {
        vi.mocked(callLlm).mockResolvedValueOnce({
          ok: true,
          status: 200,
          body: "",
          text: JSON.stringify([{ author: "Priya", text: "A post.", threadPosition: value }]),
        } as never);
        const result = await extractDiscussionPostsAction([{ base64: "x" }], "", "gemini");
        expect("posts" in result).toBe(true);
        if ("posts" in result) expect(result.posts[0].threadPosition).toBe(value);
      }
    });

    it("FIX 1: VALID_THREAD_POSITIONS is exactly the frozen three-member set ['reply','root','unknown']", () => {
      expect(Array.from(VALID_THREAD_POSITIONS).sort()).toEqual(["reply", "root", "unknown"]);
    });

    it("sabotage target (c) / FIX 1's other half: coerces any threadPosition outside VALID_THREAD_POSITIONS to undefined, never lets it through raw", async () => {
      expect(VALID_THREAD_POSITIONS.has("nested")).toBe(false); // sanity: this probe is genuinely outside the other gate
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify([{ author: "Priya", text: "A post.", threadPosition: "nested" }]),
      } as never);
      const result = await extractDiscussionPostsAction([{ base64: "x" }], "", "gemini");
      expect("posts" in result).toBe(true);
      if ("posts" in result) {
        expect(result.posts[0].threadPosition).toBeUndefined();
        expect(JSON.stringify(result.posts[0])).not.toContain("nested");
      }
    });

    it("coerces a non-string threadPosition to undefined", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify([{ author: "Priya", text: "A post.", threadPosition: 3 }]),
      } as never);
      const result = await extractDiscussionPostsAction([{ base64: "x" }], "", "gemini");
      if ("posts" in result) expect(result.posts[0].threadPosition).toBeUndefined();
    });

    it("carries replyingToAuthor through, trimmed", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify([{ author: "Priya", text: "A post.", threadPosition: "reply", replyingToAuthor: "  Marcus  " }]),
      } as never);
      const result = await extractDiscussionPostsAction([{ base64: "x" }], "", "gemini");
      if ("posts" in result) expect(result.posts[0].replyingToAuthor).toBe("Marcus");
    });

    it("drops an empty or whitespace-only replyingToAuthor rather than keeping an empty string", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify([{ author: "Priya", text: "A post.", replyingToAuthor: "   " }]),
      } as never);
      const result = await extractDiscussionPostsAction([{ base64: "x" }], "", "gemini");
      if ("posts" in result) expect(result.posts[0].replyingToAuthor).toBeUndefined();
    });

    it("omits threadPosition and replyingToAuthor entirely when the model omits them, matching the existing postedAt-omission shape", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify([{ author: "Priya", text: "A post." }]),
      } as never);
      const result = await extractDiscussionPostsAction([{ base64: "x" }], "", "gemini");
      expect(result).toEqual({ posts: [{ author: "Priya", text: "A post." }] });
    });
  });
});

describe("draftDiscussionRepliesAction", () => {
  const posts = [
    { id: "row-a", author: "Priya", text: "Post one." },
    { id: "row-b", author: "Marcus", text: "Post two." },
    { id: "row-c", author: "Devon", text: "Post three." },
  ];

  it("requires ownership - a rejected requireOwner is caught and returned as { error }, never thrown", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized. Sign in with an approved account."));
    await expect(draftDiscussionRepliesAction(posts, "students", "", "gemini")).resolves.toEqual({
      error: "Not authorized. Sign in with an approved account.",
    });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses zero posts without calling the model", async () => {
    const result = await draftDiscussionRepliesAction([], "students", "", "gemini");
    expect(result).toEqual({ error: "No posts to reply to." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses a batch over DRAFT_BATCH_SIZE without calling the model", async () => {
    const tooMany = Array.from({ length: DRAFT_BATCH_SIZE + 1 }, (_, i) => ({ id: `r${i}`, author: `A${i}`, text: `T${i}` }));
    const result = await draftDiscussionRepliesAction(tooMany, "students", "", "gemini");
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
    await draftDiscussionRepliesAction(posts, "students", "", "gemini");
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
    const result = await draftDiscussionRepliesAction(posts, "students", "", "gemini");
    expect(getWritingStyleBlock).toHaveBeenCalledWith("owner-1");
    expect("error" in result).toBe(false);
  });

  it("preserves the REAL reason on a failed call - a 429 and a 400 must read differently", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 429, body: "Rate limit exceeded" } as never);
    const result429 = await draftDiscussionRepliesAction(posts, "students", "", "gemini");

    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 400, body: "Bad request" } as never);
    const result400 = await draftDiscussionRepliesAction(posts, "students", "", "gemini");

    expect("error" in result429 && "error" in result400).toBe(true);
    if ("error" in result429 && "error" in result400) {
      expect(result429.error).not.toBe(result400.error);
      expect(result429.error).toContain("429");
      expect(result400.error).toContain("400");
    }
  });

  it("returns a distinct error for a successful-but-empty response", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "  ", status: 200, body: "" } as never);
    const result = await draftDiscussionRepliesAction(posts, "students", "", "gemini");
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("empty response");
  });

  it("returns a distinct error when the response cannot be parsed at all", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "complete garbage", status: 200, body: "" } as never);
    const result = await draftDiscussionRepliesAction(posts, "students", "", "gemini");
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
    const result = await draftDiscussionRepliesAction(posts, "students", "", "gemini");
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
    const result = await draftDiscussionRepliesAction(posts, "students", "", "gemini");
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
    const result = await draftDiscussionRepliesAction(posts, "students", "", "gemini");
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
    const result = await draftDiscussionRepliesAction(posts, "students", "", "gemini");
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
    const result = await draftDiscussionRepliesAction(posts, "students", "", "gemini");
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
    const result = await draftDiscussionRepliesAction(posts, "students", "", "gemini");
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
    const result = await draftDiscussionRepliesAction(posts, "students", "", "gemini");
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
    await draftDiscussionRepliesAction(postsWithParent, "students", "", "gemini");

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
    await draftDiscussionRepliesAction(posts, "students", "", "gemini");
    const callArgs = vi.mocked(callLlm).mock.calls[0][0];
    const promptPart = callArgs.contents[0].parts[0] as { text: string };
    expect(promptPart.text).not.toContain("CONTEXT ONLY");
  });
});

describe("gatherReplyResourcesAction", () => {
  function mockLinksOnce(links: Array<Record<string, unknown>>, degraded = false) {
    vi.mocked(findResourceLinksForConceptsAction).mockResolvedValueOnce({
      links,
      degraded,
      droppedUncorroborated: 0,
      droppedPlaceholder: 0,
      droppedUnreachable: 0,
      notes: [],
    } as never);
  }

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

  it("returns an entry for every id with no call at all when every post's concept is empty", async () => {
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
    expect(findResourceLinksForConceptsAction).not.toHaveBeenCalled();
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

  it("forwards degraded: true from the reused action", async () => {
    mockLinksOnce([], true);
    const result = await gatherReplyResourcesAction([{ id: "p1", text: "Something" }], "", "gemini");
    expect("resources" in result).toBe(true);
    if ("resources" in result) {
      expect(result.degraded).toBe(true);
      expect(result.resources).toEqual([{ id: "p1", resources: [] }]);
    }
  });

  it("F2: never includes the author's name in the concept sent to the resource search, even when the caller's post objects carry one", async () => {
    // gatherReplyResourcesAction's own `posts` parameter type is
    // `Array<{ id: string; text: string }>` (no `author` field) - this
    // fixture is typed WIDER than that on purpose, mirroring the deleted
    // conceptFromPost test's own technique, so passing it through a
    // same-shaped variable (not an object literal, which TS's excess-
    // property check would catch) proves the LIVE derivation
    // (deriveResourceConcept(p.text) at discussion-replies.ts:258) never
    // reads an `author` field even when one is sitting right next to `text`
    // on the object it was handed - the guarantee AC R4c and F2 require,
    // pinned against the boundary production actually calls.
    mockLinksOnce([]);
    const posts: Array<{ id: string; text: string; author: string }> = [
      { id: "p1", text: "The trolley problem is a classic thought experiment.", author: "Maria Alvarez" },
    ];
    await gatherReplyResourcesAction(posts, "", "gemini");
    expect(findResourceLinksForConceptsAction).toHaveBeenCalledTimes(1);
    const concepts = vi.mocked(findResourceLinksForConceptsAction).mock.calls[0][0];
    expect(concepts).toEqual(["The trolley problem is a classic thought experiment."]);
    expect(concepts.some((c) => c.includes("Maria"))).toBe(false);
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
});
