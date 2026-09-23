// The DISPATCH guard: blocks a Stop when no subagent was dispatched during
// the turn that is ending. See AGENTS.md's "Never stall the loop" section -
// the rule it enforces has been written in prose, tightened five times, and
// failed six times anyway (most recently on a turn whose own content was a
// control-improvement document). This is the mechanical control the owner
// asked for after that failure.
//
// THE MECHANISM. The Stop hook cannot see subagent dispatches directly, so
// this reasons over two file markers instead (see dispatch-markers.ts for the
// actual files, under .git/, never committed):
//   - a DISPATCH marker, touched by the main session when it dispatches
//     (see the exact command in the block reason below);
//   - a STOP marker, touched by this check every time it runs.
// If a stop has genuinely happened before (the stop marker is PRESENT) and no
// dispatch was ever recorded (the dispatch marker is ABSENT), or the dispatch
// marker is OLDER than the stop marker written at the PREVIOUS stop, no
// dispatch happened in the interval, and the check blocks.
//
// ABSENT IS NOT UNREADABLE. This module used to collapse "the marker file
// does not exist" and "the marker could not be read" into a single `null`,
// and that collapse was the bug: a session that never once calls
// touch-dispatch has an ABSENT dispatch marker forever, and the old
// first-run allow branch treated every one of that session's stops as "first
// run", so the guard never fired for exactly the session it exists to catch
// (caught live against the real hook - two stops in a row with no dispatch,
// both allowed). MarkerState below keeps the three facts distinct:
//   - "absent"     -> the marker has never been written. For the STOP
//                      marker specifically, that means no stop has happened
//                      yet - a real first run - so it allows. For the
//                      DISPATCH marker, once a stop marker is present, an
//                      absent dispatch marker is exactly the stall this
//                      guard exists to catch, and it blocks.
//   - "unreadable" -> a real read error occurred. Fail-open belongs here,
//                      never to plain absence - see this module's own header
//                      for why collapsing the two produced an inert guard.
//   - "present"    -> a real mtime, safe to compare.
//
// FAIL-OPEN IS THE WHOLE POINT, for actual errors. A control that can wedge
// the loop is worse than the stall it prevents. dispatch-markers.ts is
// responsible for turning every real read failure into "unreadable" (never
// throwing), so this module only ever sees one of the three MarkerState
// values.
//
// ESCAPES, matching stop-guard.ts's own two exactly rather than inventing a
// third flag: `--stop-hook-active` (this guard already blocked once this
// turn - blocking again would loop forever) and `--override` (the owner said
// every remaining backlog item is owner-blocked).

/** The three facts a marker read can produce - see this file's header for why "absent" and "unreadable" must never collapse into one. */
export type MarkerState = { kind: "present"; mtimeMs: number } | { kind: "absent" } | { kind: "unreadable" };

export interface DispatchGuardInput {
  /** State of the DISPATCH marker (touched when the main session dispatches). */
  dispatch: MarkerState;
  /** State of the STOP marker as written at the PREVIOUS stop. */
  lastStop: MarkerState;
  /** Escape 1: set by the harness when a stop hook has already blocked once this turn. */
  stopHookActive: boolean;
  /** Escape 2: an explicit owner override - every remaining item is owner-blocked. */
  overrideRequested: boolean;
}

export type DispatchGuardDecision =
  | { decision: "block"; reason: string }
  | { decision: "allow"; reason: string };

const TOUCH_COMMAND = "npm run backlog:touch-dispatch";

function blockReason(detail: string): string {
  return (
    `NO SUBAGENT WAS DISPATCHED since the previous stop (${detail}). AGENTS.md's "Never stall the loop" rule ` +
    "requires backlog work to be running or landed before a turn ends - a dispatched agent counts, a " +
    `commit/push/summary does not. Dispatch one now, then run \`${TOUCH_COMMAND}\` to record it before ending ` +
    "the turn. If every remaining backlog item is genuinely owner-blocked, say so and re-run with --override."
  );
}

/**
 * Pure. Never touches a filesystem or a clock - dispatch-markers.ts is the
 * only place that reads the real marker files, and it hands this function
 * plain MarkerState values so the decision itself stays testable with
 * fixture values, exactly like decideStopGuard.
 */
export function decideDispatchGuard(input: DispatchGuardInput): DispatchGuardDecision {
  if (input.overrideRequested) {
    return {
      decision: "allow",
      reason: "override requested - every remaining backlog item is owner-blocked",
    };
  }
  if (input.stopHookActive) {
    // Without this escape a blocking hook loops forever - the harness sets
    // this flag precisely so a hook can tell "I already told the agent"
    // apart from "the agent tried to end the turn again anyway".
    return {
      decision: "allow",
      reason: "a stop guard already blocked once this turn; not blocking again",
    };
  }

  // Fail-open belongs to ERRORS, never to absence (this file's header). A
  // real read failure on either marker means the comparison cannot be
  // trusted, so this allows regardless of what the other marker says.
  if (input.dispatch.kind === "unreadable" || input.lastStop.kind === "unreadable") {
    return {
      decision: "allow",
      reason: "a marker could not be read (a real filesystem error) - failing open rather than guessing",
    };
  }

  // The stop marker is genuinely absent only on this repo's very first stop
  // ever. Once it exists, "absent" can never legitimately recur for it (this
  // check itself writes it unconditionally on every run - see cli.ts), so
  // this branch is the one true first-run case.
  if (input.lastStop.kind === "absent") {
    return {
      decision: "allow",
      reason: "no stop marker recorded yet - this is the first stop this repo has seen, nothing to compare",
    };
  }

  // From here, a stop has genuinely happened before. An absent dispatch
  // marker is no longer ambiguous - it means no dispatch has EVER been
  // recorded for this repo, which is exactly the stalled session this guard
  // exists to catch.
  if (input.dispatch.kind === "absent") {
    return {
      decision: "block",
      reason: blockReason("the dispatch marker has never been recorded"),
    };
  }

  // Both present: a real comparison.
  if (input.dispatch.mtimeMs >= input.lastStop.mtimeMs) {
    return {
      decision: "allow",
      reason: "a dispatch was recorded since the previous stop",
    };
  }

  return {
    decision: "block",
    reason: blockReason("the dispatch marker is older than the previous stop marker"),
  };
}
