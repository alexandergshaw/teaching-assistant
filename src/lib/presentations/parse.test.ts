import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateDeck, parseActivities } from "./parse";
import type { DeckContent } from "./types";

const VALID_DECK: DeckContent = {
  presentationTitle: "Deck",
  slides: [{ title: "Slide One", bullets: ["b1", "b2"] }],
};

// W1-T5 (pure half): validateDeck rejects empty slides, blank/whitespace
// titles, and non-array bullets BEFORE buildSlidesPptx ever sees them
// (SRE 3b / B2). buildSlidesPptx crashes on non-array bullets and silently
// ships a content-empty file on a zero-slide deck - both must be caught here.
describe("validateDeck", () => {
  it("returns null for a zero-slide deck", () => {
    expect(validateDeck({ presentationTitle: "X", slides: [] })).toBeNull();
  });

  it("returns null for a slide with a blank/whitespace title", () => {
    const deck: DeckContent = {
      presentationTitle: "X",
      slides: [{ title: "   ", bullets: ["b1"] }],
    };
    expect(validateDeck(deck)).toBeNull();
  });

  it("returns null for a slide whose bullets is not an array", () => {
    const deck = {
      presentationTitle: "X",
      slides: [{ title: "S1", bullets: "not an array" as unknown as string[] }],
    } as DeckContent;
    expect(validateDeck(deck)).toBeNull();
  });

  it("returns the deck unchanged for a valid non-empty deck", () => {
    expect(validateDeck(VALID_DECK)).toEqual(VALID_DECK);
  });

  // B1 regression: a title over SLIDE_TITLE_MAX_CHARS (60) combined with
  // missing/null bullets must be rejected here, PURELY, without ever
  // reaching enforceTitleLength (src/lib/slide-prompt.ts), which reads
  // slide.bullets.length and throws a TypeError on undefined/null bullets.
  it("returns null for a slide with a >60-char title and missing bullets", () => {
    const deck = {
      presentationTitle: "X",
      slides: [{ title: "T".repeat(61), bullets: undefined as unknown as string[] }],
    } as DeckContent;
    expect(validateDeck(deck)).toBeNull();
  });

  it("returns null for a slide with a >60-char title and null bullets", () => {
    const deck = {
      presentationTitle: "X",
      slides: [{ title: "T".repeat(61), bullets: null as unknown as string[] }],
    } as DeckContent;
    expect(validateDeck(deck)).toBeNull();
  });
});

describe("parseActivities", () => {
  it("parses a JSON array of strings", () => {
    expect(parseActivities('["Idea one", "Idea two"]')).toEqual(["Idea one", "Idea two"]);
  });
});

// W1-T8: the deck uses ONE slide model (PptxSlide), imported not redeclared.
describe("one-slide-model (data pass 1.3)", () => {
  const dir = join(__dirname);
  const files = readdirSync(dir).filter(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts")
  );

  it("types.ts imports PptxSlide from @/lib/pptx and DeckContent from GeneratedDeck", () => {
    const typesSource = readFileSync(join(dir, "types.ts"), "utf8");
    expect(typesSource).toMatch(/import type \{ PptxSlide \} from "@\/lib\/pptx"/);
    expect(typesSource).toMatch(/import type \{ GeneratedDeck \} from "@\/lib\/decks\/generate"/);
  });

  it("no file under src/lib/presentations declares a local slide-shaped interface", () => {
    // A duplicate slide model is one whose fields are TYPED like PptxSlide
    // (title: string, bullets: string[]) - not a raw/untyped intermediate
    // shape used only to inspect untrusted JSON before validateDeck runs.
    const interfaceBlockPattern = /interface\s+\w+\s*\{([^}]*)\}/g;
    for (const file of files) {
      const source = readFileSync(join(dir, file), "utf8");
      let match: RegExpExecArray | null;
      while ((match = interfaceBlockPattern.exec(source)) !== null) {
        const body = match[1];
        const hasTypedTitle = /title\s*\??:\s*string\b/.test(body);
        const hasTypedBullets = /bullets\s*\??:\s*string\[\]/.test(body);
        expect(hasTypedTitle && hasTypedBullets).toBe(false);
      }
    }
  });

  it("no file under src/lib/presentations imports SlideData or lms-generation/deck", () => {
    for (const file of files) {
      const source = readFileSync(join(dir, file), "utf8");
      expect(source).not.toMatch(/from ["']@\/app\/actions-types["']/);
      expect(source).not.toMatch(/lms-generation\/deck/);
    }
  });
});
