import { describe, it, expect } from "vitest";
import {
  coerceGradesDueDate,
  coerceGradesDueTime,
  coerceGradesDue,
  describeGradesDue,
} from "./grades-due";

describe("coerceGradesDueDate", () => {
  it("accepts a valid YYYY-MM-DD date", () => {
    expect(coerceGradesDueDate("2026-12-15")).toBe("2026-12-15");
  });

  it("returns null for missing input", () => {
    expect(coerceGradesDueDate(null)).toBeNull();
    expect(coerceGradesDueDate(undefined)).toBeNull();
    expect(coerceGradesDueDate("")).toBeNull();
  });

  it("returns null for a non-string", () => {
    expect(coerceGradesDueDate(20261215)).toBeNull();
    expect(coerceGradesDueDate({ date: "2026-12-15" })).toBeNull();
  });

  it("returns null for a malformed string", () => {
    expect(coerceGradesDueDate("not-a-date")).toBeNull();
    expect(coerceGradesDueDate("12/15/2026")).toBeNull();
    expect(coerceGradesDueDate("2026-12-15T00:00:00")).toBeNull();
  });

  it("returns null for an out-of-range calendar date", () => {
    expect(coerceGradesDueDate("2026-02-30")).toBeNull();
    expect(coerceGradesDueDate("2026-13-01")).toBeNull();
    expect(coerceGradesDueDate("2026-00-10")).toBeNull();
  });

  it("accepts a leap-day date only in a leap year", () => {
    expect(coerceGradesDueDate("2024-02-29")).toBe("2024-02-29");
    expect(coerceGradesDueDate("2026-02-29")).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(coerceGradesDueDate("  2026-12-15  ")).toBe("2026-12-15");
  });
});

describe("coerceGradesDueTime", () => {
  it("accepts and zero-pads a valid time", () => {
    expect(coerceGradesDueTime("9:05")).toBe("09:05");
    expect(coerceGradesDueTime("23:59")).toBe("23:59");
    expect(coerceGradesDueTime("00:00")).toBe("00:00");
  });

  it("returns null for missing input", () => {
    expect(coerceGradesDueTime(null)).toBeNull();
    expect(coerceGradesDueTime(undefined)).toBeNull();
    expect(coerceGradesDueTime("")).toBeNull();
  });

  it("returns null for an out-of-range time", () => {
    expect(coerceGradesDueTime("24:00")).toBeNull();
    expect(coerceGradesDueTime("12:60")).toBeNull();
  });

  it("returns null for a malformed string", () => {
    expect(coerceGradesDueTime("noon")).toBeNull();
    expect(coerceGradesDueTime("12")).toBeNull();
  });
});

describe("coerceGradesDue (combined defensive read)", () => {
  it("returns both null when both inputs are missing", () => {
    expect(coerceGradesDue(null, null)).toEqual({ date: null, time: null });
    expect(coerceGradesDue(undefined, undefined)).toEqual({ date: null, time: null });
  });

  it("returns both null when the date is malformed, regardless of the time", () => {
    expect(coerceGradesDue("not-a-date", "09:00")).toEqual({ date: null, time: null });
    expect(coerceGradesDue("2026-02-30", "09:00")).toEqual({ date: null, time: null });
  });

  it("returns the valid date and time when both are valid", () => {
    expect(coerceGradesDue("2026-12-15", "17:00")).toEqual({ date: "2026-12-15", time: "17:00" });
  });

  it("returns a date-without-time as date set, time null", () => {
    expect(coerceGradesDue("2026-12-15", null)).toEqual({ date: "2026-12-15", time: null });
    expect(coerceGradesDue("2026-12-15", "")).toEqual({ date: "2026-12-15", time: null });
  });

  it("drops a malformed time even when the date is valid (degrades to empty, not a crash)", () => {
    expect(coerceGradesDue("2026-12-15", "garbage")).toEqual({ date: "2026-12-15", time: null });
  });

  it("never surfaces a time with no date - a time with no date is meaningless", () => {
    expect(coerceGradesDue(null, "17:00")).toEqual({ date: null, time: null });
    expect(coerceGradesDue("", "17:00")).toEqual({ date: null, time: null });
  });
});

describe("describeGradesDue", () => {
  it("formats a date-only value", () => {
    expect(describeGradesDue("2026-12-15", null)).toBe("Dec 15, 2026");
  });

  it("formats a date with a time", () => {
    expect(describeGradesDue("2026-12-15", "17:00")).toBe("Dec 15, 2026 at 5:00 PM");
  });

  it("formats midnight and noon correctly (12-hour boundary)", () => {
    expect(describeGradesDue("2026-12-15", "00:00")).toBe("Dec 15, 2026 at 12:00 AM");
    expect(describeGradesDue("2026-12-15", "12:00")).toBe("Dec 15, 2026 at 12:00 PM");
  });

  it("returns empty for a missing or malformed date", () => {
    expect(describeGradesDue(null, null)).toBe("");
    expect(describeGradesDue(undefined, undefined)).toBe("");
    expect(describeGradesDue("garbage", "17:00")).toBe("");
  });

  it("ignores a malformed time, still describing the date", () => {
    expect(describeGradesDue("2026-12-15", "garbage")).toBe("Dec 15, 2026");
  });
});
