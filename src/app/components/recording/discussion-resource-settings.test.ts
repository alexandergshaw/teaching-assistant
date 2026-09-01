import { describe, it, expect } from "vitest";
import {
  resourceKindsRenderValue,
  parseVideoLengthMinutesInput,
  videoLengthRangeIsInverted,
} from "./discussion-resource-settings";

describe("resourceKindsRenderValue", () => {
  it("zero selected reads as a real phrase, never a blank box", () => {
    expect(resourceKindsRenderValue([])).toBe("None - resources turned off");
  });

  it("one selected kind prints its label, not the raw enum id", () => {
    expect(resourceKindsRenderValue(["doc"])).toBe("Docs");
  });

  it("multiple selected kinds join with a comma, in the order given", () => {
    expect(resourceKindsRenderValue(["video", "tutorial"])).toBe("Video, Tutorial");
  });

  it("all five kinds print all five labels", () => {
    expect(resourceKindsRenderValue(["doc", "video", "tutorial", "news", "paper"])).toBe(
      "Docs, Video, Tutorial, News, Paper"
    );
  });
});

describe("parseVideoLengthMinutesInput", () => {
  it("blank input is 'no preference'", () => {
    expect(parseVideoLengthMinutesInput("")).toBeUndefined();
    expect(parseVideoLengthMinutesInput("   ")).toBeUndefined();
  });

  it("a plain positive integer parses through", () => {
    expect(parseVideoLengthMinutesInput("7")).toBe(7);
  });

  it("a fractional value rounds down to a whole minute", () => {
    expect(parseVideoLengthMinutesInput("7.9")).toBe(7);
  });

  it("zero is not a usable preference", () => {
    expect(parseVideoLengthMinutesInput("0")).toBeUndefined();
  });

  it("a negative value is not a usable preference", () => {
    expect(parseVideoLengthMinutesInput("-3")).toBeUndefined();
  });

  it("unparseable text is not a usable preference, never NaN reaching state", () => {
    const result = parseVideoLengthMinutesInput("abc");
    expect(result).toBeUndefined();
    expect(Number.isNaN(result as number)).toBe(false);
  });
});

// FIX 3 (review pass): min video length <= max was previously unvalidated
// anywhere on the control's own path - "between 20 and 5 minutes" could
// reach the model with nothing catching it at entry. This predicate is what
// DiscussionResourceSettings.tsx checks to decide whether to show the
// inverted-range message; see videoLengthRangeIsInverted's own doc comment
// for why the UI reacts to it with a message rather than a silent swap.
describe("videoLengthRangeIsInverted", () => {
  it("INVERTED MIN/MAX CASE: true when min is strictly greater than max", () => {
    expect(videoLengthRangeIsInverted(20, 5)).toBe(true);
  });

  it("false for a normally-ordered range", () => {
    expect(videoLengthRangeIsInverted(5, 20)).toBe(false);
  });

  it("false when the bounds are equal - 'exactly N minutes' is not a mistake", () => {
    expect(videoLengthRangeIsInverted(10, 10)).toBe(false);
  });

  it("false when either bound is unset - a single-bound preference has no ordering to violate", () => {
    expect(videoLengthRangeIsInverted(20, undefined)).toBe(false);
    expect(videoLengthRangeIsInverted(undefined, 5)).toBe(false);
  });

  it("false when neither bound is set", () => {
    expect(videoLengthRangeIsInverted(undefined, undefined)).toBe(false);
  });
});
