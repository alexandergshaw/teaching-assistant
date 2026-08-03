// Sibling of slide-prompt.test.ts (split out to keep that file under the
// 1000-line cap, the same reason slide-prompt.applied.test.ts and
// slide-prompt.structural-guard.test.ts exist). This file hosts ONLY the
// TITLE LENGTH work: enforceTitleLength's data-layer behaviour, and the
// cross-check that each contract's own worked examples obey the cap they
// state.
//
// Why a data-layer guard at all: there was NO title-length rule of any kind
// in this codebase before - not in the prompt, not in code - which is how a
// real generated deck (INFO 1020 - Lecture Materials (14).zip, 48 slides)
// shipped a median title of 29 characters alongside 8 titles past 60 and one
// at 88. A prompt rule alone is not verifiable, exactly the lesson
// enforceNoCodeForApplied and enforceCodingCycle already learned for their
// own clauses.

import { describe, it, expect } from "vitest";
import {
  enforceTitleLength,
  slideStructureRequirements,
  SLIDE_TITLE_MAX_CHARS,
} from "./slide-prompt";
import type { SlideData } from "@/app/actions-types";

/** The real 88-character title measured in the audited deck. */
const REAL_88_CHAR_TITLE =
  "Classes are templates and objects are the living instances created from those templates.";

function slide(partial: Partial<SlideData> & { title: string }): SlideData {
  return { bullets: [], ...partial };
}

describe("enforceTitleLength", () => {
  it("the fixture this suite is built on really is the length the audit measured", () => {
    // Guards the guard: if this string is ever edited, the assertions below
    // would silently start testing a different case than the one that shipped.
    expect(REAL_88_CHAR_TITLE.length).toBe(88);
    expect(REAL_88_CHAR_TITLE.length).toBeGreaterThan(SLIDE_TITLE_MAX_CHARS);
  });

  describe("titles within the cap", () => {
    it("leaves a short title completely untouched, and reports nothing shortened", () => {
      const input = [slide({ title: "Recursion needs a base case", bullets: ["a", "b"] })];
      const result = enforceTitleLength(input);
      expect(result.shortened).toBe(0);
      expect(result.slides[0]).toBe(input[0]); // same reference, not a copy
    });

    it("leaves a title of EXACTLY the cap untouched (the boundary is inclusive)", () => {
      const exact = "x".repeat(SLIDE_TITLE_MAX_CHARS);
      const result = enforceTitleLength([slide({ title: exact })]);
      expect(result.shortened).toBe(0);
      expect(result.slides[0].title).toBe(exact);
    });

    it("shortens a title ONE character over the cap (the boundary is not off by one)", () => {
      const oneOver = `${"word ".repeat(20)}end`.slice(0, SLIDE_TITLE_MAX_CHARS + 1);
      expect(oneOver.length).toBe(SLIDE_TITLE_MAX_CHARS + 1);
      const result = enforceTitleLength([slide({ title: oneOver })]);
      expect(result.shortened).toBe(1);
      expect(result.slides[0].title.length).toBeLessThanOrEqual(SLIDE_TITLE_MAX_CHARS);
    });
  });

  describe("shortening the real measured defect", () => {
    const result = enforceTitleLength([
      slide({ title: REAL_88_CHAR_TITLE, bullets: ["Existing bullet."] }),
    ]);
    const shortened = result.slides[0];

    it("brings the title within the cap", () => {
      expect(shortened.title.length).toBeLessThanOrEqual(SLIDE_TITLE_MAX_CHARS);
      expect(result.shortened).toBe(1);
    });

    it("cuts at a word boundary, never mid-word", () => {
      // Every word that survives must be a whole word from the original.
      const originalWords = new Set(REAL_88_CHAR_TITLE.split(/\s+/));
      for (const word of shortened.title.split(/\s+/)) {
        // The final word may have lost trailing punctuation; compare on the
        // word's own letters.
        const matched = [...originalWords].some(
          (w) => w === word || w.replace(/[^A-Za-z]/g, "") === word.replace(/[^A-Za-z]/g, "")
        );
        expect(matched).toBe(true);
      }
    });

    it("keeps the claim readable - it is still a prefix of the original sentence", () => {
      expect(REAL_88_CHAR_TITLE.startsWith(shortened.title)).toBe(true);
    });

    it("preserves the full original claim as the first bullet, so nothing taught is lost", () => {
      expect(shortened.bullets[0]).toBe(REAL_88_CHAR_TITLE);
      expect(shortened.bullets[1]).toBe("Existing bullet.");
    });
  });

  describe("mandated role prefixes survive verbatim", () => {
    // Downstream code matches on these exact prefixes - enforceCodingCycle,
    // propagateExampleCode, and the graphics guard's required-prefix lists all
    // do. Shortening one would silently break the cycle repair.
    it.each([
      ["Example:", "Example: "],
      ["Walkthrough:", "Walkthrough: "],
      ["Practice:", "Practice: "],
      ["Answer:", "Answer: "],
      ["Case Study:", "Case Study: "],
      ["Section 3:", "Section 3: "],
      ["Post-Lecture Practice:", "Post-Lecture Practice: "],
    ])("keeps the %s prefix intact while shortening what follows it", (prefix, withSpace) => {
      const long = `${withSpace}${"a really long trailing clause ".repeat(4)}`;
      expect(long.length).toBeGreaterThan(SLIDE_TITLE_MAX_CHARS);

      const result = enforceTitleLength([slide({ title: long, code: "x = 1" })]);
      const out = result.slides[0].title;
      expect(out.startsWith(prefix)).toBe(true);
      expect(out.length).toBeLessThanOrEqual(SLIDE_TITLE_MAX_CHARS);
      // Something after the prefix survived - the prefix alone is not a title.
      expect(out.length).toBeGreaterThan(withSpace.length);
    });
  });

  describe("no shortened title ends on a dangling function word", () => {
    it.each([
      "Mutable default arguments are shared across every call and are",
      "Inheritance couples a subclass to its parent in a way that",
      "A dictionary lookup is constant time because it hashes the",
    ])("strips the trailing connective from %s...", (stem) => {
      const long = `${stem} ${"x".repeat(40)}`;
      const out = enforceTitleLength([slide({ title: long })]).slides[0].title;
      const lastWord = out.split(/\s+/).pop()!.toLowerCase();
      expect(["and", "that", "the", "are", "is", "of", "to", "a", "an"]).not.toContain(lastWord);
    });
  });

  describe("layout constraints: when the dropped clause may become a bullet", () => {
    // pptx.ts renders a graphic slide's bullets into a FIXED 1.3-inch band
    // (GRAPHIC_BULLETS_HEIGHT) and a code slide's into a fixed 1.5-inch band.
    // A third bullet on either spills over the graphic or the code panel.
    it("does NOT add a bullet to a slide carrying a graphic", () => {
      const input = slide({
        title: REAL_88_CHAR_TITLE,
        bullets: ["One.", "Two."],
        graphic: { kind: "table", headers: ["a", "b"], rows: [["1", "2"]] },
      });
      const out = enforceTitleLength([input]).slides[0];
      expect(out.title.length).toBeLessThanOrEqual(SLIDE_TITLE_MAX_CHARS);
      expect(out.bullets).toEqual(["One.", "Two."]);
    });

    it("does NOT add a bullet to a slide carrying code", () => {
      const input = slide({
        title: `Walkthrough: ${REAL_88_CHAR_TITLE}`,
        bullets: ["Line one does X."],
        code: "print(1)",
      });
      const out = enforceTitleLength([input]).slides[0];
      expect(out.title.length).toBeLessThanOrEqual(SLIDE_TITLE_MAX_CHARS);
      expect(out.bullets).toEqual(["Line one does X."]);
    });

    it("does NOT add a fifth bullet to a slide already at the 4-bullet maximum", () => {
      const input = slide({
        title: REAL_88_CHAR_TITLE,
        bullets: ["a", "b", "c", "d"],
      });
      const out = enforceTitleLength([input]).slides[0];
      expect(out.bullets).toHaveLength(4);
    });

    it("does not duplicate the claim when a bullet already says it", () => {
      const input = slide({
        title: REAL_88_CHAR_TITLE,
        bullets: [REAL_88_CHAR_TITLE, "Second bullet."],
      });
      const out = enforceTitleLength([input]).slides[0];
      expect(out.bullets).toHaveLength(2);
      expect(out.bullets[0]).toBe(REAL_88_CHAR_TITLE);
    });
  });

  describe("degenerate input never produces a broken slide", () => {
    it("returns a non-empty title when a single word exceeds the whole cap", () => {
      const monster = "S" + "u".repeat(SLIDE_TITLE_MAX_CHARS + 20);
      const out = enforceTitleLength([slide({ title: monster })]).slides[0].title;
      expect(out.length).toBeGreaterThan(0);
      expect(out.length).toBeLessThanOrEqual(SLIDE_TITLE_MAX_CHARS);
    });

    it("returns a non-empty title when the prefix alone fills the cap", () => {
      const title = `${"Very Long Role Name".repeat(3)}: trailing words here`;
      const out = enforceTitleLength([slide({ title })]).slides[0].title;
      expect(out.length).toBeGreaterThan(0);
      expect(out.length).toBeLessThanOrEqual(SLIDE_TITLE_MAX_CHARS);
    });

    it("handles an empty slide list", () => {
      expect(enforceTitleLength([])).toEqual({ slides: [], shortened: 0 });
    });
  });

  it("counts every shortened slide, and only the shortened ones", () => {
    const result = enforceTitleLength([
      slide({ title: "Short one" }),
      slide({ title: REAL_88_CHAR_TITLE }),
      slide({ title: "Also short" }),
      slide({ title: `Practice: ${REAL_88_CHAR_TITLE}` }),
    ]);
    expect(result.shortened).toBe(2);
    expect(result.slides).toHaveLength(4);
    expect(result.slides.every((s) => s.title.length <= SLIDE_TITLE_MAX_CHARS)).toBe(true);
  });

  it("respects an explicit maxChars override", () => {
    const out = enforceTitleLength([slide({ title: "One two three four five six" })], 12);
    expect(out.slides[0].title.length).toBeLessThanOrEqual(12);
    expect(out.shortened).toBe(1);
  });
});

// The contract used to illustrate a good assertion title with an
// 88-character sentence - the exact length of the worst title in the audited
// deck. A worked example that violates the rule stated one clause later is
// not a small thing: it is the strongest signal in the whole prompt.
describe("each contract's own worked title examples obey the cap it states", () => {
  it("the coding ASSERTION TITLES example fits", () => {
    const coding = slideStructureRequirements("coding");
    const match = coding.match(/Write "(Recursion[^"]+)"/);
    expect(match).not.toBeNull();
    expect(match![1].length).toBeLessThanOrEqual(SLIDE_TITLE_MAX_CHARS);
  });

  it("the coding contract still shows the 88-character sentence, but as the counter-example", () => {
    const coding = slideStructureRequirements("coding");
    expect(coding).toContain("88 characters");
    // It must appear as something to avoid, never as the thing to copy.
    const writeIndex = coding.indexOf('Write "Recursion solves');
    const neverIndex = coding.indexOf("never an unbounded sentence");
    expect(writeIndex).toBeGreaterThan(-1);
    expect(neverIndex).toBeGreaterThan(writeIndex);
  });

  it("both contracts state the cap as the same number the code enforces", () => {
    for (const kind of ["coding", "applied"] as const) {
      expect(slideStructureRequirements(kind)).toContain(
        `must be at most ${SLIDE_TITLE_MAX_CHARS} characters long`
      );
    }
  });
});
