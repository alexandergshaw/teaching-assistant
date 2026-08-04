// resolveDeckTheme had ZERO direct test coverage before this file (only
// assembleLectureFiles, its one caller inside registry-helpers.
// assembleLectureFiles.ts, was exercised - see registry-helpers.
// assembleLectureFiles.test.ts, which mocks getDeckTemplateAction to always
// error and never inspects which template id was actually looked up). Split
// into its own sibling file, mirroring how registry-helpers.
// assembleLectureFiles.ts itself was split out of registry-helpers.ts, so
// this coverage does not push registry-helpers.assembleLectureFiles.test.ts
// (already close to the 1000-line file-size gate) over the cap.
//
// "Deck template should default to just pull from the type of class it is
// (coding or applied)": resolveDeckTheme's blank-template fallback used to be
// the single hardcoded literal "preset-classic-lecture". It now defers to
// defaultDeckTemplateIdForCourseKind (decks/presets.ts) whenever
// `templateValue` is blank, matched on each preset's own `courseKind` FIELD
// VALUE - never a template's name or id. Every AC below is pinned against a
// REALISTIC getDeckTemplateAction mock (it searches DECK_PRESETS by id/name,
// exactly like the real server action does) so a passing test proves the
// right PRESET was resolved, not just the right id string.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  getDeckTemplateAction: vi.fn(),
}));

import { getDeckTemplateAction } from "@/app/actions";
import { resolveDeckTheme } from "./registry-helpers";
import { DECK_PRESETS } from "@/lib/decks/presets";

// Mirrors getDeckTemplateAction's own real lookup (src/app/actions/media.ts):
// id match first, then a case-insensitive name match, against the built-in
// preset pool (no custom templates in this suite).
function mockRealisticLookup() {
  vi.mocked(getDeckTemplateAction).mockImplementation(async (idOrName: string) => {
    const key = String(idOrName ?? "").trim();
    const found =
      DECK_PRESETS.find((t) => t.id === key) ||
      DECK_PRESETS.find((t) => t.name.trim().toLowerCase() === key.toLowerCase());
    if (!found) return { error: `No deck template matches "${key}".` };
    return { template: found };
  });
}

describe("resolveDeckTheme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // AC1: called with ONE argument, resolveDeckTheme must behave
  // byte-identically to the old hardcoded "preset-classic-lecture" fallback -
  // this is the guarantee every existing single-argument caller
  // (draft-upcoming-lectures, the standalone "Prepare lecture" step) depends
  // on, unchanged by this feature.
  describe("AC1: single-argument call (courseKind omitted)", () => {
    it("a blank templateValue resolves preset-classic-lecture's theme", async () => {
      mockRealisticLookup();
      const result = await resolveDeckTheme("");
      expect(getDeckTemplateAction).toHaveBeenCalledWith("preset-classic-lecture");
      expect(result.templateName).toBe("Classic Lecture");
      expect(result.theme).toEqual({
        backgroundKind: "classic",
        backgroundColor: "#1a2744",
        backgroundColor2: "#2563eb",
        fontColor: "#ffffff",
      });
    });

    it("an undefined templateValue is treated identically to blank", async () => {
      mockRealisticLookup();
      const result = await resolveDeckTheme(undefined);
      expect(getDeckTemplateAction).toHaveBeenCalledWith("preset-classic-lecture");
      expect(result.templateName).toBe("Classic Lecture");
    });

    it("a whitespace-only templateValue is trimmed to blank and resolves the same default", async () => {
      mockRealisticLookup();
      await resolveDeckTheme("   ");
      expect(getDeckTemplateAction).toHaveBeenCalledWith("preset-classic-lecture");
    });

    it("the not-found note still names preset-classic-lecture, exactly as the old hardcoded fallback did", async () => {
      vi.mocked(getDeckTemplateAction).mockResolvedValue({ error: "not found" });
      const result = await resolveDeckTheme("");
      expect(result.note).toBe('Template "preset-classic-lecture" not found - used Classic Lecture.');
    });
  });

  // AC3: a coding course's blank template now resolves preset-coding-lecture
  // instead of the old universal preset-classic-lecture default.
  it("AC3: a coding course with a blank template gets preset-coding-lecture's theme", async () => {
    mockRealisticLookup();
    const result = await resolveDeckTheme("", "coding");
    expect(getDeckTemplateAction).toHaveBeenCalledWith("preset-coding-lecture");
    expect(result.templateName).toBe("Coding Concept Lecture");
  });

  // AC4: the SAME blank templateValue, keyed off each course's own
  // courseKind, must resolve to a DIFFERENT preset - the multi-course
  // fan-out scenario (COURSE_BUILD): one shared blank run-form value, two
  // themes. No applied-flavoured preset exists this pass (flagged as a gap
  // in decks/presets.ts's own comment), so "applied" falls through to
  // preset-classic-lecture - the correct behavior for this pass, not a bug.
  it("AC4: the same blank template value resolves a different preset per course's own courseKind in the same run", async () => {
    mockRealisticLookup();
    const codingResult = await resolveDeckTheme(undefined, "coding");
    const appliedResult = await resolveDeckTheme(undefined, "applied");

    expect(codingResult.templateName).toBe("Coding Concept Lecture");
    expect(appliedResult.templateName).toBe("Classic Lecture");
    expect(codingResult.templateName).not.toBe(appliedResult.templateName);
  });

  // AC5: an explicit instructor pick - built-in id or custom UUID - always
  // wins over the course-kind default, on every course, regardless of kind.
  // Blank is the ONLY spelling of "use the default"; this proves a non-blank
  // value is never second-guessed even when it "disagrees" with the course's
  // own kind (a coding course explicitly pointed at a non-coding preset still
  // gets exactly what it asked for).
  describe("AC5: an explicit pick always wins over the course-kind default", () => {
    it("a built-in id not tagged for this course's kind is still honored exactly, for both kinds", async () => {
      mockRealisticLookup();
      const codingPickingReview = await resolveDeckTheme("preset-review-session", "coding");
      const appliedPickingCoding = await resolveDeckTheme("preset-coding-lecture", "applied");

      expect(getDeckTemplateAction).toHaveBeenNthCalledWith(1, "preset-review-session");
      expect(codingPickingReview.templateName).toBe("Review Session");

      expect(getDeckTemplateAction).toHaveBeenNthCalledWith(2, "preset-coding-lecture");
      expect(appliedPickingCoding.templateName).toBe("Coding Concept Lecture");
    });

    it("a custom (non-preset) template UUID is looked up verbatim, never replaced by the course-kind default", async () => {
      vi.mocked(getDeckTemplateAction).mockResolvedValue({
        error: 'No deck template matches "2f3a1972-fcaf-403b-87e3-b6198067d72e".',
      });
      await resolveDeckTheme("2f3a1972-fcaf-403b-87e3-b6198067d72e", "applied");
      expect(getDeckTemplateAction).toHaveBeenCalledWith("2f3a1972-fcaf-403b-87e3-b6198067d72e");
      expect(getDeckTemplateAction).not.toHaveBeenCalledWith("preset-classic-lecture");
    });
  });
});
