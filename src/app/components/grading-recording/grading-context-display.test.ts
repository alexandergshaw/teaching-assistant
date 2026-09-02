import { describe, it, expect } from "vitest";
import { formatContextPagesList, returnTargetPageId } from "./grading-context-display";

describe("formatContextPagesList (AC2 - a list of page titles must read as information, not clutter)", () => {
  it("returns empty string for undefined - carrying nothing renders nothing", () => {
    expect(formatContextPagesList(undefined)).toBe("");
  });

  it("returns empty string for an empty array", () => {
    expect(formatContextPagesList([])).toBe("");
  });

  it("joins every title with no overflow note when the list fits the cap", () => {
    const pages = [
      { id: "1", title: "Grading rubric" },
      { id: "2", title: "Late policy" },
    ];
    expect(formatContextPagesList(pages)).toBe("Grading rubric, Late policy");
  });

  it("SABOTAGE TARGET: folds anything past the cap into a stated '+N more', never a silent cutoff", () => {
    const pages = Array.from({ length: 8 }, (_, i) => ({ id: String(i), title: `Page ${i + 1}` }));
    const text = formatContextPagesList(pages, 5);
    expect(text).toBe("Page 1, Page 2, Page 3, Page 4, Page 5 +3 more");
    // Never silently drop the overflow - it must be STATED, not just absent.
    expect(text).toContain("+3 more");
  });

  it("shows every title exactly at the cap boundary, with no overflow note", () => {
    const pages = Array.from({ length: 5 }, (_, i) => ({ id: String(i), title: `Page ${i + 1}` }));
    expect(formatContextPagesList(pages, 5)).toBe("Page 1, Page 2, Page 3, Page 4, Page 5");
  });

  it("falls back to 'Untitled page' for a blank title, never an empty string in the list", () => {
    const pages = [{ id: "1", title: "   " }];
    expect(formatContextPagesList(pages)).toBe("Untitled page");
  });

  it("respects a custom maxShown", () => {
    const pages = [
      { id: "1", title: "A" },
      { id: "2", title: "B" },
      { id: "3", title: "C" },
    ];
    expect(formatContextPagesList(pages, 1)).toBe("A +2 more");
  });
});

describe("returnTargetPageId (AC4 - which page 'Back to Knowledge' lands on)", () => {
  it("returns undefined for undefined pages - returnToKnowledge() falls back to a bare tab switch", () => {
    expect(returnTargetPageId(undefined)).toBeUndefined();
  });

  it("returns undefined for an empty array", () => {
    expect(returnTargetPageId([])).toBeUndefined();
  });

  it("returns the FIRST page's id, not the last or any other", () => {
    const pages = [
      { id: "first", title: "A" },
      { id: "second", title: "B" },
    ];
    expect(returnTargetPageId(pages)).toBe("first");
  });
});
