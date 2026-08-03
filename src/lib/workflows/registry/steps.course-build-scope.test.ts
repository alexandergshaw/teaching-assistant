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
  // F1 fix: blank ("all") only implies the "codebase" family when this run
  // is codebase-shaped (the new "isCodebase" input - bound in course-build.ts
  // from course-schedule-from-source's own "isCodebase" output). These two
  // tests pin the codebase-anchored case ("1"); the sibling tests right below
  // pin the (much more common) non-anchored case, which is the actual F1
  // defect this input exists to fix.
  it("blank outputs input selects every family (all boolean outputs are '1') when the run is codebase-anchored", async () => {
    const result = await selectOutputs.run({ outputs: "", isCodebase: "1" }, undefined as never, noop);
    expect(result.outputs).toEqual({
      selectedAssignments: "1",
      selectedObjectives: "1",
      selectedOpeners: "1",
      selectedDecks: "1",
      selectedGuides: "1",
      selectedAnnouncements: "1",
      selectedKnowledgeChecks: "1",
      selectedSignificance: "1",
      selectedInstructorNotes: "1",
      selectedCodebase: "1",
      selectedStartHere: "1",
    });
  });

  it("an unbound outputs input (undefined) also selects every family when the run is codebase-anchored", async () => {
    const result = await selectOutputs.run({ isCodebase: "1" }, undefined as never, noop);
    expect(Object.values(result.outputs).every((v) => v === "1")).toBe(true);
  });

  // F1 (the actual defect): blank "outputs" plus an UNSET/blank "isCodebase"
  // (every preset except course-build.ts, and course-build.ts itself
  // whenever the picked source is not "codebase"/"tile-repo") selects every
  // family EXCEPT codebase - the family is only meaningful when there is a
  // repository to anchor it to, and blank-means-all must not select
  // something that cannot apply.
  it("blank outputs input selects every family EXCEPT codebase when the run is NOT codebase-anchored (isCodebase unset)", async () => {
    const result = await selectOutputs.run({ outputs: "" }, undefined as never, noop);
    expect(result.outputs).toEqual({
      selectedAssignments: "1",
      selectedObjectives: "1",
      selectedOpeners: "1",
      selectedDecks: "1",
      selectedGuides: "1",
      selectedAnnouncements: "1",
      selectedKnowledgeChecks: "1",
      selectedSignificance: "1",
      selectedInstructorNotes: "1",
      selectedCodebase: "",
      selectedStartHere: "1",
    });
  });

  it("an unbound outputs input (undefined) also selects every family except codebase when isCodebase is unset", async () => {
    const result = await selectOutputs.run({}, undefined as never, noop);
    const { selectedCodebase, ...rest } = result.outputs as Record<string, string>;
    expect(selectedCodebase).toBe("");
    expect(Object.values(rest).every((v) => v === "1")).toBe(true);
  });

  // An EXPLICIT "codebase" selection is unaffected by isCodebase - it always
  // sets selectedCodebase, even when the run is not actually anchored (the
  // downstream resolve-codebase-repo step is what fails loudly in that case -
  // see steps.course-build-codebase.test.ts / presets.course-build.scope.test.ts).
  it("an EXPLICIT 'codebase' selection sets selectedCodebase regardless of isCodebase", async () => {
    const result = await selectOutputs.run({ outputs: "codebase", isCodebase: "" }, undefined as never, noop);
    expect(result.outputs.selectedCodebase).toBe("1");
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
      selectedSignificance: "",
      selectedInstructorNotes: "",
      selectedCodebase: "",
      selectedStartHere: "",
    });
  });

  it("narrows to exactly 'codebase' and 'startHere' when those two families are named, leaving the rest deselected", async () => {
    const result = await selectOutputs.run({ outputs: "codebase\nstartHere" }, undefined as never, noop);
    expect(result.outputs).toEqual({
      selectedAssignments: "",
      selectedObjectives: "",
      selectedOpeners: "",
      selectedDecks: "",
      selectedGuides: "",
      selectedAnnouncements: "",
      selectedKnowledgeChecks: "",
      selectedSignificance: "",
      selectedInstructorNotes: "",
      selectedCodebase: "1",
      selectedStartHere: "1",
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

  it("declares the F1 isCodebase input as an optional boolean", () => {
    const input = selectOutputs.inputs.find((i) => i.key === "isCodebase")!;
    expect(input).toBeDefined();
    expect(input.type).toBe("boolean");
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
        "selectedSignificance",
        "selectedInstructorNotes",
        "selectedCodebase",
        "selectedStartHere",
      ].sort()
    );
    for (const output of selectOutputs.outputs) {
      expect(output.type, output.key).toBe("boolean");
    }
  });
});
