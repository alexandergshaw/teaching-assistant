import { describe, it, expect } from "vitest";
import { csvToSchedule, scheduleToCsv } from "./types";

describe("csvToSchedule", () => {
  it("round-trips scheduleToCsv exactly except assignmentSlug", () => {
    const original = [
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
      {
        week: 3,
        topic: "Final review",
        summary: "",
        assignmentTitle: "Final project",
        assignmentSlug: "final-project",
        testName: "Final exam",
      },
    ];

    const csv = scheduleToCsv(original);
    const parsed = csvToSchedule(csv);

    expect(parsed).toEqual([
      {
        week: 1,
        topic: "Introduction",
        summary: "Course overview",
        assignmentTitle: "Welcome",
        assignmentSlug: null,
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
      {
        week: 3,
        topic: "Final review",
        summary: "",
        assignmentTitle: "Final project",
        assignmentSlug: null,
        testName: "Final exam",
      },
    ]);
  });

  it("handles case-insensitive headers", () => {
    const csv = "WEEK,Topic,SUMMARY,Assignment,test\n1,Intro,Overview,HW1,Quiz1";
    const parsed = csvToSchedule(csv);

    expect(parsed).toEqual([
      {
        week: 1,
        topic: "Intro",
        summary: "Overview",
        assignmentTitle: "HW1",
        assignmentSlug: null,
        testName: "Quiz1",
      },
    ]);
  });

  it("ignores extra columns", () => {
    const csv =
      "Week,Topic,Summary,Assignment,Test,ExtraCol1,ExtraCol2\n1,Intro,Overview,HW1,Quiz1,ignored,also ignored";
    const parsed = csvToSchedule(csv);

    expect(parsed).toEqual([
      {
        week: 1,
        topic: "Intro",
        summary: "Overview",
        assignmentTitle: "HW1",
        assignmentSlug: null,
        testName: "Quiz1",
      },
    ]);
  });

  it("tolerates missing optional columns", () => {
    const csv = "Week,Topic\n1,Introduction\n2,Advanced topics";
    const parsed = csvToSchedule(csv);

    expect(parsed).toEqual([
      {
        week: 1,
        topic: "Introduction",
        summary: "",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      },
      {
        week: 2,
        topic: "Advanced topics",
        summary: "",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      },
    ]);
  });

  it("skips rows with non-integer week", () => {
    const csv = "Week,Topic\nfoo,Invalid\n1,Valid\nbar,Also invalid";
    const parsed = csvToSchedule(csv);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].topic).toBe("Valid");
  });

  it("skips rows with a fractional week", () => {
    const csv = "Week,Topic\n1.5,Fractional\n2,Valid";
    const parsed = csvToSchedule(csv);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].week).toBe(2);
    expect(parsed[0].topic).toBe("Valid");
  });

  it("skips rows with week < 1", () => {
    const csv = "Week,Topic\n0,Zero\n-1,Negative\n1,Valid";
    const parsed = csvToSchedule(csv);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].week).toBe(1);
  });

  it("returns empty array when header lacks both week and topic", () => {
    const csv = "Summary,Assignment\nSome content,HW1";
    const parsed = csvToSchedule(csv);

    expect(parsed).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    const parsed = csvToSchedule("");
    expect(parsed).toEqual([]);
  });

  it("handles quoted fields with commas", () => {
    const csv =
      'Week,Topic,Summary\n1,"Introduction, Part 1","Overview, review, basics"';
    const parsed = csvToSchedule(csv);

    expect(parsed).toEqual([
      {
        week: 1,
        topic: "Introduction, Part 1",
        summary: "Overview, review, basics",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      },
    ]);
  });

  it("handles escaped quotes in quoted fields", () => {
    const csv = 'Week,Topic\n1,"Topic with ""quotes"" inside"';
    const parsed = csvToSchedule(csv);

    expect(parsed).toEqual([
      {
        week: 1,
        topic: 'Topic with "quotes" inside',
        summary: "",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      },
    ]);
  });

  it("drops all-empty rows", () => {
    const csv =
      "Week,Topic\n1,Intro\n\n2,Advanced\n   ,   \n3,Final";
    const parsed = csvToSchedule(csv);

    expect(parsed).toHaveLength(3);
    expect(parsed[0].topic).toBe("Intro");
    expect(parsed[1].topic).toBe("Advanced");
    expect(parsed[2].topic).toBe("Final");
  });

  it("trims whitespace from cell values", () => {
    const csv =
      "Week,Topic,Summary,Assignment,Test\n  1  ,  Intro  ,  Overview  ,  HW1  ,  Quiz  ";
    const parsed = csvToSchedule(csv);

    expect(parsed[0]).toEqual({
      week: 1,
      topic: "Intro",
      summary: "Overview",
      assignmentTitle: "HW1",
      assignmentSlug: null,
      testName: "Quiz",
    });
  });

  it("treats empty assignment/test cells as null", () => {
    const csv = "Week,Topic,Summary,Assignment,Test\n1,Intro,Overview,,";
    const parsed = csvToSchedule(csv);

    expect(parsed[0].assignmentTitle).toBeNull();
    expect(parsed[0].testName).toBeNull();
  });

  it("round-trips a topic containing a bare carriage return", () => {
    const original = [
      {
        week: 1,
        topic: "line1\rline2",
        summary: "Overview",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      },
    ];

    const csv = scheduleToCsv(original);
    const parsed = csvToSchedule(csv);

    expect(parsed).toEqual([
      {
        week: 1,
        topic: "line1\rline2",
        summary: "Overview",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      },
    ]);
  });
});
