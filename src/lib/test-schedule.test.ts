import { describe, it, expect } from "vitest";
import { deriveTestWeeks } from "./test-schedule";

describe("deriveTestWeeks", () => {
  it("spaces tests evenly across the term, last test at/near the final week", () => {
    expect(deriveTestWeeks(16, 3)).toEqual([5, 11, 16]);
  });

  it("returns [] when tests is zero", () => {
    expect(deriveTestWeeks(16, 0)).toEqual([]);
  });

  it("returns [] when weeks is zero", () => {
    expect(deriveTestWeeks(0, 3)).toEqual([]);
  });

  it("returns every week when tests equals weeks", () => {
    expect(deriveTestWeeks(5, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns every week (never more than weeks, never a duplicate) when tests exceeds weeks", () => {
    expect(deriveTestWeeks(5, 9)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns a single test at the final week when tests is 1", () => {
    expect(deriveTestWeeks(16, 1)).toEqual([16]);
  });

  it("returns [] for non-finite inputs", () => {
    expect(deriveTestWeeks(NaN, 3)).toEqual([]);
    expect(deriveTestWeeks(16, NaN)).toEqual([]);
    expect(deriveTestWeeks(Infinity, 3)).toEqual([]);
    expect(deriveTestWeeks(16, Infinity)).toEqual([]);
    expect(deriveTestWeeks(-Infinity, 3)).toEqual([]);
  });

  it("returns [] for negative inputs", () => {
    expect(deriveTestWeeks(-16, 3)).toEqual([]);
    expect(deriveTestWeeks(16, -3)).toEqual([]);
    expect(deriveTestWeeks(-16, -3)).toEqual([]);
  });

  it("every returned array is strictly increasing and stays within 1..weeks, across a wide range of inputs", () => {
    for (let weeks = 1; weeks <= 30; weeks += 1) {
      for (let tests = 0; tests <= 30; tests += 1) {
        const result = deriveTestWeeks(weeks, tests);
        for (const week of result) {
          expect(week).toBeGreaterThanOrEqual(1);
          expect(week).toBeLessThanOrEqual(weeks);
        }
        for (let i = 1; i < result.length; i += 1) {
          expect(result[i]).toBeGreaterThan(result[i - 1]);
        }
      }
    }
  });
});
