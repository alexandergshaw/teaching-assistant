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

import { useState } from "react";
import { Button, TextField, IconButton, InputAdornment } from "@mui/material";
import styles from "../../page.module.css";
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

const CLEAR_TABLE_CONSEQUENCE_ID = "grading-clear-table-consequence";

function CloseIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function SortGlyph({ asc }: { asc: boolean }) {
  const points = asc ? "10,4 16,15 4,15" : "10,16 16,5 4,5";
  return (
    <svg width={10} height={10} viewBox="0 0 20 20" aria-hidden="true" focusable="false" style={{ marginLeft: 4 }}>
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
}: GradingTableProps) {
  // "Clear table" confirm-arm - AC19/AC19a discipline (see the import
  // comment above and gradingClearTableSignature's own header): armed-for is
  // WHAT it was armed for (the row count at arm time), not an event in time,
  // so a row landing or leaving mid-session disarms a stale confirmation by
  // construction rather than needing a useEffect to remember to reset it.
  const [clearArmedFor, setClearArmedFor] = useState<string | null>(null);
  const clearSignature = gradingClearTableSignature(totalCount);
  const clearArmed = isConfirmArmed(clearArmedFor, clearSignature);

  if (totalCount === 0) {
    return <p className={styles.fieldHint}>No graded submissions yet.</p>;
  }

  return (
    <>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <TextField
          type="search"
          size="small"
          label="Search submissions"
          placeholder="Search by student name or submission text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          sx={{ minWidth: 220, maxWidth: 360 }}
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
        {filterText.trim() !== "" && (
          <span className={styles.fieldHint} style={{ margin: 0 }}>
            {`Showing ${rows.length} of ${totalCount} submission${totalCount === 1 ? "" : "s"}.`}{" "}
            <button type="button" className={styles.linkButton} onClick={() => setFilterText("")}>
              Clear
            </button>
          </span>
        )}
        {/* "no row can be removed" fix - the whole-table wipe, mirroring
            DiscussionRepliesPanel.tsx's own "Delete table"/"Confirm delete"/
            "Cancel" three-state control exactly. */}
        {clearArmed ? (
          <>
            <Button
              size="small"
              color="error"
              aria-describedby={CLEAR_TABLE_CONSEQUENCE_ID}
              onClick={() => {
                onClearTable();
                setClearArmedFor(null);
              }}
            >
              Confirm clear
            </Button>
            <Button size="small" onClick={() => setClearArmedFor(null)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="small" color="error" variant="outlined" onClick={() => setClearArmedFor(clearSignature)}>
            Clear table
          </Button>
        )}
      </div>
      {clearArmed && (
        <p id={CLEAR_TABLE_CONSEQUENCE_ID} role="status" aria-live="polite" className={styles.fieldHint}>
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
                  <SortGlyph asc={sort === "name-asc"} />
                </button>
              </th>
              <th scope="col">Roster match</th>
              <th scope="col">Status</th>
              <th scope="col">Score</th>
              <th scope="col">Actions</th>
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
              rows.map((row) => <GradingTableRow key={row.id} row={row} onEditField={onEditField} onRemove={onRemoveRow} />)
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
