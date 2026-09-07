"use client";

// The whole-session diagnostic log download, on the Settings > Diagnostics
// screen - the owner's request: "there should be an option to download logs
// from the admin tools in the settings. and these logs should encompass
// everything that has happened on the app in that session".
//
// Every decision this file renders (the summary counts, which entries are
// "recent", the coverage sentence, the CSV text, the JSON text, the filename)
// was already made by the pure module src/lib/session-diagnostic-log.ts -
// vitest here is node-env and collects only src/**/*.test.ts, so nothing in
// this file is ever rendered by a test, and this component recomputes nothing
// of its own; it only calls those functions, hands the result to
// triggerFileDownload, and renders.
//
// Reuses the shared idioms rather than inventing any: triggerFileDownload
// (components/course-planning/utils.ts) instead of a hand-rolled
// createObjectURL/anchor/click/revoke dance, and RunLogRow
// (components/recording/RunLogRow.tsx) for the summary-line-plus-download-
// buttons row - the same two this page's sibling section
// (content-tab/ContentDiagnosticLogSection.tsx) uses.
//
// NOT HIDDEN WHEN EMPTY, and the copy never lets an empty result read as
// reassurance. Three things are stated unconditionally, because each one is a
// way this file could otherwise lie by omission:
//   1. that recording is active (the summary line says so even at zero);
//   2. WHAT IS AND IS NOT INSTRUMENTED (sessionDiagnosticCoverageLine plus
//      the coverage block inside every download) - "everything that happened"
//      is a promise no honest log keeps by itself;
//   3. that the log lives only as long as this page session, so a reload
//      explains an empty file that a reader would otherwise read as "nothing
//      went wrong".
//
// The recording-start TIMESTAMP is deliberately not rendered here, only
// written into the download: it is fixed when the store's module is first
// evaluated, which differs between the server prerender of this Client
// Component and the browser, and printing it would be a hydration mismatch
// for no benefit.
import { useState } from "react";
import { triggerFileDownload } from "../../components/course-planning/utils";
import RunLogRow from "../../components/recording/RunLogRow";
import {
  SESSION_DIAGNOSTIC_COVERAGE,
  SESSION_DIAGNOSTIC_NOT_COVERED,
  SESSION_DIAGNOSTIC_SURFACE_LABELS,
  buildSessionDiagnosticLog,
  formatSessionDiagnosticLogCsv,
  formatSessionDiagnosticLogJson,
  readSessionDiagnosticLogState,
  recentSessionDiagnosticEntries,
  sessionDiagnosticCoverageLine,
  sessionDiagnosticLogFileName,
  sessionDiagnosticLogSummaryLine,
  summarizeSessionDiagnosticLog,
  type SessionDiagnosticEntry,
} from "@/lib/session-diagnostic-log";
import styles from "../security/security.module.css";

const RECENT_COUNT = 8;

export interface SessionLogSectionProps {
  /** The institution/course active RIGHT NOW, for the download's header block
   * (DEV_LOOP.md's "every setting in force for that run") - read fresh at
   * download time, never accumulated, since each entry already carries its
   * own institution and course at the moment it happened. */
  currentInstitution: string;
  currentCourse: string;
}

/** Renders an ISO timestamp in the reader's own locale, falling back to the
 * raw stored string if it will not parse - matches the identical guard in
 * ContentDiagnosticLogSection.tsx, so a thrown RangeError here can never take
 * this whole section down. */
function formatEntryTime(atIso: string): string {
  const parsed = new Date(atIso);
  if (Number.isNaN(parsed.getTime())) return atIso;
  return parsed.toLocaleString();
}

function describeEntryLine(entry: SessionDiagnosticEntry): string {
  const area = SESSION_DIAGNOSTIC_SURFACE_LABELS[entry.surface] ?? entry.surface;
  const target = [entry.institution, entry.course].filter((s) => s !== "").join(" - ");
  const suffix = target ? ` (${target})` : "";
  if (entry.outcome === "success") return `${area} - ${entry.label}${suffix}: ok`;
  return `${area} - ${entry.label}${suffix}: failed - ${entry.error}`;
}

export default function SessionLogSection({ currentInstitution, currentCourse }: SessionLogSectionProps) {
  const [announcement, setAnnouncement] = useState("");
  // Only the SETTER is used. The store is plain module state with no
  // subscription, so a re-render is what re-reads it: entries recorded by
  // this page's own loads already cause one (each is followed by the page's
  // own setState), and the Refresh button below covers anything recorded
  // without one. The counter's value is never rendered.
  const [, bumpRefresh] = useState(0);

  const state = readSessionDiagnosticLogState();
  const summary = summarizeSessionDiagnosticLog(state);
  const recent = recentSessionDiagnosticEntries(state.entries, RECENT_COUNT);

  const handleDownload = (format: "csv" | "json") => {
    // The one clock read in this feature's UI path - everything downstream
    // (the "Generated" field, the filename stamp) takes it as a parameter, so
    // the formatting itself stays pure and pinned by
    // session-diagnostic-log.test.ts.
    const now = new Date().toISOString();
    // Read the store FRESH rather than reusing the render-time snapshot: an
    // operation may have completed between this screen's last render and the
    // click, and a file offered as "everything that happened" must not be
    // one render behind.
    const fresh = readSessionDiagnosticLogState();
    const full = buildSessionDiagnosticLog(
      fresh,
      {
        currentInstitution,
        currentCourse,
        // PATH only, never the query string - a query string is exactly where
        // a credential would be.
        currentPage: typeof window === "undefined" ? "" : window.location.pathname,
        browser: typeof navigator === "undefined" ? "" : navigator.userAgent,
      },
      now
    );
    const text = format === "csv" ? formatSessionDiagnosticLogCsv(full) : formatSessionDiagnosticLogJson(full);
    const filename = sessionDiagnosticLogFileName(format, now);
    const mimeType = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
    triggerFileDownload(new Blob([text], { type: mimeType }), filename);
    setAnnouncement(
      `Downloaded ${fresh.entries.length} log entr${fresh.entries.length === 1 ? "y" : "ies"} as ${filename}.`
    );
  };

  return (
    <div className={styles.section}>
      <p className={styles.sectionTitle}>Session log</p>
      <p className={styles.help}>
        A record of what this app tried to do since the page was loaded, and how each attempt turned out - including
        the real error message behind a failure, which the screen that reported it does not always keep. Download it
        and send it when something goes wrong.
      </p>

      <RunLogRow summary={sessionDiagnosticLogSummaryLine(summary)} onDownload={handleDownload} />

      <p className={styles.help}>{sessionDiagnosticCoverageLine()}</p>

      <p className={styles.tip}>
        This log is held in memory for this page session only and is never saved anywhere - not on this device and not
        on a server. Reloading the page, or opening the app in another tab, starts an empty one, so an empty file means
        &quot;nothing has been recorded since this page loaded&quot;, not &quot;nothing has ever gone wrong&quot;.
      </p>

      <div className={styles.row}>
        <button type="button" className={styles.secondary} onClick={() => bumpRefresh((v) => v + 1)}>
          Refresh log
        </button>
      </div>

      {recent.length > 0 ? (
        <ul className={styles.factorList}>
          {recent.map((entry, index) => (
            // The key pairs the timestamp with the operation and the index
            // within this rendered slice: two entries CAN share a
            // millisecond, so `at` alone is not unique.
            <li key={`${entry.at}-${entry.surface}-${entry.operation}-${index}`} className={styles.rowDetail}>
              {formatEntryTime(entry.at)} - {describeEntryLine(entry)}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.emptyState}>
          Nothing recorded yet in this page session. The covered areas listed above are watching.
        </p>
      )}

      {state.entries.length > recent.length && (
        <p className={styles.help}>
          Showing the {recent.length} most recent of {state.entries.length} - download the log for the full record.
        </p>
      )}

      <details>
        <summary className={styles.help}>What this log does and does not cover</summary>
        <ul className={styles.factorList}>
          {SESSION_DIAGNOSTIC_COVERAGE.map((row) => (
            <li key={row.surface} className={styles.rowDetail}>
              Covered - {SESSION_DIAGNOSTIC_SURFACE_LABELS[row.surface]}: {row.covers}
            </li>
          ))}
          {SESSION_DIAGNOSTIC_NOT_COVERED.map((row) => (
            <li key={row} className={styles.rowDetail}>
              Not instrumented - {row}
            </li>
          ))}
        </ul>
      </details>

      {announcement && (
        <p role="status" aria-live="polite" className={styles.help}>
          {announcement}
        </p>
      )}
    </div>
  );
}
