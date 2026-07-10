import { describe, expect, it } from "vitest";
import { activeCaptionAt, wrapCaptionLines, captionLayout, type CaptionCue } from "./caption-burn";

describe("activeCaptionAt", () => {
  it("returns the cue when time is inside its range", () => {
    const cues: CaptionCue[] = [
      { start: 0, end: 5, text: "First" },
      { start: 5, end: 10, text: "Second" },
      { start: 10, end: 15, text: "Third" },
    ];
    expect(activeCaptionAt(cues, 2.5)).toEqual({ start: 0, end: 5, text: "First" });
    expect(activeCaptionAt(cues, 7.5)).toEqual({ start: 5, end: 10, text: "Second" });
  });

  it("returns the cue when time equals start (inclusive)", () => {
    const cues: CaptionCue[] = [{ start: 5, end: 10, text: "Cue" }];
    expect(activeCaptionAt(cues, 5)).toEqual({ start: 5, end: 10, text: "Cue" });
  });

  it("returns null when time equals end (exclusive)", () => {
    const cues: CaptionCue[] = [{ start: 5, end: 10, text: "Cue" }];
    expect(activeCaptionAt(cues, 10)).toBeNull();
  });

  it("returns null when time is outside all ranges", () => {
    const cues: CaptionCue[] = [
      { start: 5, end: 10, text: "Cue" },
      { start: 15, end: 20, text: "Another" },
    ];
    expect(activeCaptionAt(cues, 3)).toBeNull();
    expect(activeCaptionAt(cues, 12)).toBeNull();
    expect(activeCaptionAt(cues, 25)).toBeNull();
  });

  it("returns null for an empty cue list", () => {
    expect(activeCaptionAt([], 5)).toBeNull();
  });
});

describe("wrapCaptionLines", () => {
  const measure = (s: string) => s.length * 10;

  it("wraps text when it exceeds maxWidth", () => {
    const result = wrapCaptionLines("This is a longer text that should wrap", 100, measure);
    expect(result.length).toBeGreaterThan(1);
    expect(result.every((line) => measure(line) <= 100)).toBe(true);
  });

  it("puts a single word wider than maxWidth on its own line", () => {
    const result = wrapCaptionLines("Hello supercalifragilisticexpialidocious world", 100, measure);
    expect(result).toContain("supercalifragilisticexpialidocious");
    expect(result.length).toBeGreaterThan(1);
  });

  it("returns empty array for empty input", () => {
    expect(wrapCaptionLines("", 100, measure)).toEqual([]);
    expect(wrapCaptionLines("   ", 100, measure)).toEqual([]);
  });

  it("returns a single line when text fits", () => {
    const result = wrapCaptionLines("Hello world", 200, measure);
    expect(result).toEqual(["Hello world"]);
  });

  it("preserves single spaces between words", () => {
    const result = wrapCaptionLines("one two three", 200, measure);
    expect(result).toEqual(["one two three"]);
  });

  it("handles multiple spaces and newlines", () => {
    const result = wrapCaptionLines("one   two\n\nthree", 200, measure);
    expect(result.join(" ")).toEqual("one two three");
  });
});

describe("captionLayout", () => {
  it("uses 14px minimum font size for tiny canvas", () => {
    const layout = captionLayout(100, 100);
    expect(layout.fontPx).toBe(14);
  });

  it("scales font size for larger canvas", () => {
    const layout = captionLayout(1280, 720);
    const expectedFontPx = Math.max(14, Math.round(720 * 0.045));
    expect(layout.fontPx).toBe(expectedFontPx);
    expect(layout.fontPx).toBeGreaterThan(14);
  });

  it("computes sane values for 1280x720", () => {
    const layout = captionLayout(1280, 720);
    expect(layout.fontPx).toBeGreaterThan(0);
    expect(layout.maxTextWidth).toBe(Math.round(1280 * 0.88));
    expect(layout.lineHeight).toBe(Math.round(layout.fontPx * 1.35));
    expect(layout.bottomMargin).toBe(Math.round(720 * 0.05));
    expect(layout.padX).toBe(Math.round(layout.fontPx * 0.55));
    expect(layout.padY).toBe(Math.round(layout.fontPx * 0.3));
  });

  it("lineHeight is larger than fontPx", () => {
    const layout = captionLayout(1920, 1080);
    expect(layout.lineHeight).toBeGreaterThan(layout.fontPx);
  });
});
