"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { directoryNavigationHandlers } from "./draft-navigation";

export function useDraftNavigation(sectionRef: RefObject<HTMLElement | null>) {
  const dirty = useRef(false);
  const dirtyUrl = useRef("");
  const pending = useRef<(() => void) | null>(null);
  const [confirming, setConfirming] = useState(false);
  const setDirty = useCallback((value: boolean) => {
    if (value && !dirty.current) dirtyUrl.current = window.location.href;
    dirty.current = value;
  }, []);
  const requestLeave = useCallback((leave: () => void) => {
    if (!dirty.current) { leave(); return; }
    pending.current = leave;
    setConfirming(true);
  }, []);
  const stay = () => { pending.current = null; setConfirming(false); };
  const finishLeave = () => {
    dirty.current = false;
    const leave = pending.current;
    pending.current = null;
    setConfirming(false);
    leave?.();
  };
  useEffect(() => {
    const handlers = directoryNavigationHandlers({
      isDirty: () => dirty.current,
      isInside: (target) => target instanceof Node && (!!sectionRef.current?.contains(target) ||
        (target instanceof Element && !!target.closest("[data-institution-draft-dialog]"))),
      requestLeave,
      currentUrl: () => dirtyUrl.current,
      restoreUrl: (url) => window.history.pushState(null, "", url),
      back: () => window.history.back(),
    });
    document.addEventListener("click", handlers.click, true);
    document.addEventListener("keydown", handlers.keydown, true);
    window.addEventListener("popstate", handlers.popstate, true);
    window.addEventListener("beforeunload", handlers.beforeunload);
    return () => {
      document.removeEventListener("click", handlers.click, true);
      document.removeEventListener("keydown", handlers.keydown, true);
      window.removeEventListener("popstate", handlers.popstate, true);
      window.removeEventListener("beforeunload", handlers.beforeunload);
    };
  }, [requestLeave, sectionRef]);
  return { confirming, setDirty, requestLeave, stay, finishLeave };
}
