import { describe, it, expect } from "vitest";
import {
  couldNotCancelOutcome,
  shouldAttemptRestore,
  cancelledWithoutRestoreOutcome,
  cancelledAndRestoredOutcome,
  cancelledButRestoreFailedOutcome,
} from "./release-cancel";

// ---------------------------------------------------------------------------
// couldNotCancelOutcome - F11.3: a lost CAS race is reported honestly, never
// as a silent no-op, and the reason names WHICH way the race was lost.

describe("couldNotCancelOutcome", () => {
  it("status is could-not-cancel, and it always carries a reason", () => {
    const outcome = couldNotCancelOutcome(null);
    expect(outcome.status).toBe("could-not-cancel");
    expect((outcome as { reason: string }).reason.length).toBeGreaterThan(0);
  });

  it("a claimed row reads as 'being processed right now', not a generic failure", () => {
    expect((couldNotCancelOutcome("claimed") as { reason: string }).reason).toMatch(/being processed right now/i);
  });

  it("a done row reads as 'already run'", () => {
    expect((couldNotCancelOutcome("done") as { reason: string }).reason).toMatch(/already run/i);
  });

  it("a failed row reads as already run and failed", () => {
    expect((couldNotCancelOutcome("failed") as { reason: string }).reason).toMatch(/already ran and failed/i);
  });

  it("an already-cancelled row reads as 'already cancelled'", () => {
    expect((couldNotCancelOutcome("cancelled") as { reason: string }).reason).toMatch(/already cancelled/i);
  });

  it("no row at all (null) reads as 'could not be found'", () => {
    expect((couldNotCancelOutcome(null) as { reason: string }).reason).toMatch(/could not be found/i);
  });

  it("every currentStatus produces a textually distinct reason", () => {
    const reasons = (["claimed", "done", "failed", "cancelled", null] as const).map(
      (status) => (couldNotCancelOutcome(status) as { reason: string }).reason
    );
    expect(new Set(reasons).size).toBe(reasons.length);
  });
});

// ---------------------------------------------------------------------------
// shouldAttemptRestore - F11.2: act on fact, never guess.

describe("shouldAttemptRestore", () => {
  it("true only for the literal true", () => {
    expect(shouldAttemptRestore(true)).toBe(true);
  });

  it("false for wasPublished === false - already hidden, nothing to restore", () => {
    expect(shouldAttemptRestore(false)).toBe(false);
  });

  it("false for wasPublished === null - a row written before this column existed must never guess", () => {
    expect(shouldAttemptRestore(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cancelledWithoutRestoreOutcome - F11.2's two distinguishable "skip"
// reasons: already-hidden (false) vs cannot-tell (null). The two must never
// read the same way to the instructor.

describe("cancelledWithoutRestoreOutcome", () => {
  it("status is cancelled-without-restore, with a reason", () => {
    const outcome = cancelledWithoutRestoreOutcome(false);
    expect(outcome.status).toBe("cancelled-without-restore");
    expect((outcome as { reason: string }).reason.length).toBeGreaterThan(0);
  });

  it("wasPublished === false reads as 'already hidden', not as 'unknown'", () => {
    expect((cancelledWithoutRestoreOutcome(false) as { reason: string }).reason).toMatch(/already hidden/i);
  });

  it("wasPublished === null reads as 'predates visibility tracking', never a guess", () => {
    const reason = (cancelledWithoutRestoreOutcome(null) as { reason: string }).reason;
    expect(reason).toMatch(/before visibility tracking/i);
    expect(reason).not.toMatch(/already hidden/i);
  });

  it("the null and false reasons are textually distinct from each other", () => {
    const nullReason = (cancelledWithoutRestoreOutcome(null) as { reason: string }).reason;
    const falseReason = (cancelledWithoutRestoreOutcome(false) as { reason: string }).reason;
    expect(nullReason).not.toBe(falseReason);
  });
});

// ---------------------------------------------------------------------------
// cancelledAndRestoredOutcome - F11.1: the honest inverse of commit.

describe("cancelledAndRestoredOutcome", () => {
  it("status is cancelled-and-restored, with no reason field", () => {
    const outcome = cancelledAndRestoredOutcome();
    expect(outcome.status).toBe("cancelled-and-restored");
    expect((outcome as { reason?: string }).reason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// cancelledButRestoreFailedOutcome - the sabotage-prone assertion this brief
// calls out by name: a restore that fails AFTER a successful cancel must
// NEVER be reported as a failed cancel. It stays "cancelled-without-restore",
// the same status the plain skipped-restore case uses - only the reason text
// distinguishes them - and it must never collapse into "could-not-cancel".

describe("cancelledButRestoreFailedOutcome", () => {
  it("status is cancelled-without-restore - the cancel itself succeeded", () => {
    const outcome = cancelledButRestoreFailedOutcome("Canvas refused the write.");
    expect(outcome.status).toBe("cancelled-without-restore");
  });

  it("the failure reason is included in the reason text", () => {
    const outcome = cancelledButRestoreFailedOutcome("Canvas refused the write.") as { reason: string };
    expect(outcome.reason).toContain("Canvas refused the write.");
  });

  it("SABOTAGE CHECK: a restore failure must never be reported as could-not-cancel", () => {
    // The trap this brief names explicitly: an implementation that reports a
    // restore failure by reusing couldNotCancelOutcome (or otherwise
    // relabeling the status once the restore throws) would make a
    // successful cancel indistinguishable from a lost race. Pin the status
    // directly against the literal string, not merely "not equal to
    // something", so a sabotaged implementation that returns
    // "could-not-cancel" here reddens this exact assertion.
    const restoreFailed = cancelledButRestoreFailedOutcome("boom");
    expect(restoreFailed.status).toBe("cancelled-without-restore");
    expect(restoreFailed.status).not.toBe("could-not-cancel");
  });

  it("is textually distinct from the plain skipped-restore reasons, so the instructor can tell a failure from a no-op skip", () => {
    const restoreFailedReason = (cancelledButRestoreFailedOutcome("network error") as { reason: string }).reason;
    const alreadyHiddenReason = (cancelledWithoutRestoreOutcome(false) as { reason: string }).reason;
    const predatesTrackingReason = (cancelledWithoutRestoreOutcome(null) as { reason: string }).reason;
    expect(restoreFailedReason).not.toBe(alreadyHiddenReason);
    expect(restoreFailedReason).not.toBe(predatesTrackingReason);
  });
});
