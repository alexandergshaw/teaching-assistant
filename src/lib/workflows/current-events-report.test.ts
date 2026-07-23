import { describe, it, expect } from "vitest";
import {
  clampMaxTopics,
  clampItemsPerTopic,
  parseTopicList,
  parseTopicItems,
  dedupeSourcesByUrl,
  buildCurrentEventsReport,
} from "./current-events-report";

describe("clampMaxTopics", () => {
  it("defaults to 6 for blank/invalid input", () => {
    expect(clampMaxTopics(undefined)).toBe(6);
    expect(clampMaxTopics("")).toBe(6);
    expect(clampMaxTopics("not a number")).toBe(6);
  });

  it("clamps to [1, 12]", () => {
    expect(clampMaxTopics(0)).toBe(1);
    expect(clampMaxTopics(-5)).toBe(1);
    expect(clampMaxTopics(20)).toBe(12);
    expect(clampMaxTopics(4)).toBe(4);
    expect(clampMaxTopics("8")).toBe(8);
  });
});

describe("clampItemsPerTopic", () => {
  it("defaults to 5 for blank/invalid input", () => {
    expect(clampItemsPerTopic(undefined)).toBe(5);
    expect(clampItemsPerTopic("")).toBe(5);
    expect(clampItemsPerTopic("nope")).toBe(5);
  });

  it("clamps to [1, 10]", () => {
    expect(clampItemsPerTopic(0)).toBe(1);
    expect(clampItemsPerTopic(50)).toBe(10);
    expect(clampItemsPerTopic(3)).toBe(3);
  });
});

describe("parseTopicList", () => {
  it("parses JSON topics", () => {
    const text = `{"topics":[{"topic":"Neural Networks","entities":"backprop, GPT"},{"topic":"Databases","entities":"SQL"}]}`;
    const topics = parseTopicList(text, 6);
    expect(topics).toEqual([
      { topic: "Neural Networks", entities: "backprop, GPT" },
      { topic: "Databases", entities: "SQL" },
    ]);
  });

  it("caps JSON topics at maxTopics", () => {
    const text = `{"topics":[{"topic":"A"},{"topic":"B"},{"topic":"C"}]}`;
    expect(parseTopicList(text, 2)).toHaveLength(2);
  });

  it("falls back to tolerant line parsing when JSON is absent", () => {
    const text = "- Neural Networks - backprop, GPT\n- Databases - SQL\n1. Compilers";
    const topics = parseTopicList(text, 6);
    expect(topics.map((t) => t.topic)).toEqual(["Neural Networks", "Databases", "Compilers"]);
    expect(topics[0].entities).toBe("backprop, GPT");
  });

  it("returns [] for junk input", () => {
    expect(parseTopicList("", 6)).toEqual([]);
    expect(parseTopicList("   \n  \n", 6)).toEqual([]);
  });
});

describe("parseTopicItems", () => {
  it("parses a well-formed items response", () => {
    const text = `{"items":[{"headline":"Big launch","date":"2026-07-01","angle":"news","whyItMatters":"relevant","url":"https://example.com/a","background":false}]}`;
    const items = parseTopicItems(text);
    expect(items).toHaveLength(1);
    expect(items[0].headline).toBe("Big launch");
    expect(items[0].background).toBe(false);
  });

  it("filters out items with no headline", () => {
    const text = `{"items":[{"headline":"","date":"2026-07-01"},{"headline":"Kept"}]}`;
    const items = parseTopicItems(text);
    expect(items).toHaveLength(1);
    expect(items[0].headline).toBe("Kept");
  });

  it("returns [] for malformed JSON or missing items array", () => {
    expect(parseTopicItems("not json at all")).toEqual([]);
    expect(parseTopicItems(`{"foo":"bar"}`)).toEqual([]);
  });
});

describe("dedupeSourcesByUrl", () => {
  it("keeps the first-seen title for each URL", () => {
    const sources = [
      { title: "First", uri: "https://a.com" },
      { title: "Duplicate", uri: "https://a.com" },
      { title: "Second", uri: "https://b.com" },
    ];
    expect(dedupeSourcesByUrl(sources)).toEqual([
      { title: "First", uri: "https://a.com" },
      { title: "Second", uri: "https://b.com" },
    ]);
  });

  it("drops sources with an empty uri", () => {
    expect(dedupeSourcesByUrl([{ title: "No URL", uri: "" }])).toEqual([]);
  });
});

describe("buildCurrentEventsReport", () => {
  it("includes every required section, numbered sources, and notes", () => {
    const report = buildCurrentEventsReport({
      window: "the past 30 days",
      itemsPerTopic: 5,
      sections: [
        {
          topic: "Neural Networks",
          items: [
            {
              headline: "New model released",
              date: "2026-07-01",
              angle: "news",
              whyItMatters: "students should know",
              url: "https://example.com/a",
              background: false,
            },
          ],
        },
      ],
      themes: ["AI adoption accelerating"],
      whatChanged: "Model capabilities improved.",
      discussionPrompts: ["What are the ethical implications?"],
      sources: [
        { title: "Example A", uri: "https://example.com/a" },
        { title: "Example B", uri: "https://example.com/b" },
      ],
      notes: ["Topic \"Databases\" failed: HTTP 500"],
      degraded: false,
      generatedAt: new Date("2026-07-23T00:00:00.000Z"),
    });

    expect(report).toContain("CURRENT EVENTS REPORT");
    expect(report).toContain("Generated: 2026-07-23T00:00:00.000Z");
    expect(report).toContain("Recency window: the past 30 days");
    expect(report).toContain("Coverage: 1 topic(s) x 5 item(s), 2 source(s)");
    expect(report).toContain("TOPIC: Neural Networks");
    expect(report).toContain("New model released");
    expect(report).toContain("CROSS-CUTTING THEMES");
    expect(report).toContain("AI adoption accelerating");
    expect(report).toContain("WHAT CHANGED SINCE THIS DECK WAS WRITTEN");
    expect(report).toContain("DISCUSSION PROMPTS");
    expect(report).toContain("1. What are the ethical implications?");
    expect(report).toContain("SOURCES");
    expect(report).toContain("1. Example A: https://example.com/a");
    expect(report).toContain("2. Example B: https://example.com/b");
    expect(report).toContain("NOTES");
    expect(report).toContain('Topic "Databases" failed: HTTP 500');
  });

  it("renders an explicit no-sources line when there are zero sources", () => {
    const report = buildCurrentEventsReport({
      window: "the past 30 days",
      itemsPerTopic: 5,
      sections: [],
      themes: [],
      whatChanged: "",
      discussionPrompts: [],
      sources: [],
      notes: [],
      degraded: false,
    });
    expect(report).toContain("No web sources were returned for this report.");
  });

  it("marks the coverage line as degraded when in fallback mode", () => {
    const report = buildCurrentEventsReport({
      window: "the past 30 days",
      itemsPerTopic: 5,
      sections: [],
      themes: [],
      whatChanged: "",
      discussionPrompts: [],
      sources: [],
      notes: ["degraded"],
      degraded: true,
    });
    expect(report).toContain("DEGRADED");
  });
});
