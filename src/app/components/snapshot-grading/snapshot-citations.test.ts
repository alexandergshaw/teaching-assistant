import { describe, it, expect } from "vitest";
import { verifySnapshotCitations } from "./snapshot-citations";
import type { SnapshotRubricAreaAnswer } from "./snapshot-parse";

describe("verifySnapshotCitations (D4: string-match by construction, never a self-reported receipt)", () => {
  it("verifies a quote found verbatim in its own claimed shot's transcript", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Correctness", score: "8/10", quote: "the loop terminates correctly", shotIndex: 3, source: "shot" },
    ];
    const byShot = new Map([[3, "Here the loop terminates correctly on the third iteration."]]);
    const result = verifySnapshotCitations(areas, byShot, "", "");
    expect(result).toEqual([
      {
        area: "Correctness",
        score: "8/10",
        quote: "the loop terminates correctly",
        shotIndex: 3,
        source: "shot",
        verified: true,
      },
    ]);
  });

  it("is whitespace/case tolerant but still requires the actual words to appear", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Style", score: "5/5", quote: "Clean   Code", shotIndex: 1, source: "shot" },
    ];
    const byShot = new Map([[1, "the code here is clean code throughout"]]);
    expect(verifySnapshotCitations(areas, byShot, "", "")[0].verified).toBe(true);
  });

  it('a source:"pasted" citation verifies against the DEDICATED pasted-text corpus, never the shots-only transcript', () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Format", score: "3/5", quote: "must be double spaced", shotIndex: 0, source: "pasted" },
    ];
    const result = verifySnapshotCitations(
      areas,
      new Map(),
      "this shots-only transcript never mentions spacing",
      "Assignment: essays must be double spaced."
    );
    expect(result[0].verified).toBe(true);
    expect(result[0].source).toBe("pasted");
  });

  it('BLOCKER 2: a claimed source:"pasted" citation that only matches the combined (student) transcript is downgraded to "unknown", never rendered as rubric evidence', () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Format", score: "3/5", quote: "the student wrote this in cursive", shotIndex: 0, source: "pasted" },
    ];
    const result = verifySnapshotCitations(
      areas,
      new Map(),
      "the student wrote this in cursive throughout",
      "Assignment: essays must be double spaced."
    );
    expect(result[0].verified).toBe(true);
    expect(result[0].source).toBe("unknown");
  });

  it("THE CONSTRUCTION: a quote the transcript never contains renders unverified, never as evidence", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Correctness", score: "10/10", quote: "the student proved the halting problem", shotIndex: 2, source: "shot" },
    ];
    const byShot = new Map([[2, "def add(a, b): return a + b"]]);
    const result = verifySnapshotCitations(areas, byShot, "def add(a, b): return a + b", "");
    expect(result[0].verified).toBe(false);
  });

  it("an empty quote is never verified, even against a non-empty transcript", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Correctness", score: "0/10", quote: "", shotIndex: 1, source: "shot" },
    ];
    const result = verifySnapshotCitations(areas, new Map([[1, "anything at all"]]), "anything at all", "");
    expect(result[0].verified).toBe(false);
  });

  it("a wrong shotIndex still verifies against the combined transcript fallback", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Correctness", score: "9/10", quote: "prints hello world", shotIndex: 99, source: "shot" },
    ];
    const result = verifySnapshotCitations(areas, new Map(), "the program prints hello world to stdout", "");
    expect(result[0].verified).toBe(true);
  });
});
