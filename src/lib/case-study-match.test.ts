import { describe, it, expect } from "vitest";
import { matchBestByTopics, type TopicTaggedEntry } from "./case-study-match";

interface TestEntry extends TopicTaggedEntry {
  name: string;
}

const LIBRARY: TestEntry[] = [
  { id: "a", name: "Entry A", topics: ["loops", "iteration"] },
  { id: "b", name: "Entry B", topics: ["loops", "iteration", "recursion"] },
  { id: "c", name: "Entry C", topics: ["security", "encryption"] },
];

describe("matchBestByTopics", () => {
  it("returns null for blank topic/summary", () => {
    expect(matchBestByTopics(LIBRARY, "", "")).toBeNull();
    expect(matchBestByTopics(LIBRARY, "   ", "  ")).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(matchBestByTopics(LIBRARY, "Completely unrelated subject", "")).toBeNull();
  });

  it("picks the entry with the highest tag-match score", () => {
    // "loops" and "iteration" both match A and B, but "recursion" only
    // matches B - B should win with 3 matched tags vs A's 2.
    const result = matchBestByTopics(LIBRARY, "Loops, Iteration, and Recursion", "");
    expect(result?.id).toBe("b");
  });

  it("matches whole words only, not substrings", () => {
    // "loopy" contains "loop" as a substring but not as a whole word match
    // for the tag "loops" - a text-processing edge case this library exists
    // to avoid (e.g. "risk" must not match inside "risky").
    const result = matchBestByTopics(LIBRARY, "loopy subject with no real match", "");
    expect(result).toBeNull();
  });

  it("excludes ids already claimed by another week", () => {
    const result = matchBestByTopics(LIBRARY, "Loops, Iteration, and Recursion", "", new Set(["b"]));
    expect(result?.id).toBe("a");
  });

  it("ties keep the library's own declared order (earlier entries win)", () => {
    const tiedLibrary: TestEntry[] = [
      { id: "first", name: "First", topics: ["security"] },
      { id: "second", name: "Second", topics: ["security"] },
    ];
    const result = matchBestByTopics(tiedLibrary, "Security topic", "");
    expect(result?.id).toBe("first");
  });

  it("returns null when every matching candidate is excluded", () => {
    const result = matchBestByTopics(LIBRARY, "Security and encryption week", "", new Set(["c"]));
    expect(result).toBeNull();
  });

  it("matches against combined topic + summary text", () => {
    const result = matchBestByTopics(LIBRARY, "Week 3", "This week covers encryption in depth.");
    expect(result?.id).toBe("c");
  });
});
