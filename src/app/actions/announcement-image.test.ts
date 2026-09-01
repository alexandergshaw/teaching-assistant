import { describe, it, expect, vi, beforeEach } from "vitest";

// generateAnnouncementImageAction calls requireOwner() (auth) and
// generateGeminiImage() (network) - both mocked so the action's own
// validation/error-formatting logic runs for real without hitting Supabase
// or Gemini. describeLlmFailure/describeEmptyLlmImage are kept as the REAL
// implementations (vi.importActual) since the whole point of these tests is
// proving the action wires generateGeminiImage's result into the exact
// message those two functions would produce - a mocked formatter would hide
// a wiring bug (e.g. swapped label, wrong function called) behind a fake
// passthrough.
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    generateGeminiImage: vi.fn(),
  };
});

import { generateGeminiImage } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { generateAnnouncementImageAction } from "./announcement-image";

describe("generateAnnouncementImageAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  });

  it("rejects an empty prompt without ever calling generateGeminiImage", async () => {
    const result = await generateAnnouncementImageAction("   ");
    expect(result).toEqual({
      error: "Draft the announcement text first - the image is generated from its content.",
    });
    expect(generateGeminiImage).not.toHaveBeenCalled();
  });

  it("returns the image on success, passing the prompt through unchanged", async () => {
    vi.mocked(generateGeminiImage).mockResolvedValue({
      ok: true,
      base64: "ZmFrZS1pbWFnZQ==",
      mimeType: "image/png",
    });

    const result = await generateAnnouncementImageAction("draw a simple illustration of a library");

    expect(generateGeminiImage).toHaveBeenCalledWith("draw a simple illustration of a library");
    expect(result).toEqual({ base64: "ZmFrZS1pbWFnZQ==", mimeType: "image/png" });
  });

  it("formats an HTTP failure via describeLlmFailure (real implementation, not mocked)", async () => {
    vi.mocked(generateGeminiImage).mockResolvedValue({ ok: false, status: 429, body: "Quota exceeded" });

    const result = await generateAnnouncementImageAction("a prompt");
    expect(result).toEqual({ error: "Image generation failed: HTTP 429 — Quota exceeded" });
  });

  it("formats a network failure (status 0) via describeLlmFailure's network-error wording", async () => {
    vi.mocked(generateGeminiImage).mockResolvedValue({ ok: false, status: 0, body: "fetch failed" });

    const result = await generateAnnouncementImageAction("a prompt");
    expect(result).toEqual({ error: "Image generation failed: network error — fetch failed" });
  });

  it("formats a refusal (ok:true, base64:null) via describeEmptyLlmImage, surfacing the model's own text", async () => {
    vi.mocked(generateGeminiImage).mockResolvedValue({
      ok: true,
      base64: null,
      text: "I can't create an image of a real, identifiable person.",
    });

    const result = await generateAnnouncementImageAction("a photo of my professor");
    expect(result).toEqual({
      error:
        'Image generation failed: the model did not return an image - it said: "I can\'t create an image of a real, identifiable person."',
    });
  });

  it("formats a refusal with no text via describeEmptyLlmImage's finishReason fallback", async () => {
    vi.mocked(generateGeminiImage).mockResolvedValue({ ok: true, base64: null, text: "", finishReason: "SAFETY" });

    const result = await generateAnnouncementImageAction("a prompt");
    expect(result).toEqual({
      error: "Image generation failed: the model did not return an image (finishReason: SAFETY).",
    });
  });

  it("converts a requireOwner rejection into an error result, never a thrown exception (unauthenticated)", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("not signed in"));

    const result = await generateAnnouncementImageAction("a prompt");
    expect(result).toEqual({ error: "not signed in" });
    expect(generateGeminiImage).not.toHaveBeenCalled();
  });

  it("converts a generateGeminiImage rejection (e.g. missing GEMINI_API_KEY) into an error result, never a thrown exception", async () => {
    vi.mocked(generateGeminiImage).mockRejectedValue(new Error("Missing environment variable: GEMINI_API_KEY"));

    const result = await generateAnnouncementImageAction("a prompt");
    expect(result).toEqual({ error: "Missing environment variable: GEMINI_API_KEY" });
  });

  it("falls back to a generic message when a thrown value is not an Error instance", async () => {
    vi.mocked(generateGeminiImage).mockRejectedValue("a raw string, not an Error");

    const result = await generateAnnouncementImageAction("a prompt");
    expect(result).toEqual({ error: "Could not generate an image for this announcement." });
  });
});
