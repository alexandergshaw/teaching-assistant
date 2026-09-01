import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors discussion-replies.test.ts's mocking idiom exactly (mock only the
// modules this file's action actually calls; "@/lib/llm" partially mocked so
// describeLlmFailure/describeEmptyLlmText run as their REAL implementations
// via importActual, while callLlm is a vi.fn() controlled per case).

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
import { PROBE_MAX_FRAMES } from "@/app/components/grading-recording/legibility-probe";
import { probeFrameLegibilityAction } from "./legibility-probe";

const OWNER = { id: "owner-1", email: "owner@example.com" };

function base64OfWireBytes(wireBytes: number): string {
  return "A".repeat(wireBytes);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER as never);
});

describe("probeFrameLegibilityAction", () => {
  it("requires ownership - a rejected requireOwner is caught and returned as { error }, never thrown", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized. Sign in with an approved account."));

    await expect(probeFrameLegibilityAction([{ base64: "abc" }], "prompt", "gemini")).resolves.toEqual({
      error: "Not authorized. Sign in with an approved account.",
    });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses zero frames without calling the model", async () => {
    const result = await probeFrameLegibilityAction([], "prompt", "gemini");
    expect(result).toEqual({ error: "No frames were captured from the screen." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses a batch over PROBE_MAX_FRAMES without calling the model", async () => {
    const frames = Array.from({ length: PROBE_MAX_FRAMES + 1 }, () => ({ base64: "x" }));
    const result = await probeFrameLegibilityAction(frames, "prompt", "gemini");
    expect(result).toEqual({ error: "Too many frames in one probe batch." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("accepts exactly PROBE_MAX_FRAMES frames (the boundary is inclusive)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "some transcription", status: 200, body: "" } as never);
    const frames = Array.from({ length: PROBE_MAX_FRAMES }, () => ({ base64: "x" }));
    const result = await probeFrameLegibilityAction(frames, "prompt", "gemini");
    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ transcript: "some transcription" });
  });

  it("refuses an over-wire-budget batch BEFORE calling the model", async () => {
    const frames = [{ base64: base64OfWireBytes(UPLOAD_WIRE_BUDGET_BYTES + 1_000) }];
    const result = await probeFrameLegibilityAction(frames, "prompt", "gemini");
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toContain("too large to upload in one request");
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("sends the caller-supplied prompt as the first part, followed by one inlineData part per frame", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "x", status: 200, body: "" } as never);
    await probeFrameLegibilityAction([{ base64: "aaa" }, { base64: "bbb" }], "MY PROMPT TEXT", "gemini");
    const callArgs = vi.mocked(callLlm).mock.calls[0][0];
    const parts = callArgs.contents[0].parts;
    expect(parts[0]).toEqual({ text: "MY PROMPT TEXT" });
    expect(parts[1]).toEqual({ inlineData: { mimeType: "image/jpeg", data: "aaa" } });
    expect(parts[2]).toEqual({ inlineData: { mimeType: "image/jpeg", data: "bbb" } });
  });

  it("calls with temperature 0 - a transcription task, not a creative one", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "x", status: 200, body: "" } as never);
    await probeFrameLegibilityAction([{ base64: "x" }], "prompt", "gemini");
    const callArgs = vi.mocked(callLlm).mock.calls[0][0];
    expect(callArgs.generationConfig?.temperature).toBe(0);
  });

  it("preserves the REAL failure reason on a failed call - a 429 and a 400 must read differently", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 429, body: "Rate limit exceeded" } as never);
    const result429 = await probeFrameLegibilityAction([{ base64: "x" }], "prompt", "gemini");

    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 400, body: "Bad request: invalid image" } as never);
    const result400 = await probeFrameLegibilityAction([{ base64: "x" }], "prompt", "gemini");

    expect("error" in result429 && "error" in result400).toBe(true);
    if ("error" in result429 && "error" in result400) {
      expect(result429.error).not.toBe(result400.error);
      expect(result429.error).toContain("429");
      expect(result400.error).toContain("400");
    }
  });

  it("returns a distinct error for a successful-but-empty response - R1a's own defect, refused before it can look like success", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "", status: 200, body: "", finishReason: "MAX_TOKENS" } as never);
    const result = await probeFrameLegibilityAction([{ base64: "x" }], "prompt", "gemini");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("empty response");
      expect(result.error).toContain("MAX_TOKENS");
    }
  });

  it("an all-whitespace response is treated the same as empty - never returned as a blank-but-successful transcript", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "   \n\t  ", status: 200, body: "" } as never);
    const result = await probeFrameLegibilityAction([{ base64: "x" }], "prompt", "gemini");
    expect("error" in result).toBe(true);
  });

  it("trims the transcript before returning it", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "  padded transcript  \n", status: 200, body: "" } as never);
    const result = await probeFrameLegibilityAction([{ base64: "x" }], "prompt", "gemini");
    expect(result).toEqual({ transcript: "padded transcript" });
  });

  it("returns a near-empty (but non-blank) transcript AS-IS - classifying it as suspicious is the caller's job, not this action's", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "N/A", status: 200, body: "" } as never);
    const result = await probeFrameLegibilityAction([{ base64: "x" }], "prompt", "gemini");
    expect(result).toEqual({ transcript: "N/A" });
  });

  it("wraps a thrown error from requireOwner or callLlm as { error }, never lets it propagate", async () => {
    vi.mocked(callLlm).mockRejectedValueOnce(new Error("network exploded"));
    const result = await probeFrameLegibilityAction([{ base64: "x" }], "prompt", "gemini");
    expect(result).toEqual({ error: "network exploded" });
  });
});
