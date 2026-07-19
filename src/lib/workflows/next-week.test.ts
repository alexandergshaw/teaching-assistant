import { describe, it, expect } from "vitest";
import { nextLectureWeek, resolveWeekTopic } from "./next-week";

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
});

describe("resolveWeekTopic", () => {
  describe("Priority 1: Export modules", () => {
    it("resolves week from export module with 'Week N' format", () => {
      const modules = [
        { title: "Week 1: Introduction", position: 1, items: [{ title: "Slides" }, { title: "Notes" }] },
        { title: "Week 2: Fundamentals", position: 2, items: [{ title: "Video" }] },
      ];
      const result = resolveWeekTopic({ modules, csvData: null, topics: null, week: 1 });
      expect(result).toEqual({ topic: "Introduction", summary: "Slides; Notes", source: "export" });
    });

    it("resolves week from export module with 'Module N' format (case insensitive)", () => {
      const modules = [
        { title: "module 1: Basics", position: 1, items: [{ title: "Content A" }] },
        { title: "Module 2: Advanced", position: 2, items: [{ title: "Content B" }] },
      ];
      const result = resolveWeekTopic({ modules, csvData: null, topics: null, week: 2 });
      expect(result).toEqual({ topic: "Advanced", summary: "Content B", source: "export" });
    });

    it("strips prefix separators: colon, dash, pipe, whitespace", () => {
      const modules = [
        { title: "Week 1: Topic1", position: 1, items: [] },
        { title: "Week 2- Topic2", position: 2, items: [] },
        { title: "Week 3| Topic3", position: 3, items: [] },
        { title: "Week 4  Topic4", position: 4, items: [] },
      ];
      expect(resolveWeekTopic({ modules, csvData: null, topics: null, week: 1 })).toEqual({
        topic: "Topic1",
        summary: "",
        source: "export",
      });
      expect(resolveWeekTopic({ modules, csvData: null, topics: null, week: 2 })).toEqual({
        topic: "Topic2",
        summary: "",
        source: "export",
      });
      expect(resolveWeekTopic({ modules, csvData: null, topics: null, week: 3 })).toEqual({
        topic: "Topic3",
        summary: "",
        source: "export",
      });
      expect(resolveWeekTopic({ modules, csvData: null, topics: null, week: 4 })).toEqual({
        topic: "Topic4",
        summary: "",
        source: "export",
      });
    });

    it("includes up to 6 item titles in summary", () => {
      const modules = [
        {
          title: "Week 1: Topic",
          position: 1,
          items: [
            { title: "Item 1" },
            { title: "Item 2" },
            { title: "Item 3" },
            { title: "Item 4" },
            { title: "Item 5" },
            { title: "Item 6" },
            { title: "Item 7" },
          ],
        },
      ];
      const result = resolveWeekTopic({ modules, csvData: null, topics: null, week: 1 });
      expect(result).toEqual({
        topic: "Topic",
        summary: "Item 1; Item 2; Item 3; Item 4; Item 5; Item 6",
        source: "export",
      });
    });

    it("falls through when module remainder is empty", () => {
      const modules = [{ title: "Week 1:", position: 1, items: [] }];
      const csvData = "Week,Topic\n1,CSV Topic";
      const result = resolveWeekTopic({ modules, csvData, topics: null, week: 1 });
      expect(result).toEqual({
        topic: "CSV Topic",
        summary: "",
        source: "schedule",
      });
    });

    it("reports matched but empty remainder in skip diagnostic", () => {
      const modules = [{ title: "Week 6:", position: 1, items: [] }];
      const result = resolveWeekTopic({
        modules,
        csvData: null,
        topics: null,
        week: 6,
      }) as { skip: string };
      expect(result.skip).toContain("week 6 not found -");
      expect(result.skip).toContain("module 6's title has no topic text");
      expect(result.skip).toContain("no schedule CSV");
      expect(result.skip).toContain("no topics list");
      // Verify all three fragments are present
      const fragments = result.skip.split(" - ")[1].split(", ");
      expect(fragments.length).toBe(3);
    });

    it("returns first match by position order", () => {
      const modules = [
        { title: "Week 1: First", position: 1, items: [] },
        { title: "Week 1: Second", position: 2, items: [] },
      ];
      const result = resolveWeekTopic({ modules, csvData: null, topics: null, week: 1 });
      expect((result as { topic: string }).topic).toBe("First");
    });
  });

  describe("Priority 2: Schedule CSV", () => {
    it("resolves week from schedule CSV when no export module matches", () => {
      const csvData = "Week,Topic,Summary\n1,CSV Topic,CSV Summary";
      const result = resolveWeekTopic({
        modules: null,
        csvData,
        topics: null,
        week: 1,
      });
      expect(result).toEqual({
        topic: "CSV Topic",
        summary: "CSV Summary",
        source: "schedule",
      });
    });

    it("trims topic and summary from CSV", () => {
      const csvData = "Week,Topic,Summary\n1,  Topic with spaces  ,  Summary text  ";
      const result = resolveWeekTopic({
        modules: null,
        csvData,
        topics: null,
        week: 1,
      });
      expect(result).toEqual({
        topic: "Topic with spaces",
        summary: "Summary text",
        source: "schedule",
      });
    });

    it("falls through when CSV row topic is empty", () => {
      const csvData = "Week,Topic\n1,";
      const topics = "Topic from List";
      const result = resolveWeekTopic({
        modules: null,
        csvData,
        topics,
        week: 1,
      });
      expect(result as { topic: string; summary: string; source: string }).toEqual({
        topic: "Topic from List",
        summary: "",
        source: "topics",
      });
    });
  });

  describe("Priority 3: Topics list", () => {
    it("resolves week from topics list when no export or CSV", () => {
      const topics = "Week 1 Topic\nWeek 2 Topic\nWeek 3 Topic";
      const result = resolveWeekTopic({
        modules: null,
        csvData: null,
        topics,
        week: 1,
      });
      expect(result).toEqual({
        topic: "Week 1 Topic",
        summary: "",
        source: "topics",
      });
    });

    it("trims whitespace from topics list", () => {
      const topics = "  Topic 1  \n  Topic 2  \n  Topic 3  ";
      const result = resolveWeekTopic({
        modules: null,
        csvData: null,
        topics,
        week: 2,
      });
      expect(result).toEqual({
        topic: "Topic 2",
        summary: "",
        source: "topics",
      });
    });

    it("falls through when topics line is empty", () => {
      const topics = "Topic 1\n\nTopic 3";
      const result = resolveWeekTopic({
        modules: null,
        csvData: null,
        topics,
        week: 2,
      }) as { skip: string };
      expect(result.skip).toContain("week 2 not found");
    });
  });

  describe("Priority 4: Skip with diagnostic", () => {
    it("returns full three-fragment diagnostic when all sources are absent", () => {
      const result = resolveWeekTopic({
        modules: null,
        csvData: null,
        topics: null,
        week: 1,
      });
      expect(result).toEqual({
        skip: "week 1 not found - no LMS export on the tile, no schedule CSV, no topics list",
      });
    });

    it("includes LMS export module numbers in diagnostic using min-max range", () => {
      const modules = [
        { title: "Week 1: Topic", position: 1, items: [] },
        { title: "Week 3: Topic", position: 2, items: [] },
      ];
      const result = resolveWeekTopic({
        modules,
        csvData: null,
        topics: null,
        week: 2,
      }) as { skip: string };
      expect(result.skip).toContain("LMS export has modules 1-3");
    });

    it("uses min-max format for contiguous module numbers in diagnostic", () => {
      const modules = [
        { title: "Week 1: Topic", position: 1, items: [] },
        { title: "Week 2: Topic", position: 2, items: [] },
        { title: "Week 3: Topic", position: 3, items: [] },
        { title: "Week 4: Topic", position: 4, items: [] },
        { title: "Week 5: Topic", position: 5, items: [] },
      ];
      const result = resolveWeekTopic({
        modules,
        csvData: null,
        topics: null,
        week: 6,
      }) as { skip: string };
      expect(result.skip).toContain("LMS export has modules 1-5");
    });

    it("says 'modules none numbered' when export has no numbered modules", () => {
      const modules = [
        { title: "Introduction", position: 1, items: [] },
        { title: "Conclusion", position: 2, items: [] },
      ];
      const result = resolveWeekTopic({
        modules,
        csvData: null,
        topics: null,
        week: 1,
      }) as { skip: string };
      expect(result.skip).toContain("LMS export has modules none numbered");
    });

    it("reports max week covered by CSV in diagnostic", () => {
      const csvData = "Week,Topic\n1,T1\n2,T2\n5,T5";
      const result = resolveWeekTopic({
        modules: null,
        csvData,
        topics: null,
        week: 10,
      }) as { skip: string };
      expect(result.skip).toContain("the schedule CSV covers weeks 1-5");
    });

    it("reports when CSV row exists but has no topic", () => {
      const csvData = "Week,Topic\n1,T1\n2,";
      const result = resolveWeekTopic({
        modules: null,
        csvData,
        topics: null,
        week: 2,
      }) as { skip: string };
      expect(result.skip).toContain("week 2's schedule row has no topic");
    });

    it("reports topics list line count in diagnostic", () => {
      const topics = "T1\nT2\nT3";
      const result = resolveWeekTopic({
        modules: null,
        csvData: null,
        topics,
        week: 5,
      }) as { skip: string };
      expect(result.skip).toContain("the topics list has 3 line(s)");
    });

    it("includes all three fragments in a single diagnostic", () => {
      const modules = [{ title: "Module 1: T1", position: 1, items: [] }];
      const csvData = "Week,Topic\n1,T1";
      const topics = "T1\nT2";
      const result = resolveWeekTopic({
        modules,
        csvData,
        topics,
        week: 5,
      }) as { skip: string };
      expect(result.skip).toContain("week 5 not found -");
      expect(result.skip).toContain("LMS export has modules 1");
      expect(result.skip).toContain("the schedule CSV covers weeks 1-1");
      expect(result.skip).toContain("the topics list has 2 line(s)");
      // Verify all three are joined with ", "
      const fragments = result.skip.split(" - ")[1].split(", ");
      expect(fragments.length).toBe(3);
    });
  });

  describe("Source priority correctness", () => {
    it("prefers export over CSV", () => {
      const modules = [{ title: "Week 1: From Export", position: 1, items: [] }];
      const csvData = "Week,Topic\n1,From CSV";
      const result = resolveWeekTopic({
        modules,
        csvData,
        topics: null,
        week: 1,
      });
      expect(result).toEqual({
        topic: "From Export",
        summary: "",
        source: "export",
      });
    });

    it("prefers export over topics list", () => {
      const modules = [{ title: "Week 1: From Export", position: 1, items: [] }];
      const topics = "From Topics";
      const result = resolveWeekTopic({
        modules,
        csvData: null,
        topics,
        week: 1,
      });
      expect(result).toEqual({
        topic: "From Export",
        summary: "",
        source: "export",
      });
    });

    it("prefers CSV over topics list", () => {
      const csvData = "Week,Topic\n1,From CSV";
      const topics = "From Topics";
      const result = resolveWeekTopic({
        modules: null,
        csvData,
        topics,
        week: 1,
      });
      expect(result).toEqual({
        topic: "From CSV",
        summary: "",
        source: "schedule",
      });
    });
  });

  describe("Edge cases", () => {
    it("handles empty modules array", () => {
      const csvData = "Week,Topic\n1,CSV Topic";
      const result = resolveWeekTopic({
        modules: [],
        csvData,
        topics: null,
        week: 1,
      });
      expect(result).toEqual({
        topic: "CSV Topic",
        summary: "",
        source: "schedule",
      });
    });

    it("handles empty CSV", () => {
      const topics = "Topic 1";
      const result = resolveWeekTopic({
        modules: null,
        csvData: "",
        topics,
        week: 1,
      });
      expect(result).toEqual({
        topic: "Topic 1",
        summary: "",
        source: "topics",
      });
    });

    it("handles empty topics string", () => {
      const modules = [{ title: "Week 1: Module Topic", position: 1, items: [] }];
      const result = resolveWeekTopic({
        modules,
        csvData: null,
        topics: "",
        week: 1,
      });
      expect(result).toEqual({
        topic: "Module Topic",
        summary: "",
        source: "export",
      });
    });

    it("a schedule row with a blank topic falls through to the topics list, never resolving as schedule", () => {
      const csvData = "Week,Topic,Summary,Assignment,Test\n1,,Only a summary here,,";
      const withTopics = resolveWeekTopic({
        modules: null,
        csvData,
        topics: "Fallback Topic",
        week: 1,
      });
      expect(withTopics).toEqual({
        topic: "Fallback Topic",
        summary: "",
        source: "topics",
      });

      const withoutTopics = resolveWeekTopic({
        modules: null,
        csvData,
        topics: null,
        week: 1,
      });
      expect("skip" in withoutTopics).toBe(true);
    });
  });
});
