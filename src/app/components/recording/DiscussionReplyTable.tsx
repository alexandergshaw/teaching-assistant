"use client";

// Split out of DiscussionRepliesPanel.tsx (that file was pressing on the
// 1000-line ceiling enforced by recording-split.structure.test.ts over
// src/app/components/recording/). Originally a pure extraction of the
// `totalCount > 0` subtree; the search box and "Showing N of M" have since
// moved out AGAIN, into DiscussionReplyToolbar.tsx (D4's sticky bar), so this
// file now holds only the two standing hints and the table itself - the
// sortable headers, the body, the row mapping, and F13's (now four-branch,
// per D3) empty-filter state. The panel keeps the gate that decides whether
// to render this component at all (see that file's own "F11/F13" comment),
// the controls, the status row, the notices, the other empty states, the
// post-stop summary and the armed destructive buttons.
//
// Every callback prop below is expected to be a STABLE reference from the
// panel (either forwarded straight through from useDiscussionReplies.ts, or
// a useCallback there) - see DiscussionReplyRow.tsx's own header comment on
// why: its React.memo only bites if the panel's row updaters return the
// identical function/object reference across renders. This component must
// therefore forward every one of them to DiscussionReplyRow UNWRAPPED - no
// inline arrow, no fresh object literal at this new component boundary -
// exactly as the panel used to pass them directly.

import styles from "../../page.module.css";
// Section 6: the shared table skin - AutomationsTable.module.css's own
// header declares it the idiom the app's tables read as one system under.
// Only .scroller and .table are used; NOT .sortableHeader, which styles a
// clickable bare <th> with no button inside it and is not keyboard-operable
// (AC14 - repo-grades/RepoGradesGrid.tsx:129-140 is the markup precedent
// used instead).
import tableStyles from "../workflows/AutomationsTable.module.css";
import panelStyles from "./DiscussionRepliesPanel.module.css";
import { type ReplyRow, type ReplyResource, type ReplySort } from "./discussion-capture";
import DiscussionReplyRow, { DISCUSSION_TABLE_COLUMN_COUNT } from "./DiscussionReplyRow";
import type { LlmProvider } from "@/lib/llm";

/** AC14/F6: only First/Last/Captured carry aria-sort; "none" on every
 * sortable header that is not the active sort, never omitted - omitting it
 * on a sortable header is what a non-sortable column does. */
function sortAriaValue(active: boolean, ascending: boolean): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return ascending ? "ascending" : "descending";
}

function toggleColumnSort(current: ReplySort, ascKey: ReplySort, descKey: ReplySort): ReplySort {
  return current === ascKey ? descKey : ascKey;
}

function SortGlyph({ asc }: { asc: boolean }) {
  const points = asc ? "10,4 16,15 4,15" : "10,16 16,5 4,5";
  return (
    <svg width={10} height={10} viewBox="0 0 20 20" aria-hidden="true" focusable="false" style={{ marginLeft: "var(--space-1)" }}>
      <polygon points={points} fill="currentColor" />
    </svg>
  );
}

export interface DiscussionReplyTableProps {
  rows: ReplyRow[];
  /** D3: the current text query and status-chip label, used ONLY to build
   *  the right empty-state message and to know a Clear control is needed at
   *  all - the actual filtering already happened before `rows` reached this
   *  component (the panel applies filterRowsByQuery then filterRowsByStatus).
   *  `statusFilterLabel` is null for "all". */
  filterText: string;
  statusFilterLabel: string | null;
  onClearFilters: () => void;
  sort: ReplySort;
  setSort: (sort: ReplySort) => void;
  llmProvider: LlmProvider;
  /** docs/reply-composition-controls-acceptance-criteria.md C1c-i (fixer
   *  pass, BLOCKER 2): forwarded straight through to every
   *  DiscussionReplyRow, unwrapped, so each row can compute whether ITS OWN
   *  greeting was skipped - see DiscussionReplyRow.tsx's own doc comment on
   *  the prop. */
  addressByName: boolean;
  editReply: (id: string, text: string) => void;
  moveRow: (id: string, dir: "up" | "down") => void;
  /** D3 mitigation: `moveRow` (useReplyRows.ts) computes visible adjacency
   *  from the TEXT filter only - it has no way to know about this group's
   *  NEW status filter, since that concept lives entirely in this file set
   *  and the mutator's signature is pinned two files upstream
   *  (useDiscussionReplies.ts, out of scope - see discussion-reply-flags.ts's
   *  header for the full account of why). Reordering while a status chip
   *  narrows the view would therefore silently swap against a neighbour the
   *  status filter itself is hiding, reintroducing the exact "swap targets
   *  an invisible neighbour and nothing appears to happen" bug F15 fixed for
   *  the text filter. Rather than ship that silently, reordering is refused
   *  (aria-disabled, with an announced reason) whenever a status chip other
   *  than "All" is active - see DiscussionReplyRow.tsx's handleMoveUp/Down. */
  reorderDisabled: boolean;
  onRemove: (id: string) => void;
  retryRow: (id: string) => void;
  retryResources: (id: string) => void;
  removeResource: (id: string, url: string) => void;
  /** Resource-controls feature: one-click insert (MOVE, not copy - see
   *  useDiscussionReplies.ts's `insertResource` doc comment). Forwarded
   *  straight through, unwrapped, mirroring every other row callback here. */
  insertResource: (id: string, resource: ReplyResource) => void;
  /** Resource-controls feature: per-row targeted search. Forwarded straight
   *  through from R-D (useReplyResources.ts's `searchRow`). */
  searchRow: (id: string) => void;
  /** D1/D9: see discussion-reply-flags.ts's own header for why these are a
   *  side channel rather than ReplyRow fields. Plain per-row VALUES (not the
   *  whole flags map) so an unrelated row's flag changing does not defeat
   *  this row's own React.memo. */
  handledAtById: Readonly<Record<string, number>>;
  skippedById: Readonly<Record<string, boolean>>;
  onMarkHandled: (id: string) => void;
  onToggleHandled: (id: string) => void;
  onToggleSkip: (id: string) => void;
  registerRemoveRef: (id: string, el: HTMLButtonElement | null) => void;
  announce: (text: string) => void;
  onCopyError: (text: string) => void;
}

export default function DiscussionReplyTable({
  rows,
  filterText,
  statusFilterLabel,
  onClearFilters,
  sort,
  setSort,
  llmProvider,
  addressByName,
  editReply,
  moveRow,
  reorderDisabled,
  onRemove,
  retryRow,
  retryResources,
  removeResource,
  insertResource,
  searchRow,
  handledAtById,
  skippedById,
  onMarkHandled,
  onToggleHandled,
  onToggleSkip,
  registerRemoveRef,
  announce,
  onCopyError,
}: DiscussionReplyTableProps) {
  // D3, extending F13: a fourth branch - the current filter (text, status, or
  // both) matches nothing. `rows.length === 0` here can only mean at least
  // one of the two is active (see the by-reference "all"/"" fast paths both
  // filter functions use), so this string is never built for nothing to say.
  const query = filterText.trim();
  const emptyMessage =
    query && statusFilterLabel
      ? `No replies match "${query}" in "${statusFilterLabel}".`
      : query
      ? `No replies match "${query}".`
      : statusFilterLabel
      ? `No replies are "${statusFilterLabel}".`
      : "No replies match the current filter.";

  return (
    <>
      {/* docs/discussion-reply-resources-acceptance-criteria.md R10a:
          the standing hint, once, near the table. */}
      <p className={styles.fieldHint}>
        Links are found by search and checked for a response, not read. Open anything you are about to send.
      </p>
      {/* F8: R4e's embedded-provider capability limit, shown once as its
          OWN standing hint rather than through the per-batch notice
          channel (which reads as a repeated failure on every batch for
          the whole session - exactly what R4e forbids). */}
      {llmProvider === "embedded" && (
        <p className={styles.fieldHint}>
          The Embedded Deterministic Engine cannot search for resource links. Switch providers to find resources for a reply.
        </p>
      )}
      <div className={tableStyles.scroller}>
        <table className={tableStyles.table}>
          <caption className={panelStyles.tableCaption}>Captured discussion posts and drafted replies</caption>
          <thead>
            <tr>
              {/* F6: two independent headers (First/Last), not one
                  four-state Name header - a single header cycling
                  asc/desc for two different fields costs up to three
                  clicks to reach the mode you want and cannot be
                  labelled honestly. `name-asc`/`name-desc` remain valid
                  ReplySort values (F5: a persisted value must never be
                  rejected by isReplySort) but no header maps to them any
                  more - a returning user with that persisted value keeps
                  the old whole-string sort order until they click a
                  header, with neither header showing as active in the
                  meantime (sortAriaValue correctly reports "none" for
                  both, since neither IS the active sort). */}
              <th scope="col" aria-sort={sortAriaValue(sort === "first-asc" || sort === "first-desc", sort === "first-asc")}>
                <button type="button" className={styles.linkButton} onClick={() => setSort(toggleColumnSort(sort, "first-asc", "first-desc"))}>
                  First
                  {(sort === "first-asc" || sort === "first-desc") && <SortGlyph asc={sort === "first-asc"} />}
                </button>
              </th>
              <th scope="col" aria-sort={sortAriaValue(sort === "last-asc" || sort === "last-desc", sort === "last-asc")}>
                <button type="button" className={styles.linkButton} onClick={() => setSort(toggleColumnSort(sort, "last-asc", "last-desc"))}>
                  Last
                  {(sort === "last-asc" || sort === "last-desc") && <SortGlyph asc={sort === "last-asc"} />}
                </button>
              </th>
              <th scope="col" aria-sort={sortAriaValue(sort === "captured-asc" || sort === "captured-desc", sort === "captured-asc")}>
                <button type="button" className={styles.linkButton} onClick={() => setSort(toggleColumnSort(sort, "captured-asc", "captured-desc"))}>
                  Captured
                  {(sort === "captured-asc" || sort === "captured-desc") && <SortGlyph asc={sort === "captured-asc"} />}
                </button>
              </th>
              {/* AC15 amendment (reply-width UX pass): Post/Reply column
                  headers are deleted - both now live in a full-width
                  continuation row with no column beneath a header, and
                  each already carries a stronger per-control accessible
                  name (`Post by X`, `Reply to X`) than a shared column
                  header ever gave them. */}
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* F13: the fifth empty state - `totalCount > 0` (the panel's
                own gate that decides whether this component is even
                rendered) but the current filter matches nothing.
                `rows.length` (the filtered array) can only be 0 here
                while filterText is non-empty (F8: an empty/whitespace
                query returns the input array BY REFERENCE, so `rows`
                holds every row whenever no filter is active - it can
                never independently drop to 0 while totalCount is not).
                Without this state the user would see AC59's "no posts
                were found, check that you shared the right window"
                copy, which would be a lie for a table that plainly has
                rows - just not ones matching the query. */}
            {rows.length === 0 ? (
              <tr>
                {/* D7: this whole <tr> unmounts the instant a filter clears -
                    the THIRD of the three focus-drop sites this group fixes.
                    onClearFilters (the panel's handleClearFilters, threaded
                    down through the toolbar's own copy of the same helper)
                    focuses the search input, which survives this row's
                    unmount untouched, so a plain synchronous call is enough -
                    no keyed-ref/useLayoutEffect dance is needed here. */}
                <td colSpan={DISCUSSION_TABLE_COLUMN_COUNT} className={panelStyles.filterEmptyCell}>
                  {emptyMessage}{" "}
                  <button type="button" className={styles.linkButton} onClick={onClearFilters}>
                    Clear
                  </button>
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <DiscussionReplyRow
                  key={row.id}
                  row={row}
                  addressByName={addressByName}
                  // F15 item 2: boundary buttons ("Move up"/"Move down")
                  // must reflect the VISIBLE array, not the full one - a
                  // row that looks first under the current filter must
                  // report isFirst, and a row that is first only in the
                  // unfiltered table but has a hidden predecessor must
                  // not. `rows` IS the filtered/visible array now (see
                  // the panel's own destructuring comment), so i/rows.length
                  // here are already scoped correctly by construction.
                  isFirst={i === 0}
                  isLast={i === rows.length - 1}
                  reorderDisabled={reorderDisabled}
                  onEditReply={editReply}
                  onMove={moveRow}
                  onRemove={onRemove}
                  onRetry={retryRow}
                  onRetryResources={retryResources}
                  onRemoveResource={removeResource}
                  onInsertResource={insertResource}
                  onSearchRow={searchRow}
                  handledAt={handledAtById[row.id]}
                  skipped={!!skippedById[row.id]}
                  onMarkHandled={onMarkHandled}
                  onToggleHandled={onToggleHandled}
                  onToggleSkip={onToggleSkip}
                  registerRemoveRef={registerRemoveRef}
                  announce={announce}
                  onCopyError={onCopyError}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
