import { describe, it, expect } from "vitest";
import { buildRubricSourceFromSchedule } from "./rubric";
import type { ScheduleWeekPlan } from "@/app/actions";

describe("buildRubricSourceFromSchedule", () => {
  it("returns empty string when description and schedule are both empty", () => {
    const result = buildRubricSourceFromSchedule("", []);
    expect(result).toBe("");
  });

  it("includes course description when provided", () => {
    const description = "This is an introductory course on web development.";
    const result = buildRubricSourceFromSchedule(description, []);
    expect(result).toContain("=== Course description ===");
    expect(result).toContain(description);
  });

  it("skips course description when empty", () => {
    const schedule: ScheduleWeekPlan[] = [
      {
        week: 1,
        topic: "Introduction",
        summary: "Learn the basics",
        assignmentTitle: "Assignment 1",
        assignmentSlug: "week-01-intro",
        testName: null,
      },
    ];
    const result = buildRubricSourceFromSchedule("", schedule);
    expect(result).not.toContain("=== Course description ===");
  });

  it("includes weeks with topics from schedule", () => {
    const schedule: ScheduleWeekPlan[] = [
      {
        week: 1,
        topic: "Fundamentals",
        summary: "Core concepts",
        assignmentTitle: "Assignment 1",
        assignmentSlug: "week-01-fundamentals",
        testName: null,
      },
      {
        week: 2,
        topic: "Advanced Topics",
        summary: "Deeper dive",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: "Test 1",
      },
    ];
    const result = buildRubricSourceFromSchedule("", schedule);
    expect(result).toContain("=== Week 01: Fundamentals ===");
    expect(result).toContain("=== Week 02: Advanced Topics ===");
    expect(result).toContain("Core concepts");
    expect(result).toContain("Deeper dive");
  });

  it("skips weeks without topics", () => {
    const schedule: ScheduleWeekPlan[] = [
      {
        week: 1,
        topic: "",
        summary: "Summary for empty topic",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      },
      {
        week: 2,
        topic: "Real Topic",
        summary: "Has content",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      },
    ];
    const result = buildRubricSourceFromSchedule("", schedule);
    expect(result).not.toContain("Week 01");
    expect(result).toContain("Week 02");
  });

  it("includes assignment titles when present", () => {
    const schedule: ScheduleWeekPlan[] = [
      {
        week: 1,
        topic: "Topic",
        summary: "Summary",
        assignmentTitle: "Implement a Todo App",
        assignmentSlug: "week-01-todo",
        testName: null,
      },
    ];
    const result = buildRubricSourceFromSchedule("", schedule);
    expect(result).toContain("Deliverable: Implement a Todo App");
  });

  it("includes test names when present", () => {
    const schedule: ScheduleWeekPlan[] = [
      {
        week: 1,
        topic: "Topic",
        summary: "Summary",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: "Midterm Exam",
      },
    ];
    const result = buildRubricSourceFromSchedule("", schedule);
    expect(result).toContain("Assessment: Midterm Exam");
  });

  it("pads week numbers with zero", () => {
    const schedule: ScheduleWeekPlan[] = [
      {
        week: 1,
        topic: "Week One",
        summary: "",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      },
      {
        week: 10,
        topic: "Week Ten",
        summary: "",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      },
    ];
    const result = buildRubricSourceFromSchedule("", schedule);
    expect(result).toContain("Week 01:");
    expect(result).toContain("Week 10:");
  });

  it("combines description and schedule", () => {
    const description = "Course overview";
    const schedule: ScheduleWeekPlan[] = [
      {
        week: 1,
        topic: "Intro",
        summary: "Getting started",
        assignmentTitle: "HW1",
        assignmentSlug: "hw-01",
        testName: null,
      },
    ];
    const result = buildRubricSourceFromSchedule(description, schedule);
    expect(result).toContain("=== Course description ===");
    expect(result).toContain("Course overview");
    expect(result).toContain("=== Week 01: Intro ===");
    expect(result).toContain("Getting started");
    expect(result).toContain("Deliverable: HW1");
  });

  it("handles whitespace in description and schedule fields", () => {
    const schedule: ScheduleWeekPlan[] = [
      {
        week: 1,
        topic: "  Topic with spaces  ",
        summary: "  Summary text  ",
        assignmentTitle: "  Assignment  ",
        assignmentSlug: "assignment",
        testName: null,
      },
    ];
    const result = buildRubricSourceFromSchedule("  Description  ", schedule);
    expect(result).toContain("Description");
    expect(result).not.toContain("  ");
  });
});
