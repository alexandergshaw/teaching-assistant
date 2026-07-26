import { describe, it, expect } from "vitest";
import { buildCastletopSources } from "./castletop-sources";

describe("buildCastletopSources", () => {
  it("maps topics by week from schedule", () => {
    const result = buildCastletopSources({
      schedule: [
        { week: 1, topic: "Introduction", assignmentTitle: null, testName: null },
        { week: 2, topic: "Basics", assignmentTitle: null, testName: null },
      ],
      weeks: 16,
    });
    expect(result.topicsByWeek.get(1)).toBe("Introduction");
    expect(result.topicsByWeek.get(2)).toBe("Basics");
  });

  it("drops weeks outside range", () => {
    const result = buildCastletopSources({
      schedule: [
        { week: 0, topic: "Before", assignmentTitle: null, testName: null },
        { week: 1, topic: "Valid", assignmentTitle: null, testName: null },
        { week: 17, topic: "After", assignmentTitle: null, testName: null },
      ],
      weeks: 16,
    });
    expect(result.topicsByWeek.size).toBe(1);
    expect(result.topicsByWeek.get(1)).toBe("Valid");
  });

  it("seeds assignments from schedule", () => {
    const result = buildCastletopSources({
      schedule: [
        { week: 1, topic: "Week 1", assignmentTitle: "Assignment 1", testName: null },
        { week: 2, topic: "Week 2", assignmentTitle: null, testName: "Quiz 2" },
      ],
      weeks: 16,
      defaultAssignmentMinutes: 45,
      defaultTestMinutes: 25,
    });
    const week1Items = result.itemsByWeek.get(1);
    expect(week1Items).toHaveLength(1);
    expect(week1Items?.[0]?.assignment).toBe("Assignment 1");
    expect(week1Items?.[0]?.minutes).toBe(45);

    const week2Items = result.itemsByWeek.get(2);
    expect(week2Items).toHaveLength(1);
    expect(week2Items?.[0]?.assignment).toBe("Quiz 2");
    expect(week2Items?.[0]?.minutes).toBe(25);
  });

  it("matches assignment by week number in name", () => {
    const result = buildCastletopSources({
      schedule: [],
      assignments: [
        { name: "Module 5: Assignment", pointsPossible: 10 },
        { name: "Week 10 - Project", pointsPossible: 20 },
        { name: "Unit 3: Test", pointsPossible: 30 },
      ],
      weeks: 16,
    });
    expect(result.itemsByWeek.get(5)?.length).toBe(1);
    expect(result.itemsByWeek.get(5)?.[0]?.assignment).toBe("Module 5: Assignment");

    expect(result.itemsByWeek.get(10)?.length).toBe(1);
    expect(result.itemsByWeek.get(10)?.[0]?.assignment).toBe("Week 10 - Project");

    expect(result.itemsByWeek.get(3)?.length).toBe(1);
    expect(result.itemsByWeek.get(3)?.[0]?.assignment).toBe("Unit 3: Test");
  });

  it("handles zero-padded module numbers", () => {
    const result = buildCastletopSources({
      schedule: [],
      assignments: [
        { name: "Module 07: Advanced", pointsPossible: 15 },
      ],
      weeks: 16,
    });
    expect(result.itemsByWeek.get(7)?.length).toBe(1);
    expect(result.itemsByWeek.get(7)?.[0]?.assignment).toBe("Module 07: Advanced");
  });

  it("buckets assignments by due date", () => {
    const result = buildCastletopSources({
      schedule: [],
      assignments: [
        { name: "Early Assignment", dueAt: "2024-01-08" },
        { name: "Mid-course Assignment", dueAt: "2024-01-22" },
        { name: "Late Assignment", dueAt: "2024-02-05" },
      ],
      startDate: "2024-01-01",
      weeks: 16,
    });
    expect(result.itemsByWeek.get(2)?.length).toBe(1);
    expect(result.itemsByWeek.get(2)?.[0]?.assignment).toBe("Early Assignment");

    expect(result.itemsByWeek.get(4)?.length).toBe(1);
    expect(result.itemsByWeek.get(4)?.[0]?.assignment).toBe("Mid-course Assignment");

    expect(result.itemsByWeek.get(6)?.length).toBe(1);
    expect(result.itemsByWeek.get(6)?.[0]?.assignment).toBe("Late Assignment");
  });

  it("clamps due-date buckets to week range", () => {
    const result = buildCastletopSources({
      schedule: [],
      assignments: [
        { name: "Way Past", dueAt: "2024-06-01" },
      ],
      startDate: "2024-01-01",
      weeks: 16,
    });
    const maxWeek = Math.max(...Array.from(result.itemsByWeek.keys()));
    expect(maxWeek).toBeLessThanOrEqual(16);
  });

  it("deduplicates by name when enriching", () => {
    const result = buildCastletopSources({
      schedule: [
        { week: 1, topic: "Week 1", assignmentTitle: "Module 1: Chapter 1", testName: null },
      ],
      assignments: [
        { name: "Module 1: chapter 1", pointsPossible: 50 },
      ],
      weeks: 16,
    });
    expect(result.itemsByWeek.get(1)).toHaveLength(1);
    expect(result.itemsByWeek.get(1)?.[0]?.points).toBe(50);
  });

  it("fills in points on a name collision", () => {
    const result = buildCastletopSources({
      schedule: [
        { week: 1, topic: "Week 1", assignmentTitle: "Module 1: Assignment", testName: null },
      ],
      assignments: [
        { name: "Module 1: assignment", pointsPossible: 100 },
      ],
      weeks: 16,
    });
    const item = result.itemsByWeek.get(1)?.[0];
    expect(item?.assignment).toBe("Module 1: Assignment");
    expect(item?.points).toBe(100);
  });

  it("skips brief when no match and no due date", () => {
    const result = buildCastletopSources({
      schedule: [],
      assignments: [
        { name: "Unmatched", pointsPossible: 10 },
      ],
      weeks: 16,
    });
    expect(result.itemsByWeek.size).toBe(0);
    expect(result.notes).toContain("1 assignment(s) could not be placed in a week");
  });

  it("records notes for matched and bucketed assignments", () => {
    const result = buildCastletopSources({
      schedule: [],
      assignments: [
        { name: "Module 3: Task", pointsPossible: 10, dueAt: "2024-01-22" },
        { name: "Some Project", dueAt: "2024-02-05" },
        { name: "Unmatched" },
      ],
      startDate: "2024-01-01",
      weeks: 16,
    });
    expect(result.notes).toContain("1 assignment(s) matched to weeks by name");
    expect(result.notes).toContain("1 assignment(s) bucketed by due date");
    expect(result.notes).toContain("1 assignment(s) could not be placed in a week");
  });

  it("only emits notes with count > 0", () => {
    const result = buildCastletopSources({
      schedule: [],
      assignments: [
        { name: "Module 1: Task" },
      ],
      weeks: 16,
    });
    expect(result.notes).toContain("1 assignment(s) matched to weeks by name");
    expect(result.notes).not.toContain("bucketed");
    expect(result.notes).not.toContain("could not be placed");
  });

  it("handles empty inputs", () => {
    const result = buildCastletopSources({
      schedule: [],
      weeks: 16,
    });
    expect(result.topicsByWeek.size).toBe(0);
    expect(result.itemsByWeek.size).toBe(0);
    expect(result.notes).toHaveLength(0);
  });

  it("trims whitespace from topics", () => {
    const result = buildCastletopSources({
      schedule: [
        { week: 1, topic: "  Introduction  ", assignmentTitle: null, testName: null },
      ],
      weeks: 16,
    });
    expect(result.topicsByWeek.get(1)).toBe("  Introduction  ");
  });

  it("ignores blank topics", () => {
    const result = buildCastletopSources({
      schedule: [
        { week: 1, topic: "", assignmentTitle: null, testName: null },
        { week: 2, topic: "   ", assignmentTitle: null, testName: null },
      ],
      weeks: 16,
    });
    expect(result.topicsByWeek.size).toBe(0);
  });

  it("applies defaults for assignment and test minutes", () => {
    const result = buildCastletopSources({
      schedule: [
        { week: 1, topic: "Week 1", assignmentTitle: "Task", testName: "Test" },
      ],
      weeks: 16,
    });
    const items = result.itemsByWeek.get(1);
    const assignment = items?.find((i) => i.assignment === "Task");
    const test = items?.find((i) => i.assignment === "Test");
    expect(assignment?.minutes).toBe(60);
    expect(test?.minutes).toBe(30);
  });

  it("case-insensitively matches names for deduplication", () => {
    const result = buildCastletopSources({
      schedule: [
        { week: 1, topic: "Week 1", assignmentTitle: "Module 1: Project", testName: null },
      ],
      assignments: [
        { name: "module 1: PROJECT", pointsPossible: 200 },
      ],
      weeks: 16,
    });
    expect(result.itemsByWeek.get(1)).toHaveLength(1);
    expect(result.itemsByWeek.get(1)?.[0]?.points).toBe(200);
  });

  it("prioritizes name match over due-date bucket", () => {
    const result = buildCastletopSources({
      schedule: [],
      assignments: [
        { name: "Module 3: Task", dueAt: "2024-02-05", pointsPossible: 10 },
      ],
      startDate: "2024-01-01",
      weeks: 16,
    });
    expect(result.itemsByWeek.get(3)?.length).toBe(1);
    expect(result.itemsByWeek.get(5)).toBeUndefined();
    expect(result.notes).toContain("1 assignment(s) matched to weeks by name");
    expect(result.notes).not.toContain("bucketed by due date");
  });

  it("buckets full ISO timestamp dueAt correctly (Canvas format)", () => {
    const result = buildCastletopSources({
      schedule: [{ week: 1, topic: "Intro" }],
      assignments: [
        { name: "Essay One", pointsPossible: 50, dueAt: "2024-09-15T23:59:00Z" },
      ],
      startDate: "2024-09-01",
      weeks: 16,
    });
    expect(result.itemsByWeek.get(3)?.length).toBe(1);
    expect(result.itemsByWeek.get(3)?.[0]?.assignment).toBe("Essay One");
    expect(result.notes).toContain("1 assignment(s) bucketed by due date");
    expect([...result.itemsByWeek.keys()].every(Number.isFinite)).toBe(true);
  });

  it("buckets timestamp with non-UTC offset by calendar date", () => {
    const result = buildCastletopSources({
      schedule: [],
      assignments: [
        { name: "Project", dueAt: "2024-09-15T23:59:59-06:00" },
      ],
      startDate: "2024-09-01",
      weeks: 16,
    });
    expect(result.itemsByWeek.get(3)?.length).toBe(1);
    expect(result.itemsByWeek.get(3)?.[0]?.assignment).toBe("Project");
    expect([...result.itemsByWeek.keys()].every(Number.isFinite)).toBe(true);
  });

  it("treats unparseable dueAt as unbucketed without incrementing due-date count", () => {
    const result = buildCastletopSources({
      schedule: [],
      assignments: [
        { name: "Unparseable", dueAt: "not-a-date" },
      ],
      startDate: "2024-09-01",
      weeks: 16,
    });
    expect(result.itemsByWeek.size).toBe(0);
    expect(result.notes).toContain("1 assignment(s) could not be placed in a week");
    expect(result.notes).not.toContain("bucketed by due date");
    expect([...result.itemsByWeek.keys()].every(Number.isFinite)).toBe(true);
  });

  it("never creates non-finite keys in itemsByWeek map", () => {
    const result = buildCastletopSources({
      schedule: [],
      assignments: [
        { name: "Full timestamp", dueAt: "2024-09-15T23:59:00Z" },
        { name: "Non-UTC offset", dueAt: "2024-09-15T23:59:59-06:00" },
        { name: "Bare date", dueAt: "2024-09-22" },
        { name: "Unparseable", dueAt: "garbage" },
      ],
      startDate: "2024-09-01",
      weeks: 16,
    });
    expect([...result.itemsByWeek.keys()].every(Number.isFinite)).toBe(true);
  });

  it("uses built-in defaults (60/30) even when unrelated config values are high", () => {
    const result = buildCastletopSources({
      schedule: [
        { week: 1, topic: "Week 1", assignmentTitle: "Task", testName: "Quiz" },
      ],
      weeks: 16,
      defaultAssignmentMinutes: 50,
      defaultTestMinutes: 120,
    });
    const items = result.itemsByWeek.get(1);
    const assignment = items?.find((i) => i.assignment === "Task");
    const test = items?.find((i) => i.assignment === "Quiz");
    expect(assignment?.minutes).toBe(50);
    expect(test?.minutes).toBe(120);
  });
});
