import { describe, it, expect } from "vitest";
import { getStepDefinition } from "./registry";

describe("lecture-qa step", () => {
  const def = getStepDefinition("lecture-qa");
  expect(def, "lecture-qa step exists").toBeTruthy();

  it("has the correct name and category", () => {
    expect(def!.name).toBe("Anticipate lecture Q&A");
    expect(def!.type).toBe("lecture-qa");
  });

  it("mentions grounding in module materials in the description", () => {
    const desc = def!.description;
    expect(desc).toContain("module's materials");
  });

  it("has required inputs: hubCourse", () => {
    const hubCourseInput = def!.inputs.find((i) => i.key === "hubCourse");
    expect(hubCourseInput, "hubCourse input exists").toBeTruthy();
    expect(hubCourseInput!.type).toBe("hubCourse");
    expect(hubCourseInput!.required).toBe(true);
  });

  it("has optional inputs: moduleId, slides, slidesText, and modulesAhead", () => {
    const moduleIdInput = def!.inputs.find((i) => i.key === "moduleId");
    expect(moduleIdInput, "moduleId input exists").toBeTruthy();
    expect(moduleIdInput!.type).toBe("lmsModule");
    expect(moduleIdInput!.required).toBe(false);

    const slidesInput = def!.inputs.find((i) => i.key === "slides");
    expect(slidesInput, "slides input exists").toBeTruthy();
    expect(slidesInput!.type).toBe("uploads");
    expect(slidesInput!.required).toBe(false);

    const slidesTextInput = def!.inputs.find((i) => i.key === "slidesText");
    expect(slidesTextInput, "slidesText input exists").toBeTruthy();
    expect(slidesTextInput!.type).toBe("longtext");
    expect(slidesTextInput!.required).toBe(false);

    const modulesAheadInput = def!.inputs.find((i) => i.key === "modulesAhead");
    expect(modulesAheadInput, "modulesAhead input exists").toBeTruthy();
    expect(modulesAheadInput!.type).toBe("moduleOffset");
    expect(modulesAheadInput!.required).toBe(false);

    const sourcesInput = def!.inputs.find((i) => i.key === "sources");
    expect(sourcesInput, "sources input exists").toBeTruthy();
    expect(sourcesInput!.type).toBe("sourcePolicy");
    expect(sourcesInput!.required).toBe(false);
  });

  it("has correct outputs: qaText and moduleName", () => {
    const qaTextOutput = def!.outputs.find((o) => o.key === "qaText");
    expect(qaTextOutput, "qaText output exists").toBeTruthy();
    expect(qaTextOutput!.type).toBe("longtext");

    const moduleNameOutput = def!.outputs.find((o) => o.key === "moduleName");
    expect(moduleNameOutput, "moduleName output exists").toBeTruthy();
    expect(moduleNameOutput!.type).toBe("text");
  });

  it("has exactly 2 outputs", () => {
    expect(def!.outputs.length).toBe(2);
  });

  it("has exactly 6 inputs", () => {
    expect(def!.inputs.length).toBe(6);
  });
});
