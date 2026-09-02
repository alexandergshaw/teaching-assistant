"use client";

// Grading from a screen recording - the table itself: the search box, the
// sortable Name header, and the row mapping.
// docs/grading-via-recording-acceptance-criteria.md section 4 and the
// owner's own words: "the table produced by the recording grader should
// also be filterable on the column that holds the name of the original
// poster."
//
// Mirrors recording/DiscussionReplyTable.tsx's shape (search box bound to a
// hook's filterText, one sortable header per sortable column, a filtered-
// empty state distinct from a table-empty state, the shared .scroller/
// .table skin) - that file's own header frames the skin as "the idiom the
// app's tables read as one system under", which is the part of it this
// table reuses. The MARKUP itself (this table has one sortable column, not
// five, plus a per-row Remove action and a whole-table Clear - see
// GradingTableRow.tsx's own header) is this file's own, per R4b.
//
// REACHABILITY: GradingRecordingPanel.tsx (this feature's own assembly
// panel) calls useGradingRows() once and passes its fields straight through
// to this component - the same division RecordingTab.tsx/
// DiscussionRepliesPanel.tsx already use for useReplyRows().

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { TextField, IconButton, InputAdornment } from "@mui/material";
import styles from "../../page.module.css";
import controls from "../recording/RecordingControls.module.css";
import tableStyles from "../workflows/AutomationsTable.module.css";
import rowStyles from "./GradingTable.module.css";
import GradingTableRow from "./GradingTableRow";
import { GRADING_TABLE_COLUMN_COUNT, gradingClearTableSignature, type GradingFeedbackField, type GradingSort } from "./grading-rows";
import type { GradingRow } from "./grading-row";
// Generic, dependency-free two-click confirm-arming helper (not owned by
// this feature) - the SAME signature-based-not-timer-based idiom
// DiscussionRepliesPanel.tsx's own "Delete table" uses (isConfirmArmed +
// gradingClearTableSignature above, mirroring that file's deleteSignature).
// See that module's own header for why arming is a property of a VALUE
// (the row count at arm time), not of an event in time.
import { isConfirmArmed } from "../content-tab/modules/confirmArming";
// docs/recording-controls-ux-acceptance-criteria.md CC5: the one arm/confirm
// component for every destructive or overwriting action.
import ConfirmArmButtons from "../ui/ConfirmArmButtons";
// Fixer pass finding 2: this file used to draw its own 16px file-local X
// glyph one click away from the discussion toolbar's 20px CloseIcon - reused
// from there instead of redrawn, the same shape convention every other icon
// on these surfaces follows (see discussion-icons.tsx's own header).
import { CloseIcon } from "../recording/discussion-icons";

const CLEAR_TABLE_CONSEQUENCE_ID = "grading-clear-table-consequence";

// CC14: renders dimmed on an inactive sortable column - matches
// DiscussionReplyTable.tsx's own SortGlyph, which gained this same `active`
// prop already (that fix "landed on one table only"; this is the other
// one). This table has a single sortable column (Name), which is always the
// active sort (GradingSort only ever holds "name-asc"/"name-desc" - see
// grading-rows.ts), so `active` is always true here today - the prop is
// still added for parity with the shared component shape, and so a future
// second sortable column dims correctly by default rather than needing this
// fix repeated.
function SortGlyph({ asc, active }: { asc: boolean; active: boolean }) {
  const points = asc ? "10,4 16,15 4,15" : "10,16 16,5 4,5";
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      className={active ? rowStyles.sortGlyph : `${rowStyles.sortGlyph} ${rowStyles.sortGlyphInactive}`}
    >
      <polygon points={points} fill="currentColor" />
    </svg>
  );
}

function sortAriaValue(active: boolean, ascending: boolean): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return ascending ? "ascending" : "descending";
}

export interface GradingTableProps {
  rows: GradingRow[];
  totalCount: number;
  filterText: string;
  setFilterText: (text: string) => void;
  sort: GradingSort;
  setSort: (sort: GradingSort) => void;
  onEditField: (id: string, field: GradingFeedbackField, value: string) => void;
  onRemoveRow: (id: string) => void;
  onClearTable: () => void;
  /** CC14: threaded straight through to every row's Copy feedback button -
   *  see GradingTableRow.tsx's own prop doc for why this feeds the panel's
   *  existing notice path rather than a new row-local affordance. */
  onCopyError: (message: string) => void;
}

export default function GradingTable({
  rows,
  totalCount,
  filterText,
  setFilterText,
  sort,
  setSort,
  onEditField,
  onRemoveRow,
  onClearTable,
  onCopyError,
}: GradingTableProps) {
  // "Clear table" confirm-arm - AC19/AC19a discipline (see the import
  // comment above and gradingClearTableSignature's own header): armed-for is
  // WHAT it was armed for (the row count at arm time), not an event in time,
  // so a row landing or leaving mid-session disarms a stale confirmation by
  // construction rather than needing a useEffect to remember to reset it.
  const [clearArmedFor, setClearArmedFor] = useState<string | null>(null);
  const clearSignature = gradingClearTableSignature(totalCount);
  const clearArmed = isConfirmArmed(clearArmedFor, clearSignature);

  // Fixer pass finding 4: focus-after-remove, the same keyed-ref-map idiom
  // DiscussionRepliesPanel.tsx:448-505 uses - a Remove click used to drop
  // focus to <body> once its own row unmounted. `containerRef` sits on the
  // one wrapper both the populated and empty-table return paths share below
  // (same element in both branches, so React never remounts it across a
  // last-row removal), giving a fallback target that survives even the
  // "removed the only remaining row" case.
  const removeRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pendingFocusIdRef = useRef<string | null>(null);
  const pendingFocusFallbackRef = useRef(false);

  const registerRemoveRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) removeRefs.current.set(id, el);
    else removeRefs.current.delete(id);
  }, []);

  useLayoutEffect(() => {
    const targetId = pendingFocusIdRef.current;
    const wantsFallback = pendingFocusFallbackRef.current;
    pendingFocusIdRef.current = null;
    pendingFocusFallbackRef.current = false;
    if (!targetId && !wantsFallback) return;
    const next = targetId ? removeRefs.current.get(targetId) : null;
    if (next) next.focus();
    else containerRef.current?.focus();
  });

  const handleRemove = useCallback(
    (id: string) => {
      const idx = rows.findIndex((r) => r.id === id);
      const fallback = rows[idx + 1] ?? rows[idx - 1] ?? null;
      if (fallback) {
        pendingFocusIdRef.current = fallback.id;
      } else {
        // No neighbour in the currently-rendered (filtered) rows - either
        // this was the last visible row or the last row overall. Either way
        // the row's own subtree is about to unmount; fall back to the
        // persistent container rather than dropping focus to <body>.
        pendingFocusFallbackRef.current = true;
      }
      onRemoveRow(id);
    },
    [rows, onRemoveRow]
  );

  if (totalCount === 0) {
    return (
      <div ref={containerRef} tabIndex={-1} className={rowStyles.tableContainer}>
        <p className={styles.fieldHint}>No graded submissions yet.</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} tabIndex={-1} className={rowStyles.tableContainer}>
      <div className={styles.adaptRow}>
        <TextField
          type="search"
          size="small"
          label="Search submissions"
          placeholder="Search by student name or submission text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className={controls.fieldMd}
          slotProps={{
            input: {
              endAdornment: filterText ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="Clear search" title="Clear search" onClick={() => setFilterText("")}>
                    <CloseIcon />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
      </div>
      <div className={styles.ghActions}>
        {filterText.trim() !== "" && (
          <span className={styles.fieldHint}>
            {`Showing ${rows.length} of ${totalCount} submission${totalCount === 1 ? "" : "s"}.`}{" "}
            <button type="button" className={styles.linkButton} onClick={() => setFilterText("")}>
              Clear
            </button>
          </span>
        )}
        {/* CC5 - "no row can be removed" fix - the whole-table wipe, now the
            shared ConfirmArmButtons component: one Button element whose
            label/variant/colour/handler swap in place on arming, pushed to
            the far edge as the toolbar's last, destructive action. */}
        <span className={controls.pushEnd}>
          <ConfirmArmButtons
            armed={clearArmed}
            idleLabel="Clear table"
            confirmLabel="Confirm clear"
            tone="danger"
            idleVariant="outlined"
            onArm={() => setClearArmedFor(clearSignature)}
            onConfirm={() => {
              onClearTable();
              setClearArmedFor(null);
            }}
            onCancel={() => setClearArmedFor(null)}
            consequenceId={CLEAR_TABLE_CONSEQUENCE_ID}
          />
        </span>
      </div>
      {clearArmed && (
        <p id={CLEAR_TABLE_CONSEQUENCE_ID} role="status" aria-live="polite" className={controls.consequence}>
          {`This permanently removes all ${totalCount} row${totalCount === 1 ? "" : "s"}. This cannot be undone.`}
        </p>
      )}

      <div className={tableStyles.scroller}>
        <table className={tableStyles.table}>
          <caption className={rowStyles.tableCaption}>Graded from a screen recording - never bound to a student or posted to an LMS</caption>
          <thead>
            <tr>
              <th scope="col" aria-sort={sortAriaValue(true, sort === "name-asc")}>
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => setSort(sort === "name-asc" ? "name-desc" : "name-asc")}
                >
                  Name
                  <SortGlyph asc={sort === "name-asc"} active={sort === "name-asc" || sort === "name-desc"} />
                </button>
              </th>
              <th scope="col">Roster match</th>
              <th scope="col">Status</th>
              <th scope="col">Score</th>
              {/* CC14: right-aligns to match .rowActions - RecordingControls.
                  module.css (group P) owns the shared class now. */}
              <th scope="col" className={controls.rowActionsHeader}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={GRADING_TABLE_COLUMN_COUNT} className={rowStyles.filterEmptyCell}>
                  {`No submissions match "${filterText.trim()}".`}{" "}
                  <button type="button" className={styles.linkButton} onClick={() => setFilterText("")}>
                    Clear
                  </button>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <GradingTableRow
                  key={row.id}
                  row={row}
                  onEditField={onEditField}
                  onRemove={handleRemove}
                  onCopyError={onCopyError}
                  registerRemoveRef={registerRemoveRef}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
