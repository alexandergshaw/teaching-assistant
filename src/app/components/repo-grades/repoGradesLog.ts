// Repo Grades view - the downloadable activity log
// (docs/repo-grades-activity-log-acceptance-criteria.md). Pure, no I/O, no
// React, no clock: every function here takes the timestamp it needs as a
// parameter rather than calling Date.now(), so a test pins an exact rendered
// filename and an exact exported line rather than asserting around "now".
// vitest here is node-env and collects only src/**/*.test.ts (AC6 item 37 of
// docs/repo-grades-view-acceptance-criteria.md), so nothing rendered is ever
// exercised by a test - which is precisely why the append/cap/validate/format
// decisions live in this module and the .tsx only calls them.
//
// The log exists because postCanvasGradesAction writes to a live gradebook
// with no undo and no audit table (repoGradesPosting.ts's header comment):
// per-cell postStatus and the one-line postSummary are both wiped on reload
// and on a course switch, so ten minutes after a grading session the view can
// no longer answer "who did I post, at what score, to which assignment, and
// what did Canvas say about the one that failed". These entries are that
// answer.
//
// Only OUTCOMES are recorded, never "started" (L1): an entry means something
// finished, so the log reads as a list of facts rather than a list of
// intentions.

import { escapeCsvValue } from "@/lib/course-tasks-view-csv";

export type RepoGradeLogEventKind =
  | "grade-succeeded"
  | "grade-failed"
  | "post-succeeded"
  | "post-failed"
  | "post-skipped"
  | "post-cancelled"
  | "binding-confirmed"
  | "assignment-mapped"
  | "scan-failed"
  | "usernames-linked";

const LOG_EVENT_KINDS: readonly RepoGradeLogEventKind[] = [
  "grade-succeeded",
  "grade-failed",
  "post-succeeded",
  "post-failed",
  "post-skipped",
  "post-cancelled",
  "binding-confirmed",
  "assignment-mapped",
  "scan-failed",
  "usernames-linked",
];

/** Human labels for the panel and for the CSV's `event` column - the CSV
 * carries the LABEL, not the raw kind, because the file is read by a person
 * reconstructing a grading session, not by this app (nothing ever imports a
 * log back in). The raw kind is still in the JSON export for anything that
 * does want to match on it. */
export const REPO_GRADE_LOG_EVENT_LABELS: Readonly<Record<RepoGradeLogEventKind, string>> = {
  "grade-succeeded": "Graded",
  "grade-failed": "Grading failed",
  "post-succeeded": "Posted to Canvas",
  "post-failed": "Post failed",
  "post-skipped": "Not posted",
  "post-cancelled": "Post cancelled",
  "binding-confirmed": "Binding confirmed",
  "assignment-mapped": "Assignment mapped",
  "scan-failed": "Org scan failed",
  "usernames-linked": "GitHub usernames linked",
};

/**
 * L2 item 10: every field is a plain string and every field is always
 * present - a field that does not apply to an entry's kind is `""`, never
 * null and never absent. That is not tidiness: the CSV writer below emits one
 * column per field unconditionally, so an optional field would silently shift
 * every later column on the rows that omitted it.
 */
export interface RepoGradeLogEntry {
  /** ISO 8601, supplied by the caller (index.tsx) - see this file's header. */
  at: string;
  kind: RepoGradeLogEventKind;
  courseId: string;
  courseName: string;
  /** The repo full name this entry concerns, or "" for a view-level event
   * (a failed org scan, a cancelled post). */
  repo: string;
  /** The assignment folder (grid column) this entry concerns, or "". */
  folder: string;
  /** The Canvas assignment id this entry posted to / mapped, or "". */
  assignmentId: string;
  /** The score as it was produced or sent, exactly as text ("18/20"), or "". */
  score: string;
  /** Free text: an error message, a skip reason, an assignment name. */
  detail: string;
}

/** L2 item 11. Chosen to comfortably outlast a real grading session (a
 * 30-student course posting four columns produces ~150 entries even with
 * every grade recorded) while staying small enough that the whole per-course
 * blob is a trivial localStorage value. */
export const MAX_REPO_GRADE_LOG_ENTRIES = 500;

export const EMPTY_REPO_GRADE_LOG: readonly RepoGradeLogEntry[] = [];

/**
 * L2 items 11-12: returns a NEW oldest-first array with `entries` appended,
 * trimmed to MAX_REPO_GRADE_LOG_ENTRIES by dropping from the FRONT. Dropping
 * the oldest rather than refusing the newest is the whole point: a log that
 * silently stops recording once full would go quiet during exactly the long
 * session that filled it, which is the session whose record matters most.
 * Never mutates `log`.
 */
export function appendRepoGradeLogEntries(
  log: readonly RepoGradeLogEntry[],
  entries: readonly RepoGradeLogEntry[]
): RepoGradeLogEntry[] {
  if (entries.length === 0) return log.slice();
  const next = [...log, ...entries];
  return next.length <= MAX_REPO_GRADE_LOG_ENTRIES ? next : next.slice(next.length - MAX_REPO_GRADE_LOG_ENTRIES);
}

/**
 * L3 item 14: turns one stored value into entries, dropping anything that is
 * not a complete, correctly-typed entry rather than trusting it. Same
 * "never trust stored data" posture parseAssignmentMapByCourse
 * (repoGradesUiState.ts) already takes. Also applies the cap, so a blob
 * hand-edited to a million entries cannot make the view slow forever.
 */
export function parseRepoGradeLogEntries(value: unknown): RepoGradeLogEntry[] {
  if (!Array.isArray(value)) return [];
  const valid: RepoGradeLogEntry[] = [];
  for (const raw of value) {
    const entry = parseOneEntry(raw);
    if (entry) valid.push(entry);
  }
  return valid.length <= MAX_REPO_GRADE_LOG_ENTRIES ? valid : valid.slice(valid.length - MAX_REPO_GRADE_LOG_ENTRIES);
}

function parseOneEntry(raw: unknown): RepoGradeLogEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const kind = record.kind;
  if (typeof kind !== "string" || !LOG_EVENT_KINDS.includes(kind as RepoGradeLogEventKind)) return null;
  const text = (key: string): string | null => (typeof record[key] === "string" ? (record[key] as string) : null);
  const at = text("at");
  const courseId = text("courseId");
  const courseName = text("courseName");
  const repo = text("repo");
  const folder = text("folder");
  const assignmentId = text("assignmentId");
  const score = text("score");
  const detail = text("detail");
  if (
    at === null ||
    courseId === null ||
    courseName === null ||
    repo === null ||
    folder === null ||
    assignmentId === null ||
    score === null ||
    detail === null
  ) {
    return null;
  }
  return { at, kind: kind as RepoGradeLogEventKind, courseId, courseName, repo, folder, assignmentId, score, detail };
}

export interface RepoGradeLogSummary {
  total: number;
  graded: number;
  posted: number;
  failed: number;
}

/** L4 item 17: the counts the panel shows. `failed` deliberately merges
 * grading failures and post failures - the instructor's question is "did
 * anything go wrong", and splitting that into two numbers makes the answer
 * harder to read, not easier. A skipped or cancelled post is NOT a failure:
 * nothing was attempted, so nothing broke. */
export function summarizeRepoGradeLog(log: readonly RepoGradeLogEntry[]): RepoGradeLogSummary {
  let graded = 0;
  let posted = 0;
  let failed = 0;
  for (const entry of log) {
    if (entry.kind === "grade-succeeded") graded += 1;
    else if (entry.kind === "post-succeeded") posted += 1;
    else if (entry.kind === "grade-failed" || entry.kind === "post-failed" || entry.kind === "scan-failed") failed += 1;
  }
  return { total: log.length, graded, posted, failed };
}

/** L4 item 18: the most recent `count` entries, NEWEST FIRST - the reverse of
 * the stored order, because the panel is a "did that just work" check and the
 * thing that just happened should be the thing at the top. Never mutates. */
export function recentRepoGradeLogEntries(log: readonly RepoGradeLogEntry[], count: number): RepoGradeLogEntry[] {
  if (count <= 0) return [];
  return log.slice(Math.max(0, log.length - count)).reverse();
}

const CSV_HEADER = ["Time", "Event", "Course", "Repo", "Folder", "Canvas assignment", "Score", "Detail"];

/**
 * L5 items 23-24: one header row then one row per entry, oldest first (the
 * stored order - a spreadsheet reader sorts it themselves, and chronological
 * is how a session actually happened). Every field goes through
 * escapeCsvValue (src/lib/course-tasks-view-csv.ts) rather than a new local
 * escaper, so a comment containing a comma, a quote or a newline - all three
 * of which an AI-written overall comment routinely contains - cannot corrupt
 * the file. Rows are joined with \r\n, matching buildTasksCsv.
 */
export function formatRepoGradeLogCsv(log: readonly RepoGradeLogEntry[]): string {
  const rows = [CSV_HEADER.map(escapeCsvValue).join(",")];
  for (const entry of log) {
    rows.push(
      [
        entry.at,
        REPO_GRADE_LOG_EVENT_LABELS[entry.kind],
        entry.courseName,
        entry.repo,
        entry.folder,
        entry.assignmentId,
        entry.score,
        entry.detail,
      ]
        .map(escapeCsvValue)
        .join(",")
    );
  }
  return rows.join("\r\n");
}

/**
 * L5 item 25: an OBJECT, never a bare array, so a later field (a schema
 * version, the org prefix the session used) can be added without breaking
 * anything already parsing these files. `exportedAt` is a parameter for the
 * same reason every other timestamp here is - see this file's header.
 */
export function formatRepoGradeLogJson(
  log: readonly RepoGradeLogEntry[],
  meta: { exportedAt: string; courseId: string; courseName: string }
): string {
  return JSON.stringify(
    {
      exportedAt: meta.exportedAt,
      courseId: meta.courseId,
      courseName: meta.courseName,
      entryCount: log.length,
      entries: log,
    },
    null,
    2
  );
}

/** Lowercased, non-alphanumerics collapsed to single dashes, ends trimmed -
 * the filename half of a course name. Returns "" for a name that has no
 * alphanumerics at all (repoGradeLogFileName below is what handles that
 * case, so this stays a plain transform with no fallback of its own). */
function slugifyCourseName(courseName: string): string {
  return courseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "2026-08-24T15:04:05.123Z" -> "20260824-150405". Colons and dots are not
 * safe in a Windows filename, and the sub-second part carries no information
 * a human reading a filename wants. */
function fileStamp(atIso: string): string {
  const match = atIso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return atIso.replace(/[^0-9a-zA-Z]+/g, "-").replace(/^-+|-+$/g, "");
  const [, year, month, day, hour, minute, second] = match;
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

/**
 * L5 item 26: `repo-grades-log-<course-slug>-<YYYYMMDD-HHMMSS>.<ext>`. A
 * course whose name slugs to nothing (blank, or punctuation only) drops the
 * course segment entirely rather than emitting a dangling double dash, so
 * the result is always a valid, non-empty filename.
 */
export function repoGradeLogFileName(courseName: string, extension: string, atIso: string): string {
  const slug = slugifyCourseName(courseName);
  const parts = ["repo-grades-log", slug, fileStamp(atIso)].filter((part) => part !== "");
  return `${parts.join("-")}.${extension}`;
}
