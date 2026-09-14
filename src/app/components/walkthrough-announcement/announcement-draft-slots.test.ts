// docs/announcement-from-walkthrough-acceptance-criteria.md 8: one describe block per member of the SlotsAction
// union (read off the type, 14 members), not per any transition table row -
// so a 15th member added later fails this file's own construction, not just
// whatever this document happens to list today. Every guard/effect
// assertion below was sabotage-checked while this file was written: the
// guarded line was removed/altered in the real source, the specific `it`
// was confirmed red, the source was restored, and the suite was confirmed
// green again. Comments record the sabotage performed for the two
// obligations explicitly relocated to this wave (C1's arm-regenerate pair,
// C2's positive `unavailable` assertion).

import { describe, it, expect } from "vitest";
import {
  MAX_ANNOUNCEMENT_BATCH_SIZE,
  FIRST_SLOT_ID,
  EXEMPLAR_FETCH_TIMEOUT_MS,
  choiceId,
  builtFromId,
  defaultOptionLabel,
  receiptLabel,
  optionsForSlot,
  resolveChoice,
  makeSlot,
  initialSlots,
  emptySlotIds,
  slotsReducer,
  savedFormatsStatusText,
  type DraftSlot,
  type Drafted,
  type LiveDefaults,
  type TemplateOptionSource,
  type SavedFormatsState,
  type SlotsAction,
} from "./announcement-draft-slots";
import { EMPTY_ANNOUNCEMENT_OUTLINE, type AnnouncementOutline } from "@/lib/announcement-outline-types";
import { escapeForCopyTitle } from "./useAnnouncementDraftSlots";

const OUTLINE_A: AnnouncementOutline = { ...EMPTY_ANNOUNCEMENT_OUTLINE, hasGreeting: true };
const OUTLINE_B: AnnouncementOutline = { ...EMPTY_ANNOUNCEMENT_OUTLINE, hasSignOff: true };

const DRAFTED: Drafted = {
  title: "Week 3",
  message: "Hello",
  builtFrom: { kind: "pasted" },
  researchNotice: { kind: "off" },
};

function drafted(id: string, overrides: Partial<DraftSlot> = {}): DraftSlot {
  return { ...makeSlot(id, { kind: "default" }), draft: { phase: "drafted", draft: DRAFTED, error: null }, ...overrides };
}

const SRC_EMPTY: TemplateOptionSource = {
  hasPastedText: false,
  mostRecent: null,
  saved: [],
  savedState: "loaded",
};

// G1: the four SavedFormatsState members. Every table test below is built
// by iterating THIS array (never a hand-listed set of assertions), so a
// fifth member added to the source type only needs adding here once for
// every such table test to pick it up.
const ALL_SAVED_FORMATS_STATES: readonly SavedFormatsState[] = ["loading", "loaded", "failed", "timedout"];

describe("initialSlots / makeSlot / emptySlotIds", () => {
  it("initialSlots returns exactly one slot, choice default, phase empty", () => {
    const slots = initialSlots(FIRST_SLOT_ID);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ id: FIRST_SLOT_ID, choice: { kind: "default" }, draft: { phase: "empty", error: null } });
  });

  it("emptySlotIds returns only ids of empty-phase slots", () => {
    const slots = [makeSlot("a", { kind: "default" }), drafted("b"), makeSlot("c", { kind: "none" })];
    expect(emptySlotIds(slots)).toEqual(["a", "c"]);
  });
});

describe("choiceId / builtFromId / defaultOptionLabel / receiptLabel", () => {
  it("choiceId distinguishes saved exemplars by id", () => {
    expect(choiceId({ kind: "default" })).toBe("default");
    expect(choiceId({ kind: "saved", exemplarId: "e1", label: "L", outline: OUTLINE_A })).toBe("saved:e1");
  });

  it("builtFromId mirrors choiceId's saved-id shape", () => {
    expect(builtFromId({ kind: "saved", exemplarId: "e1", label: "L" })).toBe("saved:e1");
    expect(builtFromId({ kind: "none" })).toBe("none");
  });

  it("defaultOptionLabel prefers pasted, then loading, then most-recent, then loaded-empty", () => {
    expect(defaultOptionLabel({ ...SRC_EMPTY, hasPastedText: true })).toMatch(/pasted above/);
    expect(defaultOptionLabel({ ...SRC_EMPTY, savedState: "loading" })).toMatch(/checking/);
    expect(defaultOptionLabel({ ...SRC_EMPTY, mostRecent: { id: "e1", label: "Week 3 kickoff", outline: OUTLINE_A } })).toMatch(
      /Week 3 kickoff/
    );
    expect(defaultOptionLabel(SRC_EMPTY)).toMatch(/no saved format yet/);
  });

  it("G1: defaultOptionLabel does not say 'no saved format yet' when failed or timedout - the fetch never determined whether a format exists", () => {
    expect(defaultOptionLabel({ ...SRC_EMPTY, savedState: "failed" })).not.toMatch(/no saved format yet/);
    expect(defaultOptionLabel({ ...SRC_EMPTY, savedState: "timedout" })).not.toMatch(/no saved format yet/);
  });

  it("receiptLabel names the built-from template", () => {
    expect(receiptLabel({ kind: "saved", exemplarId: "e1", label: "Week 3" })).toBe('Drafted from "Week 3"');
    expect(receiptLabel({ kind: "pasted" })).toMatch(/pasted announcement/);
    expect(receiptLabel({ kind: "none" })).toMatch(/without a format/);
  });
});

// ---------------------------------------------------------------------------
// Set C - resolveChoice, matrix over sources x list-state.
// ---------------------------------------------------------------------------

describe("resolveChoice - Set C", () => {
  it("default resolves to pasted when pasted text is present, regardless of most-recent", () => {
    const live: LiveDefaults = { pastedOutline: OUTLINE_A, mostRecent: { id: "e1", label: "L", outline: OUTLINE_B } };
    const r = resolveChoice({ kind: "default" }, live);
    expect(r.template).toEqual({ kind: "pasted" });
    expect(r.outline).toBe(OUTLINE_A);
  });

  it("default resolves to most-recent (labelled) when nothing pasted", () => {
    const live: LiveDefaults = { pastedOutline: null, mostRecent: { id: "e1", label: "Week 3 kickoff", outline: OUTLINE_B } };
    const r = resolveChoice({ kind: "default" }, live);
    expect(r.template).toEqual({ kind: "saved", exemplarId: "e1", label: "Week 3 kickoff" });
    expect(r.outline).toBe(OUTLINE_B);
  });

  it("default resolves to none when nothing pasted and nothing saved", () => {
    const r = resolveChoice({ kind: "default" }, { pastedOutline: null, mostRecent: null });
    expect(r.template).toEqual({ kind: "none" });
    expect(r.outline).toEqual(EMPTY_ANNOUNCEMENT_OUTLINE);
  });

  it("pasted choice resolves to pasted using the live pasted outline", () => {
    const r = resolveChoice({ kind: "pasted" }, { pastedOutline: OUTLINE_A, mostRecent: null });
    expect(r.template).toEqual({ kind: "pasted" });
    expect(r.outline).toBe(OUTLINE_A);
  });

  it("pasted choice with no live pasted text falls back to the empty outline", () => {
    const r = resolveChoice({ kind: "pasted" }, { pastedOutline: null, mostRecent: null });
    expect(r.outline).toEqual(EMPTY_ANNOUNCEMENT_OUTLINE);
  });

  it("saved choice resolves to its own carried outline, never touching the live list", () => {
    const r = resolveChoice({ kind: "saved", exemplarId: "e9", label: "Old", outline: OUTLINE_B }, { pastedOutline: OUTLINE_A, mostRecent: null });
    expect(r.template).toEqual({ kind: "saved", exemplarId: "e9", label: "Old" });
    expect(r.outline).toBe(OUTLINE_B);
  });

  it("none choice resolves to none with the empty outline", () => {
    const r = resolveChoice({ kind: "none" }, { pastedOutline: OUTLINE_A, mostRecent: { id: "e1", label: "L", outline: OUTLINE_B } });
    expect(r.template).toEqual({ kind: "none" });
    expect(r.outline).toEqual(EMPTY_ANNOUNCEMENT_OUTLINE);
  });
});

// ---------------------------------------------------------------------------
// Set G (options half) - optionsForSlot, including C2's positive assertion.
// ---------------------------------------------------------------------------

describe("optionsForSlot - Set G", () => {
  it("always contains an option whose id === choiceId(slot.choice), even for a saved choice absent from src.saved", () => {
    const slot = makeSlot("a", { kind: "saved", exemplarId: "gone", label: "Gone Format", outline: OUTLINE_A });
    const options = optionsForSlot(slot, SRC_EMPTY);
    expect(options.some((o) => o.id === choiceId(slot.choice))).toBe(true);
  });

  it("POSITIVE case (relocated obligation 1): a saved choice absent from a SUCCESSFULLY loaded list is flagged unavailable: true", () => {
    const slot = makeSlot("a", { kind: "saved", exemplarId: "gone", label: "Gone Format", outline: OUTLINE_A });
    const src: TemplateOptionSource = { ...SRC_EMPTY, savedState: "loaded", saved: [] };
    const options = optionsForSlot(slot, src);
    const synthetic = options.find((o) => o.id === choiceId(slot.choice));
    expect(synthetic).toBeDefined();
    expect(synthetic?.unavailable).toBe(true);
    // Sabotage-checked: deleting `unavailable: listResolved` (replacing it
    // with a hardcoded `unavailable: false`) in announcement-draft-slots.ts
    // turns this assertion red; restoring the source turns it green again.
  });

  it("NEGATIVE case: the same absent saved choice is NOT unavailable while the list is still loading", () => {
    const slot = makeSlot("a", { kind: "saved", exemplarId: "gone", label: "Gone Format", outline: OUTLINE_A });
    const options = optionsForSlot(slot, { ...SRC_EMPTY, savedState: "loading" });
    const synthetic = options.find((o) => o.id === choiceId(slot.choice));
    expect(synthetic?.unavailable).toBe(false);
  });

  it("NEGATIVE case: the same absent saved choice is NOT unavailable when the list failed to load", () => {
    const slot = makeSlot("a", { kind: "saved", exemplarId: "gone", label: "Gone Format", outline: OUTLINE_A });
    const options = optionsForSlot(slot, { ...SRC_EMPTY, savedState: "failed" });
    const synthetic = options.find((o) => o.id === choiceId(slot.choice));
    expect(synthetic?.unavailable).toBe(false);
  });

  it("G1 NEGATIVE case: the same absent saved choice is NOT unavailable after the fetch timed out - a timeout proves nothing about whether the format still exists", () => {
    const slot = makeSlot("a", { kind: "saved", exemplarId: "gone", label: "Gone Format", outline: OUTLINE_A });
    const options = optionsForSlot(slot, { ...SRC_EMPTY, savedState: "timedout" });
    const synthetic = options.find((o) => o.id === choiceId(slot.choice));
    expect(synthetic?.unavailable).toBe(false);
  });

  it("G1 table: unavailable is true only for 'loaded', false for every other SavedFormatsState, for a saved choice absent from the list", () => {
    const slot = makeSlot("a", { kind: "saved", exemplarId: "gone", label: "Gone Format", outline: OUTLINE_A });
    for (const state of ALL_SAVED_FORMATS_STATES) {
      const options = optionsForSlot(slot, { ...SRC_EMPTY, savedState: state });
      const synthetic = options.find((o) => o.id === choiceId(slot.choice));
      expect(synthetic?.unavailable, `state=${state}`).toBe(state === "loaded");
    }
  });

  it("does not synthesize an extra option when the saved choice IS present in src.saved", () => {
    const slot = makeSlot("a", { kind: "saved", exemplarId: "e1", label: "Present", outline: OUTLINE_A });
    const src: TemplateOptionSource = { ...SRC_EMPTY, saved: [{ id: "e1", label: "Present", outline: OUTLINE_A }] };
    const options = optionsForSlot(slot, src);
    expect(options.filter((o) => o.id === "saved:e1")).toHaveLength(1);
  });

  it("H2 POSITIVE: a pasted choice with the paste box now empty (hasPastedText: false) still gets a synthetic pasted option, flagged unavailable - without this, the dropdown falls back to Default while resolveChoice still resolves to pasted (i.e. the empty outline), a silent divergence between displayed and drafted state", () => {
    const slot = makeSlot("a", { kind: "pasted" });
    const options = optionsForSlot(slot, { ...SRC_EMPTY, hasPastedText: false });
    const synthetic = options.find((o) => o.id === choiceId(slot.choice));
    expect(synthetic).toBeDefined();
    expect(synthetic?.unavailable).toBe(true);
    // Sabotage-checked: gating the synthetic push on
    // `slot.choice.kind === "saved"` alone (the pre-fix source) makes
    // `synthetic` undefined here, which turns this assertion red;
    // restoring the `else if (slot.choice.kind === "pasted")` branch turns
    // it green again.
  });

  it("H2 NEGATIVE: a pasted choice while the paste box IS populated does not synthesize a second pasted option", () => {
    const slot = makeSlot("a", { kind: "pasted" });
    const options = optionsForSlot(slot, { ...SRC_EMPTY, hasPastedText: true });
    expect(options.filter((o) => o.id === "pasted")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// slotsReducer - one describe per SlotsAction member (14).
// ---------------------------------------------------------------------------

describe('"add"', () => {
  it("appends a new empty slot with the given choice", () => {
    const state = initialSlots(FIRST_SLOT_ID);
    const next = slotsReducer(state, { type: "add", id: "wta-slot-2", choice: { kind: "none" } });
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ id: "wta-slot-2", choice: { kind: "none" }, draft: { phase: "empty" } });
  });

  it("a saved choice can be pre-chosen from the browse list", () => {
    const state = initialSlots(FIRST_SLOT_ID);
    const choice = { kind: "saved" as const, exemplarId: "e1", label: "L", outline: OUTLINE_A };
    const next = slotsReducer(state, { type: "add", id: "wta-slot-2", choice });
    expect(next[1].choice).toEqual(choice);
  });

  it("guard: no-op at MAX_ANNOUNCEMENT_BATCH_SIZE", () => {
    let state = initialSlots(FIRST_SLOT_ID);
    for (let i = 2; i <= MAX_ANNOUNCEMENT_BATCH_SIZE; i++) {
      state = slotsReducer(state, { type: "add", id: `wta-slot-${i}`, choice: { kind: "none" } });
    }
    expect(state).toHaveLength(MAX_ANNOUNCEMENT_BATCH_SIZE);
    const beyond = slotsReducer(state, { type: "add", id: "wta-slot-overflow", choice: { kind: "none" } });
    expect(beyond).toBe(state);
  });
});

describe('"remove"', () => {
  it("drops the slot by id", () => {
    const state = slotsReducer(initialSlots(FIRST_SLOT_ID), { type: "add", id: "wta-slot-2", choice: { kind: "none" } });
    const next = slotsReducer(state, { type: "remove", id: FIRST_SLOT_ID });
    expect(next.map((s) => s.id)).toEqual(["wta-slot-2"]);
  });

  it("guard: no-op at slots.length === 1", () => {
    const state = initialSlots(FIRST_SLOT_ID);
    const next = slotsReducer(state, { type: "remove", id: FIRST_SLOT_ID });
    expect(next).toBe(state);
  });

  it("guard: unknown id is a no-op", () => {
    const state = slotsReducer(initialSlots(FIRST_SLOT_ID), { type: "add", id: "wta-slot-2", choice: { kind: "none" } });
    const next = slotsReducer(state, { type: "remove", id: "does-not-exist" });
    expect(next).toBe(state);
  });
});

describe('"choose"', () => {
  it("effect: writes the choice and clears regenerateArmed", () => {
    const state = [drafted(FIRST_SLOT_ID, { regenerateArmed: true })];
    const choice = { kind: "none" as const };
    const next = slotsReducer(state, { type: "choose", id: FIRST_SLOT_ID, choice });
    expect(next[0].choice).toEqual(choice);
    expect(next[0].regenerateArmed).toBe(false);
  });

  it("guard: leaves draft byte-identical", () => {
    const state = [drafted(FIRST_SLOT_ID)];
    const next = slotsReducer(state, { type: "choose", id: FIRST_SLOT_ID, choice: { kind: "none" } });
    expect(next[0].draft).toBe(state[0].draft);
  });

  it("guard: unknown id is a no-op", () => {
    const state = initialSlots(FIRST_SLOT_ID);
    const next = slotsReducer(state, { type: "choose", id: "does-not-exist", choice: { kind: "none" } });
    expect(next).toBe(state);
  });
});

describe('"edit"', () => {
  it("effect: writes the field and clears postArmedFor, regenerateArmed, copyError", () => {
    const state = [drafted(FIRST_SLOT_ID, { postArmedFor: "sig", regenerateArmed: true, copyError: "oops" })];
    const next = slotsReducer(state, { type: "edit", id: FIRST_SLOT_ID, field: "title", value: "New title" });
    expect(next[0].draft).toMatchObject({ phase: "drafted", draft: { title: "New title" } });
    expect(next[0].postArmedFor).toBeNull();
    expect(next[0].regenerateArmed).toBe(false);
    expect(next[0].copyError).toBeNull();
  });

  it("guard: no-op on an empty slot", () => {
    const state = initialSlots(FIRST_SLOT_ID);
    const next = slotsReducer(state, { type: "edit", id: FIRST_SLOT_ID, field: "title", value: "x" });
    expect(next).toBe(state);
  });

  it("guard: no-op on a drafting slot", () => {
    const state = [{ ...drafted(FIRST_SLOT_ID), draft: { phase: "drafting" as const, restore: null } }];
    const next = slotsReducer(state, { type: "edit", id: FIRST_SLOT_ID, field: "title", value: "x" });
    expect(next).toBe(state);
  });

  it("guard: unknown id is a no-op", () => {
    const state = [drafted(FIRST_SLOT_ID)];
    const next = slotsReducer(state, { type: "edit", id: "does-not-exist", field: "title", value: "x" });
    expect(next).toBe(state);
  });
});

describe('"generate-started" - Set A', () => {
  it("effect: moves every named empty slot to drafting with restore: null", () => {
    const state = [makeSlot("a", { kind: "default" }), makeSlot("b", { kind: "default" })];
    const next = slotsReducer(state, { type: "generate-started", ids: ["a", "b"] });
    expect(next[0].draft).toEqual({ phase: "drafting", restore: null });
    expect(next[1].draft).toEqual({ phase: "drafting", restore: null });
  });

  it("guard: a drafted slot is byte-identical when not named", () => {
    const drafted1 = drafted("a");
    const state = [drafted1, makeSlot("b", { kind: "default" })];
    const next = slotsReducer(state, { type: "generate-started", ids: ["b"] });
    expect(next[0]).toBe(drafted1);
  });

  it("guard: a drafting slot stays byte-identical even if named again", () => {
    const state = slotsReducer([makeSlot("a", { kind: "default" })], { type: "generate-started", ids: ["a"] });
    const next = slotsReducer(state, { type: "generate-started", ids: ["a"] });
    expect(next).toBe(state);
  });

  it("guard: unknown id ignored", () => {
    const state = [makeSlot("a", { kind: "default" })];
    const next = slotsReducer(state, { type: "generate-started", ids: ["does-not-exist"] });
    expect(next).toBe(state);
  });
});

describe('"regenerate-started" - Set D-fail (flagship chain, part 1)', () => {
  it("effect: on a drafted slot, restore deep-equals the previous draft, and any regenerateArmed flag is cleared", () => {
    const state = [drafted(FIRST_SLOT_ID, { regenerateArmed: true })];
    const next = slotsReducer(state, { type: "regenerate-started", id: FIRST_SLOT_ID });
    expect(next[0].draft).toEqual({ phase: "drafting", restore: DRAFTED });
    expect(next[0].regenerateArmed).toBe(false);
  });

  it("guard: no-op on an empty slot", () => {
    const state = initialSlots(FIRST_SLOT_ID);
    const next = slotsReducer(state, { type: "regenerate-started", id: FIRST_SLOT_ID });
    expect(next).toBe(state);
  });

  it("guard: unknown id is a no-op", () => {
    const state = [drafted(FIRST_SLOT_ID)];
    const next = slotsReducer(state, { type: "regenerate-started", id: "does-not-exist" });
    expect(next).toBe(state);
  });
});

describe('"arm-regenerate" / "cancel-regenerate" - Set E (C1\'s relocated obligation)', () => {
  it("effect: arm-regenerate on a drafted slot sets regenerateArmed: true", () => {
    const state = [drafted(FIRST_SLOT_ID)];
    const next = slotsReducer(state, { type: "arm-regenerate", id: FIRST_SLOT_ID });
    expect(next[0].regenerateArmed).toBe(true);
    // Sabotage-checked per the relocated obligation: removing the
    // `regenerateArmed: true` write (returning `slot` unchanged instead) in
    // the real source turns THIS assertion red - not the no-op guard below,
    // which a never-writing reducer would satisfy trivially. Restoring the
    // write turns it green again.
  });

  it("effect: cancel-regenerate clears it", () => {
    const state = [drafted(FIRST_SLOT_ID, { regenerateArmed: true })];
    const next = slotsReducer(state, { type: "cancel-regenerate", id: FIRST_SLOT_ID });
    expect(next[0].regenerateArmed).toBe(false);
  });

  it("guard: arm-regenerate is a no-op on an empty slot", () => {
    const state = initialSlots(FIRST_SLOT_ID);
    const next = slotsReducer(state, { type: "arm-regenerate", id: FIRST_SLOT_ID });
    expect(next).toBe(state);
  });

  it("guard: arm-regenerate is a no-op on a drafting slot", () => {
    const state = [{ ...drafted(FIRST_SLOT_ID), draft: { phase: "drafting" as const, restore: null } }];
    const next = slotsReducer(state, { type: "arm-regenerate", id: FIRST_SLOT_ID });
    expect(next).toBe(state);
  });

  it("guard: unknown id is a no-op for both actions", () => {
    const state = [drafted(FIRST_SLOT_ID)];
    expect(slotsReducer(state, { type: "arm-regenerate", id: "does-not-exist" })).toBe(state);
    expect(slotsReducer(state, { type: "cancel-regenerate", id: "does-not-exist" })).toBe(state);
  });
});

describe('"result" - Set D-succ / Set D-fail (flagship chain, part 2)', () => {
  it("Set D-succ effect: success yields drafted with builtFrom deep-equal, and clears postArmedFor, postedTo, postError, copyError, posting", () => {
    const state = [
      {
        ...makeSlot(FIRST_SLOT_ID, { kind: "default" }),
        draft: { phase: "drafting" as const, restore: null },
        postArmedFor: "sig",
        postedTo: "Old Course",
        postError: "boom",
        copyError: "oops",
        posting: true,
      },
    ];
    const next = slotsReducer(state, { type: "result", id: FIRST_SLOT_ID, result: DRAFTED });
    expect(next[0].draft).toEqual({ phase: "drafted", draft: DRAFTED, error: null });
    expect(next[0].postArmedFor).toBeNull();
    expect(next[0].postedTo).toBeNull();
    expect(next[0].postError).toBeNull();
    expect(next[0].copyError).toBeNull();
    expect(next[0].posting).toBe(false);
  });

  it("Set D-fail: the full chain regenerate-started -> result{error} returns the original draft byte-identical with the error attached", () => {
    const original = [drafted(FIRST_SLOT_ID)];
    const afterRegen = slotsReducer(original, { type: "regenerate-started", id: FIRST_SLOT_ID });
    const afterFail = slotsReducer(afterRegen, { type: "result", id: FIRST_SLOT_ID, result: { error: "network down" } });
    expect(afterFail[0].draft).toEqual({ phase: "drafted", draft: DRAFTED, error: "network down" });
    expect((afterFail[0].draft as { draft: Drafted }).draft).toBe(DRAFTED);
  });

  it("Set D-fail: result{error} with restore === null yields phase empty with the error", () => {
    const state = slotsReducer([makeSlot(FIRST_SLOT_ID, { kind: "default" })], { type: "generate-started", ids: [FIRST_SLOT_ID] });
    const next = slotsReducer(state, { type: "result", id: FIRST_SLOT_ID, result: { error: "boom" } });
    expect(next[0].draft).toEqual({ phase: "empty", error: "boom" });
  });

  it("Set D-fail: a rejection-arm result{error} exits drafting exactly as the action-error path does", () => {
    const state = slotsReducer([makeSlot(FIRST_SLOT_ID, { kind: "default" })], { type: "generate-started", ids: [FIRST_SLOT_ID] });
    const rejected = slotsReducer(state, {
      type: "result",
      id: FIRST_SLOT_ID,
      result: { error: "Could not reach the server - nothing was drafted." },
    });
    expect(rejected[0].draft).toEqual({ phase: "empty", error: "Could not reach the server - nothing was drafted." });
  });

  it("guard: unknown id is a no-op", () => {
    const state = [drafted(FIRST_SLOT_ID)];
    const next = slotsReducer(state, { type: "result", id: "does-not-exist", result: DRAFTED });
    expect(next).toBe(state);
  });
});

describe('"arm-post" / "cancel-post"', () => {
  it("effect: arm-post stores the signature", () => {
    const state = [drafted(FIRST_SLOT_ID)];
    const next = slotsReducer(state, { type: "arm-post", id: FIRST_SLOT_ID, signature: "sig-1" });
    expect(next[0].postArmedFor).toBe("sig-1");
  });

  it("effect: cancel-post clears it", () => {
    const state = [drafted(FIRST_SLOT_ID, { postArmedFor: "sig-1" })];
    const next = slotsReducer(state, { type: "cancel-post", id: FIRST_SLOT_ID });
    expect(next[0].postArmedFor).toBeNull();
  });

  it("guard: unknown id is a no-op for both actions", () => {
    const state = [drafted(FIRST_SLOT_ID)];
    expect(slotsReducer(state, { type: "arm-post", id: "does-not-exist", signature: "s" })).toBe(state);
    expect(slotsReducer(state, { type: "cancel-post", id: "does-not-exist" })).toBe(state);
  });
});

describe('"posting"', () => {
  it("effect: sets posting true and clears postError", () => {
    const state = [drafted(FIRST_SLOT_ID, { postError: "old error" })];
    const next = slotsReducer(state, { type: "posting", id: FIRST_SLOT_ID });
    expect(next[0].posting).toBe(true);
    expect(next[0].postError).toBeNull();
  });

  it("guard: unknown id is a no-op", () => {
    const state = [drafted(FIRST_SLOT_ID)];
    const next = slotsReducer(state, { type: "posting", id: "does-not-exist" });
    expect(next).toBe(state);
  });
});

describe('"post-result"', () => {
  it("effect: ok sets postedTo and clears postArmedFor", () => {
    const state = [drafted(FIRST_SLOT_ID, { posting: true, postArmedFor: "sig" })];
    const next = slotsReducer(state, { type: "post-result", id: FIRST_SLOT_ID, result: { course: "CS 101" } });
    expect(next[0].posting).toBe(false);
    expect(next[0].postedTo).toBe("CS 101");
    expect(next[0].postArmedFor).toBeNull();
  });

  it("effect: error sets postError and clears posting", () => {
    const state = [drafted(FIRST_SLOT_ID, { posting: true })];
    const next = slotsReducer(state, { type: "post-result", id: FIRST_SLOT_ID, result: { error: "Canvas refused it" } });
    expect(next[0].posting).toBe(false);
    expect(next[0].postError).toBe("Canvas refused it");
  });

  it("guard: unknown id is a no-op", () => {
    const state = [drafted(FIRST_SLOT_ID)];
    const next = slotsReducer(state, { type: "post-result", id: "does-not-exist", result: { course: "CS 101" } });
    expect(next).toBe(state);
  });
});

describe('"copy-result"', () => {
  it("effect: writes copyError (null on success)", () => {
    const state = [drafted(FIRST_SLOT_ID, { copyError: "old" })];
    const next = slotsReducer(state, { type: "copy-result", id: FIRST_SLOT_ID, error: null });
    expect(next[0].copyError).toBeNull();
  });

  it("effect: writes a non-null copyError on failure", () => {
    const state = [drafted(FIRST_SLOT_ID)];
    const next = slotsReducer(state, { type: "copy-result", id: FIRST_SLOT_ID, error: "clipboard unavailable" });
    expect(next[0].copyError).toBe("clipboard unavailable");
  });

  it("guard: unknown id is a no-op", () => {
    const state = [drafted(FIRST_SLOT_ID)];
    const next = slotsReducer(state, { type: "copy-result", id: "does-not-exist", error: "x" });
    expect(next).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// Set G (identity half) - every action returns the SAME object identity for
// every slot it does not change.
// ---------------------------------------------------------------------------

describe("identity preservation - Set G", () => {
  it("an action targeting one slot leaves every OTHER slot byte-identical", () => {
    const untouched = drafted("b");
    const state = [drafted("a"), untouched];
    const next = slotsReducer(state, { type: "arm-post", id: "a", signature: "sig" });
    expect(next[1]).toBe(untouched);
  });

  it("the whole array reference is preserved when an action is a full no-op", () => {
    const state = [drafted(FIRST_SLOT_ID)];
    const next = slotsReducer(state, { type: "edit", id: "does-not-exist", field: "title", value: "x" });
    expect(next).toBe(state);
  });
});

describe("escapeForCopyTitle", () => {
  it("escapes & < > and the double quote - the quote is the one that closes an href=\"...\" attribute breakout (markdown.ts:20-26's own documented hole)", () => {
    expect(escapeForCopyTitle(`Week 3 & "kickoff" <script> tag`)).toBe(
      "Week 3 &amp; &quot;kickoff&quot; &lt;script&gt; tag"
    );
  });

  it("leaves a plain title untouched", () => {
    expect(escapeForCopyTitle("Week 3 kickoff")).toBe("Week 3 kickoff");
  });
});

// ---------------------------------------------------------------------------
// G1 - savedFormatsStatusText, EXEMPLAR_FETCH_TIMEOUT_MS.
// ---------------------------------------------------------------------------

describe("EXEMPLAR_FETCH_TIMEOUT_MS", () => {
  it("is 20 seconds - short of the ~39s worst case in supabase/server.ts, past the common 8s-timeout-then-1s-backoff-retry case", () => {
    expect(EXEMPLAR_FETCH_TIMEOUT_MS).toBe(20_000);
  });
});

describe("savedFormatsStatusText - G1", () => {
  it("returns null only for loaded with a non-empty list", () => {
    expect(savedFormatsStatusText("loaded", 3)).toBeNull();
    for (const state of ALL_SAVED_FORMATS_STATES) {
      if (state === "loaded") continue;
      expect(savedFormatsStatusText(state, 3), `state=${state}`).not.toBeNull();
    }
    expect(savedFormatsStatusText("loaded", 0)).not.toBeNull();
  });

  it("keeps the two existing strings byte-for-byte", () => {
    expect(savedFormatsStatusText("loading", 0)).toBe("Loading your saved formats...");
    expect(savedFormatsStatusText("failed", 0)).toBe("Could not load your saved formats.");
  });

  it("the timedout string never claims the fetch failed, was cancelled, was aborted, or stopped running", () => {
    const text = savedFormatsStatusText("timedout", 0);
    expect(text).not.toBeNull();
    const lower = (text ?? "").toLowerCase();
    expect(lower).not.toMatch(/fail/);
    expect(lower).not.toMatch(/cancel/);
    expect(lower).not.toMatch(/abort/);
    expect(lower).not.toMatch(/stopped/);
  });

  it("no branch names a button - control-free", () => {
    for (const state of ALL_SAVED_FORMATS_STATES) {
      const text = savedFormatsStatusText(state, 0);
      if (text === null) continue;
      const lower = text.toLowerCase();
      expect(lower, `state=${state}`).not.toMatch(/retry/);
      expect(lower, `state=${state}`).not.toMatch(/generate/);
    }
  });

  it("table: every branch's non-null text is pairwise distinct from every other branch's, including loaded-empty vs timedout specifically", () => {
    // Computed, not hand-listed: one representative case per
    // SavedFormatsState member (savedCount 0, the only count that can yield
    // non-null text for "loaded"), then every pair of distinct states is
    // asserted to produce distinct text. A fifth SavedFormatsState member
    // added to ALL_SAVED_FORMATS_STATES above is automatically included
    // here, so a future added branch stays covered without editing this
    // test.
    const cases = ALL_SAVED_FORMATS_STATES.map((state) => ({ state, text: savedFormatsStatusText(state, 0) })).filter(
      (c): c is { state: SavedFormatsState; text: string } => c.text !== null
    );
    // Sanity: this table must actually contain both "loaded" (loaded-empty)
    // and "timedout" - otherwise the pairwise loop below would vacuously
    // pass without ever comparing the pair this item exists to separate.
    expect(cases.some((c) => c.state === "loaded")).toBe(true);
    expect(cases.some((c) => c.state === "timedout")).toBe(true);
    for (let i = 0; i < cases.length; i++) {
      for (let j = i + 1; j < cases.length; j++) {
        expect(cases[i].text, `${cases[i].state} vs ${cases[j].state}`).not.toBe(cases[j].text);
      }
    }
  });

  it("loaded-empty and timedout are distinct specifically", () => {
    expect(savedFormatsStatusText("loaded", 0)).not.toBe(savedFormatsStatusText("timedout", 0));
  });
});

describe("SlotsAction union has exactly 14 members (C1)", () => {
  it("compile-time exhaustiveness: a Record keyed by every union member fails TypeScript compilation (not merely this test) if a member is added without a matching key here - an array typed SlotsAction['type'][] only checks each element IS a member, never that every member is present, so it cannot catch an addition", () => {
    // If a 15th SlotsAction member is ever added, tsc reports this object
    // literal is missing that property - the failure is `npx tsc --noEmit`,
    // not a red assertion below, which is why the runtime check is only the
    // key COUNT, not membership.
    const memberTypes: Record<SlotsAction["type"], true> = {
      add: true,
      remove: true,
      choose: true,
      edit: true,
      "generate-started": true,
      "regenerate-started": true,
      result: true,
      "arm-post": true,
      "cancel-post": true,
      "arm-regenerate": true,
      "cancel-regenerate": true,
      posting: true,
      "post-result": true,
      "copy-result": true,
    };
    expect(Object.keys(memberTypes)).toHaveLength(14);
  });
});
