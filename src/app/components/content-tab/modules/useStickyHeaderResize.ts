"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { HEADER_HEIGHT_KEY } from "../constants";

export interface UseStickyHeaderResizeReturn {
  headerBodyRef: React.RefObject<HTMLDivElement | null>;
  headerHeight: number | null;
  setHeaderHeight: (h: number | null) => void;
  onResizeStart: (e: React.PointerEvent) => void;
}

// Resizable sticky header: null = natural height; a number caps the body's
// height (it scrolls) so the module list below gets more room. Persisted.
export function useStickyHeaderResize(): UseStickyHeaderResizeReturn {
  const headerBodyRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const n = Number(localStorage.getItem(HEADER_HEIGHT_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (headerHeight == null) localStorage.removeItem(HEADER_HEIGHT_KEY);
    else localStorage.setItem(HEADER_HEIGHT_KEY, String(Math.round(headerHeight)));
  }, [headerHeight]);
  const onResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    const body = headerBodyRef.current;
    if (!body) return;
    const top = body.getBoundingClientRect().top;
    const onMove = (ev: PointerEvent) => {
      const maxH = Math.max(120, window.innerHeight - top - 120);
      setHeaderHeight(Math.min(maxH, Math.max(48, ev.clientY - top)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  return { headerBodyRef, headerHeight, setHeaderHeight, onResizeStart };
}
