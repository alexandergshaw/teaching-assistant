// The "course-build preset" tests. course-build is course-kickoff-no-code
// with its schedule-generation step (index 1) swapped for
// course-schedule-from-source (Wave 1's combined source-picker step:
// steps.course-schedule-from-source.ts), so the instructor can build the
// schedule from a codebase, a typed description, an uploaded course
// cartridge, an uploaded syllabus, or an existing LMS course - the output is
// deliberately identical to course-kickoff-no-code's regardless of which
// source is picked. Split into its own file, matching how
// course-kickoff-no-code's own tests were split out of presets.test.ts, to
// keep files under the repo's 1000-line cap. Covers registration, the step
// list/bindings/skipSteps/bindOverrides wiring, and the per-step diffs
// against course-kickoff-no-code. The run-form field-surfacing tests (the
// source selector's inputs, visibleWhen gating, tile-export/tile-repo
// bindings, and the T4/AC2 field-count audits) were split out again into
// presets.course-build.run-form.test.ts for the same reason.

import { describe, it, expect } from "vitest";
import { allWorkflows } from "./presets";
import { getStepDefinition } from "./registry";
import { outputFeedsInput, expandWorkflowDef, stepBindingIndex } from "./types";
import type { InputBinding, WorkflowStepConfig } from "./types";

// CHUNK E-b: presets now carry step ids, so a "step" binding may name its
// source by either stepIndex or stepId. Resolves either form to a concrete
// index within `steps`.
function resolveStepIndex(steps: WorkflowStepConfig[], binding: InputBinding & { source: "step" }): number {
  const direct = stepBindingIndex(binding);
  if (direct !== undefined) return direct;
  return steps.findIndex((s) => s.id === (binding as { stepId: string }).stepId);
}

describe("course-build preset", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));

  it("is registered alongside course-kickoff, course-kickoff-no-code, and course-refresh (none of them removed, renamed, or renumbered)", () => {
    for (const id of ["course-kickoff", "course-kickoff-no-code", "course-refresh", "course-build"]) {
      expect(byId.get(id), `${id} is registered`).toBeTruthy();
    }
  });

  it("expands to the expected top-level step list, in order", () => {
    const wf = byId.get("course-build");
    expect(wf, "course-build is registered").toBeTruthy();

    expect(wf!.steps.map((s) => s.type)).toEqual([
      "load-course-tile",
      "course-schedule-from-source",
      "select-course-modules",
      "select-course-outputs",
      "define-course-project",
      // Researches and corroborates the whole course's case studies (index
      // 5, steps.case-study-research.ts) before any per-week material is
      // generated, so lecture-materials-from-schedule below can ground
      // itself in an already-checked case. Reads course-schedule-from-
      // source's UNNARROWED schedule directly, same as define-course-project
      // above - never select-course-modules' narrowed output (AC3).
      "research-course-case-studies",
      "lecture-materials-from-schedule",
      // Two per-week output families (steps 7/8, steps.course-build-qa.ts /
      // steps.course-build-current-events.ts): anticipated Q&A and current
      // events, each grounded in that week's own materials step 6 produced.
      "generate-weekly-qa",
      "generate-weekly-current-events",
      // "Codebase and associated assignments" output family (steps 9/10,
      // steps.course-build-codebase.ts / steps.github.ts): resolves which
      // repository this run should use, then writes/refreshes its assignment
      // READMEs into it.
      "resolve-codebase-repo",
      "fill-readmes",
      "include-workflow",
      "integrate-source-into-lms",
      "populate-lms-from-class-template",
      // Appended as the new LAST step (index 14) - a course-wide visualizer
      // concept-gap audit (steps.visualizer.ts). Deliberately last: nothing
      // else in this preset reads its output, so adding it here required no
      // other bindOverrides/stepIndex in this file to change.
      "audit-visualizer-coverage",
    ]);
  });

  it("has valid, type-checked bindings (every binding key names a real input; every step-source binding resolves to a compatible output)", () => {
    const wf = byId.get("course-build");
    expect(wf, "course-build is registered").toBeTruthy();

    wf!.steps.forEach((step, i) => {
      if (step.type === "include-workflow") return; // its inputs come from the included workflow, checked separately below.

      const def = getStepDefinition(step.type);
      expect(def, `course-build step ${i}: unknown step type ${step.type}`).toBeTruthy();
      const inputByKey = new Map(def!.inputs.map((inp) => [inp.key, inp]));

      for (const [key, binding] of Object.entries(step.bindings)) {
        const input = inputByKey.get(key);
        expect(input, `course-build step ${i}: no such input "${key}" on ${step.type}`).toBeTruthy();

        if (binding.source === "step") {
          const stepIdx = resolveStepIndex(wf!.steps, binding);
          expect(stepIdx, `course-build step ${i}: unresolved step reference`).toBeGreaterThanOrEqual(0);
          expect(stepIdx, `course-build step ${i}: forward ref`).toBeLessThan(i);
          const src = getStepDefinition(wf!.steps[stepIdx].type);
          expect(src, `course-build step ${i}: unknown source step`).toBeTruthy();
          const out = src!.outputs.find((o) => o.key === binding.outputKey);
          expect(out, `course-build step ${i}: source has no output "${binding.outputKey}"`).toBeTruthy();
          expect(
            outputFeedsInput(out!.type, input!.type),
            `course-build step ${i}: ${out!.type} cannot feed ${input!.type} (input ${key})`
          ).toBe(true);
        }
      }

      for (const inp of def!.inputs) {
        if (inp.required) {
          expect(
            step.bindings[inp.key],
            `course-build step ${i}: required input "${inp.key}" is unbound`
          ).toBeTruthy();
        }
      }
    });
  });

  // AC3's central guard, structural rather than a hardcoded list: derived
  // from the actual step definitions, so a bindOverride pointed at the
  // wrong step index or naming a wrong input key fails here with a useful
  // message - the same failure mode docs/REGRESSION.md 155/157/164 trace
  // back to. Mirrors the equivalent check presets.kickoff.test.ts already
  // runs for course-kickoff/course-kickoff-no-code.
  it("every bindOverrides key names a step (in course-refresh, expanded through its own nested include) that actually declares that input", () => {
    const refresh = byId.get("course-refresh")!;
    const wf = byId.get("course-build")!;
    const includeStep = wf.steps.find((step) => step.include?.workflowId === "course-refresh");
    expect(includeStep, "course-build includes course-refresh").toBeTruthy();
    const include = includeStep!.include!;

    expect(Object.keys(include.bindOverrides ?? {}).length, "there are bindOverrides to check").toBeGreaterThan(0);

    for (const key of Object.keys(include.bindOverrides ?? {})) {
      const dot = key.indexOf(".");
      expect(dot, `malformed bindOverride key ${key}`).toBeGreaterThan(-1);
      const prefix = key.slice(0, dot);
      const inputKey = key.slice(dot + 1);
      const numericPrefix = Number(prefix);
      const sourceIndex =
        Number.isInteger(numericPrefix) && numericPrefix >= 0
          ? numericPrefix
          : refresh.steps.findIndex((s) => s.id === prefix);
      const sourceStep = refresh.steps[sourceIndex];
      expect(sourceStep, `${key} points past course-refresh's own step array`).toBeTruthy();
      // A nested include-workflow step (starter-materials) exposes its
      // absorbed steps' inputs, not its own (it has none) - expand it the
      // same way expandWorkflowDef does before checking for the input.
      const reachableTypes = sourceStep.include
        ? expandWorkflowDef(byId.get(sourceStep.include.workflowId)!, (id) => byId.get(id)).steps.map(
            (s) => s.type
          )
        : [sourceStep.type];
      expect(
        reachableTypes.some((type) => getStepDefinition(type)?.inputs.some((input) => input.key === inputKey)),
        `${key} lands on ${sourceStep.type}, whose reachable steps have no "${inputKey}" input`
      ).toBe(true);
    }
  });

  // CHUNK F: skipSteps now names the dropped steps by id, not position, so
  // this can no longer prove its point the old way (recompute the TYPE at a
  // hardcoded INDEX, then compare skipSteps against that same hardcoded
  // index - the two sides would collapse into comparing the same literal
  // array against itself, since the id and the index no longer share a
  // namespace to cross-check through). What still needs proving is
  // unchanged: that each entry in course-build's skipSteps really does, TODAY,
  // resolve - via course-refresh's own step array, independently, by id -
  // to the step type documented in course-setup.ts's comments. Renaming an
  // id in COURSE_REFRESH while accidentally repointing it at a different
  // step type (the one hazard ids do not close by themselves) would fail
  // this test even though skipSteps itself never changed.
  it("every skipSteps entry resolves, by id, to the step type it is documented to skip", () => {
    const refresh = byId.get("course-refresh")!;
    const byStepId = (id: string) => refresh.steps.find((s) => s.id === id);
    expect(byStepId("load-course-tile")?.type, `"load-course-tile" names a load-course-tile step`).toBe(
      "load-course-tile"
    );
    expect(byStepId("schedule-from-repo")?.type, `"schedule-from-repo" names a schedule-from-repo step`).toBe(
      "schedule-from-repo"
    );
    expect(byStepId("lecture-zip")?.type, `"lecture-zip" names a lecture-zip step`).toBe("lecture-zip");

    const wf = byId.get("course-build")!;
    const include = wf.steps.find((step) => step.include?.workflowId === "course-refresh")!.include!;
    expect(include.skipSteps).toEqual(["load-course-tile", "schedule-from-repo", "lecture-zip"]);
  });

  // AC1 guard, updated for the courseKind-derivation defect fix: the
  // course-refresh include block is IDENTICAL to course-kickoff-no-code's own
  // in every field EXCEPT the seven courseKind bindOverrides (4/5/6/8/13/14/15
  // - 8 is the F2 fix, binding lms-rubric's own courseKind input), which must
  // now derive from step 1's own "courseKind" output instead of pinning
  // NO_CODE_KICKOFF's literal "applied" - a codebase-sourced run needs those
  // seven steps' optional templates/guides/knowledge-checks/rubric to get
  // coding content too. skipSteps and remap, and every OTHER bindOverride, are
  // still structurally proven identical here so any future drift in either
  // preset's include block still fails loudly.
  it("AC1: the course-refresh include's skipSteps, and every bindOverride/remap entry except the documented COURSE_BUILD-only differences, are byte-identical to course-kickoff-no-code's own", () => {
    const buildInclude = byId
      .get("course-build")!
      .steps.find((s) => s.include?.workflowId === "course-refresh")!.include!;
    const noCodeInclude = byId
      .get("course-kickoff-no-code")!
      .steps.find((s) => s.include?.workflowId === "course-refresh")!.include!;

    expect(buildInclude.skipSteps).toEqual(noCodeInclude.skipSteps);

    // remap is identical except "lecture-zip.files" (course-refresh's own
    // dropped lecture-zip step, keyed by its id): COURSE_BUILD's own files
    // mini-chain (lecture-materials-from-schedule at index 5, then
    // generate-weekly-qa at 6, then generate-weekly-current-events at 7 -
    // this override reads the TAIL of that chain, step 7) not
    // lecture-materials-from-schedule directly like course-kickoff-no-code's
    // own.
    const buildRemap = { ...buildInclude.remap };
    const noCodeRemap = { ...noCodeInclude.remap };
    expect(buildRemap["lecture-zip.files"]).toEqual({
      source: "step",
      stepId: "generate-weekly-current-events",
      outputKey: "files",
    });
    expect(noCodeRemap["lecture-zip.files"]).toEqual({
      source: "step",
      stepId: "lecture-materials-from-schedule",
      outputKey: "files",
    });
    delete buildRemap["lecture-zip.files"];
    delete noCodeRemap["lecture-zip.files"];

    // The three "schedule-from-repo.*" remap entries also carry a
    // per-preset id STRING (each preset's own step 1 - course-schedule-
    // from-source in course-build, generate-schedule in
    // course-kickoff-no-code) even though both point at the identical
    // POSITION and role. Compared explicitly here, then excluded from the
    // generic equality below.
    for (const key of ["schedule-from-repo.courseTitle", "schedule-from-repo.schedule", "schedule-from-repo.weeks"]) {
      const outputKey = key.split(".")[1];
      expect(buildRemap[key], `course-build's "${key}" remap`).toEqual({
        source: "step",
        stepId: "course-schedule-from-source",
        outputKey,
      });
      expect(noCodeRemap[key], `course-kickoff-no-code's "${key}" remap`).toEqual({
        source: "step",
        stepId: "generate-schedule",
        outputKey,
      });
      delete buildRemap[key];
      delete noCodeRemap[key];
    }
    expect(buildRemap).toEqual(noCodeRemap);

    const derivedCourseKindKeys = [
      "generate-assignment-from-template.courseKind",
      "generate-test-from-template.courseKind",
      "generate-course-guides.courseKind",
      // F2 fix: lms-rubric gained its own "courseKind" bindOverride here too
      // - same derivation reasoning as the others in this list.
      "lms-rubric.courseKind",
      "generate-knowledge-checks.courseKind",
      "generate-weekly-significance.courseKind",
      "generate-instructor-notes.courseKind",
    ];
    // AC1: the output selector's five bindOverrides, feeding step 3's
    // (select-course-outputs) boolean outputs into course-refresh's guides/
    // announcements/knowledge-checks/weekly-significance/instructor-notes
    // steps - present ONLY on course-build's own include, never on
    // course-kickoff-no-code's.
    const outputSelectorKeys = [
      "generate-course-guides.selected",
      "generate-weekly-announcements.selected",
      "generate-knowledge-checks.selected",
      "generate-weekly-significance.selected",
      "generate-instructor-notes.selected",
    ];
    const buildOverrides = { ...buildInclude.bindOverrides };
    const noCodeOverrides = { ...noCodeInclude.bindOverrides };
    for (const key of derivedCourseKindKeys) {
      expect(buildOverrides[key], `course-build's "${key}" bindOverride`).toBeTruthy();
      delete buildOverrides[key];
      delete noCodeOverrides[key];
    }
    for (const key of outputSelectorKeys) {
      expect(buildOverrides[key], `course-build's "${key}" bindOverride`).toBeTruthy();
      expect(noCodeOverrides[key], `course-kickoff-no-code must NOT have "${key}"`).toBeUndefined();
      delete buildOverrides[key];
    }

    // "Codebase and associated assignments" family: "lms-assignments.repo"
    // feeds lms-assignments (course-refresh's own source step, named by its
    // id) COURSE_BUILD's OWN resolved repository (step 8,
    // resolve-codebase-repo) - present ONLY on course-build's own include;
    // course-kickoff-no-code has no such override at all (its
    // lms-assignments repo input falls through to the shared
    // "load-course-tile.repo" remap, literal "").
    expect(buildOverrides["lms-assignments.repo"], 'course-build\'s "lms-assignments.repo" bindOverride').toEqual({
      source: "step",
      stepId: "resolve-codebase-repo",
      outputKey: "repo",
    });
    expect(
      noCodeOverrides["lms-assignments.repo"],
      'course-kickoff-no-code must NOT have "lms-assignments.repo"'
    ).toBeUndefined();
    delete buildOverrides["lms-assignments.repo"];

    // Start-Here-module family: "include-starter-materials.selected" is
    // present ONLY on course-build's own include (course-kickoff-no-code
    // leaves it unbound, so starter-materials runs unconditionally there,
    // unaffected). Both presets DO carry an
    // "include-starter-materials.includeGithub" override, but with
    // genuinely different values - course-build derives it from whether
    // THIS run is codebase-anchored (step 1's own "isCodebase" output);
    // course-kickoff-no-code just pins it off (a no-code kickoff never
    // wants GitHub sign-up) - so the two are compared explicitly here
    // rather than folded into the generic "everything else must be
    // byte-identical" equality below.
    expect(
      buildOverrides["include-starter-materials.selected"],
      'course-build\'s "include-starter-materials.selected" bindOverride'
    ).toEqual({
      source: "step",
      stepId: "select-course-outputs",
      outputKey: "selectedStartHere",
    });
    expect(
      noCodeOverrides["include-starter-materials.selected"],
      'course-kickoff-no-code must NOT have "include-starter-materials.selected"'
    ).toBeUndefined();
    delete buildOverrides["include-starter-materials.selected"];

    expect(
      buildOverrides["include-starter-materials.includeGithub"],
      'course-build\'s "include-starter-materials.includeGithub" bindOverride'
    ).toEqual({
      source: "step",
      stepId: "course-schedule-from-source",
      outputKey: "isCodebase",
    });
    expect(
      noCodeOverrides["include-starter-materials.includeGithub"],
      'course-kickoff-no-code\'s "include-starter-materials.includeGithub" bindOverride'
    ).toEqual({
      source: "literal",
      value: "",
    });
    delete buildOverrides["include-starter-materials.includeGithub"];
    delete noCodeOverrides["include-starter-materials.includeGithub"];

    expect(buildOverrides).toEqual(noCodeOverrides);
  });

  // Defect fix: COURSE_BUILD's courseKind must be derived from the chosen
  // source, not pinned - so every "N.courseKind" bindOverride must point at
  // step 1's own "courseKind" output (course-schedule-from-source), never a
  // literal, and never NO_CODE_KICKOFF's pinned "applied".
  it("every courseKind bindOverride in the course-refresh include derives from step 1's courseKind output", () => {
    const buildInclude = byId
      .get("course-build")!
      .steps.find((s) => s.include?.workflowId === "course-refresh")!.include!;
    for (const key of [
      "generate-assignment-from-template.courseKind",
      "generate-test-from-template.courseKind",
      "generate-course-guides.courseKind",
      "lms-rubric.courseKind",
      "generate-knowledge-checks.courseKind",
      "generate-weekly-significance.courseKind",
      "generate-instructor-notes.courseKind",
    ]) {
      expect(buildInclude.bindOverrides?.[key], key).toEqual({
        source: "step",
        stepId: "course-schedule-from-source",
        outputKey: "courseKind",
      });
    }
  });

  // Steps untouched by the courseKind derivation or the seven course-build-
  // only steps (the two scope selectors at 2/3, research-course-case-studies
  // at 5, generate-weekly-qa/generate-weekly-current-events at 7/8, and
  // resolve-codebase-repo/fill-readmes at 9/10) - course-build's own trailing
  // integrate-source-into-lms (now at index 12, shifted right by those seven
  // insertions) - must carry identical bindings to course-kickoff-no-code's
  // own step 5. course-build's own step 0 (index 0, unaffected by the
  // insertions) is compared directly against course-kickoff-no-code's own
  // step 0.
  it("step 0, and the trailing integrate-source-into-lms step, are byte-identical to course-kickoff-no-code's own", () => {
    const build = byId.get("course-build")!.steps;
    const noCode = byId.get("course-kickoff-no-code")!.steps;
    expect(build[0].type, "step 0 type").toBe(noCode[0].type);
    expect(build[0].bindings, "step 0 bindings").toEqual(noCode[0].bindings);

    // course-build[12] <-> course-kickoff-no-code[5] (integrate-source-into-lms).
    // Every binding is byte-identical except "schedule": both read "step 1"
    // of their OWN workflow, positionally identical - but that step is
    // course-schedule-from-source in course-build and generate-schedule in
    // course-kickoff-no-code, so the id STRING genuinely differs between the
    // two even though what it resolves to (the schedule-generating step) is
    // the same role in both.
    expect(build[12].type, "build step 12 type").toBe(noCode[5].type);
    for (const key of Object.keys(noCode[5].bindings)) {
      if (key === "schedule") continue;
      expect(build[12].bindings[key], `"${key}" binding`).toEqual(noCode[5].bindings[key]);
    }
    expect(Object.keys(build[12].bindings).sort()).toEqual(Object.keys(noCode[5].bindings).sort());
    expect(build[12].bindings.schedule).toEqual({
      source: "step",
      stepId: "course-schedule-from-source",
      outputKey: "schedule",
    });
    expect(noCode[5].bindings.schedule).toEqual({ source: "step", stepId: "generate-schedule", outputKey: "schedule" });
  });

  // course-build[13] <-> course-kickoff-no-code[6] (populate-lms-from-class-
  // template) is a DELIBERATE, narrow divergence from the byte-identical
  // check above - same shape as the define-course-project test below, which
  // already documents and pins a single intentional courseKind divergence
  // between these two presets. course-kickoff-no-code (and its coding
  // sibling, COURSE_KICKOFF) leave projectMode/projectDescription pinned to
  // literal "" ON PURPOSE (course-setup.ts's own comment there: "the step
  // resolves the project from the tile, which define-course-project has
  // already written by this point") - both presets always run
  // define-course-project immediately before this step with no way to skip
  // it, so the persisted course project already governs and a per-run
  // override would only ever fight it. course-build never had that
  // reasoning; its literal "" carried no such comment, and nothing in
  // course-build ever bound these two inputs to anything, so the run form
  // could never ask for them - see the binding's own comment
  // (presets/course-build.ts) for the full defect writeup. Every other
  // binding on this step must still match exactly.
  it("populate-lms-from-class-template (course-build's step 13) differs from course-kickoff-no-code's own step 6 only in projectMode/projectDescription", () => {
    const buildStep13 = byId.get("course-build")!.steps[13];
    const noCodeStep6 = byId.get("course-kickoff-no-code")!.steps[6];
    expect(buildStep13.type).toBe("populate-lms-from-class-template");
    expect(noCodeStep6.type).toBe("populate-lms-from-class-template");

    for (const key of Object.keys(noCodeStep6.bindings)) {
      if (key === "projectMode" || key === "projectDescription") continue;
      expect(buildStep13.bindings[key], `"${key}" binding`).toEqual(noCodeStep6.bindings[key]);
    }
    expect(Object.keys(buildStep13.bindings).sort()).toEqual(Object.keys(noCodeStep6.bindings).sort());

    expect(noCodeStep6.bindings.projectMode).toEqual({ source: "literal", value: "" });
    expect(noCodeStep6.bindings.projectDescription).toEqual({ source: "literal", value: "" });
    expect(buildStep13.bindings.projectMode).toEqual({
      source: "runtime",
      fieldKey: "classSessionProjectMode",
    });
    expect(buildStep13.bindings.projectDescription).toEqual({
      source: "runtime",
      fieldKey: "classSessionProjectDescription",
    });
  });

  // Defect fix: define-course-project (course-build's own step 4, after the
  // two scope-selector steps at 2/3; course-kickoff-no-code's own step 2)
  // used to pin courseKind literal "applied", copied from course-kickoff-
  // no-code - forcing an auto-designed project for a codebase-sourced run
  // through the "no code allowed" prompt contract even though the course IS
  // a programming course. Every other binding on this step is untouched -
  // in particular `schedule` still reads step 1 directly (course-build's own
  // course-schedule-from-source), never the module selector's narrowed
  // output, so the course-long project always describes the WHOLE course
  // (AC3).
  it("define-course-project (course-build's step 4) differs from course-kickoff-no-code's own step 2 in courseKind's binding, and in schedule's id string (both still read their own workflow's step 1)", () => {
    const buildStep4 = byId.get("course-build")!.steps[4];
    const noCodeStep2 = byId.get("course-kickoff-no-code")!.steps[2];
    expect(buildStep4.type).toBe("define-course-project");
    expect(noCodeStep2.type).toBe("define-course-project");

    // "schedule" is excluded from the generic equality check for the same
    // reason integrate-source-into-lms's is (see that test above): both
    // presets bind it to their OWN step 1, but that step is
    // course-schedule-from-source in course-build and generate-schedule in
    // course-kickoff-no-code, so the id string genuinely differs even though
    // the positional target (and the resulting wiring) does not.
    for (const key of Object.keys(noCodeStep2.bindings)) {
      if (key === "courseKind" || key === "schedule") continue;
      expect(buildStep4.bindings[key], `"${key}" binding`).toEqual(noCodeStep2.bindings[key]);
    }
    expect(Object.keys(buildStep4.bindings).sort()).toEqual(Object.keys(noCodeStep2.bindings).sort());

    expect(noCodeStep2.bindings.courseKind).toEqual({ source: "literal", value: "applied" });
    expect(buildStep4.bindings.courseKind).toEqual({
      source: "step",
      stepId: "course-schedule-from-source",
      outputKey: "courseKind",
    });

    // AC3: schedule reads step 1 (the full schedule) directly, not step 2
    // (select-course-modules' narrowed output).
    expect(buildStep4.bindings.schedule).toEqual({
      source: "step",
      stepId: "course-schedule-from-source",
      outputKey: "schedule",
    });
    expect(noCodeStep2.bindings.schedule).toEqual({
      source: "step",
      stepId: "generate-schedule",
      outputKey: "schedule",
    });
  });

  it("step 1 differs from course-kickoff-no-code's own generate-schedule step only in the bindings the new input contract requires", () => {
    const buildStep1 = byId.get("course-build")!.steps[1];
    const noCodeStep1 = byId.get("course-kickoff-no-code")!.steps[1];
    expect(buildStep1.type).toBe("course-schedule-from-source");
    expect(noCodeStep1.type).toBe("generate-schedule");

    // Carried over unchanged from generate-schedule's own bindings.
    for (const key of ["description", "weeks", "tests", "context", "sourceMaterial", "hubCourse"]) {
      expect(buildStep1.bindings[key], `"${key}" binding`).toEqual(noCodeStep1.bindings[key]);
    }

    // New: one binding per source-specific input the old step never had,
    // each to its own runtime field (named after the input key).
    expect(buildStep1.bindings.source).toEqual({ source: "runtime", fieldKey: "source" });
    expect(buildStep1.bindings.repo).toEqual({ source: "runtime", fieldKey: "repo" });
    expect(buildStep1.bindings.cartridge).toEqual({ source: "runtime", fieldKey: "cartridge" });
    expect(buildStep1.bindings.syllabus).toEqual({ source: "runtime", fieldKey: "syllabus" });
    expect(buildStep1.bindings.lmsCourse).toEqual({ source: "runtime", fieldKey: "lmsCourse" });

    // Dropped: "sources" (the sourcePolicy checklist) is not a declared
    // input on the new step at all, unlike generate-schedule.
    expect(buildStep1.bindings.sources).toBeUndefined();
    expect(noCodeStep1.bindings.sources).toEqual({ source: "runtime", fieldKey: "sources" });
  });

  // Defect fix + AC1/AC3/AC4: lecture-materials-from-schedule (course-
  // build's own step 6, after the two scope-selector steps at 2/3 and the
  // new research-course-case-studies step at 5) differs from course-kickoff-
  // no-code's own step 3 in six bindings, not two - sourceMaterial (now
  // correctly bound to step 1's own resolvedSourceMaterial output, matching
  // the contract course-kickoff-no-code's binding to generate-schedule's
  // output already uses), courseKind (now derived from step 1's output
  // instead of pinned "applied", so a codebase-sourced run gets coding
  // materials here), schedule (bound to step 2's NARROWED schedule, not step
  // 1's own - AC3/AC4, the module selector), and the four new
  // selectedObjectives/selectedDecks/selectedAssignments/selectedOpeners
  // bindings (AC1, the output selector) that course-kickoff-no-code's own
  // step declares nothing for at all.
  it("lecture-materials-from-schedule (course-build's step 6) differs from course-kickoff-no-code's own step 3 only in the documented AC1/AC3/AC4 bindings", () => {
    const buildStep6 = byId.get("course-build")!.steps[6];
    const noCodeStep3 = byId.get("course-kickoff-no-code")!.steps[3];
    expect(buildStep6.type).toBe("lecture-materials-from-schedule");
    expect(noCodeStep3.type).toBe("lecture-materials-from-schedule");

    const differing = new Set([
      "sourceMaterial",
      "courseKind",
      "schedule",
      "selectedObjectives",
      "selectedDecks",
      "selectedAssignments",
      "selectedOpeners",
    ]);
    for (const key of Object.keys(noCodeStep3.bindings)) {
      if (differing.has(key)) continue;
      expect(buildStep6.bindings[key], `"${key}" binding`).toEqual(noCodeStep3.bindings[key]);
    }
    // course-build's step declares exactly course-kickoff-no-code's own
    // input keys PLUS the four new selectedX ones.
    expect(Object.keys(buildStep6.bindings).sort()).toEqual(
      [...Object.keys(noCodeStep3.bindings), "selectedObjectives", "selectedDecks", "selectedAssignments", "selectedOpeners"].sort()
    );

    // course-kickoff-no-code reads generate-schedule's derived-TOC output;
    // course-schedule-from-source now declares the SAME output (see its own
    // file), and course-build reads it the same way - unaffected by module
    // narrowing (still step 1, not step 2). The id strings differ between
    // the two presets for the same reason integrate-source-into-lms's
    // schedule binding does above (each preset's own step 1 has a
    // different type/id).
    expect(noCodeStep3.bindings.sourceMaterial).toEqual({
      source: "step",
      stepId: "generate-schedule",
      outputKey: "resolvedSourceMaterial",
    });
    expect(buildStep6.bindings.sourceMaterial).toEqual({
      source: "step",
      stepId: "course-schedule-from-source",
      outputKey: "resolvedSourceMaterial",
    });

    // course-kickoff-no-code always pins "applied" (it has no other source
    // to derive from); course-build derives it per-run from step 1's own
    // "courseKind" output instead.
    expect(noCodeStep3.bindings.courseKind).toEqual({ source: "literal", value: "applied" });
    expect(buildStep6.bindings.courseKind).toEqual({
      source: "step",
      stepId: "course-schedule-from-source",
      outputKey: "courseKind",
    });

    // AC3/AC4: schedule reads step 2 (select-course-modules' NARROWED
    // output) - the ONE binding in course-build the module selector
    // actually narrows.
    expect(buildStep6.bindings.schedule).toEqual({
      source: "step",
      stepId: "select-course-modules",
      outputKey: "schedule",
    });

    // AC1: each selectedX binding reads step 3's (select-course-outputs)
    // matching boolean output.
    expect(buildStep6.bindings.selectedObjectives).toEqual({
      source: "step",
      stepId: "select-course-outputs",
      outputKey: "selectedObjectives",
    });
    expect(buildStep6.bindings.selectedDecks).toEqual({
      source: "step",
      stepId: "select-course-outputs",
      outputKey: "selectedDecks",
    });
    expect(buildStep6.bindings.selectedAssignments).toEqual({
      source: "step",
      stepId: "select-course-outputs",
      outputKey: "selectedAssignments",
    });
    expect(buildStep6.bindings.selectedOpeners).toEqual({
      source: "step",
      stepId: "select-course-outputs",
      outputKey: "selectedOpeners",
    });

    const scheduleStepDef = getStepDefinition("course-schedule-from-source")!;
    expect(scheduleStepDef.outputs.some((o) => o.key === "resolvedSourceMaterial" && o.type === "longtext")).toBe(
      true
    );
    expect(scheduleStepDef.outputs.some((o) => o.key === "courseKind" && o.type === "text")).toBe(true);
  });

  it("course-schedule-from-source declares the three outputs schedule-from-repo does (schedule/courseTitle/weeks), plus resolvedSourceMaterial, courseKind, repo, and isCodebase", () => {
    const newDef = getStepDefinition("course-schedule-from-source")!;
    const repoDef = getStepDefinition("schedule-from-repo")!;
    const repoKeys = repoDef.outputs.map((o) => `${o.key}:${o.type}`).sort();
    const newKeys = newDef.outputs.map((o) => `${o.key}:${o.type}`);

    for (const key of repoKeys) {
      expect(newKeys, `course-schedule-from-source is missing schedule-from-repo's own output "${key}"`).toContain(
        key
      );
    }
    // "repo" and "isCodebase" (Codebase-and-associated-assignments/Start-Here
    // output families): the repository this run is already anchored to (blank
    // on every non-codebase source), and the same condition exposed as its
    // own boolean - see this step's own file for the full reasoning.
    expect(newKeys.sort()).toEqual(
      [...repoKeys, "resolvedSourceMaterial:longtext", "courseKind:text", "repo:repo", "isCodebase:boolean"].sort()
    );
  });

  it("the expanded step-type sequence matches course-kickoff-no-code's exactly, except for step 1's swap and the eight course-build-only steps (the two scope selectors at 2/3, research-course-case-studies at 5, generate-weekly-qa/generate-weekly-current-events at 7/8, resolve-codebase-repo/fill-readmes at 9/10, and the trailing audit-visualizer-coverage)", () => {
    const lookup = (id: string) => byId.get(id);
    const buildTypes = expandWorkflowDef(byId.get("course-build")!, lookup).steps.map((s) => s.type);
    const noCodeTypes = expandWorkflowDef(byId.get("course-kickoff-no-code")!, lookup).steps.map((s) => s.type);

    // Exactly eight more expanded steps than course-kickoff-no-code: the two
    // scope selectors, research-course-case-studies (the whole-course case-
    // study researcher, spliced in after define-course-project and before
    // lecture-materials-from-schedule), generate-weekly-qa/generate-weekly-
    // current-events (the two newest per-week output families), resolve-
    // codebase-repo/fill-readmes (the Codebase-and-associated-assignments
    // family), and the trailing audit-visualizer-coverage (appended as the
    // new LAST step) - none of the eight is an include-workflow step, so
    // each expands to exactly one step.
    expect(buildTypes.length).toBe(noCodeTypes.length + 8);
    expect(buildTypes[1]).toBe("course-schedule-from-source");
    expect(noCodeTypes[1]).toBe("generate-schedule");
    expect(buildTypes[2]).toBe("select-course-modules");
    expect(buildTypes[3]).toBe("select-course-outputs");
    expect(buildTypes[5]).toBe("research-course-case-studies");
    expect(buildTypes[7]).toBe("generate-weekly-qa");
    expect(buildTypes[8]).toBe("generate-weekly-current-events");
    expect(buildTypes[9]).toBe("resolve-codebase-repo");
    expect(buildTypes[10]).toBe("fill-readmes");
    expect(buildTypes.at(-1)).toBe("audit-visualizer-coverage");

    // Strip course-build's eight own-only steps out of its own expanded
    // sequence; what remains must match course-kickoff-no-code's own
    // sequence exactly, aside from step 1's source-picker swap - proof the
    // eight insertions are pure splices, not a divergence anywhere else.
    const stripped = buildTypes.filter((_, i) => ![2, 3, 5, 7, 8, 9, 10, buildTypes.length - 1].includes(i));
    const expected = noCodeTypes.map((t, i) => (i === 1 ? "course-schedule-from-source" : t));
    expect(stripped).toEqual(expected);
  });

  // Output-set parity: the same generated-file-producing steps, and the
  // same two terminal deliverables (the Common Cartridge export and the
  // saved zip) present in the expansion - matching course-kickoff-no-code's
  // own output set, per the preset's own AC.
  it("reaches the same generated-file roles and the same two terminal steps (cartridge export and zip save) as course-kickoff-no-code", () => {
    const lookup = (id: string) => byId.get(id);
    const buildTypes = expandWorkflowDef(byId.get("course-build")!, lookup).steps.map((s) => s.type);

    for (const type of [
      "lecture-materials-from-schedule",
      "generate-assignment-from-template",
      "generate-test-from-template",
      "generate-course-guides",
      "generate-weekly-announcements",
      "generate-knowledge-checks",
      "lms-rubric",
      "castletop-workbook",
      "blackboard-export",
      "save-zip-to-course",
    ]) {
      expect(buildTypes, `expanded course-build must contain ${type}`).toContain(type);
    }

    // Terminal deliverables: cartridge export, then the zip - both run
    // before populate-lms-from-class-template (which produces no new
    // zip-worthy artifact of its own, exactly like course-kickoff-no-code's
    // own trailing step - see its comment), which in turn runs before the
    // new actual last step, audit-visualizer-coverage (also zip-worthy-
    // artifact-free: it touches no `files` accumulator at all).
    expect(buildTypes.at(-1)).toBe("audit-visualizer-coverage");
    expect(buildTypes.indexOf("blackboard-export")).toBeLessThan(buildTypes.indexOf("save-zip-to-course"));
    expect(buildTypes.indexOf("save-zip-to-course")).toBeLessThan(buildTypes.indexOf("populate-lms-from-class-template"));
    expect(buildTypes.indexOf("populate-lms-from-class-template")).toBeLessThan(
      buildTypes.indexOf("audit-visualizer-coverage")
    );
  });

  // The instructor asked for weekly knowledge checks / weekly significance /
  // instructor notes to depend on the schedule step, not on generate-lms-
  // modules (presets/course-setup.ts's COURSE_REFRESH, reached here via the
  // include-workflow step). Load-bearing proof the rebinding reaches
  // course-build too, not just course-refresh's own raw source - this repo
  // silently skips unbound inputs, so only the EXPANDED step's own
  // bindings.modules coming back undefined is real evidence.
  it("the three per-week generators' expanded \"modules\" binding is undefined", () => {
    const lookup = (id: string) => byId.get(id);
    const expanded = expandWorkflowDef(byId.get("course-build")!, lookup);

    for (const type of ["generate-knowledge-checks", "generate-weekly-significance", "generate-instructor-notes"]) {
      const step = expanded.steps.find((s) => s.type === type);
      expect(step, `course-build reaches ${type}`).toBeTruthy();
      expect(step!.bindings.modules, `course-build: ${type}'s "modules" binding must be undefined`).toBeUndefined();
    }
  });
});
