import { describe, it, expect } from "vitest";
import { getStepDefinition } from "./registry";

describe("generate-class-openers step", () => {
  const def = getStepDefinition("generate-class-openers");
  expect(def, "generate-class-openers step is registered").toBeTruthy();

  it("has the correct name and description", () => {
    expect(def!.name).toBe("Generate class openers");
    expect(def!.description).toContain("~30-minute class openers");
  });

  it("has a required schedule input", () => {
    const scheduleInput = def!.inputs.find((inp) => inp.key === "schedule");
    expect(scheduleInput).toBeTruthy();
    expect(scheduleInput!.required).toBe(true);
    expect(scheduleInput!.type).toBe("schedule");
  });

  it("has an optional hubCourse input", () => {
    const hubCourseInput = def!.inputs.find((inp) => inp.key === "hubCourse");
    expect(hubCourseInput).toBeTruthy();
    expect(hubCourseInput!.required).toBe(false);
    expect(hubCourseInput!.type).toBe("hubCourse");
  });

  it("has an optional minutes input with number type", () => {
    const minutesInput = def!.inputs.find((inp) => inp.key === "minutes");
    expect(minutesInput).toBeTruthy();
    expect(minutesInput!.required).toBe(false);
    expect(minutesInput!.type).toBe("number");
  });

  it("outputs report (longtext) and count (number)", () => {
    const reportOutput = def!.outputs.find((out) => out.key === "report");
    const countOutput = def!.outputs.find((out) => out.key === "count");
    expect(reportOutput).toBeTruthy();
    expect(reportOutput!.type).toBe("longtext");
    expect(countOutput).toBeTruthy();
    expect(countOutput!.type).toBe("number");
  });
});
