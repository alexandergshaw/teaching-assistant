import { describe, it, expect } from "vitest";

import type { PptxSlide } from "@/lib/pptx";
import { buildAskPrompt } from "./ask-prompt";

const SLIDES: PptxSlide[] = [
  { title: "Intro", bullets: ["welcome", "agenda"] },
  { title: "Recursion", bullets: ["base case", "recursive case"], code: "def f(n): ...", codeLanguage: "python" },
];

describe("buildAskPrompt", () => {
  it("names every op in the closed vocabulary", () => {
    const prompt = buildAskPrompt("rewrite slide 0", SLIDES);
    for (const op of ["reword", "expand", "condense", "retitle", "retarget", "reorder", "drop"]) {
      expect(prompt).toContain(`"${op}"`);
    }
  });

  it("names every refuse category", () => {
    const prompt = buildAskPrompt("do something", SLIDES);
    for (const category of ["add-slide", "layout", "delete-slide", "other"]) {
      expect(prompt).toContain(category);
    }
  });

  it("forbids layout/formatting/template changes in words", () => {
    const prompt = buildAskPrompt("do something", SLIDES);
    expect(prompt).toMatch(/never.*add a slide/i);
    expect(prompt).toMatch(/never.*remove a slide/i);
    expect(prompt).toMatch(/layout/i);
  });

  it("includes the deck's content (title, bullets, code) but never a template/file handle", () => {
    const prompt = buildAskPrompt("do something", SLIDES);
    expect(prompt).toContain("Intro");
    expect(prompt).toContain("welcome");
    expect(prompt).toContain("Recursion");
    expect(prompt).toContain("def f(n): ...");
    expect(prompt).not.toMatch(/templateFileId|sourceId|base64/i);
  });

  it("states the fixed slide count", () => {
    const prompt = buildAskPrompt("do something", SLIDES);
    expect(prompt).toContain(String(SLIDES.length));
  });

  it("includes the instructor's instruction text", () => {
    const prompt = buildAskPrompt("make slide 1 shorter", SLIDES);
    expect(prompt).toContain("make slide 1 shorter");
  });

  it("orders the deck content before the instruction (fact + ordering, not exact spelling)", () => {
    const prompt = buildAskPrompt("the instruction sentence", SLIDES);
    const deckPos = prompt.indexOf("Intro");
    const instructionPos = prompt.indexOf("the instruction sentence");
    expect(deckPos).toBeGreaterThan(-1);
    expect(instructionPos).toBeGreaterThan(deckPos);
  });

  it("asks for a single JSON object response with no other text", () => {
    const prompt = buildAskPrompt("do something", SLIDES);
    expect(prompt).toMatch(/one JSON object/i);
    expect(prompt).toMatch(/no other text/i);
  });
});
