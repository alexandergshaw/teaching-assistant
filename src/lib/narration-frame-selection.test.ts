import { describe, expect, it } from "vitest";
import { narrationFrameChange, narrationNoteTimes, narrationProbeTimes, selectNarrationFrameTimes } from "./narration-frame-selection";

describe("narration frame selection", () => {
  it("reads distinct fractional timestamps and limits markers to the source video", () => {
    expect(narrationNoteTimes("At 2:02.5, show the mouse. At 4:07 show the keyboard. Around 2:02.500 again, before 5:00.", 275)).toEqual([122.5, 247]);
    expect(narrationNoteTimes("1:01:02.500, 1:99:02, 8:07.1234, 0:01.", 4000)).toEqual([3662.5, 1]);
  });

  it("bounds browser work and keeps coverage through the last drawable frame", () => {
    expect(narrationProbeTimes(0.05)).toEqual([0]);
    const times = narrationProbeTimes(7200);
    expect(times).toHaveLength(64);
    expect(times[0]).toBe(0);
    expect(times.at(-1)).toBe(7199.9);
  });

  it("detects a localized visual reveal in otherwise identical frames", () => {
    const width = 32, pixels = new Uint8ClampedArray(width * width * 4);
    const reveal = pixels.slice();
    for (let y = 8; y < 12; y++) for (let x = 8; x < 12; x++) reveal[4 * (y * width + x)] = 255;
    expect(narrationFrameChange(pixels, pixels, width)).toBe(0);
    expect(narrationFrameChange(pixels, reveal, width)).toBeGreaterThan(0.035);
  });

  it("preserves timestamp neighborhoods and novel frames within the image budget", () => {
    const notes = [122.5, 247];
    const probes = [{ timeSec: 101, change: 0.4 }, { timeSec: 103, change: 0.37 }, { timeSec: 209, change: 0.3 }];
    const times = selectNarrationFrameTimes(275, 18, probes, notes);
    expect(times).toEqual([...new Set(times)].sort((left, right) => left - right));
    expect(times.length).toBeLessThanOrEqual(18);
    expect(times).toEqual(expect.arrayContaining([0, 101, 122.2, 122.8, 209, 246.7, 247.3, 274.9]));
    expect(times).not.toContain(103);
  });

  it("preserves end-to-end coverage even without visible changes or notes", () => {
    const times = selectNarrationFrameTimes(30, 18, [], []);
    expect(times.length).toBeGreaterThanOrEqual(6);
    expect(times.every((time, index) => index === 0 || time - times[index - 1] <= 6)).toBe(true);
    expect(times[0]).toBe(0);
    expect(times.at(-1)).toBe(29.9);
  });
});
