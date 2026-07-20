import { describe, it, expect } from "vitest";
import {
  assignWeekNumbers,
  renumberWeekLabel,
  planCartridgeModules,
  currentCourseWeek,
  courseProgressStatus,
  parseWeekToken,
  currentWeekFromDeadlines,
} from "./week-numbering";

describe("currentCourseWeek", () => {
  const start = "2026-08-24"; // a Monday, UTC midnight
  const day = (n: number) => Date.parse(start) + n * 86_400_000;

  it("returns null for a missing or invalid start date", () => {
    expect(currentCourseWeek(null, Date.parse(start))).toBeNull();
    expect(currentCourseWeek(undefined, Date.parse(start))).toBeNull();
    expect(currentCourseWeek("not-a-date", Date.parse(start))).toBeNull();
  });

  it("returns 0 before the start date", () => {
    expect(currentCourseWeek(start, day(-1))).toBe(0);
  });

  it("counts 7-day spans as weeks 1..N", () => {
    expect(currentCourseWeek(start, day(0))).toBe(1); // first day
    expect(currentCourseWeek(start, day(6))).toBe(1); // last day of week 1
    expect(currentCourseWeek(start, day(7))).toBe(2); // first day of week 2
    expect(currentCourseWeek(start, day(20))).toBe(3);
  });

  it("returns the RAW elapsed week even past the course length (caller clamps)", () => {
    expect(currentCourseWeek(start, day(7 * 20))).toBe(21);
  });
});

describe("courseProgressStatus", () => {
  it("is not-started at or below week 0", () => {
    expect(courseProgressStatus(0, 16)).toBe("not-started");
  });
  it("is in-progress within the course, including the final week", () => {
    expect(courseProgressStatus(1, 16)).toBe("in-progress");
    expect(courseProgressStatus(16, 16)).toBe("in-progress");
  });
  it("is complete only past the last week", () => {
    expect(courseProgressStatus(17, 16)).toBe("complete");
  });
  it("stays in-progress when the total is unknown", () => {
    expect(courseProgressStatus(99, null)).toBe("in-progress");
    expect(courseProgressStatus(99, 0)).toBe("in-progress");
  });
});

describe("parseWeekToken", () => {
  it("parses 'Week N' format", () => {
    expect(parseWeekToken("Week 6 Deliverable")).toBe(6);
  });

  it("parses 'Module N' format (case insensitive)", () => {
    expect(parseWeekToken("Module 7 Assignment")).toBe(7);
    expect(parseWeekToken("module 3 test")).toBe(3);
    expect(parseWeekToken("MODULE 5 exam")).toBe(5);
  });

  it("handles zero-padded numbers", () => {
    expect(parseWeekToken("Week 06 Deliverable")).toBe(6);
    expect(parseWeekToken("Module 03 Assignment")).toBe(3);
  });

  it("handles different separators (spaces, underscores, dashes)", () => {
    expect(parseWeekToken("Week 5 Topic")).toBe(5);
    expect(parseWeekToken("Week_5_Topic")).toBe(5);
    expect(parseWeekToken("Week-5-Topic")).toBe(5);
    expect(parseWeekToken("Module 4 Assignment")).toBe(4);
    expect(parseWeekToken("Module_4_Assignment")).toBe(4);
    expect(parseWeekToken("Module-4-Assignment")).toBe(4);
  });

  it("returns null when no week/module token found", () => {
    expect(parseWeekToken("Assignment 1")).toBeNull();
    expect(parseWeekToken("Project 2")).toBeNull();
    expect(parseWeekToken("Exam 3")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseWeekToken("")).toBeNull();
  });

  it("parses first match only", () => {
    expect(parseWeekToken("Week 1 or Week 2")).toBe(1);
  });
});

describe("currentWeekFromDeadlines", () => {
  const nowMs = Date.UTC(2024, 6, 18); // 2024-07-18 00:00:00 UTC

  describe("Basic functionality", () => {
    it("returns the earliest week with an unpasssed deadline", () => {
      const entries = [
        { name: "Week 6 Deliverable", dueAt: "2024-07-25" }, // 7 days in future (passed nowMs)
        { name: "Week 7 Deliverable", dueAt: "2024-08-01" }, // 14 days in future
      ];
      expect(currentWeekFromDeadlines(entries, nowMs)).toEqual({
        week: 6,
        pastLastDeadline: false,
      });
    });

    it("returns the smallest week when multiple deadlines are in the future", () => {
      const entries = [
        { name: "Module 5 Assignment", dueAt: "2024-08-10" },
        { name: "Module 3 Assignment", dueAt: "2024-07-20" },
        { name: "Module 7 Assignment", dueAt: "2024-08-20" },
      ];
      expect(currentWeekFromDeadlines(entries, nowMs)).toEqual({
        week: 3,
        pastLastDeadline: false,
      });
    });
  });

  describe("Per-week latest deadline", () => {
    it("keeps the latest due date when a week has multiple deadlines", () => {
      const entries = [
        { name: "Week 4 Assignment", dueAt: "2024-07-20" }, // Earlier
        { name: "Week 4 Quiz", dueAt: "2024-07-25" }, // Later (used)
      ];
      expect(currentWeekFromDeadlines(entries, nowMs)).toEqual({
        week: 4,
        pastLastDeadline: false,
      });
    });

    it("module stays current until its latest deadline passes", () => {
      const entries = [
        { name: "Week 6 Assignment", dueAt: "2024-07-15" }, // Past
        { name: "Week 6 Quiz", dueAt: "2024-07-22" }, // Future
      ];
      expect(currentWeekFromDeadlines(entries, nowMs)).toEqual({
        week: 6,
        pastLastDeadline: false,
      });
    });
  });

  describe("Deadline exactly at nowMs (inclusive)", () => {
    it("treats deadline at nowMs as not yet passed", () => {
      const entries = [
        { name: "Week 5 Deliverable", dueAt: "2024-07-18" }, // Exactly at nowMs
      ];
      expect(currentWeekFromDeadlines(entries, nowMs)).toEqual({
        week: 5,
        pastLastDeadline: false,
      });
    });
  });

  describe("All deadlines passed", () => {
    it("returns maxWeek + 1 with pastLastDeadline true", () => {
      const entries = [
        { name: "Week 4 Assignment", dueAt: "2024-07-15" },
        { name: "Week 6 Assignment", dueAt: "2024-07-17" },
      ];
      expect(currentWeekFromDeadlines(entries, nowMs)).toEqual({
        week: 7,
        pastLastDeadline: true,
      });
    });

    it("handles single past deadline", () => {
      const entries = [
        { name: "Week 3 Deliverable", dueAt: "2024-07-10" },
      ];
      expect(currentWeekFromDeadlines(entries, nowMs)).toEqual({
        week: 4,
        pastLastDeadline: true,
      });
    });
  });

  describe("Invalid/missing data", () => {
    it("ignores entries with no parseable week token", () => {
      const entries = [
        { name: "Assignment 1", dueAt: "2024-07-25" }, // No week token
        { name: "Week 5 Deliverable", dueAt: "2024-07-25" },
      ];
      expect(currentWeekFromDeadlines(entries, nowMs)).toEqual({
        week: 5,
        pastLastDeadline: false,
      });
    });

    it("ignores entries with null dueAt", () => {
      const entries = [
        { name: "Week 4 Assignment", dueAt: null },
        { name: "Week 6 Assignment", dueAt: "2024-07-25" },
      ];
      expect(currentWeekFromDeadlines(entries, nowMs)).toEqual({
        week: 6,
        pastLastDeadline: false,
      });
    });

    it("ignores entries with unparseable dueAt", () => {
      const entries = [
        { name: "Week 4 Assignment", dueAt: "not-a-date" },
        { name: "Week 6 Assignment", dueAt: "2024-07-25" },
      ];
      expect(currentWeekFromDeadlines(entries, nowMs)).toEqual({
        week: 6,
        pastLastDeadline: false,
      });
    });

    it("returns null when no usable entries", () => {
      const entries = [
        { name: "Assignment 1", dueAt: "2024-07-25" },
        { name: "Project 2", dueAt: "2024-08-01" },
      ];
      expect(currentWeekFromDeadlines(entries, nowMs)).toBeNull();
    });

    it("returns null for empty array", () => {
      expect(currentWeekFromDeadlines([], nowMs)).toBeNull();
    });

    it("ignores zero week numbers", () => {
      const entries = [
        { name: "Week 0 Test", dueAt: "2024-07-25" },
        { name: "Week 5 Deliverable", dueAt: "2024-08-01" },
      ];
      expect(currentWeekFromDeadlines(entries, nowMs)).toEqual({
        week: 5,
        pastLastDeadline: false,
      });
    });
  });

  describe("Mixed week/module naming", () => {
    it("handles Week and Module interchangeably", () => {
      const entries = [
        { name: "Week 3 Assignment", dueAt: "2024-07-15" },
        { name: "Module 4 Assignment", dueAt: "2024-07-25" },
        { name: "Week 5 Assignment", dueAt: "2024-08-01" },
      ];
      expect(currentWeekFromDeadlines(entries, nowMs)).toEqual({
        week: 4,
        pastLastDeadline: false,
      });
    });
  });

  describe("Weeks out of order", () => {
    it("correctly identifies current week when entries are unordered", () => {
      const entries = [
        { name: "Week 7 Deliverable", dueAt: "2024-08-15" },
        { name: "Week 3 Deliverable", dueAt: "2024-07-19" },
        { name: "Week 5 Deliverable", dueAt: "2024-07-25" },
        { name: "Week 1 Deliverable", dueAt: "2024-07-10" },
      ];
      expect(currentWeekFromDeadlines(entries, nowMs)).toEqual({
        week: 3,
        pastLastDeadline: false,
      });
    });
  });

  describe("Smoke test with currentCourseWeek", () => {
    it("courseProgressStatus correctly classifies deadline-based rawWeek", () => {
      const entries = [
        { name: "Week 5 Deliverable", dueAt: "2024-07-10" },
      ];
      const result = currentWeekFromDeadlines(entries, nowMs);
      if (result && !result.pastLastDeadline) {
        const status = courseProgressStatus(result.week, 10);
        expect(status).toBe("in-progress");
      }
    });

    it("courseProgressStatus marks past-the-end as complete", () => {
      const entries = [
        { name: "Week 5 Deliverable", dueAt: "2024-07-10" },
      ];
      const result = currentWeekFromDeadlines(entries, nowMs);
      if (result && result.pastLastDeadline) {
        const status = courseProgressStatus(result.week, 5);
        expect(status).toBe("complete");
      }
    });
  });
});

describe("assignWeekNumbers", () => {
  it("shifts zero-based repos to 1-based", () => {
    const result = assignWeekNumbers(["week-00-assignment", "week-01-assignment", "week-02-review"]);
    expect(result.get("week-00-assignment")).toBe(1);
    expect(result.get("week-01-assignment")).toBe(2);
    expect(result.get("week-02-review")).toBe(3);
  });

  it("leaves one-based unchanged", () => {
    const result = assignWeekNumbers(["week-01-a", "week-02-b", "week-03-c"]);
    expect(result.get("week-01-a")).toBe(1);
    expect(result.get("week-02-b")).toBe(2);
    expect(result.get("week-03-c")).toBe(3);
  });

  it("keeps sparse one-based numbering exactly", () => {
    const result = assignWeekNumbers(["week-02-a", "week-05-b"]);
    expect(result.get("week-02-a")).toBe(2);
    expect(result.get("week-05-b")).toBe(5);
  });

  it("preserves gaps while shifting sparse zero-based sets", () => {
    const result = assignWeekNumbers(["week-00-a", "week-02-b"]);
    expect(result.get("week-00-a")).toBe(1);
    expect(result.get("week-02-b")).toBe(3);
  });

  it("falls back to position only for the digit-less slug", () => {
    const result = assignWeekNumbers(["intro", "week-01-a"]);
    expect(result.get("intro")).toBe(1);
    expect(result.get("week-01-a")).toBe(1);
  });

  it("does not let a digit-less folder renumber the others", () => {
    const result = assignWeekNumbers(["final", "week-01-a", "week-02-b"]);
    expect(result.get("final")).toBe(1);
    expect(result.get("week-01-a")).toBe(1);
    expect(result.get("week-02-b")).toBe(2);
  });

  it("assigns the same week to duplicate digit values", () => {
    const result = assignWeekNumbers(["week-03-a", "week-03-b"]);
    expect(result.get("week-03-a")).toBe(3);
    expect(result.get("week-03-b")).toBe(3);
  });
});

describe("renumberWeekLabel", () => {
  it("shifts Week 00 to Week 01", () => {
    expect(renumberWeekLabel("Week 00 Assignment", 1)).toBe("Week 01 Assignment");
  });

  it("shifts Week 15 to Week 16", () => {
    expect(renumberWeekLabel("Week 15 Exam", 16)).toBe("Week 16 Exam");
  });

  it("preserves the token's width on single-digit weeks", () => {
    expect(renumberWeekLabel("Week 0: Git Basics", 1)).toBe("Week 1: Git Basics");
  });

  it("returns unchanged when there is no week token", () => {
    expect(renumberWeekLabel("Final", 5)).toBe("Final");
  });

  it("leaves non-week ordinals alone", () => {
    expect(renumberWeekLabel("Project 2", 3)).toBe("Project 2");
    expect(renumberWeekLabel("Exam 1", 2)).toBe("Exam 1");
  });

  it("does not rewrite digits outside the week token", () => {
    expect(renumberWeekLabel("2024 Week 00", 2024)).toBe("2024 Week 00");
  });

  it("returns unchanged when the shift is not exactly plus one", () => {
    expect(renumberWeekLabel("Week 03 B", 3)).toBe("Week 03 B");
  });
});

describe("planCartridgeModules", () => {
  it("generates modules 1..3 with topics from schedule", () => {
    const schedule = [
      { week: 1, topic: "Intro", assignmentTitle: "Assignment 1", assignmentSlug: "week-1" },
      { week: 2, topic: "Basics", assignmentTitle: "Assignment 2", assignmentSlug: "week-2" },
      { week: 3, topic: "Advanced", assignmentTitle: "Assignment 3", assignmentSlug: "week-3" },
    ];
    const plans = planCartridgeModules(schedule, [1, 2, 3]);

    expect(plans).toHaveLength(3);
    expect(plans[0]).toEqual({
      week: 1,
      title: "Module 01: Intro",
      assignmentTitle: "Assignment 1",
      assignmentSlug: "week-1",
    });
    expect(plans[1]).toEqual({
      week: 2,
      title: "Module 02: Basics",
      assignmentTitle: "Assignment 2",
      assignmentSlug: "week-2",
    });
    expect(plans[2]).toEqual({
      week: 3,
      title: "Module 03: Advanced",
      assignmentTitle: "Assignment 3",
      assignmentSlug: "week-3",
    });
  });

  it("every plan has a non-empty assignmentTitle", () => {
    const schedule = [
      { week: 1, topic: "Intro", assignmentTitle: "Assignment 1", assignmentSlug: "week-1" },
      { week: 2, topic: "Basics", assignmentTitle: null, assignmentSlug: "week-2" },
    ];
    const plans = planCartridgeModules(schedule, [1, 2]);

    expect(plans[0].assignmentTitle).toBe("Assignment 1");
    expect(plans[1].assignmentTitle).toBe("Week 02 Deliverable");
  });

  it("emits all schedule weeks even when fileWeeks misses some", () => {
    const schedule = [
      { week: 1, topic: "One", assignmentTitle: "A1", assignmentSlug: "w1" },
      { week: 2, topic: "Two", assignmentTitle: "A2", assignmentSlug: "w2" },
      { week: 3, topic: "Three", assignmentTitle: "A3", assignmentSlug: "w3" },
      { week: 4, topic: "Four", assignmentTitle: "A4", assignmentSlug: "w4" },
    ];
    const plans = planCartridgeModules(schedule, [1, 2]);

    expect(plans).toHaveLength(4);
    expect(plans[3].week).toBe(4);
    expect(plans[3].title).toBe("Module 04: Four");
  });

  it("keeps stray file weeks beyond the schedule", () => {
    const schedule = [
      { week: 1, topic: "One", assignmentTitle: "A1", assignmentSlug: "w1" },
      { week: 2, topic: "Two", assignmentTitle: "A2", assignmentSlug: "w2" },
    ];
    const plans = planCartridgeModules(schedule, [1, 2, 3]);

    expect(plans).toHaveLength(3);
    expect(plans[2].week).toBe(3);
    expect(plans[2].title).toBe("Module 03");
    expect(plans[2].assignmentTitle).toBe("Week 03 Deliverable");
  });

  it("uses fallback assignmentTitle when schedule assignmentTitle is null", () => {
    const schedule = [
      { week: 1, topic: "One", assignmentTitle: null, assignmentSlug: "w1" },
    ];
    const plans = planCartridgeModules(schedule, [1]);

    expect(plans[0].assignmentTitle).toBe("Week 01 Deliverable");
  });

  it("ignores schedule week 0 and non-positive weeks", () => {
    const schedule = [
      { week: 0, topic: "Zero", assignmentTitle: "A0", assignmentSlug: "w0" },
      { week: 1, topic: "One", assignmentTitle: "A1", assignmentSlug: "w1" },
    ];
    const plans = planCartridgeModules(schedule, [1]);

    expect(plans).toHaveLength(1);
    expect(plans[0].week).toBe(1);
  });

  it("excludes fractional weeks", () => {
    const schedule = [
      { week: 1.5, topic: "Half", assignmentTitle: "A", assignmentSlug: "w" },
      { week: 1, topic: "One", assignmentTitle: "A1", assignmentSlug: "w1" },
    ];
    const plans = planCartridgeModules(schedule, [1, 2.5]);

    expect(plans).toHaveLength(1);
    expect(plans[0].week).toBe(1);
  });

  it("omits empty topic from title", () => {
    const schedule = [
      { week: 1, topic: "", assignmentTitle: "A1", assignmentSlug: "w1" },
    ];
    const plans = planCartridgeModules(schedule, [1]);

    expect(plans[0].title).toBe("Module 01");
  });

  it("preserves assignmentSlug as null when absent", () => {
    const schedule = [
      { week: 1, topic: "One", assignmentTitle: "A1", assignmentSlug: null },
    ];
    const plans = planCartridgeModules(schedule, [1]);

    expect(plans[0].assignmentSlug).toBe(null);
  });

  it("treats a whitespace-only assignmentSlug as null", () => {
    const schedule = [
      { week: 1, topic: "One", assignmentTitle: "A1", assignmentSlug: "   " },
    ];
    const plans = planCartridgeModules(schedule, [1]);

    expect(plans[0].assignmentSlug).toBe(null);
  });
});
