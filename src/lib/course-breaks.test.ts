import { describe, it, expect } from "vitest";
import {
  coerceCalendarDate,
  parseCourseBreaks,
  serializeCourseBreaks,
  validateCourseBreaks,
  describeCourseBreaks,
  type CourseBreakRange,
} from "./course-breaks";

describe("coerceCalendarDate", () => {
  it("accepts a valid date and rejects malformed/out-of-range ones", () => {
    expect(coerceCalendarDate("2026-11-27")).toBe("2026-11-27");
    expect(coerceCalendarDate("not-a-date")).toBeNull();
    expect(coerceCalendarDate("2026-02-30")).toBeNull();
    expect(coerceCalendarDate(null)).toBeNull();
    expect(coerceCalendarDate(42)).toBeNull();
  });
});

describe("parseCourseBreaks (lenient, all-or-nothing)", () => {
  it("returns [] for missing/blank input", () => {
    expect(parseCourseBreaks(null)).toEqual([]);
    expect(parseCourseBreaks(undefined)).toEqual([]);
    expect(parseCourseBreaks("")).toEqual([]);
    expect(parseCourseBreaks("   \n  ")).toEqual([]);
  });

  it("parses a single canonical line with no label", () => {
    expect(parseCourseBreaks("2026-11-27..2026-11-29")).toEqual([
      { start: "2026-11-27", end: "2026-11-29", label: "" },
    ]);
  });

  it("parses a single canonical line with a label", () => {
    expect(parseCourseBreaks("2026-11-27..2026-11-29 | Thanksgiving")).toEqual([
      { start: "2026-11-27", end: "2026-11-29", label: "Thanksgiving" },
    ]);
  });

  it("parses multiple canonical lines", () => {
    const raw = "2026-11-27..2026-11-29 | Thanksgiving\n2026-03-09..2026-03-13 | Spring Break";
    expect(parseCourseBreaks(raw)).toEqual([
      { start: "2026-11-27", end: "2026-11-29", label: "Thanksgiving" },
      { start: "2026-03-09", end: "2026-03-13", label: "Spring Break" },
    ]);
  });

  it("parses a single-day break (start === end)", () => {
    expect(parseCourseBreaks("2026-12-25..2026-12-25 | Winter holiday")).toEqual([
      { start: "2026-12-25", end: "2026-12-25", label: "Winter holiday" },
    ]);
  });

  it("ignores blank lines between entries", () => {
    const raw = "2026-11-27..2026-11-29\n\n2026-03-09..2026-03-13";
    expect(parseCourseBreaks(raw)?.length).toBe(2);
  });

  it("falls back to null (unstructured) for legacy free text", () => {
    expect(parseCourseBreaks("Week 8 - Spring Break")).toBeNull();
    expect(parseCourseBreaks("Nov 27-29 - Thanksgiving")).toBeNull();
  });

  it("falls back to null when only ONE of several lines is malformed (all-or-nothing)", () => {
    const raw = "2026-11-27..2026-11-29 | Thanksgiving\nWeek 8 - Spring Break";
    expect(parseCourseBreaks(raw)).toBeNull();
  });

  it("falls back to null for a line with an inverted range (end before start)", () => {
    expect(parseCourseBreaks("2026-11-29..2026-11-27")).toBeNull();
  });

  it("falls back to null for a line with a malformed date", () => {
    expect(parseCourseBreaks("2026-02-30..2026-03-01")).toBeNull();
    expect(parseCourseBreaks("not-a-date..2026-03-01")).toBeNull();
  });

  it("trims whitespace around the label", () => {
    expect(parseCourseBreaks("2026-11-27..2026-11-29 |   Thanksgiving  ")).toEqual([
      { start: "2026-11-27", end: "2026-11-29", label: "Thanksgiving" },
    ]);
  });
});

describe("serializeCourseBreaks", () => {
  it("serializes [] to an empty string", () => {
    expect(serializeCourseBreaks([])).toBe("");
  });

  it("serializes a range without a label", () => {
    const ranges: CourseBreakRange[] = [{ start: "2026-11-27", end: "2026-11-29", label: "" }];
    expect(serializeCourseBreaks(ranges)).toBe("2026-11-27..2026-11-29");
  });

  it("serializes a range with a label", () => {
    const ranges: CourseBreakRange[] = [{ start: "2026-11-27", end: "2026-11-29", label: "Thanksgiving" }];
    expect(serializeCourseBreaks(ranges)).toBe("2026-11-27..2026-11-29 | Thanksgiving");
  });

  it("joins multiple ranges with newlines", () => {
    const ranges: CourseBreakRange[] = [
      { start: "2026-11-27", end: "2026-11-29", label: "Thanksgiving" },
      { start: "2026-03-09", end: "2026-03-13", label: "" },
    ];
    expect(serializeCourseBreaks(ranges)).toBe("2026-11-27..2026-11-29 | Thanksgiving\n2026-03-09..2026-03-13");
  });

  it("round-trips through parseCourseBreaks", () => {
    const ranges: CourseBreakRange[] = [
      { start: "2026-11-27", end: "2026-11-29", label: "Thanksgiving" },
      { start: "2026-12-25", end: "2026-12-25", label: "" },
    ];
    expect(parseCourseBreaks(serializeCourseBreaks(ranges))).toEqual(ranges);
  });
});

describe("validateCourseBreaks", () => {
  it("returns [] for a single valid range with no term dates", () => {
    const ranges: CourseBreakRange[] = [{ start: "2026-11-27", end: "2026-11-29", label: "" }];
    expect(validateCourseBreaks(ranges, null, null)).toEqual([]);
  });

  it("flags end before start", () => {
    const ranges: CourseBreakRange[] = [{ start: "2026-11-29", end: "2026-11-27", label: "" }];
    const issues = validateCourseBreaks(ranges, null, null);
    expect(issues).toEqual([{ index: 1, message: "Break 1 ends before it starts." }]);
  });

  it("allows end === start (single-day break) with no issue - boundary case", () => {
    const ranges: CourseBreakRange[] = [{ start: "2026-12-25", end: "2026-12-25", label: "" }];
    expect(validateCourseBreaks(ranges, null, null)).toEqual([]);
  });

  it("flags a break starting before the term start", () => {
    const ranges: CourseBreakRange[] = [{ start: "2026-08-01", end: "2026-08-03", label: "" }];
    const issues = validateCourseBreaks(ranges, "2026-09-01", "2026-12-15");
    expect(issues).toEqual([{ index: 1, message: "Break 1 falls outside the term." }]);
  });

  it("flags a break ending after the term end", () => {
    const ranges: CourseBreakRange[] = [{ start: "2026-12-10", end: "2026-12-20", label: "" }];
    const issues = validateCourseBreaks(ranges, "2026-09-01", "2026-12-15");
    expect(issues).toEqual([{ index: 1, message: "Break 1 falls outside the term." }]);
  });

  it("allows a break exactly on the term boundary - boundary case", () => {
    const ranges: CourseBreakRange[] = [{ start: "2026-09-01", end: "2026-12-15", label: "" }];
    expect(validateCourseBreaks(ranges, "2026-09-01", "2026-12-15")).toEqual([]);
  });

  it("skips the term-boundary check entirely when term dates are not both set", () => {
    const ranges: CourseBreakRange[] = [{ start: "2020-01-01", end: "2020-01-05", label: "" }];
    expect(validateCourseBreaks(ranges, null, null)).toEqual([]);
    expect(validateCourseBreaks(ranges, "2026-09-01", null)).toEqual([]);
    expect(validateCourseBreaks(ranges, null, "2026-12-15")).toEqual([]);
  });

  it("flags overlapping breaks", () => {
    const ranges: CourseBreakRange[] = [
      { start: "2026-11-01", end: "2026-11-10", label: "" },
      { start: "2026-11-05", end: "2026-11-15", label: "" },
    ];
    const issues = validateCourseBreaks(ranges, null, null);
    expect(issues).toEqual([{ index: 2, message: "Break 2 overlaps break 1." }]);
  });

  it("treats breaks touching at a shared boundary day as overlapping", () => {
    const ranges: CourseBreakRange[] = [
      { start: "2026-11-01", end: "2026-11-10", label: "" },
      { start: "2026-11-10", end: "2026-11-15", label: "" },
    ];
    const issues = validateCourseBreaks(ranges, null, null);
    expect(issues).toEqual([{ index: 2, message: "Break 2 overlaps break 1." }]);
  });

  it("does not flag adjacent (non-touching) breaks as overlapping", () => {
    const ranges: CourseBreakRange[] = [
      { start: "2026-11-01", end: "2026-11-10", label: "" },
      { start: "2026-11-11", end: "2026-11-15", label: "" },
    ];
    expect(validateCourseBreaks(ranges, null, null)).toEqual([]);
  });

  it("reports every applicable issue across multiple breaks", () => {
    const ranges: CourseBreakRange[] = [
      { start: "2026-11-29", end: "2026-11-27", label: "" }, // inverted
      { start: "2026-08-01", end: "2026-08-03", label: "" }, // outside term
    ];
    const issues = validateCourseBreaks(ranges, "2026-09-01", "2026-12-15");
    expect(issues).toEqual([
      { index: 1, message: "Break 1 ends before it starts." },
      { index: 2, message: "Break 2 falls outside the term." },
    ]);
  });

  it("does not re-flag term/overlap checks against an already-inverted range", () => {
    const ranges: CourseBreakRange[] = [
      { start: "2026-11-29", end: "2026-11-27", label: "" }, // inverted
      { start: "2026-11-01", end: "2026-11-05", label: "" },
    ];
    const issues = validateCourseBreaks(ranges, null, null);
    expect(issues).toEqual([{ index: 1, message: "Break 1 ends before it starts." }]);
  });
});

describe("describeCourseBreaks", () => {
  it("returns empty for missing/blank input", () => {
    expect(describeCourseBreaks(null)).toBe("");
    expect(describeCourseBreaks(undefined)).toBe("");
    expect(describeCourseBreaks("")).toBe("");
  });

  it("formats a single-day structured break without a range dash", () => {
    expect(describeCourseBreaks("2026-12-25..2026-12-25 | Winter holiday")).toBe("Dec 25 (Winter holiday)");
  });

  it("formats a multi-day structured break with a range and label", () => {
    expect(describeCourseBreaks("2026-11-27..2026-11-29 | Thanksgiving")).toBe("Nov 27 - Nov 29 (Thanksgiving)");
  });

  it("formats a structured break with no label", () => {
    expect(describeCourseBreaks("2026-11-27..2026-11-29")).toBe("Nov 27 - Nov 29");
  });

  it("joins multiple structured breaks with a semicolon", () => {
    const raw = "2026-11-27..2026-11-29 | Thanksgiving\n2026-03-09..2026-03-13 | Spring Break";
    expect(describeCourseBreaks(raw)).toBe("Nov 27 - Nov 29 (Thanksgiving); Mar 9 - Mar 13 (Spring Break)");
  });

  it("falls back to the raw text unchanged for legacy free text (never blanked)", () => {
    expect(describeCourseBreaks("Week 8 - Spring Break")).toBe("Week 8 - Spring Break");
  });
});
