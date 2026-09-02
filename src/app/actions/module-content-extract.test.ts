import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors grading-submission-extract.test.ts's own mock shape: requireOwner
// stubbed, "@/lib/llm" partially mocked (callLlm controllable, everything
// else - describeLlmFailure/describeEmptyLlmText - the REAL implementation
// via importActual, since the failure-message tests below assert on their
// actual formatting). Per this repo's "no cross-test-file imports" rule,
// nothing is imported from a sibling *.test.ts file - every fixture below is
// built fresh even though it looks like grading-submission-extract.test.ts's.
//
// FIXTURE SHAPE: every `ok: true` fixture below is exactly LlmResult's
// success branch (src/lib/llm.ts) - no `status`/`body` fields, which belong
// only to the `ok: false` branch.

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
import { MODULE_EXTRACT_BATCH_SIZE, MAX_BLOCK_CHARS } from "@/app/components/module-deck-capture/module-extraction-prompt";
import { extractModuleContentAction } from "./module-content-extract";

const OWNER = { id: "owner-1", email: "owner@example.com" };

function base64OfWireBytes(wireBytes: number): string {
  return "A".repeat(wireBytes);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER as never);
});

describe("extractModuleContentAction - ownership, frame-cap, wire-budget refusals happen BEFORE any model call", () => {
  it("requires ownership - a rejected requireOwner is caught and returned as { error }, never thrown", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized. Sign in with an approved account."));

    await expect(extractModuleContentAction([{ base64: "abc" }], "", "", "gemini")).resolves.toEqual({
      error: "Not authorized. Sign in with an approved account.",
    });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses zero frames without calling the model", async () => {
    const result = await extractModuleContentAction([], "", "", "gemini");
    expect(result).toEqual({ error: "No frames were captured from the screen." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses a batch over MODULE_EXTRACT_BATCH_SIZE without calling the model", async () => {
    const frames = Array.from({ length: MODULE_EXTRACT_BATCH_SIZE + 1 }, () => ({ base64: "x" }));
    const result = await extractModuleContentAction(frames, "", "", "gemini");
    expect(result).toEqual({ error: "Too many frames in one batch." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("accepts exactly MODULE_EXTRACT_BATCH_SIZE frames (the boundary is inclusive)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ heading: "Week 4", text: "Some real module content here", kind: "prose" }]),
    });
    const frames = Array.from({ length: MODULE_EXTRACT_BATCH_SIZE }, () => ({ base64: "x" }));
    const result = await extractModuleContentAction(frames, "", "", "gemini");
    expect(callLlm).toHaveBeenCalledTimes(1);
    expect("blocks" in result).toBe(true);
  });

  it("refuses an over-wire-budget batch BEFORE calling the model - a reachable production path per AC13, not defence in depth", async () => {
    const frames = [{ base64: base64OfWireBytes(UPLOAD_WIRE_BUDGET_BYTES + 1_000) }];
    const result = await extractModuleContentAction(frames, "", "", "gemini");
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("too large to upload in one request");
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("checks ownership before the frame-count/wire-budget checks (requireOwner is called first, unconditionally)", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("nope"));
    await extractModuleContentAction([], "", "", "gemini");
    expect(requireOwner).toHaveBeenCalledTimes(1);
    expect(callLlm).not.toHaveBeenCalled();
  });
});

describe("extractModuleContentAction - LLM call shape", () => {
  it("uses maxOutputTokens 8192 and temperature 0.1, mirroring extractGradingSubmissionsAction's own shape", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ noModuleContentVisible: true, reason: "empty page" }]),
    });
    await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");
    const callArgs = vi.mocked(callLlm).mock.calls[0][0];
    expect(callArgs.generationConfig?.maxOutputTokens).toBe(8192);
    expect(callArgs.generationConfig?.temperature).toBe(0.1);
  });

  it("threads the instructor context (AC2) into the prompt sent to the model", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ noModuleContentVisible: true, reason: "empty page" }]),
    });
    await extractModuleContentAction([{ base64: "x" }], "", "Focus on recursion examples", "gemini");
    const callArgs = vi.mocked(callLlm).mock.calls[0][0];
    const promptText = (callArgs.contents[0].parts[0] as { text: string }).text;
    expect(promptText).toContain("Focus on recursion examples");
  });

  // Coordinator correction (2026-09-02): the action's own signature is now
  // (frames, moduleName, context, provider) - the original brief's two
  // mandated signatures did not reconcile, and this action was missing the
  // moduleName field buildModuleContentExtractionPrompt always expected.
  it("threads moduleName into the prompt sent to the model", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ noModuleContentVisible: true, reason: "empty page" }]),
    });
    await extractModuleContentAction([{ base64: "x" }], "Week 4: Abstraction and Representation", "", "gemini");
    const callArgs = vi.mocked(callLlm).mock.calls[0][0];
    const promptText = (callArgs.contents[0].parts[0] as { text: string }).text;
    expect(promptText).toContain("Week 4: Abstraction and Representation");
  });

  it("threads both moduleName and context together, distinguishably", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ noModuleContentVisible: true, reason: "empty page" }]),
    });
    await extractModuleContentAction(
      [{ base64: "x" }],
      "Week 4: Abstraction and Representation",
      "Focus on recursion examples",
      "gemini"
    );
    const callArgs = vi.mocked(callLlm).mock.calls[0][0];
    const promptText = (callArgs.contents[0].parts[0] as { text: string }).text;
    expect(promptText).toContain("Week 4: Abstraction and Representation");
    expect(promptText).toContain("Focus on recursion examples");
  });

  it("a blank moduleName (the Recording-tab route with no bulk-bar prefill) still produces a usable prompt with no module-name label sentence", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ noModuleContentVisible: true, reason: "empty page" }]),
    });
    await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");
    const callArgs = vi.mocked(callLlm).mock.calls[0][0];
    const promptText = (callArgs.contents[0].parts[0] as { text: string }).text;
    expect(promptText).not.toContain("The module's name");
  });
});

describe("extractModuleContentAction - hard failures (unchanged from the grading action's own shape)", () => {
  it("preserves the REAL reason on a failed call - a 429 and a 400 must read differently", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 429, body: "Rate limit exceeded" });
    const result429 = await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");

    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 400, body: "Bad request: invalid image" });
    const result400 = await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");

    expect("error" in result429 && "error" in result400).toBe(true);
    if ("error" in result429 && "error" in result400) {
      expect(result429.error).not.toBe(result400.error);
      expect(result429.error).toContain("429");
      expect(result400.error).toContain("400");
    }
  });

  it("returns a distinct error for a successful-but-empty response (fully blank model output)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "", finishReason: "MAX_TOKENS" });
    const result = await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("empty response");
      expect(result.error).toContain("MAX_TOKENS");
    }
  });

  it("returns a distinct error when the response cannot be parsed at all", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "not json and no brackets at all" });
    const result = await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");
    expect(result).toEqual({ error: "Could not read any module content from that part of the screen." });
  });
});

describe("AC8 - the three distinguishable outcomes", () => {
  it("outcome 1 (CONFIRMED EMPTY): the model's marker element is SUCCESS with confirmedEmpty: true, not an error", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ noModuleContentVisible: true, reason: "a module index page, nothing open" }]),
    });
    const result = await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");
    expect(result).toEqual({ blocks: [], confirmedEmpty: true, illegibleCount: 0 });
  });

  it("outcome 3 (NOTHING, NO CONFIRMATION): a bare `[]` with no marker is a hard { error }, never treated as success - the exact silent-success shape this action exists to catch", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "[]" });
    const result = await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");
    expect("error" in result).toBe(true);
    expect("blocks" in result).toBe(false);
    if ("error" in result) {
      expect(result.error).toContain("did not confirm");
    }
  });

  it("outcome 2 (READ SOMETHING, SOME ILLEGIBLE): an illegible block is counted and EXCLUDED from blocks - never reaching the deck materials text", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([
        { heading: "Week 4", text: "A clearly legible paragraph of real content", kind: "prose" },
        { heading: "Week 4", text: "some half-guessed blurry text", kind: "prose", illegible: true },
      ]),
    });
    const result = await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");
    expect("blocks" in result).toBe(true);
    if ("blocks" in result) {
      expect(result.blocks).toEqual([{ heading: "Week 4", text: "A clearly legible paragraph of real content", kind: "prose" }]);
      expect(result.illegibleCount).toBe(1);
      expect(result.confirmedEmpty).toBe(false);
      // The illegible block's own text must never appear anywhere in the
      // returned blocks - this is the assertion that actually proves
      // exclusion, not just a count.
      expect(JSON.stringify(result.blocks)).not.toContain("half-guessed blurry text");
    }
  });

  it("a batch with only illegible blocks and no marker is still SUCCESS, not outcome 3 - the model did say why (illegible), it just found nothing legible", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ heading: "Week 4", text: "unreadable smear of text", kind: "prose", illegible: true }]),
    });
    const result = await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");
    expect(result).toEqual({ blocks: [], confirmedEmpty: false, illegibleCount: 1 });
  });

  it("a batch with real blocks and a stray marker element ignores the marker as a block", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([
        { heading: "Week 4", text: "Real module content here", kind: "prose" },
        { noModuleContentVisible: true, reason: "should be ignored - real content was also found" },
      ]),
    });
    const result = await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");
    expect(result).toEqual({
      blocks: [{ heading: "Week 4", text: "Real module content here", kind: "prose" }],
      confirmedEmpty: false,
      illegibleCount: 0,
    });
  });
});

describe("field coercion", () => {
  it("defaults heading to Untitled when absent", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ text: "Some content with no heading given", kind: "prose" }]),
    });
    const result = await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");
    expect("blocks" in result).toBe(true);
    if ("blocks" in result) {
      expect(result.blocks[0].heading).toBe("Untitled");
    }
  });

  it("defaults an unrecognized or missing kind to prose rather than dropping the block", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ heading: "Week 4", text: "Some content", kind: "not-a-real-kind" }]),
    });
    const result = await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");
    expect("blocks" in result).toBe(true);
    if ("blocks" in result) {
      expect(result.blocks[0].kind).toBe("prose");
    }
  });

  it("preserves a valid, non-prose kind", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ heading: "Week 4", text: "1. Step one\n2. Step two", kind: "list" }]),
    });
    const result = await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");
    expect("blocks" in result).toBe(true);
    if ("blocks" in result) {
      expect(result.blocks[0].kind).toBe("list");
    }
  });

  it("truncates an over-long block to MAX_BLOCK_CHARS with a visible marker", async () => {
    const longText = "x".repeat(MAX_BLOCK_CHARS + 1000);
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ heading: "Week 4", text: longText, kind: "prose" }]),
    });
    const result = await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");
    expect("blocks" in result).toBe(true);
    if ("blocks" in result) {
      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0].text.length).toBeLessThanOrEqual(MAX_BLOCK_CHARS + 3);
      expect(result.blocks[0].text.endsWith("...")).toBe(true);
    }
  });

  it("does not append the truncation marker to a block under the limit", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ heading: "Week 4", text: "Short content.", kind: "prose" }]),
    });
    const result = await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");
    expect("blocks" in result).toBe(true);
    if ("blocks" in result) {
      expect(result.blocks[0].text).toBe("Short content.");
    }
  });

  it("ignores a non-object element in the array rather than throwing", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([null, "a stray string", { heading: "Week 4", text: "Real content here", kind: "prose" }]),
    });
    const result = await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");
    expect(result).toEqual({
      blocks: [{ heading: "Week 4", text: "Real content here", kind: "prose" }],
      confirmedEmpty: false,
      illegibleCount: 0,
    });
  });

  it("drops an entry with no text at all, without counting it toward illegibleCount (nothing to skip - it never claimed a block)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify([{ heading: "Week 4", kind: "prose" }]),
    });
    const result = await extractModuleContentAction([{ base64: "x" }], "", "", "gemini");
    // No text and no confirmation marker: outcome 3, a hard error.
    expect("error" in result).toBe(true);
  });
});
