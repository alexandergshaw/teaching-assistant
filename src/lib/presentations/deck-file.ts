// AC-6 DOWNLOADABLE serializer for the presentations-authoring feature
// (PRES-1, docs/pres-1-architecture.md section 6.5). Wraps the shipped
// buildSlidesPptx so the on-page preview and the .pptx download read the same
// PptxSlide[] and cannot diverge.

import { buildSlidesPptx } from "@/lib/pptx";
import type { GeneratedDeck } from "@/lib/decks/generate";

export const PRES_PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/**
 * Serializes a deck to a .pptx ArrayBuffer.
 *
 * Deliberately takes NO `theme` parameter (B2 / SRE 3.4): SRE measured that
 * buildSlidesPptx throws "Cannot read properties of undefined (reading
 * 'startsWith')" on a theme with backgroundKind:"solid" and no
 * backgroundColor (src/lib/pptx.ts:104-107). Omitting theme entirely lets the
 * standard navy/accent path run and avoids that crash mode by construction
 * rather than by validating a theme object.
 */
export function serializeDeckToPptx(deck: GeneratedDeck, author?: string): Promise<ArrayBuffer> {
  return buildSlidesPptx({
    presentationTitle: deck.presentationTitle,
    slides: deck.slides,
    author,
  });
}
