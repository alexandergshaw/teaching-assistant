// Unit tests for the pure half of discussion-reply-flags.ts (D1/D9,
// docs/aesthetics-pass-acceptance-criteria.md section 4b). The hook itself is
// not rendered here - this repo's vitest is node-env and renders no hook, per
// that file's own header - so every assertion below targets the plain
// functions the hook is built from.
//
// This file imports no helper from any sibling *.test.ts and duplicates any
// fixture it needs, per this repo's own rule against re-running a sibling's
// describe blocks.
//
// Sabotage-checked (each mutation applied to the source, confirmed red,
// confirmed the mutation was really in the file, then reverted and confirmed
// green):
//   1. setHandledAtFlag(state, id, null) returning a NEW object even when the
//      id had no entry (breaks the no-op reference-identity guarantee).
//   2. pruneReplyFlagsState keeping a stale id instead of dropping it.
//   3. coerceReplyFlagsState accepting a non-finite number into handledAt.

import { describe, it, expect } from "vitest";
import {
  EMPTY_REPLY_FLAGS,
  coerceReplyFlagsState,
  parseReplyFlagsState,
  serializeReplyFlagsState,
  setHandledAtFlag,
  setSkippedFlag,
  pruneReplyFlagsState,
  type ReplyFlagsState,
} from "./discussion-reply-flags";

describe("coerceReplyFlagsState", () => {
  it("never throws on garbage input", () => {
    expect(coerceReplyFlagsState(null)).toEqual(EMPTY_REPLY_FLAGS);
    expect(coerceReplyFlagsState(undefined)).toEqual(EMPTY_REPLY_FLAGS);
    expect(coerceReplyFlagsState("a string")).toEqual(EMPTY_REPLY_FLAGS);
    expect(coerceReplyFlagsState(42)).toEqual(EMPTY_REPLY_FLAGS);
    expect(coerceReplyFlagsState([])).toEqual(EMPTY_REPLY_FLAGS);
  });

  it("keeps only finite-number handledAt entries and drops the rest", () => {
    const result = coerceReplyFlagsState({
      handledAt: { "disc-1": 1000, "disc-2": "not a number", "disc-3": Number.POSITIVE_INFINITY, "disc-4": NaN },
    });
    expect(result.handledAt).toEqual({ "disc-1": 1000 });
  });

  it("keeps only `true` skipped entries and drops the rest", () => {
    const result = coerceReplyFlagsState({
      skipped: { "disc-1": true, "disc-2": false, "disc-3": "yes", "disc-4": 1 },
    });
    expect(result.skipped).toEqual({ "disc-1": true });
  });

  it("parseReplyFlagsState never throws on malformed JSON", () => {
    expect(parseReplyFlagsState(null)).toEqual(EMPTY_REPLY_FLAGS);
    expect(parseReplyFlagsState("{not json")).toEqual(EMPTY_REPLY_FLAGS);
    expect(parseReplyFlagsState('"a string"')).toEqual(EMPTY_REPLY_FLAGS);
  });

  it("round-trips through serialize/parse", () => {
    const state: ReplyFlagsState = { handledAt: { "disc-1": 555 }, skipped: { "disc-2": true } };
    expect(parseReplyFlagsState(serializeReplyFlagsState(state))).toEqual(state);
  });
});

describe("setHandledAtFlag", () => {
  it("sets a new handledAt value", () => {
    const next = setHandledAtFlag(EMPTY_REPLY_FLAGS, "disc-1", 1234);
    expect(next.handledAt).toEqual({ "disc-1": 1234 });
  });

  it("clears an existing value when `at` is null", () => {
    const state: ReplyFlagsState = { handledAt: { "disc-1": 1234 }, skipped: {} };
    const next = setHandledAtFlag(state, "disc-1", null);
    expect(next.handledAt).toEqual({});
  });

  it("is a no-op (SAME object reference) when clearing an id that was never set - sabotage target 1", () => {
    const next = setHandledAtFlag(EMPTY_REPLY_FLAGS, "disc-1", null);
    expect(next).toBe(EMPTY_REPLY_FLAGS);
  });

  it("is a no-op (SAME object reference) when setting the identical value again", () => {
    const state: ReplyFlagsState = { handledAt: { "disc-1": 1234 }, skipped: {} };
    const next = setHandledAtFlag(state, "disc-1", 1234);
    expect(next).toBe(state);
  });

  it("does not mutate the input state", () => {
    const state: ReplyFlagsState = { handledAt: { "disc-1": 1 }, skipped: {} };
    const frozen = JSON.parse(JSON.stringify(state));
    setHandledAtFlag(state, "disc-2", 999);
    expect(state).toEqual(frozen);
  });
});

describe("setSkippedFlag", () => {
  it("sets and clears skipped", () => {
    const set = setSkippedFlag(EMPTY_REPLY_FLAGS, "disc-1", true);
    expect(set.skipped).toEqual({ "disc-1": true });
    const cleared = setSkippedFlag(set, "disc-1", false);
    expect(cleared.skipped).toEqual({});
  });

  it("is a no-op (SAME object reference) when the value does not change", () => {
    const next = setSkippedFlag(EMPTY_REPLY_FLAGS, "disc-1", false);
    expect(next).toBe(EMPTY_REPLY_FLAGS);
  });
});

describe("pruneReplyFlagsState", () => {
  it("drops entries for ids no longer in the live set - sabotage target 2", () => {
    const state: ReplyFlagsState = {
      handledAt: { "disc-1": 1, "disc-2": 2 },
      skipped: { "disc-3": true, "disc-4": true },
    };
    const next = pruneReplyFlagsState(state, new Set(["disc-1", "disc-4"]));
    expect(next.handledAt).toEqual({ "disc-1": 1 });
    expect(next.skipped).toEqual({ "disc-4": true });
  });

  it("returns the SAME object reference when nothing is stale", () => {
    const state: ReplyFlagsState = { handledAt: { "disc-1": 1 }, skipped: { "disc-2": true } };
    const next = pruneReplyFlagsState(state, new Set(["disc-1", "disc-2", "disc-3"]));
    expect(next).toBe(state);
  });

  it("prunes to fully empty when no ids are live", () => {
    const state: ReplyFlagsState = { handledAt: { "disc-1": 1 }, skipped: { "disc-2": true } };
    const next = pruneReplyFlagsState(state, new Set());
    expect(next).toEqual(EMPTY_REPLY_FLAGS);
    expect(next).not.toBe(state);
  });
});
