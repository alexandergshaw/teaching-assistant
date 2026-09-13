import { describe, it, expect } from "vitest";
import { verifySnapshotCitations } from "./snapshot-citations";
import type { SnapshotRubricAreaAnswer } from "./snapshot-parse";

describe("verifySnapshotCitations (D4: string-match by construction, never a self-reported receipt)", () => {
  it("verifies a quote found verbatim in its own claimed shot's transcript", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Correctness", score: "8/10", quote: "the loop terminates correctly", shotIndex: 3 },
    ];
    const byShot = new Map([[3, "Here the loop terminates correctly on the third iteration."]]);
    const result = verifySnapshotCitations(areas, byShot, "");
    expect(result).toEqual([
      { area: "Correctness", score: "8/10", quote: "the loop terminates correctly", shotIndex: 3, verified: true },
    ]);
  });

  it("is whitespace/case tolerant but still requires the actual words to appear", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Style", score: "5/5", quote: "Clean   Code", shotIndex: 1 },
    ];
    const byShot = new Map([[1, "the code here is clean code throughout"]]);
    expect(verifySnapshotCitations(areas, byShot, "")[0].verified).toBe(true);
  });

  it("falls back to the combined transcript when shotIndex is 0 (pasted rubric/assignment text)", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Format", score: "3/5", quote: "must be double spaced", shotIndex: 0 },
    ];
    const result = verifySnapshotCitations(areas, new Map(), "Assignment: essays must be double spaced.");
    expect(result[0].verified).toBe(true);
  });

  it("THE CONSTRUCTION: a quote the transcript never contains renders unverified, never as evidence", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Correctness", score: "10/10", quote: "the student proved the halting problem", shotIndex: 2 },
    ];
    const byShot = new Map([[2, "def add(a, b): return a + b"]]);
    const result = verifySnapshotCitations(areas, byShot, "def add(a, b): return a + b");
    expect(result[0].verified).toBe(false);
  });

  it("an empty quote is never verified, even against a non-empty transcript", () => {
    const areas: SnapshotRubricAreaAnswer[] = [{ area: "Correctness", score: "0/10", quote: "", shotIndex: 1 }];
    const result = verifySnapshotCitations(areas, new Map([[1, "anything at all"]]), "anything at all");
    expect(result[0].verified).toBe(false);
  });

  it("a wrong shotIndex still verifies against the combined transcript fallback", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Correctness", score: "9/10", quote: "prints hello world", shotIndex: 99 },
    ];
    const result = verifySnapshotCitations(areas, new Map(), "the program prints hello world to stdout");
    expect(result[0].verified).toBe(true);
  });
});
