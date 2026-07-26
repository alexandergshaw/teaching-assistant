import { describe, it, expect } from "vitest";
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  parseAssignmentDueRule,
  formatAssignmentDueRule,
  describeAssignmentDueRule,
} from "./assignment-due-rule";

describe("WEEKDAYS / WEEKDAY_LABELS", () => {
  it("has all seven weekdays with their full labels", () => {
    expect(WEEKDAYS).toEqual(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
    expect(WEEKDAY_LABELS).toEqual({
      sun: "Sunday",
      mon: "Monday",
      tue: "Tuesday",
      wed: "Wednesday",
      thu: "Thursday",
      fri: "Friday",
      sat: "Saturday",
    });
  });
});

describe("parseAssignmentDueRule", () => {
  it("parses a well-formed rule", () => {
    expect(parseAssignmentDueRule("sun|23:59")).toEqual({ day: "sun", time: "23:59" });
    expect(parseAssignmentDueRule("wed|09:00")).toEqual({ day: "wed", time: "09:00" });
  });

  it("rejects blank/nullish input", () => {
    expect(parseAssignmentDueRule("")).toBeNull();
    expect(parseAssignmentDueRule("   ")).toBeNull();
    expect(parseAssignmentDueRule(null)).toBeNull();
    expect(parseAssignmentDueRule(undefined)).toBeNull();
  });

  it("rejects a missing separator", () => {
    expect(parseAssignmentDueRule("sun2359")).toBeNull();
    expect(parseAssignmentDueRule("sun 23:59")).toBeNull();
  });

  it("rejects a day outside the union, case-insensitively accepting a valid one", () => {
    expect(parseAssignmentDueRule("funday|23:59")).toBeNull();
    expect(parseAssignmentDueRule("sunday|23:59")).toBeNull();
    expect(parseAssignmentDueRule("SUN|23:59")).toEqual({ day: "sun", time: "23:59" });
    expect(parseAssignmentDueRule("Sun|23:59")).toEqual({ day: "sun", time: "23:59" });
  });

  it("rejects a time that is not HH:MM", () => {
    expect(parseAssignmentDueRule("sun|")).toBeNull();
    expect(parseAssignmentDueRule("sun|11:5")).toBeNull(); // single-digit minute not accepted
    expect(parseAssignmentDueRule("sun|1159")).toBeNull(); // no colon
    expect(parseAssignmentDueRule("sun|11:59:00")).toBeNull(); // seconds not accepted
    expect(parseAssignmentDueRule("sun|abc")).toBeNull();
  });

  it("rejects hours > 23", () => {
    expect(parseAssignmentDueRule("sun|24:00")).toBeNull();
    expect(parseAssignmentDueRule("sun|99:00")).toBeNull();
  });

  it("rejects minutes > 59", () => {
    expect(parseAssignmentDueRule("sun|10:60")).toBeNull();
    expect(parseAssignmentDueRule("sun|10:99")).toBeNull();
  });

  it("accepts a single-digit hour, normalizing it to two digits", () => {
    expect(parseAssignmentDueRule("sun|9:05")).toEqual({ day: "sun", time: "09:05" });
    expect(parseAssignmentDueRule("mon|0:00")).toEqual({ day: "mon", time: "00:00" });
  });

  it("never throws on malformed input", () => {
    expect(() => parseAssignmentDueRule("|||")).not.toThrow();
    expect(() => parseAssignmentDueRule("garbage")).not.toThrow();
    expect(parseAssignmentDueRule("|||")).toBeNull();
    expect(parseAssignmentDueRule("garbage")).toBeNull();
  });
});

describe("formatAssignmentDueRule", () => {
  it("encodes a valid day + time", () => {
    expect(formatAssignmentDueRule("sun", "23:59")).toBe("sun|23:59");
    expect(formatAssignmentDueRule("wed", "9:05")).toBe("wed|09:05");
  });

  it("returns '' for an invalid time", () => {
    expect(formatAssignmentDueRule("sun", "25:00")).toBe("");
    expect(formatAssignmentDueRule("sun", "10:60")).toBe("");
    expect(formatAssignmentDueRule("sun", "not-a-time")).toBe("");
  });

  it("returns '' for an invalid day", () => {
    expect(formatAssignmentDueRule("someday" as unknown as "sun", "23:59")).toBe("");
  });

  it("round-trips through parseAssignmentDueRule for every weekday", () => {
    for (const day of WEEKDAYS) {
      const encoded = formatAssignmentDueRule(day, "14:30");
      expect(parseAssignmentDueRule(encoded)).toEqual({ day, time: "14:30" });
    }
  });

  it("round-trips a single-digit hour through the normalized form", () => {
    const encoded = formatAssignmentDueRule("fri", "9:05");
    expect(encoded).toBe("fri|09:05");
    expect(parseAssignmentDueRule(encoded)).toEqual({ day: "fri", time: "09:05" });
  });
});

describe("describeAssignmentDueRule", () => {
  it("renders 12-hour time with AM/PM and no leading zero on the hour", () => {
    expect(describeAssignmentDueRule("sun|23:59")).toBe("Sundays at 11:59 PM");
    expect(describeAssignmentDueRule("mon|09:05")).toBe("Mondays at 9:05 AM");
  });

  it("renders noon as 12:00 PM", () => {
    expect(describeAssignmentDueRule("wed|12:00")).toBe("Wednesdays at 12:00 PM");
  });

  it("renders midnight as 12:00 AM", () => {
    expect(describeAssignmentDueRule("thu|00:00")).toBe("Thursdays at 12:00 AM");
  });

  it("pluralizes every weekday label", () => {
    expect(describeAssignmentDueRule("sun|10:00")).toContain("Sundays");
    expect(describeAssignmentDueRule("mon|10:00")).toContain("Mondays");
    expect(describeAssignmentDueRule("tue|10:00")).toContain("Tuesdays");
    expect(describeAssignmentDueRule("wed|10:00")).toContain("Wednesdays");
    expect(describeAssignmentDueRule("thu|10:00")).toContain("Thursdays");
    expect(describeAssignmentDueRule("fri|10:00")).toContain("Fridays");
    expect(describeAssignmentDueRule("sat|10:00")).toContain("Saturdays");
  });

  it("returns '' when the rule is absent or invalid", () => {
    expect(describeAssignmentDueRule(null)).toBe("");
    expect(describeAssignmentDueRule(undefined)).toBe("");
    expect(describeAssignmentDueRule("")).toBe("");
    expect(describeAssignmentDueRule("garbage")).toBe("");
    expect(describeAssignmentDueRule("funday|23:59")).toBe("");
  });
});
