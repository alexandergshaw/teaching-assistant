import { describe, it, expect } from "vitest";
import {
  buildSlideCountAdjustment,
  buildBulletsDroppedAdjustment,
  buildTitleShortenedAdjustment,
  buildTextOverBudgetAdjustment,
  buildGraphicDroppedAdjustment,
  buildOperationRefusedAdjustment,
  describeFitReport,
  describeFitReportAdjustment,
  emptyFitReport,
} from "./fit-report";

// docs/a43-scope.md section 7.3: every class named in the fit report table
// must be COUNTED, not described. Each builder below takes the actual
// numbers, not a boolean or a string summary, and RULING 53 (a53-rulings.md)
// specifically calls out a residual whose instrument was satisfied
// vacuously by the worst instance - so every "returns null when nothing
// happened" branch here is tested, not just the failing branch.

describe("fit-report: buildSlideCountAdjustment", () => {
  it("returns null when the deck needs no more slides than the template has", () => {
    expect(buildSlideCountAdjustment(12, 12)).toBeNull();
    expect(buildSlideCountAdjustment(12, 5)).toBeNull();
  });

  it("refuses, naming both counts, when the deck needs more slides than the template has", () => {
    const adjustment = buildSlideCountAdjustment(12, 40);
    expect(adjustment).not.toBeNull();
    expect(adjustment).toEqual({
      class: "slide-count-refusal",
      templateSlideCount: 12,
      requiredSlideCount: 40,
      reason: "Your template has 12 slides and this deck needs 40. Pick a shorter shape or a longer template.",
    });
  });

  it("uses singular 'slide' for a one-slide template", () => {
    const adjustment = buildSlideCountAdjustment(1, 3);
    expect(adjustment?.class).toBe("slide-count-refusal");
    expect(adjustment && "reason" in adjustment ? adjustment.reason : null).toBe(
      "Your template has 1 slide and this deck needs 3. Pick a shorter shape or a longer template."
    );
  });
});

describe("fit-report: buildBulletsDroppedAdjustment", () => {
  it("returns null when every generated bullet was placed", () => {
    expect(buildBulletsDroppedAdjustment(3, 4, 4)).toBeNull();
    expect(buildBulletsDroppedAdjustment(3, 4, 5)).toBeNull();
  });

  it("counts generated, placed, and moved-to-notes when bullets were dropped", () => {
    const adjustment = buildBulletsDroppedAdjustment(3, 6, 4);
    expect(adjustment).toEqual({
      class: "bullets-dropped",
      slideIndex: 3,
      generatedCount: 6,
      placedCount: 4,
      movedToNotesCount: 2,
    });
  });
});

describe("fit-report: buildTitleShortenedAdjustment", () => {
  it("returns null when the title was not shortened", () => {
    expect(buildTitleShortenedAdjustment(5, 60, 60)).toBeNull();
    expect(buildTitleShortenedAdjustment(5, 40, 60)).toBeNull();
  });

  it("counts the original and shortened lengths", () => {
    expect(buildTitleShortenedAdjustment(5, 78, 60)).toEqual({
      class: "title-shortened",
      slideIndex: 5,
      fromChars: 78,
      toChars: 60,
    });
  });
});

describe("fit-report: buildTextOverBudgetAdjustment", () => {
  it("returns null when the generated text fits inside the template's own original text", () => {
    expect(buildTextOverBudgetAdjustment(7, "body", 100, 120)).toBeNull();
    expect(buildTextOverBudgetAdjustment(7, "body", 120, 120)).toBeNull();
  });

  it("counts the generated length against the template's original length", () => {
    expect(buildTextOverBudgetAdjustment(7, "body", 340, 120)).toEqual({
      class: "text-over-budget",
      slideIndex: 7,
      part: "body",
      chars: 340,
      originalChars: 120,
    });
  });
});

describe("fit-report: buildGraphicDroppedAdjustment and buildOperationRefusedAdjustment", () => {
  it("always reports a graphic drop (there is no 'still fits' case for a graphic area the template lacks)", () => {
    expect(buildGraphicDroppedAdjustment(5, "table")).toEqual({
      class: "graphic-dropped",
      slideIndex: 5,
      graphicKind: "table",
    });
  });

  it("always reports a refused operation with its reason", () => {
    expect(buildOperationRefusedAdjustment("cannot add a slide")).toEqual({
      class: "operation-refused",
      reason: "cannot add a slide",
    });
  });
});

describe("fit-report: describeFitReport - the zero case must say so explicitly", () => {
  it("never returns an empty array - a blank report must not read as a missing one", () => {
    const lines = describeFitReport(emptyFitReport());
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toBe("No adjustments were needed - your generated deck fit the template exactly.");
  });

  it("renders one line per adjustment, in order, for a mixed report", () => {
    const report = {
      adjustments: [
        buildSlideCountAdjustment(12, 12), // null - should never reach here in practice
        buildBulletsDroppedAdjustment(3, 6, 4),
        buildTitleShortenedAdjustment(5, 78, 60),
      ].filter((a): a is NonNullable<typeof a> => a !== null),
    };
    const lines = describeFitReport(report);
    expect(lines).toEqual([
      "Slide 3: 6 bullets generated, 4 placed, 2 moved to speaker notes",
      "Slide 5: title shortened from 78 to 60 characters; the rest moved to the first bullet",
    ]);
  });
});

describe("fit-report: describeFitReportAdjustment - every class named in section 7.3's table", () => {
  it("slide-count-refusal", () => {
    expect(describeFitReportAdjustment(buildSlideCountAdjustment(12, 40)!)).toBe(
      "Your template has 12 slides and this deck needs 40. Pick a shorter shape or a longer template."
    );
  });

  it("slide-count-clone", () => {
    expect(
      describeFitReportAdjustment({
        class: "slide-count-clone",
        templateSlideCount: 12,
        requiredSlideCount: 40,
        clonedSlideCount: 28,
      })
    ).toBe("Your template has 12 slides; this deck needs 40. 28 slides were created by copying an existing slide.");
  });

  it("text-over-budget", () => {
    expect(describeFitReportAdjustment(buildTextOverBudgetAdjustment(7, "body", 340, 120)!)).toBe(
      "Slide 7, body: 340 characters placed into a shape whose original text was 120. It may overflow."
    );
  });

  it("graphic-dropped", () => {
    expect(describeFitReportAdjustment(buildGraphicDroppedAdjustment(5, "table"))).toBe(
      "Slide 5: a table graphic was generated and this template declares no graphic area, so it was omitted"
    );
  });

  it("operation-refused", () => {
    expect(
      describeFitReportAdjustment(
        buildOperationRefusedAdjustment(
          "I cannot add a slide to an uploaded template yet - the writer can rewrite, clone or empty an existing slide's paragraphs but cannot create one."
        )
      )
    ).toBe(
      "I cannot add a slide to an uploaded template yet - the writer can rewrite, clone or empty an existing slide's paragraphs but cannot create one."
    );
  });
});
