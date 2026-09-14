import { describe, expect, it } from "vitest";
import { isAccommodationsSelectionComplete, validateAccommodationEntry } from "./accommodations-logic";

describe("isAccommodationsSelectionComplete", () => {
  it("empty input: all three null is incomplete", () => {
    expect(isAccommodationsSelectionComplete(null, null, null)).toBe(false);
  });

  it("happy path: all three present and non-blank is complete", () => {
    expect(isAccommodationsSelectionComplete("uni", "course-1", "assign-1")).toBe(true);
  });

  it("boundary: a whitespace-only value does not count as present", () => {
    expect(isAccommodationsSelectionComplete("uni", "   ", "assign-1")).toBe(false);
    expect(isAccommodationsSelectionComplete("uni", "course-1", "   ")).toBe(false);
    expect(isAccommodationsSelectionComplete("   ", "course-1", "assign-1")).toBe(false);
  });

  it("boundary: any single missing level makes the whole selection incomplete", () => {
    expect(isAccommodationsSelectionComplete(null, "course-1", "assign-1")).toBe(false);
    expect(isAccommodationsSelectionComplete("uni", null, "assign-1")).toBe(false);
    expect(isAccommodationsSelectionComplete("uni", "course-1", null)).toBe(false);
  });
});

describe("validateAccommodationEntry", () => {
  it("empty input: an empty canvasUserId and empty note fails on the missing student", () => {
    expect(validateAccommodationEntry({ canvasUserId: "", note: "" })).toEqual({
      ok: false,
      reason: "missing-student",
    });
  });

  it("happy path: a canvasUserId with a note is valid", () => {
    expect(validateAccommodationEntry({ canvasUserId: "123", note: "50% extended time" })).toEqual({
      ok: true,
    });
  });

  it("boundary: a canvasUserId with an empty note is still valid - note is optional", () => {
    expect(validateAccommodationEntry({ canvasUserId: "123", note: "" })).toEqual({ ok: true });
  });

  it("boundary: a whitespace-only canvasUserId is treated as missing", () => {
    expect(validateAccommodationEntry({ canvasUserId: "   ", note: "some note" })).toEqual({
      ok: false,
      reason: "missing-student",
    });
  });
});
