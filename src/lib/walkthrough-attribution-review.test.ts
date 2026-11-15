import { expect, it } from "vitest";
import { possibleCrossActivityAttribution } from "./walkthrough-attribution-review";

const materials = "## Linux command practice\nOptional extra credit: practice commands.\n\n## Investigation log\nSubmit the investigation log as required coursework.";

it("flags an optional label spanning separately captured activities", () => {
  expect(possibleCrossActivityAttribution(materials, "Optional extra credit: complete Linux command practice and submit the Investigation log.")).toBe(true);
  expect(possibleCrossActivityAttribution(materials, "Optional extra credit: use the Linux command line and submit your log file.")).toBe(true);
  expect(possibleCrossActivityAttribution(materials, "To successfully complete the extra credit, please follow these steps:\n\n1. Conduct your investigation of the system logs using bash commands.")).toBe(true);
});

it("does not flag separately described activities or two optional activities", () => {
  expect(possibleCrossActivityAttribution(materials, "Optional extra credit: Linux command practice.\n\nSubmit the Investigation log.")).toBe(false);
  expect(possibleCrossActivityAttribution(materials.replace("Submit the investigation log as required coursework.", "The investigation log is optional."), "Optional: Linux command practice and Investigation log.")).toBe(false);
});

it("does not infer risk without matching identifiable source headings", () => {
  expect(possibleCrossActivityAttribution(materials, "Optional extra credit is available for the lab.")).toBe(false);
  expect(possibleCrossActivityAttribution("No distinct headings", "Optional task and required project.")).toBe(false);
});
