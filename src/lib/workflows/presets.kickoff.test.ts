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
  // lms-populate/lms-assignments read the per-week GENERATORS chain directly
  // (unchanged by Group Q - see generate-course-guides' own AC6 rationale for
  // why lms-populate deliberately does NOT also see the course-wide guides).
  // blackboard-export's chain now extends further, through generate-course-
  // guides and generate-weekly-announcements (Group Q), so it is asserted
  // separately below rather than lumped in with the other two POSTERS.
  const LMS_POSTERS = ["lms-populate", "lms-assignments"];
  // The LAST step that produces a "files" output as of Group Q (course guide
  // documents + weekly announcements) - the tail of the extended chain that
  // blackboard-export and save-zip-to-course now read.
  const LAST_FILES_PRODUCER = "generate-weekly-announcements";

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

  it("lms-populate/lms-assignments consume the LAST generator's files, not an earlier step's", () => {
    const last = indexOf(GENERATORS[GENERATORS.length - 1]);
    for (const poster of LMS_POSTERS) {
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

  // Group Q (course guide documents + weekly announcements): blackboard-
  // export must reach both, or Q2-AC5/Q3-AC2 ("the guides/announcements
  // reach the cartridge") is unmet - so its files binding now points past
  // the GENERATORS chain, at generate-weekly-announcements (which itself
  // chains off generate-course-guides, which chains off the last
  // generator - see steps.course-guides.ts's and steps.weekly-
  // announcements.ts's own "files" in+out convention).
  it("blackboard-export consumes the LAST files-producing step, extended by Group Q past the GENERATORS chain", () => {
    const last = indexOf(LAST_FILES_PRODUCER);
    const binding = wf.steps[indexOf("blackboard-export")].bindings.files;
    expect(binding, "blackboard-export has a files binding").toBeTruthy();
    if (binding.source === "step") {
      expect(
        binding.stepIndex,
        "blackboard-export must read the fully accumulated file set, including the guides and announcements"
      ).toBe(last);
    }
  });

  // docs/REGRESSION.md 155 (AC2): save-zip-to-course used to read
  // lecture-zip's own output directly (stepIndex 3) - skipping past
  // whatever generate-class-openers/generate-assignment-from-template/
  // generate-test-from-template added afterward, which is exactly why a
  // real 16-week run's zip was missing those weeks' assignment and test
  // documents. It must now read the SAME fully accumulated set the posting
  // steps read, or "literally all artifacts" is unmet - Group Q (course
  // guides + weekly announcements) extended that set further still, so
  // this now points past the GENERATORS chain too (see the blackboard-
  // export assertion just above).
  it("save-zip-to-course also consumes the LAST files-producing step", () => {
    const last = indexOf(LAST_FILES_PRODUCER);
    const binding = wf.steps[indexOf("save-zip-to-course")].bindings.files;
    expect(binding, "save-zip-to-course has a files binding").toBeTruthy();
    expect(binding.source).toBe("step");
    if (binding.source === "step") {
      expect(
        binding.stepIndex,
        "save-zip-to-course must read the fully accumulated file set, not lecture-zip's own output"
      ).toBe(last);
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

  // save-zip-to-course (the terminal zip) is now last, moved there
  // (docs/REGRESSION.md 155) so it can also bundle the rubric and the
  // schedule CSV, which only exist by the time lms-rubric and
  // schedule-from-repo have run - castletop-workbook, unmoved, sits
  // immediately before it.
  it("save-zip-to-course is last, castletop-workbook is second-to-last, and the kickoffs still inherit the refresh", () => {
    expect(typeAt(wf.steps.length - 1)).toBe("save-zip-to-course");
    expect(typeAt(wf.steps.length - 2)).toBe("castletop-workbook");
    const byId = new Map(all.map((w) => [w.id, w]));
    for (const id of ["course-kickoff", "course-kickoff-no-code"]) {
      expect(byId.get(id)!.steps.some((s) => s.include?.workflowId === "course-refresh")).toBe(true);
    }
  });

  // lms-rubric never throws (every failure path inside it degrades to an
  // empty rubricFiles or a note - see steps.rubrics.ts), so it is safe for
  // save-zip-to-course to depend on directly: a rubric hiccup can never
  // cascade into losing the whole zip. schedule-from-repo (step 1) is
  // already load-bearing for the entire chain above (lecture-zip's own
  // schedule input binds to it), so reusing it here for the CSV adds no new
  // failure mode.
  it("save-zip-to-course also reads lms-rubric's rubricFiles and schedule-from-repo's schedule", () => {
    const step = wf.steps[indexOf("save-zip-to-course")];
    expect(step.bindings.rubricFiles).toEqual({
      source: "step",
      stepIndex: indexOf("lms-rubric"),
      outputKey: "rubricFiles",
    });
    expect(step.bindings.schedule).toEqual({
      source: "step",
      stepIndex: 1,
      outputKey: "schedule",
    });
    expect(wf.steps[1].type).toBe("schedule-from-repo");
  });

  // castletop-workbook and generate-syllabus are DELIBERATELY not chained
  // into save-zip-to-course: both can throw on plausible, narrow
  // configuration gaps (no syllabus template set; a Castletop data issue),
  // and the runner cascades ANY step-to-step binding's failure to its
  // dependents (server-runner.ts) - chaining them in would turn one
  // unrelated failure into losing the entire zip (all 16 weeks, the rubric,
  // the schedule), which is worse than the instructor fetching those two
  // files from their own already-dedicated locations.
  it("save-zip-to-course does not bind to castletop-workbook or generate-syllabus", () => {
    const step = wf.steps[indexOf("save-zip-to-course")];
    const boundStepIndices = Object.values(step.bindings)
      .filter((b) => b.source === "step")
      .map((b) => (b as { stepIndex: number }).stepIndex);
    expect(boundStepIndices).not.toContain(indexOf("castletop-workbook"));
    expect(boundStepIndices).not.toContain(indexOf("generate-syllabus"));
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
        // NOTE: "instructor" is deliberately NOT in this list (Group Q,
        // Q4-AC2): generate-course-guides now asks it too (for the
        // Instructor Contact document), and it is bound HERE only, not
        // blanked - unlike castletop-workbook's own "instructor" input,
        // which IS still force-blanked below (17.instructor) for the
        // pre-existing reason that comment states.
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
      // steps change; what must not drift is the order of magnitude. Group Q
      // added three legitimate new fields shared across both kickoffs
      // ("instructor", "guidesPostToLms", "announcementsPostToLms"), raising
      // the ceiling from 12 to 15.
      expect(fieldsOf(id).length).toBeLessThanOrEqual(15);
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
// the SAME generator chain (openers -> assignment template -> test template)
// in both kickoffs, and save-zip-to-course (the step that bundles the course
// tile's "Course Materials" zip - now moved to the very end of course-refresh,
// docs/REGRESSION.md 155) reads that chain's LAST link in both, exactly the
// way the LMS-posting steps already did before this change.
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

  it("generate-class-openers is fed by lecture-materials-from-schedule's files (the remap's replacement for the dropped lecture-zip)", () => {
    const steps = expandedStepsOf("course-kickoff-no-code");
    expect(filesSourceType(steps, "generate-class-openers")).toBe("lecture-materials-from-schedule");
  });

  // save-zip-to-course moved to the very end of course-refresh
  // (docs/REGRESSION.md 155), so in the expansion it reads the LAST
  // files-producing step's output - the fully accumulated chain - exactly
  // like blackboard-export, not lecture-materials-from-schedule's own
  // output directly. Group Q (course guide documents + weekly
  // announcements) extended that chain past generate-test-from-template, so
  // the tail is now generate-weekly-announcements (which itself chains off
  // generate-course-guides, which chains off generate-test-from-template).
  it("save-zip-to-course receives the fully accumulated file set (through generate-weekly-announcements), not the raw lecture-materials-from-schedule output", () => {
    const steps = expandedStepsOf("course-kickoff-no-code");
    expect(filesSourceType(steps, "save-zip-to-course")).toBe("generate-weekly-announcements");
  });

  it("generate-assignment-from-template chains off generate-class-openers, unchanged from the coded kickoff's shape", () => {
    const steps = expandedStepsOf("course-kickoff-no-code");
    expect(filesSourceType(steps, "generate-assignment-from-template")).toBe("generate-class-openers");
  });

  it("generate-test-from-template chains off generate-assignment-from-template", () => {
    const steps = expandedStepsOf("course-kickoff-no-code");
    expect(filesSourceType(steps, "generate-test-from-template")).toBe("generate-assignment-from-template");
  });

  for (const poster of ["lms-populate", "lms-assignments"]) {
    it(`${poster} still receives the fully accumulated file set (through generate-test-from-template), not the raw lecture zip`, () => {
      const steps = expandedStepsOf("course-kickoff-no-code");
      expect(filesSourceType(steps, poster)).toBe("generate-test-from-template");
    });
  }

  // blackboard-export reads further still than lms-populate/lms-assignments
  // (Group Q: it must also reach the course guides and the weekly
  // announcements - see the "course-refresh generates before it posts"
  // describe block above for the same assertion on the preset source).
  it("blackboard-export receives the fully accumulated file set (through generate-weekly-announcements)", () => {
    const steps = expandedStepsOf("course-kickoff-no-code");
    expect(filesSourceType(steps, "blackboard-export")).toBe("generate-weekly-announcements");
  });

  it("course-kickoff (codebase): generate-class-openers is still fed by lecture-zip directly, but save-zip-to-course now reads the fully accumulated chain (docs/REGRESSION.md 155, extended further by Group Q)", () => {
    const steps = expandedStepsOf("course-kickoff");
    expect(filesSourceType(steps, "generate-class-openers")).toBe("lecture-zip");
    expect(filesSourceType(steps, "save-zip-to-course")).toBe("generate-weekly-announcements");
  });

  it("course-kickoff's LMS-posting steps are unchanged: still fed by the GENERATORS chain", () => {
    const steps = expandedStepsOf("course-kickoff");
    for (const poster of ["lms-populate", "lms-assignments"]) {
      expect(filesSourceType(steps, poster)).toBe("generate-test-from-template");
    }
  });

  it("course-kickoff's blackboard-export reads further still, through generate-weekly-announcements", () => {
    const steps = expandedStepsOf("course-kickoff");
    expect(filesSourceType(steps, "blackboard-export")).toBe("generate-weekly-announcements");
  });
});

// The per-module assignment is the spine of a no-code module
// (course-planning-grounding.ts's buildScheduleWeekPlan): it is generated
// first, and the module intro/deck (both inside the SAME
// lecture-materials-from-schedule step - no step-order change was needed for
// that half) plus the two generic downstream generators course-refresh still
// owns (the opener and the optional test template) are grounded in it. Those
// two are opt-in via a "groundInAssignment" bindOverride, positional and
// silently skipped on a miss (see the module doc-comment in
// presets.kickoff.test.ts's sibling describes above) - so this suite pins
// the literal index used for each, re-verified against the CURRENT
// course-refresh step order (unchanged by this feature) rather than assumed.
describe("no-code kickoff grounds the opener and the optional test in that week's assignment (AC1/AC2/AC3/AC5)", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  function includeOf(id: string) {
    const step = byId.get(id)!.steps.find((s) => s.include?.workflowId === "course-refresh")!;
    expect(step, `${id} includes course-refresh`).toBeTruthy();
    return step.include!;
  }

  it("index 4 in course-refresh is still generate-class-openers and index 6 is still generate-test-from-template", () => {
    const refresh = byId.get("course-refresh")!;
    expect(refresh.steps[4].type).toBe("generate-class-openers");
    expect(refresh.steps[6].type).toBe("generate-test-from-template");
  });

  it("course-kickoff-no-code binds 4.groundInAssignment and 6.groundInAssignment to literal \"1\"", () => {
    const include = includeOf("course-kickoff-no-code");
    expect(include.bindOverrides?.["4.groundInAssignment"]).toEqual({ source: "literal", value: "1" });
    expect(include.bindOverrides?.["6.groundInAssignment"]).toEqual({ source: "literal", value: "1" });
  });

  it("course-kickoff (codebase) never turns groundInAssignment on for either step - its openers/tests are unaffected", () => {
    // course-refresh binds groundInAssignment to a runtime field (matching
    // exerciseKind/testTopic/testWeek), so course-kickoff must explicitly
    // blank it here (not merely leave it unbound) or that field would leak
    // onto the codebase kickoff's own run form. What matters for AC4 is that
    // it is never forced to "1" the way the no-code kickoff forces it above -
    // a blank literal and "unbound" are behaviorally identical (both read as
    // off by the step), so either satisfies "unaffected".
    const include = includeOf("course-kickoff");
    expect(include.bindOverrides?.["4.groundInAssignment"]).not.toEqual({ source: "literal", value: "1" });
    expect(include.bindOverrides?.["6.groundInAssignment"]).not.toEqual({ source: "literal", value: "1" });
  });

  it("course-refresh exposes groundInAssignment as its own runtime field for both steps (so 'has a binding' holds without forcing kickoff behavior)", () => {
    const refresh = byId.get("course-refresh")!;
    const openers = refresh.steps[4].bindings.groundInAssignment;
    const test = refresh.steps[6].bindings.groundInAssignment;
    expect(openers, "generate-class-openers's groundInAssignment is bound in course-refresh").toBeTruthy();
    expect(openers?.source).toBe("runtime");
    expect(test, "generate-test-from-template's groundInAssignment is bound in course-refresh").toBeTruthy();
    expect(test?.source).toBe("runtime");
  });

  it("both steps actually declare a groundInAssignment input for the bindOverride to reach", () => {
    for (const type of ["generate-class-openers", "generate-test-from-template"]) {
      const def = getStepDefinition(type)!;
      const input = def.inputs.find((i) => i.key === "groundInAssignment");
      expect(input, `${type} declares a groundInAssignment input`).toBeTruthy();
      expect(input!.type).toBe("boolean");
      expect(input!.required).toBeFalsy();
    }
  });
});

// AC6 (module objectives + openers joining the materials zip): neither
// change added, removed, or reordered a single STEP in either preset.
// Objectives ship as one more file that lecture-zip/lecture-materials-from-
// schedule's EXISTING "files" output already carries (assembleLectureFiles
// packages it - see registry-helpers.ts), and the openers step keeps its
// exact position, inputs, and bindings - only what it zips its OWN output
// into changed (steps.content-lectures.ts). So every stepIndex binding,
// bindOverrides key, and skipSteps entry pinned elsewhere in this file (and
// in course-setup.ts's comments) is verified UNCHANGED here as a canary,
// rather than re-derived - there was nothing to re-pin for THAT feature
// because nothing moved.
//
// docs/REGRESSION.md 155 is a LATER change that DID move a step -
// save-zip-to-course, from source index 7 to the very end (index 16) - to
// fix "literally all artifacts" (it was silently reading lecture-zip's own
// output instead of the fully accumulated chain, and could not reach the
// rubric/schedule at all from its old position). Every OTHER course-refresh
// step's array position at index <= 6 is unchanged - see course-setup.ts's
// own comment on the moved step for the full index-renumbering list.
//
// Group Q (course guide documents + weekly announcements) is a STILL LATER
// change that inserted two brand-new steps - generate-course-guides at
// index 7 and generate-weekly-announcements at index 13 - shifting every
// step from index 7 onward down by one, and every step at the ORIGINAL
// index 12 onward down by one more. The 19-step order array below reflects
// both insertions.
describe("module objectives + openers-join-zip added no step and moved no index (AC1/AC4/AC6); save-zip-to-course later moved to the end (docs/REGRESSION.md 155); Group Q inserted two more steps", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  it("course-refresh now has 19 steps: generate-course-guides and generate-weekly-announcements inserted, save-zip-to-course still last", () => {
    const refresh = byId.get("course-refresh")!;
    expect(refresh.steps.map((s) => s.type)).toEqual([
      "load-course-tile",
      "schedule-from-repo",
      "save-csv-to-course",
      "lecture-zip",
      "generate-class-openers",
      "generate-assignment-from-template",
      "generate-test-from-template",
      "generate-course-guides",
      "lms-wipe",
      "lms-rubric",
      "lms-modules",
      "lms-populate",
      "lms-assignments",
      "generate-weekly-announcements",
      "blackboard-export",
      "include-workflow",
      "generate-syllabus",
      "castletop-workbook",
      "save-zip-to-course",
    ]);
  });

  it("neither kickoff's own step array changed length or type order", () => {
    const kickoff = byId.get("course-kickoff")!;
    expect(kickoff.steps.map((s) => s.type)).toEqual([
      "load-course-tile",
      "generate-schedule",
      "repo-from-template",
      "fill-readmes",
      "define-course-project",
      "include-workflow",
      "populate-lms-from-class-template",
    ]);

    const noCode = byId.get("course-kickoff-no-code")!;
    expect(noCode.steps.map((s) => s.type)).toEqual([
      "load-course-tile",
      "generate-schedule",
      "lecture-materials-from-schedule",
      "define-course-project",
      "include-workflow",
      "integrate-source-into-lms",
      "populate-lms-from-class-template",
    ]);
  });

  // Objectives ride the EXISTING "files" output of both materials-producing
  // steps - no new input or output was declared for it, so no run form
  // gained a field and no binding needed to change to reach it.
  it("lecture-zip and lecture-materials-from-schedule still declare only \"files\" as their output", () => {
    for (const type of ["lecture-zip", "lecture-materials-from-schedule"]) {
      const def = getStepDefinition(type)!;
      expect(def.outputs.map((o) => o.key)).toEqual(["files"]);
    }
  });

  // The openers step's own input/output SHAPE is unchanged (AC4 only
  // changed what it zips its OWN output into, not its wiring surface) - so
  // every existing binding that targets it in either preset is still valid.
  it("generate-class-openers still declares the same input/output keys", () => {
    const def = getStepDefinition("generate-class-openers")!;
    expect(def.inputs.map((i) => i.key).sort()).toEqual(
      ["schedule", "hubCourse", "minutes", "exerciseKind", "files", "groundInAssignment"].sort()
    );
    expect(def.outputs.map((o) => o.key).sort()).toEqual(["report", "count", "files"].sort());
  });
});
