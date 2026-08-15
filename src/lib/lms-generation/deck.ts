// Deck-specific pure helpers for LMS-selection-driven generation (chunk 3a:
// "decks" as a third generation kind - see kinds.ts's own header comment for
// the registry these plug into). A SIBLING to kinds.ts rather than grown
// into it: these two concerns - deciding WHICH deck_templates row to
// generate with, and building the DeckGenContext generateDeckFromTemplate
// (src/lib/decks/generate.ts) needs from what this feature actually has
// (a resolved template, a label, and gathered materials text) - are specific
// to the deck kind alone, unlike kinds.ts's render/renderStructured mapping,
// which sits in the same shape as every other kind's config.
//
// Pure, no I/O. The impure halves live in the two callers:
//   - src/app/api/lms-generation/deck/route.ts (generation): resolves the
//     course row, gathers materials, looks the template up
//     (getDeckTemplateAction) and calls generateDeckFromTemplateAction - a
//     Route Handler rather than a Server Action because that call chain can
//     run several sequential LLM requests (see that file's own header
//     comment on why).
//   - refineGeneratedArtifactAction's deck branch (src/app/actions/
//     lms-generation.ts): recovers the slides being refined from a saved
//     version's `structured` column via parseDeckSlidesFromStructured below.
//
// Type imports only (DeckTemplate/DeckGenContext/SlideData/GeneratedArtifact
// are all erased at compile time), so importing them here adds no runtime
// coupling to Supabase, "@/app/actions", or pptxgenjs - this file stays
// directly unit-testable with in-memory fixtures, no vi.mock.
import type { DeckTemplate } from "@/lib/decks/types";
import type { DeckGenContext } from "@/lib/decks/generate";
import type { SlideData } from "@/app/actions-types";
import type { GeneratedArtifact } from "@/lib/supabase/generated-artifacts";
import type { SelectedMaterialItem } from "@/lib/lms-generation/materials";
import type { LlmProvider } from "@/lib/llm";

export type DeckTemplateResolution = { ok: true; templateId: string } | { ok: false; reason: string };

/**
 * Whether an instructor-supplied template id is even worth looking up. The
 * REAL lookup (does a deck_templates row or a DECK_PRESETS entry actually
 * match this id) is getDeckTemplateAction's job (src/app/actions/media.ts) -
 * impure (a database read plus the built-in preset pool) - and it already
 * returns its own named reason ('No deck template matches "...".') when
 * nothing matches. This function catches the cheaper, more common refusal
 * first: nothing was picked at all (a blank/unselected dropdown value, or a
 * caller that omitted the field entirely). Both refusals are named and BOTH
 * happen before any generation call - see the Route Handler's own ordering.
 */
export function resolveDeckTemplateSelection(templateId: string | null | undefined): DeckTemplateResolution {
  const trimmed = (templateId ?? "").trim();
  if (!trimmed) {
    return { ok: false, reason: "Pick a template before generating a deck." };
  }
  return { ok: true, templateId: trimmed };
}

/**
 * The DeckGenContext generateDeckFromTemplate needs, built from what this
 * kind actually has: a resolved template, a subject (the same moduleLabel
 * every other kind's prompt already folds in - see kinds.ts's
 * GenerationPromptMeta), and the gathered selection materials text.
 *
 * Deliberately NO separate "concepts" input: SCOPE forbids adding a dialog,
 * and the two existing kinds already ground purely on materials text with no
 * concept extraction of their own - decks follow the same rule rather than
 * growing a third input surface. A template's LITERAL loop groups (concepts
 * the template author baked in) still supply their own items unconditionally
 * (mirrors generate-presentation-from-template's own handling in
 * steps.media.ts); every other loop group gets NO loop items, which
 * expandTemplate (src/lib/decks/types.ts) already handles by emitting that
 * block once with no per-item substitution - the materials text alone
 * grounds the model for it.
 */
export function buildDeckGenContext(template: DeckTemplate, subject: string, materialsText: string): DeckGenContext {
  const loopItems: Record<string, string[]> = {};
  for (const group of template.loops) {
    loopItems[group.id] = group.source === "literal" ? group.items : [];
  }
  return {
    subject,
    audience: template.audience || undefined,
    tone: template.tone || undefined,
    materials: materialsText || undefined,
    loopItems,
  };
}

/**
 * Recover a deck's slide array from a generated_artifacts row's `structured`
 * column, for refine (refineGeneratedArtifactAction's deck branch,
 * src/app/actions/lms-generation.ts). Defensive rather than trusting:
 * `structured` is a generic nullable jsonb column with no shape guarantee at
 * the database level (entry 261 check 11) - anything other than a real array
 * of slide-shaped objects (null, a stale/foreign shape, a row saved before
 * this kind existed) resolves to an empty deck rather than throwing, and the
 * caller treats an empty result as "nothing to refine" the same way it
 * already treats zero questions/topics for the other two kinds.
 */
export function parseDeckSlidesFromStructured(structured: unknown): SlideData[] {
  if (!Array.isArray(structured)) return [];
  return structured.filter(
    (s): s is SlideData =>
      !!s && typeof s === "object" && typeof (s as SlideData).title === "string" && Array.isArray((s as SlideData).bullets)
  );
}

/**
 * Result of merging a deck refine's output back over the version it refined
 * - see mergeRefinedDeckSlides' own doc comment.
 */
export interface DeckSlideMergeResult {
  /** `newSlides`, in the SAME order and count reviseLectureSlidesAction
   * returned, each augmented with `notes`/`graphic` recovered from a
   * confidently-matched slide in `oldSlides` where the refined slide itself
   * did not already carry one. */
  slides: SlideData[];
  /** One human-readable line per OLD slide that carried `notes` and/or
   * `graphic` but could not be confidently matched to any slide in the
   * refined deck, so that content is now gone rather than silently vanished
   * - see this function's own doc comment for what "confidently" means.
   * Empty when nothing was lost. */
  droppedFields: string[];
}

/**
 * Merge a deck refine's output back over the slides it refined, so a field
 * reviseLectureSlidesAction's own LLM contract never asks the model to
 * return - `notes` and `graphic` - is preserved instead of silently dropped
 * on every refine pass (see this file's header comment and
 * refineGeneratedArtifactAction's deck branch, src/app/actions/
 * lms-generation.ts, for the full story). `title`, `bullets`, `code` and
 * `codeLanguage` are NEVER pulled from `oldSlides`: those four ARE in the
 * model's contract, so whatever it returned (including nothing, e.g. a
 * dropped `code`) is the refinement and must stand - this function only ever
 * ADDS `notes`/`graphic`, never touches the other four fields.
 *
 * MATCHING, in two passes, because index alone is wrong the moment a refine
 * adds, removes or reorders a slide (see this function's own callers'
 * comments), and because a refine that only renames a slide (changes its
 * title) is just as real a case as one that reorders:
 *
 * 1. UNIQUE TITLE (order-independent): a new slide whose title occurs
 *    EXACTLY ONCE in `oldSlides` AND exactly once in `newSlides` is matched
 *    to that old slide, wherever either one now sits. This is what makes a
 *    pure reorder safe: reordering alone leaves every title unchanged and
 *    still unique, so this pass alone resolves it - no slide's notes can
 *    drift onto a same-position-but-different slide the way plain index
 *    matching would. A title that repeats (in either array) is left for pass
 *    2 rather than guessed at, since "which of the two same-titled slides"
 *    is not answerable from title alone.
 * 2. LEFTOVER PAIRING (only when nothing was added or removed): whatever is
 *    left unmatched after pass 1 is paired up in RELATIVE order - the first
 *    unmatched new slide with the first unmatched old slide, and so on - but
 *    ONLY when the two leftover lists are the same length. That length
 *    equality is exactly equivalent to `oldSlides.length === newSlides.length`
 *    (pass 1 always consumes one old slide per matched new slide, so the
 *    leftover counts differ by precisely `newSlides.length - oldSlides.length`)
 *    - i.e. this pass only ever fires when the refine did not change the
 *    deck's slide COUNT, which is the ordinary case for "reword this slide"
 *    / "shorten slide 2"-style instructions. This is what makes a same-slot
 *    rename (a slide's title AND bullets both change, but it is still "the
 *    same slide") survive even though pass 1 cannot match it by title.
 *
 * A slide left unmatched after both passes - a genuinely new slide (pass 2
 * skipped because the count changed), or one whose old counterpart cannot be
 * told apart from a same-titled sibling - gets NO notes/graphic merged in;
 * see `droppedFields` for the explicit record of what was lost, rather than
 * a slide fabricating notes it never had (the "adds a slide" case) or a
 * removed slide's notes reappearing on an unrelated one.
 */
export function mergeRefinedDeckSlides(oldSlides: SlideData[], newSlides: SlideData[]): DeckSlideMergeResult {
  const titleCounts = (slides: SlideData[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const s of slides) counts.set(s.title, (counts.get(s.title) ?? 0) + 1);
    return counts;
  };
  const oldTitleCounts = titleCounts(oldSlides);
  const newTitleCounts = titleCounts(newSlides);

  // newIndex -> oldIndex, for slides matched confidently by either pass.
  const newToOld = new Map<number, number>();
  const claimedOld = new Set<number>();

  // Pass 1: unique title, in either array - order-independent, so a pure
  // reorder is fully resolved here regardless of where each slide moved to.
  newSlides.forEach((slide, newIndex) => {
    if (oldTitleCounts.get(slide.title) !== 1 || newTitleCounts.get(slide.title) !== 1) return;
    const oldIndex = oldSlides.findIndex((s) => s.title === slide.title);
    if (oldIndex === -1) return;
    newToOld.set(newIndex, oldIndex);
    claimedOld.add(oldIndex);
  });

  // Pass 2: pair the leftovers in relative order, only when the deck's slide
  // count did not change (see this function's own doc comment for why the
  // leftover-length check below is exactly that condition).
  const leftoverNew = newSlides.map((_, i) => i).filter((i) => !newToOld.has(i));
  const leftoverOld = oldSlides.map((_, i) => i).filter((i) => !claimedOld.has(i));
  if (leftoverNew.length === leftoverOld.length) {
    leftoverNew.forEach((newIndex, k) => {
      newToOld.set(newIndex, leftoverOld[k]);
      claimedOld.add(leftoverOld[k]);
    });
  }

  const slides = newSlides.map((slide, newIndex) => {
    const oldIndex = newToOld.get(newIndex);
    const oldSlide = oldIndex === undefined ? undefined : oldSlides[oldIndex];
    if (!oldSlide || (oldSlide.notes === undefined && oldSlide.graphic === undefined)) return slide;
    const merged: SlideData = { ...slide };
    if (merged.notes === undefined && oldSlide.notes !== undefined) merged.notes = oldSlide.notes;
    if (merged.graphic === undefined && oldSlide.graphic !== undefined) merged.graphic = oldSlide.graphic;
    return merged;
  });

  const droppedFields: string[] = [];
  oldSlides.forEach((oldSlide, oldIndex) => {
    if (claimedOld.has(oldIndex)) return;
    if (oldSlide.notes === undefined && oldSlide.graphic === undefined) return;
    const what =
      oldSlide.notes !== undefined && oldSlide.graphic !== undefined
        ? "speaker notes and graphic"
        : oldSlide.notes !== undefined
          ? "speaker notes"
          : "graphic";
    droppedFields.push(
      `Could not confidently match slide "${oldSlide.title}" in the revised deck, so its ${what} could not be carried over.`
    );
  });

  return { slides, droppedFields };
}

/** The deck Route Handler's request body (src/app/api/lms-generation/deck/
 * route.ts) - shared with useLmsGeneration.ts's client-side caller so the two
 * ends of that fetch cannot silently drift out of shape. */
export interface DeckGenerationRequest {
  courseUrl: string;
  /** An export-sourced selection's course_hub row id - same identifier,
   * same purpose as GenerateFromSelectionInput's own `courseId`
   * (src/app/actions/lms-generation.ts): the route resolves the course by
   * this when present (an export selection, whose `courseUrl` is always
   * "") instead of by Canvas URL. Undefined for a live selection. */
  courseId?: string;
  items: SelectedMaterialItem[];
  moduleIds?: number[];
  moduleLabel?: string;
  templateId: string;
  provider?: LlmProvider;
}

export interface DeckGenerationFailure {
  error: string;
  /** True specifically for resolveLmsCourseRowAction's own "not linked"
   * error - mirrors GenerationFailure.courseNotLinked in src/app/actions/
   * lms-generation.ts, which the route handler cannot import a type from
   * (a "use server" module may export only async functions). */
  courseNotLinked?: true;
}

export interface DeckGenerationSuccess {
  artifact: GeneratedArtifact;
  notes: string[];
}
