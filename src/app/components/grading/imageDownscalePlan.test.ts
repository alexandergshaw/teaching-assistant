import { describe, expect, it } from "vitest";
import {
  downscaledFileName,
  downscaleSchedule,
  scaledDimensions,
  shouldAttemptDownscale,
  targetBudgetBytes,
} from "./imageDownscalePlan";

describe("shouldAttemptDownscale", () => {
  it("is false at or under budget", () => {
    expect(shouldAttemptDownscale("image/jpeg", 1000, 1000)).toBe(false);
    expect(shouldAttemptDownscale("image/jpeg", 10, 1000)).toBe(false);
  });
  it("is true for an over-budget image", () => {
    expect(shouldAttemptDownscale("image/jpeg", 4_000_000, 2752512)).toBe(true);
  });
  it("is false for a non-image however large", () => {
    expect(shouldAttemptDownscale("application/pdf", 9_000_000, 2752512)).toBe(false);
    expect(shouldAttemptDownscale("", 9_000_000, 2752512)).toBe(false);
  });
});

describe("targetBudgetBytes", () => {
  it("sits below the budget at the 0.9 margin", () => {
    expect(targetBudgetBytes(2752512)).toBe(2477260);
    expect(targetBudgetBytes(2752512)).toBeLessThan(2752512);
  });
});

describe("downscaleSchedule", () => {
  it("is a frozen gentlest-first 3x3 schedule", () => {
    const s = downscaleSchedule();
    expect(s).toHaveLength(9);
    expect(s[0]).toEqual({ maxEdge: 2200, quality: 0.82 });
    expect(s[8]).toEqual({ maxEdge: 1200, quality: 0.6 });
  });
});

describe("scaledDimensions", () => {
  it("scales the longest edge down preserving aspect", () => {
    expect(scaledDimensions(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(scaledDimensions(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });
  it("never upscales", () => {
    expect(scaledDimensions(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
  it("never returns a zero edge", () => {
    expect(scaledDimensions(10000, 1, 100)).toEqual({ width: 100, height: 1 });
  });
});

describe("downscaledFileName", () => {
  it("renames to .jpg", () => {
    expect(downscaledFileName("IMG_1.heic")).toBe("IMG_1.jpg");
    expect(downscaledFileName("noext")).toBe("noext.jpg");
    expect(downscaledFileName("a.b.png")).toBe("a.b.jpg");
  });
});
