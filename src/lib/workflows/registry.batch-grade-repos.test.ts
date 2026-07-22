import { describe, it, expect } from "vitest";
import { STEP_REGISTRY } from "./registry";

describe("batch-grade-repos-to-draft step", () => {
  it("step is defined with correct type and name", () => {
    const step = STEP_REGISTRY.find((s) => s.type === "batch-grade-repos-to-draft");
    expect(step).toBeDefined();
    expect(step?.name).toContain("Batch grade");
    expect(step?.name).toContain("repo");
    expect(step?.name).toContain("draft");
  });
});
