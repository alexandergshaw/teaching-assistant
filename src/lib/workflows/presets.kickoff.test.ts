// How the two course kickoffs and Course Refresh are wired together: the
// order generation must happen in relative to posting, which steps belong to
// which workflow, and how short the run forms are. Split out of
// presets.test.ts to keep both files under the repo's 1000-line cap.

import { describe, it, expect } from "vitest";
import { allWorkflows } from "./presets";
import { getStepDefinition } from "./registry";
import { collectRuntimeFields, expandWorkflowDef, stepBindingIndex } from "./types";
import type { InputBinding, WorkflowStepConfig } from "./types";

// CHUNK E-b: presets now carry step ids, so a "step" binding may name its
// source by either stepIndex or stepId. Resolves either form to a concrete
// index within `steps`.
function resolveStepIndex(steps: WorkflowStepConfig[], binding: InputBinding & { source: "step" }): number {
  const direct = stepBindingIndex(binding);
  if (direct !== undefined) return direct;
  return steps.findIndex((s) => s.id === (binding as { stepId: string }).stepId);
}

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
    "generate-assignment-from-template",
    "generate-test-from-template",
  ];
  // Every step that pushes content into the LMS or bakes the cartridge.
  const POSTERS = ["lms-populate", "lms-assignments", "blackboard-export"];
  // lms-populate/lms-assignments read the per-week GENERATORS chain directly
  // (unchanged by Group Q - see generate-course-guides' own AC6 rationale for
  // why lms-populate deliberately does NOT also see the course-wide guides).
  // blackboard-export's chain now extends further, through generate-course-
  // guides, generate-weekly-announcements (Group Q), and generate-knowledge-
  // checks (Y2), so it is asserted separately below rather than lumped in
  // with the other two POSTERS.
  const LMS_POSTERS = ["lms-populate", "lms-assignments"];
  // The LAST step that produces a "files" output - the tail of the extended
  // chain that blackboard-export and save-zip-to-course now read. Group Q
  // (course guide documents + weekly announcements) extended it once
  // already; Y2 (knowledge checks) extended it one step further; the
  // Unsplash deliverable-images step extended it once more still.
  const LAST_FILES_PRODUCER = "fetch-deliverable-images";

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
        const stepIdx = resolveStepIndex(wf.steps, binding);
        expect(
          stepIdx,
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
        const stepIdx = resolveStepIndex(wf.steps, binding);
        expect(
          stepIdx,
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
      const stepIdx = resolveStepIndex(wf.steps, binding);
      expect(
        stepIdx,
        "blackboard-export must read the fully accumulated file set, including the guides and announcements"
      ).toBe(last);
    }
  });

  // docs/REGRESSION.md 155 (AC2): save-zip-to-course used to read
  // lecture-zip's own output directly (stepIndex 3) - skipping past
  // whatever generate-assignment-from-template/generate-test-from-template
  // added afterward, which is exactly why a
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
      const stepIdx = resolveStepIndex(wf.steps, binding);
      expect(
        stepIdx,
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
      stepId: "lms-rubric",
      outputKey: "rubricFiles",
    });
    expect(step.bindings.schedule).toEqual({
      source: "step",
      stepId: "schedule-from-repo",
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
      .filter((b): b is InputBinding & { source: "step" } => b.source === "step")
      .map((b) => resolveStepIndex(wf.steps, b));
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
        // which IS still force-blanked below ("castletop-workbook.instructor"
        // in BLANK_TEMPLATE_AND_CASTLETOP_OVERRIDES, course-setup-shared.ts).
        // Before the migration to id-keyed bindOverrides this key was
        // positional and drifted with every step insertion - "20.instructor"
        // once generate-weekly-significance and generate-instructor-notes
        // were inserted at indices 14/15 and shifted it from 18 to 20,
        // "18.instructor" once before that (fetch-deliverable-images alone
        // had shifted it from 17 to 18), and "17.instructor" before that -
        // each stale copy is exactly what made a later field-count audit
        // suspect a live duplicate key that was never actually there, for
        // the pre-existing reason that comment states.
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
      // the ceiling from 12 to 15; Y2 (knowledge checks) added one more
      // ("knowledgeChecksPostToLms"), raising it again to 16; the two new
      // per-week output families (weekly significance, instructor notes)
      // added "significancePostToLms" and "instructorNotesPostToLms",
      // raising it again to 18.
      expect(fieldsOf(id).length).toBeLessThanOrEqual(18);
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

  // T1: the real defect this fixes. lecture-materials-from-schedule generates
  // EVERY week's assignment - on a course with no project yet (exactly what
  // autoDefine targets, and the very first run of a kickoff), a project
  // defined AFTER that step had already run meant every assignment was
  // generated with no project and no milestone; the milestone contract only
  // started applying on a LATER run. define-course-project must run STRICTLY
  // BEFORE lecture-materials-from-schedule in the no-code kickoff so the
  // tile carries a project by the time the assignments generate on the FIRST
  // run, not just re-runs. The step array only enforces forward references
  // (presets.test.ts's "forward ref" check), so array order here is real
  // execution order, not just documentation.
  it("T1: define-course-project runs strictly before lecture-materials-from-schedule in course-kickoff-no-code", () => {
    const steps = byId.get("course-kickoff-no-code")!.steps;
    const project = steps.findIndex((s) => s.type === "define-course-project");
    const lectureMaterials = steps.findIndex((s) => s.type === "lecture-materials-from-schedule");
    expect(project, "course-kickoff-no-code defines a course project").toBeGreaterThan(-1);
    expect(lectureMaterials, "course-kickoff-no-code builds lecture materials from the schedule").toBeGreaterThan(-1);
    expect(
      project,
      "the project must be defined before the step that generates every week's assignment, or the first run's assignments have no project/milestone"
    ).toBeLessThan(lectureMaterials);
  });

  // T1's own AC: the codebase kickoff's ordering was NOT part of this
  // request ("no code" twice) - its define-course-project already ran before
  // repo-from-template/fill-readmes, unaffected by this feature, and stays
  // that way.
  it("T1 does not touch course-kickoff (codebase): define-course-project is still its first coursework-generating step, in the SAME position as before", () => {
    const steps = byId.get("course-kickoff")!.steps;
    expect(steps.map((s) => s.type).indexOf("define-course-project")).toBe(4);
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
    expect(noCode.bindings.schedule).toEqual({ source: "step", stepId: "generate-schedule", outputKey: "schedule" });
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
// but the include's remap ("lecture-zip.files") reroutes every consumer that would
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
// same helper the runners use) rather than the preset source: remap/
// bindOverrides keys are id-keyed now, and an unresolvable id throws
// immediately (resolveIncludeKeyPrefix, types.expand.ts) rather than being
// silently skipped the way the old positional keys were - but a resolved
// key's replacement binding is still just followed through the translation,
// so checking the preset literal proves nothing about what actually runs.
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
    const stepIdx = stepBindingIndex(binding!);
    if (stepIdx === undefined) {
      throw new Error(
        `${consumerType}: files binding still carries a stepId after expansion - expandWorkflowDef should have lowered it.`
      );
    }
    return steps[stepIdx].type;
  }

  it("the expanded no-code kickoff contains save-zip-to-course (the zip-producing step)", () => {
    const steps = expandedStepsOf("course-kickoff-no-code");
    expect(steps.some((s) => s.type === "save-zip-to-course")).toBe(true);
  });

  // The shared refresh no longer owns a standalone opener. The no-code path
  // continues producing its one opener inside lecture-materials-from-
  // schedule, so its expansion must not acquire a second copy.
  it("generate-class-openers does not appear in the expanded no-code kickoff (its opener is produced inside lecture-materials-from-schedule instead)", () => {
    const steps = expandedStepsOf("course-kickoff-no-code");
    expect(steps.some((s) => s.type === "generate-class-openers")).toBe(false);
  });

  // save-zip-to-course moved to the very end of course-refresh
  // (docs/REGRESSION.md 155), so in the expansion it reads the LAST
  // files-producing step's output - the fully accumulated chain - exactly
  // like blackboard-export, not lecture-materials-from-schedule's own
  // output directly. Group Q (course guide documents + weekly
  // announcements) extended that chain past generate-test-from-template, Y2
  // (knowledge checks) extended it one step further still, and the Unsplash
  // deliverable-images step extended it once more, so the tail is now
  // fetch-deliverable-images (which chains off generate-knowledge-checks,
  // which chains off generate-weekly-announcements, which chains off
  // generate-course-guides, which chains off generate-test-from-template).
  it("save-zip-to-course receives the fully accumulated file set (through fetch-deliverable-images), not the raw lecture-materials-from-schedule output", () => {
    const steps = expandedStepsOf("course-kickoff-no-code");
    expect(filesSourceType(steps, "save-zip-to-course")).toBe("fetch-deliverable-images");
  });

  // The include's "lecture-zip.files" remap replaces skipped lecture-zip with this
  // kickoff's own lecture-materials-from-schedule output, which already
  // contains the assignment, opener, and deck.
  it("generate-assignment-from-template chains off lecture-materials-from-schedule directly (no standalone opener sits between them)", () => {
    const steps = expandedStepsOf("course-kickoff-no-code");
    expect(filesSourceType(steps, "generate-assignment-from-template")).toBe("lecture-materials-from-schedule");
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
  // announcements; Y2: and the weekly knowledge checks; the Unsplash
  // deliverable-images step: and each week's image - see the "course-refresh
  // generates before it posts" describe block above for the same assertion
  // on the preset source).
  it("blackboard-export receives the fully accumulated file set (through fetch-deliverable-images)", () => {
    const steps = expandedStepsOf("course-kickoff-no-code");
    expect(filesSourceType(steps, "blackboard-export")).toBe("fetch-deliverable-images");
  });

  it("course-kickoff (codebase) has no duplicate standalone opener and save-zip-to-course reads the fully accumulated chain", () => {
    const steps = expandedStepsOf("course-kickoff");
    expect(steps.some((step) => step.type === "generate-class-openers")).toBe(false);
    expect(filesSourceType(steps, "generate-assignment-from-template")).toBe("lecture-zip");
    expect(filesSourceType(steps, "save-zip-to-course")).toBe("fetch-deliverable-images");
  });

  it("course-kickoff's LMS-posting steps are unchanged: still fed by the GENERATORS chain", () => {
    const steps = expandedStepsOf("course-kickoff");
    for (const poster of ["lms-populate", "lms-assignments"]) {
      expect(filesSourceType(steps, poster)).toBe("generate-test-from-template");
    }
  });

  it("course-kickoff's blackboard-export reads further still, through fetch-deliverable-images", () => {
    const steps = expandedStepsOf("course-kickoff");
    expect(filesSourceType(steps, "blackboard-export")).toBe("fetch-deliverable-images");
  });
});

describe("mechanical expansion after the opener-step index shift", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((workflow) => [workflow.id, workflow]));
  const expanded = (id: string) => expandWorkflowDef(byId.get(id)!, (workflowId) => byId.get(workflowId));

  function sourceType(id: string, consumerType: string): string {
    const steps = expanded(id).steps;
    const consumer = steps.find((step) => step.type === consumerType)!;
    expect(consumer, `${id}: ${consumerType} exists`).toBeTruthy();
    const binding = consumer.bindings.files;
    expect(binding, `${id}: ${consumerType}.files is bound`).toBeTruthy();
    expect(binding.source).toBe("step");
    if (binding.source !== "step") return "non-step";
    const stepIdx = stepBindingIndex(binding);
    if (stepIdx === undefined) {
      throw new Error(
        `${id}: ${consumerType}.files still carries a stepId after expansion - expandWorkflowDef should have lowered it.`
      );
    }
    return steps[stepIdx].type;
  }

  const EXPECTED_FILE_SOURCES: Record<string, Record<string, string>> = {
    "course-refresh": {
      "generate-assignment-from-template": "lecture-zip",
      "generate-test-from-template": "generate-assignment-from-template",
      "generate-course-guides": "generate-test-from-template",
      "lms-populate": "generate-test-from-template",
      "lms-assignments": "generate-test-from-template",
      "generate-weekly-announcements": "generate-course-guides",
      "generate-knowledge-checks": "generate-weekly-announcements",
      "generate-weekly-significance": "generate-knowledge-checks",
      "generate-instructor-notes": "generate-weekly-significance",
      "fetch-deliverable-images": "generate-instructor-notes",
      "blackboard-export": "fetch-deliverable-images",
      "save-zip-to-course": "fetch-deliverable-images",
    },
    "course-kickoff": {
      "generate-assignment-from-template": "lecture-zip",
      "generate-test-from-template": "generate-assignment-from-template",
      "generate-course-guides": "generate-test-from-template",
      "lms-populate": "generate-test-from-template",
      "lms-assignments": "generate-test-from-template",
      "generate-weekly-announcements": "generate-course-guides",
      "generate-knowledge-checks": "generate-weekly-announcements",
      "generate-weekly-significance": "generate-knowledge-checks",
      "generate-instructor-notes": "generate-weekly-significance",
      "fetch-deliverable-images": "generate-instructor-notes",
      "blackboard-export": "fetch-deliverable-images",
      "save-zip-to-course": "fetch-deliverable-images",
    },
    "course-kickoff-no-code": {
      "generate-assignment-from-template": "lecture-materials-from-schedule",
      "generate-test-from-template": "generate-assignment-from-template",
      "generate-course-guides": "generate-test-from-template",
      "lms-populate": "generate-test-from-template",
      "lms-assignments": "generate-test-from-template",
      "generate-weekly-announcements": "generate-course-guides",
      "generate-knowledge-checks": "generate-weekly-announcements",
      "generate-weekly-significance": "generate-knowledge-checks",
      "generate-instructor-notes": "generate-weekly-significance",
      "fetch-deliverable-images": "generate-instructor-notes",
      "blackboard-export": "fetch-deliverable-images",
      "save-zip-to-course": "fetch-deliverable-images",
    },
  };

  for (const [id, consumers] of Object.entries(EXPECTED_FILE_SOURCES)) {
    it(`${id} resolves every files-chain edge to the intended producer type`, () => {
      for (const [consumer, producer] of Object.entries(consumers)) {
        expect(sourceType(id, consumer), `${id}: ${consumer} must receive ${producer}`).toBe(producer);
      }
    });
  }

  it("COURSE_REFRESH and COURSE_KICKOFF contain no standalone opener; NO_CODE_KICKOFF has one schedule materials step and no duplicate opener", () => {
    for (const id of ["course-refresh", "course-kickoff"]) {
      const types = expanded(id).steps.map((step) => step.type);
      expect(types.filter((type) => type === "generate-class-openers"), id).toHaveLength(0);
      expect(types.filter((type) => type === "lecture-zip"), id).toHaveLength(1);
    }

    const noCodeTypes = expanded("course-kickoff-no-code").steps.map((step) => step.type);
    expect(noCodeTypes.filter((type) => type === "generate-class-openers")).toHaveLength(0);
    expect(noCodeTypes.filter((type) => type === "lecture-materials-from-schedule")).toHaveLength(1);
    expect(noCodeTypes.filter((type) => type === "lecture-zip")).toHaveLength(0);
  });

  it("every bindOverride key still names a real input on the intended COURSE_REFRESH source step", () => {
    const refresh = byId.get("course-refresh")!;
    for (const id of ["course-kickoff", "course-kickoff-no-code"]) {
      const include = byId.get(id)!.steps.find((step) => step.include?.workflowId === "course-refresh")!.include!;
      for (const key of Object.keys(include.bindOverrides ?? {})) {
        const dot = key.indexOf(".");
        expect(dot, `${id}: malformed bindOverride ${key}`).toBeGreaterThan(-1);
        const prefix = key.slice(0, dot);
        const inputKey = key.slice(dot + 1);
        const numericPrefix = Number(prefix);
        const sourceIndex =
          Number.isInteger(numericPrefix) && numericPrefix >= 0
            ? numericPrefix
            : refresh.steps.findIndex((s) => s.id === prefix);
        const sourceStep = refresh.steps[sourceIndex];
        expect(sourceStep, `${id}: ${key} points past COURSE_REFRESH`).toBeTruthy();
        const reachableTypes = sourceStep.include
          ? expandWorkflowDef(byId.get(sourceStep.include.workflowId)!, (workflowId) => byId.get(workflowId)).steps.map(
              (step) => step.type
            )
          : [sourceStep.type];
        expect(
          reachableTypes.some((type) => getStepDefinition(type)?.inputs.some((input) => input.key === inputKey)),
          `${id}: ${key} lands on ${sourceStep.type}, whose reachable steps have no ${inputKey} input`
        ).toBe(true);
      }
    }
  });

  it("no-code remaps only the replaced source steps and carries no removed-opener remap", () => {
    const include = byId
      .get("course-kickoff-no-code")!
      .steps.find((step) => step.include?.workflowId === "course-refresh")!.include!;
    expect(include.skipSteps).toEqual([0, 1, 3]);
    expect(Object.keys(include.remap ?? {}).sort()).toEqual(
      [
        "load-course-tile.course",
        "load-course-tile.description",
        "load-course-tile.repo",
        "load-course-tile.startDate",
        "schedule-from-repo.courseTitle",
        "schedule-from-repo.schedule",
        "schedule-from-repo.weeks",
        "lecture-zip.files",
      ].sort()
    );
    expect(include.remap?.["lecture-zip.files"]).toEqual({
      source: "step",
      stepId: "lecture-materials-from-schedule",
      outputKey: "files",
    });
    // No dead numeric key (the removed standalone opener's old positional
    // index) survived the migration to id-keyed remap entries.
    expect(include.remap?.["4.files"]).toBeUndefined();
  });

  const EXPECTED_RUNTIME_FIELDS: Record<string, string[]> = {
    "course-refresh": [
      // AC7 fix (docs/REGRESSION.md entry 80): "courseKind" now moves up
      // ahead of "assignmentTemplate" - lecture-zip (source index 3) is
      // reached before generate-assignment-from-template (source index 4),
      // and collectRuntimeFields keeps the FIRST occurrence of a fieldKey, so
      // lecture-zip's own new courseKind input (now the first step to bind
      // that field) determines where it lands in this list.
      "hubCourse", "deckTemplate", "sources", "moduleId", "courseKind", "assignmentTemplate",
      "assignmentTopic", "assignmentWeek", "assignmentPostToCanvas", "assignmentPoints", "testTemplate",
      "testTopic", "testWeek", "testPostToCanvas", "testPoints", "testGroundInAssignment", "context",
      "instructor", "guidesPostToLms", "announcementsPostToLms", "knowledgeChecksPostToLms",
      "significancePostToLms", "instructorNotesPostToLms", "includeGithub",
      "regenerateSyllabus", "instructorFileAs", "contactMinutes", "readingRate", "pagesPerChapter",
      "classSessionMinutes",
    ],
    "course-kickoff": [
      "hubCourse", "context", "sources", "templateRepo", "newRepoName", "courseProject", "deckTemplate",
      "moduleId", "assignmentTemplate", "testTemplate", "instructor", "guidesPostToLms",
      "announcementsPostToLms", "knowledgeChecksPostToLms", "significancePostToLms",
      "instructorNotesPostToLms", "classSessionTemplate",
      "classSessionPostToCanvas",
    ],
    "course-kickoff-no-code": [
      "hubCourse", "context", "sourceMaterial", "sources", "courseProject", "deckTemplate",
      "assignmentTemplate", "testTemplate", "instructor", "guidesPostToLms", "announcementsPostToLms",
      "knowledgeChecksPostToLms", "significancePostToLms", "instructorNotesPostToLms",
      "sourceUrl", "classSessionTemplate", "classSessionPostToCanvas",
    ],
  };

  for (const [id, expectedFields] of Object.entries(EXPECTED_RUNTIME_FIELDS)) {
    it(`${id} exposes exactly its intended runtime fields with no opener-field leak`, () => {
      const workflow = byId.get(id)!;
      const fields = collectRuntimeFields(
        { ...workflow, steps: expanded(id).steps },
        (type) => getStepDefinition(type)?.inputs
      ).map((field) => field.fieldKey);
      expect(fields).toEqual(expectedFields);
      expect(fields).not.toContain("openerExerciseKind");
      expect(fields).not.toContain("openerGroundInAssignment");
    });
  }
});

// Both kickoff variants now produce their opener inside the materials step
// that owns the week's assignment/deck. The only remaining downstream
// groundInAssignment switch belongs to the optional test-template step.
// These pins stay positional (refresh.steps[4]/[5]) only to anchor what the
// now-dead LEGACY numeric bindOverrides keys ("4.groundInAssignment",
// "6.groundInAssignment" below) would have targeted before the migration to
// id-keyed remap/bindOverrides - today's real bindOverrides key
// ("generate-test-from-template.groundInAssignment") is id-keyed and throws
// immediately on an unresolvable id (resolveIncludeKeyPrefix,
// types.expand.ts) rather than failing silently if COURSE_REFRESH's step
// order drifts.
describe("the optional test grounding override survives removal of the standalone opener", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  function includeOf(id: string) {
    const step = byId.get(id)!.steps.find((s) => s.include?.workflowId === "course-refresh")!;
    expect(step, `${id} includes course-refresh`).toBeTruthy();
    return step.include!;
  }

  it("source index 4 is assignment-template and source index 5 is test-template after the opener removal", () => {
    const refresh = byId.get("course-refresh")!;
    expect(refresh.steps[4].type).toBe("generate-assignment-from-template");
    expect(refresh.steps[5].type).toBe("generate-test-from-template");
  });

  it("course-kickoff-no-code forces source index 5's test grounding on and carries no dead opener override", () => {
    const include = includeOf("course-kickoff-no-code");
    expect(include.bindOverrides?.["4.groundInAssignment"]).toBeUndefined();
    expect(include.bindOverrides?.["generate-test-from-template.groundInAssignment"]).toEqual({
      source: "literal",
      value: "1",
    });
    expect(include.bindOverrides?.["6.groundInAssignment"]).toBeUndefined();
  });

  it("course-kickoff keeps source index 5's test grounding off so no runtime field leaks", () => {
    const include = includeOf("course-kickoff");
    expect(include.bindOverrides?.["generate-test-from-template.groundInAssignment"]).toEqual({
      source: "literal",
      value: "",
    });
  });

  it("course-refresh exposes testGroundInAssignment only on the remaining test-template step", () => {
    const refresh = byId.get("course-refresh")!;
    const test = refresh.steps[5].bindings.groundInAssignment;
    expect(test, "generate-test-from-template's groundInAssignment is bound in course-refresh").toBeTruthy();
    expect(test?.source).toBe("runtime");
    if (test?.source === "runtime") expect(test.fieldKey).toBe("testGroundInAssignment");
  });

  it("the test step still declares the optional boolean input reached by those overrides", () => {
    const def = getStepDefinition("generate-test-from-template")!;
    const input = def.inputs.find((i) => i.key === "groundInAssignment");
    expect(input).toBeTruthy();
    expect(input!.type).toBe("boolean");
    expect(input!.required).toBeFalsy();
  });
});

// Repo opener-before-deck removes Course Refresh's standalone opener because
// lecture-zip now emits that document itself. This is the authoritative
// source-order canary for every positional include override after the shift.
describe("course-refresh source order after the standalone opener is retired", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  it("course-refresh has 22 steps, no standalone opener, and save-zip-to-course remains last", () => {
    const refresh = byId.get("course-refresh")!;
    expect(refresh.steps.map((s) => s.type)).toEqual([
      "load-course-tile",
      "schedule-from-repo",
      "save-csv-to-course",
      "lecture-zip",
      "generate-assignment-from-template",
      "generate-test-from-template",
      "generate-course-guides",
      "lms-wipe",
      "lms-rubric",
      "lms-modules",
      "lms-populate",
      "lms-assignments",
      "generate-weekly-announcements",
      "generate-knowledge-checks",
      "generate-weekly-significance",
      "generate-instructor-notes",
      "fetch-deliverable-images",
      "blackboard-export",
      "include-workflow",
      "generate-syllabus",
      "castletop-workbook",
      "save-zip-to-course",
    ]);
    expect(refresh.steps.filter((step) => step.type === "generate-class-openers")).toHaveLength(0);
  });

  // T1 (this feature) swapped course-kickoff-no-code's own steps 2 and 3
  // (define-course-project now runs BEFORE lecture-materials-from-schedule,
  // the reverse of every earlier revision of this canary) - the coding
  // kickoff's array is the part that stays byte-for-byte unchanged.
  it("course-kickoff's step array is unchanged; course-kickoff-no-code's own length is unchanged but T1 swapped define-course-project ahead of lecture-materials-from-schedule", () => {
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
      "define-course-project",
      "lecture-materials-from-schedule",
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

  // The reusable standalone step remains registered for workflows that ask
  // for it explicitly; removing it from COURSE_REFRESH must not delete its
  // public step contract.
  it("generate-class-openers remains available as a standalone workflow step", () => {
    const def = getStepDefinition("generate-class-openers")!;
    expect(def.inputs.map((i) => i.key).sort()).toEqual(
      ["schedule", "hubCourse", "minutes", "exerciseKind", "files", "groundInAssignment"].sort()
    );
    expect(def.outputs.map((o) => o.key).sort()).toEqual(["report", "count", "files"].sort());
  });
});
