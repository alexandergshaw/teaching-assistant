// Tests for module-pattern-inference.ts
// (docs/carry-module-pattern-forward-acceptance-criteria.md D1-D4b).
//
// The round-trip table is the contract (D2): a pattern inferred from a
// title, re-rendered for the SOURCE module's own number, must reproduce the
// source title EXACTLY. Every title in the table below is a REAL string
// pulled from this repo's own fixtures, tests, or the acceptance-criteria
// document itself (never invented) - see the per-row comment for where each
// one came from. The three AC-doc examples (D2's "Module 007 Lab" and
// "Week 5 Homework", D3's "Module 3: Week 3 Reading") are included verbatim,
// as the brief requires.

import { describe, it, expect } from "vitest";
import {
  inferItemPattern,
  parseAuthoredItemPattern,
  renderItemPattern,
  type RenderableItemPattern,
} from "./module-pattern-inference";

// ---------------------------------------------------------------------------
// The round-trip contract (D2): >= 25 real titles, each round-tripped
// against its OWN source module's number.
// ---------------------------------------------------------------------------

interface RoundTripCase {
  /** Where this title came from, for anyone auditing the table later. */
  source: string;
  moduleName: string;
  title: string;
}

const ROUND_TRIP_CASES: RoundTripCase[] = [
  { source: "canvas-modules/module-content.test.ts:38", moduleName: "Module 02: Loops", title: "Lab 2" },
  { source: "announcement-package-content.test.ts:93", moduleName: "Module 04", title: "Lab 4" },
  { source: "announcement-module-content.test.ts:105", moduleName: "Module 05: Recursion", title: "Lab 5" },
  { source: "canvas-modules/bulk.test.ts:75", moduleName: "Module 01", title: "Essay 1" },
  { source: "canvas-modules/bulk.test.ts:339", moduleName: "Module 02", title: "Essay 2 (page 2)" },
  { source: "canvas-modules/bulk.test.ts:64", moduleName: "Module 03", title: "Chapter 3 New Quiz" },
  { source: "canvas-modules/bulk.test.ts:107", moduleName: "Week 3", title: "Week 3 Discussion" },
  { source: "canvas-modules/bulk.test.ts:121", moduleName: "Week 4", title: "Week 4 Discussion" },
  { source: "content-tab/display-module-tree.test.ts:35", moduleName: "Week 1", title: "Week 1 reading" },
  { source: "announcement-package-zip.test.ts:41", moduleName: "Week 2", title: "Week 2: Orbits and Gravity" },
  { source: "announcement-package-zip.test.ts:47", moduleName: "Week 1", title: "Week 1: Welcome to the Cosmos" },
  { source: "animation-html.test.ts:400", moduleName: "Week 1", title: "Week 1: Algorithms" },
  { source: "lms-generation/deck/route.test.ts:115", moduleName: "Week 3", title: "Week 3: Loops" },
  { source: "announcement-module-content.test.ts:48", moduleName: "Week 1", title: "Week 1 - Kickoff" },
  { source: "announcement-module-content.test.ts:48", moduleName: "Week 03", title: "Week 03 - Recursion" },
  { source: "announcement-module-content.test.ts:37 (as an item title)", moduleName: "Module 01", title: "Module 01: Intro" },
  { source: "announcement-module-content.test.ts:37 (as an item title)", moduleName: "Module 02", title: "Module 02: Loops" },
  { source: "announcement-module-content.test.ts:166 (as an item title)", moduleName: "Module 09", title: "Module 09" },
  { source: "course-planning-grounding.test.ts:439", moduleName: "Week 10", title: "Week 10: Privilege Escalation" },
  { source: "course-planning-grounding.test.ts:445", moduleName: "Week 16", title: "Week 16: Ethical Hacking Capstone" },
  {
    source: "app/components/courses/BreaksCell.tsx:220 placeholder text",
    moduleName: "Week 8",
    title: "Week 8 - Spring Break; Nov 27-29 - Thanksgiving",
  },
  // AC D2's own worked example: two tokens, one recorded width.
  { source: "AC doc D2", moduleName: "Module 3", title: "Module 3: Week 3 Reading" },
  // AC D2's own worked example: the zero-padded scheme LOSES a digit here.
  { source: "AC doc D2", moduleName: "Module 007", title: "Module 007 Lab" },
  // AC D2's own worked example: the zero-padded scheme mis-renders this one.
  { source: "AC doc D2", moduleName: "Week 5", title: "Week 5 Homework" },
  // AC D3's own worked example: keeps the 2, tokenises the 3.
  { source: "AC doc D3", moduleName: "Module 3", title: "Reading 2 for Week 3" },
  // AC D3b's own worked example, round-tripped against ITS OWN module (12).
  // Rendered for a DIFFERENT target this is the false positive pinned below.
  { source: "AC doc D3b", moduleName: "Module 12", title: "Chapter 12 Discussion" },
  { source: "course-planning-grounding.test.ts:117", moduleName: "Week 1", title: "Week 1: Project Charters" },
  { source: "course-planning-grounding.test.ts:280", moduleName: "Week 2", title: "Week 2: Scheduling" },
  { source: "course-planning-grounding.test.ts:33", moduleName: "Module 3", title: "Module 3: Scanning Networks" },
  { source: "course-planning-grounding.test.ts:33", moduleName: "Module 2", title: "Module 2: Footprinting" },
  { source: "course-planning-grounding.test.ts:33", moduleName: "Module 1", title: "Module 1: Introduction" },
];

describe("inferItemPattern round-trips every real title against its own module number (D2 contract)", () => {
  it("covers at least 25 real titles", () => {
    expect(ROUND_TRIP_CASES.length).toBeGreaterThanOrEqual(25);
  });

  it.each(ROUND_TRIP_CASES)(
    "$title (module $moduleName) round-trips exactly",
    ({ moduleName, title }) => {
      const result = inferItemPattern(moduleName, title);
      expect(result.kind).toBe("pattern");
      const pattern = result as RenderableItemPattern;
      expect(pattern.tokenCount).toBeGreaterThanOrEqual(1);

      // The round trip: render the inferred pattern for the SOURCE module's
      // own number and expect the ORIGINAL title back, exactly.
      const sourceNumberMatch = moduleName.match(/(?:module|week)\s*0*(\d+)/i);
      expect(sourceNumberMatch).not.toBeNull();
      const sourceNumber = Number(sourceNumberMatch![1]);

      expect(renderItemPattern(pattern, sourceNumber)).toBe(title);
    }
  );
});

describe("inferItemPattern selective tokenisation (D3: value equality, not vocabulary)", () => {
  it("tokenises only the digit run matching the module number, leaving unrelated runs literal", () => {
    const result = inferItemPattern("Module 3", "Reading 2 for Week 3");
    expect(result.kind).toBe("pattern");
    const pattern = result as RenderableItemPattern;
    expect(pattern.tokenCount).toBe(1);
    expect(pattern.template).toBe("Reading 2 for Week {n}");
  });

  it("matches globally, not just the first run - both 3s tokenise", () => {
    const result = inferItemPattern("Module 3", "Module 3: Week 3 Reading");
    expect(result.kind).toBe("pattern");
    const pattern = result as RenderableItemPattern;
    expect(pattern.tokenCount).toBe(2);
    expect(pattern.template).toBe("Module {n}: Week {n} Reading");
  });

  it("records the width of the zero-padded run so a zero-padded module renders back correctly", () => {
    const result = inferItemPattern("Module 007", "Module 007 Lab");
    expect(result.kind).toBe("pattern");
    const pattern = result as RenderableItemPattern;
    expect(pattern.width).toBe(3);
  });
});

describe("inferItemPattern KNOWN FALSE POSITIVE (D3b, pinned as CURRENT, documented behaviour - do not fix here)", () => {
  it("'Chapter 12 Discussion' in Module 12, rendered for target module 3, becomes 'Chapter 03 Discussion' - wrong, and left that way", () => {
    // This is wrong: "12" here means "chapter twelve", not "module twelve".
    // No regex can tell that apart from a genuine module-number reference
    // using only the title text - the AC's mitigation is the caller's
    // proposal screen (AC5), which shows this resolved title before
    // anything is written so the instructor can deselect the row. This test
    // exists so a future reader does not mistake the false positive for a
    // bug nobody noticed.
    const result = inferItemPattern("Module 12", "Chapter 12 Discussion");
    expect(result.kind).toBe("pattern");
    const pattern = result as RenderableItemPattern;
    expect(renderItemPattern(pattern, 3)).toBe("Chapter 03 Discussion");
  });
});

describe("inferItemPattern blocked cases (D4/D4b: zero tokens is blocked, never a pattern with no tokens)", () => {
  it("blocks when the item title has no digit run at all", () => {
    const result = inferItemPattern("Module 09", "Warm-up");
    expect(result.kind).toBe("blocked");
    expect(result.kind === "blocked" && result.reasonCode).toBe("no-token-match");
  });

  it("blocks when the item's digits mean something unrelated to the module number ('Essay 1' in Module 3)", () => {
    const result = inferItemPattern("Module 3", "Essay 1");
    expect(result.kind).toBe("blocked");
    expect(result.kind === "blocked" && result.reasonCode).toBe("no-token-match");
  });

  it("blocks the false-positive's own sibling refusal ('Chapter 12 Discussion' in Module 3, AC D3's paired example)", () => {
    const result = inferItemPattern("Module 3", "Chapter 12 Discussion");
    expect(result.kind).toBe("blocked");
    expect(result.kind === "blocked" && result.reasonCode).toBe("no-token-match");
  });

  it("blocks D4b class 2 (offset numbering): Module 1 is orientation, its item says Week 2", () => {
    const result = inferItemPattern("Module 1", "Week 2");
    expect(result.kind).toBe("blocked");
    expect(result.kind === "blocked" && result.reasonCode).toBe("no-token-match");
  });

  it("blocks D4b class 1: the module name carries no number at all", () => {
    const result = inferItemPattern("Orientation", "Final Project");
    expect(result.kind).toBe("blocked");
    expect(result.kind === "blocked" && result.reasonCode).toBe("source-module-unnumbered");
  });

  it("blocks D4b class 3: the module uses vocabulary extractModuleNumber does not recognise ('Unit 5')", () => {
    // A human reading "Unit 5" / "Week 5 Homework" sees the 5 in both, but
    // extractModuleNumber only recognises "module" and "week" - so this
    // blocks even though the numbers visually agree. This is the one place
    // reusing extractModuleNumber for the module name genuinely costs
    // something (D4b), and it is not this file's job to widen that
        // vocabulary - D1 forbids adding a sixth extractor.
    const result = inferItemPattern("Unit 5", "Week 5 Homework");
    expect(result.kind).toBe("blocked");
    expect(result.kind === "blocked" && result.reasonCode).toBe("source-module-unnumbered");
  });
});

describe("parseAuthoredItemPattern (D4's affordance: instructor types {n} once)", () => {
  it("accepts a pattern containing {n} and renders it for a target number", () => {
    const result = parseAuthoredItemPattern("Week {n} Reflection");
    expect(result.kind).toBe("pattern");
    const pattern = result as RenderableItemPattern;
    expect(renderItemPattern(pattern, 7)).toBe("Week 7 Reflection");
  });

  it("renders every occurrence when the instructor uses {n} more than once", () => {
    const result = parseAuthoredItemPattern("{n} - Week {n}");
    expect(result.kind).toBe("pattern");
    const pattern = result as RenderableItemPattern;
    expect(renderItemPattern(pattern, 4)).toBe("4 - Week 4");
  });

  it("blocks a pattern with no {n} token at all - the field must contain {n}", () => {
    const result = parseAuthoredItemPattern("Final Project");
    expect(result.kind).toBe("blocked");
    expect(result.kind === "blocked" && result.reasonCode).toBe("authored-pattern-missing-token");
  });

  it("renders an authored pattern with no padding (width 0), unlike an inferred zero-padded pattern", () => {
    const result = parseAuthoredItemPattern("Module {n} Recap");
    expect(result.kind).toBe("pattern");
    const pattern = result as RenderableItemPattern;
    expect(renderItemPattern(pattern, 7)).toBe("Module 7 Recap");
  });
});
