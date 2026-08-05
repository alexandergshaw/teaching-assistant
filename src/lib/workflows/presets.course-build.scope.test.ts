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
import { collectRuntimeFields, expandWorkflowDef, stepBindingIndex, type InputBinding, type WorkflowStepConfig } from "./types";
import { OUTPUT_FAMILIES } from "@/lib/output-selection";
import type { ScheduleWeekPlan } from "@/app/actions";

// CHUNK E-b: presets now carry step ids, so a "step" binding may name its
// source by either stepIndex or stepId. Resolves either form to a concrete
// index within `steps`.
function resolveStepIndex(steps: WorkflowStepConfig[], binding: InputBinding & { source: "step" }): number {
  const direct = stepBindingIndex(binding);
  if (direct !== undefined) return direct;
  return steps.findIndex((s) => s.id === (binding as { stepId: string }).stepId);
}

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
      selectedQa: "",
      selectedCurrentEvents: "",
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
      selectedQa: "",
      selectedCurrentEvents: "",
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
      selectedQa: "",
      selectedCurrentEvents: "",
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
      selectedQa: "",
      selectedCurrentEvents: "",
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
      selectedQa: "",
      selectedCurrentEvents: "",
    });
  });

  it("selecting only 'qa' selects exactly that family and nothing else", async () => {
    const result = await selectOutputs.run({ outputs: "qa" }, undefined as never, () => {});
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
      selectedStartHere: "",
      selectedQa: "1",
      selectedCurrentEvents: "",
    });
  });

  it("selecting only 'currentEvents' selects exactly that family and nothing else", async () => {
    const result = await selectOutputs.run({ outputs: "currentEvents" }, undefined as never, () => {});
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
      selectedStartHere: "",
      selectedQa: "",
      selectedCurrentEvents: "1",
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
    expect(bindOverrides["generate-weekly-significance.selected"]).toEqual({
      source: "step",
      stepId: "select-course-outputs",
      outputKey: "selectedSignificance",
    });
    expect(bindOverrides["generate-instructor-notes.selected"]).toEqual({
      source: "step",
      stepId: "select-course-outputs",
      outputKey: "selectedInstructorNotes",
    });

    const refresh = byId.get("course-refresh")!;
    expect(refresh.steps[14].type).toBe("generate-weekly-significance");
    expect(refresh.steps[15].type).toBe("generate-instructor-notes");
  });

  // "Codebase and associated assignments" family: step 3's own
  // "selectedCodebase" boolean must actually reach resolve-codebase-repo
  // (course-build's own step 9, after research-course-case-studies was
  // spliced in at 5 and generate-weekly-qa/generate-weekly-current-events
  // were spliced in at 7/8) - proving the family is wired, not merely
  // declared as an option. resolve-codebase-repo's own "repo" output then
  // gates fill-readmes (step 10, runIf) and feeds lms-assignments
  // (course-refresh's own source index 11, via the include's
  // "lms-assignments.repo" bindOverride) - both traced back to the SAME step
  // 9 so a deselected/incompatible run cannot leave one of the two in a
  // stale state relative to the other.
  it("the Codebase-and-associated-assignments family reaches resolve-codebase-repo, whose own repo output gates fill-readmes and feeds lms-assignments", () => {
    const resolveStep = wf.steps[9];
    expect(resolveStep.type).toBe("resolve-codebase-repo");
    expect(resolveStep.bindings.selected).toEqual({
      source: "step",
      stepId: "select-course-outputs",
      outputKey: "selectedCodebase",
    });
    expect(resolveStep.bindings.repo).toEqual({
      source: "step",
      stepId: "course-schedule-from-source",
      outputKey: "repo",
    });

    const fillReadmesStep = wf.steps[10];
    expect(fillReadmesStep.type).toBe("fill-readmes");
    expect(fillReadmesStep.bindings.repo).toEqual({ source: "step", stepId: "resolve-codebase-repo", outputKey: "repo" });
    expect(fillReadmesStep.runIf).toEqual({
      binding: { source: "step", stepId: "resolve-codebase-repo", outputKey: "repo" },
      expected: true,
    });

    const includeStep = wf.steps.find((s) => s.include?.workflowId === "course-refresh")!;
    const bindOverrides = includeStep.include!.bindOverrides ?? {};
    expect(bindOverrides["lms-assignments.repo"]).toEqual({
      source: "step",
      stepId: "resolve-codebase-repo",
      outputKey: "repo",
    });
    const refresh = byId.get("course-refresh")!;
    expect(refresh.steps[11].type).toBe("lms-assignments");
  });

  // The two newest per-week output families: step 3's own "selectedQa"/
  // "selectedCurrentEvents" booleans must actually reach generate-weekly-qa
  // (course-build's own step 7) and generate-weekly-current-events (step 8),
  // and the two must chain together (step 8 reads step 7's own "files"
  // output, which itself reads step 6's) so both survive into whatever
  // reads step 8's own "files" output next (the include's own
  // "lecture-zip.files" remap - see the dedicated remap test below).
  it("the qa and currentEvents output families reach generate-weekly-qa and generate-weekly-current-events, chained onto lecture-materials-from-schedule's own files", () => {
    const qaStep = wf.steps[7];
    expect(qaStep.type).toBe("generate-weekly-qa");
    expect(qaStep.bindings.selected).toEqual({ source: "step", stepId: "select-course-outputs", outputKey: "selectedQa" });
    expect(qaStep.bindings.files).toEqual({ source: "step", stepId: "lecture-materials-from-schedule", outputKey: "files" });

    const currentEventsStep = wf.steps[8];
    expect(currentEventsStep.type).toBe("generate-weekly-current-events");
    expect(currentEventsStep.bindings.selected).toEqual({
      source: "step",
      stepId: "select-course-outputs",
      outputKey: "selectedCurrentEvents",
    });
    expect(currentEventsStep.bindings.files).toEqual({ source: "step", stepId: "generate-weekly-qa", outputKey: "files" });

    const includeStep = wf.steps.find((s) => s.include?.workflowId === "course-refresh")!;
    expect(includeStep.include!.remap["lecture-zip.files"]).toEqual({
      source: "step",
      stepId: "generate-weekly-current-events",
      outputKey: "files",
    });
  });

  // F1: step 3 (select-course-outputs)'s own "isCodebase" input must reach
  // step 1's (course-schedule-from-source) "isCodebase" output - this is what
  // makes "blank means ALL" stop implying the codebase family on a run that
  // has no repository to anchor it to (see steps.course-build-scope.ts's own
  // "isCodebase" input comment for the full rule).
  it("F1: step 3's isCodebase input reaches step 1's isCodebase output", () => {
    const selectOutputsStep = wf.steps[3];
    expect(selectOutputsStep.type).toBe("select-course-outputs");
    expect(selectOutputsStep.bindings.isCodebase).toEqual({
      source: "step",
      stepId: "course-schedule-from-source",
      outputKey: "isCodebase",
    });
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
    expect(bindOverrides["include-starter-materials.selected"]).toEqual({
      source: "step",
      stepId: "select-course-outputs",
      outputKey: "selectedStartHere",
    });
    expect(bindOverrides["include-starter-materials.includeGithub"]).toEqual({
      source: "step",
      stepId: "course-schedule-from-source",
      outputKey: "isCodebase",
    });

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

  it("AC1: select-course-outputs run with a blank spec reproduces full generation - every family is selected - when the run is codebase-anchored", async () => {
    const result = await selectOutputs.run({ outputs: "", isCodebase: "1" }, undefined as never, () => {});
    expect(Object.values(result.outputs).every((v) => v === "1")).toBe(true);
    expect(Object.keys(result.outputs)).toHaveLength(OUTPUT_FAMILIES.length);
  });

  // F1's own composition guarantee (see the dedicated F1 tests below for the
  // full write-up): a blank spec on a run that is NOT codebase-anchored
  // reproduces full generation MINUS codebase - this is what keeps the
  // DEFAULT course-build run (blank outputs, isCodebase unbound/blank)
  // working instead of throwing.
  it("AC1/F1: select-course-outputs run with a blank spec selects every family except codebase when the run is not codebase-anchored", async () => {
    const result = await selectOutputs.run({ outputs: "" }, undefined as never, () => {});
    const { selectedCodebase, ...rest } = result.outputs as Record<string, string>;
    expect(selectedCodebase).toBe("");
    expect(Object.values(rest).every((v) => v === "1")).toBe(true);
    expect(Object.keys(result.outputs)).toHaveLength(OUTPUT_FAMILIES.length);
  });

  // F1 (live defect, HIGH): a DEFAULT run - blank "outputs" (blank means ALL,
  // including the "codebase" family) together with a non-codebase-shaped
  // source (course-schedule-from-source's own "repo"/"isCodebase" outputs are
  // both blank/"" for every source except "codebase"/"tile-repo" - see that
  // step's header comment) - used to make step 3's blank selection imply
  // selectedCodebase "1" unconditionally, which step 6 (resolve-codebase-
  // repo) then rejected with its own named "no codebase to attach it to"
  // error, since this run has no repository to use. This composes the ACTUAL
  // two step run() functions end to end (not just step 3 in isolation, unlike
  // the "AC1: blank spec" test directly above) to prove the DEFAULT run - the
  // scenario a fresh instructor hits first, with a course-description source
  // - no longer fails.
  it("F1: a DEFAULT run (blank outputs, a non-codebase-shaped source) does not fail resolving the codebase output - blank must not imply a family that cannot apply", async () => {
    const resolveCodebaseRepo = getStepDefinition("resolve-codebase-repo")!;
    // Mirrors what course-schedule-from-source actually outputs for a
    // non-codebase source: repo "" and isCodebase "".
    const outputsResult = await selectOutputs.run(
      { outputs: "", isCodebase: "" },
      undefined as never,
      () => {}
    );
    const resolved = await resolveCodebaseRepo.run(
      { repo: "", selected: outputsResult.outputs.selectedCodebase },
      undefined as never,
      () => {}
    );
    expect(resolved.outputs.repo).toBe("");
  });

  // F1's other half: an EXPLICIT "codebase" selection on an incompatible
  // source must still fail loudly with resolve-codebase-repo's own named
  // error - only the IMPLIED (blank) case changes.
  it("F1: an EXPLICIT 'codebase' selection with a non-codebase-shaped source still fails loudly", async () => {
    const resolveCodebaseRepo = getStepDefinition("resolve-codebase-repo")!;
    const outputsResult = await selectOutputs.run(
      { outputs: "codebase", isCodebase: "" },
      undefined as never,
      () => {}
    );
    expect(outputsResult.outputs.selectedCodebase).toBe("1");
    await expect(
      resolveCodebaseRepo.run(
        { repo: "", selected: outputsResult.outputs.selectedCodebase },
        undefined as never,
        () => {}
      )
    ).rejects.toThrow(/no codebase to attach it to/);
  });

  // F1: blank still implies "codebase" when the run genuinely IS anchored to
  // a repository - the IMPLIED case only changes for an incompatible source.
  it("F1: a DEFAULT run (blank outputs) still implies the codebase family when the source IS codebase-shaped", async () => {
    const resolveCodebaseRepo = getStepDefinition("resolve-codebase-repo")!;
    const outputsResult = await selectOutputs.run(
      { outputs: "", isCodebase: "1" },
      undefined as never,
      () => {}
    );
    expect(outputsResult.outputs.selectedCodebase).toBe("1");
    const resolved = await resolveCodebaseRepo.run(
      { repo: "owner/repo", selected: outputsResult.outputs.selectedCodebase },
      undefined as never,
      () => {}
    );
    expect(resolved.outputs.repo).toBe("owner/repo");
  });

  it("AC3: only lecture-materials-from-schedule (course-build's own step 6) reads select-course-modules' (step 2) narrowed schedule output - every other binding in the preset, including research-course-case-studies and course-refresh's own (reached via the include's remap/bindOverrides), reads step 1's UNNARROWED schedule/weeks output instead", () => {
    // Presets now carry ids (CHUNK E-b), so a "step" binding may name its
    // source by stepIndex or stepId - resolveStepIndex resolves either form
    // against COURSE_BUILD's own step array, which is also the coordinate
    // space remap/bindOverrides VALUES are written in (per WorkflowStepConfig's
    // own doc comment), so the same resolution applies to all three loops.
    const consumers: string[] = [];
    wf.steps.forEach((step, i) => {
      for (const [key, binding] of Object.entries(step.bindings)) {
        if (binding.source === "step" && resolveStepIndex(wf.steps, binding) === 2) {
          consumers.push(`course-build step ${i} (${step.type}).${key}`);
        }
      }
      if (step.include) {
        for (const [key, binding] of Object.entries(step.include.remap)) {
          if (binding.source === "step" && resolveStepIndex(wf.steps, binding) === 2) consumers.push(`remap "${key}"`);
        }
        for (const [key, binding] of Object.entries(step.include.bindOverrides ?? {})) {
          if (binding.source === "step" && resolveStepIndex(wf.steps, binding) === 2) consumers.push(`bindOverride "${key}"`);
        }
      }
    });
    expect(consumers).toEqual(["course-build step 6 (lecture-materials-from-schedule).schedule"]);

    // Added coverage for the new step (not merely absent from the consumers
    // list above by construction): research-course-case-studies (index 5)
    // researches the WHOLE course's case studies before any per-week
    // material exists, so its own "schedule" binding must read step 1's
    // (course-schedule-from-source) UNNARROWED output directly - the same
    // course-wide rule define-course-project follows below - never
    // select-course-modules' narrowed step 2. This pins the new step to the
    // correct side of the AC3 rule explicitly, rather than relying solely on
    // its absence from the narrowed-consumers list.
    const researchStep = wf.steps.find((s) => s.id === "research-course-case-studies");
    expect(researchStep, "course-build includes research-course-case-studies").toBeTruthy();
    expect(researchStep!.type).toBe("research-course-case-studies");
    expect(researchStep!.bindings.schedule).toEqual({
      source: "step",
      stepId: "course-schedule-from-source",
      outputKey: "schedule",
    });
  });

  it("AC3: define-course-project and the course-refresh include's course-wide remap entries all read step 1's own full schedule/weeks, never step 2's narrowed output", () => {
    const defineProject = wf.steps[4];
    expect(defineProject.type).toBe("define-course-project");
    expect(defineProject.bindings.schedule).toEqual({
      source: "step",
      stepId: "course-schedule-from-source",
      outputKey: "schedule",
    });

    const includeStep = wf.steps.find((s) => s.include?.workflowId === "course-refresh")!;
    expect(includeStep.include!.remap["schedule-from-repo.schedule"]).toEqual({
      source: "step",
      stepId: "course-schedule-from-source",
      outputKey: "schedule",
    });
    expect(includeStep.include!.remap["schedule-from-repo.weeks"]).toEqual({
      source: "step",
      stepId: "course-schedule-from-source",
      outputKey: "weeks",
    });
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
    const lectureStep = wf.steps[6];
    expect(lectureStep.type).toBe("lecture-materials-from-schedule");
    for (const key of ["selectedObjectives", "selectedDecks", "selectedAssignments", "selectedOpeners"]) {
      expect(lectureStep.bindings[key]).toEqual({ source: "step", stepId: "select-course-outputs", outputKey: key });
    }
    // And step 3 itself (select-course-outputs), run blank, does resolve
    // every one of those four keys to "1".
    const result = await selectOutputs.run({}, undefined as never, () => {});
    for (const key of ["selectedObjectives", "selectedDecks", "selectedAssignments", "selectedOpeners"]) {
      expect(result.outputs[key]).toBe("1");
    }
  });
});
