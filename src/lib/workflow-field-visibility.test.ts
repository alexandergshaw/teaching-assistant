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

  it("is REQUIREDNESS-affirmative: an obligation is only ever ADDED by a real choice", () => {
    // requiredWhen is deliberately equals-only. The visibility gate's other arm
    // (contains) treats a blank controller as "every entry" - which is right
    // for SHOWING a field and inverted for REQUIRING one: an untouched form
    // would become mandatory before the instructor has chosen anything. See
    // the acceptance criteria's AC2 for why that arm is not offered here.
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

  it("agrees with isFieldRequired field by field", () => {
    const fields = [
      { ...base, fieldKey: "a", required: true },
      { ...base, fieldKey: "b", required: false },
      { ...base, fieldKey: "c", required: false, requiredWhen: { fieldKey: "mode", equals: "template" } },
      { ...base, fieldKey: "d", required: false, requiredWhen: { fieldKey: "mode", equals: "other" } },
    ];
    const values = { mode: "template" };

    const resolved = resolveFieldRequirements(fields, values);

    expect(resolved.map((f) => f.required)).toEqual(fields.map((f) => isFieldRequired(f, values)));
    expect(resolved.map((f) => f.required)).toEqual([true, false, true, false]);
  });
});
