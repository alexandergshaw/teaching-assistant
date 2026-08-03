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

  it("AC2: no expanded step carries a runIf gate that could cascade to the cartridge/zip - the ONE exception (fill-readmes, the Codebase-and-associated-assignments family) declares zero outputs, so nothing downstream could ever be skip-cascaded through gating it off", () => {
    const expanded = expandWorkflowDef(wf, lookup);
    const gated = expanded.steps.filter((s: WorkflowStepConfig) => s.runIf !== undefined);
    // fill-readmes (steps.github.ts) is gated on resolve-codebase-repo's own
    // "repo" output (course-build.ts's own step 7 runIf) - the single
    // documented exception to "never a runIf gate" (steps.course-build-
    // codebase.ts's own header comment). Every OTHER output family still
    // follows the "stay in the chain, pass files through unchanged" rule the
    // rest of this test file exercises.
    expect(gated.map((s) => s.type)).toEqual(["fill-readmes"]);
    // Prove the exception really is safe: a step with zero outputs cannot be
    // the source of a skip-cascade (server-runner.ts, around lines 218-232),
    // since no other binding can point at an output it never declares.
    const fillReadmesDef = getStepDefinition("fill-readmes")!;
    expect(fillReadmesDef.outputs, "fill-readmes declares zero outputs").toEqual([]);
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
      selectedSignificance: "",
      selectedInstructorNotes: "",
      selectedCodebase: "",
      selectedStartHere: "",
    });
  });

  // New output families (weekly Significance of the Material, per-module
  // instructor notes, Codebase-and-associated-assignments, Start-Here
  // module): the same per-family isolation guarantee as the "assignments"
  // case above, proven for each new family in turn so a future edit that
  // miswires one cannot silently leak the other families on or off with it.
  it("selecting only 'significance' selects exactly that family and nothing else", async () => {
    const result = await selectOutputs.run({ outputs: "significance" }, undefined as never, () => {});
    expect(result.outputs).toEqual({
      selectedAssignments: "",
      selectedObjectives: "",
      selectedOpeners: "",
      selectedDecks: "",
      selectedGuides: "",
      selectedAnnouncements: "",
      selectedKnowledgeChecks: "",
      selectedSignificance: "1",
      selectedInstructorNotes: "",
      selectedCodebase: "",
      selectedStartHere: "",
    });
  });

  it("selecting only 'instructorNotes' selects exactly that family and nothing else", async () => {
    const result = await selectOutputs.run({ outputs: "instructorNotes" }, undefined as never, () => {});
    expect(result.outputs).toEqual({
      selectedAssignments: "",
      selectedObjectives: "",
      selectedOpeners: "",
      selectedDecks: "",
      selectedGuides: "",
      selectedAnnouncements: "",
      selectedKnowledgeChecks: "",
      selectedSignificance: "",
      selectedInstructorNotes: "1",
      selectedCodebase: "",
      selectedStartHere: "",
    });
  });

  it("selecting only 'codebase' selects exactly that family and nothing else", async () => {
    const result = await selectOutputs.run({ outputs: "codebase" }, undefined as never, () => {});
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
      selectedStartHere: "",
    });
  });

  it("selecting only 'startHere' selects exactly that family and nothing else", async () => {
    const result = await selectOutputs.run({ outputs: "startHere" }, undefined as never, () => {});
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
      selectedCodebase: "",
      selectedStartHere: "1",
    });
  });

  // The wiring guarantee: whichever family is selected, the terminal
  // cartridge/zip are reached via steps that never even declare an input the
  // selector's booleans could bind to - already proven generically above
  // ("AC2: blackboard-export and save-zip-to-course..."), so a run
  // selecting ONLY "significance" or ONLY "instructorNotes" still produces
  // both. This test proves the two new generator steps themselves are
  // actually WIRED to step 3's new booleans, not merely declared as options.
  it("the two new output families reach their matching generator steps inside the course-refresh include", () => {
    const includeStep = wf.steps.find((s) => s.include?.workflowId === "course-refresh")!;
    const bindOverrides = includeStep.include!.bindOverrides ?? {};
    expect(bindOverrides["14.selected"]).toEqual({ source: "step", stepIndex: 3, outputKey: "selectedSignificance" });
    expect(bindOverrides["15.selected"]).toEqual({ source: "step", stepIndex: 3, outputKey: "selectedInstructorNotes" });

    const refresh = byId.get("course-refresh")!;
    expect(refresh.steps[14].type).toBe("generate-weekly-significance");
    expect(refresh.steps[15].type).toBe("generate-instructor-notes");
  });

  // "Codebase and associated assignments" family: step 3's own
  // "selectedCodebase" boolean must actually reach resolve-codebase-repo
  // (course-build's own step 6) - proving the family is wired, not merely
  // declared as an option. resolve-codebase-repo's own "repo" output then
  // gates fill-readmes (step 7, runIf) and feeds lms-assignments (course-
  // refresh's own source index 11, via the include's "11.repo" bindOverride)
  // - both traced back to the SAME step 6 so a deselected/incompatible run
  // cannot leave one of the two in a stale state relative to the other.
  it("the Codebase-and-associated-assignments family reaches resolve-codebase-repo, whose own repo output gates fill-readmes and feeds lms-assignments", () => {
    const resolveStep = wf.steps[6];
    expect(resolveStep.type).toBe("resolve-codebase-repo");
    expect(resolveStep.bindings.selected).toEqual({ source: "step", stepIndex: 3, outputKey: "selectedCodebase" });
    expect(resolveStep.bindings.repo).toEqual({ source: "step", stepIndex: 1, outputKey: "repo" });

    const fillReadmesStep = wf.steps[7];
    expect(fillReadmesStep.type).toBe("fill-readmes");
    expect(fillReadmesStep.bindings.repo).toEqual({ source: "step", stepIndex: 6, outputKey: "repo" });
    expect(fillReadmesStep.runIf).toEqual({
      binding: { source: "step", stepIndex: 6, outputKey: "repo" },
      expected: true,
    });

    const includeStep = wf.steps.find((s) => s.include?.workflowId === "course-refresh")!;
    const bindOverrides = includeStep.include!.bindOverrides ?? {};
    expect(bindOverrides["11.repo"]).toEqual({ source: "step", stepIndex: 6, outputKey: "repo" });
    const refresh = byId.get("course-refresh")!;
    expect(refresh.steps[11].type).toBe("lms-assignments");
  });

  // Start-Here-module family: step 3's own "selectedStartHere" boolean must
  // reach the ALREADY-existing starter-materials step (absorbed through
  // course-refresh's own nested include-workflow at source index 18 -
  // see types.ts's expandWorkflowDef for why a bindOverride keyed "18.X"
  // correctly targets an absorbed nested-include step's own input), and the
  // GitHub sign-up + username-submission assignment must derive from whether
  // THIS run is codebase-anchored (step 1's own "isCodebase" output) rather
  // than a hard-coded value.
  it("the Start-Here-module family reaches starter-materials through course-refresh's nested include, and its GitHub sign-up derives from step 1's isCodebase output", () => {
    const includeStep = wf.steps.find((s) => s.include?.workflowId === "course-refresh")!;
    const bindOverrides = includeStep.include!.bindOverrides ?? {};
    expect(bindOverrides["18.selected"]).toEqual({ source: "step", stepIndex: 3, outputKey: "selectedStartHere" });
    expect(bindOverrides["18.includeGithub"]).toEqual({ source: "step", stepIndex: 1, outputKey: "isCodebase" });

    const refresh = byId.get("course-refresh")!;
    const nestedInclude = refresh.steps[18];
    expect(nestedInclude.include?.workflowId).toBe("starter-materials");
    const starterMaterials = byId.get("starter-materials")!;
    expect(starterMaterials.steps[0].type).toBe("starter-materials");

    const resolveCodebaseRepoDef = getStepDefinition("resolve-codebase-repo")!;
    const starterMaterialsDef = getStepDefinition("starter-materials")!;
    expect(resolveCodebaseRepoDef.inputs.some((i) => i.key === "selected")).toBe(true);
    expect(starterMaterialsDef.inputs.some((i) => i.key === "selected")).toBe(true);
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
