import { describe, it, expect } from "vitest";
import { verifySnapshotCitations } from "./snapshot-citations";
import type { SnapshotRubricAreaAnswer } from "./snapshot-parse";

describe("verifySnapshotCitations (D4: string-match by construction, never a self-reported receipt)", () => {
  it("verifies a quote found verbatim in its own claimed shot's transcript", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Correctness", score: "8/10", quote: "the loop terminates correctly", shotIndex: 3, source: "shot" },
    ];
    const byShot = new Map([[3, "Here the loop terminates correctly on the third iteration."]]);
    const idByGlobalIndex = new Map([[3, "shot-id-3"]]);
    const result = verifySnapshotCitations(areas, byShot, "", "", idByGlobalIndex);
    expect(result).toEqual([
      {
        area: "Correctness",
        score: "8/10",
        quote: "the loop terminates correctly",
        shotIndex: 3,
        source: "shot",
        verified: true,
        shotId: "shot-id-3",
      },
    ]);
  });

  it("is whitespace/case tolerant but still requires the actual words to appear", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Style", score: "5/5", quote: "Clean   Code", shotIndex: 1, source: "shot" },
    ];
    const byShot = new Map([[1, "the code here is clean code throughout"]]);
    const idByGlobalIndex = new Map([[1, "shot-id-1"]]);
    expect(verifySnapshotCitations(areas, byShot, "", "", idByGlobalIndex)[0].verified).toBe(true);
  });

  it('a source:"pasted" citation verifies against the DEDICATED pasted-text corpus, never the shots-only transcript', () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Format", score: "3/5", quote: "must be double spaced", shotIndex: 0, source: "pasted" },
    ];
    const result = verifySnapshotCitations(
      areas,
      new Map(),
      "this shots-only transcript never mentions spacing",
      "Assignment: essays must be double spaced.",
      new Map()
    );
    expect(result[0].verified).toBe(true);
    expect(result[0].source).toBe("pasted");
    // "pasted" never resolves a shot position - there was no shot to begin
    // with, so idByGlobalIndex is never consulted for this source.
    expect(result[0].shotId).toBeNull();
  });

  it('BLOCKER 2: a claimed source:"pasted" citation that only matches the combined (student) transcript is downgraded to "unknown", never rendered as rubric evidence', () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Format", score: "3/5", quote: "the student wrote this in cursive", shotIndex: 0, source: "pasted" },
    ];
    const result = verifySnapshotCitations(
      areas,
      new Map(),
      "the student wrote this in cursive throughout",
      "Assignment: essays must be double spaced.",
      new Map()
    );
    expect(result[0].verified).toBe(true);
    expect(result[0].source).toBe("unknown");
    expect(result[0].shotId).toBeNull();
  });

  it("THE CONSTRUCTION: a quote the transcript never contains renders unverified, never as evidence", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Correctness", score: "10/10", quote: "the student proved the halting problem", shotIndex: 2, source: "shot" },
    ];
    const byShot = new Map([[2, "def add(a, b): return a + b"]]);
    const result = verifySnapshotCitations(areas, byShot, "def add(a, b): return a + b", "", new Map([[2, "shot-id-2"]]));
    expect(result[0].verified).toBe(false);
  });

  it("an empty quote is never verified, even against a non-empty transcript", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Correctness", score: "0/10", quote: "", shotIndex: 1, source: "shot" },
    ];
    const result = verifySnapshotCitations(
      areas,
      new Map([[1, "anything at all"]]),
      "anything at all",
      "",
      new Map([[1, "shot-id-1"]])
    );
    expect(result[0].verified).toBe(false);
  });

  it("a wrong shotIndex still verifies against the combined transcript fallback", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Correctness", score: "9/10", quote: "prints hello world", shotIndex: 99, source: "shot" },
    ];
    const result = verifySnapshotCitations(areas, new Map(), "the program prints hello world to stdout", "", new Map());
    expect(result[0].verified).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R1: the fifth parameter's own construction - shotId is resolved from
// idByGlobalIndex ONLY when the FINAL (resolved) source is "shot", is
// computed independently at each of verifySnapshotCitations' two return
// sites (the empty-quote early return reads the RAW a.source; the main
// return reads resolvedSource), and is null for a hallucinated shotIndex
// that has no entry in the map (never a thrown error, never a fabricated
// id).
// ---------------------------------------------------------------------------

describe("R1: shotId resolution", () => {
  it("resolves shotId from idByGlobalIndex when the final source is \"shot\"", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Correctness", score: "8/10", quote: "clean code", shotIndex: 5, source: "shot" },
    ];
    const byShot = new Map([[5, "this is clean code"]]);
    const idByGlobalIndex = new Map([[5, "shot-id-5"]]);
    const result = verifySnapshotCitations(areas, byShot, "", "", idByGlobalIndex);
    expect(result[0].shotId).toBe("shot-id-5");
  });

  it("shotId is null when the model's shotIndex has no entry in idByGlobalIndex (a hallucinated index) - never a thrown error, never a fabricated id", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Correctness", score: "8/10", quote: "clean code", shotIndex: 99, source: "shot" },
    ];
    const byShot = new Map([[99, "this is clean code"]]);
    const idByGlobalIndex = new Map([[5, "shot-id-5"]]); // no entry for 99
    const result = verifySnapshotCitations(areas, byShot, "", "", idByGlobalIndex);
    expect(result[0].verified).toBe(true); // the quote still verifies
    expect(result[0].shotId).toBeNull(); // but no id was ever attached
  });

  it("shotId is null for a \"shot\"-claimed citation whose quote is empty (the early-return path reads the RAW a.source, not resolvedSource)", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Correctness", score: "0/10", quote: "", shotIndex: 1, source: "shot" },
    ];
    const idByGlobalIndex = new Map([[1, "shot-id-1"]]);
    // Even though idByGlobalIndex HAS an entry for shotIndex 1, an empty
    // quote never verifies and the early return must still compute shotId
    // from a.source (which is "shot" here) - this pins that the early
    // return path is wired at all, not merely that it defaults to null.
    const result = verifySnapshotCitations(areas, new Map(), "", "", idByGlobalIndex);
    expect(result[0].verified).toBe(false);
    expect(result[0].shotId).toBe("shot-id-1");
  });

  it("shotId is null for a \"pasted\"-claimed citation with an empty quote, even when idByGlobalIndex has an entry at that index (the early return reads a.source, which is \"pasted\", not \"shot\")", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Format", score: "0/5", quote: "", shotIndex: 1, source: "pasted" },
    ];
    const idByGlobalIndex = new Map([[1, "shot-id-1"]]);
    const result = verifySnapshotCitations(areas, new Map(), "", "", idByGlobalIndex);
    expect(result[0].verified).toBe(false);
    expect(result[0].shotId).toBeNull();
  });

  it("shotId is null for a \"shot\"-claimed citation that only verifies via the combined-transcript fallback (resolvedSource becomes \"unknown\", not \"shot\") - THE LANDMINE (Ruling R1-B section 2.3): idByGlobalIndex DOES have an entry at this shotIndex, so a hoisted `shotId = a.source === \"shot\" ? idByGlobalIndex.get(...) : null` computed once and reused for both returns would WRONGLY attach that id here; only reading `resolvedSource` at this specific return site keeps it null", () => {
    const areas: SnapshotRubricAreaAnswer[] = [
      { area: "Correctness", score: "9/10", quote: "prints hello world", shotIndex: 1, source: "shot" },
    ];
    // shotIndex 1 DOES resolve in idByGlobalIndex, and shot 1's own
    // transcript does NOT contain the quote - it only matches the combined
    // transcript fallback, so resolvedSource is "unknown", not "shot".
    const idByGlobalIndex = new Map([[1, "shot-id-1"]]);
    const transcriptsByShotIndex = new Map([[1, "shot 1 says nothing about hello world"]]);
    const result = verifySnapshotCitations(
      areas,
      transcriptsByShotIndex,
      "the program prints hello world to stdout",
      "",
      idByGlobalIndex
    );
    expect(result[0].verified).toBe(true);
    expect(result[0].source).toBe("unknown");
    expect(result[0].shotId).toBeNull();
  });
});
