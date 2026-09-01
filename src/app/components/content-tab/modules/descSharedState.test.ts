import { describe, expect, it } from "vitest";
import { classifyDescriptionShare } from "./descSharedState";

describe("classifyDescriptionShare", () => {
  it("is idle when nothing was successfully read at all", () => {
    // Every fetch failed - checkedCount is 0, so there is nothing to claim
    // (this matches the pre-existing "idle" behaviour for a total failure,
    // which was never the bug S2 fixes).
    const result = classifyDescriptionShare([], 5);
    expect(result.state).toBe("idle");
    expect(result.description).toBe("");
    expect(result.uncheckedCount).toBe(0);
  });

  it("is 'same' and pre-fills the shared value when every selected item was read and they agree", () => {
    const result = classifyDescriptionShare(["Read chapter 3", "Read chapter 3", "Read chapter 3"], 3);
    expect(result.state).toBe("same");
    expect(result.description).toBe("Read chapter 3");
    expect(result.uncheckedCount).toBe(0);
  });

  it("is 'mixed' and clears the field when every selected item was read but they differ", () => {
    const result = classifyDescriptionShare(["A", "B", "C"], 3);
    expect(result.state).toBe("mixed");
    expect(result.description).toBe("");
  });

  // THE BUG S2 FIXES: select 10 assignments, 5 fetches fail, the surviving 5
  // happen to share a description. The old code only ever looked at the 5
  // successes and reported "same" - a confident claim the app never
  // verified for the other 5, immediately ahead of an unconfirmed overwrite
  // (bulkSetDescription) that would have replaced all 10.
  it("is 'partial' - NEVER 'same' - when some fetches failed, even though the survivors all agree", () => {
    const result = classifyDescriptionShare(["Read chapter 3", "Read chapter 3", "Read chapter 3", "Read chapter 3", "Read chapter 3"], 10);
    expect(result.state).toBe("partial");
    expect(result.state).not.toBe("same");
    expect(result.uncheckedCount).toBe(5);
    expect(result.totalCount).toBe(10);
  });

  it("is 'partial' when some fetches failed and the survivors disagree too", () => {
    const result = classifyDescriptionShare(["A", "B"], 5);
    expect(result.state).toBe("partial");
    expect(result.uncheckedCount).toBe(3);
  });

  it("never pre-fills the description field from a partial read - nothing feeds the unconfirmed overwrite", () => {
    // Every successful fetch agrees, which is exactly the case a naive fix
    // (branch on `descs.every(...)` first, check counts second) would still
    // get wrong by pre-filling the box with the agreed value.
    const result = classifyDescriptionShare(["Same text", "Same text"], 4);
    expect(result.state).toBe("partial");
    expect(result.description).toBe("");
  });
});
