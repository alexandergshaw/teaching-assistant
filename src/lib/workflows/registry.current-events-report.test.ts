import { describe, it, expect } from "vitest";
import { getStepDefinition } from "./registry";
import { outputFeedsInput } from "./types";

describe("current-events-report step", () => {
  const def = getStepDefinition("current-events-report");
  expect(def, "current-events-report step exists").toBeTruthy();

  it("has the correct name and category", () => {
    expect(def!.name).toBe("Current events for a slide deck");
    expect(def!.type).toBe("current-events-report");
  });

  it("mentions web search for current events in the description", () => {
    const desc = def!.description;
    expect(desc).toContain("current events");
    expect(desc).toContain("web");
  });

  it("has optional inputs: slides, slidesText, recentWindow, and hubCourse", () => {
    const slidesInput = def!.inputs.find((i) => i.key === "slides");
    expect(slidesInput, "slides input exists").toBeTruthy();
    expect(slidesInput!.type).toBe("uploads");
    expect(slidesInput!.required).toBe(false);
    expect(slidesInput!.accept).toBe(".pptx");

    const slidesTextInput = def!.inputs.find((i) => i.key === "slidesText");
    expect(slidesTextInput, "slidesText input exists").toBeTruthy();
    expect(slidesTextInput!.type).toBe("longtext");
    expect(slidesTextInput!.required).toBe(false);

    const recentWindowInput = def!.inputs.find((i) => i.key === "recentWindow");
    expect(recentWindowInput, "recentWindow input exists").toBeTruthy();
    expect(recentWindowInput!.type).toBe("text");
    expect(recentWindowInput!.required).toBe(false);

    const hubCourseInput = def!.inputs.find((i) => i.key === "hubCourse");
    expect(hubCourseInput, "hubCourse input exists").toBeTruthy();
    expect(hubCourseInput!.type).toBe("hubCourse");
    expect(hubCourseInput!.required).toBe(false);
  });

  it("has correct outputs: reportText and fileName", () => {
    const reportTextOutput = def!.outputs.find((o) => o.key === "reportText");
    expect(reportTextOutput, "reportText output exists").toBeTruthy();
    expect(reportTextOutput!.type).toBe("longtext");

    const fileNameOutput = def!.outputs.find((o) => o.key === "fileName");
    expect(fileNameOutput, "fileName output exists").toBeTruthy();
    expect(fileNameOutput!.type).toBe("text");
  });

  it("has exactly 2 outputs", () => {
    expect(def!.outputs.length).toBe(2);
  });

  it("has exactly 4 inputs", () => {
    expect(def!.inputs.length).toBe(4);
  });

  it("slidesText input can accept output from generate-presentation-from-template deck", () => {
    const presentationDef = getStepDefinition("generate-presentation-from-template");
    expect(presentationDef, "generate-presentation-from-template step exists").toBeTruthy();

    const deckOutput = presentationDef!.outputs.find((o) => o.key === "deck");
    expect(deckOutput, "deck output exists").toBeTruthy();

    const slidesTextInput = def!.inputs.find((i) => i.key === "slidesText");
    expect(slidesTextInput, "slidesText input exists").toBeTruthy();

    expect(
      outputFeedsInput(deckOutput!.type, slidesTextInput!.type),
      "deck output can feed slidesText input"
    ).toBe(true);
  });

  it("slidesText input can accept output from generate-slides-standalone deck", () => {
    const slidesDef = getStepDefinition("generate-slides-standalone");
    expect(slidesDef, "generate-slides-standalone step exists").toBeTruthy();

    const deckOutput = slidesDef!.outputs.find((o) => o.key === "deck");
    expect(deckOutput, "deck output exists").toBeTruthy();

    const slidesTextInput = def!.inputs.find((i) => i.key === "slidesText");
    expect(slidesTextInput, "slidesText input exists").toBeTruthy();

    expect(
      outputFeedsInput(deckOutput!.type, slidesTextInput!.type),
      "deck output can feed slidesText input"
    ).toBe(true);
  });
});
