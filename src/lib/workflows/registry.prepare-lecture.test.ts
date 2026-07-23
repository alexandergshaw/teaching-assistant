import { describe, it, expect } from "vitest";
import { getStepDefinition } from "./registry";

describe("prepare-lecture step", () => {
  const def = getStepDefinition("prepare-lecture");
  expect(def, "prepare-lecture step exists").toBeTruthy();

  it("has the correct name and category", () => {
    expect(def!.name).toBe("Prepare lecture");
    expect(def!.type).toBe("prepare-lecture");
  });

  it("mentions grounding in module materials in the description", () => {
    const desc = def!.description;
    expect(desc).toContain("module's materials");
  });

  it("has optional inputs: hubCourse, moduleId, autonomous, template, and modulesAhead", () => {
    const hubCourseInput = def!.inputs.find((i) => i.key === "hubCourse");
    expect(hubCourseInput, "hubCourse input exists").toBeTruthy();
    expect(hubCourseInput!.type).toBe("hubCourse");
    expect(hubCourseInput!.required).toBe(false);

    const moduleIdInput = def!.inputs.find((i) => i.key === "moduleId");
    expect(moduleIdInput, "moduleId input exists").toBeTruthy();
    expect(moduleIdInput!.type).toBe("lmsModule");
    expect(moduleIdInput!.required).toBe(false);

    const autonomousInput = def!.inputs.find((i) => i.key === "autonomous");
    expect(autonomousInput, "autonomous input exists").toBeTruthy();
    expect(autonomousInput!.type).toBe("boolean");
    expect(autonomousInput!.required).toBe(false);

    const templateInput = def!.inputs.find((i) => i.key === "template");
    expect(templateInput, "template input exists").toBeTruthy();
    expect(templateInput!.type).toBe("deckTemplate");
    expect(templateInput!.required).toBe(false);

    const modulesAheadInput = def!.inputs.find((i) => i.key === "modulesAhead");
    expect(modulesAheadInput, "modulesAhead input exists").toBeTruthy();
    expect(modulesAheadInput!.type).toBe("moduleOffset");
    expect(modulesAheadInput!.required).toBe(false);

    const sourcesInput = def!.inputs.find((i) => i.key === "sources");
    expect(sourcesInput, "sources input exists").toBeTruthy();
    expect(sourcesInput!.type).toBe("sourcePolicy");
    expect(sourcesInput!.required).toBe(false);
  });

  it("has correct outputs: announcement and moduleName", () => {
    const announcementOutput = def!.outputs.find((o) => o.key === "announcement");
    expect(announcementOutput, "announcement output exists").toBeTruthy();
    expect(announcementOutput!.type).toBe("longtext");

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
