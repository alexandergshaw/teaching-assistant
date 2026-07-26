import { describe, it, expect } from "vitest";
import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  parseAssignmentDueRule,
  formatAssignmentDueRule,
  describeAssignmentDueRule,
  dueDateForWeek,
  type AssignmentDueRule,
} from "./assignment-due-rule";
import { weekDeadline } from "./workflows/registry-helpers";

// Seven consecutive calendar days (Jan 4-10, 2026), guaranteed to contain
// every weekday exactly once - avoids hardcoding which calendar date falls
// on which weekday.
function oneOfEachWeekday(): Date[] {
  const dates: Date[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    dates.push(new Date(2026, 0, 4 + offset, 0, 0, 0, 0));
  }
  return dates;
}

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

// The historical weekDeadline, inlined deliberately so this test pins
// real past behavior rather than whatever weekDeadline currently
// delegates to. Do NOT refactor this to call production code (dueDateForWeek
// or weekDeadline) - doing so would make the test below compare a value
// against itself and silently stop proving anything.
function historicalWeekDeadline(start: Date, week: number): Date {
  const monday0 = new Date(start);
  const day = monday0.getDay();
  monday0.setDate(monday0.getDate() + (day === 0 ? -6 : 1 - day));
  const due = new Date(monday0);
  due.setDate(monday0.getDate() + week * 7 - 1);
  due.setHours(23, 59, 0, 0);
  return due;
}

describe("dueDateForWeek", () => {
  it("matches historicalWeekDeadline (the pre-delegation implementation, inlined above) for both dueDateForWeek with the sun|23:59 rule AND weekDeadline called with NO third argument, for every week 1-20 and a start on each of the seven weekdays (the backward-compatibility proof that weekDeadline's default delegation reproduces the historical hardcoded behavior)", () => {
    const rule: AssignmentDueRule = { day: "sun", time: "23:59" };
    for (const start of oneOfEachWeekday()) {
      for (let week = 1; week <= 20; week += 1) {
        const oracle = historicalWeekDeadline(start, week);
        expect(dueDateForWeek(start, week, rule)).toEqual(oracle);
        expect(weekDeadline(start, week)).toEqual(oracle);
      }
    }
  });

  it("lands a non-Sunday rule on the correct calendar date, within the same week as the Monday start", () => {
    const monday = new Date(2026, 0, 4, 0, 0, 0, 0);
    while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1);

    const due = dueDateForWeek(monday, 1, { day: "wed", time: "09:00" });
    expect(due.getDay()).toBe(3); // Wednesday
    expect(due.getFullYear()).toBe(monday.getFullYear());
    expect(due.getMonth()).toBe(monday.getMonth());
    expect(due.getDate() - monday.getDate()).toBe(2); // two days after the Monday, same week
    expect(due.getHours()).toBe(9);
    expect(due.getMinutes()).toBe(0);
    expect(due.getSeconds()).toBe(0);
    expect(due.getMilliseconds()).toBe(0);
  });

  it("keeps 'mon|09:00' in week 1 on or after the term's Monday (monday0), for a start on any weekday", () => {
    for (const start of oneOfEachWeekday()) {
      const monday0 = new Date(start);
      const day = monday0.getDay();
      monday0.setDate(monday0.getDate() + (day === 0 ? -6 : 1 - day));
      monday0.setHours(0, 0, 0, 0);

      const due = dueDateForWeek(start, 1, { day: "mon", time: "09:00" });
      expect(due.getTime()).toBeGreaterThanOrEqual(monday0.getTime());
      expect(due.getFullYear()).toBe(monday0.getFullYear());
      expect(due.getMonth()).toBe(monday0.getMonth());
      expect(due.getDate()).toBe(monday0.getDate());
    }
  });

  it("applies the rule's time in local time (matching weekDeadline's setHours), seconds/ms zeroed", () => {
    const start = new Date(2026, 0, 4, 0, 0, 0, 0);
    const due = dueDateForWeek(start, 3, { day: "fri", time: "14:37" });
    expect(due.getHours()).toBe(14);
    expect(due.getMinutes()).toBe(37);
    expect(due.getSeconds()).toBe(0);
    expect(due.getMilliseconds()).toBe(0);
  });

  it("clamps week 0 and negative weeks to week 1 (there is no deadline before the term starts)", () => {
    const start = new Date(2026, 0, 4, 0, 0, 0, 0);
    const rule: AssignmentDueRule = { day: "sun", time: "23:59" };
    const week1 = dueDateForWeek(start, 1, rule);
    expect(dueDateForWeek(start, 0, rule)).toEqual(week1);
    expect(dueDateForWeek(start, -1, rule)).toEqual(week1);
    expect(dueDateForWeek(start, -20, rule)).toEqual(week1);
  });

  it("does not mutate the start Date passed in", () => {
    const start = new Date(2026, 0, 4, 0, 0, 0, 0);
    const before = start.getTime();
    dueDateForWeek(start, 5, { day: "sun", time: "23:59" });
    expect(start.getTime()).toBe(before);
  });
});

// weekDeadline (src/lib/workflows/registry-helpers.ts) delegates to
// dueDateForWeek above rather than re-implementing the arithmetic - these
// tests exercise weekDeadline's own signature (the optional third argument),
// not the arithmetic itself (already covered above and in describe("dueDateForWeek")).
describe("weekDeadline", () => {
  it("applies a custom rule: { day: 'wed', time: '17:30' } lands on the Wednesday of week n at 17:30, matching dueDateForWeek given the same rule", () => {
    const monday = new Date(2026, 0, 4, 0, 0, 0, 0);
    while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1);

    const rule: AssignmentDueRule = { day: "wed", time: "17:30" };
    const due = weekDeadline(monday, 2, rule);
    expect(due.getDay()).toBe(3); // Wednesday
    expect(due.getHours()).toBe(17);
    expect(due.getMinutes()).toBe(30);
    expect(due).toEqual(dueDateForWeek(monday, 2, rule));
  });

  it("passing null explicitly behaves exactly like omitting the rule, for weeks 1-20", () => {
    const start = new Date(2026, 0, 4, 0, 0, 0, 0);
    for (let week = 1; week <= 20; week += 1) {
      expect(weekDeadline(start, week, null)).toEqual(weekDeadline(start, week));
    }
  });
});
