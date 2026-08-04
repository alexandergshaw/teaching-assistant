// TDD for CHUNK A (AC A3/A4) of the Course Build cleanup, written from the acceptance
// criteria BEFORE the implementation existed. These tests currently fail. Make them
// pass without changing what they assert.
//
// WHY THIS FILE EXISTS, in one paragraph. COURSE_BUILD wires itself into COURSE_REFRESH
// with 31 `bindOverrides` and 8 `remap` entries whose keys are POSITIONAL - "6.selected"
// means "the input named `selected` on whatever step currently sits at index 6 of
// COURSE_REFRESH". The existing guard (presets.course-build.test.ts:110-138) checks only
// that such a step DECLARES an input by that name. A measured experiment inserted one
// step at COURSE_REFRESH index 6 and re-expanded COURSE_BUILD: the run form silently grew
// from 29 fields to 37, two bindOverrides were silently dropped, and the guard did NOT
// report "6.courseKind" or "6.selected" - because the newly-shifted-in step also declared
// those inputs. Pinning each key to the step TYPE it resolves to is the check that fails.
import { describe, it, expect } from "vitest";
import { COURSE_BUILD } from "@/lib/workflows/presets/course-build";
import { PRESET_WORKFLOWS, getPresetDef } from "@/lib/workflows/presets";
import { getStepDefinition } from "@/lib/workflows/registry";
import { validateWorkflowDef, resolveIncludeKeyTargets } from "@/lib/workflows/validate-workflow-def";

const opts = {
  lookupShape: (type: string) => {
    const def = getStepDefinition(type);
    return def ? { inputs: def.inputs, outputs: def.outputs } : undefined;
  },
  lookupWorkflow: getPresetDef,
};

describe("AC A4 - every shipped preset validates clean", () => {
  // A real issue found here is a FINDING to report, never a reason to weaken the
  // validator. If this fails, the preset is wrong, not the test.
  it.each(PRESET_WORKFLOWS.map((w) => [w.id, w] as const))("%s has no error-severity issues", (_id, wf) => {
    const errors = validateWorkflowDef(wf, opts).filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });
});

describe("AC A3 - COURSE_BUILD's positional include keys are pinned to the step they name", () => {
  const targets = () => {
    const found = resolveIncludeKeyTargets(COURSE_BUILD, opts);
    return new Map(found.map((t) => [t.key, t.targetTypes]));
  };

  // These pairings are cross-confirmed by three independent sources: the preset's own
  // bindOverride comments, docs/REGRESSION.md entry 182 (which records that
  // starter-materials' include is source index 18, generate-syllabus 19,
  // castletop-workbook 20 after two steps were spliced in at 14/15), and a direct
  // read of COURSE_REFRESH. If any pairing below is wrong, that is a real defect in
  // the preset - report it rather than adjusting this table.
  it.each([
    ["6.selected", "generate-course-guides"],
    ["6.courseKind", "generate-course-guides"],
    ["8.courseKind", "lms-rubric"],
    ["11.repo", "lms-assignments"],
    ["12.selected", "generate-weekly-announcements"],
    ["13.selected", "generate-knowledge-checks"],
    ["13.courseKind", "generate-knowledge-checks"],
    ["14.selected", "generate-weekly-significance"],
    ["14.courseKind", "generate-weekly-significance"],
    ["15.selected", "generate-instructor-notes"],
    ["15.courseKind", "generate-instructor-notes"],
    ["18.selected", "starter-materials"],
    ["18.includeGithub", "starter-materials"],
    ["19.regenerate", "generate-syllabus"],
    ["20.instructor", "castletop-workbook"],
  ])("%s resolves to %s", (key, expectedType) => {
    expect(targets().get(key)).toContain(expectedType);
  });

  it("every dotted key resolves to at least one real step - no orphans", () => {
    const orphans = resolveIncludeKeyTargets(COURSE_BUILD, opts).filter((t) => t.targetTypes.length === 0);
    expect(orphans).toEqual([]);
  });

  // The count is pinned so that ADDING an override without extending the table above
  // fails here. Same idea as headless.ts's size canary, and the same maintenance rule:
  // bump it in the SAME change that adds the key, and add its pairing above.
  it("the number of positional include keys is pinned", () => {
    const found = resolveIncludeKeyTargets(COURSE_BUILD, opts);
    expect(found.filter((t) => t.kind === "bindOverride")).toHaveLength(31);
    expect(found.filter((t) => t.kind === "remap")).toHaveLength(8);
  });
});
