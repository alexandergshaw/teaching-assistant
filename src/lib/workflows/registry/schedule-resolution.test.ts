import { describe, it, expect } from "vitest";
import { resolveRepolessSchedule, parseTargetedModule } from "./schedule-resolution";
import type { ScheduleWeekPlan } from "@/app/actions";

function week(overrides: Partial<ScheduleWeekPlan> = {}): ScheduleWeekPlan {
  return {
    week: 1,
    topic: "Intro",
    summary: "",
    assignmentTitle: null,
    assignmentSlug: null,
    testName: null,
    ...overrides,
  };
}

describe("resolveRepolessSchedule", () => {
  it("accepts a JSON-string bound value and parses it", () => {
    const bound = JSON.stringify([week({ topic: "Variables" })]);
    const result = resolveRepolessSchedule(bound, { csvData: null, topics: null });
    expect(result.schedule).toEqual([week({ topic: "Variables" })]);
    expect(result.note).toBe("schedule from the bound input");
  });

  it("accepts an already-parsed array bound value", () => {
    const bound = [week({ topic: "Loops" })];
    const result = resolveRepolessSchedule(bound, { csvData: null, topics: null });
    expect(result.schedule).toEqual([week({ topic: "Loops" })]);
    expect(result.note).toBe("schedule from the bound input");
  });

  it("falls through when the bound value is malformed JSON", () => {
    const csvData = "week,topic,summary,assignment,test\n1,From CSV,,,";
    const result = resolveRepolessSchedule("{not json", { csvData, topics: null });
    expect(result.schedule[0].topic).toBe("From CSV");
    expect(result.note).toBe("schedule from the tile's schedule CSV");
  });

  it("filters topic-less bound weeks then falls to csv when csv has topics", () => {
    const bound = [week({ topic: "" }), week({ week: 2, topic: "   " })];
    const csvData = "week,topic,summary,assignment,test\n1,From CSV,,,";
    const result = resolveRepolessSchedule(bound, { csvData, topics: null });
    expect(result.schedule[0].topic).toBe("From CSV");
    expect(result.note).toBe("schedule from the tile's schedule CSV");
    expect(result.tried[0]).toContain("bound schedule input (0 of 2 week(s) have a topic)");
  });

  it("falls to topics-line synthesis when csv is topic-less, numbering weeks in order", () => {
    const csvData = "week,topic,summary,assignment,test\n1,,,,";
    const topics = "Intro to Testing\n\nAdvanced Testing\n";
    const result = resolveRepolessSchedule(undefined, { csvData, topics });
    expect(result.schedule).toEqual([
      { week: 1, topic: "Intro to Testing", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
      { week: 2, topic: "Advanced Testing", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    ]);
    expect(result.note).toBe("schedule derived from the tile's topics (2 weeks)");
  });

  it("returns an empty schedule and null note when every tier is empty", () => {
    const result = resolveRepolessSchedule(undefined, { csvData: null, topics: null });
    expect(result.schedule).toEqual([]);
    expect(result.note).toBeNull();
    expect(result.tried).toHaveLength(4);
    expect(result.tried.join(" ")).toContain("bound schedule input (none provided)");
    expect(result.tried.join(" ")).toContain("the tile's schedule CSV (none set)");
    expect(result.tried.join(" ")).toContain("LMS/export module names (none available)");
    expect(result.tried.join(" ")).toContain("the tile's topics field (blank)");
  });

  // AC5: CSV topic-column aliases
  describe("CSV topic-column aliases", () => {
    it("uses an alias header when the exact topic column is entirely blank", () => {
      const csvData = "week,topic,topics,summary\n1,,Intro to Testing,\n2,,Advanced Testing,";
      const result = resolveRepolessSchedule(undefined, { csvData, topics: null });
      expect(result.schedule.map((w) => w.topic)).toEqual(["Intro to Testing", "Advanced Testing"]);
      expect(result.note).toBe('schedule from the tile\'s schedule CSV (topics read from the "topics" column)');
    });

    it("prefers the exact topic column when it has content, even if aliases also exist", () => {
      const csvData = "week,topic,topics\n1,Real Topic,Alias Topic";
      const result = resolveRepolessSchedule(undefined, { csvData, topics: null });
      expect(result.schedule[0].topic).toBe("Real Topic");
      expect(result.note).toBe("schedule from the tile's schedule CSV");
    });

    it("falls through when no usable topic column exists at all (exact or alias)", () => {
      const csvData = "week,notes\n1,something";
      const result = resolveRepolessSchedule(undefined, { csvData, topics: "Fallback Topic" });
      expect(result.schedule[0].topic).toBe("Fallback Topic");
      expect(result.note).toBe("schedule derived from the tile's topics (1 weeks)");
    });

    it("picks the first usable alias in priority order, skipping blank ones", () => {
      const csvData = "week,topic,title,subject\n1,,,Real Subject";
      const result = resolveRepolessSchedule(undefined, { csvData, topics: null });
      expect(result.schedule[0].topic).toBe("Real Subject");
      expect(result.note).toContain('"subject"');
    });
  });

  // AC3: LMS/export module-names tier
  describe("LMS/export module-names tier", () => {
    it("maps module names to numbered weeks when the CSV and bound tiers are empty", () => {
      const result = resolveRepolessSchedule(undefined, { csvData: null, topics: null }, [
        "Intro to Programming",
        "Loops and Conditionals",
      ]);
      expect(result.schedule).toEqual([
        { week: 1, topic: "Intro to Programming", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
        { week: 2, topic: "Loops and Conditionals", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
      ]);
      expect(result.note).toBe("schedule derived from 2 LMS module name(s)");
    });

    it("an empty module-name list falls through to the topics tier", () => {
      const result = resolveRepolessSchedule(undefined, { csvData: null, topics: "Fallback Line" }, []);
      expect(result.note).toBe("schedule derived from the tile's topics (1 weeks)");
    });

    it("drops obvious non-content modules (review/exam) when doing so does not empty the list", () => {
      const result = resolveRepolessSchedule(undefined, { csvData: null, topics: null }, [
        "Intro to Programming",
        "Midterm Exam",
        "Loops and Conditionals",
      ]);
      expect(result.schedule.map((w) => w.topic)).toEqual(["Intro to Programming", "Loops and Conditionals"]);
      expect(result.note).toContain("non-content modules skipped");
    });

    it("keeps every module name when filtering would empty the list", () => {
      const result = resolveRepolessSchedule(undefined, { csvData: null, topics: null }, [
        "Midterm Exam",
        "Final Exam Review",
      ]);
      expect(result.schedule.map((w) => w.topic)).toEqual(["Midterm Exam", "Final Exam Review"]);
      expect(result.note).not.toContain("skipped");
    });

    // AC2: front-matter modules ("Start Here", etc) are not content weeks.
    it("drops front-matter modules (Start Here) when doing so does not empty the list", () => {
      const result = resolveRepolessSchedule(undefined, { csvData: null, topics: null }, [
        "Start Here",
        "Intro to Programming",
        "Loops and Conditionals",
      ]);
      expect(result.schedule.map((w) => w.topic)).toEqual(["Intro to Programming", "Loops and Conditionals"]);
      expect(result.note).toContain("front-matter modules skipped");
    });

    it("keeps every module name when only front-matter modules are present (keep-all safeguard)", () => {
      const result = resolveRepolessSchedule(undefined, { csvData: null, topics: null }, ["Start Here"]);
      expect(result.schedule.map((w) => w.topic)).toEqual(["Start Here"]);
      expect(result.note).not.toContain("skipped");
    });

    it("names both kinds of filtering when both non-content and front-matter modules are dropped", () => {
      const result = resolveRepolessSchedule(undefined, { csvData: null, topics: null }, [
        "Start Here",
        "Intro to Programming",
        "Midterm Exam",
      ]);
      expect(result.schedule.map((w) => w.topic)).toEqual(["Intro to Programming"]);
      expect(result.note).toContain("non-content and front-matter modules skipped");
    });
  });
});

describe("parseTargetedModule", () => {
  it("splits 'Module 07: Algorithms and Data Structures' into week 7 and its topic", () => {
    expect(parseTargetedModule("Module 07: Algorithms and Data Structures")).toEqual({
      week: 7,
      topic: "Algorithms and Data Structures",
    });
  });

  it("splits 'Week 5 - Loops' into week 5 and its topic", () => {
    expect(parseTargetedModule("Week 5 - Loops")).toEqual({ week: 5, topic: "Loops" });
  });

  it("'Module 3' (no separator) yields week 3 and an empty topic", () => {
    expect(parseTargetedModule("Module 3")).toEqual({ week: 3, topic: "" });
  });

  it("'Algorithms' (no number, no separator) yields no week and the whole string as topic", () => {
    expect(parseTargetedModule("Algorithms")).toEqual({ week: null, topic: "Algorithms" });
  });

  it("empty input yields no week and an empty topic", () => {
    expect(parseTargetedModule("")).toEqual({ week: null, topic: "" });
  });
});
