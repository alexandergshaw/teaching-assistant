import { describe, it, expect, vi, beforeEach } from "vitest";

// deriveTocFromSource calls requireOwner() (auth) and callLlm() (network) -
// both are mocked so the derivation logic itself (parsing, source dedup,
// null-on-failure) runs for real without needing a Supabase session or
// hitting the Gemini API.
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { callLlm } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { deriveTocFromSource } from "./course-planning-grounding";

describe("deriveTocFromSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  });

  it("returns the toc, chapters, and deduped sources on a parseable response", async () => {
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      text: "Module 1: Introduction\nModule 2: Footprinting\nModule 3: Scanning Networks",
      sources: [
        { title: "uCertify CEH v12", uri: "https://example.com/toc" },
        { title: "uCertify CEH v12 (dup)", uri: "https://example.com/toc" },
        { title: "EC-Council exam blueprint", uri: "https://example.com/blueprint" },
      ],
    });

    const result = await deriveTocFromSource(
      "https://www.ucertify.com/app/?func=load_course&course=CEH-v12.AE1",
      "gemini"
    );

    expect(result).not.toBeNull();
    expect(result!.chapters).toHaveLength(3);
    expect(result!.toc).toContain("Module 1: Introduction");
    // The duplicate uri is dropped; the first-seen title wins.
    expect(result!.sources).toEqual([
      { title: "uCertify CEH v12", uri: "https://example.com/toc" },
      { title: "EC-Council exam blueprint", uri: "https://example.com/blueprint" },
    ]);

    expect(callLlm).toHaveBeenCalledWith(
      expect.objectContaining({ webSearch: true }),
      "gemini"
    );
  });

  it("returns null when the response has no parseable chapters", async () => {
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      text: "Sorry, I could not find a table of contents for that source.",
      sources: [],
    });

    const result = await deriveTocFromSource("https://example.com/mystery-course", "gemini");
    expect(result).toBeNull();
  });

  it("returns null when the LLM call fails", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: false, status: 500, body: "server error" });

    const result = await deriveTocFromSource("https://example.com/some-course", "gemini");
    expect(result).toBeNull();
  });

  it("returns null for blank source material without calling the LLM", async () => {
    const result = await deriveTocFromSource("   ", "gemini");
    expect(result).toBeNull();
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("never throws - a rejected auth check degrades to null", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized."));

    const result = await deriveTocFromSource("https://example.com/some-course", "gemini");
    expect(result).toBeNull();
  });

  it("never throws - an unexpected callLlm rejection degrades to null", async () => {
    vi.mocked(callLlm).mockRejectedValueOnce(new Error("network down"));

    const result = await deriveTocFromSource("https://example.com/some-course", "gemini");
    expect(result).toBeNull();
  });
});
