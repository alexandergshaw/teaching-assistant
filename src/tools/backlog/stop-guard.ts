// The Stop guard: refuses to let a session end while the queue holds an
// ACTIONABLE item and nothing is blocking on a real question.
//
// WHY THIS EXISTS. "Do not stop while work remains" was a discipline, and the
// single most repeated correction in this project's history is a turn that
// ended by NAMING the next item instead of starting it. Announcing is not
// starting. A discipline cannot be relied on across compaction and restarts;
// an exit code can.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not try to answer "did I make
// progress this session?" That signal is the one `backlog-automation.md`'s B5
// warns about: in a shared working tree the tree is always dirty from
// somebody, so a progress check silently never fires. This guard asks a
// different and entirely queue-local question - "is there an actionable item
// right now?" - which needs no session-scoped state at all. B5 is sidestepped
// rather than solved.
//
// TERMINATION. Three escapes, because a guard that can never be satisfied is
// worse than no guard:
//   1. The queue holds no actionable item (the normal path - work it, or
//      classify it, and the guard falls silent).
//   2. `stop_hook_active` is already set, meaning this guard ALREADY blocked
//      once and the agent has been told. Blocking again would be an infinite
//      loop, and the harness sets this flag precisely so a hook can avoid one.
//   3. An explicit override, so the owner can always end a session.
//
// UNVERIFIED AS A GATE. See `decideStopGuard`'s note and .claude/settings.json.

import type { BacklogItem } from "./types";
import { selectNext } from "./next";

export interface StopGuardInput {
  items: BacklogItem[];
  /** Set by the harness when a stop hook has already blocked once this turn.
   *  Escape 2 - without honouring it, a blocking hook loops forever. */
  stopHookActive: boolean;
  /** Escape 3: an explicit owner override. */
  overrideRequested: boolean;
}

export type StopGuardDecision =
  | { decision: "block"; reason: string; itemId: string }
  | { decision: "allow"; reason: string };

/**
 * Pure. The whole decision lives here so it is testable in a node-env suite
 * that renders nothing and runs no hook - the CLI wrapper below is the only
 * part that cannot be exercised here, and it is deliberately trivial.
 */
export function decideStopGuard(input: StopGuardInput): StopGuardDecision {
  if (input.overrideRequested) {
    return { decision: "allow", reason: "override requested by the owner" };
  }
  if (input.stopHookActive) {
    // Escape 2. Allowing here is not a failure of the guard - it is what stops
    // the guard from becoming a trap. The block has already been delivered.
    return {
      decision: "allow",
      reason: "a stop guard already blocked once this turn; not blocking again",
    };
  }

  const next = selectNext(input.items);
  if (next.type === "actionable") {
    return {
      decision: "block",
      itemId: next.item.id,
      reason:
        `The backlog still holds an ACTIONABLE item: ${next.item.id}. ` +
        `Start it in this turn rather than ending here - naming it is not starting it. ` +
        `Its closure test is: ${next.item.verify ?? "(none recorded)"}. ` +
        `If it genuinely cannot be started, say why and change its state in docs/backlog.yml ` +
        `(re-render afterwards), or ask the owner a real question - do not simply stop.`,
    };
  }

  if (next.type === "unscoped") {
    return {
      decision: "allow",
      reason:
        `no actionable item; ${next.count} item(s) are unscoped and cannot be selected ` +
        `(scoping one is real triage work, not something to block a turn on)`,
    };
  }

  return { decision: "allow", reason: next.reason };
}
