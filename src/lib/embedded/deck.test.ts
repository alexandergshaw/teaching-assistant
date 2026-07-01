import { describe, it, expect } from "vitest";
import { scaffoldLessonPlan, scaffoldExamples } from "./deck";

describe("scaffoldLessonPlan", () => {
  it("builds a title slide, a slide per objective, and a summary", () => {
    const deck = scaffoldLessonPlan("- Loops\n- Functions\n- Recursion");
    expect(deck.slides.length).toBe(5); // title + 3 concepts + summary
    expect(deck.slides[0].title).toBe(deck.presentationTitle);
    expect(deck.slides[deck.slides.length - 1].title).toBe("Summary");
    for (const slide of deck.slides) {
      expect(slide.bullets.length).toBeGreaterThan(0);
    }
  });

  it("caps concept slides at eight", () => {
    const objectives = Array.from({ length: 15 }, (_, i) => `- Objective ${i + 1}`).join("\n");
    const deck = scaffoldLessonPlan(objectives);
    // title + 8 concepts + summary
    expect(deck.slides.length).toBe(10);
  });

  it("keeps producing a deck when objectives are empty", () => {
    const deck = scaffoldLessonPlan("");
    expect(deck.slides.length).toBeGreaterThan(0);
  });
});

describe("scaffoldExamples", () => {
  it("produces two examples per concept", () => {
    const r = scaffoldExamples(["Binary Search", "Hash Tables"], "data structures in python");
    expect(r.examples.length).toBe(4);
    expect(r.lessonType).toBe("programming");
    expect(r.examples.every((e) => e.language === "python")).toBe(true);
  });

  it("detects a math lesson and omits a language", () => {
    const r = scaffoldExamples(["Derivatives"], "calculus: compute the derivative of a polynomial");
    expect(r.lessonType).toBe("math");
    expect(r.examples[0].language).toBeUndefined();
    expect(r.examples[0].content.toLowerCase()).toContain("problem");
  });

  it("returns no examples for no concepts", () => {
    expect(scaffoldExamples([], "anything").examples).toEqual([]);
  });
});
