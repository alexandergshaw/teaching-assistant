// weeklyTopicsFromSchedule is the pure formatting helper define-course-project
// uses to ground a generation prompt in a BOUND schedule (an earlier step's
// output) instead of the tile's own saved data. It must produce the exact
// same text shape weeklyTopicsFrom(tile) already does for a tile with saved
// CSV data - scheduleToCsv - so the generation prompt reads identically
// whichever source supplied it, per the no-second-convention rule.

import { describe, it, expect } from "vitest";
import { weeklyTopicsFromSchedule } from "./steps.course-project";
import { scheduleToCsv } from "@/lib/workflows/types";
import type { ScheduleWeekPlan } from "@/app/actions";

describe("weeklyTopicsFromSchedule", () => {
  it("matches scheduleToCsv exactly - the same shape tile.csvData already carries", () => {
    const schedule: ScheduleWeekPlan[] = [
      {
        week: 1,
        topic: "Introduction",
        summary: "Course overview",
        assignmentTitle: "Welcome",
        assignmentSlug: "welcome-assignment",
        testName: null,
      },
      {
        week: 2,
        topic: "Topic with, comma",
        summary: "Assignment review",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: "Checkpoint 1",
      },
    ];

    expect(weeklyTopicsFromSchedule(schedule)).toBe(scheduleToCsv(schedule));
    // The header row confirms it is the SAME CSV shape weeklyTopicsFrom(tile)
    // returns for a tile with saved csvData - not a second, differently
    // formatted convention.
    expect(weeklyTopicsFromSchedule(schedule)).toBe(
      "Week,Topic,Summary,Assignment,Test\n" +
        "1,Introduction,Course overview,Welcome,\n" +
        '2,"Topic with, comma",Assignment review,,Checkpoint 1'
    );
  });

  it("an empty schedule returns an empty string rather than a header-only CSV", () => {
    // A blank result (not scheduleToCsv([]), which would be just the header
    // row) is what lets the caller cleanly fall back to weeklyTopicsFrom(tile)
    // when no schedule was bound.
    expect(weeklyTopicsFromSchedule([])).toBe("");
  });

  it("a single-week schedule is one CSV data row under the header", () => {
    const schedule: ScheduleWeekPlan[] = [
      {
        week: 1,
        topic: "Solo week",
        summary: "",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      },
    ];

    const result = weeklyTopicsFromSchedule(schedule);
    expect(result.split("\n")).toEqual(["Week,Topic,Summary,Assignment,Test", "1,Solo week,,,"]);
  });
});
