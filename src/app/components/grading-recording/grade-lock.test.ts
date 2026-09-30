import { describe, it, expect } from "vitest";
import { createGradeLock } from "./grade-lock";

// docs/a38-acceptance-criteria.md AC-8; docs/a38-scope.md section 4.6 Unit 3;
// docs/a38-rulings-round2.md Ruling 8.
//
// AC-8 states explicitly that a "claims-the-lock-only" check (asserting
// merely that acquire() was called or returned truthy once, with no second
// acquire-after-release proving release actually happened) is INSUFFICIENT
// and must not be offered as the sole or primary instrument - that shape is
// exactly what passes green while the surface deadlocks on the second
// click (the B-1 silent-green defect Ruling 8 found). The describe block
// below is the MANDATED sequence: acquire, refuse-while-held, release,
// acquire-succeeds - run against the real createGradeLock().
describe("createGradeLock (AC-8 Unit 3: the per-row/bulk grading lock)", () => {
  it("Ruling 8's mandated sequence: acquire succeeds, a second acquire while held is refused, release, then acquire succeeds again - proving release actually released", () => {
    const lock = createGradeLock();
    expect(lock.acquire()).toBe(true); // acquired
    expect(lock.acquire()).toBe(false); // refused while held - only one logical call proceeds
    lock.release();
    expect(lock.acquire()).toBe(true); // acquire AGAIN succeeds - release actually released
  });

  it("isHeld reflects the current state through the whole sequence", () => {
    const lock = createGradeLock();
    expect(lock.isHeld()).toBe(false);
    lock.acquire();
    expect(lock.isHeld()).toBe(true);
    lock.release();
    expect(lock.isHeld()).toBe(false);
  });

  it("acquire() is atomic: a refused acquire mutates nothing - isHeld stays true, and a THIRD acquire attempt while still held is refused too", () => {
    const lock = createGradeLock();
    lock.acquire();
    lock.acquire(); // refused
    lock.acquire(); // refused again - the refusal itself did not flip anything
    expect(lock.isHeld()).toBe(true);
    lock.release();
    expect(lock.acquire()).toBe(true);
  });

  it("release() is safe to call when the lock is already free - it does not throw and does not flip isHeld to some invalid state", () => {
    const lock = createGradeLock();
    expect(() => lock.release()).not.toThrow();
    expect(lock.isHeld()).toBe(false);
    expect(lock.acquire()).toBe(true);
  });

  it("two independent lock instances do not share state", () => {
    const a = createGradeLock();
    const b = createGradeLock();
    expect(a.acquire()).toBe(true);
    expect(b.acquire()).toBe(true);
    expect(a.isHeld()).toBe(true);
    expect(b.isHeld()).toBe(true);
  });
});

// SABOTAGE CHECK LOG (P-4, mandatory per unit - verified by actually
// breaking the source and re-running, then reverting).
//
// 1. Replaced acquire() with an always-`true` implementation (never checks
//    or sets `held`) -> the mandated sequence test's second assertion
//    (`expect(lock.acquire()).toBe(false)`, refused while held) FAILED as
//    expected (got true). This is exactly the "claims-the-lock-only" shape
//    AC-8 calls INSUFFICIENT and bans as the sole instrument - the sabotage
//    proves the mandated sequence (not a claims-only check) is what catches
//    it. Reverted.
// 2. Dropped the `held = false` assignment inside release() (release() did
//    nothing) -> the mandated sequence test's final assertion
//    (`expect(lock.acquire()).toBe(true)`, acquire again succeeds) FAILED as
//    expected (got false - the lock stayed held forever, reproducing the
//    round-2 Ruling 8 deadlock exactly: every later legitimate press would
//    do nothing). Reverted.
//
// Both sabotages were caught ONLY because the test drives the full
// acquire/refuse/release/acquire-again sequence against the real unit -
// neither would have been caught by a check that merely asserted acquire()
// was called once.
describe("grade-lock.test.ts sabotage check (documented, not executed at runtime)", () => {
  it("is a documentation-only marker - the actual sabotage runs were performed by hand against a mutated grade-lock.ts and reverted; see the comment above", () => {
    expect(true).toBe(true);
  });
});
