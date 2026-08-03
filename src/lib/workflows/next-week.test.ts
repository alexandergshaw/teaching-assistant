import { describe, it, expect } from "vitest";
import { nextLectureWeek, mapLiveModulesForTopic } from "./next-week";

describe("nextLectureWeek", () => {
  // Fixed reference: 2024-07-18 00:00:00 UTC
  const nowMs = Date.UTC(2024, 6, 18);

  describe("Branch 1: No start date", () => {
    it("returns skip when startDate is null", () => {
      expect(nextLectureWeek({ startDate: null, weeks: 10, nowMs })).toEqual({
        skip: "no start date",
      });
    });

    it("returns skip when startDate is an invalid date string", () => {
      expect(nextLectureWeek({ startDate: "not-a-date", weeks: 10, nowMs })).toEqual({
        skip: "no start date",
      });
    });
  });

  describe("Branch 2: Not-started, starts within next 7 days", () => {
    it("returns week 1 when course starts tomorrow (1 day away)", () => {
      // 2024-07-19 00:00:00 UTC - 1 day from nowMs
      const startDate = "2024-07-19";
      expect(nextLectureWeek({ startDate, weeks: 10, nowMs })).toEqual({
        week: 1,
      });
    });

    it("returns week 1 when course starts in exactly 7 days", () => {
      // 2024-07-25 00:00:00 UTC - exactly 7 days from nowMs
      const startDate = "2024-07-25";
      expect(nextLectureWeek({ startDate, weeks: 10, nowMs })).toEqual({
        week: 1,
      });
    });

    it("returns week 1 when course starts in 3 days", () => {
      const startDate = "2024-07-21";
      expect(nextLectureWeek({ startDate, weeks: 10, nowMs })).toEqual({
        week: 1,
      });
    });
  });

  describe("Branch 3: Not-started, starts later than next week", () => {
    it("returns skip when course starts in 8 days (beyond 7-day window)", () => {
      // 2024-07-26 00:00:00 UTC - 8 days from nowMs
      const startDate = "2024-07-26";
      expect(nextLectureWeek({ startDate, weeks: 10, nowMs })).toEqual({
        skip: "starts later than next week",
      });
    });

    it("returns skip when course starts in 2 weeks", () => {
      const startDate = "2024-08-01";
      expect(nextLectureWeek({ startDate, weeks: 10, nowMs })).toEqual({
        skip: "starts later than next week",
      });
    });

    it("returns skip when course starts far in the future", () => {
      const startDate = "2025-01-15";
      expect(nextLectureWeek({ startDate, weeks: 10, nowMs })).toEqual({
        skip: "starts later than next week",
      });
    });
  });

  describe("Branch 4: In-progress, next week within bounds", () => {
    it("returns next week when course is on week 2 and has 3+ weeks total", () => {
      // Course started 2024-07-11 (7 days ago from nowMs)
      // currentCourseWeek returns week 2
      // next = 3, weeks = 5, so 3 <= 5
      const startDate = "2024-07-11";
      expect(nextLectureWeek({ startDate, weeks: 5, nowMs })).toEqual({
        week: 3,
      });
    });

    it("returns next week when course is on week 1 and has 2+ weeks total", () => {
      // Course started 2024-07-18 (today)
      // currentCourseWeek returns week 1
      // next = 2, weeks = 3, so 2 <= 3
      const startDate = "2024-07-18";
      expect(nextLectureWeek({ startDate, weeks: 3, nowMs })).toEqual({
        week: 2,
      });
    });

    it("returns next week when course has no week limit (weeks is null)", () => {
      // Course started 2024-07-04 (14 days ago)
      // currentCourseWeek returns week 3
      // next = 4, weeks = null
      const startDate = "2024-07-04";
      expect(nextLectureWeek({ startDate, weeks: null, nowMs })).toEqual({
        week: 4,
      });
    });

    it("returns next week when weeks is 0 (treated as no limit)", () => {
      const startDate = "2024-07-04";
      expect(nextLectureWeek({ startDate, weeks: 0, nowMs })).toEqual({
        week: 4,
      });
    });
  });

  describe("Branch 5: In-progress, final week is underway", () => {
    it("returns skip when next week exceeds total weeks", () => {
      // Course started 2024-07-11 (week 2)
      // next = 3, weeks = 2, so 3 > 2
      const startDate = "2024-07-11";
      expect(nextLectureWeek({ startDate, weeks: 2, nowMs })).toEqual({
        skip: "final week is underway",
      });
    });

    it("returns skip when next week equals total weeks + 1", () => {
      // Course started 2024-07-04 (week 3)
      // next = 4, weeks = 3, so 4 > 3
      const startDate = "2024-07-04";
      expect(nextLectureWeek({ startDate, weeks: 3, nowMs })).toEqual({
        skip: "final week is underway",
      });
    });

    it("returns skip when on last week", () => {
      // Course started 2024-06-27 (21 days ago, week 4)
      // next = 5, weeks = 4, so 5 > 4
      const startDate = "2024-06-27";
      expect(nextLectureWeek({ startDate, weeks: 4, nowMs })).toEqual({
        skip: "final week is underway",
      });
    });
  });

  describe("Branch 6: Complete", () => {
    it("returns skip when course is complete (rawWeek > weeks)", () => {
      // Course started 2024-06-27 (21 days ago, week 4)
      // weeks = 3, so 4 > 3 -> complete
      const startDate = "2024-06-27";
      expect(nextLectureWeek({ startDate, weeks: 3, nowMs })).toEqual({
        skip: "course is complete",
      });
    });

    it("returns skip when course is far past completion", () => {
      // Course started 2024-05-30 (49 days ago, week 8)
      // weeks = 5, so 8 > 5 -> complete
      const startDate = "2024-05-30";
      expect(nextLectureWeek({ startDate, weeks: 5, nowMs })).toEqual({
        skip: "course is complete",
      });
    });

    it("returns skip when course is barely past completion", () => {
      // Course started 2024-07-18 (today, week 1)
      // weeks = 0 (treated as no positive week limit, so complete is checked as 1 > 0)
      // Actually, courseProgressStatus only returns "complete" if rawWeek > totalWeeks AND totalWeeks > 0
      // So we need weeks > 0. Let me recalculate:
      // Course started 2024-06-20 (28 days ago, week 5)
      // weeks = 4, so 5 > 4 -> complete
      const startDate = "2024-06-20";
      expect(nextLectureWeek({ startDate, weeks: 4, nowMs })).toEqual({
        skip: "course is complete",
      });
    });
  });

  describe("Edge cases", () => {
    it("handles weeks as null correctly in in-progress state", () => {
      // Ensures that when weeks is null, next week is always returned
      const startDate = "2024-07-04";
      expect(nextLectureWeek({ startDate, weeks: null, nowMs })).toEqual({
        week: 4,
      });
    });

    it("handles today as start date (week 1, in-progress)", () => {
      const startDate = "2024-07-18";
      expect(nextLectureWeek({ startDate, weeks: 5, nowMs })).toEqual({
        week: 2,
      });
    });

    it("handles a course exactly at 7-day boundary (inclusive)", () => {
      // 2024-07-25 is exactly 7 days from 2024-07-18
      const startDate = "2024-07-25";
      expect(nextLectureWeek({ startDate, weeks: 5, nowMs })).toEqual({
        week: 1,
      });
    });

    it("handles a course just past 7-day boundary (exclusive)", () => {
      // 2024-07-26 is 8 days from 2024-07-18
      const startDate = "2024-07-26";
      expect(nextLectureWeek({ startDate, weeks: 5, nowMs })).toEqual({
        skip: "starts later than next week",
      });
    });
  });

  describe("rawWeek override parameter", () => {
    it("uses supplied rawWeek instead of computing from startDate", () => {
      // Supply rawWeek = 2 directly (course is in week 2)
      expect(nextLectureWeek({ startDate: null, weeks: 5, nowMs, rawWeek: 2 })).toEqual({
        week: 3,
      });
    });

    it("returns next week when supplied rawWeek is in-progress", () => {
      // Supplied rawWeek = 1, should return week 2
      expect(nextLectureWeek({ startDate: null, weeks: 10, nowMs, rawWeek: 1 })).toEqual({
        week: 2,
      });
    });

    it("returns skip when supplied rawWeek indicates complete course", () => {
      // rawWeek = 5 but weeks = 4 -> complete
      expect(nextLectureWeek({ startDate: null, weeks: 4, nowMs, rawWeek: 5 })).toEqual({
        skip: "course is complete",
      });
    });

    it("returns skip when supplied rawWeek indicates final week underway", () => {
      // rawWeek = 4, weeks = 4, next = 5 > 4
      expect(nextLectureWeek({ startDate: null, weeks: 4, nowMs, rawWeek: 4 })).toEqual({
        skip: "final week is underway",
      });
    });

    it("returns skip when rawWeek is null and no startDate", () => {
      expect(nextLectureWeek({ startDate: null, weeks: 5, nowMs, rawWeek: null })).toEqual({
        skip: "no start date",
      });
    });

    it("ignores startDate when rawWeek is supplied", () => {
      // Even though course starts on 2024-07-26 (8 days away), supplying rawWeek should override
      const startDate = "2024-07-26";
      expect(nextLectureWeek({ startDate, weeks: 5, nowMs, rawWeek: 2 })).toEqual({
        week: 3,
      });
    });

    it("still enforces week bounds when rawWeek is supplied", () => {
      // rawWeek = 10, weeks = 5 -> complete
      expect(nextLectureWeek({ startDate: null, weeks: 5, nowMs, rawWeek: 10 })).toEqual({
        skip: "course is complete",
      });
    });

    it("uses supplied rawWeek when no startDate available (e.g., from deadlines)", () => {
      // Simulate: deadline-based resolver found week 3, no startDate on tile
      expect(nextLectureWeek({ startDate: null, weeks: 8, nowMs, rawWeek: 3 })).toEqual({
        week: 4,
      });
    });

    it("returns skip when rawWeek is 0 (not-started) with no startDate", () => {
      // Can't determine if course starts within 7 days without startDate
      expect(nextLectureWeek({ startDate: null, weeks: 10, nowMs, rawWeek: 0 })).toEqual({
        skip: "starts later than next week",
      });
    });
  });
});

describe("mapLiveModulesForTopic", () => {
  it("maps Canvas modules to resolveWeekTopic shape", () => {
    const canvasModules = [
      {
        id: 101,
        name: "Week 1: Introduction",
        position: 1,
        items: [{ title: "Slides" }, { title: "Notes" }, { title: "Recording" }],
      },
      {
        id: 102,
        name: "Week 2: Fundamentals",
        position: 2,
        items: [{ title: "Video" }],
      },
    ];
    const result = mapLiveModulesForTopic(canvasModules);
    expect(result).toEqual([
      {
        id: 101,
        title: "Week 1: Introduction",
        position: 1,
        items: [{ title: "Slides" }, { title: "Notes" }, { title: "Recording" }],
      },
      {
        id: 102,
        title: "Week 2: Fundamentals",
        position: 2,
        items: [{ title: "Video" }],
      },
    ]);
  });

  it("limits items to first 6", () => {
    const canvasModules = [
      {
        id: 101,
        name: "Week 1: Topic",
        position: 1,
        items: [
          { title: "Item 1" },
          { title: "Item 2" },
          { title: "Item 3" },
          { title: "Item 4" },
          { title: "Item 5" },
          { title: "Item 6" },
          { title: "Item 7" },
          { title: "Item 8" },
        ],
      },
    ];
    const result = mapLiveModulesForTopic(canvasModules);
    expect(result[0].items).toHaveLength(6);
    expect(result[0].items.map((i) => i.title)).toEqual(["Item 1", "Item 2", "Item 3", "Item 4", "Item 5", "Item 6"]);
  });

  it("handles empty input", () => {
    const result = mapLiveModulesForTopic([]);
    expect(result).toEqual([]);
  });

  it("handles modules with no items", () => {
    const canvasModules = [
      {
        id: 101,
        name: "Week 1: Topic",
        position: 1,
        items: [],
      },
    ];
    const result = mapLiveModulesForTopic(canvasModules);
    expect(result).toEqual([
      {
        id: 101,
        title: "Week 1: Topic",
        position: 1,
        items: [],
      },
    ]);
  });

  it("handles modules with missing item titles", () => {
    const canvasModules = [
      {
        id: 101,
        name: "Week 1: Topic",
        position: 1,
        items: [{ title: "Item 1" }, { title: "" }],
      },
    ];
    const result = mapLiveModulesForTopic(canvasModules);
    expect(result[0].items).toEqual([{ title: "Item 1" }, { title: "" }]);
  });
});
