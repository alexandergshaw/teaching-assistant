"use client";

// Repo Grades view - the activity log panel
// (docs/repo-grades-activity-log-acceptance-criteria.md, L4/L5). Every
// decision this file renders was already made by the pure module
// repoGradesLog.ts - the summary counts, which entries are "recent", the CSV
// text, the JSON text, the filename - because vitest here is node-env and
// collects only src/**/*.test.ts, so nothing in this file is ever rendered by
// a test. This component only calls those functions, hands the result to
// triggerFileDownload, and renders.
//
// L5 item 22: the download goes through triggerFileDownload
// (src/app/components/course-planning/utils.ts), never a hand-rolled
// createObjectURL/anchor/click/revoke dance - REGRESSION entry 267 check 4
// already refused a sixth copy of that.
//
// The panel is a confidence check, not a viewer: it shows counts and the ten
// most recent entries. The whole log only ever leaves through a download,
// which is the point of the feature - the file is what survives the browser.
import { triggerFileDownload } from "../course-planning/utils";
import {
  formatRepoGradeLogCsv,
  formatRepoGradeLogJson,
  recentRepoGradeLogEntries,
  repoGradeLogFileName,
  summarizeRepoGradeLog,
  REPO_GRADE_LOG_EVENT_LABELS,
  type RepoGradeLogEntry,
} from "./repoGradesLog";
// U12.48/U12.49 (docs/repo-grades-ux-overhaul-acceptance-criteria.md): the log
// shows a percentage wherever it shows a score - never the raw "earned/
// possible" total a generated-per-repo rubric happened to invent - and
// reports when this course's recorded grades came back on more than one
// scale, naming the cause. summarizeScoreSpread only ever reads `entry.score`
// off "grade-succeeded" entries: that is the one event kind whose `score`
// field is gradeRepoAction's raw totalScore text (see
// useRepoGradesGradingActions.ts); a post's own `score` field is already a
// bare posted number with no denominator to compare.
import { formatScorePercent, summarizeScoreSpread } from "./repoGradeScoreDisplay";
import styles from "./repo-grades.module.css";
import pageStyles from "../../page.module.css";

const RECENT_COUNT = 10;

export interface RepoGradesLogPanelProps {
  log: readonly RepoGradeLogEntry[];
  courseId: string;
  courseName: string;
  /** Clears this course's log. Called only from the Clear button's own click
   * handler, and only after this component's confirm (L4 item 20) - the
   * parent does not confirm again. */
  onClear: () => void;
  /** Routes a one-line outcome into the view's EXISTING role="status"
   * aria-live region (index.tsx's postSummary region) rather than adding a
   * second live region to the page - L4 item 21. Two live regions on one
   * view compete, and a screen reader user gets whichever won. */
  onAnnounce: (message: string) => void;
}

/** Renders an ISO timestamp in the reader's own locale. Falls back to the raw
 * stored string if it will not parse - a log entry with an unexpected `at` is
 * still worth showing, and a thrown RangeError here would take the whole
 * panel down with it. */
function formatEntryTime(atIso: string): string {
  const parsed = new Date(atIso);
  if (Number.isNaN(parsed.getTime())) return atIso;
  return parsed.toLocaleString();
}

/** The repo/folder a row concerns, as one readable cell. A view-level entry
 * (a failed org scan, a cancelled post) has neither, and reads as a dash
 * rather than as an empty cell that looks like a rendering bug. */
function entryTarget(entry: RepoGradeLogEntry): string {
  if (entry.repo && entry.folder) return `${entry.repo} / ${entry.folder}`;
  return entry.repo || entry.folder || "-";
}

export default function RepoGradesLogPanel({ log, courseId, courseName, onClear, onAnnounce }: RepoGradesLogPanelProps) {
  const summary = summarizeRepoGradeLog(log);
  const recent = recentRepoGradeLogEntries(log, RECENT_COUNT);
  const empty = log.length === 0;
  // U12.49: differing scales are only a meaningful signal WITHIN one folder -
  // different assignments legitimately carry different point totals, so
  // comparing every "grade-succeeded" score in the whole course log (all
  // folders, all time) trips this banner for any course that has graded two
  // different assignments, which is normal and not a defect. The log records
  // no run boundary, so a single run cannot be isolated either; grouping by
  // `folder` is the closest available approximation to "scores that are
  // actually meant to be comparable" - see summarizeScoreSpread's own
  // regression note in repoGradeScoreDisplay.ts. Only entries with a real
  // score are compared: filtering by folder is stable even though it does
  // not know about separate runs against the SAME folder.
  const scoresByFolder = new Map<string, string[]>();
  for (const entry of log) {
    if (entry.kind !== "grade-succeeded") continue;
    const bucket = scoresByFolder.get(entry.folder);
    if (bucket) bucket.push(entry.score);
    else scoresByFolder.set(entry.folder, [entry.score]);
  }
  const spreadByFolder = Array.from(scoresByFolder.entries()).map(([folder, scores]) => ({
    folder,
    spread: summarizeScoreSpread(scores),
  }));
  const inconsistentFolder = spreadByFolder.find((entry) => entry.spread.inconsistentScales);
  const scoreSpread = {
    inconsistentScales: Boolean(inconsistentFolder),
    detail: inconsistentFolder
      ? inconsistentFolder.folder
        ? `Folder "${inconsistentFolder.folder}": ${inconsistentFolder.spread.detail}`
        : inconsistentFolder.spread.detail
      : "",
  };

  const handleDownload = (format: "csv" | "json") => {
    // The one clock read in this feature's UI path. Everything downstream
    // (the filename stamp, the JSON's exportedAt) takes it as a parameter, so
    // the formatting itself stays pure and pinned by repoGradesLog.test.ts.
    const now = new Date().toISOString();
    const text =
      format === "csv" ? formatRepoGradeLogCsv(log) : formatRepoGradeLogJson(log, { exportedAt: now, courseId, courseName });
    const filename = repoGradeLogFileName(courseName, format, now);
    const mimeType = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
    triggerFileDownload(new Blob([text], { type: mimeType }), filename);
    onAnnounce(`Downloaded ${log.length} log entr${log.length === 1 ? "y" : "ies"} as ${filename}.`);
  };

  const handleClear = () => {
    // L4 item 20: this destroys the only copy of the audit trail for this
    // course - localStorage is the sole store, and nothing on the server has
    // ever seen these entries. Naming the count is the same shape the post
    // confirm uses (index.tsx's handlePostColumn).
    if (!window.confirm(`Clear all ${log.length} log entr${log.length === 1 ? "y" : "ies"} for this course? This cannot be undone.`)) {
      return;
    }
    onClear();
    onAnnounce("Activity log cleared.");
  };

  return (
    <section className={styles.logPanel} aria-labelledby="repo-grades-log-heading">
      <div className={styles.logHeader}>
        <div>
          <h3 id="repo-grades-log-heading" className={styles.logTitle}>
            Activity log
          </h3>
          <p className={pageStyles.fieldHint}>
            {empty
              ? "Nothing recorded for this course yet. Grading a folder or posting a grade adds an entry."
              : `${summary.total} event(s) - ${summary.graded} graded, ${summary.posted} posted, ${summary.failed} failed.`}
          </p>
        </div>
        <div className={styles.logActions}>
          <button type="button" className={pageStyles.linkButton} disabled={empty} onClick={() => handleDownload("csv")}>
            Download CSV
          </button>
          <button type="button" className={pageStyles.linkButton} disabled={empty} onClick={() => handleDownload("json")}>
            Download JSON
          </button>
          <button type="button" className={pageStyles.linkButton} disabled={empty} onClick={handleClear}>
            Clear log
          </button>
        </div>
      </div>

      {/* U12.49 - surfaced where it will actually be seen: this panel is
          already the one place that aggregates a course's grading activity
          into counts ("N event(s) - X graded, Y posted, Z failed"), directly
          above. Reuses .banner (warning-toned, already used elsewhere in this
          view for a condition worth the instructor's attention) rather than
          inventing a second notice style. */}
      {!empty && scoreSpread.inconsistentScales && <p className={styles.banner}>{scoreSpread.detail}</p>}

      {!empty && (
        <>
          <ol className={styles.logList}>
            {recent.map((entry, index) => {
              // U12.48 - a percentage, never the raw total: formatScorePercent
              // passes anything it cannot parse (a bare posted number, "") through
              // unchanged, so this is safe to apply to every entry's score field
              // regardless of which event kind produced it.
              const displayScore = formatScorePercent(entry.score);
              return (
                // The key pairs the timestamp with the target and the index
                // within this rendered slice: two entries CAN share a
                // millisecond (a column post fans out its whole result in one
                // synchronous batch), so `at` alone is not unique.
                <li key={`${entry.at}-${entry.repo}-${entry.folder}-${index}`} className={styles.logEntry}>
                  <span className={styles.logEntryTime}>{formatEntryTime(entry.at)}</span>
                  <span className={styles.logEntryKind}>{REPO_GRADE_LOG_EVENT_LABELS[entry.kind]}</span>
                  <span className={styles.logEntryTarget}>{entryTarget(entry)}</span>
                  <span className={styles.logEntryDetail}>
                    {displayScore && <strong>{displayScore}</strong>}
                    {displayScore && entry.detail ? " - " : ""}
                    {entry.detail}
                  </span>
                </li>
              );
            })}
          </ol>
          {log.length > recent.length && (
            <p className={pageStyles.fieldHint}>
              Showing the {recent.length} most recent of {log.length} - download the log for the full record.
            </p>
          )}
        </>
      )}
    </section>
  );
}
