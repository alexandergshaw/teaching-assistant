import { describe, it, expect } from "vitest";
import { renderPickedRubricText, rubricHasUsablePoints, type RenderableRubric } from "./rubric-render";
// The single highest-value test (AC item 56) round-trips this module's
// output through the REAL parser it is written for, not a reimplementation
// of it - importing extractRubricCriteria directly is the point: if the two
// modules ever drift apart, this test fails instead of two independent
// "matching" fakes silently agreeing with each other.
import { extractRubricCriteria } from "./grade/rubric";

describe("renderPickedRubricText", () => {
  it("round-trips every criterion through the real extractRubricCriteria with non-null points", () => {
    const rubric: RenderableRubric = {
      criteria: [
        {
          description: "Code Style",
          points: 20,
          longDescription: "Follows the course style guide.",
          ratings: [
            { description: "Consistently styled", points: 20 },
            { description: "Minor inconsistencies", points: 10 },
          ],
        },
        {
          description: "Correctness",
          points: 30,
          longDescription: null,
          ratings: [],
        },
        {
          description: "Testing",
          points: 50,
          longDescription: "Has automated tests covering the main paths.",
          ratings: [{ description: "Good coverage", points: 50 }],
        },
      ],
    };

    const text = renderPickedRubricText(rubric);
    const extracted = extractRubricCriteria(text);

    expect(extracted).toHaveLength(3);
    expect(extracted).toEqual([
      { name: "Code Style", points: 20 },
      { name: "Correctness", points: 30 },
      { name: "Testing", points: 50 },
    ]);
    for (const criterion of extracted) {
      expect(criterion.points).not.toBeNull();
    }
  });

  // CANARY (AC item 56 / R11 item 33's "not a tautology" bar): this project
  // has shipped tests before that could never fail. Prove the round-trip
  // assertion above is meaningful by feeding it text shaped like the KNOWN
  // trap renderer, serializeRubric (src/lib/submission-archive-sniff.ts:40),
  // which indents every criterion line. extractRubricCriteria treats any
  // indented line as a rating/subcategory line (rubric.ts:14) and skips it,
  // so this literal - written by hand, not produced by any renderer under
  // test - must recover ZERO criteria. If this assertion ever failed, the
  // "recovered with non-null points" assertion above would not be trustworthy
  // evidence that renderPickedRubricText's grammar is correct.
  it("canary: indented criterion lines (the serializeRubric shape) recover zero criteria", () => {
    const indentedLikeSerializeRubric = ["Some Rubric Title", "  Code Style (20 pts): Follows the style guide", "  Correctness (30 pts): Passes all cases"].join(
      "\n"
    );
    const extracted = extractRubricCriteria(indentedLikeSerializeRubric);
    expect(extracted).toHaveLength(0);
  });

  it("emits a 'pts' unit, never a bare number or '%', so points are never null for a real criterion", () => {
    const rubric: RenderableRubric = {
      criteria: [{ description: "Area", points: 15, longDescription: "Detail.", ratings: [] }],
    };
    const text = renderPickedRubricText(rubric);
    expect(text).toContain("(15 pts):");
    expect(text).not.toMatch(/\(15\)/);
    expect(text).not.toMatch(/\(15%\)/);
  });

  it("produces identical output for the cartridge shape (nullable longDescription) and the RubricDetail shape (optional longDescription)", () => {
    const cartridgeShaped: RenderableRubric = {
      criteria: [
        { description: "Area One", points: 10, longDescription: null, ratings: [{ description: "Full marks", points: 10 }] },
        { description: "Area Two", points: 20, longDescription: "Some detail.", ratings: [] },
      ],
    };
    // RubricDetail's criterion type omits longDescription entirely rather
    // than carrying it as null - simulate that by constructing the object
    // without the field at all (not just setting it to undefined), matching
    // what getRubricAction actually returns for a criterion with no long
    // description.
    const rubricDetailShaped: RenderableRubric = {
      criteria: [
        { description: "Area One", points: 10, ratings: [{ description: "Full marks", points: 10 }] },
        { description: "Area Two", points: 20, longDescription: "Some detail.", ratings: [] },
      ],
    };

    expect(renderPickedRubricText(cartridgeShaped)).toBe(renderPickedRubricText(rubricDetailShaped));
  });

  it("deduplicates a repeated criterion name deliberately, rather than emitting both and letting the parser silently drop one", () => {
    const rubric: RenderableRubric = {
      criteria: [
        { description: "Code Style", points: 20, longDescription: "First one.", ratings: [] },
        { description: "code style", points: 999, longDescription: "Second one, different casing.", ratings: [] },
        { description: "Correctness", points: 30, longDescription: "Detail.", ratings: [] },
      ],
    };
    const text = renderPickedRubricText(rubric);
    const extracted = extractRubricCriteria(text);

    // Only the first "Code Style" survives - the renderer's own dedup, not
    // an accident of extractRubricCriteria's independent dedup.
    expect(extracted).toEqual([
      { name: "Code Style", points: 20 },
      { name: "Correctness", points: 30 },
    ]);
    expect(text).not.toContain("999");
  });

  it("skips a criterion with an empty description rather than rendering an unparseable line", () => {
    const rubric: RenderableRubric = {
      criteria: [
        { description: "", points: 10, longDescription: "Orphaned.", ratings: [] },
        { description: "Correctness", points: 30, longDescription: "Detail.", ratings: [] },
      ],
    };
    const text = renderPickedRubricText(rubric);
    const extracted = extractRubricCriteria(text);
    expect(extracted).toEqual([{ name: "Correctness", points: 30 }]);
  });

  it("handles a criterion whose description itself contains parentheses and a colon", () => {
    const rubric: RenderableRubric = {
      criteria: [{ description: "Part (A): Setup", points: 25, longDescription: "Detail.", ratings: [] }],
    };
    const text = renderPickedRubricText(rubric);
    const extracted = extractRubricCriteria(text);
    expect(extracted).toEqual([{ name: "Part (A): Setup", points: 25 }]);
  });

  it("falls back to the criterion's own description as detail text when longDescription is empty", () => {
    const rubric: RenderableRubric = {
      criteria: [{ description: "Correctness", points: 30, longDescription: "   ", ratings: [] }],
    };
    const text = renderPickedRubricText(rubric);
    expect(text).toBe("Correctness (30 pts): Correctness");
  });

  it("renders an empty string for an empty criteria list", () => {
    expect(renderPickedRubricText({ criteria: [] })).toBe("");
  });

  it("is pure: repeated calls with the same input produce the same string, and the input is not mutated", () => {
    const rubric: RenderableRubric = {
      criteria: [
        { description: "Code Style", points: 20, longDescription: "Detail one.", ratings: [{ description: "Full marks", points: 20 }] },
        { description: "Correctness", points: 30, longDescription: "Detail two.", ratings: [] },
      ],
    };
    const before = JSON.parse(JSON.stringify(rubric));

    const first = renderPickedRubricText(rubric);
    const second = renderPickedRubricText(rubric);

    expect(first).toBe(second);
    expect(JSON.parse(JSON.stringify(rubric))).toEqual(before);
  });
});

describe("rubricHasUsablePoints", () => {
  it("reports an all-zero rubric as unusable (AC item 68's column-blanking guard)", () => {
    const rubric: RenderableRubric = {
      criteria: [
        { description: "Code Style", points: 0, longDescription: "Detail.", ratings: [] },
        { description: "Correctness", points: 0, longDescription: "Detail.", ratings: [] },
      ],
    };
    expect(rubricHasUsablePoints(rubric)).toBe(false);

    // Prove the guard is load-bearing, not decorative: an all-zero rubric
    // really does make the downstream total-score derivation return "" -
    // renderPickedRubricText still happily emits valid, parseable lines for
    // it, and extractRubricCriteria still recovers them with points: 0 (a
    // legitimate finite number), which is exactly why a dedicated guard is
    // required instead of relying on either of those functions to notice.
    const text = renderPickedRubricText(rubric);
    const parsed = extractRubricCriteria(text);
    expect(parsed).toEqual([
      { name: "Code Style", points: 0 },
      { name: "Correctness", points: 0 },
    ]);
  });

  it("reports a mixed rubric (some zero, some not) as usable", () => {
    const rubric: RenderableRubric = {
      criteria: [
        { description: "Code Style", points: 0, longDescription: "Detail.", ratings: [] },
        { description: "Correctness", points: 30, longDescription: "Detail.", ratings: [] },
      ],
    };
    expect(rubricHasUsablePoints(rubric)).toBe(true);
  });

  it("reports an empty criteria list as unusable", () => {
    expect(rubricHasUsablePoints({ criteria: [] })).toBe(false);
  });
});
