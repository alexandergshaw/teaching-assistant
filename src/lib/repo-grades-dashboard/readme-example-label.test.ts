import { describe, expect, it } from "vitest";
import { readmeExampleLabel } from "./readme-example-label";

describe("README diagnostic examples", () => {
  it("labels a missing or conflicting example as non-exhaustive", () => {
    expect(readmeExampleLabel("missing-instruction-evidence", { kind: "blank", repo: "class/repo" }))
      .toContain("First observed example: class/repo has a blank assignment README");
    expect(readmeExampleLabel("conflicting-instructions", { kind: "conflict", repo: "class/a", comparedRepo: "class/b" }))
      .toContain("class/a and class/b");
  });
  it("does not expose invalid or unrelated data", () => {
    expect(readmeExampleLabel("missing-instruction-evidence", { kind: "blank", repo: "secret\ntext" })).toBe("");
    expect(readmeExampleLabel("unavailable", { kind: "blank", repo: "class/repo" })).toBe("");
  });
});
