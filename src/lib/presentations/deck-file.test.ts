import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serializeDeckToPptx } from "./deck-file";
import type { GeneratedDeck } from "@/lib/decks/generate";

// W1-T6: the .pptx serializer returns a non-empty buffer for a non-empty deck
// (AC-6 DOWNLOADABLE, MACHINE). Necessary-not-sufficient: byteLength > 0 does
// NOT prove the deck has content (an empty deck also yields bytes) - the
// content guarantee is validateDeck's upstream refusal (parse.test.ts), not
// this byte count.
describe("serializeDeckToPptx", () => {
  it("returns a non-empty ArrayBuffer for a non-empty deck", async () => {
    const deck: GeneratedDeck = {
      presentationTitle: "A Deck",
      slides: [{ title: "Slide One", bullets: ["b1", "b2"] }],
    };
    const buffer = await serializeDeckToPptx(deck);
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});

// No-theme construction (B2 / SRE 3.4): serializeDeckToPptx's signature and
// its buildSlidesPptx call pass no `theme` argument, avoiding the crash mode
// SRE measured on a theme with backgroundKind:"solid" and no backgroundColor.
describe("no-theme construction", () => {
  it("serializeDeckToPptx passes no theme argument to buildSlidesPptx", () => {
    const source = readFileSync(join(__dirname, "deck-file.ts"), "utf8");
    const signatureMatch = source.match(/export function serializeDeckToPptx\(([^)]*)\)/);
    expect(signatureMatch?.[1]).not.toMatch(/theme/);

    const callMatch = source.match(/buildSlidesPptx\(\{([^]*?)\}\);/);
    expect(callMatch?.[1]).not.toMatch(/theme\s*:/);
  });
});
