"use client";

// The downloadable Content Diagnostic Log - see contentDiagnosticLog.ts's
// header for the full account of why this exists and what it does and does
// not cover. Every decision this file renders (the summary counts, which
// entries are "recent", the CSV text, the JSON text, the filename) was
// already made by that pure module - vitest here is node-env and collects
// only src/**/*.test.ts, so nothing in this file is ever rendered by a
// test, and this component recomputes nothing of its own; it only calls
// those functions, hands the result to triggerFileDownload, and renders.
//
// Reuses the shared download idiom: triggerFileDownload
// (../course-planning/utils.ts) rather than a hand-rolled
// createObjectURL/anchor/click/revoke dance, and RunLogRow
// (../recording/RunLogRow.tsx) for the summary-line-plus-download-buttons
// row, matching GradingRecordingPanel.tsx/RubricRunLogPanel.tsx's own use of
// both.
//
// UNLIKE RubricRunLogPanel.tsx, this component is NOT hidden when the log
// is empty. That panel's log is a per-course record where "nothing here
// yet" genuinely means nothing to show. This log's whole purpose is to make
// an EMPTY result trustworthy - "recording is active and nothing has
// failed" must read differently from "the log was never wired up" - so the
// summary/download row renders unconditionally, and the pure module's own
// summary line always states that recording is active (see
// contentDiagnosticLogSummaryLine's own header).
import { useState } from "react";
import { triggerFileDownload } from "../course-planning/utils";
import RunLogRow from "../recording/RunLogRow";
import {
  CONTENT_DIAGNOSTIC_OPERATION_LABELS,
  buildContentDiagnosticLog,
  contentDiagnosticLogFileName,
  contentDiagnosticLogSummaryLine,
  formatContentDiagnosticLogCsv,
  formatContentDiagnosticLogJson,
  recentContentDiagnosticEntries,
  summarizeContentDiagnosticLog,
  type ContentDiagnosticLogEntry,
  type ContentDiagnosticLogState,
} from "./contentDiagnosticLog";
import styles from "../../page.module.css";

const RECENT_COUNT = 5;

export interface ContentDiagnosticLogSectionProps {
  log: ContentDiagnosticLogState;
  /** The institution/course active RIGHT NOW, for the download's header
   * block (DEV_LOOP.md's "every setting in force for that run") - read
   * fresh at download time, never accumulated, since each entry already
   * carries its own institution/course at the moment it happened. */
  currentInstitution: string;
  currentCourse: string;
}

/** Renders an ISO timestamp in the reader's own locale, falling back to the
 * raw stored string if it will not parse - matches
 * RubricRunLogPanel.tsx/RepoGradesLogPanel.tsx's identical guard, so a
 * thrown RangeError here can never take this whole section down. */
function formatEntryTime(atIso: string): string {
  const parsed = new Date(atIso);
  if (Number.isNaN(parsed.getTime())) return atIso;
  return parsed.toLocaleString();
}

function describeEntryLine(entry: ContentDiagnosticLogEntry): string {
  const label = CONTENT_DIAGNOSTIC_OPERATION_LABELS[entry.operation];
  const target = [entry.institution, entry.course].filter((s) => s !== "").join(" - ");
  const suffix = target ? ` (${target})` : "";
  if (entry.outcome === "success") return `${label}${suffix}: ok`;
  return `${label}${suffix}: failed - ${entry.error}`;
}

export default function ContentDiagnosticLogSection({
  log,
  currentInstitution,
  currentCourse,
}: ContentDiagnosticLogSectionProps) {
  const [announcement, setAnnouncement] = useState("");
  const summary = summarizeContentDiagnosticLog(log);
  const recent = recentContentDiagnosticEntries(log.entries, RECENT_COUNT);

  const handleDownload = (format: "csv" | "json") => {
    // The one clock read in this feature's UI path - everything downstream
    // (the CSV/JSON "Generated" field, the filename stamp) takes it as a
    // parameter, so the formatting itself stays pure and pinned by
    // contentDiagnosticLog.test.ts.
    const now = new Date().toISOString();
    const full = buildContentDiagnosticLog(log, { currentInstitution, currentCourse }, now);
    const text = format === "csv" ? formatContentDiagnosticLogCsv(full) : formatContentDiagnosticLogJson(full);
    const filename = contentDiagnosticLogFileName(format, now);
    const mimeType = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
    triggerFileDownload(new Blob([text], { type: mimeType }), filename);
    setAnnouncement(`Downloaded ${log.entries.length} log entr${log.entries.length === 1 ? "y" : "ies"} as ${filename}.`);
  };

  return (
    <div className={styles.bulkRow}>
      <RunLogRow summary={contentDiagnosticLogSummaryLine(summary)} onDownload={handleDownload} />
      {recent.length > 0 && (
        <ul style={{ flex: "1 1 100%", margin: "var(--space-1) 0 0", padding: 0, listStyle: "none" }}>
          {recent.map((entry, index) => (
            // The key pairs the timestamp with the operation and the index
            // within this rendered slice: two entries CAN share a
            // millisecond, so `at` alone is not unique.
            <li
              key={`${entry.at}-${entry.operation}-${index}`}
              className={styles.bulkHint}
              style={{ minWidth: 0, flex: "none" }}
            >
              {formatEntryTime(entry.at)} - {describeEntryLine(entry)}
            </li>
          ))}
        </ul>
      )}
      {log.entries.length > recent.length && (
        <span className={styles.bulkHint}>
          Showing the {recent.length} most recent of {log.entries.length} - download the log for the full record.
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
