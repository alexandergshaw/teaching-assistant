"use client";

// Message replies (Manual > Recording > Message replies) - the sortable
// table shell. Mirrors DiscussionReplyTable.tsx's own split out of its
// panel (recording-split.structure.test.ts's 1000-line ceiling), holding the
// two standing hints-equivalent (none here - this feature has no resource
// lane) and the table itself: sortable headers, the body, the row mapping,
// and the filter-empty state.
//
// M18: "Sort by clickable column headers with aria-sort (First, Last,
// Subject), no sort select" - three sortable headers, not four (Captured is
// gone; there is no fourth "Status"/"Actions" header to sort by, matching
// DiscussionReplyTable.tsx's own choice not to make Status/Actions
// sortable).
//
// Every callback prop below is expected to be a STABLE reference from the
// panel (see MessageThreadRow.tsx's own header on why - its React.memo only
// bites when every row updater keeps the same identity across renders).

import styles from "../../page.module.css";
import tableStyles from "../workflows/AutomationsTable.module.css";
import panelStyles from "../recording/DiscussionRepliesPanel.module.css";
import controls from "../recording/RecordingControls.module.css";
import MessageThreadRow, { MESSAGE_TABLE_COLUMN_COUNT } from "./MessageThreadRow";
import type { MessageThreadRow as MessageThreadRowData } from "./message-serialization";
import type { MessageSort } from "./message-capture";

function sortAriaValue(active: boolean, ascending: boolean): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return ascending ? "ascending" : "descending";
}

function toggleColumnSort(current: MessageSort, ascKey: MessageSort, descKey: MessageSort): MessageSort {
  return current === ascKey ? descKey : ascKey;
}

function SortGlyph({ asc, active }: { asc: boolean; active: boolean }) {
  const points = asc ? "10,4 16,15 4,15" : "10,16 16,5 4,5";
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      className={active ? panelStyles.sortGlyph : `${panelStyles.sortGlyph} ${panelStyles.sortGlyphInactive}`}
    >
      <polygon points={points} fill="currentColor" />
    </svg>
  );
}

export interface MessageThreadTableProps {
  rows: MessageThreadRowData[];
  filterText: string;
  statusFilterLabel: string | null;
  onClearFilters: () => void;
  sort: MessageSort;
  setSort: (sort: MessageSort) => void;
  addressByName: boolean;
  threadExpand: boolean;
  reorderDisabled: boolean;
  editReply: (id: string, text: string) => void;
  moveRow: (id: string, dir: "up" | "down") => void;
  onRemove: (id: string) => void;
  redraftRow: (id: string) => void;
  onMarkHandled: (id: string) => void;
  onToggleHandled: (id: string) => void;
  onToggleSkip: (id: string) => void;
  savingDraftIds: readonly string[];
  onSaveDraft: (id: string) => void;
  sendingIds: readonly string[];
  onSend: (id: string) => void;
  onCheckSent: (id: string) => void;
  registerRemoveRef: (id: string, el: HTMLButtonElement | null) => void;
  announce: (text: string) => void;
  onCopyError: (text: string) => void;
}

export default function MessageThreadTable({
  rows,
  filterText,
  statusFilterLabel,
  onClearFilters,
  sort,
  setSort,
  addressByName,
  threadExpand,
  reorderDisabled,
  editReply,
  moveRow,
  onRemove,
  redraftRow,
  onMarkHandled,
  onToggleHandled,
  onToggleSkip,
  savingDraftIds,
  onSaveDraft,
  sendingIds,
  onSend,
  onCheckSent,
  registerRemoveRef,
  announce,
  onCopyError,
}: MessageThreadTableProps) {
  const query = filterText.trim();
  const emptyMessage =
    query && statusFilterLabel
      ? `No threads match "${query}" in "${statusFilterLabel}".`
      : query
      ? `No threads match "${query}".`
      : statusFilterLabel
      ? `No threads are "${statusFilterLabel}".`
      : "No threads match the current filter.";

  return (
    <div className={tableStyles.scroller}>
      <table className={tableStyles.table}>
        <caption className={panelStyles.tableCaption}>Captured student message threads and drafted replies</caption>
        <thead>
          <tr>
            <th scope="col" aria-sort={sortAriaValue(sort === "first-asc" || sort === "first-desc", sort === "first-asc")}>
              <button type="button" className={styles.linkButton} onClick={() => setSort(toggleColumnSort(sort, "first-asc", "first-desc"))}>
                First
                <SortGlyph asc={sort !== "first-desc"} active={sort === "first-asc" || sort === "first-desc"} />
              </button>
            </th>
            <th scope="col" aria-sort={sortAriaValue(sort === "last-asc" || sort === "last-desc", sort === "last-asc")}>
              <button type="button" className={styles.linkButton} onClick={() => setSort(toggleColumnSort(sort, "last-asc", "last-desc"))}>
                Last
                <SortGlyph asc={sort !== "last-desc"} active={sort === "last-asc" || sort === "last-desc"} />
              </button>
            </th>
            <th scope="col" aria-sort={sortAriaValue(sort === "subject-asc" || sort === "subject-desc", sort === "subject-asc")}>
              <button type="button" className={styles.linkButton} onClick={() => setSort(toggleColumnSort(sort, "subject-asc", "subject-desc"))}>
                Subject
                <SortGlyph asc={sort !== "subject-desc"} active={sort === "subject-asc" || sort === "subject-desc"} />
              </button>
            </th>
            <th scope="col">Status</th>
            <th scope="col" className={controls.rowActionsHeader}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={MESSAGE_TABLE_COLUMN_COUNT} className={panelStyles.filterEmptyCell}>
                {emptyMessage}{" "}
                <button type="button" className={styles.linkButton} onClick={onClearFilters}>
                  Clear
                </button>
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <MessageThreadRow
                key={row.id}
                row={row}
                isFirst={i === 0}
                isLast={i === rows.length - 1}
                reorderDisabled={reorderDisabled}
                addressByName={addressByName}
                threadExpand={threadExpand}
                editReply={editReply}
                onMove={moveRow}
                onRemove={onRemove}
                onRedraft={redraftRow}
                onMarkHandled={onMarkHandled}
                onToggleHandled={onToggleHandled}
                onToggleSkip={onToggleSkip}
                saving={savingDraftIds.includes(row.id)}
                onSaveDraft={onSaveDraft}
                sending={sendingIds.includes(row.id)}
                onSend={onSend}
                onCheckSent={onCheckSent}
                registerRemoveRef={registerRemoveRef}
                announce={announce}
                onCopyError={onCopyError}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
