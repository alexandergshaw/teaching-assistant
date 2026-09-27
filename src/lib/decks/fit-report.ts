/**
 * The fit report: docs/a43-scope.md section 7.3. When a generated deck is
 * poured into an owner-uploaded template, up to six things can happen that
 * are not "the deck matches the template exactly", and every one of them
 * must be COUNTED here, never merely described - "some content was
 * shortened" is the defect this module exists to replace, not the fix
 * (docs/a43-rulings.md RULING 53's fourth-call-site finding: a discarded
 * count is a residual whose own instrument is satisfied vacuously by the
 * worst instance).
 *
 * Wave T2 (docs/a43-scope.md section 11.4) wires only the slide-count class
 * end to end - office-template-fill.ts's planSlideTemplateFill refuses
 * before wave T3's cloning exists. The other five classes are defined here
 * with their own counting builders so wave F1 (section 11.6) has a stable,
 * already-designed contract to extend rather than inventing one under a
 * different shape.
 *
 * "A zero-adjustment deck must say so explicitly" (section 7.3's direction
 * of failure): describeFitReport never returns an empty array, so a caller
 * cannot render nothing and have that read as "the report is broken" versus
 * "nothing needed fixing".
 */

export type FitReportAdjustment =
  | {
      class: "slide-count-refusal";
      templateSlideCount: number;
      requiredSlideCount: number;
      reason: string;
    }
  | {
      class: "slide-count-clone";
      templateSlideCount: number;
      requiredSlideCount: number;
      clonedSlideCount: number;
    }
  | {
      class: "bullets-dropped";
      slideIndex: number;
      generatedCount: number;
      placedCount: number;
      movedToNotesCount: number;
    }
  | {
      class: "title-shortened";
      slideIndex: number;
      fromChars: number;
      toChars: number;
    }
  | {
      class: "text-over-budget";
      slideIndex: number;
      part: string;
      chars: number;
      originalChars: number;
    }
  | {
      class: "graphic-dropped";
      slideIndex: number;
      graphicKind: string;
    }
  | {
      class: "operation-refused";
      reason: string;
    };

export interface FitReport {
  adjustments: FitReportAdjustment[];
}

export function emptyFitReport(): FitReport {
  return { adjustments: [] };
}

/**
 * The slide-count class (section 7.3's first row). Before wave T3's cloning
 * exists, a deck that needs more slides than the template has cannot be
 * silently written - the writer has no way to add a slide
 * (office-edit.ts:383-392) - so this returns a REFUSAL that names both
 * counts, never a truncation. Returns null when the deck fits (including
 * when the template has slides to spare).
 */
export function buildSlideCountAdjustment(
  templateSlideCount: number,
  requiredSlideCount: number
): FitReportAdjustment | null {
  if (requiredSlideCount <= templateSlideCount) return null;
  const slideWord = templateSlideCount === 1 ? "slide" : "slides";
  return {
    class: "slide-count-refusal",
    templateSlideCount,
    requiredSlideCount,
    reason:
      `Your template has ${templateSlideCount} ${slideWord} and this deck needs ` +
      `${requiredSlideCount}. Pick a shorter shape or a longer template.`,
  };
}

/**
 * The bullets-dropped class (T1 in section 7.1's census): bullets past a
 * slide's cap. Returns null when every generated bullet was placed.
 */
export function buildBulletsDroppedAdjustment(
  slideIndex: number,
  generatedCount: number,
  placedCount: number
): FitReportAdjustment | null {
  if (placedCount >= generatedCount) return null;
  return {
    class: "bullets-dropped",
    slideIndex,
    generatedCount,
    placedCount,
    movedToNotesCount: generatedCount - placedCount,
  };
}

/**
 * The title-shortened class (T2a/T2b in section 7.1's census): title text
 * past SLIDE_TITLE_MAX_CHARS. Returns null when nothing was shortened.
 */
export function buildTitleShortenedAdjustment(
  slideIndex: number,
  fromChars: number,
  toChars: number
): FitReportAdjustment | null {
  if (toChars >= fromChars) return null;
  return { class: "title-shortened", slideIndex, fromChars, toChars };
}

/**
 * The text-over-budget class (section 7.2): a character-count PROXY for shape
 * overflow, since no font metrics exist in this environment. `originalChars`
 * is the template's own worked example - the paragraph's original length -
 * not a multiplied budget; the caller (wave F1) applies the k factor before
 * calling this. Returns null when the generated text fits inside it.
 */
export function buildTextOverBudgetAdjustment(
  slideIndex: number,
  part: string,
  chars: number,
  originalChars: number
): FitReportAdjustment | null {
  if (chars <= originalChars) return null;
  return { class: "text-over-budget", slideIndex, part, chars, originalChars };
}

/** The graphic-dropped class (section 7.2): a template declares no graphic area. */
export function buildGraphicDroppedAdjustment(slideIndex: number, graphicKind: string): FitReportAdjustment {
  return { class: "graphic-dropped", slideIndex, graphicKind };
}

/**
 * The operation-refused class (section 9.3): a conversational ask that
 * cannot be expressed as a content-only transform of the sections array.
 * Constraint H3 (section 12): this is the ONLY way an unrecognised or
 * out-of-set operation may end - never silent, never a no-op.
 */
export function buildOperationRefusedAdjustment(reason: string): FitReportAdjustment {
  return { class: "operation-refused", reason };
}

/** One human-readable line for a single adjustment, per section 7.3's table. */
export function describeFitReportAdjustment(adjustment: FitReportAdjustment): string {
  switch (adjustment.class) {
    case "slide-count-refusal":
      return adjustment.reason;
    case "slide-count-clone": {
      const slideWord = adjustment.clonedSlideCount === 1 ? "slide was" : "slides were";
      return (
        `Your template has ${adjustment.templateSlideCount} slides; this deck needs ` +
        `${adjustment.requiredSlideCount}. ${adjustment.clonedSlideCount} ${slideWord} created by copying an existing slide.`
      );
    }
    case "bullets-dropped":
      return (
        `Slide ${adjustment.slideIndex}: ${adjustment.generatedCount} bullets generated, ` +
        `${adjustment.placedCount} placed, ${adjustment.movedToNotesCount} moved to speaker notes`
      );
    case "title-shortened":
      return (
        `Slide ${adjustment.slideIndex}: title shortened from ${adjustment.fromChars} to ` +
        `${adjustment.toChars} characters; the rest moved to the first bullet`
      );
    case "text-over-budget":
      return (
        `Slide ${adjustment.slideIndex}, ${adjustment.part}: ${adjustment.chars} characters placed into a ` +
        `shape whose original text was ${adjustment.originalChars}. It may overflow.`
      );
    case "graphic-dropped":
      return (
        `Slide ${adjustment.slideIndex}: a ${adjustment.graphicKind} graphic was generated and this template ` +
        `declares no graphic area, so it was omitted`
      );
    case "operation-refused":
      return adjustment.reason;
    default: {
      // Exhaustiveness guard: a new class added to the union without a case
      // here is a compile error, not a silent fallthrough (constraint H3's
      // "never falls through to a no-op", applied to the report itself).
      const neverAdjustment: never = adjustment;
      return neverAdjustment;
    }
  }
}

/**
 * The whole report as display lines, direct from docs/a43-scope.md section
 * 7.3's "DIRECTION OF FAILURE": a blank report is indistinguishable from a
 * missing one, so a zero-adjustment deck says so explicitly rather than
 * rendering nothing.
 */
export function describeFitReport(report: FitReport): string[] {
  if (report.adjustments.length === 0) {
    return ["No adjustments were needed - your generated deck fit the template exactly."];
  }
  return report.adjustments.map(describeFitReportAdjustment);
}
