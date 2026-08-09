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
    // The regression this file exists to catch a second time: hubCourse was
    // downgraded to a plain, ungated `required: false` (REGRESSION.md entry
    // 239's own follow-up regression, docs/REGRESSION.md #239 checks 6/8/9/
    // 10/11/16/18) because `requiredWhen` was equals-only and could not say
    // "required unless draftFrom is 'cartridge'". The fix widened the gate
    // with a `notEquals` arm (types.ts) instead of accepting the downgrade -
    // this asserts collectRuntimeFields still carries THAT gate through too,
    // the same way it already does for message/title's `equals` gate above.
    expect(byKey.get("hubCourse")!.requiredWhen).toEqual({ fieldKey: "draftFrom", notEquals: "cartridge" });
  });
});

// docs/REGRESSION.md entry 239's own follow-up regression: hubCourse's
// `notEquals` gate (steps.weekly-announcement-schedule.ts) is only reachable
// in production because SCHEDULE_WEEKLY_ANNOUNCEMENTS
// (presets/communication.ts) binds the step's `draftFrom` input to a runtime
// field of the SAME name "draftFrom" - entry 239 check 18's hazard, made
// concrete: `isFieldRequired` resolves `values[gate.fieldKey]` against the
// BINDING fieldKey, not the input's own key, so a rebind to any other runtime
// field name would make this gate go silently dead with no type error and no
// other failing test. This describe block is that pin, run through the REAL
// preset exactly like the rest of this file - not an object literal, which
// would stay green even if the binding were ever renamed.
describe("hubCourse's notEquals gate depends on the draftFrom binding staying same-named (entry 239 check 18)", () => {
  it("is required on an untouched form (draftFrom blank) - the pre-regression default", () => {
    const { resolved, sections } = runForm({});

    expect(resolved.find((f) => f.fieldKey === "hubCourse")!.required).toBe(true);
    const setup = sections.find((s) => s.id === "essentials")!;
    expect(setup.fields.map((f) => f.fieldKey)).toContain("hubCourse");
  });

  it("is required when draftFrom is the message template", () => {
    const { resolved, sections } = runForm({ draftFrom: "template" });

    expect(resolved.find((f) => f.fieldKey === "hubCourse")!.required).toBe(true);
    const setup = sections.find((s) => s.id === "essentials")!;
    expect(setup.fields.map((f) => f.fieldKey)).toContain("hubCourse");
  });

  it("is NOT required when draftFrom is the uploaded-package option", () => {
    const { resolved } = runForm({ draftFrom: "cartridge" });

    expect(resolved.find((f) => f.fieldKey === "hubCourse")!.required).toBe(false);
  });

  it("blocks a live-mode run with no course tile chosen, but lets a cartridge run through without one", () => {
    const untouched = runForm({});
    expect(
      validateRunForm(untouched.fields, { draftFrom: "", weekday: "1" }, {})
    ).toMatch(/course tile|required/i);

    // The cartridge upload is ITSELF required in this mode (requiredWhen:
    // { fieldKey: "draftFrom", equals: "cartridge" }, restored unchanged by
    // this fix), so it needs a file attached - but no hubCourse value or
    // uploadFiles entry for it is passed at all, proving hubCourse's own
    // requiredness (not merely visibility) is what dropped away.
    const cartridge = runForm({ draftFrom: "cartridge" });
    const file = new File(["x"], "course.imscc");
    expect(
      validateRunForm(
        cartridge.fields,
        { draftFrom: "cartridge", weekday: "1" },
        { cartridge: [file] }
      )
    ).toBeNull();
  });
});

// docs/REGRESSION.md entry 239 check 19: satisfying a gate frees a bonus
// slot (workflow-field-groups.ts's DEFAULT_BONUS_CAP) for a DIFFERENT,
// ungated optional field - so the shape of "Setup" is mode-dependent even
// for fields that carry no gate of their own. Asserted explicitly for all
// three draftFrom values so any such movement is caught here rather than
// discovered later. Before this fix, hubCourse (ungated, `required: false`)
// consumed one of the four bonus slots on every mode; after it, hubCourse is
// primary via `required` alone on the "" and "template" paths, freeing a
// slot that `packageFormats` (the next early, compact, non-gated field in
// declaration order) picks up instead - this test pins that exact movement,
// not just hubCourse's own required flag.
describe("Setup composition across draftFrom modes (entry 239 check 19)", () => {
  it("on an untouched form", () => {
    const { sections } = runForm({});
    const setup = sections.find((s) => s.id === "essentials")!;
    expect(setup.fields.map((f) => f.fieldKey)).toEqual([
      "hubCourse",
      "weekday",
      "postTime",
      "draftFrom",
      "deliver",
      "packageFormats",
    ]);
  });

  it("in template mode", () => {
    const { sections } = runForm({ draftFrom: "template" });
    const setup = sections.find((s) => s.id === "essentials")!;
    expect(setup.fields.map((f) => f.fieldKey)).toEqual([
      "hubCourse",
      "weekday",
      "postTime",
      "draftFrom",
      "deliver",
      "packageFormats",
      "title",
      "message",
    ]);
  });

  it("in cartridge (uploaded-package) mode", () => {
    const { sections } = runForm({ draftFrom: "cartridge" });
    const setup = sections.find((s) => s.id === "essentials")!;
    expect(setup.fields.map((f) => f.fieldKey)).toEqual([
      "hubCourse",
      "weekday",
      "postTime",
      "draftFrom",
      "cartridge",
      "startDate",
      "weekCount",
      "deliver",
    ]);
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
