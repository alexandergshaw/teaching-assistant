// The pre-refactor SHAPE ORACLE for the four course-setup presets.
//
// `preset-shape.oracle.json` beside this file was captured from the tree at commit
// 2419cec, BEFORE any of the Course Build cleanup chunks landed. It records, per preset:
// the expanded step type list, the `topIndices` mapping, and the run form's field list
// (fieldKey, type, required) in collection order.
//
// WHY. The cleanup consolidates six duplicated generator steps, extracts a shared run
// core, reworks the run form, and (in a later chunk) replaces 215 positional `stepIndex`
// references and 104 positional `"N.key"` include keys with named ids. Every one of those
// is supposed to be SHAPE-PRESERVING. A measured experiment showed how badly that can go
// wrong silently: inserting one step into COURSE_REFRESH grew Course Build's run form
// from 29 fields to 37 with no compile error and no runtime error.
//
// This file is the oracle that makes such a drift loud. Do NOT regenerate the JSON to
// make a failure go away - a diff here means a preset's observable shape changed, which
// is either a defect or a deliberate change that needs its own regression entry.
import { describe, it, expect } from "vitest";
import { collectRuntimeFields, expandWorkflowDef, type WorkflowDef } from "@/lib/workflows/types";
import { COURSE_BUILD } from "@/lib/workflows/presets/course-build";
import { COURSE_KICKOFF, NO_CODE_KICKOFF, COURSE_REFRESH } from "@/lib/workflows/presets/course-setup";
import { getPresetDef } from "@/lib/workflows/presets";
import { getStepDefinition } from "@/lib/workflows/registry";
import oracle from "./preset-shape.oracle.json";

type Snapshot = { stepTypes: string[]; topIndices: number[]; fields: [string, string, number][] };

// The JSON import widens the fixed-length tuples to (string | number)[], which does not
// narrow back to Snapshot directly. Assert through unknown once, here, rather than
// scattering casts through the assertions below.
const ORACLE = oracle as unknown as Record<string, Snapshot>;

const PRESETS: Record<string, WorkflowDef> = {
  "course-build": COURSE_BUILD,
  "course-kickoff": COURSE_KICKOFF,
  "no-code-kickoff": NO_CODE_KICKOFF,
  "course-refresh": COURSE_REFRESH,
};

// The ONLY intended required-flag change in this whole cleanup: Course Build's four
// per-source inputs become required exactly when their own source is chosen, so the run
// form stops letting an instructor press Run with the cartridge/syllabus upload empty
// and fail at step 1 instead. `validate-run-form.ts` already skips a required field that
// is currently hidden, which is what makes this safe.
const ALLOWED_NEWLY_REQUIRED = new Set(["repo", "cartridge", "syllabus", "lmsCourse"]);

function snapshot(def: WorkflowDef): Snapshot {
  const expanded = expandWorkflowDef(def, getPresetDef);
  const fields = collectRuntimeFields(
    { ...def, steps: expanded.steps },
    (type) => getStepDefinition(type)?.inputs
  );
  return {
    stepTypes: expanded.steps.map((s) => s.type),
    topIndices: expanded.topIndices,
    fields: fields.map((f) => [f.fieldKey, f.type, f.required ? 1 : 0]),
  };
}

describe.each(Object.keys(PRESETS))("%s keeps its shape", (id) => {
  const expected = ORACLE[id];
  const actual = () => snapshot(PRESETS[id]);

  it("expands to the same step types, in the same order", () => {
    expect(actual().stepTypes).toEqual(expected.stepTypes);
  });

  // topIndices is what maps each flat step back to a top-level step. Per-user
  // enable/disable toggles and every include bindOverride match through it, so a change
  // here silently re-points saved user state.
  it("maps every expanded step back to the same top-level step", () => {
    expect(actual().topIndices).toEqual(expected.topIndices);
  });

  it("asks the run form for the same fields, in the same order, with the same types", () => {
    const strip = (s: Snapshot) => s.fields.map(([key, type]) => [key, type]);
    expect(strip(actual())).toEqual(strip(expected));
  });

  it("changes no field's required flag except the four documented per-source inputs", () => {
    const req = (s: Snapshot) => new Set(s.fields.filter((f) => f[2] === 1).map((f) => f[0]));
    const before = req(expected);
    const after = req(actual());

    // Nothing that was required may stop being required.
    for (const key of before) {
      expect(after.has(key), `${key} stopped being required`).toBe(true);
    }
    // Nothing new may become required except the four allowed.
    for (const key of after) {
      if (before.has(key)) continue;
      expect(ALLOWED_NEWLY_REQUIRED.has(key), `${key} became required unexpectedly`).toBe(true);
    }
  });
});

describe("the oracle itself is meaningful", () => {
  // A canary. If the capture ever degenerates to empty structures, every assertion above
  // would pass vacuously. These numbers are the ones the audit measured by hand.
  it("records the shape the audit actually measured", () => {
    const cb = ORACLE["course-build"];
    expect(cb.stepTypes).toHaveLength(33);
    expect(cb.fields).toHaveLength(29);
    expect(cb.fields.filter((f) => f[2] === 1).map((f) => f[0])).toEqual(["hubCourse", "source"]);
    expect(ORACLE["course-refresh"].stepTypes).toHaveLength(22);
  });
});
