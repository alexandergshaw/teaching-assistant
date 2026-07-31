import { describe, it, expect } from "vitest";
import { APPLIED_CASE_STUDIES, matchCaseStudyLibraryEntry } from "./case-study-library";

describe("APPLIED_CASE_STUDIES", () => {
  it("every entry has a non-year-baked-in organization, a period, at least one topic tag, summary, and a lesson", () => {
    for (const entry of APPLIED_CASE_STUDIES) {
      expect(entry.id.trim()).not.toBe("");
      expect(entry.organization.trim()).not.toBe("");
      expect(entry.period.trim()).not.toBe("");
      expect(entry.topics.length).toBeGreaterThan(0);
      expect(entry.summary.length).toBeGreaterThan(0);
      expect(entry.lesson.trim()).not.toBe("");
    }
  });

  it("every id is unique", () => {
    const ids = APPLIED_CASE_STUDIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // V2: the audit's own evidence - Denver's failure was 1994-95, not 2002 or
  // 2011 (both of which shipped on real decks). The curated entry must carry
  // the verified period, not a single disputed year presented as fact.
  it("the Denver entry states the verified 1994-1995 period, not 2002 or 2011", () => {
    const denver = APPLIED_CASE_STUDIES.find((e) => e.id === "denver-baggage");
    expect(denver).toBeDefined();
    expect(denver!.period).toContain("1994");
    expect(denver!.period).not.toMatch(/\b2002\b/);
    expect(denver!.period).not.toMatch(/\b2011\b/);
  });

  it("the FBI VCF entry is dated to its 2005 cancellation, not 2011 (which belongs to Sentinel)", () => {
    const vcf = APPLIED_CASE_STUDIES.find((e) => e.id === "fbi-vcf");
    expect(vcf).toBeDefined();
    expect(vcf!.period).toContain("2005");
  });

  it("the Berlin Brandenburg entry states both the planned (2011) and actual (2020) dates", () => {
    const ber = APPLIED_CASE_STUDIES.find((e) => e.id === "berlin-brandenburg");
    expect(ber).toBeDefined();
    expect(ber!.period).toContain("2011");
    expect(ber!.period).toContain("2020");
  });
});

describe("matchCaseStudyLibraryEntry", () => {
  it("matches a week whose topic/summary shares tag words with a curated entry", () => {
    const entry = matchCaseStudyLibraryEntry("Scope Management", "Controlling vendor management and schedule risk.");
    expect(entry).not.toBeNull();
  });

  it("returns null when nothing matches", () => {
    const entry = matchCaseStudyLibraryEntry("Zzyzx Nonsense Topic", "");
    expect(entry).toBeNull();
  });

  it("returns null for blank topic and summary", () => {
    expect(matchCaseStudyLibraryEntry("", "")).toBeNull();
  });

  it("excludes an entry whose id is already claimed", () => {
    const first = matchCaseStudyLibraryEntry("Scope creep and vendor management", "systems integration testing schedule risk");
    expect(first).not.toBeNull();
    const excluded = new Set([first!.id]);
    const second = matchCaseStudyLibraryEntry("Scope creep and vendor management", "systems integration testing schedule risk", excluded);
    expect(second?.id).not.toBe(first!.id);
  });

  it("prefers the entry with the most matching tags when several match", () => {
    // "government" + "requirements" + "software" + "waterfall" all point at
    // fbi-vcf specifically, more strongly than a single shared tag would.
    const entry = matchCaseStudyLibraryEntry(
      "Government IT procurement",
      "requirements churn, waterfall contracts, and software delivered late"
    );
    expect(entry?.id).toBe("fbi-vcf");
  });
});
