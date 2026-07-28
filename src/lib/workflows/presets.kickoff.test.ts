// How the two course kickoffs and Course Refresh are wired together: the
// order generation must happen in relative to posting, which steps belong to
// which workflow, and how short the run forms are. Split out of
// presets.test.ts to keep both files under the repo's 1000-line cap.

import { describe, it, expect } from "vitest";
import { allWorkflows } from "./presets";
import { getStepDefinition } from "./registry";
import { collectRuntimeFields, expandWorkflowDef } from "./types";
import type { WorkflowStepConfig } from "./types";

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

  // The no-code kickoff is the only preset that wants a course with no
  // description to get a project anyway - a typed description still wins
  // (see the "resolves autoDefine" tests below), but leaving the box empty
  // must no longer mean "this course is not project-based". The codebase
  // kickoff is left completely alone: its request was specifically about
  // no-code kickoffs, and an unbound optional input is simply skipped, so
  // its behavior is unaffected without touching it at all.
  it("only course-kickoff-no-code binds define-course-project's new schedule/autoDefine inputs", () => {
    const noCode = byId.get("course-kickoff-no-code")!.steps.find((s) => s.type === "define-course-project")!;
    expect(noCode.bindings.schedule).toEqual({ source: "step", stepIndex: 1, outputKey: "schedule" });
    expect(noCode.bindings.autoDefine).toEqual({ source: "literal", value: "1" });

    // stepIndex 1 must actually be generate-schedule and its "schedule"
    // output must exist - a stale index would silently bind nothing useful.
    const noCodeSteps = byId.get("course-kickoff-no-code")!.steps;
    expect(noCodeSteps[1].type).toBe("generate-schedule");
    const scheduleOutput = getStepDefinition("generate-schedule")!.outputs.find((o) => o.key === "schedule");
    expect(scheduleOutput, "generate-schedule declares a schedule output").toBeTruthy();
    expect(scheduleOutput!.type).toBe("schedule");

    const coding = byId.get("course-kickoff")!.steps.find((s) => s.type === "define-course-project")!;
    expect(coding.bindings.schedule).toBeUndefined();
    expect(coding.bindings.autoDefine).toBeUndefined();
  });
});

// The no-code kickoff must produce a module-content zip alongside the LMS
// cartridge, exactly like the codebase kickoff does. COURSE_REFRESH's
// lecture-zip (source top index 3) is skipped in the no-code include
// (skipSteps [0, 1, 3]) because a no-code course has no repository to zip -
// but the include's remap ("3.files") reroutes every consumer that would
// have read lecture-zip's output to course-kickoff-no-code's OWN
// lecture-materials-from-schedule step instead, which builds the equivalent
// deck+notes(+instructions) zip from the schedule. That remapped step feeds
// save-zip-to-course (the step that bundles the course tile's "Course
// Materials" zip) exactly the way lecture-zip feeds it in the codebase
// kickoff.
//
// These assertions run against the EXPANDED workflow (expandWorkflowDef, the
// same helper the runners use) rather than the preset source: a
// remap/bindOverrides key is positional and is skipped silently on a miss, so
// checking the preset literal proves nothing about what actually runs.
describe("no-code kickoff produces a module-content zip alongside the cartridge", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));
  const lookup = (id: string) => byId.get(id);

  const expandedStepsOf = (id: string) => expandWorkflowDef(byId.get(id)!, lookup).steps;

  // Resolves a named consumer step's "files" binding to the TYPE of the step
  // that actually feeds it, so the assertion reads as "X receives Y's files"
  // instead of a brittle numeric index that drifts whenever an unrelated step
  // is inserted earlier in the array.
  function filesSourceType(steps: WorkflowStepConfig[], consumerType: string): string {
    const idx = steps.findIndex((s) => s.type === consumerType);
    expect(idx, `${consumerType} is present in the expansion`).toBeGreaterThan(-1);
    const binding = steps[idx].bindings.files;
    expect(binding, `${consumerType}'s files input is bound`).toBeTruthy();
    if (binding!.source !== "step") return `non-step:${binding!.source}`;
    return steps[binding!.stepIndex].type;
  }

  it("the expanded no-code kickoff contains save-zip-to-course (the zip-producing step)", () => {
    const steps = expandedStepsOf("course-kickoff-no-code");
    expect(steps.some((s) => s.type === "save-zip-to-course")).toBe(true);
  });

  it("save-zip-to-course is fed by lecture-materials-from-schedule's files (the remap's replacement for the dropped lecture-zip)", () => {
    const steps = expandedStepsOf("course-kickoff-no-code");
    expect(filesSourceType(steps, "save-zip-to-course")).toBe("lecture-materials-from-schedule");
  });

  it("generate-class-openers receives the same lecture-materials-from-schedule files as save-zip-to-course", () => {
    const steps = expandedStepsOf("course-kickoff-no-code");
    expect(filesSourceType(steps, "generate-class-openers")).toBe("lecture-materials-from-schedule");
  });

  it("generate-assignment-from-template chains off generate-class-openers, unchanged from the coded kickoff's shape", () => {
    const steps = expandedStepsOf("course-kickoff-no-code");
    expect(filesSourceType(steps, "generate-assignment-from-template")).toBe("generate-class-openers");
  });

  it("generate-test-from-template chains off generate-assignment-from-template", () => {
    const steps = expandedStepsOf("course-kickoff-no-code");
    expect(filesSourceType(steps, "generate-test-from-template")).toBe("generate-assignment-from-template");
  });

  for (const poster of ["lms-populate", "lms-assignments", "blackboard-export"]) {
    it(`${poster} still receives the fully accumulated file set (through generate-test-from-template), not the raw lecture zip`, () => {
      const steps = expandedStepsOf("course-kickoff-no-code");
      expect(filesSourceType(steps, poster)).toBe("generate-test-from-template");
    });
  }

  it("course-kickoff (codebase) is unchanged: save-zip-to-course and generate-class-openers are still fed by lecture-zip directly", () => {
    const steps = expandedStepsOf("course-kickoff");
    expect(filesSourceType(steps, "save-zip-to-course")).toBe("lecture-zip");
    expect(filesSourceType(steps, "generate-class-openers")).toBe("lecture-zip");
  });

  it("course-kickoff's posting steps are unchanged: still fed by the fully accumulated chain", () => {
    const steps = expandedStepsOf("course-kickoff");
    for (const poster of ["lms-populate", "lms-assignments", "blackboard-export"]) {
      expect(filesSourceType(steps, poster)).toBe("generate-test-from-template");
    }
  });
});
