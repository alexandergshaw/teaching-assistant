// COURSE_BUILD's two scope selectors (AC1/AC2 output selection, AC3/AC4
// module selection) - split out of presets.course-build.test.ts (matching
// how that file was itself split out of presets.test.ts) so this file can
// focus specifically on the guarantee the whole feature exists to protect:
// narrowing composes safely with the rest of the preset. No step is ever
// gated by runIf (a gated step's skip would cascade transitively -
// server-runner.ts, around lines 218-232 - taking the terminal cartridge/zip
// down with it), the two terminal deliverables are unconditionally reached
// no matter what is selected, and only the ONE per-module generator step
// actually reads the narrowed schedule - every course-wide artifact still
// sees the whole course.
//
// These tests exercise the ACTUAL preset wiring (course-setup.ts's
// COURSE_BUILD via allWorkflows) together with the two new registry steps'
// own run() functions (steps.course-build-scope.ts) directly - not a full
// end-to-end run (which would require mocking dozens of Canvas/LLM/Supabase
// actions across every step course-refresh pulls in), but enough to prove
// both halves hold: the selectors resolve exactly as their own pure parsers
// say they should (src/lib/module-selection.ts, src/lib/output-selection.ts
// have their own dedicated unit tests for the parsing/validation logic
// itself), and the resulting booleans/narrowed schedule reach ONLY the steps
// this preset's own bindings say they should.

import { describe, it, expect } from "vitest";
import { allWorkflows } from "./presets";
import { getStepDefinition } from "./registry";
import { collectRuntimeFields, expandWorkflowDef, type WorkflowStepConfig } from "./types";
import { OUTPUT_FAMILIES } from "@/lib/output-selection";
import type { ScheduleWeekPlan } from "@/app/actions";

describe("course-build scope selectors (AC1/AC2/AC3/AC4)", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));
  const wf = byId.get("course-build")!;
  const lookup = (id: string) => byId.get(id);

  const selectModules = getStepDefinition("select-course-modules")!;
  const selectOutputs = getStepDefinition("select-course-outputs")!;

  function schedule(n: number): ScheduleWeekPlan[] {
    return Array.from({ length: n }, (_, i) => ({
      week: i + 1,
      topic: `Topic ${i + 1}`,
      summary: "",
      assignmentTitle: null,
      assignmentSlug: null,
      testName: null,
    }));
  }

  it("the run form surfaces exactly one optional 'modules' field and one optional 'outputs' field (carrying every family as a multi-select option)", () => {
    const fields = collectRuntimeFields(wf, (t) => getStepDefinition(t)?.inputs);
    const modulesFields = fields.filter((f) => f.fieldKey === "modules");
    const outputsFields = fields.filter((f) => f.fieldKey === "outputs");

    expect(modulesFields).toHaveLength(1);
    expect(modulesFields[0].required).toBe(false);

    expect(outputsFields).toHaveLength(1);
    expect(outputsFields[0].required).toBe(false);
    expect(outputsFields[0].multi).toBe(true);
    expect(outputsFields[0].options).toEqual([...OUTPUT_FAMILIES]);
  });

  it("AC2: no expanded step carries a runIf gate - the output selector never gates a step off, so nothing (including the terminal cartridge/zip) can ever be skipped through it", () => {
    const expanded = expandWorkflowDef(wf, lookup);
    const gated = expanded.steps.filter((s: WorkflowStepConfig) => s.runIf !== undefined);
    expect(gated.map((s) => s.type)).toEqual([]);
  });

  it("AC2: blackboard-export and save-zip-to-course are present in the expansion, and neither declares any input the output selector's booleans could even be bound to (they cannot be gated through it)", () => {
    const expanded = expandWorkflowDef(wf, lookup);
    const types = expanded.steps.map((s) => s.type);
    expect(types).toContain("blackboard-export");
    expect(types).toContain("save-zip-to-course");

    const outputKeys = selectOutputs.outputs.map((o) => o.key);
    const cartridgeDef = getStepDefinition("blackboard-export")!;
    const zipDef = getStepDefinition("save-zip-to-course")!;
    for (const key of outputKeys) {
      expect(cartridgeDef.inputs.some((i) => i.key === key), `blackboard-export has no "${key}" input`).toBe(false);
      expect(zipDef.inputs.some((i) => i.key === key), `save-zip-to-course has no "${key}" input`).toBe(false);
    }
  });

  it("AC2: the output selector's own options never name the cartridge or zip steps - they are not choices, they are the contract", () => {
    const outputsInput = selectOutputs.inputs.find((i) => i.key === "outputs")!;
    for (const forbidden of ["blackboard-export", "save-zip-to-course", "cartridge", "zip"]) {
      expect(outputsInput.options).not.toContain(forbidden);
    }
  });

  it("AC2: select-course-outputs run with a SINGLE family selected selects exactly that family and nothing else", async () => {
    const result = await selectOutputs.run({ outputs: "assignments" }, undefined as never, () => {});
    expect(result.outputs).toEqual({
      selectedAssignments: "1",
      selectedObjectives: "",
      selectedOpeners: "",
      selectedDecks: "",
      selectedGuides: "",
      selectedAnnouncements: "",
      selectedKnowledgeChecks: "",
    });
  });

  it("AC1: select-course-outputs run with a blank spec reproduces full generation - every family is selected", async () => {
    const result = await selectOutputs.run({ outputs: "" }, undefined as never, () => {});
    expect(Object.values(result.outputs).every((v) => v === "1")).toBe(true);
    expect(Object.keys(result.outputs)).toHaveLength(OUTPUT_FAMILIES.length);
  });

  it("AC3: only lecture-materials-from-schedule (course-build's own step 5) reads select-course-modules' (step 2) narrowed schedule output - every other binding in the preset, including course-refresh's own (reached via the include's remap/bindOverrides), reads step 1's UNNARROWED schedule/weeks output instead", () => {
    const consumers: string[] = [];
    wf.steps.forEach((step, i) => {
      for (const [key, binding] of Object.entries(step.bindings)) {
        if (binding.source === "step" && binding.stepIndex === 2) {
          consumers.push(`course-build step ${i} (${step.type}).${key}`);
        }
      }
      if (step.include) {
        for (const [key, binding] of Object.entries(step.include.remap)) {
          if (binding.source === "step" && binding.stepIndex === 2) consumers.push(`remap "${key}"`);
        }
        for (const [key, binding] of Object.entries(step.include.bindOverrides ?? {})) {
          if (binding.source === "step" && binding.stepIndex === 2) consumers.push(`bindOverride "${key}"`);
        }
      }
    });
    expect(consumers).toEqual(["course-build step 5 (lecture-materials-from-schedule).schedule"]);
  });

  it("AC3: define-course-project and the course-refresh include's course-wide remap entries all read step 1's own full schedule/weeks, never step 2's narrowed output", () => {
    const defineProject = wf.steps[4];
    expect(defineProject.type).toBe("define-course-project");
    expect(defineProject.bindings.schedule).toEqual({ source: "step", stepIndex: 1, outputKey: "schedule" });

    const includeStep = wf.steps.find((s) => s.include?.workflowId === "course-refresh")!;
    expect(includeStep.include!.remap["1.schedule"]).toEqual({ source: "step", stepIndex: 1, outputKey: "schedule" });
    expect(includeStep.include!.remap["1.weeks"]).toEqual({ source: "step", stepIndex: 1, outputKey: "weeks" });
  });

  it("AC4: select-course-modules run with a blank spec passes the full schedule through unchanged (blank means ALL)", async () => {
    const full = schedule(4);
    const result = await selectModules.run({ schedule: full, modules: "" }, undefined as never, () => {});
    expect(result.outputs.schedule).toEqual(full);
  });

  it("AC4: select-course-modules run with a subset spec narrows to exactly those weeks", async () => {
    const full = schedule(4);
    const result = await selectModules.run({ schedule: full, modules: "2,4" }, undefined as never, () => {});
    expect((result.outputs.schedule as ScheduleWeekPlan[]).map((w) => w.week)).toEqual([2, 4]);
  });

  it("AC4: select-course-modules throws (never an empty success) when the selection names a module outside the schedule", async () => {
    const full = schedule(3);
    await expect(
      selectModules.run({ schedule: full, modules: "9" }, undefined as never, () => {})
    ).rejects.toThrow(/Module 9 does not exist/);
  });

  it("blank/unset modules AND outputs together reproduce a full, unnarrowed course-kickoff-no-code-equivalent build: define-course-project and every course-refresh remap still see the full schedule, and lecture-materials-from-schedule's four selectedX bindings all resolve to step 3's output, which (blank) is all '1's", async () => {
    // Structural: the wiring never changes regardless of run-time values -
    // this is the guarantee that makes "blank means ALL" true without any
    // special-casing at the preset level.
    const lectureStep = wf.steps[5];
    expect(lectureStep.type).toBe("lecture-materials-from-schedule");
    for (const key of ["selectedObjectives", "selectedDecks", "selectedAssignments", "selectedOpeners"]) {
      expect(lectureStep.bindings[key]).toEqual({ source: "step", stepIndex: 3, outputKey: key });
    }
    // And step 3 itself (select-course-outputs), run blank, does resolve
    // every one of those four keys to "1".
    const result = await selectOutputs.run({}, undefined as never, () => {});
    for (const key of ["selectedObjectives", "selectedDecks", "selectedAssignments", "selectedOpeners"]) {
      expect(result.outputs[key]).toBe("1");
    }
  });
});
