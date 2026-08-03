// F2 (HIGH): steps.rubrics.ts's "lms-rubric" (~line 101) and "generate-
// rubric-offline" (~line 262) both read resolveCourseKind(values.courseKind)
// - but before this fix, NO preset bound that input anywhere: course-
// setup.ts's COURSE_REFRESH never gave lms-rubric a courseKind binding at
// all (unlike its sibling steps 3/4/5/6/13/14/15, which all surface the SAME
// "courseKind" runtime field), and content.ts's ASSIGNMENT_KIT never bound
// generate-rubric-offline's courseKind either. An unbound input resolves to
// undefined, and resolveCourseKind(undefined) returns "coding" - so an
// applied course's rubric was always generated as if it were a coding
// course.
//
// This file proves the fix by EXPANDING each preset that reaches either step
// (course-setup.ts's COURSE_REFRESH/COURSE_KICKOFF/NO_CODE_KICKOFF, course-
// build.ts's COURSE_BUILD, content.ts's ASSIGNMENT_KIT) and reading the
// RESOLVED bindings after include-workflow's bindOverrides apply (types.ts's
// expandWorkflowDef) - never by reading the preset source, which is exactly
// how this defect was missed the first time: the binding just was not there,
// and nothing exercised the composed step to notice.
import { describe, it, expect } from "vitest";
import { allWorkflows } from "./presets";
import { getStepDefinition } from "./registry";
import { expandWorkflowDef, type WorkflowStepConfig } from "./types";

describe("F2: rubric courseKind reaches every preset that generates a rubric", () => {
  const all = allWorkflows([]);
  const byId = new Map(all.map((w) => [w.id, w]));
  const lookup = (id: string) => byId.get(id);

  // Expands `workflowId`, finds its (unique) lms-rubric step, and returns the
  // RESOLVED courseKind binding after bindOverrides apply - dumping the
  // actual composed wiring rather than trusting the preset source to say
  // what it does.
  function expandedLmsRubricCourseKindBinding(workflowId: string) {
    const def = byId.get(workflowId)!;
    const expanded = expandWorkflowDef(def, lookup);
    const idx = expanded.steps.findIndex((s: WorkflowStepConfig) => s.type === "lms-rubric");
    expect(idx, `${workflowId}'s expansion has no lms-rubric step`).toBeGreaterThanOrEqual(0);
    return expanded.steps[idx].bindings.courseKind;
  }

  it("lms-rubric is a registered step that reads a 'courseKind' input (sanity check on the step under test)", () => {
    const def = getStepDefinition("lms-rubric")!;
    expect(def.inputs.some((i) => i.key === "courseKind")).toBe(true);
  });

  it("generate-rubric-offline is a registered step that reads a 'courseKind' input (sanity check on the step under test)", () => {
    const def = getStepDefinition("generate-rubric-offline")!;
    expect(def.inputs.some((i) => i.key === "courseKind")).toBe(true);
  });

  it("COURSE_REFRESH's own lms-rubric step (source index 8) binds courseKind to the SAME runtime field steps 3/4/5/6/13/14/15 already surface, so a standalone Course Refresh asks once, not zero times", () => {
    const refresh = byId.get("course-refresh")!;
    expect(refresh.steps[8].type).toBe("lms-rubric");
    expect(refresh.steps[8].bindings.courseKind).toEqual({ source: "runtime", fieldKey: "courseKind" });
  });

  it("COURSE_KICKOFF's expanded lms-rubric step resolves courseKind to 'coding' (a codebase kickoff never asks) - proves the '8.courseKind' bindOverride exists and actually reaches the absorbed step", () => {
    expect(expandedLmsRubricCourseKindBinding("course-kickoff")).toEqual({ source: "literal", value: "coding" });
  });

  it("NO_CODE_KICKOFF's expanded lms-rubric step resolves courseKind to 'applied' (this kickoff never involves code) - proves the '8.courseKind' bindOverride exists and actually reaches the absorbed step", () => {
    expect(expandedLmsRubricCourseKindBinding("course-kickoff-no-code")).toEqual({ source: "literal", value: "applied" });
  });

  it("COURSE_BUILD's expanded lms-rubric step resolves courseKind to the SAME source-derived (and, per F3, tile-preferring) value steps 4/5 and the 6/13/14/15 bindOverrides already use - never a literal", () => {
    const binding = expandedLmsRubricCourseKindBinding("course-build");
    expect(binding).toEqual({ source: "step", stepIndex: 1, outputKey: "courseKind" });
  });

  it("neither kickoff's run form gained a new 'courseKind' field from this fix - the '8.courseKind' overrides keep it hidden exactly like the existing 4/5/6/13/14/15 overrides already do", () => {
    for (const workflowId of ["course-kickoff", "course-kickoff-no-code", "course-build"]) {
      const def = byId.get(workflowId)!;
      const expanded = expandWorkflowDef(def, lookup);
      const stillRuntime = expanded.steps.some(
        (s: WorkflowStepConfig) =>
          s.type === "lms-rubric" &&
          s.bindings.courseKind?.source === "runtime"
      );
      expect(stillRuntime, `${workflowId} leaked a runtime courseKind field via lms-rubric`).toBe(false);
    }
  });

  it("ASSIGNMENT_KIT's generate-rubric-offline step (content.ts) binds courseKind to 'coding' - this preset is always repo-driven (its first step, extract-topics-from-repo, requires a repo), so 'coding' is not an arbitrary choice, it is what the preset's own shape already means", () => {
    const kit = byId.get("assignment-kit")!;
    const step = kit.steps.find((s) => s.type === "generate-rubric-offline")!;
    expect(step.bindings.courseKind).toEqual({ source: "literal", value: "coding" });
  });
});
