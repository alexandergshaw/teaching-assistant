import { describe, it, expect } from "vitest";
import { allWorkflows } from "./presets";
import { getStepDefinition } from "./registry";
import { outputFeedsInput, collectRuntimeFields, expandWorkflowDef } from "./types";

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

// The "course-kickoff-no-code preset" describe block moved to its own file,
// presets.course-kickoff-no-code.test.ts, to keep this file under the repo's
// 1000-line cap (the same reason presets.kickoff.test.ts was split out
// earlier) - see that file for its content, unchanged in substance.

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
    "weekly-lecture-deck",
    "module-slides-from-template",
    "weekly-kickoff-announcement",
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

// The structural fix for the "Weekly Kickoff Announcement said Module 07 but
// described Module 06's content" bug: pull-current-materials must receive
// course-progress's name-reference moduleRef (targets the SAME module by
// name, never by array position), and compose-weekly-announcement's title
// must come from the module pull-current-materials actually gathered - not
// from course-progress's derived name - so title and body can never disagree
// again. Generic binding validity for this preset is covered by the
// deep-check list above.
describe("weekly-kickoff-announcement: moduleRef threading", () => {
  const wf = new Map(allWorkflows([]).map((w) => [w.id, w])).get("weekly-kickoff-announcement")!;

  it("binds pull-current-materials's moduleRef from course-progress's moduleRef output (step 0)", () => {
    expect(wf.steps[1].type).toBe("pull-current-materials");
    expect(wf.steps[1].bindings.moduleRef).toEqual({ source: "step", stepIndex: 0, outputKey: "moduleRef" });
  });

  it("binds compose-weekly-announcement's moduleName from pull-current-materials's moduleName output (step 1), not course-progress (step 0)", () => {
    expect(wf.steps[2].type).toBe("compose-weekly-announcement");
    expect(wf.steps[2].bindings.moduleName).toEqual({ source: "step", stepIndex: 1, outputKey: "moduleName" });
  });
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

  // docs/REGRESSION.md 155 moved save-zip-to-course (the terminal zip) to
  // the very end of course-refresh, after castletop-workbook, so the zip can
  // bundle everything the run produced including the workbook's sibling
  // artifacts (the rubric, the schedule). castletop-workbook itself did not
  // move - it is still the step immediately before the zip.
  it("castletop-workbook is second-to-last in course-refresh, immediately before save-zip-to-course", () => {
    const wf = byId.get("course-refresh");
    expect(wf, "course-refresh is registered").toBeTruthy();
    expect(wf!.steps.at(-2)?.type).toBe("castletop-workbook");
    expect(wf!.steps.at(-1)?.type).toBe("save-zip-to-course");
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

  // docs/REGRESSION.md 155: save-zip-to-course gained two new optional
  // inputs (rubricFiles, schedule) when it moved to the end of
  // course-refresh - this is the same "every declared input has a binding"
  // guard the other appended steps above already get, applied to it.
  it("every input declared by the save-zip-to-course step definition has a binding in course-refresh's entry", () => {
    const wf = byId.get("course-refresh");
    expect(wf, "course-refresh is registered").toBeTruthy();
    const step = wf!.steps.find((s) => s.type === "save-zip-to-course");
    expect(step, "course-refresh has a save-zip-to-course step").toBeTruthy();

    const def = getStepDefinition("save-zip-to-course");
    expect(def, "save-zip-to-course step definition is registered").toBeTruthy();

    for (const input of def!.inputs) {
      // "name" is a deliberate exception (pre-existing, unchanged by
      // docs/REGRESSION.md 155): left unbound so it defaults to the course
      // tile's own name (see the step's run() - an explicit override is an
      // advanced/custom-workflow knob, not something Course Refresh forces a
      // choice on).
      if (input.key === "name") continue;
      expect(
        step!.bindings[input.key],
        `save-zip-to-course input "${input.key}" is unbound in course-refresh - an unbound input is silently skipped and never appears on the run form`
      ).toBeTruthy();
    }
  });

  // save-zip-to-course (the terminal zip) is last WITHIN course-refresh, and
  // the kickoffs inherit it there. It is deliberately no longer the last
  // thing a kickoff run does: the class-session population step is appended
  // after the include, because it needs the LMS course and modules that the
  // refresh has just created - it produces no new zip-worthy artifact of its
  // own, so nothing is lost from the zip by running after it.
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

  it("castletop-workbook is still second-to-last in course-refresh (save-zip-to-course, the terminal zip, is now last - docs/REGRESSION.md 155)", () => {
    const wf = byId.get("course-refresh");
    expect(wf!.steps.at(-2)?.type).toBe("castletop-workbook");
    expect(wf!.steps.at(-1)?.type).toBe("save-zip-to-course");
  });
});

// A no-code course must never be handed a programming warm-up. MGT 422
// Project Management shipped 16 openers that were bare Python snippets.
describe("class opener warm-ups match the course type", () => {
  const byId = new Map(allWorkflows([]).map((w) => [w.id, w]));

  it("both kickoff expansions retire the duplicate standalone opener", () => {
    for (const id of ["course-kickoff", "course-kickoff-no-code"]) {
      const expanded = expandWorkflowDef(byId.get(id)!, (workflowId) => byId.get(workflowId));
      expect(expanded.steps.filter((step) => step.type === "generate-class-openers"), id).toHaveLength(0);
    }
  });

  it("the codebase kickoff reaches exactly one repo lecture-zip, whose in-plan opener is coding by construction", () => {
    const expanded = expandWorkflowDef(byId.get("course-kickoff")!, (workflowId) => byId.get(workflowId));
    expect(expanded.steps.filter((step) => step.type === "lecture-zip")).toHaveLength(1);
    expect(expanded.steps.some((step) => step.type === "lecture-materials-from-schedule")).toBe(false);
  });

  it("the no-code kickoff reaches exactly one applied schedule-materials step", () => {
    const step = byId
      .get("course-kickoff-no-code")!
      .steps.find((candidate) => candidate.type === "lecture-materials-from-schedule")!;
    expect(step.bindings.courseKind).toEqual({ source: "literal", value: "applied" });
  });

  it("the standalone opener step remains reusable with both accepted exercise kinds", () => {
    const input = getStepDefinition("generate-class-openers")!.inputs.find((i) => i.key === "exerciseKind");
    expect(input, "generate-class-openers declares an exerciseKind input").toBeTruthy();
    expect(input!.options).toEqual(["coding", "applied"]);
  });
});

// The no-code kickoff must produce no code anywhere - slides, speaker notes,
// or assignment instructions. MGT 422 received Python in all three.
describe("the no-code kickoff pins its course type", () => {
  const byId = new Map(allWorkflows([]).map((w) => [w.id, w]));

  it("binds courseKind to applied on the schedule-driven lecture step", () => {
    const step = byId
      .get("course-kickoff-no-code")!
      .steps.find((s) => s.type === "lecture-materials-from-schedule")!;
    expect(step, "the no-code kickoff builds lectures from the schedule").toBeTruthy();
    const binding = step.bindings.courseKind;
    expect(binding, "courseKind is bound").toBeTruthy();
    expect(binding.source).toBe("literal");
    if (binding.source === "literal") expect(binding.value).toBe("applied");
  });

  it("the step declares courseKind with both accepted values", () => {
    const input = getStepDefinition("lecture-materials-from-schedule")!.inputs.find(
      (i) => i.key === "courseKind"
    );
    expect(input, "the step declares a courseKind input").toBeTruthy();
    expect(input!.required).toBeFalsy();
    expect(input!.options).toEqual(["coding", "applied"]);
  });

  // T2: there is no longer a SEPARATE opener exercise-kind signal to agree
  // with for the no-code path - lecture-materials-from-schedule's own
  // courseKind binding is the ONLY signal, read directly inside
  // buildScheduleWeekPlan to derive the in-plan opener's exerciseKind
  // ("applied" courseKind -> "applied" exerciseKind - see
  // course-planning-grounding.ts). Two independent bindings that had to be
  // kept in sync manually cannot drift apart when there is only one.
  it("the no-code kickoff's lecture-materials-from-schedule courseKind is the ONLY signal driving the in-plan opener's exercise kind", () => {
    const wf = byId.get("course-kickoff-no-code")!;
    const lecture = wf.steps.find((s) => s.type === "lecture-materials-from-schedule")!;
    const lectureKind =
      lecture.bindings.courseKind.source === "literal" ? lecture.bindings.courseKind.value : "";
    expect(lectureKind).toBe("applied");

    const include = wf.steps.find((s) => s.include?.workflowId === "course-refresh")!;
    expect(Object.keys(include.include!.bindOverrides ?? {}).some((key) => key.endsWith(".exerciseKind"))).toBe(false);
  });
});

// These assert the EXPANDED workflow, not the preset source. A bindOverrides
// key is positional against COURSE_REFRESH's array and is skipped SILENTLY on
// a miss, so checking that the override entry exists proves nothing about
// what the step actually receives.
describe("no-code kickoff: no generator can produce code", () => {
  const byId = new Map(allWorkflows([]).map((w) => [w.id, w]));

  const resolved = (workflowId: string, stepType: string, inputKey: string) => {
    const wf = byId.get(workflowId)!;
    const expanded = expandWorkflowDef(wf, (id) => byId.get(id));
    const step = expanded.steps.find((s) => s.type === stepType);
    return step?.bindings[inputKey];
  };

  // T2: "generate-class-openers"/"exerciseKind" removed from this list -
  // that step no longer appears AT ALL in the no-code kickoff's expansion
  // (it is skipped; the opener now generates inside lecture-materials-from-
  // schedule), so `resolved` would return undefined for it here, not a
  // "coding" leak. Its own dedicated coverage lives in "class opener
  // warm-ups match the course type" above (the codebase kickoff still pins
  // "coding" there; the no-code kickoff has nothing left to pin).
  const CODE_CAPABLE: Array<[string, string]> = [
    ["lecture-materials-from-schedule", "courseKind"],
    ["generate-assignment-from-template", "courseKind"],
    ["generate-test-from-template", "courseKind"],
    ["define-course-project", "courseKind"],
    ["generate-knowledge-checks", "courseKind"],
    ["generate-weekly-significance", "courseKind"],
    ["generate-instructor-notes", "courseKind"],
  ];

  for (const [stepType, inputKey] of CODE_CAPABLE) {
    it(`${stepType} resolves ${inputKey} to "applied" after expansion`, () => {
      const binding = resolved("course-kickoff-no-code", stepType, inputKey);
      expect(binding, `${stepType} is reachable and binds ${inputKey}`).toBeTruthy();
      expect(binding!.source).toBe("literal");
      if (binding!.source === "literal") {
        expect(binding!.value, `${stepType}.${inputKey} must be applied`).toBe("applied");
      }
    });
  }

  // The codebase kickoff builds lectures from the REPO (lecture-zip), not from
  // the schedule, so it has no lecture-materials-from-schedule step at all.
  // Every code-capable generator it DOES reach must say coding.
  it("the codebase kickoff never resolves one of them to applied", () => {
    for (const [stepType, inputKey] of CODE_CAPABLE) {
      const binding = resolved("course-kickoff", stepType, inputKey);
      if (!binding) continue;
      if (binding.source === "literal") {
        expect(binding.value, `${stepType}.${inputKey}`).toBe("coding");
      }
    }
  });

  // Every one of these must agree - a single "coding" among them is a leak.
  it("no code-capable generator is left on the coding default", () => {
    const kinds = CODE_CAPABLE.map(([stepType, inputKey]) => {
      const b = resolved("course-kickoff-no-code", stepType, inputKey);
      return b && b.source === "literal" ? b.value : "UNBOUND";
    });
    expect(new Set(kinds)).toEqual(new Set(["applied"]));
  });
});

// The instructor asked for weekly knowledge checks / weekly significance /
// instructor notes to depend on the schedule step, not on generate-lms-
// modules - so an lms-modules failure (Canvas API/auth/rate-limit) no
// longer skips their local deliverables (see presets.course-build.
// resilience.test.ts). The fix is deleting each step's "modules" binding
// (presets/course-setup.ts's COURSE_REFRESH) - but this repo silently skips
// unbound inputs (docs/REGRESSION.md has shipped no-op fixes on that trap
// before), so merely deleting the source line is not itself proof anything
// changed. This is the load-bearing check: the EXPANDED step's own
// bindings.modules must actually come back undefined in every preset that
// reaches it, not just in the raw, unexpanded course-refresh source.
describe("weekly knowledge checks / significance / instructor notes: modules unbound, schedule unchanged", () => {
  const byId = new Map(allWorkflows([]).map((w) => [w.id, w]));

  const MODULE_PLACEMENT_STEPS = [
    "generate-knowledge-checks",
    "generate-weekly-significance",
    "generate-instructor-notes",
  ];

  for (const presetId of ["course-kickoff", "course-kickoff-no-code", "course-refresh"]) {
    it(`${presetId}: the expanded "modules" binding on all three steps is undefined`, () => {
      const wf = byId.get(presetId);
      expect(wf, `${presetId} is registered`).toBeTruthy();
      const expanded = expandWorkflowDef(wf!, (id) => byId.get(id));

      for (const type of MODULE_PLACEMENT_STEPS) {
        const step = expanded.steps.find((s) => s.type === type);
        expect(step, `${presetId}: expansion reaches ${type}`).toBeTruthy();
        expect(step!.bindings.modules, `${presetId}: ${type}'s "modules" binding must be undefined`).toBeUndefined();
      }
    });
  }

  // AC2: the schedule binding these three steps already had (bound to
  // schedule-from-repo's own "schedule" output, source index 1) must be
  // byte-identical to before - unchanged by this fix.
  it("course-refresh: all three steps still bind schedule to schedule-from-repo's own output (step 1), unchanged", () => {
    const wf = byId.get("course-refresh")!;
    for (const type of MODULE_PLACEMENT_STEPS) {
      const step = wf.steps.find((s) => s.type === type);
      expect(step, `course-refresh has a ${type} step`).toBeTruthy();
      expect(step!.bindings.schedule).toEqual({ source: "step", stepIndex: 1, outputKey: "schedule" });
    }
  });
});
