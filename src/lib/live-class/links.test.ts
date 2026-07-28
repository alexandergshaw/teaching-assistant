import { describe, it, expect } from "vitest";
import {
  stripModelUrls,
  resolveDocsLinks,
  resolveVisualizerLinks,
  dedupeLinks,
  CURATED_DOCS_MAP,
  type AnswerLink,
  type VisualizerIndexEntry,
} from "./links";
import { conceptUrl, TOPIC_ROUTES } from "@/lib/visualizer";

describe("stripModelUrls", () => {
  it("removes a bare URL, leaving nothing where it was", () => {
    const input = "Read the docs at https://docs.python.org/3/tutorial for details";
    expect(stripModelUrls(input)).toBe("Read the docs at for details");
  });

  it("keeps a markdown link's display text and drops the url", () => {
    const input = "Check [the docs](https://example.com/docs) for more.";
    expect(stripModelUrls(input)).toBe("Check the docs for more.");
  });

  it("removes several links in one line, collapsing the leftover whitespace", () => {
    const input = "See https://a.test/x and https://b.test/y for details.";
    expect(stripModelUrls(input)).toBe("See and for details.");
  });

  it("leaves text with no links unchanged", () => {
    const input = "Loops let you repeat an action without writing it multiple times.";
    expect(stripModelUrls(input)).toBe(input);
  });

  it("also strips a www.-prefixed bare domain (no http scheme)", () => {
    const input = "See www.example.com/research/paper for more.";
    expect(stripModelUrls(input)).toBe("See for more.");
  });

  it("preserves bullet lines and their leading dash", () => {
    const input = "- For loops repeat a block a fixed number of times.\n- See https://example.com/x for more.";
    expect(stripModelUrls(input)).toBe(
      "- For loops repeat a block a fixed number of times.\n- See for more."
    );
  });

  it("never throws on a non-string input", () => {
    expect(() => stripModelUrls(null as unknown as string)).not.toThrow();
    expect(stripModelUrls(null as unknown as string)).toBe("");
    expect(() => stripModelUrls(undefined as unknown as string)).not.toThrow();
  });
});

describe("resolveDocsLinks", () => {
  it("returns the official URL for a mapped language concept", () => {
    const links = resolveDocsLinks(["python"], {});
    expect(links).toEqual([{ label: "Python documentation", url: "https://docs.python.org/3/", kind: "docs" }]);
  });

  it("returns the official URL for each of several distinct mapped concepts", () => {
    const links = resolveDocsLinks(["react", "git"], {});
    expect(links.map((l) => l.url)).toEqual(["https://react.dev/", "https://git-scm.com/doc"]);
  });

  it("matches a named SQL engine but never invents a generic SQL docs URL", () => {
    expect(resolveDocsLinks(["MySQL"], {})).toEqual([
      { label: "MySQL documentation", url: "https://dev.mysql.com/doc/", kind: "docs" },
    ]);
    // "SQL" alone (or "databases") names no engine - contributes nothing.
    expect(resolveDocsLinks(["SQL"], {})).toEqual([]);
    expect(resolveDocsLinks(["databases"], {})).toEqual([]);
  });

  it("returns nothing for an unmapped concept", () => {
    expect(resolveDocsLinks(["for loops"], {})).toEqual([]);
    expect(resolveDocsLinks(["list comprehension"], {})).toEqual([]);
  });

  it("falls back to hints.language when no concept names a mapped keyword", () => {
    const links = resolveDocsLinks(["for loops", "list comprehension"], { language: "python" });
    expect(links).toEqual([{ label: "Python documentation", url: "https://docs.python.org/3/", kind: "docs" }]);
  });

  it("dedupes by url when a concept and the language hint resolve to the same entry", () => {
    const links = resolveDocsLinks(["Python"], { language: "python" });
    expect(links).toHaveLength(1);
  });

  it("never returns a URL that is not a value in CURATED_DOCS_MAP", () => {
    const curatedUrls = new Set(Object.values(CURATED_DOCS_MAP).map((l) => l.url));
    const links = resolveDocsLinks(
      ["python", "javascript", "typescript", "react", "html", "css", "git", "github", "postgresql", "sqlite", "recursion"],
      { language: "mysql" }
    );
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(curatedUrls.has(link.url)).toBe(true);
    }
  });

  it("is defensive about a non-array concepts input", () => {
    expect(resolveDocsLinks(null as unknown as string[], {})).toEqual([]);
  });
});

describe("resolveVisualizerLinks", () => {
  const fixtureIndex: VisualizerIndexEntry[] = [
    { topicExport: "pythonNavItems", label: "For Loops", value: "for-loops" },
    { topicExport: "pythonNavItems", label: "List Comprehension", value: "list-comprehension" },
    // htmlNavItems is one of the five UnderConstruction stub topics
    // (creatable: false in VISUALIZER_TOPICS) - present here to prove a
    // match against a non-creatable topic still contributes no link.
    { topicExport: "htmlNavItems", label: "Doctype", value: "doctype" },
  ];

  it("matches a concept present in the index and builds its real URL", () => {
    const links = resolveVisualizerLinks(["for loops"], fixtureIndex);
    expect(links).toEqual([
      { label: "For Loops", url: conceptUrl(TOPIC_ROUTES.python, "for-loops"), kind: "visualizer" },
    ]);
  });

  it("matches case- and space-insensitively, same as matchConcept", () => {
    const links = resolveVisualizerLinks(["List Comprehension"], fixtureIndex);
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe(conceptUrl(TOPIC_ROUTES.python, "list-comprehension"));
  });

  it("returns nothing for a concept absent from the index", () => {
    expect(resolveVisualizerLinks(["binary search"], fixtureIndex)).toEqual([]);
  });

  it("never fabricates a URL for a topic that is not creatable, even on a real match", () => {
    // "doctype" matches an entry in the fixture, but its topic (html) is one
    // of the five UnderConstruction stub topics - no working switch/case
    // could ever render it, so this must contribute no link.
    expect(resolveVisualizerLinks(["doctype"], fixtureIndex)).toEqual([]);
  });

  it("never fabricates a URL for a topicExport unknown to VISUALIZER_TOPICS", () => {
    const bogusIndex: VisualizerIndexEntry[] = [{ topicExport: "notARealTopicNavItems", label: "Ghost", value: "ghost" }];
    expect(resolveVisualizerLinks(["ghost"], bogusIndex)).toEqual([]);
  });

  it("is defensive about a non-array index input", () => {
    expect(resolveVisualizerLinks(["for loops"], null as unknown as VisualizerIndexEntry[])).toEqual([]);
  });
});

describe("dedupeLinks", () => {
  const visLink = (n: number): AnswerLink => ({ label: `Visualizer ${n}`, url: `https://vis.test/${n}`, kind: "visualizer" });
  const docLink = (n: number): AnswerLink => ({ label: `Docs ${n}`, url: `https://docs.test/${n}`, kind: "docs" });

  it("dedupes by url, keeping the first occurrence", () => {
    const a = docLink(1);
    const b: AnswerLink = { label: "Duplicate label", url: a.url, kind: "docs" };
    expect(dedupeLinks([a, b])).toEqual([a]);
  });

  it("orders visualizer links before documentation links regardless of input order", () => {
    const links = [docLink(1), visLink(1), docLink(2), visLink(2)];
    const result = dedupeLinks(links, 10);
    expect(result.map((l) => l.kind)).toEqual(["visualizer", "visualizer", "docs", "docs"]);
  });

  it("honors the max cap", () => {
    const links = [visLink(1), visLink(2), docLink(1), docLink(2), docLink(3)];
    expect(dedupeLinks(links, 2)).toHaveLength(2);
  });

  it("defaults the cap to 4", () => {
    const links = [visLink(1), docLink(1), docLink(2), docLink(3), docLink(4), docLink(5)];
    expect(dedupeLinks(links)).toHaveLength(4);
  });

  it("is defensive about a non-array input", () => {
    expect(dedupeLinks(null as unknown as AnswerLink[])).toEqual([]);
  });
});
