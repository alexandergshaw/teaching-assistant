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

  it("turns real code blocks from the material into Example/Walkthrough slide pairs", () => {
    const context = [
      "Recursion is when a function calls itself to solve a smaller version of the problem.",
      "```python",
      "def factorial(n):",
      "    return 1 if n <= 1 else n * factorial(n - 1)",
      "```",
    ].join("\n");
    const deck = scaffoldLessonPlan("- Recursion", context);
    const example = deck.slides.find((s) => s.title.startsWith("Example:"));
    const walkthrough = deck.slides.find((s) => s.title.startsWith("Walkthrough:"));
    expect(example?.code).toContain("def factorial");
    expect(example?.codeLanguage).toBe("python");
    // Walkthrough shows the same code as the Example (mirrors the LLM contract).
    expect(walkthrough?.code).toBe(example?.code);
  });

  it("uses a definition from the source as the concept slide's first bullet", () => {
    const deck = scaffoldLessonPlan(
      "- Recursion",
      "Recursion is when a function calls itself to solve a smaller problem."
    );
    const hasDefinitionBullet = deck.slides.some((s) =>
      /Recursion is when a function calls itself/.test(s.bullets[0] ?? "")
    );
    expect(hasDefinitionBullet).toBe(true);
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

  it("uses a real code block from the material as the first example when available", () => {
    const text = "Learn python loops.\n```python\nfor i in range(3):\n    print(i)\n```";
    const r = scaffoldExamples(["Loops"], text);
    expect(r.examples[0].content).toContain("for i in range(3)");
    expect(r.examples[0].language).toBe("python");
    // The second example stays a clearly-marked stub.
    expect(r.examples[1].content).toContain("Replace this stub");
  });
});
