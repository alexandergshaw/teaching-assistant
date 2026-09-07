import { describe, it, expect } from "vitest";
import { deriveWalkthroughPageCoverage, renderWalkthroughCoverageBlock, type WalkthroughPageCoverage } from "./walkthrough-announcement-coverage";
import type { ExtractedBlock } from "../module-deck-capture/module-extraction-prompt";

function block(heading: string, text: string, illegible = false): ExtractedBlock {
  return { heading, text, kind: "prose", illegible: illegible || undefined };
}

describe("deriveWalkthroughPageCoverage", () => {
  it("returns one page per distinct heading, in first-appearance order", () => {
    const blocks = [block("Week 4 Overview", "a"), block("Week 4 Overview", "b"), block("Assignment 3", "c")];
    expect(deriveWalkthroughPageCoverage(blocks)).toEqual([
      { title: "Week 4 Overview", legible: true },
      { title: "Assignment 3", legible: true },
    ]);
  });

  it("AC4: a page walked twice (non-adjacent) is covered once, at its first appearance - not moved and not duplicated", () => {
    const blocks = [
      block("Week 4 Overview", "a"),
      block("Assignment 3", "b"),
      // Scrolled back to Week 4 later - same heading, non-adjacent.
      block("Week 4 Overview", "c"),
    ];
    const pages = deriveWalkthroughPageCoverage(blocks);
    expect(pages).toHaveLength(2);
    expect(pages[0].title).toBe("Week 4 Overview");
    expect(pages[1].title).toBe("Assignment 3");
  });

  it("a heading of all-whitespace/empty falls back to \"Untitled\"", () => {
    const blocks = [block("", "a"), block("   ", "b")];
    // Both fall back to the same "Untitled" title, so they fold into ONE page.
    expect(deriveWalkthroughPageCoverage(blocks)).toEqual([{ title: "Untitled", legible: true }]);
  });

  it("AC6: a page whose every block is illegible is reported as not legible, never silently dropped", () => {
    const blocks = [block("Blurry Page", "x", true), block("Blurry Page", "y", true)];
    expect(deriveWalkthroughPageCoverage(blocks)).toEqual([{ title: "Blurry Page", legible: false }]);
  });

  it("a page with one illegible block and one legible block (in either order) is legible", () => {
    const forward = deriveWalkthroughPageCoverage([block("P", "a", true), block("P", "b", false)]);
    expect(forward).toEqual([{ title: "P", legible: true }]);

    const backward = deriveWalkthroughPageCoverage([block("P", "a", false), block("P", "b", true)]);
    expect(backward).toEqual([{ title: "P", legible: true }]);
  });

  it("returns an empty array for an empty block list", () => {
    expect(deriveWalkthroughPageCoverage([])).toEqual([]);
  });

  // Sabotage check 1: replacing the Map-based "first appearance wins" lookup
  // with a naive `pages.findIndex(...)` re-scan every iteration would still
  // pass every assertion above (same output), so this test pins the
  // DISTINCTNESS property directly - three real pages must never collapse
  // to fewer than three, which is the failure mode a broken title-normalizing
  // step (e.g. lowercasing headings) would introduce silently.
  it("sabotage check: distinct, differently-cased headings never collapse into one page (no implicit case-folding)", () => {
    const blocks = [block("Week 4", "a"), block("week 4", "b"), block("WEEK 4", "c")];
    expect(deriveWalkthroughPageCoverage(blocks)).toHaveLength(3);
  });
});

describe("renderWalkthroughCoverageBlock", () => {
  it("returns \"\" for an empty pages list, so the prompt composer's own coverageBlock.trim() check omits the section entirely", () => {
    expect(renderWalkthroughCoverageBlock([])).toBe("");
  });

  it("renders numbered page markers BY INDEX (never by title) plus an all-legible line", () => {
    const pages: WalkthroughPageCoverage[] = [
      { title: "Week 4 Overview", legible: true },
      { title: "Assignment 3", legible: true },
    ];
    const rendered = renderWalkthroughCoverageBlock(pages);
    expect(rendered).toBe(
      "[P1] Week 4 Overview\n[P2] Assignment 3\nEvery captured page above had at least some legible text."
    );
  });

  it("names an unreadable page by its marker and title, without dropping it", () => {
    const pages: WalkthroughPageCoverage[] = [
      { title: "Week 4 Overview", legible: true },
      { title: "Blurry Page", legible: false },
    ];
    const rendered = renderWalkthroughCoverageBlock(pages);
    expect(rendered).toBe(
      "[P1] Week 4 Overview\n[P2] Blurry Page\nCould not be read (too little legible text): [P2] Blurry Page."
    );
  });

  it("lists every unreadable page when there is more than one, separated by semicolons", () => {
    const pages: WalkthroughPageCoverage[] = [
      { title: "A", legible: false },
      { title: "B", legible: true },
      { title: "C", legible: false },
    ];
    const rendered = renderWalkthroughCoverageBlock(pages);
    const lines = rendered.split("\n");
    // renderPageMarkers joins all N page markers as ONE multi-line string
    // (one marker per line), so the trailing coverage line always lands at
    // index N (3 pages -> markers occupy lines 0-2, coverage line at 3) -
    // never a fixed index regardless of how many pages were captured.
    expect(lines).toHaveLength(pages.length + 1);
    expect(lines[pages.length]).toBe("Could not be read (too little legible text): [P1] A; [P3] C.");
  });

  // Sabotage check 2: if the "could not be read" branch's condition were
  // inverted (`unreadable.length === 0` firing the WARNING line instead of
  // the all-clear one), this test would still see SOME third line and could
  // pass on a shape check alone - pinning the exact literal text is what
  // catches the inversion.
  it("sabotage check: the all-clear line is the exact literal, not merely non-empty", () => {
    const rendered = renderWalkthroughCoverageBlock([{ title: "Only Page", legible: true }]);
    const thirdLine = rendered.split("\n")[1];
    expect(thirdLine).toBe("Every captured page above had at least some legible text.");
    expect(thirdLine).not.toMatch(/could not be read/i);
  });
});
