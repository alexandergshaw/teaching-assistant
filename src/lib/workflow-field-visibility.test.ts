import { describe, it, expect } from "vitest";
import { isFieldVisible } from "./workflow-field-visibility";

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
