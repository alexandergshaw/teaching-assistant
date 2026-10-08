// Oracle for src/app/components/grading-results/unresolvedNameLabel.ts.
// The literal is the contract: nothing renders under vitest, so the visible
// text is pinned here as a plain string value.
import { describe, expect, it } from "vitest";
import { UNRESOLVED_NAME_LABEL, describeUnresolvedNameLabel } from "./unresolvedNameLabel";

describe("unresolvedNameLabel", () => {
  it("is the frozen literal", () => {
    expect(UNRESOLVED_NAME_LABEL).toBe("Name not found - add a label");
    expect(describeUnresolvedNameLabel()).toBe("Name not found - add a label");
  });

  it("is plain ASCII text", () => {
    expect(/^[\x20-\x7e]+$/.test(UNRESOLVED_NAME_LABEL)).toBe(true);
  });
});
