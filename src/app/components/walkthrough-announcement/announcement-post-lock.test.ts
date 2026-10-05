// WA-POST-LOCK W1: reducer and decision tests for the postLocked hard lock.
// Kept in its own file because announcement-draft-slots.test.ts is at the
// 1000-line ceiling. Fixtures are duplicated, never imported from another
// test file.

import { describe, it, expect } from "vitest";
import {
  FIRST_SLOT_ID,
  makeSlot,
  slotsReducer,
  mayCommitPost,
  type DraftSlot,
  type Drafted,
  type SlotsAction,
  type SlotDraftPhase,
} from "./announcement-draft-slots";
import { isRunComplete } from "./walkthrough-run-decisions";

const DRAFTED: Drafted = {
  title: "Week 3",
  message: "Hello",
  builtFrom: { kind: "pasted" },
  researchNotice: { kind: "off" },
  timing: "beginning-of-week",
};

function drafted(id: string, overrides: Partial<DraftSlot> = {}): DraftSlot {
  return { ...makeSlot(id, { kind: "default" }, "beginning-of-week"), draft: { phase: "drafted", draft: DRAFTED, error: null }, ...overrides };
}

// WA-POST-LOCK W1 (docs/wa-post-lock-w1-test-notes.md AC-1..AC-6, AC-12).
// Every expectation is a hand-written literal; nothing is derived from the
// reducer under test.
describe("WA-POST-LOCK: postLocked", () => {
  const LOCKED = (id: string = FIRST_SLOT_ID): DraftSlot => drafted(id, { postLocked: true, postedTo: "CS 101" });
  const POST_OK = { course: "CS 101", scheduledLabel: null } as const;

  it("AC-1: post-result success sets the lock (immediate and scheduled)", () => {
    for (const label of [null, "6/20/2026, 9:30:00 AM"]) {
      const state = [drafted(FIRST_SLOT_ID, { posting: true })];
      expect(state[0].postLocked).toBe(false);
      const next = slotsReducer(state, {
        type: "post-result",
        id: FIRST_SLOT_ID,
        result: { course: "CS 101", scheduledLabel: label },
      });
      expect(next[0].postLocked).toBe(true);
    }
  });

  it("AC-2: post-result error does not lock", () => {
    const state = [drafted(FIRST_SLOT_ID, { posting: true })];
    const next = slotsReducer(state, { type: "post-result", id: FIRST_SLOT_ID, result: { error: "refused" } });
    expect(next[0].postLocked).toBe(false);
  });

  it("AC-3 companion: post-result error on an already-locked slot keeps it locked (fail-safe)", () => {
    const state = [{ ...LOCKED(), posting: true }];
    const next = slotsReducer(state, { type: "post-result", id: FIRST_SLOT_ID, result: { error: "refused" } });
    expect(next[0].postLocked).toBe(true);
  });

  it("AC-3 companion: result error keeps the lock (restores prior, possibly posted, text)", () => {
    const state: readonly DraftSlot[] = [{ ...LOCKED(), draft: { phase: "drafting", restore: DRAFTED } }];
    const next = slotsReducer(state, { type: "result", id: FIRST_SLOT_ID, result: { error: "model failed" } });
    expect(next[0].draft.phase).toBe("drafted");
    expect(next[0].postLocked).toBe(true);
  });

  type Effect = "sets" | "clears" | "keeps" | "gone";
  interface Case {
    readonly start: readonly DraftSlot[];
    readonly action: SlotsAction;
    readonly watch: string;
    readonly expected: Effect;
  }
  const A = FIRST_SLOT_ID;
  const DRAFTING_LOCKED: DraftSlot = { ...LOCKED(A), draft: { phase: "drafting", restore: DRAFTED } };
  const cases: Record<SlotsAction["type"], Case> = {
    add: {
      start: [LOCKED(A)],
      action: { type: "add", id: "wta-slot-2", choice: { kind: "none" }, timing: "beginning-of-week" },
      watch: A,
      expected: "keeps",
    },
    remove: {
      start: [LOCKED(A), drafted("wta-slot-2")],
      action: { type: "remove", id: "wta-slot-2" },
      watch: A,
      expected: "keeps",
    },
    choose: { start: [LOCKED(A)], action: { type: "choose", id: A, choice: { kind: "none" } }, watch: A, expected: "keeps" },
    "choose-timing": {
      start: [LOCKED(A)],
      action: { type: "choose-timing", id: A, timing: "midweek" },
      watch: A,
      expected: "keeps",
    },
    "set-scheduled-at": {
      start: [LOCKED(A)],
      action: { type: "set-scheduled-at", id: A, raw: "2030-01-01T10:00" },
      watch: A,
      expected: "keeps",
    },
    edit: { start: [LOCKED(A)], action: { type: "edit", id: A, field: "title", value: "Changed" }, watch: A, expected: "clears" },
    "generate-started": { start: [LOCKED(A)], action: { type: "generate-started", ids: [A] }, watch: A, expected: "keeps" },
    "regenerate-started": { start: [LOCKED(A)], action: { type: "regenerate-started", id: A }, watch: A, expected: "keeps" },
    result: {
      start: [DRAFTING_LOCKED],
      action: { type: "result", id: A, result: { ...DRAFTED, title: "Fresh" } },
      watch: A,
      expected: "clears",
    },
    "arm-post": { start: [LOCKED(A)], action: { type: "arm-post", id: A, signature: "sig" }, watch: A, expected: "keeps" },
    "cancel-post": {
      start: [{ ...LOCKED(A), postArmedFor: "sig" }],
      action: { type: "cancel-post", id: A },
      watch: A,
      expected: "keeps",
    },
    "arm-regenerate": { start: [LOCKED(A)], action: { type: "arm-regenerate", id: A }, watch: A, expected: "keeps" },
    "cancel-regenerate": {
      start: [{ ...LOCKED(A), regenerateArmed: true }],
      action: { type: "cancel-regenerate", id: A },
      watch: A,
      expected: "keeps",
    },
    posting: { start: [LOCKED(A)], action: { type: "posting", id: A }, watch: A, expected: "keeps" },
    "post-result": {
      start: [drafted(A, { posting: true })],
      action: { type: "post-result", id: A, result: POST_OK },
      watch: A,
      expected: "sets",
    },
    "copy-result": { start: [LOCKED(A)], action: { type: "copy-result", id: A, error: null }, watch: A, expected: "keeps" },
    // reset returns fresh initialSlots; the locked slot ceases to exist and its
    // unlocked replacement is pinned by the frozen reset oracle.
    reset: { start: [LOCKED(A)], action: { type: "reset" }, watch: A, expected: "gone" },
  };

  it("AC-3: the table has exactly one cell per action type (17)", () => {
    expect(Object.keys(cases)).toHaveLength(17);
  });

  for (const [type, c] of Object.entries(cases)) {
    if (c.expected === "gone") continue;
    it(`AC-3: ${type} ${c.expected} the lock`, () => {
      const before = c.start.find((x) => x.id === c.watch);
      expect(before).toBeDefined();
      expect(before?.postLocked).toBe(c.expected === "clears" || c.expected === "keeps");
      const after = slotsReducer(c.start, c.action).find((x) => x.id === c.watch);
      expect(after).toBeDefined();
      expect(after?.postLocked).toBe(c.expected === "sets" || c.expected === "keeps");
    });
  }

  it("AC-4: edit after a post leaves postedTo and isRunComplete unchanged", () => {
    let state: readonly DraftSlot[] = [drafted(FIRST_SLOT_ID, { posting: true })];
    state = slotsReducer(state, {
      type: "post-result",
      id: FIRST_SLOT_ID,
      result: { course: "CS 101", scheduledLabel: "label-x" },
    });
    state = slotsReducer(state, { type: "edit", id: FIRST_SLOT_ID, field: "message", value: "edited" });
    expect(state[0].postedTo).toBe("CS 101");
    expect(state[0].postedScheduledLabel).toBe("label-x");
    expect(state[0].postLocked).toBe(false);
    expect(isRunComplete(state)).toBe(true);
  });

  it("AC-12: posting then edit then post-result success ends locked (fails safe)", () => {
    let state: readonly DraftSlot[] = [drafted(FIRST_SLOT_ID)];
    state = slotsReducer(state, { type: "posting", id: FIRST_SLOT_ID });
    state = slotsReducer(state, { type: "edit", id: FIRST_SLOT_ID, field: "title", value: "newer" });
    state = slotsReducer(state, { type: "post-result", id: FIRST_SLOT_ID, result: POST_OK });
    expect(state[0].postLocked).toBe(true);
  });

  it("a locked slot is not committable until an edit unlocks it; reverting the text does not re-lock", () => {
    let state: readonly DraftSlot[] = [drafted(FIRST_SLOT_ID, { posting: true })];
    state = slotsReducer(state, { type: "post-result", id: FIRST_SLOT_ID, result: POST_OK });
    expect(mayCommitPost(state[0])).toBe(false);
    state = slotsReducer(state, { type: "edit", id: FIRST_SLOT_ID, field: "title", value: "other" });
    expect(mayCommitPost(state[0])).toBe(true);
    state = slotsReducer(state, { type: "edit", id: FIRST_SLOT_ID, field: "title", value: DRAFTED.title });
    expect(mayCommitPost(state[0])).toBe(true);
  });

  describe("AC-6: mayCommitPost 12-cell grid", () => {
    const PHASES: Record<SlotDraftPhase, true> = { empty: true, drafting: true, drafted: true };
    const EXPECTED: Record<string, boolean> = {
      "empty|false|false": false,
      "empty|false|true": false,
      "empty|true|false": false,
      "empty|true|true": false,
      "drafting|false|false": false,
      "drafting|false|true": false,
      "drafting|true|false": false,
      "drafting|true|true": false,
      "drafted|false|false": true,
      "drafted|false|true": false,
      "drafted|true|false": false,
      "drafted|true|true": false,
    };
    function slotFor(phase: SlotDraftPhase, postLocked: boolean, posting: boolean): DraftSlot {
      const base = makeSlot("grid", { kind: "default" }, "beginning-of-week");
      const draft: DraftSlot["draft"] =
        phase === "drafted"
          ? { phase: "drafted", draft: DRAFTED, error: null }
          : phase === "drafting"
            ? { phase: "drafting", restore: null }
            : { phase: "empty", error: null };
      return { ...base, draft, postLocked, posting };
    }
    it("the grid has exactly 12 cells", () => {
      expect(Object.keys(EXPECTED)).toHaveLength(12);
      expect(Object.keys(PHASES)).toHaveLength(3);
    });
    for (const phase of Object.keys(PHASES) as SlotDraftPhase[]) {
      for (const locked of [false, true]) {
        for (const posting of [false, true]) {
          const key = `${phase}|${locked}|${posting}`;
          it(`${key} -> ${EXPECTED[key]}`, () => {
            expect(mayCommitPost(slotFor(phase, locked, posting))).toBe(EXPECTED[key]);
          });
        }
      }
    }
  });
});
