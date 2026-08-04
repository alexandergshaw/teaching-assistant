// The "course-build preset" run-form field-surfacing tests - split out of
// presets.course-build.test.ts (matching how that file was itself split out
// of presets.test.ts) to keep both files under the repo's 1000-line cap.
// Covers the source selector's own inputs, what the expanded run form
// actually surfaces (required-ness, options, visibleWhen gating), the
// tile-export/tile-repo sources' binding reuse, and the T4/AC2 field-count
// audits (no duplicate or dead runtime fields, classSessionProjectMode/
// classSessionProjectDescription reach populate-lms-from-class-template end
// to end).

import { describe, it, expect } from "vitest";
import { allWorkflows } from "./presets";
import { getStepDefinition } from "./registry";
import {
  collectRuntimeFields,
  expandWorkflowDef,
  applyWorkflowScope,
  scopeCoversType,
  type InputBinding,
} from "./types";
import { resolveClassSessionProjectOverrides } from "./registry/steps.class-session-populate";
import { emptyCourseProject, type CourseProject } from "@/lib/course-project";

describe("course-build preset", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  it("the source selector's own visibleWhen-gated inputs are required, its non-gated inputs stay optional, and the source input carries its options", () => {
    const def = getStepDefinition("course-schedule-from-source")!;

    const sourceInput = def.inputs.find((i) => i.key === "source");
    expect(sourceInput, "course-schedule-from-source declares a source input").toBeTruthy();
    expect(sourceInput!.required).toBe(true);
    expect(sourceInput!.options).toEqual([
      "codebase",
      "course-description",
      "course-cartridge",
      "syllabus-document",
      "existing-lms-course",
      "tile-export",
      "tile-repo",
    ]);

    // B3 (run-form cleanup): each `visibleWhen`-gated per-source input is
    // now required - it can only ever block Run while its own matching
    // source is chosen (isFieldVisible/validate-run-form.ts skip a hidden
    // required field), so it is never a dead required question for the
    // other six sources.
    for (const key of ["repo", "cartridge", "syllabus", "lmsCourse"]) {
      const input = def.inputs.find((i) => i.key === key);
      expect(input, `course-schedule-from-source declares a "${key}" input`).toBeTruthy();
      expect(input!.visibleWhen, `"${key}" must carry a visibleWhen gate`).toBeTruthy();
      expect(input!.required, `"${key}" must be required now that it is gated to its own source`).toBe(true);
    }

    // Every OTHER input stays optional - none of these carries a
    // `visibleWhen` gate (either used by every source, like hubCourse, or,
    // for "description," never bound to a runtime field on this preset at
    // all - see this step's own header comment), so marking any of them
    // required would make it a dead required question on some sources.
    for (const key of ["description", "weeks", "tests", "context", "sourceMaterial", "hubCourse"]) {
      const input = def.inputs.find((i) => i.key === key);
      expect(input, `course-schedule-from-source declares a "${key}" input`).toBeTruthy();
      expect(
        input!.required,
        `"${key}" must be optional, or it becomes a dead required question for every source that does not use it`
      ).toBeFalsy();
    }
  });

  it("the run form surfaces the source field as required, with its options, exactly once", () => {
    const wf = byId.get("course-build")!;
    const fields = collectRuntimeFields(wf, (t) => getStepDefinition(t)?.inputs);
    const sourceFields = fields.filter((f) => f.fieldKey === "source");
    expect(sourceFields.length, "the run form asks for the source exactly once").toBe(1);
    expect(sourceFields[0].required).toBe(true);
    expect(sourceFields[0].options).toEqual([
      "codebase",
      "course-description",
      "course-cartridge",
      "syllabus-document",
      "existing-lms-course",
      "tile-export",
      "tile-repo",
    ]);
  });

  // Verifies visibleWhen (StepInputSpec.types.ts) actually survives
  // collectRuntimeFields into the run-form RuntimeField - the same kind of
  // check that would have caught `multi` being silently dropped for a long
  // time before that was fixed (see types.ts's collectRuntimeFields).
  it("the run form's per-source fields each carry the visibleWhen gate matching their own source; the shared source/hubCourse fields carry none", () => {
    const wf = byId.get("course-build")!;
    const fields = collectRuntimeFields(wf, (t) => getStepDefinition(t)?.inputs);
    const byKey = new Map(fields.map((f) => [f.fieldKey, f]));

    expect(byKey.get("repo")?.visibleWhen).toEqual({ fieldKey: "source", equals: "codebase" });
    expect(byKey.get("cartridge")?.visibleWhen).toEqual({ fieldKey: "source", equals: "course-cartridge" });
    expect(byKey.get("syllabus")?.visibleWhen).toEqual({ fieldKey: "source", equals: "syllabus-document" });
    expect(byKey.get("lmsCourse")?.visibleWhen).toEqual({ fieldKey: "source", equals: "existing-lms-course" });

    // "source" is the controlling field - it must stay visible regardless of
    // its own value. "hubCourse" is a fallback shared by every source (see
    // steps.course-schedule-from-source.ts's own input comment), so it must
    // never be gated to just one of them either.
    expect(byKey.get("source")?.visibleWhen).toBeUndefined();
    expect(byKey.get("hubCourse")?.visibleWhen).toBeUndefined();
  });

  // Part 1 (the sixth source, "tile-export"): unlike every source that has a
  // dedicated input of its own (repo/cartridge/syllabus/lmsCourse, each
  // gated by visibleWhen, plus "description" for course-description),
  // tile-export declares no dedicated input on course-schedule-from-source
  // (steps.course-schedule-from-source.ts) - it reads the tile id off the
  // SAME "hubCourse" input every source already treats as a (at minimum)
  // title fallback. So adding it must not grow course-build's own step-1
  // binding set at all - if it had, that would mean a new per-source runtime
  // field snuck onto the run form, contradicting "it needs NO new upload
  // control." Part 2 (the seventh source, "tile-repo") is the direct
  // analogue for a repository instead of an LMS export, and reuses the SAME
  // "hubCourse" binding for the SAME reason - see the dedicated test below.
  it("the sixth source (tile-export) added no new binding to course-build's own schedule step - it reuses the existing hubCourse binding", () => {
    const step1 = byId.get("course-build")!.steps[1];
    expect(step1.type).toBe("course-schedule-from-source");
    expect(Object.keys(step1.bindings).sort()).toEqual(
      [
        "source",
        "repo",
        "description",
        "cartridge",
        "syllabus",
        "lmsCourse",
        "weeks",
        "tests",
        "context",
        "sourceMaterial",
        "hubCourse",
      ].sort()
    );
    expect(step1.bindings.hubCourse).toEqual({ source: "runtime", fieldKey: "hubCourse" });
  });

  // Part 2 (the seventh source, "tile-repo" - the repository already linked
  // on the selected course tile's own row): same reasoning as Part 1 above,
  // restated as its own test so a future reader searching for "tile-repo"
  // finds the guarantee directly, rather than only implicitly covered by the
  // tile-export test's identical binding-set assertion.
  it("the seventh source (tile-repo) added no new binding to course-build's own schedule step either - it reuses the same existing hubCourse binding", () => {
    const step1 = byId.get("course-build")!.steps[1];
    expect(step1.type).toBe("course-schedule-from-source");
    expect(Object.keys(step1.bindings).sort()).toEqual(
      [
        "source",
        "repo",
        "description",
        "cartridge",
        "syllabus",
        "lmsCourse",
        "weeks",
        "tests",
        "context",
        "sourceMaterial",
        "hubCourse",
      ].sort()
    );
    expect(step1.bindings.hubCourse).toEqual({ source: "runtime", fieldKey: "hubCourse" });
  });

  // Part 2, AC (redundancy shape 1): step 0 (load-course-tile) emits the
  // tile's description/weeks/tests/course(LMS course)/startDate, and this
  // preset's own description says those "still drive everything the chosen
  // source itself does not supply." A runtime field reusing one of those
  // exact fieldKeys would mean some step asks the instructor to retype a
  // value the tile already supplied instead of binding to step 0's own
  // output - this codebase's own convention is a runtime field named after
  // the input key (see this file's other comments), so a literal fieldKey
  // collision here is meaningful evidence of that regression, not a
  // coincidence. Deliberately excludes "repo": course-schedule-from-source's
  // OWN "repo" runtime field is a genuinely different value (which repository
  // to build the SCHEDULE from, for the codebase source) than step 0's own
  // "repo" output (the tile's already-linked repository, unused downstream in
  // this preset - see the course-refresh include's "0.repo" remap) - keeping
  // both is correct, not a redundancy this check should flag.
  it("no runtime field on the expanded run form reuses a fieldKey load-course-tile (step 0) already supplies as an output", () => {
    const wf = byId.get("course-build")!;
    const lookup = (id: string) => byId.get(id);
    const expanded = expandWorkflowDef(wf, lookup);
    const fields = collectRuntimeFields(
      { ...wf, steps: expanded.steps },
      (t) => getStepDefinition(t)?.inputs
    );

    const tileSuppliedKeys = ["description", "weeks", "tests", "course", "startDate"];
    const duplicated = fields.filter((f) => tileSuppliedKeys.includes(f.fieldKey));
    expect(duplicated.map((f) => f.fieldKey)).toEqual([]);
  });

  // T4 (field-count audit): the course tile already stores a structured
  // project (the course_project column / CourseProject type, src/lib/
  // supabase/courses.ts ~102/237/287), and this preset's own description
  // says the project is "defined (or, on a re-run, reused)." That reuse is
  // real, not aspirational: define-course-project's own run() (steps.
  // course-project.ts) reads tile.courseProject directly off the loaded
  // tile - never off a runtime binding - and returns it UNCHANGED whenever
  // "definition" is blank (see steps.course-project.test.ts's "an existing
  // project is returned unchanged" and "... left alone" cases). So the
  // "courseProject" runtime field this preset surfaces is not a retype of
  // what the tile already holds - it is a one-line SEED used only to
  // (re)generate a new name/brief/milestones set, a different shape than
  // the stored object entirely, and asked only when the instructor actually
  // wants to (re)define the project. The one way that contract could
  // regress into forced redundant re-entry is if this field, or its
  // underlying step input, ever became required - then an instructor
  // re-running a course that already has a project would be forced to type
  // a new one every time. Both must stay optional.
  it("the course project field never forces redundant re-entry of the project the tile already stores (T4)", () => {
    const defineProjectDef = getStepDefinition("define-course-project")!;
    const definitionInput = defineProjectDef.inputs.find((i) => i.key === "definition")!;
    expect(definitionInput, 'define-course-project declares a "definition" input').toBeTruthy();
    expect(definitionInput.required, '"definition" must stay optional - blank means "reuse the existing project"').toBe(false);
    // Locks the "blank = reuse" contract in the help text itself, so a future
    // rewrite of the copy cannot silently drop the guarantee this test
    // otherwise only checks structurally.
    expect(definitionInput.help ?? "").toMatch(/blank/i);

    const wf = byId.get("course-build")!;
    const fields = collectRuntimeFields(wf, (t) => getStepDefinition(t)?.inputs);
    const courseProject = fields.find((f) => f.fieldKey === "courseProject")!;
    expect(courseProject, "course-build surfaces a courseProject runtime field").toBeTruthy();
    expect(courseProject.required, "the run-form field itself must also stay optional").toBe(false);
  });

  // T4 (field-count audit): whether "instructor" belongs on this form at all
  // was worth checking directly rather than assuming - castletop-workbook's
  // OWN "instructor" input is deliberately blanked by this preset's "20.
  // instructor" bindOverride (castletop-workbook's source index inside the
  // course-refresh include), so if that were the only consumer, the field
  // should not appear. It still does, because generate-course-guides (source
  // index 6) binds the SAME runtime field, unblanked, for its Instructor
  // Contact document (course-setup.ts's own "Q4" comment on that binding) -
  // a second, live, intentional consumer, not a leftover. The rest of
  // castletop-workbook's own inputs have no such second consumer and
  // correctly do not appear.
  it("\"instructor\" still appears because generate-course-guides binds it too, unlike castletop-workbook's other now-blanked inputs (T4)", () => {
    const wf = byId.get("course-build")!;
    const lookup = (id: string) => byId.get(id);
    const expanded = expandWorkflowDef(wf, lookup);
    const fields = collectRuntimeFields(
      { ...wf, steps: expanded.steps },
      (t) => getStepDefinition(t)?.inputs
    );
    const keys = fields.map((f) => f.fieldKey);

    expect(keys, "instructor surfaces via generate-course-guides's own binding").toContain("instructor");
    for (const castletopOnlyKey of [
      "instructorFileAs",
      "contactMinutes",
      "readingRate",
      "pagesPerChapter",
      "classSessionMinutes",
    ]) {
      expect(keys, `${castletopOnlyKey} has no second consumer and must not appear`).not.toContain(castletopOnlyKey);
    }
  });

  // AC4: the schedule step declares no "sources" (sourcePolicy) input at
  // all, so nothing here binds it - the shared "sources" field on the run
  // form still comes from exactly one place, lecture-materials-from-
  // schedule's own unrelated input, never duplicated or left dangling.
  it("does not surface a dead or duplicate 'sources' field from the schedule step", () => {
    const scheduleDef = getStepDefinition("course-schedule-from-source")!;
    expect(scheduleDef.inputs.some((i) => i.key === "sources"), "no sourcePolicy input on the new step").toBe(
      false
    );

    const step1 = byId.get("course-build")!.steps[1];
    expect(step1.bindings.sources, 'step 1 must not bind a nonexistent "sources" input').toBeUndefined();

    const wf = byId.get("course-build")!;
    const fields = collectRuntimeFields(wf, (t) => getStepDefinition(t)?.inputs);
    expect(fields.filter((f) => f.fieldKey === "sources").length).toBe(1);
  });

  // AC2 (this session): populate-lms-from-class-template's projectMode/
  // projectDescription used to be pinned to literal "" here, so they could
  // never appear on the run form no matter what a step-disable toggle did -
  // see the binding's own comment (presets/course-build.ts) for the full
  // defect writeup. Now bound to their own runtime fields, they must be
  // collected exactly like any other optional runtime field, carrying the
  // step's own options/help through unchanged.
  it("the run form now surfaces classSessionProjectMode/classSessionProjectDescription, with the step's own options and help text carried through", () => {
    const wf = byId.get("course-build")!;
    const fields = collectRuntimeFields(wf, (t) => getStepDefinition(t)?.inputs);
    const byKey = new Map(fields.map((f) => [f.fieldKey, f]));

    const mode = byKey.get("classSessionProjectMode");
    expect(mode, "classSessionProjectMode is now asked on the run form").toBeTruthy();
    expect(mode!.required).toBe(false);
    expect(mode!.options).toEqual(["template", "none", "course-long"]);
    // The help text was DELIBERATELY rewritten (docs/REGRESSION.md entry 211).
    // The old wording, "Overrides the template's own setting for this run",
    // was true of "none" and "course-long" and FALSE of "template" - the very
    // option a reader is likeliest to pick expecting it to do something.
    // "template" is a restated default that still lets the tile's saved
    // project win, so choosing it can switch the project ON. The three option
    // VALUES are unchanged and still pinned above; only the description of
    // what they do moved, which is the point of the fix.
    expect(mode!.help).toContain('Only "none" and "course-long" force anything');
    expect(mode!.help).toContain("same as leaving this blank");
    expect(mode!.help).not.toContain("Overrides the template's own setting for this run.");

    const description = byKey.get("classSessionProjectDescription");
    expect(description, "classSessionProjectDescription is now asked on the run form").toBeTruthy();
    expect(description!.required).toBe(false);
    expect(description!.options).toBeUndefined();
  });

  // AC2 (this session): the step's own binding names must be the two new
  // runtime fields, not the old literal "" - checked directly on the raw
  // WorkflowStepConfig, one layer below collectRuntimeFields, so a bug in
  // field-collection itself could not hide a still-broken binding.
  it("populate-lms-from-class-template's own bindings name the new runtime fields, not a literal", () => {
    const step = byId.get("course-build")!.steps[12];
    expect(step.type).toBe("populate-lms-from-class-template");
    expect(step.bindings.projectMode).toEqual({ source: "runtime", fieldKey: "classSessionProjectMode" });
    expect(step.bindings.projectDescription).toEqual({
      source: "runtime",
      fieldKey: "classSessionProjectDescription",
    });
  });

  // AC2 (this session), end-to-end trace: from the runtime field, through
  // the SAME binding-resolution formula both run loops use for a "runtime"
  // binding (useWorkflowRun.ts/server-runner.ts: scopeCoversType then
  // applyWorkflowScope), into the step's own values.projectMode/
  // values.projectDescription read, and finally through
  // resolveClassSessionProjectOverrides - the step's own precedence rule
  // (trap 3) - proving the two layers compose correctly in both directions:
  // an unset run field still auto-promotes off a persisted project exactly
  // as before (regression), and a run-supplied value now genuinely
  // overrides that persisted project (the new capability this fix unlocks).
  it("an explicit run override for the class-session project reaches the step's values end to end, and composes with the step's own precedence rule (trap 3)", () => {
    const wf = byId.get("course-build")!;
    const step = wf.steps[12];
    expect(step.type).toBe("populate-lms-from-class-template");

    function runtimeFieldKey(binding: InputBinding | undefined, label: string): string {
      if (!binding || binding.source !== "runtime") {
        throw new Error(`expected a runtime binding for ${label}`);
      }
      return binding.fieldKey;
    }
    const modeFieldKey = runtimeFieldKey(step.bindings.projectMode, "projectMode");
    const descriptionFieldKey = runtimeFieldKey(step.bindings.projectDescription, "projectDescription");
    expect(modeFieldKey).toBe("classSessionProjectMode");
    expect(descriptionFieldKey).toBe("classSessionProjectDescription");

    // Text-typed inputs never participate in workflow scope (scopeFamilyForType
    // returns null for "text"/"longtext", types.ts) - "text" stands in for
    // both inputs' real type here since scopeCoversType/applyWorkflowScope
    // only branch on the family, never the concrete type string beyond that.
    const resolveRuntimeValue = (fieldKey: string, fieldValues: Record<string, string>): string => {
      const runVal = scopeCoversType(wf.scope, "text") ? "" : fieldValues[fieldKey] ?? "";
      return applyWorkflowScope("text", runVal, wf.scope);
    };

    const persisted: CourseProject = {
      ...emptyCourseProject(),
      mode: "course-long",
      definition: "A term-long build",
    };

    // Case 1 (regression - this already worked): both run-form fields left
    // blank on a tile that already has a persisted project. The value
    // reaching the step is "" for both, exactly as it was under the old
    // literal "" bindings, and the step's own precedence rule auto-promotes
    // to "course-long" using the persisted description.
    const blankMode = resolveRuntimeValue(modeFieldKey, {});
    const blankDescription = resolveRuntimeValue(descriptionFieldKey, {});
    expect(blankMode).toBe("");
    expect(blankDescription).toBe("");
    expect(resolveClassSessionProjectOverrides({ projectMode: blankMode, projectDescription: blankDescription }, persisted)).toEqual({
      projectMode: "course-long",
      projectDescription: "A term-long build",
    });

    // Case 2 (the new capability): an instructor now types "none" into the
    // run form to turn the project OFF for this one populate run, even
    // though the tile has a persisted project the auto-promotion above
    // would otherwise apply. Before this fix, the run form never asked for
    // this field, so this override was unreachable no matter what the
    // instructor wanted.
    const overrideFieldValues = { classSessionProjectMode: "none", classSessionProjectDescription: "" };
    const overriddenMode = resolveRuntimeValue(modeFieldKey, overrideFieldValues);
    const overriddenDescription = resolveRuntimeValue(descriptionFieldKey, overrideFieldValues);
    expect(overriddenMode).toBe("none");
    expect(
      resolveClassSessionProjectOverrides(
        { projectMode: overriddenMode, projectDescription: overriddenDescription },
        persisted
      )
    ).toEqual({ projectMode: "none", projectDescription: "A term-long build" });

    // Case 3: an instructor types a run-only description without touching
    // the mode field - it still wins over the persisted description once
    // the mode auto-promotes to course-long.
    const descriptionOnlyValues = { classSessionProjectDescription: "This run only: the deployment milestone" };
    const descOnlyMode = resolveRuntimeValue(modeFieldKey, descriptionOnlyValues);
    const descOnlyDescription = resolveRuntimeValue(descriptionFieldKey, descriptionOnlyValues);
    expect(descOnlyMode).toBe("");
    expect(
      resolveClassSessionProjectOverrides(
        { projectMode: descOnlyMode, projectDescription: descOnlyDescription },
        persisted
      )
    ).toEqual({ projectMode: "course-long", projectDescription: "This run only: the deployment milestone" });
  });
});
