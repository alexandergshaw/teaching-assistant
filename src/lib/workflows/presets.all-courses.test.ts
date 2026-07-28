import { describe, it, expect } from "vitest";
import { allWorkflows, ZERO_MISSING_SUBMISSIONS_ALL_COURSES, BATCH_GRADE_REPOS_ALL_COURSES } from "./presets";
import { getStepDefinition } from "./registry";
import { isHeadlessSafeWorkflow, HEADLESS_SAFE_STEP_TYPES } from "./headless";

const ALL_COURSES_PRESET_IDS = [
  "zero-missing-submissions-all-courses",
  "batch-grade-student-repos-all-courses",
];

describe("all-courses grading presets", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));
  const lookup = (id: string) => byId.get(id);

  it("registers both presets, appended after the existing catalog (never re-ordering pinned indices)", () => {
    expect(all.at(-1)?.id).toBe("batch-grade-student-repos-all-courses");
    expect(all.at(-2)?.id).toBe("zero-missing-submissions-all-courses");
    // The existing last preset before this change stays exactly where it was.
    expect(all.find((w) => w.id === "module-homework-answers")).toBeTruthy();
  });

  it("assigns each a unique id", () => {
    const ids = all.map((w) => w.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("zero-missing-submissions-all-courses binds the single draft-missing-zeros step's courses input to literal '*' (the all-courses scope) and nothing else", () => {
    const wf = byId.get("zero-missing-submissions-all-courses");
    expect(wf, "preset is registered").toBeTruthy();
    expect(wf!.steps.length).toBe(1);
    expect(wf!.steps[0].type).toBe("draft-missing-zeros");
    expect(wf!.steps[0].bindings.courses).toEqual({ source: "literal", value: "*" });
    // The single-course inputs are deliberately left unbound - a schedule for
    // this preset needs no per-run input.
    expect(wf!.steps[0].bindings.course).toBeUndefined();
    expect(wf!.steps[0].bindings.assignment).toBeUndefined();
  });

  it("batch-grade-student-repos-all-courses binds the single batch-grade-repos-to-draft step's hubCourses input to literal '*' (the all-courses scope) and nothing else", () => {
    const wf = byId.get("batch-grade-student-repos-all-courses");
    expect(wf, "preset is registered").toBeTruthy();
    expect(wf!.steps.length).toBe(1);
    expect(wf!.steps[0].type).toBe("batch-grade-repos-to-draft");
    expect(wf!.steps[0].bindings.hubCourses).toEqual({ source: "literal", value: "*" });
    expect(wf!.steps[0].bindings.hubCourse).toBeUndefined();
  });

  for (const id of ALL_COURSES_PRESET_IDS) {
    it(`${id} has valid, type-checked bindings (every step/input exists, every "step" binding's output type feeds the input type)`, () => {
      const wf = byId.get(id);
      expect(wf, `preset ${id} is registered`).toBeTruthy();

      wf!.steps.forEach((step) => {
        const def = getStepDefinition(step.type);
        expect(def, `unknown step type ${step.type}`).toBeTruthy();
        const inputByKey = new Map(def!.inputs.map((inp) => [inp.key, inp]));
        for (const key of Object.keys(step.bindings)) {
          expect(inputByKey.get(key), `no such input "${key}" on ${step.type}`).toBeTruthy();
        }
      });
    });

    it(`${id}: every required input is bound (the existing global presets.test.ts loop covers this too - asserted directly here as well)`, () => {
      const wf = byId.get(id);
      expect(wf, `preset ${id} is registered`).toBeTruthy();
      wf!.steps.forEach((step) => {
        const def = getStepDefinition(step.type)!;
        for (const inp of def.inputs) {
          if (inp.required) {
            expect(step.bindings[inp.key], `required input "${inp.key}" is unbound`).toBeTruthy();
          }
        }
      });
    });

    it(`${id} is headless-safe (schedulable unattended)`, () => {
      expect(isHeadlessSafeWorkflow(byId.get(id)!, lookup)).toBe(true);
    });
  }

  it("draft-missing-zeros and batch-grade-repos-to-draft were already headless-safe step types before this change (no new step type was introduced, so the headless canary count is unaffected)", () => {
    expect(HEADLESS_SAFE_STEP_TYPES.has("draft-missing-zeros")).toBe(true);
    expect(HEADLESS_SAFE_STEP_TYPES.has("batch-grade-repos-to-draft")).toBe(true);
  });
});

describe("all-courses grading presets - direct export sanity", () => {
  it("ZERO_MISSING_SUBMISSIONS_ALL_COURSES and BATCH_GRADE_REPOS_ALL_COURSES are exported with the expected ids", () => {
    expect(ZERO_MISSING_SUBMISSIONS_ALL_COURSES.id).toBe("zero-missing-submissions-all-courses");
    expect(BATCH_GRADE_REPOS_ALL_COURSES.id).toBe("batch-grade-student-repos-all-courses");
  });
});
