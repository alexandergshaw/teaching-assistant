"use client";

// Split out of DiscussionRepliesPanel.tsx (that file was pressing on the
// 1000-line ceiling enforced by recording-split.structure.test.ts over
// src/app/components/recording/). This is a pure extraction of the
// `totalCount > 0` subtree (the search box, the two standing hints, and the
// table itself: the sortable headers, the body, and the row mapping) - the
// panel keeps the gate that decides whether to render this component at all
// (see that file's own "F11/F13" comment), the controls, the status row, the
// notices, the empty states, the post-stop summary and the armed destructive
// buttons.
//
// Every callback prop below is expected to be a STABLE reference from the
// panel (either forwarded straight through from useDiscussionReplies.ts, or
// a useCallback there) - see DiscussionReplyRow.tsx's own header comment on
// why: its React.memo only bites if the panel's row updaters return the
// identical function/object reference across renders. This component must
// therefore forward every one of them to DiscussionReplyRow UNWRAPPED - no
// inline arrow, no fresh object literal at this new component boundary -
// exactly as the panel used to pass them directly.

import { TextField, IconButton, InputAdornment } from "@mui/material";
import styles from "../../page.module.css";
// Section 6: the shared table skin - AutomationsTable.module.css's own
// header declares it the idiom the app's tables read as one system under.
// Only .scroller and .table are used; NOT .sortableHeader, which styles a
// clickable bare <th> with no button inside it and is not keyboard-operable
// (AC14 - repo-grades/RepoGradesGrid.tsx:129-140 is the markup precedent
// used instead).
import tableStyles from "../workflows/AutomationsTable.module.css";
import panelStyles from "./DiscussionRepliesPanel.module.css";
import { type ReplyRow, type ReplySort } from "./discussion-capture";
import { CloseIcon } from "./discussion-icons";
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
    <svg width={10} height={10} viewBox="0 0 20 20" aria-hidden="true" focusable="false" style={{ marginLeft: 4 }}>
      <polygon points={points} fill="currentColor" />
    </svg>
  );
}

export interface DiscussionReplyTableProps {
  rows: ReplyRow[];
  totalCount: number;
  filterText: string;
  setFilterText: (text: string) => void;
  sort: ReplySort;
  setSort: (sort: ReplySort) => void;
  llmProvider: LlmProvider;
  editReply: (id: string, text: string) => void;
  moveRow: (id: string, dir: "up" | "down") => void;
  onRemove: (id: string) => void;
  retryRow: (id: string) => void;
  retryResources: (id: string) => void;
  removeResource: (id: string, url: string) => void;
  registerRemoveRef: (id: string, el: HTMLButtonElement | null) => void;
  announce: (text: string) => void;
  onCopyError: (text: string) => void;
}

export default function DiscussionReplyTable({
  rows,
  totalCount,
  filterText,
  setFilterText,
  sort,
  setSort,
  llmProvider,
  editReply,
  moveRow,
  onRemove,
  retryRow,
  retryResources,
  removeResource,
  registerRemoveRef,
  announce,
  onCopyError,
}: DiscussionReplyTableProps) {
  return (
    <>
      {/* F8/F0-2: the search box, bound to the hook's filterText. */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <TextField
          type="search"
          size="small"
          label="Search replies"
          placeholder="Search by name or keyword"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          sx={{ minWidth: 220, maxWidth: 320 }}
          // Item 3's own "clear affordance" on the field itself, distinct
          // from F14's dedicated Clear control below (which sits next to
          // the "Showing N of M" count and only appears once a filter is
          // actually active) - this one lives on the box at all times a
          // query is typed, matching the standard search-field pattern.
          slotProps={{
            input: {
              endAdornment: filterText ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="Clear search" onClick={() => setFilterText("")}>
                    <CloseIcon />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
        {/* F14: "Showing 4 of 37 replies." - the denominator is
            `totalCount`, the SAME unfiltered count every other line on
            this panel reads (F11), so a filtered table can never be
            mistaken for a short one; the numerator is `rows.length`,
            which is exactly what is rendered below. Rendered only while
            a filter is active (F0-2: absent, the plain table already
            communicates its own size via AC7's post-stop summary etc. -
            this line exists specifically to disambiguate "filtered"
            from "short"). */}
        {filterText.trim() !== "" && (
          <span className={styles.fieldHint} style={{ margin: 0 }}>
            {`Showing ${rows.length} of ${totalCount} repl${totalCount === 1 ? "y" : "ies"}.`}{" "}
            <button type="button" className={styles.linkButton} onClick={() => setFilterText("")}>
              Clear
            </button>
          </span>
        )}
      </div>
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
                <td colSpan={DISCUSSION_TABLE_COLUMN_COUNT} className={panelStyles.filterEmptyCell}>
                  {`No replies match "${filterText.trim()}".`}{" "}
                  <button type="button" className={styles.linkButton} onClick={() => setFilterText("")}>
                    Clear
                  </button>
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <DiscussionReplyRow
                  key={row.id}
                  row={row}
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
                  onEditReply={editReply}
                  onMove={moveRow}
                  onRemove={onRemove}
                  onRetry={retryRow}
                  onRetryResources={retryResources}
                  onRemoveResource={removeResource}
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
