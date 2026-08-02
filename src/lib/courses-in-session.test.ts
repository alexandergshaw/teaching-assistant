import { describe, it, expect } from "vitest";
import { coursesInSession, type CourseSessionCandidate } from "./courses-in-session";

// Fixed reference dates only - never `new Date()` with no argument, here or
// inside the module under test.
const TODAY = new Date(2026, 7, 2); // 2026-08-02 (local time, matches "today" in the AC)

function course(overrides: Partial<CourseSessionCandidate> & { id: string }): CourseSessionCandidate {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    startDate: overrides.startDate ?? null,
    endDate: overrides.endDate ?? null,
    breaks: overrides.breaks ?? null,
  };
}

describe("coursesInSession", () => {
  it("includes a course whose start/end window straddles today", () => {
    const c = course({ id: "a", startDate: "2026-07-01", endDate: "2026-09-01" });
    expect(coursesInSession([c], TODAY)).toEqual([c]);
  });

  it("excludes a course that has not started yet", () => {
    const c = course({ id: "a", startDate: "2026-08-03", endDate: "2026-09-01" });
    expect(coursesInSession([c], TODAY)).toEqual([]);
  });

  it("excludes a course that has already ended", () => {
    const c = course({ id: "a", startDate: "2026-06-01", endDate: "2026-08-01" });
    expect(coursesInSession([c], TODAY)).toEqual([]);
  });

  it("includes a course starting exactly today (inclusive lower boundary)", () => {
    const c = course({ id: "a", startDate: "2026-08-02", endDate: "2026-09-01" });
    expect(coursesInSession([c], TODAY)).toEqual([c]);
  });

  it("includes a course ending exactly today (inclusive upper boundary)", () => {
    const c = course({ id: "a", startDate: "2026-07-01", endDate: "2026-08-02" });
    expect(coursesInSession([c], TODAY)).toEqual([c]);
  });

  it("includes a single-day course where start === end === today", () => {
    const c = course({ id: "a", startDate: "2026-08-02", endDate: "2026-08-02" });
    expect(coursesInSession([c], TODAY)).toEqual([c]);
  });

  it("excludes a course with a missing start date, even with an end date in range", () => {
    const c = course({ id: "a", startDate: null, endDate: "2026-09-01" });
    expect(coursesInSession([c], TODAY)).toEqual([]);
  });

  it("treats a missing end date as open-ended: in session once started", () => {
    const c = course({ id: "a", startDate: "2026-07-01", endDate: null });
    expect(coursesInSession([c], TODAY)).toEqual([c]);
  });

  it("excludes a course with a missing end date that has not started yet", () => {
    const c = course({ id: "a", startDate: "2026-08-03", endDate: null });
    expect(coursesInSession([c], TODAY)).toEqual([]);
  });

  it("excludes a course with both start and end dates missing", () => {
    const c = course({ id: "a", startDate: null, endDate: null });
    expect(coursesInSession([c], TODAY)).toEqual([]);
  });

  it("excludes a course whose start/end window covers today but today falls in a structured break", () => {
    const c = course({
      id: "a",
      startDate: "2026-07-01",
      endDate: "2026-09-01",
      breaks: "2026-08-01..2026-08-05 | Late-summer break",
    });
    expect(coursesInSession([c], TODAY)).toEqual([]);
  });

  it("includes a course whose structured break does not cover today", () => {
    const c = course({
      id: "a",
      startDate: "2026-07-01",
      endDate: "2026-09-01",
      breaks: "2026-11-27..2026-11-29 | Thanksgiving",
    });
    expect(coursesInSession([c], TODAY)).toEqual([c]);
  });

  it("ignores unstructured/free-text breaks (cannot reliably tell if today is covered)", () => {
    const c = course({
      id: "a",
      startDate: "2026-07-01",
      endDate: "2026-09-01",
      breaks: "Week 8 - Summer Break",
    });
    expect(coursesInSession([c], TODAY)).toEqual([c]);
  });

  it("filters a mixed list down to only the qualifying courses, preserving order", () => {
    const inSession = course({ id: "a", name: "In Session", startDate: "2026-07-01", endDate: "2026-09-01" });
    const notStarted = course({ id: "b", name: "Not Started", startDate: "2026-09-01", endDate: "2026-12-01" });
    const ended = course({ id: "c", name: "Ended", startDate: "2026-01-01", endDate: "2026-05-01" });
    const missingStart = course({ id: "d", name: "No Start", startDate: null, endDate: "2026-12-01" });
    const openEnded = course({ id: "e", name: "Open Ended", startDate: "2026-06-01", endDate: null });
    const onBreak = course({
      id: "f",
      name: "On Break",
      startDate: "2026-06-01",
      endDate: "2026-12-01",
      breaks: "2026-08-01..2026-08-05",
    });

    const result = coursesInSession(
      [inSession, notStarted, ended, missingStart, openEnded, onBreak],
      TODAY
    );

    expect(result.map((c) => c.id)).toEqual(["a", "e"]);
  });

  it("returns [] for an empty course list", () => {
    expect(coursesInSession([], TODAY)).toEqual([]);
  });
});
