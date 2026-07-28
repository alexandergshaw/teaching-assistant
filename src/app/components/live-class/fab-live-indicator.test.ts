import { describe, it, expect } from "vitest";
import {
  isLiveClassSessionActive,
  formatElapsedCompact,
  computeDefaultWindowPos,
  computeLiveBadgePosition,
  computeUnreadBadgePosition,
} from "./fab-live-indicator";

describe("isLiveClassSessionActive", () => {
  it("is false while idle", () => {
    expect(isLiveClassSessionActive("idle")).toBe(false);
  });

  it("is true for starting, live and ending - the indicator must not blink off between phases", () => {
    expect(isLiveClassSessionActive("starting")).toBe(true);
    expect(isLiveClassSessionActive("live")).toBe(true);
    expect(isLiveClassSessionActive("ending")).toBe(true);
  });
});

describe("formatElapsedCompact", () => {
  it("formats sub-minute durations as mm:ss", () => {
    expect(formatElapsedCompact(0)).toBe("00:00");
    expect(formatElapsedCompact(5)).toBe("00:05");
    expect(formatElapsedCompact(65)).toBe("01:05");
  });

  it("formats durations past an hour as hh:mm:ss", () => {
    expect(formatElapsedCompact(3661)).toBe("01:01:01");
  });

  it("floors fractional seconds and clamps negatives to zero", () => {
    expect(formatElapsedCompact(59.9)).toBe("00:59");
    expect(formatElapsedCompact(-5)).toBe("00:00");
  });
});

describe("computeDefaultWindowPos", () => {
  it("anchors the window to the bottom-right corner, inset by the margin", () => {
    const pos = computeDefaultWindowPos(
      { width: 1280, height: 800 },
      { width: 640, height: 600 },
      { right: 24, bottom: 100 }
    );
    expect(pos).toEqual({ x: 1280 - 640 - 24 - 8, y: 800 - 600 - 100 });
  });

  it("clamps to a minimum of 8px so the window never renders off the top/left edge on a small viewport", () => {
    const pos = computeDefaultWindowPos(
      { width: 400, height: 300 },
      { width: 640, height: 600 },
      { right: 24, bottom: 100 }
    );
    expect(pos).toEqual({ x: 8, y: 8 });
  });
});

describe("computeLiveBadgePosition", () => {
  // The values AiChatFab.tsx actually uses: DIAL_BOTTOM/DIAL_RIGHT = 24,
  // FAB_SIZE = 56 (MUI's default Fab diameter), LIVE_BADGE_HEIGHT = 32,
  // LIVE_BADGE_GAP = 12.
  it("sits beside the Fab (right of the badge = dial margin + fab size + gap)", () => {
    const pos = computeLiveBadgePosition({ right: 24, bottom: 24 }, 56, 32, 12);
    expect(pos.right).toBe(24 + 56 + 12);
  });

  it("is vertically centered on the Fab, never stacked above it", () => {
    const fabSize = 56;
    const badgeHeight = 32;
    const dialMargin = { right: 24, bottom: 24 };
    const pos = computeLiveBadgePosition(dialMargin, fabSize, badgeHeight, 12);
    // The Fab spans [dialMargin.bottom, dialMargin.bottom + fabSize]; the
    // badge spans [pos.bottom, pos.bottom + badgeHeight]. Centering means
    // both spans share the same midpoint.
    const fabMidpoint = dialMargin.bottom + fabSize / 2;
    const badgeMidpoint = pos.bottom + badgeHeight / 2;
    expect(badgeMidpoint).toBe(fabMidpoint);
    // And the badge's own top edge must never reach the Fab's top edge -
    // i.e. it never climbs into the dial's upward expansion path.
    expect(pos.bottom + badgeHeight).toBeLessThanOrEqual(dialMargin.bottom + fabSize);
  });

  it("a badge exactly as tall as the Fab sits flush with it (zero vertical offset)", () => {
    const pos = computeLiveBadgePosition({ right: 24, bottom: 24 }, 56, 56, 12);
    expect(pos.bottom).toBe(24);
  });

  it("scales with a different dial margin/fab size rather than hardcoding one layout", () => {
    const pos = computeLiveBadgePosition({ right: 40, bottom: 16 }, 64, 40, 8);
    expect(pos).toEqual({ bottom: 16 + (64 - 40) / 2, right: 40 + 64 + 8 });
  });
});

describe("computeUnreadBadgePosition", () => {
  it("centers the badge on the Fab's top-right corner", () => {
    // The values AiChatFab.tsx actually uses: DIAL_BOTTOM/DIAL_RIGHT = 24,
    // FAB_SIZE = 56.
    const pos = computeUnreadBadgePosition({ right: 24, bottom: 24 }, 56, 20);
    expect(pos).toEqual({ bottom: 24 + 56 - 10, right: 24 - 10 });
  });

  it("sits above and outside computeLiveBadgePosition's own pill, never on top of it", () => {
    const dialMargin = { right: 24, bottom: 24 };
    const fabSize = 56;
    const unread = computeUnreadBadgePosition(dialMargin, fabSize, 20);
    const live = computeLiveBadgePosition(dialMargin, fabSize, 32, 12);
    // computeLiveBadgePosition's pill sits to the LEFT of the Fab (a larger
    // `right` than the Fab's own edge); the unread badge sits ON the Fab's
    // corner (a smaller `right` than the Fab's own edge) - the two never
    // overlap horizontally.
    expect(unread.right).toBeLessThan(dialMargin.right);
    expect(live.right).toBeGreaterThan(dialMargin.right + fabSize);
  });

  it("scales with a different dial margin/fab size/badge size", () => {
    const pos = computeUnreadBadgePosition({ right: 40, bottom: 16 }, 64, 24);
    expect(pos).toEqual({ bottom: 16 + 64 - 12, right: 40 - 12 });
  });
});
