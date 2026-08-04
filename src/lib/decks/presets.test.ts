// defaultDeckTemplateIdForCourseKind is the pure default-resolution function
// behind "deck template should default to just pull from the type of class
// it is (coding or applied)" - it is what lets resolveDeckTheme
// (registry-helpers.assembleLectureFiles.ts) pick a course-kind-appropriate
// built-in template when an instructor leaves the template picker blank.
//
// The core finding this function is built on: NO deck template carries a
// machine-readable kind marker except the `courseKind` field itself - a real
// production run used a bare UUID (2f3a1972-fcaf-403b-87e3-b6198067d72e) as
// a user-created template's id, which a name/id lookup table could never
// have covered. Every test below therefore uses a custom `templates` array
// (never the field-vs-string-comparison ambiguity DECK_PRESETS' own
// coding-flavoured names could paper over) to prove the match is on the
// FIELD VALUE alone.

import { describe, it, expect } from "vitest";
import { defaultDeckTemplateIdForCourseKind, DECK_PRESETS } from "./presets";
import { emptyDeckTemplate } from "./types";
import type { DeckTemplate } from "./types";

function templateWith(overrides: Partial<DeckTemplate>): DeckTemplate {
  return { ...emptyDeckTemplate(overrides.name ?? "T"), ...overrides };
}

describe("defaultDeckTemplateIdForCourseKind", () => {
  it("matches a template by its courseKind FIELD VALUE, not by a name or id substring - a bare-UUID id tagged coding wins over a name-only 'coding' decoy", () => {
    const decoyNamedCoding = templateWith({ id: "not-a-preset-id", name: "My Coding Deck", courseKind: null });
    const uuidTaggedCoding = templateWith({
      id: "2f3a1972-fcaf-403b-87e3-b6198067d72e",
      name: "Untitled Template",
      courseKind: "coding",
    });
    const result = defaultDeckTemplateIdForCourseKind("coding", [decoyNamedCoding, uuidTaggedCoding]);
    expect(result).toBe("2f3a1972-fcaf-403b-87e3-b6198067d72e");
  });

  it("a template whose NAME says 'applied' but whose courseKind field is null is never selected for 'applied'", () => {
    const decoyNamedApplied = templateWith({ id: "decoy-applied-id", name: "Applied Course Deck", courseKind: null });
    const result = defaultDeckTemplateIdForCourseKind("applied", [decoyNamedApplied]);
    expect(result).toBe("preset-classic-lecture");
  });

  it("falls back to preset-classic-lecture when no template in the pool carries a matching courseKind", () => {
    const onlyCoding = templateWith({ id: "coding-only", courseKind: "coding" });
    expect(defaultDeckTemplateIdForCourseKind("applied", [onlyCoding])).toBe("preset-classic-lecture");
  });

  it("falls back to preset-classic-lecture for a null courseKind argument", () => {
    const onlyCoding = templateWith({ id: "coding-only", courseKind: "coding" });
    expect(defaultDeckTemplateIdForCourseKind(null, [onlyCoding])).toBe("preset-classic-lecture");
  });

  // AC1's own guarantee, exercised at the pure-function level: an omitted
  // (undefined) courseKind is resolveDeckTheme's own single-argument case -
  // it must resolve to preset-classic-lecture exactly like the old hardcoded
  // fallback it replaces, byte-identically.
  it("falls back to preset-classic-lecture for an undefined courseKind argument (resolveDeckTheme's single-argument contract)", () => {
    expect(defaultDeckTemplateIdForCourseKind(undefined, [templateWith({ id: "coding-only", courseKind: "coding" })])).toBe(
      "preset-classic-lecture"
    );
  });

  it("defaults its own `templates` argument to DECK_PRESETS when omitted", () => {
    expect(defaultDeckTemplateIdForCourseKind("coding")).toBe("preset-coding-lecture");
  });

  // AC3: against the REAL DECK_PRESETS pool, "coding" resolves to
  // preset-coding-lecture (the first of the two coding-tagged built-ins).
  it("against DECK_PRESETS: 'coding' resolves to preset-coding-lecture", () => {
    expect(defaultDeckTemplateIdForCourseKind("coding", DECK_PRESETS)).toBe("preset-coding-lecture");
  });

  // AC4/gap: against the REAL DECK_PRESETS pool, "applied" resolves to
  // preset-classic-lecture - there is no applied-flavoured preset this pass
  // (flagged as a gap; see decks/presets.ts's own header comment on this
  // function).
  it("against DECK_PRESETS: 'applied' resolves to preset-classic-lecture (no applied preset exists yet)", () => {
    expect(defaultDeckTemplateIdForCourseKind("applied", DECK_PRESETS)).toBe("preset-classic-lecture");
  });

  // AC6: the function only ever returns a DECK_PRESETS id, for every
  // courseKind value it can be called with.
  it("AC6: only ever returns a DECK_PRESETS id", () => {
    const presetIds = new Set(DECK_PRESETS.map((p) => p.id));
    for (const kind of ["coding", "applied", null, undefined] as const) {
      expect(presetIds.has(defaultDeckTemplateIdForCourseKind(kind))).toBe(true);
    }
  });
});
