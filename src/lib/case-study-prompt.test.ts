import { describe, it, expect } from "vitest";
import {
  buildCaseStudyExclusionBlock,
  buildCaseStudyAnchorBlock,
  buildOpenerContinuityBlock,
} from "./case-study-prompt";

describe("buildCaseStudyExclusionBlock", () => {
  it("returns '' when both lists are empty", () => {
    expect(buildCaseStudyExclusionBlock([], [])).toBe("");
  });

  it("returns '' when usedCaseStudies is empty and otherWeeksCaseStudyNames is omitted", () => {
    expect(buildCaseStudyExclusionBlock([])).toBe("");
  });

  it("includes every name from both lists", () => {
    const block = buildCaseStudyExclusionBlock(["Healthcare.gov"], ["Denver International Airport"]);
    expect(block).toContain("Healthcare.gov");
    expect(block).toContain("Denver International Airport");
    expect(block).toContain("CASE STUDIES ALREADY USED IN THIS COURSE");
  });

  it("deduplicates case-insensitively, keeping first-seen order", () => {
    const block = buildCaseStudyExclusionBlock(["Healthcare.gov"], ["healthcare.GOV", "Big Dig"]);
    const occurrences = block.match(/Healthcare\.gov/gi) ?? [];
    expect(occurrences.length).toBe(1);
    expect(block).toContain("Big Dig");
  });

  it("drops blank/whitespace-only entries", () => {
    const block = buildCaseStudyExclusionBlock(["", "  "], ["Big Dig"]);
    expect(block).toContain("Big Dig");
    expect(block.split("Big Dig")[0]).not.toMatch(/;\s*;/);
  });
});

describe("buildCaseStudyAnchorBlock", () => {
  it("returns '' when no assignment is given", () => {
    expect(buildCaseStudyAnchorBlock(undefined)).toBe("");
  });

  it("names the organization and states the period when confidently known", () => {
    const block = buildCaseStudyAnchorBlock({
      organization: "Denver International Airport",
      period: "1994-1995",
      hook: "The automated baggage system failed testing.",
    });
    expect(block).toContain("Denver International Airport");
    expect(block).toContain("1994-1995");
    expect(block).toContain("MUST be built on this exact case");
  });

  // V2: a year is a factual claim - when the up-front plan could not confirm
  // one, the anchor block must say so explicitly rather than let the model
  // guess or silently omit the caution.
  it("explicitly forbids a specific year when no period was established", () => {
    const block = buildCaseStudyAnchorBlock({
      organization: "Some Organization",
      hook: "What happened and why it fits.",
    });
    expect(block).toContain("not established with confidence");
    expect(block).toContain("do not state a specific year");
  });

  // V1-AC3: the anchor is shared, but In Practice slides must stay distinct -
  // including never a title implying repetition, the literal defect the
  // audit found ("The 1999 Mars Climate Orbiter Loss (Again)").
  it("tells the deck every In Practice slide must use a different organization, never implying repetition", () => {
    const block = buildCaseStudyAnchorBlock({ organization: "Org X", hook: "hook" });
    expect(block).toContain("DIFFERENT organization");
    expect(block).toContain("(Again)");
  });
});

describe("buildOpenerContinuityBlock", () => {
  it("returns '' for blank opener context", () => {
    expect(buildOpenerContinuityBlock("")).toBe("");
    expect(buildOpenerContinuityBlock("   ")).toBe("");
  });

  it("includes the opener text verbatim", () => {
    const block = buildOpenerContinuityBlock("OPENER_MARKER_TEXT");
    expect(block).toContain("OPENER_MARKER_TEXT");
    expect(block).toContain("THIS WEEK'S CLASS OPENER");
  });

  // V1-AC1: the root-cause fix - the old instruction ("do not re-teach")
  // must be gone, replaced with the opposite (build on it, don't substitute).
  it("instructs the deck to build on the opener's case, never substitute a different one, and never re-teach it verbatim", () => {
    const block = buildOpenerContinuityBlock("some opener text");
    expect(block).toContain("Your Case Study slide must be the SAME case the opener just discussed");
    expect(block).toContain("do not substitute a different case study");
    expect(block).not.toContain("do NOT re-teach that case study");
  });
});
