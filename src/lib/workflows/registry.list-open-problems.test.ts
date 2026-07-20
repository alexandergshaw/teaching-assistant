import { describe, it, expect } from "vitest";
import { getStepDefinition } from "./registry";

describe("list-open-problems step", () => {
  const def = getStepDefinition("list-open-problems");
  expect(def, "list-open-problems step exists").toBeTruthy();

  it("has correct name", () => {
    expect(def!.name).toBe("List open problems");
  });

  it("has no inputs", () => {
    expect(def!.inputs.length).toBe(0);
  });

  it("has correct outputs", () => {
    const outputKeys = def!.outputs.map((o) => o.key);
    expect(outputKeys).toContain("problems");
    expect(outputKeys).toContain("count");
    expect(outputKeys).toContain("hasProblems");
  });

  it("problems output is of type longtext", () => {
    const problemsOutput = def!.outputs.find((o) => o.key === "problems");
    expect(problemsOutput?.type).toBe("longtext");
  });

  it("count output is of type number", () => {
    const countOutput = def!.outputs.find((o) => o.key === "count");
    expect(countOutput?.type).toBe("number");
  });

  it("hasProblems output is of type boolean", () => {
    const hasProblemsOutput = def!.outputs.find((o) => o.key === "hasProblems");
    expect(hasProblemsOutput?.type).toBe("boolean");
  });

  it("run method exists", () => {
    expect(typeof def!.run).toBe("function");
  });
});
