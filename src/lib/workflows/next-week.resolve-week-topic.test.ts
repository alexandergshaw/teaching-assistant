import { describe, it, expect } from "vitest";
import { resolveWeekTopic } from "./next-week";

describe("resolveWeekTopic", () => {
  describe("Priority 1: Live modules", () => {
    it("resolves week from live module with 'Week N' format", () => {
      const liveModules = [
        { title: "Week 1: Live Introduction", position: 1, items: [{ title: "Slides" }, { title: "Notes" }] },
        { title: "Week 2: Live Fundamentals", position: 2, items: [{ title: "Video" }] },
      ];
      const result = resolveWeekTopic({ liveModules, modules: null, csvData: null, topics: null, week: 1 });
      expect(result).toEqual({
        topic: "Live Introduction",
        summary: "Slides; Notes",
        source: "live",
      });
    });

    it("prefers live module over export module", () => {
      const liveModules = [{ title: "Week 1: From Live", position: 1, items: [] }];
      const modules = [{ title: "Week 1: From Export", position: 1, items: [] }];
      const result = resolveWeekTopic({ liveModules, modules, csvData: null, topics: null, week: 1 });
      expect(result).toEqual({ topic: "From Live", summary: "", source: "live" });
    });

    it("resolves week from live module with 'Module N' format (case insensitive)", () => {
      const liveModules = [
        { title: "module 1: Basics", position: 1, items: [{ title: "Content A" }] },
        { title: "Module 2: Advanced", position: 2, items: [{ title: "Content B" }] },
      ];
      const result = resolveWeekTopic({ liveModules, modules: null, csvData: null, topics: null, week: 2 });
      expect(result).toEqual({ topic: "Advanced", summary: "Content B", source: "live" });
    });

    it("strips prefix separators in live modules: colon, dash, pipe, whitespace", () => {
      const liveModules = [
        { title: "Week 1: Topic1", position: 1, items: [] },
        { title: "Week 2- Topic2", position: 2, items: [] },
        { title: "Week 3| Topic3", position: 3, items: [] },
        { title: "Week 4  Topic4", position: 4, items: [] },
      ];
      expect(resolveWeekTopic({ liveModules, modules: null, csvData: null, topics: null, week: 1 })).toEqual({
        topic: "Topic1",
        summary: "",
        source: "live",
      });
      expect(resolveWeekTopic({ liveModules, modules: null, csvData: null, topics: null, week: 2 })).toEqual({
        topic: "Topic2",
        summary: "",
        source: "live",
      });
    });

    it("includes up to 6 item titles in live summary", () => {
      const liveModules = [
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
      const result = resolveWeekTopic({ liveModules, modules: null, csvData: null, topics: null, week: 1 });
      expect(result).toEqual({
        topic: "Topic",
        summary: "Item 1; Item 2; Item 3; Item 4; Item 5; Item 6",
        source: "live",
      });
    });

    it("falls through when live module remainder is empty (to export)", () => {
      const liveModules = [{ title: "Week 1:", position: 1, items: [] }];
      const modules = [{ title: "Week 1: From Export", position: 1, items: [] }];
      const result = resolveWeekTopic({ liveModules, modules, csvData: null, topics: null, week: 1 });
      expect(result).toEqual({ topic: "From Export", summary: "", source: "export" });
    });

    it("falls through when live modules don't have matching week (to export)", () => {
      const liveModules = [{ title: "Week 2: Topic", position: 1, items: [] }];
      const modules = [{ title: "Week 1: From Export", position: 1, items: [] }];
      const result = resolveWeekTopic({ liveModules, modules, csvData: null, topics: null, week: 1 });
      expect(result).toEqual({ topic: "From Export", summary: "", source: "export" });
    });

    it("reports matched but empty live remainder in skip diagnostic", () => {
      const liveModules = [{ title: "Week 6:", position: 1, items: [] }];
      const result = resolveWeekTopic({
        liveModules,
        modules: null,
        csvData: null,
        topics: null,
        week: 6,
      }) as { skip: string };
      expect(result.skip).toContain("week 6 not found -");
      expect(result.skip).toContain("module 6's live title has no topic text");
    });

    it("handles absent liveModules (backward compatibility)", () => {
      const modules = [{ title: "Week 1: From Export", position: 1, items: [] }];
      const result = resolveWeekTopic({
        liveModules: undefined,
        modules,
        csvData: null,
        topics: null,
        week: 1,
      });
      expect(result).toEqual({ topic: "From Export", summary: "", source: "export" });
    });

    it("handles null liveModules (backward compatibility)", () => {
      const modules = [{ title: "Week 1: From Export", position: 1, items: [] }];
      const result = resolveWeekTopic({ liveModules: null, modules, csvData: null, topics: null, week: 1 });
      expect(result).toEqual({ topic: "From Export", summary: "", source: "export" });
    });

    it("resolves week from live module with underscore separator 'Week_N' format", () => {
      const liveModules = [
        { title: "Week_3: Recursion", position: 1, items: [{ title: "Lesson" }, { title: "Practice" }] },
      ];
      const result = resolveWeekTopic({ liveModules, modules: null, csvData: null, topics: null, week: 3 });
      expect(result).toEqual({
        topic: "Recursion",
        summary: "Lesson; Practice",
        source: "live",
      });
    });

    it("resolves week from live module with dash separator 'Module-N' format", () => {
      const liveModules = [
        { title: "Module-2: Data Structures", position: 1, items: [{ title: "Video" }] },
      ];
      const result = resolveWeekTopic({ liveModules, modules: null, csvData: null, topics: null, week: 2 });
      expect(result).toEqual({
        topic: "Data Structures",
        summary: "Video",
        source: "live",
      });
    });
  });

  describe("Priority 2: Export modules", () => {
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
      // Verify all three fragments are present (no liveModules provided)
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

    it("resolves week from export module with underscore separator 'Week_N' format", () => {
      const modules = [
        { title: "Week_3: Recursion", position: 1, items: [{ title: "Lesson" }, { title: "Practice" }] },
      ];
      const result = resolveWeekTopic({ modules, csvData: null, topics: null, week: 3 });
      expect(result).toEqual({
        topic: "Recursion",
        summary: "Lesson; Practice",
        source: "export",
      });
    });

    it("resolves week from export module with dash separator 'Module-N' format", () => {
      const modules = [
        { title: "Module-4 Sorting", position: 1, items: [{ title: "Algorithm" }, { title: "Examples" }] },
      ];
      const result = resolveWeekTopic({ modules, csvData: null, topics: null, week: 4 });
      expect(result).toEqual({
        topic: "Sorting",
        summary: "Algorithm; Examples",
        source: "export",
      });
    });
  });

  describe("Priority 3: Schedule CSV", () => {
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

  describe("Priority 4: Topics list", () => {
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

  describe("Priority 5: Skip with diagnostic", () => {
    it("returns full three-fragment diagnostic when all sources are absent (no liveModules provided)", () => {
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

    it("includes all four fragments in a single diagnostic when all sources provided but exhausted", () => {
      const liveModules = [{ title: "Module 2: T2", position: 1, items: [] }];
      const modules = [{ title: "Module 1: T1", position: 1, items: [] }];
      const csvData = "Week,Topic\n1,T1";
      const topics = "T1\nT2";
      const result = resolveWeekTopic({
        liveModules,
        modules,
        csvData,
        topics,
        week: 5,
      }) as { skip: string };
      expect(result.skip).toContain("week 5 not found -");
      expect(result.skip).toContain("live LMS has modules 2");
      expect(result.skip).toContain("LMS export has modules 1");
      expect(result.skip).toContain("the schedule CSV covers weeks 1-1");
      expect(result.skip).toContain("the topics list has 2 line(s)");
      // Verify all four are joined with ", "
      const fragments = result.skip.split(" - ")[1].split(", ");
      expect(fragments.length).toBe(4);
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
