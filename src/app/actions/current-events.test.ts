import { describe, it, expect, vi, beforeEach } from "vitest";

// researchCurrentEventsAction calls requireOwner() (auth) and callLlm() (network) -
// both are mocked so the pipeline logic itself (topic parsing, per-topic
// retry/failure handling, degraded fallback, report building) runs for real
// without needing a Supabase session or hitting the Gemini API. Pure-helper
// unit tests (clamps, parsers, the report builder, isPlaceholderUrl,
// verifyItemUrls, windowCutoff, markOutOfWindow) live alongside their module
// in src/lib/workflows/current-events-report.test.ts.
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

// The per-topic research pipeline is now TWO calls per attempt: a grounded
// (webSearch: true) prose search, then an ungrounded call that structures
// that prose into the existing {"items":[...]} JSON. These helpers build
// each half of that pair.
const groundedResponse = (prose: string, sources?: Array<{ title: string; uri: string }>) => ({
  ok: true as const,
  text: prose,
  ...(sources ? { sources } : {}),
});

interface ItemFixture {
  headline: string;
  date?: string;
  angle?: string;
  whyItMatters?: string;
  url?: string;
  background?: boolean;
}

const structureResponse = (items: ItemFixture[]) => ({
  ok: true as const,
  text: JSON.stringify({
    items: items.map((i) => ({
      headline: i.headline,
      date: i.date ?? "2026-07-01",
      angle: i.angle ?? "news",
      whyItMatters: i.whyItMatters ?? "matters",
      url: i.url ?? "",
      background: i.background ?? false,
    })),
  }),
});

const failResponse = { ok: false as const, status: 500, body: "server error" };

describe("researchCurrentEventsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  });

  const topicsResponse = {
    ok: true as const,
    text: `{"topics":[{"topic":"Neural Networks","entities":"backprop"},{"topic":"Databases","entities":"SQL"}]}`,
  };

  const synthesisResponse = {
    ok: true as const,
    text: `{"themes":["theme one"],"whatChanged":"things changed","discussionPrompts":["prompt one"]}`,
  };

  it("returns an error for a blank deck without calling the LLM", async () => {
    const result = await researchCurrentEventsAction("   ", "the past 30 days", "gemini");
    expect(result).toEqual({ error: "Provide a slide deck to analyze." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("happy path: topics -> per-topic grounded+structure (parallel) -> synthesis", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce(topicsResponse)
      .mockResolvedValueOnce(groundedResponse("NN prose", [{ title: "NN Source", uri: "https://nn-source.test/page" }]))
      .mockResolvedValueOnce(groundedResponse("DB prose", [{ title: "DB Source", uri: "https://db-source.test/page" }]))
      .mockResolvedValueOnce(structureResponse([{ headline: "NN-item", url: "https://nn-source.test/story-1" }]))
      .mockResolvedValueOnce(structureResponse([{ headline: "DB-item", url: "https://db-source.test/story-1" }]))
      .mockResolvedValueOnce(synthesisResponse);

    const result = await researchCurrentEventsAction("deck text", "the past 30 days", "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.topicsCovered).toBe(2);
    expect(result.sourceCount).toBe(2);
    expect(result.report).toContain("TOPIC: Neural Networks");
    expect(result.report).toContain("TOPIC: Databases");
    expect(result.report).toContain("NN-item");
    expect(result.report).toContain("DB-item");
    expect(result.report).toContain("theme one");
    expect(result.report).toContain("things changed");
    expect(result.report).toContain("prompt one");
    expect(result.report).not.toContain("DEGRADED");
    // Items whose URL host matches a grounding source stay verified.
    expect(result.report).not.toContain("[unverified - no web source]");
  });

  it("one topic failing: the report ships with a note, the other topic's section still appears", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce(topicsResponse)
      .mockResolvedValueOnce(groundedResponse("NN prose", [{ title: "NN Source", uri: "https://nn-source.test/page" }]))
      .mockResolvedValueOnce(failResponse) // Databases grounded call, attempt 1
      .mockResolvedValueOnce(structureResponse([{ headline: "NN-item", url: "https://nn-source.test/story-1" }]))
      .mockResolvedValueOnce(failResponse) // Databases grounded call, retry
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
      .mockResolvedValueOnce(failResponse) // Neural Networks grounded, attempt 1
      .mockResolvedValueOnce(failResponse) // Databases grounded, attempt 1
      .mockResolvedValueOnce(failResponse) // Neural Networks grounded, retry
      .mockResolvedValueOnce(failResponse) // Databases grounded, retry
      .mockResolvedValueOnce(
        groundedResponse("whole deck prose", [{ title: "Whole Deck Source", uri: "https://whole-deck-source.test/page" }])
      )
      .mockResolvedValueOnce(
        structureResponse([{ headline: "whole-deck-item", url: "https://whole-deck-source.test/story-1" }])
      );

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
      .mockResolvedValueOnce(
        groundedResponse("whole deck prose", [{ title: "Whole Deck Source", uri: "https://whole-deck-source.test/page" }])
      )
      .mockResolvedValueOnce(
        structureResponse([{ headline: "whole-deck-item", url: "https://whole-deck-source.test/story-1" }])
      );

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
      .mockResolvedValueOnce(groundedResponse("prose", [{ title: "Source", uri: "https://only-one.test/page" }]))
      .mockResolvedValueOnce(structureResponse([{ headline: "item", url: "https://only-one.test/story-1" }]))
      .mockResolvedValueOnce(synthesisResponse);

    const result = await researchCurrentEventsAction("deck text", "the past 30 days", "gemini", {
      maxTopics: 1,
      itemsPerTopic: 2,
      extraFocus: "focus on accessibility",
    });
    expect("error" in result).toBe(false);

    // The per-topic GROUNDED call (second callLlm invocation) should carry the extraFocus text.
    const perTopicCallArgs = vi.mocked(callLlm).mock.calls[1][0];
    const promptText = perTopicCallArgs.contents[0].parts[0];
    expect("text" in promptText && promptText.text).toContain("focus on accessibility");
  });

  it("makes a GROUNDED call followed by an UNGROUNDED structuring call for each topic", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce({
        ok: true,
        text: `{"topics":[{"topic":"Only One","entities":""}]}`,
      })
      .mockResolvedValueOnce(groundedResponse("prose", [{ title: "Source", uri: "https://only-one.test/page" }]))
      .mockResolvedValueOnce(structureResponse([{ headline: "item", url: "https://only-one.test/story-1" }]))
      .mockResolvedValueOnce(synthesisResponse);

    const result = await researchCurrentEventsAction("deck text", "the past 30 days", "gemini", { maxTopics: 1 });
    expect("error" in result).toBe(false);

    const calls = vi.mocked(callLlm).mock.calls;
    // calls[0] = topic extraction, calls[1] = grounded per-topic search,
    // calls[2] = ungrounded structuring, calls[3] = synthesis.
    expect(calls[1][0].webSearch).toBe(true);
    expect(calls[2][0].webSearch).toBeFalsy();
  });

  it("a grounded call that returns no sources: sourceCount 0, degraded, every item unverified", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce({
        ok: true,
        text: `{"topics":[{"topic":"Only One","entities":""}]}`,
      })
      // Grounded call succeeds but returns NO groundingMetadata/sources - the
      // model answered from parametric memory instead of actually searching.
      .mockResolvedValueOnce(groundedResponse("prose with no grounding"))
      .mockResolvedValueOnce(structureResponse([{ headline: "unverifiable-item", url: "https://some-real-site.test/story" }]))
      .mockResolvedValueOnce(synthesisResponse);

    const result = await researchCurrentEventsAction("deck text", "the past 30 days", "gemini", { maxTopics: 1 });
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.sourceCount).toBe(0);
    expect(result.report).toContain("DEGRADED");
    expect(result.report).toContain("unverifiable-item [unverified - no web source]");
    expect(result.report).not.toContain("https://some-real-site.test/story");
  });

  // Regression for the round-1 bug report: Gemini's Search grounding returns
  // a vertexaisearch.cloud.google.com redirect in `sources[].uri` and the
  // real domain in `sources[].title` - a fully grounded run must keep a
  // matching item's URL and NOT label it unverified.
  it("a fully grounded run with real Gemini grounding metadata keeps the item's URL verified", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce({
        ok: true,
        text: `{"topics":[{"topic":"Only One","entities":""}]}`,
      })
      .mockResolvedValueOnce(
        groundedResponse("prose mentioning python.org", [
          { title: "python.org", uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbCdEf123" },
        ])
      )
      .mockResolvedValueOnce(
        structureResponse([{ headline: "H", url: "https://www.python.org/downloads/release/python-3140/" }])
      )
      .mockResolvedValueOnce(synthesisResponse);

    const result = await researchCurrentEventsAction("deck text", "the past 30 days", "gemini", { maxTopics: 1 });
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.sourceCount).toBe(1);
    expect(result.report).not.toContain("DEGRADED");
    expect(result.report).not.toContain("[unverified - no web source]");
    expect(result.report).toContain("https://www.python.org/downloads/release/python-3140/");
  });
});
