// docs/grading-via-recording-acceptance-criteria.md section 3 (R3a).
//
// SABOTAGE CHECK LOG (verified by actually breaking the source and
// re-running, then reverting - never merely reasoned about):
//   1. Inverted the `matches.length === 1` branch to `>= 1` (so "ambiguous"
//      could never fire) -> "reports ambiguous when two roster entries
//      share an identical full name" and "the first-name-alone case never
//      reports matched" both failed as expected. Reverted.
//   2. Changed the no-roster guard from `!rosterNames || rosterNames.length
//      === 0` to `!rosterNames` alone (so an empty array fell through to the
//      matching loop instead of short-circuiting) -> "an empty roster array
//      reports no-roster, not unmatched" failed as expected. Reverted.
//   3. Removed the comma-reorder branch in canonicalizeNameForMatch (made it
//      always `collapsed.toLowerCase()`) -> every "Last, First" ordering
//      test failed as expected. Reverted.

import { describe, it, expect } from "vitest";
import { matchNameAgainstRoster, canonicalizeNameForMatch } from "./grading-roster-match";

describe("canonicalizeNameForMatch", () => {
  it("lowercases and collapses extra internal whitespace", () => {
    expect(canonicalizeNameForMatch("  Maria    Garcia  ")).toBe("maria garcia");
  });

  it("reorders 'Last, First' to 'first last'", () => {
    expect(canonicalizeNameForMatch("Garcia, Maria")).toBe("maria garcia");
  });

  it("reorders 'Last, First Middle' keeping the middle name adjacent to First", () => {
    expect(canonicalizeNameForMatch("Chen, Diego Alejandro")).toBe("diego alejandro chen");
  });

  it("agrees with the equivalent plain 'First Last' spelling", () => {
    expect(canonicalizeNameForMatch("Garcia, Maria")).toBe(canonicalizeNameForMatch("Maria Garcia"));
  });

  it("returns empty string for blank input", () => {
    expect(canonicalizeNameForMatch("   ")).toBe("");
  });

  it("does not reorder tokens when there is no comma", () => {
    expect(canonicalizeNameForMatch("Maria Garcia")).toBe("maria garcia");
    expect(canonicalizeNameForMatch("Garcia Maria")).toBe("garcia maria");
  });
});

describe("matchNameAgainstRoster", () => {
  it("no-roster: null roster reports no-roster, never unmatched", () => {
    const result = matchNameAgainstRoster("Maria Garcia", null);
    expect(result.nameMatch).toBe("no-roster");
    expect(result.rosterCandidates).toEqual([]);
  });

  it("no-roster: undefined roster reports no-roster", () => {
    const result = matchNameAgainstRoster("Maria Garcia", undefined);
    expect(result.nameMatch).toBe("no-roster");
  });

  it("no-roster: an empty roster array reports no-roster, not unmatched", () => {
    const result = matchNameAgainstRoster("Maria Garcia", []);
    expect(result.nameMatch).toBe("no-roster");
    expect(result.rosterCandidates).toEqual([]);
  });

  it("matched: exact spelling", () => {
    const result = matchNameAgainstRoster("Maria Garcia", ["Diego Chen", "Maria Garcia", "Sam Lee"]);
    expect(result.nameMatch).toBe("matched");
    expect(result.rosterCandidates).toEqual(["Maria Garcia"]);
  });

  it("matched: tolerant of case", () => {
    const result = matchNameAgainstRoster("MARIA garcia", ["Maria Garcia"]);
    expect(result.nameMatch).toBe("matched");
    expect(result.rosterCandidates).toEqual(["Maria Garcia"]);
  });

  it("matched: tolerant of extra whitespace on either side", () => {
    const result = matchNameAgainstRoster("  Maria   Garcia ", ["Maria Garcia"]);
    expect(result.nameMatch).toBe("matched");
  });

  it("matched: tolerant of 'Last, First' on the ROSTER side", () => {
    const result = matchNameAgainstRoster("Maria Garcia", ["Garcia, Maria"]);
    expect(result.nameMatch).toBe("matched");
    // The candidate returned is the roster's OWN spelling, verbatim - never
    // rewritten to match the read name's order.
    expect(result.rosterCandidates).toEqual(["Garcia, Maria"]);
  });

  it("matched: tolerant of 'Last, First' on the READ-NAME side", () => {
    const result = matchNameAgainstRoster("Garcia, Maria", ["Maria Garcia"]);
    expect(result.nameMatch).toBe("matched");
    expect(result.rosterCandidates).toEqual(["Maria Garcia"]);
  });

  it("unmatched: no roster entry canonicalizes to the read name", () => {
    const result = matchNameAgainstRoster("Nobody Here", ["Diego Chen", "Maria Garcia"]);
    expect(result.nameMatch).toBe("unmatched");
    expect(result.rosterCandidates).toEqual([]);
  });

  it("unmatched: a blank read name matches nothing", () => {
    const result = matchNameAgainstRoster("   ", ["Diego Chen"]);
    expect(result.nameMatch).toBe("unmatched");
  });

  it("ambiguous: two roster entries share an identical full name - an honest ambiguous, not a coin-flip match", () => {
    const result = matchNameAgainstRoster("Maria Garcia", ["Maria Garcia", "Diego Chen", "Maria Garcia"]);
    expect(result.nameMatch).toBe("ambiguous");
    expect(result.rosterCandidates).toEqual(["Maria Garcia", "Maria Garcia"]);
  });

  it("never matches on a first name alone: a bare first name against two full names with that first name reports unmatched, never matched", () => {
    const result = matchNameAgainstRoster("Maria", ["Maria Garcia", "Maria Lopez"]);
    expect(result.nameMatch).not.toBe("matched");
    expect(result.nameMatch).toBe("unmatched");
  });

  it("never matches on a first name alone against a SINGLE full-name candidate either", () => {
    const result = matchNameAgainstRoster("Maria", ["Maria Garcia"]);
    expect(result.nameMatch).not.toBe("matched");
  });

  it("a full name is not fooled into matching a roster entry that only shares the surname", () => {
    const result = matchNameAgainstRoster("Maria Garcia", ["Diego Garcia"]);
    expect(result.nameMatch).toBe("unmatched");
  });
});
