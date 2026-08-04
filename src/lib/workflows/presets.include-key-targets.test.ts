// TDD for CHUNK A (AC A3/A4) of the Course Build cleanup, written from the acceptance
// criteria BEFORE the implementation existed. Updated for CHUNK E-b (the step-id
// migration): COURSE_BUILD's include keys are now id-keyed ("generate-course-
// guides.selected" rather than "6.selected"), so the pairings and structural checks
// below name each key by the id of the COURSE_REFRESH step it targets instead of its
// numeric position. Every pairing and both counts below are unchanged in substance from
// before the migration - only the key spelling changed.
//
// WHY THIS FILE EXISTS, in one paragraph. COURSE_BUILD wires itself into COURSE_REFRESH
// with 31 `bindOverrides` and 8 `remap` entries whose keys name a step of COURSE_REFRESH
// by id (or, for a backward-compatible numeric key, by index) - "generate-course-
// guides.selected" means "the input named `selected` on the step that currently carries
// the id `generate-course-guides` in COURSE_REFRESH". The existing guard
// (presets.course-build.test.ts) checks only that such a step DECLARES an input by that
// name. A measured experiment - back when these keys were still positional - inserted one
// step at COURSE_REFRESH index 6 and re-expanded COURSE_BUILD: the run form silently grew
// from 29 fields to 37, two bindOverrides were silently dropped, and the guard did NOT
// report "6.courseKind" or "6.selected" - because the newly-shifted-in step also declared
// those inputs. Pinning each key to the step TYPE it resolves to is the check that fails
// on that kind of drift; ids remove the insertion-shifts-everything failure mode this
// pinning exists to catch, but the pinning itself stays as a direct proof that the wiring
// still lands where it says it does.
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

describe("AC A3 - COURSE_BUILD's include keys are pinned to the step they name", () => {
  const targets = () => {
    const found = resolveIncludeKeyTargets(COURSE_BUILD, opts);
    return new Map(found.map((t) => [t.key, t.targetTypes]));
  };

  // These pairings are cross-confirmed by three independent sources: the preset's own
  // bindOverride comments, docs/REGRESSION.md entry 182 (which records that
  // starter-materials' include is source index 18, generate-syllabus 19,
  // castletop-workbook 20 after two steps were spliced in at 14/15 - now COURSE_REFRESH's
  // own step ids "include-starter-materials", "generate-syllabus", "castletop-workbook"),
  // and a direct read of COURSE_REFRESH. If any pairing below is wrong, that is a real
  // defect in the preset - report it rather than adjusting this table.
  //
  // Each key's prefix is now the id of the COURSE_REFRESH step it names (CHUNK E-b) -
  // "generate-course-guides.selected" replaces the old "6.selected", and so on for every
  // entry below. "include-starter-materials" (never "starter-materials", per the id-naming
  // rule for an include-workflow step) still resolves to the TYPE "starter-materials" -
  // the single step COURSE_REFRESH's own nested include absorbs.
  it.each([
    ["generate-course-guides.selected", "generate-course-guides"],
    ["generate-course-guides.courseKind", "generate-course-guides"],
    ["lms-rubric.courseKind", "lms-rubric"],
    ["lms-assignments.repo", "lms-assignments"],
    ["generate-weekly-announcements.selected", "generate-weekly-announcements"],
    ["generate-knowledge-checks.selected", "generate-knowledge-checks"],
    ["generate-knowledge-checks.courseKind", "generate-knowledge-checks"],
    ["generate-weekly-significance.selected", "generate-weekly-significance"],
    ["generate-weekly-significance.courseKind", "generate-weekly-significance"],
    ["generate-instructor-notes.selected", "generate-instructor-notes"],
    ["generate-instructor-notes.courseKind", "generate-instructor-notes"],
    ["include-starter-materials.selected", "starter-materials"],
    ["include-starter-materials.includeGithub", "starter-materials"],
    ["generate-syllabus.regenerate", "generate-syllabus"],
    ["castletop-workbook.instructor", "castletop-workbook"],
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
