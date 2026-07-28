import { describe, it, expect } from "vitest";
import { clampDeckConcepts, parseDeckConcepts, conceptsFromSlideTitles } from "./deck-concepts";

describe("clampDeckConcepts", () => {
  it("defaults to 8 for blank/invalid input", () => {
    expect(clampDeckConcepts(undefined)).toBe(8);
    expect(clampDeckConcepts("")).toBe(8);
    expect(clampDeckConcepts("not a number")).toBe(8);
  });

  it("clamps to [1, 20]", () => {
    expect(clampDeckConcepts(0)).toBe(1);
    expect(clampDeckConcepts(-5)).toBe(1);
    expect(clampDeckConcepts(50)).toBe(20);
    expect(clampDeckConcepts(5)).toBe(5);
    expect(clampDeckConcepts("12")).toBe(12);
  });
});

describe("parseDeckConcepts", () => {
  it("parses the JSON concepts shape", () => {
    const text = `{"concepts":[{"concept":"for loops","evidence":"## Iterating with for"},{"concept":"list comprehension","evidence":"Slide 4: List comprehensions"}]}`;
    const concepts = parseDeckConcepts(text, 8);
    expect(concepts).toEqual([
      { concept: "for loops", evidence: "## Iterating with for" },
      { concept: "list comprehension", evidence: "Slide 4: List comprehensions" },
    ]);
  });

  it("caps JSON concepts at max", () => {
    const text = `{"concepts":[{"concept":"A"},{"concept":"B"},{"concept":"C"}]}`;
    expect(parseDeckConcepts(text, 2)).toHaveLength(2);
  });

  it("dedupes JSON concepts by normalized key", () => {
    const text = `{"concepts":[{"concept":"For Loops"},{"concept":"for-loops"},{"concept":"Recursion"}]}`;
    const concepts = parseDeckConcepts(text, 8);
    expect(concepts.map((c) => c.concept)).toEqual(["For Loops", "Recursion"]);
  });

  it("falls back to tolerant line parsing when JSON is absent", () => {
    const text = "- For loops\n* List comprehension\n1. Recursion";
    const concepts = parseDeckConcepts(text, 8);
    expect(concepts.map((c) => c.concept)).toEqual(["For loops", "List comprehension", "Recursion"]);
  });

  it("dedupes line-parsed concepts by normalized key", () => {
    const text = "For Loops\nfor-loops\nRecursion";
    const concepts = parseDeckConcepts(text, 8);
    expect(concepts.map((c) => c.concept)).toEqual(["For Loops", "Recursion"]);
  });

  it("caps line-parsed concepts at max", () => {
    const text = "A\nB\nC\nD";
    expect(parseDeckConcepts(text, 2)).toHaveLength(2);
  });

  it("skips lines over 120 chars in the line fallback", () => {
    const longLine = "x".repeat(121);
    const text = `Short concept\n${longLine}`;
    const concepts = parseDeckConcepts(text, 8);
    expect(concepts.map((c) => c.concept)).toEqual(["Short concept"]);
  });

  it("returns [] for junk input", () => {
    expect(parseDeckConcepts("", 8)).toEqual([]);
    expect(parseDeckConcepts("   \n  \n", 8)).toEqual([]);
  });

  it("returns [] when JSON concepts array is empty and no lines remain", () => {
    expect(parseDeckConcepts(`{"concepts":[]}`, 8)).toEqual([]);
  });
});

describe("conceptsFromSlideTitles", () => {
  it("extracts concepts from markdown '## title' headings", () => {
    const deckText = "# My Deck\n\n## For Loops\n\nBody text\n\n## Recursion\n\nMore text";
    const concepts = conceptsFromSlideTitles(deckText, 8);
    expect(concepts).toEqual([
      { concept: "For Loops", evidence: "For Loops" },
      { concept: "Recursion", evidence: "Recursion" },
    ]);
  });

  it("extracts concepts from 'Slide N: title' lines", () => {
    const deckText = "Slide 1: For Loops\nSome body text\n\nSlide 2: Recursion\nMore body text";
    const concepts = conceptsFromSlideTitles(deckText, 8);
    expect(concepts).toEqual([
      { concept: "For Loops", evidence: "For Loops" },
      { concept: "Recursion", evidence: "Recursion" },
    ]);
  });

  it("recognizes both forms in the same deck", () => {
    const deckText = "## For Loops\nSlide 2: Recursion";
    const concepts = conceptsFromSlideTitles(deckText, 8);
    expect(concepts.map((c) => c.concept)).toEqual(["For Loops", "Recursion"]);
  });

  it("dedupes titles by normalized key", () => {
    const deckText = "## For Loops\n## for-loops\n## Recursion";
    const concepts = conceptsFromSlideTitles(deckText, 8);
    expect(concepts.map((c) => c.concept)).toEqual(["For Loops", "Recursion"]);
  });

  it("caps titles at max", () => {
    const deckText = "## A\n## B\n## C\n## D";
    expect(conceptsFromSlideTitles(deckText, 2)).toHaveLength(2);
  });

  it("returns [] for a deck with no recognizable titles", () => {
    expect(conceptsFromSlideTitles("just some plain body text\nwith no headings", 8)).toEqual([]);
    expect(conceptsFromSlideTitles("", 8)).toEqual([]);
  });
});
