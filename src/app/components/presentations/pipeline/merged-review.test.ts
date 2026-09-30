import { describe, expect, it } from "vitest";
import { adaptDeckForChecklist, buildMergedReview } from "./merged-review";
import { INFO_FLOW_CHECKLIST, VISUAL_CHECKLIST, type ChecklistResult } from "@/lib/deck-standard/checklists";
import type { DeckContent } from "@/lib/presentations/types";

function llmResult(overrides: Partial<ChecklistResult> = {}): ChecklistResult {
  return {
    checklistVersion: INFO_FLOW_CHECKLIST.version,
    findings: [],
    ranItemIds: ["main-point-obvious", "where-to-look-first", "detail-too-early", "diagram-implies-false"],
    ...overrides,
  };
}

describe("adaptDeckForChecklist", () => {
  it("maps title/bullets/notes and omits terms (PptxSlide has no terms field)", () => {
    const deck: DeckContent = {
      presentationTitle: "T",
      slides: [
        { title: "Intro", bullets: ["a", "b"], notes: "say hi" },
        { title: "No notes", bullets: [] },
      ],
    };

    const adapted = adaptDeckForChecklist(deck);

    expect(adapted.slides).toEqual([
      { title: "Intro", bullets: ["a", "b"], notes: "say hi" },
      { title: "No notes", bullets: [], notes: undefined },
    ]);
  });
});

describe("buildMergedReview", () => {
  it("merges the deterministic pass (from the real deck) with the given llm result", () => {
    const deck: DeckContent = {
      presentationTitle: "T",
      slides: [
        { title: "Title only", bullets: [] },
        { title: "Empty body", bullets: [] }, // triggers standalone-reconstructable
      ],
    };
    const llm = llmResult({
      findings: [
        { checklistId: "info-flow", itemId: "main-point-obvious", slideIndex: 1, message: "unclear" },
      ],
    });

    const merged = buildMergedReview(INFO_FLOW_CHECKLIST, deck, llm);

    // Deterministic finding for slide 1 (not slide 0, the exempt title slide) is present.
    expect(
      merged.findings.some(
        (f) => f.itemId === "standalone-reconstructable" && f.slideIndex === 1
      )
    ).toBe(true);
    // The llm finding survives the merge.
    expect(merged.findings.some((f) => f.itemId === "main-point-obvious" && f.message === "unclear")).toBe(
      true
    );
    // Completeness receipt covers both the deterministic and llm item ids.
    expect(merged.ranItemIds).toEqual(
      expect.arrayContaining(["vocab-without-a-model", "standalone-reconstructable", "main-point-obvious"])
    );
  });

  it("works for the visual checklist (all-llm, no deterministic items) without throwing", () => {
    const deck: DeckContent = {
      presentationTitle: "T",
      slides: [{ title: "Diagram", bullets: ["x"] }],
    };
    const llm = llmResult({
      checklistVersion: VISUAL_CHECKLIST.version,
      ranItemIds: [
        "arrow-direction",
        "request-response-one-message",
        "html-appears-to-request",
        "query-string-vs-fragment",
      ],
    });

    const merged = buildMergedReview(VISUAL_CHECKLIST, deck, llm);

    expect(merged.checklistVersion).toBe(VISUAL_CHECKLIST.version);
    expect(merged.ranItemIds).toEqual(llm.ranItemIds);
    expect(merged.findings).toEqual([]);
  });

  it("degrades to the llm result alone when the deck is null (should not happen behind canRunStage, but must not crash)", () => {
    const llm = llmResult({
      findings: [{ checklistId: "info-flow", itemId: "main-point-obvious", message: "m" }],
    });

    const merged = buildMergedReview(INFO_FLOW_CHECKLIST, null, llm);

    expect(merged).toEqual(llm);
  });

  it("degrades safely for an empty deck (no slides)", () => {
    const deck: DeckContent = { presentationTitle: "T", slides: [] };
    const llm = llmResult();

    const merged = buildMergedReview(INFO_FLOW_CHECKLIST, deck, llm);

    expect(merged.ranItemIds).toEqual(
      expect.arrayContaining(["vocab-without-a-model", "standalone-reconstructable"])
    );
    expect(merged.findings).toEqual([]);
  });
});
