// Pure-logic contract for deck.ts - see that file's own header comment for
// what it holds and why it is a sibling of kinds.ts rather than a growth of
// it. No I/O, no vi.mock needed: every export here is a plain function over
// in-memory fixtures.
import { describe, it, expect } from "vitest";
import type { DeckTemplate, DeckLoopGroup } from "@/lib/decks/types";
import type { SlideData } from "@/app/actions-types";
import {
  resolveDeckTemplateSelection,
  buildDeckGenContext,
  parseDeckSlidesFromStructured,
  mergeRefinedDeckSlides,
} from "./deck";

function makeTemplate(loops: DeckLoopGroup[] = []): DeckTemplate {
  return {
    id: "tpl-1",
    name: "Classic Lecture",
    description: "",
    audience: "Any level",
    tone: "clear, informative",
    slides: [],
    loops,
    theme: {
      backgroundKind: "solid",
      backgroundColor: "#ffffff",
      backgroundColor2: "#e2e8f0",
      gradientAngle: 135,
      fontColor: "#1e293b",
    },
  };
}

describe("resolveDeckTemplateSelection", () => {
  it("THE NO-TEMPLATE CASE: refuses a blank id with a named reason", () => {
    const result = resolveDeckTemplateSelection("");
    expect(result).toEqual({ ok: false, reason: "Pick a template before generating a deck." });
  });

  it("refuses undefined/null/whitespace-only the same way", () => {
    expect(resolveDeckTemplateSelection(undefined)).toEqual({
      ok: false,
      reason: "Pick a template before generating a deck.",
    });
    expect(resolveDeckTemplateSelection(null)).toEqual({
      ok: false,
      reason: "Pick a template before generating a deck.",
    });
    expect(resolveDeckTemplateSelection("   ")).toEqual({
      ok: false,
      reason: "Pick a template before generating a deck.",
    });
  });

  it("accepts a real id, trimmed", () => {
    expect(resolveDeckTemplateSelection("  preset-classic-lecture  ")).toEqual({
      ok: true,
      templateId: "preset-classic-lecture",
    });
  });
});

describe("buildDeckGenContext", () => {
  it("carries subject/materials through and maps template audience/tone", () => {
    const template = makeTemplate();
    const ctx = buildDeckGenContext(template, "Week 3", "grounded materials text");
    expect(ctx.subject).toBe("Week 3");
    expect(ctx.audience).toBe("Any level");
    expect(ctx.tone).toBe("clear, informative");
    expect(ctx.materials).toBe("grounded materials text");
  });

  it("leaves audience/tone/materials undefined (not empty strings) when blank", () => {
    const template = makeTemplate();
    template.audience = "";
    template.tone = "";
    const ctx = buildDeckGenContext(template, "Week 3", "");
    expect(ctx.audience).toBeUndefined();
    expect(ctx.tone).toBeUndefined();
    expect(ctx.materials).toBeUndefined();
  });

  it("a LITERAL loop group keeps its own baked-in items regardless of the selection", () => {
    const literalGroup: DeckLoopGroup = {
      id: "loop-1",
      label: "Fixed topics",
      source: "literal",
      items: ["Topic A", "Topic B"],
      breadth: "standard",
    };
    const ctx = buildDeckGenContext(makeTemplate([literalGroup]), "Week 3", "materials");
    expect(ctx.loopItems["loop-1"]).toEqual(["Topic A", "Topic B"]);
  });

  it("SABOTAGE TARGET: every non-literal loop group gets NO loop items - materials text alone grounds it", () => {
    const runtimeGroup: DeckLoopGroup = {
      id: "loop-2",
      label: "Per concept",
      source: "runtime",
      items: ["should be ignored"],
      breadth: "standard",
    };
    const ctx = buildDeckGenContext(makeTemplate([runtimeGroup]), "Week 3", "materials");
    expect(ctx.loopItems["loop-2"]).toEqual([]);
  });
});

describe("parseDeckSlidesFromStructured", () => {
  it("returns the array unchanged when every entry is slide-shaped", () => {
    const structured = [
      { title: "Intro", bullets: ["a", "b"] },
      { title: "Code", bullets: ["c"], code: "print(1)", codeLanguage: "python" },
    ];
    expect(parseDeckSlidesFromStructured(structured)).toEqual(structured);
  });

  it("returns an empty array for null (a version saved before this kind existed, or one from another kind)", () => {
    expect(parseDeckSlidesFromStructured(null)).toEqual([]);
  });

  it("returns an empty array for a non-array structured value", () => {
    expect(parseDeckSlidesFromStructured({ not: "an array" })).toEqual([]);
    expect(parseDeckSlidesFromStructured("a string")).toEqual([]);
    expect(parseDeckSlidesFromStructured(42)).toEqual([]);
  });

  it("filters out entries missing a title or bullets rather than throwing", () => {
    const structured = [
      { title: "Good", bullets: ["a"] },
      { title: "Missing bullets" },
      { bullets: ["missing title"] },
      null,
      "not an object",
    ];
    expect(parseDeckSlidesFromStructured(structured)).toEqual([{ title: "Good", bullets: ["a"] }]);
  });
});

describe("mergeRefinedDeckSlides", () => {
  // reviseLectureSlidesAction's own LLM contract (src/app/actions/
  // lecture-plans.ts) never asks for `notes`/`graphic`, so every slide it
  // returns is missing them by construction - fixtures below build the
  // "revised" side of each case the same way: title/bullets/code only, no
  // notes/graphic at all, matching what that action actually returns.
  const TABLE_GRAPHIC = { kind: "table" as const, headers: ["a"], rows: [["1"]] };

  it("a slide's notes and graphic survive a refine that changes its title and bullets", () => {
    const oldSlides: SlideData[] = [{ title: "Intro", bullets: ["hello"], notes: "say hello warmly", graphic: TABLE_GRAPHIC }];
    const newSlides: SlideData[] = [{ title: "Introduction", bullets: ["welcome", "agenda"] }];

    const result = mergeRefinedDeckSlides(oldSlides, newSlides);

    expect(result.slides).toEqual([
      { title: "Introduction", bullets: ["welcome", "agenda"], notes: "say hello warmly", graphic: TABLE_GRAPHIC },
    ]);
    expect(result.droppedFields).toEqual([]);
  });

  it("a refine that reorders slides does not move a note onto the wrong slide", () => {
    const oldSlides: SlideData[] = [
      { title: "A", bullets: ["a1"], notes: "noteA" },
      { title: "B", bullets: ["b1"] },
      { title: "C", bullets: ["c1"], notes: "noteC" },
    ];
    // The model reordered C to the front and B to the back, and lightly
    // edited A and C's bullets - titles are unchanged and still unique, so
    // this is the pure-reorder case unique-title matching (pass 1) resolves
    // on its own, with no positional fallback involved.
    const newSlides: SlideData[] = [
      { title: "C", bullets: ["c1-edited"] },
      { title: "A", bullets: ["a1-edited"] },
      { title: "B", bullets: ["b1"] },
    ];

    const result = mergeRefinedDeckSlides(oldSlides, newSlides);

    // A naive index-based merge would put old[0] ("A", noteA) onto new[0]
    // ("C") - the opposite of what must happen.
    expect(result.slides[0]).toEqual({ title: "C", bullets: ["c1-edited"], notes: "noteC" });
    expect(result.slides[1]).toEqual({ title: "A", bullets: ["a1-edited"], notes: "noteA" });
    expect(result.slides[2]).toEqual({ title: "B", bullets: ["b1"] });
    expect(result.droppedFields).toEqual([]);
  });

  it("a refine that adds a slide leaves the new one without fabricated notes", () => {
    const oldSlides: SlideData[] = [{ title: "A", bullets: ["a1"], notes: "noteA" }];
    const newSlides: SlideData[] = [
      { title: "A", bullets: ["a1"] },
      { title: "B - New", bullets: ["b1"] },
    ];

    const result = mergeRefinedDeckSlides(oldSlides, newSlides);

    expect(result.slides[0]).toEqual({ title: "A", bullets: ["a1"], notes: "noteA" });
    expect(result.slides[1]).toEqual({ title: "B - New", bullets: ["b1"] });
    expect(result.slides[1].notes).toBeUndefined();
    // The old slide was matched, so nothing was actually lost.
    expect(result.droppedFields).toEqual([]);
  });

  it("a refine that removes a slide does not resurrect it", () => {
    const oldSlides: SlideData[] = [
      { title: "A", bullets: ["a1"], notes: "noteA" },
      { title: "B", bullets: ["b1"], notes: "noteB" },
    ];
    const newSlides: SlideData[] = [{ title: "A", bullets: ["a1-edited"] }];

    const result = mergeRefinedDeckSlides(oldSlides, newSlides);

    expect(result.slides).toEqual([{ title: "A", bullets: ["a1-edited"], notes: "noteA" }]);
    expect(result.slides.some((s) => s.title === "B")).toBe(false);
    // B's own notes are gone, not resurrected onto anything - recorded as a
    // drop rather than silently vanishing.
    expect(result.droppedFields).toHaveLength(1);
    expect(result.droppedFields[0]).toContain("B");
  });

  it("title/bullets/code are taken from the REFINED version, not the old one", () => {
    const oldSlides: SlideData[] = [
      { title: "Old title", bullets: ["old1", "old2"], code: "print('old')", codeLanguage: "python", notes: "keep me" },
    ];
    const newSlides: SlideData[] = [
      { title: "New title", bullets: ["new1"], code: "print('new')", codeLanguage: "javascript" },
    ];

    const result = mergeRefinedDeckSlides(oldSlides, newSlides);

    expect(result.slides).toEqual([
      { title: "New title", bullets: ["new1"], code: "print('new')", codeLanguage: "javascript", notes: "keep me" },
    ]);
  });

  it("does not resurrect code the refine itself dropped, even on a confidently-matched slide", () => {
    // The model was ASKED about `code` (it is in its contract) and chose to
    // return none - that is the refinement's own decision, and must stand,
    // unlike `notes`, which the model was never asked about at all.
    const oldSlides: SlideData[] = [
      { title: "Same title", bullets: ["a"], code: "print(1)", codeLanguage: "python", notes: "note1" },
    ];
    const newSlides: SlideData[] = [{ title: "Same title", bullets: ["a-edited"] }];

    const result = mergeRefinedDeckSlides(oldSlides, newSlides);

    expect(result.slides).toEqual([{ title: "Same title", bullets: ["a-edited"], notes: "note1" }]);
    expect(result.slides[0].code).toBeUndefined();
    expect(result.slides[0].codeLanguage).toBeUndefined();
  });

  it("does not guess between two old slides sharing the same title - the field is dropped, not attached to either", () => {
    // Both old slides share a title, so pass 1 (unique title) cannot tell
    // them apart; the new deck drops one of the two entirely, so pass 2's
    // leftover counts (2 old vs 1 new) do not match either - no pairing is
    // confident enough to attempt.
    const oldSlides: SlideData[] = [
      { title: "Practice", bullets: ["a"], notes: "note-set-1" },
      { title: "Practice", bullets: ["b"], notes: "note-set-2" },
      { title: "Wrap-up", bullets: ["c"] },
    ];
    const newSlides: SlideData[] = [{ title: "Practice", bullets: ["a-edited"] }, { title: "Wrap-up", bullets: ["c"] }];

    const result = mergeRefinedDeckSlides(oldSlides, newSlides);

    expect(result.slides[0].notes).toBeUndefined();
    expect(result.droppedFields.length).toBeGreaterThan(0);
  });
});
