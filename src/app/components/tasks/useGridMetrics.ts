"use client";

// Sticky-pane clearance measuring for the Tasks grid (B2, WCAG 2.2 SC
// 2.4.11) - pulled out of TasksGrid.tsx (which sits at a 1000-line hard
// cap) so that file has real headroom rather than a squeeze, the same
// reason useColumnDrag.ts (useColumnDrag.ts:3-11) and gridFocus.ts were
// split out before it. Unlike gridNavigation.ts/gridHeaderAccessibleName.ts,
// this is a DOM-measuring hook (ResizeObserver, getBoundingClientRect), not
// pure logic - this repo's vitest runs `environment: "node"`
// (gridFocus.ts:1-9) and cannot exercise it either way, so this split buys
// line budget only, the same tradeoff useColumnDrag.ts's own header comment
// describes for its pointer mechanics.
import { useCallback, useEffect, useState, type CSSProperties, type RefObject } from "react";
import styles from "./TasksGrid.module.css";

export interface GridMetrics {
  headerH: number;
  footerH: number;
  identityW: number;
  leftW: number;
}

export interface UseGridMetricsReturn {
  metrics: GridMetrics;
  tableStyle: CSSProperties;
  ensureVisible: (row: number, col: number, el: HTMLElement, behavior: ScrollBehavior) => void;
}

/**
 * MEASURED, never assumed (B2): the header's real height depends on how many
 * lines the longest visible task label wraps to (.taskHeaderLabel clamps at
 * 3, TasksGrid.module.css) and does not scale with density, so a
 * density-derived constant (a previous `rowHeightPx * 2`) drifts from
 * reality - worst at `compact`, where the focused cell ended up entirely
 * hidden behind the header. `thead`/`tfoot` heights and the two frozen
 * cells' widths are read straight off the DOM instead, and re-measured on
 * every resize (a ResizeObserver on the scroll container, plus the window
 * resize event for font/zoom changes that do not resize the container
 * itself) and whenever the column/row set changes (a column being hidden
 * can change how many lines a label wraps to).
 *
 * Also owns `ensureVisible` (AC16 amendment 135, WCAG 2.2 SC 2.4.11):
 * scrolls a cell clear of every sticky pane, not merely into the scroll
 * box's bounding rect - a plain scrollIntoView leaves a cell hidden behind
 * the sticky header/footer/frozen columns exactly at the moment a keyboard
 * user arrows onto it (or tabs/clicks into a scrolled grid). It is folded
 * into this same hook because it reads the measured `metrics` directly, not
 * because it has anything to do with measuring itself. `behavior` is passed
 * in by the caller rather than decided here: N4 - a HELD arrow key
 * re-triggers this on every step, and "smooth" there re-measures scrollTop
 * mid-animation and accumulates error, so keyboard-driven calls always pass
 * "auto"; a single Tab/click entry can afford "smooth".
 */
export function useGridMetrics(
  scrollRef: RefObject<HTMLDivElement | null>,
  density: "compact" | "default" | "comfortable",
  columnsLength: number,
  rowsLength: number
): UseGridMetricsReturn {
  const [metrics, setMetrics] = useState<GridMetrics>({ headerH: 0, footerH: 0, identityW: 0, leftW: 0 });

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const measure = () => {
      const theadEl = container.querySelector("thead");
      const tfootEl = container.querySelector("tfoot");
      const identityEl = container.querySelector(`.${styles.identityCell}`);
      const progressEl = container.querySelector(`.${styles.progressCell}`);
      const headerH = theadEl ? theadEl.getBoundingClientRect().height : 0;
      const footerH = tfootEl ? tfootEl.getBoundingClientRect().height : 0;
      const identityW = identityEl instanceof HTMLElement ? identityEl.offsetWidth : 0;
      const progressW = progressEl instanceof HTMLElement ? progressEl.offsetWidth : 0;
      const leftW = identityW + progressW;
      setMetrics((prev) =>
        prev.headerH === headerH && prev.footerH === footerH && prev.identityW === identityW && prev.leftW === leftW
          ? prev
          : { headerH, footerH, identityW, leftW }
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    const theadEl = container.querySelector("thead");
    const tfootEl = container.querySelector("tfoot");
    if (theadEl) ro.observe(theadEl);
    if (tfootEl) ro.observe(tfootEl);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
    // `scrollRef` is a stable ref object (never changes identity across
    // renders), so listing it here is a no-op for how often this effect
    // fires - it only satisfies exhaustive-deps for what is now a function
    // PARAMETER rather than a local `useRef()` result, which the lint rule
    // cannot otherwise verify is stable.
  }, [density, columnsLength, rowsLength, scrollRef]);

  // Only published once something has actually been measured - the CSS
  // fallback (`var(--ttg-left-w, 348px)`) already matches the hardcoded
  // widths .identityCell/.progressCell start with, so leaving the property
  // unset on the very first paint (before the effect above has run) avoids a
  // one-frame flash at 0px rather than reproducing it.
  const tableStyle: CSSProperties =
    metrics.leftW > 0
      ? ({
          "--ttg-identity-w": `${metrics.identityW}px`,
          "--ttg-left-w": `${metrics.leftW}px`,
        } as CSSProperties)
      : {};

  const ensureVisible = useCallback(
    (row: number, col: number, el: HTMLElement, behavior: ScrollBehavior) => {
      const container = scrollRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      let top = container.scrollTop;
      let left = container.scrollLeft;

      const topBound = cRect.top + metrics.headerH;
      const bottomBound = cRect.bottom - metrics.footerH;
      if (eRect.top < topBound) top -= topBound - eRect.top;
      else if (eRect.bottom > bottomBound) top += eRect.bottom - bottomBound;

      if (col >= 2) {
        const leftBound = cRect.left + metrics.leftW;
        if (eRect.left < leftBound) left -= leftBound - eRect.left;
        else if (eRect.right > cRect.right) left += eRect.right - cRect.right;
      }

      container.scrollTo({ top, left, behavior });
    },
    // `scrollRef` is a stable ref object - see the comment on the effect
    // above for why it is listed here even though it never actually varies.
    [metrics.headerH, metrics.footerH, metrics.leftW, scrollRef]
  );

  return { metrics, tableStyle, ensureVisible };
}
