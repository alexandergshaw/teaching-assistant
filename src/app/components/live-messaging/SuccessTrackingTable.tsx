"use client";

// L4 of docs/live-lms-student-messaging-scope.md: the Success Tracking table.
// Mounts the pure L3 logic (applyTableView + paginate) over the aggregator's
// EnrollmentRow[]. Columns: Student, Course, Section, Term, Current Status,
// # of Missing Assignments - NO Institution column (institution is the
// switcher chrome). Per-column funnels, sort toggles, a search box and a
// "Showing N rows" pager. Row checkboxes feed the header "Message (N) Selected
// Students" button. Control state (search/funnels/sort/page size) persists
// under ta-live-messaging-table-view; the selection is owned by the shell and
// is per-institution.

import { useEffect, useMemo, useState } from "react";
import { CURRENT_STATUS_LABELS, currentStatusFor, type CurrentStatus } from "@/lib/live-messaging/current-status";
import type { EnrollmentRow } from "@/lib/live-messaging/enrollment-aggregator";
import { paginate, showingLabel } from "@/lib/live-messaging/pager";
import { TABLE_COLUMNS, type TableColumn } from "@/lib/live-messaging/table-columns";
import {
  applyTableView,
  columnOptions,
  isColumnFilterActive,
  type FilterColumn,
} from "@/lib/live-messaging/table-filter-model";
import {
  DEFAULT_TABLE_CONTROLS,
  PAGE_SIZE_OPTIONS,
  TABLE_VIEW_KEY,
  nextSort,
  parseTableControls,
  serializeTableControls,
  toggleFilterToken,
  type TableControlState,
} from "@/lib/live-messaging/view-state";
import styles from "./SuccessTracking.module.css";

const STATUS_BADGE: Record<CurrentStatus, string> = {
  "on-track": styles.badgeOk,
  "at-risk": styles.badgeAtRisk,
  failing: styles.badgeFailing,
  unknown: "",
};

export interface SuccessTrackingTableProps {
  rows: readonly EnrollmentRow[];
  /** True while courses are still loading (drives the empty-state wording). */
  loading: boolean;
  selectedKeys: readonly string[];
  onToggleRow: (key: string) => void;
  onSetRows: (keys: readonly string[], select: boolean) => void;
  /** Opens the messaging modal for the current selection. */
  onOpenMessaging: () => void;
}

export default function SuccessTrackingTable({
  rows,
  loading,
  selectedKeys,
  onToggleRow,
  onSetRows,
  onOpenMessaging,
}: SuccessTrackingTableProps) {
  const [controls, setControls] = useState<TableControlState>(DEFAULT_TABLE_CONTROLS);
  const [page, setPage] = useState(0);
  const [openFunnel, setOpenFunnel] = useState<FilterColumn | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        setControls(parseTableControls(localStorage.getItem(TABLE_VIEW_KEY)));
      } catch {
        // Storage unavailable: defaults apply for this session.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const change = (patch: Partial<TableControlState>) => {
    const next = { ...controls, ...patch };
    setControls(next);
    setPage(0);
    try {
      localStorage.setItem(TABLE_VIEW_KEY, serializeTableControls(next));
    } catch {
      // Storage unavailable: keep the in-memory controls.
    }
  };

  const viewRows = useMemo(
    () => applyTableView(rows, { search: controls.search, filters: controls.filters, sort: controls.sort }),
    [rows, controls.search, controls.filters, controls.sort]
  );
  const pageView = paginate(viewRows, page, controls.pageSize);
  const selected = new Set(selectedKeys);
  const pageKeys = pageView.items.map((r) => r.key);
  const allOnPage = pageKeys.length > 0 && pageKeys.every((k) => selected.has(k));

  const renderHeader = (col: TableColumn) => {
    const sortActive = controls.sort?.key === col.sortKey;
    const ariaSort = sortActive ? (controls.sort?.direction === "asc" ? "ascending" : "descending") : "none";
    const options = col.filter ? columnOptions(rows, col.filter) : [];
    const funnelActive = col.filter
      ? isColumnFilterActive(controls.filters[col.filter], options)
      : false;
    return (
      <th key={col.id} scope="col" aria-sort={ariaSort}>
        <span className={styles.headCell}>
          <button
            type="button"
            className={styles.sortButton}
            onClick={() => change({ sort: nextSort(controls.sort, col.sortKey) })}
            title={`Sort by ${col.label}`}
          >
            {col.label}
            {sortActive ? (controls.sort?.direction === "asc" ? " ^" : " v") : ""}
          </button>
          {col.filter ? (
            <button
              type="button"
              className={`${styles.funnelButton} ${funnelActive ? styles.funnelActive : ""}`}
              aria-label={`Filter ${col.label}`}
              aria-expanded={openFunnel === col.filter}
              onClick={() => setOpenFunnel(openFunnel === col.filter ? null : (col.filter as FilterColumn))}
            >
              Filter
            </button>
          ) : null}
        </span>
        {col.filter && openFunnel === col.filter ? (
          <div className={styles.funnelPanel} role="group" aria-label={`${col.label} filter`}>
            {options.length === 0 ? <span className={styles.hintMuted}>No values</span> : null}
            {options.map((token) => {
              const checked = funnelActive ? (controls.filters[col.filter as FilterColumn] ?? []).includes(token) : true;
              return (
                <label key={token === "" ? "__blank__" : token} className={styles.funnelOption}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      change({
                        filters: toggleFilterToken(controls.filters, col.filter as FilterColumn, token, options),
                      })
                    }
                  />
                  {token === "" ? "(blank)" : token}
                </label>
              );
            })}
            {funnelActive ? (
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  const next = { ...controls.filters };
                  delete next[col.filter as FilterColumn];
                  change({ filters: next });
                }}
              >
                Clear filter
              </button>
            ) : null}
          </div>
        ) : null}
      </th>
    );
  };

  return (
    <div className={styles.stack}>
      <div className={styles.toolbar}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Search</span>
          <input
            type="search"
            className={styles.input}
            value={controls.search}
            placeholder="Student or course"
            onChange={(e) => change({ search: e.target.value })}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Rows per page</span>
          <select
            className={styles.select}
            value={controls.pageSize}
            onChange={(e) => change({ pageSize: Number(e.target.value) })}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.toolbarSpacer} />
        <button
          type="button"
          className={`${styles.button} ${styles.buttonPrimary}`}
          disabled={selectedKeys.length === 0}
          onClick={onOpenMessaging}
        >
          {`Message (${selectedKeys.length}) Selected Students`}
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">
                <input
                  type="checkbox"
                  aria-label="Select all students on this page"
                  checked={allOnPage}
                  disabled={pageKeys.length === 0}
                  onChange={() => onSetRows(pageKeys, !allOnPage)}
                />
              </th>
              {TABLE_COLUMNS.map(renderHeader)}
            </tr>
          </thead>
          <tbody>
            {pageView.items.map((row) => {
              const isSelected = selected.has(row.key);
              const status = currentStatusFor(row.grade);
              return (
                <tr key={row.key} className={isSelected ? styles.rowSelected : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.name} in ${row.course}`}
                      checked={isSelected}
                      onChange={() => onToggleRow(row.key)}
                    />
                  </td>
                  <td>{row.name}</td>
                  <td>{row.course}</td>
                  <td>{row.section}</td>
                  <td>{row.term ?? ""}</td>
                  <td>
                    <span className={`${styles.badge} ${STATUS_BADGE[status]}`}>{CURRENT_STATUS_LABELS[status]}</span>
                  </td>
                  <td>{row.missingCount === null ? "" : row.missingCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pageView.total === 0 ? (
        <p className={styles.hint} role="status">
          {loading
            ? "Loading students..."
            : rows.length === 0
              ? "No students found for this institution."
              : "No students match the current search and filters."}
        </p>
      ) : null}

      <div className={styles.pager}>
        <span role="status">{showingLabel(pageView.total)}</span>
        <button type="button" className={styles.button} disabled={!pageView.hasPrevious} onClick={() => setPage(pageView.page - 1)}>
          Previous
        </button>
        <span>{`Page ${pageView.page + 1} of ${pageView.pageCount}`}</span>
        <button type="button" className={styles.button} disabled={!pageView.hasNext} onClick={() => setPage(pageView.page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
