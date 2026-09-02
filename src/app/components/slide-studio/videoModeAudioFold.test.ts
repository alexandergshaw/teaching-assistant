import { describe, it, expect } from "vitest";
import { removeSegmentAudio } from "./videoModeAudioFold";

describe("removeSegmentAudio", () => {
  it("removes exactly the targeted key and leaves the rest untouched", () => {
    const input = { 0: "a", 1: "b", 2: "c" };
    const result = removeSegmentAudio(input, 1);
    expect(1 in result).toBe(false);
    expect(result).toEqual({ 0: "a", 2: "c" });
  });

  it("does not mutate the input object (the original bug: the clone was built but the setter was never called)", () => {
    const input = { 0: "a", 1: "b" };
    removeSegmentAudio(input, 1);
    expect(input).toEqual({ 0: "a", 1: "b" });
  });

  it("is a no-op shape when the index is not present", () => {
    const input = { 0: "a" };
    const result = removeSegmentAudio(input, 5);
    expect(result).toEqual({ 0: "a" });
  });
});
