import { describe, expect, it } from "vitest";
import {
  DECK_STANDARD_V1,
  checkDeckStandard,
  isTitleCase,
  type DeckStandardInput,
} from "./standard";
import type { DeckStandard, StandardViolation } from "./types";

// In-memory GeneratedDeck-shaped fixtures. No pptx is tracked in this repo;
// checkDeckStandard's input is structural (DeckStandardInput), so a plain
// object literal in this shape is exactly what a real GeneratedDeck would
// present.

function conformingDeck(): DeckStandardInput {
  return {
    presentationTitle: "Intro to Web Requests",
    slides: [
      { title: "Web Requests in Practice", bullets: [] },
      {
        title: "How a Browser Talks to a Server",
        bullets: ["Find the address", "Open a connection", "Send the request"],
      },
      { title: "Building the Response", bullets: ["Parse", "Render", "Done"] },
    ],
  };
}

describe("isTitleCase", () => {
  it("accepts standard Title Case, small words lowercased mid-title", () => {
    expect(isTitleCase("How a Browser Talks to a Server")).toBe(true);
    expect(isTitleCase("Building the Response")).toBe(true);
    expect(isTitleCase("Web Requests in Practice")).toBe(true);
  });

  it("requires a leading/trailing small word to still be capitalized", () => {
    expect(isTitleCase("The Request and the Response")).toBe(true);
    expect(isTitleCase("the Request and the Response")).toBe(false);
    expect(isTitleCase("The Request and The")).toBe(true);
  });

  it("rejects an all-lowercase title", () => {
    expect(isTitleCase("the quick brown fox jumps")).toBe(false);
  });

  it("rejects a major word left lowercase mid-title", () => {
    expect(isTitleCase("Building the response Correctly")).toBe(false);
  });

  it("treats a title with no letters as non-violating", () => {
    expect(isTitleCase("2026")).toBe(true);
    expect(isTitleCase("")).toBe(true);
  });

  // INFO-1 fix: colon subtitles (section-divider convention, stages 7/13).
  // Before the fix, "The" after the colon was checked as a MID-TITLE small
  // word and flagged lowercase-required, which it is not - it opens a new
  // segment. This is the RED/GREEN case: reimplementing the pre-fix rule
  // (whole-title first/last only, no segment-start concept) demonstrates
  // the false-fail was real, and the real isTitleCase no longer has it.
  it("INFO-1: a colon-subtitle title passes (was a false-fail before the fix)", () => {
    function preFixIsTitleCase(title: string): boolean {
      const words = title.split(/\s+/).filter(Boolean);
      if (words.length === 0) return true;
      return words.every((word, i) => {
        const letterMatch = word.match(/[A-Za-z]/);
        if (!letterMatch) return true;
        const firstLetter = letterMatch[0];
        const bareWord = word.replace(/[^A-Za-z]/g, "").toLowerCase();
        const isEdge = i === 0 || i === words.length - 1;
        const isSmall = SMALL_WORDS_FOR_TEST.has(bareWord);
        if (isEdge || !isSmall) return firstLetter === firstLetter.toUpperCase();
        return firstLetter === firstLetter.toLowerCase();
      });
    }

    // RED: the pre-fix rule flags "The" (mid-title small word) as needing
    // to stay lowercase, so it reports the title as NOT Title Case.
    expect(preFixIsTitleCase("Section 2: The Request Lifecycle")).toBe(false);

    // GREEN: the real (fixed) isTitleCase treats "The" as segment-start.
    expect(isTitleCase("Section 2: The Request Lifecycle")).toBe(true);
  });

  it("INFO-1: a colon subtitle whose first word is itself a small word still capitalizes it", () => {
    expect(isTitleCase("Chapter 1: A New Start")).toBe(true);
  });

  it("INFO-1: hyphenated compounds - each component follows capitalize-unless-small-word", () => {
    // Chosen rule: correctly-capitalized compound passes.
    expect(isTitleCase("Client-Server Model")).toBe(true);
    // The mild false-pass from the old whole-word-only check is now a real
    // catch: "server" is not a small word, so it must be capitalized too.
    expect(isTitleCase("Client-server Model")).toBe(false);
  });

  it("does not regress: mid-title small words and a genuinely bad title", () => {
    // Existing mid-small-word title still passes.
    expect(isTitleCase("A Tour of the DOM")).toBe(true);
    // A genuinely wrong (all-lowercase) title is still caught.
    expect(isTitleCase("the request lifecycle")).toBe(false);
  });
});

// Local copy of the pre-fix SMALL_WORDS set, used only by the RED/GREEN
// reimplementation above (no-cross-test-file-imports: this must not import
// SMALL_WORDS from standard.ts since it is not exported, and duplicating a
// small literal here is fine per the project's fixture convention).
const SMALL_WORDS_FOR_TEST = new Set([
  "a", "an", "the",
  "and", "but", "or", "nor",
  "as", "at", "by", "for", "in", "of", "on", "per", "to", "up", "via",
]);

describe("checkDeckStandard: still catches a real title-case violation", () => {
  it("flags a genuinely bad title even after the colon/hyphen refinements", () => {
    const deck = conformingDeck();
    deck.slides[1] = { ...deck.slides[1], title: "the request lifecycle" };
    const result = checkDeckStandard(deck, DECK_STANDARD_V1);
    const hit = result.violations.find((v) => v.rule === "requireTitleCase");
    expect(hit).toBeDefined();
    expect(hit?.slideIndex).toBe(1);
  });
});

describe("checkDeckStandard: conforming deck", () => {
  it("reports zero violations for a fully conforming deck", () => {
    const result = checkDeckStandard(conformingDeck(), DECK_STANDARD_V1);
    expect(result.violations).toEqual([]);
  });
});

describe("checkDeckStandard: DS-PROVENANCE", () => {
  it("carries standardVersion from the standard that ran, not from the deck", () => {
    const result = checkDeckStandard(conformingDeck(), DECK_STANDARD_V1);
    expect(result.standardVersion).toBe(DECK_STANDARD_V1.version);
  });

  it("reflects a different standard's version when a different standard runs", () => {
    const customStandard: DeckStandard = { ...DECK_STANDARD_V1, version: "deck-standard-v2-test" };
    const result = checkDeckStandard(conformingDeck(), customStandard);
    expect(result.standardVersion).toBe("deck-standard-v2-test");
  });
});

describe("checkDeckStandard: each rule flags a violating deck", () => {
  it("requireTitleCase: flags a non-Title-Case slide title", () => {
    const deck = conformingDeck();
    deck.slides[1] = { ...deck.slides[1], title: "how a browser talks to a server" };
    const result = checkDeckStandard(deck, DECK_STANDARD_V1);
    const hit = result.violations.find((v) => v.rule === "requireTitleCase");
    expect(hit).toBeDefined();
    expect(hit?.slideIndex).toBe(1);
  });

  it("titleSlideOnlyTitle: flags bullets on the first slide", () => {
    const deck = conformingDeck();
    deck.slides[0] = { ...deck.slides[0], bullets: ["Should not be here"] };
    const result = checkDeckStandard(deck, DECK_STANDARD_V1);
    const hit = result.violations.find((v) => v.rule === "titleSlideOnlyTitle");
    expect(hit).toBeDefined();
    expect(hit?.slideIndex).toBe(0);
  });

  it("maxBulletsPerSlide: flags a slide over the cap", () => {
    const deck = conformingDeck();
    deck.slides[1] = {
      ...deck.slides[1],
      bullets: ["One", "Two", "Three", "Four", "Five"],
    };
    const result = checkDeckStandard(deck, DECK_STANDARD_V1);
    const hit = result.violations.find((v) => v.rule === "maxBulletsPerSlide");
    expect(hit).toBeDefined();
    expect(hit?.slideIndex).toBe(1);
  });

  it("titleMaxChars: flags a title over the char cap", () => {
    const deck = conformingDeck();
    deck.slides[2] = {
      ...deck.slides[2],
      title: "This Title Is Deliberately Far Too Long For A Single Slide Headline To Read Well",
    };
    const result = checkDeckStandard(deck, DECK_STANDARD_V1);
    const hit = result.violations.find((v) => v.rule === "titleMaxChars");
    expect(hit).toBeDefined();
    expect(hit?.slideIndex).toBe(2);
  });
});

// --- DS-CHECK mandatory removal sabotage -----------------------------------
//
// A leverage proof, not a copy of checkDeckStandard: each sabotaged checker
// below reimplements the same four-rule loop with exactly ONE rule's branch
// deleted. If checkDeckStandard's real implementation ever lost that branch,
// this suite would go red exactly the way these sabotaged versions do now -
// that is what "falsifiable here" means for this rule.

type SabotagedRule =
  | "requireTitleCase"
  | "titleSlideOnlyTitle"
  | "maxBulletsPerSlide"
  | "titleMaxChars";

function sabotagedCheckDeckStandard(
  deck: DeckStandardInput,
  standard: DeckStandard,
  omitRule: SabotagedRule
): StandardViolation[] {
  const violations: StandardViolation[] = [];

  deck.slides.forEach((slide, slideIndex) => {
    if (
      omitRule !== "requireTitleCase" &&
      standard.requireTitleCase &&
      !isTitleCase(slide.title)
    ) {
      violations.push({ slideIndex, rule: "requireTitleCase", detail: "title case" });
    }

    if (
      omitRule !== "titleSlideOnlyTitle" &&
      standard.titleSlideOnlyTitle &&
      slideIndex === 0 &&
      slide.bullets.length > 0
    ) {
      violations.push({ slideIndex, rule: "titleSlideOnlyTitle", detail: "title slide bullets" });
    }

    if (omitRule !== "maxBulletsPerSlide" && slide.bullets.length > standard.maxBulletsPerSlide) {
      violations.push({ slideIndex, rule: "maxBulletsPerSlide", detail: "bullet cap" });
    }

    if (omitRule !== "titleMaxChars" && slide.title.length > standard.titleMaxChars) {
      violations.push({ slideIndex, rule: "titleMaxChars", detail: "title length" });
    }
  });

  return violations;
}

describe("DS-CHECK: mandatory removal sabotage (one per rule)", () => {
  it("requireTitleCase: sabotaged checker misses it (RED), real checker catches it (GREEN)", () => {
    const deck = conformingDeck();
    deck.slides[1] = { ...deck.slides[1], title: "how a browser talks to a server" };

    const sabotaged = sabotagedCheckDeckStandard(deck, DECK_STANDARD_V1, "requireTitleCase");
    expect(sabotaged.some((v) => v.rule === "requireTitleCase")).toBe(false);

    const real = checkDeckStandard(deck, DECK_STANDARD_V1);
    expect(real.violations.some((v) => v.rule === "requireTitleCase")).toBe(true);
  });

  it("titleSlideOnlyTitle: sabotaged checker misses it (RED), real checker catches it (GREEN)", () => {
    const deck = conformingDeck();
    deck.slides[0] = { ...deck.slides[0], bullets: ["Should not be here"] };

    const sabotaged = sabotagedCheckDeckStandard(deck, DECK_STANDARD_V1, "titleSlideOnlyTitle");
    expect(sabotaged.some((v) => v.rule === "titleSlideOnlyTitle")).toBe(false);

    const real = checkDeckStandard(deck, DECK_STANDARD_V1);
    expect(real.violations.some((v) => v.rule === "titleSlideOnlyTitle")).toBe(true);
  });

  it("maxBulletsPerSlide: sabotaged checker misses it (RED), real checker catches it (GREEN)", () => {
    const deck = conformingDeck();
    deck.slides[1] = { ...deck.slides[1], bullets: ["One", "Two", "Three", "Four", "Five"] };

    const sabotaged = sabotagedCheckDeckStandard(deck, DECK_STANDARD_V1, "maxBulletsPerSlide");
    expect(sabotaged.some((v) => v.rule === "maxBulletsPerSlide")).toBe(false);

    const real = checkDeckStandard(deck, DECK_STANDARD_V1);
    expect(real.violations.some((v) => v.rule === "maxBulletsPerSlide")).toBe(true);
  });

  it("titleMaxChars: sabotaged checker misses it (RED), real checker catches it (GREEN)", () => {
    const deck = conformingDeck();
    deck.slides[2] = {
      ...deck.slides[2],
      title: "This Title Is Deliberately Far Too Long For A Single Slide Headline To Read Well",
    };

    const sabotaged = sabotagedCheckDeckStandard(deck, DECK_STANDARD_V1, "titleMaxChars");
    expect(sabotaged.some((v) => v.rule === "titleMaxChars")).toBe(false);

    const real = checkDeckStandard(deck, DECK_STANDARD_V1);
    expect(real.violations.some((v) => v.rule === "titleMaxChars")).toBe(true);
  });
});
