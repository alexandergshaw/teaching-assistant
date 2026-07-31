// The "course-kickoff-no-code preset" describe block, split out of
// presets.test.ts to keep both files under the repo's 1000-line cap (the
// same reason presets.kickoff.test.ts was split out earlier).

import { describe, it, expect } from "vitest";
import { allWorkflows } from "./presets";
import { getStepDefinition } from "./registry";
import { outputFeedsInput, collectRuntimeFields, expandWorkflowDef } from "./types";
import type { WorkflowDef } from "./types";

describe("course-kickoff-no-code preset", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  it("course-kickoff-no-code expands course-refresh with correct step structure", () => {
    const wf = byId.get("course-kickoff-no-code");
    expect(wf, "course-kickoff-no-code is registered").toBeTruthy();

    expect(wf!.steps.length).toBe(7);
    expect(wf!.steps[0].type).toBe("load-course-tile");
    expect(wf!.steps[1].type).toBe("generate-schedule");
    // T1: the project is defined BEFORE lecture-materials-from-schedule (the
    // step that generates every week's assignment) AND before the refresh
    // include, so every generator - including the FIRST run's assignments -
    // can read it off the tile. This is the reverse of this preset's
    // original order.
    expect(wf!.steps[2].type).toBe("define-course-project");
    expect(wf!.steps[3].type).toBe("lecture-materials-from-schedule");
    expect(wf!.steps[4].type).toBe("include-workflow");
    expect(wf!.steps[5].type).toBe("integrate-source-into-lms");
    // The class-session population step runs last, after the refresh include
    // has created the LMS course and its modules.
    expect(wf!.steps[6].type).toBe("populate-lms-from-class-template");

    const includeStep = wf!.steps[4];
    expect(includeStep.include?.workflowId).toBe("course-refresh");
    // T2: source index 4 (generate-class-openers) newly joins the skip list -
    // its opener is now produced INSIDE lecture-materials-from-schedule
    // (this workflow's own step 3, above), so course-refresh's own opener
    // step must not ALSO run for this path.
    expect(includeStep.include?.skipSteps).toEqual([0, 1, 3, 4]);
    expect(includeStep.include?.remap).toBeTruthy();

    const remap = includeStep.include!.remap;
    expect(remap["0.repo"].source).toBe("literal");
    const repoBinding = remap["0.repo"];
    if (repoBinding.source === "literal") {
      expect((repoBinding as { source: "literal"; value: string }).value).toBe("");
    }
    expect(remap["0.course"].source).toBe("step");
    // T1 moved lecture-materials-from-schedule from this workflow's own step
    // index 2 to index 3 - "3.files" is a remap KEY (course-refresh's own
    // dropped lecture-zip, source top index 3) unaffected by that swap, but
    // its VALUE's stepIndex must follow the move.
    expect(remap["3.files"]).toEqual({ source: "step", stepIndex: 3, outputKey: "files" });
    // T2: source index 4 (generate-class-openers) is newly skipped - the
    // same replacement step as "3.files" above, since lecture-materials-
    // from-schedule (this workflow's step 3) now produces the opener too.
    expect(remap["4.files"]).toEqual({ source: "step", stepIndex: 3, outputKey: "files" });
  });

  it("course-kickoff-no-code has valid, type-checked bindings", () => {
    const wf = byId.get("course-kickoff-no-code");
    expect(wf, "course-kickoff-no-code is registered").toBeTruthy();

    wf!.steps.forEach((step, i) => {
      if (step.type === "include-workflow") return; // Skip include-workflow steps

      const def = getStepDefinition(step.type);
      expect(def, `course-kickoff-no-code step ${i}: unknown step type ${step.type}`).toBeTruthy();
      const inputByKey = new Map(def!.inputs.map((inp) => [inp.key, inp]));

      for (const [key, binding] of Object.entries(step.bindings)) {
        const input = inputByKey.get(key);
        expect(
          input,
          `course-kickoff-no-code step ${i}: no such input "${key}" on ${step.type}`
        ).toBeTruthy();

        if (binding.source === "step") {
          expect(binding.stepIndex, `course-kickoff-no-code step ${i}: forward ref`).toBeLessThan(i);
          const src = getStepDefinition(wf!.steps[binding.stepIndex].type);
          expect(src, `course-kickoff-no-code step ${i}: unknown source step`).toBeTruthy();
          const out = src!.outputs.find((o) => o.key === binding.outputKey);
          expect(
            out,
            `course-kickoff-no-code step ${i}: source has no output "${binding.outputKey}"`
          ).toBeTruthy();
          expect(
            outputFeedsInput(out!.type, input!.type),
            `course-kickoff-no-code step ${i}: ${out!.type} cannot feed ${input!.type} (input ${key})`
          ).toBe(true);
        }
      }

      for (const inp of def!.inputs) {
        if (inp.required) {
          expect(
            step.bindings[inp.key],
            `course-kickoff-no-code step ${i}: required input "${inp.key}" is unbound`
          ).toBeTruthy();
        }
      }
    });
  });

  it("course-kickoff-no-code expands correctly via expandWorkflowDef", () => {
    const all = allWorkflows([]);
    const byId = new Map(all.map((w) => [w.id, w]));
    const lookup = (id: string) => byId.get(id);

    const wf = byId.get("course-kickoff-no-code");
    expect(wf, "course-kickoff-no-code is registered").toBeTruthy();

    const expanded = expandWorkflowDef(wf!, lookup);
    expect(expanded.steps.length, "expansion should produce steps").toBeGreaterThan(0);

    const expandedStepTypes = expanded.steps.map((s) => s.type);

    // Should contain these steps
    expect(expandedStepTypes).toContain("save-csv-to-course");
    expect(expandedStepTypes).toContain("save-zip-to-course");
    expect(expandedStepTypes).toContain("lms-wipe");
    expect(expandedStepTypes).toContain("lms-rubric");
    expect(expandedStepTypes).toContain("lms-modules");
    expect(expandedStepTypes).toContain("lms-populate");
    expect(expandedStepTypes).toContain("lms-assignments");
    expect(expandedStepTypes).toContain("blackboard-export");
    expect(expandedStepTypes).toContain("starter-materials");

    // Should NOT contain these steps
    expect(expandedStepTypes).not.toContain("schedule-from-repo");
    expect(expandedStepTypes).not.toContain("lecture-zip");
    // T2: this path's opener is produced INSIDE lecture-materials-from-
    // schedule (buildScheduleWeekPlan's sequenceOpenerBeforeDeck phase), so
    // course-refresh's own generate-class-openers step must never appear
    // here - two live copies would produce two competing opener documents.
    expect(expandedStepTypes).not.toContain("generate-class-openers");
  });

  it("course-kickoff-no-code expanded bindings resolve correctly", () => {
    const all = allWorkflows([]);
    const byId = new Map(all.map((w) => [w.id, w]));
    const lookup = (id: string) => byId.get(id);

    const wf = byId.get("course-kickoff-no-code");
    expect(wf, "course-kickoff-no-code is registered").toBeTruthy();

    const expanded = expandWorkflowDef(wf!, lookup);

    expanded.steps.forEach((step, i) => {
      const def = getStepDefinition(step.type);
      expect(def, `expanded step ${i} (${step.type}): unknown step type`).toBeTruthy();

      const inputByKey = new Map(def!.inputs.map((inp) => [inp.key, inp]));

      for (const [key, binding] of Object.entries(step.bindings)) {
        const input = inputByKey.get(key);
        expect(input, `expanded step ${i} (${step.type}): no such input "${key}"`).toBeTruthy();

        if (binding.source === "step") {
          expect(binding.stepIndex, `expanded step ${i}: forward ref`).toBeLessThan(i);
          const src = getStepDefinition(expanded.steps[binding.stepIndex].type);
          expect(src, `expanded step ${i}: unknown source step`).toBeTruthy();
          const out = src!.outputs.find((o) => o.key === binding.outputKey);
          expect(out, `expanded step ${i}: source has no output "${binding.outputKey}"`).toBeTruthy();
          expect(
            outputFeedsInput(out!.type, input!.type),
            `expanded step ${i}: ${out!.type} cannot feed ${input!.type}`
          ).toBe(true);
        }
      }

      for (const inp of def!.inputs) {
        if (inp.required) {
          expect(step.bindings[inp.key], `expanded step ${i}: required input "${inp.key}" is unbound`).toBeTruthy();
        }
      }
    });
  });

  it("course-kickoff-no-code lms-rubric step has description and schedule bindings after expansion", () => {
    const all = allWorkflows([]);
    const byId = new Map(all.map((w) => [w.id, w]));
    const lookup = (id: string) => byId.get(id);

    const wf = byId.get("course-kickoff-no-code");
    expect(wf, "course-kickoff-no-code is registered").toBeTruthy();

    const expanded = expandWorkflowDef(wf!, lookup);

    const rubricStep = expanded.steps.find((s) => s.type === "lms-rubric");
    expect(rubricStep, "lms-rubric step found in expanded course-kickoff-no-code").toBeTruthy();

    expect(rubricStep!.bindings.repo, "repo binding exists").toBeDefined();
    expect(rubricStep!.bindings.repo.source).toBe("literal");
    if (rubricStep!.bindings.repo.source === "literal") {
      expect(rubricStep!.bindings.repo.value).toBe("");
    }

    expect(rubricStep!.bindings.description, "description binding exists").toBeDefined();
    expect(rubricStep!.bindings.description.source).toBe("step");
    if (rubricStep!.bindings.description.source === "step") {
      expect(rubricStep!.bindings.description.outputKey).toBe("description");
    }

    expect(rubricStep!.bindings.schedule, "schedule binding exists").toBeDefined();
    expect(rubricStep!.bindings.schedule.source).toBe("step");
    if (rubricStep!.bindings.schedule.source === "step") {
      expect(rubricStep!.bindings.schedule.outputKey).toBe("schedule");
    }
  });

  it("course-kickoff lms-rubric step has description and schedule bindings after expansion", () => {
    const all = allWorkflows([]);
    const byId = new Map(all.map((w) => [w.id, w]));
    const lookup = (id: string) => byId.get(id);

    const wf = byId.get("course-kickoff");
    expect(wf, "course-kickoff is registered").toBeTruthy();

    const expanded = expandWorkflowDef(wf!, lookup);

    const rubricStep = expanded.steps.find((s) => s.type === "lms-rubric");
    expect(rubricStep, "lms-rubric step found in expanded course-kickoff").toBeTruthy();

    expect(rubricStep!.bindings.repo, "repo binding exists").toBeDefined();
    expect(rubricStep!.bindings.repo.source).toBe("step");
    if (rubricStep!.bindings.repo.source === "step") {
      expect(rubricStep!.bindings.repo.outputKey).toBe("repo");
    }

    expect(rubricStep!.bindings.description, "description binding exists").toBeDefined();
    expect(rubricStep!.bindings.description.source).toBe("step");
    if (rubricStep!.bindings.description.source === "step") {
      expect(rubricStep!.bindings.description.outputKey).toBe("description");
    }

    expect(rubricStep!.bindings.schedule, "schedule binding exists").toBeDefined();
    expect(rubricStep!.bindings.schedule.source).toBe("step");
    if (rubricStep!.bindings.schedule.source === "step") {
      expect(rubricStep!.bindings.schedule.outputKey).toBe("schedule");
    }
  });

  it("course-kickoff-no-code binds generate-schedule's hubCourse to the shared 'hubCourse' fieldKey (textbook fallback)", () => {
    const wf = byId.get("course-kickoff-no-code");
    expect(wf, "course-kickoff-no-code is registered").toBeTruthy();

    const generateScheduleStep = wf!.steps[1];
    expect(generateScheduleStep.type).toBe("generate-schedule");
    const binding = generateScheduleStep.bindings.hubCourse;
    expect(binding, "hubCourse binding exists").toBeTruthy();
    expect(binding.source).toBe("runtime");
    if (binding.source === "runtime") {
      // Same fieldKey as load-course-tile's own hubCourse binding, so the run
      // form asks for the tile exactly once.
      expect(binding.fieldKey).toBe("hubCourse");
    }

    // T1 moved lecture-materials-from-schedule from index 2 to index 3
    // (define-course-project now sits at 2) - see the step-structure test
    // above.
    const lectureMaterialsStep = wf!.steps[3];
    expect(lectureMaterialsStep.type).toBe("lecture-materials-from-schedule");
    const lectureBinding = lectureMaterialsStep.bindings.hubCourse;
    expect(lectureBinding, "hubCourse binding exists").toBeTruthy();
    expect(lectureBinding.source).toBe("runtime");
    if (lectureBinding.source === "runtime") {
      expect(lectureBinding.fieldKey).toBe("hubCourse");
    }
  });

  it("course-kickoff-no-code binds lecture-materials-from-schedule's sourceMaterial to generate-schedule's resolvedSourceMaterial output (TOC-derivation thread-through)", () => {
    const wf = byId.get("course-kickoff-no-code");
    expect(wf, "course-kickoff-no-code is registered").toBeTruthy();

    // T1 moved this step from index 2 to index 3.
    const lectureMaterialsStep = wf!.steps[3];
    expect(lectureMaterialsStep.type).toBe("lecture-materials-from-schedule");
    const binding = lectureMaterialsStep.bindings.sourceMaterial;
    expect(binding, "sourceMaterial binding exists").toBeTruthy();
    expect(binding.source).toBe("step");
    if (binding.source === "step") {
      expect(binding.stepIndex).toBe(1);
      expect(binding.outputKey).toBe("resolvedSourceMaterial");
    }

    // generate-schedule (step 1) must actually declare this output for the
    // binding to be valid.
    const scheduleDef = getStepDefinition(wf!.steps[1].type);
    expect(scheduleDef!.outputs.some((o) => o.key === "resolvedSourceMaterial" && o.type === "longtext")).toBe(
      true
    );
  });

  it("course-kickoff binds generate-schedule's hubCourse to the shared 'hubCourse' fieldKey (textbook fallback)", () => {
    const wf = byId.get("course-kickoff");
    expect(wf, "course-kickoff is registered").toBeTruthy();

    const generateScheduleStep = wf!.steps[1];
    expect(generateScheduleStep.type).toBe("generate-schedule");
    const binding = generateScheduleStep.bindings.hubCourse;
    expect(binding, "hubCourse binding exists").toBeTruthy();
    expect(binding.source).toBe("runtime");
    if (binding.source === "runtime") {
      expect(binding.fieldKey).toBe("hubCourse");
    }
  });

  it("course-kickoff-no-code collectRuntimeFields yields correct scope", () => {
    const all = allWorkflows([]);
    const byId = new Map(all.map((w) => [w.id, w]));
    const lookup = (id: string) => byId.get(id);

    const wf = byId.get("course-kickoff-no-code");
    expect(wf, "course-kickoff-no-code is registered").toBeTruthy();

    const expanded = expandWorkflowDef(wf!, lookup);

    // Create a mock workflow def with the expanded steps for testing
    const expandedDef: WorkflowDef = {
      id: "course-kickoff-no-code",
      name: wf!.name,
      description: wf!.description,
      steps: expanded.steps,
      scope: wf!.scope,
    };

    const runtimeFields = collectRuntimeFields(expandedDef, (t) => getStepDefinition(t)?.inputs);

    // Should have hubCourse and deckTemplate
    expect(runtimeFields.map((f) => f.fieldKey)).toContain("hubCourse");
    expect(runtimeFields.map((f) => f.fieldKey)).toContain("deckTemplate");

    // Should NOT have repo-related fields
    expect(runtimeFields.map((f) => f.fieldKey)).not.toContain("repo");
    expect(runtimeFields.map((f) => f.fieldKey)).not.toContain("templateRepo");
    expect(runtimeFields.map((f) => f.fieldKey)).not.toContain("newRepoName");
  });

  // Both course kickoff variants must surface the material-sources checklist
  // (the new "source-url" kind lives there) in their own run form. NO_CODE_KICKOFF
  // binds it directly on lecture-materials-from-schedule; COURSE_KICKOFF gets it
  // for free through its included course-refresh's kept lecture-zip step (that
  // step's own "sources" binding is a runtime binding, not a "step" binding, so
  // expandWorkflowDef copies it through unchanged - no bindOverrides needed).
  for (const id of ["course-kickoff", "course-kickoff-no-code"]) {
    it(`${id} surfaces the shared "sources" material-sources field in its run form`, () => {
      const all = allWorkflows([]);
      const byId = new Map(all.map((w) => [w.id, w]));
      const lookup = (wid: string) => byId.get(wid);

      const wf = byId.get(id);
      expect(wf, `${id} is registered`).toBeTruthy();

      const expanded = expandWorkflowDef(wf!, lookup);
      const expandedDef: WorkflowDef = { ...wf!, steps: expanded.steps };
      const fields = collectRuntimeFields(expandedDef, (t) => getStepDefinition(t)?.inputs);

      const sourcesField = fields.find((f) => f.fieldKey === "sources");
      expect(sourcesField, `${id}: run form never asks for material sources`).toBeTruthy();
      expect(sourcesField!.type).toBe("sourcePolicy");
      expect(sourcesField!.required).toBe(false);
    });
  }
});
