import { describe, it, expect } from "vitest";
import { isFieldVisible, isFieldRequired, resolveFieldRequirements } from "./workflow-field-visibility";

describe("isFieldVisible", () => {
  it("is visible when the field has no visibleWhen gate at all", () => {
    expect(isFieldVisible({}, {})).toBe(true);
    expect(isFieldVisible({}, { source: "codebase" })).toBe(true);
  });

  it("is visible when the controlling field's current value matches the gate", () => {
    const field = { visibleWhen: { fieldKey: "source", equals: "codebase" } };
    expect(isFieldVisible(field, { source: "codebase" })).toBe(true);
  });

  it("is hidden when the controlling field's current value does not match the gate", () => {
    const field = { visibleWhen: { fieldKey: "source", equals: "codebase" } };
    expect(isFieldVisible(field, { source: "course-description" })).toBe(false);
  });

  it("is hidden when no source has been chosen yet (the controlling field is absent from values)", () => {
    const field = { visibleWhen: { fieldKey: "source", equals: "codebase" } };
    expect(isFieldVisible(field, {})).toBe(false);
  });

  it("is hidden when the controlling field is present but explicitly blank", () => {
    const field = { visibleWhen: { fieldKey: "source", equals: "codebase" } };
    expect(isFieldVisible(field, { source: "" })).toBe(false);
  });

  it("several fields gated on the same controlling field each show only for their own value", () => {
    const repo = { visibleWhen: { fieldKey: "source", equals: "codebase" } };
    const cartridge = { visibleWhen: { fieldKey: "source", equals: "course-cartridge" } };
    const syllabus = { visibleWhen: { fieldKey: "source", equals: "syllabus-document" } };
    const lmsCourse = { visibleWhen: { fieldKey: "source", equals: "existing-lms-course" } };

    const values = { source: "course-cartridge" };
    expect(isFieldVisible(repo, values)).toBe(false);
    expect(isFieldVisible(cartridge, values)).toBe(true);
    expect(isFieldVisible(syllabus, values)).toBe(false);
    expect(isFieldVisible(lmsCourse, values)).toBe(false);
  });

  it("an ungated field (e.g. hubCourse, shared across every source) stays visible regardless of the controlling field's value", () => {
    const hubCourse = {};
    expect(isFieldVisible(hubCourse, { source: "codebase" })).toBe(true);
    expect(isFieldVisible(hubCourse, { source: "" })).toBe(true);
    expect(isFieldVisible(hubCourse, {})).toBe(true);
  });
});

// ── isFieldRequired / resolveFieldRequirements ────────────────────────────
// docs/conditional-required-inputs-acceptance-criteria.md AC1/AC2. Written
// BEFORE the implementation. A gate may only ADD requiredness, never remove
// it, and it resolves through the same equals/contains rules isFieldVisible
// already uses - so the two predicates can never disagree about what a gate
// means.

describe("isFieldRequired", () => {
  it("keeps an unconditionally required field required, gate or no gate", () => {
    expect(isFieldRequired({ required: true }, {})).toBe(true);
    expect(
      isFieldRequired({ required: true, requiredWhen: { fieldKey: "mode", equals: "template" } }, { mode: "" })
    ).toBe(true);
    // The invariant holds for the notEquals arm too: a static `required:
    // true` short-circuits BEFORE the gate is even read, so it wins even
    // against a controlling value that would otherwise UN-satisfy notEquals.
    expect(
      isFieldRequired(
        { required: true, requiredWhen: { fieldKey: "draftFrom", notEquals: "cartridge" } },
        { draftFrom: "cartridge" }
      )
    ).toBe(true);
  });

  it("keeps a plain optional field optional", () => {
    expect(isFieldRequired({ required: false }, { mode: "template" })).toBe(false);
    expect(isFieldRequired({}, {})).toBe(false);
  });

  it("becomes required exactly when an equals gate is satisfied", () => {
    const f = { required: false, requiredWhen: { fieldKey: "mode", equals: "template" } };
    expect(isFieldRequired(f, { mode: "template" })).toBe(true);
    expect(isFieldRequired(f, { mode: "" })).toBe(false);
    expect(isFieldRequired(f, { mode: "module" })).toBe(false);
    expect(isFieldRequired(f, {})).toBe(false);
  });

  it("is exact and case-sensitive, like the visibility gate it mirrors", () => {
    const f = { required: false, requiredWhen: { fieldKey: "mode", equals: "template" } };
    expect(isFieldRequired(f, { mode: "Template" })).toBe(false);
    expect(isFieldRequired(f, { mode: " template " })).toBe(false);
  });

  it("the equals arm is REQUIREDNESS-affirmative: an obligation is only ever ADDED by a real choice", () => {
    // The `equals` arm never reuses visibleWhen's `contains` semantics
    // (blank controller = "every entry") for requiredness - right for
    // SHOWING a field, inverted for REQUIRING one, since it would make an
    // untouched form mandatory before the instructor has chosen anything.
    // See the acceptance criteria's AC2 for why `contains` is not offered
    // here. The `notEquals` arm below is a SEPARATE, later addition with the
    // opposite blank-value rule on purpose - see its own describe block -
    // and does not change anything asserted by this test.
    const f = { required: false, requiredWhen: { fieldKey: "outputs", equals: "announcements" } };
    expect(isFieldRequired(f, {})).toBe(false);
    expect(isFieldRequired(f, { outputs: "" })).toBe(false);
    expect(isFieldRequired(f, { outputs: "announcements" })).toBe(true);
  });

  it("ignores visibility entirely - that skip belongs to the caller", () => {
    // Entry 176 AC2 keeps "a hidden field must never deadlock Run" in
    // validateRunForm, BEFORE it asks about requiredness. If this predicate
    // also ANDed visibility in, resolveFieldRequirements would silently
    // un-require every hidden field and the two rules would live in two
    // places.
    const hiddenButGated = {
      required: false,
      requiredWhen: { fieldKey: "mode", equals: "template" },
      visibleWhen: { fieldKey: "advanced", equals: "yes" },
    };
    expect(isFieldRequired(hiddenButGated, { mode: "template" })).toBe(true);
    expect(isFieldVisible(hiddenButGated, { mode: "template" })).toBe(false);
  });
});

// The `notEquals` arm (types.ts's requiredWhen union, widened for
// REGRESSION.md entry 239's own follow-up regression: steps.weekly-
// announcement-schedule.ts's hubCourse was downgraded to a plain, ungated
// `required: false` because the `equals`-only gate could express "required
// exactly when draftFrom is 'template'" but not "required unless draftFrom
// is 'cartridge'" - silently NOT required on the default live path, worse
// than the mid-run failure it replaced. This block is the full matrix for
// the new arm, mirroring the `equals` arm's own coverage above.
describe("isFieldRequired - notEquals arm", () => {
  const f = { required: false, requiredWhen: { fieldKey: "draftFrom", notEquals: "cartridge" } };

  it("is required when the controlling field is BLANK/absent - the opposite of the equals arm's blank rule", () => {
    // This is the whole point of the arm: on an untouched form draftFrom is
    // "", and "" !== "cartridge", so the field is required - exactly the
    // pre-regression behavior of a plain, unconditional `required: true`.
    expect(isFieldRequired(f, { draftFrom: "" })).toBe(true);
    expect(isFieldRequired(f, {})).toBe(true);
  });

  it("is NOT required when the controlling field matches notEquals exactly", () => {
    expect(isFieldRequired(f, { draftFrom: "cartridge" })).toBe(false);
  });

  it("is required when the controlling field holds any OTHER value", () => {
    expect(isFieldRequired(f, { draftFrom: "template" })).toBe(true);
    expect(isFieldRequired(f, { draftFrom: "module" })).toBe(true);
  });

  it("is exact and case-sensitive, like the equals arm - a near-miss still counts as 'not equal' and stays required", () => {
    expect(isFieldRequired(f, { draftFrom: "Cartridge" })).toBe(true);
    expect(isFieldRequired(f, { draftFrom: " cartridge " })).toBe(true);
  });

  it("a static `required: true` still wins outright, same invariant as the equals arm", () => {
    expect(
      isFieldRequired({ required: true, requiredWhen: f.requiredWhen }, { draftFrom: "cartridge" })
    ).toBe(true);
  });
});

describe("resolveFieldRequirements", () => {
  const base = { fieldKey: "message", label: "Message", type: "longtext" as const };

  it("rewrites required to the effective value and leaves everything else alone", () => {
    const fields = [
      { ...base, required: false, requiredWhen: { fieldKey: "mode", equals: "template" }, help: "h" },
    ];

    const resolved = resolveFieldRequirements(fields, { mode: "template" });

    expect(resolved[0].required).toBe(true);
    expect(resolved[0].fieldKey).toBe("message");
    expect(resolved[0].label).toBe("Message");
    expect(resolved[0].type).toBe("longtext");
    expect(resolved[0].help).toBe("h");
    expect(resolved[0].requiredWhen).toEqual({ fieldKey: "mode", equals: "template" });
  });

  it("does not mutate the input fields", () => {
    const fields = [{ ...base, required: false, requiredWhen: { fieldKey: "mode", equals: "template" } }];

    resolveFieldRequirements(fields, { mode: "template" });

    expect(fields[0].required).toBe(false);
  });

  it("agrees with isFieldRequired field by field, equals and notEquals both", () => {
    const fields = [
      { ...base, fieldKey: "a", required: true },
      { ...base, fieldKey: "b", required: false },
      { ...base, fieldKey: "c", required: false, requiredWhen: { fieldKey: "mode", equals: "template" } },
      { ...base, fieldKey: "d", required: false, requiredWhen: { fieldKey: "mode", equals: "other" } },
      { ...base, fieldKey: "e", required: false, requiredWhen: { fieldKey: "mode", notEquals: "cartridge" } },
      { ...base, fieldKey: "f", required: false, requiredWhen: { fieldKey: "mode", notEquals: "template" } },
    ];
    const values = { mode: "template" };

    const resolved = resolveFieldRequirements(fields, values);

    expect(resolved.map((f) => f.required)).toEqual(fields.map((f) => isFieldRequired(f, values)));
    expect(resolved.map((f) => f.required)).toEqual([true, false, true, false, true, false]);
  });

  it("carries a notEquals requiredWhen through untouched, same as it does for equals", () => {
    const fields = [
      { ...base, required: false, requiredWhen: { fieldKey: "draftFrom", notEquals: "cartridge" }, help: "h" },
    ];

    const resolved = resolveFieldRequirements(fields, { draftFrom: "" });

    expect(resolved[0].required).toBe(true);
    expect(resolved[0].requiredWhen).toEqual({ fieldKey: "draftFrom", notEquals: "cartridge" });
  });
});
