import { describe, it, expect } from "vitest";
import { accumulateDroppedFrames } from "./dropped-frame-accumulator";

// REGRESSION 383's Limits: the canonical frozen-literal oracle for the
// dropped-frames session accumulator, now shared by module-deck-capture
// (AM-G) and recording (discussion reply capture and grading-recording).
//
// FROZEN ORACLE, not derived from either implementation: every expected
// value below was hand-written from the semantics doc-commented on
// accumulateDroppedFrames itself (a decrease is the only "new cycle" signal;
// everything else, including no change, is a same-cycle delta), before this
// file was written against the merged function. Consolidating the two
// previously-separate implementations into one made any test that merely
// compared them a tautology - this table exists instead of that comparison.
const CASES: Array<[prevLive: number, nextLive: number, runningTotal: number, expected: number]> = [
  // First observation of a session: prevLive/runningTotal both start at 0.
  [0, 0, 0, 0], // nothing dropped yet
  [0, 4, 0, 4], // climbs to 4 on the very first observation

  // Same cycle, no change at all: a plateau contributes nothing.
  [4, 4, 4, 4],

  // Same cycle, a jump of more than one dropped frame between observations
  // (e.g. two ticks' worth of drops landed between polls) - still a plain
  // delta, never mistaken for a new cycle since nextLive > prevLive.
  [4, 10, 4, 10],

  // A DECREASE to EXACTLY zero: the hook reset its counter in start(). The
  // new cycle has not dropped anything yet, so nothing is added on top of
  // the running total.
  [10, 0, 10, 10],

  // The new cycle then climbs to 3: added on top of the preserved total.
  [0, 3, 10, 13],

  // THE required walkthrough: 6, then a reset, then 3 - total must be 9,
  // never 3 (which is what reading the live value alone would report).
  [6, 0, 6, 6],
  [0, 3, 6, 9],

  // A DECREASE that does NOT land on exactly zero: the exact zero tick was
  // never observed (the panel polls on an interval, not on every hook
  // render), so the first observation of the new cycle already reads a
  // nonzero live value. That value is still added on top, in full, exactly
  // as an exact-zero reset would be - it is not treated as a same-cycle
  // delta relative to the old cycle's prevLive.
  [7, 2, 9, 11],

  // A decrease of exactly one is still a decrease, not a same-cycle delta of
  // -1 - the sign is the only signal, magnitude is irrelevant.
  [5, 4, 5, 9],
];

describe("accumulateDroppedFrames (shared, REGRESSION 383 / AM-G)", () => {
  it.each(CASES)(
    "accumulateDroppedFrames(%i, %i, %i) === %i",
    (prevLive, nextLive, runningTotal, expected) => {
      expect(accumulateDroppedFrames(prevLive, nextLive, runningTotal)).toBe(expected);
    }
  );

  it("threads across a realistic multi-cycle session end to end", () => {
    let total = 0;
    total = accumulateDroppedFrames(0, 4, total); // cycle 1: 4
    total = accumulateDroppedFrames(4, 0, total); // restart
    total = accumulateDroppedFrames(0, 1, total); // cycle 2: 1
    total = accumulateDroppedFrames(1, 0, total); // restart
    total = accumulateDroppedFrames(0, 6, total); // cycle 3: 6
    expect(total).toBe(11);
  });
});
