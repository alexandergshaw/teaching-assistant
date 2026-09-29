import { describe, it, expect } from "vitest";

import type { PptxSlide } from "@/lib/pptx";
import { applyDeckOperation, coerceDeckOperation, type DeckOperation } from "./deck-operations";

function slide(overrides: Partial<PptxSlide> = {}): PptxSlide {
  return { title: "Title", bullets: ["one", "two"], ...overrides };
}

function deck(n: number): PptxSlide[] {
  return Array.from({ length: n }, (_, i) => slide({ title: `Slide ${i}` }));
}

// The oracle slide for CO-PRESERVE: non-empty notes AND a graphic, so a
// content op that drops either is provably wrong.
function slideWithNotesAndGraphic(): PptxSlide {
  return {
    title: "Original title",
    bullets: ["a", "b"],
    notes: "Say this out loud while the slide is up.",
    graphic: { kind: "process", steps: [{ label: "one" }, { label: "two" }] },
  };
}

// A naive full-replace dispatcher, standing in for a defective
// applyDeckOperation that returns the model's content alone instead of
// merging it onto the existing slide. Used only to PROVE CO-PRESERVE is a
// real assertion (it must go red against this), never shipped.
function sabotageFullReplace(slides: PptxSlide[], op: DeckOperation): PptxSlide[] {
  if (op.op !== "reword" && op.op !== "expand" && op.op !== "condense") return slides;
  const next = [...slides];
  next[op.slideIndex] = { title: op.content.title, bullets: op.content.bullets };
  return next;
}

describe("coerceDeckOperation", () => {
  it("accepts every recognised op tag", () => {
    expect(coerceDeckOperation({ op: "reword", slideIndex: 0, content: { title: "T", bullets: [] } })).not.toBeNull();
    expect(coerceDeckOperation({ op: "expand", slideIndex: 0, content: { title: "T", bullets: [] } })).not.toBeNull();
    expect(coerceDeckOperation({ op: "condense", slideIndex: 0, content: { title: "T", bullets: [] } })).not.toBeNull();
    expect(coerceDeckOperation({ op: "retitle", slideIndex: 0, title: "T" })).not.toBeNull();
    expect(coerceDeckOperation({ op: "retarget", slides: [{ title: "T", bullets: [] }] })).not.toBeNull();
    expect(coerceDeckOperation({ op: "reorder", order: [1, 0] })).not.toBeNull();
    expect(coerceDeckOperation({ op: "drop", slideIndex: 0 })).not.toBeNull();
    expect(coerceDeckOperation({ op: "refuse", category: "layout" })).not.toBeNull();
  });

  it("H3: refuses (returns null) an unrecognised op tag, never undefined, never a default", () => {
    const result = coerceDeckOperation({ op: "add-slide", slideIndex: 0 });
    expect(result).toBeNull();
  });

  it("H3: refuses a recognised op whose schema does not validate", () => {
    expect(coerceDeckOperation({ op: "reword", slideIndex: "0", content: { title: "T", bullets: [] } })).toBeNull();
    expect(coerceDeckOperation({ op: "reword", slideIndex: 0, content: { title: "T", bullets: "not-an-array" } })).toBeNull();
    expect(coerceDeckOperation({ op: "reorder", order: ["a", "b"] })).toBeNull();
    expect(coerceDeckOperation({ op: "refuse", category: "not-a-real-category" })).toBeNull();
  });

  it("H3: refuses non-object input", () => {
    expect(coerceDeckOperation(null)).toBeNull();
    expect(coerceDeckOperation("reword")).toBeNull();
    expect(coerceDeckOperation(undefined)).toBeNull();
  });
});

describe("applyDeckOperation: CO-COUNT (every ok result preserves slide count)", () => {
  const slides = deck(4);

  it("reword/expand/condense/retitle/drop preserve count", () => {
    const ops: DeckOperation[] = [
      { op: "reword", slideIndex: 1, content: { title: "New", bullets: ["x"] } },
      { op: "expand", slideIndex: 1, content: { title: "New", bullets: ["x", "y"] } },
      { op: "condense", slideIndex: 1, content: { title: "New", bullets: ["x"] } },
      { op: "retitle", slideIndex: 1, title: "New title" },
      { op: "drop", slideIndex: 1 },
    ];
    for (const op of ops) {
      const result = applyDeckOperation(slides, op);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.slides.length).toBe(slides.length);
    }
  });

  it("retarget with exactly N content items preserves count", () => {
    const op: DeckOperation = {
      op: "retarget",
      slides: deck(4).map((s) => ({ title: s.title, bullets: s.bullets })),
    };
    const result = applyDeckOperation(slides, op);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.slides.length).toBe(slides.length);
  });

  it("reorder with a valid permutation preserves count", () => {
    const op: DeckOperation = { op: "reorder", order: [3, 2, 1, 0] };
    const result = applyDeckOperation(slides, op);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.slides.length).toBe(slides.length);
  });

  it("SABOTAGE: the count assertion must go red if retarget's length check is removed", () => {
    // Simulates a dispatcher that skips the length check: merges as many
    // content items as given, ignoring any excess/shortfall silently.
    function noLengthCheckRetarget(base: PptxSlide[], contents: { title: string; bullets: string[] }[]): PptxSlide[] {
      return contents.map((c, i) => ({ ...(base[i] ?? base[0]), title: c.title, bullets: c.bullets }));
    }
    const tooFew = noLengthCheckRetarget(slides, [{ title: "Only one", bullets: [] }]);
    // Proves the oracle actually distinguishes correct from broken: a
    // length-blind implementation produces a wrong count here.
    expect(tooFew.length).not.toBe(slides.length);
    // And the real dispatcher refuses instead of producing that wrong count.
    const real = applyDeckOperation(slides, { op: "retarget", slides: [{ title: "Only one", bullets: [] }] });
    expect(real.ok).toBe(false);
  });
});

describe("applyDeckOperation: CO-PRESERVE (content ops preserve notes/graphic/unset fields)", () => {
  it("reword preserves notes and graphic when content sets neither", () => {
    const slides = [slideWithNotesAndGraphic(), slide()];
    const op: DeckOperation = { op: "reword", slideIndex: 0, content: { title: "Reworded", bullets: ["new bullet"] } };
    const result = applyDeckOperation(slides, op);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slides[0].notes).toBe(slides[0].notes);
    expect(result.slides[0].graphic).toEqual(slides[0].graphic);
    expect(result.slides[0].title).toBe("Reworded");
  });

  it("expand and condense also preserve notes/graphic", () => {
    for (const opName of ["expand", "condense"] as const) {
      const slides = [slideWithNotesAndGraphic()];
      const op: DeckOperation = { op: opName, slideIndex: 0, content: { title: "New", bullets: ["b"] } };
      const result = applyDeckOperation(slides, op);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.slides[0].notes).toBe(slides[0].notes);
      expect(result.slides[0].graphic).toEqual(slides[0].graphic);
    }
  });

  it("retarget preserves notes/graphic per positionally-merged slide", () => {
    const slides = [slideWithNotesAndGraphic()];
    const op: DeckOperation = { op: "retarget", slides: [{ title: "New", bullets: ["b"] }] };
    const result = applyDeckOperation(slides, op);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slides[0].notes).toBe(slides[0].notes);
    expect(result.slides[0].graphic).toEqual(slides[0].graphic);
  });

  it("leave-unless-present: a reword whose content omits code leaves existing code intact", () => {
    const withCode: PptxSlide = { title: "T", bullets: ["b"], code: "print(1)", codeLanguage: "python" };
    const op: DeckOperation = { op: "reword", slideIndex: 0, content: { title: "Reworded", bullets: ["new"] } };
    const result = applyDeckOperation([withCode], op);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slides[0].code).toBe("print(1)");
    expect(result.slides[0].codeLanguage).toBe("python");

    // Prove the naive-undefined-spread would fail: a full-replace merge that
    // spreads the content object over the slide (rather than copying only
    // present keys) would wipe `code` because SlideContent's `code` key is
    // absent, not merely undefined-valued, on the content object literal.
    const naiveResult = { ...withCode, ...op.content } as PptxSlide;
    expect(naiveResult.code).toBe("print(1)"); // object spread of an absent key keeps the original...
    // ...but a dispatcher that always assigns `code: content.code` (present
    // or not) would set it to undefined instead. That is exactly the
    // defect mergeSlideContent avoids by checking `"code" in content` first.
    const wipedByAlwaysAssigning: PptxSlide = { ...withCode, title: "Reworded", bullets: ["new"], code: (op.content as { code?: string }).code };
    expect(wipedByAlwaysAssigning.code).toBeUndefined();
  });

  it("SABOTAGE: a full-replace applyDeckOperation (content alone, no merge) turns CO-PRESERVE red", () => {
    const slides = [slideWithNotesAndGraphic()];
    const op: DeckOperation = { op: "reword", slideIndex: 0, content: { title: "Reworded", bullets: ["new"] } };
    const sabotaged = sabotageFullReplace(slides, op);
    // RED under the sabotage: notes and graphic are dropped.
    expect(sabotaged[0].notes).toBeUndefined();
    expect(sabotaged[0].graphic).toBeUndefined();
    // GREEN under the real dispatcher: both are preserved.
    const real = applyDeckOperation(slides, op);
    expect(real.ok).toBe(true);
    if (!real.ok) return;
    expect(real.slides[0].notes).toBe(slides[0].notes);
    expect(real.slides[0].graphic).toEqual(slides[0].graphic);
  });
});

describe("applyDeckOperation: drop", () => {
  it("clears title/bullets/code/codeLanguage/graphic but retains notes", () => {
    const slides = [slideWithNotesAndGraphic()];
    const result = applyDeckOperation(slides, { op: "drop", slideIndex: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slides[0].title).toBe("");
    expect(result.slides[0].bullets).toEqual([]);
    expect(result.slides[0].code).toBeUndefined();
    expect(result.slides[0].codeLanguage).toBeUndefined();
    expect(result.slides[0].graphic).toBeUndefined();
    expect(result.slides[0].notes).toBe(slides[0].notes);
    expect(result.slides.length).toBe(slides.length);
  });
});

describe("applyDeckOperation: reorder", () => {
  it("applies a valid permutation, moving notes/graphic with their slide", () => {
    const slides = [slideWithNotesAndGraphic(), slide({ title: "Second" })];
    const result = applyDeckOperation(slides, { op: "reorder", order: [1, 0] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slides[0].title).toBe("Second");
    expect(result.slides[1].notes).toBe(slides[0].notes);
    expect(result.slides[1].graphic).toEqual(slides[0].graphic);
  });

  it("refuses a non-permutation (duplicate index)", () => {
    const result = applyDeckOperation(deck(3), { op: "reorder", order: [0, 0, 2] });
    expect(result.ok).toBe(false);
  });

  it("refuses a non-permutation (wrong length)", () => {
    const result = applyDeckOperation(deck(3), { op: "reorder", order: [0, 1] });
    expect(result.ok).toBe(false);
  });

  it("refuses a non-permutation (out of range index)", () => {
    const result = applyDeckOperation(deck(3), { op: "reorder", order: [0, 1, 5] });
    expect(result.ok).toBe(false);
  });
});

describe("H3/H4: refusals", () => {
  it("add-slide: an explicit refuse op names wave T3 in its reason", () => {
    const result = applyDeckOperation(deck(2), { op: "refuse", category: "add-slide" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.class).toBe("operation-refused");
    if (result.refusal.class === "operation-refused") {
      expect(result.refusal.reason).toMatch(/cannot add a slide/i);
    }
  });

  it("add-slide via retarget with more content than slides refuses with a counted reason", () => {
    const result = applyDeckOperation(deck(2), {
      op: "retarget",
      slides: [{ title: "a", bullets: [] }, { title: "b", bullets: [] }, { title: "c", bullets: [] }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.class).toBe("slide-count-refusal");
  });

  it("delete-slide: an explicit refuse op offers drop as the alternative", () => {
    const result = applyDeckOperation(deck(2), { op: "refuse", category: "delete-slide" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    if (result.refusal.class === "operation-refused") {
      expect(result.refusal.reason).toMatch(/empty a slide/i);
    }
  });

  it("layout/placement asks refuse as unrepresentable", () => {
    const result = applyDeckOperation(deck(2), { op: "refuse", category: "layout" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    if (result.refusal.class === "operation-refused") {
      expect(result.refusal.reason).toMatch(/layout/i);
    }
  });

  it("an out-of-range slideIndex refuses with a reason, never a crash", () => {
    const result = applyDeckOperation(deck(2), { op: "reword", slideIndex: 9, content: { title: "T", bullets: [] } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal.class).toBe("operation-refused");
  });

  it("every refusal carries a non-empty reason string", () => {
    const refusals: DeckOperation[] = [
      { op: "refuse", category: "add-slide" },
      { op: "refuse", category: "layout" },
      { op: "refuse", category: "delete-slide" },
      { op: "refuse", category: "other" },
      { op: "reorder", order: [0, 0] },
    ];
    for (const op of refusals) {
      const result = applyDeckOperation(deck(2), op);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      const reason = "reason" in result.refusal ? result.refusal.reason : "";
      expect(reason.length).toBeGreaterThan(0);
    }
  });
});
