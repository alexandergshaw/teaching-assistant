// Parses the raw LLM text response for each presentations-authoring content
// artifact into its typed content shape (PRES-1, docs/pres-1-architecture.md
// section 6.4).

import { enforceTitleLength } from "@/lib/slide-prompt";
import { parseLenientJsonArray } from "@/lib/decks/generate";
import type { PptxSlide } from "@/lib/pptx";
import type { DeckContent } from "./types";

// Duplicated deliberately (docs/pres-1-architecture.md section 3, do-not-reuse
// list): sliceJsonObject is a private helper in src/lib/decks/generate.ts, not
// exported. Widening that file's API to export it would pull a shared file
// and its tests into this wave's write set for an ~8-line slicer. Recorded as
// residual R-A5.
function sliceJsonObject(text: string): string | null {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

interface RawDeckSlide {
  title?: unknown;
  bullets?: unknown;
  code?: unknown;
  codeLanguage?: unknown;
  notes?: unknown;
}

// Maps a raw parsed slide into the PptxSlide shape WITHOUT normalizing
// `bullets` into an array - a malformed (non-array) `bullets` value is
// preserved as-is so validateDeck's Array.isArray check (the real gate,
// docs/pres-1-architecture.md section 6.4 / W1-T5) inspects the actual
// runtime shape rather than a value this mapper has already sanitized.
function toRawPptxSlide(raw: RawDeckSlide): PptxSlide {
  const slide: PptxSlide = {
    title: typeof raw.title === "string" ? raw.title : "",
    bullets: raw.bullets as string[],
  };
  if (typeof raw.code === "string") slide.code = raw.code;
  if (typeof raw.codeLanguage === "string") slide.codeLanguage = raw.codeLanguage;
  if (typeof raw.notes === "string") slide.notes = raw.notes;
  return slide;
}

/**
 * Pre-flight gate (B2 / SRE 3b): returns the deck unchanged when every slide
 * has a non-empty trimmed title and an array `bullets`, and there is at least
 * one slide - otherwise returns null. This MUST run before
 * serializeDeckToPptx is ever called: buildSlidesPptx throws on non-array
 * bullets and silently ships a content-empty file on a zero-slide deck
 * (docs/pres-1-sre.md section 3.1).
 */
export function validateDeck(deck: DeckContent): DeckContent | null {
  if (!Array.isArray(deck.slides) || deck.slides.length === 0) return null;

  const allValid = deck.slides.every(
    (slide) =>
      typeof slide.title === "string" &&
      slide.title.trim() !== "" &&
      Array.isArray(slide.bullets)
  );

  return allValid ? deck : null;
}

/**
 * Slices the first JSON object out of the LLM's text response, maps it to
 * PptxSlide[], validates the result, and only THEN applies the shared
 * title-length guard (enforceTitleLength, src/lib/slide-prompt.ts). Returns
 * null on any parse or validation failure - the caller (generateOneArtifact)
 * turns a null here into a generation failure, never a raw builder crash and
 * never a silently-empty deck.
 *
 * validateDeck MUST run before enforceTitleLength, not after: enforceTitleLength
 * reads slide.bullets.length for a slide whose title exceeds the max, and
 * toRawPptxSlide deliberately does not normalize a malformed `bullets` value
 * (see its comment above) so validateDeck's Array.isArray check can reject it.
 * Running enforceTitleLength first meant a >60-char title paired with
 * missing/null bullets threw a TypeError before validateDeck ever ran,
 * turning the T|null "null-not-crash" contract into an unhandled rejection.
 */
export function parseDeckSlides(text: string): DeckContent | null {
  const jsonText = sliceJsonObject(text);
  if (!jsonText) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as { presentationTitle?: unknown; slides?: unknown };
  if (typeof obj.presentationTitle !== "string" || !Array.isArray(obj.slides)) return null;

  const slides: PptxSlide[] = obj.slides
    .filter((raw): raw is RawDeckSlide => typeof raw === "object" && raw !== null)
    .map(toRawPptxSlide);

  const rawDeck: DeckContent = { presentationTitle: obj.presentationTitle, slides };
  const validatedDeck = validateDeck(rawDeck);
  if (!validatedDeck) return null;

  const { slides: titledSlides } = enforceTitleLength(validatedDeck.slides);
  return { ...validatedDeck, slides: titledSlides };
}

/** Parses the activities artifact's LLM text response into a string list. */
export function parseActivities(text: string): string[] {
  return parseLenientJsonArray(text);
}
