import { describe, it, expect } from "vitest";
import { courseSetupTilesSteps } from "./steps.course-setup.tiles";

function findStep(type: string) {
  const step = courseSetupTilesSteps.find((s) => s.type === type);
  if (!step) throw new Error(`Step type not found: ${type}`);
  return step;
}

describe("load-course-tile outputs", () => {
  const step = findStep("load-course-tile");

  it("keeps its existing outputs unchanged (key, label, type)", () => {
    const byKey = Object.fromEntries(step.outputs.map((o) => [o.key, o]));
    expect(byKey.repo).toEqual({ key: "repo", label: "Repository", type: "repo" });
    expect(byKey.course).toEqual({ key: "course", label: "LMS course", type: "lmsCourse" });
    expect(byKey.startDate).toEqual({ key: "startDate", label: "Start date", type: "date" });
    expect(byKey.description).toEqual({ key: "description", label: "Course description", type: "longtext" });
    expect(byKey.weeks).toEqual({ key: "weeks", label: "Number of weeks", type: "number" });
    expect(byKey.tests).toEqual({ key: "tests", label: "Number of tests", type: "number" });
  });

  it("adds modality, isAsync, isSync outputs", () => {
    const byKey = Object.fromEntries(step.outputs.map((o) => [o.key, o]));
    expect(byKey.modality).toEqual({ key: "modality", label: "Modality", type: "text" });
    expect(byKey.isAsync).toEqual({ key: "isAsync", label: "Asynchronous course", type: "boolean" });
    expect(byKey.isSync).toEqual({ key: "isSync", label: "Synchronous course", type: "boolean" });
  });

  it("documents in its description that an unset modality is false, not silently true", () => {
    expect(step.description.toLowerCase()).toContain("isasync false");
    expect(step.description.toLowerCase()).toContain("issync false");
  });
});

describe("course-modality step", () => {
  const step = findStep("course-modality");

  it("requires a single hubCourse input", () => {
    expect(step.inputs).toEqual([
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: true },
    ]);
  });

  it("outputs modality (text), isAsync (boolean), isSync (boolean)", () => {
    expect(step.outputs).toEqual([
      { key: "modality", label: "Modality", type: "text" },
      { key: "isAsync", label: "Asynchronous course", type: "boolean" },
      { key: "isSync", label: "Synchronous course", type: "boolean" },
    ]);
  });

  it("documents that an unset modality yields both booleans false", () => {
    expect(step.description.toLowerCase()).toContain("isasync false");
    expect(step.description.toLowerCase()).toContain("issync false");
  });
});

describe("runIf gating surface: boolean outputs are discoverable", () => {
  it("both course-modality outputs the StepCard 'Run only if' control would enumerate are typed boolean", () => {
    // Mirrors StepCard.tsx's boolean-output enumeration: for an earlier step,
    // every output whose type is "boolean" becomes a runIf candidate.
    const step = findStep("course-modality");
    const boolOutputs = step.outputs.filter((o) => o.type === "boolean");
    expect(boolOutputs.map((o) => o.key).sort()).toEqual(["isAsync", "isSync"].sort());
    for (const o of boolOutputs) expect(o.type).toBe("boolean");
  });

  it("load-course-tile's isAsync/isSync are also discoverable as runIf candidates", () => {
    const step = findStep("load-course-tile");
    const boolOutputs = step.outputs.filter((o) => o.type === "boolean");
    expect(boolOutputs.map((o) => o.key).sort()).toEqual(["isAsync", "isSync"].sort());
  });
});
