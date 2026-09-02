import { describe, it, expect } from "vitest";
import { returnTargetPageId } from "./grading-context-display";

// formatContextPagesList's suite was deleted with the function itself - see
// grading-context-display.ts's header. Keeping tests for an export nothing
// calls makes dead code look maintained, which is the failure this session
// kept finding rather than a standard worth preserving.

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
