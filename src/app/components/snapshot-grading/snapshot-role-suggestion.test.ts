import { describe, it, expect } from "vitest";
import { truncateBasis, buildPendingRoleSuggestions, acceptAllSuggestions } from "./snapshot-role-suggestion";
import type { ShotReadEntry } from "./snapshot-row";
import type { SnapshotShot } from "./snapshot-shot";

function makeShot(id: string, role: SnapshotShot["role"]): SnapshotShot {
  return { id, role, base64: "", previewUrl: "", source: "paste", capturedAt: 0 };
}

function makeEntry(shotId: string, overrides: Partial<ShotReadEntry> = {}): ShotReadEntry {
  return {
    shotIndex: 1,
    shotId,
    role: "other",
    transcript: "some transcript text",
    status: "read",
    ...overrides,
  };
}

describe("truncateBasis", () => {
  it("returns an empty string unchanged", () => {
    expect(truncateBasis("")).toBe("");
  });

  it("returns short text unchanged", () => {
    expect(truncateBasis("  Rubric: 10 points for correctness.  ")).toBe("Rubric: 10 points for correctness.");
  });

  it("truncates text past the boundary with an ellipsis", () => {
    const long = "x".repeat(250);
    const result = truncateBasis(long);
    expect(result.endsWith("...")).toBe(true);
    expect(result.length).toBeLessThan(long.length);
  });
});

describe("buildPendingRoleSuggestions (item 3/AC-3, item 11/Q1)", () => {
  it("returns an empty list for an empty read map", () => {
    expect(buildPendingRoleSuggestions(new Map())).toEqual([]);
  });

  it("includes a shot with a recognised roleSuggestion and a transcript", () => {
    const reads = new Map([[1, makeEntry("shot-a", { roleSuggestion: "rubric", transcript: "Points: 10" })]]);
    const result = buildPendingRoleSuggestions(reads);
    expect(result).toEqual([{ shotId: "shot-a", suggestedRole: "rubric", basis: "Points: 10" }]);
  });

  it("excludes a shot with no roleSuggestion (the model declined)", () => {
    const reads = new Map([[1, makeEntry("shot-a", { roleSuggestion: undefined })]]);
    expect(buildPendingRoleSuggestions(reads)).toEqual([]);
  });

  it("excludes an unreadable shot even if roleSuggestion were somehow set - no transcript means no basis", () => {
    const reads = new Map([[1, makeEntry("shot-a", { roleSuggestion: "rubric", transcript: "", status: "not-read" })]]);
    expect(buildPendingRoleSuggestions(reads)).toEqual([]);
  });

  it("keys suggestions by shotId, not by the map's numeric key (AC-3: never array position)", () => {
    const reads = new Map([
      [7, makeEntry("shot-z", { roleSuggestion: "post", transcript: "A post" })],
    ]);
    const result = buildPendingRoleSuggestions(reads);
    expect(result[0].shotId).toBe("shot-z");
  });
});

describe("acceptAllSuggestions (AC-1/AC-4/N1-R4: the safety property, made executable)", () => {
  it("returns the shots array unchanged for an empty suggestion list", () => {
    const shots = [makeShot("a", "assignment"), makeShot("b", "other")];
    expect(acceptAllSuggestions(shots, [])).toEqual(shots);
  });

  it("resolves every pending suggestion with ONE call - the whole point of this item", () => {
    const shots = [makeShot("a", "assignment"), makeShot("b", "other"), makeShot("c", "other")];
    const suggestions = [
      { shotId: "a", suggestedRole: "rubric" as const, basis: "x" },
      { shotId: "b", suggestedRole: "submission" as const, basis: "y" },
      { shotId: "c", suggestedRole: "post" as const, basis: "z" },
    ];
    const result = acceptAllSuggestions(shots, suggestions);
    expect(result.map((s) => s.role)).toEqual(["rubric", "submission", "post"]);
  });

  it("leaves a shot with no matching suggestion unchanged (boundary: a deleted shot's suggestion is a no-op, not an error)", () => {
    const shots = [makeShot("a", "assignment")];
    const suggestions = [{ shotId: "deleted-shot", suggestedRole: "rubric" as const, basis: "x" }];
    expect(acceptAllSuggestions(shots, suggestions)).toEqual(shots);
  });
});
