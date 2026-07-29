import { describe, it, expect } from "vitest";
import { COURSE_LMS_OPTIONS, courseLmsLabel } from "./course-lms-options";

describe("COURSE_LMS_OPTIONS", () => {
  it("includes canvas, blackboard, and brightspace", () => {
    const values = COURSE_LMS_OPTIONS.map((o) => o.value);
    expect(values).toContain("canvas");
    expect(values).toContain("blackboard");
    expect(values).toContain("brightspace");
  });

  it("uses the same brightspace slug CartridgeDropPanel.tsx uses for the export-format picker", () => {
    const brightspace = COURSE_LMS_OPTIONS.find((o) => o.label === "Brightspace");
    expect(brightspace?.value).toBe("brightspace");
  });

  it("does not include Moodle - that is CartridgeDropPanel's export-format concept, not this field's", () => {
    const values = COURSE_LMS_OPTIONS.map((o) => o.value);
    expect(values).not.toContain("moodle");
  });
});

describe("courseLmsLabel", () => {
  it("maps every known value to its label", () => {
    for (const opt of COURSE_LMS_OPTIONS) {
      expect(courseLmsLabel(opt.value)).toBe(opt.label);
    }
  });

  it("falls back to the raw string for an unrecognized value, rather than blanking it", () => {
    expect(courseLmsLabel("some-other-lms")).toBe("some-other-lms");
  });

  it("returns empty for missing/blank input", () => {
    expect(courseLmsLabel(null)).toBe("");
    expect(courseLmsLabel(undefined)).toBe("");
    expect(courseLmsLabel("")).toBe("");
    expect(courseLmsLabel("   ")).toBe("");
  });

  it("trims surrounding whitespace before matching", () => {
    expect(courseLmsLabel("  canvas  ")).toBe("Canvas");
  });

  it("is case-sensitive - a differently-cased stored value falls back to itself unchanged", () => {
    expect(courseLmsLabel("Canvas")).toBe("Canvas");
    expect(courseLmsLabel("CANVAS")).toBe("CANVAS");
  });
});
