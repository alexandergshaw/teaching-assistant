import { describe, expect, it, vi } from "vitest";
import { activeCaptionAt, awaitVideoFrameData, awaitVideoMetadata, seekVideoTo, wrapCaptionLines, captionLayout, captionBlockBaselineY, vttLineSetting, type CaptionCue } from "./caption-burn";

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
    expect(layout.topMargin).toBe(Math.round(720 * 0.05));
    expect(layout.padX).toBe(Math.round(layout.fontPx * 0.55));
    expect(layout.padY).toBe(Math.round(layout.fontPx * 0.3));
  });

  it("lineHeight is larger than fontPx", () => {
    const layout = captionLayout(1920, 1080);
    expect(layout.lineHeight).toBeGreaterThan(layout.fontPx);
  });
});

describe("captionBlockBaselineY", () => {
  it("returns bottom position for bottom placement (default)", () => {
    const layout = captionLayout(1280, 720);
    const lineCount = 2;
    const baselineY = captionBlockBaselineY(720, layout, lineCount, "bottom");
    const expected = 720 - layout.bottomMargin - layout.padY;
    expect(baselineY).toBe(expected);
  });

  it("returns bottom position when position is undefined (default)", () => {
    const layout = captionLayout(1280, 720);
    const lineCount = 2;
    const baselineY = captionBlockBaselineY(720, layout, lineCount);
    const expected = 720 - layout.bottomMargin - layout.padY;
    expect(baselineY).toBe(expected);
  });

  it("centers vertically for middle position", () => {
    const layout = captionLayout(1280, 720);
    const lineCount = 2;
    const baselineY = captionBlockBaselineY(720, layout, lineCount, "middle");
    const expected = Math.round(720 / 2 + (lineCount * layout.lineHeight) / 2);
    expect(baselineY).toBe(expected);
  });

  it("places block near top for top position", () => {
    const layout = captionLayout(1280, 720);
    const lineCount = 2;
    const baselineY = captionBlockBaselineY(720, layout, lineCount, "top");
    const expected = Math.round(layout.topMargin + layout.padY + lineCount * layout.lineHeight);
    expect(baselineY).toBe(expected);
  });

  it("middle position baselineY is roughly centered", () => {
    const canvasHeight = 720;
    const layout = captionLayout(1280, canvasHeight);
    const lineCount = 2;
    const baselineY = captionBlockBaselineY(canvasHeight, layout, lineCount, "middle");
    const blockTopY = baselineY - lineCount * layout.lineHeight;
    const centerY = canvasHeight / 2;
    const distanceFromCenter = Math.abs(blockTopY + lineCount * layout.lineHeight / 2 - centerY);
    expect(distanceFromCenter).toBeLessThan(2);
  });
});

describe("vttLineSetting", () => {
  it("returns empty string for bottom position (default)", () => {
    expect(vttLineSetting("bottom")).toBe("");
  });

  it("returns empty string for undefined position", () => {
    expect(vttLineSetting()).toBe("");
  });

  it("returns line:50% for middle position", () => {
    expect(vttLineSetting("middle")).toBe(" line:50%");
  });

  it("returns line:8% for top position", () => {
    expect(vttLineSetting("top")).toBe(" line:8%");
  });
});

/**
 * A stand-in for the offscreen <video> the caption tools sample frames from.
 * vitest runs in the node environment here, so there is no real media element;
 * what these tests need from one is only its event plumbing plus the two
 * properties the helpers read and write.
 */
function fakeVideo(init: { readyState?: number; currentTime?: number } = {}) {
  const listeners = new Map<string, Set<() => void>>();
  return {
    readyState: init.readyState ?? 0,
    currentTime: init.currentTime ?? 0,
    addEventListener(type: string, fn: () => void) {
      const set = listeners.get(type) ?? new Set<() => void>();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn);
    },
    emit(type: string) {
      for (const fn of [...(listeners.get(type) ?? [])]) fn();
    },
    listenerCount() {
      let total = 0;
      for (const set of listeners.values()) total += set.size;
      return total;
    },
  };
}

type FakeVideo = ReturnType<typeof fakeVideo>;

const asVideo = (v: FakeVideo) => v as unknown as HTMLVideoElement;

describe("awaitVideoMetadata", () => {
  it("resolves immediately when metadata is already loaded", async () => {
    const v = fakeVideo({ readyState: 1 });
    await expect(awaitVideoMetadata(asVideo(v))).resolves.toBeUndefined();
    expect(v.listenerCount()).toBe(0);
  });

  it("resolves when loadedmetadata fires", async () => {
    const v = fakeVideo();
    const pending = awaitVideoMetadata(asVideo(v));
    v.emit("loadedmetadata");
    await expect(pending).resolves.toBeUndefined();
  });

  it("rejects when the source errors instead of waiting forever", async () => {
    // The shipped hang: a revoked or undecodable src fires "error" and never
    // fires "loadedmetadata", so a listener on loadedmetadata alone leaves the
    // promise pending and the UI stuck on its busy label.
    const v = fakeVideo();
    const pending = awaitVideoMetadata(asVideo(v));
    v.emit("error");
    await expect(pending).rejects.toThrow(/could not read this video/i);
  });

  it("rejects once the timeout elapses with no event at all", async () => {
    vi.useFakeTimers();
    try {
      const v = fakeVideo();
      const pending = awaitVideoMetadata(asVideo(v), 5000);
      const assertion = expect(pending).rejects.toThrow(/too long/i);
      await vi.advanceTimersByTimeAsync(5000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("detaches its listeners on every outcome", async () => {
    const resolved = fakeVideo();
    const settled = awaitVideoMetadata(asVideo(resolved));
    resolved.emit("loadedmetadata");
    await settled;
    expect(resolved.listenerCount()).toBe(0);

    const failed = fakeVideo();
    const rejected = awaitVideoMetadata(asVideo(failed));
    failed.emit("error");
    await expect(rejected).rejects.toThrow();
    expect(failed.listenerCount()).toBe(0);
  });
});

describe("awaitVideoFrameData", () => {
  it("resolves immediately once a frame is decoded", async () => {
    const v = fakeVideo({ readyState: 2 });
    await expect(awaitVideoFrameData(asVideo(v))).resolves.toBeUndefined();
    expect(v.listenerCount()).toBe(0);
  });

  it("does NOT treat metadata alone as a drawable frame", async () => {
    // HAVE_METADATA (1) gives dimensions but no pixels, so drawImage paints
    // nothing. Sampling the t=0 frame right after metadata - the one seek that
    // is a no-op, so nothing else forces a decode - sent a blank image to the
    // vision model as though it were real content.
    const v = fakeVideo({ readyState: 1 });
    let settled = false;
    const pending = awaitVideoFrameData(asVideo(v)).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    v.emit("loadeddata");
    await pending;
    expect(settled).toBe(true);
  });

  it("resolves on canplay when loadeddata is not what arrives", async () => {
    const v = fakeVideo({ readyState: 1 });
    const pending = awaitVideoFrameData(asVideo(v));
    v.emit("canplay");
    await expect(pending).resolves.toBeUndefined();
    expect(v.listenerCount()).toBe(0);
  });

  it("rejects when the source errors", async () => {
    const v = fakeVideo();
    const pending = awaitVideoFrameData(asVideo(v));
    v.emit("error");
    await expect(pending).rejects.toThrow(/could not read this video/i);
  });
});

describe("seekVideoTo", () => {
  it("resolves without waiting for an event when already at that time", async () => {
    // Browsers may fire no "seeked" for a seek to the current time, so a bare
    // wait-for-seeked stalls the sampling loop on its very first frame (t=0 of
    // a video that is already at 0).
    const v = fakeVideo({ currentTime: 0 });
    await expect(seekVideoTo(asVideo(v), 0)).resolves.toBe("seeked");
    expect(v.listenerCount()).toBe(0);
  });

  it("seeks and resolves when seeked fires", async () => {
    const v = fakeVideo({ currentTime: 0 });
    const pending = seekVideoTo(asVideo(v), 12.5);
    expect(v.currentTime).toBe(12.5);
    v.emit("seeked");
    await expect(pending).resolves.toBe("seeked");
    expect(v.listenerCount()).toBe(0);
  });

  it("reports a stall rather than rejecting, so one stuck seek is survivable", async () => {
    // One stuck seek should cost one duplicated frame. The caller counts these
    // and gives up on a run of them, which is why the outcome has to be
    // distinguishable from a clean seek instead of silently swallowed.
    vi.useFakeTimers();
    try {
      const v = fakeVideo({ currentTime: 0 });
      const pending = seekVideoTo(asVideo(v), 30, 1000);
      await vi.advanceTimersByTimeAsync(1000);
      await expect(pending).resolves.toBe("stalled");
      expect(v.listenerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects when the source errors mid-seek", async () => {
    const v = fakeVideo({ currentTime: 0 });
    const pending = seekVideoTo(asVideo(v), 30);
    v.emit("error");
    await expect(pending).rejects.toThrow(/could not read this video/i);
  });
});
