import { describe, it, expect } from "vitest";
import { allWorkflows } from "./presets";
import { getStepDefinition } from "./registry";
import { outputFeedsInput, collectRuntimeFields, expandWorkflowDef } from "./types";
import type { WorkflowDef } from "./types";

// The seven presets added to lead the Workflows page, in their expected order.
const NEW_PRESET_IDS = [
  "draft-and-post-announcement",
  "weekly-study-guide-page",
  "weekly-lecture-narration",
  "weekly-lecture-video",
  "quiz-from-repo",
  "assignment-kit",
  "grow-knowledge-base",
];

describe("new lead presets", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  it("registers the seven new presets first, in order", () => {
    expect(all.slice(0, NEW_PRESET_IDS.length).map((w) => w.id)).toEqual(NEW_PRESET_IDS);
  });

  it("assigns each new preset a unique id", () => {
    const ids = all.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const id of NEW_PRESET_IDS) {
    it(`${id} has valid, type-checked bindings`, () => {
      const wf = byId.get(id);
      expect(wf, `preset ${id} is registered`).toBeTruthy();

      wf!.steps.forEach((step, i) => {
        const def = getStepDefinition(step.type);
        expect(def, `${id} step ${i}: unknown step type ${step.type}`).toBeTruthy();
        const inputByKey = new Map(def!.inputs.map((inp) => [inp.key, inp]));

        for (const [key, binding] of Object.entries(step.bindings)) {
          const input = inputByKey.get(key);
          expect(input, `${id} step ${i}: no such input "${key}" on ${step.type}`).toBeTruthy();

          if (binding.source === "step") {
            expect(binding.stepIndex, `${id} step ${i}: forward ref`).toBeLessThan(i);
            const src = getStepDefinition(wf!.steps[binding.stepIndex].type);
            expect(src, `${id} step ${i}: unknown source step`).toBeTruthy();
            const out = src!.outputs.find((o) => o.key === binding.outputKey);
            expect(out, `${id} step ${i}: source has no output "${binding.outputKey}"`).toBeTruthy();
            expect(
              outputFeedsInput(out!.type, input!.type),
              `${id} step ${i}: ${out!.type} cannot feed ${input!.type} (input ${key})`
            ).toBe(true);
          }
        }

        for (const inp of def!.inputs) {
          if (inp.required) {
            expect(step.bindings[inp.key], `${id} step ${i}: required input "${inp.key}" is unbound`).toBeTruthy();
          }
        }
      });
    });
  }
});

describe("composed presets", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  const COMPOSED_PRESET_IDS = [
    "morning-briefing",
    "inbox-reply-drafts",
    "meeting-request-autopilot",
    "grade-when-needed",
    "deadline-reminder-drafts",
    "nudge-missing-submissions",
    "quiz-pipeline",
    "course-health-check",
    "copilot-pr-shepherd",
    "module-homework-answers",
  ];

  for (const id of COMPOSED_PRESET_IDS) {
    it(`${id} has valid, type-checked bindings`, () => {
      const wf = byId.get(id);
      expect(wf, `preset ${id} is registered`).toBeTruthy();

      wf!.steps.forEach((step, i) => {
        const def = getStepDefinition(step.type);
        expect(def, `${id} step ${i}: unknown step type ${step.type}`).toBeTruthy();
        const inputByKey = new Map(def!.inputs.map((inp) => [inp.key, inp]));

        for (const [key, binding] of Object.entries(step.bindings)) {
          const input = inputByKey.get(key);
          expect(input, `${id} step ${i}: no such input "${key}" on ${step.type}`).toBeTruthy();

          if (binding.source === "step") {
            expect(binding.stepIndex, `${id} step ${i}: forward ref`).toBeLessThan(i);
            const src = getStepDefinition(wf!.steps[binding.stepIndex].type);
            expect(src, `${id} step ${i}: unknown source step`).toBeTruthy();
            const out = src!.outputs.find((o) => o.key === binding.outputKey);
            expect(out, `${id} step ${i}: source has no output "${binding.outputKey}"`).toBeTruthy();
            expect(
              outputFeedsInput(out!.type, input!.type),
              `${id} step ${i}: ${out!.type} cannot feed ${input!.type} (input ${key})`
            ).toBe(true);
          }
        }

        for (const inp of def!.inputs) {
          if (inp.required) {
            expect(step.bindings[inp.key], `${id} step ${i}: required input "${inp.key}" is unbound`).toBeTruthy();
          }
        }
      });
    });
  }
});

describe("problem-solving-companion preset", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  it("problem-solving-companion has correct step structure", () => {
    const wf = byId.get("problem-solving-companion");
    expect(wf, "problem-solving-companion is registered").toBeTruthy();

    expect(wf!.steps.length).toBe(2);
    expect(wf!.steps[0].type).toBe("list-open-problems");
    expect(wf!.steps[1].type).toBe("propose-problem-solutions");

    const step1 = wf!.steps[1];
    expect(step1.bindings.problems).toBeTruthy();
    const problemsBinding = step1.bindings.problems;
    if (problemsBinding.source === "step") {
      expect(problemsBinding.stepIndex).toBe(0);
      expect(problemsBinding.outputKey).toBe("problems");
    } else {
      throw new Error("problems binding must be from a step");
    }

    expect(step1.runIf).toBeTruthy();
    if (step1.runIf!.binding.source === "step") {
      expect(step1.runIf!.binding.stepIndex).toBe(0);
      expect(step1.runIf!.binding.outputKey).toBe("hasProblems");
      expect(step1.runIf!.expected).toBe(true);
    } else {
      throw new Error("runIf binding must be from a step");
    }
  });

  it("problem-solving-companion has valid, type-checked bindings", () => {
    const wf = byId.get("problem-solving-companion");
    expect(wf, "problem-solving-companion is registered").toBeTruthy();

    wf!.steps.forEach((step, i) => {
      const def = getStepDefinition(step.type);
      expect(def, `problem-solving-companion step ${i}: unknown step type ${step.type}`).toBeTruthy();
      const inputByKey = new Map(def!.inputs.map((inp) => [inp.key, inp]));

      for (const [key, binding] of Object.entries(step.bindings)) {
        const input = inputByKey.get(key);
        expect(input, `problem-solving-companion step ${i}: no such input "${key}" on ${step.type}`).toBeTruthy();

        if (binding.source === "step") {
          expect(binding.stepIndex, `problem-solving-companion step ${i}: forward ref`).toBeLessThan(i);
          const src = getStepDefinition(wf!.steps[binding.stepIndex].type);
          expect(src, `problem-solving-companion step ${i}: unknown source step`).toBeTruthy();
          const out = src!.outputs.find((o) => o.key === binding.outputKey);
          expect(out, `problem-solving-companion step ${i}: source has no output "${binding.outputKey}"`).toBeTruthy();
          expect(
            outputFeedsInput(out!.type, input!.type),
            `problem-solving-companion step ${i}: ${out!.type} cannot feed ${input!.type} (input ${key})`
          ).toBe(true);
        }
      }

      for (const inp of def!.inputs) {
        if (inp.required) {
          expect(step.bindings[inp.key], `problem-solving-companion step ${i}: required input "${inp.key}" is unbound`).toBeTruthy();
        }
      }
    });
  });
});

describe("course-kickoff-no-code preset", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  it("course-kickoff-no-code expands course-refresh with correct step structure", () => {
    const wf = byId.get("course-kickoff-no-code");
    expect(wf, "course-kickoff-no-code is registered").toBeTruthy();

    expect(wf!.steps.length).toBe(6);
    expect(wf!.steps[0].type).toBe("load-course-tile");
    expect(wf!.steps[1].type).toBe("generate-schedule");
    expect(wf!.steps[2].type).toBe("lecture-materials-from-schedule");
    expect(wf!.steps[3].type).toBe("include-workflow");
    expect(wf!.steps[4].type).toBe("integrate-source-into-lms");
    // The class-session population step runs last, after the refresh include
    // has created the LMS course and its modules.
    expect(wf!.steps[5].type).toBe("populate-lms-from-class-template");

    const includeStep = wf!.steps[3];
    expect(includeStep.include?.workflowId).toBe("course-refresh");
    expect(includeStep.include?.skipSteps).toEqual([0, 1, 3]);
    expect(includeStep.include?.remap).toBeTruthy();

    const remap = includeStep.include!.remap;
    expect(remap["0.repo"].source).toBe("literal");
    const repoBinding = remap["0.repo"];
    if (repoBinding.source === "literal") {
      expect((repoBinding as { source: "literal"; value: string }).value).toBe("");
    }
    expect(remap["0.course"].source).toBe("step");
    expect(remap["3.files"].source).toBe("step");
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
    expect(expandedStepTypes).toContain("generate-class-openers");
    expect(expandedStepTypes).toContain("starter-materials");

    // Should NOT contain these steps
    expect(expandedStepTypes).not.toContain("schedule-from-repo");
    expect(expandedStepTypes).not.toContain("lecture-zip");
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

    const lectureMaterialsStep = wf!.steps[2];
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

    const lectureMaterialsStep = wf!.steps[2];
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

describe("deep-check presets", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  const DEEP_CHECK_PRESET_IDS = [
    "next-week-lectures",
    "term-kickoff-import",
    "closed-institution-onboarding",
    "review-and-export-grades-csv",
    "nudge-missing-from-gradebook",
    "weekly-concept-animations",
    "weekly-everything-prep",
  ];

  for (const id of DEEP_CHECK_PRESET_IDS) {
    it(`${id} has valid, type-checked bindings`, () => {
      const wf = byId.get(id);
      expect(wf, `preset ${id} is registered`).toBeTruthy();

      wf!.steps.forEach((step, i) => {
        const def = getStepDefinition(step.type);
        expect(def, `${id} step ${i}: unknown step type ${step.type}`).toBeTruthy();
        const inputByKey = new Map(def!.inputs.map((inp) => [inp.key, inp]));

        for (const [key, binding] of Object.entries(step.bindings)) {
          const input = inputByKey.get(key);
          expect(input, `${id} step ${i}: no such input "${key}" on ${step.type}`).toBeTruthy();

          if (binding.source === "step") {
            expect(binding.stepIndex, `${id} step ${i}: forward ref`).toBeLessThan(i);
            const src = getStepDefinition(wf!.steps[binding.stepIndex].type);
            expect(src, `${id} step ${i}: unknown source step`).toBeTruthy();
            const out = src!.outputs.find((o) => o.key === binding.outputKey);
            expect(out, `${id} step ${i}: source has no output "${binding.outputKey}"`).toBeTruthy();
            expect(
              outputFeedsInput(out!.type, input!.type),
              `${id} step ${i}: ${out!.type} cannot feed ${input!.type} (input ${key})`
            ).toBe(true);
          }
        }

        for (const inp of def!.inputs) {
          if (inp.required) {
            expect(step.bindings[inp.key], `${id} step ${i}: required input "${inp.key}" is unbound`).toBeTruthy();
          }
        }
      });
    });
  }
});

describe("weekly-everything-prep scope coverage", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  it("hides lookahead fields when scope.lookahead is set", () => {
    const wf = byId.get("weekly-everything-prep");
    expect(wf, "preset weekly-everything-prep is registered").toBeTruthy();
    expect(wf!.scope?.lookahead, "scope.lookahead is set").toBe("14");

    const fields = collectRuntimeFields(wf!, (t) => getStepDefinition(t)?.inputs);
    const lookaheadFields = fields.filter((f) => f.fieldKey === "lookahead");
    expect(lookaheadFields, "no runtime lookahead fields when scope covers them").toEqual([]);
  });

  it("surfaces exactly one shared lookahead field when scope is empty", () => {
    const wf = byId.get("weekly-everything-prep");
    expect(wf, "preset weekly-everything-prep is registered").toBeTruthy();

    const withoutScope = { ...wf!, scope: {} };
    const fields = collectRuntimeFields(withoutScope, (t) => getStepDefinition(t)?.inputs);
    const lookaheadFields = fields.filter((f) => f.fieldKey === "lookahead");
    expect(lookaheadFields.length, "exactly one shared lookahead field surfaces").toBe(1);
  });
});

describe("deck-template presets ask for the template", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  for (const id of ["module-slides-from-template", "weekly-lecture-deck"]) {
    it(`${id} surfaces a required template field in the run form`, () => {
      const wf = byId.get(id);
      expect(wf, `preset ${id} is registered`).toBeTruthy();
      const fields = collectRuntimeFields(wf!, (t) => getStepDefinition(t)?.inputs);
      const templateField = fields.find((f) => f.fieldKey === "template");
      expect(templateField, `${id}: run form never asks for the template`).toBeTruthy();
      expect(templateField!.type).toBe("deckTemplate");
      expect(templateField!.required).toBe(true);
    });
  }

  for (const id of ["prepare-lecture", "next-week-lectures", "course-refresh"]) {
    it(`${id} surfaces an optional deckTemplate field in the run form`, () => {
      const wf = byId.get(id);
      expect(wf, `preset ${id} is registered`).toBeTruthy();
      const fields = collectRuntimeFields(wf!, (t) => getStepDefinition(t)?.inputs);
      const templateField = fields.find((f) => f.fieldKey === "deckTemplate");
      expect(templateField, `${id}: run form never asks for the template`).toBeTruthy();
      expect(templateField!.type).toBe("deckTemplate");
      expect(templateField!.required).toBe(false);
    });
  }

  // AC6: every preset containing a lecture-zip step binds its new moduleId
  // input - to a course-progress step's moduleRef output when the preset also
  // has one, otherwise runtime with the shared fieldKey "moduleId" (so no
  // per-step prompt duplication across presets that share the field).
  it("AC6: every lecture-zip step's moduleId input is bound", () => {
    for (const wf of all) {
      wf.steps.forEach((step, i) => {
        if (step.type !== "lecture-zip") return;
        const binding = step.bindings.moduleId;
        expect(binding, `${wf.id} step ${i}: lecture-zip's moduleId is unbound`).toBeTruthy();
        const hasCourseProgress = wf.steps.some((s) => s.type === "course-progress");
        if (hasCourseProgress) {
          expect(binding!.source, `${wf.id} step ${i}: expected a course-progress moduleRef binding`).toBe("step");
          if (binding!.source === "step") {
            expect(binding!.outputKey).toBe("moduleRef");
          }
        } else {
          expect(binding).toEqual({ source: "runtime", fieldKey: "moduleId" });
        }
      });
    }
  });

  it("every preset's required inputs are bound (runtime or wired), never silently unasked", () => {
    for (const wf of all) {
      wf.steps.forEach((step, i) => {
        // include-workflow is a composition step with no registry def; its inputs
        // come from the workflow it inlines, so it is not checked here.
        if (step.type === "include-workflow") return;
        const def = getStepDefinition(step.type);
        expect(def, `${wf.id} step ${i}: unknown step type ${step.type}`).toBeTruthy();
        for (const inp of def!.inputs) {
          if (inp.required) {
            expect(
              step.bindings[inp.key],
              `${wf.id} step ${i}: required input "${inp.key}" is unbound (would never be asked)`
            ).toBeTruthy();
          }
        }
      });
    }
  });
});

// Every workflow that produces a course kickoff or refresh must finish by
// generating the Castletop workload workbook. Both course-kickoff and
// course-kickoff-no-code end by including course-refresh, so the step is
// appended to COURSE_REFRESH only - appending it to all three would run it
// twice in both kickoffs.
describe("castletop-workbook finishes every kickoff/refresh run", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  it("course-refresh's last step is castletop-workbook", () => {
    const wf = byId.get("course-refresh");
    expect(wf, "course-refresh is registered").toBeTruthy();
    expect(wf!.steps.at(-1)?.type).toBe("castletop-workbook");
  });

  it("neither course-kickoff nor course-kickoff-no-code declares a direct castletop-workbook step (proving no duplication - it is inherited exactly once via the course-refresh include)", () => {
    for (const id of ["course-kickoff", "course-kickoff-no-code"]) {
      const wf = byId.get(id);
      expect(wf, `${id} is registered`).toBeTruthy();
      const direct = wf!.steps.filter((s) => s.type === "castletop-workbook");
      expect(
        direct.length,
        `${id}: castletop-workbook must not be a direct step (would double-run it, since it also arrives via the course-refresh include)`
      ).toBe(0);
    }
  });

  it("every input declared by the castletop-workbook step definition has a binding in course-refresh's entry", () => {
    const wf = byId.get("course-refresh");
    expect(wf, "course-refresh is registered").toBeTruthy();
    const step = wf!.steps.find((s) => s.type === "castletop-workbook");
    expect(step, "course-refresh has a castletop-workbook step").toBeTruthy();

    const def = getStepDefinition("castletop-workbook");
    expect(def, "castletop-workbook step definition is registered").toBeTruthy();

    // Derived from the step definition's inputs, not a hardcoded list, so a
    // future input added without a binding fails this test - the guard
    // against the "unbound inputs are silently skipped" failure mode.
    for (const input of def!.inputs) {
      expect(
        step!.bindings[input.key],
        `castletop-workbook input "${input.key}" is unbound in course-refresh - an unbound input is silently skipped and never appears on the run form`
      ).toBeTruthy();
    }
  });

  // castletop-workbook is last WITHIN course-refresh, and the kickoffs inherit
  // it there. It is deliberately no longer the last thing a kickoff run does:
  // the class-session population step is appended after the include, because
  // it needs the LMS course and modules that the refresh has just created.
  it("course-kickoff reaches course-refresh via an include, which is the second-to-last step", () => {
    const wf = byId.get("course-kickoff");
    expect(wf, "course-kickoff is registered").toBeTruthy();
    const includeStep = wf!.steps.at(-2);
    expect(includeStep?.type).toBe("include-workflow");
    expect(includeStep?.include?.workflowId).toBe("course-refresh");
    expect(wf!.steps.at(-1)?.type).toBe("populate-lms-from-class-template");
  });
});

// The new generate-syllabus step is appended to COURSE_REFRESH only, exactly
// like castletop-workbook above: both kickoffs include course-refresh, so
// appending it to all three would run it twice in both kickoffs.
describe("generate-syllabus runs once per kickoff/refresh run", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  it("course-refresh contains exactly one generate-syllabus step", () => {
    const wf = byId.get("course-refresh");
    expect(wf, "course-refresh is registered").toBeTruthy();
    const matches = wf!.steps.filter((s) => s.type === "generate-syllabus");
    expect(matches.length).toBe(1);
  });

  it("neither course-kickoff nor course-kickoff-no-code declares a direct generate-syllabus step (proving no duplication - it is inherited exactly once via the course-refresh include)", () => {
    for (const id of ["course-kickoff", "course-kickoff-no-code"]) {
      const wf = byId.get(id);
      expect(wf, `${id} is registered`).toBeTruthy();
      const direct = wf!.steps.filter((s) => s.type === "generate-syllabus");
      expect(
        direct.length,
        `${id}: generate-syllabus must not be a direct step (would double-run it, since it also arrives via the course-refresh include)`
      ).toBe(0);
    }
  });

  it("every input declared by the generate-syllabus step definition has a binding in course-refresh's entry", () => {
    const wf = byId.get("course-refresh");
    expect(wf, "course-refresh is registered").toBeTruthy();
    const step = wf!.steps.find((s) => s.type === "generate-syllabus");
    expect(step, "course-refresh has a generate-syllabus step").toBeTruthy();

    const def = getStepDefinition("generate-syllabus");
    expect(def, "generate-syllabus step definition is registered").toBeTruthy();

    // Derived from the step definition's inputs, not a hardcoded list, so a
    // future input added without a binding fails this test - the guard
    // against the "unbound inputs are silently skipped" failure mode.
    for (const input of def!.inputs) {
      expect(
        step!.bindings[input.key],
        `generate-syllabus input "${input.key}" is unbound in course-refresh - an unbound input is silently skipped and never appears on the run form`
      ).toBeTruthy();
    }
  });
});

// The two artifact-template steps are appended to COURSE_REFRESH only, exactly
// like castletop-workbook and generate-syllabus above: both kickoffs include
// course-refresh, so appending them to all three would run them twice in each
// kickoff.
describe("artifact template steps run once per kickoff/refresh run", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  for (const stepType of ["generate-assignment-from-template", "generate-test-from-template"]) {
    it(`course-refresh contains exactly one ${stepType} step`, () => {
      const wf = byId.get("course-refresh");
      expect(wf, "course-refresh is registered").toBeTruthy();
      expect(wf!.steps.filter((s) => s.type === stepType).length).toBe(1);
    });

    it(`neither kickoff declares a direct ${stepType} step (proving it is inherited exactly once via the course-refresh include)`, () => {
      for (const id of ["course-kickoff", "course-kickoff-no-code"]) {
        const wf = byId.get(id);
        expect(wf, `${id} is registered`).toBeTruthy();
        expect(
          wf!.steps.filter((s) => s.type === stepType).length,
          `${id}: ${stepType} must not be a direct step (would double-run it, since it also arrives via the course-refresh include)`
        ).toBe(0);
      }
    });

    it(`every input declared by the ${stepType} step definition has a binding in course-refresh's entry`, () => {
      const wf = byId.get("course-refresh");
      const step = wf!.steps.find((s) => s.type === stepType);
      expect(step, `course-refresh has a ${stepType} step`).toBeTruthy();

      const def = getStepDefinition(stepType);
      expect(def, `${stepType} step definition is registered`).toBeTruthy();

      // Derived from the step definition's inputs, not a hardcoded list, so a
      // future input added without a binding fails this test - the guard
      // against the "unbound inputs are silently skipped" failure mode.
      for (const input of def!.inputs) {
        expect(
          step!.bindings[input.key],
          `${stepType} input "${input.key}" is unbound in course-refresh - an unbound input is silently skipped and never appears on the run form`
        ).toBeTruthy();
      }
    });

    // The whole reason the template input was made optional: a required one
    // would force every Course Refresh run to pick a template before it could
    // run at all.
    it(`${stepType}'s template input is optional, so Course Refresh does not demand one`, () => {
      const def = getStepDefinition(stepType);
      const templateInput = def!.inputs.find((i) => i.key === "template");
      expect(templateInput, `${stepType} declares a template input`).toBeTruthy();
      expect(templateInput!.required).toBeFalsy();
    });
  }

  it("castletop-workbook is still the last step of course-refresh", () => {
    const wf = byId.get("course-refresh");
    expect(wf!.steps.at(-1)?.type).toBe("castletop-workbook");
  });
});

// The class-session population step goes into each KICKOFF, not into
// course-refresh: the two kickoffs need different template variants (the
// codebase course's asks for a GitHub URL submission, the no-code course's
// does not), and the shared refresh would force one variant on both.
describe("class-session population is wired into both kickoffs", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  for (const id of ["course-kickoff", "course-kickoff-no-code"]) {
    it(`${id} ends with exactly one populate-lms-from-class-template step`, () => {
      const wf = byId.get(id);
      expect(wf, `${id} is registered`).toBeTruthy();
      const matches = wf!.steps.filter((s) => s.type === "populate-lms-from-class-template");
      expect(matches.length).toBe(1);
      expect(wf!.steps.at(-1)?.type).toBe("populate-lms-from-class-template");
    });

    it(`every input of the population step is bound in ${id}`, () => {
      const wf = byId.get(id);
      const step = wf!.steps.find((s) => s.type === "populate-lms-from-class-template");
      const def = getStepDefinition("populate-lms-from-class-template");
      expect(def, "the step definition is registered").toBeTruthy();
      for (const input of def!.inputs) {
        expect(
          step!.bindings[input.key],
          `${id}: input "${input.key}" is unbound - an unbound input is silently skipped and never appears on the run form`
        ).toBeTruthy();
      }
    });
  }

  it("course-refresh does NOT declare the population step (it would force one variant on both kickoffs)", () => {
    const wf = byId.get("course-refresh");
    expect(wf!.steps.filter((s) => s.type === "populate-lms-from-class-template").length).toBe(0);
  });

  it("the template input is optional, so a kickoff run is never forced to pick one", () => {
    const def = getStepDefinition("populate-lms-from-class-template");
    expect(def!.inputs.find((i) => i.key === "template")!.required).toBeFalsy();
  });
});

// Generation must happen BEFORE anything posts to the LMS, or the generated
// artifacts cannot be part of what is posted. They reach the posting steps by
// accumulating on the `files` channel: each generator takes the set so far and
// emits it plus its own document.
describe("course-refresh generates before it posts", () => {
  const all = allWorkflows([]);
  const wf = allWorkflows([]).find((w) => w.id === "course-refresh")!;
  const typeAt = (i: number) => wf.steps[i].type;
  const indexOf = (type: string) => wf.steps.findIndex((s) => s.type === type);

  const GENERATORS = [
    "lecture-zip",
    "generate-class-openers",
    "generate-assignment-from-template",
    "generate-test-from-template",
  ];
  // Every step that pushes content into the LMS or bakes the cartridge.
  const POSTERS = ["lms-populate", "lms-assignments", "blackboard-export"];

  it("every generator runs before every posting step", () => {
    const lastGenerator = Math.max(...GENERATORS.map(indexOf));
    for (const poster of POSTERS) {
      expect(indexOf(poster), `${poster} is registered`).toBeGreaterThan(-1);
      expect(
        indexOf(poster),
        `${poster} must run after every generator, or the generated artifacts cannot be posted`
      ).toBeGreaterThan(lastGenerator);
    }
  });

  it("the generators form one unbroken files chain", () => {
    // Each generator's files input must come from the previous generator, so
    // nothing produced earlier is dropped.
    for (let i = 1; i < GENERATORS.length; i++) {
      const step = wf.steps[indexOf(GENERATORS[i])];
      const binding = step.bindings.files;
      expect(binding, `${GENERATORS[i]} has a files binding`).toBeTruthy();
      expect(binding.source).toBe("step");
      if (binding.source === "step") {
        expect(
          binding.stepIndex,
          `${GENERATORS[i]} must chain off ${GENERATORS[i - 1]}, not an earlier step`
        ).toBe(indexOf(GENERATORS[i - 1]));
      }
    }
  });

  it("every posting step consumes the LAST generator's files, not the zip's", () => {
    const last = indexOf(GENERATORS[GENERATORS.length - 1]);
    for (const poster of POSTERS) {
      const binding = wf.steps[indexOf(poster)].bindings.files;
      expect(binding, `${poster} has a files binding`).toBeTruthy();
      if (binding.source === "step") {
        expect(
          binding.stepIndex,
          `${poster} must read the fully accumulated file set`
        ).toBe(last);
      }
    }
  });

  it("every generator declares both a files input and a files output", () => {
    for (const type of GENERATORS) {
      const def = getStepDefinition(type)!;
      expect(def.outputs.some((o) => o.key === "files"), `${type} outputs files`).toBe(true);
      if (type === "lecture-zip") continue; // the chain's source, nothing upstream
      expect(def.inputs.some((i) => i.key === "files"), `${type} accepts incoming files`).toBe(true);
    }
  });

  it("castletop-workbook is still last, and the kickoffs still inherit the refresh", () => {
    expect(typeAt(wf.steps.length - 1)).toBe("castletop-workbook");
    const byId = new Map(all.map((w) => [w.id, w]));
    for (const id of ["course-kickoff", "course-kickoff-no-code"]) {
      expect(byId.get(id)!.steps.some((s) => s.include?.workflowId === "course-refresh")).toBe(true);
    }
  });
});

// Tests produced by a kickoff/refresh run are hands-on by design: the point of
// a test in this flow is to walk the student back through the motions their own
// project has already required of them.
describe("tests generated by workflows are hands-on", () => {
  const wf = allWorkflows([]).find((w) => w.id === "course-refresh")!;

  it("course-refresh pins the test step to project-based mode", () => {
    const step = wf.steps.find((s) => s.type === "generate-test-from-template")!;
    const binding = step.bindings.mode;
    expect(binding, "the test step's mode is bound").toBeTruthy();
    expect(binding.source).toBe("literal");
    if (binding.source === "literal") expect(binding.value).toBe("project-based");
  });

  it("the step declares mode as an optional override with the three accepted values", () => {
    const def = getStepDefinition("generate-test-from-template")!;
    const input = def.inputs.find((i) => i.key === "mode")!;
    expect(input, "the step declares a mode input").toBeTruthy();
    expect(input.required).toBeFalsy();
    expect(input.options).toEqual(["template", "written", "project-based"]);
  });
});
