// WAVE 3 of the assessment-grading extraction. A MOVE, verbatim, of
// grading-recording/GradingTable.tsx's own keyed-ref-map focus-after-remove
// machinery (the same idiom recording/DiscussionRepliesPanel.tsx uses):
// removing a row moves focus to its nearest remaining neighbour, and the
// container fallback below is load-bearing - without it, removing the last
// (or last-visible) row drops focus to <body> instead of the persistent
// wrapper both a populated and an empty table share.
//
// Generalised only over the row type (`T extends { id: string }`) and the
// remove callback's name (`onRemove`, was `onRemoveRow`) - every other
// detail, including the effect running on every render with no dependency
// array (so a focus request queued this render is always honoured before
// the next paint) and the ref clearing itself before it acts, is
// unchanged.

import { useCallback, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

export interface UseRemoveFocusRefsReturn {
  /** The persistent wrapper both the populated and empty-table return paths
   *  must share (same element in both branches) - the fallback focus
   *  target when no neighbouring row exists to receive it. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Registers (or, passed `null`, unregisters) one row's Remove control by
   *  id, so a removal can move focus to the next row's Remove control. */
  registerRemoveRef: (id: string, el: HTMLButtonElement | null) => void;
  /** Wraps the caller's own remove callback: records which neighbour (or
   *  the container fallback) should receive focus once the removed row's
   *  subtree unmounts, then calls through. */
  handleRemove: (id: string) => void;
}

export function useRemoveFocusRefs<T extends { id: string }>(
  rows: ReadonlyArray<T>,
  onRemove: (id: string) => void
): UseRemoveFocusRefsReturn {
  const removeRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusIdRef = useRef<string | null>(null);
  const pendingFocusFallbackRef = useRef(false);

  const registerRemoveRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) removeRefs.current.set(id, el);
    else removeRefs.current.delete(id);
  }, []);

  useLayoutEffect(() => {
    const targetId = pendingFocusIdRef.current;
    const wantsFallback = pendingFocusFallbackRef.current;
    pendingFocusIdRef.current = null;
    pendingFocusFallbackRef.current = false;
    if (!targetId && !wantsFallback) return;
    const next = targetId ? removeRefs.current.get(targetId) : null;
    if (next) next.focus();
    else containerRef.current?.focus();
  });

  const handleRemove = useCallback(
    (id: string) => {
      const idx = rows.findIndex((r) => r.id === id);
      const fallback = rows[idx + 1] ?? rows[idx - 1] ?? null;
      if (fallback) {
        pendingFocusIdRef.current = fallback.id;
      } else {
        // No neighbour in the currently-rendered (filtered) rows - either
        // this was the last visible row or the last row overall. Either
        // way the row's own subtree is about to unmount; fall back to the
        // persistent container rather than dropping focus to <body>.
        pendingFocusFallbackRef.current = true;
      }
      onRemove(id);
    },
    [rows, onRemove]
  );

  return { containerRef, registerRemoveRef, handleRemove };
}
