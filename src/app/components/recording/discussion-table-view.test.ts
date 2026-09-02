// Unit tests for the pure discussion-table-view module (sections 2, 4, 5, 7
// of docs/discussion-reply-sort-filter-acceptance-criteria.md - F5, F8, F15).
//
// This file imports no helper from any sibling *.test.ts - that re-runs the
// sibling's describe blocks - and duplicates any fixture it needs, per this
// repo's own rule.
//
// Every behaviour here is sabotage-checked: blank-sorts-first instead of
// last, the by-reference filter fast path returning a copy instead of the
// same array, and moveVisibleRow swapping against the full array instead of
// the visible id list. Each sabotage was applied directly to the source file
// and the affected test(s) were re-run to confirm a FAIL, then reverted -
// never merely reasoned about, per this repo's "verify each sabotage
// actually landed" rule.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  compareNameKey,
  sortReplyRowsForTable,
  filterRowsByQuery,
  moveVisibleRow,
  REPLY_ROW_HAYSTACK,
  copyAllButtonLabel,
  computeStoppedSessionSummary,
  isReplyStatusFilter,
  replyMatchesStatusFilter,
  filterRowsByStatus,
  computeReplyStatusCounts,
  isAnyReplyFilterActive,
  type ReplyStatusFilterRow,
} from "./discussion-table-view";
import { swapAdjacentRows, type ReplyRow, type ReplySort } from "./discussion-capture";

function makeRow(overrides: Partial<ReplyRow>): ReplyRow {
  return {
    id: "disc-1-0",
    author: "Maria Alvarez",
    post: "A post about the reading.",
    reply: "",
    userEdited: false,
    state: "pending",
    error: null,
    firstSeenAt: 1000,
    order: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// compareNameKey (F5 / F8a): the generic blank-last comparator.
// ---------------------------------------------------------------------------

describe("compareNameKey (F5 / F8a)", () => {
  it("orders two non-blank keys ascending by locale comparison", () => {
    expect(compareNameKey("Adams", "Baker", "asc")).toBeLessThan(0);
    expect(compareNameKey("Baker", "Adams", "asc")).toBeGreaterThan(0);
    expect(compareNameKey("Baker", "Baker", "asc")).toBe(0);
  });

  it("reverses non-blank comparisons for descending", () => {
    expect(compareNameKey("Adams", "Baker", "desc")).toBeGreaterThan(0);
    expect(compareNameKey("Baker", "Adams", "desc")).toBeLessThan(0);
  });

  it("is case-insensitive, matching the existing name sort's sensitivity: base", () => {
    expect(compareNameKey("adams", "ADAMS", "asc")).toBe(0);
  });

  it("sorts a blank key LAST in ascending order", () => {
    expect(compareNameKey("", "Adams", "asc")).toBeGreaterThan(0); // blank after Adams
    expect(compareNameKey("Adams", "", "asc")).toBeLessThan(0); // Adams before blank
  });

  it("sorts a blank key LAST in descending order too - the case a naive reverse-of-ascending gets wrong", () => {
    expect(compareNameKey("", "Adams", "desc")).toBeGreaterThan(0); // blank still after Adams
    expect(compareNameKey("Adams", "", "desc")).toBeLessThan(0); // Adams still before blank
  });

  it("treats two blank keys as equal", () => {
    expect(compareNameKey("", "", "asc")).toBe(0);
    expect(compareNameKey("", "", "desc")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// sortReplyRowsForTable (F5): first/last sorts, blank-last, tie-break,
// identity preservation, and delegation of the five pre-existing modes.
// ---------------------------------------------------------------------------

describe("sortReplyRowsForTable (F5)", () => {
  // Known deriveReplyAuthorName splits (src/lib/person-name.ts), used as
  // fixed fixtures rather than re-derived:
  //   "Zoe Adams"   -> first "Zoe",  last "Adams"  (derived)
  //   "Amy Baker"   -> first "Amy",  last "Baker"  (derived)
  //   "Bob Zephyr"  -> first "Bob",  last "Zephyr" (derived)
  //   "Solo"        -> first "Solo", last ""       (single - unknown surname)

  it("sorts by last name ascending, with the unknown-surname row sorted LAST", () => {
    const rows = [
      makeRow({ id: "x", author: "Bob Zephyr" }),
      makeRow({ id: "z", author: "Solo" }),
      makeRow({ id: "w", author: "Zoe Adams" }),
      makeRow({ id: "y", author: "Amy Baker" }),
    ];
    const result = sortReplyRowsForTable(rows, "last-asc");
    expect(result.map((r) => r.id)).toEqual(["w", "y", "x", "z"]);
  });

  it("sorts by last name descending, with the unknown-surname row STILL sorted last", () => {
    const rows = [
      makeRow({ id: "x", author: "Bob Zephyr" }),
      makeRow({ id: "z", author: "Solo" }),
      makeRow({ id: "w", author: "Zoe Adams" }),
      makeRow({ id: "y", author: "Amy Baker" }),
    ];
    const result = sortReplyRowsForTable(rows, "last-desc");
    expect(result.map((r) => r.id)).toEqual(["x", "y", "w", "z"]);
  });

  it("sorts by first name ascending and descending", () => {
    const rows = [makeRow({ id: "x", author: "Bob Zephyr" }), makeRow({ id: "w", author: "Zoe Adams" }), makeRow({ id: "y", author: "Amy Baker" })];
    expect(sortReplyRowsForTable(rows, "first-asc").map((r) => r.id)).toEqual(["y", "x", "w"]); // Amy, Bob, Zoe
    expect(sortReplyRowsForTable(rows, "first-desc").map((r) => r.id)).toEqual(["w", "x", "y"]); // Zoe, Bob, Amy
  });

  it("breaks a tie in the name key on firstSeenAt ascending, regardless of input array order", () => {
    // Both rows derive the identical { firstName: "Ann", lastName: "Smith" }
    // key, so last-asc must fall through to firstSeenAt - and the row with
    // the LATER firstSeenAt is placed first in the input to prove the
    // output order comes from the tie-break, not from input order.
    const later = makeRow({ id: "later", author: "Ann Smith", firstSeenAt: 500 });
    const earlier = makeRow({ id: "earlier", author: "Ann Smith", firstSeenAt: 100 });
    const result = sortReplyRowsForTable([later, earlier], "last-asc");
    expect(result.map((r) => r.id)).toEqual(["earlier", "later"]);
  });

  it("preserves row object identity - no row is cloned by sorting", () => {
    const a = makeRow({ id: "a", author: "Bob Zephyr" });
    const b = makeRow({ id: "b", author: "Amy Baker" });
    const result = sortReplyRowsForTable([a, b], "last-asc");
    expect(result.find((r) => r.id === "a")).toBe(a);
    expect(result.find((r) => r.id === "b")).toBe(b);
  });

  it("delegates captured-asc/desc, name-asc/desc, and custom to discussion-capture.ts's own sortReplyRows rather than reimplementing them", () => {
    // N1 fix (sort-filter closure re-review): the prior fixture gave both
    // rows the same author (makeRow's shared default, "Maria Alvarez"), so
    // "a" and "b" compared equal under name-asc AND name-desc and neither
    // assertion could ever fail regardless of which direction the delegated
    // sort actually ran. Distinct authors here (as well as distinct
    // order/firstSeenAt, already present) give every one of the five
    // delegated modes below real discriminating power.
    const rows = [makeRow({ id: "a", author: "Zoe Chen", order: 1, firstSeenAt: 200 }), makeRow({ id: "b", author: "Amy Baker", order: 0, firstSeenAt: 100 })];
    const preExisting: ReplySort[] = ["captured-asc", "captured-desc", "name-asc", "name-desc", "custom"];
    for (const sort of preExisting) {
      // Every one of these modes must still produce SOME deterministic
      // ordering of exactly these two ids - proving the call was routed
      // somewhere real rather than silently dropped or defaulted.
      const result = sortReplyRowsForTable(rows, sort);
      expect(result.map((r) => r.id).sort()).toEqual(["a", "b"]);
    }
    // captured-asc: earlier firstSeenAt (b, 100) first.
    expect(sortReplyRowsForTable(rows, "captured-asc").map((r) => r.id)).toEqual(["b", "a"]);
    // captured-desc: later firstSeenAt (a, 200) first.
    expect(sortReplyRowsForTable(rows, "captured-desc").map((r) => r.id)).toEqual(["a", "b"]);
    // name-asc: "Amy Baker" sorts before "Zoe Chen".
    expect(sortReplyRowsForTable(rows, "name-asc").map((r) => r.id)).toEqual(["b", "a"]);
    // name-desc: reversed - "Zoe Chen" sorts before "Amy Baker".
    expect(sortReplyRowsForTable(rows, "name-desc").map((r) => r.id)).toEqual(["a", "b"]);
    // custom: lower order (b, 0) first.
    expect(sortReplyRowsForTable(rows, "custom").map((r) => r.id)).toEqual(["b", "a"]);
  });
});

// ---------------------------------------------------------------------------
// filterRowsByQuery (F8 / F9): generic filter, by-reference no-op path,
// case-insensitivity across every haystack field.
// ---------------------------------------------------------------------------

describe("filterRowsByQuery (F8 / F9)", () => {
  const haystack = (row: ReplyRow): ReadonlyArray<string> => [row.author, row.post, row.reply];

  it("returns the SAME array reference (by identity, not just equal contents) when the query is empty", () => {
    const rows = [makeRow({ id: "a" }), makeRow({ id: "b" })];
    const result = filterRowsByQuery(rows, "", haystack);
    expect(result).toBe(rows);
  });

  it("returns the SAME array reference when the query is whitespace-only", () => {
    const rows = [makeRow({ id: "a" }), makeRow({ id: "b" })];
    const result = filterRowsByQuery(rows, "   ", haystack);
    expect(result).toBe(rows);
  });

  it("matches case-insensitively against the author field", () => {
    const rows = [makeRow({ id: "a", author: "Alice Roberts" }), makeRow({ id: "b", author: "Bob Ng" })];
    expect(filterRowsByQuery(rows, "ALICE", haystack).map((r) => r.id)).toEqual(["a"]);
  });

  it("matches case-insensitively against the post field", () => {
    const rows = [makeRow({ id: "a", post: "Discusses THE TROLLEY problem" }), makeRow({ id: "b", post: "Discusses free will" })];
    expect(filterRowsByQuery(rows, "trolley", haystack).map((r) => r.id)).toEqual(["a"]);
  });

  it("matches case-insensitively against the reply field", () => {
    const rows = [makeRow({ id: "a", reply: "Great POINT about Kant" }), makeRow({ id: "b", reply: "Nothing about Kant here" })];
    expect(filterRowsByQuery(rows, "kant", haystack).map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("returns an empty array when nothing matches", () => {
    const rows = [makeRow({ id: "a", author: "Alice" })];
    expect(filterRowsByQuery(rows, "zzzzz", haystack)).toEqual([]);
  });

  it("is generic over a row shape that is not ReplyRow at all (F8a: the grading-table reuse case)", () => {
    interface GradingRow {
      label: string;
      note: string;
    }
    const rows: GradingRow[] = [{ label: "Submission 3", note: "late" }, { label: "Jordan P.", note: "on time" }];
    const result = filterRowsByQuery(rows, "jordan", (row) => [row.label, row.note]);
    expect(result).toEqual([{ label: "Jordan P.", note: "on time" }]);
  });
});

// ---------------------------------------------------------------------------
// moveVisibleRow (F15): reordering relative to the VISIBLE id list.
// ---------------------------------------------------------------------------

describe("moveVisibleRow (F15)", () => {
  it("swaps a row with its VISIBLE neighbour, hopping over a hidden row physically between them", () => {
    // Full displayed order: a, b, c - b is filtered out (not in visibleIds).
    const a = makeRow({ id: "a", order: 0 });
    const b = makeRow({ id: "b", order: 1 }); // hidden by the filter
    const c = makeRow({ id: "c", order: 2 });
    const result = moveVisibleRow([a, b, c], ["a", "c"], "custom", "c", "up");

    expect(result.sort).toBe("custom");
    expect(result.atBoundary).toBe(false);
    // c moved past its visible neighbour a; the hidden row b keeps its own
    // place in the full ordering, ending up between the two that swapped.
    expect(result.rows.map((r) => r.id)).toEqual(["c", "b", "a"]);
    // b was not part of the swap - its object identity survives.
    expect(result.rows.find((r) => r.id === "b")).toBe(b);
  });

  it("is a no-op with atBoundary true when the row is already first among VISIBLE rows, even though a hidden row sits before it", () => {
    // Full displayed order: a, b, c - a is filtered out. b is the first
    // VISIBLE row, so moving it up must report atBoundary even though `a`
    // is physically ahead of it in the full array.
    const a = makeRow({ id: "a", order: 0 }); // hidden by the filter
    const b = makeRow({ id: "b", order: 1 });
    const c = makeRow({ id: "c", order: 2 });
    const result = moveVisibleRow([a, b, c], ["b", "c"], "custom", "b", "up");

    expect(result.atBoundary).toBe(true);
    expect(result.rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(result.sort).toBe("custom"); // currentSort passed through unchanged
  });

  it("rewrites order across the FULL array (AC53) before swapping, when leaving a non-custom sort", () => {
    // order values are stale (do not match displayed index) - AC53 requires
    // they get rewritten to the current displayed index FIRST.
    const a = makeRow({ id: "a", order: 50 });
    const b = makeRow({ id: "b", order: 10 }); // hidden by the filter
    const c = makeRow({ id: "c", order: 90 });
    const result = moveVisibleRow([a, b, c], ["a", "c"], "name-asc", "c", "up");

    expect(result.sort).toBe("custom");
    expect(result.rows.map((r) => r.id)).toEqual(["c", "b", "a"]);
    // Sorting the result by its own order field (simulating the filter
    // being cleared and the table re-rendered as "custom") reproduces the
    // exact same sequence - the swap is stable once every row is visible
    // again.
    const byOrder = result.rows.slice().sort((x, y) => x.order - y.order);
    expect(byOrder.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("returns rows unchanged when the id is not present in the visible id list", () => {
    const a = makeRow({ id: "a", order: 0 });
    const b = makeRow({ id: "b", order: 1 }); // hidden by the filter
    const result = moveVisibleRow([a, b], ["a"], "custom", "b", "up");

    expect(result.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(result.atBoundary).toBe(false);
    expect(result.sort).toBe("custom");
  });

  it("is a no-op with atBoundary true when moving the last visible row down", () => {
    const a = makeRow({ id: "a", order: 0 });
    const b = makeRow({ id: "b", order: 1 });
    const result = moveVisibleRow([a, b], ["a", "b"], "custom", "b", "down");

    expect(result.atBoundary).toBe(true);
    expect(result.rows.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// Fixer pass (sort-filter review): S1, S4/S6, S2 and B1-B5/S5.
// ---------------------------------------------------------------------------

// S1 fix: moveVisibleRow (this file) delegates to swapAdjacentRows
// (discussion-capture.ts) - the ONE shared implementation - rather than
// reimplementing the swap independently. REGRESSION entry 367 defect 4's
// shape once recurred here (a `moveRow` in discussion-capture.ts shipped as
// a tested-but-dead duplicate of the same swap).
//
// Sort-filter closure re-review FIX 2: these three tests used to assert
// `moveVisibleRow(...) toEqual moveRow(...)` / `swapAdjacentRows(...) toEqual
// moveRow(...)`. Once both call paths were made to delegate to the SAME
// `swapAdjacentRows`, that comparison became a tautology - it passed by
// construction (moveVisibleRow calling swapAdjacentRows, then comparing the
// result to... swapAdjacentRows) and would keep passing even if the shared
// helper itself were wrong, which is this repo's own recorded "refactors
// disarm tests" shape. `moveRow` itself is now deleted too (SHOULD-1, zero
// production callers), so there is nothing left to compare against even in
// principle. Rewritten below against frozen literal oracles instead - the
// expected `rows`/`sort`/`atBoundary`/`order` values are spelled out, not
// re-derived from any other function's output.
describe("swapAdjacentRows is the one shared swap implementation (S1 fix)", () => {
  it("moveVisibleRow, with a visible list covering the whole array, swaps the row up against its physical predecessor - a frozen literal oracle, not a comparison to another implementation", () => {
    const rows = [makeRow({ id: "a", order: 0 }), makeRow({ id: "b", order: 1 }), makeRow({ id: "c", order: 2 })];
    const visibleIds = rows.map((r) => r.id);

    const result = moveVisibleRow(rows, visibleIds, "custom", "b", "up");

    expect(result.sort).toBe("custom");
    expect(result.atBoundary).toBe(false);
    expect(result.rows.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(result.rows.find((r) => r.id === "b")?.order).toBe(0);
    expect(result.rows.find((r) => r.id === "a")?.order).toBe(1);
    // "c" was not part of the swap - it keeps its own object identity.
    expect(result.rows.find((r) => r.id === "c")).toBe(rows[2]);
  });

  it("swapAdjacentRows, called directly, exchanges the two named ids' order values and reports sort: custom - a frozen literal oracle", () => {
    const rows = [makeRow({ id: "a", order: 0 }), makeRow({ id: "b", order: 1 }), makeRow({ id: "c", order: 2 })];
    const result = swapAdjacentRows(rows, "custom", "b", "a");
    expect(result.sort).toBe("custom");
    expect(result.atBoundary).toBe(false);
    expect(result.rows.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("SABOTAGE CHECK: moveVisibleRow rewrites order to displayed index before swapping when leaving a non-custom sort - fails if swapAdjacentRows stops doing that AC53 rewrite", () => {
    // Verified by sabotage against swapAdjacentRows itself (see this pass's
    // sabotage log) - restated here as a frozen literal, not a comparison to
    // moveRow (deleted, SHOULD-1) or to any other function's own output.
    const rows = [makeRow({ id: "a", author: "Alvarez", order: 50 }), makeRow({ id: "b", author: "Baxter", order: 10 }), makeRow({ id: "c", author: "Chen", order: 90 })];
    const visibleIds = rows.map((r) => r.id);
    const result = moveVisibleRow(rows, visibleIds, "name-asc", "b", "up");
    expect(result.sort).toBe("custom");
    expect(result.atBoundary).toBe(false);
    expect(result.rows.map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(result.rows.find((r) => r.id === "b")?.order).toBe(0);
    expect(result.rows.find((r) => r.id === "a")?.order).toBe(1);
    expect(result.rows.find((r) => r.id === "c")?.order).toBe(2);
  });
});

// S4/S6 fix: REPLY_ROW_HAYSTACK - the one accessor useReplyRows.ts's two
// call sites now share instead of each spelling out [author, post, reply]
// independently and untested.
describe("REPLY_ROW_HAYSTACK (S4/S6 fix)", () => {
  it("returns [author, post, reply], in that order", () => {
    const row = makeRow({ author: "Maria Alvarez", post: "A post about the reading.", reply: "A reply." });
    expect(REPLY_ROW_HAYSTACK(row)).toEqual(["Maria Alvarez", "A post about the reading.", "A reply."]);
  });

  it("is a real haystack for filterRowsByQuery - matches on the reply field, the one useReplyRows.ts's inline copies were most likely to drop", () => {
    const rows = [makeRow({ id: "a", author: "Zed", post: "unrelated", reply: "mentions kant here" }), makeRow({ id: "b", author: "Zed", post: "unrelated", reply: "no philosophy word" })];
    expect(filterRowsByQuery(rows, "kant", REPLY_ROW_HAYSTACK).map((r) => r.id)).toEqual(["a"]);
  });
});

// S4/S6 fix (review S6): copyAllButtonLabel - the "Copy every reply" label
// wording decision.
describe("copyAllButtonLabel (S4/S6 fix)", () => {
  it("says 'every' when no filter is active", () => {
    expect(copyAllButtonLabel(37, false)).toBe("Copy every reply (37)");
  });

  it("says 'shown', not 'every', while a filter is active - the live bug: 'every' while showing 4 of 37", () => {
    expect(copyAllButtonLabel(4, true)).toBe("Copy shown replies (4)");
  });

  it("SABOTAGE CHECK: fails if the filtered case is reverted back to claiming 'every'", () => {
    // Verified by sabotage - see report.
    const label = copyAllButtonLabel(4, true);
    expect(label).not.toContain("every reply");
  });
});

// S2 fix (review S2): computeStoppedSessionSummary - must read the
// UNFILTERED rawRows, or the tally can both under- and OVERcount.
describe("computeStoppedSessionSummary (S2 fix)", () => {
  it("counts drafted/failed exactly among the rows added since session start", () => {
    const rawRows = [
      makeRow({ id: "old-1", state: "ready" }), // existed before the session
      makeRow({ id: "new-1", state: "ready" }), // drafted during the session
      makeRow({ id: "new-2", state: "failed" }), // failed during the session
    ];
    const result = computeStoppedSessionSummary({
      rawRows,
      sessionStartIds: new Set(["old-1"]),
      totalCount: 3,
      sessionStartTotalCount: 1,
    });
    expect(result).toEqual({ found: 2, drafted: 1, failed: 1 });
  });

  it("reports the true count when sessionStartIds is built correctly (from rawRows, at session start) - vs. the shipped bug's exact shape when it is not", () => {
    // 30 rows already exist; 2 more are drafted during the session. This
    // function trusts its `sessionStartIds` input - correctness depends on
    // the CALLER building that snapshot from rawRows (the panel-level half
    // of the S2 fix, not testable in this node-env suite - see this file's
    // own header). Documented here by contrast: the shipped bug's exact
    // shape was an EMPTY sessionStartIds (built from a filter matching zero
    // rows at session start), which THIS function cannot correct, because it
    // has no way to distinguish "truly a new row" from "a caller mistake".
    const preExisting = Array.from({ length: 30 }, (_, i) => makeRow({ id: `old-${i}`, state: "ready" }));
    const rawRows = [...preExisting, makeRow({ id: "new-1", state: "ready" }), makeRow({ id: "new-2", state: "ready" })];

    const correct = computeStoppedSessionSummary({
      rawRows,
      sessionStartIds: new Set(preExisting.map((r) => r.id)), // built from rawRows, as the fixed panel now does
      totalCount: 32,
      sessionStartTotalCount: 30,
    });
    expect(correct.found).toBe(2);
    expect(correct.drafted).toBe(2); // NOT 32
    expect(correct.failed).toBe(0);

    const shippedBugShape = computeStoppedSessionSummary({
      rawRows,
      sessionStartIds: new Set(), // the shipped bug: a filter matched 0 rows at session start
      totalCount: 32,
      sessionStartTotalCount: 30,
    });
    expect(shippedBugShape.drafted).toBe(32); // reproduces the exact overcount the review found
  });

  it("SABOTAGE CHECK: fails if sessionRows is computed as rawRows.filter(r => sessionStartIds.has(r.id)) (inverted predicate)", () => {
    // Verified by sabotage - see report. The old and new rows are given
    // DIFFERENT states on purpose - inverting the predicate would count the
    // OLD row's state instead of the NEW row's, which only shows up as a
    // wrong answer if the two states differ.
    const rawRows = [makeRow({ id: "old-1", state: "failed" }), makeRow({ id: "new-1", state: "ready" })];
    const result = computeStoppedSessionSummary({
      rawRows,
      sessionStartIds: new Set(["old-1"]),
      totalCount: 2,
      sessionStartTotalCount: 1,
    });
    expect(result.drafted).toBe(1); // the NEW row (ready), not the pre-existing one (failed)
    expect(result.failed).toBe(0);
  });
});

// B1-B5/S5 fix (root cause): a source guard, mirroring
// recording-split.structure.test.ts's own readFileSync idiom (that file's
// own header comment). useDiscussionReplies.ts and useReplyResources.ts are
// hooks - vitest here is node-env and renders no hook (this file's own
// header) - so "every whole-table dispatch reads rawRows, not the filtered
// rows" has no test surface as a unit of BEHAVIOUR. What is testable is the
// FACT itself, pinned as a substring/regex check on the STRUCTURE of the
// read (property name, assignment shape) - never on the surrounding prose,
// per this repo's "source-text tests over-specify: pin the fact and the
// ordering, never the spelling" rule.
//
// discussion-draft-loop.ts split (recording-split): runDraftLoop - one of
// the four dispatch/lookup sites this guard exists to protect (the drafting
// queue's own dispatch-time read, and resolveEditedDuringDispatch) - moved
// out of useDiscussionReplies.ts into that leaf. The guard is repointed here
// to scan BOTH files, so it keeps checking the actual code that dispatches,
// not a file that used to contain it. Verified this repoint actually fires:
// a temporary local edit reverting discussion-draft-loop.ts's
// `resolveEditedDuringDispatch` read from `rowsApiRef.current.rawRows.find`
// to `rowsApiRef.current.rows.find` was applied, `npx vitest run
// discussion-table-view.test.ts` was re-run and failed on the new
// discussion-draft-loop.ts assertions below, then the edit was reverted and
// the suite re-run green again - the same sabotage-then-revert discipline
// this file's own header already commits to.
//
// useDiscussionLoopStarter.ts split: the S5 loop-start gate itself (the
// `if (!(capturing || rawRowsLength > 0 || hasActivatedRef.current)) return;`
// decision) moved out of useDiscussionReplies.ts into this sibling leaf -
// only the CALL SITE that computes `rawRowsLength` (`rowsApi.rawRows.length`,
// still checked below) stayed behind. The guard is repointed here a second
// time to also scan that file, for the same reason as the discussion-draft-
// loop.ts repoint above: the gate itself, not just the value it closes over,
// is what S5 exists to protect. Verified this repoint actually fires (see
// this file's SABOTAGE CHECK further down and this task's own report for the
// real-match/forbidden counts before and after).
//
// NOT widened into a directory-wide "no file here may read a filtered
// `.rows`" scan, even though that would need no repointing on the NEXT split.
// useReplyResources.ts's own `findMissing` (this file, below) reads the
// FILTERED `argsRef.current.rowsApi.rows` on purpose - it is a
// user-visible-selection action, not a whole-table dispatch, and is
// documented as exactly that at its own call site. A blanket scan for
// `rowsApi.rows` / `rowsApiRef.current.rows` across every file in this
// directory would flag that legitimate, deliberate read as a violation. The
// per-file allowlist stays hand-maintained for that reason: "which reads are
// dispatches" is not something a regex can tell apart from "which reads are
// a visible-selection action" without knowing the call site.
describe("useDiscussionReplies.ts / discussion-draft-loop.ts / useReplyResources.ts / useDiscussionLoopStarter.ts - rawRows source guard (B1-B5, S5 fix)", () => {
  const readSource = (relPath: string): string => fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");

  it("useDiscussionReplies.ts never reads a property/method off the FILTERED rowsApiRef.current.rows - B1/B2's two remaining dispatch sites (redraftAll, draftAllPending) go through .rawRows", () => {
    const src = readSource("src/app/components/recording/useDiscussionReplies.ts");
    // ".rows." (a property/method access) or a bare "= rowsApiRef.current.rows;"
    // assignment is exactly B1-B4's regressed shape; neither can match
    // ".rawRows" by accident, since that is a different property name.
    expect(src).not.toMatch(/rowsApiRef\.current\.rows\./);
    expect(src).not.toMatch(/=\s*rowsApiRef\.current\.rows\s*;/);
    const rawRowsReads = src.match(/rowsApiRef\.current\.rawRows/g) ?? [];
    expect(rawRowsReads.length).toBeGreaterThanOrEqual(2); // redraftAll, draftAllPending
  });

  it("discussion-draft-loop.ts's runDraftLoop never reads a property/method off the FILTERED rowsApiRef.current.rows - B3/B4's two remaining dispatch sites (the drafting queue's dispatch-time read, resolveEditedDuringDispatch) go through .rawRows", () => {
    const src = readSource("src/app/components/recording/discussion-draft-loop.ts");
    expect(src).not.toMatch(/rowsApiRef\.current\.rows\./);
    expect(src).not.toMatch(/=\s*rowsApiRef\.current\.rows\s*;/);
    const rawRowsReads = src.match(/rowsApiRef\.current\.rawRows/g) ?? [];
    expect(rawRowsReads.length).toBeGreaterThanOrEqual(2); // the drafting queue's currentRows read, resolveEditedDuringDispatch
  });

  it("useDiscussionReplies.ts's loop-start gate reads rawRows.length, not the filtered rows.length (S5 fix)", () => {
    const src = readSource("src/app/components/recording/useDiscussionReplies.ts");
    expect(src).not.toMatch(/rowsApi\.rows\.length/);
    expect(src).toMatch(/rowsApi\.rawRows\.length/);
  });

  it("useReplyResources.ts's drain reads rawRows, not the filtered rows, for its dispatch-time row lookup (B5 fix)", () => {
    const src = readSource("src/app/components/recording/useReplyResources.ts");
    expect(src).not.toMatch(/=\s*rowsApi\.rows\s*;/);
    expect(src).toMatch(/rowsApi\.rawRows/);
  });

  it("useDiscussionLoopStarter.ts's loop-start gate reads rawRowsLength, never a filtered rows.length - the gate itself, split out of useDiscussionReplies.ts (S5 fix, continued after the split)", () => {
    const src = readSource("src/app/components/recording/useDiscussionLoopStarter.ts");
    // The exact regressed shape: the gate condition testing a bare
    // `rows.length` instead of the `rawRowsLength` parameter. Not a bare
    // `/rows\.length/` substring check - this file's own header comment
    // legitimately DISCUSSES "the filtered `rows.length`" in prose (to
    // explain why it is not used), and that mention must not itself trip
    // the guard the way a source-text-over-specify test would.
    expect(src).not.toMatch(/\brows\.length\s*>\s*0/);
    expect(src).not.toMatch(/rowsApiRef\.current\.rows\./);
    expect(src).toMatch(/rawRowsLength\s*>\s*0/);
  });

  it("SABOTAGE CHECK: fails if redraftAll's id list is reverted from rawRows back to rows", () => {
    // Verified by sabotage - see report.
    const src = readSource("src/app/components/recording/useDiscussionReplies.ts");
    expect(src).not.toMatch(/rowsApiRef\.current\.rows\.map/);
  });

  it("SABOTAGE CHECK: fails if discussion-draft-loop.ts's drafting-queue dispatch read is reverted from rawRows back to rows", () => {
    // Verified by sabotage (recording-split extraction pass): see this
    // describe block's own header comment for how the repoint itself was
    // proven to fire.
    const src = readSource("src/app/components/recording/discussion-draft-loop.ts");
    expect(src).not.toMatch(/const currentRows = rowsApiRef\.current\.rows;/);
    expect(src).not.toMatch(/rowsApiRef\.current\.rows\.find/);
  });

  it("SABOTAGE CHECK: fails if useDiscussionLoopStarter.ts's loop-start gate is reverted from rawRowsLength back to a filtered rows.length", () => {
    // Verified by sabotage - see this task's own report for the before/after
    // run.
    const src = readSource("src/app/components/recording/useDiscussionLoopStarter.ts");
    expect(src).not.toMatch(/if \(!\(capturing \|\| rows\.length > 0 \|\| hasActivatedRef\.current\)\)/);
  });
});

// ---------------------------------------------------------------------------
// D3 status filter (docs/aesthetics-pass-acceptance-criteria.md section 4b).
// Sabotage-checked: replyMatchesStatusFilter's "uncopied" branch inverted
// (=== undefined flipped to !== undefined), filterRowsByStatus's "all"
// fast path changed from by-reference to `rows.slice()`, and a skipped row
// made to still match a specific chip. Each was applied to the source,
// confirmed red, confirmed present in the diff, then reverted.
// ---------------------------------------------------------------------------

function makeStatusRow(overrides: Partial<ReplyStatusFilterRow>): ReplyStatusFilterRow {
  return { id: "disc-1", state: "pending", userEdited: false, reply: "", ...overrides };
}

describe("isReplyStatusFilter (D3)", () => {
  it("accepts every member of the five-value set", () => {
    for (const v of ["all", "needs-draft", "failed", "edited", "uncopied"]) {
      expect(isReplyStatusFilter(v)).toBe(true);
    }
  });

  it("rejects anything outside the set, including non-strings", () => {
    expect(isReplyStatusFilter("bogus")).toBe(false);
    expect(isReplyStatusFilter(null)).toBe(false);
    expect(isReplyStatusFilter(undefined)).toBe(false);
    expect(isReplyStatusFilter(3)).toBe(false);
  });
});

describe("replyMatchesStatusFilter (D3)", () => {
  it("'all' matches every row, including a skipped one", () => {
    expect(replyMatchesStatusFilter(makeStatusRow({ id: "s" }), "all", {}, { s: true })).toBe(true);
  });

  it("'needs-draft' matches only pending rows", () => {
    expect(replyMatchesStatusFilter(makeStatusRow({ state: "pending" }), "needs-draft", {}, {})).toBe(true);
    expect(replyMatchesStatusFilter(makeStatusRow({ state: "ready" }), "needs-draft", {}, {})).toBe(false);
  });

  it("'failed' matches only failed rows", () => {
    expect(replyMatchesStatusFilter(makeStatusRow({ state: "failed" }), "failed", {}, {})).toBe(true);
    expect(replyMatchesStatusFilter(makeStatusRow({ state: "ready" }), "failed", {}, {})).toBe(false);
  });

  it("'edited' matches only userEdited rows", () => {
    expect(replyMatchesStatusFilter(makeStatusRow({ userEdited: true }), "edited", {}, {})).toBe(true);
    expect(replyMatchesStatusFilter(makeStatusRow({ userEdited: false }), "edited", {}, {})).toBe(false);
  });

  it("'uncopied' matches a row with a reply and no handledAt entry - sabotage target 1", () => {
    expect(replyMatchesStatusFilter(makeStatusRow({ reply: "hello" }), "uncopied", {}, {})).toBe(true);
    expect(replyMatchesStatusFilter(makeStatusRow({ reply: "hello" }), "uncopied", { "disc-1": 1000 }, {})).toBe(false);
    expect(replyMatchesStatusFilter(makeStatusRow({ reply: "" }), "uncopied", {}, {})).toBe(false);
  });

  it("a skipped row never matches a SPECIFIC chip, only 'all' - sabotage target 3", () => {
    const row = makeStatusRow({ id: "s", state: "pending", userEdited: true, reply: "hi" });
    const skipped = { s: true };
    expect(replyMatchesStatusFilter(row, "needs-draft", {}, skipped)).toBe(false);
    expect(replyMatchesStatusFilter(row, "edited", {}, skipped)).toBe(false);
    expect(replyMatchesStatusFilter(row, "uncopied", {}, skipped)).toBe(false);
  });
});

describe("filterRowsByStatus (D3)", () => {
  it("returns the SAME array reference for 'all' - sabotage target 2", () => {
    const rows = [makeStatusRow({ id: "a" }), makeStatusRow({ id: "b" })];
    expect(filterRowsByStatus(rows, "all", {}, {})).toBe(rows);
  });

  it("narrows to only the matching rows for a specific filter", () => {
    const rows = [
      makeStatusRow({ id: "a", state: "pending" }),
      makeStatusRow({ id: "b", state: "failed" }),
      makeStatusRow({ id: "c", state: "ready" }),
    ];
    expect(filterRowsByStatus(rows, "failed", {}, {}).map((r) => r.id)).toEqual(["b"]);
  });
});

describe("isAnyReplyFilterActive (D3/S4)", () => {
  it("is false when neither filter is active", () => {
    expect(isAnyReplyFilterActive("", "all")).toBe(false);
    expect(isAnyReplyFilterActive("   ", "all")).toBe(false);
  });

  it("is true for a non-empty text query alone", () => {
    expect(isAnyReplyFilterActive("maria", "all")).toBe(true);
  });

  it("is true for a status chip alone, with NO text query - the exact case 'Copy every reply (6)' must not lie under", () => {
    expect(isAnyReplyFilterActive("", "failed")).toBe(true);
  });

  it("is true when both are active", () => {
    expect(isAnyReplyFilterActive("maria", "edited")).toBe(true);
  });
});

describe("computeReplyStatusCounts (D3)", () => {
  it("counts each bucket independently, over the array as given (the caller passes rawRows, per F11's own discipline)", () => {
    const rows = [
      makeStatusRow({ id: "a", state: "pending" }),
      makeStatusRow({ id: "b", state: "failed" }),
      makeStatusRow({ id: "c", state: "ready", userEdited: true, reply: "x" }),
      makeStatusRow({ id: "d", state: "ready", reply: "y" }),
    ];
    const counts = computeReplyStatusCounts(rows, { d: 1000 }, {});
    expect(counts.all).toBe(4);
    expect(counts["needs-draft"]).toBe(1);
    expect(counts.failed).toBe(1);
    expect(counts.edited).toBe(1);
    expect(counts.uncopied).toBe(1); // only "c" has a reply and no handledAt entry
  });

  it("excludes skipped rows from every bucket except 'all'", () => {
    const rows = [makeStatusRow({ id: "a", state: "pending" }), makeStatusRow({ id: "b", state: "pending" })];
    const counts = computeReplyStatusCounts(rows, {}, { a: true });
    expect(counts.all).toBe(2);
    expect(counts["needs-draft"]).toBe(1); // only "b" - "a" is skipped
  });
});

// ---------------------------------------------------------------------------
// D3's own F0-2/F11 obligation: the status filter must enter NEITHER
// destructive arming signature (deleteSignature/redraftSignature,
// DiscussionRepliesPanel.tsx). Both are built from an inline template
// literal / draftingArmSignature call in that file, not a function this leaf
// exports, so there is nothing to unit-test directly - the guard here is a
// source-text scan, the same idiom the sibling describe block above (B1-B5)
// already uses for an analogous cross-file property.
//
// SABOTAGE CHECK: with `statusFilter` spliced into `deleteSignature`'s
// template literal, this test went red; reverted, confirmed green.
// ---------------------------------------------------------------------------

describe("DiscussionRepliesPanel.tsx - status filter stays out of both arming signatures (D3/F0-2/F11)", () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), "src/app/components/recording/DiscussionRepliesPanel.tsx"), "utf-8");

  it("deleteSignature's own line does not reference statusFilter", () => {
    const line = src.split("\n").find((l) => l.includes("const deleteSignature ="));
    expect(line, "expected to find the deleteSignature declaration").toBeTruthy();
    expect(line).not.toMatch(/statusFilter/);
  });

  it("redraftSignature's draftingArmSignature({...}) call does not pass statusFilter", () => {
    const match = src.match(/const redraftSignature = draftingArmSignature\(\{[\s\S]*?\}\);/);
    expect(match, "expected to find the redraftSignature call").toBeTruthy();
    expect(match![0]).not.toMatch(/statusFilter/);
  });
});
