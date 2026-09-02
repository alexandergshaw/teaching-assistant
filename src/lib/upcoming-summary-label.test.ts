import { describe, it, expect } from "vitest";
import { summarizeUpcoming } from "./upcoming-summary-label";
import type { UpcomingCourseDate } from "./course-upcoming-dates";

const NOW = new Date(2026, 2, 10, 9, 30, 0); // 2026-03-10, a Tuesday

function entry(overrides: Partial<UpcomingCourseDate> = {}): UpcomingCourseDate {
  return {
    courseId: "c1",
    courseName: "Course One",
    kind: "grades-due",
    label: "Grades due",
    date: "2026-03-10",
    time: "17:00",
    ...overrides,
  };
}

describe("summarizeUpcoming", () => {
  it("returns null for an empty list", () => {
    expect(summarizeUpcoming([], NOW)).toBeNull();
  });

  it("summarizes a single entry with a zero more-count", () => {
    const out = summarizeUpcoming([entry()], NOW);
    expect(out).not.toBeNull();
    expect(out!.label).toBe("Grades due");
    expect(out!.dateText).toContain("Today");
    expect(out!.dateText).toContain("5:00 PM");
    expect(out!.moreCount).toBe(0);
  });

  it("takes the FIRST entry as soonest - it does not re-sort", () => {
    const soonest = entry({ courseId: "soonest", label: "Class starts", date: "2026-03-11", time: null });
    const later = entry({ courseId: "later", label: "Class ends", date: "2026-03-20", time: null });
    const out = summarizeUpcoming([soonest, later], NOW);
    expect(out!.label).toBe("Class starts");
  });

  it("counts every entry beyond the first as 'more'", () => {
    const out = summarizeUpcoming([entry(), entry(), entry(), entry()], NOW);
    expect(out!.moreCount).toBe(3);
  });
});
