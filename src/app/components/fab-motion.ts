import type { CSSProperties } from "react";

// Motion constants and the pure glyph-layer style for the quick-actions FAB
// (FabQuickActionsMenu.tsx). A plain leaf so the numbers and the four
// (layer, open) states are testable: no component is rendered by any test here.
//
// Reduced motion is deliberately NOT handled in this file. The single global
// block in globals.css forces a near-zero transition-duration with !important
// on every element, which beats the inline transitions below. Do not add a
// second mechanism here.

/** Enter duration for the glyph and the menu, in milliseconds. */
export const FAB_OPEN_MS = 200;

/** Exit duration for the glyph and the menu, in milliseconds. Shorter than enter. */
export const FAB_CLOSE_MS = 150;

/** Ease-out curve, same value as useDragReorder.ts. Both y values sit in [0, 1], so it cannot overshoot. */
export const FAB_EASING = "cubic-bezier(0.2, 0, 0, 1)";

/** Passed to the Menu's transitionDuration prop (reaches Popover then Grow). */
export const FAB_MENU_TRANSITION_MS = { enter: FAB_OPEN_MS, exit: FAB_CLOSE_MS } as const;

/** Rotation applied to the layer that is leaving, and (negated) the one that is arriving. */
const QUARTER_TURN_DEG = 90;

export type FabIconLayer = "sparkle" | "close";

/** The 24px box that stacks the two absolutely positioned glyph layers. */
export const FAB_ICON_STACK_STYLE: CSSProperties = {
  position: "relative",
  display: "block",
  width: 24,
  height: 24,
};

/**
 * Inline style for one glyph layer. The transition reads the TARGET state, so
 * opening uses the open duration and closing uses the close duration.
 */
export function fabIconLayerStyle(open: boolean, layer: FabIconLayer): CSSProperties {
  const visible = layer === "sparkle" ? !open : open;
  let rotation = 0;
  if (!visible) {
    rotation = layer === "sparkle" ? QUARTER_TURN_DEG : -QUARTER_TURN_DEG;
  }
  const ms = open ? FAB_OPEN_MS : FAB_CLOSE_MS;
  return {
    position: "absolute",
    top: 0,
    left: 0,
    display: "flex",
    width: 24,
    height: 24,
    pointerEvents: "none",
    opacity: visible ? 1 : 0,
    transform: `rotate(${rotation}deg)`,
    transition: `opacity ${ms}ms ${FAB_EASING}, transform ${ms}ms ${FAB_EASING}`,
  };
}
