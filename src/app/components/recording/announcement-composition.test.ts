import { describe, it, expect } from "vitest";
import { coerceAnnouncementComposition } from "./announcement-composition";
import { DEFAULT_ANNOUNCEMENT_COMPOSITION } from "@/lib/take-announcement";

// docs/reply-composition-controls-acceptance-criteria.md C5a (this group's
// own C-2): coercion must never throw, and every bad stored value falls back
// to DEFAULT_ANNOUNCEMENT_COMPOSITION rather than reaching the prompt
// builder. Mirrors coerceReplyComposition's own test coverage shape
// (discussion-draft-loop.ts's test suite) field-for-field.

describe("coerceAnnouncementComposition", () => {
  it("both null (never persisted) falls back to the default composition", () => {
    expect(coerceAnnouncementComposition(null, null)).toEqual(DEFAULT_ANNOUNCEMENT_COMPOSITION);
  });

  it("round-trips a legal, non-default ingredients selection", () => {
    expect(coerceAnnouncementComposition(JSON.stringify(["insight"]), null)).toEqual({
      ingredients: ["insight"],
      formality: DEFAULT_ANNOUNCEMENT_COMPOSITION.formality,
    });
  });

  it("an empty array is a legal, distinct value - NOT coerced to the default", () => {
    expect(coerceAnnouncementComposition(JSON.stringify([]), null)).toEqual({
      ingredients: [],
      formality: DEFAULT_ANNOUNCEMENT_COMPOSITION.formality,
    });
  });

  it("drops an ingredient id outside ANNOUNCEMENT_INGREDIENTS (e.g. a reply-only id) rather than throwing", () => {
    expect(coerceAnnouncementComposition(JSON.stringify(["insight", "compliment", "deeper-question"]), null)).toEqual({
      ingredients: ["insight"],
      formality: DEFAULT_ANNOUNCEMENT_COMPOSITION.formality,
    });
  });

  it("de-duplicates a repeated ingredient id", () => {
    expect(coerceAnnouncementComposition(JSON.stringify(["resources", "resources"]), null)).toEqual({
      ingredients: ["resources"],
      formality: DEFAULT_ANNOUNCEMENT_COMPOSITION.formality,
    });
  });

  it("malformed JSON falls back to the default ingredients, never throws", () => {
    expect(() => coerceAnnouncementComposition("{not json", null)).not.toThrow();
    expect(coerceAnnouncementComposition("{not json", null).ingredients).toEqual(
      DEFAULT_ANNOUNCEMENT_COMPOSITION.ingredients
    );
  });

  it("a non-array JSON blob (an object) falls back to the default ingredients", () => {
    expect(coerceAnnouncementComposition(JSON.stringify({ insight: true }), null).ingredients).toEqual(
      DEFAULT_ANNOUNCEMENT_COMPOSITION.ingredients
    );
  });

  it("a non-array JSON blob (a bare string or number) falls back to the default ingredients", () => {
    expect(coerceAnnouncementComposition(JSON.stringify("insight"), null).ingredients).toEqual(
      DEFAULT_ANNOUNCEMENT_COMPOSITION.ingredients
    );
    expect(coerceAnnouncementComposition(JSON.stringify(5), null).ingredients).toEqual(
      DEFAULT_ANNOUNCEMENT_COMPOSITION.ingredients
    );
  });

  it("round-trips each legal formality stop", () => {
    expect(coerceAnnouncementComposition(null, "casual").formality).toBe("casual");
    expect(coerceAnnouncementComposition(null, "balanced").formality).toBe("balanced");
    expect(coerceAnnouncementComposition(null, "formal").formality).toBe("formal");
  });

  it("an unrecognised formality string falls back to the default, never throws", () => {
    expect(coerceAnnouncementComposition(null, "extremely-formal").formality).toBe(
      DEFAULT_ANNOUNCEMENT_COMPOSITION.formality
    );
    expect(coerceAnnouncementComposition(null, "")).toEqual(DEFAULT_ANNOUNCEMENT_COMPOSITION);
  });

  it("never throws for any combination of garbage input", () => {
    expect(() => coerceAnnouncementComposition("null", "null")).not.toThrow();
    expect(() => coerceAnnouncementComposition("[1,2,3]", "0")).not.toThrow();
    expect(() => coerceAnnouncementComposition("", "")).not.toThrow();
  });
});
