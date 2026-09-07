import { describe, it, expect } from "vitest";

import { walkthroughAnnouncementMaxOutputTokens } from "./walkthrough-announcement-bounds";
import { EMPTY_ANNOUNCEMENT_OUTLINE, type AnnouncementOutline, type OutlineSection } from "./announcement-outline-types";

// THINKING_HEADROOM_TOKENS in walkthrough-announcement-bounds.ts - not
// exported (module-private, matching lecture-script-bounds.ts's own
// pattern), so it is pinned here as a literal the way that file's own test
// suite pins its equivalent. This is the number the empty-outline test below
// must exceed, per this file's whole reason to exist.
const THINKING_FLOOR = 512;

function section(overrides: Partial<OutlineSection> = {}): OutlineSection {
  return {
    index: 1,
    heading: null,
    break: "paragraph-break",
    listKind: null,
    sentenceRange: [1, 3],
    ...overrides,
  };
}

function outlineWithSections(count: number, maxSentences: number): AnnouncementOutline {
  const sections: OutlineSection[] = [];
  for (let i = 0; i < count; i++) {
    sections.push(section({ index: i + 1, sentenceRange: [1, maxSentences] }));
  }
  return { ...EMPTY_ANNOUNCEMENT_OUTLINE, sections };
}

describe("walkthroughAnnouncementMaxOutputTokens", () => {
  it("gives a bigger outline a strictly bigger budget than a smaller one", () => {
    const small = outlineWithSections(5, 5);
    const large = outlineWithSections(10, 10);

    const smallBudget = walkthroughAnnouncementMaxOutputTokens(small);
    const largeBudget = walkthroughAnnouncementMaxOutputTokens(large);

    expect(largeBudget).toBeGreaterThan(smallBudget);
  });

  it("grows monotonically as sections are added, one at a time", () => {
    const budgets = [1, 3, 6, 9].map((count) => walkthroughAnnouncementMaxOutputTokens(outlineWithSections(count, 8)));
    for (let i = 1; i < budgets.length; i++) {
      expect(budgets[i]).toBeGreaterThan(budgets[i - 1]);
    }
  });

  it("does NOT return a value at or below the thinking floor for an empty outline - the bug that shipped once already", () => {
    const budget = walkthroughAnnouncementMaxOutputTokens(EMPTY_ANNOUNCEMENT_OUTLINE);
    expect(budget).toBeGreaterThan(THINKING_FLOOR);
  });

  it("does NOT return a value at or below the thinking floor for a tiny (single short section) outline", () => {
    const tiny = outlineWithSections(1, 1);
    const budget = walkthroughAnnouncementMaxOutputTokens(tiny);
    expect(budget).toBeGreaterThan(THINKING_FLOOR);
  });

  it("clamps an absurdly large outline to a stated ceiling rather than requesting an unbounded budget", () => {
    const absurd = outlineWithSections(500, 200);
    const budget = walkthroughAnnouncementMaxOutputTokens(absurd);
    expect(budget).toBeLessThanOrEqual(8192);
    expect(budget).toBe(8192);
  });

  it("never returns a non-finite or negative value regardless of outline shape", () => {
    expect(Number.isFinite(walkthroughAnnouncementMaxOutputTokens(EMPTY_ANNOUNCEMENT_OUTLINE))).toBe(true);
    expect(walkthroughAnnouncementMaxOutputTokens(EMPTY_ANNOUNCEMENT_OUTLINE)).toBeGreaterThan(0);
  });
});
