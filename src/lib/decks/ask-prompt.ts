/**
 * Builds the prompt for the conversational deck-ask model call
 * (docs/a43-c-scope.md sections 6, 9). Pure - no callLlm here. States the
 * closed operation vocabulary and the refuse-with-category contract to the
 * model, and shows the model the deck CONTENT only (title/bullets/code per
 * slide) - never the uploaded template, never a placement/layout handle
 * (C-TEMPLATE-BLIND).
 */

import type { PptxSlide } from "@/lib/pptx";

/** The content-only view of a slide the model is shown - matches SlideContent. */
function slideSummary(slide: PptxSlide, index: number): string {
  const lines = [`Slide ${index}: "${slide.title}"`, ...slide.bullets.map((b) => `  - ${b}`)];
  if (slide.code) {
    lines.push(`  (code block, language: ${slide.codeLanguage ?? "unspecified"})`);
    lines.push(slide.code);
  }
  return lines.join("\n");
}

/**
 * Builds the ask prompt from the instructor's instruction and the current
 * deck. Names every operation in the closed vocabulary
 * (reword/expand/condense/retitle/retarget/reorder/drop) and the refuse
 * categories (add-slide/layout/delete-slide/other), and tells the model to
 * emit exactly one JSON operation object, never layout, never the template.
 */
export function buildAskPrompt(instruction: string, slides: PptxSlide[]): string {
  const deckSummary = slides.map((slide, i) => slideSummary(slide, i)).join("\n\n");

  return `You are editing an existing slide deck on behalf of an instructor. The instructor will describe, in plain language, one change they want made. You must respond with exactly one JSON object describing a single operation from this closed set - no other operation exists:

- reword: { "op": "reword", "slideIndex": number, "content": { "title": string, "bullets": string[], "code"?: string, "codeLanguage"?: string } }
- expand: { "op": "expand", "slideIndex": number, "content": { "title": string, "bullets": string[], "code"?: string, "codeLanguage"?: string } }
- condense: { "op": "condense", "slideIndex": number, "content": { "title": string, "bullets": string[], "code"?: string, "codeLanguage"?: string } }
- retitle: { "op": "retitle", "slideIndex": number, "title": string }
- retarget: { "op": "retarget", "slides": [ { "title": string, "bullets": string[], "code"?: string, "codeLanguage"?: string }, ... ] } (must include EXACTLY one entry per existing slide, in order)
- reorder: { "op": "reorder", "order": number[] } (a permutation of the existing slide indexes)
- drop: { "op": "drop", "slideIndex": number }

You may NEVER add a slide, NEVER remove a slide, and NEVER change layout, placement, formatting, colors, fonts, or anything about the uploaded template - only the slide's title, bullets, and code content. If the instructor asks for something outside this set, respond instead with:

- refuse: { "op": "refuse", "category": "add-slide" | "layout" | "delete-slide" | "other", "note"?: string }

Use "add-slide" when asked to add a slide, "layout" when asked to change layout/placement/formatting/design, "delete-slide" when asked to remove a slide (offer "drop" instead in your note), and "other" for anything else outside this set.

slideIndex is zero-based. Respond with ONLY the JSON object, no other text.

Current deck (content only - slide count is fixed at ${slides.length} and must not change):

${deckSummary}

Instructor's request: ${instruction}`;
}
