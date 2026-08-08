// The END-TO-END pipeline for conditionally-required inputs, over the REAL
// preset (docs/conditional-required-inputs-acceptance-criteria.md AC1 item 2,
// AC3 items 7/9).
//
// Every other test in this feature builds its fields from object literals, so
// all of them stay green if `requiredWhen` is declared on StepInputSpec and
// then dropped on the floor by collectRuntimeFields - and the run form only
// ever sees RuntimeFields, so the feature would be completely dead in
// production with a 100% green suite. This file is the guard against that: it
// starts from the shipped WorkflowDef and walks the same sequence the run form
// walks.
//
// Precedent: presets.course-build.run-form.test.ts, written after `multi` was
// silently dropped between StepInputSpec and RuntimeField for a long time.
import { describe, it, expect } from "vitest";
import { collectRuntimeFields } from "@/lib/workflows/types";
import { getStepDefinition } from "@/lib/workflows/registry";
import { SCHEDULE_WEEKLY_ANNOUNCEMENTS } from "@/lib/workflows/presets/communication";
import { isFieldVisible, resolveFieldRequirements } from "@/lib/workflow-field-visibility";
import { groupRunFormFields } from "@/lib/workflow-field-groups";
import { validateRunForm } from "@/app/components/workflows/validate-run-form";

const stepInputs = (type: string) => getStepDefinition(type)?.inputs;

/** The run form's own sequence: collect, filter to visible, resolve
 * requiredness, then group. Mirrors WorkflowPanel.tsx + RunFormFields.tsx. */
function runForm(values: Record<string, string>) {
  const fields = collectRuntimeFields(SCHEDULE_WEEKLY_ANNOUNCEMENTS, stepInputs);
  const visible = fields.filter((f) => isFieldVisible(f, values));
  const resolved = resolveFieldRequirements(visible, values);
  return { fields, resolved, sections: groupRunFormFields(resolved) };
}

describe("requiredWhen survives the trip from StepInputSpec to RuntimeField", () => {
  it("collectRuntimeFields carries the gate through", () => {
    const { fields } = runForm({});
    const byKey = new Map(fields.map((f) => [f.fieldKey, f]));

    expect(byKey.get("message")!.requiredWhen).toEqual({ fieldKey: "draftFrom", equals: "template" });
    expect(byKey.get("title")!.requiredWhen).toEqual({ fieldKey: "draftFrom", equals: "template" });
  });
});

describe("the message box follows the mode the instructor picked", () => {
  it("sits in Setup, marked required, once template mode is chosen", () => {
    const { resolved, sections } = runForm({ draftFrom: "template" });

    const setup = sections.find((s) => s.id === "essentials")!;
    expect(setup.fields.map((f) => f.fieldKey)).toContain("message");
    expect(setup.fields.map((f) => f.fieldKey)).toContain("title");
    // The asterisk and the native required attribute both read this.
    expect(resolved.find((f) => f.fieldKey === "message")!.required).toBe(true);
  });

  it("stays out of Setup, and unmarked, in the default module-content mode", () => {
    const { resolved, sections } = runForm({ draftFrom: "" });

    const setup = sections.find((s) => s.id === "essentials");
    expect(setup?.fields.map((f) => f.fieldKey) ?? []).not.toContain("message");
    expect(resolved.find((f) => f.fieldKey === "message")!.required).toBe(false);
  });

  it("is not required on an untouched form, before any mode has been chosen", () => {
    const { resolved } = runForm({});

    expect(resolved.find((f) => f.fieldKey === "message")!.required).toBe(false);
    expect(resolved.find((f) => f.fieldKey === "title")!.required).toBe(false);
  });
});

describe("the Run button agrees with what the form shows", () => {
  it("blocks a template-mode run with a blank message", () => {
    const { fields } = runForm({ draftFrom: "template" });

    // validateRunForm deliberately receives the UNFILTERED list (entry 176
    // AC2) and resolves requiredness itself, so this asserts the OTHER path -
    // the one that does not go through resolveFieldRequirements.
    expect(validateRunForm(fields, { draftFrom: "template", hubCourse: "c1", weekday: "1" }, {})).toMatch(
      /required/i
    );
  });

  it("lets a module-content run through with both boxes blank", () => {
    const { fields } = runForm({ draftFrom: "" });

    expect(validateRunForm(fields, { draftFrom: "", hubCourse: "c1", weekday: "1" }, {})).toBeNull();
  });

  it("lets a template-mode run through once the message is filled", () => {
    const { fields } = runForm({ draftFrom: "template" });

    expect(
      validateRunForm(
        fields,
        { draftFrom: "template", hubCourse: "c1", weekday: "1", title: "Week {week}", message: "Hi" },
        {}
      )
    ).toBeNull();
  });
});
