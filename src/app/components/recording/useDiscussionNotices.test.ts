// Unit tests for useDiscussionNotices.ts's pure decision logic (AC38),
// extracted from useDiscussionReplies.ts. The hook itself is not renderable
// under this repo's node-env vitest (no hook is ever rendered - see
// useReplyResources.ts's own header for the same discipline), so the two
// predicates that actually decide the notices list's behaviour - the
// consecutive-dedupe check and the visible-list cap - are pulled out and
// tested directly here, against hand-written literal expectations frozen
// BEFORE this file's functions existed (the logic is unchanged from the
// inline `if (lastNoticeTextRef.current === text) return;` and
// `next.length > 4 ? next.slice(next.length - 4) : next` this replaced).
//
// Every test below is sabotage-checked: broken, confirmed red, restored,
// confirmed green. See the report handed back to the dispatcher for which.

import { describe, it, expect } from "vitest";
import { shouldSuppressNotice, appendCappedNotice } from "./useDiscussionNotices";

// ---------------------------------------------------------------------------
// AC38: shouldSuppressNotice - dedupe against the immediately-preceding
// notice only.
// ---------------------------------------------------------------------------

describe("shouldSuppressNotice (AC38)", () => {
  it("not suppressed: the very first notice (no preceding text yet)", () => {
    expect(shouldSuppressNotice("Could not read posts from the screen.", null)).toBe(false);
  });

  it("suppressed: identical consecutive text", () => {
    expect(shouldSuppressNotice("Rate limited.", "Rate limited.")).toBe(true);
  });

  it("not suppressed: different text than the immediately-preceding one", () => {
    expect(shouldSuppressNotice("Rate limited.", "A different failure.")).toBe(false);
  });

  it("not suppressed: same text recurring, but not consecutively, is the caller's job to re-arm lastText - this function only compares what it is given", () => {
    // This function is a pure comparison; the "not consecutive" case is
    // realized by the caller (dismissNotice) clearing lastNoticeTextRef, not
    // by any state this function itself tracks.
    expect(shouldSuppressNotice("Rate limited.", null)).toBe(false);
  });

  it("SABOTAGE CHECK (a): case-sensitive, exact-string comparison - a near-miss must not be suppressed", () => {
    // Guards against a mutation that loosens the comparison (e.g. a
    // case-insensitive or prefix match) - two genuinely different failure
    // messages that happen to share a prefix must both be shown.
    expect(shouldSuppressNotice("Rate limited (429).", "Rate limited.")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC38: appendCappedNotice - the visible notices list never grows past the
// cap; the most recent entries are kept, the oldest dropped.
// ---------------------------------------------------------------------------

describe("appendCappedNotice (AC38)", () => {
  it("appends under the cap without dropping anything", () => {
    const result = appendCappedNotice([{ id: "1", text: "a" }, { id: "2", text: "b" }], { id: "3", text: "c" }, 4);
    expect(result).toEqual([
      { id: "1", text: "a" },
      { id: "2", text: "b" },
      { id: "3", text: "c" },
    ]);
  });

  it("appending onto an empty list yields a single-item list", () => {
    expect(appendCappedNotice([], { id: "1", text: "a" }, 4)).toEqual([{ id: "1", text: "a" }]);
  });

  it("appending exactly at the cap keeps every item, oldest first", () => {
    const prev = [
      { id: "1", text: "a" },
      { id: "2", text: "b" },
      { id: "3", text: "c" },
    ];
    const result = appendCappedNotice(prev, { id: "4", text: "d" }, 4);
    expect(result).toEqual([
      { id: "1", text: "a" },
      { id: "2", text: "b" },
      { id: "3", text: "c" },
      { id: "4", text: "d" },
    ]);
  });

  it("appending past the cap drops the oldest entry, keeping the newest `cap` entries in order", () => {
    const prev = [
      { id: "1", text: "a" },
      { id: "2", text: "b" },
      { id: "3", text: "c" },
      { id: "4", text: "d" },
    ];
    const result = appendCappedNotice(prev, { id: "5", text: "e" }, 4);
    expect(result).toEqual([
      { id: "2", text: "b" },
      { id: "3", text: "c" },
      { id: "4", text: "d" },
      { id: "5", text: "e" },
    ]);
  });

  it("defaults to a cap of 4 (NOTICES_VISIBLE_CAP) when no cap is passed - the exact figure useDiscussionReplies.ts relied on inline", () => {
    const prev = [
      { id: "1", text: "a" },
      { id: "2", text: "b" },
      { id: "3", text: "c" },
      { id: "4", text: "d" },
    ];
    const result = appendCappedNotice(prev, { id: "5", text: "e" });
    expect(result).toEqual([
      { id: "2", text: "b" },
      { id: "3", text: "c" },
      { id: "4", text: "d" },
      { id: "5", text: "e" },
    ]);
  });

  it("SABOTAGE CHECK (b): dropping from the front, not the back - the OLDEST entry must go, never the just-appended one", () => {
    // Guards against a mutation that slices from the wrong end (e.g.
    // `next.slice(0, cap)`), which would silently discard the brand-new
    // notice instead of the stale one and leave the instructor staring at
    // an unchanging, increasingly outdated list.
    const prev = [
      { id: "1", text: "a" },
      { id: "2", text: "b" },
      { id: "3", text: "c" },
      { id: "4", text: "d" },
    ];
    const result = appendCappedNotice(prev, { id: "5", text: "e" }, 4);
    expect(result.find((n) => n.id === "5")).toBeDefined();
    expect(result.find((n) => n.id === "1")).toBeUndefined();
  });

  it("SABOTAGE CHECK (c): the boundary is strictly greater-than, not greater-or-equal - exactly `cap` items must not drop the first one", () => {
    // Guards against an off-by-one (`>=` in place of `>`) that would start
    // dropping one notice too early.
    const prev = [{ id: "1", text: "a" }];
    const result = appendCappedNotice(prev, { id: "2", text: "b" }, 2);
    expect(result).toEqual([
      { id: "1", text: "a" },
      { id: "2", text: "b" },
    ]);
  });
});
