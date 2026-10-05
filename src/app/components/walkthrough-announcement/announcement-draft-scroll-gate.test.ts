// M8 gate oracle (docs/walkthrough-overhaul-s2-m8-test-notes.md 3.A). The
// expected table is a FROZEN LITERAL - never computed from the function under
// test. Axes come from the SlotDraft["phase"] type union (plus null for the
// initial no-previous-phase state), not from the implementation.
//
// Sabotage-checked in the real leaf: next==="drafted" alone, prev==="drafting"
// alone, always-true and always-false each turned this file red.

import { describe, it, expect } from "vitest";
import { shouldScrollDraftIntoView, type SlotDraftPhase } from "./announcement-draft-slots";

const PREVS: readonly (SlotDraftPhase | null)[] = [null, "empty", "drafting", "drafted"];
const NEXTS: readonly SlotDraftPhase[] = ["empty", "drafting", "drafted"];

// Row-major over PREVS x NEXTS. Exactly one true: drafting -> drafted.
const EXPECTED: readonly boolean[] = [
  false, false, false, // null
  false, false, false, // empty
  false, false, true, // drafting
  false, false, false, // drafted
];

describe("shouldScrollDraftIntoView", () => {
  const cases = PREVS.flatMap((prev) => NEXTS.map((next) => ({ prev, next })));

  it("covers the full 12-cell product with exactly one true cell", () => {
    expect(cases.length).toBe(12);
    expect(EXPECTED.length).toBe(12);
    expect(EXPECTED.filter(Boolean).length).toBe(1);
  });

  cases.forEach(({ prev, next }, i) => {
    it(`${String(prev)} -> ${next} is ${EXPECTED[i]}`, () => {
      expect(shouldScrollDraftIntoView(prev, next)).toBe(EXPECTED[i]);
    });
  });
});
