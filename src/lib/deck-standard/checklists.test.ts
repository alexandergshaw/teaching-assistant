// Tests for PRES-2 S4 (FIND half): the adversarial-review checklists
// (docs/pres-2-scope.md section 2.4). Pure fixtures only, no IO, no
// callLlm - the "llm" path is exercised only via the pure prompt builder and
// parser, never a real model call (docs/loop/this-repo.md section 6: tests
// here are network-blocked).

import { describe, expect, it } from "vitest";
import {
  INFO_FLOW_CHECKLIST,
  VISUAL_CHECKLIST,
  runDeterministicChecklist,
  buildChecklistPrompt,
  parseChecklistResponse,
  type ChecklistDeckInput,
} from "./checklists";

describe("checklist definitions", () => {
  it("INFO_FLOW_CHECKLIST is versioned and carries the owner's stage-11 questions", () => {
    expect(INFO_FLOW_CHECKLIST.version).toBe("info-flow-checklist-v1");
    expect(INFO_FLOW_CHECKLIST.items).toHaveLength(6);

    const texts = INFO_FLOW_CHECKLIST.items.map((item) => item.text.toLowerCase());
    expect(texts.some((text) => text.includes("main point obvious"))).toBe(true);
    expect(texts.some((text) => text.includes("where to look first"))).toBe(true);
    expect(texts.some((text) => text.includes("technical detail") && text.includes("too early"))).toBe(
      true
    );
    expect(texts.some((text) => text.includes("diagram") && text.includes("incorrect"))).toBe(true);
    expect(texts.some((text) => text.includes("vocabulary") && text.includes("mental model"))).toBe(
      true
    );
    expect(
      texts.some((text) => text.includes("understood") && text.includes("instructor"))
    ).toBe(true);
  });

  it("VISUAL_CHECKLIST is versioned and carries the owner's stage-12 topics", () => {
    expect(VISUAL_CHECKLIST.version).toBe("visual-checklist-v1");
    expect(VISUAL_CHECKLIST.items).toHaveLength(4);

    const texts = VISUAL_CHECKLIST.items.map((item) => item.text.toLowerCase());
    expect(texts.some((text) => text.includes("arrow") && text.includes("direction"))).toBe(true);
    expect(texts.some((text) => text.includes("request") && text.includes("response"))).toBe(true);
    expect(texts.some((text) => text.includes("html") && text.includes("request"))).toBe(true);
    expect(texts.some((text) => text.includes("query string") && text.includes("fragment"))).toBe(
      true
    );
  });

  it("splits deterministic vs llm exactly per scope 2.4: two info-flow items deterministic, all others llm", () => {
    const infoFlowModes = Object.fromEntries(
      INFO_FLOW_CHECKLIST.items.map((item) => [item.id, item.mode])
    );
    expect(infoFlowModes["vocab-without-a-model"]).toBe("deterministic");
    expect(infoFlowModes["standalone-reconstructable"]).toBe("deterministic");
    expect(infoFlowModes["main-point-obvious"]).toBe("llm");
    expect(infoFlowModes["where-to-look-first"]).toBe("llm");
    expect(infoFlowModes["detail-too-early"]).toBe("llm");
    expect(infoFlowModes["diagram-implies-false"]).toBe("llm");

    expect(VISUAL_CHECKLIST.items.every((item) => item.mode === "llm")).toBe(true);
  });
});

describe("runDeterministicChecklist", () => {
  const cleanDeck: ChecklistDeckInput = {
    slides: [
      { title: "Intro", bullets: [] }, // title slide, exempt from standalone-reconstructable
      {
        title: "Concept",
        bullets: ["A useful bullet"],
        terms: [{ term: "API", definition: "A contract between two programs." }],
      },
    ],
  };

  it("is non-vacuous: reports zero findings for a clean deck", () => {
    const result = runDeterministicChecklist(INFO_FLOW_CHECKLIST, cleanDeck);
    expect(result.findings).toEqual([]);
    expect(result.checklistVersion).toBe(INFO_FLOW_CHECKLIST.version);
  });

  it("runs every deterministic item id, proving none is silently skipped", () => {
    const result = runDeterministicChecklist(INFO_FLOW_CHECKLIST, cleanDeck);
    expect(result.ranItemIds.sort()).toEqual(["standalone-reconstructable", "vocab-without-a-model"].sort());
  });

  it("flags standalone-reconstructable: a non-title slide with a title and zero bullets/notes", () => {
    const deck: ChecklistDeckInput = {
      slides: [
        { title: "Intro", bullets: [] },
        { title: "Orphan Slide", bullets: [] },
      ],
    };
    const result = runDeterministicChecklist(INFO_FLOW_CHECKLIST, deck);
    const finding = result.findings.find((f) => f.itemId === "standalone-reconstructable");
    expect(finding).toBeDefined();
    expect(finding?.slideIndex).toBe(1);
  });

  it("SABOTAGE: a bullet-only slide (non-vacuous check) does not falsely trigger standalone-reconstructable", () => {
    // Proves the check is not vacuously flagging everything: a slide with
    // bullets (even without notes) must pass.
    const deck: ChecklistDeckInput = {
      slides: [
        { title: "Intro", bullets: [] },
        { title: "Has Content", bullets: ["One bullet is enough"] },
      ],
    };
    const result = runDeterministicChecklist(INFO_FLOW_CHECKLIST, deck);
    expect(result.findings.filter((f) => f.itemId === "standalone-reconstructable")).toEqual([]);
  });

  it("flags vocab-without-a-model: a term with an empty or missing definition", () => {
    const deck: ChecklistDeckInput = {
      slides: [
        { title: "Intro", bullets: [] },
        {
          title: "Terms",
          bullets: ["Some content"],
          terms: [
            { term: "Idempotent", definition: "  " },
            { term: "REST", definition: "An architectural style." },
          ],
        },
      ],
    };
    const result = runDeterministicChecklist(INFO_FLOW_CHECKLIST, deck);
    const findings = result.findings.filter((f) => f.itemId === "vocab-without-a-model");
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("Idempotent");
    expect(findings[0].slideIndex).toBe(1);
  });

  it("VISUAL_CHECKLIST has no deterministic items to run", () => {
    const result = runDeterministicChecklist(VISUAL_CHECKLIST, cleanDeck);
    expect(result.ranItemIds).toEqual([]);
    expect(result.findings).toEqual([]);
  });
});

describe("buildChecklistPrompt", () => {
  const deck: ChecklistDeckInput = {
    slides: [
      { title: "Intro", bullets: [] },
      { title: "How Requests Flow", bullets: ["Client sends a request", "Server sends a response"] },
    ],
  };

  it("includes every llm checklist item id and text, in checklist order", () => {
    const prompt = buildChecklistPrompt(INFO_FLOW_CHECKLIST, deck);
    const llmItems = INFO_FLOW_CHECKLIST.items.filter((item) => item.mode === "llm");

    let lastIndex = -1;
    for (const item of llmItems) {
      expect(prompt).toContain(item.id);
      expect(prompt).toContain(item.text);
      const index = prompt.indexOf(item.id);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it("omits deterministic-only items from the llm prompt", () => {
    const prompt = buildChecklistPrompt(INFO_FLOW_CHECKLIST, deck);
    // The deterministic items' ids should not appear as their own
    // "id: text" question line (id alone could coincidentally appear inside
    // deck content, so check the composed line, not a bare substring).
    expect(prompt).not.toContain("vocab-without-a-model: Is vocabulary introduced");
    expect(prompt).not.toContain("standalone-reconstructable: Can the deck be understood");
  });

  it("includes the deck content after the checklist questions", () => {
    const prompt = buildChecklistPrompt(VISUAL_CHECKLIST, deck);
    expect(prompt).toContain("How Requests Flow");
    expect(prompt).toContain("Client sends a request");
    expect(prompt.indexOf("arrow-direction")).toBeLessThan(prompt.indexOf("How Requests Flow"));
  });
});

describe("parseChecklistResponse", () => {
  it("turns a well-formed itemized reply into findings", () => {
    const reply = JSON.stringify([
      { itemId: "main-point-obvious", slideIndex: 2, message: "Slide 2 buries the claim in bullet 4." },
      { itemId: "where-to-look-first", message: "No visual hierarchy on slide 3." },
    ]);
    const result = parseChecklistResponse(INFO_FLOW_CHECKLIST, reply);
    expect(result.checklistVersion).toBe(INFO_FLOW_CHECKLIST.version);
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]).toEqual({
      checklistId: "info-flow",
      itemId: "main-point-obvious",
      slideIndex: 2,
      message: "Slide 2 buries the claim in bullet 4.",
    });
    expect(result.findings[1].slideIndex).toBeUndefined();
  });

  it("lists every llm item id as ran, regardless of which produced a finding", () => {
    const reply = JSON.stringify([{ itemId: "main-point-obvious", message: "Issue." }]);
    const result = parseChecklistResponse(INFO_FLOW_CHECKLIST, reply);
    const llmIds = INFO_FLOW_CHECKLIST.items.filter((item) => item.mode === "llm").map((item) => item.id);
    expect(result.ranItemIds.sort()).toEqual(llmIds.sort());
  });

  it("drops an entry with an unknown itemId instead of throwing", () => {
    const reply = JSON.stringify([{ itemId: "not-a-real-item", message: "Hallucinated." }]);
    expect(() => parseChecklistResponse(INFO_FLOW_CHECKLIST, reply)).not.toThrow();
    expect(parseChecklistResponse(INFO_FLOW_CHECKLIST, reply).findings).toEqual([]);
  });

  it("drops an entry naming a deterministic-only item id (llm reply cannot forge those)", () => {
    const reply = JSON.stringify([{ itemId: "vocab-without-a-model", message: "Should not count." }]);
    expect(parseChecklistResponse(INFO_FLOW_CHECKLIST, reply).findings).toEqual([]);
  });

  it("handles malformed JSON safely: returns zero findings, never throws", () => {
    expect(() => parseChecklistResponse(INFO_FLOW_CHECKLIST, "not json at all {{{")).not.toThrow();
    const result = parseChecklistResponse(INFO_FLOW_CHECKLIST, "not json at all {{{");
    expect(result.findings).toEqual([]);
    expect(result.checklistVersion).toBe(INFO_FLOW_CHECKLIST.version);
  });

  it("handles a non-array JSON reply safely: returns zero findings, never throws", () => {
    const reply = JSON.stringify({ itemId: "main-point-obvious", message: "Wrong shape." });
    expect(() => parseChecklistResponse(INFO_FLOW_CHECKLIST, reply)).not.toThrow();
    expect(parseChecklistResponse(INFO_FLOW_CHECKLIST, reply).findings).toEqual([]);
  });

  it("drops an entry missing a message, or with a non-string message, without throwing", () => {
    const reply = JSON.stringify([
      { itemId: "main-point-obvious" },
      { itemId: "where-to-look-first", message: 42 },
      { itemId: "detail-too-early", message: "   " },
    ]);
    expect(() => parseChecklistResponse(INFO_FLOW_CHECKLIST, reply)).not.toThrow();
    expect(parseChecklistResponse(INFO_FLOW_CHECKLIST, reply).findings).toEqual([]);
  });
});
