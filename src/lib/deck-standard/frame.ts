// The Pinned Frame: the owner's ONE mental model + ONE running example as
// first-class, editable state (docs/pres-2-scope.md section 2.2, stages
// 3/4). This leaf holds two pure pieces:
//
//   1. buildFrameFoldLines - the fold helper that turns a PinnedFrame into
//      separately-deletable prompt lines, matching the idiom in
//      buildRegeneratePrompt (src/lib/presentations/prompts.ts:76-92): each
//      field becomes its own line, filtered out when the field is empty, so
//      a caller can compose them into a generation prompt by code. Presence
//      in the prompt is then guaranteed by construction (FRAME-FOLD).
//   2. frameConsistencyReceipt - a pure textual-mention counter that flags
//      drift (slides that mention neither the mental model's steps nor the
//      running example's name). "Genuinely on-model" is a semantic claim
//      with no instrument here (RES-PRES2-5); this receipt only measures
//      textual presence, which is honest about what it can prove
//      (docs/pres-2-scope.md section 2.2).
//
// Kept surface-independent: no import from src/lib/presentations,
// src/lib/decks, src/lib/pptx, or src/lib/deck-standard's own standard.ts.
// No wiring into any existing prompt builder here - that is S6/surface,
// gated on fork F1 (docs/pres-2-scope.md section 8). Pure: no IO, no
// callLlm.

/**
 * The Pinned Frame: one reused mental model plus one running example,
 * threaded into every slide prompt by code. Field names and shapes match
 * docs/pres-2-scope.md section 2.2 exactly.
 */
export interface PinnedFrame {
  mentalModel: { name: string; steps: string[] };
  runningExample: { name: string; description: string };
}

/**
 * The minimal deck shape frameConsistencyReceipt needs: structural
 * (title/bullets/notes text), not an import of GeneratedDeck/PptxSlide, so
 * this leaf stays shared-type independent - mirroring how standard.ts's
 * DeckStandardInput avoids importing the real deck types.
 */
export interface FrameDeckInput {
  slides: Array<{ title: string; bullets: string[]; notes?: string }>;
}

/** One slide's textual-mention count against the pinned frame. */
export interface FrameMentionCount {
  slideIndex: number;
  mentions: number;
}

/**
 * Build the Frame's prompt lines, one per field, each independently
 * deletable and omitted when its field is empty - the same fold idiom as
 * buildRegeneratePrompt's contextLine/critiqueLine
 * (src/lib/presentations/prompts.ts:76-92). The caller joins the returned
 * lines into its own prompt (e.g. `[...otherLines, ...buildFrameFoldLines(frame)].filter(Boolean).join("\n")`);
 * this function does not compose a full prompt itself, since wiring into an
 * existing builder is out of scope for this wave.
 */
export function buildFrameFoldLines(frame: PinnedFrame | undefined | null): string[] {
  if (!frame) return [];

  const mentalModelLine =
    frame.mentalModel && frame.mentalModel.name && frame.mentalModel.steps.length > 0
      ? `Reused mental model - ${frame.mentalModel.name}: ${frame.mentalModel.steps.join(" -> ")}`
      : "";

  const runningExampleLine =
    frame.runningExample && frame.runningExample.name
      ? `Running example - ${frame.runningExample.name}: ${frame.runningExample.description}`
      : "";

  return [mentalModelLine, runningExampleLine].filter((line) => line.length > 0);
}

/**
 * Case-insensitive containment check used to count a mention. Kept as a
 * named helper so the drift definition ("textual presence") is stated once.
 */
function textContainsCaseInsensitive(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Per-slide textual-mention count of the pinned frame: how many of
 * mentalModel.steps plus the runningExample.name appear (case-insensitive
 * containment) anywhere in that slide's title, bullets, or notes. Drift is
 * the caller's own interpretation of mentions === 0 (an itemized, opt-in
 * finding per docs/pres-2-scope.md section 2.2 - "a title slide legitimately
 * mentions neither" is not a hard failure). Pure: no IO, no callLlm.
 */
export function frameConsistencyReceipt(
  deck: FrameDeckInput,
  frame: PinnedFrame
): FrameMentionCount[] {
  const needles: string[] = [
    ...(frame.mentalModel?.steps ?? []),
    ...(frame.runningExample?.name ? [frame.runningExample.name] : []),
  ].filter((needle) => needle.length > 0);

  return deck.slides.map((slide, slideIndex) => {
    const slideText = [slide.title, ...slide.bullets, slide.notes ?? ""].join("\n");
    const mentions = needles.reduce(
      (count, needle) => count + (textContainsCaseInsensitive(slideText, needle) ? 1 : 0),
      0
    );
    return { slideIndex, mentions };
  });
}
