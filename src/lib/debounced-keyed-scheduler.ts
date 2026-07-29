// A tiny trailing-edge debounce scheduler keyed by an arbitrary string id -
// e.g. "collapse every rapid edit to THIS checklist item's deadline into one
// calendar push, independently of every other item's own timer" (see
// WeeklyChecklistCell.tsx, which is the one caller today). Deliberately
// generic - no calendar or checklist knowledge - so it is a plain,
// side-effect-only utility that is unit-testable with vi.useFakeTimers()
// alone: no React, no DOM, no mocked server action required.
//
// A new `schedule` call for a key that already has a pending timer cancels
// that timer and restarts the delay (trailing-edge debounce, not
// throttling) - the classic "wait until the user stops typing" shape.
// Different keys never interact: each gets its own independent timer, so one
// checklist item's rapid edits can never delay or cancel another's.

export interface DebouncedKeyedScheduler {
  /** (Re)start `key`'s delay; when it elapses without a further `schedule`
   * call for the same key, `run` fires exactly once. */
  schedule(key: string, run: () => void): void;
  /** Cancel every still-pending timer without running them - for unmount,
   * so a stray sync never fires after the component that scheduled it is
   * gone. */
  cancelAll(): void;
}

export function createDebouncedKeyedScheduler(delayMs: number): DebouncedKeyedScheduler {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  return {
    schedule(key, run) {
      const existing = timers.get(key);
      if (existing !== undefined) clearTimeout(existing);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          run();
        }, delayMs)
      );
    },
    cancelAll() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}
