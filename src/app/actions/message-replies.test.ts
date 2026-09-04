import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors discussion-replies-extract.test.ts / discussion-replies-draft.test.ts
// idioms: requireOwner mocked outright, "@/lib/llm" partially mocked (callLlm
// a controllable vi.fn(), describeLlmFailure/describeEmptyLlmText real via
// importActual so the "preserves the REAL reason" tests assert on actual
// formatting). "@/lib/message-reply-prompt" and "@/lib/discussion-reply-prompt"
// are NOT mocked at all - real prompt building and real parseExtractedMessages
// run, so the coercion tests below assert on the actual prompt text sent to
// the model, exactly the way discussion-replies-draft.test.ts's own
// knowledgeContext tests inspect the real prompt part rather than a mock's
// recorded call. Per this repo's "no cross-test-file imports" rule, nothing
// is imported from a sibling *.test.ts file.

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
import { EXTRACT_BATCH_SIZE, DRAFT_BATCH_SIZE, MAX_POST_CHARS } from "@/lib/message-reply-prompt";
import { extractStudentMessagesAction, draftMessageRepliesAction } from "./message-replies";

const OWNER = { id: "owner-1", email: "owner@example.com" };

function base64OfWireBytes(wireBytes: number): string {
  return "A".repeat(wireBytes);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER as never);
  vi.mocked(getWritingStyleBlock).mockResolvedValue("");
});

function llmOk(text: string) {
  vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text, status: 200, body: "" } as never);
}

// ---------------------------------------------------------------------------
// extractStudentMessagesAction (M8)
// ---------------------------------------------------------------------------

describe("extractStudentMessagesAction", () => {
  it("requires ownership - a rejected requireOwner is caught and returned as { error }, never thrown", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized. Sign in with an approved account."));
    await expect(extractStudentMessagesAction([{ base64: "abc" }], "", "gemini")).resolves.toEqual({
      error: "Not authorized. Sign in with an approved account.",
    });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses zero frames without calling the model", async () => {
    const result = await extractStudentMessagesAction([], "", "gemini");
    expect(result).toEqual({ error: "No frames were captured from the screen." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses a batch over EXTRACT_BATCH_SIZE without calling the model", async () => {
    const frames = Array.from({ length: EXTRACT_BATCH_SIZE + 1 }, () => ({ base64: "x" }));
    const result = await extractStudentMessagesAction(frames, "", "gemini");
    expect(result).toEqual({ error: "Too many frames in one batch." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("accepts exactly EXTRACT_BATCH_SIZE frames (the boundary is inclusive)", async () => {
    llmOk("[]");
    const frames = Array.from({ length: EXTRACT_BATCH_SIZE }, () => ({ base64: "x" }));
    const result = await extractStudentMessagesAction(frames, "", "gemini");
    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ messages: [] });
  });

  it("refuses an over-wire-budget batch BEFORE calling the model", async () => {
    const frames = [{ base64: base64OfWireBytes(UPLOAD_WIRE_BUDGET_BYTES + 1_000) }];
    const result = await extractStudentMessagesAction(frames, "", "gemini");
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("too large to upload in one request");
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("uses maxOutputTokens 8192 and temperature 0.1", async () => {
    llmOk("[]");
    await extractStudentMessagesAction([{ base64: "x" }], "", "gemini");
    const callArgs = vi.mocked(callLlm).mock.calls[0][0];
    expect(callArgs.generationConfig?.maxOutputTokens).toBe(8192);
    expect(callArgs.generationConfig?.temperature).toBe(0.1);
  });

  it("preserves the REAL reason on a failed call - a 429 and a 400 must read differently", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 429, body: "Rate limit exceeded" } as never);
    const result429 = await extractStudentMessagesAction([{ base64: "x" }], "", "gemini");

    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 400, body: "Bad request: invalid image" } as never);
    const result400 = await extractStudentMessagesAction([{ base64: "x" }], "", "gemini");

    expect("error" in result429 && "error" in result400).toBe(true);
    if ("error" in result429 && "error" in result400) {
      expect(result429.error).not.toBe(result400.error);
      expect(result429.error).toContain("429");
      expect(result400.error).toContain("400");
    }
  });

  it("returns a distinct error for a successful-but-empty response", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "", status: 200, body: "", finishReason: "MAX_TOKENS" } as never);
    const result = await extractStudentMessagesAction([{ base64: "x" }], "", "gemini");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("empty response");
      expect(result.error).toContain("MAX_TOKENS");
    }
  });

  it("returns a distinct error when the response cannot be parsed at all", async () => {
    llmOk("not json and no brackets at all");
    const result = await extractStudentMessagesAction([{ base64: "x" }], "", "gemini");
    expect(result).toEqual({ error: "Could not read any messages from that part of the screen." });
  });

  it("returns SUCCESS with an empty array when parsing succeeds but nothing passes the sender/text filter", async () => {
    llmOk("[]");
    const result = await extractStudentMessagesAction([{ base64: "x" }], "", "gemini");
    expect(result).toEqual({ messages: [] });
  });

  it("drops entries with empty sender or text, keeps well-formed ones with sentAt carried through", async () => {
    llmOk(
      JSON.stringify([
        { subject: "Grades", sender: "Priya", text: "A real message.", sentAt: "Sep 3 at 2:14pm", pane: "thread" },
        { subject: "Grades", sender: "", text: "No sender." },
        { subject: "Grades", sender: "Someone", text: "   " },
        { subject: "Grades", text: "Missing sender key entirely." },
      ])
    );
    const result = await extractStudentMessagesAction([{ base64: "x" }], "", "gemini");
    expect(result).toEqual({
      messages: [{ subject: "Grades", sender: "Priya", text: "A real message.", sentAt: "Sep 3 at 2:14pm", pane: "thread" }],
    });
  });

  it("parses the pane field and coerces an unrecognised value to \"thread\"", async () => {
    llmOk(
      JSON.stringify([
        { sender: "Priya", text: "A list preview.", pane: "list" },
        { sender: "Marcus", text: "An open thread message.", pane: "thread" },
        { sender: "Devon", text: "Something weird.", pane: "not-a-real-pane" },
        { sender: "Sam", text: "No pane at all." },
      ])
    );
    const result = await extractStudentMessagesAction([{ base64: "x" }], "", "gemini");
    expect("messages" in result).toBe(true);
    if ("messages" in result) {
      const byText = new Map(result.messages.map((m) => [m.text, m.pane]));
      expect(byText.get("A list preview.")).toBe("list");
      expect(byText.get("An open thread message.")).toBe("thread");
      expect(byText.get("Something weird.")).toBe("thread");
      expect(byText.get("No pane at all.")).toBe("thread");
    }
  });

  it("truncates an over-long message to MAX_POST_CHARS with a visible marker", async () => {
    const longText = "x".repeat(5000);
    llmOk(JSON.stringify([{ sender: "Priya", text: longText }]));
    const result = await extractStudentMessagesAction([{ base64: "x" }], "", "gemini");
    expect("messages" in result).toBe(true);
    if ("messages" in result) {
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].text.length).toBeLessThanOrEqual(MAX_POST_CHARS + 3);
      expect(result.messages[0].text.endsWith("...")).toBe(true);
    }
  });

  it("does not append the truncation marker to a message under the limit", async () => {
    llmOk(JSON.stringify([{ sender: "Priya", text: "A short message." }]));
    const result = await extractStudentMessagesAction([{ base64: "x" }], "", "gemini");
    if ("messages" in result) expect(result.messages[0].text).toBe("A short message.");
  });

  it("does NOT specially reject the embedded provider - it is threaded through to callLlm exactly like any other provider, the same as the sibling extraction action", async () => {
    llmOk(JSON.stringify([{ sender: "Priya", text: "A message." }]));
    const result = await extractStudentMessagesAction([{ base64: "x" }], "", "embedded");
    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(vi.mocked(callLlm).mock.calls[0][1]).toBe("embedded");
    expect(result).toEqual({ messages: [{ sender: "Priya", text: "A message.", subject: "", pane: "thread" }] });
  });
});

// ---------------------------------------------------------------------------
// draftMessageRepliesAction (M12)
// ---------------------------------------------------------------------------

describe("draftMessageRepliesAction", () => {
  const oneMessageThread = { messages: [{ text: "A student message.", fromMe: false }] };
  const threads = [
    { messages: [{ text: "Thread one message.", fromMe: false }] },
    { messages: [{ text: "Thread two message.", fromMe: false }] },
    { messages: [{ text: "Thread three message.", fromMe: false }] },
  ];
  const DEFAULT_COMPOSITION = {
    ingredients: ["acknowledge", "answer", "next-step"] as const,
    addressByName: true,
    formality: "balanced" as const,
  };

  function mockOkFor(n: number) {
    llmOk(JSON.stringify(Array.from({ length: n }, (_, i) => ({ post: i + 1, reply: `Reply ${i + 1}` }))));
  }

  it("requires ownership - a rejected requireOwner is caught and returned as { error }, never thrown", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized. Sign in with an approved account."));
    await expect(draftMessageRepliesAction([oneMessageThread], "students", DEFAULT_COMPOSITION)).resolves.toEqual({
      error: "Not authorized. Sign in with an approved account.",
    });
    expect(callLlm).not.toHaveBeenCalled();
    // getWritingStyleBlock must never be reached when requireOwner rejects -
    // this mirrors draftDiscussionRepliesAction's own gating order.
    expect(getWritingStyleBlock).not.toHaveBeenCalled();
  });

  it("takes no styleBlock parameter - the function's own declared arity is 4 (threads, courseName, composition, knowledgeContext)", () => {
    // The instructor's raw writing-style block must never cross the Server
    // Action wire from the client - see this action's own doc comment. A
    // styleBlock parameter inserted anywhere would push .length to 5; TS's
    // `?` erases to a plain JS parameter with no default, so
    // Function.prototype.length still counts it.
    expect(draftMessageRepliesAction.length).toBe(4);
  });

  it("resolves the writing-style block server-side via getWritingStyleBlock(user.id) and threads it into the real prompt sent to the model", async () => {
    vi.mocked(getWritingStyleBlock).mockResolvedValueOnce("\n\nMATCH THE INSTRUCTOR'S PERSONAL WRITING STYLE (tone, rhythm, vocabulary) shown in this sample:\nMocked style sample text.");
    mockOkFor(1);
    const result = await draftMessageRepliesAction([oneMessageThread], "students", DEFAULT_COMPOSITION);
    expect(getWritingStyleBlock).toHaveBeenCalledWith("owner-1");
    expect("error" in result).toBe(false);
    const callArgs = vi.mocked(callLlm).mock.calls[0][0];
    const promptText = (callArgs.contents[0].parts[0] as { text: string }).text;
    expect(promptText).toContain("Mocked style sample text.");
  });

  it("lets a failure inside getWritingStyleBlock not fail the draft (that helper already never throws, resolving \"\")", async () => {
    vi.mocked(getWritingStyleBlock).mockResolvedValueOnce("");
    mockOkFor(1);
    const result = await draftMessageRepliesAction([oneMessageThread], "students", DEFAULT_COMPOSITION);
    expect("error" in result).toBe(false);
  });

  it("refuses zero threads without calling the model", async () => {
    const result = await draftMessageRepliesAction([], "students", DEFAULT_COMPOSITION);
    expect(result).toEqual({ error: "No threads to reply to." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses a batch over DRAFT_BATCH_SIZE without calling the model", async () => {
    const tooMany = Array.from({ length: DRAFT_BATCH_SIZE + 1 }, () => oneMessageThread);
    const result = await draftMessageRepliesAction(tooMany, "students", DEFAULT_COMPOSITION);
    expect(result).toEqual({ error: "Too many threads in one batch." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("uses maxOutputTokens 4096 and temperature 0.7", async () => {
    mockOkFor(1);
    await draftMessageRepliesAction([oneMessageThread], "students", DEFAULT_COMPOSITION);
    const callArgs = vi.mocked(callLlm).mock.calls[0][0];
    expect(callArgs.generationConfig?.maxOutputTokens).toBe(4096);
    expect(callArgs.generationConfig?.temperature).toBe(0.7);
  });

  it("calls callLlm with no provider argument (section 9's fixed surface has no provider parameter) - always the default", async () => {
    mockOkFor(1);
    await draftMessageRepliesAction([oneMessageThread], "students", DEFAULT_COMPOSITION);
    expect(vi.mocked(callLlm).mock.calls[0][1]).toBeUndefined();
  });

  it("preserves the REAL reason on a failed call - a 429 and a 400 must read differently", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 429, body: "Rate limit exceeded" } as never);
    const result429 = await draftMessageRepliesAction(threads, "students", DEFAULT_COMPOSITION);

    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 400, body: "Bad request" } as never);
    const result400 = await draftMessageRepliesAction(threads, "students", DEFAULT_COMPOSITION);

    expect("error" in result429 && "error" in result400).toBe(true);
    if ("error" in result429 && "error" in result400) {
      expect(result429.error).not.toBe(result400.error);
      expect(result429.error).toContain("429");
      expect(result400.error).toContain("400");
    }
  });

  it("returns a distinct error for a successful-but-empty response", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "  ", status: 200, body: "" } as never);
    const result = await draftMessageRepliesAction(threads, "students", DEFAULT_COMPOSITION);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("empty response");
  });

  it("returns a distinct error when the response cannot be parsed at all", async () => {
    llmOk("complete garbage");
    const result = await draftMessageRepliesAction(threads, "students", DEFAULT_COMPOSITION);
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("Could not read the drafted replies");
  });

  it("rebuilds replies by position, including out-of-order / scrambled post numbers", async () => {
    llmOk(
      JSON.stringify([
        { post: 3, reply: "Reply to thread three." },
        { post: 1, reply: "Reply to thread one." },
        { post: 2, reply: "Reply to thread two." },
      ])
    );
    const result = await draftMessageRepliesAction(threads, "students", DEFAULT_COMPOSITION);
    expect(result).toEqual({
      replies: [
        { post: 3, reply: "Reply to thread three." },
        { post: 1, reply: "Reply to thread one." },
        { post: 2, reply: "Reply to thread two." },
      ],
    });
  });

  it("tolerates a partial batch - marks exactly the missing thread absent rather than failing the whole batch", async () => {
    llmOk(
      JSON.stringify([
        { post: 1, reply: "Reply to thread one." },
        { post: 3, reply: "Reply to thread three." },
        // post 2 is missing from the model's response entirely.
      ])
    );
    const result = await draftMessageRepliesAction(threads, "students", DEFAULT_COMPOSITION);
    expect("replies" in result).toBe(true);
    if ("replies" in result) {
      const posts = result.replies.map((r) => r.post);
      expect(posts).toContain(1);
      expect(posts).toContain(3);
      expect(posts).not.toContain(2);
      expect(result.replies).toHaveLength(2);
    }
  });

  it("falls back to positional order when the array is the right length but NO element carries a usable post index", async () => {
    llmOk(
      JSON.stringify([
        { reply: "Reply to thread one." },
        { reply: "Reply to thread two." },
        { reply: "Reply to thread three." },
      ])
    );
    const result = await draftMessageRepliesAction(threads, "students", DEFAULT_COMPOSITION);
    expect(result).toEqual({
      replies: [
        { post: 1, reply: "Reply to thread one." },
        { post: 2, reply: "Reply to thread two." },
        { post: 3, reply: "Reply to thread three." },
      ],
    });
  });

  it("does NOT fall back positionally when the array length differs from threads.length and nothing carries a usable index", async () => {
    llmOk(JSON.stringify([{ reply: "Only one reply, no post index." }]));
    const result = await draftMessageRepliesAction(threads, "students", DEFAULT_COMPOSITION);
    expect(result).toEqual({ replies: [] });
  });

  it("keeps only the FIRST occurrence of a repeated positional index, so the mapping stays one-to-one", async () => {
    llmOk(
      JSON.stringify([
        { post: 2, reply: "First reply for thread 2." },
        { post: 2, reply: "Duplicate reply for thread 2, should be dropped." },
        { post: 1, reply: "Reply to thread one." },
      ])
    );
    const result = await draftMessageRepliesAction(threads, "students", DEFAULT_COMPOSITION);
    expect("replies" in result).toBe(true);
    if ("replies" in result) {
      const posts = result.replies.map((r) => r.post);
      expect(posts.filter((p) => p === 2)).toHaveLength(1);
      const byPost = new Map(result.replies.map((r) => [r.post, r.reply]));
      expect(byPost.get(2)).toBe("First reply for thread 2.");
      expect(result.replies).toHaveLength(2);
    }
  });

  it("ignores an out-of-range post index (0 or > threads.length)", async () => {
    llmOk(
      JSON.stringify([
        { post: 0, reply: "Invalid low." },
        { post: 99, reply: "Invalid high." },
        { post: 1, reply: "Valid." },
      ])
    );
    const result = await draftMessageRepliesAction(threads, "students", DEFAULT_COMPOSITION);
    expect(result).toEqual({ replies: [{ post: 1, reply: "Valid." }] });
  });

  it("never emits a concepts field - M10 says no concepts for message replies", async () => {
    llmOk(JSON.stringify([{ post: 1, reply: "A reply.", concepts: ["should be ignored"] }]));
    const result = await draftMessageRepliesAction([oneMessageThread], "students", DEFAULT_COMPOSITION);
    expect(result).toEqual({ replies: [{ post: 1, reply: "A reply." }] });
  });

  describe("composition threading and server-boundary coercion (M10)", () => {
    function promptTextFromLastCall(): string {
      const callArgs = vi.mocked(callLlm).mock.calls[0][0];
      return (callArgs.contents[0].parts[0] as { text: string }).text;
    }

    it("threads a valid, non-default composition into the real prompt unchanged", async () => {
      mockOkFor(1);
      await draftMessageRepliesAction([oneMessageThread], "students", {
        ingredients: ["offer-help", "deadline-reminder"],
        addressByName: false,
        formality: "casual",
      });
      const text = promptTextFromLastCall();
      expect(text).toContain("Offer to help further");
      expect(text).toContain("remind them of it");
      expect(text).not.toContain("Open by acknowledging");
      expect(text).not.toContain("Give a direct answer");
      expect(text).toContain("No greeting line. Do not open with the student's name.");
      expect(text).toContain("Lean casual in how you write this");
    });

    it("a non-array ingredients field coerces to the default set (acknowledge, answer, next-step)", async () => {
      mockOkFor(1);
      const bogus = { ingredients: "acknowledge", addressByName: true, formality: "balanced" } as unknown as {
        ingredients: readonly string[];
        addressByName: boolean;
        formality: string;
      };
      const result = await draftMessageRepliesAction([oneMessageThread], "students", bogus as never);
      expect("error" in result).toBe(false);
      const text = promptTextFromLastCall();
      expect(text).toContain("Open by acknowledging");
      expect(text).toContain("Give a direct answer");
      expect(text).toContain("Tell them the next concrete step");
      expect(text).not.toContain("Offer to help further");
    });

    it("zero selected ingredients is legal and survives as an empty selection (no EACH REPLY SHOULD INCLUDE section)", async () => {
      mockOkFor(1);
      await draftMessageRepliesAction([oneMessageThread], "students", {
        ingredients: [],
        addressByName: true,
        formality: "balanced",
      });
      const text = promptTextFromLastCall();
      expect(text).not.toContain("EACH REPLY SHOULD INCLUDE");
    });

    it("an ingredient string outside the enum is dropped, not the whole selection reset to default", async () => {
      mockOkFor(1);
      const bogus = {
        ingredients: ["acknowledge", "not-a-real-ingredient"],
        addressByName: true,
        formality: "balanced",
      } as unknown as { ingredients: readonly string[]; addressByName: boolean; formality: string };
      await draftMessageRepliesAction([oneMessageThread], "students", bogus as never);
      const text = promptTextFromLastCall();
      expect(text).toContain("Open by acknowledging");
      expect(text).not.toContain("Give a direct answer");
      expect(text).not.toContain("Tell them the next concrete step");
    });

    it("a duplicate ingredient collapses to one entry (no duplicated clause line)", async () => {
      mockOkFor(1);
      const bogus = {
        ingredients: ["acknowledge", "acknowledge"],
        addressByName: true,
        formality: "balanced",
      } as unknown as { ingredients: readonly string[]; addressByName: boolean; formality: string };
      await draftMessageRepliesAction([oneMessageThread], "students", bogus as never);
      const text = promptTextFromLastCall();
      const occurrences = text.split("Open by acknowledging").length - 1;
      expect(occurrences).toBe(1);
    });

    it("an unrecognised formality falls back to balanced (no lean-casual/lean-formal clause) rather than reaching the prompt", async () => {
      mockOkFor(1);
      const bogus = {
        ingredients: [],
        addressByName: true,
        formality: "extremely-formal",
      } as unknown as { ingredients: readonly string[]; addressByName: boolean; formality: string };
      await draftMessageRepliesAction([oneMessageThread], "students", bogus as never);
      const text = promptTextFromLastCall();
      expect(text).not.toContain("Lean casual in how you write this");
      expect(text).not.toContain("Lean formal in how you write this");
    });

    it("never throws on a wildly malformed composition (null, a bare string, a number) - always resolves", async () => {
      for (const bogus of [null, "not an object at all", 42, undefined]) {
        mockOkFor(1);
        const result = await draftMessageRepliesAction([oneMessageThread], "students", bogus as never);
        expect("error" in result).toBe(false);
      }
    });
  });

  describe("knowledgeContext threading and server-boundary coercion", () => {
    function promptTextFromLastCall(): string {
      const callArgs = vi.mocked(callLlm).mock.calls[0][0];
      return (callArgs.contents[0].parts[0] as { text: string }).text;
    }

    it("threads a real knowledgeContext through into the actual prompt sent to the model", async () => {
      mockOkFor(1);
      const text = "Selected page: Grading Rubric\nLate work loses 10% per day.";
      await draftMessageRepliesAction([oneMessageThread], "students", DEFAULT_COMPOSITION, text);
      expect(promptTextFromLastCall()).toContain("Late work loses 10% per day.");
    });

    it("a whitespace-only knowledgeContext is dropped rather than reaching the prompt as a blank section", async () => {
      mockOkFor(1);
      const before = "   \n  ";
      const result = await draftMessageRepliesAction([oneMessageThread], "students", DEFAULT_COMPOSITION, before);
      expect("error" in result).toBe(false);
    });

    it("caps an over-long knowledgeContext at the server boundary, truncating and marking it VISIBLY inside the prompt text", async () => {
      mockOkFor(1);
      const overLong = "x".repeat(25000);
      await draftMessageRepliesAction([oneMessageThread], "students", DEFAULT_COMPOSITION, overLong);
      const text = promptTextFromLastCall();
      expect(text).toContain("truncated");
      expect(text.length).toBeLessThan(overLong.length + 5000);
    });

    it("a non-string knowledgeContext (arrived malformed over the wire) does not throw", async () => {
      mockOkFor(1);
      const bogus = 42 as unknown as string;
      const result = await draftMessageRepliesAction([oneMessageThread], "students", DEFAULT_COMPOSITION, bogus);
      expect("error" in result).toBe(false);
    });
  });
});
