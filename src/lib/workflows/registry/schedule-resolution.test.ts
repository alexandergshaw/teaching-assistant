import { describe, it, expect } from "vitest";
import { resolveRepolessSchedule } from "./schedule-resolution";
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
    expect(result.tried).toHaveLength(3);
    expect(result.tried.join(" ")).toContain("bound schedule input (none provided)");
    expect(result.tried.join(" ")).toContain("the tile's schedule CSV (none set)");
    expect(result.tried.join(" ")).toContain("the tile's topics field (blank)");
  });
});
