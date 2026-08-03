// The "course-build preset" tests. course-build is course-kickoff-no-code
// with its schedule-generation step (index 1) swapped for
// course-schedule-from-source (Wave 1's combined source-picker step:
// steps.course-schedule-from-source.ts), so the instructor can build the
// schedule from a codebase, a typed description, an uploaded course
// cartridge, an uploaded syllabus, or an existing LMS course - the output is
// deliberately identical to course-kickoff-no-code's regardless of which
// source is picked. Split into its own file, matching how
// course-kickoff-no-code's own tests were split out of presets.test.ts, to
// keep files under the repo's 1000-line cap.

import { describe, it, expect } from "vitest";
import { allWorkflows } from "./presets";
import { getStepDefinition } from "./registry";
import {
  outputFeedsInput,
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
      "lecture-materials-from-schedule",
      // Two per-week output families (steps 6/7, steps.course-build-qa.ts /
      // steps.course-build-current-events.ts): anticipated Q&A and current
      // events, each grounded in that week's own materials step 5 produced.
      "generate-weekly-qa",
      "generate-weekly-current-events",
      // "Codebase and associated assignments" output family (steps 8/9,
      // steps.course-build-codebase.ts / steps.github.ts): resolves which
      // repository this run should use, then writes/refreshes its assignment
      // READMEs into it.
      "resolve-codebase-repo",
      "fill-readmes",
      "include-workflow",
      "integrate-source-into-lms",
      "populate-lms-from-class-template",
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
          expect(binding.stepIndex, `course-build step ${i}: forward ref`).toBeLessThan(i);
          const src = getStepDefinition(wf!.steps[binding.stepIndex].type);
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
      const match = key.match(/^(\d+)\.(.+)$/);
      expect(match, `malformed bindOverride key ${key}`).toBeTruthy();
      const sourceIndex = Number(match![1]);
      const inputKey = match![2];
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

  // Every skipSteps index must actually name the step it is documented (in
  // course-setup.ts's own comments) to skip - independently recomputed here
  // from course-refresh's own step array, not copied from the preset source.
  it("every skipSteps index names the step it is documented to skip", () => {
    const refresh = byId.get("course-refresh")!;
    expect(refresh.steps[0].type, "index 0 is load-course-tile").toBe("load-course-tile");
    expect(refresh.steps[1].type, "index 1 is schedule-from-repo").toBe("schedule-from-repo");
    expect(refresh.steps[3].type, "index 3 is lecture-zip").toBe("lecture-zip");

    const wf = byId.get("course-build")!;
    const include = wf.steps.find((step) => step.include?.workflowId === "course-refresh")!.include!;
    expect(include.skipSteps).toEqual([0, 1, 3]);
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

    // remap is identical except "3.files": COURSE_BUILD's own files
    // mini-chain (lecture-materials-from-schedule at index 5, then
    // generate-weekly-qa at 6, then generate-weekly-current-events at 7 -
    // this override reads the TAIL of that chain, step 7) not index 3 like
    // course-kickoff-no-code's own.
    const buildRemap = { ...buildInclude.remap };
    const noCodeRemap = { ...noCodeInclude.remap };
    expect(buildRemap["3.files"]).toEqual({ source: "step", stepIndex: 7, outputKey: "files" });
    expect(noCodeRemap["3.files"]).toEqual({ source: "step", stepIndex: 3, outputKey: "files" });
    delete buildRemap["3.files"];
    delete noCodeRemap["3.files"];
    expect(buildRemap).toEqual(noCodeRemap);

    const derivedCourseKindKeys = [
      "4.courseKind",
      "5.courseKind",
      "6.courseKind",
      // F2 fix: lms-rubric (source index 8) gained its own "courseKind"
      // bindOverride here too - same derivation reasoning as the others in
      // this list.
      "8.courseKind",
      "13.courseKind",
      "14.courseKind",
      "15.courseKind",
    ];
    // AC1: the output selector's five bindOverrides, feeding step 3's
    // (select-course-outputs) boolean outputs into course-refresh's guides/
    // announcements/knowledge-checks/weekly-significance/instructor-notes
    // steps - present ONLY on course-build's own include, never on
    // course-kickoff-no-code's.
    const outputSelectorKeys = ["6.selected", "12.selected", "13.selected", "14.selected", "15.selected"];
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

    // "Codebase and associated assignments" family: "11.repo" feeds
    // lms-assignments (course-refresh's own source index 11) COURSE_BUILD's
    // OWN resolved repository (step 8, resolve-codebase-repo) - present ONLY
    // on course-build's own include; course-kickoff-no-code has no such
    // override at all (its lms-assignments repo input falls through to the
    // shared "0.repo" remap, literal "").
    expect(buildOverrides["11.repo"], 'course-build\'s "11.repo" bindOverride').toEqual({
      source: "step",
      stepIndex: 8,
      outputKey: "repo",
    });
    expect(noCodeOverrides["11.repo"], 'course-kickoff-no-code must NOT have "11.repo"').toBeUndefined();
    delete buildOverrides["11.repo"];

    // Start-Here-module family: "18.selected" is present ONLY on
    // course-build's own include (course-kickoff-no-code leaves it unbound,
    // so starter-materials runs unconditionally there, unaffected). Both
    // presets DO carry a "18.includeGithub" override, but with genuinely
    // different values - course-build derives it from whether THIS run is
    // codebase-anchored (step 1's own "isCodebase" output); course-kickoff-
    // no-code just pins it off (a no-code kickoff never wants GitHub sign-up)
    // - so the two are compared explicitly here rather than folded into the
    // generic "everything else must be byte-identical" equality below.
    expect(buildOverrides["18.selected"], 'course-build\'s "18.selected" bindOverride').toEqual({
      source: "step",
      stepIndex: 3,
      outputKey: "selectedStartHere",
    });
    expect(noCodeOverrides["18.selected"], 'course-kickoff-no-code must NOT have "18.selected"').toBeUndefined();
    delete buildOverrides["18.selected"];

    expect(buildOverrides["18.includeGithub"], 'course-build\'s "18.includeGithub" bindOverride').toEqual({
      source: "step",
      stepIndex: 1,
      outputKey: "isCodebase",
    });
    expect(noCodeOverrides["18.includeGithub"], 'course-kickoff-no-code\'s "18.includeGithub" bindOverride').toEqual({
      source: "literal",
      value: "",
    });
    delete buildOverrides["18.includeGithub"];
    delete noCodeOverrides["18.includeGithub"];

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
    for (const key of ["4.courseKind", "5.courseKind", "6.courseKind", "8.courseKind", "13.courseKind", "14.courseKind", "15.courseKind"]) {
      expect(buildInclude.bindOverrides?.[key], key).toEqual({
        source: "step",
        stepIndex: 1,
        outputKey: "courseKind",
      });
    }
  });

  // Steps untouched by the courseKind derivation or the six course-build-
  // only steps (the two scope selectors at 2/3, generate-weekly-qa/generate-
  // weekly-current-events at 6/7, and resolve-codebase-repo/fill-readmes at
  // 8/9) - course-build's own trailing integrate-source-into-lms (now at
  // index 11, shifted right by those six insertions) - must carry identical
  // bindings to course-kickoff-no-code's own step 5. course-build's own
  // step 0 (index 0, unaffected by the insertions) is compared directly
  // against course-kickoff-no-code's own step 0.
  it("step 0, and the trailing integrate-source-into-lms step, are byte-identical to course-kickoff-no-code's own", () => {
    const build = byId.get("course-build")!.steps;
    const noCode = byId.get("course-kickoff-no-code")!.steps;
    expect(build[0].type, "step 0 type").toBe(noCode[0].type);
    expect(build[0].bindings, "step 0 bindings").toEqual(noCode[0].bindings);

    // course-build[11] <-> course-kickoff-no-code[5] (integrate-source-into-lms)
    expect(build[11].type, "build step 11 type").toBe(noCode[5].type);
    expect(build[11].bindings, "build step 11 bindings").toEqual(noCode[5].bindings);
  });

  // course-build[12] <-> course-kickoff-no-code[6] (populate-lms-from-class-
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
  it("populate-lms-from-class-template (course-build's step 12) differs from course-kickoff-no-code's own step 6 only in projectMode/projectDescription", () => {
    const buildStep12 = byId.get("course-build")!.steps[12];
    const noCodeStep6 = byId.get("course-kickoff-no-code")!.steps[6];
    expect(buildStep12.type).toBe("populate-lms-from-class-template");
    expect(noCodeStep6.type).toBe("populate-lms-from-class-template");

    for (const key of Object.keys(noCodeStep6.bindings)) {
      if (key === "projectMode" || key === "projectDescription") continue;
      expect(buildStep12.bindings[key], `"${key}" binding`).toEqual(noCodeStep6.bindings[key]);
    }
    expect(Object.keys(buildStep12.bindings).sort()).toEqual(Object.keys(noCodeStep6.bindings).sort());

    expect(noCodeStep6.bindings.projectMode).toEqual({ source: "literal", value: "" });
    expect(noCodeStep6.bindings.projectDescription).toEqual({ source: "literal", value: "" });
    expect(buildStep12.bindings.projectMode).toEqual({
      source: "runtime",
      fieldKey: "classSessionProjectMode",
    });
    expect(buildStep12.bindings.projectDescription).toEqual({
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
  it("define-course-project (course-build's step 4) differs from course-kickoff-no-code's own step 2 only in courseKind's binding", () => {
    const buildStep4 = byId.get("course-build")!.steps[4];
    const noCodeStep2 = byId.get("course-kickoff-no-code")!.steps[2];
    expect(buildStep4.type).toBe("define-course-project");
    expect(noCodeStep2.type).toBe("define-course-project");

    for (const key of Object.keys(noCodeStep2.bindings)) {
      if (key === "courseKind") continue;
      expect(buildStep4.bindings[key], `"${key}" binding`).toEqual(noCodeStep2.bindings[key]);
    }
    expect(Object.keys(buildStep4.bindings).sort()).toEqual(Object.keys(noCodeStep2.bindings).sort());

    expect(noCodeStep2.bindings.courseKind).toEqual({ source: "literal", value: "applied" });
    expect(buildStep4.bindings.courseKind).toEqual({ source: "step", stepIndex: 1, outputKey: "courseKind" });

    // AC3: schedule reads step 1 (the full schedule) directly, not step 2
    // (select-course-modules' narrowed output).
    expect(buildStep4.bindings.schedule).toEqual({ source: "step", stepIndex: 1, outputKey: "schedule" });
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
  // build's own step 5, after the two scope-selector steps at 2/3) differs
  // from course-kickoff-no-code's own step 3 in six bindings, not two -
  // sourceMaterial (now correctly bound to step 1's own resolvedSourceMaterial
  // output, matching the contract course-kickoff-no-code's binding to
  // generate-schedule's output already uses), courseKind (now derived from
  // step 1's output instead of pinned "applied", so a codebase-sourced run
  // gets coding materials here), schedule (bound to step 2's NARROWED
  // schedule, not step 1's own - AC3/AC4, the module selector), and the four
  // new selectedObjectives/selectedDecks/selectedAssignments/selectedOpeners
  // bindings (AC1, the output selector) that course-kickoff-no-code's own
  // step declares nothing for at all.
  it("lecture-materials-from-schedule (course-build's step 5) differs from course-kickoff-no-code's own step 3 only in the documented AC1/AC3/AC4 bindings", () => {
    const buildStep5 = byId.get("course-build")!.steps[5];
    const noCodeStep3 = byId.get("course-kickoff-no-code")!.steps[3];
    expect(buildStep5.type).toBe("lecture-materials-from-schedule");
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
      expect(buildStep5.bindings[key], `"${key}" binding`).toEqual(noCodeStep3.bindings[key]);
    }
    // course-build's step declares exactly course-kickoff-no-code's own
    // input keys PLUS the four new selectedX ones.
    expect(Object.keys(buildStep5.bindings).sort()).toEqual(
      [...Object.keys(noCodeStep3.bindings), "selectedObjectives", "selectedDecks", "selectedAssignments", "selectedOpeners"].sort()
    );

    // course-kickoff-no-code reads generate-schedule's derived-TOC output;
    // course-schedule-from-source now declares the SAME output (see its own
    // file), and course-build reads it the same way - unaffected by module
    // narrowing (still step 1, not step 2).
    expect(noCodeStep3.bindings.sourceMaterial).toEqual({
      source: "step",
      stepIndex: 1,
      outputKey: "resolvedSourceMaterial",
    });
    expect(buildStep5.bindings.sourceMaterial).toEqual({
      source: "step",
      stepIndex: 1,
      outputKey: "resolvedSourceMaterial",
    });

    // course-kickoff-no-code always pins "applied" (it has no other source
    // to derive from); course-build derives it per-run from step 1's own
    // "courseKind" output instead.
    expect(noCodeStep3.bindings.courseKind).toEqual({ source: "literal", value: "applied" });
    expect(buildStep5.bindings.courseKind).toEqual({ source: "step", stepIndex: 1, outputKey: "courseKind" });

    // AC3/AC4: schedule reads step 2 (select-course-modules' NARROWED
    // output) - the ONE binding in course-build the module selector
    // actually narrows.
    expect(buildStep5.bindings.schedule).toEqual({ source: "step", stepIndex: 2, outputKey: "schedule" });

    // AC1: each selectedX binding reads step 3's (select-course-outputs)
    // matching boolean output.
    expect(buildStep5.bindings.selectedObjectives).toEqual({
      source: "step",
      stepIndex: 3,
      outputKey: "selectedObjectives",
    });
    expect(buildStep5.bindings.selectedDecks).toEqual({ source: "step", stepIndex: 3, outputKey: "selectedDecks" });
    expect(buildStep5.bindings.selectedAssignments).toEqual({
      source: "step",
      stepIndex: 3,
      outputKey: "selectedAssignments",
    });
    expect(buildStep5.bindings.selectedOpeners).toEqual({
      source: "step",
      stepIndex: 3,
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

  it("the expanded step-type sequence matches course-kickoff-no-code's exactly, except for step 1's swap and the six course-build-only steps (the two scope selectors at 2/3, generate-weekly-qa/generate-weekly-current-events at 6/7, and resolve-codebase-repo/fill-readmes at 8/9)", () => {
    const lookup = (id: string) => byId.get(id);
    const buildTypes = expandWorkflowDef(byId.get("course-build")!, lookup).steps.map((s) => s.type);
    const noCodeTypes = expandWorkflowDef(byId.get("course-kickoff-no-code")!, lookup).steps.map((s) => s.type);

    // Exactly six more expanded steps than course-kickoff-no-code: the two
    // scope selectors, generate-weekly-qa/generate-weekly-current-events (the
    // two newest per-week output families), plus resolve-codebase-repo/
    // fill-readmes (the Codebase-and-associated-assignments family) - none of
    // the six is an include-workflow step, so each expands to exactly one
    // step.
    expect(buildTypes.length).toBe(noCodeTypes.length + 6);
    expect(buildTypes[1]).toBe("course-schedule-from-source");
    expect(noCodeTypes[1]).toBe("generate-schedule");
    expect(buildTypes[2]).toBe("select-course-modules");
    expect(buildTypes[3]).toBe("select-course-outputs");
    expect(buildTypes[6]).toBe("generate-weekly-qa");
    expect(buildTypes[7]).toBe("generate-weekly-current-events");
    expect(buildTypes[8]).toBe("resolve-codebase-repo");
    expect(buildTypes[9]).toBe("fill-readmes");

    // Strip course-build's six own-only steps out of its own expanded
    // sequence; what remains must match course-kickoff-no-code's own
    // sequence exactly, aside from step 1's source-picker swap - proof the
    // six insertions are pure splices, not a divergence anywhere else.
    const stripped = buildTypes.filter((_, i) => ![2, 3, 6, 7, 8, 9].includes(i));
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
    // before the workflow's own trailing populate-lms-from-class-template
    // step (which produces no new zip-worthy artifact of its own, exactly
    // like course-kickoff-no-code's own trailing step - see its comment).
    expect(buildTypes.at(-1)).toBe("populate-lms-from-class-template");
    expect(buildTypes.indexOf("blackboard-export")).toBeLessThan(buildTypes.indexOf("save-zip-to-course"));
    expect(buildTypes.indexOf("save-zip-to-course")).toBeLessThan(buildTypes.indexOf("populate-lms-from-class-template"));
  });

  it("the source selector's per-source inputs are all optional, and the source input carries its options", () => {
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

    for (const key of [
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
    ]) {
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
    expect(mode!.help).toBe("Overrides the template's own setting for this run.");

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
