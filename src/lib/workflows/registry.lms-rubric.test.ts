import { describe, it, expect } from "vitest";
import { getStepDefinition } from "./registry";

describe("lms-rubric step inputs", () => {
  const def = getStepDefinition("lms-rubric");
  expect(def, "lms-rubric step exists").toBeTruthy();

  it("has repo input that is optional", () => {
    const repoInput = def!.inputs.find((inp) => inp.key === "repo");
    expect(repoInput, "repo input exists").toBeTruthy();
    expect(repoInput!.required).toBe(false);
    expect(repoInput!.help?.toLowerCase()).toContain("optional");
  });

  it("has description input that is optional and longtext type", () => {
    const descInput = def!.inputs.find((inp) => inp.key === "description");
    expect(descInput, "description input exists").toBeTruthy();
    expect(descInput!.required).toBe(false);
    expect(descInput!.type).toBe("longtext");
    expect(descInput!.help?.toLowerCase()).toContain("fallback");
  });

  it("has schedule input that is optional and schedule type", () => {
    const schedInput = def!.inputs.find((inp) => inp.key === "schedule");
    expect(schedInput, "schedule input exists").toBeTruthy();
    expect(schedInput!.required).toBe(false);
    expect(schedInput!.type).toBe("schedule");
  });

  it("has description field mentioning the schedule", () => {
    expect(def!.description).toContain("schedule");
    expect(def!.description.toLowerCase()).toContain("no repository");
  });
});
