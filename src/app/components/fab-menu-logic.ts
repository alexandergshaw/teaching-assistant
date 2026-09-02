// Pure logic for the FAB's quick-actions menu (the redesign that replaced
// the old seven-entry SpeedDial - see AiChatFab.tsx and
// FabQuickActionsMenu.tsx for the component halves that use these). No
// React, no DOM globals beyond feature-detecting a passed-in
// `navigator`-shaped object - every input is a parameter, so this is
// deterministic and unit-testable without a browser, mirroring
// fab-live-indicator.ts's own pure-logic convention.

export interface ViewportSize {
  width: number;
  height: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export interface Pos {
  x: number;
  y: number;
}

/**
 * Clamp a position - typically one just restored from localStorage - into
 * the CURRENT viewport. This is the fix for one half of the "a live
 * invisible control" defect this pass addresses everywhere else (F2): a
 * floating window's restored position used to be trusted unconditionally
 * ("if (saved) return saved;"), so a position saved on a wider monitor
 * reopens fully off-viewport on a narrower one - clicking the action then
 * visibly does nothing, and a second click genuinely closes a window the
 * user never saw open. Clamping on restore (the first-ever default
 * placement was already viewport-aware; this covers the OTHER path, a
 * previously-saved position) closes that gap.
 *
 * `margin` mirrors the 8px inset AiChatFab.tsx's own default-placement math
 * already uses everywhere else in this file's neighborhood
 * (computeDefaultWindowPos in fab-live-indicator.ts).
 */
export function clampPosToViewport(pos: Pos, size: WindowSize, viewport: ViewportSize, margin = 8): Pos {
  const maxX = Math.max(margin, viewport.width - size.width - margin);
  const maxY = Math.max(margin, viewport.height - size.height - margin);
  return {
    x: Math.min(Math.max(pos.x, margin), maxX),
    y: Math.min(Math.max(pos.y, margin), maxY),
  };
}

/**
 * The minimal shape this module needs from `navigator` - accepting exactly
 * this (rather than the whole lib.dom `Navigator` type) is what keeps
 * `supportsGetDisplayMedia`/`supportsMicrophone` unit-testable with a plain
 * object literal, no jsdom or real browser required.
 */
export interface MediaCapabilityNavigator {
  mediaDevices?: {
    getDisplayMedia?: unknown;
    getUserMedia?: unknown;
  };
}

/**
 * Whether this browser can even attempt a screen-share capture - the
 * Legibility probe's hard prerequisite (F6). Feature-detection only; no
 * permission is requested or checked here. A browser that lacks the API
 * entirely can never succeed, so the menu disables this entry with a reason
 * BEFORE the click, rather than only failing after one (which is what
 * happened before this fix).
 */
export function supportsGetDisplayMedia(nav: MediaCapabilityNavigator | undefined): boolean {
  return typeof nav?.mediaDevices?.getDisplayMedia === "function";
}

/**
 * Whether this browser exposes the getUserMedia API at all - Live Class's
 * hard prerequisite (F6): it needs a microphone. Same feature-detection-only
 * scope as supportsGetDisplayMedia above - this cannot know whether a
 * microphone is actually plugged in or whether permission will be granted
 * (that still surfaces through SessionSetupPanel's own micError after the
 * click, unchanged by this fix), only whether the browser could ever
 * support it at all.
 */
export function supportsMicrophone(nav: MediaCapabilityNavigator | undefined): boolean {
  return typeof nav?.mediaDevices?.getUserMedia === "function";
}
