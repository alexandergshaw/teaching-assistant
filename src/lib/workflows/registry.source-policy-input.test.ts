import { describe, it, expect } from "vitest";
import { getStepDefinition } from "./registry";

// The six lecture-building steps that gained the "sourcePolicy" input; the
// four with dedicated per-step test files (prepare-lecture, lecture-qa,
// generate-presentation-from-template, lecture-materials-from-schedule)
// assert it there too - this file covers the remaining two (lecture-zip,
// draft-upcoming-lectures) and a cross-check across all six.
const SIX_STEPS = [
  "lecture-zip",
  "lecture-materials-from-schedule",
  "prepare-lecture",
  "lecture-qa",
  "generate-presentation-from-template",
  "draft-upcoming-lectures",
];

describe("sourcePolicy 'sources' input on the six lecture-building steps", () => {
  for (const type of SIX_STEPS) {
    it(`${type} declares an optional "sources" input of type sourcePolicy`, () => {
      const def = getStepDefinition(type);
      expect(def, `${type} is registered`).toBeTruthy();
      const input = def!.inputs.find((i) => i.key === "sources");
      expect(input, `${type} has a "sources" input`).toBeTruthy();
      expect(input!.type).toBe("sourcePolicy");
      expect(input!.required).toBe(false);
    });
  }

  it("lecture-zip has exactly 8 inputs", () => {
    const def = getStepDefinition("lecture-zip");
    expect(def!.inputs.length).toBe(8);
  });

  it("draft-upcoming-lectures has exactly 7 inputs", () => {
    const def = getStepDefinition("draft-upcoming-lectures");
    expect(def!.inputs.length).toBe(7);
  });
});
