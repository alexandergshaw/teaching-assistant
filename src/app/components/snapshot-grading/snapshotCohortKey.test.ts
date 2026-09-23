import { describe, it, expect } from "vitest";
import { computeAssignmentCohortKey } from "./snapshotCohortKey";

describe("computeAssignmentCohortKey", () => {
  it("returns '' for empty text", () => {
    expect(computeAssignmentCohortKey("")).toBe("");
  });

  it("returns '' for whitespace-only text (trimmed before hashing)", () => {
    expect(computeAssignmentCohortKey("   \n\t  ")).toBe("");
  });

  it("is deterministic: the same text always produces the same digest", () => {
    const a = computeAssignmentCohortKey("Write a five-paragraph essay on photosynthesis.");
    const b = computeAssignmentCohortKey("Write a five-paragraph essay on photosynthesis.");
    expect(a).toBe(b);
  });

  it("produces different digests for different text", () => {
    const a = computeAssignmentCohortKey("Assignment A");
    const b = computeAssignmentCohortKey("Assignment B");
    expect(a).not.toBe(b);
  });

  it("is insensitive to leading/trailing whitespace only, not internal whitespace", () => {
    const a = computeAssignmentCohortKey("Assignment A");
    const b = computeAssignmentCohortKey("  Assignment A  \n");
    expect(a).toBe(b);
  });

  it("never returns the empty string for genuinely non-blank text (no collision with the blank sentinel)", () => {
    expect(computeAssignmentCohortKey("x")).not.toBe("");
  });

  it("returns a lowercase hex string for non-blank text", () => {
    expect(computeAssignmentCohortKey("Assignment A")).toMatch(/^[0-9a-f]+$/);
  });
});
