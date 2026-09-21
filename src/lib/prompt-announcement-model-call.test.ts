import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import { callPromptAnnouncementModel, type PromptAnnouncementModelArm } from "./prompt-announcement-model-call";

describe("callPromptAnnouncementModel", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls callLlm with the arm's prompt and maxOutputTokens, and the given provider", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: '{"title":"t","message":"m"}' });
    const arm: PromptAnnouncementModelArm = {
      kind: "model",
      prompt: "the composed prompt",
      maxOutputTokens: 1234,
      permittedUrls: new Set<string>(),
      templateApplied: true,
    };
    await callPromptAnnouncementModel(arm, "gemini");
    expect(callLlm).toHaveBeenCalledTimes(1);
    const [req, provider] = vi.mocked(callLlm).mock.calls[0];
    expect(req.contents[0].parts[0]).toEqual({ text: "the composed prompt" });
    expect(req.generationConfig?.maxOutputTokens).toBe(1234);
    expect(provider).toBe("gemini");
  });

  it("passes 'other' through unchanged", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: '{"title":"t","message":"m"}' });
    const arm: PromptAnnouncementModelArm = {
      kind: "model",
      prompt: "p",
      maxOutputTokens: 10,
      permittedUrls: new Set<string>(),
      templateApplied: true,
    };
    await callPromptAnnouncementModel(arm, "other");
    expect(vi.mocked(callLlm).mock.calls[0][1]).toBe("other");
  });
});
