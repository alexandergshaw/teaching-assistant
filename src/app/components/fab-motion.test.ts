import { describe, it, expect } from "vitest";
import {
  FAB_CLOSE_MS,
  FAB_EASING,
  FAB_MENU_TRANSITION_MS,
  FAB_OPEN_MS,
  fabIconLayerStyle,
} from "./fab-motion";

describe("FAB motion timing (AC1)", () => {
  it("open and close sit in the 150-250ms range and close is not longer than open", () => {
    expect(FAB_CLOSE_MS).toBeGreaterThanOrEqual(150);
    expect(FAB_OPEN_MS).toBeLessThanOrEqual(250);
    expect(FAB_CLOSE_MS).toBeLessThanOrEqual(FAB_OPEN_MS);
  });

  it("the menu transition is the same pair of constants", () => {
    expect(FAB_MENU_TRANSITION_MS).toEqual({ enter: FAB_OPEN_MS, exit: FAB_CLOSE_MS });
  });
});

describe("FAB easing cannot overshoot (AC2)", () => {
  const match = /^cubic-bezier\(\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)$/.exec(FAB_EASING);

  it("is a cubic-bezier with four numbers", () => {
    expect(match).not.toBeNull();
  });

  it("keeps every control point inside [0, 1]", () => {
    const nums = (match ?? []).slice(1).map(Number);
    expect(nums).toHaveLength(4);
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
});

describe("fabIconLayerStyle frozen states (AC3)", () => {
  // Frozen literal oracle, written by hand and not derived from the function.
  const table = [
    { layer: "sparkle", open: false, opacity: 1, transform: "rotate(0deg)" },
    { layer: "sparkle", open: true, opacity: 0, transform: "rotate(90deg)" },
    { layer: "close", open: false, opacity: 0, transform: "rotate(-90deg)" },
    { layer: "close", open: true, opacity: 1, transform: "rotate(0deg)" },
  ] as const;

  for (const row of table) {
    it(`${row.layer} layer, open=${row.open}`, () => {
      const style = fabIconLayerStyle(row.open, row.layer);
      expect(style.opacity).toBe(row.opacity);
      expect(style.transform).toBe(row.transform);
    });
  }

  it("both layers are absolutely positioned and never take pointer events", () => {
    for (const open of [false, true]) {
      for (const layer of ["sparkle", "close"] as const) {
        const style = fabIconLayerStyle(open, layer);
        expect(style.pointerEvents).toBe("none");
        expect(style.position).toBe("absolute");
      }
    }
  });
});

describe("fabIconLayerStyle transition follows the target state (AC4)", () => {
  for (const layer of ["sparkle", "close"] as const) {
    it(`${layer}: opening uses the open duration, closing the close duration`, () => {
      const opening = String(fabIconLayerStyle(true, layer).transition);
      const closing = String(fabIconLayerStyle(false, layer).transition);
      expect(opening).toContain(`opacity ${FAB_OPEN_MS}ms ${FAB_EASING}`);
      expect(opening).toContain(`transform ${FAB_OPEN_MS}ms ${FAB_EASING}`);
      expect(closing).toContain(`opacity ${FAB_CLOSE_MS}ms ${FAB_EASING}`);
      expect(closing).toContain(`transform ${FAB_CLOSE_MS}ms ${FAB_EASING}`);
      expect(opening).not.toBe(closing);
    });
  }
});
