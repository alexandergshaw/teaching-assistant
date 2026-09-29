import { describe, it, expect, vi, beforeEach } from "vitest";

// Mirrors the mocking idiom at src/lib/decks/sequence.test.ts:5-8: mock only
// callLlm, keep every other export of @/lib/llm real.
vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm, type LlmRequest, type LlmResult } from "@/lib/llm";
import {
  generateOneArtifact,
  regenerateArtifact,
  reviewArtifact,
  selectedContentKinds,
} from "./generate";
import type { ArtifactSelection, PresentationContext, ProducedArtifact } from "./types";

function ok(text: string): LlmResult {
  return { ok: true, text };
}

function requestText(call: unknown): string {
  const req = call as LlmRequest;
  return req.contents
    .flatMap((content) => content.parts)
    .map((part) => ("text" in part ? part.text : ""))
    .join("\n");
}

function selection(overrides: Partial<ArtifactSelection>): ArtifactSelection {
  return { outline: false, activities: false, deck: false, review: false, ...overrides };
}

const VALID_DECK_TEXT = JSON.stringify({
  presentationTitle: "Deck Title",
  slides: [{ title: "Slide One", bullets: ["b1", "b2"] }],
});

beforeEach(() => {
  vi.mocked(callLlm).mockReset();
});

// W1-T1
describe("selectedContentKinds", () => {
  it("returns exactly the selected content kinds, in fixed order, review never a kind", () => {
    expect(selectedContentKinds(selection({ outline: true }))).toEqual(["outline"]);
    expect(selectedContentKinds(selection({ activities: true }))).toEqual(["activities"]);
    expect(selectedContentKinds(selection({ deck: true }))).toEqual(["deck"]);
    expect(selectedContentKinds(selection({ outline: true, deck: true }))).toEqual([
      "outline",
      "deck",
    ]);
    expect(
      selectedContentKinds(selection({ outline: true, activities: true, deck: true }))
    ).toEqual(["outline", "activities", "deck"]);
    expect(selectedContentKinds(selection({}))).toEqual([]);
    expect(selectedContentKinds(selection({ deck: true, review: true }))).toEqual(["deck"]);
  });
});

// W1-T2
describe("generateOneArtifact", () => {
  const context: PresentationContext = { text: "CTXNONCE_A1", sources: [] };

  it("issues exactly one callLlm for outline, built from the passed context", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(ok("An outline."));
    const result = await generateOneArtifact("outline", context);
    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(requestText(vi.mocked(callLlm).mock.calls[0][0])).toContain("CTXNONCE_A1");
    expect(result?.kind).toBe("outline");
  });

  it("issues exactly one callLlm for activities, built from the passed context", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(ok('["Idea one", "Idea two"]'));
    const result = await generateOneArtifact("activities", context);
    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(requestText(vi.mocked(callLlm).mock.calls[0][0])).toContain("CTXNONCE_A1");
    expect(result?.kind).toBe("activities");
  });

  it("issues exactly one callLlm for deck, built from the passed context", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(ok(VALID_DECK_TEXT));
    const result = await generateOneArtifact("deck", context);
    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(requestText(vi.mocked(callLlm).mock.calls[0][0])).toContain("CTXNONCE_A1");
    expect(result?.kind).toBe("deck");
  });

  // W1-T5 (executed half): a malformed deck response is a generation failure,
  // never a raw builder crash and never a silently-empty deck.
  it("surfaces a zero-slide deck response as a generation failure (null), not a call to the serializer", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      ok(JSON.stringify({ presentationTitle: "Empty", slides: [] }))
    );
    const result = await generateOneArtifact("deck", context);
    expect(result).toBeNull();
  });

  it("surfaces a non-array-bullets deck response as a generation failure (null)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      ok(
        JSON.stringify({
          presentationTitle: "Bad",
          slides: [{ title: "S1", bullets: "not an array" }],
        })
      )
    );
    const result = await generateOneArtifact("deck", context);
    expect(result).toBeNull();
  });

  // B1 regression: enforceTitleLength (src/lib/slide-prompt.ts) reads
  // slide.bullets.length for any slide whose title exceeds the 60-char max.
  // Before the fix, parseDeckSlides ran enforceTitleLength BEFORE
  // validateDeck, so a >60-char title with missing bullets threw a
  // TypeError that generateOneArtifact's deck path did not catch - this
  // resolved-vs-rejected assertion is what caught it (RED pre-fix, GREEN
  // post-fix; see the implementer report for the transition).
  it("surfaces a long-title-with-missing-bullets deck response as a generation failure (null), never a rejection", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      ok(
        JSON.stringify({
          presentationTitle: "LongTitle",
          slides: [{ title: "T".repeat(61) }],
        })
      )
    );
    await expect(generateOneArtifact("deck", context)).resolves.toBeNull();
  });

  it("returns null when callLlm fails", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 500, body: "err" });
    const result = await generateOneArtifact("outline", context);
    expect(result).toBeNull();
  });
});

// W1-T3
describe("reviewArtifact", () => {
  const context: PresentationContext = { text: "context", sources: [] };

  it("issues exactly one callLlm, built from the produced content", async () => {
    const produced: ProducedArtifact = {
      kind: "outline",
      content: { markdown: "OUTLINENONCE_B2" },
      critique: null,
    };
    vi.mocked(callLlm).mockResolvedValueOnce(ok("Looks good."));
    const critique = await reviewArtifact(produced, context);
    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(requestText(vi.mocked(callLlm).mock.calls[0][0])).toContain("OUTLINENONCE_B2");
    expect(critique?.text).toBe("Looks good.");
  });
});

// W1-T4
describe("per-artifact critique keying (AC-5)", () => {
  it("keys each critique onto its own produced artifact; no critique for a non-produced kind", async () => {
    const context: PresentationContext = { text: "ctx", sources: [] };

    vi.mocked(callLlm)
      .mockResolvedValueOnce(ok("Outline markdown."))
      .mockResolvedValueOnce(ok(VALID_DECK_TEXT))
      .mockResolvedValueOnce(ok("CRITIQUE_OUTLINE text"))
      .mockResolvedValueOnce(ok("CRITIQUE_DECK text"));

    const outline = await generateOneArtifact("outline", context);
    const deck = await generateOneArtifact("deck", context);
    if (!outline || !deck) throw new Error("expected both artifacts to be produced");

    outline.critique = await reviewArtifact(outline, context);
    deck.critique = await reviewArtifact(deck, context);

    const artifacts: ProducedArtifact[] = [outline, deck];

    expect(artifacts).toHaveLength(2);
    expect(artifacts.map((a) => a.kind)).toEqual(["outline", "deck"]);
    expect(outline.critique?.text).toContain("OUTLINE");
    expect(deck.critique?.text).toContain("DECK");
    expect(artifacts.some((a) => a.kind === "activities")).toBe(false);
  });
});

// W1-T7 (executed half, end-to-end through regenerateArtifact)
describe("regenerateArtifact", () => {
  it("folds prior context and prior critique into the callLlm request", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(ok("Regenerated outline."));
    await regenerateArtifact({
      kind: "outline",
      priorContext: { text: "CTXNONCE_R1", sources: [] },
      priorCritique: { text: "CRITNONCE_R3" },
      priorContent: null,
      withReview: false,
    });
    const text = requestText(vi.mocked(callLlm).mock.calls[0][0]);
    expect(text).toContain("CTXNONCE_R1");
    expect(text).toContain("CRITNONCE_R3");
  });
});
