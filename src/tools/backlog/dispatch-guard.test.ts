import { describe, it, expect } from "vitest";
import { decideDispatchGuard } from "./dispatch-guard";
import type { DispatchGuardInput, MarkerState } from "./dispatch-guard";

const ABSENT: MarkerState = { kind: "absent" };
const UNREADABLE: MarkerState = { kind: "unreadable" };
function present(mtimeMs: number): MarkerState {
  return { kind: "present", mtimeMs };
}

function input(over: Partial<DispatchGuardInput>): DispatchGuardInput {
  return {
    dispatch: over.dispatch ?? ABSENT,
    lastStop: over.lastStop ?? ABSENT,
    stopHookActive: over.stopHookActive ?? false,
    overrideRequested: over.overrideRequested ?? false,
  };
}

describe("decideDispatchGuard", () => {
  // MUTANT: make this always return "allow". This is THE case the guard
  // exists for - a stop with nothing dispatched since the previous stop.
  it("BLOCKS when the dispatch marker is older than the previous stop marker", () => {
    const d = decideDispatchGuard(input({ dispatch: present(1000), lastStop: present(2000) }));
    expect(d.decision).toBe("block");
    expect(d.reason).toContain("NO SUBAGENT WAS DISPATCHED");
  });

  // The block message must name the exact command a session needs to comply.
  it("names the exact touch-dispatch command in the block reason", () => {
    const d = decideDispatchGuard(input({ dispatch: present(1000), lastStop: present(2000) }));
    expect(d.reason).toContain("npm run backlog:touch-dispatch");
  });

  // The block message must also name the override escape.
  it("names the --override escape in the block reason", () => {
    const d = decideDispatchGuard(input({ dispatch: present(1000), lastStop: present(2000) }));
    expect(d.reason).toContain("--override");
  });

  it("ALLOWS when a dispatch happened after the previous stop", () => {
    const d = decideDispatchGuard(input({ dispatch: present(3000), lastStop: present(2000) }));
    expect(d.decision).toBe("allow");
  });

  // Equal timestamps: a dispatch touched at exactly the previous stop's
  // instant counts as "since" (>=), not as a tie that blocks.
  it("ALLOWS when the dispatch marker equals the previous stop marker", () => {
    const d = decideDispatchGuard(input({ dispatch: present(2000), lastStop: present(2000) }));
    expect(d.decision).toBe("allow");
  });

  // MUTANT: drop this branch. A brand-new repo with neither marker yet must
  // never block - there is no "previous stop" to compare against. This is
  // the ONE true first-run case: the STOP marker itself has never existed.
  it("ALLOWS on first run when both markers are absent", () => {
    const d = decideDispatchGuard(input({ dispatch: ABSENT, lastStop: ABSENT }));
    expect(d.decision).toBe("allow");
    expect(d.reason).toContain("first stop");
  });

  // THE REGRESSION THIS FILE EXISTS TO CATCH, reported live against the real
  // hook: a stop has genuinely happened before (the stop marker is PRESENT)
  // and the dispatch marker has NEVER been recorded (ABSENT, not
  // unreadable). The bug this replaces treated "dispatch absent" as
  // equivalent to "first run" regardless of the stop marker's own state, so
  // a session that never calls touch-dispatch was allowed to stop forever.
  // MUTANT: collapse "absent" back into "unreadable" (or otherwise treat
  // this the same as the first-run case) - this must turn red.
  it("BLOCKS when the stop marker is present and the dispatch marker was never recorded", () => {
    const d = decideDispatchGuard(input({ dispatch: ABSENT, lastStop: present(2000) }));
    expect(d.decision).toBe("block");
    expect(d.reason).toContain("NO SUBAGENT WAS DISPATCHED");
  });

  it("ALLOWS when only the stop marker is absent (first stop ever, dispatch marker somehow pre-dates it)", () => {
    const d = decideDispatchGuard(input({ dispatch: present(1000), lastStop: ABSENT }));
    expect(d.decision).toBe("allow");
  });

  // Fail-open belongs to ERRORS, never to absence - this is the other half
  // of the fix. An unreadable dispatch marker must allow even when the stop
  // marker is present (where an absent one would now block).
  it("ALLOWS when the dispatch marker is unreadable, even with a present stop marker", () => {
    const d = decideDispatchGuard(input({ dispatch: UNREADABLE, lastStop: present(2000) }));
    expect(d.decision).toBe("allow");
    expect(d.reason).toContain("could not be read");
  });

  it("ALLOWS when the stop marker is unreadable", () => {
    const d = decideDispatchGuard(input({ dispatch: present(1000), lastStop: UNREADABLE }));
    expect(d.decision).toBe("allow");
    expect(d.reason).toContain("could not be read");
  });

  it("ALLOWS when both markers are unreadable", () => {
    const d = decideDispatchGuard(input({ dispatch: UNREADABLE, lastStop: UNREADABLE }));
    expect(d.decision).toBe("allow");
  });

  // MUTANT: remove the stopHookActive escape. Without it, blocking hooks
  // loop forever - strictly worse than no guard.
  it("ALLOWS when it has already blocked once this turn, even with no dispatch since", () => {
    const d = decideDispatchGuard(
      input({ dispatch: ABSENT, lastStop: present(2000), stopHookActive: true }),
    );
    expect(d.decision).toBe("allow");
    expect(d.reason).toContain("already blocked");
  });

  // MUTANT: remove the override escape. The owner must always be able to
  // stop when every remaining item is owner-blocked.
  it("ALLOWS on an explicit override, even with no dispatch since", () => {
    const d = decideDispatchGuard(
      input({ dispatch: ABSENT, lastStop: present(2000), overrideRequested: true }),
    );
    expect(d.decision).toBe("allow");
    expect(d.reason).toContain("owner-blocked");
  });

  // override takes precedence over stopHookActive's own reason text, but
  // both must still allow together - proves the two escapes compose.
  it("ALLOWS when both escapes are set", () => {
    const d = decideDispatchGuard(
      input({
        dispatch: ABSENT,
        lastStop: present(2000),
        stopHookActive: true,
        overrideRequested: true,
      }),
    );
    expect(d.decision).toBe("allow");
  });
});
