import { describe, it, expect } from "vitest";
import { scaffoldLessonPlan, scaffoldExamples } from "./deck";

describe("scaffoldLessonPlan", () => {
  it("builds a title slide, a slide per objective, and a summary for topics with no knowledge matches", async () => {
    const deck = await scaffoldLessonPlan("- Watercolor blending\n- Brush care\n- Paper selection");
    // title (1) + 3 concepts + summary (1) + 3 placeholder practice pairs (6 slides) + Documentation: Key Concepts (1) + Documentation & References (1) = 13
    expect(deck.slides.length).toBe(13);
    expect(deck.slides[0].title).toBe(deck.presentationTitle);
    expect(deck.slides.some((s) => s.title === "Summary")).toBe(true);
    expect(deck.slides.some((s) => s.title === "Documentation: Key Concepts")).toBe(true);
    expect(deck.slides[deck.slides.length - 1].title).toBe("Documentation & References");
    expect(deck.slides.some((s) => s.title.startsWith("Case Study:"))).toBe(false);
    expect(deck.slides.some((s) => s.title.startsWith("Additional Practice:"))).toBe(true);
    for (const slide of deck.slides) {
      expect(slide.bullets.length).toBeGreaterThan(0);
    }
  });

  it("inserts a real case study as the second slide when the topic matches", async () => {
    const deck = await scaffoldLessonPlan("- Integer overflow and data types");
    const caseStudy = deck.slides[1];
    expect(caseStudy.title).toMatch(/^Case Study: /);
    expect(caseStudy.bullets.length).toBe(3);
    expect(caseStudy.code).toBeUndefined();
  });

  it("adds the full Example/Walkthrough/Practice/Answer sequence from a curated problem", async () => {
    const deck = await scaffoldLessonPlan("- Recursion");
    const titles = deck.slides.map((s) => s.title);
    const example = deck.slides.find((s) => s.title.startsWith("Example:"));
    const walkthrough = deck.slides.find((s) => s.title.startsWith("Walkthrough:"));
    const practice = deck.slides.find((s) => s.title.startsWith("Practice:"));
    const answer = deck.slides.find((s) => s.title.startsWith("Answer:") && !s.title.includes("Additional Practice"));
    // Inline Practice/Answer pair (4 slides) + potential Additional Practice (2+ more) = at least 4
    expect(titles.filter((t) => /^(Example|Walkthrough|Practice|Answer):/.test(t)).length).toBeGreaterThanOrEqual(4);
    // Example and Walkthrough share the reference code; Practice repeats it
    // (never the solution); only the Answer shows the solution.
    expect(walkthrough?.code).toBe(example?.code);
    expect(practice?.code).toBe(example?.code);
    expect(answer?.code).toContain("def factorial");
    expect(practice?.code).not.toContain("def factorial(");
  });

  it("caps concept slides at eight", async () => {
    const objectives = Array.from({ length: 15 }, (_, i) => `- Objective ${i + 1}`).join("\n");
    const deck = await scaffoldLessonPlan(objectives);
    // title (1) + 8 concepts + summary (1) + 8 placeholder practice pairs (16 slides) + 2 documentation slides = 28
    expect(deck.slides.length).toBe(28);
  });

  it("keeps producing a deck when objectives are empty", async () => {
    const deck = await scaffoldLessonPlan("");
    expect(deck.slides.length).toBeGreaterThan(0);
  });

  it("prefers real code blocks from the material for Example/Walkthrough slides", async () => {
    const context = [
      "Recursion is when a function calls itself to solve a smaller version of the problem.",
      "```python",
      "def factorial(n):",
      "    return 1 if n <= 1 else n * factorial(n - 1)",
      "```",
    ].join("\n");
    const deck = await scaffoldLessonPlan("- Recursion", context);
    const example = deck.slides.find((s) => s.title.startsWith("Example:"));
    const walkthrough = deck.slides.find((s) => s.title.startsWith("Walkthrough:"));
    expect(example?.code).toContain("def factorial");
    expect(example?.codeLanguage).toBe("python");
    // Walkthrough shows the same code as the Example (mirrors the LLM contract).
    expect(walkthrough?.code).toBe(example?.code);
  });

  it("uses a definition from the source as the concept slide's first bullet", async () => {
    const deck = await scaffoldLessonPlan(
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
  it("produces two examples per concept", async () => {
    const r = await scaffoldExamples(["Binary Search", "Hash Tables"], "data structures in python");
    expect(r.examples.length).toBe(4);
    expect(r.lessonType).toBe("programming");
    expect(r.examples.every((e) => e.language === "python")).toBe(true);
  });

  it("detects a math lesson and omits a language", async () => {
    const r = await scaffoldExamples(["Derivatives"], "calculus: compute the derivative of a polynomial");
    expect(r.lessonType).toBe("math");
    expect(r.examples[0].language).toBeUndefined();
    expect(r.examples[0].content.toLowerCase()).toContain("problem");
  });

  it("returns no examples for no concepts", async () => {
    expect((await scaffoldExamples([], "anything")).examples).toEqual([]);
  });

  it("fills slots with real material: source code first, curated problem second", async () => {
    const text = "Learn python loops.\n```python\nfor i in range(3):\n    print(i)\n```";
    const r = await scaffoldExamples(["Loops"], text);
    // First example: the real code block from the material.
    expect(r.examples[0].content).toContain("for i in range(3)");
    expect(r.examples[0].language).toBe("python");
    // Second example: a curated practice problem with its verified solution.
    expect(r.examples[1].explanation).toContain("Practice problem:");
    expect(r.examples[1].content).not.toContain("Replace this stub");
  });

  it("uses a curated problem for the first slot when the material has no code", async () => {
    const r = await scaffoldExamples(["Recursion"], "an introductory python lesson on recursion");
    expect(r.examples[0].explanation).toContain("Practice problem:");
    expect(r.examples[0].content).toContain("def ");
    // The second slot falls back to a clearly-marked stub.
    expect(r.examples[1].content).toContain("Replace this stub");
  });
});
