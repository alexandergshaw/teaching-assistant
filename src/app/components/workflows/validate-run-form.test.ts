import { describe, it, expect } from "vitest";
import { validateRunForm } from "./validate-run-form";
import type { RuntimeField } from "@/lib/workflows/types";

function field(overrides: Partial<RuntimeField> & { fieldKey: string; label: string }): RuntimeField {
  return {
    type: "text",
    required: true,
    ...overrides,
  } as RuntimeField;
}

describe("validateRunForm", () => {
  it("returns null when there are no runtime fields", () => {
    expect(validateRunForm([], {}, {})).toBeNull();
  });

  it("skips fields that are not required, even when empty", () => {
    const fields = [field({ fieldKey: "notes", label: "Notes", type: "text", required: false })];
    expect(validateRunForm(fields, {}, {})).toBeNull();
  });

  it("skips required fields whose type is not in the validated allowlist", () => {
    // "boolean" and "schedule" are valid WorkflowValueTypes but are not
    // checked by the run form - a required field of one of these types must
    // never block Run, no matter how empty its value is.
    const fields = [
      field({ fieldKey: "flag", label: "Flag", type: "boolean", required: true }),
      field({ fieldKey: "sched", label: "Schedule", type: "schedule", required: true }),
    ];
    expect(validateRunForm(fields, {}, {})).toBeNull();
  });

  it("reports a missing required text value", () => {
    const fields = [field({ fieldKey: "title", label: "Title", type: "text", required: true })];
    expect(validateRunForm(fields, { title: "" }, {})).toBe("Title is required.");
  });

  it("treats a whitespace-only value as missing", () => {
    const fields = [field({ fieldKey: "title", label: "Title", type: "text", required: true })];
    expect(validateRunForm(fields, { title: "   " }, {})).toBe("Title is required.");
  });

  it("passes when a required text value is present", () => {
    const fields = [field({ fieldKey: "title", label: "Title", type: "text", required: true })];
    expect(validateRunForm(fields, { title: "Intro to Biology" }, {})).toBeNull();
  });

  it("reports a required uploads field with no files", () => {
    const fields = [field({ fieldKey: "roster", label: "Roster", type: "uploads", required: true })];
    expect(validateRunForm(fields, {}, {})).toBe("Roster requires at least one file.");
    expect(validateRunForm(fields, {}, { roster: [] })).toBe("Roster requires at least one file.");
  });

  it("passes a required uploads field once at least one file is attached", () => {
    const fields = [field({ fieldKey: "roster", label: "Roster", type: "uploads", required: true })];
    const file = new File(["x"], "roster.csv");
    expect(validateRunForm(fields, {}, { roster: [file] })).toBeNull();
  });

  it("reports a required hubCourseList field with no course ids", () => {
    const fields = [field({ fieldKey: "courses", label: "Courses", type: "hubCourseList", required: true })];
    expect(validateRunForm(fields, {}, {})).toBe("Courses requires at least one course.");
    expect(validateRunForm(fields, { courses: "" }, {})).toBe("Courses requires at least one course.");
  });

  it("treats blank-only lines in a hubCourseList value as no course ids", () => {
    const fields = [field({ fieldKey: "courses", label: "Courses", type: "hubCourseList", required: true })];
    expect(validateRunForm(fields, { courses: "\n  \n\n" }, {})).toBe("Courses requires at least one course.");
  });

  it("passes a required hubCourseList field with at least one course id", () => {
    const fields = [field({ fieldKey: "courses", label: "Courses", type: "hubCourseList", required: true })];
    expect(validateRunForm(fields, { courses: "c1\nc2" }, {})).toBeNull();
  });

  it("reports a required number field with a non-numeric value", () => {
    const fields = [field({ fieldKey: "weight", label: "Weight", type: "number", required: true })];
    expect(validateRunForm(fields, { weight: "abc" }, {})).toBe("Weight must be a valid number.");
  });

  it("passes a required number field with a valid numeric value", () => {
    const fields = [field({ fieldKey: "weight", label: "Weight", type: "number", required: true })];
    expect(validateRunForm(fields, { weight: "12.5" }, {})).toBeNull();
  });

  it("checks fields in order and returns the FIRST failing field's error", () => {
    const fields = [
      field({ fieldKey: "a", label: "Field A", type: "text", required: true }),
      field({ fieldKey: "b", label: "Field B", type: "text", required: true }),
    ];
    // Both are missing - "a" comes first, so its message wins, not "b"'s.
    expect(validateRunForm(fields, { a: "", b: "" }, {})).toBe("Field A is required.");
    // Once "a" is filled, "b" becomes the first failure.
    expect(validateRunForm(fields, { a: "ok", b: "" }, {})).toBe("Field B is required.");
  });

  it("a required field hidden by visibleWhen (its controlling field holds a different value) never blocks submission", () => {
    const fields = [
      field({ fieldKey: "source", label: "Source", type: "text", required: true }),
      field({
        fieldKey: "cartridge",
        label: "Course cartridge",
        type: "uploads",
        required: true,
        visibleWhen: { fieldKey: "source", equals: "course-cartridge" },
      }),
    ];
    // "source" is codebase, so "cartridge" is hidden and must not be asked
    // for even though it is required and has no files attached.
    expect(validateRunForm(fields, { source: "codebase" }, {})).toBeNull();
  });

  it("a required field hidden by visibleWhen because NO controlling value has been chosen yet never blocks submission", () => {
    const fields = [
      field({
        fieldKey: "repo",
        label: "Repository",
        type: "text",
        required: true,
        visibleWhen: { fieldKey: "source", equals: "codebase" },
      }),
    ];
    expect(validateRunForm(fields, {}, {})).toBeNull();
  });

  it("a required field gated by visibleWhen IS validated once its controlling field matches", () => {
    const fields = [
      field({
        fieldKey: "cartridge",
        label: "Course cartridge",
        type: "uploads",
        required: true,
        visibleWhen: { fieldKey: "source", equals: "course-cartridge" },
      }),
    ];
    expect(validateRunForm(fields, { source: "course-cartridge" }, {})).toBe(
      "Course cartridge requires at least one file."
    );
    expect(
      validateRunForm(fields, { source: "course-cartridge" }, { cartridge: [new File(["x"], "c.imscc")] })
    ).toBeNull();
  });

  it("passes a form where every required field is satisfied, ignoring optional and unvalidated ones", () => {
    const fields = [
      field({ fieldKey: "title", label: "Title", type: "text", required: true }),
      field({ fieldKey: "notes", label: "Notes", type: "longtext", required: false }),
      field({ fieldKey: "flag", label: "Flag", type: "boolean", required: true }),
      field({ fieldKey: "roster", label: "Roster", type: "uploads", required: true }),
    ];
    const file = new File(["x"], "roster.csv");
    expect(
      validateRunForm(fields, { title: "Intro to Biology" }, { roster: [file] })
    ).toBeNull();
  });
});
