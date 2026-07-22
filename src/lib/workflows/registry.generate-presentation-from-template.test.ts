import { describe, it, expect } from "vitest";
import { getStepDefinition } from "./registry";
import { outputFeedsInput } from "./types";

describe("generate-presentation-from-template step", () => {
  const def = getStepDefinition("generate-presentation-from-template");
  expect(def, "generate-presentation-from-template step exists").toBeTruthy();

  it("has the correct name and category", () => {
    expect(def!.name).toBe("Generate a presentation from a template");
    expect(def!.type).toBe("generate-presentation-from-template");
  });

  it("mentions template-based generation in the description", () => {
    const desc = def!.description;
    expect(desc).toContain("template");
  });

  it("has required input: template", () => {
    const templateInput = def!.inputs.find((i) => i.key === "template");
    expect(templateInput, "template input exists").toBeTruthy();
    expect(templateInput!.type).toBe("deckTemplate");
    expect(templateInput!.required).toBe(true);
  });

  it("has optional inputs: hubCourse, moduleId, subject, concepts, audience, and modulesAhead", () => {
    const hubCourseInput = def!.inputs.find((i) => i.key === "hubCourse");
    expect(hubCourseInput, "hubCourse input exists").toBeTruthy();
    expect(hubCourseInput!.type).toBe("hubCourse");
    expect(hubCourseInput!.required).toBe(false);

    const moduleIdInput = def!.inputs.find((i) => i.key === "moduleId");
    expect(moduleIdInput, "moduleId input exists").toBeTruthy();
    expect(moduleIdInput!.type).toBe("lmsModule");
    expect(moduleIdInput!.required).toBe(false);

    const subjectInput = def!.inputs.find((i) => i.key === "subject");
    expect(subjectInput, "subject input exists").toBeTruthy();
    expect(subjectInput!.type).toBe("text");
    expect(subjectInput!.required).toBe(false);

    const conceptsInput = def!.inputs.find((i) => i.key === "concepts");
    expect(conceptsInput, "concepts input exists").toBeTruthy();
    expect(conceptsInput!.type).toBe("longtext");
    expect(conceptsInput!.required).toBe(false);

    const audienceInput = def!.inputs.find((i) => i.key === "audience");
    expect(audienceInput, "audience input exists").toBeTruthy();
    expect(audienceInput!.type).toBe("text");
    expect(audienceInput!.required).toBe(false);

    const modulesAheadInput = def!.inputs.find((i) => i.key === "modulesAhead");
    expect(modulesAheadInput, "modulesAhead input exists").toBeTruthy();
    expect(modulesAheadInput!.type).toBe("moduleOffset");
    expect(modulesAheadInput!.required).toBe(false);
  });

  it("has correct outputs: draftId, slideCount, presentationTitle, deck, and slidesJson", () => {
    const draftIdOutput = def!.outputs.find((o) => o.key === "draftId");
    expect(draftIdOutput, "draftId output exists").toBeTruthy();
    expect(draftIdOutput!.type).toBe("text");

    const slideCountOutput = def!.outputs.find((o) => o.key === "slideCount");
    expect(slideCountOutput, "slideCount output exists").toBeTruthy();
    expect(slideCountOutput!.type).toBe("text");

    const presentationTitleOutput = def!.outputs.find((o) => o.key === "presentationTitle");
    expect(presentationTitleOutput, "presentationTitle output exists").toBeTruthy();
    expect(presentationTitleOutput!.type).toBe("text");

    const deckOutput = def!.outputs.find((o) => o.key === "deck");
    expect(deckOutput, "deck output exists").toBeTruthy();
    expect(deckOutput!.type).toBe("longtext");

    const slidesJsonOutput = def!.outputs.find((o) => o.key === "slidesJson");
    expect(slidesJsonOutput, "slidesJson output exists").toBeTruthy();
    expect(slidesJsonOutput!.type).toBe("longtext");
  });

  it("has exactly 5 outputs", () => {
    expect(def!.outputs.length).toBe(5);
  });

  it("has exactly 7 inputs", () => {
    expect(def!.inputs.length).toBe(7);
  });

  it("deck and slidesJson outputs can feed lecture-qa slidesText input", () => {
    const lectureQaDef = getStepDefinition("lecture-qa");
    expect(lectureQaDef, "lecture-qa step exists").toBeTruthy();

    const deckOutput = def!.outputs.find((o) => o.key === "deck");
    expect(deckOutput, "deck output exists").toBeTruthy();

    const slidesJsonOutput = def!.outputs.find((o) => o.key === "slidesJson");
    expect(slidesJsonOutput, "slidesJson output exists").toBeTruthy();

    const slidesTextInput = lectureQaDef!.inputs.find((i) => i.key === "slidesText");
    expect(slidesTextInput, "slidesText input exists").toBeTruthy();

    expect(
      outputFeedsInput(deckOutput!.type, slidesTextInput!.type),
      "deck output can feed slidesText input"
    ).toBe(true);

    expect(
      outputFeedsInput(slidesJsonOutput!.type, slidesTextInput!.type),
      "slidesJson output can feed slidesText input"
    ).toBe(true);
  });
});
