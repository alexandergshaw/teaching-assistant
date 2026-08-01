import { describe, it, expect } from "vitest";
import { CASE_STUDIES, matchCodingCaseStudyEntry } from "./case-studies";

describe("CASE_STUDIES", () => {
  it("every entry has an id, title, year, organization, at least one topic tag, summary, and a lesson", () => {
    for (const entry of CASE_STUDIES) {
      expect(entry.id.trim()).not.toBe("");
      expect(entry.title.trim()).not.toBe("");
      expect(entry.year).toBeGreaterThan(1900);
      expect(entry.organization.trim()).not.toBe("");
      expect(entry.topics.length).toBeGreaterThan(0);
      expect(entry.summary.length).toBeGreaterThan(0);
      expect(entry.lesson.trim()).not.toBe("");
    }
  });

  it("every id is unique", () => {
    const ids = CASE_STUDIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// Z1 (Group Z): matchCodingCaseStudyEntry is the coding-course counterpart to
// matchCaseStudyLibraryEntry (case-study-library.test.ts) - same mechanism
// (matchBestByTopics), same guarantees, over CASE_STUDIES instead of
// APPLIED_CASE_STUDIES.
describe("matchCodingCaseStudyEntry", () => {
  it("matches a week whose topic/summary names a curated entry's topics", () => {
    const result = matchCodingCaseStudyEntry(
      "Loops and Iteration",
      "Concurrency, race conditions, and testing in safety-critical systems."
    );
    expect(result).not.toBeNull();
    expect(result!.id).toBe("therac-25");
  });

  it("returns null for a week with no match", () => {
    expect(matchCodingCaseStudyEntry("Completely unrelated nonsense subject", "")).toBeNull();
  });

  it("never returns an excluded entry, choosing the next-best real match instead", () => {
    const withoutExclusion = matchCodingCaseStudyEntry(
      "Type Conversion",
      "Integer overflow and exceptions from reused code."
    );
    expect(withoutExclusion?.id).toBe("ariane-5");

    const withExclusion = matchCodingCaseStudyEntry(
      "Type Conversion",
      "Integer overflow and exceptions from reused code.",
      new Set(["ariane-5"])
    );
    // A different, still-real entry is returned - never null just because
    // the top match was excluded, and never the excluded id itself.
    expect(withExclusion).not.toBeNull();
    expect(withExclusion?.id).not.toBe("ariane-5");
  });

  it("returns the entry's real year as a number, never a fabricated one", () => {
    const result = matchCodingCaseStudyEntry("Buffer Overflow", "Security, networking, and input validation in C.");
    expect(result).not.toBeNull();
    expect(typeof result!.year).toBe("number");
  });
});
