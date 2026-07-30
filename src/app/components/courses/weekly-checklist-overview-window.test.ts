import { describe, it, expect } from "vitest";
import {
  WEEKLY_CHECKLIST_OVERVIEW_WINDOW_W,
  WEEKLY_CHECKLIST_OVERVIEW_WINDOW_H,
  WEEKLY_CHECKLIST_OVERVIEW_MIN_W,
  WEEKLY_CHECKLIST_OVERVIEW_MIN_H,
  sanitizeWindowPos,
  sanitizeWindowSize,
  clampWindowPos,
  clampWindowSize,
  resolveInitialWindowRect,
} from "./weekly-checklist-overview-window";

const VIEWPORT = { width: 1280, height: 800 };
const MARGIN = { right: 24, bottom: 100 };

describe("sanitizeWindowPos", () => {
  it("accepts a plain {x, y} pair of finite numbers", () => {
    expect(sanitizeWindowPos({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
  });

  it("rejects null, non-objects, and arrays", () => {
    expect(sanitizeWindowPos(null)).toBeNull();
    expect(sanitizeWindowPos(undefined)).toBeNull();
    expect(sanitizeWindowPos("not an object")).toBeNull();
    expect(sanitizeWindowPos(42)).toBeNull();
  });

  it("rejects missing or non-numeric fields", () => {
    expect(sanitizeWindowPos({ x: 10 })).toBeNull();
    expect(sanitizeWindowPos({ x: "10", y: 20 })).toBeNull();
    expect(sanitizeWindowPos({})).toBeNull();
  });

  it("rejects NaN and Infinity - corrupt JSON must not slip through as a real coordinate", () => {
    expect(sanitizeWindowPos({ x: NaN, y: 20 })).toBeNull();
    expect(sanitizeWindowPos({ x: 10, y: Infinity })).toBeNull();
    expect(sanitizeWindowPos({ x: -Infinity, y: 20 })).toBeNull();
  });
});

describe("sanitizeWindowSize", () => {
  it("accepts a size at or above the resize floor", () => {
    expect(sanitizeWindowSize({ width: WEEKLY_CHECKLIST_OVERVIEW_MIN_W, height: WEEKLY_CHECKLIST_OVERVIEW_MIN_H })).toEqual({
      width: WEEKLY_CHECKLIST_OVERVIEW_MIN_W,
      height: WEEKLY_CHECKLIST_OVERVIEW_MIN_H,
    });
    expect(sanitizeWindowSize({ width: 700, height: 600 })).toEqual({ width: 700, height: 600 });
  });

  it("rejects a size below the resize floor - a live resize could never have produced it", () => {
    expect(sanitizeWindowSize({ width: WEEKLY_CHECKLIST_OVERVIEW_MIN_W - 1, height: 400 })).toBeNull();
    expect(sanitizeWindowSize({ width: 400, height: WEEKLY_CHECKLIST_OVERVIEW_MIN_H - 1 })).toBeNull();
  });

  it("rejects malformed values", () => {
    expect(sanitizeWindowSize(null)).toBeNull();
    expect(sanitizeWindowSize({ width: 700 })).toBeNull();
    expect(sanitizeWindowSize({ width: NaN, height: 600 })).toBeNull();
    expect(sanitizeWindowSize("560x480")).toBeNull();
  });
});

describe("clampWindowPos", () => {
  it("leaves an in-bounds position untouched", () => {
    const pos = { x: 100, y: 100 };
    const size = { width: 560, height: 480 };
    expect(clampWindowPos(pos, size, VIEWPORT)).toEqual(pos);
  });

  it("clamps a negative position back to 0 on both axes", () => {
    const size = { width: 560, height: 480 };
    expect(clampWindowPos({ x: -50, y: -50 }, size, VIEWPORT)).toEqual({ x: 0, y: 0 });
  });

  it("clamps a position that would push the window off the right/bottom edge", () => {
    const size = { width: 560, height: 480 };
    // Restored from a much wider screen - way past the right/bottom edge here.
    const pos = { x: 5000, y: 5000 };
    const clamped = clampWindowPos(pos, size, VIEWPORT);
    expect(clamped.x).toBe(VIEWPORT.width - size.width);
    expect(clamped.y).toBe(VIEWPORT.height - size.height);
  });

  it("clamps to 0 when the window itself is larger than the viewport", () => {
    const size = { width: 2000, height: 2000 };
    const clamped = clampWindowPos({ x: 300, y: 300 }, size, VIEWPORT);
    expect(clamped).toEqual({ x: 0, y: 0 });
  });
});

describe("clampWindowSize", () => {
  it("leaves a size that fits the viewport untouched", () => {
    const size = { width: 560, height: 480 };
    expect(clampWindowSize(size, VIEWPORT)).toEqual(size);
  });

  it("shrinks a size persisted from a larger monitor down to the current viewport", () => {
    const size = { width: 2000, height: 1500 };
    expect(clampWindowSize(size, VIEWPORT)).toEqual({ width: VIEWPORT.width, height: VIEWPORT.height });
  });

  it("never shrinks below the resize floor even on a tiny viewport", () => {
    const size = { width: 560, height: 480 };
    const tinyViewport = { width: 300, height: 200 };
    expect(clampWindowSize(size, tinyViewport)).toEqual({
      width: WEEKLY_CHECKLIST_OVERVIEW_MIN_W,
      height: WEEKLY_CHECKLIST_OVERVIEW_MIN_H,
    });
  });
});

describe("resolveInitialWindowRect", () => {
  it("falls back to the default size and a computed default position when nothing is persisted", () => {
    const resolved = resolveInitialWindowRect(null, null, VIEWPORT, MARGIN);
    expect(resolved.size).toEqual({ width: WEEKLY_CHECKLIST_OVERVIEW_WINDOW_W, height: WEEKLY_CHECKLIST_OVERVIEW_WINDOW_H });
    // Bottom-right anchored, same as computeDefaultWindowPos's own contract.
    expect(resolved.pos.x).toBe(VIEWPORT.width - WEEKLY_CHECKLIST_OVERVIEW_WINDOW_W - MARGIN.right - 8);
    expect(resolved.pos.y).toBe(VIEWPORT.height - WEEKLY_CHECKLIST_OVERVIEW_WINDOW_H - MARGIN.bottom);
  });

  it("restores a valid persisted rect unchanged", () => {
    const rawPos = { x: 200, y: 150 };
    const rawSize = { width: 700, height: 550 };
    const resolved = resolveInitialWindowRect(rawPos, rawSize, VIEWPORT, MARGIN);
    expect(resolved.pos).toEqual(rawPos);
    expect(resolved.size).toEqual(rawSize);
  });

  it("discards a corrupt persisted position but keeps a valid persisted size", () => {
    const rawSize = { width: 700, height: 550 };
    const resolved = resolveInitialWindowRect("garbage", rawSize, VIEWPORT, MARGIN);
    expect(resolved.size).toEqual(rawSize);
    // Falls back to the default position, computed against the RESTORED size.
    expect(resolved.pos.x).toBe(VIEWPORT.width - rawSize.width - MARGIN.right - 8);
  });

  it("clamps a persisted position that is now off-screen back into the viewport", () => {
    const rawPos = { x: 9000, y: 9000 };
    const rawSize = { width: 700, height: 550 };
    const resolved = resolveInitialWindowRect(rawPos, rawSize, VIEWPORT, MARGIN);
    expect(resolved.pos.x).toBeLessThanOrEqual(VIEWPORT.width - rawSize.width);
    expect(resolved.pos.y).toBeLessThanOrEqual(VIEWPORT.height - rawSize.height);
  });

  it("is pure - the same input always produces the same output", () => {
    const first = resolveInitialWindowRect({ x: 10, y: 10 }, { width: 600, height: 500 }, VIEWPORT, MARGIN);
    const second = resolveInitialWindowRect({ x: 10, y: 10 }, { width: 600, height: 500 }, VIEWPORT, MARGIN);
    expect(first).toEqual(second);
  });
});
