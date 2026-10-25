export interface DirectoryNavigationGuard {
  isDirty: () => boolean;
  isInside: (target: EventTarget | null) => boolean;
  requestLeave: (leave: () => void) => void;
  currentUrl: () => string;
  restoreUrl: (url: string) => void;
  back: () => void;
}

/** Capture handlers run before the application's normal navigation listeners. */
export function directoryNavigationHandlers(guard: DirectoryNavigationGuard) {
  let replaying = false;
  const replay = (action: () => void) => {
    replaying = true;
    try { action(); } finally { replaying = false; }
  };
  return {
    keydown(event: KeyboardEvent) {
      if (replaying || !guard.isDirty() || guard.isInside(event.target) ||
          !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const control = (event.target as Element | null)?.closest<HTMLElement>('[role="tab"]');
      if (!control) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      guard.requestLeave(() => replay(() => control.dispatchEvent(new KeyboardEvent("keydown", {
        key: event.key, code: event.code, bubbles: true, cancelable: true,
      }))));
    },
    click(event: MouseEvent) {
      if (replaying || !guard.isDirty() || guard.isInside(event.target)) return;
      const target = event.target as Element | null;
      const control = target?.closest<HTMLElement>('button, a, [role="tab"]');
      if (!control || control.closest('a[target="_blank"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      guard.requestLeave(() => replay(() => control.click()));
    },
    popstate(event: PopStateEvent) {
      if (!guard.isDirty()) return;
      event.stopImmediatePropagation();
      guard.restoreUrl(guard.currentUrl());
      guard.requestLeave(guard.back);
    },
    beforeunload(event: BeforeUnloadEvent) {
      if (!guard.isDirty()) return;
      event.preventDefault();
      event.returnValue = "";
    },
  };
}
