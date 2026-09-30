// Grading from a screen recording - the per-row/bulk grading lock
// (docs/a38-acceptance-criteria.md AC-8; docs/a38-scope.md section 4.6
// Unit 3, section 4.5; docs/a38-rulings-round2.md Ruling 8).
//
// A26 shipped a lock for the LMS grading surface (runLockRef,
// useRepoGradesBulkGrade.ts) because two clicks during a rubric fetch
// double-graded every repo. This feature's own bulk path (handleGradeAll,
// GradingRecordingPanel.tsx) had no lock of its own beyond captured render
// state (`gradingBusy`), and a per-row grade control multiplies the click
// surface a lock needs to cover - see docs/a38-scope.md section 4.5 for the
// full account of why `gradingBusy` alone is not a refusal.
//
// This is a PURE, dependency-injected unit rather than a `useRef`
// check-then-set living inside a hook, because this repo's vitest is
// `environment: "node"` and drives no hook (no `renderHook`,
// `@testing-library/react` is absent) - see AC-8's own INSTRUMENT
// PRECONDITION. A test cannot drive `useGradingRowGrade` to prove the lock
// releases; it can call `createGradeLock()` directly and run the acquire /
// refuse-while-held / release / acquire-succeeds sequence Ruling 8
// mandates.
//
// `acquire()` is an ATOMIC check-and-set: it mutates NOTHING when the lock
// is already held (returns `false`), and flips to held only when it
// actually acquires (returns `true`). This is what makes the round-2
// Ruling 8 deadlock ("a refusal claims the lock and never releases it,
// so every later legitimate press does nothing - every gate green,
// feature dead on the second click") structurally impossible here: a
// refused `acquire()` call has changed nothing, so there is nothing for a
// refused caller to release.
//
// One shared instance is held by useGradingRowGrade.ts (in a `useRef`, so
// it is stable across renders) and returned so GradingRecordingPanel.tsx's
// `handleGradeAll` can `acquire()`/`release()` the SAME instance - the
// per-row path and the bulk path must never hold the lock concurrently
// (docs/a38-scope.md section 4.5: the grading action paces its own calls
// with a fixed inter-request delay, and two concurrent invocations would
// defeat that pacing; a bulk run also rebuilds every row's result and
// would silently overwrite a concurrently-graded row with a stale one).

export interface GradeLock {
  /** Atomic check-and-set. Returns `true` and marks the lock held when it
   *  was free; returns `false` and mutates nothing when already held. */
  acquire(): boolean;
  /** Always safe to call, including when the lock is already free. */
  release(): void;
  isHeld(): boolean;
}

export function createGradeLock(): GradeLock {
  let held = false;
  return {
    acquire(): boolean {
      if (held) return false;
      held = true;
      return true;
    },
    release(): void {
      held = false;
    },
    isHeld(): boolean {
      return held;
    },
  };
}
