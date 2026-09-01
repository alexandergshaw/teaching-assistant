"use client";

// The downloadable run log for "Generate & associate rubric"
// (docs/rubric-bulk-log-acceptance-criteria.md, B3/B4). Every decision this
// file renders was already made by the pure module src/lib/rubric-run-log.ts
// (the summary counts, which entries are "recent", the CSV text, the JSON
// text, the filename) - vitest here is node-env and collects only
// src/**/*.test.ts, so nothing in this file is ever rendered by a test, and
// this component recomputes nothing of its own. It only calls those
// functions, hands the result to triggerFileDownload, and renders.
//
// B3 item 7: the download goes through triggerFileDownload
// (../course-planning/utils.ts), never a hand-rolled
// createObjectURL/anchor/click/revoke dance - REGRESSION entry 267 check 4
// already refused that, and entry 333's RepoGradesLogPanel.tsx follows the
// same rule for its own log.
//
// B4 item 9: this panel is rendered inline with the "Generate & associate
// rubric" control itself (BulkItemsSection.tsx's "grading" group), which
// means it is only reachable while one or more items are selected. That is
// a real discoverability limit, accepted here rather than building a new
// top-level surface or a bulkBarGroupCatalog.ts entry for it (B4 item 10) -
// see docs/REGRESSION.md's entry for this chunk for the stated cost.
import { useState } from "react";
import { triggerFileDownload } from "../../course-planning/utils";
import {
  formatRubricRunLogCsv,
  formatRubricRunLogJson,
  recentRubricRunLogEntries,
  rubricRunLogFileName,
  summarizeRubricRunLog,
  RUBRIC_RUN_LOG_EVENT_LABELS,
  type RubricRunLogEntry,
} from "@/lib/rubric-run-log";
import styles from "../../../page.module.css";

const RECENT_COUNT = 5;

export interface RubricRunLogPanelProps {
  log: readonly RubricRunLogEntry[];
  /** Clears the current course's log. Called only from this component's own
   * Clear button, and only after this component's own confirm (B3 item 8) -
   * the caller does not confirm again. */
  onClear: () => void;
}

/** Renders an ISO timestamp in the reader's own locale, falling back to the
 * raw stored string if it will not parse - an entry with an unexpected `at`
 * is still worth showing, and a thrown RangeError here would take the whole
 * panel down with it. Matches RepoGradesLogPanel.tsx's identical guard. */
function formatEntryTime(atIso: string): string {
  const parsed = new Date(atIso);
  if (Number.isNaN(parsed.getTime())) return atIso;
  return parsed.toLocaleString();
}

/** One recent entry, rendered as a single readable line - the item (or the
 * orphan's rubric title), the event label, and whatever reason/detail it
 * carries. B1.3/B1.4: an orphan names its rubric by id explicitly, since
 * that id is the one thing an instructor needs to find and act on it in
 * Canvas; a target entry names the item it concerns. */
function describeEntryLine(entry: RubricRunLogEntry): string {
  const label = RUBRIC_RUN_LOG_EVENT_LABELS[entry.kind];
  if (entry.kind === "orphan") {
    return `${label}: "${entry.rubricTitle}" (rubric id ${entry.rubricId}, ${entry.pointsPossible} pts)`;
  }
  if (entry.kind === "run-error" || entry.kind === "generation-failed") {
    return `${label}: ${entry.reason}`;
  }
  const target = entry.itemId ? `item ${entry.itemId}` : "item";
  const detail = entry.reason ? ` - ${entry.reason}` : "";
  return `${label}: ${target}${detail}`;
}

export default function RubricRunLogPanel({ log, onClear }: RubricRunLogPanelProps) {
  const [announcement, setAnnouncement] = useState("");
  const summary = summarizeRubricRunLog(log);
  const recent = recentRubricRunLogEntries(log, RECENT_COUNT);
  const empty = log.length === 0;

  const handleDownload = (format: "csv" | "json") => {
    // The one clock read in this feature's UI path - everything downstream
    // (the filename stamp, the JSON's exportedAt) takes it as a parameter,
    // so the formatting itself stays pure and pinned by rubric-run-log.test.ts.
    const now = new Date().toISOString();
    const text = format === "csv" ? formatRubricRunLogCsv(log) : formatRubricRunLogJson(log, { exportedAt: now });
    const filename = rubricRunLogFileName(format, now);
    const mimeType = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
    triggerFileDownload(new Blob([text], { type: mimeType }), filename);
    setAnnouncement(`Downloaded ${log.length} log entr${log.length === 1 ? "y" : "ies"} as ${filename}.`);
  };

  const handleClear = () => {
    // B3 item 8: localStorage is the only store this log ever had - clearing
    // destroys the sole copy, so the confirm names the count exactly the way
    // entry 333's RepoGradesLogPanel.tsx does for the same reason.
    if (!window.confirm(`Clear all ${log.length} rubric run log entr${log.length === 1 ? "y" : "ies"}? This cannot be undone.`)) {
      return;
    }
    onClear();
    setAnnouncement("Rubric run log cleared.");
  };

  if (empty) {
    // Nothing to show yet, and nothing to download or clear - the control
    // that produces entries is right above this in the same group, so no
    // separate empty-state explanation is needed here.
    return null;
  }

  return (
    <div className={styles.bulkRow}>
      <span className={styles.bulkHint}>
        Rubric run log: {summary.total} entr{summary.total === 1 ? "y" : "ies"} - {summary.updated} associated,{" "}
        {summary.skipped} skipped, {summary.failed} failed, {summary.orphans} orphan rubric
        {summary.orphans === 1 ? "" : "s"}.
      </span>
      <span className={styles.bulkField}>
        <button type="button" className={styles.linkButton} onClick={() => handleDownload("csv")}>
          Download CSV
        </button>
        <button type="button" className={styles.linkButton} onClick={() => handleDownload("json")}>
          Download JSON
        </button>
        <button type="button" className={styles.linkButton} onClick={handleClear}>
          Clear log
        </button>
      </span>
      {recent.length > 0 && (
        <ul style={{ flex: "1 1 100%", margin: "var(--space-1) 0 0", padding: 0, listStyle: "none" }}>
          {recent.map((entry, index) => (
            // The key pairs the timestamp with the item/rubric and the index
            // within this rendered slice: two entries CAN share a
            // millisecond (one run's targets are all recorded together), so
            // `at` alone is not unique.
            <li
              key={`${entry.at}-${entry.itemId}-${entry.rubricId}-${index}`}
              className={styles.bulkHint}
              style={{ minWidth: 0, flex: "none" }}
            >
              {formatEntryTime(entry.at)} - {describeEntryLine(entry)}
            </li>
          ))}
        </ul>
      )}
      {log.length > recent.length && (
        <span className={styles.bulkHint}>
          Showing the {recent.length} most recent of {log.length} - download the log for the full record.
        </span>
      )}
      {announcement && (
        <span role="status" aria-live="polite" className={styles.bulkHint}>
          {announcement}
        </span>
      )}
    </div>
  );
}
