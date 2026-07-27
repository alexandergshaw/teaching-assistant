// How the two course kickoffs and Course Refresh are wired together: the
// order generation must happen in relative to posting, which steps belong to
// which workflow, and how short the run forms are. Split out of
// presets.test.ts to keep both files under the repo's 1000-line cap.

import { describe, it, expect } from "vitest";
import { allWorkflows } from "./presets";
import { getStepDefinition } from "./registry";
import { collectRuntimeFields, expandWorkflowDef } from "./types";

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

// The no-code kickoff is the project-based course's front door: the form
// should ask for the project and little else. It reached 32 fields because
// every field of every absorbed step surfaced on it.
describe("the kickoff run forms are short and project-first", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  const fieldsOf = (id: string) => {
    const wf = byId.get(id)!;
    const expanded = expandWorkflowDef(wf, (wid) => byId.get(wid));
    // collectRuntimeFields takes a WorkflowDef, so the expanded step list is
    // spread back onto the def - this is what the run form actually sees.
    return collectRuntimeFields(
      { ...wf, steps: expanded.steps },
      (type) => getStepDefinition(type)?.inputs
    ).map((f) => f.fieldKey);
  };

  for (const id of ["course-kickoff-no-code", "course-kickoff"]) {
    it(`${id} asks for the course project`, () => {
      expect(fieldsOf(id)).toContain("courseProject");
    });

    it(`${id} no longer asks the absorbed per-step fields`, () => {
      const fields = fieldsOf(id);
      for (const gone of [
        "assignmentTopic",
        "assignmentWeek",
        "assignmentPoints",
        "assignmentPostToCanvas",
        "testTopic",
        "testWeek",
        "testPoints",
        "testPostToCanvas",
        "includeGithub",
        "regenerateSyllabus",
        "instructor",
        "instructorFileAs",
        "contactMinutes",
        "readingRate",
        "pagesPerChapter",
        "classSessionMinutes",
        "classSessionFromWeek",
        "classSessionToWeek",
        "courseProjectMode",
        "courseProjectDescription",
        "courseActivitySource",
        "courseSetupBurden",
        "regenerateCourseProject",
      ]) {
        expect(fields, `${id} still asks for "${gone}"`).not.toContain(gone);
      }
    });

    it(`${id} asks for far fewer fields than it used to`, () => {
      // It was 32 (no-code) / 34 (codebase). The exact number will drift as
      // steps change; what must not drift is the order of magnitude.
      expect(fieldsOf(id).length).toBeLessThanOrEqual(12);
      expect(fieldsOf(id).length).toBeGreaterThan(0);
    });
  }

  it("define-course-project runs before the course-refresh include in both kickoffs", () => {
    for (const id of ["course-kickoff-no-code", "course-kickoff"]) {
      const steps = byId.get(id)!.steps;
      const project = steps.findIndex((s) => s.type === "define-course-project");
      const include = steps.findIndex((s) => s.include?.workflowId === "course-refresh");
      expect(project, `${id} defines a course project`).toBeGreaterThan(-1);
      expect(
        project,
        `${id} must define the project before anything generates coursework`
      ).toBeLessThan(include);
    }
  });
});
