import { describe, it, expect, vi, beforeEach } from "vitest";

// researchCurrentEventsAction calls requireOwner() (auth) and callLlm() (network) -
// both are mocked so the pipeline logic itself (topic parsing, per-topic
// retry/failure handling, degraded fallback, report building) runs for real
// without needing a Supabase session or hitting the Gemini API. Pure-helper
// unit tests (clamps, parsers, the report builder) live alongside their
// module in src/lib/workflows/current-events-report.test.ts.
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
import { researchCurrentEventsAction } from "./current-events";

describe("researchCurrentEventsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  });

  const topicsResponse = {
    ok: true as const,
    text: `{"topics":[{"topic":"Neural Networks","entities":"backprop"},{"topic":"Databases","entities":"SQL"}]}`,
  };

  const perTopicResponse = (headline: string) => ({
    ok: true as const,
    text: `{"items":[{"headline":"${headline}","date":"2026-07-01","angle":"news","whyItMatters":"matters","url":"https://example.com/${headline}","background":false}]}`,
    sources: [{ title: headline, uri: `https://example.com/${headline}` }],
  });

  const synthesisResponse = {
    ok: true as const,
    text: `{"themes":["theme one"],"whatChanged":"things changed","discussionPrompts":["prompt one"]}`,
  };

  it("returns an error for a blank deck without calling the LLM", async () => {
    const result = await researchCurrentEventsAction("   ", "the past 30 days", "gemini");
    expect(result).toEqual({ error: "Provide a slide deck to analyze." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("happy path: topics -> per-topic (parallel) -> synthesis", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce(topicsResponse)
      .mockResolvedValueOnce(perTopicResponse("NN-item"))
      .mockResolvedValueOnce(perTopicResponse("DB-item"))
      .mockResolvedValueOnce(synthesisResponse);

    const result = await researchCurrentEventsAction("deck text", "the past 30 days", "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.topicsCovered).toBe(2);
    expect(result.sourceCount).toBe(2);
    expect(result.report).toContain("TOPIC: Neural Networks");
    expect(result.report).toContain("TOPIC: Databases");
    expect(result.report).toContain("theme one");
    expect(result.report).toContain("things changed");
    expect(result.report).toContain("prompt one");
    expect(result.report).not.toContain("DEGRADED");
  });

  it("one topic failing: the report ships with a note, the other topic's section still appears", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce(topicsResponse)
      .mockResolvedValueOnce(perTopicResponse("NN-item"))
      .mockResolvedValueOnce({ ok: false, status: 500, body: "server error" })
      .mockResolvedValueOnce({ ok: false, status: 500, body: "server error" }) // retry also fails
      .mockResolvedValueOnce(synthesisResponse);

    const result = await researchCurrentEventsAction("deck text", "the past 30 days", "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.topicsCovered).toBe(1);
    expect(result.report).toContain("TOPIC: Neural Networks");
    expect(result.report).toContain('Topic "Databases" failed');
    expect(result.report).not.toContain("TOPIC: Databases");
  });

  it("all topics failing: degrades to the whole-deck fallback", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce(topicsResponse)
      .mockResolvedValueOnce({ ok: false, status: 500, body: "err" })
      .mockResolvedValueOnce({ ok: false, status: 500, body: "err" })
      .mockResolvedValueOnce({ ok: false, status: 500, body: "err" })
      .mockResolvedValueOnce({ ok: false, status: 500, body: "err" })
      .mockResolvedValueOnce(perTopicResponse("whole-deck-item"));

    const result = await researchCurrentEventsAction("deck text", "the past 30 days", "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.report).toContain("DEGRADED");
    expect(result.report).toContain("whole-deck-item");
    expect(result.topicsCovered).toBe(1);
  });

  it("extraction failure: degrades to the whole-deck fallback", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce({ ok: true, text: "   " })
      .mockResolvedValueOnce(perTopicResponse("whole-deck-item"));

    const result = await researchCurrentEventsAction("deck text", "the past 30 days", "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.report).toContain("DEGRADED");
    expect(result.report).toContain("whole-deck-item");
  });

  it("total failure: extraction fails and the whole-deck fallback also fails - returns an informative error", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce({ ok: true, text: "" })
      .mockResolvedValueOnce({ ok: false, status: 500, body: "err" });

    const result = await researchCurrentEventsAction("deck text", "the past 30 days", "gemini");
    expect(result).toHaveProperty("error");
    if (!("error" in result)) return;
    expect(result.error).toContain("Could not research current events");
  });

  it("passes maxTopics, itemsPerTopic, and extraFocus through to the pipeline", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce({
        ok: true,
        text: `{"topics":[{"topic":"Only One","entities":""}]}`,
      })
      .mockResolvedValueOnce(perTopicResponse("item"))
      .mockResolvedValueOnce(synthesisResponse);

    const result = await researchCurrentEventsAction("deck text", "the past 30 days", "gemini", {
      maxTopics: 1,
      itemsPerTopic: 2,
      extraFocus: "focus on accessibility",
    });
    expect("error" in result).toBe(false);

    // The per-topic call (second callLlm invocation) should carry the extraFocus text.
    const perTopicCallArgs = vi.mocked(callLlm).mock.calls[1][0];
    const promptText = perTopicCallArgs.contents[0].parts[0];
    expect("text" in promptText && promptText.text).toContain("focus on accessibility");
  });
});
