// The pure Deck Standard checker: DECK_STANDARD_V1 (the frozen default) and
// checkDeckStandard, which runs the four deck-decidable rules against a
// GeneratedDeck-shaped object and returns a deck-standard-owned CheckResult
// (provenance lives on the result, never on GeneratedDeck itself - B1).
//
// Scope (INFO-3): this checker does ONLY the four deterministic,
// deck-decidable rules below. It does not attempt the "one dominant claim"
// semantic judgment (that is an LLM checklist pass in a later wave) and it
// does not attempt prediction/answer separation (that is a later wave's
// SlidePlan structural invariant). Keep this file pure: no IO, no callLlm.

import type { DeckStandard, CheckResult, StandardViolation } from "./types";

/**
 * The minimal deck shape this checker needs. Deliberately structural
 * (rather than importing GeneratedDeck/PptxSlide) so this leaf has no
 * compile-time dependency on src/lib/decks or src/lib/pptx - any object
 * with this shape (including the real GeneratedDeck) can be checked.
 */
export interface DeckStandardInput {
  presentationTitle: string;
  slides: Array<{ title: string; bullets: string[] }>;
}

/**
 * The frozen default standard. `titleMaxChars` mirrors
 * SLIDE_TITLE_MAX_CHARS (src/lib/slide-prompt.ts:38) by value, not by
 * import, so this leaf stays self-contained; if that constant ever
 * changes, DECK_STANDARD_V1 is the place to update it deliberately along
 * with a version bump.
 */
export const DECK_STANDARD_V1: DeckStandard = {
  version: "deck-standard-v1",
  requireTitleCase: true,
  titleSlideOnlyTitle: true,
  maxBulletsPerSlide: 4,
  titleMaxChars: 60,
};

/**
 * Small words that stay lowercase in Title Case unless they open or close
 * the title: articles, coordinating conjunctions, and short (<= 3 letter)
 * prepositions. This is the standard "headline style" convention (the same
 * one style guides like AP/Chicago use, simplified to what a slide title
 * needs). Every other word must start with an uppercase letter.
 */
const SMALL_WORDS = new Set([
  "a", "an", "the",
  "and", "but", "or", "nor",
  "as", "at", "by", "for", "in", "of", "on", "per", "to", "up", "via",
]);

/**
 * Whether `title` conforms to Title Case: the first and last word are
 * always capitalized; every other word is capitalized UNLESS it is one of
 * SMALL_WORDS, in which case it must stay lowercase. Words with no letters
 * (pure numbers/punctuation) never violate the rule. Leading punctuation
 * inside a word (e.g. an opening quote) is skipped to find the letter that
 * actually needs checking.
 */
export function isTitleCase(title: string): boolean {
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  return words.every((word, i) => {
    const letterMatch = word.match(/[A-Za-z]/);
    if (!letterMatch) return true;

    const firstLetter = letterMatch[0];
    const bareWord = word.replace(/[^A-Za-z]/g, "").toLowerCase();
    const isEdge = i === 0 || i === words.length - 1;
    const isSmall = SMALL_WORDS.has(bareWord);

    if (isEdge || !isSmall) {
      return firstLetter === firstLetter.toUpperCase();
    }
    return firstLetter === firstLetter.toLowerCase();
  });
}

/**
 * Run the four deck-decidable rules against `deck` under `standard`,
 * returning an itemized receipt. Pure: no IO, no model calls. Provenance
 * (which standard ran) is carried on the returned CheckResult, never
 * written back onto the deck.
 */
export function checkDeckStandard(
  deck: DeckStandardInput,
  standard: DeckStandard
): CheckResult {
  const violations: StandardViolation[] = [];

  deck.slides.forEach((slide, slideIndex) => {
    if (standard.requireTitleCase && !isTitleCase(slide.title)) {
      violations.push({
        slideIndex,
        rule: "requireTitleCase",
        detail: `Title "${slide.title}" is not Title Case.`,
      });
    }

    if (standard.titleSlideOnlyTitle && slideIndex === 0 && slide.bullets.length > 0) {
      violations.push({
        slideIndex,
        rule: "titleSlideOnlyTitle",
        detail: `Title slide carries ${slide.bullets.length} bullet(s); it must carry only the title.`,
      });
    }

    if (slide.bullets.length > standard.maxBulletsPerSlide) {
      violations.push({
        slideIndex,
        rule: "maxBulletsPerSlide",
        detail: `Slide has ${slide.bullets.length} bullets, exceeding the cap of ${standard.maxBulletsPerSlide}.`,
      });
    }

    if (slide.title.length > standard.titleMaxChars) {
      violations.push({
        slideIndex,
        rule: "titleMaxChars",
        detail: `Title is ${slide.title.length} characters, exceeding the cap of ${standard.titleMaxChars}.`,
      });
    }
  });

  return { standardVersion: standard.version, violations };
}
