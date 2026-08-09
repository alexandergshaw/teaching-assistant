"use client";

// Scroll-shadow state for the Tasks grid's scroll region (AC15 item 87) -
// pulled out of TasksGrid.tsx (which sits at a 1000-line hard cap) so that
// file has real headroom rather than a squeeze, the same reason
// useColumnDrag.ts (useColumnDrag.ts:3-11) and gridFocus.ts were split out
// before it. A DOM-reading hook (scrollLeft/scrollWidth), not pure logic -
// this repo's vitest runs `environment: "node"` (gridFocus.ts:1-9) and
// cannot exercise it either way, so this split buys line budget only, the
// same tradeoff useGridMetrics.ts's own header comment describes.
import { useCallback, useEffect, useState, type RefObject } from "react";

export interface UseScrollShadowsReturn {
  scrollLeftEdge: boolean;
  scrollRightEdge: boolean;
  /** Wired to the scroll region's own onScroll (item 87); also re-run
   * whenever the column/row set changes, since either can change the
   * scrollable width without a scroll event ever firing. */
  updateScrollShadows: () => void;
}

export function useScrollShadows(
  scrollRef: RefObject<HTMLDivElement | null>,
  columnsLength: number,
  rowsLength: number
): UseScrollShadowsReturn {
  const [scrollLeftEdge, setScrollLeftEdge] = useState(false);
  const [scrollRightEdge, setScrollRightEdge] = useState(false);
  const updateScrollShadows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollLeftEdge(el.scrollLeft > 1);
    setScrollRightEdge(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    // `scrollRef` is a stable ref object (never changes identity across
    // renders), so listing it below is a no-op for how often this callback
    // is recreated - it only satisfies exhaustive-deps for what is now a
    // function PARAMETER rather than a local `useRef()` result.
  }, [scrollRef]);
  useEffect(() => {
    updateScrollShadows();
  }, [updateScrollShadows, columnsLength, rowsLength]);

  return { scrollLeftEdge, scrollRightEdge, updateScrollShadows };
}
