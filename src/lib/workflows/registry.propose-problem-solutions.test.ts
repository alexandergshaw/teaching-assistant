import { describe, it, expect } from "vitest";
import { getStepDefinition } from "./registry";

describe("propose-problem-solutions step", () => {
  const def = getStepDefinition("propose-problem-solutions");
  expect(def, "propose-problem-solutions step exists").toBeTruthy();

  it("has correct name", () => {
    expect(def!.name).toBe("Propose solutions to problems");
  });

  it("has correct inputs", () => {
    const inputKeys = def!.inputs.map((i) => i.key);
    expect(inputKeys).toContain("problems");
  });

  it("problems input is required", () => {
    const problemsInput = def!.inputs.find((i) => i.key === "problems");
    expect(problemsInput?.required).toBe(true);
  });

  it("problems input is of type longtext", () => {
    const problemsInput = def!.inputs.find((i) => i.key === "problems");
    expect(problemsInput?.type).toBe("longtext");
  });

  it("has correct outputs", () => {
    const outputKeys = def!.outputs.map((o) => o.key);
    expect(outputKeys).toContain("report");
    expect(outputKeys).toContain("proposed");
  });

  it("report output is of type longtext", () => {
    const reportOutput = def!.outputs.find((o) => o.key === "report");
    expect(reportOutput?.type).toBe("longtext");
  });

  it("proposed output is of type number", () => {
    const proposedOutput = def!.outputs.find((o) => o.key === "proposed");
    expect(proposedOutput?.type).toBe("number");
  });

  it("run method exists", () => {
    expect(typeof def!.run).toBe("function");
  });
});
