// B6-part-2: the six "Post ... to the LMS" toggles each carry a `contains`
// visibility gate on their own output family (workflow-field-visibility.ts's
// isFieldVisible), so the run form stops showing (and letting an instructor
// touch) a toggle for an output family they already deselected in
// COURSE_BUILD's own "outputs" multi-select. The OPERATOR itself
// (isFieldVisible's `contains` branch) is delivered and unit-tested
// elsewhere (workflow-field-visibility.test.ts, workflow-run-form.contract.
// test.ts's AC B6 describe block) - THIS file is the end-to-end proof, run
// through the real COURSE_BUILD preset via collectRuntimeFields, that the
// six `visibleWhen` declarations landed on the right input, gated on the
// right family, and actually change what the run form shows.
//
// Mirrors workflow-run-form.contract.test.ts's own courseBuildFields()
// helper (expand the real preset, collect its runtime fields through the
// real step registry) rather than hand-building fixtures, so this exercises
// the exact same flat fieldKey map the run form itself sees.
import { describe, it, expect } from "vitest";
import { collectRuntimeFields, expandWorkflowDef, type RuntimeField } from "@/lib/workflows/types";
import { COURSE_BUILD } from "@/lib/workflows/presets/course-build";
import { getPresetDef } from "@/lib/workflows/presets";
import { getStepDefinition } from "@/lib/workflows/registry";
import { isFieldVisible } from "@/lib/workflow-field-visibility";

function courseBuildFields(): RuntimeField[] {
  const expanded = expandWorkflowDef(COURSE_BUILD, getPresetDef);
  return collectRuntimeFields(
    { ...COURSE_BUILD, steps: expanded.steps },
    (type) => getStepDefinition(type)?.inputs
  );
}

// COURSE_BUILD's own runtime fieldKey for each generator's postToLms input -
// see presets/course-setup.ts (guidesPostToLms, announcementsPostToLms,
// knowledgeChecksPostToLms, significancePostToLms, instructorNotesPostToLms)
// and presets/course-build.ts (currentEventsPostToLms). These are BINDING
// fieldKeys, distinct from the step-local input key ("postToLms") the
// `visibleWhen` gate is actually declared on in each steps.*.ts file - the
// gate travels with the input spec regardless of which runtime field it is
// ultimately bound to (types.ts's collectRuntimeFields copies spec.
// visibleWhen onto the RuntimeField it emits).
const POST_TO_LMS_FIELD_TO_FAMILY: Record<string, string> = {
  guidesPostToLms: "guides",
  announcementsPostToLms: "announcements",
  knowledgeChecksPostToLms: "knowledgeChecks",
  significancePostToLms: "significance",
  instructorNotesPostToLms: "instructorNotes",
  currentEventsPostToLms: "currentEvents",
};

const POST_TO_LMS_FIELD_KEYS = Object.keys(POST_TO_LMS_FIELD_TO_FAMILY);

describe("B6-part-2: postToLms toggles are gated on their own output family", () => {
  it("AC1: each of the six postToLms fields declares a contains gate on its own family", () => {
    const fields = courseBuildFields();
    for (const key of POST_TO_LMS_FIELD_KEYS) {
      const runtimeField = fields.find((f) => f.fieldKey === key);
      expect(runtimeField, `${key} is missing from COURSE_BUILD's run form`).toBeDefined();
      expect(runtimeField!.visibleWhen).toEqual({
        fieldKey: "outputs",
        contains: POST_TO_LMS_FIELD_TO_FAMILY[key],
      });
    }
  });

  it("AC2: blank (or absent) outputs means ALL - every toggle stays visible, exactly like today", () => {
    const fields = courseBuildFields();
    for (const key of POST_TO_LMS_FIELD_KEYS) {
      const runtimeField = fields.find((f) => f.fieldKey === key)!;
      // Absent "outputs" (a brand-new run form) and an explicit blank string
      // (an existing saved run whose binding is "") both mean "every
      // family" - output-selection.ts's own "blank means all" convention.
      expect(isFieldVisible(runtimeField, {})).toBe(true);
      expect(isFieldVisible(runtimeField, { outputs: "" })).toBe(true);
    }
  });

  it("AC3: selecting only \"guides\" hides the other five toggles, keeps the guides one", () => {
    const fields = courseBuildFields();
    const values = { outputs: "guides" };
    const visible = (key: string) => isFieldVisible(fields.find((f) => f.fieldKey === key)!, values);

    expect(visible("guidesPostToLms")).toBe(true);
    expect(visible("announcementsPostToLms")).toBe(false);
    expect(visible("knowledgeChecksPostToLms")).toBe(false);
    expect(visible("significancePostToLms")).toBe(false);
    expect(visible("instructorNotesPostToLms")).toBe(false);
    expect(visible("currentEventsPostToLms")).toBe(false);
  });

  it("AC3 (converse): a multi-family selection shows exactly the selected toggles", () => {
    const fields = courseBuildFields();
    const values = { outputs: "significance\ncurrentEvents" };
    const visible = (key: string) => isFieldVisible(fields.find((f) => f.fieldKey === key)!, values);

    expect(visible("guidesPostToLms")).toBe(false);
    expect(visible("announcementsPostToLms")).toBe(false);
    expect(visible("knowledgeChecksPostToLms")).toBe(false);
    expect(visible("significancePostToLms")).toBe(true);
    expect(visible("instructorNotesPostToLms")).toBe(false);
    expect(visible("currentEventsPostToLms")).toBe(true);
  });
});
