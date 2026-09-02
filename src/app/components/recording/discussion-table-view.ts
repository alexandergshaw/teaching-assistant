// Discussion reply sort/filter - the table-view leaf.
// (docs/discussion-reply-sort-filter-acceptance-criteria.md, sections 2, 4, 5
// and 7 - F1, F5, F8, F8a, F8b, F9, F15)
//
// Pure, React-free, DOM-free - the same discipline as discussion-capture.ts
// (see that file's own header): vitest in this repo is node-env and renders
// nothing, so every behaviour that needs a unit test has to live in a leaf
// like this one rather than in a hook or a panel component.
//
// F1a: this is a SEPARATE leaf from discussion-capture.ts, deliberately. This
// file imports FROM discussion-capture.ts (ReplyRow, ReplySort,
// normalizeForMatch, sortReplyRows, MoveRowResult) one-directionally -
// discussion-capture.ts imports nothing back, and is not otherwise touched by
// this feature. Name derivation lives one leaf further out still, in
// src/lib/person-name.ts, which imports nothing from this feature at all -
// see that file's own header for the module cycle (through
// discussion-reply-prompt.ts, a later group's consumer of the same name
// derivation) that split is what avoids.
//
// F8a/F8b: `filterRowsByQuery` and `compareNameKey` are written generic over
// the row shape because a second table (grading-by-recording) is already
// known to need the same two operations over a different row type. Nothing
// else here is generalised beyond that - a shared "table view" abstraction
// over two tables that do not exist yet is exactly the refactor this repo's
// own "refactors disarm tests" / "four instances in two features" lesson
// warns against.

import { normalizeForMatch, sortReplyRows, swapAdjacentRows, type ReplyRow, type ReplySort, type MoveRowResult } from "./discussion-capture";
import { deriveReplyAuthorName } from "@/lib/person-name";

// ---------------------------------------------------------------------------
// F5 / F8a: sorting by derived first/last name.
// ---------------------------------------------------------------------------

/**
 * Ascending/descending string compare with blank-sorts-LAST in BOTH
 * directions. Generic (F8a): the grading table's own name-ish column can
 * reuse this without knowing anything about `ReplyRow` or
 * `deriveReplyAuthorName`.
 *
 * The blank check happens BEFORE the direction flip - that ordering is the
 * whole point. If it happened after (i.e. if descending were implemented as
 * "reverse of ascending"), a blank key would sort FIRST in descending order,
 * because the row that came last ascending becomes first when the whole
 * comparison result is negated. F5 is explicit that an unknown surname must
 * never lead the table in descending order, so blank-last is decided as its
 * own rule, independent of `direction`, and only non-blank keys are hardened
 * against direction.
 */
export function compareNameKey(a: string, b: string, direction: "asc" | "desc"): number {
  const aBlank = a === "";
  const bBlank = b === "";
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1; // a always sorts after b, regardless of direction
  if (bBlank) return -1; // b always sorts after a, regardless of direction

  const cmp = a.localeCompare(b, undefined, { sensitivity: "base" });
  return direction === "asc" ? cmp : -cmp;
}

type NamePart = "first" | "last";

/**
 * F3: the sort key deliberately does NOT go through the cell's display
 * convention (the em dash for an unknown surname lives in the panel, not
 * here) - it reads straight off `deriveReplyAuthorName`, whose `lastName` is
 * `""` for both "single" and "none" sources. That `""` is what
 * `compareNameKey` treats as blank-last.
 */
function replyNameSortKey(row: ReplyRow, part: NamePart): string {
  const name = deriveReplyAuthorName(row.author);
  return part === "first" ? name.firstName : name.lastName;
}

const FIRST_LAST_SORTS = new Set<ReplySort>(["first-asc", "first-desc", "last-asc", "last-desc"]);

/**
 * The single entry point a consumer (the reply-rows hook, or the panel)
 * should call for ANY `ReplySort` value. For the four sorts this feature
 * adds it derives first/last name keys and applies `compareNameKey`,
 * tie-breaking equal keys on `firstSeenAt` ascending (F5) so a re-render
 * never reshuffles rows that compare equal. For every sort
 * `discussion-capture.ts` already owns (`captured-asc`, `captured-desc`,
 * `name-asc`, `name-desc`, `custom`) it DELEGATES to that module's
 * `sortReplyRows` rather than reimplementing any of it - this repo has
 * recorded four instances in two features of one rule implemented twice,
 * where the tested copy was not the one production called, and this is
 * exactly that shape waiting to happen if the five existing modes were
 * copied here instead of called.
 *
 * Preserves row object identity: `Array.prototype.sort` reorders references
 * in place and this function never spreads or rebuilds a `ReplyRow`, so
 * `React.memo` on an unmoved row still bites (see F9 / the CRITICAL note on
 * this whole group).
 */
export function sortReplyRowsForTable(rows: ReadonlyArray<ReplyRow>, sort: ReplySort): ReplyRow[] {
  if (!FIRST_LAST_SORTS.has(sort)) {
    return sortReplyRows(rows, sort);
  }

  const part: NamePart = sort === "first-asc" || sort === "first-desc" ? "first" : "last";
  const direction: "asc" | "desc" = sort.endsWith("asc") ? "asc" : "desc";

  return rows.slice().sort((a, b) => {
    const primary = compareNameKey(replyNameSortKey(a, part), replyNameSortKey(b, part), direction);
    if (primary !== 0) return primary;
    return a.firstSeenAt - b.firstSeenAt; // F5: deterministic tie-break
  });
}

// ---------------------------------------------------------------------------
// F8 / F8a / F8b / F9: filtering.
// ---------------------------------------------------------------------------

/**
 * Generic filter over any row shape (F8/F8a) - the grading-by-recording
 * table (surveyed, not yet specified) needs the identical operation over its
 * own row type, whose "name" column is a label read off the screen rather
 * than a verified student identity (F8b); this function does not know or
 * care what the strings mean, so that distinction lives entirely in whatever
 * `haystack` the caller supplies.
 *
 * The query is lowercased and normalised through `normalizeForMatch` (reused
 * from `discussion-capture.ts`, never restated) exactly ONCE, up front - not
 * once per row. Each row's haystack strings are matched by substring against
 * that single normalised query, so the match is case-insensitive and
 * punctuation-insensitive across every field the caller includes, the same
 * way `normalizeForMatch` already makes the dedupe path insensitive to those
 * differences.
 *
 * F9: an empty or whitespace-only query returns `rows` BY REFERENCE - not a
 * copy, not `rows.slice()`. This is deliberate, not an accident of `.filter`
 * happening to short-circuit: at the 500-row ceiling with ~4000-char posts,
 * building three lowercased haystack strings per row on every keystroke of
 * an EMPTY search box would allocate for no reason, since the box being
 * empty is the single most common state it is in. Returning the same
 * reference also means a downstream `React.memo`'d row list sees the
 * identical array when there is nothing to filter, rather than a new array
 * of the identical rows.
 */
export function filterRowsByQuery<T>(rows: ReadonlyArray<T>, query: string, haystack: (row: T) => ReadonlyArray<string>): T[] {
  const normalizedQuery = normalizeForMatch(query);
  if (!normalizedQuery) {
    return rows as T[];
  }

  return rows.filter((row) => haystack(row).some((field) => normalizeForMatch(field).includes(normalizedQuery)));
}

/** S4 fix (sort-filter review): the ONE haystack accessor for a ReplyRow's
 * own filterable fields (F8: author, post, reply). `useReplyRows.ts` used
 * to spell `[row.author, row.post, row.reply]` out twice, independently -
 * once for the visible-id list `moveRow` builds, once for the display
 * memo - and neither call site had any test coverage of its own (only
 * `filterRowsByQuery` itself is tested, against a test-local accessor). A
 * fourth field added to one copy and not the other would leave
 * `visibleIds` silently disagreeing with what is actually rendered:
 * `moveVisibleRow` would then swap a row against a neighbour the user
 * cannot see, and `isFirst`/`isLast` (computed from the rendered array)
 * would disagree with it too. Both of useReplyRows.ts's call sites import
 * this instead of re-spelling the array. */
export const REPLY_ROW_HAYSTACK = (row: ReplyRow): string[] => [row.author, row.post, row.reply];

// ---------------------------------------------------------------------------
// F15: moving a row while a filter narrows what is visible.
// ---------------------------------------------------------------------------

/**
 * F15: swapping `index +/- 1` in the FULL displayed array (as
 * `discussion-capture.ts` used to do, in a `moveRow` helper deleted per the
 * sort-filter closure re-review's SHOULD-1 - see `swapAdjacentRows`'s own
 * comment in that file for why) targets whatever row is physically
 * adjacent, visible or not, with a filter active - so a swap can silently
 * target an invisible neighbour and nothing appears to happen on screen,
 * even though `order` and `sort` both changed underneath the user.
 *
 * This version takes `visibleIds` - the ids of the rows the filter currently
 * shows, in their displayed order - and finds `id`'s neighbour WITHIN that
 * list instead of within `displayedRows`. `displayedRows` is still the FULL
 * sorted array, because `order` has to be rewritten across every row, not
 * just the visible ones, so the result is stable once the filter clears
 * (F15's own words).
 *
 * AC53's rule is unchanged and still fires FIRST: leaving a non-custom sort
 * rewrites every row's `order` to its current displayed index (over the
 * FULL array) before anything swaps, so the first move after a Name/Captured
 * sort reorders against what the table actually looked like rather than
 * stale capture-time `order` values. Only then are `id` and its VISIBLE
 * neighbour's `order` values exchanged - which is what "swap against
 * adjacency in that list" means: any hidden row physically between them in
 * `displayedRows` keeps its own `order` value untouched (and, since it is
 * untouched, keeps its object identity too - see the CRITICAL note on this
 * whole group). If the filter is cleared afterwards, that hidden row simply
 * resurfaces sitting between the two rows that swapped, which is the
 * intuitive reading of "swap with my visible neighbour, whatever is in
 * between us keeps its place."
 *
 * `sort` becomes `"custom"` in the same result as the swap, matching AC53.
 *
 * S1 fix (sort-filter review): the actual swap (the AC53 order-rewrite
 * over the full array, then exchanging the two ids' `order` values) is no
 * longer reimplemented here - it delegates to `swapAdjacentRows`
 * (discussion-capture.ts), the ONE shared implementation. This function's
 * only remaining job is deciding WHICH id counts as "adjacent": a position
 * in the VISIBLE list, not a physical array index. Before this fix the
 * swap itself was reimplemented line-for-line, and the two copies could
 * diverge silently - inverting the `row.order === i` identity check in one
 * would only fail that file's own tests - which is REGRESSION entry 367
 * defect 4's shape, recreated for `moveRow` (`discussion-capture.ts`'s own
 * physical-index wrapper around the swap) a second time. That wrapper is
 * now deleted entirely (sort-filter closure re-review SHOULD-1): it had
 * zero production callers once every real caller went through this
 * function instead, so it was dead-on-arrival code rather than a genuine
 * second variant.
 */
export function moveVisibleRow(
  displayedRows: ReadonlyArray<ReplyRow>,
  visibleIds: ReadonlyArray<string>,
  currentSort: ReplySort,
  id: string,
  direction: "up" | "down"
): MoveRowResult {
  const visibleIndex = visibleIds.indexOf(id);
  if (visibleIndex === -1) {
    return { rows: displayedRows.slice(), sort: currentSort, atBoundary: false };
  }

  const targetVisibleIndex = direction === "up" ? visibleIndex - 1 : visibleIndex + 1;
  if (targetVisibleIndex < 0 || targetVisibleIndex >= visibleIds.length) {
    return { rows: displayedRows.slice(), sort: currentSort, atBoundary: true };
  }
  const targetId = visibleIds[targetVisibleIndex];

  return swapAdjacentRows(displayedRows, currentSort, id, targetId);
}

// ---------------------------------------------------------------------------
// Fixer pass (sort-filter review): two more decisions pulled out as pure
// functions purely so they have a test surface at all -
// DiscussionRepliesPanel.tsx is a component and renders nothing in this
// suite (this file's own header).
// ---------------------------------------------------------------------------

/** S4/S6 fix (sort-filter review): the "Copy every reply" button's label.
 * The SCOPING was already correct (the count and the dispatch read the same
 * array) - the LABEL was the lie: "Copy every reply (4)" while 37 rows
 * exist. `filterActive` mirrors the panel's own `filterText.trim() !== ""`
 * check. */
export function copyAllButtonLabel(count: number, filterActive: boolean): string {
  return filterActive ? `Copy shown replies (${count})` : `Copy every reply (${count})`;
}

// ---------------------------------------------------------------------------
// D3 (aesthetics-pass redesign, docs/aesthetics-pass-acceptance-criteria.md
// section 4b): the status filter chips - "find the six I haven't answered"
// was otherwise impossible, since the text filter (F8 above) only matches
// [author, post, reply]. A SEPARATE filter dimension from the text search box
// - the two compose (a chip AND a search term both narrow together), so this
// stays a plain function over whatever array the caller already has (the
// panel applies it AFTER filterRowsByQuery/sortReplyRowsForTable), never a
// second reimplementation of either.
//
// "uncopied" reads a `handledAt` map rather than `row.handledAt` directly -
// `handledAt`/`skipped` are real ReplyRow fields (discussion-serialization.ts,
// promoted from a side-channel localStorage map, discussion-reply-flags.ts,
// since deleted), but this function keeps the Readonly<Record<...>> shape
// anyway: it is generic over `ReplyStatusFilterRow`, a narrower structural
// slice than the full row, and passing plain per-id data in (rather than
// requiring the caller's row shape to carry the fields itself) keeps a
// memoized row's props to plain values - see useDiscussionReplyFiltering.ts's
// own header for how the two maps are now derived directly from `rawRows`.
// ---------------------------------------------------------------------------

export type ReplyStatusFilter = "all" | "needs-draft" | "failed" | "edited" | "uncopied";

export const REPLY_STATUS_FILTERS: ReadonlyArray<ReplyStatusFilter> = ["all", "needs-draft", "failed", "edited", "uncopied"];

export const REPLY_STATUS_FILTER_LABELS: Record<ReplyStatusFilter, string> = {
  all: "All",
  "needs-draft": "Needs a draft",
  failed: "Failed",
  edited: "Edited by you",
  uncopied: "Not yet copied",
};

export function isReplyStatusFilter(value: unknown): value is ReplyStatusFilter {
  return typeof value === "string" && (REPLY_STATUS_FILTERS as readonly string[]).includes(value);
}

/** The narrow structural slice this module actually reads - generic the same
 * way `filterRowsByQuery`'s `haystack` accessor is, so a caller passing a
 * real `ReplyRow` (which has all four fields and more) satisfies this with
 * no cast. */
export interface ReplyStatusFilterRow {
  id: string;
  state: string;
  userEdited: boolean;
  reply: string;
}

/** A skipped row (D9) never matches a SPECIFIC status chip - it opted out of
 * the workflow those chips are triage tools for - but still counts under
 * "All". `filter === "all"` short-circuits before the skip check for exactly
 * that reason. */
export function replyMatchesStatusFilter(
  row: ReplyStatusFilterRow,
  filter: ReplyStatusFilter,
  handledAt: Readonly<Record<string, number>>,
  skipped: Readonly<Record<string, boolean>>
): boolean {
  if (filter === "all") return true;
  if (skipped[row.id]) return false;
  switch (filter) {
    case "needs-draft":
      return row.state === "pending";
    case "failed":
      return row.state === "failed";
    case "edited":
      return row.userEdited;
    case "uncopied":
      return !!row.reply && handledAt[row.id] === undefined;
    default:
      return true;
  }
}

/** F9's own by-reference discipline, carried over: "all" returns the input
 * array BY REFERENCE (no allocation, and a downstream memoized row list sees
 * the identical array reference when nothing is being narrowed). */
export function filterRowsByStatus<T extends ReplyStatusFilterRow>(
  rows: ReadonlyArray<T>,
  filter: ReplyStatusFilter,
  handledAt: Readonly<Record<string, number>>,
  skipped: Readonly<Record<string, boolean>>
): T[] {
  if (filter === "all") return rows as T[];
  return rows.filter((row) => replyMatchesStatusFilter(row, filter, handledAt, skipped));
}

/** Chip counts are computed over the caller's array as given - the panel
 * passes `rawRows` (F0-2/F11's own discipline: a chip count is exactly the
 * same class of "whole-table number" a progress string or an arming
 * signature is, and must not silently shrink because the search box also
 * happens to be narrowing the table at the same moment). */
/** D3/S4: a status chip narrows scope exactly the way the search box does,
 * so it must count as "a filter is active" the same way non-empty
 * `filterText` already does - `copyAllButtonLabel`'s own `filterActive`
 * parameter, and the toolbar's "Showing N of M" line, both read this rather
 * than re-deriving the OR themselves, so the rule has exactly one
 * implementation and one test. Pulled out as its own function (rather than
 * left as an inline boolean expression in useDiscussionReplyFiltering.ts,
 * which this repo's vitest never renders) specifically so "does a
 * chip-only filter count as active" has a test surface at all. */
export function isAnyReplyFilterActive(filterText: string, statusFilter: ReplyStatusFilter): boolean {
  return filterText.trim() !== "" || statusFilter !== "all";
}

export function computeReplyStatusCounts(
  rows: ReadonlyArray<ReplyStatusFilterRow>,
  handledAt: Readonly<Record<string, number>>,
  skipped: Readonly<Record<string, boolean>>
): Record<ReplyStatusFilter, number> {
  const counts: Record<ReplyStatusFilter, number> = { all: rows.length, "needs-draft": 0, failed: 0, edited: 0, uncopied: 0 };
  for (const row of rows) {
    if (skipped[row.id]) continue;
    if (row.state === "pending") counts["needs-draft"] += 1;
    if (row.state === "failed") counts.failed += 1;
    if (row.userEdited) counts.edited += 1;
    if (row.reply && handledAt[row.id] === undefined) counts.uncopied += 1;
  }
  return counts;
}

export interface StoppedSessionSummaryInput {
  /** MUST be the UNFILTERED table (useReplyRows.ts's `rawRows`), never the
   *  filtered display array - see this function's own test for the
   *  overcount the filtered array produced. */
  rawRows: ReadonlyArray<ReplyRow>;
  sessionStartIds: ReadonlySet<string>;
  totalCount: number;
  sessionStartTotalCount: number;
}

export interface StoppedSessionSummaryResult {
  found: number;
  drafted: number;
  failed: number;
}

/** S2 fix (sort-filter review, review S2): the post-stop summary's
 * found/drafted/failed tallies. Before this fix the panel diffed the
 * FILTERED `rows` array against a `sessionStartIds` snapshot that was
 * itself only ever built from that same filtered array - which could
 * UNDERcount (a row outside the filter at Stop looked like it was never in
 * the session) or OVERcount (a filter matching zero rows at session start
 * produced an empty snapshot, so every persisted row looked "new" once the
 * filter was cleared before Stop; the in-code comment this replaced only
 * ever claimed the undercount direction). `found` is a pure `totalCount`
 * delta and was always exact; `drafted`/`failed` are now exact too, because
 * `rawRows` is unaffected by whatever the filter is doing at either end of
 * the session. */
// ---------------------------------------------------------------------------
// D9's exclusion list: the three whole-table dispatches a skipped row must
// never re-enter (docs/aesthetics-pass-acceptance-criteria.md section 4b).
// Pulled out as pure, exported predicates - useDiscussionReplies.ts and
// discussion-draft-loop.ts are hooks/loops this repo's vitest never renders
// (this file's own header), so the actual bulk-selection logic needs a leaf
// like this one to have a test surface at all. `isFindMissingEligible`
// (useReplyResources.ts) carries the same D9 exclusion for the third
// dispatch (`findMissing`) directly inside its own predicate instead, since
// that one already lived there before this migration.
// ---------------------------------------------------------------------------

/** `draftAllPending`'s (useDiscussionReplies.ts) bulk eligibility: a pending
 * or failed row, but never a skipped one. */
export function isDraftAllPendingEligible(row: { state: string; skipped?: boolean }): boolean {
  return (row.state === "pending" || row.state === "failed") && row.skipped !== true;
}

/** `redraftAll`'s (useDiscussionReplies.ts) bulk eligibility: every row
 * EXCEPT a skipped one - unlike `isDraftAllPendingEligible`, this ignores
 * `state` entirely, matching redraftAll's existing "every row in the table"
 * scope. */
export function isRedraftAllEligible(row: { skipped?: boolean }): boolean {
  return row.skipped !== true;
}

export function computeStoppedSessionSummary(input: StoppedSessionSummaryInput): StoppedSessionSummaryResult {
  const sessionRows = input.rawRows.filter((r) => !input.sessionStartIds.has(r.id));
  return {
    found: input.totalCount - input.sessionStartTotalCount,
    drafted: sessionRows.filter((r) => r.state === "ready").length,
    failed: sessionRows.filter((r) => r.state === "failed").length,
  };
}
