import { describe, it, expect } from "vitest";
import { courseBuildScopeSteps } from "./steps.course-build-scope";
import { OUTPUT_FAMILIES } from "@/lib/output-selection";
import type { ScheduleWeekPlan } from "@/app/actions";

const selectModules = courseBuildScopeSteps.find((s) => s.type === "select-course-modules")!;
const selectOutputs = courseBuildScopeSteps.find((s) => s.type === "select-course-outputs")!;

function week(n: number, topic = `Topic ${n}`): ScheduleWeekPlan {
  return { week: n, topic, summary: "", assignmentTitle: null, assignmentSlug: null, testName: null };
}

const noop = () => {};

describe("select-course-modules step", () => {
  const schedule = [week(1), week(2), week(3), week(4)];

  it("blank modules input returns the full schedule unchanged", async () => {
    const result = await selectModules.run({ schedule, modules: "" }, undefined as never, noop);
    expect(result.outputs.schedule).toEqual(schedule);
    expect(result.summary).toEqual({ kind: "text", text: "All 4 module(s) selected - no narrowing." });
  });

  it("an unbound modules input (undefined) also means every module", async () => {
    const result = await selectModules.run({ schedule }, undefined as never, noop);
    expect(result.outputs.schedule).toEqual(schedule);
  });

  it("narrows to a single selected module", async () => {
    const result = await selectModules.run({ schedule, modules: "3" }, undefined as never, noop);
    expect(result.outputs.schedule).toEqual([week(3)]);
    expect(result.summary).toEqual({ kind: "text", text: "1 of 4 module(s) selected: 3." });
  });

  it("narrows to a list and a range together", async () => {
    const result = await selectModules.run({ schedule, modules: "1,3-4" }, undefined as never, noop);
    expect(result.outputs.schedule).toEqual([week(1), week(3), week(4)]);
  });

  it("throws, naming the missing module, when the selection is out of range", async () => {
    await expect(selectModules.run({ schedule, modules: "9" }, undefined as never, noop)).rejects.toThrow(
      /Module 9 does not exist/
    );
  });

  it("throws on a malformed modules spec instead of silently ignoring it", async () => {
    await expect(selectModules.run({ schedule, modules: "abc" }, undefined as never, noop)).rejects.toThrow(
      /not a valid module number or range/
    );
  });
});

describe("select-course-outputs step", () => {
  it("blank outputs input selects every family (all boolean outputs are '1')", async () => {
    const result = await selectOutputs.run({ outputs: "" }, undefined as never, noop);
    expect(result.outputs).toEqual({
      selectedAssignments: "1",
      selectedObjectives: "1",
      selectedOpeners: "1",
      selectedDecks: "1",
      selectedGuides: "1",
      selectedAnnouncements: "1",
      selectedKnowledgeChecks: "1",
    });
  });

  it("an unbound outputs input (undefined) also selects every family", async () => {
    const result = await selectOutputs.run({}, undefined as never, noop);
    expect(Object.values(result.outputs).every((v) => v === "1")).toBe(true);
  });

  it("narrows to exactly the named families, leaving the rest deselected", async () => {
    const result = await selectOutputs.run({ outputs: "assignments\ndecks" }, undefined as never, noop);
    expect(result.outputs).toEqual({
      selectedAssignments: "1",
      selectedObjectives: "",
      selectedOpeners: "",
      selectedDecks: "1",
      selectedGuides: "",
      selectedAnnouncements: "",
      selectedKnowledgeChecks: "",
    });
  });

  it("selecting every family individually is equivalent to blank", async () => {
    const result = await selectOutputs.run(
      { outputs: OUTPUT_FAMILIES.join("\n") },
      undefined as never,
      noop
    );
    expect(Object.values(result.outputs).every((v) => v === "1")).toBe(true);
  });

  it("throws on an unrecognized output family", async () => {
    await expect(selectOutputs.run({ outputs: "not-a-real-output" }, undefined as never, noop)).rejects.toThrow(
      /not a recognized output/
    );
  });

  it("declares the outputs input as a multi-select carrying every family as an option", () => {
    const input = selectOutputs.inputs.find((i) => i.key === "outputs")!;
    expect(input.multi).toBe(true);
    expect(input.options).toEqual([...OUTPUT_FAMILIES]);
    expect(input.required).toBe(false);
  });

  it("declares one boolean output per family", () => {
    const outputKeys = selectOutputs.outputs.map((o) => o.key).sort();
    expect(outputKeys).toEqual(
      [
        "selectedAssignments",
        "selectedObjectives",
        "selectedOpeners",
        "selectedDecks",
        "selectedGuides",
        "selectedAnnouncements",
        "selectedKnowledgeChecks",
      ].sort()
    );
    for (const output of selectOutputs.outputs) {
      expect(output.type, output.key).toBe("boolean");
    }
  });
});
