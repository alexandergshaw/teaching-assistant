// Pure sizing/position logic for the Weekly Checklist Overview floating
// window (WeeklyChecklistOverviewModal.tsx). Split out the same way
// fab-live-indicator.ts is split out from AiChatFab.tsx/LiveClassWindow.tsx -
// no React, no DOM globals, every input a parameter - so "restore a
// persisted rect defensively" is deterministic and unit-testable without a
// browser.

import { computeDefaultWindowPos, type ViewportSize, type WindowMargin } from "../live-class/fab-live-indicator";

export interface WindowPos {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

// Small by default (AC1) - deliberately nowhere near the old previewModal's
// 980x860. Sized between the AI Chatbot window (360x420) and the wider Live
// Class window (640x620): this table has more columns than the chat window
// (course/item/weekday/time/status/overdue) but is read-only, single-purpose
// glance content, unlike Live Class's four stacked panels - 560x480 fits the
// header, the search/hide-completed toolbar, and roughly 8-10 table rows at
// once, without the 6-column table needing its own horizontal scroller for
// ordinary item labels.
export const WEEKLY_CHECKLIST_OVERVIEW_WINDOW_W = 560;
export const WEEKLY_CHECKLIST_OVERVIEW_WINDOW_H = 480;

// Floor for a manually-resized (or corrupt-restored) window: small enough to
// still be a deliberate "make it smaller" choice, never so small the
// header's title/refresh/close controls stop being usable.
export const WEEKLY_CHECKLIST_OVERVIEW_MIN_W = 360;
export const WEEKLY_CHECKLIST_OVERVIEW_MIN_H = 280;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validates a value parsed from localStorage as a window position. Returns
 * null for anything that is not a plain {x, y} pair of finite numbers -
 * missing keys, wrong types, NaN/Infinity from hand-edited or truncated
 * JSON - so the caller falls back to computing a fresh default rather than
 * rendering at a nonsense coordinate (AC3's "defensive fallback for
 * corrupt... values").
 */
export function sanitizeWindowPos(raw: unknown): WindowPos | null {
  if (
    raw !== null &&
    typeof raw === "object" &&
    isFiniteNumber((raw as Record<string, unknown>).x) &&
    isFiniteNumber((raw as Record<string, unknown>).y)
  ) {
    const { x, y } = raw as { x: number; y: number };
    return { x, y };
  }
  return null;
}

/**
 * Validates a value parsed from localStorage as a window size, additionally
 * enforcing the resize floor above - a persisted size below the minimum is
 * just as "corrupt" for this window's purposes as a missing field, since a
 * live resize could never have produced it (the shell's own CSS min-width/
 * min-height already stop the user from dragging below it). Returns null so
 * the caller falls back to the default size.
 */
export function sanitizeWindowSize(raw: unknown): WindowSize | null {
  if (
    raw !== null &&
    typeof raw === "object" &&
    isFiniteNumber((raw as Record<string, unknown>).width) &&
    isFiniteNumber((raw as Record<string, unknown>).height)
  ) {
    const { width, height } = raw as { width: number; height: number };
    if (width >= WEEKLY_CHECKLIST_OVERVIEW_MIN_W && height >= WEEKLY_CHECKLIST_OVERVIEW_MIN_H) {
      return { width, height };
    }
  }
  return null;
}

/**
 * Clamps a window's top-left position so its header - the only way to drag
 * it back - always stays reachable inside the current viewport, regardless
 * of whether the position came from a (sanitized) persisted value or a
 * freshly computed default. A window restored from a session on a larger
 * screen, or one whose stored position was hand-edited, must never render
 * off-screen with no way to recover it (AC3).
 */
export function clampWindowPos(pos: WindowPos, size: WindowSize, viewport: ViewportSize): WindowPos {
  const maxX = Math.max(0, viewport.width - size.width);
  const maxY = Math.max(0, viewport.height - size.height);
  return {
    x: Math.min(Math.max(0, pos.x), maxX),
    y: Math.min(Math.max(0, pos.y), maxY),
  };
}

/**
 * Clamps a window's size so it never renders wider or taller than the
 * current viewport - relevant when a size persisted from a larger monitor
 * is restored on a smaller one. Never clamps below the resize floor even on
 * a viewport smaller than that floor; a window that can't fully fit a tiny
 * viewport still needs to stay at a usable minimum size rather than shrink
 * to the point of being unusable.
 */
export function clampWindowSize(size: WindowSize, viewport: ViewportSize): WindowSize {
  return {
    width: Math.min(size.width, Math.max(WEEKLY_CHECKLIST_OVERVIEW_MIN_W, viewport.width)),
    height: Math.min(size.height, Math.max(WEEKLY_CHECKLIST_OVERVIEW_MIN_H, viewport.height)),
  };
}

export interface ResolvedWindowRect {
  pos: WindowPos;
  size: WindowSize;
}

/**
 * Resolves the window's actual starting rect from whatever was persisted
 * (already JSON-parsed by the caller, so a corrupt string never even
 * reaches here) plus the live viewport - the single function the component
 * calls once, on its own first mount, so the "sanitize -> fall back to
 * default -> clamp" pipeline lives in one tested place rather than being
 * re-derived inline in a useState initializer. Size is resolved first
 * because the default-position computation and the position clamp both
 * need a size to work against.
 */
export function resolveInitialWindowRect(
  rawPos: unknown,
  rawSize: unknown,
  viewport: ViewportSize,
  margin: WindowMargin
): ResolvedWindowRect {
  const size = clampWindowSize(
    sanitizeWindowSize(rawSize) ?? { width: WEEKLY_CHECKLIST_OVERVIEW_WINDOW_W, height: WEEKLY_CHECKLIST_OVERVIEW_WINDOW_H },
    viewport
  );
  const restoredPos = sanitizeWindowPos(rawPos);
  const pos = clampWindowPos(restoredPos ?? computeDefaultWindowPos(viewport, size, margin), size, viewport);
  return { pos, size };
}
