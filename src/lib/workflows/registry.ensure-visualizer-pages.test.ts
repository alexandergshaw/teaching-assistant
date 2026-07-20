import { describe, it, expect } from "vitest";
import { getStepDefinition } from "./registry";

describe("ensure-visualizer-pages step", () => {
  const def = getStepDefinition("ensure-visualizer-pages");
  expect(def, "ensure-visualizer-pages step exists").toBeTruthy();

  it("has correct name", () => {
    expect(def!.name).toBe("Ensure concept visualizer pages");
  });

  it("has correct inputs", () => {
    const inputKeys = def!.inputs.map((i) => i.key);
    expect(inputKeys).toContain("courses");
    expect(inputKeys).toContain("lookahead");
    expect(inputKeys).toContain("concepts");
    expect(inputKeys).toContain("maxConcepts");
  });

  it("courses input is required", () => {
    const coursesInput = def!.inputs.find((i) => i.key === "courses");
    expect(coursesInput?.required).toBe(true);
  });

  it("lookahead, concepts, maxConcepts are optional", () => {
    const lookahead = def!.inputs.find((i) => i.key === "lookahead");
    const concepts = def!.inputs.find((i) => i.key === "concepts");
    const maxConcepts = def!.inputs.find((i) => i.key === "maxConcepts");
    expect(lookahead?.required).toBe(false);
    expect(concepts?.required).toBe(false);
    expect(maxConcepts?.required).toBe(false);
  });

  it("has correct outputs", () => {
    const outputKeys = def!.outputs.map((o) => o.key);
    expect(outputKeys).toContain("report");
    expect(outputKeys).toContain("links");
    expect(outputKeys).toContain("hasCreated");
  });

  it("run method exists", () => {
    expect(typeof def!.run).toBe("function");
  });
});
