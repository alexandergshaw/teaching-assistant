import { describe, it, expect } from "vitest";
import {
  clampMaxTopics,
  clampItemsPerTopic,
  parseTopicList,
  parseTopicItems,
  dedupeSourcesByUrl,
  isPlaceholderUrl,
  verifyItemUrls,
  windowCutoff,
  markOutOfWindow,
  buildCurrentEventsReport,
  buildCurrentEventsDocMarkdown,
  buildCurrentEventsPageText,
  type ParsedTopicItem,
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
    const text = `{"items":[{"headline":"Big launch","date":"2026-07-01","angle":"news","whyItMatters":"relevant","url":"https://real-news-site.test/a","background":false}]}`;
    const items = parseTopicItems(text);
    expect(items).toHaveLength(1);
    expect(items[0].headline).toBe("Big launch");
    expect(items[0].background).toBe(false);
    expect(items[0].url).toBe("https://real-news-site.test/a");
    expect(items[0].unverified).toBeFalsy();
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

  it("rejects a placeholder URL up front: blanked and marked unverified", () => {
    const text = `{"items":[{"headline":"Fabricated","date":"2026-07-01","url":"https://www.example.com/research/x","background":false}]}`;
    const items = parseTopicItems(text);
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("");
    expect(items[0].unverified).toBe(true);
  });
});

describe("isPlaceholderUrl", () => {
  it("flags example.com and its subdomains", () => {
    expect(isPlaceholderUrl("https://www.example.com/research/algorithmic-bias-hiring")).toBe(true);
    expect(isPlaceholderUrl("https://example.com")).toBe(true);
    expect(isPlaceholderUrl("https://engineering.example.com/blog/production-profiling-standards")).toBe(true);
  });

  it("flags example.edu (and other example TLDs)", () => {
    expect(isPlaceholderUrl("https://research.cs.example.edu/benchmarking-python-abstractions")).toBe(true);
    expect(isPlaceholderUrl("https://policy.example.org/algorithmic-accountability-act")).toBe(true);
    expect(isPlaceholderUrl("https://example.net/a")).toBe(true);
  });

  it("flags localhost and bare IP hosts", () => {
    expect(isPlaceholderUrl("http://localhost:3000/a")).toBe(true);
    expect(isPlaceholderUrl("http://127.0.0.1/a")).toBe(true);
  });

  it("does not flag a real host", () => {
    expect(isPlaceholderUrl("https://www.nytimes.com/2026/07/01/technology/some-story.html")).toBe(false);
    expect(isPlaceholderUrl("https://arxiv.org/abs/2026.12345")).toBe(false);
  });

  it("treats garbage / unparseable input as a placeholder", () => {
    expect(isPlaceholderUrl("not a url")).toBe(true);
    expect(isPlaceholderUrl("")).toBe(true);
  });
});

describe("verifyItemUrls", () => {
  const baseItem: ParsedTopicItem = {
    headline: "Something happened",
    date: "2026-07-01",
    angle: "news",
    whyItMatters: "it matters",
    url: "https://www.realnews.test/story",
    background: false,
  };

  it("keeps the URL when its host matches a grounding source", () => {
    const sources = [{ title: "Real News", uri: "https://www.realnews.test/other-page" }];
    const [result] = verifyItemUrls([baseItem], sources);
    expect(result.url).toBe("https://www.realnews.test/story");
    expect(result.unverified).toBeFalsy();
  });

  it("blanks the URL and marks unverified on a host mismatch", () => {
    const sources = [{ title: "Other Site", uri: "https://other-site.test/page" }];
    const [result] = verifyItemUrls([baseItem], sources);
    expect(result.url).toBe("");
    expect(result.unverified).toBe(true);
  });

  it("marks everything unverified when the source list is empty", () => {
    const [result] = verifyItemUrls([baseItem], []);
    expect(result.url).toBe("");
    expect(result.unverified).toBe(true);
  });

  it("rejects a placeholder URL even when a matching source list is present", () => {
    const placeholderItem: ParsedTopicItem = { ...baseItem, url: "https://www.example.com/story" };
    const sources = [{ title: "Example", uri: "https://www.example.com/story" }];
    const [result] = verifyItemUrls([placeholderItem], sources);
    expect(result.url).toBe("");
    expect(result.unverified).toBe(true);
  });

  // Gemini's real Search grounding shape: chunk.web.uri is always a
  // vertexaisearch.cloud.google.com redirect, never the publisher's URL;
  // chunk.web.title is the bare domain (e.g. "python.org"). A naive
  // uri-host-only comparison would never corroborate anything on a real
  // grounded run - these cases pin the fix.
  describe("against Gemini's real (redirect-uri, domain-title) grounding shape", () => {
    const redirectSource = (title: string) => [
      { title, uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbCdEf123" },
    ];

    it("corroborates via the domain title when the source uri is a Google redirect", () => {
      const item: ParsedTopicItem = { ...baseItem, url: "https://www.python.org/downloads/release/python-3140/" };
      const [result] = verifyItemUrls([item], redirectSource("python.org"));
      expect(result.url).toBe("https://www.python.org/downloads/release/python-3140/");
      expect(result.unverified).toBeFalsy();
    });

    it("corroborates a subdomain of the title domain", () => {
      const item: ParsedTopicItem = { ...baseItem, url: "https://docs.python.org/3/whatsnew/3.14.html" };
      const [result] = verifyItemUrls([item], redirectSource("python.org"));
      expect(result.url).toBe("https://docs.python.org/3/whatsnew/3.14.html");
      expect(result.unverified).toBeFalsy();
    });

    it("corroborates via a bare-label title matched against the item host's second-level label", () => {
      const item: ParsedTopicItem = { ...baseItem, url: "https://www.aljazeera.com/news/x" };
      const [result] = verifyItemUrls([item], redirectSource("aljazeera"));
      expect(result.url).toBe("https://www.aljazeera.com/news/x");
      expect(result.unverified).toBeFalsy();
    });

    it("still blanks and marks unverified a non-matching host", () => {
      const item: ParsedTopicItem = { ...baseItem, url: "https://www.unrelated-site.test/story" };
      const [result] = verifyItemUrls([item], redirectSource("python.org"));
      expect(result.url).toBe("");
      expect(result.unverified).toBe(true);
    });

    it("never corroborates an item URL that itself points at the Google redirector", () => {
      const item: ParsedTopicItem = {
        ...baseItem,
        url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/ZzYyXx999",
      };
      // Even though this exact host appears in the source list (a real
      // grounding response), it must never self-corroborate.
      const [result] = verifyItemUrls([item], redirectSource("python.org"));
      expect(result.url).toBe("");
      expect(result.unverified).toBe(true);
    });

    it("does not let a real, sentence-like page title corroborate an unrelated item", () => {
      const item: ParsedTopicItem = { ...baseItem, url: "https://www.python.org/downloads/release/python-3140/" };
      const [result] = verifyItemUrls([item], redirectSource("Python 3.14 is now available"));
      expect(result.url).toBe("");
      expect(result.unverified).toBe(true);
    });
  });
});

describe("windowCutoff", () => {
  const now = new Date("2026-07-27T00:00:00.000Z");

  it("parses a bare-count days shape", () => {
    const cutoff = windowCutoff("the past 30 days", now);
    expect(cutoff?.toISOString()).toBe(new Date("2026-06-27T00:00:00.000Z").toISOString());
  });

  it("parses a weeks shape", () => {
    const cutoff = windowCutoff("the past 2 weeks", now);
    expect(cutoff?.toISOString()).toBe(new Date("2026-07-13T00:00:00.000Z").toISOString());
  });

  it("parses a months shape", () => {
    const cutoff = windowCutoff("the last 3 months", now);
    expect(cutoff?.toISOString()).toBe(new Date("2026-04-27T00:00:00.000Z").toISOString());
  });

  it("parses a bare-unit years shape, defaulting the count to 1", () => {
    const cutoff = windowCutoff("the past year", now);
    expect(cutoff?.toISOString()).toBe(new Date("2025-07-27T00:00:00.000Z").toISOString());
  });

  it("parses a bare 'N days' shape with no leading words", () => {
    const cutoff = windowCutoff("30 days", now);
    expect(cutoff?.toISOString()).toBe(new Date("2026-06-27T00:00:00.000Z").toISOString());
  });

  it("returns null for an unparseable window", () => {
    expect(windowCutoff("whenever, really", now)).toBeNull();
    expect(windowCutoff("", now)).toBeNull();
  });
});

describe("markOutOfWindow", () => {
  const cutoff = new Date("2026-06-27T00:00:00.000Z");

  it("marks an old item as background", () => {
    const item: ParsedTopicItem = {
      headline: "Old news",
      date: "2026-01-01",
      angle: "news",
      whyItMatters: "context",
      url: "",
      background: false,
    };
    const [result] = markOutOfWindow([item], cutoff);
    expect(result.background).toBe(true);
  });

  it("leaves an in-window item alone", () => {
    const item: ParsedTopicItem = {
      headline: "Fresh news",
      date: "2026-07-20",
      angle: "news",
      whyItMatters: "context",
      url: "",
      background: false,
    };
    const [result] = markOutOfWindow([item], cutoff);
    expect(result.background).toBe(false);
  });

  it("leaves an already-background item untouched", () => {
    const item: ParsedTopicItem = {
      headline: "Old but flagged",
      date: "2020-01-01",
      angle: "news",
      whyItMatters: "context",
      url: "",
      background: true,
    };
    const [result] = markOutOfWindow([item], cutoff);
    expect(result).toEqual(item);
  });

  it("leaves an item with an unparseable date untouched", () => {
    const item: ParsedTopicItem = {
      headline: "Undated",
      date: "sometime",
      angle: "news",
      whyItMatters: "context",
      url: "",
      background: false,
    };
    const [result] = markOutOfWindow([item], cutoff);
    expect(result).toEqual(item);
  });

  it("returns items unchanged when the cutoff is null", () => {
    const item: ParsedTopicItem = {
      headline: "Anything",
      date: "2020-01-01",
      angle: "news",
      whyItMatters: "context",
      url: "",
      background: false,
    };
    expect(markOutOfWindow([item], null)).toEqual([item]);
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

  it("labels an unverified item and omits its Source line", () => {
    const report = buildCurrentEventsReport({
      window: "the past 30 days",
      itemsPerTopic: 5,
      sections: [
        {
          topic: "Neural Networks",
          items: [
            {
              headline: "Unverified claim",
              date: "2026-07-01",
              angle: "news",
              whyItMatters: "students should know",
              url: "",
              background: false,
              unverified: true,
            },
          ],
        },
      ],
      themes: [],
      whatChanged: "",
      discussionPrompts: [],
      sources: [],
      notes: [],
      degraded: true,
    });
    expect(report).toContain("Unverified claim [unverified - no web source]");
    expect(report).not.toContain("Source:");
  });
});

describe("buildCurrentEventsDocMarkdown", () => {
  const input = () => ({
    window: "the past 30 days",
    itemsPerTopic: 2,
    sections: [
      {
        topic: "Supply chain risk",
        items: [
          {
            headline: "A vendor outage halted shipping",
            date: "2026-05-02",
            angle: "operations",
            background: false,
            whyItMatters: "It shows single-vendor concentration risk.",
            url: "https://example.test/story",
          },
        ],
      },
      { topic: "Empty topic", items: [] },
    ],
    themes: ["Concentration risk"],
    whatChanged: "Two vendors merged.",
    discussionPrompts: ["Who owns vendor risk?"],
    sources: [{ title: "Example", uri: "https://example.test/story" }],
    notes: [],
    degraded: false,
    generatedAt: new Date("2026-05-10T00:00:00Z"),
  });

  // The docx builder keys off markdown headings; an ALL-CAPS line like
  // "CROSS-CUTTING THEMES" renders as body text, which is why the flat report
  // could never be a professional document on its own.
  it("uses one level-1 title and level-2 section headings", () => {
    const md = buildCurrentEventsDocMarkdown(input());
    expect(md.split("\n")[0]).toBe("# Current Events Report");
    expect((md.match(/^# /gm) ?? []).length).toBe(1);
    expect(md).toContain("## Supply chain risk");
    expect(md).toContain("## Cross-cutting themes");
    expect(md).toContain("## Sources");
  });

  it("renders items and sources as bullets, and keeps the URL bare for hyperlinking", () => {
    const md = buildCurrentEventsDocMarkdown(input());
    expect(md).toContain("- A vendor outage halted shipping - 2026-05-02 (operations)");
    expect(md).toContain("- Why it matters: It shows single-vendor concentration risk.");
    expect(md).toContain("https://example.test/story");
  });

  it("says so plainly for an empty topic instead of emitting nothing", () => {
    expect(buildCurrentEventsDocMarkdown(input())).toContain("No items were returned for this topic.");
  });

  // B4: the headline is a level-0 bullet ("- " with no leading spaces); "Why
  // it matters" and "Source" are level-1 sub-bullets indented by EXACTLY two
  // spaces, per the docx contract's bullet-indent unit - not zero, not four.
  it("nests Why it matters and Source under the headline with an exact two-space indent", () => {
    const md = buildCurrentEventsDocMarkdown(input());
    const lines = md.split("\n");
    const headlineIndex = lines.findIndex((l) => l.startsWith("- A vendor outage halted shipping"));
    expect(headlineIndex).toBeGreaterThan(-1);
    expect(lines[headlineIndex + 1]).toBe("  - Why it matters: It shows single-vendor concentration risk.");
    expect(lines[headlineIndex + 2]).toBe("  - Source: https://example.test/story");
    // Sanity: neither sub-bullet is a sibling (0-space) or over-indented (4-space) bullet.
    expect(lines[headlineIndex + 1].startsWith("- ")).toBe(false);
    expect(lines[headlineIndex + 1].startsWith("    ")).toBe(false);
  });

  it("labels an unverified item's headline and replaces its Source sub-bullet", () => {
    const unverifiedInput = {
      ...input(),
      sections: [
        {
          topic: "Supply chain risk",
          items: [
            {
              headline: "Unverified claim",
              date: "2026-05-02",
              angle: "operations",
              background: false,
              whyItMatters: "Cannot be corroborated.",
              url: "",
              unverified: true,
            },
          ],
        },
      ],
    };
    const md = buildCurrentEventsDocMarkdown(unverifiedInput);
    expect(md).toContain("- Unverified claim - 2026-05-02 (operations) [unverified - no web source]");
    expect(md).toContain("  - Source: not corroborated by a web search result");
  });

  // G1/G2: the docx builder now supports inline markdown links, so each
  // Sources entry is a single "- [title](uri)" bullet - the domain/title is
  // the visible, clickable text and the opaque grounding redirect never
  // appears as visible text at all. This replaces the two-line
  // "- Source: ...\n  - Link: ..." workaround from round 1.
  describe("Sources section: markdown links", () => {
    it("renders a source as a markdown link with the title as visible text and the uri as the target", () => {
      const md = buildCurrentEventsDocMarkdown(input());
      expect(md).toContain("- [Example](https://example.test/story)");
      // The two-line sub-bullet workaround must be gone.
      expect(md).not.toContain("- Source: Example");
      expect(md).not.toContain("- Link:");
    });

    it("falls back to the uri as the visible text when the title is empty/whitespace-only", () => {
      const md = buildCurrentEventsDocMarkdown({
        ...input(),
        sources: [{ title: "   ", uri: "https://real-site.test/a" }],
      });
      expect(md).toContain("- [https://real-site.test/a](https://real-site.test/a)");
    });

    it("renders as plain text with no link when the uri is empty", () => {
      const md = buildCurrentEventsDocMarkdown({
        ...input(),
        sources: [{ title: "No Link Title", uri: "" }],
      });
      expect(md).toContain("- No Link Title");
      expect(md).not.toContain("](");
    });

    it("strips [ and ] from the title so the model's own data can't break the link syntax", () => {
      const md = buildCurrentEventsDocMarkdown({
        ...input(),
        sources: [{ title: "Site [Beta]", uri: "https://site.test/a" }],
      });
      expect(md).toContain("- [Site Beta](https://site.test/a)");
      // A raw bracket surviving into the title would produce broken/nested
      // link syntax such as "[Site [Beta]](...)".
      expect(md).not.toContain("[Site [Beta]");
    });
  });

  it("marks a degraded run in the coverage line", () => {
    expect(buildCurrentEventsDocMarkdown({ ...input(), degraded: true })).toContain("DEGRADED");
  });

  it("is deterministic for a fixed generatedAt", () => {
    expect(buildCurrentEventsDocMarkdown(input())).toBe(buildCurrentEventsDocMarkdown(input()));
  });

  // The flat report is the step's `reportText` output, which other steps bind
  // to; both renderings must come from the same input and stay independent.
  it("does not disturb the flat report", () => {
    const flat = buildCurrentEventsReport(input());
    expect(flat.split("\n")[0]).toBe("CURRENT EVENTS REPORT");
    expect(flat).not.toContain("# Current Events Report");
  });
});

describe("buildCurrentEventsPageText", () => {
  const input = () => ({
    window: "the past 30 days",
    itemsPerTopic: 2,
    sections: [
      {
        topic: "Supply chain risk",
        items: [
          {
            headline: "A vendor outage halted shipping",
            date: "2026-05-02",
            angle: "operations",
            background: false,
            whyItMatters: "It shows single-vendor concentration risk.",
            url: "https://example.test/story",
          },
        ],
      },
    ],
    themes: ["Concentration risk"],
    whatChanged: "Two vendors merged.",
    discussionPrompts: ["Who owns vendor risk?"],
    sources: [{ title: "Example", uri: "https://example.test/story" }],
    notes: [],
    degraded: false,
    generatedAt: new Date("2026-05-10T00:00:00Z"),
  });

  // The whole point of this function: buildCurrentEventsDocMarkdown's own
  // two-line indented sub-bullets ("  - Why it matters: ..." / "  - Source:
  // ...") would otherwise flatten into confusing SIBLING bullets under
  // markdownLiteToHtml (which understands only one list level) - folded onto
  // the headline's own line instead, nothing is lost.
  it("folds an item's indented Why it matters/Source sub-bullets into its own single-line bullet", () => {
    const docMarkdown = buildCurrentEventsDocMarkdown(input());
    const pageText = buildCurrentEventsPageText(docMarkdown);
    expect(pageText).toContain(
      "- A vendor outage halted shipping - 2026-05-02 (operations) - Why it matters: It shows single-vendor concentration risk. - Source: https://example.test/story"
    );
    // No indented sub-bullet should survive as its own line.
    expect(pageText).not.toContain("\n  - Why it matters");
    expect(pageText).not.toContain("\n  - Source:");
  });

  it("leaves headings unchanged", () => {
    const docMarkdown = buildCurrentEventsDocMarkdown(input());
    const pageText = buildCurrentEventsPageText(docMarkdown);
    expect(pageText).toContain("# Current Events Report");
    expect(pageText).toContain("## Supply chain risk");
  });

  it("leaves an already-flat Sources bullet (markdown link) unchanged", () => {
    const docMarkdown = buildCurrentEventsDocMarkdown(input());
    const pageText = buildCurrentEventsPageText(docMarkdown);
    expect(pageText).toContain("- [Example](https://example.test/story)");
  });

  it("leaves a headline bullet with no sub-bullets at all unchanged", () => {
    const docMarkdown = buildCurrentEventsDocMarkdown({
      ...input(),
      sections: [
        {
          topic: "Bare topic",
          items: [
            {
              headline: "No context item",
              date: "2026-05-02",
              angle: "operations",
              background: false,
              whyItMatters: "",
              url: "",
              unverified: false,
            },
          ],
        },
      ],
    });
    const pageText = buildCurrentEventsPageText(docMarkdown);
    expect(pageText).toContain("- No context item - 2026-05-02 (operations)");
  });

  it("is a no-op on text with no indented bullets", () => {
    const flat = "# Title\n\nParagraph text.\n\n- Bullet one\n- Bullet two";
    expect(buildCurrentEventsPageText(flat)).toBe(flat);
  });

  it("never touches buildCurrentEventsDocMarkdown's own output - it only reshapes a copy", () => {
    const docMarkdown = buildCurrentEventsDocMarkdown(input());
    const before = docMarkdown;
    buildCurrentEventsPageText(docMarkdown);
    expect(docMarkdown).toBe(before);
  });
});
