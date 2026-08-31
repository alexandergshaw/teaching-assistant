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

import { requireOwner } from "@/lib/supabase/auth";
import { getWritingStyleBlock } from "./shared";
import { callLlm } from "@/lib/llm";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";
import { EXTRACT_BATCH_SIZE, DRAFT_BATCH_SIZE } from "@/lib/discussion-reply-prompt";
import { extractDiscussionPostsAction, draftDiscussionRepliesAction } from "./discussion-replies";

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
});
