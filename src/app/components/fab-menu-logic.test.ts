import { describe, it, expect } from "vitest";
import { clampPosToViewport, supportsGetDisplayMedia, supportsMicrophone } from "./fab-menu-logic";

describe("clampPosToViewport", () => {
  it("leaves an already-on-screen position untouched", () => {
    const pos = clampPosToViewport({ x: 100, y: 100 }, { width: 360, height: 420 }, { width: 1280, height: 800 });
    expect(pos).toEqual({ x: 100, y: 100 });
  });

  it("F2: clamps a position saved on a wider monitor back onto a narrower one", () => {
    // The exact bug this guards: a window saved at x=1600 on a 1920px-wide
    // monitor, restored unclamped on a 1024px-wide one, used to render
    // fully off the right edge - invisible, but still "open" as far as
    // state was concerned, so a second click on the same action genuinely
    // closed a window the instructor never saw.
    //
    // Verified able to fail: temporarily changing clampPosToViewport's body
    // to `return pos;` (the old "if (saved) return saved" behavior) turns
    // this red - `x` comes back as 1600, off the 1024px viewport - while
    // restoring the real clamp turns it green again.
    const pos = clampPosToViewport({ x: 1600, y: 50 }, { width: 360, height: 420 }, { width: 1024, height: 768 });
    expect(pos.x).toBeLessThanOrEqual(1024 - 360);
    expect(pos.x).toBeGreaterThanOrEqual(8);
    expect(pos).toEqual({ x: 1024 - 360 - 8, y: 50 });
  });

  it("clamps a negative (off the top/left edge) saved position back to the margin", () => {
    const pos = clampPosToViewport({ x: -200, y: -50 }, { width: 360, height: 420 }, { width: 1280, height: 800 });
    expect(pos).toEqual({ x: 8, y: 8 });
  });

  it("never produces a position outside [margin, viewport - size - margin] even on a viewport smaller than the window", () => {
    const pos = clampPosToViewport({ x: 5000, y: 5000 }, { width: 640, height: 620 }, { width: 400, height: 300 });
    // The viewport is smaller than the window itself - falls back to the
    // margin, same floor computeDefaultWindowPos already uses for this case.
    expect(pos).toEqual({ x: 8, y: 8 });
  });
});

describe("supportsGetDisplayMedia", () => {
  it("is true when navigator.mediaDevices.getDisplayMedia is a function", () => {
    expect(supportsGetDisplayMedia({ mediaDevices: { getDisplayMedia: () => {} } })).toBe(true);
  });

  it("is false when mediaDevices is missing entirely", () => {
    expect(supportsGetDisplayMedia({})).toBe(false);
  });

  it("is false when navigator itself is undefined (SSR)", () => {
    expect(supportsGetDisplayMedia(undefined)).toBe(false);
  });

  it("is false when getDisplayMedia is present but not a function", () => {
    expect(supportsGetDisplayMedia({ mediaDevices: { getDisplayMedia: null } })).toBe(false);
  });
});

describe("supportsMicrophone", () => {
  it("is true when navigator.mediaDevices.getUserMedia is a function", () => {
    expect(supportsMicrophone({ mediaDevices: { getUserMedia: () => {} } })).toBe(true);
  });

  it("is false when mediaDevices is missing entirely", () => {
    expect(supportsMicrophone({})).toBe(false);
  });

  it("is false when navigator itself is undefined (SSR)", () => {
    expect(supportsMicrophone(undefined)).toBe(false);
  });
});
