// Unit tests for the pure discussion-capture module - the reply-table side:
// mergeCapturedPosts, sortReplyRows, swapAdjacentRows.
//
// The serialization coverage (AC22: serializeReplyTable /
// deserializeReplyTable) that used to live in this file moved to
// discussion-serialization.test.ts as part of the serialization-block
// extraction (REGRESSION 372's Limits) - see that file for the AC22 tests
// and the frozen serialization oracle.
//
// Sort-filter closure re-review SHOULD-1: this file used to test a
// `moveRow` export, a thin "which two ids are physically adjacent" wrapper
// around the actual swap. `moveRow` was deleted (zero production callers -
// every real caller goes through `discussion-table-view.ts`'s
// `moveVisibleRow` instead), so its coverage below now calls
// `swapAdjacentRows` directly with the two ids `moveRow` used to resolve
// internally. The two tests that existed purely to check `moveRow`'s own
// physical-index boundary math (index -1 / index length) are gone with it -
// that math no longer runs anywhere in production; `moveVisibleRow`'s
// boundary handling against the VISIBLE id list is covered in
// discussion-table-view.test.ts.
//
// This file was split out of a single discussion-capture.test.ts to stay
// under this directory's line-count ceiling (see
// recording-split.structure.test.ts). See also:
//   - discussion-capture.test.ts (frame/capture constants and functions,
//     plus the loop-policy predicates)
//   - discussion-capture.dedupe.test.ts (normalizeForMatch / authorsMatch /
//     postSimilarityDistance / isSamePost, including the frozen dedupe
//     oracle)
//
// Every test here is sabotage-checked - see the report handed back to the
// dispatcher for the exact sabotages run.

import { describe, it, expect } from "vitest";
import { MAX_TABLE_ROWS, mergeCapturedPosts, sortReplyRows, swapAdjacentRows, type ReplyRow } from "./discussion-capture";

// BASE_TEXT / TRUNCATED_TEXT are duplicated from discussion-capture.dedupe.test.ts
// rather than imported, per this repo's rule against importing from another
// *.test.ts file (that re-runs its describe blocks in the importing file).

const BASE_TEXT =
  "I really appreciated how the reading connected utilitarian calculus to the trolley problem, but I " +
  "think it glosses over how hard it is to actually quantify happiness across different people in " +
  "practice, which feels like the weakest link in the argument.";

// First 20 words of BASE_TEXT, used for the truncation-style perturbations.
const TRUNCATED_TEXT =
  "I really appreciated how the reading connected utilitarian calculus to the trolley problem, but I think it glosses over";

// ---------------------------------------------------------------------------
// AC12 / AC13 / AC54: mergeCapturedPosts
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<ReplyRow>): ReplyRow {
  return {
    id: "disc-1-0",
    author: "Maria Alvarez",
    post: BASE_TEXT,
    reply: "",
    userEdited: false,
    state: "pending",
    error: null,
    firstSeenAt: 1000,
    order: 0,
    ...overrides,
  };
}

describe("mergeCapturedPosts (AC12 / AC13)", () => {
  it("adds a genuinely new post as a new pending row and reports its id in addedIds", () => {
    const { rows, addedIds } = mergeCapturedPosts([], [{ author: "Maria Alvarez", text: BASE_TEXT }], 5000);
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("pending");
    expect(rows[0].reply).toBe("");
    expect(rows[0].userEdited).toBe(false);
    expect(rows[0].firstSeenAt).toBe(5000);
    expect(addedIds).toEqual([rows[0].id]);
  });

  it("does not mutate the input rows array or its row objects", () => {
    const original = [makeRow({ id: "row-a" })];
    const frozenCopy = JSON.parse(JSON.stringify(original));
    mergeCapturedPosts(original, [{ author: "Someone Else", text: "totally unrelated content here" }], 9999);
    expect(original).toEqual(frozenCopy);
  });

  it("extends an existing row's post text when the incoming read is longer, without resetting reply/state/userEdited/order/firstSeenAt", () => {
    const existing = makeRow({ id: "row-a", post: TRUNCATED_TEXT, reply: "My drafted reply", state: "ready", userEdited: true, order: 3, firstSeenAt: 111 });
    const { rows, addedIds } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: BASE_TEXT }], 5000);
    expect(rows).toHaveLength(1);
    expect(rows[0].post).toBe(BASE_TEXT);
    expect(rows[0].reply).toBe("My drafted reply");
    expect(rows[0].state).toBe("ready");
    expect(rows[0].userEdited).toBe(true);
    expect(rows[0].order).toBe(3);
    expect(rows[0].firstSeenAt).toBe(111);
    expect(addedIds).toEqual([]);
  });

  it("does NOT shorten an existing row's post when the incoming read is shorter than what is stored", () => {
    const existing = makeRow({ id: "row-a", post: BASE_TEXT });
    const { rows } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: TRUNCATED_TEXT }], 5000);
    expect(rows[0].post).toBe(BASE_TEXT);
  });

  it("fills postedAt on an existing row that lacked one", () => {
    const existing = makeRow({ id: "row-a", post: TRUNCATED_TEXT });
    const { rows } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: BASE_TEXT, postedAt: "Mar 12 at 9:04 PM" }], 5000);
    expect(rows[0].postedAt).toBe("Mar 12 at 9:04 PM");
  });

  it("AC54: when two incoming entries in the same batch match and have equal-length text, the first wins", () => {
    const { rows, addedIds } = mergeCapturedPosts(
      [],
      [
        { author: "Maria Alvarez", text: BASE_TEXT },
        { author: "Maria Alvarez", text: BASE_TEXT }, // identical length, arrives second
      ],
      5000
    );
    expect(rows).toHaveLength(1);
    expect(addedIds).toHaveLength(1);
  });

  it("matches incoming posts against each other within one batch, collapsing duplicates to one row", () => {
    const { rows } = mergeCapturedPosts(
      [],
      [
        { author: "Maria Alvarez", text: TRUNCATED_TEXT },
        { author: "Maria Alvarez", text: BASE_TEXT }, // same post, fuller read, arrives second
      ],
      5000
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].post).toBe(BASE_TEXT);
  });

  it("preserves the ordering of existing rows and appends new ones", () => {
    const rowA = makeRow({ id: "a", author: "Alice One", post: "alpha content here about topic one for testing", order: 0 });
    const rowB = makeRow({ id: "b", author: "Bob Two", post: "beta content here about topic two for testing", order: 1 });
    const { rows } = mergeCapturedPosts([rowA, rowB], [{ author: "Carol Three", text: "gamma content here about topic three testing" }], 5000);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", rows[2].id]);
  });

  it("AC23b: refuses to add a new row once the table is at MAX_TABLE_ROWS, but still allows an update merge", () => {
    const rows: ReplyRow[] = Array.from({ length: MAX_TABLE_ROWS }, (_, i) =>
      makeRow({ id: `row-${i}`, author: `Author ${i}`, post: `unique content number ${i} about topic ${i}`, order: i })
    );
    const { rows: afterAdd, addedIds, capped } = mergeCapturedPosts(rows, [{ author: "New Author", text: "a brand new post nobody has seen yet in this table" }], 5000);
    expect(afterAdd).toHaveLength(MAX_TABLE_ROWS);
    expect(addedIds).toEqual([]);
    // BL5: a refused new-row post at the ceiling must be reported, since
    // comparing afterAdd.length (already capped at MAX_TABLE_ROWS) against
    // the ceiling after the fact can never detect this.
    expect(capped).toBe(true);

    // An update to an existing row (matches row-0) is still allowed through,
    // and is NOT reported as capped - it never tried to grow the table.
    const { rows: afterUpdate, capped: cappedOnUpdate } = mergeCapturedPosts(rows, [{ author: "Author 0", text: rows[0].post + " with quite a bit more detail added on now" }], 5000);
    expect(afterUpdate).toHaveLength(MAX_TABLE_ROWS);
    expect(afterUpdate[0].post.length).toBeGreaterThan(rows[0].post.length);
    expect(cappedOnUpdate).toBe(false);
  });

  it("BL5: is NOT capped when the table has room", () => {
    const { capped } = mergeCapturedPosts([], [{ author: "Maria Alvarez", text: BASE_TEXT }], 5000);
    expect(capped).toBe(false);
  });

  it("SABOTAGE CHECK (f): documents that comparing output length against MAX_TABLE_ROWS after the fact (the original, dead detector) would find capped always false here, unlike the in-band flag above", () => {
    const rows: ReplyRow[] = Array.from({ length: MAX_TABLE_ROWS }, (_, i) =>
      makeRow({ id: `row-${i}`, author: `Author ${i}`, post: `unique content number ${i} about topic ${i}`, order: i })
    );
    const { rows: afterAdd, capped } = mergeCapturedPosts(rows, [{ author: "New Author", text: "a brand new post nobody has seen yet in this table" }], 5000);
    // The dead detector's own precondition, reproduced: output length is
    // never over the ceiling, so `output.length - MAX_TABLE_ROWS > 0` is
    // always false - the real flag disagrees with it.
    expect(afterAdd.length - MAX_TABLE_ROWS).toBeLessThanOrEqual(0);
    expect(capped).toBe(true);
  });

  it("N2: two separate calls sharing the same `now` never collide on minted id - the counter is module-scoped, not local to one call", () => {
    const { rows: firstRows } = mergeCapturedPosts([], [{ author: "Alice One", text: "unique content for the first call about a topic" }], 5000);
    const { rows: secondRows } = mergeCapturedPosts([], [{ author: "Bob Two", text: "unique content for the second call about a topic" }], 5000);
    expect(firstRows[0].id).not.toBe(secondRows[0].id);
  });

  it("SABOTAGE CHECK (c): documents that resetting `reply` on an update-merge would fail the extend-without-reset test above", () => {
    const existing = makeRow({ id: "row-a", post: TRUNCATED_TEXT, reply: "Hand-written reply", userEdited: true });
    const { rows } = mergeCapturedPosts([existing], [{ author: "Maria Alvarez", text: BASE_TEXT }], 5000);
    expect(rows[0].reply).toBe("Hand-written reply");
  });
});

// ---------------------------------------------------------------------------
// AC14: sortReplyRows
// ---------------------------------------------------------------------------

describe("sortReplyRows (AC14)", () => {
  const rowA = makeRow({ id: "a", author: "alvarez", firstSeenAt: 300, order: 2 });
  const rowB = makeRow({ id: "b", author: "Chen", firstSeenAt: 100, order: 0 });
  const rowC = makeRow({ id: "c", author: "Baxter", firstSeenAt: 200, order: 1 });
  const rows = [rowA, rowB, rowC];

  it("captured-asc orders by firstSeenAt ascending", () => {
    expect(sortReplyRows(rows, "captured-asc").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("captured-desc orders by firstSeenAt descending", () => {
    expect(sortReplyRows(rows, "captured-desc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("name-asc uses base-sensitivity localeCompare so case does not straddle capitals", () => {
    expect(sortReplyRows(rows, "name-asc").map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("name-desc reverses name-asc", () => {
    expect(sortReplyRows(rows, "name-desc").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("custom sorts by order ascending", () => {
    expect(sortReplyRows(rows, "custom").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const copy = rows.slice();
    sortReplyRows(rows, "captured-asc");
    expect(rows).toEqual(copy);
  });
});

// ---------------------------------------------------------------------------
// AC53: swapAdjacentRows
// ---------------------------------------------------------------------------

// Sort-filter closure re-review SHOULD-1: this describe block used to test
// `moveRow`, a deleted physical-index wrapper around this same swap (see
// swapAdjacentRows's own header comment in discussion-capture.ts). Every
// call below passes the two ids directly - the exact pair `moveRow` used to
// resolve internally from an id + "up"/"down" direction - so the coverage
// of the swap itself (order rewrite on leaving a non-custom sort, identity
// preservation, the missing-id no-op) survives unchanged. The two tests
// that only checked `moveRow`'s own physical-adjacency boundary math
// (index -1 / index length, before it ever called into the shared swap) are
// gone with it - that math has no production caller any more, since every
// real caller resolves adjacency against the VISIBLE id list via
// `discussion-table-view.ts`'s `moveVisibleRow` instead, whose own boundary
// handling is covered in discussion-table-view.test.ts.
describe("swapAdjacentRows (AC53)", () => {
  it("swaps two adjacent rows and switches sort to custom", () => {
    const rows = [makeRow({ id: "a", order: 0 }), makeRow({ id: "b", order: 1 }), makeRow({ id: "c", order: 2 })];
    const result = swapAdjacentRows(rows, "custom", "b", "a");
    expect(result.sort).toBe("custom");
    expect(result.atBoundary).toBe(false);
    expect(result.rows.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("rewrites order to displayed index before swapping when leaving a non-custom sort", () => {
    // Displayed (name-asc) order is a, b, c but the stored `order` values are
    // stale capture-time values that do not reflect that. AC53 requires the
    // swap to operate on what is ON SCREEN.
    const displayed = [makeRow({ id: "a", author: "Alvarez", order: 50 }), makeRow({ id: "b", author: "Baxter", order: 10 }), makeRow({ id: "c", author: "Chen", order: 90 })];
    const result = swapAdjacentRows(displayed, "name-asc", "b", "a");
    expect(result.sort).toBe("custom");
    expect(result.rows.map((r) => r.id)).toEqual(["b", "a", "c"]);
    // custom order re-sort of the result reproduces exactly this sequence.
    expect(sortReplyRows(result.rows, "custom").map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("returns the rows unchanged (by identity of the id sequence) when either id is not found", () => {
    const rows = [makeRow({ id: "a", order: 0 }), makeRow({ id: "b", order: 1 })];
    const result = swapAdjacentRows(rows, "custom", "missing", "a");
    expect(result.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(result.atBoundary).toBe(false);
  });

  it("BL4/AC40: preserves object identity for a row NOT involved in the swap - this is what lets Set D's React.memo skip re-rendering it", () => {
    const untouched = makeRow({ id: "c", order: 2 });
    const rows = [makeRow({ id: "a", order: 0 }), makeRow({ id: "b", order: 1 }), untouched];
    const result = swapAdjacentRows(rows, "custom", "b", "a");
    const resultUntouched = result.rows.find((r) => r.id === "c");
    expect(resultUntouched).toBe(untouched);
  });

  it("SABOTAGE CHECK (g): documents that unconditionally cloning every row (the previously-shipped, untested duplicate's behaviour) would fail the identity check above", () => {
    // This reproduces the exact divergence BL4 found: useReplyRows.ts's own
    // old inline moveRow did `displayed.map((r, i) => ({ ...r, order: i }))`
    // - a new object for every row, always - instead of this tested
    // function's `row.order === i ? row : { ...row, order: i }`. Verified
    // by sabotage (temporarily reverting swapAdjacentRows to the
    // clone-everything shape) - see this pass's own sabotage log.
    const untouched = makeRow({ id: "c", order: 2 });
    const rows = [makeRow({ id: "a", order: 0 }), makeRow({ id: "b", order: 1 }), untouched];
    const result = swapAdjacentRows(rows, "custom", "b", "a");
    expect(result.rows.find((r) => r.id === "c")).toBe(untouched);
  });
});
