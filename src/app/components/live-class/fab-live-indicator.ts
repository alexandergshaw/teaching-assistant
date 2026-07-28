// Pure logic for hosting Live Class Mode inside the app-wide FAB
// (AiChatFab.tsx / LiveClassWindow.tsx) rather than its own Manual subtab:
// whether the always-mounted session hook counts as "live" for the FAB's
// persistent recording indicator (regression 90.11 - an unmistakable
// indicator for as long as a session is active, even while the window
// itself is closed), the compact elapsed-time string shown on that
// indicator, and the default screen position for the live-class floating
// window the first time it opens. No React, no DOM globals - every input is
// a parameter, so this is deterministic and unit-testable without a browser,
// mirroring the rest of this feature's pure-logic modules (live-class-logic.ts).

/** The single declaration of the session controller's phase union. This is
 * the pure, dependency-free module in the live-class feature, so it owns the
 * type; useLiveClassSession.ts imports and re-exports it rather than keeping
 * its own copy. A second, independently-typed declaration of this same union
 * used to live in useLiveClassSession.ts - harmless while both happened to
 * read identically, but a future phase added to one would silently diverge
 * from the other with no type error at all - the same failure shape that
 * already cost this project a real bug once, when two functions kept
 * separate copies of the same phrase list and quietly drifted apart. */
export type LiveClassSessionPhase = "idle" | "starting" | "live" | "ending";

// Compile-time exhaustiveness guard: an explicit per-phase decision table
// rather than a `phase !== "idle"` check, so that adding a new phase to
// LiveClassSessionPhase is a TS2741 ("missing property") compile error here
// until someone explicitly decides whether that phase counts as "active" -
// the same style of guard manual-rail.ts already uses (LMS_VIEW_PRESENCE).
const ACTIVE_BY_PHASE: Record<LiveClassSessionPhase, boolean> = {
  idle: false,
  starting: true,
  live: true,
  ending: true,
};

/**
 * True whenever a live-class session is in any non-idle phase - i.e. for as
 * long as the session is active, from the moment Start is pressed until Stop
 * finishes tearing it down. The FAB's badge must track this, not just the
 * "live" phase, so the indicator does not blink off during the brief
 * starting/ending transitions.
 */
export function isLiveClassSessionActive(phase: LiveClassSessionPhase): boolean {
  return ACTIVE_BY_PHASE[phase];
}

/**
 * mm:ss (or hh:mm:ss past an hour). A compact twin of LiveStatusBar's own
 * elapsed-time formatter, kept as a separate pure function here because the
 * FAB's indicator must keep showing elapsed time even while LiveStatusBar's
 * panel is not mounted (the live-class window can be closed while the
 * session keeps running - see useLiveClassSession.ts).
 */
export function formatElapsedCompact(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowMargin {
  right: number;
  bottom: number;
}

/**
 * Default top-left position for a bottom-right-anchored floating window the
 * first time it opens (before any drag position has been persisted) -
 * clamped so it never renders off-screen above/left of the viewport.
 * Mirrors the inline math AiChatFab already uses for the chat and deadlines
 * windows, pulled out here so the live-class window's default placement is
 * unit-testable.
 */
export function computeDefaultWindowPos(
  viewport: ViewportSize,
  windowSize: WindowSize,
  margin: WindowMargin
): { x: number; y: number } {
  return {
    x: Math.max(8, viewport.width - windowSize.width - margin.right - 8),
    y: Math.max(8, viewport.height - windowSize.height - margin.bottom),
  };
}

export interface FabDialMargin {
  right: number;
  bottom: number;
}

export interface LiveBadgePosition {
  bottom: number;
  right: number;
}

/**
 * Fixed position for the FAB's persistent live-indicator badge (H4 /
 * regression 90.11), placed BESIDE the dial's main Fab button rather than
 * above it: vertically centered on the Fab (same `bottom` span, offset so
 * the badge's own height is centered within the Fab's height), and offset
 * horizontally to its LEFT by `gap`.
 *
 * This placement is deliberate, not cosmetic: MUI's SpeedDial expands its
 * actions UPWARD from the Fab (increasing `bottom`, same horizontal
 * column as the Fab) as the dial opens or grows more entries. A badge
 * placed above the Fab sits directly in that expansion path and collides
 * with the topmost action; a badge placed beside the Fab, at the Fab's own
 * vertical span, never does - no matter how many dial entries exist, since
 * they only ever grow vertically, not sideways into the badge's column.
 */
export function computeLiveBadgePosition(
  dialMargin: FabDialMargin,
  fabSize: number,
  badgeHeight: number,
  gap: number
): LiveBadgePosition {
  return {
    bottom: dialMargin.bottom + (fabSize - badgeHeight) / 2,
    right: dialMargin.right + fabSize + gap,
  };
}
