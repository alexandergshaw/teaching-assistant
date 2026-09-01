import { describe, it, expect, vi, beforeEach } from "vitest";

// Split out of discussion-replies.test.ts (FIX 1, file-size-ceiling review):
// that file's own extractDiscussionPostsAction describe block, moved here
// verbatim. Only the mocks this action's tests actually exercise are
// declared - requireOwner and a partially-mocked "@/lib/llm" (callLlm is a
// controllable vi.fn(), while describeLlmFailure/describeEmptyLlmText come
// through as the REAL implementations via importActual, since the
// "preserves the REAL reason on a failed call" tests below assert on their
// actual formatting, not a stub). discussion-replies.ts also imports
// "./shared", "./learning-resource-links", and "@/lib/discussion-reply-prompt"
// at module scope (it is one file backing all three actions), but
// extractDiscussionPostsAction itself never calls into any of them, so
// those load as their real implementations here - the same approach this
// repo's discussion-replies-bulk-redaction.test.ts already uses for its own
// (different) subset of mocks. Per this repo's "no cross-test-file imports"
// rule, nothing is imported from a sibling *.test.ts file; the small shared
// fixtures (OWNER, base64OfWireBytes) are duplicated rather than shared.

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { requireOwner } from "@/lib/supabase/auth";
import { callLlm } from "@/lib/llm";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";
import { EXTRACT_BATCH_SIZE } from "@/lib/discussion-reply-prompt";
import { extractDiscussionPostsAction } from "./discussion-replies";
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
