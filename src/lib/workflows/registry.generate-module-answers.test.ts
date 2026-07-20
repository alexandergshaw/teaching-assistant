import { describe, it, expect } from "vitest";
import { getStepDefinition } from "./registry";

describe("generate-module-answers step", () => {
  const def = getStepDefinition("generate-module-answers");
  expect(def, "generate-module-answers step exists").toBeTruthy();

  it("has the correct name and category", () => {
    expect(def!.name).toBe("Generate module homework answers");
    expect(def!.type).toBe("generate-module-answers");
  });

  it("mentions grounding in module materials in the description", () => {
    const desc = def!.description;
    expect(desc).toContain("grounded in the module's objectives and materials");
  });

  it("has required inputs: hubCourse", () => {
    const hubCourseInput = def!.inputs.find((i) => i.key === "hubCourse");
    expect(hubCourseInput, "hubCourse input exists").toBeTruthy();
    expect(hubCourseInput!.type).toBe("hubCourse");
    expect(hubCourseInput!.required).toBe(true);
  });

  it("has optional inputs: moduleId and maxItems", () => {
    const moduleIdInput = def!.inputs.find((i) => i.key === "moduleId");
    expect(moduleIdInput, "moduleId input exists").toBeTruthy();
    expect(moduleIdInput!.type).toBe("lmsModule");
    expect(moduleIdInput!.required).toBe(false);

    const maxItemsInput = def!.inputs.find((i) => i.key === "maxItems");
    expect(maxItemsInput, "maxItems input exists").toBeTruthy();
    expect(maxItemsInput!.type).toBe("number");
    expect(maxItemsInput!.required).toBe(false);
  });

  it("has correct outputs: answers, report, generated, hasGenerated", () => {
    const answersOutput = def!.outputs.find((o) => o.key === "answers");
    expect(answersOutput, "answers output exists").toBeTruthy();
    expect(answersOutput!.type).toBe("longtext");

    const reportOutput = def!.outputs.find((o) => o.key === "report");
    expect(reportOutput, "report output exists").toBeTruthy();
    expect(reportOutput!.type).toBe("longtext");

    const generatedOutput = def!.outputs.find((o) => o.key === "generated");
    expect(generatedOutput, "generated output exists").toBeTruthy();
    expect(generatedOutput!.type).toBe("number");

    const hasGeneratedOutput = def!.outputs.find((o) => o.key === "hasGenerated");
    expect(hasGeneratedOutput, "hasGenerated output exists").toBeTruthy();
    expect(hasGeneratedOutput!.type).toBe("boolean");
  });

  it("has exactly 4 outputs", () => {
    expect(def!.outputs.length).toBe(4);
  });

  it("has exactly 3 inputs", () => {
    expect(def!.inputs.length).toBe(3);
  });
});
