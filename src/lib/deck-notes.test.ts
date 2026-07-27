import { describe, it, expect } from "vitest";
import { withDeckNotes, type PptxSlide } from "./pptx";
import { toSlideData } from "@/app/actions/shared";

function slides(): PptxSlide[] {
  return [
    { title: "Overview", bullets: ["a"] },
    { title: "Case Study: X", bullets: ["b"] },
  ];
}

describe("withDeckNotes", () => {
  it("puts the module introduction on the opening slide's notes", () => {
    const result = withDeckNotes(slides(), "# Module Introduction\n\nWhy this matters.");
    expect(result[0].notes).toBe("# Module Introduction\n\nWhy this matters.");
  });

  it("leaves every other slide untouched", () => {
    const result = withDeckNotes(slides(), "intro");
    expect(result[1].notes).toBeUndefined();
    expect(result[1].title).toBe("Case Study: X");
  });

  // A per-slide note is more specific than the deck-level introduction, so it
  // must win - otherwise generated narration would be overwritten by the intro.
  it("never overwrites notes the slide already has", () => {
    const withOwn = [{ title: "Overview", bullets: ["a"], notes: "Say this." }];
    expect(withDeckNotes(withOwn, "intro")[0].notes).toBe("Say this.");
  });

  it("treats whitespace-only existing notes as absent", () => {
    const blank = [{ title: "Overview", bullets: ["a"], notes: "   " }];
    expect(withDeckNotes(blank, "intro")[0].notes).toBe("intro");
  });

  it("is a no-op for a blank introduction or an empty deck", () => {
    const base = slides();
    expect(withDeckNotes(base, "")).toBe(base);
    expect(withDeckNotes(base, "   ")).toBe(base);
    expect(withDeckNotes([], "intro")).toEqual([]);
  });

  it("does not mutate the slides it was given", () => {
    const base = slides();
    withDeckNotes(base, "intro");
    expect(base[0].notes).toBeUndefined();
  });

  it("trims the introduction", () => {
    expect(withDeckNotes(slides(), "\n\n  intro  \n")[0].notes).toBe("intro");
  });
});

describe("toSlideData carries speaker notes", () => {
  it("keeps a notes field from the model", () => {
    const slide = toSlideData({ title: "T", bullets: ["b"], notes: "  Say this.  " }, 4);
    expect(slide.notes).toBe("Say this.");
  });

  it("omits notes entirely when absent or blank", () => {
    expect(toSlideData({ title: "T", bullets: ["b"] }, 4).notes).toBeUndefined();
    expect(toSlideData({ title: "T", bullets: ["b"], notes: "   " }, 4).notes).toBeUndefined();
  });
});
