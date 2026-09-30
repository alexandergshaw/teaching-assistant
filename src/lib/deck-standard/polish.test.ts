import { describe, expect, it } from "vitest";
import { polishDeck, type PolishDeckInput } from "./polish";

/**
 * Builds a deliberately messy fixture: repeated whitespace, a badge prefix
 * in a non-canonical form, a back-to-back duplicated slide title, and
 * out-of-order "Section <n>:" dividers - one of every normalization
 * polishDeck implements.
 */
function messyDeck(): PolishDeckInput {
  return {
    presentationTitle: "  Intro   to   Loops  ",
    slides: [
      { title: "Section 1:  Getting Started", bullets: ["  Welcome   class  "], notes: "  Say hello.  " },
      { title: "Section 1:  Getting Started", bullets: ["  Welcome   class  "], notes: "  Say hello.  " },
      { title: "practice - Write a loop", bullets: ["Use a for loop", "Print each item"] },
      { title: "Section 5: Wrap-Up", bullets: ["Recap"] },
    ],
  };
}

/** A deck already in the canonical form polishDeck produces. */
function cleanDeck(): PolishDeckInput {
  return {
    presentationTitle: "Intro to Loops",
    slides: [
      { title: "Section 1: Getting Started", bullets: ["Welcome class"], notes: "Say hello." },
      { title: "Practice: Write a loop", bullets: ["Use a for loop", "Print each item"] },
      { title: "Section 2: Wrap-Up", bullets: ["Recap"] },
    ],
  };
}

describe("polishDeck", () => {
  it("is idempotent: a second pass over its own output makes no further changes", () => {
    const once = polishDeck(messyDeck());
    const twice = polishDeck(once.deck);

    expect(twice.changes).toEqual([]);
    expect(twice.deck).toEqual(once.deck);
  });

  it("is a no-op on an already-clean deck", () => {
    const input = cleanDeck();
    const result = polishDeck(input);

    expect(result.changes).toEqual([]);
    expect(result.deck).toEqual(input);
  });

  it("dedupes a slide whose title exactly repeats the preceding slide's title", () => {
    const result = polishDeck(messyDeck());

    const titles = result.deck.slides.map((s) => s.title);
    const gettingStartedCount = titles.filter((t) => t === "Section 1: Getting Started").length;
    expect(gettingStartedCount).toBe(1);
    expect(result.changes.some((c) => c.kind === "dedupe-label")).toBe(true);
  });

  it("SABOTAGE: a pass that skips dedupe leaves the duplicate slide behind (must be RED against the fixture)", () => {
    // A stand-in for a broken polishDeck that forgets step 3 (dedupe):
    // whitespace + badge normalization only, no dedupe pass. This proves
    // the dedupe assertion above is non-vacuous - it fails without dedupe.
    function polishWithoutDedupe(deck: PolishDeckInput): PolishDeckInput {
      return {
        presentationTitle: deck.presentationTitle.replace(/\s+/g, " ").trim(),
        slides: deck.slides.map((s) => ({
          ...s,
          title: s.title.replace(/\s+/g, " ").trim(),
        })),
      };
    }

    const broken = polishWithoutDedupe(messyDeck());
    const titles = broken.slides.map((s) => s.title);
    const gettingStartedCount = titles.filter((t) => t === "Section 1: Getting Started").length;

    // The sabotage keeps both copies - proving the real assertion is load-bearing.
    expect(gettingStartedCount).toBe(2);
  });

  it("normalizes whitespace: trims and collapses internal runs in title, bullets, and notes", () => {
    const result = polishDeck(messyDeck());

    expect(result.deck.presentationTitle).toBe("Intro to Loops");
    const welcomeSlide = result.deck.slides.find((s) => s.bullets.includes("Welcome class"));
    expect(welcomeSlide).toBeDefined();
    expect(welcomeSlide?.notes).toBe("Say hello.");
    expect(result.changes.some((c) => c.kind === "normalize-spacing")).toBe(true);
  });

  it("normalizes an activity badge to its canonical prefix", () => {
    const result = polishDeck(messyDeck());

    const practiceSlide = result.deck.slides.find((s) => s.title.startsWith("Practice:"));
    expect(practiceSlide?.title).toBe("Practice: Write a loop");
    expect(result.changes.some((c) => c.kind === "normalize-badge")).toBe(true);
  });

  it("renumbers Section dividers contiguously in order of appearance", () => {
    const result = polishDeck(messyDeck());

    const sectionTitles = result.deck.slides
      .map((s) => s.title)
      .filter((t) => /^Section \d+:/.test(t));
    expect(sectionTitles).toEqual(["Section 1: Getting Started", "Section 2: Wrap-Up"]);
    expect(result.changes.some((c) => c.kind === "renumber-section")).toBe(true);
  });

  it("does not mutate the input deck", () => {
    const input = messyDeck();
    const snapshot = JSON.parse(JSON.stringify(input));

    polishDeck(input);

    expect(input).toEqual(snapshot);
  });

  describe("non-lossy: preserves passthrough fields polish does not normalize (S6.2 fix)", () => {
    /**
     * A slide carrying the real PptxSlide optionals (code/codeLanguage/graphic)
     * plus a title needing whitespace normalization, so any drop is
     * attributable to the rebuild rather than an untouched field.
     */
    function deckWithPassthrough(): PolishDeckInput {
      return {
        presentationTitle: "Loops",
        slides: [
          {
            title: "  Recursion   Basics  ",
            bullets: ["Base case", "Recursive case"],
            notes: "Explain the stack.",
            code: "def f(n):\n    return n",
            codeLanguage: "python",
            graphic: { kind: "diagram", nodes: [{ id: "a", label: "call" }] },
          },
        ],
      };
    }

    it("RED (pre-fix rebuild): a rebuild that lists only {title, bullets, notes} drops code/codeLanguage/graphic", () => {
      // Stand-in for the pre-fix per-slide rebuild at polish.ts:166-168,
      // which listed only the three fields it knew about instead of
      // spreading the original slide.
      const input = deckWithPassthrough();
      const slide = input.slides[0];
      const preFixRebuild: PolishDeckInput["slides"][number] = {
        title: slide.title.trim(),
        bullets: slide.bullets,
        notes: slide.notes,
      };

      const untyped = preFixRebuild as unknown as Record<string, unknown>;
      expect(untyped.code).toBeUndefined();
      expect(untyped.codeLanguage).toBeUndefined();
      expect(untyped.graphic).toBeUndefined();
    });

    it("GREEN (post-fix): polishDeck preserves code/codeLanguage/graphic byte-identical while still normalizing the title", () => {
      const input = deckWithPassthrough();
      const result = polishDeck(input);
      const outSlide = result.deck.slides[0];

      expect(outSlide.title).toBe("Recursion Basics");
      expect(outSlide.code).toBe(input.slides[0].code);
      expect(outSlide.codeLanguage).toBe(input.slides[0].codeLanguage);
      expect(outSlide.graphic).toEqual(input.slides[0].graphic);
    });

    it("is idempotent on a deck containing code/graphic slides", () => {
      const once = polishDeck(deckWithPassthrough());
      const twice = polishDeck(once.deck);

      expect(twice.changes).toEqual([]);
      expect(twice.deck).toEqual(once.deck);
    });
  });

  describe("badge canonicalization requires a real separator (B1 fix)", () => {
    /**
     * Builds a single-slide deck with the given title, otherwise clean, so
     * any change in the result is attributable to badge handling.
     */
    function titleDeck(title: string): PolishDeckInput {
      return { presentationTitle: "Test Deck", slides: [{ title, bullets: ["A bullet"] }] };
    }

    const nonBadgeTitles = [
      "Practice makes perfect",
      "Example usage of the API",
      "Answer key for homework",
      "Answering questions",
      "Practice",
    ];

    it.each(nonBadgeTitles)(
      "leaves a title merely starting with a badge word unchanged: %s",
      (title) => {
        const result = polishDeck(titleDeck(title));

        expect(result.deck.slides[0].title).toBe(title);
        expect(result.changes.some((c) => c.kind === "normalize-badge")).toBe(false);
      },
    );

    it("RED-then-GREEN: the pre-fix optional-separator regex corrupts 'Practice makes perfect'", () => {
      // A stand-in for the pre-fix rule (trailing separator optional, no
      // word boundary) - this is exactly BADGE_RULES' old "practice" entry.
      const preFixPracticeRule = /^practice\s*[:\-]?\s*/i;
      const title = "Practice makes perfect";
      const match = title.match(preFixPracticeRule);
      expect(match).not.toBeNull();
      const corrupted = `Practice: ${title.slice(match![0].length)}`;
      // Pre-fix behavior actually corrupts the title (RED against the fix).
      expect(corrupted).toBe("Practice: makes perfect");

      // Post-fix, the real polishDeck leaves it alone (GREEN).
      const result = polishDeck(titleDeck(title));
      expect(result.deck.slides[0].title).toBe("Practice makes perfect");
    });

    it("still canonicalizes a dash-separated badge", () => {
      const result = polishDeck(titleDeck("practice - Write a loop"));

      expect(result.deck.slides[0].title).toBe("Practice: Write a loop");
      expect(result.changes.some((c) => c.kind === "normalize-badge")).toBe(true);
    });

    it("still canonicalizes a colon-separated badge in any casing", () => {
      const result = polishDeck(titleDeck("PRACTICE:bar"));

      expect(result.deck.slides[0].title).toBe("Practice: bar");
      expect(result.changes.some((c) => c.kind === "normalize-badge")).toBe(true);
    });

    it("still canonicalizes the other badge words with a colon separator", () => {
      expect(polishDeck(titleDeck("example: usage")).deck.slides[0].title).toBe("Example: usage");
      expect(polishDeck(titleDeck("answer: key")).deck.slides[0].title).toBe("Answer: key");
      expect(polishDeck(titleDeck("your turn: try it")).deck.slides[0].title).toBe(
        "Your Turn: try it",
      );
      expect(polishDeck(titleDeck("walkthrough: steps")).deck.slides[0].title).toBe(
        "Walkthrough: steps",
      );
      expect(polishDeck(titleDeck("post-lecture practice: hw")).deck.slides[0].title).toBe(
        "Post-Lecture Practice: hw",
      );
    });
  });
});
