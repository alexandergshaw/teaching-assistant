import { describe, it, expect } from "vitest";
import { scaffoldCourseSchedule } from "./schedule";

describe("scaffoldCourseSchedule", () => {
  it("produces one row per week with computed Monday-Friday date ranges", () => {
    const rows = scaffoldCourseSchedule("Loops, functions, recursion, arrays", "2026-08-24", 4, 0);
    expect(rows).toHaveLength(4);
    expect(rows[0].week).toBe(1);
    expect(rows[0].dates).toBe("Aug 24 - Aug 28");
    expect(rows[1].dates).toBe("Aug 31 - Sep 4");
  });

  it("places each test on its own week preceded by a review week", () => {
    const rows = scaffoldCourseSchedule("a\nb\nc\nd\ne\nf", "2026-01-05", 6, 1);
    const testRow = rows.find((r) => r.assignment === "Test");
    expect(testRow).toBeDefined();
    expect(testRow!.week).toBe(6);
    expect(rows.find((r) => r.week === 5)!.topics).toBe("Review");
  });

  it("numbers multiple tests", () => {
    const rows = scaffoldCourseSchedule("topic list", "2026-01-05", 10, 2);
    const tests = rows.filter((r) => r.assignment === "Test");
    expect(tests).toHaveLength(2);
    expect(tests.map((t) => t.topics)).toEqual(["Test 1", "Test 2"]);
  });

  it("still returns rows when the start date is unparseable", () => {
    const rows = scaffoldCourseSchedule("x", "not a date", 3, 0);
    expect(rows).toHaveLength(3);
    expect(rows[0].dates).toBe("");
  });
});
