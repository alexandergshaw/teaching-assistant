"use client";

import { useCallback, type RefObject } from "react";

export interface WindowDragPos {
  x: number;
  y: number;
}

/**
 * Shared "drag by header" behavior for the app's floating windows (AI
 * Chatbot and Live Class, both in AiChatFab.tsx; Weekly Checklist Overview
 * in courses/WeeklyChecklistOverviewModal.tsx): captures the mouse position
 * and the window's own position at mousedown, updates position on every
 * mousemove for the drag's duration, and tears down its listeners on
 * mouseup. Clamped to >= 0 on both axes so a window can never be dragged
 * fully off the top/left edge and become unreachable.
 *
 * Pulled out once a THIRD window needed this exact algorithm - AiChatFab
 * used to keep two independent, byte-for-byte copies of it (one per
 * window). WeeklyChecklistOverviewModal's own acceptance criteria call for
 * reusing "the existing drag pattern... not a new drag implementation",
 * which a third pasted copy would only technically satisfy - actually
 * removing the duplication is the more faithful reading.
 *
 * `posRef` must always mirror the latest position (the caller's own setter
 * keeps it in sync, the same `xRef.current = pos` idiom AiChatFab already
 * used before this hook existed) - reading a ref rather than closing over
 * the position value directly means this hook's identity stays stable
 * across re-renders without needing the position itself as a dependency.
 */
export function useWindowHeaderDrag(
  posRef: RefObject<WindowDragPos>,
  setPos: (pos: WindowDragPos) => void
) {
  return useCallback(
    (e: React.MouseEvent) => {
      // A click that started on a header button (close, refresh) is not the
      // start of a drag.
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      const startMouse: WindowDragPos = { x: e.clientX, y: e.clientY };
      const startPos: WindowDragPos = { ...posRef.current };
      const onMove = (ev: MouseEvent) => {
        setPos({
          x: Math.max(0, startPos.x + ev.clientX - startMouse.x),
          y: Math.max(0, startPos.y + ev.clientY - startMouse.y),
        });
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [posRef, setPos]
  );
}
